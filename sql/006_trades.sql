-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 아이템/시세 표를 지우고, 거래 내역 표를 만듭니다.
-- 시세에 적어 둔 내용이 있다면 이 실행으로 삭제됩니다.
-- 001부터 005는 다시 실행하지 않습니다.

drop table if exists public.items cascade;

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  buy_price bigint not null,
  buy_qty integer not null,
  sell_price bigint,
  sell_qty integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trades_buy_price_check check (buy_price >= 0),
  constraint trades_buy_qty_check check (buy_qty >= 1),
  constraint trades_sell_price_check check (sell_price is null or sell_price >= 0),
  constraint trades_sell_qty_check check (sell_qty >= 0 and sell_qty <= buy_qty)
);

comment on table public.trades is '거래 내역';
comment on column public.trades.buy_price is '개당 산 가격';
comment on column public.trades.buy_qty is '산 개수';
comment on column public.trades.sell_price is '개당 판 가격. 아직 안 팔렸으면 비움';
comment on column public.trades.sell_qty is '판 개수. 아직 안 팔렸으면 0';

create index if not exists trades_user_name_idx on public.trades (user_id, name);

drop trigger if exists trades_assign_user_id on public.trades;
create trigger trades_assign_user_id
  before insert or update on public.trades
  for each row execute function public.assign_user_id();

drop trigger if exists trades_touch_updated_at on public.trades;
create trigger trades_touch_updated_at
  before update on public.trades
  for each row execute function public.touch_updated_at();

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
