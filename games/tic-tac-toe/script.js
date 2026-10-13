// Tic Tac Toe — tái hiện "Tabletop Tic Tac Toe" (gametable.org):
// màn chính là bàn làm việc với bảng gỗ bần; 1 người (4 độ khó) hoặc 2 người;
// lưới xám nổi khối, X đỏ hồng, O xanh dương; điểm tính riêng cho từng đối thủ;
// người đi trước luân phiên mỗi ván; thắng thì gạch vàng + dải thông báo.
(() => {
  "use strict";

  const SVGNS = "http://www.w3.org/2000/svg";
  const LINES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  const C = {
    x: "#f2355b",
    xDark: "#c7203f",
    o: "#3ea8d8",
    oDark: "#2a87b6",
    grid: "#c9c9c9",
    gridDark: "#b1b1b1",
    win: "#f9c52c",
    winDark: "#d9a312",
  };
  const LEVELS = {
    easy: { name: "Dễ", smart: 0.1 },
    medium: { name: "Trung bình", smart: 0.5 },
    hard: { name: "Khó", smart: 0.85 },
    expert: { name: "Chuyên gia", smart: 1 },
  };
  // Bàn cờ trong hệ toạ độ 760×900 của bản gốc
  const BX = 68;
  const BY = 140;
  const CW = 207.33;
  const CH = 208.33;
  const COLS_X = [153, 380, 606]; // cột điểm: X, Hòa, O

  const $ = (s) => document.querySelector(s);
  const stage = $("#stage");
  const screens = [...document.querySelectorAll(".scr")];
  const gameScr = $('[data-screen="game"]');
  const marksEl = $("#marks");
  const winEl = $("#winLine");
  const bannerEl = $("#banner");
  const resultEl = $("#result");
  const turnTitle = $("#turnTitle");
  const soundSwitch = $("#soundSwitch");

  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* bỏ qua */
      }
    },
  };

  // ---------- Âm thanh ----------
  let actx = null;
  let muted = store.get("gamevui-ttt-muted") === "1";
  function tone(freq, dur, delay = 0, type = "sine", vol = 0.16, slide = 1.2) {
    if (muted) return;
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        actx = new AC();
      } catch {
        return;
      }
    }
    if (actx.state === "suspended") actx.resume();
    const t = actx.currentTime + delay;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  const sfx = {
    click: () => tone(700, 0.06, 0, "triangle", 0.12, 1.1),
    X: () => tone(330, 0.14, 0, "sine", 0.2, 1.6),
    O: () => tone(440, 0.14, 0, "sine", 0.2, 1.6),
    swoosh: () => tone(300, 0.25, 0, "sine", 0.05, 3),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, i * 0.1, "triangle", 0.14, 1)),
    lose: () => [440, 349, 262].forEach((f, i) => tone(f, 0.24, i * 0.14, "triangle", 0.12, 0.97)),
    tie: () => [392, 392].forEach((f, i) => tone(f, 0.14, i * 0.16, "triangle", 0.1, 1)),
  };
  function refreshSound() {
    soundSwitch.classList.toggle("off", muted);
    soundSwitch.firstElementChild.textContent = muted ? "TẮT" : "BẬT";
  }
  refreshSound();

  // ---------- SVG tiện ích ----------
  function el(name, attrs = {}, parent) {
    const e = document.createElementNS(SVGNS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.append(e);
    return e;
  }
  const center = (i) => ({ x: BX + CW * ((i % 3) + 0.5), y: BY + CH * (Math.floor(i / 3) + 0.5) });

  // X / O cỡ lớn có cạnh tối phía dưới tạo cảm giác nổi khối
  function bigX(parent, cx, cy) {
    const g = el("g", { class: "mark" }, parent);
    for (const [dy, color] of [
      [6, C.xDark],
      [0, C.x],
    ])
      for (const a of [45, -45])
        el("rect", {
          x: cx - 80,
          y: cy - 14 + dy,
          width: 160,
          height: 28,
          rx: 4,
          fill: color,
          transform: `rotate(${a} ${cx} ${cy + dy})`,
        }, g);
    return g;
  }
  function bigO(parent, cx, cy) {
    const g = el("g", { class: "mark" }, parent);
    el("circle", { cx, cy: cy + 6, r: 58, fill: "none", stroke: C.oDark, "stroke-width": 22 }, g);
    el("circle", { cx, cy, r: 58, fill: "none", stroke: C.o, "stroke-width": 22 }, g);
    return g;
  }
  // Biểu tượng nhỏ cho tiêu đề lượt và bảng điểm
  function smallIcon(parent, side, cx, cy, s) {
    parent.replaceChildren();
    if (side === "X") {
      const r = s * 0.42;
      el("path", {
        d: `M${cx - r} ${cy - r}L${cx + r} ${cy + r}M${cx + r} ${cy - r}L${cx - r} ${cy + r}`,
        stroke: C.x,
        "stroke-width": s * 0.22,
        "stroke-linecap": "butt",
      }, parent);
    } else {
      el("circle", { cx, cy, r: s * 0.38, fill: "none", stroke: C.o, "stroke-width": s * 0.14 }, parent);
    }
  }

  // ---------- Dựng bàn cờ & bảng điểm ----------
  const gridEl = $("#grid");
  for (const [dy, color] of [
    [4, C.gridDark],
    [0, C.grid],
  ]) {
    for (const x of [269, 477]) el("rect", { x, y: BY + dy, width: 15, height: 625, fill: color }, gridEl);
    for (const y of [340, 548]) el("rect", { x: BX, y: y + dy, width: 622, height: 15, fill: color }, gridEl);
  }
  const cellsEl = $("#cells");
  for (let i = 0; i < 9; i++) {
    const r = el("rect", {
      class: "cell",
      x: BX + CW * (i % 3),
      y: BY + CH * Math.floor(i / 3),
      width: CW,
      height: CH,
      "data-i": i,
    }, cellsEl);
    r.addEventListener("click", (e) => {
      e.stopPropagation();
      tap(i);
    });
  }

  const sb = $("#scoreboard");
  const underline = el("g", { id: "underline" }, sb);
  const ulBar = el("rect", { x: -88, y: 887, width: 176, height: 13 }, underline);
  const ulNotch = el("polygon", { points: "-12,888 12,888 0,877" }, underline);
  const scoreNums = COLS_X.map((x) =>
    el("text", { class: "score-num", x, y: 834, "text-anchor": "middle" }, sb),
  );
  const labels = COLS_X.map((x) =>
    el("text", { class: "score-label", x, y: 877, "text-anchor": "middle" }, sb),
  );
  const labelIcons = [el("g", {}, sb), null, el("g", {}, sb)];

  // ---------- Trạng thái ----------
  let opponent = "medium"; // easy | medium | hard | expert | friend
  let scores = { X: 0, O: 0, T: 0 };
  let starter = "X";
  let board = Array(9).fill(null);
  let turn = "X";
  let over = false;
  let canRestart = false;
  let locked = false; // đang chạy banner / máy đang nghĩ
  let timers = [];

  const vsCpu = () => opponent !== "friend";
  const other = (p) => (p === "X" ? "O" : "X");
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  function loadScores() {
    try {
      const all = JSON.parse(store.get("gamevui-ttt-scores") || "{}");
      scores = all[opponent] || { X: 0, O: 0, T: 0 };
    } catch {
      scores = { X: 0, O: 0, T: 0 };
    }
  }
  function saveScores() {
    let all = {};
    try {
      all = JSON.parse(store.get("gamevui-ttt-scores") || "{}");
    } catch {
      /* dữ liệu hỏng: ghi đè */
    }
    all[opponent] = scores;
    store.set("gamevui-ttt-scores", JSON.stringify(all));
  }

  const sideName = (side) =>
    vsCpu()
      ? side === "X"
        ? "Bạn"
        : `Máy ${LEVELS[opponent].name}`
      : side === "X"
        ? "Người chơi 1"
        : "Người chơi 2";

  function layoutLabels() {
    labels[0].textContent = vsCpu() ? "NGƯỜI CHƠI" : "NGƯỜI CHƠI 1";
    labels[1].textContent = "HÒA";
    labels[2].textContent = vsCpu() ? `MÁY ${LEVELS[opponent].name.toUpperCase()}` : "NGƯỜI CHƠI 2";
    for (const k of [0, 2]) {
      const w = labels[k].getComputedTextLength() || 120;
      const iconW = 26;
      const start = COLS_X[k] - (w + iconW + 6) / 2;
      labels[k].setAttribute("x", start + iconW + 6 + w / 2);
      smallIcon(labelIcons[k], k === 0 ? "X" : "O", start + iconW / 2, 869, 26);
    }
  }

  function layoutTurn() {
    const text = $("#turnText");
    const w = text.getComputedTextLength() || 150;
    const start = 380 - (44 + 14 + w) / 2;
    smallIcon($("#turnIcon"), turn, start + 22, 53, 46);
    text.setAttribute("x", start + 58);
  }

  function updateUI() {
    scoreNums[0].textContent = scores.X;
    scoreNums[1].textContent = scores.T;
    scoreNums[2].textContent = scores.O;
    const col = turn === "X" ? 0 : 2;
    underline.style.transform = `translateX(${COLS_X[col]}px)`;
    ulBar.setAttribute("fill", turn === "X" ? C.x : C.o);
    ulNotch.setAttribute("fill", turn === "X" ? C.x : C.o);
    turnTitle.classList.toggle("hide", over);
    layoutTurn();
  }

  // ---------- AI ----------
  function winnerOf(b) {
    for (const line of LINES) {
      const [a, c, d] = line;
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return { p: b[a], line };
    }
    return null;
  }
  function minimax(b, me, toMove, depth) {
    const w = winnerOf(b);
    if (w) return w.p === me ? 10 - depth : depth - 10;
    if (b.every(Boolean)) return 0;
    let best = toMove === me ? -Infinity : Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = toMove;
      const s = minimax(b, me, other(toMove), depth + 1);
      b[i] = null;
      best = toMove === me ? Math.max(best, s) : Math.min(best, s);
    }
    return best;
  }
  function cpuPick() {
    const empty = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    if (Math.random() >= LEVELS[opponent].smart) return empty[Math.floor(Math.random() * empty.length)];
    let best = -Infinity;
    let moves = [];
    const b = board.slice();
    for (const i of empty) {
      b[i] = turn;
      const s = minimax(b, turn, other(turn), 1);
      b[i] = null;
      if (s > best) {
        best = s;
        moves = [i];
      } else if (s === best) moves.push(i);
    }
    return moves[Math.floor(Math.random() * moves.length)];
  }

  // ---------- Luồng chơi ----------
  function showScreen(name) {
    closeDrawers();
    clearTimers();
    screens.forEach((s) => (s.hidden = s.dataset.screen !== name));
  }

  function startMatch(opp) {
    opponent = opp;
    loadScores();
    starter = "X";
    showScreen("game");
    layoutLabels();
    newRound();
  }

  function newRound() {
    clearTimers();
    board = Array(9).fill(null);
    turn = starter;
    over = false;
    canRestart = false;
    marksEl.replaceChildren();
    winEl.replaceChildren();
    resultEl.classList.remove("show");
    updateUI();
    // Dải thông báo ai đi trước lướt qua màn hình
    $("#bannerText").textContent = `${sideName(turn)} đi trước`;
    bannerEl.classList.remove("show");
    void bannerEl.offsetWidth;
    bannerEl.classList.add("show");
    sfx.swoosh();
    locked = true;
    later(() => {
      locked = false;
      maybeCpu();
    }, 1150);
  }

  function maybeCpu() {
    if (over || !vsCpu() || turn !== "O") return;
    locked = true;
    later(() => {
      locked = false;
      play(cpuPick());
    }, 450 + Math.random() * 300);
  }

  function play(i) {
    board[i] = turn;
    const { x, y } = center(i);
    (turn === "X" ? bigX : bigO)(marksEl, x, y);
    sfx[turn]();
    const win = winnerOf(board);
    if (win || board.every(Boolean)) return finish(win);
    turn = other(turn);
    updateUI();
    maybeCpu();
  }

  function finish(win) {
    over = true;
    starter = other(starter); // ván sau đổi người đi trước
    if (win) {
      scores[win.p]++;
      const a = center(win.line[0]);
      const b = center(win.line[2]);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const ext = 95;
      const g = el("g", { class: "win-line" }, winEl);
      for (const [dy, color] of [
        [4, C.winDark],
        [0, C.win],
      ])
        el("line", {
          x1: a.x - ux * ext,
          y1: a.y - uy * ext + dy,
          x2: b.x + ux * ext,
          y2: b.y + uy * ext + dy,
          stroke: color,
          "stroke-width": 20,
          "stroke-linecap": "round",
        }, g);
    } else scores.T++;
    saveScores();
    updateUI();
    turnTitle.classList.add("hide");

    $("#resultText").textContent = win ? `${sideName(win.p)} thắng!` : "Hòa!";
    later(() => {
      resultEl.classList.add("show");
      if (!win) sfx.tie();
      else if (vsCpu() && win.p === "O") sfx.lose();
      else sfx.win();
    }, 550);
    later(() => (canRestart = true), 900);
  }

  function tap(i) {
    if (over) {
      if (canRestart) newRound();
      return;
    }
    if (locked || board[i] || (vsCpu() && turn !== "X")) return;
    play(i);
  }

  gameScr.addEventListener("click", (e) => {
    if (over && canRestart && !e.target.closest(".round")) newRound();
  });

  // ---------- Ngăn kéo ----------
  const shade = $("#shade");
  function openDrawer(name) {
    sfx.click();
    shade.classList.add("show");
    $("#drawer-" + name).classList.add("open");
  }
  function closeDrawers() {
    shade.classList.remove("show");
    document.querySelectorAll(".drawer").forEach((d) => d.classList.remove("open"));
  }
  shade.addEventListener("click", closeDrawers);
  document.querySelectorAll(".close").forEach((b) => b.addEventListener("click", closeDrawers));
  document.querySelectorAll("[data-open]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      openDrawer(b.dataset.open);
    }),
  );

  // ---------- Nút bấm ----------
  stage.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act], [data-level]");
    if (!b) return;
    sfx.click();
    if (b.dataset.level) return startMatch(b.dataset.level);
    switch (b.dataset.act) {
      case "one":
        showScreen("diff");
        break;
      case "two":
        startMatch("friend");
        break;
      case "exit":
        window.location.href = "../../index.html";
        break;
      case "home":
        showScreen("title");
        break;
      case "reset":
        scores = { X: 0, O: 0, T: 0 };
        saveScores();
        updateUI();
        closeDrawers();
        break;
      case "mainmenu":
        showScreen("title");
        break;
      case "sound":
        muted = !muted;
        store.set("gamevui-ttt-muted", muted ? "1" : "0");
        refreshSound();
        break;
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") return closeDrawers();
    if (gameScr.hidden || shade.classList.contains("show")) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 9) {
      e.preventDefault();
      tap(n - 1);
    } else if ((e.key === "Enter" || e.key === " ") && over && canRestart) {
      e.preventDefault();
      newRound();
    }
  });

  // Font tải xong thì canh lại chữ theo độ rộng thật
  if (document.fonts && document.fonts.ready)
    document.fonts.ready.then(() => {
      layoutLabels();
      layoutTurn();
    });
  showScreen("title");
})();
