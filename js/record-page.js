import { translateDbError } from "./db-error.js";
import { readCount, readDecimal } from "./format.js";
import { filterRows, readLevelFilter } from "./filters.js";
import { getSupabase } from "./supabase-client.js";

function fieldHtml(field) {
  if (field.kind === "textarea") {
    return `<label class="field"><span>${field.label}</span><textarea name="${field.name}"></textarea></label>`;
  }
  if (field.kind === "select") {
    const options = field.options
      .map((option) => `<option value="${option.value}">${option.label}</option>`)
      .join("");
    return `<label class="field"><span>${field.label}</span><select name="${field.name}">${options}</select></label>`;
  }
  const mode = field.kind === "decimal" ? ` inputmode="decimal"` : field.kind === "number" ? ` inputmode="numeric"` : "";
  const type = field.kind === "date" ? "date" : "text";
  const required = field.required ? " required" : "";
  return `<label class="field"><span>${field.label}</span><input name="${field.name}" type="${type}"${mode}${required} /></label>`;
}

export async function renderRecords(root, options) {
  const levelFilters = options.levelMode
    ? `
      <label class="field"><span>레벨 최소</span><input data-level-min inputmode="numeric" /></label>
      <label class="field"><span>레벨 최대</span><input data-level-max inputmode="numeric" /></label>
    `
    : "";
  root.innerHTML = `
    <header class="page-header">
      <h1>${options.title}</h1>
      <p>${options.description}</p>
    </header>
    <div class="page-toolbar">
      <button class="primary-button" type="button" data-add>${options.addLabel}</button>
    </div>
    <p class="form-message" data-status hidden></p>
    <form class="editor" hidden>
      <h2 data-form-title>${options.addLabel}</h2>
      ${options.fields.map(fieldHtml).join("")}
      <div class="button-row">
        <button class="primary-button" type="submit">저장</button>
        <button class="secondary-button" type="button" data-cancel>취소</button>
      </div>
    </form>
    <div class="filters${options.levelMode ? "" : " filters-search-only"}">
      <label class="field"><span>${options.searchLabel}</span><input data-search placeholder="${options.searchPlaceholder}" /></label>
      ${levelFilters}
    </div>
    <div data-list></div>
  `;

  const list = root.querySelector("[data-list]");
  const form = root.querySelector("form");
  const status = root.querySelector("[data-status]");
  const title = root.querySelector("[data-form-title]");
  let rows = [];
  let loadId = 0;

  function showStatus(text, kind) {
    status.hidden = !text;
    status.textContent = text;
    status.className = `form-message is-${kind}`;
  }

  function fillForm(row) {
    form.hidden = false;
    form.dataset.editingId = row.id || "";
    title.textContent = row.id ? "수정" : options.addLabel;
    for (const field of options.fields) {
      const input = form.elements.namedItem(field.name);
      if (input) input.value = row[field.name] ?? "";
    }
    form.elements[options.fields[0].name].focus();
  }

  function closeForm() {
    form.hidden = true;
    form.dataset.editingId = "";
    form.reset();
  }

  function paintList() {
    if (!rows.length) {
      list.innerHTML = `<p class="empty">${options.emptyText}</p>`;
      return;
    }
    const bounds = options.levelMode
      ? readLevelFilter(root.querySelector("[data-level-min]").value, root.querySelector("[data-level-max]").value)
      : null;
    const filtered = filterRows(rows, {
      query: root.querySelector("[data-search]").value,
      fields: options.searchFields,
      levelMode: options.levelMode,
      levelField: options.levelField,
      levelMinField: options.levelMinField,
      levelMaxField: options.levelMaxField,
      filter: bounds,
    });
    if (filtered.error) {
      list.innerHTML = `<p class="empty">${filtered.error}</p>`;
      return;
    }
    if (!filtered.rows.length) {
      list.innerHTML = `<p class="empty">검색 결과가 없습니다. 검색어나 레벨 범위를 바꿔 보세요.</p>`;
      return;
    }
    list.innerHTML = `<div class="card-list">${filtered.rows.map((row) => options.card(row)).join("")}</div>`;
  }

  function readForm() {
    const payload = {};
    for (const field of options.fields) {
      const raw = form.elements[field.name].value;
      if (field.kind === "number" || field.kind === "decimal") {
        const parsed = (field.kind === "decimal" ? readDecimal : readCount)(
          raw,
          field.label,
          field.minimum ?? 0,
        );
        if (parsed.error) return parsed;
        payload[field.name] = parsed.value;
        continue;
      }
      const text = raw.trim();
      if (field.required && !text) return { error: `${field.label} 항목을 입력해 주세요.` };
      payload[field.name] = text || (field.keepEmpty ? "" : null);
    }
    if (options.validate) {
      const extra = options.validate(payload);
      if (extra?.error) return extra;
    }
    return { value: payload };
  }

  async function loadRows() {
    const current = ++loadId;
    list.innerHTML = `<p class="empty">불러오는 중입니다.</p>`;
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from(options.table)
      .select(options.columns)
      .order(options.order, { ascending: false });
    if (current !== loadId || !list.isConnected) return;
    if (error) {
      rows = [];
      list.innerHTML = "";
      showStatus(translateDbError(error), "error");
      return;
    }
    rows = data ?? [];
    paintList();
  }

  root.addEventListener("input", (event) => {
    if (event.target.closest("[data-search], [data-level-min], [data-level-max]")) paintList();
  });

  root.addEventListener("click", async (event) => {
    if (event.target.closest("[data-add]")) {
      showStatus("", "info");
      fillForm({ id: "" });
    }
    if (event.target.closest("[data-cancel]")) closeForm();

    const editButton = event.target.closest("[data-edit]");
    if (editButton) {
      const row = rows.find((item) => item.id === editButton.dataset.edit);
      if (row) fillForm(row);
    }

    const deleteButton = event.target.closest("[data-delete]");
    if (!deleteButton) return;
    const row = rows.find((item) => item.id === deleteButton.dataset.delete);
    if (!row) return;
    if (!window.confirm(options.deleteMessage(row))) return;
    deleteButton.disabled = true;
    const supabase = await getSupabase();
    const { error } = await supabase.from(options.table).delete().eq("id", row.id);
    if (error) {
      deleteButton.disabled = false;
      showStatus(translateDbError(error), "error");
      return;
    }
    if (form.dataset.editingId === row.id) closeForm();
    showStatus("삭제했습니다.", "info");
    await loadRows();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const parsed = readForm();
    if (parsed.error) {
      showStatus(parsed.error, "error");
      return;
    }
    const saveButton = form.querySelector("button[type='submit']");
    saveButton.disabled = true;
    showStatus("저장하는 중입니다.", "info");
    const supabase = await getSupabase();
    const id = form.dataset.editingId;
    const query = id
      ? supabase.from(options.table).update(parsed.value).eq("id", id)
      : supabase.from(options.table).insert(parsed.value);
    const { error } = await query;
    saveButton.disabled = false;
    if (error) {
      showStatus(translateDbError(error), "error");
      return;
    }
    closeForm();
    showStatus(id ? "수정했습니다." : "저장했습니다.", "info");
    await loadRows();
  });

  await loadRows();
}
