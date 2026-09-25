-- 메이플 노트 테이블 생성
-- Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 그 다음 sql/002_rls.sql 을 실행합니다.
-- 이 파일을 두 번 실행해도 같은 결과가 되도록 작성했습니다.

-- 수정할 때마다 updated_at 을 현재 시각으로 바꿉니다.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 클라이언트가 다른 사람의 user_id 를 보내지 못하게, 항상 로그인한 사용자로 덮어씁니다.
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

-- 회원가입 시 프로필 한 줄을 만듭니다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.touch_updated_at() from public, anon;
revoke all on function public.assign_user_id() from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public.touch_updated_at() to authenticated, service_role;
grant execute on function public.assign_user_id() to authenticated, service_role;
grant execute on function public.handle_new_user() to supabase_auth_admin, service_role;

-- ---------------------------------------------------------------------------
-- profiles: 로그인 계정 1개당 1줄. id 가 곧 사용자 id 입니다.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- accounts: 메이플 계정. 로그인 사용자 한 명이 계정을 여러 개 둘 수 있습니다.
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.accounts is '메이플 계정';

create index if not exists accounts_user_name_idx on public.accounts (user_id, name);

drop trigger if exists accounts_assign_user_id on public.accounts;
create trigger accounts_assign_user_id
  before insert or update on public.accounts
  for each row execute function public.assign_user_id();

drop trigger if exists accounts_touch_updated_at on public.accounts;
create trigger accounts_touch_updated_at
  before update on public.accounts
  for each row execute function public.touch_updated_at();

-- 캐릭터는 내 계정에만 속하고, 계정당 6명을 넘길 수 없습니다.
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

-- ---------------------------------------------------------------------------
-- characters
-- ---------------------------------------------------------------------------
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete restrict,
  server text not null,
  name text not null,
  job text,
  level integer,
  combat_power bigint,
  current_exp bigint,
  meso bigint,
  gear_memo text,
  extra_memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint characters_level_check check (level is null or level >= 1),
  constraint characters_combat_power_check check (combat_power is null or combat_power >= 0),
  constraint characters_current_exp_check check (current_exp is null or current_exp >= 0),
  constraint characters_meso_check check (meso is null or meso >= 0)
);

comment on table public.characters is '내 캐릭터';
comment on column public.characters.account_id is '소속 메이플 계정. 계정당 6명까지';
comment on column public.characters.combat_power is '스공';
comment on column public.characters.current_exp is '현재 경험치';
comment on column public.characters.meso is '메소';
comment on column public.characters.gear_memo is '장비/스펙 메모';
comment on column public.characters.extra_memo is '기타 메모';

create index if not exists characters_user_name_idx on public.characters (user_id, name);
create index if not exists characters_user_level_idx on public.characters (user_id, level);
create index if not exists characters_account_idx on public.characters (account_id);

drop trigger if exists characters_assign_user_id on public.characters;
create trigger characters_assign_user_id
  before insert or update on public.characters
  for each row execute function public.assign_user_id();

drop trigger if exists characters_enforce_account on public.characters;
create trigger characters_enforce_account
  before insert or update on public.characters
  for each row execute function public.enforce_character_account();

drop trigger if exists characters_touch_updated_at on public.characters;
create trigger characters_touch_updated_at
  before update on public.characters
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- monsters
-- ---------------------------------------------------------------------------
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
  hp_per_exp numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monsters_level_check check (level is null or level >= 1),
  constraint monsters_required_accuracy_check check (required_accuracy is null or required_accuracy >= 0),
  constraint monsters_accuracy_per_level_check check (accuracy_per_level is null or accuracy_per_level >= 0),
  constraint monsters_hp_check check (hp is null or hp >= 0),
  constraint monsters_exp_check check (exp is null or exp >= 0),
  constraint monsters_hp_per_exp_check check (hp_per_exp is null or hp_per_exp >= 0)
);

comment on table public.monsters is '몬스터';
comment on column public.monsters.drop_items is '드랍템 종류';
comment on column public.monsters.required_accuracy is '필요 명중률';
comment on column public.monsters.accuracy_per_level is '1레벨당 추가 필요 명중률';
comment on column public.monsters.hp is '체력';
comment on column public.monsters.exp is '경험치';
comment on column public.monsters.hp_per_exp is '1 경험치 당 HP';

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

-- ---------------------------------------------------------------------------
-- items
-- ---------------------------------------------------------------------------
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text,
  price bigint,
  price_basis text,
  trade_memo text,
  price_updated_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_price_check check (price is null or price >= 0)
);

comment on table public.items is '아이템 시세';
comment on column public.items.price is '현재 가격';
comment on column public.items.price_basis is '가격 기준. 예: 경매장, 개인거래';
comment on column public.items.trade_memo is '거래 관련 메모';
comment on column public.items.price_updated_on is '시세를 확인한 날짜';

create index if not exists items_user_name_idx on public.items (user_id, name);

drop trigger if exists items_assign_user_id on public.items;
create trigger items_assign_user_id
  before insert or update on public.items
  for each row execute function public.assign_user_id();

drop trigger if exists items_touch_updated_at on public.items;
create trigger items_touch_updated_at
  before update on public.items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- quests
-- 완료 여부는 여기 두지 않습니다. 캐릭터마다 다르므로 character_quests 에 둡니다.
-- ---------------------------------------------------------------------------
create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  start_level integer,
  prerequisite text,
  materials text,
  reward text,
  exp_reward bigint,
  meso_reward bigint,
  importance text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quests_start_level_check check (start_level is null or start_level >= 1),
  constraint quests_exp_reward_check check (exp_reward is null or exp_reward >= 0),
  constraint quests_meso_reward_check check (meso_reward is null or meso_reward >= 0),
  constraint quests_importance_check check (
    importance is null or importance in ('높음', '보통', '낮음')
  )
);

comment on table public.quests is '퀘스트 정보';
comment on column public.quests.prerequisite is '선행 퀘스트';
comment on column public.quests.materials is '필요 재료';
comment on column public.quests.exp_reward is '경험치 보상';
comment on column public.quests.meso_reward is '메소 보상';
comment on column public.quests.importance is '높음, 보통, 낮음 중 하나';

create index if not exists quests_user_name_idx on public.quests (user_id, name);
create index if not exists quests_user_level_idx on public.quests (user_id, start_level);

drop trigger if exists quests_assign_user_id on public.quests;
create trigger quests_assign_user_id
  before insert or update on public.quests
  for each row execute function public.assign_user_id();

drop trigger if exists quests_touch_updated_at on public.quests;
create trigger quests_touch_updated_at
  before update on public.quests
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- quest_notes: 퀘스트 하나에 메모를 여러 개 붙입니다.
-- ---------------------------------------------------------------------------
create table if not exists public.quest_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  quest_id uuid not null references public.quests (id) on delete cascade,
  title text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.quest_notes is '퀘스트에 붙인 메모';

create index if not exists quest_notes_user_quest_idx on public.quest_notes (user_id, quest_id);

drop trigger if exists quest_notes_assign_user_id on public.quest_notes;
create trigger quest_notes_assign_user_id
  before insert or update on public.quest_notes
  for each row execute function public.assign_user_id();

drop trigger if exists quest_notes_touch_updated_at on public.quest_notes;
create trigger quest_notes_touch_updated_at
  before update on public.quest_notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- character_quests: 어떤 캐릭터가 어떤 퀘스트를 끝냈는지
-- ---------------------------------------------------------------------------
create table if not exists public.character_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  quest_id uuid not null references public.quests (id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint character_quests_unique unique (character_id, quest_id)
);

comment on table public.character_quests is '캐릭터별 퀘스트 완료 여부';

create index if not exists character_quests_user_idx on public.character_quests (user_id, character_id, quest_id);

drop trigger if exists character_quests_assign_user_id on public.character_quests;
create trigger character_quests_assign_user_id
  before insert or update on public.character_quests
  for each row execute function public.assign_user_id();

drop trigger if exists character_quests_touch_updated_at on public.character_quests;
create trigger character_quests_touch_updated_at
  before update on public.character_quests
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  content text not null default '',
  category text,
  tags text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notes is '자유 메모';
comment on column public.notes.tags is '쉼표로 구분한 태그. 예: 이벤트,코인샵';

create index if not exists notes_user_updated_idx on public.notes (user_id, updated_at desc);
create index if not exists notes_user_title_idx on public.notes (user_id, title);

drop trigger if exists notes_assign_user_id on public.notes;
create trigger notes_assign_user_id
  before insert or update on public.notes
  for each row execute function public.assign_user_id();

drop trigger if exists notes_touch_updated_at on public.notes;
create trigger notes_touch_updated_at
  before update on public.notes
  for each row execute function public.touch_updated_at();
