-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 사냥 기록에 1시간 쩔비 칸을 추가합니다.
-- 001부터 012는 다시 실행하지 않습니다.
-- 쩔비 부호(받으면 양수, 내가 내면 음수)는 sql/015_hunt_leech_signed.sql 에서 맞춥니다.

alter table public.hunts add column if not exists leech_fee numeric(40, 0) not null default 0;

comment on column public.hunts.leech_fee is '1시간 쩔비. 받으면 양수, 내가 내면 음수';
comment on column public.hunts.meso_per_hour is '1시간 순메소. 한시간 메소는 순메소에 쩔비를 더하고 물약을 뺀 값';
