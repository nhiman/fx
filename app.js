const $ = (id) => document.getElementById(id);

const stateKey = "usdjpy_be_state_v1";

let positions = []; // {id, selected, lots, entry}

function roundToTick(x, tick) {
  if (!isFinite(x)) return x;
  return Math.round(x / tick) * tick;
}

function load() {
  const raw = localStorage.getItem(stateKey);
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    positions = Array.isArray(s.positions) ? s.positions : [];
    if (s.side) $("side").value = s.side;
    if (s.mid) $("mid").value = s.mid;
    if (s.spread) $("spread").value = s.spread;
    if (s.unit) $("unit").value = s.unit;
  } catch {}
}

function save() {
  const s = {
    positions,
    side: $("side").value,
    mid: $("mid").value,
    spread: $("spread").value,
    unit: $("unit").value,
  };
  localStorage.setItem(stateKey, JSON.stringify(s));
}

function addRow() {
  positions.push({
    id: crypto.randomUUID(),
    selected: true,
    lots: 0.1,
    entry: 0,
  });
  render();
}

function deleteRow(id) {
  positions = positions.filter(p => p.id !== id);
  render();
}

function parseNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 選択分の分岐点（加重平均）
function calcBreakeven(selected) {
  let sumL = 0;
  let sumLP = 0;
  for (const p of selected) {
    const L = parseNum(p.lots);
    const P = parseNum(p.entry);
    if (L == null || P == null) continue;
    if (L <= 0) continue;
    sumL += L;
    sumLP += L * P;
  }
  if (sumL === 0) return null;
  return sumLP / sumL;
}

// 円損益（USDJPY・口座JPY・コストなし）
function calcPnlJPY(side, bid, ask, unit, p) {
  const L = parseNum(p.lots);
  const P = parseNum(p.entry);
  if (L == null || P == null) return null;
  if (L <= 0) return null;

  const qty = L * unit; // USD数量
  if (side === "BUY") {
    return (bid - P) * qty;
  } else {
    return (P - ask) * qty;
  }
}

function render() {
  const side = $("side").value; // BUY / SELL
  const mid = parseNum($("mid").value);
  const spread = parseNum($("spread").value) ?? 0.01;
  const unit = parseNum($("unit").value) ?? 100000;

  // tickはUSDJPYの一般的な最小刻み: 0.001（=1 point）を仮定
  const tick = 0.001;

  let bid = null, ask = null;
  if (mid != null) {
    bid = mid - spread / 2;
    ask = mid + spread / 2;
    bid = roundToTick(bid, tick);
    ask = roundToTick(ask, tick);
  }

  const tbody = $("tbody");
  tbody.innerHTML = "";

  const selected = positions.filter(p => p.selected);

  const be = calcBreakeven(selected);
  // 分岐点（決済価格）
  // BUY: close at Bid => Bid=BE
  // SELL: close at Ask => Ask=BE
  let beClose = null;
  let beMid = null;

  if (be != null) {
    if (side === "BUY") {
      beClose = be;              // Bid
      beMid = be + spread / 2;   // mid
    } else {
      beClose = be;              // Ask
      beMid = be - spread / 2;   // mid
    }
    beClose = roundToTick(beClose, tick);
    beMid = roundToTick(beMid, tick);
  }

  // 合計損益
  let totalPnl = 0;
  let totalOk = true;

  for (const p of positions) {
    const tr = document.createElement("tr");

    const tdSel = document.createElement("td");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!p.selected;
    cb.addEventListener("change", () => {
      p.selected = cb.checked;
      save();
      render();
    });
    tdSel.appendChild(cb);

    const tdLots = document.createElement("td");
    tdLots.className = "num";
    const inLots = document.createElement("input");
    inLots.type = "number";
    inLots.inputMode = "decimal";
    inLots.step = "0.01";
    inLots.value = p.lots;
    inLots.style.width = "110px";
    inLots.addEventListener("input", () => {
      p.lots = inLots.value;
      save();
      render();
    });
    tdLots.appendChild(inLots);

    const tdEntry = document.createElement("td");
    tdEntry.className = "num";
    const inEntry = document.createElement("input");
    inEntry.type = "number";
    inEntry.inputMode = "decimal";
    inEntry.step = "0.001";
    inEntry.value = p.entry;
    inEntry.style.width = "130px";
    inEntry.addEventListener("input", () => {
      p.entry = inEntry.value;
      save();
      render();
    });
    tdEntry.appendChild(inEntry);

    const tdPnl = document.createElement("td");
    tdPnl.className = "num";
    let pnl = null;
    if (bid != null && ask != null) {
      pnl = calcPnlJPY(side, bid, ask, unit, p);
    }
    if (pnl == null) {
      tdPnl.textContent = "-";
      if (p.selected) totalOk = false;
    } else {
      tdPnl.textContent = Math.round(pnl).toLocaleString();
      if (p.selected) totalPnl += pnl;
    }

    const tdDel = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "削除";
    btn.addEventListener("click", () => { deleteRow(p.id); save(); });
    tdDel.appendChild(btn);

    tr.appendChild(tdSel);
    tr.appendChild(tdLots);
    tr.appendChild(tdEntry);
    tr.appendChild(tdPnl);
    tr.appendChild(tdDel);
    tbody.appendChild(tr);
  }

  $("beClose").textContent = (beClose == null) ? "-" : beClose.toFixed(3);
  $("beMid").textContent = (beMid == null) ? "-" : beMid.toFixed(3);

  if (bid != null && ask != null) {
    $("bidask").textContent = `${bid.toFixed(3)} / ${ask.toFixed(3)}`;
  } else {
    $("bidask").textContent = "-";
  }

  if (bid != null && ask != null && beClose != null && totalOk) {
    $("pnl").textContent = `${Math.round(totalPnl).toLocaleString()}`;
  } else {
    $("pnl").textContent = "-";
  }

  // 注意書き（仕様の明示）
  const note = [];
  if (side === "BUY") note.push("買いはBid決済で損益計算。分岐点（決済価格）はBid。");
  else note.push("売りはAsk決済で損益計算。分岐点（決済価格）はAsk。");
  note.push("コスト（スワップ/手数料）は0前提。");
  note.push("分岐点は選択行のロット加重平均。");
  $("note").textContent = note.join(" ");
}

function init() {
  load();

  $("add").addEventListener("click", () => { addRow(); save(); });
  $("clear").addEventListener("click", () => {
    positions = [];
    save();
    render();
  });

  ["side", "mid", "spread", "unit"].forEach(id => {
    $(id).addEventListener("input", () => { save(); render(); });
    $(id).addEventListener("change", () => { save(); render(); });
  });

  if (positions.length === 0) {
    positions = [
      { id: crypto.randomUUID(), selected: true, lots: 0.1, entry: 145.000 },
    ];
  }

  // PWA: Service Worker登録
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
  }

  render();
}

init();
