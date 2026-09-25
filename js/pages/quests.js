import { translateDbError } from "../db-error.js";
import { compareName, escapeHtml, formatCount, readCount } from "../format.js";
import { filterRows, readLevelFilter } from "../filters.js";
import { jobLabel, jobRecord, jobStyle } from "../job-label.js";
import { getSupabase } from "../supabase-client.js";
import { notify } from "../toast.js";

const blankQuest = {
  id: "",
  name: "",
  start_level: "",
  prerequisite: "",
  materials: "",
  reward: "",
  exp_reward: "",
  meso_reward: "",
  material_cost: "",
  duration_minutes: "",
  importance: "보통",
  memo: "",
};

export async function render(root) {
  root.innerHTML = `
    <div class="studio-page">
    <header class="page-header">
      <p class="studio-kicker">의뢰</p>
      <div class="studio-hero-row">
        <h1>퀘스트</h1>
        <button class="primary-button" type="button" data-add-quest>퀘스트 추가</button>
      </div>
    </header>
    <section class="studio-board">
    <form class="editor" id="quest-form" hidden>
      <h2 data-quest-title>퀘스트 추가</h2>
      <label class="field"><span>퀘스트명</span><input name="name" required /></label>
      <label class="field"><span>시작 레벨</span><input name="start_level" inputmode="numeric" /></label>
      <label class="field"><span>선행 퀘스트</span><input name="prerequisite" /></label>
      <label class="field"><span>필요 재료</span><textarea name="materials" placeholder="예: 달팽이 껍질 10"></textarea></label>
      <label class="field"><span>보상</span><textarea name="reward" placeholder="한 줄에 하나씩 입력"></textarea></label>
      <label class="field"><span>경험치</span><input name="exp_reward" inputmode="numeric" /></label>
      <label class="field"><span>메소</span><input name="meso_reward" inputmode="numeric" data-grouped-amount /></label>
      <label class="field"><span>재료비</span><input name="material_cost" inputmode="numeric" data-grouped-amount placeholder="없으면 비움" /></label>
      <label class="field"><span>진행 시간(분)</span><input name="duration_minutes" inputmode="numeric" placeholder="예: 40" /></label>
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
    <div class="filters filters-quests">
      <label class="field"><span>퀘스트명</span><input data-search placeholder="이름으로 찾기" /></label>
      <label class="field"><span>레벨 최소</span><input data-level-min inputmode="numeric" /></label>
      <label class="field"><span>레벨 최대</span><input data-level-max inputmode="numeric" /></label>
      <button class="secondary-button" type="button" data-reset-search>검색 초기화</button>
    </div>
    <div class="quest-list" data-list></div>
    </section>
    <dialog class="quest-dialog" data-quest-dialog>
      <div class="quest-dialog-head">
        <div>
          <p class="quest-dialog-kicker"><span data-dialog-level></span><span class="tag" data-dialog-importance></span></p>
          <h2 data-dialog-title></h2>
        </div>
        <button class="icon-button" type="button" data-close-dialog>닫기</button>
      </div>
      <div class="quest-dialog-body">
        <section class="quest-block">
          <h3>필요 재료</h3>
          <p data-dialog-materials></p>
        </section>
        <section class="quest-block">
          <h3>보상</h3>
          <p data-dialog-reward></p>
        </section>
        <div class="quest-stats">
          <div>
            <span>경험치</span>
            <strong data-dialog-exp></strong>
          </div>
          <div>
            <span>메소</span>
            <strong data-dialog-meso></strong>
          </div>
          <div>
            <span>진행 시간</span>
            <strong data-dialog-duration></strong>
          </div>
          <div data-dialog-rate-box>
            <span>1시간당</span>
            <strong data-dialog-rate></strong>
          </div>
        </div>
      </div>
    </dialog>
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
    </div>
  `;

  const list = root.querySelector("[data-list]");
  const detail = root.querySelector("[data-detail]");
  const questForm = root.querySelector("#quest-form");
  const noteForm = root.querySelector("#note-form");
  const notesBox = root.querySelector("[data-notes]");
  const progressBox = root.querySelector("[data-progress]");
  let quests = [];
  let characters = [];
  let hiddenCharacterCount = 0;
  let progress = [];
  let notes = [];
  let selectedId = "";
  let pinnedQuestId = "";
  let sortKey = "";
  let sortDir = "";
  let loadId = 0;

  function showStatus(text, kind) {
    notify(text, kind);
  }

  function accountLabel(character) {
    const account = character.accounts;
    const name = Array.isArray(account) ? account[0]?.name : account?.name;
    return name || "계정 없음";
  }

  function characterGroups() {
    const groups = new Map();
    const sorted = [...characters].sort((a, b) => {
      const byAccount = compareName(accountLabel(a), accountLabel(b));
      if (byAccount) return byAccount;
      return (b.level ?? -1) - (a.level ?? -1) || a.name.localeCompare(b.name, "ko");
    });
    for (const character of sorted) {
      const label = accountLabel(character);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(character);
    }
    return [...groups.entries()];
  }

  function isDone(questId, characterId) {
    return progress.some((row) => row.quest_id === questId && row.character_id === characterId && row.completed);
  }

  function canComplete(quest, character) {
    if (quest.start_level == null) return true;
    return (character.level ?? -1) >= quest.start_level;
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
    const questRows = [...filtered.rows].sort(compareQuests);
    const query = root.querySelector("[data-search]").value.trim();
    const searching = query.length > 0;
    if (!searching) pinnedQuestId = "";
    if (pinnedQuestId) {
      const pinned = questRows.filter((quest) => quest.id === pinnedQuestId);
      if (!pinned.length) {
        list.innerHTML = `<p class="empty">검색 결과가 없습니다. 검색어나 레벨 범위를 바꿔 보세요.</p>`;
        return;
      }
      questRows.splice(0, questRows.length, ...pinned);
    }
    const groups = characterGroups()
      .map(([accountName, members]) => [
        accountName,
        searching
          ? members.filter((character) =>
              questRows.some((quest) => !isDone(quest.id, character.id) && canComplete(quest, character)),
            )
          : members,
      ])
      .filter(([, members]) => members.length);
    const flatCharacters = groups.flatMap(([accountName, members], groupIndex) =>
      members.map((character, index) => ({
        character,
        accountName,
        groupStart: index === 0,
        alt: groupIndex % 2 === 1,
      })),
    );
    const characterHead = flatCharacters
      .map(({ character, accountName, groupStart, alt }) => {
        const mark = accountName.replace(/\s/g, "").slice(0, 2) || "계";
        const title = `${accountName} · ${character.name}`;
        const style = jobStyle(jobRecord(character));
        const nameClass = style ? "check-name job-label" : "check-name";
        return `<th class="check-col${groupStart ? " is-group-start" : ""}${alt ? " is-alt" : ""}" title="${escapeHtml(title)}"><span class="check-head"><span class="check-account">${escapeHtml(mark)}</span><span class="${nameClass}"${style ? ` style="${style}"` : ""}>${escapeHtml(character.name)}</span></span></th>`;
      })
      .join("");
    const head = `
      <tr>
        <th class="stick">퀘스트</th>
        <th class="num stick-level">레벨</th>
        ${sortHead("amount", "금액", "재료비를 뺀 메소로 정렬. 내림차순, 오름차순, 기본 정렬 순으로 바뀝니다.")}
        <th class="num" title="퀘스트에 쓰는 재료비">재료비</th>
        <th class="num time-col" title="진행 시간(분)">분</th>
        ${sortHead("hourly", "1시간당", "재료비를 뺀 1시간당 메소로 정렬. 내림차순, 오름차순, 기본 정렬 순으로 바뀝니다.")}
        ${characterHead}
        <th class="num sum-col">합계</th>
        <th>작업</th>
      </tr>
    `;
    const body = questRows
      .map((quest) => {
        const checks = flatCharacters
          .map(({ character, accountName, groupStart, alt }) => {
            const done = isDone(quest.id, character.id);
            const eligible = canComplete(quest, character);
            if (searching && (done || !eligible)) {
              const skipped = !eligible
                ? `${accountName} ${character.name}, 시작 레벨 ${formatCount(quest.start_level)}부터입니다.`
                : `${accountName} ${character.name} ${quest.name} 완료`;
              return `<td class="check-col${groupStart ? " is-group-start" : ""}${alt ? " is-alt" : ""}" title="${escapeHtml(skipped)}"></td>`;
            }
            const checked = done ? "checked" : "";
            const locked = !eligible && !checked;
            const label = locked
              ? `${accountName} ${character.name}, 시작 레벨 ${formatCount(quest.start_level)}부터 체크할 수 있습니다.`
              : `${accountName} ${character.name} ${quest.name} 완료`;
            return `<td class="check-col${groupStart ? " is-group-start" : ""}${alt ? " is-alt" : ""}" title="${escapeHtml(label)}"><input data-quest-check type="checkbox" data-quest-id="${quest.id}" data-character-id="${character.id}" aria-label="${escapeHtml(label)}" ${checked} ${locked ? "disabled" : ""} /></td>`;
          })
          .join("");
        const rank = importanceRank(quest.importance);
        const importance = `<span class="tag is-${rank}">${escapeHtml(quest.importance || "보통")}</span>`;
        const undone = undoneCount(quest.id);
        const amount = netMeso(quest) ?? 0;
        const hourly = hourlyMeso(quest);
        const efficient = isEfficient(hourly);
        const durationLabel = formatDuration(quest.duration_minutes);
        return `
          <tr class="${quest.id === selectedId ? "is-selected" : ""} is-${rank}${efficient ? " is-efficient" : ""}" data-quest-row="${quest.id}">
            <td class="stick"><div class="stick-label"><button class="text-button quest-name" type="button" data-show-quest="${quest.id}"${efficient ? ` title="1시간당 500만 이상이라 효율이 좋습니다."` : ""}>${escapeHtml(quest.name)}</button>${importance}</div></td>
            <td class="num stick-level">${escapeHtml(formatCount(quest.start_level))}</td>
            <td class="num"><input class="amount-input" data-quest-amount="${quest.id}" data-grouped-amount inputmode="numeric" value="${escapeHtml(formatAmount(quest.meso_reward))}" aria-label="${escapeHtml(quest.name)} 금액" /></td>
            <td class="num"><input class="amount-input" data-quest-cost="${quest.id}" data-grouped-amount inputmode="numeric" value="${escapeHtml(formatAmount(quest.material_cost))}" aria-label="${escapeHtml(quest.name)} 재료비" /></td>
            <td class="num time-col"><input class="amount-input time-input" data-quest-duration="${quest.id}" inputmode="numeric" value="${escapeHtml(quest.duration_minutes ?? "")}" title="${escapeHtml(durationLabel)}" aria-label="${escapeHtml(quest.name)} 진행 시간(분)" /></td>
            <td class="num rate-col" data-quest-rate="${quest.id}">${escapeHtml(formatMan(hourly))}</td>
            ${checks}
            <td class="num sum-col" data-quest-sum="${quest.id}" title="${escapeHtml(sumTitle(quest, undone, amount))}">${escapeHtml(formatCount(undone * amount))}</td>
            <td><div class="row-actions"><button class="text-button" type="button" data-open="${quest.id}">메모</button><button class="text-button" type="button" data-edit-quest="${quest.id}">수정</button><button class="text-button is-danger" type="button" data-delete-quest="${quest.id}">삭제</button></div></td>
          </tr>
        `;
      })
      .join("");
    const note = !characters.length
      ? hiddenCharacterCount
        ? `<p class="hint">퀘스트에 표시하지 않기로 한 캐릭터 ${hiddenCharacterCount}명은 이 표에서 뺐습니다.</p>`
        : `<p class="hint">캐릭터를 등록하면 표 오른쪽에 계정별 완료 체크가 생깁니다.</p>`
      : searching && !flatCharacters.length
        ? `<p class="hint">레벨이 되고 아직 안 깬 캐릭터가 없습니다.</p>`
        : searching
          ? `<p class="hint">검색 중에는 레벨이 되고 아직 안 깬 캐릭터만 표시합니다.</p>`
          : "";
    list.innerHTML = `${note}<p class="quest-grand-line"><span>레벨이 되는 안 깬 캐릭터 수 × 재료비를 뺀 메소</span><strong data-grand-total></strong></p><div class="table-wrap"><table class="data-table quest-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    paintFigures(questRows);
    pinLevelColumn();
  }

  function compareDefault(a, b) {
    const byLevel = (a.start_level ?? 9999) - (b.start_level ?? 9999);
    if (byLevel) return byLevel;
    const byImportance = importanceOrder(a.importance) - importanceOrder(b.importance);
    if (byImportance) return byImportance;
    return a.name.localeCompare(b.name, "ko");
  }

  function netMeso(quest) {
    if (quest.meso_reward == null) return null;
    return quest.meso_reward - (quest.material_cost ?? 0);
  }

  function sumTitle(quest, undone, net) {
    const cost = quest.material_cost ?? 0;
    if (!cost || quest.meso_reward == null) return `${undone}명 × ${formatCount(net)}`;
    return `${undone}명 × ${formatCount(net)} (메소 ${formatCount(quest.meso_reward)} − 재료비 ${formatCount(cost)})`;
  }

  function sortNumber(quest, key) {
    if (key === "amount") return netMeso(quest);
    if (key === "hourly") return hourlyMeso(quest);
    return null;
  }

  function compareQuests(a, b) {
    if (!sortKey) return compareDefault(a, b);
    const left = sortNumber(a, sortKey);
    const right = sortNumber(b, sortKey);
    const leftMissing = left == null || !Number.isFinite(left);
    const rightMissing = right == null || !Number.isFinite(right);
    if (leftMissing || rightMissing) {
      if (leftMissing && rightMissing) return compareDefault(a, b);
      return leftMissing ? 1 : -1;
    }
    const diff = sortDir === "asc" ? left - right : right - left;
    if (diff) return diff;
    return compareDefault(a, b);
  }

  function sortHead(key, label, title) {
    const active = sortKey === key;
    const arrow = !active ? "" : sortDir === "desc" ? " ↓" : " ↑";
    const aria = !active ? "none" : sortDir === "desc" ? "descending" : "ascending";
    return `<th class="num" aria-sort="${aria}"><button class="sort-button${active ? " is-active" : ""}" type="button" data-sort="${key}" title="${escapeHtml(title)}">${escapeHtml(label)}${arrow}</button></th>`;
  }

  function cycleSort(key) {
    if (sortKey !== key) {
      sortKey = key;
      sortDir = "desc";
    } else if (sortDir === "desc") {
      sortDir = "asc";
    } else {
      sortKey = "";
      sortDir = "";
    }
    paintList();
  }

  function searchQuest(questId) {
    const quest = quests.find((item) => item.id === questId);
    if (!quest) return;
    pinnedQuestId = quest.id;
    root.querySelector("[data-search]").value = quest.name;
    paintList();
  }

  function undoneCount(questId) {
    const quest = quests.find((item) => item.id === questId);
    if (!quest) return 0;
    return characters.filter((character) => !isDone(questId, character.id) && canComplete(quest, character)).length;
  }

  function formatAmount(value) {
    if (value === null || value === undefined || value === "") return "";
    return formatCount(value);
  }

  function groupDigits(text) {
    return text.replace(/\D/g, "").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function applyAmountCommas(input) {
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    const next = groupDigits(raw);
    if (next === raw) return;
    const digitsBefore = groupDigits(raw.slice(0, caret)).replaceAll(",", "").length;
    input.value = next;
    if (digitsBefore === 0) {
      input.setSelectionRange(0, 0);
      return;
    }
    let seen = 0;
    let pos = next.length;
    for (let index = 0; index < next.length; index += 1) {
      if (/\d/.test(next[index])) seen += 1;
      if (seen === digitsBefore) {
        pos = index + 1;
        break;
      }
    }
    input.setSelectionRange(pos, pos);
  }

  function formatDuration(minutes) {
    if (minutes == null || minutes === "") return "";
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours && rest) return `${hours}시간 ${rest}분`;
    if (hours) return `${hours}시간`;
    return `${rest}분`;
  }

  function hourlyMeso(quest) {
    const net = netMeso(quest);
    if (net == null || quest.duration_minutes == null) return null;
    return (net * 60) / quest.duration_minutes;
  }

  function isEfficient(hourly) {
    return Number.isFinite(hourly) && hourly >= 5_000_000;
  }

  function rateTitle(hourly) {
    if (hourly == null || !Number.isFinite(hourly)) {
      return "금액과 진행 시간을 적으면 1시간당 메소가 나옵니다.";
    }
    const text = `1시간당 ${formatCount(Math.round(hourly))}메소`;
    return isEfficient(hourly) ? `${text}. 500만 이상이라 효율이 좋습니다.` : text;
  }

  function formatMan(meso) {
    if (meso == null || !Number.isFinite(meso)) return "-";
    return `${Math.round(meso / 10000).toLocaleString("ko-KR")}만`;
  }

  function paintFigures(rows) {
    let grand = 0;
    for (const quest of rows) {
      const undone = undoneCount(quest.id);
      const amount = netMeso(quest) ?? 0;
      const sum = undone * amount;
      grand += sum;
      const cell = list.querySelector(`[data-quest-sum="${quest.id}"]`);
      if (cell) {
        cell.textContent = formatCount(sum);
        cell.title = sumTitle(quest, undone, amount);
      }
      const hourly = hourlyMeso(quest);
      const efficient = isEfficient(hourly);
      const row = list.querySelector(`[data-quest-row="${quest.id}"]`);
      row?.classList.toggle("is-efficient", efficient);
      const nameButton = row?.querySelector(".quest-name");
      if (nameButton) nameButton.title = efficient ? "1시간당 500만 이상이라 효율이 좋습니다." : "";
      const rate = list.querySelector(`[data-quest-rate="${quest.id}"]`);
      if (!rate) continue;
      rate.textContent = formatMan(hourly);
      rate.title = rateTitle(hourly);
    }
    const total = list.querySelector("[data-grand-total]");
    if (total) total.textContent = formatCount(grand);
  }

  let pinObserver;

  function pinLevelColumn() {
    pinObserver?.disconnect();
    const table = list.querySelector(".quest-table");
    const nameHead = table?.querySelector("thead .stick");
    if (!table || !nameHead) return;
    const apply = () => {
      table.style.setProperty("--quest-name-width", `${Math.ceil(nameHead.getBoundingClientRect().width)}px`);
    };
    apply();
    pinObserver = new ResizeObserver(apply);
    pinObserver.observe(nameHead);
  }

  async function saveAmount(input) {
    const quest = quests.find((item) => item.id === input.dataset.questAmount);
    if (!quest) return;
    const parsed = readCount(input.value, "금액", 0);
    if (parsed.error) {
      showStatus(parsed.error, "error");
      input.value = formatAmount(quest.meso_reward);
      return;
    }
    input.value = formatAmount(parsed.value);
    if ((parsed.value ?? null) === (quest.meso_reward ?? null)) return;
    const supabase = await getSupabase();
    const { error } = await supabase.from("quests").update({ meso_reward: parsed.value }).eq("id", quest.id);
    if (error) {
      showStatus(translateDbError(error), "error");
      input.value = formatAmount(quest.meso_reward);
      return;
    }
    quest.meso_reward = parsed.value;
    if (questForm.dataset.editingId === quest.id) questForm.elements.meso_reward.value = formatAmount(parsed.value);
    paintFigures(quests.filter((item) => list.querySelector(`[data-quest-sum="${item.id}"]`)));
    showStatus("금액을 저장했습니다.", "info");
  }

  async function saveCost(input) {
    const quest = quests.find((item) => item.id === input.dataset.questCost);
    if (!quest) return;
    const parsed = readCount(input.value, "재료비", 0);
    if (parsed.error) {
      showStatus(parsed.error, "error");
      input.value = formatAmount(quest.material_cost);
      return;
    }
    input.value = formatAmount(parsed.value);
    if ((parsed.value ?? null) === (quest.material_cost ?? null)) return;
    const supabase = await getSupabase();
    const { error } = await supabase.from("quests").update({ material_cost: parsed.value }).eq("id", quest.id);
    if (error) {
      showStatus(translateDbError(error), "error");
      input.value = formatAmount(quest.material_cost);
      return;
    }
    quest.material_cost = parsed.value;
    if (questForm.dataset.editingId === quest.id) questForm.elements.material_cost.value = formatAmount(parsed.value);
    paintFigures(quests.filter((item) => list.querySelector(`[data-quest-sum="${item.id}"]`)));
    showStatus("재료비를 저장했습니다.", "info");
  }

  async function saveDuration(input) {
    const quest = quests.find((item) => item.id === input.dataset.questDuration);
    if (!quest) return;
    const parsed = readCount(input.value, "진행 시간", 1);
    if (parsed.error) {
      showStatus(parsed.error, "error");
      input.value = quest.duration_minutes ?? "";
      input.title = formatDuration(quest.duration_minutes);
      return;
    }
    input.value = parsed.value ?? "";
    input.title = formatDuration(parsed.value);
    if ((parsed.value ?? null) === (quest.duration_minutes ?? null)) return;
    const supabase = await getSupabase();
    const { error } = await supabase.from("quests").update({ duration_minutes: parsed.value }).eq("id", quest.id);
    if (error) {
      showStatus(translateDbError(error), "error");
      input.value = quest.duration_minutes ?? "";
      input.title = formatDuration(quest.duration_minutes);
      return;
    }
    quest.duration_minutes = parsed.value;
    if (questForm.dataset.editingId === quest.id) questForm.elements.duration_minutes.value = parsed.value ?? "";
    paintFigures(quests.filter((item) => list.querySelector(`[data-quest-sum="${item.id}"]`)));
    showStatus("진행 시간을 저장했습니다.", "info");
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
      progressBox.innerHTML = hiddenCharacterCount
        ? `<p class="empty">퀘스트에 표시하지 않기로 한 캐릭터만 있어서 여기에는 나오지 않습니다.</p>`
        : `<p class="empty">완료 여부를 기록하려면 먼저 캐릭터 메뉴에서 캐릭터를 등록해 주세요.</p>`;
      return;
    }
    const ordered = characterGroups().flatMap(([, members]) => members);
    progressBox.innerHTML = `<div class="check-list">${ordered
      .map((character) => {
        const row = progress.find(
          (item) => item.quest_id === selectedId && item.character_id === character.id,
        );
        return `
          <div class="check-row" data-progress-row="${character.id}">
            <strong>${escapeHtml(accountLabel(character))} · ${jobLabel(character.name, jobRecord(character))}</strong>
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
      if (!field) continue;
      field.value =
        key === "meso_reward" || key === "material_cost"
          ? formatAmount(value)
          : (value ?? (key === "importance" ? "보통" : ""));
    }
    questForm.elements.name.focus();
    questForm.scrollIntoView({ block: "nearest" });
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
    const materialCost = readCount(questForm.elements.material_cost.value, "재료비", 0);
    if (materialCost.error) return materialCost;
    const duration = readCount(questForm.elements.duration_minutes.value, "진행 시간", 1);
    if (duration.error) return duration;
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
        material_cost: materialCost.value,
        duration_minutes: duration.value,
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

  function importanceRank(value) {
    if (value === "높음") return "high";
    if (value === "낮음") return "low";
    return "mid";
  }

  function importanceOrder(value) {
    if (value === "높음") return 0;
    if (value === "낮음") return 2;
    return 1;
  }

  function showQuestPopup(questId) {
    const quest = quests.find((item) => item.id === questId);
    const dialog = root.querySelector("[data-quest-dialog]");
    if (!quest || !dialog) return;
    const rank = importanceRank(quest.importance);
    root.querySelector("[data-dialog-title]").textContent = quest.name;
    root.querySelector("[data-dialog-level]").textContent =
      quest.start_level == null ? "" : `시작 레벨 ${formatCount(quest.start_level)}`;
    const importance = root.querySelector("[data-dialog-importance]");
    importance.textContent = quest.importance || "보통";
    importance.className = `tag is-${rank}`;
    root.querySelector("[data-dialog-materials]").textContent = quest.materials || "없음";
    root.querySelector("[data-dialog-reward]").textContent = quest.reward || "없음";
    root.querySelector("[data-dialog-exp]").textContent = formatCount(quest.exp_reward);
    const net = netMeso(quest);
    const mesoLabel = root.querySelector("[data-dialog-meso]");
    mesoLabel.textContent =
      quest.material_cost && quest.meso_reward != null
        ? `${formatCount(net)} (메소 ${formatCount(quest.meso_reward)} − 재료비 ${formatCount(quest.material_cost)})`
        : formatCount(quest.meso_reward);
    root.querySelector("[data-dialog-duration]").textContent = formatDuration(quest.duration_minutes) || "-";
    const hourly = hourlyMeso(quest);
    const rate = root.querySelector("[data-dialog-rate]");
    rate.textContent = formatMan(hourly);
    rate.title = hourly == null || !Number.isFinite(hourly) ? "" : rateTitle(hourly);
    root.querySelector("[data-dialog-rate-box]")?.classList.toggle("is-efficient", isEfficient(hourly));
    if (!dialog.open) dialog.showModal();
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
    const questColumns =
      "id, name, start_level, prerequisite, materials, reward, exp_reward, meso_reward, material_cost, duration_minutes, importance, memo, updated_at";
    const characterColumns = "id, name, level, server, account_id, quests_hidden, accounts(name), jobs(name, color, color_dark)";
    const [questResult, characterResult, progressResult] = await Promise.all([
      supabase.from("quests").select(questColumns).order("start_level", { ascending: true }),
      supabase.from("characters").select(characterColumns).order("name"),
      supabase.from("character_quests").select("quest_id, character_id, completed, memo"),
    ]);
    if (current !== loadId || !list.isConnected) return;
    if (questResult.error && /material_cost/i.test(questResult.error.message || "")) {
      const withoutCost = await supabase
        .from("quests")
        .select(
          "id, name, start_level, prerequisite, materials, reward, exp_reward, meso_reward, duration_minutes, importance, memo, updated_at",
        )
        .order("start_level", { ascending: true });
      if (current !== loadId || !list.isConnected) return;
      if (!withoutCost.error) {
        questResult.data = withoutCost.data;
        questResult.error = null;
        showStatus(translateDbError({ message: "column quests.material_cost does not exist" }), "error");
      }
    }
    if (questResult.error && /duration_minutes/i.test(questResult.error.message || "")) {
      const legacy = await supabase
        .from("quests")
        .select(
          "id, name, start_level, prerequisite, materials, reward, exp_reward, meso_reward, importance, memo, updated_at",
        )
        .order("start_level", { ascending: true });
      if (current !== loadId || !list.isConnected) return;
      if (!legacy.error) {
        questResult.data = legacy.data;
        questResult.error = null;
        showStatus(translateDbError({ message: "column quests.duration_minutes does not exist" }), "error");
      }
    }
    if (
      characterResult.error &&
      /quests_hidden/i.test(characterResult.error.message || "") &&
      /could not find|schema cache|does not exist/i.test(characterResult.error.message || "")
    ) {
      const withoutHidden = await supabase
        .from("characters")
        .select("id, name, level, server, account_id, accounts(name), jobs(name, color, color_dark)")
        .order("name");
      if (current !== loadId || !list.isConnected) return;
      if (!withoutHidden.error) {
        characterResult.data = withoutHidden.data;
        characterResult.error = null;
        showStatus(translateDbError({ message: "column characters.quests_hidden does not exist" }), "error");
      }
    }
    const error = questResult.error || characterResult.error || progressResult.error;
    if (error) {
      quests = [];
      list.innerHTML = "";
      showStatus(translateDbError(error), "error");
      return;
    }
    quests = questResult.data ?? [];
    const loadedCharacters = characterResult.data ?? [];
    characters = loadedCharacters.filter((character) => !character.quests_hidden);
    hiddenCharacterCount = loadedCharacters.length - characters.length;
    progress = progressResult.data ?? [];
    paintList();
    if (selectedId && quests.some((quest) => quest.id === selectedId)) {
      paintProgress();
    } else {
      selectedId = "";
      detail.hidden = true;
    }
  }

  const questDialog = root.querySelector("[data-quest-dialog]");
  questDialog.addEventListener("click", (event) => {
    if (event.target === questDialog) questDialog.close();
  });

  root.addEventListener("input", (event) => {
    if (event.target.closest("[data-grouped-amount]")) applyAmountCommas(event.target);
    if (event.target.closest("[data-search]")) pinnedQuestId = "";
    if (event.target.closest("[data-search], [data-level-min], [data-level-max]")) paintList();
  });

  root.addEventListener("click", async (event) => {
    const sortButton = event.target.closest("[data-sort]");
    if (sortButton) {
      cycleSort(sortButton.dataset.sort);
      return;
    }
    if (event.target.closest("[data-add-quest]")) {
      showStatus("", "info");
      fillQuestForm(blankQuest);
    }
    if (event.target.closest("[data-cancel-quest]")) closeQuestForm();
    if (event.target.closest("[data-cancel-note]")) resetNoteForm();

    if (event.target.closest("[data-reset-search]")) {
      pinnedQuestId = "";
      root.querySelector("[data-search]").value = "";
      root.querySelector("[data-level-min]").value = "";
      root.querySelector("[data-level-max]").value = "";
      paintList();
    }

    const showButton = event.target.closest("[data-show-quest]");
    if (showButton) showQuestPopup(showButton.dataset.showQuest);

    const questRow = event.target.closest("[data-quest-row]");
    if (questRow && !event.target.closest("button, input, a, textarea, select")) {
      searchQuest(questRow.dataset.questRow);
    }
    if (event.target.closest("[data-close-dialog]")) root.querySelector("[data-quest-dialog]")?.close();

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

  root.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.closest("[data-quest-amount], [data-quest-cost], [data-quest-duration]")) {
      event.preventDefault();
      event.target.blur();
    }
  });

  root.addEventListener("change", async (event) => {
    const amountInput = event.target.closest("[data-quest-amount]");
    if (amountInput) {
      await saveAmount(amountInput);
      return;
    }
    const costInput = event.target.closest("[data-quest-cost]");
    if (costInput) {
      await saveCost(costInput);
      return;
    }
    const durationInput = event.target.closest("[data-quest-duration]");
    if (durationInput) {
      await saveDuration(durationInput);
      return;
    }
    const checkbox = event.target.closest("[data-quest-check]");
    if (!checkbox) return;
    const questId = checkbox.dataset.questId;
    const characterId = checkbox.dataset.characterId;
    const quest = quests.find((item) => item.id === questId);
    const character = characters.find((item) => item.id === characterId);
    if (checkbox.checked && quest && character && !canComplete(quest, character)) {
      checkbox.checked = false;
      showStatus(`시작 레벨 ${formatCount(quest.start_level)}부터 체크할 수 있습니다.`, "error");
      return;
    }
    const existing = progress.find((item) => item.quest_id === questId && item.character_id === characterId);
    const saved = await saveProgress(questId, characterId, checkbox.checked, existing?.memo || "", false);
    if (!saved) {
      checkbox.checked = !checkbox.checked;
      return;
    }
    paintFigures(quests.filter((item) => list.querySelector(`[data-quest-sum="${item.id}"]`)));
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
