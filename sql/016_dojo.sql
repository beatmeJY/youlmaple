-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 015까지 이미 실행했다면 이 파일만 실행합니다.
-- 무릉도장 층별 시간과 허리띠 시세 기록을 만듭니다.
-- 이미 이 파일을 실행했다면 같은 파일을 다시 실행해도 됩니다.

create table if not exists public.dojo_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  character_id uuid references public.characters (id) on delete set null,
  character_name text not null,
  party boolean not null default false,
  floors jsonb not null,
  score integer,
  actual_minutes integer,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dojo_records_floors_check check (jsonb_typeof(floors) = 'object'),
  constraint dojo_records_score_check check (score is null or (score >= 0 and score <= 17000)),
  constraint dojo_records_actual_minutes_check check (actual_minutes is null or actual_minutes >= 1)
);

comment on table public.dojo_records is '무릉도장 층별 시간. 이 시간으로 어디에 저장하는 게 빠른지 계산합니다';
comment on column public.dojo_records.character_id is '기록 당시 캐릭터. 캐릭터를 지워도 기록은 남습니다';
comment on column public.dojo_records.character_name is '기록 당시 캐릭터명';
comment on column public.dojo_records.party is '팀이면 true, 개인이면 false';
comment on column public.dojo_records.floors is '구간 시작 층을 키로 한 클리어 초. 예: {"1": 90, "6": 70} 은 1~5층 90초, 6~10층 70초';
comment on column public.dojo_records.score is '기록 당시 수련 점수. 0부터 17000까지';
comment on column public.dojo_records.actual_minutes is '쉬지 않고 한 바퀴를 돈 실제 시간. 분';
comment on column public.dojo_records.memo is '무릉 메모';

create index if not exists dojo_records_user_created_idx on public.dojo_records (user_id, created_at desc);

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

alter table public.dojo_records enable row level security;
revoke all on table public.dojo_records from anon, authenticated;
grant select, insert, update, delete on table public.dojo_records to authenticated;
grant all on table public.dojo_records to service_role;

drop policy if exists dojo_records_select_own on public.dojo_records;
create policy dojo_records_select_own
on public.dojo_records for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists dojo_records_insert_own on public.dojo_records;
create policy dojo_records_insert_own
on public.dojo_records for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (character_id is null or public.owns_character(character_id))
);

drop policy if exists dojo_records_update_own on public.dojo_records;
create policy dojo_records_update_own
on public.dojo_records for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (character_id is null or public.owns_character(character_id))
);

drop policy if exists dojo_records_delete_own on public.dojo_records;
create policy dojo_records_delete_own
on public.dojo_records for delete to authenticated
using ((select auth.uid()) = user_id);

alter table public.dojo_belt_prices enable row level security;
revoke all on table public.dojo_belt_prices from anon, authenticated;
grant select, insert, update, delete on table public.dojo_belt_prices to authenticated;
grant all on table public.dojo_belt_prices to service_role;

drop policy if exists dojo_belt_prices_select_own on public.dojo_belt_prices;
create policy dojo_belt_prices_select_own
on public.dojo_belt_prices for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists dojo_belt_prices_insert_own on public.dojo_belt_prices;
create policy dojo_belt_prices_insert_own
on public.dojo_belt_prices for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists dojo_belt_prices_update_own on public.dojo_belt_prices;
create policy dojo_belt_prices_update_own
on public.dojo_belt_prices for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists dojo_belt_prices_delete_own on public.dojo_belt_prices;
create policy dojo_belt_prices_delete_own
on public.dojo_belt_prices for delete to authenticated
using ((select auth.uid()) = user_id);
