import { translateDbError } from "../db-error.js";
import { escapeHtml, formatCount, readCount } from "../format.js";
import { matchesText } from "../filters.js";
import { getSupabase } from "../supabase-client.js";
import { notify } from "../toast.js";
import { combineLots, completeGroups, isCompleteTrade, isPartialSell, openGroups, tradeName } from "../trade-merge.js";

const columns = "id, name, buy_price, buy_qty, sell_price, sell_qty, created_at, updated_at";

const blank = {
  id: "",
  name: "",
  buy_price: "",
  buy_qty: "",
  sell_price: "",
  sell_qty: "",
};

function remainingOf(row) {
  return row.buy_qty - row.sell_qty;
}

function statusOf(row) {
  return remainingOf(row) > 0 ? "보유중" : "판매 완료";
}

function gapOf(row) {
  if (row.sell_price == null || !row.sell_qty) return null;
  return row.buy_price - row.sell_price;
}

function profitOf(row) {
  if (row.sell_price == null || !row.sell_qty) return null;
  return (row.sell_price - row.buy_price) * row.sell_qty;
}

function moneyClass(value) {
  if (value == null || value === 0) return "";
  return value > 0 ? "is-gain" : "is-loss";
}

function signedMoney(value) {
  if (value == null) return "-";
  if (value > 0) return `+${formatCount(value)}`;
  return formatCount(value);
}

export async function render(root) {
  root.innerHTML = `
    <div class="trade-page">
      <header class="page-header">
        <p class="trade-kicker">장부</p>
        <div class="trade-hero-row">
          <h1>거래</h1>
          <button class="primary-button" type="button" data-add>거래 추가</button>
        </div>
      </header>
      <div data-summary></div>
      <section class="trade-board">
        <div class="trade-board-bar">
          <div class="trade-segments" data-views role="group" aria-label="거래 상태">
            <button type="button" data-view="all" class="is-on" aria-pressed="true">전체</button>
            <button type="button" data-view="holding" aria-pressed="false">보유중</button>
            <button type="button" data-view="sold" aria-pressed="false">판매 완료</button>
          </div>
          <label class="field trade-search"><span>아이템명</span><input data-search placeholder="이름으로 찾기" /></label>
        </div>
        <form class="editor trade-editor" id="trade-form" hidden>
          <h2 data-form-title>거래 추가</h2>
          <label class="field span-all"><span>아이템명</span><input name="name" required autocomplete="off" /></label>
          <div class="trade-form-sides span-all">
            <fieldset class="trade-form-side is-buy">
              <legend>매수</legend>
              <label class="field"><span>개당 가격</span><input name="buy_price" inputmode="numeric" required autocomplete="off" /></label>
              <label class="field"><span>개수</span><input name="buy_qty" inputmode="numeric" required autocomplete="off" /></label>
            </fieldset>
            <fieldset class="trade-form-side is-sell">
              <legend>매도</legend>
              <label class="field"><span>개당 가격</span><input name="sell_price" inputmode="numeric" placeholder="아직 안 팔렸으면 비움" autocomplete="off" /></label>
              <label class="field"><span>개수</span><input name="sell_qty" inputmode="numeric" placeholder="아직 안 팔렸으면 비움" autocomplete="off" /></label>
            </fieldset>
          </div>
          <div class="button-row span-all">
            <button class="primary-button" type="submit" data-save>저장</button>
            <button class="secondary-button" type="button" data-cancel>취소</button>
          </div>
        </form>
        <div data-list></div>
      </section>
    </div>
  `;

  const list = root.querySelector("[data-list]");
  const summary = root.querySelector("[data-summary]");
  const form = root.querySelector("#trade-form");
  const title = root.querySelector("[data-form-title]");
  let rows = [];
  let view = "all";
  let loadId = 0;

  function showStatus(text, kind) {
    notify(text, kind);
  }

  function searchedRows() {
    return rows.filter((row) => matchesText(row, root.querySelector("[data-search]").value, ["name"]));
  }

  function visibleRows() {
    return searchedRows().filter((row) => {
      const remaining = remainingOf(row);
      if (view === "holding") return remaining > 0;
      if (view === "sold") return remaining === 0;
      return true;
    });
  }

  function lotBuy(row) {
    return row.buy_price * row.buy_qty;
  }

  function lotSell(row) {
    return row.sell_qty ? row.sell_price * row.sell_qty : 0;
  }

  function paintSummary(source) {
    const heldCost = source.reduce((sum, row) => sum + row.buy_price * remainingOf(row), 0);
    const heldLots = source.filter((row) => remainingOf(row) > 0).length;
    const soldCost = source.reduce((sum, row) => sum + row.buy_price * row.sell_qty, 0);
    const soldRevenue = source.reduce((sum, row) => sum + lotSell(row), 0);
    const realized = soldRevenue - soldCost;
    const rate = soldCost > 0 ? ((soldCost - soldRevenue) / soldCost) * 100 : null;
    const rateText = rate == null ? "-" : `${rate > 0 ? "감가 " : rate < 0 ? "이익 " : ""}${Math.abs(rate).toFixed(1)}%`;
    const holding = source.filter((row) => remainingOf(row) > 0);
    const finished = source.filter((row) => remainingOf(row) === 0);
    const total = (list, pick) => list.reduce((sum, row) => sum + pick(row), 0);
    summary.innerHTML = `
      <div class="trade-kpis">
        <div class="trade-kpi-grid">
          <article class="trade-kpi"><span>보유 중인 거래</span><strong>${formatCount(heldLots)}건</strong></article>
          <article class="trade-kpi"><span>아직 안 판 원가</span><strong>${formatCount(heldCost)}</strong></article>
          <article class="trade-kpi is-focus"><span>실현 손익</span><strong class="${moneyClass(realized)}">${signedMoney(realized)}</strong></article>
          <article class="trade-kpi"><span>판매분 감가율</span><strong class="${rate > 0 ? "is-loss" : rate < 0 ? "is-gain" : ""}">${rateText}</strong></article>
        </div>
        <div class="trade-books">
          <section class="trade-booklet">
            <h3>보유중</h3>
            <span>산 총원가</span><strong>${formatCount(total(holding, lotBuy))}</strong>
            <span>판매 총원가</span><strong>${formatCount(total(holding, lotSell))}</strong>
          </section>
          <section class="trade-booklet">
            <h3>판매 완료</h3>
            <span>산 총원가</span><strong>${formatCount(total(finished, lotBuy))}</strong>
            <span>판매 총원가</span><strong>${formatCount(total(finished, lotSell))}</strong>
          </section>
        </div>
      </div>
    `;
  }

  function statusRank(row) {
    return remainingOf(row) > 0 ? 0 : 1;
  }

  function sortedTrades(source) {
    return [...source].sort((a, b) => {
      const status = statusRank(a) - statusRank(b);
      if (status) return status;
      const total = b.buy_price * b.buy_qty - a.buy_price * a.buy_qty;
      if (total) return total;
      return a.name.localeCompare(b.name, "ko");
    });
  }

  function tradeField(row, field, value, label, quiet) {
    const shown = value == null || value === "" ? "" : formatCount(value);
    return `<input class="amount-input${quiet ? " is-quiet" : ""}" data-trade-id="${row.id}" data-trade-field="${field}" inputmode="numeric" value="${escapeHtml(shown)}" aria-label="${escapeHtml(`${row.name} ${label}`)}" />`;
  }

  function card(row) {
    const gap = gapOf(row);
    const profit = profitOf(row);
    const gapText = gap == null ? "—" : gap > 0 ? `감가 ${formatCount(gap)}` : gap < 0 ? `이익 ${formatCount(-gap)}` : "0";
    const rate = gap == null || !row.buy_price ? null : (gap / row.buy_price) * 100;
    const gapWithRate = rate == null ? gapText : `${gapText} (${Math.abs(rate).toFixed(1)}%)`;
    const gapTone = gap > 0 ? "is-loss" : gap < 0 ? "is-gain" : "";
    const remaining = remainingOf(row);
    const sold = row.sell_price != null && row.sell_qty > 0;
    const tone = gap > 0 ? "is-loss" : gap < 0 ? "is-gain" : "";
    const holding = remaining > 0;
    const buyTotal = formatCount(row.buy_price * row.buy_qty);
    const sellTotal = sold ? formatCount(row.sell_price * row.sell_qty) : "—";
    const profitText = signedMoney(profit);
    return `
      <article class="trade-card ${tone}">
        <div class="trade-card-id">
          <h3 title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</h3>
          <span class="trade-badge${holding ? "" : " is-sold"}">${holding ? "보유중" : "판매 완료"}</span>
        </div>
        <section class="trade-lane is-buy">
          <p class="trade-lane-kicker">매수</p>
          <label class="trade-field"><span>가격</span>${tradeField(row, "buy_price", row.buy_price, "산 가격")}</label>
          <label class="trade-field"><span>개수</span>${tradeField(row, "buy_qty", row.buy_qty, "산 개수")}</label>
          <p class="trade-lane-total"><span>총액</span><strong class="${row.buy_qty === 1 ? "is-quiet" : ""}" title="${escapeHtml(buyTotal)}">${escapeHtml(buyTotal)}</strong></p>
        </section>
        <section class="trade-lane is-sell">
          <p class="trade-lane-kicker">매도</p>
          <label class="trade-field"><span>가격</span>${tradeField(row, "sell_price", row.sell_price, "판 가격")}</label>
          <label class="trade-field"><span>개수</span>${tradeField(row, "sell_qty", row.sell_qty > 0 ? row.sell_qty : null, "판 개수")}</label>
          <p class="trade-lane-total"><span>총액</span><strong class="${!sold || row.sell_qty === 1 ? "is-quiet" : ""}" title="${escapeHtml(sellTotal)}">${escapeHtml(sellTotal)}</strong></p>
        </section>
        <section class="trade-lane is-result">
          <p class="trade-metric"><span>재고</span><strong class="${remaining === row.buy_qty ? "is-quiet" : ""}">${escapeHtml(formatCount(remaining))}</strong></p>
          <p class="trade-metric"><span>개당 차이</span><strong class="${gapTone}" title="${escapeHtml(gapWithRate)}">${escapeHtml(gapWithRate)}</strong></p>
          <p class="trade-profit ${moneyClass(profit)}"><span>실현 손익</span><strong title="${escapeHtml(profitText)}">${escapeHtml(profitText)}</strong></p>
        </section>
        <div class="row-actions">
          <button class="text-button" type="button" data-edit="${row.id}">수정</button>
          <button class="text-button is-danger" type="button" data-delete="${row.id}">삭제</button>
        </div>
      </article>
    `;
  }

  function paintList() {
    root.querySelectorAll("[data-view]").forEach((button) => {
      const on = button.dataset.view === view;
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const visible = visibleRows();
    paintSummary(searchedRows());
    if (!rows.length) {
      list.innerHTML = `<p class="empty">등록한 거래가 없습니다. 거래 추가로 산 가격과 개수를 먼저 적어 보세요.</p>`;
      return;
    }
    if (!visible.length) {
      list.innerHTML = `<p class="empty">이 조건에 맞는 거래가 없습니다.</p>`;
      return;
    }
    const groups = [];
    for (const row of sortedTrades(visible)) {
      const status = statusOf(row);
      const last = groups[groups.length - 1];
      if (!last || last.status !== status) groups.push({ status, rows: [row] });
      else last.rows.push(row);
    }
    list.innerHTML = groups
      .map((group) => {
        const head =
          view === "all"
            ? `<header class="trade-group-head"><h2>${escapeHtml(group.status)}</h2><span class="count-pill">${formatCount(group.rows.length)}</span></header>`
            : "";
        return `<section class="trade-group">${head}<div class="trade-cards">${group.rows.map(card).join("")}</div></section>`;
      })
      .join("");
  }

  function tradeInputs(id) {
    return Object.fromEntries(
      [...root.querySelectorAll(`[data-trade-id="${id}"]`)].map((input) => [input.dataset.tradeField, input]),
    );
  }

  function restoreTradeInputs(row) {
    const inputs = tradeInputs(row.id);
    if (!inputs.buy_price) return;
    inputs.buy_price.value = formatCount(row.buy_price);
    inputs.buy_qty.value = formatCount(row.buy_qty);
    inputs.sell_price.value = row.sell_price == null ? "" : formatCount(row.sell_price);
    inputs.sell_qty.value = row.sell_qty ? formatCount(row.sell_qty) : "";
  }

  function applyAmountCommas(input) {
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const next = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (next === raw) return;
    const digitsBefore = raw.slice(0, caret).replace(/\D/g, "").replace(/^0+(?=\d)/, "").length;
    input.value = next;
    if (!digitsBefore) {
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

  function readSellFields(priceText, qtyText, buyQty) {
    let sellPrice = null;
    let sellQty = 0;
    if (priceText) {
      const price = readCount(priceText, "판 가격", 0);
      if (price.error) return price;
      sellPrice = price.value;
    }
    if (qtyText) {
      const qty = readCount(qtyText, "판 개수", 1);
      if (qty.error) return qty;
      sellQty = qty.value;
    }
    if (sellQty > buyQty) return { error: "판 개수는 산 개수보다 많을 수 없습니다." };
    return { sellPrice, sellQty };
  }

  function readInline(row, inputs) {
    const buyPrice = readCount(inputs.buy_price.value, "산 가격", 0);
    if (buyPrice.error) return buyPrice;
    if (buyPrice.value == null) return { error: "산 가격을 입력해 주세요." };
    const buyQty = readCount(inputs.buy_qty.value, "산 개수", 1);
    if (buyQty.error) return buyQty;
    if (buyQty.value == null) return { error: "산 개수를 입력해 주세요." };
    const sold = readSellFields(inputs.sell_price.value.trim(), inputs.sell_qty.value.trim(), buyQty.value);
    if (sold.error) return sold;
    return {
      value: {
        name: row.name,
        buy_price: buyPrice.value,
        buy_qty: buyQty.value,
        sell_price: sold.sellPrice,
        sell_qty: sold.sellQty,
      },
    };
  }

  function sameTrade(row, value) {
    return (
      row.buy_price === value.buy_price &&
      row.buy_qty === value.buy_qty &&
      (row.sell_price ?? null) === (value.sell_price ?? null) &&
      row.sell_qty === value.sell_qty
    );
  }

  async function persistTrade(id, value) {
    const supabase = await getSupabase();
    const stored = { ...value, name: tradeName(value.name) };
    const complete = isCompleteTrade(stored);
    const sameLot = isPartialSell(stored)
      ? null
      : rows.find(
          (row) =>
            row.id !== id &&
            !isPartialSell(row) &&
            isCompleteTrade(row) === complete &&
            tradeName(row.name) === stored.name,
        );
    if (sameLot) {
      const updated = await supabase.from("trades").update(combineLots([sameLot, stored])).eq("id", sameLot.id);
      if (updated.error) return { error: updated.error };
      if (id) {
        const removed = await supabase.from("trades").delete().eq("id", id);
        if (removed.error) return { error: removed.error };
      }
      return { merged: true };
    }
    const query = id
      ? supabase.from("trades").update(stored).eq("id", id)
      : supabase.from("trades").insert(stored);
    const { error } = await query;
    return { error, merged: false };
  }

  const savingIds = new Set();

  async function saveInline(input) {
    const row = rows.find((item) => item.id === input.dataset.tradeId);
    if (!row || savingIds.has(row.id)) return;
    savingIds.add(row.id);
    try {
      const inputs = tradeInputs(row.id);
      if (!inputs.buy_price) return;
      const parsed = readInline(row, inputs);
      if (parsed.error) {
        showStatus(parsed.error, "error");
        restoreTradeInputs(row);
        return;
      }
      if (sameTrade(row, parsed.value)) {
        restoreTradeInputs(row);
        return;
      }
      showStatus("저장하는 중입니다.", "info");
      const saved = await persistTrade(row.id, parsed.value);
      if (saved.error) {
        showStatus(translateDbError(saved.error), "error");
        restoreTradeInputs(row);
        return;
      }
      if (form.dataset.editingId === row.id) closeForm();
      showStatus(saved.merged ? "이름이 같은 거래를 한 줄로 합쳤습니다." : "거래를 수정했습니다.", "info");
      await loadRows();
    } finally {
      savingIds.delete(row.id);
    }
  }
  function fillForm(row) {
    form.hidden = false;
    form.dataset.editingId = row.id || "";
    title.textContent = row.id ? "거래 수정" : "거래 추가";
    form.elements.name.value = row.name ?? "";
    form.elements.buy_price.value = row.buy_price ?? "";
    form.elements.buy_qty.value = row.buy_qty ?? "";
    form.elements.sell_price.value = row.sell_price ?? "";
    form.elements.sell_qty.value = row.sell_qty ? row.sell_qty : "";
    form.elements.name.focus();
    form.scrollIntoView({ block: "nearest" });
  }

  function closeForm() {
    form.hidden = true;
    form.dataset.editingId = "";
    form.reset();
  }

  function readForm() {
    const name = form.elements.name.value.trim();
    if (!name) return { error: "아이템명을 입력해 주세요." };
    const buyPrice = readCount(form.elements.buy_price.value, "개당 산 가격", 0);
    if (buyPrice.error) return buyPrice;
    if (buyPrice.value == null) return { error: "개당 산 가격을 입력해 주세요." };
    const buyQty = readCount(form.elements.buy_qty.value, "산 개수", 1);
    if (buyQty.error) return buyQty;
    if (buyQty.value == null) return { error: "산 개수를 입력해 주세요." };
    const sold = readSellFields(form.elements.sell_price.value.trim(), form.elements.sell_qty.value.trim(), buyQty.value);
    if (sold.error) return sold;
    return {
      value: {
        name,
        buy_price: buyPrice.value,
        buy_qty: buyQty.value,
        sell_price: sold.sellPrice,
        sell_qty: sold.sellQty,
      },
    };
  }

  async function collapseOpenTrades(supabase, data) {
    const groups = [...openGroups(data), ...completeGroups(data)];
    if (!groups.length) return data;
    for (const group of groups) {
      const [keep, ...rest] = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const { error } = await supabase.from("trades").update(combineLots(group)).eq("id", keep.id);
      if (error) throw error;
      const { error: deleteError } = await supabase.from("trades").delete().in(
        "id",
        rest.map((row) => row.id),
      );
      if (deleteError) throw deleteError;
    }
    const { data: next, error } = await supabase.from("trades").select(columns).order("updated_at", { ascending: false });
    if (error) throw error;
    return next ?? [];
  }

  async function loadRows() {
    const current = ++loadId;
    list.innerHTML = `<p class="empty">거래를 불러오는 중입니다.</p>`;
    const supabase = await getSupabase();
    const { data, error } = await supabase.from("trades").select(columns).order("updated_at", { ascending: false });
    if (current !== loadId || !list.isConnected) return;
    if (error) {
      rows = [];
      summary.innerHTML = "";
      list.innerHTML = "";
      showStatus(translateDbError(error), "error");
      return;
    }
    try {
      rows = await collapseOpenTrades(supabase, data ?? []);
    } catch (mergeError) {
      rows = data ?? [];
      showStatus(translateDbError(mergeError), "error");
    }
    if (current !== loadId || !list.isConnected) return;
    paintList();
  }

  root.addEventListener("input", (event) => {
    if (event.target.closest("[data-trade-field]")) applyAmountCommas(event.target);
    if (event.target.closest("[data-search]")) paintList();
  });

  root.addEventListener("keydown", (event) => {
    const input = event.target.closest?.("[data-trade-field]");
    if (!input || event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    saveInline(input);
  });

  root.addEventListener("focusout", (event) => {
    const input = event.target.closest?.("[data-trade-field]");
    if (input) saveInline(input);
  });

  root.addEventListener("click", async (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      view = viewButton.dataset.view;
      paintList();
    }
    if (event.target.closest("[data-add]")) {
      showStatus("", "info");
      fillForm(blank);
    }
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
    if (!window.confirm(`${row.name} 거래를 삭제할까요? 삭제한 내용은 되돌릴 수 없습니다.`)) return;
    deleteButton.disabled = true;
    const supabase = await getSupabase();
    const { error } = await supabase.from("trades").delete().eq("id", row.id);
    if (error) {
      deleteButton.disabled = false;
      showStatus(translateDbError(error), "error");
      return;
    }
    if (form.dataset.editingId === row.id) closeForm();
    showStatus("거래를 삭제했습니다.", "info");
    await loadRows();
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
    const id = form.dataset.editingId;
    const saved = await persistTrade(id, parsed.value);
    saveButton.disabled = false;
    if (saved.error) {
      showStatus(translateDbError(saved.error), "error");
      return;
    }
    closeForm();
    showStatus(
      saved.merged ? "이름이 같은 거래를 한 줄로 합쳤습니다." : id ? "거래를 수정했습니다." : "거래를 저장했습니다.",
      "info",
    );
    await loadRows();
  });

  await loadRows();
}
