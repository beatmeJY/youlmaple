-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 퀘스트에 재료비 칸을 추가합니다.
-- 001부터 008은 다시 실행하지 않습니다.

alter table public.quests add column if not exists material_cost bigint;

do $$
begin
  alter table public.quests
    add constraint quests_material_cost_check
    check (material_cost is null or material_cost >= 0);
exception
  when duplicate_object then null;
end $$;

comment on column public.quests.material_cost is '재료비';
