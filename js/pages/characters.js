import { translateDbError } from "../db-error.js";
import { escapeHtml, formatCount, readCount } from "../format.js";
import { filterRows, readLevelFilter } from "../filters.js";
import { getSupabase } from "../supabase-client.js";

const columns =
  "id, account_id, server, name, job, level, combat_power, current_exp, meso, gear_memo, extra_memo, updated_at";

const blank = {
  id: "",
  account_id: "",
  server: "",
  name: "",
  job: "",
  level: "",
  combat_power: "",
  current_exp: "",
  meso: "",
  gear_memo: "",
  extra_memo: "",
};

export async function render(root) {
  root.innerHTML = `
    <header class="page-header">
      <h1>캐릭터</h1>
      <p>계정별로 나눠 서버, 직업, 레벨, 스공, 메소를 한 표에서 봅니다. 한 계정은 6명까지입니다.</p>
    </header>
    <div class="page-toolbar">
      <h2>계정별 캐릭터</h2>
      <div class="button-row">
        <button class="secondary-button" type="button" data-add-account>계정 추가</button>
        <button class="primary-button" type="button" data-add>캐릭터 추가</button>
      </div>
    </div>
    <form class="editor" id="account-form" hidden>
      <h2 data-account-title>계정 추가</h2>
      <label class="field"><span>계정 이름</span><input name="name" required placeholder="예: 본계정" /></label>
      <div class="button-row">
        <button class="primary-button" type="submit">저장</button>
        <button class="secondary-button" type="button" data-cancel-account>취소</button>
      </div>
    </form>
      <p class="form-message" data-status hidden></p>
      <form class="editor" id="character-form" hidden>
        <h2 data-form-title>캐릭터 추가</h2>
        <label class="field"><span>계정</span><select name="account_id" required></select></label>
        <label class="field"><span>서버</span><input name="server" required /></label>
        <label class="field"><span>캐릭터명</span><input name="name" required /></label>
        <label class="field"><span>직업</span><input name="job" /></label>
        <label class="field"><span>레벨</span><input name="level" inputmode="numeric" /></label>
        <label class="field"><span>스공</span><input name="combat_power" inputmode="numeric" /></label>
        <label class="field"><span>현재 경험치</span><input name="current_exp" inputmode="numeric" /></label>
        <label class="field"><span>메소</span><input name="meso" inputmode="numeric" /></label>
        <label class="field"><span>장비/스펙 메모</span><textarea name="gear_memo"></textarea></label>
        <label class="field"><span>기타 메모</span><textarea name="extra_memo"></textarea></label>
        <div class="button-row">
          <button class="primary-button" type="submit" data-save>저장</button>
          <button class="secondary-button" type="button" data-cancel>취소</button>
        </div>
      </form>
      <div class="filters">
        <label class="field"><span>캐릭터명</span><input data-search placeholder="이름으로 찾기" /></label>
        <label class="field"><span>레벨 최소</span><input data-level-min inputmode="numeric" /></label>
        <label class="field"><span>레벨 최대</span><input data-level-max inputmode="numeric" /></label>
      </div>
      <div data-list></div>
  `;

  const list = root.querySelector("[data-list]");
  const form = root.querySelector("#character-form");
  const accountForm = root.querySelector("#account-form");
  const status = root.querySelector("[data-status]");
  const title = root.querySelector("[data-form-title]");
  let rows = [];
  let accounts = [];
  let loadId = 0;

  function showStatus(text, kind) {
    status.hidden = !text;
    status.textContent = text;
    status.className = `form-message is-${kind}`;
  }

  function countFor(accountId, ignoreId = "") {
    return rows.filter((row) => row.account_id === accountId && row.id !== ignoreId).length;
  }

  function fillAccountOptions(selectedId) {
    const select = form.elements.account_id;
    select.innerHTML = accounts
      .map((account) => {
        const count = countFor(account.id);
        return `<option value="${account.id}">${escapeHtml(account.name)} (${count}/6)</option>`;
      })
      .join("");
    if (selectedId) select.value = selectedId;
  }

  function fillForm(character) {
    if (!accounts.length) {
      showStatus("먼저 계정을 만들어 주세요.", "error");
      return;
    }
    form.hidden = false;
    form.dataset.editingId = character.id || "";
    title.textContent = character.id ? "캐릭터 수정" : "캐릭터 추가";
    fillAccountOptions(character.account_id || accounts[0].id);
    for (const [key, value] of Object.entries(character)) {
      const field = form.elements.namedItem(key);
      if (field && key !== "account_id") field.value = value ?? "";
    }
    form.elements.server.focus();
  }

  function closeForm() {
    form.hidden = true;
    form.dataset.editingId = "";
    form.reset();
  }

  function characterRow(row) {
    const note = [row.gear_memo, row.extra_memo].filter(Boolean).join(" · ");
    return `
      <tr>
        <td class="stick">
          <strong>${escapeHtml(row.name)}</strong>
          ${note ? `<span class="cell-note">${escapeHtml(note)}</span>` : ""}
        </td>
        <td>${escapeHtml(row.server)}</td>
        <td>${escapeHtml(row.job || "-")}</td>
        <td class="num">${escapeHtml(formatCount(row.level))}</td>
        <td class="num">${escapeHtml(formatCount(row.combat_power))}</td>
        <td class="num">${escapeHtml(formatCount(row.meso))}</td>
        <td><div class="row-actions"><button class="text-button" type="button" data-edit="${row.id}">수정</button><button class="text-button is-danger" type="button" data-delete="${row.id}">삭제</button></div></td>
      </tr>
    `;
  }

  function paintList() {
    if (!accounts.length) {
      list.innerHTML = `<p class="empty">계정이 없습니다. 계정 추가로 본계정, 부계정처럼 먼저 만들어 주세요.</p>`;
      return;
    }
    const filtered = filterRows(rows, {
      query: root.querySelector("[data-search]").value,
      fields: ["name"],
      levelMode: "point",
      levelField: "level",
      filter: readLevelFilter(
        root.querySelector("[data-level-min]").value,
        root.querySelector("[data-level-max]").value,
      ),
    });
    if (filtered.error) {
      list.innerHTML = `<p class="empty">${filtered.error}</p>`;
      return;
    }
    const searching = Boolean(
      root.querySelector("[data-search]").value.trim() ||
        root.querySelector("[data-level-min]").value.trim() ||
        root.querySelector("[data-level-max]").value.trim(),
    );
    const blocks = accounts
      .map((account) => {
        const members = filtered.rows
          .filter((row) => row.account_id === account.id)
          .sort((a, b) => (b.level ?? -1) - (a.level ?? -1) || a.name.localeCompare(b.name, "ko"));
        if (searching && !members.length) return "";
        const count = countFor(account.id);
        const full = count >= 6;
        const body = members.length
          ? members.map(characterRow).join("")
          : `<tr><td colspan="7">이 계정에는 아직 캐릭터가 없습니다.</td></tr>`;
        return `
          <section class="account-block">
            <div class="account-head">
              <h2>${escapeHtml(account.name)} <span class="count-pill">${count}/6</span></h2>
              <div class="button-row">
                <button class="secondary-button" type="button" data-add-character="${account.id}" ${full ? "disabled" : ""}>캐릭터 추가</button>
                <button class="text-button" type="button" data-edit-account="${account.id}">이름 수정</button>
                <button class="text-button is-danger" type="button" data-delete-account="${account.id}">계정 삭제</button>
              </div>
            </div>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th class="stick">캐릭터</th><th>서버</th><th>직업</th><th class="num">레벨</th><th class="num">스공</th><th class="num">메소</th><th>작업</th></tr></thead>
                <tbody>${body}</tbody>
              </table>
            </div>
          </section>
        `;
      })
      .join("");
    list.innerHTML = blocks || `<p class="empty">검색 결과가 없습니다. 검색어나 레벨 범위를 바꿔 보세요.</p>`;
  }

  async function loadCharacters() {
    const current = ++loadId;
    list.innerHTML = `<p class="empty">캐릭터를 불러오는 중입니다.</p>`;
    const supabase = await getSupabase();
    const [accountResult, characterResult] = await Promise.all([
      supabase.from("accounts").select("id, name").order("name"),
      supabase.from("characters").select(columns).order("updated_at", { ascending: false }),
    ]);
    if (current !== loadId || !list.isConnected) return;
    const error = accountResult.error || characterResult.error;
    if (error) {
      rows = [];
      accounts = [];
      list.innerHTML = "";
      showStatus(translateDbError(error), "error");
      return;
    }
    accounts = accountResult.data ?? [];
    rows = characterResult.data ?? [];
    paintList();
  }

  function readForm() {
    const accountId = form.elements.account_id.value;
    const server = form.elements.server.value.trim();
    const name = form.elements.name.value.trim();
    if (!accounts.length) return { error: "먼저 계정을 만들어 주세요." };
    if (!accountId) return { error: "캐릭터를 넣을 계정을 선택해 주세요." };
    if (!server || !name) return { error: "서버와 캐릭터명을 입력해 주세요." };
    const editingId = form.dataset.editingId || "";
    if (countFor(accountId, editingId) >= 6) {
      return { error: "한 계정에는 캐릭터를 6개까지 만들 수 있습니다." };
    }
    const level = readCount(form.elements.level.value, "레벨", 1);
    if (level.error) return level;
    const combatPower = readCount(form.elements.combat_power.value, "스공", 0);
    if (combatPower.error) return combatPower;
    const currentExp = readCount(form.elements.current_exp.value, "현재 경험치", 0);
    if (currentExp.error) return currentExp;
    const meso = readCount(form.elements.meso.value, "메소", 0);
    if (meso.error) return meso;
    return {
      value: {
        account_id: accountId,
        server,
        name,
        job: form.elements.job.value.trim() || null,
        level: level.value,
        combat_power: combatPower.value,
        current_exp: currentExp.value,
        meso: meso.value,
        gear_memo: form.elements.gear_memo.value.trim() || null,
        extra_memo: form.elements.extra_memo.value.trim() || null,
      },
    };
  }

  root.addEventListener("input", (event) => {
    if (event.target.closest("[data-search], [data-level-min], [data-level-max]")) paintList();
  });

  root.addEventListener("click", async (event) => {
    if (event.target.closest("[data-add-account]")) {
      accountForm.hidden = false;
      accountForm.dataset.editingId = "";
      root.querySelector("[data-account-title]").textContent = "계정 추가";
      accountForm.reset();
      accountForm.elements.name.focus();
    }
    if (event.target.closest("[data-cancel-account]")) {
      accountForm.hidden = true;
      accountForm.dataset.editingId = "";
    }
    if (event.target.closest("[data-add]")) {
      showStatus("", "info");
      fillForm(blank);
    }
    if (event.target.closest("[data-cancel]")) closeForm();

    const addForAccount = event.target.closest("[data-add-character]");
    if (addForAccount) {
      if (addForAccount.disabled) return;
      showStatus("", "info");
      fillForm({ ...blank, account_id: addForAccount.dataset.addCharacter });
    }

    const editAccountButton = event.target.closest("[data-edit-account]");
    if (editAccountButton) {
      const account = accounts.find((item) => item.id === editAccountButton.dataset.editAccount);
      if (!account) return;
      accountForm.hidden = false;
      accountForm.dataset.editingId = account.id;
      root.querySelector("[data-account-title]").textContent = "계정 이름 수정";
      accountForm.elements.name.value = account.name;
      accountForm.elements.name.focus();
    }

    const deleteAccountButton = event.target.closest("[data-delete-account]");
    if (deleteAccountButton) {
      const account = accounts.find((item) => item.id === deleteAccountButton.dataset.deleteAccount);
      if (!account) return;
      if (!window.confirm(`${account.name} 계정을 삭제할까요? 캐릭터가 있으면 삭제되지 않습니다.`)) return;
      const supabase = await getSupabase();
      const { error } = await supabase.from("accounts").delete().eq("id", account.id);
      if (error) {
        showStatus(translateDbError(error), "error");
        return;
      }
      showStatus("계정을 삭제했습니다.", "info");
      await loadCharacters();
    }

    const editButton = event.target.closest("[data-edit]");
    if (editButton) {
      const row = rows.find((item) => item.id === editButton.dataset.edit);
      if (!row) return;
      showStatus("", "info");
      fillForm(row);
    }

    const deleteButton = event.target.closest("[data-delete]");
    if (!deleteButton) return;
    const row = rows.find((item) => item.id === deleteButton.dataset.delete);
    if (!row) return;
    if (!window.confirm(`${row.name} 캐릭터를 삭제할까요? 삭제한 내용은 되돌릴 수 없습니다.`)) return;
    deleteButton.disabled = true;
    const supabase = await getSupabase();
    const { error } = await supabase.from("characters").delete().eq("id", row.id);
    if (error) {
      deleteButton.disabled = false;
      showStatus(translateDbError(error), "error");
      return;
    }
    if (form.dataset.editingId === row.id) closeForm();
    showStatus("캐릭터를 삭제했습니다.", "info");
    await loadCharacters();
  });

  accountForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = accountForm.elements.name.value.trim();
    if (!name) {
      showStatus("계정 이름을 입력해 주세요.", "error");
      return;
    }
    const supabase = await getSupabase();
    const id = accountForm.dataset.editingId;
    const query = id
      ? supabase.from("accounts").update({ name }).eq("id", id)
      : supabase.from("accounts").insert({ name });
    const { error } = await query;
    if (error) {
      showStatus(translateDbError(error), "error");
      return;
    }
    accountForm.hidden = true;
    accountForm.dataset.editingId = "";
    showStatus(id ? "계정 이름을 수정했습니다." : "계정을 저장했습니다.", "info");
    await loadCharacters();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const parsed = readForm();
    if (parsed.error) {
      showStatus(parsed.error, "error");
      return;
    }
    const saveButton = form.querySelector("[data-save]");
    saveButton.disabled = true;
    showStatus("저장하는 중입니다.", "info");
    const supabase = await getSupabase();
    const id = form.dataset.editingId;
    const query = id
      ? supabase.from("characters").update(parsed.value).eq("id", id)
      : supabase.from("characters").insert(parsed.value);
    const { error } = await query;
    saveButton.disabled = false;
    if (error) {
      showStatus(translateDbError(error), "error");
      return;
    }
    closeForm();
    showStatus(id ? "캐릭터를 수정했습니다." : "캐릭터를 저장했습니다.", "info");
    await loadCharacters();
  });

  await loadCharacters();
}
