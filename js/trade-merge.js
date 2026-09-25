export function tradeName(name) {
  return String(name ?? "").trim();
}

export function isCompleteTrade(row) {
  return row.sell_qty === row.buy_qty && row.sell_price != null;
}

export function isPartialSell(row) {
  return (row.sell_price != null) !== (row.sell_qty > 0);
}

export function combineLots(lots) {
  const buyQty = lots.reduce((sum, row) => sum + row.buy_qty, 0);
  const buyCost = lots.reduce((sum, row) => sum + row.buy_price * row.buy_qty, 0);
  const sellQty = lots.reduce((sum, row) => sum + row.sell_qty, 0);
  const sellRevenue = lots.reduce((sum, row) => sum + (row.sell_price ?? 0) * row.sell_qty, 0);
  return {
    name: tradeName(lots[0].name),
    buy_qty: buyQty,
    buy_price: Math.round(buyCost / buyQty),
    sell_qty: sellQty,
    sell_price: sellQty > 0 ? Math.round(sellRevenue / sellQty) : null,
  };
}

function groupsByName(rows, complete) {
  const groups = new Map();
  for (const row of rows) {
    if (isCompleteTrade(row) !== complete || isPartialSell(row)) continue;
    const key = tradeName(row.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function openGroups(rows) {
  return groupsByName(rows, false);
}

export function completeGroups(rows) {
  return groupsByName(rows, true);
}
