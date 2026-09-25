import { translateDbError } from "../db-error.js";
import { compareName, escapeHtml, formatCount } from "../format.js";
import { matchesText } from "../filters.js";
import { getSupabase } from "../supabase-client.js";
import { notify } from "../toast.js";

const columns = "id, title, content, category, tags, created_at, updated_at";
const NONE = "__none__";

function categoryOf(row) {
  return String(row.category ?? "").trim();
}

function tagsOf(row) {
  return String(row.tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function noteCard(row) {
  const title = escapeHtml(row.title);
  const content = String(row.content ?? "").trim();
  const body = content ? `<p class="note-card-body">${escapeHtml(row.content)}</p>` : "";
  const when = formatWhen(row.updated_at);
  const time = when ? `<span class="note-card-when">${escapeHtml(when)}</span>` : "";
  const category = categoryOf(row);
  const chip = category ? `<span class="link-chip">${escapeHtml(category)}</span>` : "";
  const tags = tagsOf(row)
    .map((tag) => `<span class="note-tag">${escapeHtml(tag)}</span>`)
    .join("");
  const tagRow = tags ? `<span class="note-tags">${tags}</span>` : "";
  return `
    <article class="note-card">
      <header class="note-card-head">
        <h3 title="${title}">${title}</h3>
        ${time}
      </header>
      ${body}
      <footer class="note-card-foot">
        ${chip}
        ${tagRow}
        <div class="row-actions">
          <button class="text-button" type="button" data-edit="${row.id}">수정</button>
          <button class="text-button is-danger" type="button" data-delete="${row.id}">삭제</button>
        </div>
      </footer>
    </article>
  `;
}

export async function render(root) {
  root.innerHTML = `
    <div class="note-page">
      <header class="page-header">
        <p class="trade-kicker">수첩</p>
        <div class="trade-hero-row">
          <h1>메모</h1>
          <button class="primary-button" type="button" data-add>메모 추가</button>
        </div>
      </header>
      <div class="trade-kpi-grid link-kpis" data-summary></div>
      <section class="trade-board">
        <div class="trade-board-bar">
          <div class="trade-segments" data-categories role="group" aria-label="카테고리"></div>
          <label class="field trade-search"><span>메모 검색</span><input data-search placeholder="제목, 내용, 태그로 찾기" /></label>
        </div>
        <form class="editor" hidden>
          <h2 data-form-title>메모 추가</h2>
          <label class="field span-all"><span>제목</span><input name="title" required autocomplete="off" /></label>
          <label class="field"><span>내용</span><textarea name="content"></textarea></label>
          <label class="field"><span>카테고리</span><input name="category" autocomplete="off" /></label>
          <label class="field"><span>태그</span><input name="tags" placeholder="쉼표로 구분" autocomplete="off" /></label>
          <div class="button-row">
            <button class="primary-button" type="submit">저장</button>
            <button class="secondary-button" type="button" data-cancel>취소</button>
          </div>
        </form>
        <div data-list></div>
      </section>
    </div>
  `;

  const list = root.querySelector("[data-list]");
  const summary = root.querySelector("[data-summary]");
  const segments = root.querySelector("[data-categories]");
  const form = root.querySelector("form");
  const title = root.querySelector("[data-form-title]");
  const search = root.querySelector("[data-search]");
  let rows = [];
  let category = "";
  let loadId = 0;

  function showStatus(text, kind) {
    notify(text, kind);
  }

  function categories() {
    return [...new Set(rows.map(categoryOf).filter(Boolean))].sort(compareName);
  }

  function visibleRows() {
    return rows.filter((row) => {
      const name = categoryOf(row);
      if (category === NONE && name) return false;
      if (category && category !== NONE && name !== category) return false;
      return matchesText(row, search.value, ["title", "content", "category", "tags"]);
    });
  }

  function fillForm(row) {
    form.hidden = false;
    form.dataset.editingId = row.id || "";
    title.textContent = row.id ? "수정" : "메모 추가";
    form.elements.title.value = row.title ?? "";
    form.elements.content.value = row.content ?? "";
    form.elements.category.value = row.category ?? "";
    form.elements.tags.value = row.tags ?? "";
    form.elements.title.focus();
    form.scrollIntoView({ block: "nearest" });
  }

  function closeForm() {
    form.hidden = true;
    form.dataset.editingId = "";
    form.reset();
  }

  function paintSummary() {
    summary.innerHTML = `
      <article class="trade-kpi is-focus"><span>작성한 메모</span><strong>${formatCount(rows.length)}</strong></article>
      <article class="trade-kpi"><span>카테고리</span><strong>${formatCount(categories().length)}</strong></article>
    `;
  }

  function paintSegments() {
    const names = categories();
    const hasBlank = rows.some((row) => !categoryOf(row));
    const items = [{ id: "", label: "전체", count: rows.length }];
    for (const name of names) {
      items.push({ id: name, label: name, count: rows.filter((row) => categoryOf(row) === name).length });
    }
    if (hasBlank && names.length) {
      items.push({ id: NONE, label: "미분류", count: rows.filter((row) => !categoryOf(row)).length });
    }
    if (!items.some((item) => item.id === category)) category = "";
    segments.innerHTML = items
      .map((item) => {
        const on = item.id === category;
        return `<button type="button" data-category="${escapeHtml(item.id)}" class="${on ? "is-on" : ""}" aria-pressed="${on ? "true" : "false"}">${escapeHtml(item.label)}<span class="count-pill${on ? " is-full" : ""}">${formatCount(item.count)}</span></button>`;
      })
      .join("");
  }

  function paintList() {
    const visible = visibleRows();
    if (!rows.length) {
      list.innerHTML = `<p class="empty">작성한 메모가 없습니다. 메모 추가로 첫 메모를 남겨 보세요.</p>`;
      return;
    }
    if (!visible.length) {
      list.innerHTML = `<p class="empty">이 조건에 맞는 메모가 없습니다.</p>`;
      return;
    }
    list.innerHTML = `<div class="note-cards">${visible.map(noteCard).join("")}</div>`;
  }

  function paint() {
    paintSummary();
    paintSegments();
    paintList();
  }

  async function loadRows() {
    const current = ++loadId;
    list.innerHTML = `<p class="empty">불러오는 중입니다.</p>`;
    const supabase = await getSupabase();
    const { data, error } = await supabase.from("notes").select(columns).order("updated_at", { ascending: false });
    if (current !== loadId || !list.isConnected) return;
    if (error) {
      rows = [];
      list.innerHTML = "";
      showStatus(translateDbError(error), "error");
      paintSummary();
      segments.innerHTML = "";
      return;
    }
    rows = data ?? [];
    paint();
  }

  root.addEventListener("input", (event) => {
    if (event.target === search) paintList();
  });

  root.addEventListener("click", async (event) => {
    const categoryButton = event.target.closest("[data-category]");
    if (categoryButton && segments.contains(categoryButton)) {
      category = categoryButton.dataset.category ?? "";
      paintSegments();
      paintList();
      return;
    }
    if (event.target.closest("[data-add]")) fillForm({ id: "" });
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
    if (!window.confirm(`${row.title} 메모를 삭제할까요? 삭제한 내용은 되돌릴 수 없습니다.`)) return;
    deleteButton.disabled = true;
    const supabase = await getSupabase();
    const { error } = await supabase.from("notes").delete().eq("id", row.id);
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
    const payload = {
      title: form.elements.title.value.trim(),
      content: form.elements.content.value.trim(),
      category: form.elements.category.value.trim() || null,
      tags: form.elements.tags.value.trim() || null,
    };
    if (!payload.title) {
      showStatus("제목 항목을 입력해 주세요.", "error");
      return;
    }
    const saveButton = form.querySelector("button[type='submit']");
    saveButton.disabled = true;
    showStatus("저장하는 중입니다.", "info");
    const supabase = await getSupabase();
    const id = form.dataset.editingId;
    const result = id
      ? await supabase.from("notes").update(payload).eq("id", id)
      : await supabase.from("notes").insert(payload);
    saveButton.disabled = false;
    if (result.error) {
      showStatus(translateDbError(result.error), "error");
      return;
    }
    closeForm();
    showStatus(id ? "수정했습니다." : "저장했습니다.", "info");
    await loadRows();
  });

  await loadRows();
}
