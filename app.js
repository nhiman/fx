const $ = (id) => document.getElementById(id);

const stateKey = "usdjpy_be_state_v2";

let positions = []; // {id, selected, lots, entry}

function roundToTick(x, tick) {
  if (!isFinite(x)) return x;
  return Math.round(x / tick) * tick;
}

function parseNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function load() {
  const raw = localStorage.getItem(stateKey);
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    positions = Array.isArray(s.positions) ? s.positions : [];
    if (s.side) $("side").value = s.side;
    if (s.mid != null) $("mid").value = s.mid;
    if (s.spread != null) $("spread").value = s.spread;
    if (s.unit != null) $("unit").value = s.unit;
    if (s.fundsMode) $("fundsMode").value = s.fundsMode;
    if (s.funds != null) $("funds").value = s.funds;
  } catch {}
}

function save() {
  const s = {
    positions,
    side: $("side").value,
    mid: $("mid").value,
    spread: $("spread").value,
    unit: $("unit").value,
    fundsMode: $("fundsMode").value,
    funds: $("funds").value,
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

// 資金0になる価格（決済側）を計算（balanceは「口座残高」想定）
function calcZeroPriceClose(side, selected, unit, balanceJPY) {
  if (balanceJPY == null) return null;

  let sumQty = 0;       // USD数量
  let sumEntryQty = 0;  // JPY（entry * qty）

  for (const p of selected) {
    const L = parseNum(p.lots);
    const P = parseNum(p.entry);
    if (L == null || P == null) continue;
    if (L <= 0) continue;

    const qty = L * unit;
    sumQty += qty;
    sumEntryQty += P * qty;
  }

  if (sumQty === 0) return null;

  if (side === "BUY") {
    // equity = balance + Σ((bid - entry)*qty) = 0  => bid = (Σ(entry*qty) - balance)/Σqty
    return (sumEntryQty - balanceJPY) / sumQty; // Bid
  } else {
    // equity = balance + Σ((entry - ask)*qty) = 0  => ask = (balance + Σ(entry*qty))/Σqty
    return (balanceJPY + sumEntryQty) / sumQty; // Ask
  }
}

function render() {
  const side = $("side").value; // BUY / SELL
  const mid = parseNum($("mid").value);
  const spread = parseNum($("spread").value) ?? 0.01;
  const unit = parseNum($("unit").value) ?? 100000;

  // USDJPYの一般的な最小刻みを仮定（=1 point）
  const tick = 0.001;

  let bid = null, ask = null;
  if (mid != null) {
    bid = roundToTick(mid - spread / 2, tick);
    ask = roundToTick(mid + spread / 2, tick);
  }

  const tbody = $("tbody");
  tbody.innerHTML = "";

  const selected = positions.filter(p => p.selected);

  // 分岐点（選択分）
  const be = calcBreakeven(selected);
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

  // 含み損益（選択分・現在値がある場合）
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

    // 入力中にrenderするとフォームが作り直されてフォーカスが飛ぶので、inputではrenderしない
    inLots.addEventListener("input", () => {
      p.lots = inLots.value;
      save();
    });
    inLots.addEventListener("change", () => {
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
    });
    inEntry.addEventListener("change", () => {
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

  if (bid != null && ask != null && totalOk) {
    $("pnl").textContent = `${Math.round(totalPnl).toLocaleString()}`;
  } else {
    $("pnl").textContent = "-";
  }

  // 資金0価格
  const fundsMode = $("fundsMode").value; // BALANCE / EQUITY
  const funds = parseNum($("funds").value);

  // 計算に使う「口座残高」を決める
  // BALANCE: そのまま残高
  // EQUITY: 残高 = 有効証拠金 - 現在含み損益（※入力したポジションのみで計算）
  let balanceJPY = null;
  if (funds != null) {
    if (fundsMode === "BALANCE") {
      balanceJPY = funds;
    } else {
      // 有効証拠金入力の場合、現在値と含み損益が必要
      if (bid != null && ask != null && totalOk) {
        balanceJPY = funds - totalPnl;
      } else {
        balanceJPY = null;
      }
    }
  }

  let zeroClose = null;
  let zeroMid = null;

  const z = calcZeroPriceClose(side, selected, unit, balanceJPY);
  if (z != null) {
    if (side === "BUY") {
      zeroClose = z;             // Bid
      zeroMid = z + spread / 2;  // Mid
    } else {
      zeroClose = z;             // Ask
      zeroMid = z - spread / 2;  // Mid
    }
    zeroClose = roundToTick(zeroClose, tick);
    zeroMid = roundToTick(zeroMid, tick);
  }

  $("zeroClose").textContent = (zeroClose == null) ? "-" : zeroClose.toFixed(3);
  $("zeroMid").textContent = (zeroMid == null) ? "-" : zeroMid.toFixed(3);

  // 注意書き
  const note = [];
  if (side === "BUY") note.push("買いはBidで評価・決済。");
  else note.push("売りはAskで評価・決済。");
  note.push("スワップ/手数料=0前提。");
  note.push("資金0価格は選択行のみで計算。全体で見たい場合は全選択。");

  if (fundsMode === "EQUITY") {
    note.push("資金の種類=有効証拠金の場合、現在Midと含み損益から残高を逆算して算出。");
    if (funds != null && (bid == null || ask == null || !totalOk)) {
      note.push("有効証拠金モードでは現在Midと各行の入力が揃わないと計算できない。");
    }
  } else {
    note.push("資金の種類=口座残高の場合、その値を残高として直接使用。");
  }

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

  ["side", "mid", "spread", "unit", "fundsMode", "funds"].forEach(id => {
    $(id).addEventListener("input", () => { save(); render(); });
    $(id).addEventListener("change", () => { save(); render(); });
  });

  if (positions.length === 0) {
    positions = [
      { id: crypto.randomUUID(), selected: true, lots: 0.1, entry: 145.000 },
    ];
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
  }

  render();
}

init();
