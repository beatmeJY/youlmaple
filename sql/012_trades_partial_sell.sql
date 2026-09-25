-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에서 이 파일 전체를 실행합니다.
-- 판 가격과 판 개수를 따로 저장할 수 있게 합니다.
-- 001부터 011은 다시 실행하지 않습니다.

alter table public.trades drop constraint if exists trades_sell_pair_check;
