-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 020까지 이미 실행했다면 이 파일만 실행합니다.
-- 캐릭터마다 차원의 균열 조각 획득 시각을 남깁니다. 파풀라투스와 같이 1일입니다.
-- 이미 이 파일을 실행했다면 같은 파일을 다시 실행해도 됩니다.

alter table public.characters
  add column if not exists rift_enabled boolean not null default false,
  add column if not exists rift_at timestamptz;

comment on column public.characters.rift_enabled is '차원의 균열 조각 획득 버튼을 카드에 표시. 레벨과 퀘스트를 맞춘 캐릭터만 켭니다.';
comment on column public.characters.rift_at is '마지막으로 차원의 균열 조각을 얻은 시각. 이 시각부터 정확히 1일 뒤에 다시 얻을 수 있습니다.';
