import { translateDbError } from "./db-error.js";
import { escapeHtml } from "./format.js";

const BUCKET = "character-faces";
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function missingFaceColumn(error) {
  const raw = `${error?.message || ""} ${error?.details || ""}`;
  return /face_path/i.test(raw) && /could not find|schema cache|does not exist/i.test(raw);
}

export function validateFaceFile(file) {
  if (!file) return {};
  const type = imageType(file);
  if (!TYPES[type]) return { error: "png, jpg, webp, gif 이미지만 올릴 수 있습니다." };
  if (file.size > MAX_BYTES) return { error: "얼굴 사진은 2MB 이하여야 합니다." };
  if (file.size <= 0) return { error: "빈 파일은 올릴 수 없습니다." };
  return { type, ext: TYPES[type] };
}

export function faceMarkup(url) {
  if (!url) return "";
  return `<img class="char-face" src="${escapeHtml(url)}" alt="" />`;
}

export async function attachFaceUrls(supabase, rows) {
  const paths = [...new Set(rows.map((row) => row.face_path).filter(Boolean))];
  if (!paths.length) return;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 24);
  if (error || !data) return;
  const urls = new Map();
  for (const item of data) {
    const signed = item?.signedUrl || item?.signedURL;
    if (item?.path && signed) urls.set(item.path, signed);
  }
  for (const row of rows) {
    if (row.face_path) row.face_url = urls.get(row.face_path) || "";
  }
}

export async function saveCharacterFace(supabase, { characterId, file, previousPath, remove }) {
  if (!file && !remove) return { changed: false };
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return { error: { message: "로그인이 만료되었습니다. 다시 로그인해 주세요." } };

  if (!file) {
    if (!previousPath) return { changed: false, path: null };
    const { error } = await supabase.storage.from(BUCKET).remove([previousPath]);
    if (error) return { error };
    return { changed: true, path: null };
  }

  const check = validateFaceFile(file);
  if (check.error) return { error: { message: check.error } };
  const path = `${userId}/${characterId}.${check.ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: check.type,
    cacheControl: "3600",
  });
  if (error) return { error };
  if (previousPath && previousPath !== path) {
    await supabase.storage.from(BUCKET).remove([previousPath]);
  }
  return { changed: true, path };
}

export async function removeCharacterFace(supabase, path) {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

export function translateFaceError(error) {
  const raw = error?.message || "";
  if (/png, jpg|2MB|빈 파일|로그인이 만료/.test(raw)) return raw;
  if (/bucket not found/i.test(raw)) {
    return "얼굴 저장 공간이 없습니다. Supabase SQL Editor에서 sql/026_character_face.sql 을 실행해 주세요.";
  }
  if (/row-level security|unauthorized|permission|403/i.test(raw)) {
    return "얼굴 사진을 저장할 권한이 없습니다. Supabase SQL Editor에서 sql/026_character_face.sql 을 실행해 주세요.";
  }
  if (/mime|content type|invalid_mime/i.test(raw)) return "png, jpg, webp, gif 이미지만 올릴 수 있습니다.";
  if (/payload too large|exceeded the maximum|file size|entity too large/i.test(raw)) {
    return "얼굴 사진은 2MB 이하여야 합니다.";
  }
  const translated = translateDbError(error);
  if (translated.startsWith("저장하지 못했습니다")) {
    return "얼굴 사진을 저장하지 못했습니다. Supabase SQL Editor에서 sql/026_character_face.sql 을 실행했는지 확인해 주세요.";
  }
  return translated;
}

function imageType(file) {
  if (TYPES[file.type]) return file.type;
  const name = String(file.name || "").toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  return file.type || "";
}
