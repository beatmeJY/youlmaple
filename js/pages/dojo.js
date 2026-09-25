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
    return `<label class="dojo-band" data-band-row="${band.start}"${saveTitle}>
      <span class="dojo-band-name">${label}</span>
      <span class="dojo-band-time">
        <input name="band_${band.start}" inputmode="numeric" autocomplete="off" aria-label="${label} 초" />
        <span>초</span>
      </span>
      <span class="dojo-band-meta" data-band-points="${band.start}"></span>
    </label>`;
  }).join("");
}

function samePrice(left, right) {
  if (left == null || right == null) return false;
  return BigInt(left) === BigInt(right);
}

export async function render(root) {
  root.innerHTML = `
    <div class="dojo-page">
    <header class="page-header dojo-hero">
      <p class="dojo-kicker">MU LUNG</p>
      <h1>무릉도장</h1>
    </header>
    <section>
      <div class="page-toolbar">
        <h2>캐릭터</h2>
      </div>
      <div data-records></div>
    </section>
    <form id="dojo-form">
      <section>
      <div class="page-toolbar">
        <h2>구간 시간</h2>
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
        <label class="field"><span>방식</span>
          <select name="party">
            <option value="solo">개인</option>
            <option value="team">팀</option>
          </select>
        </label>
        <label class="field"><span>지금 점수</span><input name="score" inputmode="numeric" autocomplete="off" placeholder="없으면 0" /></label>
        <label class="field dojo-field-memo"><span>메모</span><textarea name="memo" rows="1" placeholder="자리, 스펙"></textarea></label>
        </div>
        <div class="dojo-bands">
          <p class="dojo-bands-title">구간 초</p>
          ${floorsTable()}
        </div>
        <div class="span-all" data-plan></div>
        <div class="button-row">
          <button class="primary-button" type="submit" data-save>이 캐릭터 저장</button>
          <button class="secondary-button" type="button" data-clear>입력 지우기</button>
        </div>
      </div>
      </section>
    </form>
    <section class="dojo-belts">
      <div class="dojo-belts-head"><span>허리띠 시세</span><span class="hint" data-belt-summary>공용 시세를 불러오는 중입니다.</span></div>
      <p class="hint">공용 시세입니다. 가격을 적으면 아래에 쌓입니다.</p>
      <div data-belts></div>
    </section>
    </div>
  `;

  const form = root.querySelector("#dojo-form");
  const belts = root.querySelector("[data-belts]");
  const records = root.querySelector("[data-records]");
  const plan = root.querySelector("[data-plan]");
  let characters = [];
  let accounts = [];
  let draftRuns = new Map();
  let savedSnapshot = "";
  let runsReady = true;
  let priceRows = [];
  let recordRows = [];
  let loadId = 0;

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
      memo: form.elements.memo.value.trim(),
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

  function shortBelt(belt) {
    return belt.name.replace(/ 허리띠$/, "");
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

  function paintPlan() {
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
      plan.innerHTML = `<p class="hint">구간 초를 모두 적으면 참고가 나옵니다.</p>`;
      return;
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
    const route = ranked[0].row.best;
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
        return `<div class="dojo-plan-row${index === 0 ? " is-selected" : ""}" data-chain="${escapeHtml(key)}">
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
      <div class="dojo-plan">
        <div class="dojo-plan-row is-head">
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
        </div>
        ${body}
      </div>
      <p class="form-message is-error" data-measured hidden></p>
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
    const summary = root.querySelector("[data-belt-summary]");
    if (summary) {
      const latest = latestPrices();
      summary.textContent = BELTS.map((belt) => {
        const row = latest.get(belt.id);
        return `${shortBelt(belt)} ${row ? formatCount(row.price) : "없음"}`;
      }).join(" · ");
    }
  }

  function paintRecords() {
    if (!recordRows.length) {
      records.innerHTML = `<p class="empty">저장된 캐릭터가 없습니다.</p>`;
      return;
    }
    const openCharacterId = form.dataset.openCharacter || "";
    const openParty = form.dataset.openParty || "solo";
    const body = recordRows
      .map((row) => {
        const measured = measuredRoutes(parseFloors(row.floors), row.party, row.runs);
        const actual = measured.best;
        const party = row.party ? "team" : "solo";
        const selected = row.character_id === openCharacterId && party === openParty;
        const open = row.character_id ? ` data-open="${escapeHtml(row.character_id)}" data-party="${party}" tabindex="0"` : "";
        const actualChain = actual ? chainText(actual.route.saves) : "-";
        const actualTime = actual ? formatDuration(actual.seconds) : "-";
        const perSecond = actual ? formatPointsPerSecond(actual.route.points, actual.seconds) : "-";
        const perPoint = actual ? formatSecondsPerPoint(actual.route.points, actual.seconds) : "-";
        const belt = !actual ? "-" : beltText(actual.route, actual.seconds, row.score || 0);
        const hour = !actual ? "-" : hourText(actual.route, actual.seconds);
        return `<article class="dojo-card${selected ? " is-selected" : ""}"${open}>
          <div class="dojo-card-head">
            <h3>${escapeHtml(row.character_name)}</h3>
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
  }

  function fillSheet(row, characterId, party) {
    const id = characterId || row?.character_id || "";
    const mode = party || (row?.party ? "team" : "solo");
    form.dataset.editingId = row?.id || "";
    form.dataset.openCharacter = id;
    form.dataset.openParty = mode;
    form.elements.character_id.value = id;
    form.elements.party.value = mode;
    form.elements.score.value = row?.score == null ? "" : String(row.score);
    form.elements.memo.value = row?.memo || "";
    const times = parseFloors(row?.floors);
    for (const band of BANDS) {
      form.elements[`band_${band.start}`].value = times.has(band.start) ? String(times.get(band.start)) : "";
    }
    draftRuns = readRuns(row?.runs);
    paintPlan();
    savedSnapshot = snapshot();
    if (recordRows.length) paintRecords();
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
    form.elements.score.value = "";
    form.elements.memo.value = "";
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
    const [characterResult, accountResult, priceResult, recordResult] = await Promise.all([
      supabase.from("characters").select("id, account_id, name, job, level"),
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
    if (accountResult.error) notify(translateDbError(accountResult.error), "error");
    accounts = accountResult.error ? [] : sortByName(accountResult.data ?? []);
    paintCharacters();
    if (priceResult.error) {
      showError(belts, priceResult.error);
      const summary = root.querySelector("[data-belt-summary]");
      if (summary) summary.textContent = "시세를 불러오지 못했습니다.";
    }
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

  async function saveRecord(event) {
    event.preventDefault();
    const synced = syncRuns();
    if (synced.error) {
      notify(synced.error, "error");
      return;
    }
    const current = floorsOf();
    if (current.error) {
      notify(current.error, "error");
      return;
    }
    if (!current.times.size) {
      notify("구간 초를 하나 이상 입력해 주세요.", "error");
      return;
    }
    const character = readCharacter();
    if (character.error) {
      notify(character.error, "error");
      return;
    }
    const existing = sheetFor(character.characterId, current.party ? "team" : "solo");
    const editingId = existing?.id || "";
    const payload = {
      character_id: character.characterId,
      character_name: character.characterName,
      party: current.party,
      floors: Object.fromEntries(current.times),
      score: form.elements.score.value.trim() ? current.score : null,
      memo: form.elements.memo.value.trim() || null,
    };
    if (runsReady) payload.runs = Object.fromEntries(draftRuns);
    const supabase = await getSupabase();
    const request = editingId
      ? supabase.from("dojo_records").update(payload).eq("id", editingId).select("id").single()
      : supabase.from("dojo_records").insert(payload).select("id").single();
    const { data, error } = await request;
    if (!root.isConnected) return;
    if (error) {
      notify(translateDbError(error), "error");
      return;
    }
    form.dataset.editingId = data.id;
    form.dataset.openCharacter = character.characterId;
    form.dataset.openParty = current.party ? "team" : "solo";
    savedSnapshot = snapshot();
    if (!runsReady && draftRuns.size) {
      notify("구간 시간은 저장했습니다. 돌아본 시간은 sql/018_dojo_character_runs.sql 을 실행한 뒤에 저장됩니다.", "info");
    } else notify("구간 시간을 저장했습니다.");
    await load();
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
    if (event.target.matches("[data-run-part]")) return;
    if (event.target.name === "character_id") openSheet(event.target.value, form.elements.party.value);
    if (event.target.name === "party") openSheet(form.elements.character_id.value, event.target.value);
  });
  form.addEventListener("focusout", (event) => {
    if (!event.target.matches?.("[data-run-part]")) return;
    const next = event.relatedTarget;
    if (next?.matches?.("[data-run-part]")) return;
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
  root.addEventListener("click", (event) => {
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
      if (characterId && openSheet(characterId, party)) scrollToSheet();
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
