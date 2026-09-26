import { attachFaceUrls, faceMarkup, missingFaceColumn } from "../character-face.js";
import { translateDbError } from "../db-error.js";
import {
  BANDS,
  BELTS,
  GOAL_SCORE,
  SAVE_FLOORS,
  SAVE_SECONDS,
  bandPoints,
  beltById,
  chainText,
  compareRoutes,
  compareSaves,
  floorPoints,
  formatDuration,
  formatPointsPerSecond,
  formatSecondsPerPoint,
  measuredRoutes,
  parseFloors,
  quoteBlackBelt,
  readRuns,
  chainKey,
  spanText,
} from "../dojo-calc.js";
import { escapeHtml, formatCount, readBig, readCount, sortByName } from "../format.js";
import { getSupabase } from "../supabase-client.js";
import { notify } from "../toast.js";

const recordColumns = "id, character_id, character_name, party, floors, score, runs, memo, created_at, updated_at";

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function beltName(id) {
  return beltById(id)?.name ?? id;
}

function beltLabel(belt) {
  return `<span class="dojo-belt"><span class="dojo-swatch is-${escapeHtml(belt.id)}"></span>${escapeHtml(belt.name)}</span>`;
}

function floorsTable() {
  return BANDS.map((band) => {
    const label = spanText(band.start, band.end);
    const saveTitle = SAVE_FLOORS.includes(band.end) ? ` title="${band.end}층에서 저장"` : "";
    return `<div class="dojo-band" data-band-row="${band.start}"${saveTitle}>
      <span class="dojo-band-name">${label}<span class="dojo-band-meta" data-band-points="${band.start}"></span></span>
      <label class="dojo-band-time">
        <input name="band_${band.start}" inputmode="numeric" autocomplete="off" aria-label="${label} 초" />
        <span>초</span>
      </label>
      <span class="dojo-band-clock">
        <span class="dojo-band-readout" data-band-time hidden>0:00.0</span>
        <button class="dojo-band-btn" type="button" data-band-start="${band.start}" aria-label="${label} 시작">시작</button>
        <button class="dojo-band-btn" type="button" data-band-stop="${band.start}" aria-label="${label} 종료" disabled>종료</button>
        <button class="dojo-band-btn" type="button" data-band-apply="${band.start}" aria-label="${label} 반영">반영</button>
        <button class="dojo-band-btn" type="button" data-band-cancel="${band.start}" aria-label="${label} 취소">취소</button>
      </span>
    </div>`;
  }).join("");
}

function samePrice(left, right) {
  if (left == null || right == null) return false;
  return BigInt(left) === BigInt(right);
}

const dojoChain = `<svg viewBox="0 0 20 52" width="18" height="48" focusable="false"><g fill="none" stroke="#5c3818" stroke-width="4" stroke-linejoin="round"><rect x="4" y="0" width="12" height="22" rx="6"/><rect x="1" y="16" width="18" height="12" rx="6"/><rect x="4" y="28" width="12" height="22" rx="6"/></g><g fill="none" stroke="#f3d7a2" stroke-width="2.1" stroke-linejoin="round"><rect x="4" y="0" width="12" height="22" rx="6"/><rect x="1" y="16" width="18" height="12" rx="6"/><rect x="4" y="28" width="12" height="22" rx="6"/></g></svg>`;

export async function render(root) {
  root.innerHTML = `
    <div class="dojo-page">
    <header class="page-header dojo-hero">
      <p class="dojo-kicker">MU LUNG</p>
      <h1>무릉도장</h1>
    </header>
    <section class="dojo-frame dojo-belts">
      <div class="dojo-belts-head"><span>허리띠 시세</span></div>
      <p class="hint">공용 시세입니다. 가격을 적으면 아래에 쌓입니다.</p>
      <div data-belts></div>
    </section>
    <section class="dojo-cast">
      <img class="dojo-roof" src="img/dojo-roof.png" alt="" />
      <section class="dojo-frame">
        <div class="page-toolbar">
          <h2>캐릭터</h2>
          <p class="dojo-picked-label" data-picked-label hidden></p>
        </div>
        <div data-records></div>
      </section>
    </section>
    <div class="dojo-link" aria-hidden="true">${dojoChain}${dojoChain}</div>
    <form id="dojo-form">
      <section class="dojo-frame">
      <div class="dojo-who" data-who>
        <div class="dojo-who-copy">
          <p class="dojo-who-kicker">구간 시간</p>
          <h2>캐릭터를 선택해 주세요</h2>
        </div>
      </div>
      <div class="editor">
        <details class="dojo-note span-all">
          <summary>계산 기준</summary>
          <p class="hint">구간 전체를 깨는 초를 적습니다. 개인은 1~5층이 층마다 2점, 팀은 1점입니다. 5, 10, 15, 20, 25층에서 저장할 수 있고, 이어서 더 위쪽 5층 단위에 다시 저장할 수 있습니다. 저장 한 번에 참고 시간 ${SAVE_SECONDS}초를 더합니다. 하루 최대 3,500점이고, 검은 허리띠는 17,000점입니다.</p>
        </details>
        <div class="dojo-fields">
          <label class="field dojo-field-character"><span>캐릭터</span>
            <select name="character_id">
              <option value="">캐릭터 선택</option>
            </select>
          </label>
          <label class="field dojo-field-party"><span>방식</span>
            <select name="party">
              <option value="solo">개인</option>
              <option value="team">팀</option>
            </select>
          </label>
          <label class="field dojo-field-score"><span>지금 점수</span><input name="score" inputmode="numeric" autocomplete="off" placeholder="없으면 0" /></label>
        </div>
        <div class="dojo-split">
          <div class="dojo-bands">
            <p class="dojo-bands-title">구간 초</p>
            ${floorsTable()}
          </div>
          <div class="dojo-best is-empty" data-best>
            <p class="dojo-best-kicker">최적 동선</p>
            <p class="dojo-best-empty">구간 초를 모두 입력하면 여기에 정리됩니다.</p>
          </div>
        </div>
        <div class="button-row">
          <button class="primary-button" type="submit" data-save>이 캐릭터 저장</button>
          <button class="secondary-button" type="button" data-clear>입력 지우기</button>
        </div>
      </div>
      </section>
      <div class="dojo-link" aria-hidden="true">${dojoChain}${dojoChain}</div>
      <section class="dojo-notice">
        <div data-plan></div>
      </section>
    </form>
    </div>
  `;

  const form = root.querySelector("#dojo-form");
  const belts = root.querySelector("[data-belts]");
  const records = root.querySelector("[data-records]");
  const plan = root.querySelector("[data-plan]");
  let characters = [];
  let accounts = [];
  let draftRuns = new Map();
  let clock = null;
  let bandPending = null;
  let routePending = null;
  let clockTimer = 0;
  let clockTarget = "";
  let clockPressed = false;
  let landedKey = "";
  let arriveCard = false;
  let savedSnapshot = "";
  let runsReady = true;
  let priceRows = [];
  let recordRows = [];
  let loadId = 0;
  let saving = false;

  function partyOf() {
    return form.elements.party.value === "team";
  }

  function snapshot() {
    const bands = BANDS.map((band) => form.elements[`band_${band.start}`].value.trim());
    const runs = [...draftRuns.entries()].sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
    return JSON.stringify({
      character: form.dataset.openCharacter || "",
      party: form.dataset.openParty || "solo",
      score: form.elements.score.value.trim(),
      bands,
      runs,
    });
  }

  function latestPrices() {
    const map = new Map();
    for (const row of priceRows) {
      if (!map.has(row.belt)) map.set(row.belt, row);
    }
    return map;
  }

  function priceMap() {
    const map = new Map();
    for (const [belt, row] of latestPrices()) map.set(belt, row.price);
    return map;
  }

  function floorsOf() {
    const times = new Map();
    for (const band of BANDS) {
      const label = spanText(band.start, band.end);
      const parsed = readCount(form.elements[`band_${band.start}`].value, `${label} 초`, 1);
      if (parsed.error) return parsed;
      if (parsed.value != null) {
        if (parsed.value > 86400) return { error: `${label} 초는 하루를 넘길 수 없습니다.` };
        times.set(band.start, parsed.value);
      }
    }
    const score = readCount(form.elements.score.value, "지금 점수", 0);
    if (score.error) return score;
    if (score.value != null && score.value > GOAL_SCORE) return { error: "지금 점수는 17,000 이하여야 합니다." };
    return { times, score: score.value ?? 0, party: partyOf() };
  }

  function characterOption(character) {
    const job = character.job ? ` · ${character.job}` : "";
    const level = character.level ? ` · ${character.level}` : "";
    return `<option value="${character.id}">${escapeHtml(character.name)}${escapeHtml(job)}${escapeHtml(level)}</option>`;
  }

  function compareCharacter(left, right) {
    const level = (right.level ?? -1) - (left.level ?? -1);
    if (level) return level;
    return left.name.localeCompare(right.name, "ko");
  }

  function paintCharacters() {
    const select = form.elements.character_id;
    const current = form.dataset.openCharacter || select.value;
    const groups = accounts
      .map((account) => {
        const members = characters.filter((character) => character.account_id === account.id).sort(compareCharacter);
        if (!members.length) return "";
        return `<optgroup label="${escapeHtml(account.name)}">${members.map(characterOption).join("")}</optgroup>`;
      })
      .filter(Boolean);
    const known = new Set(accounts.map((account) => account.id));
    const loose = characters.filter((character) => !known.has(character.account_id)).sort(compareCharacter);
    if (loose.length) groups.push(`<optgroup label="계정 없음">${loose.map(characterOption).join("")}</optgroup>`);
    select.innerHTML = [`<option value="">캐릭터 선택</option>`, ...groups].join("");
    if (current && characters.some((character) => character.id === current)) select.value = current;
  }

  function readCharacter() {
    const id = form.elements.character_id.value;
    const character = characters.find((row) => row.id === id);
    if (!character) return { error: "캐릭터를 선택해 주세요." };
    return { characterId: id, characterName: character.name };
  }

  function runInput(key, part) {
    return [...plan.querySelectorAll(`[data-run-part="${part}"]`)].find((input) => input.dataset.runKey === key);
  }

  function readRun(key) {
    const minutes = readCount(runInput(key, "min")?.value ?? "", "분", 0);
    const seconds = readCount(runInput(key, "sec")?.value ?? "", "초", 0);
    if (minutes.error) return minutes;
    if (seconds.error) return seconds;
    if (minutes.value == null && seconds.value == null) return { seconds: null };
    if (seconds.value != null && seconds.value > 59) return { error: "초는 59 이하여야 합니다." };
    const total = (minutes.value ?? 0) * 60 + (seconds.value ?? 0);
    if (total < 1) {
      if (minutes.value == null || seconds.value == null) return { seconds: null };
      return { error: "돌아본 시간은 1초 이상이어야 합니다." };
    }
    if (total > 86400) return { error: "돌아본 시간은 하루를 넘길 수 없습니다." };
    return { seconds: total };
  }

  function syncRuns() {
    const inputs = [...plan.querySelectorAll("[data-run-part='min']")];
    if (!inputs.length) return { ok: true };
    const next = new Map();
    for (const input of inputs) {
      const parsed = readRun(input.dataset.runKey);
      if (parsed.error) return parsed;
      if (parsed.seconds != null) next.set(input.dataset.runKey, parsed.seconds);
    }
    draftRuns = next;
    return { ok: true };
  }

  function routeForKey(key) {
    const current = floorsOf();
    if (current.error) return null;
    return compareSaves(current.times, current.party).rows.find((row) => row.best && chainKey(row.best.saves) === key)?.best ?? null;
  }

  function hourText(route, seconds) {
    if (!route || seconds == null) return "-";
    const quote = quoteBlackBelt(priceMap(), route, seconds);
    if (quote.hour == null) return quote.missing.length ? "시세 없음" : "-";
    return formatCount(quote.hour);
  }

  function beltText(route, seconds, score) {
    if (!route?.points || seconds == null) return "-";
    const need = Math.max(0, GOAL_SCORE - (score || 0));
    if (!need) return "달성";
    return formatDuration((need * seconds) / route.points);
  }

  function setNote(text, isError) {
    const note = plan.querySelector("[data-measured]");
    if (!note) return;
    note.hidden = !text;
    note.className = isError ? "form-message is-error" : "hint";
    note.textContent = text;
  }

  function formatStopwatch(ms) {
    const safe = Math.max(0, ms);
    const minutes = Math.floor(safe / 60000);
    const seconds = Math.floor(safe / 1000) % 60;
    const tenths = Math.floor(safe / 100) % 10;
    return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
  }

  function cancelClock() {
    clock = null;
    window.clearInterval(clockTimer);
    clockTimer = 0;
  }

  function tickClock() {
    if (!root.isConnected) {
      cancelClock();
      return;
    }
    if (!clock) return;
    const time = clock.scope === "band"
      ? root.querySelector(`[data-band-row="${clock.key}"] [data-band-time]`)
      : plan.querySelector(".dojo-stopwatch.is-running [data-clock-time]");
    if (!time) return;
    time.textContent = formatStopwatch(Date.now() - clock.startedAt);
  }

  function paintBandClocks() {
    const runningKey = clock?.scope === "band" ? clock.key : "";
    const busy = Boolean(clock) || Boolean(bandPending) || Boolean(routePending);
    for (const band of BANDS) {
      const row = root.querySelector(`[data-band-row="${band.start}"]`);
      if (!row) continue;
      const key = String(band.start);
      const on = key === runningKey;
      const pending = bandPending?.key === key;
      row.classList.toggle("is-timing", on);
      row.classList.toggle("is-pending", pending);
      const readout = row.querySelector("[data-band-time]");
      const start = row.querySelector("[data-band-start]");
      const stop = row.querySelector("[data-band-stop]");
      if (readout) {
        readout.hidden = !on && !pending;
        if (on) readout.textContent = formatStopwatch(Date.now() - clock.startedAt);
        if (pending) readout.textContent = `${bandPending.seconds}초`;
      }
      if (start) start.disabled = busy && !on;
      if (stop) stop.disabled = !on;
    }
  }

  function startClock() {
    if (clock?.scope === "band" || bandPending || routePending) return;
    const select = plan.querySelector("[data-clock-target]");
    const key = select?.value || clockTarget;
    if (!key) return;
    clockTarget = key;
    clock = { scope: "route", key, startedAt: Date.now() };
    window.clearInterval(clockTimer);
    clockTimer = window.setInterval(tickClock, 100);
    paintPlan();
  }

  function startBandClock(start) {
    if (clock || bandPending || routePending) return;
    clock = { scope: "band", key: String(start), startedAt: Date.now() };
    window.clearInterval(clockTimer);
    clockTimer = window.setInterval(tickClock, 100);
    paintPlan();
  }

  function stopBandClock() {
    if (clock?.scope !== "band") return;
    const key = clock.key;
    const total = Math.round((Date.now() - clock.startedAt) / 1000);
    cancelClock();
    if (total > 86400) {
      notify("돌아본 시간은 하루를 넘길 수 없습니다.", "error");
      paintPlan();
      return;
    }
    bandPending = { key, seconds: Math.max(1, total) };
    paintPlan();
  }

  async function applyBandPending() {
    if (!bandPending || saving) return;
    const input = form.elements[`band_${bandPending.key}`];
    if (input) input.value = String(bandPending.seconds);
    bandPending = null;
    paintPlan();
    await persistSheet("구간 시간을 저장했습니다.");
  }

  function cancelBandPending() {
    bandPending = null;
    paintPlan();
  }

  function stopClock() {
    if (clock?.scope === "band") {
      stopBandClock();
      return;
    }
    if (!clock) return;
    const key = clock.key;
    const total = Math.round((Date.now() - clock.startedAt) / 1000);
    cancelClock();
    if (total > 86400) {
      notify("돌아본 시간은 하루를 넘길 수 없습니다.", "error");
      paintPlan();
      return;
    }
    routePending = { key, seconds: Math.max(1, total) };
    clockTarget = key;
    paintPlan();
  }

  async function applyRoutePending() {
    if (!routePending || saving) return;
    const { key, seconds } = routePending;
    routePending = null;
    const minInput = runInput(key, "min");
    const secInput = runInput(key, "sec");
    if (minInput) minInput.value = String(Math.floor(seconds / 60));
    if (secInput) secInput.value = String(seconds % 60);
    const parsed = applyRun(key);
    if (parsed.error) {
      notify(parsed.error, "error");
      paintPlan();
      return;
    }
    landedKey = key;
    paintPlan();
    landedKey = "";
    await persistSheet("실제 시간을 저장했습니다.");
  }

  function resetRoutePending() {
    routePending = null;
    paintPlan();
  }

  function timerBar(items) {
    const options = items
      .map((item) => ({
        key: chainKey(item.row.best.saves),
        label: chainText(item.row.best.saves),
      }))
      .filter((item) => item.key);
    if (routePending) clockTarget = routePending.key;
    else if (!options.some((item) => item.key === clockTarget)) clockTarget = options[0]?.key || "";
    const running = clock?.scope === "route";
    const pending = Boolean(routePending);
    const busy = Boolean(clock) || Boolean(bandPending) || pending;
    const time = running
      ? formatStopwatch(Date.now() - clock.startedAt)
      : pending
        ? formatStopwatch(routePending.seconds * 1000)
        : "0:00.0";
    const choices = options
      .map(
        (item) =>
          `<option value="${escapeHtml(item.key)}"${item.key === clockTarget ? " selected" : ""}>${escapeHtml(item.label)}</option>`,
      )
      .join("");
    return `<div class="dojo-timer${running ? " is-running" : ""}${pending ? " is-pending" : ""}">
      <label class="dojo-timer-target"><span>저장 방법</span><select data-clock-target${running || pending ? " disabled" : ""}>${choices}</select></label>
      <span class="dojo-stopwatch${running ? " is-running" : ""}"><span class="dojo-stopwatch-time" data-clock-time>${time}</span></span>
      <button class="dojo-stopwatch-btn" type="button" data-clock-start${busy ? " disabled" : ""}>시작</button>
      <button class="dojo-stopwatch-btn" type="button" data-clock-stop${running ? "" : " disabled"}>종료</button>
      <button class="dojo-stopwatch-btn" type="button" data-clock-apply>반영</button>
      <button class="dojo-stopwatch-btn" type="button" data-clock-reset>초기화</button>
      <button class="dojo-stopwatch-btn dojo-timer-save" type="button" data-save-clock${running || !clockTarget ? " disabled" : ""}>저장</button>
    </div>`;
  }

  function paintLive(key) {
    const row = [...plan.querySelectorAll("[data-chain]")].find((item) => item.dataset.chain === key);
    if (!row) return;
    const route = routeForKey(key);
    const seconds = draftRuns.get(key);
    const rate = row.querySelector("[data-live='rate']");
    const point = row.querySelector("[data-live='point']");
    const hour = row.querySelector("[data-live='hour']");
    const belt = row.querySelector("[data-live='belt']");
    const score = floorsOf();
    if (!route || seconds == null) {
      if (rate) rate.textContent = "-";
      if (point) point.textContent = "-";
      if (hour) hour.textContent = "-";
      if (belt) belt.textContent = "-";
      return;
    }
    if (rate) rate.textContent = formatPointsPerSecond(route.points, seconds);
    if (point) point.textContent = formatSecondsPerPoint(route.points, seconds);
    if (hour) hour.textContent = hourText(route, seconds);
    if (belt) belt.textContent = beltText(route, seconds, score.error ? 0 : score.score);
  }

  function applyRun(key) {
    const parsed = readRun(key);
    if (parsed.error) {
      draftRuns.delete(key);
      paintLive(key);
      setNote(parsed.error, true);
      return parsed;
    }
    if (parsed.seconds == null) draftRuns.delete(key);
    else draftRuns.set(key, parsed.seconds);
    paintLive(key);
    setNote("", false);
    return parsed;
  }

  function planHead() {
    return `<div class="dojo-plan-row is-head">
      <span class="dojo-cell is-save">저장</span>
      <span class="dojo-cell is-score">점수</span>
      <span class="dojo-cell is-ref-time"><span class="label-wide">참고 시간</span><span class="label-stack">시간</span></span>
      <span class="dojo-cell is-ref-rate"><span class="label-wide">참고 초당</span><span class="label-stack">초당</span></span>
      <span class="dojo-cell is-ref-point"><span class="label-wide">참고 점수당</span><span class="label-stack">점수당</span></span>
      <span class="dojo-cell is-act-time">실제</span>
      <span class="dojo-cell is-act-rate">실제 초당</span>
      <span class="dojo-cell is-act-point">실제 점수당</span>
      <span class="dojo-cell is-belt" title="실제 시간으로 지금 점수에서 17,000점까지">검은 허리띠</span>
      <span class="dojo-cell is-hour">시간당</span>
    </div>`;
  }

  function emptyPlan() {
    const cells = ["is-save", "is-score", "is-ref-time", "is-ref-rate", "is-ref-point", "is-act-time", "is-act-rate", "is-act-point", "is-belt", "is-hour"]
      .map((name) => `<span class="dojo-cell ${name}"></span>`)
      .join("");
    return `<div class="dojo-board">
      <div class="dojo-plan is-blank">
        ${planHead()}
        <div class="dojo-plan-row is-blank">${cells}<p class="dojo-plan-note">위에 입력하면 표가 나옵니다.</p></div>
      </div>
    </div>`;
  }

  function paintBest(entry) {
    const box = root.querySelector("[data-best]");
    if (!box) return;
    if (!entry?.route) {
      box.className = "dojo-best is-empty";
      box.innerHTML = `
        <div class="dojo-best-card">
          <p class="dojo-best-kicker">최적 동선</p>
          <p class="dojo-best-empty">구간 초를 모두 입력하면 여기에 정리됩니다.</p>
        </div>
      `;
      return;
    }
    const { route, seconds, mode, score } = entry;
    const path = route.saves?.length
      ? route.saves.map((floor) => `<span class="dojo-best-chip">${floor}층</span>`).join(`<span class="dojo-best-arrow" aria-hidden="true">→</span>`)
      : `<span class="dojo-best-chip">저장 안 함</span>`;
    const badge = mode === "actual"
      ? `<span class="dojo-best-badge is-actual">실제 기록</span>`
      : `<span class="dojo-best-badge is-recommend">추천</span>`;
    const beltEta = beltText(route, seconds, score || 0);
    const mesoHour = hourText(route, seconds);
    box.className = `dojo-best is-${mode}`;
    box.innerHTML = `
      <div class="dojo-best-card">
        <div class="dojo-best-head">
          ${badge}
          <p class="dojo-best-kicker">최적 동선</p>
        </div>
        <p class="dojo-best-path">${path}</p>
        <p class="dojo-best-score">${escapeHtml(formatCount(route.points))}<span>점</span></p>
        <div class="dojo-best-hero">
          <div class="dojo-best-hero-stat">
            <span>검은 허리띠까지</span>
            <strong>${escapeHtml(beltEta)}</strong>
          </div>
          <div class="dojo-best-hero-stat is-meso">
            <span>시간당 메소</span>
            <strong>${escapeHtml(mesoHour)}</strong>
          </div>
        </div>
        <div class="dojo-best-stats">
          <div class="dojo-best-stat">
            <span>초당 점수</span>
            <strong>${escapeHtml(formatPointsPerSecond(route.points, seconds))}</strong>
          </div>
          <div class="dojo-best-stat">
            <span>소요 시간</span>
            <strong>${escapeHtml(formatDuration(seconds))}</strong>
          </div>
          <div class="dojo-best-stat">
            <span>점수당 초</span>
            <strong>${escapeHtml(formatSecondsPerPoint(route.points, seconds))}</strong>
          </div>
        </div>
      </div>
    `;
  }

  function paintPlan() {
    paintBandClocks();
    const party = partyOf();
    for (const band of BANDS) {
      const points = root.querySelector(`[data-band-points="${band.start}"]`);
      const each = floorPoints(band.start, party);
      const total = bandPoints(band.start, party);
      if (points) {
        points.textContent = `${formatCount(total)}점`;
        points.title = `층마다 ${each}점, 이 구간 ${formatCount(total)}점`;
      }
      const row = root.querySelector(`[data-band-row="${band.start}"]`);
      row?.classList.remove("is-in-route");
    }

    const current = floorsOf();
    if (current.error) {
      paintBest(null);
      plan.innerHTML = `<p class="form-message is-error"></p>`;
      plan.querySelector("p").textContent = current.error;
      return;
    }

    for (const band of BANDS) {
      const row = root.querySelector(`[data-band-row="${band.start}"]`);
      const seconds = current.times.get(band.start);
      if (!row) continue;
      const input = row.querySelector("input");
      if (!seconds) {
        input?.removeAttribute("title");
        continue;
      }
      const points = bandPoints(band.start, party);
      if (input) input.title = `초당 ${formatPointsPerSecond(points, seconds)} · 점수당 ${formatSecondsPerPoint(points, seconds)}`;
    }

    const compared = compareSaves(current.times, party);
    if (!compared.best) {
      paintBest(null);
      plan.innerHTML = emptyPlan();
      return;
    }
    const measured = measuredRoutes(current.times, party, draftRuns);
    if (measured.best) {
      paintBest({ mode: "actual", route: measured.best.route, seconds: measured.best.seconds, score: current.score });
    } else {
      paintBest({ mode: "recommend", route: compared.best, seconds: compared.best.seconds, score: current.score });
    }

    const ranked = compared.rows
      .filter((row) => row.best)
      .map((row) => ({ row, actual: draftRuns.get(chainKey(row.best.saves)) ?? null }))
      .sort((left, right) => {
        if ((left.actual == null) !== (right.actual == null)) return left.actual == null ? 1 : -1;
        if (left.actual != null) {
          return compareRoutes(
            { points: left.row.best.points, seconds: left.actual, start: left.row.best.start },
            { points: right.row.best.points, seconds: right.actual, start: right.row.best.start },
          );
        }
        return compareRoutes(left.row.best, right.row.best);
      });
    const route = compared.best;
    for (const band of BANDS) {
      const row = root.querySelector(`[data-band-row="${band.start}"]`);
      const count = route.runs.filter((run) => band.start >= run.start).length;
      if (count > 0) row?.classList.add("is-in-route");
    }
    const body = ranked
      .map((item, index) => {
        const key = chainKey(item.row.best.saves);
        const label = chainText(item.row.best.saves);
        const [minutes, seconds] = item.actual == null ? ["", ""] : [String(Math.floor(item.actual / 60)), String(item.actual % 60)];
        const liveRate = item.actual == null ? "-" : formatPointsPerSecond(item.row.best.points, item.actual);
        const livePoint = item.actual == null ? "-" : formatSecondsPerPoint(item.row.best.points, item.actual);
        const liveBelt = beltText(item.row.best, item.actual, current.score);
        const routeLabel = item.row.best.saves?.length
          ? item.row.best.saves.map((floor) => `<span>${floor}층</span>`).join('<span class="dojo-join"> → </span>')
          : escapeHtml(label);
        const timing = clock?.scope === "route" && clock.key === key ? " is-timing" : "";
        const landed = landedKey === key ? " is-landed" : "";
        return `<div class="dojo-plan-row${index === 0 ? " is-selected" : ""}${timing}${landed}" data-chain="${escapeHtml(key)}">
          <span class="dojo-cell is-save"><span class="dojo-value">${routeLabel}</span></span>
          <span class="dojo-cell is-score"><span class="dojo-value">${escapeHtml(formatCount(item.row.best.points))}점</span></span>
          <span class="dojo-cell is-ref-time"><span class="dojo-tag">참고</span><span class="dojo-value">${escapeHtml(formatDuration(item.row.best.seconds))}</span></span>
          <span class="dojo-cell is-ref-rate"><span class="dojo-tag">참고</span><span class="dojo-value">${escapeHtml(formatPointsPerSecond(item.row.best.points, item.row.best.seconds))}</span></span>
          <span class="dojo-cell is-ref-point"><span class="dojo-tag">참고</span><span class="dojo-value">${escapeHtml(formatSecondsPerPoint(item.row.best.points, item.row.best.seconds))}</span></span>
          <span class="dojo-cell is-act-time"><span class="dojo-tag">실제</span><span class="dojo-line dojo-actual"><span class="dojo-clock"><input class="dojo-run" data-run-key="${escapeHtml(key)}" data-run-part="min" inputmode="numeric" autocomplete="off" aria-label="${escapeHtml(label)} 분" value="${escapeHtml(minutes)}" /><span>분</span></span><span class="dojo-clock"><input class="dojo-run" data-run-key="${escapeHtml(key)}" data-run-part="sec" inputmode="numeric" autocomplete="off" aria-label="${escapeHtml(label)} 초" value="${escapeHtml(seconds)}" /><span>초</span></span></span></span>
          <span class="dojo-cell is-act-rate"><span class="dojo-tag">실제</span><span class="dojo-value" data-live="rate">${escapeHtml(liveRate)}</span></span>
          <span class="dojo-cell is-act-point"><span class="dojo-tag">실제</span><span class="dojo-value" data-live="point">${escapeHtml(livePoint)}</span></span>
          <span class="dojo-cell is-belt"><span class="dojo-value" data-live="belt">${escapeHtml(liveBelt)}</span></span>
          <span class="dojo-cell is-hour"><span class="dojo-value" data-live="hour">${escapeHtml(hourText(item.row.best, item.actual))}</span></span>
        </div>`;
      })
      .join("");
    plan.innerHTML = `
      <div class="dojo-board">
      ${timerBar(ranked)}
      <div class="dojo-plan">
        ${planHead()}
        ${body}
      </div>
      <p class="form-message is-error" data-measured hidden></p>
      </div>
    `;
  }

  function priceEditor(belt, deleteId) {
    const remove = deleteId
      ? `<button class="text-button is-danger" type="button" data-delete-price="${escapeHtml(deleteId)}">삭제</button>`
      : "";
    return `<div class="row-actions"><input class="dojo-price" data-price="${belt.id}" inputmode="numeric" autocomplete="off" aria-label="${escapeHtml(belt.name)} 시세" placeholder="새 시세" /><button class="text-button" type="button" data-save-price="${belt.id}">기록</button>${remove}</div>`;
  }

  function priceDelta(row, older) {
    if (!older) return { text: "-", className: "" };
    const diff = BigInt(row.price) - BigInt(older.price);
    if (diff === 0n) return { text: "0", className: "" };
    return {
      text: diff > 0n ? `+${formatCount(diff)}` : formatCount(diff),
      className: diff > 0n ? "is-gain" : "is-loss",
    };
  }

  function paintBelts() {
    const body = BELTS.map((belt) => {
      const history = priceRows.filter((row) => row.belt === belt.id);
      const name = `<td rowspan="${Math.max(history.length, 1)}">${beltLabel(belt)}<div class="hint">${escapeHtml(formatCount(belt.score))}점</div></td>`;
      if (!history.length) {
        return `<tr>${name}<td colspan="3">아직 시세가 없습니다.</td><td>${priceEditor(belt)}</td></tr>`;
      }
      return history
        .map((row, index) => {
          const latest = index === 0;
          const delta = priceDelta(row, history[index + 1]);
          return `<tr>${latest ? name : ""}<td class="num">${escapeHtml(formatCount(row.price))}</td><td class="num ${delta.className}">${escapeHtml(delta.text)}</td><td>${escapeHtml(formatWhen(row.created_at))}</td><td>${latest ? priceEditor(belt, row.id) : `<button class="text-button is-danger" type="button" data-delete-price="${escapeHtml(row.id)}">삭제</button>`}</td></tr>`;
        })
        .join("");
    }).join("");
    belts.innerHTML = `<div class="table-wrap"><table class="data-table dojo-prices"><thead><tr><th>허리띠</th><th>시세</th><th>이전과 차이</th><th>기록</th><th></th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function paintRecords() {
    if (!recordRows.length) {
      records.innerHTML = `<p class="empty">저장된 캐릭터가 없습니다.</p>`;
      return;
    }
    const openCharacterId = form.dataset.openCharacter || "";
    const openParty = form.dataset.openParty || "solo";
    const ranked = recordRows
      .map((row) => ({
        row,
        actual: measuredRoutes(parseFloors(row.floors), row.party, row.runs).best,
      }))
      .sort((left, right) => {
        if (left.actual && right.actual) {
          const speed = compareRoutes(
            { points: left.actual.route.points, seconds: left.actual.seconds, start: left.actual.route.start },
            { points: right.actual.route.points, seconds: right.actual.seconds, start: right.actual.route.start },
          );
          if (speed) return speed;
        } else if (left.actual) return -1;
        else if (right.actual) return 1;
        return left.row.character_name.localeCompare(right.row.character_name, "ko");
      });
    const body = ranked
      .map(({ row, actual }) => {
        const party = row.party ? "team" : "solo";
        const selected = row.character_id === openCharacterId && party === openParty;
        const open = row.character_id ? ` data-open="${escapeHtml(row.character_id)}" data-party="${party}" tabindex="0"` : "";
        const actualChain = actual ? chainText(actual.route.saves) : "-";
        const actualTime = actual ? formatDuration(actual.seconds) : "-";
        const perSecond = actual ? formatPointsPerSecond(actual.route.points, actual.seconds) : "-";
        const perPoint = actual ? formatSecondsPerPoint(actual.route.points, actual.seconds) : "-";
        const belt = !actual ? "-" : beltText(actual.route, actual.seconds, row.score || 0);
        const hour = !actual ? "-" : hourText(actual.route, actual.seconds);
        const popped = arriveCard && selected ? " is-pop" : "";
        const face = faceMarkup(characters.find((item) => item.id === row.character_id)?.face_url);
        const picked = selected ? `<span class="dojo-picked">선택됨</span>` : "";
        return `<article class="dojo-card${selected ? " is-selected" : ""}${popped}"${open}${selected ? ` aria-current="true"` : ""}>
          <div class="dojo-card-head">
            ${face}
            <h3>${escapeHtml(row.character_name)}</h3>
            ${picked}
            <span class="dojo-mode">${row.party ? "팀" : "개인"}</span>
            <button class="text-button is-danger" type="button" data-delete="${escapeHtml(row.id)}">삭제</button>
          </div>
          <div class="dojo-card-hero">
            <span>검은 허리띠까지</span>
            <strong>${escapeHtml(belt)}</strong>
            <p class="dojo-card-meso"><span>시간당 메소</span><b>${escapeHtml(hour)}</b></p>
          </div>
          <ul class="dojo-card-extra">
            <li class="is-route"><span>실제 경로</span><strong>${escapeHtml(actualChain)}</strong></li>
            <li><span>실제 시간</span><strong>${escapeHtml(actualTime)}</strong></li>
            <li><span>초당 점수</span><strong>${escapeHtml(perSecond)}</strong></li>
            <li><span>점수당 초</span><strong>${escapeHtml(perPoint)}</strong></li>
          </ul>
        </article>`;
      })
      .join("");
    records.innerHTML = `<div class="dojo-cards">${body}</div>`;
    arriveCard = false;
  }

  function fillSheet(row, characterId, party) {
    cancelClock();
    bandPending = null;
    routePending = null;
    clockTarget = "";
    const id = characterId || row?.character_id || "";
    const mode = party || (row?.party ? "team" : "solo");
    form.dataset.editingId = row?.id || "";
    form.dataset.openCharacter = id;
    form.dataset.openParty = mode;
    form.elements.character_id.value = id;
    form.elements.party.value = mode;
    form.elements.score.value = row?.score == null ? "" : String(row.score);
    const times = parseFloors(row?.floors);
    for (const band of BANDS) {
      form.elements[`band_${band.start}`].value = times.has(band.start) ? String(times.get(band.start)) : "";
    }
    draftRuns = readRuns(row?.runs);
    paintPlan();
    paintWho();
    savedSnapshot = snapshot();
    if (recordRows.length) paintRecords();
  }

  function paintWho() {
    const who = root.querySelector("[data-who]");
    const label = root.querySelector("[data-picked-label]");
    const id = form.dataset.openCharacter || form.elements.character_id.value;
    const character = characters.find((row) => row.id === id);
    const mode = form.elements.party.value === "team" ? "팀" : "개인";
    if (!who) return;
    if (!character) {
      who.classList.remove("is-on");
      who.innerHTML = `<div class="dojo-who-copy"><p class="dojo-who-kicker">구간 시간</p><h2>캐릭터를 선택해 주세요</h2></div>`;
      if (label) label.hidden = true;
      return;
    }
    const job = character.job ? escapeHtml(character.job) : "";
    const level = character.level ? `Lv ${escapeHtml(formatCount(character.level))}` : "";
    const meta = [job, level, mode].filter(Boolean).join(" · ");
    const face = character.face_url ? faceMarkup(character.face_url) : "";
    who.classList.add("is-on");
    who.innerHTML = `${face}<div class="dojo-who-copy"><p class="dojo-who-kicker">구간 시간</p><h2>${escapeHtml(character.name)}</h2><p class="dojo-who-meta">${meta}</p></div>`;
    if (label) {
      label.hidden = false;
      label.textContent = `${character.name} · ${mode}`;
    }
  }

  function sheetFor(characterId, party) {
    if (!characterId) return null;
    const team = party === "team";
    return recordRows.find((item) => item.character_id === characterId && Boolean(item.party) === team) ?? null;
  }

  function openSheet(characterId, party) {
    const previousCharacter = form.dataset.openCharacter || "";
    const previousParty = form.dataset.openParty || "solo";
    if (characterId === previousCharacter && party === previousParty) return true;
    if (snapshot() !== savedSnapshot && !window.confirm("저장하지 않은 내용이 있습니다. 다른 기록을 열까요?")) {
      form.elements.character_id.value = previousCharacter;
      form.elements.party.value = previousParty;
      return false;
    }
    fillSheet(sheetFor(characterId, party), characterId, party);
    return true;
  }

  function clearInputs() {
    cancelClock();
    bandPending = null;
    routePending = null;
    clockTarget = "";
    form.elements.score.value = "";
    for (const band of BANDS) form.elements[`band_${band.start}`].value = "";
    draftRuns = new Map();
    paintPlan();
  }

  function showError(target, error) {
    target.innerHTML = `<p class="form-message is-error"></p>`;
    target.querySelector("p").textContent = translateDbError(error);
  }

  async function load() {
    const id = ++loadId;
    belts.innerHTML = `<p class="empty">시세를 불러오는 중입니다.</p>`;
    records.innerHTML = `<p class="empty">기록을 불러오는 중입니다.</p>`;
    const supabase = await getSupabase();
    if (id !== loadId || !root.isConnected) return;
    const legacyColumns = recordColumns.replace(", runs", "");
    let characterResult = await supabase.from("characters").select("id, account_id, name, job, level, face_path");
    if (characterResult.error && missingFaceColumn(characterResult.error)) {
      characterResult = await supabase.from("characters").select("id, account_id, name, job, level");
    }
    const [accountResult, priceResult, recordResult] = await Promise.all([
      supabase.from("accounts").select("id, name").order("name"),
      supabase.from("dojo_belt_prices").select("id, belt, price, created_at").order("created_at", { ascending: false }),
      supabase.from("dojo_records").select(recordColumns).order("created_at", { ascending: false }).then(async (result) => {
        const raw = `${result.error?.message || ""} ${result.error?.details || ""}`;
        if (!result.error || !/\bruns\b/i.test(raw)) {
          if (!result.error) runsReady = true;
          return result;
        }
        runsReady = false;
        return supabase.from("dojo_records").select(legacyColumns).order("created_at", { ascending: false });
      }),
    ]);
    if (id !== loadId || !root.isConnected) return;
    if (characterResult.error) {
      showError(belts, characterResult.error);
      return;
    }
    characters = characterResult.data ?? [];
    await attachFaceUrls(supabase, characters);
    if (id !== loadId || !root.isConnected) return;
    if (accountResult.error) notify(translateDbError(accountResult.error), "error");
    accounts = accountResult.error ? [] : sortByName(accountResult.data ?? []);
    paintCharacters();
    if (priceResult.error) showError(belts, priceResult.error);
    else {
      priceRows = priceResult.data ?? [];
      paintBelts();
    }
    if (recordResult.error) showError(records, recordResult.error);
    else {
      recordRows = recordResult.data ?? [];
      paintRecords();
      if (!runsReady) {
        records.insertAdjacentHTML(
          "afterbegin",
          `<p class="form-message is-error">돌아본 시간을 저장하려면 Supabase SQL Editor에서 sql/018_dojo_character_runs.sql 을 실행해 주세요.</p>`,
        );
      }
    }
    paintPlan();
    paintWho();
  }

  async function savePrice(beltId) {
    const input = root.querySelector(`[data-price="${beltId}"]`);
    const parsed = readBig(input?.value ?? "", `${beltName(beltId)} 시세`, 0n);
    if (parsed.error) {
      notify(parsed.error, "error");
      return;
    }
    if (parsed.value == null) {
      notify("시세를 입력해 주세요.", "error");
      return;
    }
    const latest = latestPrices().get(beltId);
    if (latest && samePrice(latest.price, parsed.value)) {
      notify("지금 시세와 같습니다.", "info");
      return;
    }
    const supabase = await getSupabase();
    const { error } = await supabase.from("dojo_belt_prices").insert({ belt: beltId, price: parsed.value.toString() });
    if (!root.isConnected) return;
    if (error) {
      notify(translateDbError(error), "error");
      return;
    }
    notify("시세를 기록했습니다.");
    await load();
  }

  async function deletePrice(id) {
    const row = priceRows.find((item) => item.id === id);
    if (!row) return;
    if (!window.confirm(`${beltName(row.belt)} ${formatCount(row.price)} 시세 기록을 삭제할까요?`)) return;
    const supabase = await getSupabase();
    const { error } = await supabase.from("dojo_belt_prices").delete().eq("id", id);
    if (!root.isConnected) return;
    if (error) {
      notify(translateDbError(error), "error");
      return;
    }
    notify("시세 기록을 삭제했습니다.");
    await load();
  }

  async function persistSheet(doneMessage = "구간 시간을 저장했습니다.") {
    if (saving) return false;
    const synced = syncRuns();
    if (synced.error) {
      notify(synced.error, "error");
      return false;
    }
    const current = floorsOf();
    if (current.error) {
      notify(current.error, "error");
      return false;
    }
    if (!current.times.size) {
      notify("구간 초를 하나 이상 입력해 주세요.", "error");
      return false;
    }
    const character = readCharacter();
    if (character.error) {
      notify(character.error, "error");
      return false;
    }
    const existing = sheetFor(character.characterId, current.party ? "team" : "solo");
    const editingId = existing?.id || "";
    const payload = {
      character_id: character.characterId,
      character_name: character.characterName,
      party: current.party,
      floors: Object.fromEntries(current.times),
      score: form.elements.score.value.trim() ? current.score : null,
    };
    if (runsReady) payload.runs = Object.fromEntries(draftRuns);
    saving = true;
    const supabase = await getSupabase();
    const request = editingId
      ? supabase.from("dojo_records").update(payload).eq("id", editingId).select("id").single()
      : supabase.from("dojo_records").insert(payload).select("id").single();
    const { data, error } = await request;
    saving = false;
    if (!root.isConnected) return false;
    if (error) {
      notify(translateDbError(error), "error");
      return false;
    }
    form.dataset.editingId = data.id;
    form.dataset.openCharacter = character.characterId;
    form.dataset.openParty = current.party ? "team" : "solo";
    savedSnapshot = snapshot();
    if (!runsReady && draftRuns.size) {
      notify("구간 시간은 저장했습니다. 돌아본 시간은 sql/018_dojo_character_runs.sql 을 실행한 뒤에 저장됩니다.", "info");
    } else notify(doneMessage);
    await load();
    return true;
  }

  async function saveRoute(key) {
    const parsed = readRun(key);
    if (parsed.error) {
      notify(parsed.error, "error");
      return;
    }
    if (parsed.seconds == null) {
      notify("저장할 실제 시간을 입력해 주세요.", "error");
      return;
    }
    applyRun(key);
    await persistSheet("실제 시간을 저장했습니다.");
  }

  async function saveRecord(event) {
    event.preventDefault();
    await persistSheet();
  }

  async function deleteRecord(id) {
    const row = recordRows.find((item) => item.id === id);
    if (!row) return;
    if (!window.confirm(`${row.character_name} ${row.party ? "팀" : "개인"} 구간 시간을 삭제할까요?`)) return;
    const supabase = await getSupabase();
    const { error } = await supabase.from("dojo_records").delete().eq("id", id);
    if (!root.isConnected) return;
    if (error) {
      notify(translateDbError(error), "error");
      return;
    }
    if (form.dataset.editingId === id) fillSheet(null, form.dataset.openCharacter || "", form.dataset.openParty || "solo");
    notify("구간 시간을 삭제했습니다.");
    await load();
  }

  let arriveTimer = 0;

  function markArrived() {
    const editor = form.querySelector(".editor");
    if (!editor) return;
    editor.classList.remove("is-arrived");
    void editor.offsetWidth;
    editor.classList.add("is-arrived");
    window.clearTimeout(arriveTimer);
    arriveTimer = window.setTimeout(() => editor.classList.remove("is-arrived"), 900);
  }

  function scrollToSheet() {
    const bar = document.querySelector(".topbar");
    const offset = (bar?.getBoundingClientRect().height ?? 58) + 14;
    form.style.scrollMarginTop = `${offset}px`;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const distance = Math.abs(form.getBoundingClientRect().top - offset);
    if (reduce || distance < 12) {
      if (distance >= 12) form.scrollIntoView({ block: "start" });
      markArrived();
      return;
    }
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    let settled = false;
    let fallback = 0;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("scroll", watch);
      window.removeEventListener("scrollend", finish);
      window.clearTimeout(fallback);
      markArrived();
    };
    const watch = () => {
      window.clearTimeout(fallback);
      fallback = window.setTimeout(finish, 140);
    };
    fallback = window.setTimeout(finish, 1400);
    window.addEventListener("scroll", watch, { passive: true });
    window.addEventListener("scrollend", finish);
  }

  form.addEventListener("input", (event) => {
    if (event.target.matches("[data-run-part]")) {
      applyRun(event.target.dataset.runKey);
      return;
    }
    if (event.target.name?.startsWith("band_") || event.target.name === "score") paintPlan();
  });
  form.addEventListener("change", (event) => {
    if (event.target.matches("[data-clock-target]")) {
      clockTarget = event.target.value;
      return;
    }
    if (event.target.matches("[data-run-part]")) return;
    if (event.target.name === "character_id") openSheet(event.target.value, form.elements.party.value);
    if (event.target.name === "party") openSheet(form.elements.character_id.value, event.target.value);
  });
  form.addEventListener("focusout", (event) => {
    if (!event.target.matches?.("[data-run-part]")) return;
    const next = event.relatedTarget;
    if (next?.matches?.("[data-run-part]")) return;
    if (clockPressed || next?.closest?.("[data-clock-start], [data-clock-stop], [data-clock-apply], [data-clock-reset], [data-band-start], [data-band-stop], [data-band-apply], [data-band-cancel], [data-save-clock]")) return;
    const parsed = applyRun(event.target.dataset.runKey);
    if (!parsed.error) paintPlan();
  });
  form.addEventListener("submit", (event) => {
    saveRecord(event);
  });
  records.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-open]");
    if (!card || event.target.closest("button")) return;
    event.preventDefault();
    card.click();
  });
  function burstStart(button) {
    const rect = button.getBoundingClientRect();
    const node = document.createElement("span");
    node.className = "dojo-burst";
    node.style.left = `${rect.left + rect.width / 2}px`;
    node.style.top = `${rect.top + rect.height / 2}px`;
    node.innerHTML = Array.from({ length: 10 }, (_, index) => `<i style="--a:${index * 36}deg"></i>`).join("");
    document.body.appendChild(node);
    window.setTimeout(() => node.remove(), 620);
  }

  root.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const control = event.target.closest("button, .dojo-card");
    if (!control || control.disabled) return;
    control.classList.remove("is-tap");
    void control.offsetWidth;
    control.classList.add("is-tap");
    const start = event.target.closest("[data-band-start], [data-clock-start]");
    if (start && !start.disabled) burstStart(start);
  });
  root.addEventListener("mousedown", (event) => {
    clockPressed = Boolean(event.target.closest("[data-clock-start], [data-clock-stop], [data-clock-apply], [data-clock-reset], [data-band-start], [data-band-stop], [data-band-apply], [data-band-cancel], [data-save-clock]"));
  });
  root.addEventListener("mouseup", () => {
    clockPressed = false;
  });
  root.addEventListener("click", (event) => {
    const clockStart = event.target.closest("[data-clock-start]");
    if (clockStart && !clockStart.disabled) {
      startClock();
      return;
    }
    const clockStop = event.target.closest("[data-clock-stop]");
    if (clockStop && !clockStop.disabled) {
      stopClock();
      return;
    }
    const clockApply = event.target.closest("[data-clock-apply]");
    if (clockApply) {
      applyRoutePending();
      return;
    }
    const clockReset = event.target.closest("[data-clock-reset]");
    if (clockReset) {
      resetRoutePending();
      return;
    }
    const bandStart = event.target.closest("[data-band-start]");
    if (bandStart && !bandStart.disabled) {
      startBandClock(bandStart.dataset.bandStart);
      return;
    }
    const bandStop = event.target.closest("[data-band-stop]");
    if (bandStop && !bandStop.disabled) {
      stopBandClock();
      return;
    }
    const bandApply = event.target.closest("[data-band-apply]");
    if (bandApply) {
      applyBandPending();
      return;
    }
    const saveRun = event.target.closest("[data-save-clock]");
    if (saveRun && !saveRun.disabled) {
      saveRoute(clockTarget);
      return;
    }
    const bandCancel = event.target.closest("[data-band-cancel]");
    if (bandCancel) {
      cancelBandPending();
      return;
    }
    const savePriceButton = event.target.closest("[data-save-price]");
    if (savePriceButton) {
      savePrice(savePriceButton.dataset.savePrice);
      return;
    }
    const deletePriceButton = event.target.closest("[data-delete-price]");
    if (deletePriceButton) {
      deletePrice(deletePriceButton.dataset.deletePrice);
      return;
    }
    const openRow = event.target.closest("[data-open]");
    if (openRow && !event.target.closest("button")) {
      const characterId = openRow.dataset.open;
      const party = openRow.dataset.party || "solo";
      arriveCard = true;
      if (characterId && openSheet(characterId, party)) scrollToSheet();
      else arriveCard = false;
      return;
    }
    const deleteButton = event.target.closest("[data-delete]");
    if (deleteButton && !deleteButton.closest("[data-delete-price]")) {
      deleteRecord(deleteButton.dataset.delete);
      return;
    }
    if (event.target.closest("[data-clear]")) clearInputs();
  });

  form.dataset.openParty = "solo";
  paintPlan();
  savedSnapshot = snapshot();
  await load();
}
