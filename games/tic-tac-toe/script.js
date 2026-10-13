// Tic Tac Toe — theo phong cách trò tic tac toe quen thuộc trên trình duyệt:
// chơi với máy (Dễ / Trung bình / Không thể thắng) hoặc 2 người, chọn phe X/O
// trước nước đầu, X luôn đi trước, nét vẽ có hiệu ứng, gạch đường thắng.
(() => {
  "use strict";

  const SVG = "http://www.w3.org/2000/svg";
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
  const COLOR = { X: "#545454", O: "#f2ebd3" };

  const $ = (id) => document.getElementById(id);
  const marksEl = $("marks");
  const winEl = $("win");
  const cellsEl = $("cells");
  const wrapEl = document.querySelector(".board-wrap");
  const hintEl = $("hint");
  const modeEl = $("mode");
  const soundBtn = $("btnSound");
  const tabs = {
    X: document.querySelector('.tab[data-side="X"]'),
    O: document.querySelector('.tab[data-side="O"]'),
  };

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
  function tone(freq, dur, delay = 0, type = "sine", vol = 0.18) {
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
    o.frequency.exponentialRampToValueAtTime(freq * 1.15, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  const sfx = {
    X: () => tone(392, 0.12),
    O: () => tone(523, 0.12),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, i * 0.09, "triangle", 0.14)),
    lose: () => [392, 311, 262].forEach((f, i) => tone(f, 0.2, i * 0.12, "triangle", 0.12)),
    tie: () => [440, 440].forEach((f, i) => tone(f, 0.12, i * 0.14, "triangle", 0.1)),
  };
  function refreshSound() {
    soundBtn.classList.toggle("muted", muted);
    soundBtn.setAttribute("aria-label", muted ? "Bật âm thanh" : "Tắt âm thanh");
  }
  soundBtn.addEventListener("click", () => {
    muted = !muted;
    store.set("gamevui-ttt-muted", muted ? "1" : "0");
    refreshSound();
  });
  refreshSound();

  // ---------- Trạng thái ----------
  let board = Array(9).fill(null);
  let turn = "X";
  let human = "X";
  let over = false;
  let started = false;
  let scores = null; // null = chưa xong ván nào → hiện "–"
  let cpuTimer = 0;

  const vsCpu = () => modeEl.value !== "friend";
  const other = (p) => (p === "X" ? "O" : "X");

  function winnerOf(b) {
    for (const line of LINES) {
      const [a, c, d] = line;
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return { p: b[a], line };
    }
    return null;
  }

  // ---------- AI (minimax, chọn ngẫu nhiên giữa các nước tốt như nhau) ----------
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
  function bestMove(b, me) {
    let best = -Infinity;
    let moves = [];
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = me;
      const s = minimax(b, me, other(me), 1);
      b[i] = null;
      if (s > best) {
        best = s;
        moves = [i];
      } else if (s === best) moves.push(i);
    }
    return moves[Math.floor(Math.random() * moves.length)];
  }
  function cpuPick() {
    const empty = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    const random = () => empty[Math.floor(Math.random() * empty.length)];
    const smart = { easy: 0.15, medium: 0.6, hard: 1 }[modeEl.value];
    return Math.random() < smart ? bestMove(board.slice(), turn) : random();
  }

  // ---------- Vẽ ----------
  function el(name, attrs) {
    const e = document.createElementNS(SVG, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  const center = (i) => ({ x: (i % 3) * 100 + 50, y: Math.floor(i / 3) * 100 + 50 });
  const dash = { pathLength: 100, "stroke-dasharray": 100, "stroke-dashoffset": 100 };

  function drawMark(i, p) {
    const { x, y } = center(i);
    const g = el("g", { class: `mark ${p.toLowerCase()}`, "data-i": i });
    if (p === "X") {
      const r = 27;
      g.append(
        el("line", { x1: x - r, y1: y - r, x2: x + r, y2: y + r, class: "draw", ...dash }),
        el("line", { x1: x + r, y1: y - r, x2: x - r, y2: y + r, class: "draw second", ...dash }),
      );
    } else {
      g.append(
        el("circle", {
          cx: x,
          cy: y,
          r: 29,
          class: "draw circle",
          transform: `rotate(-90 ${x} ${y})`,
          ...dash,
        }),
      );
    }
    marksEl.append(g);
  }

  function drawWinLine(line, p) {
    const a = center(line[0]);
    const b = center(line[2]);
    const dx = Math.sign(b.x - a.x) * 38;
    const dy = Math.sign(b.y - a.y) * 38;
    winEl.append(
      el("line", {
        x1: a.x - dx,
        y1: a.y - dy,
        x2: b.x + dx,
        y2: b.y + dy,
        class: "winline",
        stroke: COLOR[p],
        ...dash,
      }),
    );
  }

  function updateUI() {
    for (const side of ["X", "O"]) {
      tabs[side].classList.toggle("turn", !over && turn === side);
      $("score" + side).textContent = scores ? scores[side] : "–";
    }
    $("scoreT").textContent = scores ? scores.T : "–";
    $("whoX").textContent = vsCpu() ? (human === "X" ? "Bạn" : "Máy") : "Người 1";
    $("whoO").textContent = vsCpu() ? (human === "O" ? "Bạn" : "Máy") : "Người 2";
    wrapEl.classList.toggle("over", over);
    [...cellsEl.children].forEach((b, i) => {
      b.disabled = !over && (!!board[i] || (vsCpu() && turn !== human));
    });

    if (over) return;
    if (!started) hintEl.textContent = vsCpu() ? "Bắt đầu, hoặc chọn phe" : "Lượt của X";
    else if (vsCpu()) hintEl.textContent = turn === human ? "Lượt của bạn" : "Máy đang nghĩ…";
    else hintEl.textContent = `Lượt của ${turn}`;
  }

  // ---------- Luồng chơi ----------
  function finish(win) {
    over = true;
    scores = scores || { X: 0, O: 0, T: 0 };
    if (win) {
      scores[win.p]++;
      marksEl.querySelectorAll(".mark").forEach((m) => {
        if (!win.line.includes(Number(m.dataset.i))) m.classList.add("dim");
      });
      drawWinLine(win.line, win.p);
      if (vsCpu()) {
        const youWin = win.p === human;
        hintEl.textContent = youWin ? "Bạn thắng! 🎉 Chạm để chơi lại" : "Máy thắng! Chạm để chơi lại";
        (youWin ? sfx.win : sfx.lose)();
      } else {
        hintEl.textContent = `${win.p} thắng! 🎉 Chạm để chơi lại`;
        sfx.win();
      }
    } else {
      scores.T++;
      marksEl.querySelectorAll(".mark").forEach((m) => m.classList.add("dim"));
      hintEl.textContent = "Hòa! Chạm để chơi lại";
      sfx.tie();
    }
    updateUI();
  }

  function play(i) {
    board[i] = turn;
    started = true;
    drawMark(i, turn);
    sfx[turn]();
    const win = winnerOf(board);
    if (win || board.every(Boolean)) {
      // đợi nét cuối vẽ xong rồi mới gạch / làm mờ
      over = true;
      updateUI();
      setTimeout(() => finish(win), 320);
      return;
    }
    turn = other(turn);
    updateUI();
    if (vsCpu() && turn !== human) {
      cpuTimer = setTimeout(() => play(cpuPick()), 450 + Math.random() * 250);
    }
  }

  function newRound() {
    clearTimeout(cpuTimer);
    board = Array(9).fill(null);
    turn = "X";
    over = false;
    started = false;
    marksEl.replaceChildren();
    winEl.replaceChildren();
    updateUI();
    if (vsCpu() && human === "O") cpuTimer = setTimeout(() => play(cpuPick()), 500);
  }

  function resetAll() {
    scores = null;
    newRound();
  }

  function tap(i) {
    if (over) {
      // chỉ cho chơi lại khi kết quả đã hiện xong
      if (hintEl.textContent.includes("Chạm")) newRound();
      return;
    }
    if (board[i] || (vsCpu() && turn !== human)) return;
    play(i);
  }

  for (let i = 0; i < 9; i++) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", `Ô hàng ${Math.floor(i / 3) + 1}, cột ${(i % 3) + 1}`);
    b.addEventListener("click", () => tap(i));
    cellsEl.append(b);
  }
  // Chọn phe trước nước đầu tiên (chỉ khi chơi với máy)
  for (const side of ["X", "O"]) {
    tabs[side].addEventListener("click", () => {
      if (!vsCpu() || started || over || human === side) return;
      human = side;
      newRound();
    });
  }

  modeEl.value = store.get("gamevui-ttt-mode") || "medium";
  modeEl.addEventListener("change", () => {
    store.set("gamevui-ttt-mode", modeEl.value);
    human = "X";
    resetAll();
    modeEl.blur();
  });
  $("btnRestart").addEventListener("click", resetAll);

  window.addEventListener("keydown", (e) => {
    if (e.target === modeEl) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 9) {
      e.preventDefault();
      tap(n - 1);
    } else if ((e.key === "Enter" || e.key === " ") && over) {
      e.preventDefault();
      tap(0);
    }
  });

  resetAll();
})();
