import { escapeHtml } from "../format.js";
import { renderRecords } from "../record-page.js";

const columns = "id, title, content, category, tags, created_at, updated_at";

export function render(root) {
  return renderRecords(root, {
    title: "메모",
    description: "제목, 내용, 카테고리, 태그로 자유롭게 메모합니다.",
    addLabel: "메모 추가",
    table: "notes",
    columns,
    order: "updated_at",
    emptyText: "작성한 메모가 없습니다. 위의 메모 추가로 첫 메모를 남겨 보세요.",
    searchLabel: "메모 검색",
    searchPlaceholder: "제목, 내용, 태그로 찾기",
    searchFields: ["title", "content", "category", "tags"],
    deleteMessage: (row) => `${row.title} 메모를 삭제할까요? 삭제한 내용은 되돌릴 수 없습니다.`,
    fields: [
      { name: "title", label: "제목", kind: "text", required: true },
      { name: "content", label: "내용", kind: "textarea", keepEmpty: true },
      { name: "category", label: "카테고리", kind: "text" },
      { name: "tags", label: "태그", kind: "text" },
    ],
    card(row) {
      return `
        <article class="card">
          <h2>${escapeHtml(row.title)}</h2>
          <ul class="stat-list">
            <li>카테고리 ${escapeHtml(row.category || "-")}</li>
            <li>태그 ${escapeHtml(row.tags || "-")}</li>
          </ul>
          <p>${escapeHtml(row.content || "")}</p>
          <div class="button-row">
            <button class="secondary-button" type="button" data-edit="${row.id}">수정</button>
            <button class="danger-button" type="button" data-delete="${row.id}">삭제</button>
          </div>
        </article>
      `;
    },
  });
}
