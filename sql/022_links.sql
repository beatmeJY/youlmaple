-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 021까지 이미 실행했다면 이 파일만 실행합니다.
-- 다시 열고 싶은 주소를 저장하는 표를 만듭니다.
-- 이미 이 파일을 실행했다면 같은 파일을 다시 실행해도 됩니다.

create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  url text not null,
  memo text not null default '',
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint links_title_check check (char_length(btrim(title)) > 0),
  constraint links_url_check check (url ~* '^https?://')
);

comment on table public.links is '다시 열고 싶은 주소';
comment on column public.links.url is 'http 또는 https 주소';
comment on column public.links.memo is '이 주소를 저장한 이유';
comment on column public.links.category is '분류. 예: 공략, 계산기';

create index if not exists links_user_updated_idx on public.links (user_id, updated_at desc);

drop trigger if exists links_assign_user_id on public.links;
create trigger links_assign_user_id
  before insert or update on public.links
  for each row execute function public.assign_user_id();

drop trigger if exists links_touch_updated_at on public.links;
create trigger links_touch_updated_at
  before update on public.links
  for each row execute function public.touch_updated_at();

alter table public.links enable row level security;
revoke all on table public.links from anon, authenticated;
grant select, insert, update, delete on table public.links to authenticated;
grant all on table public.links to service_role;

drop policy if exists links_select_own on public.links;
create policy links_select_own
on public.links for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists links_insert_own on public.links;
create policy links_insert_own
on public.links for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists links_update_own on public.links;
create policy links_update_own
on public.links for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists links_delete_own on public.links;
create policy links_delete_own
on public.links for delete to authenticated
using ((select auth.uid()) = user_id);
