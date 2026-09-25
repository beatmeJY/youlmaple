import { readCount, readDecimal } from "./format.js";

function splitRow(line) {
  return line.split("\t").map((cell) => cell.trim());
}

function normalizeDrop(value) {
  const text = value.trim();
  if (!text || /^x$/i.test(text) || text === "-" || text === "없음") return null;
  return text;
}

export function parseMonsterPaste(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { error: "붙여 넣은 내용이 없습니다." };

  let start = 0;
  const first = splitRow(lines[0]);
  if (/몹\s*이름|몬스터명|^이름$/.test(first[0] || "")) start = 1;
  if (start >= lines.length) return { error: "제목 줄만 있고 몬스터가 없습니다." };

  const rows = [];
  const errors = [];
  for (let index = start; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const cells = splitRow(lines[index]);
    if (!lines[index].includes("\t") || cells.length < 7) {
      errors.push(`${lineNo}번째 줄의 열이 부족합니다. 엑셀에서 칸을 통째로 복사해 주세요.`);
      continue;
    }
    const [name, levelText, hpText, expText, accuracyText, perExpText, dropText] = cells;
    if (!name) {
      errors.push(`${lineNo}번째 줄에 몹 이름이 없습니다.`);
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
    const perExp = readDecimal(perExpText, `${lineNo}번째 줄 1경험치당 HP`, 0);
    if (perExp.error) {
      errors.push(perExp.error);
      continue;
    }
    rows.push({
      name,
      level: level.value,
      hp: hp.value,
      exp: exp.value,
      required_accuracy: accuracy.value,
      hp_per_exp: perExp.value,
      drop_items: normalizeDrop(dropText),
    });
  }

  if (errors.length) return { error: errors.slice(0, 4).join(" ") };
  if (!rows.length) return { error: "등록할 몬스터가 없습니다." };
  return { rows };
}
