-- 008 기준으로 바뀐 직업만 반영합니다.
-- ranger-bow 는 2차에 레인저를 넣은 잘못된 행입니다. 레인저는 3차이고, 2차 보우는 헌터입니다.
-- sniper-xbow 도 같습니다. 저격수는 3차이고, 2차 쇠뇌는 사수입니다.
-- 그 행에 붙어 있던 캐릭터와 사냥 기록은 3차 레인저, 저격수로 옮깁니다.
-- 섀도어는 예전 표시 이름 시도마스터(섀도어)입니다.

update public.characters
set job_id = 'ranger'
where job_id = 'ranger-bow';

update public.characters
set job_id = 'sniper'
where job_id = 'sniper-xbow';

update public.characters
set job_id = 'ranger'
where job_id is null
  and replace(replace(coalesce(job, ''), ' ', ''), '·', '') in (
    '레인저(보우마스터 계열)',
    '레인저(보우마스터계열)'
  );

update public.characters
set job_id = 'sniper'
where job_id is null
  and replace(replace(coalesce(job, ''), ' ', ''), '·', '') in (
    '저격수(신궁 계열)',
    '저격수(신궁계열)'
  );

update public.characters as c
set job = j.name
from public.jobs as j
where c.job_id = j.id
  and j.id in ('ranger', 'sniper')
  and c.job is distinct from j.name;

update public.hunts
set job = '레인저'
where replace(replace(coalesce(job, ''), ' ', ''), '·', '') in (
  '레인저(보우마스터 계열)',
  '레인저(보우마스터계열)'
);

update public.hunts
set job = '저격수'
where replace(replace(coalesce(job, ''), ' ', ''), '·', '') in (
  '저격수(신궁 계열)',
  '저격수(신궁계열)'
);

delete from public.jobs
where id in ('ranger-bow', 'sniper-xbow');

update public.jobs
set name = '섀도어'
where id = 'shadower';

update public.characters as c
set job_id = 'shadower'
where c.job_id is null
  and replace(replace(coalesce(c.job, ''), ' ', ''), '·', '') in (
    '섀도어',
    '시도마스터',
    '시도마스터(섀도어)'
  );

update public.characters as c
set job = j.name
from public.jobs as j
where c.job_id = j.id
  and j.id = 'shadower'
  and c.job is distinct from j.name;

update public.hunts
set job = '섀도어'
where replace(replace(coalesce(job, ''), ' ', ''), '·', '') in (
  '시도마스터',
  '시도마스터(섀도어)'
);
