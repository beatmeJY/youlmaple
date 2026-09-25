import { translateDbError } from "../db-error.js";
import { compareName, escapeHtml, formatCount } from "../format.js";
import { matchesText } from "../filters.js";
import { faviconSrc, linkHost, normalizeLinkUrl } from "../link-url.js";
import { getSupabase } from "../supabase-client.js";
import { notify } from "../toast.js";

const columns = "id, title, url, memo, category, created_at, updated_at";
const NONE = "__none__";

function initial(title) {
  const text = String(title ?? "").trim();
  return [...text][0] || "·";
}

function categoryOf(row) {
  return String(row.category ?? "").trim();
}

function linkCard(row) {
  const href = escapeHtml(row.url);
  const title = escapeHtml(row.title);
  const host = escapeHtml(linkHost(row.url) || row.url);
  const icon = faviconSrc(row.url);
  const image = icon
    ? `<img class="link-favicon" src="${escapeHtml(icon)}" alt="" width="24" height="24" data-favicon referrerpolicy="no-referrer" />`
    : "";
  const memo = String(row.memo ?? "").trim();
  const category = categoryOf(row);
  const note = memo ? `<p class="link-card-memo">${escapeHtml(memo)}</p>` : "";
  const chip = category ? `<span class="link-chip">${escapeHtml(category)}</span>` : "";
  return `
    <article class="link-card">
      <a class="link-card-open" href="${href}" target="_blank" rel="noopener noreferrer">
        <span class="link-mark">${image}<span class="link-mark-letter"${icon ? " hidden" : ""}>${escapeHtml(initial(row.title))}</span></span>
        <span class="link-card-copy">
          <strong title="${title}">${title}</strong>
          <span class="link-host">${host}</span>
        </span>
      </a>
      ${note}
      <footer class="link-card-foot">
        ${chip}
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
    <div class="link-page">
      <header class="page-header">
        <p class="trade-kicker">바로가기</p>
        <div class="trade-hero-row">
          <h1>링크</h1>
          <button class="primary-button" type="button" data-add>링크 추가</button>
        </div>
      </header>
      <div class="trade-kpi-grid link-kpis" data-summary></div>
      <section class="trade-board">
        <div class="trade-board-bar">
          <div class="trade-segments" data-categories role="group" aria-label="분류"></div>
          <label class="field trade-search"><span>링크 검색</span><input data-search placeholder="이름, 주소, 메모, 분류로 찾기" /></label>
        </div>
        <form class="editor" hidden>
          <h2 data-form-title>링크 추가</h2>
          <label class="field"><span>이름</span><input name="title" required autocomplete="off" /></label>
          <label class="field"><span>주소</span><input name="url" required placeholder="https://" autocomplete="off" /></label>
          <label class="field"><span>메모</span><textarea name="memo"></textarea></label>
          <label class="field span-all"><span>분류</span><input name="category" autocomplete="off" /></label>
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
      return matchesText(row, search.value, ["title", "url", "memo", "category"]);
    });
  }

  function fillForm(row) {
    form.hidden = false;
    form.dataset.editingId = row.id || "";
    title.textContent = row.id ? "수정" : "링크 추가";
    form.elements.title.value = row.title ?? "";
    form.elements.url.value = row.url ?? "";
    form.elements.memo.value = row.memo ?? "";
    form.elements.category.value = row.category ?? "";
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
      <article class="trade-kpi is-focus"><span>저장한 링크</span><strong>${formatCount(rows.length)}</strong></article>
      <article class="trade-kpi"><span>분류</span><strong>${formatCount(categories().length)}</strong></article>
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
      list.innerHTML = `<p class="empty">저장한 링크가 없습니다. 링크 추가로 다시 열고 싶은 주소를 남겨 보세요.</p>`;
      return;
    }
    if (!visible.length) {
      list.innerHTML = `<p class="empty">이 조건에 맞는 링크가 없습니다.</p>`;
      return;
    }
    list.innerHTML = `<div class="link-cards">${visible.map(linkCard).join("")}</div>`;
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
    const { data, error } = await supabase.from("links").select(columns).order("updated_at", { ascending: false });
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

  root.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.matches("[data-favicon]")) return;
      image.hidden = true;
      const letter = image.parentElement?.querySelector(".link-mark-letter");
      if (letter) letter.hidden = false;
    },
    true,
  );

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
    if (!window.confirm(`${row.title} 링크를 삭제할까요? 삭제한 내용은 되돌릴 수 없습니다.`)) return;
    deleteButton.disabled = true;
    const supabase = await getSupabase();
    const { error } = await supabase.from("links").delete().eq("id", row.id);
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
      url: form.elements.url.value,
      memo: form.elements.memo.value.trim(),
      category: form.elements.category.value.trim() || null,
    };
    if (!payload.title) {
      showStatus("이름 항목을 입력해 주세요.", "error");
      return;
    }
    const parsed = normalizeLinkUrl(payload.url);
    if (parsed.error) {
      showStatus(parsed.error, "error");
      return;
    }
    payload.url = parsed.value;
    const saveButton = form.querySelector("button[type='submit']");
    saveButton.disabled = true;
    showStatus("저장하는 중입니다.", "info");
    const supabase = await getSupabase();
    const id = form.dataset.editingId;
    const result = id
      ? await supabase.from("links").update(payload).eq("id", id)
      : await supabase.from("links").insert(payload);
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
