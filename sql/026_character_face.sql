-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 캐릭터 얼굴 사진을 저장할 칸과, 본인만 읽고 쓸 수 있는 저장 공간을 만듭니다.
-- 이미 이 파일을 실행했다면 같은 파일을 다시 실행해도 됩니다.

alter table public.characters
  add column if not exists face_path text;

comment on column public.characters.face_path is '얼굴 사진 경로. character-faces 버킷 안의 user_id/캐릭터id.확장자. 비어 있으면 얼굴이 없습니다.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'character-faces',
  'character-faces',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists character_faces_select_own on storage.objects;
create policy character_faces_select_own
on storage.objects for select to authenticated
using (
  bucket_id = 'character-faces'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists character_faces_insert_own on storage.objects;
create policy character_faces_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'character-faces'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists character_faces_update_own on storage.objects;
create policy character_faces_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'character-faces'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'character-faces'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists character_faces_delete_own on storage.objects;
create policy character_faces_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'character-faces'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
