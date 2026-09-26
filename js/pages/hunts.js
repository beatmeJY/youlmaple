import { translateDbError } from "../db-error.js";
import { escapeHtml, formatCount, readBig, readCount, sortByName } from "../format.js";
import { matchesPointLevel, matchesText, readLevelFilter } from "../filters.js";
import { applyExpCoupons, asBig, buildPlan, formatMinutes, formatPerMinute, formatSigned, hourMeso } from "../hunt-calc.js";
import { findJob, jobDisplayName, jobStyle, normalizeJobName } from "../job-label.js";
import { levelExpSeed } from "../level-exp-seed.js";
import { getSupabase } from "../supabase-client.js";
import { notify } from "../toast.js";

const huntColumns =
  "id, character_id, character_name, job, level, potion_cost, leech_fee, exp_per_hour, meso_per_hour, title, memo, created_at";

const planKey = "yourmaple.huntPlan";
const jobFamilies = ["전사", "마법사", "궁수", "도적", "해적"];

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
        <h1>사냥</h1>
      </div>
    </header>
    <section id="level-plan" class="hunt-panel is-plan">
      <div class="hunt-panel-head">
        <div>
          <p class="hunt-panel-kicker">계산</p>
          <h2>레벨업 계산</h2>
        </div>
      </div>
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
    <div class="hunt-split" role="separator" aria-label="계산과 기록 구분">
      <span class="hunt-split-rail" aria-hidden="true"></span>
      <span class="hunt-split-mark">기록</span>
      <span class="hunt-split-rail" aria-hidden="true"></span>
    </div>
    <section class="hunt-panel is-log">
      <div class="hunt-panel-head">
        <div>
          <p class="hunt-panel-kicker">기록</p>
          <h2>1시간 사냥 기록</h2>
        </div>
        <button class="primary-button" type="button" data-add-hunt>사냥 기록 추가</button>
      </div>
      <div class="hunt-panel-body">
      <div class="hunt-jobs" data-hunt-jobs>
        <div data-hunt-job-list>
          <p class="hunt-pick-empty">직업을 불러오는 중입니다.</p>
        </div>
      </div>
      <form class="editor" id="hunt-form" hidden>
        <h2 data-hunt-title>사냥 기록 추가</h2>
        <label class="field"><span>캐릭터</span><select name="character_id"></select></label>
        <label class="field" data-name-field><span>캐릭터명</span><input name="character_name" autocomplete="off" /></label>
        <label class="field"><span>직업</span><input name="job" autocomplete="off" /></label>
        <label class="field"><span>레벨</span><input name="level" inputmode="numeric" autocomplete="off" /></label>
        <label class="field span-all"><span>사냥 이름</span><input name="title" autocomplete="off" placeholder="맵, 자리처럼 이 사냥을 구분하는 이름" /></label>
        <label class="field"><span>분당 경험치</span><input name="exp_minute" inputmode="numeric" data-grouped autocomplete="off" placeholder="1시간 대신 적어도 됩니다" /></label>
        <label class="field"><span>1시간 경험치</span><input name="exp_hour" inputmode="numeric" data-grouped autocomplete="off" placeholder="분당 대신 적어도 됩니다" /></label>
        <label class="field"><span>순메소</span><input name="meso_amount" inputmode="text" data-grouped data-signed autocomplete="off" placeholder="적자는 -. 없으면 비움" /></label>
        <label class="field"><span>1시간 쩔비</span><input name="leech_fee" inputmode="text" data-grouped data-signed autocomplete="off" placeholder="내가 내면 -" /></label>
        <label class="field"><span>1시간 물약</span><input name="potion_cost" inputmode="numeric" data-grouped autocomplete="off" placeholder="없으면 0" /></label>
        <div class="summary is-plan span-all" data-hunt-net>
          <article>
            <span>1시간 메소</span>
            <strong data-hunt-net-value>0</strong>
            <p class="hint" data-hunt-net-note>순메소 + 쩔비 − 물약</p>
          </article>
        </div>
        <label class="field"><span>메모</span><textarea name="memo" placeholder="누구에게 얼마를 받았는지처럼 남겨 둘 내용"></textarea></label>
        <p class="hint span-all">분당과 1시간 중 하나만 적어도 다른 칸이 채워집니다. 둘 다 적었다면 마지막에 고친 칸을 저장합니다.</p>
        <div class="button-row">
          <button class="primary-button" type="submit">저장</button>
          <button class="secondary-button" type="button" data-cancel-hunt>취소</button>
        </div>
      </form>
      <div class="filters">
        <label class="field"><span>캐릭터</span><input data-hunt-search placeholder="이름, 캐릭터, 직업, 메모" /></label>
        <label class="field"><span>레벨 최소</span><input data-hunt-min inputmode="numeric" /></label>
        <label class="field"><span>레벨 최대</span><input data-hunt-max inputmode="numeric" /></label>
      </div>
      <div data-hunt-list></div>
      </div>
    </section>
    <dialog class="quest-dialog" data-hunt-dialog>
      <div class="quest-dialog-head">
        <div>
          <p class="quest-dialog-kicker" data-memo-kicker></p>
          <h2>메모</h2>
        </div>
        <button class="icon-button" type="button" data-close-memo>닫기</button>
      </div>
      <div class="quest-dialog-body">
        <div class="quest-block">
          <p data-memo-body></p>
        </div>
      </div>
    </dialog>
    </div>
  `;

  const planForm = root.querySelector("#plan-form");
  const planNote = root.querySelector("[data-plan-note]");
  const planStatus = root.querySelector("[data-plan-status]");
  const planResult = root.querySelector("[data-plan-result]");
  const huntForm = root.querySelector("#hunt-form");
  const huntList = root.querySelector("[data-hunt-list]");

  let hunts = [];
  let curveRows = [];
  let characters = [];
  let accounts = [];
  let jobs = [];
  let pickedFamily = "";
  let pickedJobKey = "";
  let huntExpSource = "minute";
  let planExpSource = "minute";
  let loadId = 0;

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

  function paintHuntNet() {
    const value = huntForm.querySelector("[data-hunt-net-value]");
    const note = huntForm.querySelector("[data-hunt-net-note]");
    if (!value || !note) return;
    const gross = readMeso(huntForm.elements.meso_amount.value);
    const leech = gross.error ? gross : readLeech(huntForm.elements.leech_fee.value);
    const potion = leech.error ? leech : readBig(huntForm.elements.potion_cost.value, "1시간 물약", 0n);
    if (gross.error || leech.error || potion.error) {
      value.textContent = "-";
      value.className = "";
      note.textContent = gross.error || leech.error || potion.error;
      return;
    }
    const grossValue = gross.value ?? 0n;
    const leechValue = leech.value ?? 0n;
    const potionValue = potion.value ?? 0n;
    const net = hourMeso(grossValue, leechValue, potionValue);
    value.textContent = formatSigned(net);
    value.className = moneyClass(net);
    note.textContent = `순메소 ${formatSigned(grossValue)} + 쩔비 ${formatSigned(leechValue)} − 물약 ${formatCount(potionValue)}`;
  }

  function writeSigned(input, value) {
    if (value == null || value === "") {
      input.value = "";
      return;
    }
    const amount = asBig(value);
    if (amount === 0n) input.value = "";
    else writeGrouped(input, amount);
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
    return [`<option value="">${placeholder}</option>`, ...groups].join("");
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

  function compareHuntCreated(left, right) {
    return String(right.created_at || "").localeCompare(String(left.created_at || ""));
  }

  function activeJobName() {
    if (!pickedJobKey) return "";
    const job = jobs.find((item) => item.id === pickedJobKey);
    if (job) return jobDisplayName(job);
    const hunt = hunts.find((row) => normalizeJobName(row.job) === pickedJobKey);
    return hunt?.job || "";
  }

  function huntsForJob(jobName) {
    const job = jobs.find((item) => item.id === pickedJobKey);
    const rows = job
      ? hunts.filter((row) => findJob(jobs, row.job)?.id === job.id)
      : jobName
        ? hunts.filter((row) => sameJob(row.job, jobName))
        : hunts;
    return [...rows].sort(compareHuntLevel);
  }

  function huntsForCharacter() {
    const character = pickedCharacter();
    const rows = character ? hunts.filter((row) => sameJob(row.job, character.job)) : hunts;
    return [...rows].sort(compareHuntLevel);
  }

  function recordHunts() {
    const jobName = activeJobName();
    if (jobName) return huntsForJob(jobName);
    if (!pickedFamily) return [...hunts].sort(compareHuntCreated);
    return hunts.filter((row) => jobChoice(row.job || "").family === pickedFamily).sort(compareHuntLevel);
  }

  function familyStyle(family) {
    return jobStyle(jobs.find((job) => job.family === family));
  }

  function jobChoice(name) {
    const job = findJob(jobs, name);
    return {
      key: job?.id || normalizeJobName(name),
      name: job ? jobDisplayName(job) : name,
      family: job?.family || "기타",
      sort: job?.sort_order ?? 9999,
      style: jobStyle(job),
    };
  }

  function huntJobChoices() {
    const seen = new Map();
    for (const row of hunts) {
      const choice = jobChoice(row.job || "");
      if (!choice.key || seen.has(choice.key)) continue;
      seen.set(choice.key, choice);
    }
    const familyRank = new Map(jobFamilies.map((family, index) => [family, index]));
    return [...seen.values()].sort((left, right) => {
      const family = (familyRank.get(left.family) ?? 99) - (familyRank.get(right.family) ?? 99);
      if (family) return family;
      return left.sort - right.sort || left.name.localeCompare(right.name, "ko");
    });
  }

  function paintJobButtons() {
    const list = root.querySelector("[data-hunt-job-list]");
    const choices = huntJobChoices();
    const families = [...jobFamilies];
    if (choices.some((choice) => choice.family === "기타")) families.push("기타");
    if (pickedFamily && !families.includes(pickedFamily)) pickedFamily = "";
    const branch = pickedFamily ? choices.filter((choice) => choice.family === pickedFamily) : [];
    if (pickedJobKey && !branch.some((choice) => choice.key === pickedJobKey)) pickedJobKey = "";
    const familyButtons = families
      .map((family) => {
        const selected = family === pickedFamily;
        const style = familyStyle(family);
        const styleAttr = style ? ` style="${style}"` : "";
        return `<button class="hunt-job is-family${selected ? " is-selected" : ""}" type="button" data-job-family="${escapeHtml(family)}" aria-pressed="${selected ? "true" : "false"}"${styleAttr}>${escapeHtml(family)}</button>`;
      })
      .join("");
    const jobButtons = branch
      .map((choice) => {
        const selected = choice.key === pickedJobKey;
        const styleAttr = choice.style ? ` style="${choice.style}"` : "";
        return `<button class="hunt-job${selected ? " is-selected" : ""}" type="button" data-job-key="${escapeHtml(choice.key)}" aria-pressed="${selected ? "true" : "false"}"${styleAttr}>${escapeHtml(choice.name)}</button>`;
      })
      .join("");
    const branchBody = !pickedFamily
      ? ""
      : jobButtons
        ? `<div class="hunt-job-step"><span>직업</span><div class="hunt-job-row">${jobButtons}</div></div>`
        : `<p class="hunt-pick-empty">이 계열의 사냥 기록이 없습니다.</p>`;
    list.innerHTML = `<div class="hunt-job-steps">
      <div class="hunt-job-step"><span>계열</span><div class="hunt-job-row">${familyButtons}</div></div>
      ${branchBody}
    </div>`;
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
        hour: formatCount(hourValue),
        gross: formatSigned(grossValue),
        grossClass: moneyClass(grossValue),
        leech: formatSigned(leechValue),
        leechClass: moneyClass(leechValue),
        potion: formatCount(potionValue),
        meso: formatSigned(netValue),
        mesoClass: moneyClass(netValue),
      };
    } catch {
      return {
        minute: "-",
        hour: "-",
        gross: "-",
        grossClass: "",
        leech: "-",
        leechClass: "",
        potion: "-",
        meso: "-",
        mesoClass: "",
      };
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
      list.innerHTML = `<p class="hunt-pick-empty">${escapeHtml(who)} 사냥 기록이 없습니다. 아래에서 추가해 보세요.</p>`;
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

  function paintCharacterOptions() {
    const select = huntForm.elements.character_id;
    const current = select.value;
    select.innerHTML = characterSelectHtml("직접 입력");
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  }

  function showNameField(show) {
    huntForm.querySelector("[data-name-field]").hidden = !show;
  }

  function fillHuntForm(row) {
    huntForm.hidden = false;
    huntForm.dataset.editingId = row.id || "";
    root.querySelector("[data-hunt-title]").textContent = row.id ? "사냥 기록 수정" : "사냥 기록 추가";
    paintCharacterOptions();
    const linked = Boolean(row.character_id && characters.some((character) => character.id === row.character_id));
    huntForm.elements.character_id.value = linked ? row.character_id : "";
    showNameField(!linked);
    huntForm.elements.character_name.value = linked ? "" : row.character_name || "";
    huntForm.elements.job.value = row.job || "";
    huntForm.elements.level.value = row.level ? String(row.level) : "";
    if (row.exp_per_hour) {
      const hour = asBig(row.exp_per_hour);
      writeGrouped(huntForm.elements.exp_hour, hour);
      if (hour % 60n === 0n) {
        writeGrouped(huntForm.elements.exp_minute, hour / 60n);
        huntExpSource = "minute";
      } else {
        huntForm.elements.exp_minute.value = "";
        huntExpSource = "hour";
      }
    } else {
      huntForm.elements.exp_minute.value = "";
      huntForm.elements.exp_hour.value = "";
      huntExpSource = "minute";
    }
    if (row.potion_cost == null || row.potion_cost === "") huntForm.elements.potion_cost.value = "";
    else writeGrouped(huntForm.elements.potion_cost, asBig(row.potion_cost));
    writeSigned(huntForm.elements.leech_fee, row.leech_fee);
    writeSigned(huntForm.elements.meso_amount, row.meso_per_hour);
    paintHuntNet();
    huntForm.elements.title.value = row.title || "";
    huntForm.elements.memo.value = row.memo || "";
    huntForm.elements.character_id.focus();
  }

  function closeHuntForm() {
    huntForm.hidden = true;
    huntForm.dataset.editingId = "";
    huntForm.reset();
    showNameField(true);
    huntExpSource = "minute";
  }

  function filteredHunts() {
    const bounds = readLevelFilter(root.querySelector("[data-hunt-min]").value, root.querySelector("[data-hunt-max]").value);
    if (bounds.error) return bounds;
    return {
      rows: recordHunts()
        .filter((row) => {
          if (!matchesText(row, root.querySelector("[data-hunt-search]").value, ["title", "character_name", "job", "memo"])) return false;
          return matchesPointLevel(row.level, bounds.min, bounds.max);
        }),
    };
  }

  function paintHunts() {
    const filtered = filteredHunts();
    if (filtered.error) {
      huntList.innerHTML = `<p class="empty">${escapeHtml(filtered.error)}</p>`;
      return;
    }
    if (!hunts.length) {
      huntList.innerHTML = `<p class="empty">사냥 기록이 없습니다. 1시간 기준으로 추가해 보세요.</p>`;
      return;
    }
    if ((pickedFamily || pickedJobKey) && !recordHunts().length) {
      huntList.innerHTML = `<p class="empty">${pickedJobKey ? "이 직업" : "이 계열"}의 사냥 기록이 없습니다.</p>`;
      return;
    }
    if (!filtered.rows.length) {
      huntList.innerHTML = `<p class="empty">검색 결과가 없습니다. 검색어나 레벨 범위를 바꿔 보세요.</p>`;
      return;
    }
    if (!pickedFamily && !pickedJobKey) {
      const cards = filtered.rows.map((row) => huntTile(row, { showJob: true })).join("");
      huntList.innerHTML = `<div class="hunt-board"><div class="hunt-board-grid">${cards}</div></div>`;
      return;
    }
    const familyRank = new Map(jobFamilies.map((family, index) => [family, index]));
    const groups = [];
    for (const row of filtered.rows) {
      const choice = jobChoice(row.job || "직업 없음");
      let group = groups.find((item) => item.key === choice.key);
      if (!group) {
        group = { ...choice, rows: [] };
        groups.push(group);
      }
      group.rows.push(row);
    }
    groups.sort((left, right) => {
      const family = (familyRank.get(left.family) ?? 99) - (familyRank.get(right.family) ?? 99);
      if (family) return family;
      return left.sort - right.sort || left.name.localeCompare(right.name, "ko");
    });
    const body = groups
      .map((group) => {
        const title = group.family === "기타" ? group.name : `${group.family} - ${group.name}`;
        const style = group.style ? ` style="${group.style}"` : "";
        const cards = group.rows.map((row) => huntTile(row)).join("");
        return `<section class="hunt-board-group">
          <h3 class="hunt-board-title"${style}>${escapeHtml(title)}<span>${group.rows.length}</span></h3>
          <div class="hunt-board-grid">${cards}</div>
        </section>`;
      })
      .join("");
    huntList.innerHTML = `<div class="hunt-board">${body}</div>`;
  }

  function huntTile(row, options = {}) {
    const figures = huntFigures(row);
    const heading = String(row.title || "").trim() || row.character_name;
    const memo = String(row.memo || "").trim();
    const selected = row.id === planForm.elements.hunt_pick.value;
    const jobName = options.showJob ? jobChoice(row.job || "").name : "";
    const meta = [jobName && jobName !== row.character_name ? jobName : "", row.character_name, formatWhen(row.created_at)].filter(Boolean).join(" · ");
    const memoButton = memo
      ? `<button class="hunt-memo" type="button" data-open-memo="${row.id}"><span>메모</span><span class="hunt-memo-preview">${escapeHtml(memo.replace(/\s+/g, " "))}</span></button>`
      : "";
    return `<article class="hunt-tile${selected ? " is-selected" : ""}">
      <div class="hunt-tile-top">
        <h3>${escapeHtml(heading)}</h3>
        <span class="hunt-tile-level">${escapeHtml(formatCount(row.level))}레벨</span>
      </div>
      <p class="hunt-tile-meta">${escapeHtml(meta)}</p>
      <div class="hunt-tile-stats">
        <div><span>분당 경험치</span><strong>${escapeHtml(figures.minute)}</strong></div>
        <div><span>1시간 메소</span><strong class="${figures.mesoClass}">${escapeHtml(figures.meso)}</strong></div>
      </div>
      <div class="hunt-tile-sub">
        <p><span>순메소</span><strong class="${figures.grossClass}">${escapeHtml(figures.gross)}</strong></p>
        <p><span>쩔비</span><strong class="${figures.leechClass}">${escapeHtml(figures.leech)}</strong></p>
        <p><span>물약</span><strong>${escapeHtml(figures.potion)}</strong></p>
      </div>
      <div class="row-actions">
        <button class="text-button" type="button" data-use-hunt="${row.id}">${selected ? "선택됨" : "이 기준으로"}</button>
        <button class="text-button" type="button" data-edit-hunt="${row.id}">수정</button>
        <button class="text-button is-danger" type="button" data-delete-hunt="${row.id}">삭제</button>
      </div>
      ${memoButton}
    </article>`;
  }

  function openMemo(id) {
    const hunt = hunts.find((item) => item.id === id);
    const dialog = root.querySelector("[data-hunt-dialog]");
    if (!hunt?.memo || !dialog) return;
    const bits = [hunt.title, hunt.character_name, hunt.job, hunt.level ? `${formatCount(hunt.level)}레벨` : ""].filter(Boolean);
    root.querySelector("[data-memo-kicker]").textContent = bits.join(" · ");
    root.querySelector("[data-memo-body]").textContent = hunt.memo;
    if (!dialog.open) dialog.showModal();
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
    paintHunts();
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
    paintHunts();
    paintPlan();
    const huntId = hunt.id;
    setTimeout(() => {
      if (!planForm.isConnected) return;
      if (planForm.elements.hunt_pick.value !== huntId) return;
      revealCurrentExp();
    }, 0);
  }

  function readHuntForm() {
    const characterId = huntForm.elements.character_id.value;
    let characterName = "";
    if (characterId) {
      const character = characters.find((item) => item.id === characterId);
      if (!character) return { error: "캐릭터를 다시 선택해 주세요." };
      characterName = character.name;
    } else {
      characterName = huntForm.elements.character_name.value.trim();
      if (!characterName) return { error: "캐릭터명을 입력해 주세요." };
    }
    const level = readCount(huntForm.elements.level.value, "레벨", 1);
    if (level.error) return level;
    if (level.value == null) return { error: "레벨을 입력해 주세요." };
    if (level.value > 200) return { error: "레벨은 200 이하여야 합니다." };
    const title = huntForm.elements.title.value.trim();
    if (!title) return { error: "사냥 이름을 입력해 주세요." };
    const exp = readHourExp(huntForm, huntExpSource);
    if (exp.error) return exp;
    const potion = readBig(huntForm.elements.potion_cost.value, "1시간 물약", 0n);
    if (potion.error) return potion;
    const leech = readLeech(huntForm.elements.leech_fee.value);
    if (leech.error) return leech;
    const meso = readMeso(huntForm.elements.meso_amount.value);
    if (meso.error) return meso;
    return {
      value: {
        character_id: characterId || null,
        character_name: characterName,
        job: huntForm.elements.job.value.trim() || null,
        level: level.value,
        potion_cost: (potion.value ?? 0n).toString(),
        leech_fee: (leech.value ?? 0n).toString(),
        exp_per_hour: exp.value.toString(),
        meso_per_hour: meso.value.toString(),
        title,
        memo: huntForm.elements.memo.value.trim() || null,
      },
    };
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
    const current = ++loadId;
    huntList.innerHTML = `<p class="empty">불러오는 중입니다.</p>`;
    const supabase = await getSupabase();
    const [huntResult, curveResult, characterResult, accountResult, jobResult] = await Promise.all([
      supabase.from("hunts").select(huntColumns).order("created_at", { ascending: false }),
      supabase.from("level_exp").select("id, level, exp_to_next").order("level", { ascending: true }),
      supabase.from("characters").select("id, account_id, name, job, level, current_exp"),
      supabase.from("accounts").select("id, name").order("name"),
      supabase.from("jobs").select("id, family, name, color, color_dark, sort_order").order("sort_order"),
    ]);
    if (current !== loadId || !huntList.isConnected) return;
    const error = huntResult.error || curveResult.error || characterResult.error || accountResult.error;
    if (error) {
      hunts = [];
      curveRows = [];
      characters = [];
      accounts = [];
      jobs = [];
      huntList.innerHTML = "";
      notify(translateDbError(error), "error");
      paintPlan();
      return;
    }
    hunts = huntResult.data ?? [];
    curveRows = curveResult.data ?? [];
    characters = characterResult.data ?? [];
    accounts = sortByName(accountResult.data ?? []);
    jobs = jobResult.error ? [] : (jobResult.data ?? []);
    if (jobResult.error) notify(translateDbError(jobResult.error), "error");
    const seeded = await saveMissingLevels(supabase);
    if (current !== loadId || !huntList.isConnected) return;
    if (seeded.error) notify(translateDbError(seeded.error), "error");
    paintCharacterPick();
    paintJobButtons();
    paintHuntPick();
    paintCharacterOptions();
    paintHunts();
    paintPlan();
  }

  const memoDialog = root.querySelector("[data-hunt-dialog]");
  memoDialog.addEventListener("click", (event) => {
    if (event.target === memoDialog) memoDialog.close();
  });
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-memo]")) memoDialog.close();
  });

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
    if (event.target.form === huntForm && ["meso_amount", "leech_fee", "potion_cost"].includes(event.target.name)) {
      paintHuntNet();
    }
    if (event.target.form === huntForm && (event.target.name === "exp_minute" || event.target.name === "exp_hour")) {
      huntExpSource = event.target.name === "exp_minute" ? "minute" : "hour";
      syncExp(huntForm, huntExpSource);
    }
    if (event.target.form === planForm && (event.target.name === "exp_minute" || event.target.name === "exp_hour")) {
      planExpSource = event.target.name === "exp_minute" ? "minute" : "hour";
      syncExp(planForm, planExpSource);
    }
    if (event.target.form === planForm) paintPlan();
    if (event.target.closest("[data-hunt-search], [data-hunt-min], [data-hunt-max]")) paintHunts();
  });

  root.addEventListener("change", (event) => {
    if (event.target === huntForm.elements.character_id) {
      const character = characters.find((item) => item.id === event.target.value);
      showNameField(!character);
      if (!character) return;
      huntForm.elements.job.value = character.job || "";
      if (character.level) huntForm.elements.level.value = String(character.level);
    }
    if (event.target === planForm.elements.character_pick) {
      const character = characters.find((item) => item.id === event.target.value);
      if (character) {
        applyCharacter(character);
        return;
      }
      clearPlanRates();
      planForm.elements.from_level.value = "";
      paintHuntPick();
      paintHunts();
      paintPlan();
    }
  });

  root.addEventListener("click", async (event) => {
    if (event.target.closest("[data-add-hunt]")) {
      notify("", "info");
      fillHuntForm({ id: "" });
    }
    if (event.target.closest("[data-cancel-hunt]")) closeHuntForm();

    const memoButton = event.target.closest("[data-open-memo]");
    if (memoButton) openMemo(memoButton.dataset.openMemo);

    const familyButton = event.target.closest("[data-job-family]");
    if (familyButton) {
      const family = familyButton.dataset.jobFamily;
      if (pickedFamily === family) {
        pickedFamily = "";
        pickedJobKey = "";
      } else {
        pickedFamily = family;
        pickedJobKey = "";
      }
      paintJobButtons();
      paintHunts();
    }

    const jobButton = event.target.closest("[data-job-key]");
    if (jobButton) {
      const key = jobButton.dataset.jobKey;
      pickedJobKey = pickedJobKey === key ? "" : key;
      paintJobButtons();
      paintHunts();
    }

    const pickButton = event.target.closest("[data-pick-hunt]");
    if (pickButton) {
      const hunt = hunts.find((item) => item.id === pickButton.dataset.pickHunt);
      if (hunt) applyHunt(hunt);
    }

    const useButton = event.target.closest("[data-use-hunt]");
    if (useButton) {
      const hunt = hunts.find((item) => item.id === useButton.dataset.useHunt);
      if (hunt) applyHunt(hunt);
    }

    const editHunt = event.target.closest("[data-edit-hunt]");
    if (editHunt) {
      const hunt = hunts.find((item) => item.id === editHunt.dataset.editHunt);
      if (hunt) fillHuntForm(hunt);
    }

    const deleteHunt = event.target.closest("[data-delete-hunt]");
    if (deleteHunt) {
      const hunt = hunts.find((item) => item.id === deleteHunt.dataset.deleteHunt);
      if (!hunt) return;
      const label = hunt.title?.trim() || `${hunt.character_name} ${hunt.level}레벨`;
      if (!window.confirm(`${label} 사냥 기록을 삭제할까요?`)) return;
      deleteHunt.disabled = true;
      const supabase = await getSupabase();
      const { error } = await supabase.from("hunts").delete().eq("id", hunt.id);
      if (!huntList.isConnected) return;
      if (error) {
        deleteHunt.disabled = false;
        notify(translateDbError(error), "error");
        return;
      }
      notify("삭제했습니다.", "info");
      await loadAll();
    }
  });

  huntForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const parsed = readHuntForm();
    if (parsed.error) {
      notify(parsed.error, "error");
      return;
    }
    const button = huntForm.querySelector("[type=submit]");
    button.disabled = true;
    let saved = false;
    try {
      const supabase = await getSupabase();
      const editingId = huntForm.dataset.editingId;
      const query = editingId
        ? supabase.from("hunts").update(parsed.value).eq("id", editingId)
        : supabase.from("hunts").insert(parsed.value);
      const { error } = await query;
      if (!huntList.isConnected) return;
      if (error) {
        notify(translateDbError(error), "error");
        return;
      }
      saved = true;
    } finally {
      button.disabled = false;
    }
    if (!saved) return;
    closeHuntForm();
    notify("사냥 기록을 저장했습니다.", "info");
    await loadAll();
  });

  await loadAll();
}
