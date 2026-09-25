export const elements = ["불", "냉기", "전기", "독", "성"];

const aliases = {
  불: "불",
  화염: "불",
  냉기: "냉기",
  얼음: "냉기",
  전기: "전기",
  번개: "전기",
  썬: "전기",
  독: "독",
  성: "성",
  홀리: "성",
};

const scalars = ["level", "hp", "exp", "required_accuracy", "accuracy_per_level"];

export function normalizeMonsterName(value) {
  return String(value ?? "").replace(/[\s\u00A0\u200B\u200C\u200D\u3000]/g, "");
}

export function isBlank(value) {
  return value == null || value === "";
}

export function hpPerExp(hp, exp) {
  if (isBlank(hp) || isBlank(exp)) return null;
  const health = Number(hp);
  const experience = Number(exp);
  if (!Number.isFinite(health) || !Number.isFinite(experience) || experience <= 0) return null;
  return Math.round((health / experience) * 10000) / 10000;
}

export function formatElements(names) {
  const picked = new Set(names);
  const ordered = elements.filter((name) => picked.has(name));
  return ordered.length ? ordered.join(", ") : null;
}

export function readElementTokens(value) {
  const tokens = String(value ?? "")
    .split(/[\s,，、/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const names = [];
  const unknown = [];
  for (const token of tokens) {
    const mapped = aliases[token];
    if (!mapped) unknown.push(token);
    else if (!names.includes(mapped)) names.push(mapped);
  }
  return { names, unknown };
}

export function unionText(left, right) {
  const items = [];
  const seen = new Set();
  for (const part of [left, right]) {
    for (const item of String(part ?? "").split(/[,，、\n]/)) {
      const text = item.trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      items.push(text);
    }
  }
  return items.length ? items.join(", ") : null;
}

export function unionElements(target, source) {
  const weak = new Set(readElementTokens(target?.weak_elements).names);
  const resist = new Set(readElementTokens(target?.resist_elements).names);
  for (const name of readElementTokens(source?.weak_elements).names) {
    if (!resist.has(name)) weak.add(name);
  }
  for (const name of readElementTokens(source?.resist_elements).names) {
    if (!weak.has(name)) resist.add(name);
  }
  return {
    weak_elements: formatElements(weak),
    resist_elements: formatElements(resist),
  };
}

export function absorbMonster(target, source) {
  const next = { ...target };
  for (const field of scalars) {
    if (!Object.hasOwn(source, field)) continue;
    if (isBlank(next[field]) && !isBlank(source[field])) next[field] = source[field];
  }
  if (Object.hasOwn(source, "drop_items")) next.drop_items = unionText(next.drop_items, source.drop_items);
  if (Object.hasOwn(source, "weak_elements") || Object.hasOwn(source, "resist_elements")) {
    const merged = unionElements(next, source);
    next.weak_elements = merged.weak_elements;
    next.resist_elements = merged.resist_elements;
  }
  next.name = normalizeMonsterName(next.name || source.name);
  next.hp_per_exp = hpPerExp(next.hp, next.exp);
  return next;
}

export function monsterFields(row) {
  return {
    name: normalizeMonsterName(row.name),
    level: isBlank(row.level) ? null : row.level,
    hp: isBlank(row.hp) ? null : row.hp,
    exp: isBlank(row.exp) ? null : row.exp,
    required_accuracy: isBlank(row.required_accuracy) ? null : row.required_accuracy,
    accuracy_per_level: isBlank(row.accuracy_per_level) ? null : row.accuracy_per_level,
    hp_per_exp: hpPerExp(row.hp, row.exp),
    drop_items: row.drop_items || null,
    weak_elements: formatElements(readElementTokens(row.weak_elements).names),
    resist_elements: formatElements(readElementTokens(row.resist_elements).names),
  };
}

function sameValue(left, right) {
  if (isBlank(left) && isBlank(right)) return true;
  const leftText = String(left);
  const rightText = String(right);
  if (/^-?\d+(\.\d+)?$/.test(leftText) && /^-?\d+(\.\d+)?$/.test(rightText)) return Number(left) === Number(right);
  return leftText === rightText;
}

export function storedFieldsDiffer(current, next) {
  const fields = monsterFields(next);
  return Object.keys(fields).some((key) => !sameValue(current[key], fields[key]));
}
