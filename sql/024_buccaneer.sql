-- 해적 3차 인파이터 갈래는 버커니어입니다.
-- 버퍼서, 배틀로드는 예전 이름입니다.
-- 건슬링거 갈래는 발키리, 4차는 바이퍼와 캡틴입니다.

update public.jobs
set name = '버커니어'
where id = 'buccaneer';

update public.characters as c
set job_id = 'buccaneer'
where c.job_id is null
  and replace(replace(coalesce(c.job, ''), ' ', ''), '·', '') in (
    '버커니어',
    '버퍼서',
    '배틀로드',
    '버퍼서(배틀로드)'
  );

update public.characters as c
set job = j.name
from public.jobs as j
where c.job_id = j.id
  and j.id = 'buccaneer'
  and c.job is distinct from j.name;

update public.hunts
set job = '버커니어'
where replace(replace(coalesce(job, ''), ' ', ''), '·', '') in (
  '버퍼서',
  '배틀로드',
  '버퍼서(배틀로드)'
);
