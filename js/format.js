export function compareName(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "ko", { numeric: true });
}

export function sortByName(rows) {
  return [...rows].sort((left, right) => compareName(left.name, right.name));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatCount(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "bigint") return value.toLocaleString("ko-KR");
  return Number(value).toLocaleString("ko-KR");
}

export function readCount(value, label, minimum) {
  const text = value.trim().replaceAll(",", "").replaceAll(" ", "");
  if (!text) return { value: null };
  if (!/^\d+$/.test(text)) return { error: `${label}에는 숫자만 입력해 주세요.` };
  const amount = BigInt(text);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { error: `${label} 숫자가 너무 큽니다.` };
  }
  const number = Number(amount);
  if (number < minimum) return { error: `${label} 값은 ${minimum} 이상이어야 합니다.` };
  return { value: number };
}

export function readBig(value, label, minimum = 0n) {
  const text = String(value ?? "")
    .trim()
    .replaceAll(",", "")
    .replaceAll(" ", "");
  if (!text) return { value: null };
  if (!/^\d+$/.test(text)) return { error: `${label}에는 숫자만 입력해 주세요.` };
  if (text.length > 40) return { error: `${label} 숫자가 너무 큽니다.` };
  const amount = BigInt(text);
  if (amount < minimum) return { error: `${label} 값은 ${minimum.toString()} 이상이어야 합니다.` };
  return { value: amount };
}

export function readDecimal(value, label, minimum) {
  const text = value.trim().replaceAll(",", "").replaceAll(" ", "");
  if (!text) return { value: null };
  if (!/^\d+(\.\d+)?$/.test(text)) return { error: `${label}에는 0 이상의 숫자만 입력해 주세요.` };
  const number = Number(text);
  if (!Number.isFinite(number)) return { error: `${label} 숫자가 너무 큽니다.` };
  if (number < minimum) return { error: `${label} 값은 ${minimum} 이상이어야 합니다.` };
  return { value: number };
}
