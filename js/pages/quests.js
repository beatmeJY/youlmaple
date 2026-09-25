import { translateDbError } from "../db-error.js";
import { escapeHtml, formatCount, readCount } from "../format.js";
import { filterRows, readLevelFilter } from "../filters.js";
import { getSupabase } from "../supabase-client.js";

const blankQuest = {
  id: "",
  name: "",
  start_level: "",
  prerequisite: "",
  materials: "",
  reward: "",
  exp_reward: "",
  meso_reward: "",
  importance: "보통",
  memo: "",
};

export async function render(root) {
  root.innerHTML = `
    <header class="page-header">
      <h1>퀘스트</h1>
      <p>필요 재료, 보상, 계정별 캐릭터 완료를 한 표에서 봅니다.</p>
    </header>
    <div class="page-toolbar">
      <button class="primary-button" type="button" data-add-quest>퀘스트 추가</button>
    </div>
    <p class="form-message" data-status hidden></p>
    <form class="editor" id="quest-form" hidden>
      <h2 data-quest-title>퀘스트 추가</h2>
      <label class="field"><span>퀘스트명</span><input name="name" required /></label>
      <label class="field"><span>시작 레벨</span><input name="start_level" inputmode="numeric" /></label>
      <label class="field"><span>선행 퀘스트</span><input name="prerequisite" /></label>
      <label class="field"><span>필요 재료</span><textarea name="materials" placeholder="예: 달팽이 껍질 10"></textarea></label>
      <label class="field"><span>보상</span><input name="reward" /></label>
      <label class="field"><span>경험치</span><input name="exp_reward" inputmode="numeric" /></label>
      <label class="field"><span>메소</span><input name="meso_reward" inputmode="numeric" /></label>
      <label class="field">
        <span>중요도</span>
        <select name="importance">
          <option value="높음">높음</option>
          <option value="보통" selected>보통</option>
          <option value="낮음">낮음</option>
        </select>
      </label>
      <label class="field"><span>메모</span><textarea name="memo"></textarea></label>
      <div class="button-row">
        <button class="primary-button" type="submit">저장</button>
        <button class="secondary-button" type="button" data-cancel-quest>취소</button>
      </div>
    </form>
    <div class="filters">
      <label class="field"><span>퀘스트명</span><input data-search placeholder="이름으로 찾기" /></label>
      <label class="field"><span>레벨 최소</span><input data-level-min inputmode="numeric" /></label>
      <label class="field"><span>레벨 최대</span><input data-level-max inputmode="numeric" /></label>
    </div>
    <div data-list></div>
    <section class="section-gap" data-detail hidden>
      <h2 data-detail-title></h2>
      <form class="editor" id="note-form">
        <h3 data-note-title>메모 추가</h3>
        <label class="field"><span>제목</span><input name="title" required /></label>
        <label class="field"><span>내용</span><textarea name="content"></textarea></label>
        <div class="button-row">
          <button class="primary-button" type="submit">메모 저장</button>
          <button class="secondary-button" type="button" data-cancel-note>취소</button>
        </div>
      </form>
      <div data-notes></div>
      <h3>이 퀘스트의 캐릭터 메모</h3>
      <div data-progress></div>
    </section>
  `;

  const list = root.querySelector("[data-list]");
  const detail = root.querySelector("[data-detail]");
  const questForm = root.querySelector("#quest-form");
  const noteForm = root.querySelector("#note-form");
  const status = root.querySelector("[data-status]");
  const notesBox = root.querySelector("[data-notes]");
  const progressBox = root.querySelector("[data-progress]");
  let quests = [];
  let characters = [];
  let progress = [];
  let notes = [];
  let selectedId = "";
  let loadId = 0;

  function showStatus(text, kind) {
    status.hidden = !text;
    status.textContent = text;
    status.className = `form-message is-${kind}`;
  }

  function accountLabel(character) {
    const account = character.accounts;
    const name = Array.isArray(account) ? account[0]?.name : account?.name;
    return name || "계정 없음";
  }

  function characterGroups() {
    const groups = new Map();
    const sorted = [...characters].sort((a, b) => {
      const byAccount = accountLabel(a).localeCompare(accountLabel(b), "ko");
      if (byAccount) return byAccount;
      return a.name.localeCompare(b.name, "ko");
    });
    for (const character of sorted) {
      const label = accountLabel(character);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(character);
    }
    return [...groups.entries()];
  }

  function rewardCell(quest) {
    const lines = [];
    if (quest.reward) lines.push(escapeHtml(quest.reward));
    if (quest.exp_reward != null) lines.push(`경험치 ${escapeHtml(formatCount(quest.exp_reward))}`);
    if (quest.meso_reward != null) lines.push(`메소 ${escapeHtml(formatCount(quest.meso_reward))}`);
    return lines.length ? lines.join("<br>") : "-";
  }

  function isDone(questId, characterId) {
    return progress.some((row) => row.quest_id === questId && row.character_id === characterId && row.completed);
  }

  function paintList() {
    if (!quests.length) {
      list.innerHTML = `<p class="empty">등록한 퀘스트가 없습니다. 위의 퀘스트 추가로 첫 퀘스트를 저장해 보세요.</p>`;
      return;
    }
    const filtered = filterRows(quests, {
      query: root.querySelector("[data-search]").value,
      fields: ["name", "materials", "reward"],
      levelMode: "point",
      levelField: "start_level",
      filter: readLevelFilter(
        root.querySelector("[data-level-min]").value,
        root.querySelector("[data-level-max]").value,
      ),
    });
    if (filtered.error) {
      list.innerHTML = `<p class="empty">${filtered.error}</p>`;
      return;
    }
    if (!filtered.rows.length) {
      list.innerHTML = `<p class="empty">검색 결과가 없습니다. 검색어나 레벨 범위를 바꿔 보세요.</p>`;
      return;
    }
    const questRows = [...filtered.rows].sort(
      (a, b) => (a.start_level ?? 9999) - (b.start_level ?? 9999) || a.name.localeCompare(b.name, "ko"),
    );
    const groups = characterGroups();
    const flatCharacters = groups.flatMap(([, members]) => members);
    const groupHead = groups
      .map(([name, members]) => `<th colspan="${members.length}">${escapeHtml(name)}</th>`)
      .join("");
    const characterHead = flatCharacters
      .map((character) => `<th class="check-col">${escapeHtml(character.name)}</th>`)
      .join("");
    const fixedSpan = flatCharacters.length ? ` rowspan="2"` : "";
    const head = `
      <tr>
        <th class="stick"${fixedSpan}>퀘스트</th>
        <th class="num"${fixedSpan}>레벨</th>
        <th${fixedSpan}>필요 재료</th>
        <th${fixedSpan}>보상</th>
        ${groupHead}
        <th${fixedSpan}>작업</th>
      </tr>
      ${flatCharacters.length ? `<tr>${characterHead}</tr>` : ""}
    `;
    const body = questRows
      .map((quest) => {
        const checks = flatCharacters
          .map((character) => {
            const checked = isDone(quest.id, character.id) ? "checked" : "";
            const label = `${quest.name} ${character.name} 완료`;
            return `<td class="check-col"><input data-quest-check type="checkbox" data-quest-id="${quest.id}" data-character-id="${character.id}" aria-label="${escapeHtml(label)}" ${checked} /></td>`;
          })
          .join("");
        const importance = quest.importance === "높음" ? `<span class="tag is-high">높음</span>` : "";
        return `
          <tr class="${quest.id === selectedId ? "is-selected" : ""}">
            <td class="stick"><strong>${escapeHtml(quest.name)}</strong>${importance}</td>
            <td class="num">${escapeHtml(formatCount(quest.start_level))}</td>
            <td class="cell-wrap">${escapeHtml(quest.materials || "-")}</td>
            <td class="cell-wrap">${rewardCell(quest)}</td>
            ${checks}
            <td><div class="row-actions"><button class="text-button" type="button" data-open="${quest.id}">메모</button><button class="text-button" type="button" data-edit-quest="${quest.id}">수정</button><button class="text-button is-danger" type="button" data-delete-quest="${quest.id}">삭제</button></div></td>
          </tr>
        `;
      })
      .join("");
    const note = flatCharacters.length
      ? ""
      : `<p class="hint">캐릭터를 등록하면 표 오른쪽에 계정별 완료 체크가 생깁니다.</p>`;
    list.innerHTML = `${note}<div class="table-wrap"><table class="data-table quest-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }

  function paintNotes() {
    if (!notes.length) {
      notesBox.innerHTML = `<p class="empty">이 퀘스트에 붙은 메모가 없습니다.</p>`;
      return;
    }
    notesBox.innerHTML = `<div class="card-list">${notes
      .map(
        (note) => `
          <article class="card">
            <h3>${escapeHtml(note.title)}</h3>
            <p>${escapeHtml(note.content || "")}</p>
            <div class="button-row">
              <button class="secondary-button" type="button" data-edit-note="${note.id}">수정</button>
              <button class="danger-button" type="button" data-delete-note="${note.id}">삭제</button>
            </div>
          </article>
        `,
      )
      .join("")}</div>`;
  }

  function paintProgress() {
    if (!characters.length) {
      progressBox.innerHTML = `<p class="empty">완료 여부를 기록하려면 먼저 캐릭터 메뉴에서 캐릭터를 등록해 주세요.</p>`;
      return;
    }
    progressBox.innerHTML = `<div class="check-list">${characters
      .map((character) => {
        const row = progress.find(
          (item) => item.quest_id === selectedId && item.character_id === character.id,
        );
        return `
          <div class="check-row" data-progress-row="${character.id}">
            <strong>${escapeHtml(accountLabel(character))} · ${escapeHtml(character.name)}</strong>
            <label class="field">
              <span>이 캐릭터 메모</span>
              <input data-memo value="${escapeHtml(row?.memo || "")}" />
            </label>
            <button class="secondary-button" type="button" data-save-progress="${character.id}">메모 저장</button>
          </div>
        `;
      })
      .join("")}</div>`;
  }

  function fillQuestForm(quest) {
    questForm.hidden = false;
    questForm.dataset.editingId = quest.id || "";
    root.querySelector("[data-quest-title]").textContent = quest.id ? "퀘스트 수정" : "퀘스트 추가";
    for (const [key, value] of Object.entries(quest)) {
      const field = questForm.elements.namedItem(key);
      if (field) field.value = value ?? (key === "importance" ? "보통" : "");
    }
    questForm.elements.name.focus();
  }

  function closeQuestForm() {
    questForm.hidden = true;
    questForm.dataset.editingId = "";
    questForm.reset();
  }

  function resetNoteForm() {
    noteForm.dataset.noteId = "";
    root.querySelector("[data-note-title]").textContent = "메모 추가";
    noteForm.reset();
  }

  function readQuestForm() {
    const name = questForm.elements.name.value.trim();
    if (!name) return { error: "퀘스트명을 입력해 주세요." };
    const startLevel = readCount(questForm.elements.start_level.value, "시작 레벨", 1);
    if (startLevel.error) return startLevel;
    const expReward = readCount(questForm.elements.exp_reward.value, "경험치", 0);
    if (expReward.error) return expReward;
    const mesoReward = readCount(questForm.elements.meso_reward.value, "메소", 0);
    if (mesoReward.error) return mesoReward;
    const importance = questForm.elements.importance.value;
    if (!["높음", "보통", "낮음"].includes(importance)) {
      return { error: "중요도는 높음, 보통, 낮음 중에서 선택해 주세요." };
    }
    return {
      value: {
        name,
        start_level: startLevel.value,
        prerequisite: questForm.elements.prerequisite.value.trim() || null,
        materials: questForm.elements.materials.value.trim() || null,
        reward: questForm.elements.reward.value.trim() || null,
        exp_reward: expReward.value,
        meso_reward: mesoReward.value,
        importance,
        memo: questForm.elements.memo.value.trim() || null,
      },
    };
  }

  async function saveProgress(questId, characterId, completed, memo, refresh = true) {
    const supabase = await getSupabase();
    const { error } = await supabase.from("character_quests").upsert(
      {
        character_id: characterId,
        quest_id: questId,
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        memo: memo.trim() || null,
      },
      { onConflict: "character_id,quest_id" },
    );
    if (error) {
      showStatus(translateDbError(error), "error");
      return false;
    }
    const next = {
      character_id: characterId,
      quest_id: questId,
      completed,
      memo: memo.trim() || null,
    };
    const index = progress.findIndex(
      (row) => row.character_id === characterId && row.quest_id === questId,
    );
    if (index >= 0) progress[index] = next;
    else progress.push(next);
    if (refresh) paintList();
    showStatus(completed ? "완료로 저장했습니다." : "완료 상태를 저장했습니다.", "info");
    return true;
  }

  async function openQuest(questId) {
    selectedId = questId;
    const quest = quests.find((item) => item.id === questId);
    if (!quest) return;
    detail.hidden = false;
    root.querySelector("[data-detail-title]").textContent = quest.name;
    resetNoteForm();
    paintList();
    paintProgress();
    notesBox.innerHTML = `<p class="empty">메모를 불러오는 중입니다.</p>`;
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("quest_notes")
      .select("id, title, content")
      .eq("quest_id", questId)
      .order("updated_at", { ascending: false });
    if (!notesBox.isConnected || selectedId !== questId) return;
    if (error) {
      notesBox.innerHTML = "";
      showStatus(translateDbError(error), "error");
      return;
    }
    notes = data ?? [];
    paintNotes();
    detail.scrollIntoView({ block: "start" });
  }

  async function loadPage() {
    const current = ++loadId;
    list.innerHTML = `<p class="empty">퀘스트를 불러오는 중입니다.</p>`;
    const supabase = await getSupabase();
    const [questResult, characterResult, progressResult] = await Promise.all([
      supabase
        .from("quests")
        .select(
          "id, name, start_level, prerequisite, materials, reward, exp_reward, meso_reward, importance, memo, updated_at",
        )
        .order("start_level", { ascending: true }),
      supabase.from("characters").select("id, name, server, account_id, accounts(name)").order("name"),
      supabase.from("character_quests").select("quest_id, character_id, completed, memo"),
    ]);
    if (current !== loadId || !list.isConnected) return;
    const error = questResult.error || characterResult.error || progressResult.error;
    if (error) {
      quests = [];
      list.innerHTML = "";
      showStatus(translateDbError(error), "error");
      return;
    }
    quests = questResult.data ?? [];
    characters = characterResult.data ?? [];
    progress = progressResult.data ?? [];
    paintList();
    if (selectedId && quests.some((quest) => quest.id === selectedId)) {
      paintProgress();
    } else {
      selectedId = "";
      detail.hidden = true;
    }
  }

  root.addEventListener("input", (event) => {
    if (event.target.closest("[data-search], [data-level-min], [data-level-max]")) paintList();
  });

  root.addEventListener("click", async (event) => {
    if (event.target.closest("[data-add-quest]")) {
      showStatus("", "info");
      fillQuestForm(blankQuest);
    }
    if (event.target.closest("[data-cancel-quest]")) closeQuestForm();
    if (event.target.closest("[data-cancel-note]")) resetNoteForm();

    const openButton = event.target.closest("[data-open]");
    if (openButton) openQuest(openButton.dataset.open);

    const editQuestButton = event.target.closest("[data-edit-quest]");
    if (editQuestButton) {
      const quest = quests.find((item) => item.id === editQuestButton.dataset.editQuest);
      if (quest) fillQuestForm(quest);
    }

    const deleteQuestButton = event.target.closest("[data-delete-quest]");
    if (deleteQuestButton) {
      const quest = quests.find((item) => item.id === deleteQuestButton.dataset.deleteQuest);
      if (!quest) return;
      if (!window.confirm(`${quest.name} 퀘스트를 삭제할까요? 메모와 완료 기록도 함께 삭제됩니다.`)) return;
      deleteQuestButton.disabled = true;
      const supabase = await getSupabase();
      const { error } = await supabase.from("quests").delete().eq("id", quest.id);
      if (error) {
        deleteQuestButton.disabled = false;
        showStatus(translateDbError(error), "error");
        return;
      }
      if (selectedId === quest.id) {
        selectedId = "";
        detail.hidden = true;
      }
      if (questForm.dataset.editingId === quest.id) closeQuestForm();
      showStatus("퀘스트를 삭제했습니다.", "info");
      await loadPage();
    }

    const editNoteButton = event.target.closest("[data-edit-note]");
    if (editNoteButton) {
      const note = notes.find((item) => item.id === editNoteButton.dataset.editNote);
      if (!note) return;
      noteForm.dataset.noteId = note.id;
      root.querySelector("[data-note-title]").textContent = "메모 수정";
      noteForm.elements.title.value = note.title;
      noteForm.elements.content.value = note.content || "";
      noteForm.elements.title.focus();
    }

    const deleteNoteButton = event.target.closest("[data-delete-note]");
    if (deleteNoteButton) {
      const note = notes.find((item) => item.id === deleteNoteButton.dataset.deleteNote);
      if (!note) return;
      if (!window.confirm(`${note.title} 메모를 삭제할까요?`)) return;
      const supabase = await getSupabase();
      const { error } = await supabase.from("quest_notes").delete().eq("id", note.id);
      if (error) {
        showStatus(translateDbError(error), "error");
        return;
      }
      if (noteForm.dataset.noteId === note.id) resetNoteForm();
      showStatus("메모를 삭제했습니다.", "info");
      await openQuest(selectedId);
    }

    const saveProgressButton = event.target.closest("[data-save-progress]");
    if (!saveProgressButton) return;
    const characterId = saveProgressButton.dataset.saveProgress;
    const row = root.querySelector(`[data-progress-row="${characterId}"]`);
    const existing = progress.find((item) => item.quest_id === selectedId && item.character_id === characterId);
    const saved = await saveProgress(
      selectedId,
      characterId,
      Boolean(existing?.completed),
      row.querySelector("[data-memo]").value,
    );
    if (!saved) return;
  });

  root.addEventListener("change", async (event) => {
    const checkbox = event.target.closest("[data-quest-check]");
    if (!checkbox) return;
    const questId = checkbox.dataset.questId;
    const characterId = checkbox.dataset.characterId;
    const existing = progress.find((item) => item.quest_id === questId && item.character_id === characterId);
    const saved = await saveProgress(questId, characterId, checkbox.checked, existing?.memo || "", false);
    if (!saved) checkbox.checked = !checkbox.checked;
  });

  questForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const parsed = readQuestForm();
    if (parsed.error) {
      showStatus(parsed.error, "error");
      return;
    }
    const saveButton = questForm.querySelector("button[type='submit']");
    saveButton.disabled = true;
    showStatus("저장하는 중입니다.", "info");
    const supabase = await getSupabase();
    const id = questForm.dataset.editingId;
    const query = id
      ? supabase.from("quests").update(parsed.value).eq("id", id)
      : supabase.from("quests").insert(parsed.value);
    const { error } = await query;
    saveButton.disabled = false;
    if (error) {
      showStatus(translateDbError(error), "error");
      return;
    }
    closeQuestForm();
    showStatus(id ? "퀘스트를 수정했습니다." : "퀘스트를 저장했습니다.", "info");
    await loadPage();
  });

  noteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedId) {
      showStatus("먼저 퀘스트의 완료와 메모 버튼을 눌러 주세요.", "error");
      return;
    }
    const title = noteForm.elements.title.value.trim();
    if (!title) {
      showStatus("메모 제목을 입력해 주세요.", "error");
      return;
    }
    const payload = {
      quest_id: selectedId,
      title,
      content: noteForm.elements.content.value.trim(),
    };
    const saveButton = noteForm.querySelector("button[type='submit']");
    saveButton.disabled = true;
    const supabase = await getSupabase();
    const noteId = noteForm.dataset.noteId;
    const query = noteId
      ? supabase.from("quest_notes").update({ title: payload.title, content: payload.content }).eq("id", noteId)
      : supabase.from("quest_notes").insert(payload);
    const { error } = await query;
    saveButton.disabled = false;
    if (error) {
      showStatus(translateDbError(error), "error");
      return;
    }
    resetNoteForm();
    showStatus(noteId ? "메모를 수정했습니다." : "메모를 저장했습니다.", "info");
    await openQuest(selectedId);
  });

  await loadPage();
}
