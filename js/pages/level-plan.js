import { escapeHtml, formatCount, readBig, readCount } from "../format.js";
import { applyExpCoupons, asBig, buildPlan, formatMinutes, formatPerMinute, formatSigned, hourMeso } from "../hunt-calc.js";
import { findJob, normalizeJobName } from "../job-label.js";
import { levelExpSeed } from "../level-exp-seed.js";
import { getSupabase } from "../supabase-client.js";
import { notify } from "../toast.js";
import { translateDbError } from "../db-error.js";

const planKey = "yourmaple.huntPlan";

function couponCountText(count, label) {
  return `${label} ${count.toLocaleString("ko-KR")}장`;
}

function couponPlanNote(doubleCount, tripleCount, plan, savedText) {
  if (plan.cover === "triple") {
    return ` ${couponCountText(tripleCount, "15분 3배 경쿠")}이 남은 사냥보다 많아서, 전부 3배로 잡아 ${savedText} 줄었습니다.`;
  }
  if (plan.cover === "double") {
    return ` ${couponCountText(doubleCount, "15분 2배 경쿠")}이 남은 사냥보다 많아서, 전부 2배로 잡아 ${savedText} 줄었습니다.`;
  }
  const parts = [];
  if (tripleCount > 0) parts.push(couponCountText(tripleCount, "15분 3배 경쿠"));
  if (doubleCount > 0) parts.push(couponCountText(doubleCount, "15분 2배 경쿠"));
  const phrase = parts.length === 2 ? `${parts[0]}과 ${parts[1]}` : parts[0];
  if (plan.cover === "mixed") {
    return ` ${phrase}이 남은 사냥보다 많아서, 3배를 먼저 쓰고 남은 구간을 2배로 잡아 ${savedText} 줄었습니다.`;
  }
  return ` ${phrase}을 한 장씩 쓰면 ${savedText} 줄었습니다.`;
}

function moneyClass(value) {
  if (value > 0n) return "is-gain";
  if (value < 0n) return "is-loss";
  return "";
}

function writeGrouped(input, amount) {
  input.value = asBig(amount).toLocaleString("ko-KR");
}

function groupDigits(text) {
  return text.replace(/\D/g, "").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function applyGrouped(input) {
  const raw = input.value;
  const caret = input.selectionStart ?? raw.length;
  const signed = input.hasAttribute("data-signed");
  const negative = signed && raw.includes("-");
  const body = groupDigits(raw);
  const next = negative ? (body ? `-${body}` : "-") : body;
  if (next === raw) return;
  const digitsBefore = raw.slice(0, caret).replace(/\D/g, "").length;
  input.value = next;
  if (digitsBefore === 0) {
    const pos = next.startsWith("-") && raw.slice(0, caret).includes("-") ? 1 : 0;
    input.setSelectionRange(pos, pos);
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

function showMessage(target, text, kind) {
  target.hidden = !text;
  target.textContent = text;
  target.className = `form-message is-${kind}`;
}

export async function render(root) {
  root.innerHTML = `
    <div class="studio-page">
    <header class="page-header">
      <p class="studio-kicker">사냥터</p>
      <div class="studio-hero-row">
        <h1>레벨업 계산</h1>
        <div class="button-row">
          <button class="primary-button" type="button" data-goto-hunt-add>사냥 기록 추가</button>
        </div>
      </div>
    </header>
    <section class="hunt-panel is-plan">
      <div class="hunt-panel-body">
      <form class="editor plan-editor" id="plan-form">
        <label class="field span-all"><span>내 캐릭터</span><select name="character_pick"></select></label>
        <div class="hunt-picks span-all" data-hunt-picks>
          <span class="hunt-picks-label" data-hunt-picks-label>기준 사냥 기록</span>
          <div class="hunt-pick-list" data-hunt-pick-list role="group" aria-label="기준 사냥 기록">
            <p class="hunt-pick-empty">사냥 기록을 불러오는 중입니다.</p>
          </div>
        </div>
        <input type="hidden" name="hunt_pick" value="" />
        <fieldset class="plan-group span-all">
          <legend>레벨</legend>
          <div class="plan-grid is-level">
            <label class="field"><span>현재 레벨</span><input name="from_level" inputmode="numeric" autocomplete="off" /></label>
            <label class="field"><span>목표 레벨</span><input name="to_level" inputmode="numeric" enterkeyhint="next" autocomplete="off" /></label>
            <label class="field"><span>현재 경험치</span><input name="current_exp" inputmode="numeric" data-grouped autocomplete="off" placeholder="이 레벨에서 이미 채운 양" /></label>
          </div>
        </fieldset>
        <fieldset class="plan-group span-all">
          <legend>사냥 정보</legend>
          <div class="plan-grid is-rates">
            <label class="field"><span>순메소</span><input class="is-gain" name="meso_amount" value="0" inputmode="text" data-grouped data-signed autocomplete="off" placeholder="적자는 -" /></label>
            <label class="field"><span>1시간 쩔비</span><input name="leech_fee" value="0" inputmode="text" data-grouped data-signed autocomplete="off" placeholder="내가 내면 -" /></label>
            <label class="field"><span>1시간 물약</span><input class="is-loss" name="potion_cost" value="0" inputmode="numeric" data-grouped autocomplete="off" placeholder="없으면 0" /></label>
            <label class="field"><span>분당 경험치</span><input name="exp_minute" value="0" inputmode="numeric" data-grouped autocomplete="off" /></label>
            <label class="field"><span>1시간 경험치</span><input name="exp_hour" value="0" inputmode="numeric" data-grouped autocomplete="off" /></label>
            <label class="field is-hour-meso"><span>총 1시간 메소</span><input name="hour_meso" value="0" readonly tabindex="-1" autocomplete="off" aria-readonly="true" /></label>
          </div>
        </fieldset>
        <fieldset class="plan-group span-all">
          <legend>경험치 쿠폰</legend>
          <div class="plan-grid is-pair">
            <label class="field"><span>15분 경쿠 2배</span><input name="exp_coupon" inputmode="numeric" autocomplete="off" placeholder="장수" /></label>
            <label class="field"><span>15분 경쿠 3배</span><input name="exp_coupon_3" inputmode="numeric" autocomplete="off" placeholder="장수" /></label>
          </div>
        </fieldset>
      </form>
      <p class="hint" data-plan-note></p>
      <p class="form-message" data-plan-status hidden></p>
      <div class="summary is-plan" data-plan-result hidden></div>
      </div>
    </section>
    </div>
  `;

  const planForm = root.querySelector("#plan-form");
  const planNote = root.querySelector("[data-plan-note]");
  const planStatus = root.querySelector("[data-plan-status]");
  const planResult = root.querySelector("[data-plan-result]");

  let hunts = [];
  let curveRows = [];
  let characters = [];
  let jobs = [];
  let planExpSource = "minute";

  function curveOf() {
    const map = new Map();
    for (const [level, exp] of levelExpSeed) map.set(level, asBig(exp));
    return map;
  }

  function syncExp(form, source) {
    const minute = form.elements.exp_minute;
    const hour = form.elements.exp_hour;
    if (source === "minute") {
      const parsed = readBig(minute.value, "분당 경험치", 0n);
      if (parsed.error || parsed.value == null) return;
      writeGrouped(hour, parsed.value * 60n);
      return;
    }
    const parsed = readBig(hour.value, "1시간 경험치", 0n);
    if (parsed.error || parsed.value == null) return;
    if (parsed.value % 60n === 0n) writeGrouped(minute, parsed.value / 60n);
    else minute.value = "";
  }

  function readHourExp(form, source) {
    const minuteText = form.elements.exp_minute.value.trim();
    const hourText = form.elements.exp_hour.value.trim();
    if (source === "minute" && minuteText) {
      const parsed = readBig(minuteText, "분당 경험치", 1n);
      if (parsed.error) return parsed;
      if (parsed.value == null) return { error: "분당 경험치나 1시간 경험치를 입력해 주세요." };
      return { value: parsed.value * 60n };
    }
    if (hourText) {
      const parsed = readBig(hourText, "1시간 경험치", 1n);
      if (parsed.error) return parsed;
      if (parsed.value == null) return { error: "분당 경험치나 1시간 경험치를 입력해 주세요." };
      return parsed;
    }
    if (minuteText) {
      const parsed = readBig(minuteText, "분당 경험치", 1n);
      if (parsed.error) return parsed;
      if (parsed.value == null) return { error: "분당 경험치나 1시간 경험치를 입력해 주세요." };
      return { value: parsed.value * 60n };
    }
    return { error: "분당 경험치나 1시간 경험치를 입력해 주세요." };
  }

  function readSigned(amountText, label, minusHint) {
    const text = String(amountText ?? "").trim().replaceAll(",", "").replaceAll(" ", "");
    if (!text || text === "-") return { value: 0n };
    if (!/^-?\d+$/.test(text)) return { error: `${label}에는 숫자만 입력해 주세요. ${minusHint}` };
    if (text.replace("-", "").length > 40) return { error: `${label} 숫자가 너무 큽니다.` };
    return { value: BigInt(text) };
  }

  function readMeso(amountText) {
    return readSigned(amountText, "순메소", "적자는 -를 붙입니다.");
  }

  function readLeech(amountText) {
    return readSigned(amountText, "1시간 쩔비", "내가 내는 쩔비는 -를 붙입니다.");
  }

  function savePlan() {
    const data = {
      from_level: planForm.elements.from_level.value,
      to_level: planForm.elements.to_level.value,
      current_exp: planForm.elements.current_exp.value,
      exp_minute: planForm.elements.exp_minute.value,
      exp_hour: planForm.elements.exp_hour.value,
      meso_amount: planForm.elements.meso_amount.value,
      potion_cost: planForm.elements.potion_cost.value,
      leech_fee: planForm.elements.leech_fee.value,
      exp_coupon: planForm.elements.exp_coupon.value,
      exp_coupon_3: planForm.elements.exp_coupon_3.value,
      expSource: planExpSource,
    };
    try {
      sessionStorage.setItem(planKey, JSON.stringify(data));
    } catch {
      // 브라우저가 저장을 막아도 계산은 그대로 보여 줍니다.
    }
  }

  function restorePlan() {
    try {
      const raw = sessionStorage.getItem(planKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      for (const [key, value] of Object.entries(data)) {
        if (key === "expSource" || typeof value !== "string") continue;
        const field = planForm.elements.namedItem(key);
        if (field) field.value = value;
      }
      if (data.expSource === "hour" || data.expSource === "minute") planExpSource = data.expSource;
      const amount = planForm.elements.meso_amount;
      if (data.meso_sign === "0") amount.value = "";
      else if (data.meso_sign === "-1" && amount.value && !amount.value.trim().startsWith("-")) {
        amount.value = `-${amount.value.replace(/^-/, "")}`;
      }
    } catch {
      // 이전 입력이 깨져 있으면 빈 칸으로 시작합니다.
    }
  }

  function setFieldTone(input, className) {
    input.classList.toggle("is-gain", className === "is-gain");
    input.classList.toggle("is-loss", className === "is-loss");
  }

  function paintPlanMoney() {
    const mesoInput = planForm.elements.meso_amount;
    const leechInput = planForm.elements.leech_fee;
    const potionInput = planForm.elements.potion_cost;
    const totalInput = planForm.elements.hour_meso;
    const meso = readMeso(mesoInput.value);
    const leech = readLeech(leechInput.value);
    const potion = readBig(potionInput.value, "1시간 물약", 0n);
    setFieldTone(mesoInput, "is-gain");
    setFieldTone(potionInput, "is-loss");
    setFieldTone(leechInput, leech.error ? "" : moneyClass(leech.value ?? 0n));
    if (meso.error || leech.error || potion.error) {
      totalInput.value = "-";
      setFieldTone(totalInput, "");
      return;
    }
    const net = hourMeso(meso.value ?? 0n, leech.value ?? 0n, potion.value ?? 0n);
    totalInput.value = formatSigned(net);
    setFieldTone(totalInput, moneyClass(net));
  }

  function paintPlan() {
    paintPlanMoney();
    savePlan();
    const fromText = planForm.elements.from_level.value;
    const toText = planForm.elements.to_level.value;
    if (!fromText.trim() || !toText.trim()) {
      planResult.hidden = true;
      planResult.innerHTML = "";
      showMessage(planStatus, "", "info");
      planNote.textContent = "";
      return;
    }

    const from = readCount(fromText, "현재 레벨", 1);
    const to = from.error ? from : readCount(toText, "목표 레벨", 1);
    const current = to.error ? to : readBig(planForm.elements.current_exp.value, "현재 경험치", 0n);
    const exp = current.error ? current : readHourExp(planForm, planExpSource);
    const allowEmptyExp = exp.error === "분당 경험치나 1시간 경험치를 입력해 주세요.";
    const meso = exp.error && !allowEmptyExp ? exp : readMeso(planForm.elements.meso_amount.value);
    const potion = meso.error ? meso : readBig(planForm.elements.potion_cost.value, "1시간 물약", 0n);
    const leech = potion.error ? potion : readLeech(planForm.elements.leech_fee.value);
    const coupon = leech.error ? leech : readCount(planForm.elements.exp_coupon.value, "15분 경쿠 2배", 0);
    const coupon3 = coupon.error ? coupon : readCount(planForm.elements.exp_coupon_3.value, "15분 경쿠 3배", 0);
    const failed = [from, to, current, allowEmptyExp ? { error: "" } : exp, meso, potion, leech, coupon, coupon3].find((item) => item.error);
    if (failed) {
      planResult.hidden = true;
      planResult.innerHTML = "";
      planNote.textContent = "";
      showMessage(planStatus, failed.error, "error");
      return;
    }

    let result;
    try {
      result = buildPlan({
        fromLevel: from.value,
        toLevel: to.value,
        currentExp: current.value ?? 0n,
        expPerHour: allowEmptyExp ? null : exp.value,
        mesoPerHour: meso.value ?? 0n,
        potionPerHour: potion.value ?? 0n,
        leechPerHour: leech.value ?? 0n,
        curve: curveOf(),
      });
    } catch {
      result = { error: "계산하지 못했습니다. 입력한 숫자를 확인해 주세요." };
    }
    if (result.error) {
      planResult.hidden = true;
      planResult.innerHTML = "";
      planNote.textContent = "";
      showMessage(planStatus, result.error, "error");
      return;
    }

    showMessage(planStatus, "", "info");
    const cards = coupon.value ?? 0;
    const cards3 = coupon3.value ?? 0;
    const couponPlan =
      (cards > 0 || cards3 > 0) && result.minutes != null && result.minutes > 0n
        ? applyExpCoupons(result.remaining, exp.value, { double: cards, triple: cards3 })
        : null;
    const time = result.minutes == null ? "경험치를 입력해 주세요" : result.remaining === 0n ? "이미 채웠습니다" : formatMinutes(result.minutes);
    const couponTime = couponPlan ? `<article><span>경쿠 후</span><strong>${escapeHtml(formatMinutes(couponPlan.minutes))}</strong></article>` : "";
    const savedText = couponPlan ? (couponPlan.saved > 0n ? formatMinutes(couponPlan.saved) : "1분 미만") : "";
    const couponSaved = couponPlan ? `<article><span>단축</span><strong class="is-gain">${escapeHtml(savedText)}</strong></article>` : "";
    const grossValue = meso.value ?? 0n;
    const leechValue = leech.value ?? 0n;
    const potionValue = potion.value ?? 0n;
    const hourNet = hourMeso(grossValue, leechValue, potionValue);
    const netText = result.net == null ? "-" : formatSigned(result.net);
    planResult.hidden = false;
    planResult.innerHTML = `
      <article><span>남은 경험치</span><strong>${escapeHtml(formatCount(result.remaining))}</strong></article>
      <article><span>걸리는 시간</span><strong>${escapeHtml(time)}</strong></article>
      ${couponTime}
      ${couponSaved}
      <article><span>1시간 메소</span><strong class="${moneyClass(hourNet)}">${escapeHtml(formatSigned(hourNet))}</strong></article>
      <article><span>예상 금액</span><strong class="${result.net == null ? "" : moneyClass(result.net)}">${escapeHtml(netText)}</strong></article>
    `;
    const couponNote = couponPlan ? couponPlanNote(cards, cards3, couponPlan, savedText) : "";
    planNote.textContent = couponNote.trim();
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

  function characterSelectHtml(placeholder) {
    return [`<option value="">${placeholder}</option>`, ...[...characters].sort(compareCharacter).map(characterOption)].join("");
  }

  function paintCharacterPick() {
    const select = planForm.elements.character_pick;
    const current = select.value;
    select.innerHTML = characterSelectHtml("캐릭터에서 레벨 가져오기");
    if (current && characters.some((character) => character.id === current)) select.value = current;
  }

  function pickedCharacter() {
    return characters.find((item) => item.id === planForm.elements.character_pick.value) || null;
  }

  function sameJob(left, right) {
    const leftJob = findJob(jobs, left);
    const rightJob = findJob(jobs, right);
    if (leftJob && rightJob) return leftJob.id === rightJob.id;
    const key = normalizeJobName(left);
    return Boolean(key) && key === normalizeJobName(right);
  }

  function compareHuntLevel(left, right) {
    const level = Number(right.level || 0) - Number(left.level || 0);
    if (level) return level;
    return String(right.created_at || "").localeCompare(String(left.created_at || ""));
  }

  function huntsForCharacter() {
    const character = pickedCharacter();
    const rows = character ? hunts.filter((row) => sameJob(row.job, character.job)) : hunts;
    return [...rows].sort(compareHuntLevel);
  }

  function huntFigures(row) {
    try {
      const hourValue = asBig(row.exp_per_hour);
      const grossValue = asBig(row.meso_per_hour);
      const leechValue = asBig(row.leech_fee);
      const potionValue = asBig(row.potion_cost);
      const netValue = hourMeso(grossValue, leechValue, potionValue);
      return {
        minute: formatPerMinute(hourValue),
        meso: formatSigned(netValue),
        mesoClass: moneyClass(netValue),
      };
    } catch {
      return { minute: "-", meso: "-", mesoClass: "" };
    }
  }

  function paintHuntPick() {
    const input = planForm.elements.hunt_pick;
    const list = root.querySelector("[data-hunt-pick-list]");
    const label = root.querySelector("[data-hunt-picks-label]");
    const character = pickedCharacter();
    const rows = character ? huntsForCharacter() : [];
    if (character && input.value && !rows.some((row) => row.id === input.value)) input.value = "";
    const selected = input.value;
    if (!character) {
      label.textContent = "기준 사냥 기록";
      list.innerHTML = `<p class="hunt-pick-empty">캐릭터를 고르면 그 직업의 사냥 기록이 카드로 나옵니다.</p>`;
      return;
    }
    if (!rows.length) {
      label.textContent = "기준 사냥 기록";
      const who = character.job || character.name;
      list.innerHTML = `<p class="hunt-pick-empty">${escapeHtml(who)} 사냥 기록이 없습니다. <a href="#/hunts?add=1">사냥 기록 추가</a>에서 만들어 보세요.</p>`;
      return;
    }
    label.textContent = `기준 사냥 기록 · ${rows.length}개 · 레벨 높은 순`;
    list.innerHTML = rows
      .map((row) => {
        const figures = huntFigures(row);
        const heading = String(row.title || "").trim() || row.character_name;
        const other = row.character_name && row.character_name !== character.name ? row.character_name : "";
        const pressed = row.id === selected;
        const meta = other ? `<span class="hunt-pick-meta">${escapeHtml(other)}</span>` : "";
        const mark = pressed ? `<span class="hunt-pick-badge">기준</span>` : `<span class="hunt-pick-radio" aria-hidden="true"></span>`;
        return `<button class="hunt-pick${pressed ? " is-selected" : ""}" type="button" data-pick-hunt="${row.id}" aria-pressed="${pressed ? "true" : "false"}">
          <span class="hunt-pick-top">
            <span class="hunt-pick-title">${escapeHtml(heading)}</span>
            ${mark}
          </span>
          <span class="hunt-pick-level">${escapeHtml(formatCount(row.level))}레벨</span>
          ${meta}
          <span class="hunt-pick-stats">
            <span><span>분당 경험치</span><strong>${escapeHtml(figures.minute)}</strong></span>
            <span><span>1시간 메소</span><strong class="${figures.mesoClass}">${escapeHtml(figures.meso)}</strong></span>
          </span>
        </button>`;
      })
      .join("");
    const chosen = list.querySelector(".hunt-pick.is-selected");
    if (!chosen || chosen.offsetParent !== list) return;
    const top = chosen.offsetTop;
    const bottom = top + chosen.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }

  function focusPlanInput(input, options = {}) {
    input.focus({ focusVisible: true, preventScroll: Boolean(options.preventScroll) });
    const end = input.value.length;
    input.setSelectionRange(0, end);
  }

  function ensureNextTarget() {
    const from = Number(planForm.elements.from_level.value);
    if (!Number.isInteger(from) || from < 1 || from >= 200) return;
    if (planForm.elements.to_level.value.trim()) return;
    planForm.elements.to_level.value = String(from + 1);
  }

  function revealCurrentExp() {
    const input = planForm.elements.current_exp;
    focusPlanInput(input, { preventScroll: true });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const margin = Number.parseFloat(getComputedStyle(input).scrollMarginTop) || 0;
    const top = input.getBoundingClientRect().top + window.scrollY - margin;
    window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
  }

  const planBlankFields = ["to_level", "current_exp", "exp_coupon", "exp_coupon_3"];
  const planInfoFields = ["meso_amount", "leech_fee", "potion_cost", "exp_minute", "exp_hour"];

  function clearPlanRates() {
    for (const name of planBlankFields) planForm.elements[name].value = "";
    for (const name of planInfoFields) planForm.elements[name].value = "0";
    planForm.elements.hunt_pick.value = "";
    planExpSource = "minute";
  }

  function applyCharacter(character) {
    clearPlanRates();
    planForm.elements.from_level.value = character.level ? String(character.level) : "";
    ensureNextTarget();
    paintHuntPick();
    paintPlan();
  }

  function applyHunt(hunt) {
    if (!pickedCharacter()) planForm.elements.from_level.value = String(hunt.level);
    ensureNextTarget();
    const hour = asBig(hunt.exp_per_hour);
    writeGrouped(planForm.elements.exp_hour, hour);
    if (hour % 60n === 0n) writeGrouped(planForm.elements.exp_minute, hour / 60n);
    else planForm.elements.exp_minute.value = "";
    planExpSource = "hour";
    writeGrouped(planForm.elements.meso_amount, asBig(hunt.meso_per_hour));
    writeGrouped(planForm.elements.leech_fee, asBig(hunt.leech_fee));
    writeGrouped(planForm.elements.potion_cost, asBig(hunt.potion_cost));
    planForm.elements.hunt_pick.value = hunt.id;
    paintHuntPick();
    paintPlan();
    const huntId = hunt.id;
    setTimeout(() => {
      if (!planForm.isConnected) return;
      if (planForm.elements.hunt_pick.value !== huntId) return;
      revealCurrentExp();
    }, 0);
  }

  async function saveMissingLevels(supabase) {
    const have = new Set(curveRows.map((row) => Number(row.level)));
    const missing = levelExpSeed.filter(([level]) => !have.has(level));
    if (!missing.length) return { error: null, added: 0 };
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (sessionError || !userId) return { error: sessionError || { message: "JWT" }, added: 0 };
    const payload = missing.map(([level, exp]) => ({
      user_id: userId,
      level,
      exp_to_next: exp,
    }));
    const { data, error } = await supabase
      .from("level_exp")
      .upsert(payload, { onConflict: "user_id,level" })
      .select("id, level, exp_to_next");
    if (error) return { error, added: 0 };
    const byLevel = new Map(curveRows.map((row) => [Number(row.level), row]));
    for (const row of data ?? []) byLevel.set(Number(row.level), row);
    curveRows = [...byLevel.values()].sort((a, b) => Number(a.level) - Number(b.level));
    return { error: null, added: data?.length ?? missing.length };
  }

  async function loadAll() {
    const supabase = await getSupabase();
    const [huntResult, curveResult, characterResult] = await Promise.all([
      supabase.from("hunts").select("id, character_id, character_name, job, level, potion_cost, leech_fee, exp_per_hour, meso_per_hour, title, memo, created_at").order("created_at", { ascending: false }),
      supabase.from("level_exp").select("id, level, exp_to_next").order("level", { ascending: true }),
      supabase.from("characters").select("id, account_id, name, job, level, current_exp"),
    ]);
    const jobResult = await supabase.from("jobs").select("id, family, name, color, color_dark, sort_order").order("sort_order");
    if (!root.isConnected) return;
    const error = huntResult.error || curveResult.error || characterResult.error;
    if (error) {
      hunts = [];
      curveRows = [];
      characters = [];
      jobs = [];
      notify(translateDbError(error), "error");
      paintPlan();
      return;
    }
    hunts = huntResult.data ?? [];
    curveRows = curveResult.data ?? [];
    characters = characterResult.data ?? [];
    jobs = jobResult.error ? [] : (jobResult.data ?? []);
    const seeded = await saveMissingLevels(supabase);
    if (!root.isConnected) return;
    if (seeded.error) notify(translateDbError(seeded.error), "error");
    paintCharacterPick();
    paintHuntPick();
    paintPlan();
  }

  restorePlan();
  paintPlanMoney();
  planForm.addEventListener("submit", (event) => event.preventDefault());
  planForm.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    if (event.target !== planForm.elements.to_level) return;
    event.preventDefault();
    focusPlanInput(planForm.elements.current_exp);
  });

  root.addEventListener("input", (event) => {
    if (event.target.closest("[data-grouped]")) applyGrouped(event.target);
    if (event.target.form === planForm && (event.target.name === "exp_minute" || event.target.name === "exp_hour")) {
      planExpSource = event.target.name === "exp_minute" ? "minute" : "hour";
      syncExp(planForm, planExpSource);
    }
    if (event.target.form === planForm) paintPlan();
  });

  root.addEventListener("change", (event) => {
    if (event.target === planForm.elements.character_pick) {
      const character = characters.find((item) => item.id === event.target.value);
      if (character) {
        applyCharacter(character);
        return;
      }
      clearPlanRates();
      planForm.elements.from_level.value = "";
      paintHuntPick();
      paintPlan();
    }
  });

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-goto-hunt-add]")) {
      location.hash = "#/hunts?add=1";
    }
    const pickButton = event.target.closest("[data-pick-hunt]");
    if (pickButton) {
      const hunt = hunts.find((item) => item.id === pickButton.dataset.pickHunt);
      if (hunt) applyHunt(hunt);
    }
  });

  await loadAll();
}
