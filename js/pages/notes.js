import { escapeHtml } from "../format.js";
import { renderRecords } from "../record-page.js";

const columns = "id, title, content, category, tags, created_at, updated_at";

export function render(root) {
  return renderRecords(root, {
    title: "메모",
    description: "제목, 내용, 카테고리, 태그를 한 표에서 봅니다.",
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
    sheet: [
      { label: "제목", className: "stick", cell: (row) => escapeHtml(row.title) },
      { label: "카테고리", cell: (row) => escapeHtml(row.category || "-") },
      { label: "태그", cell: (row) => escapeHtml(row.tags || "-") },
      {
        label: "내용",
        className: "cell-wrap",
        cell: (row) => `<span class="clip">${escapeHtml(row.content || "")}</span>`,
      },
    ],
  });
}
