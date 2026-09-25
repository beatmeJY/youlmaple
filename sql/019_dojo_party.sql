-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 018까지 이미 실행했다면 이 파일만 실행합니다.
-- 같은 캐릭터의 개인과 팀 구간 시간을 따로 둡니다.
-- 이미 이 파일을 실행했다면 같은 파일을 다시 실행해도 됩니다.

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, character_id, party
      order by updated_at desc, created_at desc
    ) as n
  from public.dojo_records
  where character_id is not null
)
delete from public.dojo_records
where id in (select id from ranked where n > 1);

drop index if exists public.dojo_records_user_character_idx;

create unique index if not exists dojo_records_user_character_party_idx
  on public.dojo_records (user_id, character_id, party)
  where character_id is not null;

comment on table public.dojo_records is '캐릭터의 개인·팀별 무릉 구간 시간. 참고별 실제 시간도 여기에 둡니다';
comment on column public.dojo_records.party is '팀이면 true, 개인이면 false. 캐릭터마다 개인과 팀을 따로 둡니다';
