import { translateDbError } from "../db-error.js";
import { escapeHtml, formatCount } from "../format.js";
import { getSupabase } from "../supabase-client.js";

export async function render(root) {
  root.innerHTML = `
    <header class="page-header">
      <h1>대시보드</h1>
      <p>최근 캐릭터와 퀘스트입니다.</p>
    </header>
    <section>
      <div class="page-toolbar">
        <h2>캐릭터 요약</h2>
        <a class="text-button" href="#/characters">캐릭터 관리</a>
      </div>
      <div data-characters></div>
    </section>
    <section>
      <div class="page-toolbar">
        <h2>최근 퀘스트</h2>
        <a class="text-button" href="#/quests">퀘스트 관리</a>
      </div>
      <div data-quests></div>
    </section>
    <section>
      <div class="page-toolbar">
        <h2>최근 메모</h2>
        <a class="text-button" href="#/notes">메모 관리</a>
      </div>
      <div data-notes></div>
    </section>
  `;

  const characters = root.querySelector("[data-characters]");
  const quests = root.querySelector("[data-quests]");
  const notes = root.querySelector("[data-notes]");
  characters.innerHTML = `<p class="empty">캐릭터를 불러오는 중입니다.</p>`;
  quests.innerHTML = `<p class="empty">퀘스트를 불러오는 중입니다.</p>`;
  notes.innerHTML = `<p class="empty">메모를 불러오는 중입니다.</p>`;
  const supabase = await getSupabase();

  async function showRows(target, result, emptyText, headers, toCard) {
    if (!target.isConnected) return;
    if (result.error) {
      target.innerHTML = `<p class="form-message is-error"></p>`;
      target.querySelector("p").textContent = translateDbError(result.error);
      return;
    }
    if (!result.data?.length) {
      target.innerHTML = `<p class="empty">${emptyText}</p>`;
      return;
    }
    const head = headers.map((header) => `<th>${header}</th>`).join("");
    const body = result.data.map(toCard).join("");
    target.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  const [characterResult, questResult, noteResult] = await Promise.all([
    supabase
      .from("characters")
      .select("id, name, server, job, level, accounts(name)")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("quests")
      .select("id, name, start_level, importance")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("notes")
      .select("id, title, category")
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  await showRows(
    characters,
    characterResult,
    "아직 캐릭터가 없습니다. 캐릭터 메뉴에서 추가해 보세요.",
    ["캐릭터", "계정", "서버", "직업", "레벨"],
    (row) => `
      <tr>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml((Array.isArray(row.accounts) ? row.accounts[0] : row.accounts)?.name || "-")}</td>
        <td>${escapeHtml(row.server)}</td>
        <td>${escapeHtml(row.job || "-")}</td>
        <td class="num">${escapeHtml(formatCount(row.level))}</td>
      </tr>
    `,
  );
  await showRows(
    quests,
    questResult,
    "아직 퀘스트가 없습니다. 퀘스트 메뉴에서 추가해 보세요.",
    ["퀘스트", "레벨", "중요도"],
    (row) => `
      <tr>
        <td>${escapeHtml(row.name)}</td>
        <td class="num">${escapeHtml(formatCount(row.start_level))}</td>
        <td>${escapeHtml(row.importance || "-")}</td>
      </tr>
    `,
  );
  await showRows(
    notes,
    noteResult,
    "아직 메모가 없습니다. 메모 메뉴에서 추가해 보세요.",
    ["제목", "카테고리"],
    (row) => `
      <tr>
        <td>${escapeHtml(row.title)}</td>
        <td>${escapeHtml(row.category || "-")}</td>
      </tr>
    `,
  );
}
