-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 퀘스트에 진행 시간(분) 칸을 추가합니다.
-- 001부터 006은 다시 실행하지 않습니다.

alter table public.quests add column if not exists duration_minutes integer;

do $$
begin
  alter table public.quests
    add constraint quests_duration_minutes_check
    check (duration_minutes is null or duration_minutes >= 1);
exception
  when duplicate_object then null;
end $$;

comment on column public.quests.duration_minutes is '진행 시간(분)';
