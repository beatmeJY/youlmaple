import { escapeHtml, formatCount } from "../format.js";
import { parseMonsterPaste } from "../monster-paste.js";
import { translateDbError } from "../db-error.js";
import { renderRecords } from "../record-page.js";
import { getSupabase } from "../supabase-client.js";

const columns =
  "id, name, level, hp, exp, required_accuracy, hp_per_exp, drop_items, accuracy_per_level, updated_at";

function num(value) {
  return escapeHtml(formatCount(value));
}

export function render(root) {
  let pending = [];

  return renderRecords(root, {
    title: "몬스터",
    description: "레벨, 체력, 경험치, 명중률, 드랍을 한 표에서 봅니다.",
    addLabel: "몬스터 추가",
    table: "monsters",
    columns,
    order: "level",
    ascending: true,
    emptyText: "등록한 몬스터가 없습니다. 직접 추가하거나 엑셀에서 붙여 넣을 수 있습니다.",
    searchLabel: "몬스터 검색",
    searchPlaceholder: "이름 또는 드랍템으로 찾기",
    searchFields: ["name", "drop_items"],
    levelMode: "point",
    levelField: "level",
    deleteMessage: (row) => `${row.name} 몬스터를 삭제할까요? 삭제한 내용은 되돌릴 수 없습니다.`,
    extraHtml: `
      <section class="paste-panel">
        <h2>엑셀에서 한 번에 넣기</h2>
        <p class="hint">엑셀에서 몹 이름, 레벨, HP, 경험치, 명중률, 1경험치당 HP, 드랍템 열을 복사해 붙여 넣습니다. 드랍이 없으면 X 입니다.</p>
        <textarea data-paste placeholder="엑셀에서 복사한 표를 여기에 붙여 넣기"></textarea>
        <div class="button-row">
          <button class="secondary-button" type="button" data-preview-paste>미리보기</button>
          <button class="primary-button" type="button" data-import-paste hidden>이 목록 등록</button>
        </div>
        <div data-paste-preview></div>
      </section>
    `,
    fields: [
      { name: "name", label: "몬스터명", kind: "text", required: true },
      { name: "level", label: "몬스터 레벨", kind: "number", minimum: 1 },
      { name: "hp", label: "체력", kind: "number", minimum: 0 },
      { name: "exp", label: "경험치", kind: "number", minimum: 0 },
      { name: "required_accuracy", label: "필요 명중률", kind: "decimal", minimum: 0 },
      { name: "hp_per_exp", label: "1경험치당 HP", kind: "decimal", minimum: 0 },
      { name: "drop_items", label: "드랍템 종류", kind: "text" },
      { name: "accuracy_per_level", label: "1레벨당 추가 필요 명중률", kind: "decimal", minimum: 0 },
    ],
    sheet: [
      { label: "몹 이름", className: "stick", cell: (row) => escapeHtml(row.name) },
      { label: "레벨", className: "num", cell: (row) => num(row.level) },
      { label: "HP", className: "num", cell: (row) => num(row.hp) },
      { label: "경험치", className: "num", cell: (row) => num(row.exp) },
      { label: "명중률", className: "num", cell: (row) => num(row.required_accuracy) },
      { label: "1경험치당 HP", className: "num", cell: (row) => num(row.hp_per_exp) },
      { label: "드랍템", className: "cell-wrap", cell: (row) => escapeHtml(row.drop_items || "-") },
    ],
    bind({ root: page, reload, showStatus }) {
      const preview = page.querySelector("[data-paste-preview]");
      const importButton = page.querySelector("[data-import-paste]");
      const paste = page.querySelector("[data-paste]");

      function clearPending() {
        pending = [];
        importButton.hidden = true;
      }

      paste.addEventListener("input", () => {
        clearPending();
        preview.innerHTML = "";
      });

      page.querySelector("[data-preview-paste]").addEventListener("click", () => {
        const parsed = parseMonsterPaste(paste.value);
        if (parsed.error) {
          clearPending();
          preview.innerHTML = "";
          showStatus(parsed.error, "error");
          return;
        }
        pending = parsed.rows;
        importButton.hidden = false;
        preview.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>몹 이름</th><th class="num">레벨</th><th class="num">HP</th><th class="num">경험치</th><th class="num">명중률</th><th class="num">1경험치당 HP</th><th>드랍템</th></tr></thead><tbody>${parsed.rows
          .map(
            (row) => `<tr><td>${escapeHtml(row.name)}</td><td class="num">${num(row.level)}</td><td class="num">${num(row.hp)}</td><td class="num">${num(row.exp)}</td><td class="num">${num(row.required_accuracy)}</td><td class="num">${num(row.hp_per_exp)}</td><td>${escapeHtml(row.drop_items || "-")}</td></tr>`,
          )
          .join("")}</tbody></table></div>`;
        showStatus(`${parsed.rows.length}마리를 확인했습니다. 맞으면 이 목록 등록을 누르세요.`, "info");
      });

      importButton.addEventListener("click", async () => {
        if (!pending.length) return;
        importButton.disabled = true;
        showStatus("등록하는 중입니다.", "info");
        const supabase = await getSupabase();
        const { error } = await supabase.from("monsters").insert(pending);
        importButton.disabled = false;
        if (error) {
          showStatus(translateDbError(error), "error");
          return;
        }
        const count = pending.length;
        paste.value = "";
        preview.innerHTML = "";
        clearPending();
        showStatus(`${count}마리를 등록했습니다.`, "info");
        await reload();
      });
    },
  });
}
