import { escapeHtml, formatCount } from "../format.js";
import { renderRecords } from "../record-page.js";

const columns =
  "id, name, level, drop_items, required_accuracy, accuracy_per_level, hp, exp, updated_at";

export function render(root) {
  return renderRecords(root, {
    title: "몬스터",
    description: "몬스터 레벨, 드랍템, 필요 명중률, 체력, 경험치를 기록합니다.",
    addLabel: "몬스터 추가",
    table: "monsters",
    columns,
    order: "updated_at",
    emptyText: "등록한 몬스터가 없습니다. 위의 몬스터 추가로 첫 몬스터를 저장해 보세요.",
    searchLabel: "몬스터 검색",
    searchPlaceholder: "이름 또는 드랍템으로 찾기",
    searchFields: ["name", "drop_items"],
    levelMode: "point",
    levelField: "level",
    deleteMessage: (row) => `${row.name} 몬스터를 삭제할까요? 삭제한 내용은 되돌릴 수 없습니다.`,
    fields: [
      { name: "name", label: "몬스터명", kind: "text", required: true },
      { name: "level", label: "몬스터 레벨", kind: "number", minimum: 1 },
      { name: "drop_items", label: "드랍템 종류", kind: "text" },
      { name: "required_accuracy", label: "필요 명중률", kind: "decimal", minimum: 0 },
      { name: "accuracy_per_level", label: "1레벨당 추가 필요 명중률", kind: "decimal", minimum: 0 },
      { name: "hp", label: "체력", kind: "number", minimum: 0 },
      { name: "exp", label: "경험치", kind: "number", minimum: 0 },
    ],
    card(row) {
      return `
        <article class="card">
          <h2>${escapeHtml(row.name)}</h2>
          <ul class="stat-list">
            <li>레벨 ${escapeHtml(formatCount(row.level))}</li>
            <li>드랍 ${escapeHtml(row.drop_items || "-")}</li>
            <li>명중률 ${escapeHtml(formatCount(row.required_accuracy))}</li>
            <li>레벨당 ${escapeHtml(formatCount(row.accuracy_per_level))}</li>
            <li>체력 ${escapeHtml(formatCount(row.hp))}</li>
            <li>경험치 ${escapeHtml(formatCount(row.exp))}</li>
          </ul>
          <div class="button-row">
            <button class="secondary-button" type="button" data-edit="${row.id}">수정</button>
            <button class="danger-button" type="button" data-delete="${row.id}">삭제</button>
          </div>
        </article>
      `;
    },
  });
}
