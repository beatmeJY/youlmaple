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
-- jobs: 직업 목록. 색은 계열마다 같습니다.
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id text primary key,
  family text not null,
  rank smallint,
  name text not null,
  color text not null,
  color_dark text not null,
  sort_order integer not null,
  constraint jobs_family_check check (family in ('전사', '마법사', '궁수', '도적', '해적')),
  constraint jobs_rank_check check (rank is null or rank between 1 and 4),
  constraint jobs_color_check check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint jobs_color_dark_check check (color_dark ~ '^#[0-9A-Fa-f]{6}$'),
  constraint jobs_name_unique unique (name)
);

comment on table public.jobs is '메이플 직업. 같은 계열은 같은 색입니다.';
comment on column public.jobs.family is '전사, 마법사, 궁수, 도적, 해적';
comment on column public.jobs.rank is '1차부터 4차. 시그너스처럼 차수가 없으면 비웁니다.';
comment on column public.jobs.color is '라이트 모드 글자색';
comment on column public.jobs.color_dark is '다크 모드 글자색';

insert into public.jobs (id, family, rank, name, color, color_dark, sort_order)
values
  ('swordsman', '전사', 1, '검사', '#dc2626', '#f87171', 10),
  ('fighter', '전사', 2, '파이터', '#dc2626', '#f87171', 11),
  ('page', '전사', 2, '페이지', '#dc2626', '#f87171', 12),
  ('spearman', '전사', 2, '스피어맨', '#dc2626', '#f87171', 13),
  ('crusader', '전사', 3, '크루세이더', '#dc2626', '#f87171', 14),
  ('knight', '전사', 3, '나이트', '#dc2626', '#f87171', 15),
  ('dragon-knight', '전사', 3, '용기사', '#dc2626', '#f87171', 16),
  ('hero', '전사', 4, '히어로', '#dc2626', '#f87171', 17),
  ('paladin', '전사', 4, '팔라딘', '#dc2626', '#f87171', 18),
  ('dark-knight', '전사', 4, '다크나이트', '#dc2626', '#f87171', 19),
  ('magician', '마법사', 1, '매지션', '#0284c7', '#38bdf8', 20),
  ('wizard-fp', '마법사', 2, '위자드(불·독)', '#0284c7', '#38bdf8', 21),
  ('wizard-il', '마법사', 2, '위자드(썬·콜)', '#0284c7', '#38bdf8', 22),
  ('cleric', '마법사', 2, '클레릭', '#0284c7', '#38bdf8', 23),
  ('mage-fp', '마법사', 3, '메이지(불·독)', '#0284c7', '#38bdf8', 24),
  ('mage-il', '마법사', 3, '메이지(썬·콜)', '#0284c7', '#38bdf8', 25),
  ('priest', '마법사', 3, '프리스트', '#0284c7', '#38bdf8', 26),
  ('archmage-fp', '마법사', 4, '아크메이지(불·독)', '#0284c7', '#38bdf8', 27),
  ('archmage-il', '마법사', 4, '아크메이지(썬·콜)', '#0284c7', '#38bdf8', 28),
  ('bishop', '마법사', 4, '비숍', '#0284c7', '#38bdf8', 29),
  ('archer', '궁수', 1, '아처', '#15803d', '#4ade80', 30),
  ('hunter', '궁수', 2, '헌터', '#15803d', '#4ade80', 31),
  ('crossbowman', '궁수', 2, '사수', '#15803d', '#4ade80', 33),
  ('ranger', '궁수', 3, '레인저', '#15803d', '#4ade80', 35),
  ('sniper', '궁수', 3, '저격수', '#15803d', '#4ade80', 36),
  ('bowmaster', '궁수', 4, '보우마스터', '#15803d', '#4ade80', 37),
  ('marksman', '궁수', 4, '신궁', '#15803d', '#4ade80', 38),
  ('rogue', '도적', 1, '로그', '#7e22ce', '#d8b4fe', 40),
  ('assassin', '도적', 2, '어쌔신', '#7e22ce', '#d8b4fe', 41),
  ('bandit', '도적', 2, '시프', '#7e22ce', '#d8b4fe', 42),
  ('hermit', '도적', 3, '허밋', '#7e22ce', '#d8b4fe', 43),
  ('chief-bandit', '도적', 3, '시프마스터', '#7e22ce', '#d8b4fe', 44),
  ('night-lord', '도적', 4, '나이트로드', '#7e22ce', '#d8b4fe', 45),
  ('shadower', '도적', 4, '섀도어', '#7e22ce', '#d8b4fe', 46),
  ('pirate', '해적', 1, '해적', '#5c3317', '#c4a484', 50),
  ('infighter', '해적', 2, '인파이터', '#5c3317', '#c4a484', 51),
  ('gunslinger', '해적', 2, '건슬링거', '#5c3317', '#c4a484', 52),
  ('buccaneer', '해적', 3, '버커니어', '#5c3317', '#c4a484', 53),
  ('valkyrie', '해적', 3, '발키리', '#5c3317', '#c4a484', 54),
  ('viper', '해적', 4, '바이퍼', '#5c3317', '#c4a484', 55),
  ('captain', '해적', 4, '캡틴', '#5c3317', '#c4a484', 56),
  ('soul-master', '전사', null, '소울마스터', '#dc2626', '#f87171', 61),
  ('flame-wizard', '마법사', null, '플레임위자드', '#0284c7', '#38bdf8', 62),
  ('battle-mage', '마법사', null, '배틀메이지', '#0284c7', '#38bdf8', 63),
  ('wind-breaker', '궁수', null, '윈드브레이커', '#15803d', '#4ade80', 64),
  ('night-walker', '도적', null, '나이트워커', '#7e22ce', '#d8b4fe', 65),
  ('striker', '해적', null, '스트라이커', '#5c3317', '#c4a484', 66)
on conflict (id) do update
set family = excluded.family,
    rank = excluded.rank,
    name = excluded.name,
    color = excluded.color,
    color_dark = excluded.color_dark,
    sort_order = excluded.sort_order;

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
  job_id text references public.jobs (id) on delete restrict,
  level integer,
  combat_power bigint,
  current_exp bigint,
  meso bigint,
  gear_memo text,
  extra_memo text,
  pianus_enabled boolean not null default false,
  pianus_at timestamptz,
  papulatus_enabled boolean not null default false,
  papulatus_at timestamptz,
  rift_enabled boolean not null default false,
  rift_at timestamptz,
  quests_hidden boolean not null default false,
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
comment on column public.characters.job is '직업 이름. job_id가 있으면 직업 표의 이름과 같게 맞춥니다.';
comment on column public.characters.job_id is '직업 표. 비어 있으면 아직 목록에 없는 직업입니다.';
comment on column public.characters.extra_memo is '기타 메모';
comment on column public.characters.pianus_enabled is '피아누스 도전 버튼을 카드에 표시. 레벨과 퀘스트를 맞춘 캐릭터만 켭니다.';
comment on column public.characters.pianus_at is '마지막으로 피아누스에 도전한 시각. 이 시각부터 정확히 7일 뒤에 다시 도전할 수 있습니다.';
comment on column public.characters.papulatus_enabled is '파풀라투스 도전 버튼을 카드에 표시. 레벨과 퀘스트를 맞춘 캐릭터만 켭니다.';
comment on column public.characters.papulatus_at is '마지막으로 파풀라투스에 도전한 시각. 이 시각부터 정확히 1일 뒤에 다시 도전할 수 있습니다.';
comment on column public.characters.rift_enabled is '차원의 균열 조각 획득 버튼을 카드에 표시. 레벨과 퀘스트를 맞춘 캐릭터만 켭니다.';
comment on column public.characters.rift_at is '마지막으로 차원의 균열 조각을 얻은 시각. 이 시각부터 정확히 1일 뒤에 다시 얻을 수 있습니다.';
comment on column public.characters.quests_hidden is '켜면 퀘스트 완료 표에 이 캐릭터를 표시하지 않습니다. 완료 기록은 그대로 둡니다.';

create index if not exists characters_user_name_idx on public.characters (user_id, name);
create index if not exists characters_job_idx on public.characters (job_id);
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
  weak_elements text,
  resist_elements text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monsters_level_check check (level is null or level >= 1),
  constraint monsters_required_accuracy_check check (required_accuracy is null or required_accuracy >= 0),
  constraint monsters_accuracy_per_level_check check (accuracy_per_level is null or accuracy_per_level >= 0),
  constraint monsters_hp_check check (hp is null or hp >= 0),
  constraint monsters_exp_check check (exp is null or exp >= 0),
  constraint monsters_hp_per_exp_check check (hp_per_exp is null or hp_per_exp >= 0),
  constraint monsters_weak_elements_check check (
    weak_elements is null
    or weak_elements ~ '^(불|냉기|전기|독|성)(, (불|냉기|전기|독|성))*$'
  ),
  constraint monsters_resist_elements_check check (
    resist_elements is null
    or resist_elements ~ '^(불|냉기|전기|독|성)(, (불|냉기|전기|독|성))*$'
  )
);

comment on table public.monsters is '몬스터';
comment on column public.monsters.drop_items is '드랍템 종류';
comment on column public.monsters.required_accuracy is '필요 명중률';
comment on column public.monsters.accuracy_per_level is '1레벨당 추가 필요 명중률';
comment on column public.monsters.hp is '체력';
comment on column public.monsters.exp is '경험치';
comment on column public.monsters.hp_per_exp is '1 경험치 당 HP';
comment on column public.monsters.weak_elements is '속성 약점. 불, 냉기, 전기, 독, 성 중에서 쉼표로 구분';
comment on column public.monsters.resist_elements is '속성 반감. 불, 냉기, 전기, 독, 성 중에서 쉼표로 구분';

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
-- trades: 한 줄이 한 번의 매수입니다. 일부만 팔려도 남은 수량이 남습니다.
-- 가격은 개당 메소입니다.
-- ---------------------------------------------------------------------------
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  buy_price bigint not null,
  buy_qty integer not null,
  sell_price bigint,
  sell_qty integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trades_buy_price_check check (buy_price >= 0),
  constraint trades_buy_qty_check check (buy_qty >= 1),
  constraint trades_sell_price_check check (sell_price is null or sell_price >= 0),
  constraint trades_sell_qty_check check (sell_qty >= 0 and sell_qty <= buy_qty),
  constraint trades_sell_pair_check check (
    (sell_qty = 0 and sell_price is null) or (sell_qty > 0 and sell_price is not null)
  )
);

comment on table public.trades is '거래 내역';
comment on column public.trades.buy_price is '개당 산 가격';
comment on column public.trades.buy_qty is '산 개수';
comment on column public.trades.sell_price is '개당 판 가격. 아직 안 팔렸으면 비움';
comment on column public.trades.sell_qty is '판 개수. 아직 안 팔렸으면 0';

create index if not exists trades_user_name_idx on public.trades (user_id, name);

drop trigger if exists trades_assign_user_id on public.trades;
create trigger trades_assign_user_id
  before insert or update on public.trades
  for each row execute function public.assign_user_id();

drop trigger if exists trades_touch_updated_at on public.trades;
create trigger trades_touch_updated_at
  before update on public.trades
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
  material_cost bigint,
  duration_minutes integer,
  importance text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quests_start_level_check check (start_level is null or start_level >= 1),
  constraint quests_exp_reward_check check (exp_reward is null or exp_reward >= 0),
  constraint quests_meso_reward_check check (meso_reward is null or meso_reward >= 0),
  constraint quests_material_cost_check check (material_cost is null or material_cost >= 0),
  constraint quests_duration_minutes_check check (duration_minutes is null or duration_minutes >= 1),
  constraint quests_importance_check check (
    importance is null or importance in ('높음', '보통', '낮음')
  )
);

comment on table public.quests is '퀘스트 정보';
comment on column public.quests.prerequisite is '선행 퀘스트';
comment on column public.quests.materials is '필요 재료';
comment on column public.quests.exp_reward is '경험치 보상';
comment on column public.quests.meso_reward is '메소 보상';
comment on column public.quests.material_cost is '재료비';
comment on column public.quests.duration_minutes is '진행 시간(분)';
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

-- ---------------------------------------------------------------------------
-- links: 다시 열고 싶은 주소
-- ---------------------------------------------------------------------------
create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  url text not null,
  memo text not null default '',
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint links_title_check check (char_length(btrim(title)) > 0),
  constraint links_url_check check (url ~* '^https?://')
);

comment on table public.links is '다시 열고 싶은 주소';
comment on column public.links.url is 'http 또는 https 주소';
comment on column public.links.memo is '이 주소를 저장한 이유';
comment on column public.links.category is '분류. 예: 공략, 계산기';

create index if not exists links_user_updated_idx on public.links (user_id, updated_at desc);

drop trigger if exists links_assign_user_id on public.links;
create trigger links_assign_user_id
  before insert or update on public.links
  for each row execute function public.assign_user_id();

drop trigger if exists links_touch_updated_at on public.links;
create trigger links_touch_updated_at
  before update on public.links
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- hunts: 1시간 사냥 한 번의 기록. 경험치와 메소는 자리 수가 크므로 numeric 입니다.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- level_exp: 그 레벨에서 다음 레벨까지 필요한 경험치
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- dojo_records: 무릉도장 층별 클리어 초
-- dojo_belt_prices: 허리띠 시세. 바꿀 때마다 한 줄씩 쌓입니다.
-- ---------------------------------------------------------------------------
create table if not exists public.dojo_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  character_id uuid references public.characters (id) on delete set null,
  character_name text not null,
  party boolean not null default false,
  floors jsonb not null,
  score integer,
  actual_minutes integer,
  runs jsonb not null default '{}'::jsonb,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dojo_records_floors_check check (jsonb_typeof(floors) = 'object'),
  constraint dojo_records_score_check check (score is null or (score >= 0 and score <= 17000)),
  constraint dojo_records_actual_minutes_check check (actual_minutes is null or actual_minutes >= 1),
  constraint dojo_records_runs_check check (jsonb_typeof(runs) = 'object')
);

comment on table public.dojo_records is '캐릭터의 개인·팀별 무릉 구간 시간. 참고별 실제 시간도 여기에 둡니다';
comment on column public.dojo_records.character_id is '기록 당시 캐릭터. 캐릭터를 지워도 기록은 남습니다';
comment on column public.dojo_records.character_name is '기록 당시 캐릭터명';
comment on column public.dojo_records.party is '팀이면 true, 개인이면 false. 캐릭터마다 개인과 팀을 따로 둡니다';
comment on column public.dojo_records.floors is '구간 시작 층을 키로 한 클리어 초. 예: {"1": 90, "6": 70} 은 1~5층 90초, 6~10층 70초';
comment on column public.dojo_records.score is '기록 당시 수련 점수. 0부터 17000까지';
comment on column public.dojo_records.actual_minutes is '예전 칸. 참고별 실제 시간은 runs 를 사용합니다';
comment on column public.dojo_records.runs is '저장 구간 키별 실제 소요 초. 예: {"15,20,25": 400} 은 15→20→25 저장을 400초에 돈 기록. 빈 키는 저장 안 함';
comment on column public.dojo_records.memo is '무릉 메모';

create index if not exists dojo_records_user_created_idx on public.dojo_records (user_id, created_at desc);
create unique index if not exists dojo_records_user_character_party_idx on public.dojo_records (user_id, character_id, party) where character_id is not null;

drop trigger if exists dojo_records_assign_user_id on public.dojo_records;
create trigger dojo_records_assign_user_id
  before insert or update on public.dojo_records
  for each row execute function public.assign_user_id();

drop trigger if exists dojo_records_touch_updated_at on public.dojo_records;
create trigger dojo_records_touch_updated_at
  before update on public.dojo_records
  for each row execute function public.touch_updated_at();

create table if not exists public.dojo_belt_prices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  belt text not null,
  price bigint not null,
  created_at timestamptz not null default now(),
  constraint dojo_belt_prices_belt_check check (belt in ('white', 'yellow', 'blue', 'red', 'black')),
  constraint dojo_belt_prices_price_check check (price >= 0)
);

comment on table public.dojo_belt_prices is '무릉 허리띠 시세. 바꿀 때마다 한 줄씩 쌓입니다';
comment on column public.dojo_belt_prices.belt is 'white, yellow, blue, red, black';
comment on column public.dojo_belt_prices.price is '기록한 시점의 시세';

create index if not exists dojo_belt_prices_user_belt_idx on public.dojo_belt_prices (user_id, belt, created_at desc);

drop trigger if exists dojo_belt_prices_assign_user_id on public.dojo_belt_prices;
create trigger dojo_belt_prices_assign_user_id
  before insert or update on public.dojo_belt_prices
  for each row execute function public.assign_user_id();
