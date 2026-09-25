-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 019까지 이미 실행했다면 이 파일만 실행합니다.
-- 캐릭터마다 피아누스(7일)와 파풀라투스(1일) 도전 시각을 남깁니다.
-- 이미 이 파일을 실행했다면 같은 파일을 다시 실행해도 됩니다.

alter table public.characters
  add column if not exists pianus_enabled boolean not null default false,
  add column if not exists pianus_at timestamptz,
  add column if not exists papulatus_enabled boolean not null default false,
  add column if not exists papulatus_at timestamptz;

comment on column public.characters.pianus_enabled is '피아누스 도전 버튼을 카드에 표시. 레벨과 퀘스트를 맞춘 캐릭터만 켭니다.';
comment on column public.characters.pianus_at is '마지막으로 피아누스에 도전한 시각. 이 시각부터 정확히 7일 뒤에 다시 도전할 수 있습니다.';
comment on column public.characters.papulatus_enabled is '파풀라투스 도전 버튼을 카드에 표시. 레벨과 퀘스트를 맞춘 캐릭터만 켭니다.';
comment on column public.characters.papulatus_at is '마지막으로 파풀라투스에 도전한 시각. 이 시각부터 정확히 1일 뒤에 다시 도전할 수 있습니다.';
