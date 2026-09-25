import { escapeHtml, formatCount } from "../format.js";
import { renderRecords } from "../record-page.js";

const columns = "id, name, category, price, price_basis, trade_memo, price_updated_on, updated_at";

export function render(root) {
  return renderRecords(root, {
    title: "아이템/시세",
    description: "종류, 가격, 기준, 거래 메모를 한 표에서 봅니다.",
    addLabel: "아이템 추가",
    table: "items",
    columns,
    order: "name",
    ascending: true,
    emptyText: "등록한 아이템이 없습니다. 위의 아이템 추가로 첫 시세를 저장해 보세요.",
    searchLabel: "아이템명",
    searchPlaceholder: "아이템 이름으로 찾기",
    searchFields: ["name"],
    deleteMessage: (row) => `${row.name} 아이템을 삭제할까요? 삭제한 내용은 되돌릴 수 없습니다.`,
    fields: [
      { name: "name", label: "아이템명", kind: "text", required: true },
      { name: "category", label: "종류", kind: "text" },
      { name: "price", label: "현재 가격", kind: "number", minimum: 0 },
      { name: "price_basis", label: "가격 기준", kind: "text" },
      { name: "trade_memo", label: "거래 관련 메모", kind: "textarea" },
      { name: "price_updated_on", label: "업데이트 날짜", kind: "date" },
    ],
    sheet: [
      { label: "아이템", className: "stick", cell: (row) => escapeHtml(row.name) },
      { label: "종류", cell: (row) => escapeHtml(row.category || "-") },
      { label: "가격", className: "num", cell: (row) => escapeHtml(formatCount(row.price)) },
      { label: "기준", cell: (row) => escapeHtml(row.price_basis || "-") },
      { label: "날짜", cell: (row) => escapeHtml(row.price_updated_on || "-") },
      {
        label: "거래 메모",
        className: "cell-wrap",
        cell: (row) => `<span class="clip">${escapeHtml(row.trade_memo || "-")}</span>`,
      },
    ],
  });
}
