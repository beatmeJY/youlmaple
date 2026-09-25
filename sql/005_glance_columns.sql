-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 퀘스트에 필요 재료 칸을 추가하고, 몬스터에 1 경험치 당 HP 칸을 추가합니다.
-- 001부터 004는 다시 실행하지 않습니다.

alter table public.quests add column if not exists materials text;
comment on column public.quests.materials is '필요 재료';

alter table public.monsters add column if not exists hp_per_exp numeric;

do $$
begin
  alter table public.monsters
    add constraint monsters_hp_per_exp_check
    check (hp_per_exp is null or hp_per_exp >= 0);
exception
  when duplicate_object then null;
end $$;

comment on column public.monsters.hp_per_exp is '1 경험치 당 HP';
