-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 쩔비는 받으면 양수, 내가 내면 음수로 저장합니다.
-- 013까지 이미 실행했다면 이 파일만 실행합니다.
-- 예전에 저장된 양수 쩔비는 메소에서 빼던 비용이므로 음수로 바꿉니다.
-- 받는 쩔비를 양수로 저장한 뒤에는 이 파일을 다시 실행하지 않습니다.

alter table public.hunts drop constraint if exists hunts_leech_fee_check;

update public.hunts set leech_fee = -leech_fee where leech_fee > 0;

comment on column public.hunts.leech_fee is '1시간 쩔비. 받으면 양수, 내가 내면 음수';
comment on column public.hunts.meso_per_hour is '1시간 순메소. 한시간 메소는 순메소에 쩔비를 더하고 물약을 뺀 값';
