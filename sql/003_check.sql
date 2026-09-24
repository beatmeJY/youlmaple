-- 권한 점검용입니다. 데이터를 바꾸지 않습니다.
-- 001, 002를 실행한 뒤, 이미 실행했다면 004를 실행한 다음 이 파일로 확인합니다.

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'profiles',
    'accounts',
    'characters',
    'monsters',
    'items',
    'quests',
    'quest_notes',
    'character_quests',
    'notes'
  )
order by c.relname;

select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in (
    'profiles',
    'accounts',
    'characters',
    'monsters',
    'items',
    'quests',
    'quest_notes',
    'character_quests',
    'notes'
  )
order by table_name, grantee, privilege_type;
