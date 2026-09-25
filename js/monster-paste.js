import { readCount, readDecimal } from "./format.js";
import { formatElements, normalizeMonsterName, readElementTokens } from "./monster-merge.js";

function cleanCell(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u00A0\u200B\u200C\u200D\u3000]/g, " ")
    .trim();
}

function labelOf(value) {
  return cleanCell(value).replace(/\s/g, "");
}

function parseTsv(text) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  const table = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"' && cell === "") {
      quoted = true;
      continue;
    }
    if (char === "\t") {
      row.push(cleanCell(cell));
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cleanCell(cell));
      cell = "";
      if (row.some((item) => item)) table.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  if (cell || row.length) {
    row.push(cleanCell(cell));
    if (row.some((item) => item)) table.push(row);
  }
  return table;
}

function findColumn(cells, pattern) {
  return cells.findIndex((cell) => pattern.test(labelOf(cell)));
}

function findAccuracyColumns(header) {
  const name = findColumn(header, /^(몬스터명|몹이름|몬스터|이름)$/);
  const level = findColumn(header, /^레벨$/);
  const accuracy = findColumn(header, /필요명중/);
  const penalty = findColumn(header, /패널티|추가명중/);
  if (name < 0 || level < 0 || accuracy < 0 || penalty < 0) return null;
  return { name, level, accuracy, penalty };
}

function findStatsColumns(header) {
  const name = findColumn(header, /^(몬스터명|몹이름|몬스터|이름)$/);
  const level = findColumn(header, /^레벨$/);
  const hp = findColumn(header, /^(hp|체력)$/i);
  const exp = findColumn(header, /^(exp|경험치)$/i);
  if (name < 0 || level < 0 || hp < 0 || exp < 0) return null;
  const headerText = header.map(labelOf).join(" ");
  if (/명중|드랍|회피|패널티|경험치당|속성/.test(headerText)) return null;
  return { name, level, hp, exp };
}

function findElementColumns(header) {
  const name = findColumn(header, /^(몬스터명|몹이름|몬스터|이름)$/);
  const weak = findColumn(header, /속성약점|^약점$/);
  const resist = findColumn(header, /속성반감|^반감$/);
  if (name < 0 || weak < 0 || resist < 0) return null;
  return { name, weak, resist };
}

function looksLikeStatsRow(cells) {
  return cells.length === 4 && /^\d+$/.test(cells[0].replaceAll(",", "")) && cells[1] && !/^(hp|체력|exp|경험치)$/i.test(cells[1]);
}

function normalizeDrop(value) {
  const text = cleanCell(value);
  if (!text || /^x$/i.test(text) || text === "-" || text === "없음") return null;
  return text;
}

function accuracyMode(header, sample) {
  const headerText = header.join(" ");
  if (/회피|패널티/.test(headerText)) return "accuracy";
  if (/HP|경험치|드랍/.test(headerText)) return "full";
  if (sample.length >= 7) return "full";
  if (sample.length >= 5) return "accuracy";
  return "";
}

function monsterName(value, lineNo) {
  const name = normalizeMonsterName(value);
  if (!name) return { error: `${lineNo}번째 줄에 이름이 없습니다.` };
  return { value: name };
}

function wideEnough(cells, lastCol) {
  return cells.length > lastCol;
}

function parseAccuracyRows(table, start, columns) {
  const rows = [];
  const errors = [];
  const lastCol = Math.max(columns.name, columns.level, columns.accuracy, columns.penalty);
  for (let index = start; index < table.length; index += 1) {
    const lineNo = index + 1;
    const cells = table[index];
    const nameText = cells[columns.name] || "";
    const levelText = cells[columns.level] || "";
    const accuracyText = cells[columns.accuracy] || "";
    const penaltyText = cells[columns.penalty] || "";
    if (!nameText && !levelText && !accuracyText && !penaltyText) continue;
    if (!wideEnough(cells, lastCol)) {
      errors.push(`${lineNo}번째 줄의 열이 부족합니다. 몬스터명, 레벨, 회피율, 필요명중률, 1레벨 당 패널티 칸을 통째로 복사해 주세요.`);
      continue;
    }
    const name = monsterName(nameText, lineNo);
    if (name.error) {
      errors.push(name.error);
      continue;
    }
    const level = readCount(levelText, `${lineNo}번째 줄 레벨`, 1);
    if (level.error) {
      errors.push(level.error);
      continue;
    }
    const accuracy = readDecimal(accuracyText, `${lineNo}번째 줄 필요 명중률`, 0);
    if (accuracy.error) {
      errors.push(accuracy.error);
      continue;
    }
    const penalty = readDecimal(penaltyText, `${lineNo}번째 줄 1레벨당 패널티`, 0);
    if (penalty.error) {
      errors.push(penalty.error);
      continue;
    }
    rows.push({
      name: name.value,
      level: level.value,
      required_accuracy: accuracy.value,
      accuracy_per_level: penalty.value,
    });
  }
  return { rows, errors };
}

function parseStatsRows(table, start, columns) {
  const rows = [];
  const errors = [];
  const lastCol = Math.max(columns.name, columns.level, columns.hp, columns.exp);
  for (let index = start; index < table.length; index += 1) {
    const lineNo = index + 1;
    const cells = table[index];
    const nameText = cells[columns.name] || "";
    const levelText = cells[columns.level] || "";
    const hpText = cells[columns.hp] || "";
    const expText = cells[columns.exp] || "";
    if (!nameText && !levelText && !hpText && !expText) continue;
    if (!wideEnough(cells, lastCol)) {
      errors.push(`${lineNo}번째 줄의 열이 부족합니다. 레벨, 이름, HP, EXP 칸을 통째로 복사해 주세요.`);
      continue;
    }
    const name = monsterName(nameText, lineNo);
    if (name.error) {
      errors.push(name.error);
      continue;
    }
    const level = readCount(levelText, `${lineNo}번째 줄 레벨`, 1);
    if (level.error) {
      errors.push(level.error);
      continue;
    }
    const hp = readCount(hpText, `${lineNo}번째 줄 HP`, 0);
    if (hp.error) {
      errors.push(hp.error);
      continue;
    }
    const exp = readCount(expText, `${lineNo}번째 줄 경험치`, 0);
    if (exp.error) {
      errors.push(exp.error);
      continue;
    }
    rows.push({
      name: name.value,
      level: level.value,
      hp: hp.value,
      exp: exp.value,
    });
  }
  return { rows, errors };
}

function parseElementCell(value, lineNo, label) {
  const text = cleanCell(value);
  if (!text || text === "-" || text === "없음") return { value: null };
  const parsed = readElementTokens(text);
  if (parsed.unknown.length) {
    return {
      error: `${lineNo}번째 줄 ${label}에 알 수 없는 속성입니다: ${parsed.unknown.join(", ")}. 불, 냉기, 전기, 독, 성만 넣을 수 있습니다. 얼음은 냉기로 넣습니다.`,
    };
  }
  return { value: formatElements(parsed.names) };
}

function parseElementRows(table, start, columns) {
  const rows = [];
  const errors = [];
  const lastCol = Math.max(columns.name, columns.weak, columns.resist);
  for (let index = start; index < table.length; index += 1) {
    const lineNo = index + 1;
    const cells = table[index];
    const nameText = cells[columns.name] || "";
    const weakText = cells[columns.weak] || "";
    const resistText = cells[columns.resist] || "";
    if (!nameText && !weakText && !resistText) continue;
    if (cells.length === 1 && lastCol > 0) {
      errors.push(`${lineNo}번째 줄의 열이 부족합니다. 몬스터, 속성 약점, 속성 반감 칸을 통째로 복사해 주세요.`);
      continue;
    }
    const name = monsterName(nameText, lineNo);
    if (name.error) {
      errors.push(name.error);
      continue;
    }
    const weak = parseElementCell(weakText, lineNo, "속성 약점");
    if (weak.error) {
      errors.push(weak.error);
      continue;
    }
    const resist = parseElementCell(resistText, lineNo, "속성 반감");
    if (resist.error) {
      errors.push(resist.error);
      continue;
    }
    const weakNames = new Set(readElementTokens(weak.value).names);
    const resistNames = readElementTokens(resist.value).names.filter((item) => !weakNames.has(item));
    rows.push({
      name: name.value,
      weak_elements: formatElements(weakNames),
      resist_elements: formatElements(resistNames),
    });
  }
  return { rows, errors };
}

export function parseMonsterPaste(text) {
  const table = parseTsv(text);
  if (!table.length) return { error: "붙여 넣은 내용이 없습니다." };

  let start = 0;
  const header = table[0];
  const accuracyColumns = findAccuracyColumns(header);
  const statsColumns = findStatsColumns(header);
  const elementColumns = findElementColumns(header);
  const headerlessStats = !statsColumns && !accuracyColumns && !elementColumns && looksLikeStatsRow(header);
  const headerIsName =
    /^(몬스터명|몹이름|몬스터|이름)$/.test(labelOf(header[0] || "")) || accuracyColumns || statsColumns || elementColumns;
  if (headerIsName) start = 1;
  if (start >= table.length) return { error: "제목 줄만 있고 몬스터가 없습니다." };
  const mode = elementColumns
    ? "elements"
    : statsColumns || headerlessStats
      ? "stats"
      : accuracyColumns
        ? "accuracy"
        : accuracyMode(header, table[start]);
  if (!mode) return { error: "열 순서를 알 수 없습니다. 제목 줄과 칸을 통째로 복사해 주세요." };
  if (mode === "elements") {
    const parsed = parseElementRows(table, start, elementColumns);
    if (parsed.errors.length) return { error: parsed.errors.slice(0, 4).join(" ") };
    if (!parsed.rows.length) return { error: "등록할 몬스터가 없습니다." };
    return { mode, rows: parsed.rows };
  }
  if (mode === "stats") {
    const columns = statsColumns || { level: 0, name: 1, hp: 2, exp: 3 };
    const parsed = parseStatsRows(table, start, columns);
    if (parsed.errors.length) return { error: parsed.errors.slice(0, 4).join(" ") };
    if (!parsed.rows.length) return { error: "등록할 몬스터가 없습니다." };
    return { mode, rows: parsed.rows };
  }
  if (mode === "accuracy") {
    const columns = accuracyColumns || { name: 0, level: 1, accuracy: 3, penalty: 4 };
    const parsed = parseAccuracyRows(table, start, columns);
    if (parsed.errors.length) return { error: parsed.errors.slice(0, 4).join(" ") };
    if (!parsed.rows.length) return { error: "등록할 몬스터가 없습니다." };
    return { mode, rows: parsed.rows };
  }

  const rows = [];
  const errors = [];
  for (let index = start; index < table.length; index += 1) {
    const lineNo = index + 1;
    const cells = table[index];
    if (cells.length < 7) {
      errors.push(`${lineNo}번째 줄의 열이 부족합니다. 엑셀에서 칸을 통째로 복사해 주세요.`);
      continue;
    }
    const [nameText, levelText, hpText, expText, accuracyText, , dropText] = cells;
    const name = monsterName(nameText, lineNo);
    if (name.error) {
      errors.push(name.error);
      continue;
    }
    const level = readCount(levelText, `${lineNo}번째 줄 레벨`, 1);
    if (level.error) {
      errors.push(level.error);
      continue;
    }
    const hp = readCount(hpText, `${lineNo}번째 줄 HP`, 0);
    if (hp.error) {
      errors.push(hp.error);
      continue;
    }
    const exp = readCount(expText, `${lineNo}번째 줄 경험치`, 0);
    if (exp.error) {
      errors.push(exp.error);
      continue;
    }
    const accuracy = readDecimal(accuracyText, `${lineNo}번째 줄 명중률`, 0);
    if (accuracy.error) {
      errors.push(accuracy.error);
      continue;
    }
    rows.push({
      name: name.value,
      level: level.value,
      hp: hp.value,
      exp: exp.value,
      required_accuracy: accuracy.value,
      drop_items: normalizeDrop(dropText),
    });
  }

  if (errors.length) return { error: errors.slice(0, 4).join(" ") };
  if (!rows.length) return { error: "등록할 몬스터가 없습니다." };
  return { mode: "full", rows };
}
