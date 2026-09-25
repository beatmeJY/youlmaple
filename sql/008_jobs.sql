-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 직업 표를 만들고, 캐릭터의 기존 직업 글을 그 표에 연결합니다.
-- 001부터 007은 다시 실행하지 않습니다.

create table if not exists public.jobs (
  id text primary key,
  family text not null,
  rank smallint,
  name text not null,
  color text not null,
  color_dark text not null,
  sort_order integer not null,
  constraint jobs_family_check check (family in ('전사', '마법사', '궁수', '도적', '해적')),
  constraint jobs_rank_check check (rank is null or rank between 1 and 4),
  constraint jobs_color_check check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint jobs_color_dark_check check (color_dark ~ '^#[0-9A-Fa-f]{6}$'),
  constraint jobs_name_unique unique (name)
);

comment on table public.jobs is '메이플 직업. 같은 계열은 같은 색입니다.';
comment on column public.jobs.family is '전사, 마법사, 궁수, 도적, 해적';
comment on column public.jobs.rank is '1차부터 4차. 시그너스처럼 차수가 없으면 비웁니다.';

alter table public.jobs alter column rank drop not null;
alter table public.jobs drop constraint if exists jobs_rank_check;
alter table public.jobs
  add constraint jobs_rank_check check (rank is null or rank between 1 and 4);
comment on column public.jobs.color is '라이트 모드 글자색';
comment on column public.jobs.color_dark is '다크 모드 글자색';

insert into public.jobs (id, family, rank, name, color, color_dark, sort_order)
values
  ('swordsman', '전사', 1, '검사', '#dc2626', '#f87171', 10),
  ('fighter', '전사', 2, '파이터', '#dc2626', '#f87171', 11),
  ('page', '전사', 2, '페이지', '#dc2626', '#f87171', 12),
  ('spearman', '전사', 2, '스피어맨', '#dc2626', '#f87171', 13),
  ('crusader', '전사', 3, '크루세이더', '#dc2626', '#f87171', 14),
  ('knight', '전사', 3, '나이트', '#dc2626', '#f87171', 15),
  ('dragon-knight', '전사', 3, '용기사', '#dc2626', '#f87171', 16),
  ('hero', '전사', 4, '히어로', '#dc2626', '#f87171', 17),
  ('paladin', '전사', 4, '팔라딘', '#dc2626', '#f87171', 18),
  ('dark-knight', '전사', 4, '다크나이트', '#dc2626', '#f87171', 19),
  ('magician', '마법사', 1, '매지션', '#0284c7', '#38bdf8', 20),
  ('wizard-fp', '마법사', 2, '위자드(불·독)', '#0284c7', '#38bdf8', 21),
  ('wizard-il', '마법사', 2, '위자드(썬·콜)', '#0284c7', '#38bdf8', 22),
  ('cleric', '마법사', 2, '클레릭', '#0284c7', '#38bdf8', 23),
  ('mage-fp', '마법사', 3, '메이지(불·독)', '#0284c7', '#38bdf8', 24),
  ('mage-il', '마법사', 3, '메이지(썬·콜)', '#0284c7', '#38bdf8', 25),
  ('priest', '마법사', 3, '프리스트', '#0284c7', '#38bdf8', 26),
  ('archmage-fp', '마법사', 4, '아크메이지(불·독)', '#0284c7', '#38bdf8', 27),
  ('archmage-il', '마법사', 4, '아크메이지(썬·콜)', '#0284c7', '#38bdf8', 28),
  ('bishop', '마법사', 4, '비숍', '#0284c7', '#38bdf8', 29),
  ('archer', '궁수', 1, '아처', '#15803d', '#4ade80', 30),
  ('hunter', '궁수', 2, '헌터', '#15803d', '#4ade80', 31),
  ('crossbowman', '궁수', 2, '사수', '#15803d', '#4ade80', 33),
  ('ranger', '궁수', 3, '레인저', '#15803d', '#4ade80', 35),
  ('sniper', '궁수', 3, '저격수', '#15803d', '#4ade80', 36),
  ('bowmaster', '궁수', 4, '보우마스터', '#15803d', '#4ade80', 37),
  ('marksman', '궁수', 4, '신궁', '#15803d', '#4ade80', 38),
  ('rogue', '도적', 1, '로그', '#7e22ce', '#d8b4fe', 40),
  ('assassin', '도적', 2, '어쌔신', '#7e22ce', '#d8b4fe', 41),
  ('bandit', '도적', 2, '시프', '#7e22ce', '#d8b4fe', 42),
  ('hermit', '도적', 3, '허밋', '#7e22ce', '#d8b4fe', 43),
  ('chief-bandit', '도적', 3, '시프마스터', '#7e22ce', '#d8b4fe', 44),
  ('night-lord', '도적', 4, '나이트로드', '#7e22ce', '#d8b4fe', 45),
  ('shadower', '도적', 4, '섀도어', '#7e22ce', '#d8b4fe', 46),
  ('pirate', '해적', 1, '해적', '#5c3317', '#c4a484', 50),
  ('infighter', '해적', 2, '인파이터', '#5c3317', '#c4a484', 51),
  ('gunslinger', '해적', 2, '건슬링거', '#5c3317', '#c4a484', 52),
  ('buccaneer', '해적', 3, '버커니어', '#5c3317', '#c4a484', 53),
  ('valkyrie', '해적', 3, '발키리', '#5c3317', '#c4a484', 54),
  ('viper', '해적', 4, '바이퍼', '#5c3317', '#c4a484', 55),
  ('captain', '해적', 4, '캡틴', '#5c3317', '#c4a484', 56),
  ('soul-master', '전사', null, '소울마스터', '#dc2626', '#f87171', 61),
  ('flame-wizard', '마법사', null, '플레임위자드', '#0284c7', '#38bdf8', 62),
  ('battle-mage', '마법사', null, '배틀메이지', '#0284c7', '#38bdf8', 63),
  ('wind-breaker', '궁수', null, '윈드브레이커', '#15803d', '#4ade80', 64),
  ('night-walker', '도적', null, '나이트워커', '#7e22ce', '#d8b4fe', 65),
  ('striker', '해적', null, '스트라이커', '#5c3317', '#c4a484', 66)
on conflict (id) do update
set family = excluded.family,
    rank = excluded.rank,
    name = excluded.name,
    color = excluded.color,
    color_dark = excluded.color_dark,
    sort_order = excluded.sort_order;

alter table public.characters add column if not exists job_id text;

do $$
begin
  alter table public.characters
    add constraint characters_job_id_fkey
    foreign key (job_id) references public.jobs (id) on delete restrict;
exception
  when duplicate_object then null;
end $$;

create index if not exists characters_job_idx on public.characters (job_id);

comment on column public.characters.job is '직업 이름. job_id가 있으면 직업 표의 이름과 같게 맞춥니다.';
comment on column public.characters.job_id is '직업 표. 비어 있으면 아직 목록에 없는 직업입니다.';

-- 띄어쓰기와 가운데점만 다르면 같은 직업으로 봅니다. 예: 보우 마스터 = 보우마스터
update public.characters as c
set job_id = j.id
from public.jobs as j
where c.job_id is null
  and c.job is not null
  and replace(replace(c.job, ' ', ''), '·', '') = replace(replace(j.name, ' ', ''), '·', '');

-- 짧은 별칭. 시도마스터와 섀도어는 4차입니다.
-- 해적 3차는 인파이터 다음 버커니어입니다. 버퍼서, 배틀로드는 예전 이름입니다.
update public.characters as c
set job_id = a.job_id
from (
  values
    ('시도마스터', 'shadower'),
    ('섀도어', 'shadower'),
    ('버커니어', 'buccaneer'),
    ('버퍼서', 'buccaneer'),
    ('배틀로드', 'buccaneer'),
    ('버퍼서(배틀로드)', 'buccaneer')
) as a(alias, job_id)
where c.job_id is null
  and replace(replace(coalesce(c.job, ''), ' ', ''), '·', '') = a.alias;

-- 불독, 썬콜은 차수가 빠져 있습니다. 2차는 30, 3차는 70, 4차는 120 기준으로 나눕니다.
update public.characters
set job_id = case
  when coalesce(level, 0) < 70 then 'wizard-fp'
  when level < 120 then 'mage-fp'
  else 'archmage-fp'
end
where job_id is null
  and replace(replace(coalesce(job, ''), ' ', ''), '·', '') = '불독';

update public.characters
set job_id = case
  when coalesce(level, 0) < 70 then 'wizard-il'
  when level < 120 then 'mage-il'
  else 'archmage-il'
end
where job_id is null
  and replace(replace(coalesce(job, ''), ' ', ''), '·', '') = '썬콜';

-- 1차 전 이름. 30 미만만 1차로 봅니다. 그보다 높으면 어느 갈림인지 알 수 없어 비워 둡니다.
update public.characters
set job_id = 'magician'
where job_id is null
  and replace(coalesce(job, ''), ' ', '') = '마법사'
  and coalesce(level, 0) < 30;

update public.characters
set job_id = 'archer'
where job_id is null
  and replace(coalesce(job, ''), ' ', '') = '궁수'
  and coalesce(level, 0) < 30;

update public.characters as c
set job = j.name
from public.jobs as j
where c.job_id = j.id
  and c.job is distinct from j.name;

alter table public.jobs enable row level security;
revoke all on table public.jobs from anon, authenticated;
grant select on table public.jobs to authenticated;
grant all on table public.jobs to service_role;

drop policy if exists jobs_select_authenticated on public.jobs;
create policy jobs_select_authenticated
on public.jobs for select to authenticated
using (true);
