-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 사냥 기록에 메모 칸을 추가합니다.
-- 001부터 009는 다시 실행하지 않습니다.

alter table public.hunts add column if not exists memo text;

comment on column public.hunts.memo is '사냥 메모';
