-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 017까지 이미 실행했다면 이 파일만 실행합니다.
-- 캐릭터마다 구간 시간을 하나로 두고, 참고별로 실제로 돈 초를 저장합니다.
-- 이미 이 파일을 실행했다면 같은 파일을 다시 실행해도 됩니다.

alter table public.dojo_records
  add column if not exists runs jsonb not null default '{}'::jsonb;

alter table public.dojo_records drop constraint if exists dojo_records_runs_check;
alter table public.dojo_records
  add constraint dojo_records_runs_check check (jsonb_typeof(runs) = 'object');

comment on table public.dojo_records is '캐릭터마다 하나인 무릉 구간 시간. 참고별 실제 시간도 여기에 둡니다';
comment on column public.dojo_records.runs is '저장 구간 키별 실제 소요 초. 예: {"15,20,25": 400} 은 15→20→25 저장을 400초에 돈 기록. 빈 키는 저장 안 함';

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, character_id
      order by updated_at desc, created_at desc
    ) as n
  from public.dojo_records
  where character_id is not null
)
delete from public.dojo_records
where id in (select id from ranked where n > 1);

create unique index if not exists dojo_records_user_character_idx
  on public.dojo_records (user_id, character_id)
  where character_id is not null;
