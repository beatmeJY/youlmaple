import { bosses, formatPossible, formatRemain, formatStamp, todaySlot } from "../boss-cooldown.js";
import { translateDbError } from "../db-error.js";
import { escapeHtml } from "../format.js";
import { jobLabel, jobRecord } from "../job-label.js";
import { getSupabase } from "../supabase-client.js";

const art = {
  pianus: "img/pianus.png",
  papulatus: "img/papulatus.png",
  rift: "img/rift.png",
};

const sections = [
  {
    key: "papulatus",
    blurb: "오늘 돌 수 있는 시각",
    empty: "오늘 돌 수 있는 파풀라투스가 없습니다.",
    ready: "지금 가능",
    mark: "입장 가능",
  },
  {
    key: "pianus",
    blurb: "오늘 도전하는 캐릭터",
    empty: "오늘 피아누스를 도전할 캐릭터가 없습니다.",
    ready: "지금 가능",
    mark: "입장 가능",
  },
  {
    key: "rift",
    blurb: "오늘 받는 시각",
    empty: "오늘 받을 차원의 균열 조각이 없습니다.",
    ready: "지금 가능",
    mark: "수령 가능",
  },
];

export async function render(root) {
  root.innerHTML = `
    <div class="home">
      <section class="home-panel">
        <header class="home-head">
          <h2>메모</h2>
          <a class="text-button" href="#/notes">메모 관리</a>
        </header>
        <div data-notes>
          <p class="home-empty">메모를 불러오는 중입니다.</p>
        </div>
      </section>
      <div class="home-board" data-glance>
        <p class="home-empty">불러오는 중입니다.</p>
      </div>
    </div>
  `;

  const glance = root.querySelector("[data-glance]");
  const notes = root.querySelector("[data-notes]");
  const supabase = await getSupabase();
  if (!glance.isConnected) return;
  const [result, noteResult] = await Promise.all([
    supabase
      .from("characters")
      .select(
        "id, name, job, pianus_enabled, pianus_at, papulatus_enabled, papulatus_at, rift_enabled, rift_at, jobs(name, color, color_dark)",
      ),
    supabase.from("notes").select("id, title, content").order("updated_at", { ascending: false }),
  ]);
  if (!glance.isConnected) return;
  paintNotes(notes, noteResult);
  if (result.error) {
    glance.innerHTML = `<section class="home-panel"><p class="form-message is-error"></p></section>`;
    glance.querySelector("p").textContent = translateDbError(result.error);
    return;
  }

  const rows = result.data ?? [];
  let signature = "";
  const timer = window.setInterval(tick, 1000);

  function tick() {
    if (!glance.isConnected) {
      window.clearInterval(timer);
      return;
    }
    const now = Date.now();
    const next = boardSignature(rows, now);
    if (next === signature) {
      refreshClocks(glance, now);
      return;
    }
    signature = next;
    glance.innerHTML = sections.map((section) => sectionCard(section, rowsFor(rows, section, now))).join("");
  }

  tick();
}

function boardSignature(rows, now) {
  return sections
    .map((section) => {
      const items = rowsFor(rows, section, now);
      return `${section.key}:${items.map((item) => `${item.row.id}:${item.slot.ready ? "ready" : item.slot.at}`).join(",")}`;
    })
    .join("|");
}

function rowsFor(rows, section, now) {
  const boss = bosses.find((item) => item.key === section.key);
  return rows
    .filter((row) => row[boss.columnEnabled])
    .map((row) => ({ row, slot: todaySlot(row[boss.columnAt], now, boss) }))
    .filter((item) => item.slot.include)
    .sort(byToday);
}

function byToday(left, right) {
  const leftKey = left.slot.ready ? 0 : left.slot.at;
  const rightKey = right.slot.ready ? 0 : right.slot.at;
  if (leftKey !== rightKey) return leftKey - rightKey;
  return left.row.name.localeCompare(right.row.name, "ko");
}

function sectionCard(section, items) {
  const boss = bosses.find((item) => item.key === section.key);
  const body = items.length
    ? `<div class="home-chars">${items.map((item) => characterCard(section, item)).join("")}</div>`
    : `<p class="home-empty">${section.empty}</p>`;
  return `
    <section class="home-lane">
      <header class="home-head">
        <img class="home-art" src="${art[section.key]}" alt="" width="44" height="44" />
        <div class="home-title">
          <h2>${boss.label}</h2>
          <p>${section.blurb}</p>
        </div>
        <span class="count-pill">${items.length}</span>
      </header>
      ${body}
    </section>
  `;
}

function characterCard(section, item) {
  const { row, slot } = item;
  const lines = metaHtml(row, ["job"]);
  const time = slot.ready
    ? `<strong class="home-ready">${section.ready}</strong>`
    : `<div class="home-clock"><div class="home-clock-line"><strong>${escapeHtml(formatPossible(slot.at))}</strong><span class="home-kicker">${section.mark}</span></div><span class="home-remain" data-next="${slot.at}" title="${escapeHtml(formatStamp(slot.at))}">${escapeHtml(formatRemain(slot.at - Date.now()))} 남음</span></div>`;
  return `
    <article class="home-char${slot.ready ? " is-ready" : ""}">
      <div class="home-who">
        <strong>${escapeHtml(row.name)}</strong>
        ${lines}
      </div>
      ${time}
    </article>
  `;
}

function metaHtml(row, keys) {
  const line = metaLine(row, keys);
  return line ? `<span class="home-meta">${line}</span>` : "";
}

function metaLine(row, keys) {
  const job = jobRecord(row);
  const bits = [];
  for (const key of keys) {
    if (key === "job") {
      const name = job?.name || row.job;
      if (name) bits.push(job ? jobLabel(job.name, job) : escapeHtml(name));
    }
  }
  return bits.join(" · ");
}

function paintNotes(notes, result) {
  if (!notes.isConnected) return;
  if (result.error) {
    notes.innerHTML = `<p class="form-message is-error"></p>`;
    notes.querySelector("p").textContent = translateDbError(result.error);
    return;
  }
  const rows = result.data ?? [];
  if (!rows.length) {
    notes.innerHTML = `<p class="home-empty">아직 메모가 없습니다.</p>`;
    return;
  }
  notes.innerHTML = `<div class="home-notes">${rows.map(noteCard).join("")}</div>`;
}

function noteCard(row) {
  const content = String(row.content ?? "").trim();
  const body = content ? `<p>${escapeHtml(row.content)}</p>` : "";
  return `<article class="home-note"><h3>${escapeHtml(row.title)}</h3>${body}</article>`;
}

function refreshClocks(glance, now) {
  for (const node of glance.querySelectorAll("[data-next]")) {
    const at = Number(node.dataset.next);
    if (!Number.isFinite(at) || now >= at) continue;
    node.textContent = `${formatRemain(at - now)} 남음`;
  }
}
