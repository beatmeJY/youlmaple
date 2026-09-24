-- 이미 001, 002를 실행한 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 계정을 만들고, 캐릭터를 계정에 연결하고, 사냥터 표를 몬스터 표로 바꿉니다.
-- 이미 등록한 캐릭터는 '기본 계정'에 붙습니다.
-- 사냥터에 적어 둔 내용이 있다면 이 실행으로 삭제됩니다.

create or replace function public.assign_user_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.user_id := auth.uid();
    end if;
  else
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_user_name_idx on public.accounts (user_id, name);

drop trigger if exists accounts_assign_user_id on public.accounts;
create trigger accounts_assign_user_id
  before insert or update on public.accounts
  for each row execute function public.assign_user_id();

drop trigger if exists accounts_touch_updated_at on public.accounts;
create trigger accounts_touch_updated_at
  before update on public.accounts
  for each row execute function public.touch_updated_at();

alter table public.accounts enable row level security;
revoke all on table public.accounts from anon, authenticated;
grant select, insert, update, delete on table public.accounts to authenticated;
grant all on table public.accounts to service_role;

drop policy if exists accounts_select_own on public.accounts;
create policy accounts_select_own
on public.accounts for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists accounts_insert_own on public.accounts;
create policy accounts_insert_own
on public.accounts for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists accounts_update_own on public.accounts;
create policy accounts_update_own
on public.accounts for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists accounts_delete_own on public.accounts;
create policy accounts_delete_own
on public.accounts for delete to authenticated
using ((select auth.uid()) = user_id);

alter table public.characters add column if not exists account_id uuid;

insert into public.accounts (user_id, name)
select distinct c.user_id, '기본 계정'
from public.characters as c
where not exists (
  select 1 from public.accounts as a where a.user_id = c.user_id
);

update public.characters as c
set account_id = a.id
from public.accounts as a
where c.account_id is null
  and a.user_id = c.user_id
  and a.name = '기본 계정';

alter table public.characters alter column account_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'characters_account_id_fkey'
  ) then
    alter table public.characters
      add constraint characters_account_id_fkey
      foreign key (account_id) references public.accounts (id) on delete restrict;
  end if;
end $$;

create index if not exists characters_account_idx on public.characters (account_id);

comment on column public.characters.account_id is '소속 메이플 계정. 계정당 6명까지';

create or replace function public.enforce_character_account()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  owner uuid;
  used integer;
begin
  if auth.uid() is null then
    return new;
  end if;

  select user_id into owner
  from public.accounts
  where id = new.account_id;

  if owner is distinct from auth.uid() then
    raise exception 'account_not_owned';
  end if;

  select count(*) into used
  from public.characters
  where account_id = new.account_id
    and id is distinct from new.id;

  if used >= 6 then
    raise exception 'account_character_limit';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_character_account() from public, anon;
grant execute on function public.enforce_character_account() to authenticated, service_role;

drop trigger if exists characters_enforce_account on public.characters;
create trigger characters_enforce_account
  before insert or update on public.characters
  for each row execute function public.enforce_character_account();

create or replace function public.owns_account(target_account_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.accounts
    where id = target_account_id
      and user_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_account(uuid) from public, anon;
grant execute on function public.owns_account(uuid) to authenticated, service_role;

drop policy if exists characters_insert_own on public.characters;
create policy characters_insert_own
on public.characters for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and public.owns_account(account_id)
);

drop policy if exists characters_update_own on public.characters;
create policy characters_update_own
on public.characters for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and public.owns_account(account_id)
);

drop table if exists public.hunting_spots cascade;

create table if not exists public.monsters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  level integer,
  drop_items text,
  required_accuracy numeric,
  accuracy_per_level numeric,
  hp bigint,
  exp bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monsters_level_check check (level is null or level >= 1),
  constraint monsters_required_accuracy_check check (required_accuracy is null or required_accuracy >= 0),
  constraint monsters_accuracy_per_level_check check (accuracy_per_level is null or accuracy_per_level >= 0),
  constraint monsters_hp_check check (hp is null or hp >= 0),
  constraint monsters_exp_check check (exp is null or exp >= 0)
);

comment on table public.monsters is '몬스터';
comment on column public.monsters.drop_items is '드랍템 종류';
comment on column public.monsters.required_accuracy is '필요 명중률';
comment on column public.monsters.accuracy_per_level is '1레벨당 추가 필요 명중률';
comment on column public.monsters.hp is '체력';
comment on column public.monsters.exp is '경험치';

create index if not exists monsters_user_name_idx on public.monsters (user_id, name);
create index if not exists monsters_user_level_idx on public.monsters (user_id, level);

drop trigger if exists monsters_assign_user_id on public.monsters;
create trigger monsters_assign_user_id
  before insert or update on public.monsters
  for each row execute function public.assign_user_id();

drop trigger if exists monsters_touch_updated_at on public.monsters;
create trigger monsters_touch_updated_at
  before update on public.monsters
  for each row execute function public.touch_updated_at();

alter table public.monsters enable row level security;
revoke all on table public.monsters from anon, authenticated;
grant select, insert, update, delete on table public.monsters to authenticated;
grant all on table public.monsters to service_role;

drop policy if exists monsters_select_own on public.monsters;
create policy monsters_select_own
on public.monsters for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists monsters_insert_own on public.monsters;
create policy monsters_insert_own
on public.monsters for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists monsters_update_own on public.monsters;
create policy monsters_update_own
on public.monsters for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists monsters_delete_own on public.monsters;
create policy monsters_delete_own
on public.monsters for delete to authenticated
using ((select auth.uid()) = user_id);
