const schemePattern = /^[a-z][a-z0-9+.-]*:/i;

export function normalizeLinkUrl(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { error: "주소 항목을 입력해 주세요." };
  if (/\s/.test(text)) return { error: "주소에는 공백을 넣을 수 없습니다." };
  const withScheme = schemePattern.test(text) ? text : `https://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return { error: "주소 형식을 확인해 주세요." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "http 또는 https 주소만 저장할 수 있습니다." };
  }
  if (!url.hostname || !url.hostname.includes(".")) {
    return { error: "주소 형식을 확인해 주세요." };
  }
  return { value: url.href };
}

export function linkHost(pageUrl) {
  try {
    return new URL(String(pageUrl ?? "")).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

export function faviconSrc(pageUrl) {
  let url;
  try {
    url = new URL(String(pageUrl ?? ""));
  } catch {
    return "";
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) return "";
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=64`;
}
