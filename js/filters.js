export function parseBound(value) {
  const text = value.trim();
  if (!text) return { value: null };
  if (!/^\d+$/.test(text)) return { error: "레벨에는 숫자만 입력해 주세요." };
  return { value: Number(text) };
}

export function readLevelFilter(minValue, maxValue) {
  const min = parseBound(minValue);
  if (min.error) return min;
  const max = parseBound(maxValue);
  if (max.error) return max;
  if (min.value != null && max.value != null && min.value > max.value) {
    return { error: "레벨 최소가 최대보다 클 수 없습니다." };
  }
  return { min: min.value, max: max.value };
}

export function matchesText(row, query, fields) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => String(row[field] ?? "").toLowerCase().includes(needle));
}

export function matchesPointLevel(level, min, max) {
  if (min == null && max == null) return true;
  if (level == null) return false;
  if (min != null && level < min) return false;
  if (max != null && level > max) return false;
  return true;
}

export function matchesSpanLevel(levelMin, levelMax, filterMin, filterMax) {
  if (filterMin == null && filterMax == null) return true;
  const start = levelMin ?? levelMax;
  const end = levelMax ?? levelMin;
  if (start == null || end == null) return false;
  if (filterMin != null && end < filterMin) return false;
  if (filterMax != null && start > filterMax) return false;
  return true;
}

export function filterRows(rows, { query, fields, levelMode, levelField, levelMinField, levelMaxField, filter }) {
  if (filter?.error) return { error: filter.error, rows: [] };
  const min = filter?.min ?? null;
  const max = filter?.max ?? null;
  return {
    rows: rows.filter((row) => {
      if (!matchesText(row, query, fields)) return false;
      if (levelMode === "point") return matchesPointLevel(row[levelField], min, max);
      if (levelMode === "span") return matchesSpanLevel(row[levelMinField], row[levelMaxField], min, max);
      return true;
    }),
  };
}
