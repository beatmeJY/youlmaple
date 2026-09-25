-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 022까지 이미 실행했다면 이 파일만 실행합니다.
-- 캐릭터마다 퀘스트 완료 표에서 뺄지 고릅니다.
-- 이미 이 파일을 실행했다면 같은 파일을 다시 실행해도 됩니다.

alter table public.characters
  add column if not exists quests_hidden boolean not null default false;

comment on column public.characters.quests_hidden is '켜면 퀘스트 완료 표에 이 캐릭터를 표시하지 않습니다. 완료 기록은 그대로 둡니다.';
