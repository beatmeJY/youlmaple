-- 메이플 노트 권한과 RLS
-- sql/001_schema.sql 이 Success 인 뒤에, 이 파일 전체를 SQL Editor 에 붙여 넣고 Run 합니다.
-- 로그인하지 않은 방문자(anon)는 표를 조회할 수 없습니다.
-- 로그인한 사용자는 자기 행만 조회, 추가, 수정, 삭제할 수 있습니다.

-- 부모 퀘스트가 내 퀘스트인지 확인합니다.
create or replace function public.owns_quest(target_quest_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.quests
    where id = target_quest_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.owns_character(target_character_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.characters
    where id = target_character_id
      and user_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_quest(uuid) from public, anon;
revoke all on function public.owns_character(uuid) from public, anon;
grant execute on function public.owns_quest(uuid) to authenticated, service_role;
grant execute on function public.owns_character(uuid) to authenticated, service_role;

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

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- characters, trades, quests, notes
-- 네 동작(조회/추가/수정/삭제)을 각각 분리합니다.
-- ---------------------------------------------------------------------------
alter table public.characters enable row level security;
revoke all on table public.characters from anon, authenticated;
grant select, insert, update, delete on table public.characters to authenticated;
grant all on table public.characters to service_role;

drop policy if exists characters_select_own on public.characters;
create policy characters_select_own
on public.characters for select to authenticated
using ((select auth.uid()) = user_id);

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

drop policy if exists characters_delete_own on public.characters;
create policy characters_delete_own
on public.characters for delete to authenticated
using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- jobs: 로그인 사용자는 직업 목록을 조회만 할 수 있습니다.
-- ---------------------------------------------------------------------------
alter table public.jobs enable row level security;
revoke all on table public.jobs from anon, authenticated;
grant select on table public.jobs to authenticated;
grant all on table public.jobs to service_role;

drop policy if exists jobs_select_authenticated on public.jobs;
create policy jobs_select_authenticated
on public.jobs for select to authenticated
using (true);

-- ---------------------------------------------------------------------------
-- accounts, monsters
-- ---------------------------------------------------------------------------
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

alter table public.trades enable row level security;
revoke all on table public.trades from anon, authenticated;
grant select, insert, update, delete on table public.trades to authenticated;
grant all on table public.trades to service_role;

drop policy if exists trades_select_own on public.trades;
create policy trades_select_own
on public.trades for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists trades_insert_own on public.trades;
create policy trades_insert_own
on public.trades for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists trades_update_own on public.trades;
create policy trades_update_own
on public.trades for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists trades_delete_own on public.trades;
create policy trades_delete_own
on public.trades for delete to authenticated
using ((select auth.uid()) = user_id);

alter table public.quests enable row level security;
revoke all on table public.quests from anon, authenticated;
grant select, insert, update, delete on table public.quests to authenticated;
grant all on table public.quests to service_role;

drop policy if exists quests_select_own on public.quests;
create policy quests_select_own
on public.quests for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists quests_insert_own on public.quests;
create policy quests_insert_own
on public.quests for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists quests_update_own on public.quests;
create policy quests_update_own
on public.quests for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists quests_delete_own on public.quests;
create policy quests_delete_own
on public.quests for delete to authenticated
using ((select auth.uid()) = user_id);

alter table public.notes enable row level security;
revoke all on table public.notes from anon, authenticated;
grant select, insert, update, delete on table public.notes to authenticated;
grant all on table public.notes to service_role;

drop policy if exists notes_select_own on public.notes;
create policy notes_select_own
on public.notes for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists notes_insert_own on public.notes;
create policy notes_insert_own
on public.notes for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists notes_update_own on public.notes;
create policy notes_update_own
on public.notes for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists notes_delete_own on public.notes;
create policy notes_delete_own
on public.notes for delete to authenticated
using ((select auth.uid()) = user_id);

alter table public.links enable row level security;
revoke all on table public.links from anon, authenticated;
grant select, insert, update, delete on table public.links to authenticated;
grant all on table public.links to service_role;

drop policy if exists links_select_own on public.links;
create policy links_select_own
on public.links for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists links_insert_own on public.links;
create policy links_insert_own
on public.links for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists links_update_own on public.links;
create policy links_update_own
on public.links for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists links_delete_own on public.links;
create policy links_delete_own
on public.links for delete to authenticated
using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- quest_notes: 내 메모이면서, 연결한 퀘스트도 내 퀘스트여야 합니다.
-- ---------------------------------------------------------------------------
alter table public.quest_notes enable row level security;
revoke all on table public.quest_notes from anon, authenticated;
grant select, insert, update, delete on table public.quest_notes to authenticated;
grant all on table public.quest_notes to service_role;

drop policy if exists quest_notes_select_own on public.quest_notes;
create policy quest_notes_select_own
on public.quest_notes for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists quest_notes_insert_own on public.quest_notes;
create policy quest_notes_insert_own
on public.quest_notes for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and public.owns_quest(quest_id)
);

drop policy if exists quest_notes_update_own on public.quest_notes;
create policy quest_notes_update_own
on public.quest_notes for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and public.owns_quest(quest_id)
);

drop policy if exists quest_notes_delete_own on public.quest_notes;
create policy quest_notes_delete_own
on public.quest_notes for delete to authenticated
using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- character_quests: 내 캐릭터와 내 퀘스트만 연결할 수 있습니다.
-- ---------------------------------------------------------------------------
alter table public.character_quests enable row level security;
revoke all on table public.character_quests from anon, authenticated;
grant select, insert, update, delete on table public.character_quests to authenticated;
grant all on table public.character_quests to service_role;

drop policy if exists character_quests_select_own on public.character_quests;
create policy character_quests_select_own
on public.character_quests for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists character_quests_insert_own on public.character_quests;
create policy character_quests_insert_own
on public.character_quests for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and public.owns_character(character_id)
  and public.owns_quest(quest_id)
);

drop policy if exists character_quests_update_own on public.character_quests;
create policy character_quests_update_own
on public.character_quests for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and public.owns_character(character_id)
  and public.owns_quest(quest_id)
);

drop policy if exists character_quests_delete_own on public.character_quests;
create policy character_quests_delete_own
on public.character_quests for delete to authenticated
using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- hunts: 내 기록만. 캐릭터를 연결하면 그 캐릭터도 내 것이어야 합니다.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- level_exp
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- dojo_records, dojo_belt_prices
-- ---------------------------------------------------------------------------
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
