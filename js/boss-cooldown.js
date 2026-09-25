export const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export const bosses = [
  {
    key: "pianus",
    label: "피아누스",
    columnAt: "pianus_at",
    columnEnabled: "pianus_enabled",
    cooldownMs: 7 * DAY_MS,
    soon: "day",
    hint: "오늘",
    wait: "7일",
  },
  {
    key: "papulatus",
    label: "파풀라투스",
    columnAt: "papulatus_at",
    columnEnabled: "papulatus_enabled",
    cooldownMs: DAY_MS,
    soon: "hour",
    hint: "곧",
    wait: "1일",
  },
  {
    key: "rift",
    label: "차원의 균열 조각",
    columnAt: "rift_at",
    columnEnabled: "rift_enabled",
    cooldownMs: DAY_MS,
    soon: "hour",
    hint: "곧",
    wait: "1일",
  },
];

export function formatStamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function bossTimeParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
}

export function readBossTime(parts) {
  const fields = [
    ["year", "년", "을"],
    ["month", "월", "을"],
    ["day", "일", "을"],
    ["hour", "시", "를"],
    ["minute", "분", "을"],
  ];
  const numbers = {};
  for (const [key, label, particle] of fields) {
    const text = String(parts?.[key] ?? "").trim();
    if (!text) return { error: `${label}${particle} 입력해 주세요.` };
    if (!/^\d+$/.test(text)) return { error: `${label}에는 숫자만 입력해 주세요.` };
    numbers[key] = Number(text);
  }
  const { year, month, day, hour, minute } = numbers;
  if (year < 2000 || year > 2100) return { error: "년도는 2000년부터 2100년까지 입력해 주세요." };
  if (month < 1 || month > 12) return { error: "월은 1부터 12까지 입력해 주세요." };
  if (hour > 23) return { error: "시는 0부터 23까지 입력해 주세요." };
  if (minute > 59) return { error: "분은 0부터 59까지 입력해 주세요." };
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return { error: "없는 날짜입니다." };
  }
  return { value: date.getTime() };
}

function sameLocalDay(left, right) {
  const a = new Date(left);
  const b = new Date(right);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toMillis(at) {
  if (at == null || at === "") return null;
  if (typeof at === "number") return Number.isNaN(at) ? null : at;
  if (typeof at === "string" && /^\d+$/.test(at)) {
    const parsed = Number(at);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const parsed = new Date(at).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatClock(value) {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatPossible(value) {
  const date = value instanceof Date ? value : new Date(value);
  const hour = date.getHours();
  const minute = date.getMinutes();
  if (!minute) return `${hour}시`;
  return `${hour}시 ${minute}분`;
}

export function formatRemain(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [];
  if (hours) parts.push(`${hours}시간`);
  if (hours || minutes) parts.push(`${minutes}분`);
  parts.push(`${seconds}초`);
  return parts.join(" ");
}

export function bossState(at, now, boss) {
  const last = toMillis(at);
  if (last == null) {
    return { ready: true, soon: false, hints: [], last: null, next: null };
  }
  const next = last + boss.cooldownMs;
  const ready = now >= next;
  const hints = ready ? [] : bossHints(boss, now, next);
  return { ready, soon: hints.length > 0, hints, last, next };
}

export function todaySlot(at, now, boss) {
  const state = bossState(at, now, boss);
  if (state.ready) return { include: true, ready: true, at: null };
  if (state.next != null && sameLocalDay(now, state.next)) {
    return { include: true, ready: false, at: state.next };
  }
  return { include: false, ready: false, at: null };
}

function bossHints(boss, now, next) {
  const hints = [];
  if (boss.soon === "day" && sameLocalDay(now, next)) hints.push(boss.hint);
  if (next - now <= HOUR_MS && boss.soon === "hour") hints.push(boss.hint);
  if (next - now <= HOUR_MS && boss.soon === "day") hints.push("곧");
  return hints;
}
