import { ConfigError, getSupabase } from "./supabase-client.js";

const knownErrors = [
  ["Invalid login credentials", "이메일 또는 비밀번호가 맞지 않습니다."],
  ["Email not confirmed", "이메일 인증이 끝나지 않았습니다. 메일함의 링크를 누른 뒤 다시 로그인하세요."],
  ["User already registered", "이미 가입된 이메일입니다. 로그인을 선택해 주세요."],
  ["Password should be at least", "비밀번호가 너무 짧습니다. 6자 이상으로 다시 입력하세요."],
  ["Unable to validate email", "이메일 형식을 확인해 주세요."],
  ["Signup requires a valid password", "비밀번호를 입력해 주세요."],
  ["email rate limit exceeded", "인증 메일을 너무 많이 요청했습니다. 잠시 후 다시 시도하세요."],
  ["For security purposes", "요청이 너무 빠릅니다. 잠시 후 다시 시도하세요."],
];

export function translateAuthError(error) {
  const raw = error?.message || "로그인 처리 중 문제가 생겼습니다.";
  if (error instanceof ConfigError) return raw;
  if (/failed to fetch|network/i.test(raw)) {
    return "Supabase에 연결하지 못했습니다. 인터넷 연결과 js/config.js 의 주소를 확인해 주세요.";
  }
  const found = knownErrors.find(([needle]) => raw.toLowerCase().includes(needle.toLowerCase()));
  return found ? found[1] : raw;
}

export async function startAuth(onSession) {
  try {
    const supabase = await getSupabase();
    supabase.auth.onAuthStateChange((event, session) => {
      onSession(session, event);
    });
  } catch (error) {
    onSession(null, "CONFIG_ERROR", error);
  }
}

export async function signIn(email, password) {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error ? translateAuthError(error) : "" };
}

export async function signUp(email, password) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: translateAuthError(error), needsEmailConfirm: false };
  return { error: "", needsEmailConfirm: !data.session };
}

export async function signOut() {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw new Error(translateAuthError(error));
}
