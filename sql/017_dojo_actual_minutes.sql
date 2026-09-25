-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 016까지 이미 실행했다면 이 파일만 실행합니다.
-- 무릉 기록에 쉬지 않고 한 바퀴를 돈 실제 시간(분) 칸을 추가합니다.
-- 이미 이 파일을 실행했다면 같은 파일을 다시 실행해도 됩니다.

alter table public.dojo_records
  add column if not exists actual_minutes integer;

alter table public.dojo_records drop constraint if exists dojo_records_actual_minutes_check;
alter table public.dojo_records
  add constraint dojo_records_actual_minutes_check check (actual_minutes is null or actual_minutes >= 1);

comment on column public.dojo_records.actual_minutes is '쉬지 않고 한 바퀴를 돈 실제 시간. 분';
