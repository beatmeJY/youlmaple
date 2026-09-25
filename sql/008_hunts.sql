-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 1시간 사냥 기록과 레벨별 다음 레벨 경험치 표를 만듭니다.
-- 001부터 007은 다시 실행하지 않습니다.

create table if not exists public.hunts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  character_id uuid references public.characters (id) on delete set null,
  character_name text not null,
  job text,
  level integer not null,
  potion_cost numeric(40, 0) not null default 0,
  exp_per_hour numeric(40, 0) not null,
  meso_per_hour numeric(40, 0) not null default 0,
  leech_fee numeric(40, 0) not null default 0,
  title text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hunts_level_check check (level >= 1 and level <= 300),
  constraint hunts_potion_cost_check check (potion_cost >= 0),
  constraint hunts_exp_per_hour_check check (exp_per_hour >= 1)
);

comment on table public.hunts is '1시간 사냥 기록';
comment on column public.hunts.character_id is '기록 당시 캐릭터. 캐릭터를 지워도 기록은 남습니다';
comment on column public.hunts.character_name is '기록 당시 캐릭터명';
comment on column public.hunts.job is '기록 당시 직업';
comment on column public.hunts.level is '기록 당시 레벨';
comment on column public.hunts.potion_cost is '1시간 물약 값';
comment on column public.hunts.exp_per_hour is '1시간 경험치';
comment on column public.hunts.meso_per_hour is '1시간 순메소. 한시간 메소는 순메소에 쩔비를 더하고 물약을 뺀 값';
comment on column public.hunts.leech_fee is '1시간 쩔비. 받으면 양수, 내가 내면 음수';
comment on column public.hunts.title is '사냥 이름. 맵이나 자리처럼 기록을 구분하는 제목';
comment on column public.hunts.memo is '사냥 메모. 누구에게 얼마를 받았는지처럼 제목과 따로 적는 내용';

create index if not exists hunts_user_created_idx on public.hunts (user_id, created_at desc);

drop trigger if exists hunts_assign_user_id on public.hunts;
create trigger hunts_assign_user_id
  before insert or update on public.hunts
  for each row execute function public.assign_user_id();

drop trigger if exists hunts_touch_updated_at on public.hunts;
create trigger hunts_touch_updated_at
  before update on public.hunts
  for each row execute function public.touch_updated_at();

create table if not exists public.level_exp (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  level integer not null,
  exp_to_next numeric(40, 0) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint level_exp_level_check check (level >= 1 and level <= 299),
  constraint level_exp_amount_check check (exp_to_next >= 1),
  constraint level_exp_user_level_key unique (user_id, level)
);

comment on table public.level_exp is '레벨별 다음 레벨 경험치';
comment on column public.level_exp.exp_to_next is '이 레벨에서 다음 레벨까지 필요한 경험치';

drop trigger if exists level_exp_assign_user_id on public.level_exp;
create trigger level_exp_assign_user_id
  before insert or update on public.level_exp
  for each row execute function public.assign_user_id();

drop trigger if exists level_exp_touch_updated_at on public.level_exp;
create trigger level_exp_touch_updated_at
  before update on public.level_exp
  for each row execute function public.touch_updated_at();

alter table public.hunts enable row level security;
revoke all on table public.hunts from anon, authenticated;
grant select, insert, update, delete on table public.hunts to authenticated;
grant all on table public.hunts to service_role;

drop policy if exists hunts_select_own on public.hunts;
create policy hunts_select_own
on public.hunts for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists hunts_insert_own on public.hunts;
create policy hunts_insert_own
on public.hunts for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (character_id is null or public.owns_character(character_id))
);

drop policy if exists hunts_update_own on public.hunts;
create policy hunts_update_own
on public.hunts for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (character_id is null or public.owns_character(character_id))
);

drop policy if exists hunts_delete_own on public.hunts;
create policy hunts_delete_own
on public.hunts for delete to authenticated
using ((select auth.uid()) = user_id);

alter table public.level_exp enable row level security;
revoke all on table public.level_exp from anon, authenticated;
grant select, insert, update, delete on table public.level_exp to authenticated;
grant all on table public.level_exp to service_role;

drop policy if exists level_exp_select_own on public.level_exp;
create policy level_exp_select_own
on public.level_exp for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists level_exp_insert_own on public.level_exp;
create policy level_exp_insert_own
on public.level_exp for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists level_exp_update_own on public.level_exp;
create policy level_exp_update_own
on public.level_exp for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists level_exp_delete_own on public.level_exp;
create policy level_exp_delete_own
on public.level_exp for delete to authenticated
using ((select auth.uid()) = user_id);
