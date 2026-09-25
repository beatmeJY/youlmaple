-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 몬스터에 속성 약점과 속성 반감 칸을 추가합니다.
-- 001부터 013은 다시 실행하지 않습니다.
-- 이미 이 파일을 실행했다면 같은 파일을 다시 실행합니다.
-- 예전에 면역 칸을 만들었다면 반감 칸으로 바꿉니다.

alter table public.monsters add column if not exists weak_elements text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'monsters'
      and column_name = 'immune_elements'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'monsters'
      and column_name = 'resist_elements'
  ) then
    alter table public.monsters rename column immune_elements to resist_elements;
  end if;
end $$;

alter table public.monsters add column if not exists resist_elements text;

alter table public.monsters drop constraint if exists monsters_weak_elements_check;
alter table public.monsters drop constraint if exists monsters_immune_elements_check;
alter table public.monsters drop constraint if exists monsters_resist_elements_check;

alter table public.monsters
  add constraint monsters_weak_elements_check
  check (
    weak_elements is null
    or weak_elements ~ '^(불|냉기|전기|독|성)(, (불|냉기|전기|독|성))*$'
  );

alter table public.monsters
  add constraint monsters_resist_elements_check
  check (
    resist_elements is null
    or resist_elements ~ '^(불|냉기|전기|독|성)(, (불|냉기|전기|독|성))*$'
  );

comment on column public.monsters.weak_elements is '속성 약점. 불, 냉기, 전기, 독, 성 중에서 쉼표로 구분';
comment on column public.monsters.resist_elements is '속성 반감. 불, 냉기, 전기, 독, 성 중에서 쉼표로 구분';
