// Cờ Tướng — bàn 9×10, đủ luật (cản mã, cản tượng, tượng không qua sông, pháo
// ăn qua ngòi, tốt qua sông được đi ngang, tướng/sĩ trong cung, hai tướng không
// được đối mặt). Hết nước đi (bị chiếu bí hoặc bí nước) là thua. Chơi với máy
// (AI alpha-beta chạy trong Web Worker) hoặc hai người; ván đang chơi được lưu.
(() => {
  "use strict";

  // =====================================================================
  // Engine: tự chứa hoàn toàn để có thể chạy cả trong Web Worker
  // Bàn cờ: mảng 90 ô, chỉ số = hàng*9 + cột; hàng 0 là phía Đen (trên).
  // Quân: chữ hoa = Đỏ, chữ thường = Đen. K tướng, A sĩ, B tượng, N mã,
  // R xe, C pháo, P tốt. Nước đi mã hoá thành from*90 + to.
  // =====================================================================
  function Engine() {
    const INIT = (
      "rnbakabnr" +
      "........." +
      ".c.....c." +
      "p.p.p.p.p" +
      "........." +
      "........." +
      "P.P.P.P.P" +
      ".C.....C." +
      "........." +
      "RNBAKABNR"
    )
      .split("")
      .map((ch) => (ch === "." ? "" : ch));

    const V = { K: 0, A: 120, B: 120, N: 270, R: 600, C: 285, P: 30 };
    const MATE = 100000;
    const INF = 1e9;
    const isRed = (p) => p.charCodeAt(0) < 97;
    const inPalace = (r, c, red) => c >= 3 && c <= 5 && (red ? r >= 7 && r <= 9 : r >= 0 && r <= 2);
    const ORTH = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const DIAG = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    // [dr, dc, chân-dr, chân-dc] tính từ vị trí con mã
    const KN = [
      [-2, -1, -1, 0],
      [-2, 1, -1, 0],
      [2, -1, 1, 0],
      [2, 1, 1, 0],
      [-1, -2, 0, -1],
      [1, -2, 0, -1],
      [-1, 2, 0, 1],
      [1, 2, 0, 1],
    ];
    const onBoard = (r, c) => r >= 0 && r <= 9 && c >= 0 && c <= 8;

    function gen(b, red, capsOnly) {
      const out = [];
      for (let i = 0; i < 90; i++) {
        const p = b[i];
        if (!p || isRed(p) !== red) continue;
        const r = (i / 9) | 0;
        const c = i % 9;
        const push = (rr, cc) => {
          if (!onBoard(rr, cc)) return;
          const j = rr * 9 + cc;
          const q = b[j];
          if (q) {
            if (isRed(q) === red) return;
          } else if (capsOnly) return;
          out.push(i * 90 + j);
        };
        switch (p.toUpperCase()) {
          case "K":
            for (const [dr, dc] of ORTH) if (inPalace(r + dr, c + dc, red)) push(r + dr, c + dc);
            break;
          case "A":
            for (const [dr, dc] of DIAG) if (inPalace(r + dr, c + dc, red)) push(r + dr, c + dc);
            break;
          case "B":
            for (const [dr, dc] of DIAG) {
              const rr = r + 2 * dr;
              const cc = c + 2 * dc;
              if (!onBoard(rr, cc) || (red ? rr < 5 : rr > 4)) continue;
              if (b[(r + dr) * 9 + c + dc]) continue; // cản tượng
              push(rr, cc);
            }
            break;
          case "N":
            for (const [dr, dc, lr, lc] of KN) {
              if (!onBoard(r + dr, c + dc)) continue;
              if (b[(r + lr) * 9 + c + lc]) continue; // cản mã
              push(r + dr, c + dc);
            }
            break;
          case "R":
            for (const [dr, dc] of ORTH) {
              let rr = r + dr;
              let cc = c + dc;
              while (onBoard(rr, cc)) {
                const q = b[rr * 9 + cc];
                if (q) {
                  if (isRed(q) !== red) out.push(i * 90 + rr * 9 + cc);
                  break;
                }
                if (!capsOnly) out.push(i * 90 + rr * 9 + cc);
                rr += dr;
                cc += dc;
              }
            }
            break;
          case "C":
            for (const [dr, dc] of ORTH) {
              let rr = r + dr;
              let cc = c + dc;
              let screen = false;
              while (onBoard(rr, cc)) {
                const q = b[rr * 9 + cc];
                if (!screen) {
                  if (q) screen = true;
                  else if (!capsOnly) out.push(i * 90 + rr * 9 + cc);
                } else if (q) {
                  if (isRed(q) !== red) out.push(i * 90 + rr * 9 + cc);
                  break;
                }
                rr += dr;
                cc += dc;
              }
            }
            break;
          case "P": {
            push(r + (red ? -1 : 1), c);
            if (red ? r <= 4 : r >= 5) {
              push(r, c - 1);
              push(r, c + 1);
            }
            break;
          }
        }
      }
      return out;
    }

    function findKing(b, red) {
      const k = red ? "K" : "k";
      const r0 = red ? 7 : 0;
      for (let r = r0; r < r0 + 3; r++) for (let c = 3; c <= 5; c++) if (b[r * 9 + c] === k) return r * 9 + c;
      return -1;
    }

    // Tướng của bên `red` có đang bị chiếu không (kể cả lộ mặt tướng)
    function inCheck(b, red) {
      const k = findKing(b, red);
      if (k < 0) return true;
      const r = (k / 9) | 0;
      const c = k % 9;
      const R = red ? "r" : "R";
      const C = red ? "c" : "C";
      const N = red ? "n" : "N";
      const P = red ? "p" : "P";
      const K = red ? "k" : "K";
      for (const [dr, dc] of ORTH) {
        let rr = r + dr;
        let cc = c + dc;
        let seen = false;
        while (onBoard(rr, cc)) {
          const q = b[rr * 9 + cc];
          if (q) {
            if (!seen) {
              if (q === R || (q === K && dc === 0)) return true;
              seen = true;
            } else {
              if (q === C) return true;
              break;
            }
          }
          rr += dr;
          cc += dc;
        }
      }
      for (const [dr, dc] of KN) {
        const nr = r + dr;
        const nc = c + dc;
        if (!onBoard(nr, nc) || b[nr * 9 + nc] !== N) continue;
        const lr = Math.abs(dr) === 2 ? r + dr / 2 : r + dr;
        const lc = Math.abs(dr) === 2 ? c + dc : c + dc / 2;
        if (!b[lr * 9 + lc]) return true;
      }
      const f = red ? -1 : 1;
      if (onBoard(r + f, c) && b[(r + f) * 9 + c] === P) return true;
      if (c > 0 && b[r * 9 + c - 1] === P) return true;
      if (c < 8 && b[r * 9 + c + 1] === P) return true;
      return false;
    }

    function legal(b, red) {
      const out = [];
      for (const m of gen(b, red, false)) {
        const f = (m / 90) | 0;
        const t = m % 90;
        const cap = b[t];
        b[t] = b[f];
        b[f] = "";
        if (!inCheck(b, red)) out.push(m);
        b[f] = b[t];
        b[t] = cap;
      }
      return out;
    }

    // Điểm thế cờ nhìn từ phía Đỏ
    function evaluate(b) {
      let s = 0;
      for (let i = 0; i < 90; i++) {
        const p = b[i];
        if (!p) continue;
        const red = isRed(p);
        const t = p.toUpperCase();
        const r = (i / 9) | 0;
        const c = i % 9;
        const rr = red ? r : 9 - r; // 9 = hàng cuối nhà mình
        const center = 4 - Math.abs(c - 4);
        let v = V[t];
        switch (t) {
          case "P":
            if (rr <= 4) v += 30 + [5, 25, 25, 15, 0][rr] + (c >= 3 && c <= 5 ? 10 : 0);
            break;
          case "N":
            v += center * 3 + (rr <= 5 ? 15 : 0) - (rr === 9 ? 10 : 0);
            break;
          case "C":
            v += (c === 4 && rr >= 7 ? 10 : 0) + (rr <= 2 ? 6 : 0);
            break;
          case "R":
            v += (rr <= 4 ? 12 : 0) + center - (rr === 9 && (c === 0 || c === 8) ? 10 : 0);
            break;
          case "K":
            v += (c === 4 ? 6 : 0) - (rr < 9 ? 8 : 0);
            break;
        }
        s += red ? v : -v;
      }
      return s;
    }

    let nodes = 0;
    let deadline = 0;
    let stop = false;
    let hist = new Int32Array(8100);
    let killers = [];

    function order(b, ms, ply) {
      const k = killers[ply] || [];
      const sc = ms.map((m) => {
        const f = (m / 90) | 0;
        const t = m % 90;
        if (b[t]) return 1e6 + V[b[t].toUpperCase()] * 10 - V[b[f].toUpperCase()] / 10 + (b[t].toUpperCase() === "K" ? 1e6 : 0);
        if (m === k[0]) return 9e5;
        if (m === k[1]) return 8e5;
        return hist[m];
      });
      const idx = ms.map((_, i) => i).sort((a, c) => sc[c] - sc[a]);
      return idx.map((i) => ms[i]);
    }

    function qs(b, red, alpha, beta, ply) {
      if ((++nodes & 2047) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      const stand = evaluate(b) * (red ? 1 : -1);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      if (ply > 24) return stand;
      for (const m of order(b, gen(b, red, true), ply)) {
        const f = (m / 90) | 0;
        const t = m % 90;
        const cap = b[t];
        b[t] = b[f];
        b[f] = "";
        if (inCheck(b, red)) {
          b[f] = b[t];
          b[t] = cap;
          continue;
        }
        const s = -qs(b, !red, -beta, -alpha, ply + 1);
        b[f] = b[t];
        b[t] = cap;
        if (stop) return 0;
        if (s >= beta) return s;
        if (s > alpha) alpha = s;
      }
      return alpha;
    }

    function negamax(b, red, depth, alpha, beta, ply) {
      if ((++nodes & 2047) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      const chk = inCheck(b, red);
      if (chk && ply < 14) depth++; // gia hạn khi bị chiếu
      if (depth <= 0) return qs(b, red, alpha, beta, ply);
      let best = -INF;
      let count = 0;
      for (const m of order(b, gen(b, red, false), ply)) {
        const f = (m / 90) | 0;
        const t = m % 90;
        const cap = b[t];
        b[t] = b[f];
        b[f] = "";
        if (inCheck(b, red)) {
          b[f] = b[t];
          b[t] = cap;
          continue;
        }
        count++;
        const s = -negamax(b, !red, depth - 1, -beta, -alpha, ply + 1);
        b[f] = b[t];
        b[t] = cap;
        if (stop) return 0;
        if (s > best) best = s;
        if (s > alpha) {
          alpha = s;
          if (alpha >= beta) {
            if (!cap) {
              const k = killers[ply] || (killers[ply] = []);
              if (k[0] !== m) {
                k[1] = k[0];
                k[0] = m;
              }
              hist[m] += depth * depth;
            }
            break;
          }
        }
      }
      if (!count) return -MATE + ply; // bị chiếu bí hoặc bí nước đều thua
      return best;
    }

    const LEVELS = {
      veryeasy: { depth: 0, noise: 400, random: 0.35 },
      easy: { depth: 1, time: 500, noise: 140 },
      medium: { depth: 3, time: 1500, noise: 25 },
      hard: { depth: 8, time: 2800, noise: 0 },
    };

    function search(board, red, level) {
      const b = board.slice();
      const cfg = LEVELS[level] || LEVELS.medium;
      let root = order(b, legal(b, red), 0);
      if (!root.length) return -1;
      if (root.length === 1) return root[0];
      if (!cfg.depth) {
        // cực dễ: chỉ nhìn thế cờ ngay sau nước của mình, không tính nước đáp lại
        // (không có qs) → hay để quân bị ăn, nhiễu lớn nên cũng hay bỏ qua quân
        // hở; thỉnh thoảng đi hẳn nước ngẫu nhiên như người mới tập
        if (Math.random() < cfg.random) return root[(Math.random() * root.length) | 0];
        let pick = root[0];
        let top = -INF;
        for (const m of root) {
          const f = (m / 90) | 0;
          const t = m % 90;
          const cap = b[t];
          b[t] = b[f];
          b[f] = "";
          const v = evaluate(b) * (red ? 1 : -1) + Math.random() * cfg.noise;
          b[f] = b[t];
          b[t] = cap;
          if (v > top) {
            top = v;
            pick = m;
          }
        }
        return pick;
      }
      nodes = 0;
      stop = false;
      deadline = Date.now() + cfg.time;
      hist = new Int32Array(8100);
      killers = [];
      let best = root[0];
      let scores = null;
      for (let d = 1; d <= cfg.depth; d++) {
        const sc = new Map();
        let alpha = -INF;
        let cur = -1;
        for (const m of root) {
          const f = (m / 90) | 0;
          const t = m % 90;
          const cap = b[t];
          b[t] = b[f];
          b[f] = "";
          // có nhiễu (máy dễ) thì cần điểm chính xác của mọi nước → cửa sổ đầy đủ
          const lo = cfg.noise ? -INF : alpha;
          const s = -negamax(b, !red, d - 1, -INF, -lo, 1);
          b[f] = b[t];
          b[t] = cap;
          if (stop) break;
          sc.set(m, s);
          if (s > alpha) {
            alpha = s;
            cur = m;
          }
        }
        if (stop) {
          if (cur >= 0 && sc.get(cur) > (scores ? scores.get(best) : -INF)) best = cur;
          break;
        }
        best = cur;
        scores = sc;
        root = root.slice().sort((a, c) => (sc.get(c) ?? -INF) - (sc.get(a) ?? -INF));
        if (alpha > MATE - 200 || alpha < -MATE + 200) break;
      }
      if (cfg.noise && scores) {
        let pick = best;
        let top = -INF;
        for (const [m, s] of scores) {
          // không bao giờ cố tình đi nước để bị chiếu bí
          if (s < -MATE + 200 && scores.get(best) > -MATE + 200) continue;
          const v = s + Math.random() * cfg.noise;
          if (v > top) {
            top = v;
            pick = m;
          }
        }
        best = pick;
      }
      return best;
    }

    return { INIT, isRed, legal, inCheck, search };
  }

  // =====================================================================
  // Giao diện
  // =====================================================================
  const E = Engine();
  const $ = (s) => document.querySelector(s);
  const boardEl = $("#board");
  const piecesEl = $("#pieces");
  const marksEl = $("#marks");

  const HAN = {
    K: "帥",
    A: "仕",
    B: "相",
    N: "傌",
    R: "俥",
    C: "炮",
    P: "兵",
    k: "將",
    a: "士",
    b: "象",
    n: "馬",
    r: "車",
    c: "砲",
    p: "卒",
  };
  const VI = { K: "Tướng", A: "Sĩ", B: "Tượng", N: "Mã", R: "Xe", C: "Pháo", P: "Tốt" };
  const VI_SHORT = { K: "Tg", A: "S", B: "T", N: "M", R: "X", C: "P", P: "B" };
  const LEVEL_NAME = { veryeasy: "Cực dễ", easy: "Dễ", medium: "Vừa", hard: "Khó" };

  // ---------- Lưu trữ ----------
  const KEY = "gamevui-xiangqi";
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    saved = {};
  }
  const settings = {
    mode: "ai",
    level: "medium",
    side: "red",
    labels: "han",
    muted: false,
    ...(saved.settings || {}),
  };
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ settings, moves: history.map((h) => h.m) }));
    } catch {
      /* bỏ qua */
    }
  }

  // ---------- Âm thanh: tiếng quân gỗ đập xuống bàn ----------
  let actx = null;
  function ac() {
    if (settings.muted) return null;
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        actx = new AC();
      } catch {
        return null;
      }
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
  function knock(vol = 0.5, freq = 1700, delay = 0) {
    const a = ac();
    if (!a) return;
    const t = a.currentTime + delay;
    const len = Math.floor(a.sampleRate * 0.09);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
    const src = a.createBufferSource();
    src.buffer = buf;
    const bp = a.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 2.5;
    const g = a.createGain();
    g.gain.value = vol;
    src.connect(bp).connect(g).connect(a.destination);
    src.start(t);
    const o = a.createOscillator();
    const og = a.createGain();
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    og.gain.setValueAtTime(vol * 0.5, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(og).connect(a.destination);
    o.start(t);
    o.stop(t + 0.1);
  }
  function tone(f, dur, delay = 0, vol = 0.12) {
    const a = ac();
    if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "triangle";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  const sfx = {
    select: () => knock(0.18, 2600),
    move: () => knock(0.55, 1700),
    capture: () => {
      knock(0.8, 1300);
      knock(0.4, 2200, 0.06);
    },
    check: () => [880, 1175].forEach((f, i) => tone(f, 0.16, 0.1 + i * 0.12)),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, i * 0.11)),
    lose: () => [440, 370, 294].forEach((f, i) => tone(f, 0.26, i * 0.15)),
    draw: () => [523, 523].forEach((f, i) => tone(f, 0.15, i * 0.18)),
  };

  // ---------- Vẽ lưới bàn cờ (SVG, toạ độ 580×640, ô 60) ----------
  const X = (c) => 50 + c * 60;
  const Y = (r) => 50 + r * 60;
  (function drawGrid() {
    const s = [];
    s.push(`<rect x="44" y="44" width="492" height="552" stroke-width="3.5"/>`);
    for (let r = 0; r < 10; r++) s.push(`<line x1="${X(0)}" y1="${Y(r)}" x2="${X(8)}" y2="${Y(r)}" stroke-width="1.6"/>`);
    for (let c = 0; c < 9; c++) {
      if (c === 0 || c === 8) s.push(`<line x1="${X(c)}" y1="${Y(0)}" x2="${X(c)}" y2="${Y(9)}" stroke-width="1.6"/>`);
      else {
        s.push(`<line x1="${X(c)}" y1="${Y(0)}" x2="${X(c)}" y2="${Y(4)}" stroke-width="1.6"/>`);
        s.push(`<line x1="${X(c)}" y1="${Y(5)}" x2="${X(c)}" y2="${Y(9)}" stroke-width="1.6"/>`);
      }
    }
    // cung tướng
    for (const [r0, r1] of [
      [0, 2],
      [7, 9],
    ]) {
      s.push(`<line x1="${X(3)}" y1="${Y(r0)}" x2="${X(5)}" y2="${Y(r1)}" stroke-width="1.6"/>`);
      s.push(`<line x1="${X(5)}" y1="${Y(r0)}" x2="${X(3)}" y2="${Y(r1)}" stroke-width="1.6"/>`);
    }
    // dấu vị trí pháo và tốt
    const star = (r, c) => {
      const g = 5;
      const l = 11;
      for (const sx of [-1, 1]) {
        if ((c === 0 && sx < 0) || (c === 8 && sx > 0)) continue;
        for (const sy of [-1, 1]) {
          const x = X(c) + sx * g;
          const y = Y(r) + sy * g;
          s.push(`<path d="M${x + sx * l} ${y}H${x}V${y + sy * l}" stroke-width="1.6"/>`);
        }
      }
    };
    for (const r of [2, 7]) for (const c of [1, 7]) star(r, c);
    for (const r of [3, 6]) for (const c of [0, 2, 4, 6, 8]) star(r, c);
    // sông
    s.push(`<text class="river" x="${X(1.9)}" y="${Y(4.5) + 12}" text-anchor="middle">楚 河</text>`);
    s.push(`<text class="river" x="${X(6.1)}" y="${Y(4.5) + 12}" text-anchor="middle">漢 界</text>`);
    // số cột: trên 1→9 (phía Đen), dưới 9→1 (phía Đỏ) — đúng cả khi xoay bàn
    for (let c = 0; c < 9; c++) {
      s.push(`<text class="lbl" x="${X(c)}" y="26" text-anchor="middle">${c + 1}</text>`);
      s.push(`<text class="lbl" x="${X(c)}" y="627" text-anchor="middle">${9 - c}</text>`);
    }
    $("#grid").innerHTML = s.join("");
  })();

  // ---------- Trạng thái ván ----------
  let board = E.INIT.slice();
  let turn = true; // true = Đỏ
  let history = []; // {m, cap, note, piece}
  let positions = new Map();
  let over = null; // {winner: 'red'|'black'|null, reason}
  let selected = -1;
  let targets = [];
  let hintMove = -1;
  let flipped = false;
  let els = new Array(90).fill(null);
  let thinkId = 0;
  let thinking = false;

  const vsAI = () => settings.mode === "ai";
  const humanRed = () => settings.side === "red";
  const aiTurn = () => vsAI() && !over && turn !== humanRed();
  const posKey = () => board.join(",") + (turn ? "r" : "b");

  // ---------- Hình học ----------
  function pos(i) {
    let r = (i / 9) | 0;
    let c = i % 9;
    if (flipped) {
      r = 9 - r;
      c = 8 - c;
    }
    return { left: (X(c) / 580) * 100 + "%", top: (Y(r) / 640) * 100 + "%" };
  }
  function squareAt(clientX, clientY) {
    const rect = boardEl.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 580;
    const y = ((clientY - rect.top) / rect.height) * 640;
    let c = Math.round((x - 50) / 60);
    let r = Math.round((y - 50) / 60);
    if (c < 0 || c > 8 || r < 0 || r > 9) return -1;
    if (Math.hypot(x - X(c), y - Y(r)) > 31) return -1;
    if (flipped) {
      r = 9 - r;
      c = 8 - c;
    }
    return r * 9 + c;
  }

  // ---------- Quân cờ trên DOM ----------
  function pieceLabel(p) {
    return settings.labels === "han" ? HAN[p] : VI[p.toUpperCase()];
  }
  function makePiece(i) {
    const p = board[i];
    const el = document.createElement("div");
    el.className = "pc " + (E.isRed(p) ? "red" : "black") + (settings.labels === "vi" ? " vi" : "");
    el.innerHTML = `<span>${pieceLabel(p)}</span>`;
    Object.assign(el.style, pos(i));
    return el;
  }
  function renderPieces() {
    piecesEl.replaceChildren();
    els = new Array(90).fill(null);
    for (let i = 0; i < 90; i++) {
      if (!board[i]) continue;
      els[i] = makePiece(i);
      piecesEl.append(els[i]);
    }
  }
  function animateMove(f, t) {
    const el = els[f];
    const dead = els[t];
    if (dead) {
      dead.classList.add("dead");
      setTimeout(() => dead.remove(), 260);
    }
    els[t] = el;
    els[f] = null;
    if (el) {
      el.classList.add("moving");
      Object.assign(el.style, pos(t));
      setTimeout(() => el.classList.remove("moving"), 280);
    }
  }

  function addMark(cls, i) {
    const m = document.createElement("div");
    m.className = "mk " + cls;
    Object.assign(m.style, pos(i));
    marksEl.append(m);
  }
  function renderMarks() {
    marksEl.replaceChildren();
    const last = history[history.length - 1];
    if (last) {
      addMark("last", (last.m / 90) | 0);
      addMark("last", last.m % 90);
    }
    for (const t of targets) addMark(board[t] ? "cap" : "dot", t);
    if (hintMove >= 0) {
      addMark("hint", (hintMove / 90) | 0);
      addMark("hint", hintMove % 90);
    }
    els.forEach((el, i) => {
      if (!el) return;
      el.classList.toggle("sel", i === selected);
      el.classList.remove("checked");
    });
    if (!over || over.winner) {
      for (const red of [true, false]) {
        if (red !== turn) continue;
        if (E.inCheck(board, red)) {
          const k = board.indexOf(red ? "K" : "k");
          if (els[k]) els[k].classList.add("checked");
        }
      }
    }
  }

  function banner(text) {
    const b = document.createElement("div");
    b.className = "banner";
    b.textContent = text;
    boardEl.append(b);
    setTimeout(() => b.remove(), 1150);
  }

  // ---------- Ký hiệu nước đi kiểu Việt Nam (vd: P2-5, M8.7, X1/2) ----------
  function notation(b, m) {
    const f = (m / 90) | 0;
    const t = m % 90;
    const p = b[f];
    const red = E.isRed(p);
    const T = p.toUpperCase();
    const fr = (f / 9) | 0;
    const fc = f % 9;
    const tr = (t / 9) | 0;
    const tc = t % 9;
    const file = (c) => (red ? 9 - c : c + 1);
    const same = [];
    for (let r = 0; r < 10; r++) if (b[r * 9 + fc] === p) same.push(r);
    let head = VI_SHORT[T] + file(fc);
    if (same.length === 2) {
      const front = red ? Math.min(...same) : Math.max(...same);
      head = VI_SHORT[T] + (fr === front ? "t" : "s"); // trước / sau
    }
    const adv = red ? fr - tr : tr - fr;
    if (adv === 0) return `${head}-${file(tc)}`;
    const num = "NBA".includes(T) ? file(tc) : Math.abs(adv);
    return `${head}${adv > 0 ? "." : "/"}${num}`;
  }

  // ---------- Hiển thị bảng / người chơi ----------
  function sideName(red) {
    if (!vsAI()) return red ? "Quân Đỏ" : "Quân Đen";
    return red === humanRed() ? "Bạn" : `Máy · ${LEVEL_NAME[settings.level]}`;
  }
  function renderPlayers() {
    const bottomRed = !flipped;
    for (const [id, red] of [
      ["#pBottom", bottomRed],
      ["#pTop", !bottomRed],
    ]) {
      const el = $(id);
      const av = el.querySelector(".avatar");
      av.className = "avatar " + (red ? "red" : "black");
      av.textContent = red ? HAN.K : HAN.k;
      el.querySelector(".pname").textContent = sideName(red) + (vsAI() ? (red ? " (Đỏ)" : " (Đen)") : "");
      el.classList.toggle("active", !over && turn === red);
      // quân đã ăn được của đối phương
      const caps = history.filter((h) => h.cap && E.isRed(h.piece) === red).map((h) => h.cap);
      const order = "RCNBAP";
      caps.sort((a, b) => order.indexOf(a.toUpperCase()) - order.indexOf(b.toUpperCase()));
      const box = el.querySelector(".pcap");
      box.classList.toggle("vi", settings.labels === "vi");
      box.innerHTML = caps
        .map(
          (p) =>
            `<span class="${E.isRed(p) ? "red" : "black"}">${settings.labels === "han" ? HAN[p] : VI_SHORT[p.toUpperCase()]}</span>`,
        )
        .join("");
    }
  }
  function renderStatus() {
    const st = $("#status");
    const dot = $("#statusDot");
    st.classList.remove("thinking", "check");
    dot.className = "dot " + (turn ? "red" : "black");
    let text;
    if (over) {
      dot.className = "dot " + (over.winner ? over.winner : "");
      text = over.winner ? `${sideName(over.winner === "red")} thắng · ${over.reason}` : `Hòa · ${over.reason}`;
    } else {
      const chk = E.inCheck(board, turn);
      if (thinking) {
        st.classList.add("thinking");
        text = "Máy đang suy nghĩ…";
      } else if (vsAI()) text = turn === humanRed() ? "Đến lượt bạn" : "Lượt của máy";
      else text = `Lượt quân ${turn ? "Đỏ" : "Đen"}`;
      if (chk) {
        st.classList.add("check");
        text += " · Đang bị chiếu!";
      }
    }
    $("#statusText").textContent = text;
  }
  function renderMoves() {
    const ol = $("#moveList");
    if (!history.length) {
      ol.innerHTML = `<li class="empty">Chưa có nước đi nào</li>`;
      return;
    }
    const rows = [];
    for (let i = 0; i < history.length; i += 2) {
      const a = history[i];
      const b = history[i + 1];
      rows.push(`<li><span class="r">${a.note}</span><span class="b">${b ? b.note : ""}</span></li>`);
    }
    ol.innerHTML = rows.join("");
    ol.scrollTop = ol.scrollHeight;
  }
  function renderControls() {
    document.querySelectorAll(".seg").forEach((seg) => {
      const key = seg.dataset.set;
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === settings[key]));
    });
    $("#grpLevel").hidden = !vsAI();
    $("#grpSide").hidden = !vsAI();
    $("#btnLabels").textContent = settings.labels === "han" ? "Chữ: Hán" : "Chữ: Việt";
    $("#btnSound").textContent = settings.muted ? "🔇 Âm thanh" : "🔊 Âm thanh";
    $("#btnUndo").disabled = !history.length || thinking;
    $("#btnHint").disabled = !!over || thinking || aiTurn();
  }
  function renderAll() {
    renderPlayers();
    renderStatus();
    renderMoves();
    renderControls();
    renderMarks();
  }

  // ---------- Luật kết thúc ván ----------
  function checkEnd() {
    const moves = E.legal(board, turn);
    if (!moves.length) {
      const winner = turn ? "black" : "red";
      return { winner, reason: E.inCheck(board, turn) ? "Chiếu bí" : "Đối phương hết nước đi" };
    }
    if ((positions.get(posKey()) || 0) >= 3) return { winner: null, reason: "Lặp lại thế cờ 3 lần" };
    if (!board.some((p) => p && "RNCPrncp".includes(p))) return { winner: null, reason: "Không còn quân tấn công" };
    let quiet = 0;
    for (let i = history.length - 1; i >= 0 && !history[i].cap; i--) quiet++;
    if (quiet >= 120) return { winner: null, reason: "60 nước không ăn quân" };
    return null;
  }

  function showResult() {
    let ico;
    let title;
    if (!over.winner) {
      ico = "🤝";
      title = "Hòa cờ!";
      sfx.draw();
    } else if (vsAI()) {
      const youWin = (over.winner === "red") === humanRed();
      ico = youWin ? "🏆" : "😵";
      title = youWin ? "Bạn thắng!" : "Máy thắng!";
      (youWin ? sfx.win : sfx.lose)();
    } else {
      ico = "🏆";
      title = over.winner === "red" ? "Quân Đỏ thắng!" : "Quân Đen thắng!";
      sfx.win();
    }
    $("#resIco").textContent = ico;
    $("#resTitle").textContent = title;
    $("#resText").textContent = over.reason;
    setTimeout(() => ($("#result").hidden = false), 450);
  }

  // ---------- Đi quân ----------
  function applyMove(m, { animate = true, quiet = false } = {}) {
    const f = (m / 90) | 0;
    const t = m % 90;
    const note = notation(board, m);
    const piece = board[f];
    const cap = board[t];
    board[t] = piece;
    board[f] = "";
    history.push({ m, cap, note, piece });
    turn = !turn;
    positions.set(posKey(), (positions.get(posKey()) || 0) + 1);
    selected = -1;
    targets = [];
    hintMove = -1;
    if (animate) animateMove(f, t);
    over = checkEnd();
    if (quiet) return;
    if (cap) sfx.capture();
    else sfx.move();
    if (!over && E.inCheck(board, turn)) {
      sfx.check();
      banner("Chiếu tướng!");
    }
    renderAll();
    persist();
    if (over) showResult();
    else maybeAI();
  }

  function resetPositions() {
    positions = new Map();
    const b0 = board;
    const t0 = turn;
    board = E.INIT.slice();
    turn = true;
    positions.set(posKey(), 1);
    board = b0;
    turn = t0;
  }

  function newGame() {
    thinkId++;
    thinking = false;
    board = E.INIT.slice();
    turn = true;
    history = [];
    over = null;
    selected = -1;
    targets = [];
    hintMove = -1;
    resetPositions();
    flipped = vsAI() && !humanRed();
    $("#result").hidden = true;
    renderPieces();
    renderAll();
    persist();
    maybeAI();
  }

  // Dựng lại ván từ danh sách nước đi (dùng cho đi lại và khôi phục ván đã lưu)
  function replay(moves) {
    board = E.INIT.slice();
    turn = true;
    history = [];
    over = null;
    resetPositions();
    for (const m of moves) {
      if (over || !E.legal(board, turn).includes(m)) break;
      applyMove(m, { animate: false, quiet: true });
    }
    selected = -1;
    targets = [];
    hintMove = -1;
    renderPieces();
    renderAll();
  }

  function undo() {
    if (!history.length) return;
    thinkId++;
    thinking = false;
    let n = 1;
    if (vsAI()) {
      // lùi tới khi lại đến lượt người chơi
      const moves = history.map((h) => h.m);
      n = 0;
      let t = history.length % 2 === 0; // lượt hiện tại: Đỏ nếu chẵn
      do {
        n++;
        t = !t;
      } while (n < moves.length && t !== humanRed());
      if (t !== humanRed()) n = moves.length; // không còn nước nào của người
    }
    $("#result").hidden = true;
    replay(history.slice(0, history.length - n).map((h) => h.m));
    sfx.select();
    persist();
    maybeAI();
  }

  // ---------- Máy suy nghĩ (Web Worker, dự phòng chạy trên luồng chính) ----------
  let worker = null;
  const pending = new Map();
  try {
    const src = `const E=(${Engine.toString()})();onmessage=(e)=>{const d=e.data;postMessage({id:d.id,move:E.search(d.b,d.red,d.level)});};`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    worker.onmessage = (e) => {
      const cb = pending.get(e.data.id);
      pending.delete(e.data.id);
      if (cb) cb(e.data.move);
    };
    // Worker hỏng (vd. trình duyệt chặn blob) → tính lại trên luồng chính
    worker.onerror = () => {
      worker = null;
      const jobs = [...pending.values()];
      pending.clear();
      jobs.forEach((job) => setTimeout(job.run, 0));
    };
  } catch {
    worker = null;
  }
  function think(red, level, cb) {
    const id = ++thinkId;
    const b = board.slice();
    const done = (move) => {
      if (id === thinkId) cb(move);
    };
    const run = () => {
      if (id === thinkId) done(E.search(b, red, level));
    };
    if (worker) {
      const job = (move) => done(move);
      job.run = run;
      pending.set(id, job);
      worker.postMessage({ id, b, red, level });
    } else setTimeout(run, 30);
  }

  function maybeAI() {
    if (!aiTurn()) return;
    thinking = true;
    renderStatus();
    renderControls();
    const start = performance.now();
    think(turn, settings.level, (m) => {
      const wait = Math.max(0, 450 - (performance.now() - start));
      const id = thinkId;
      setTimeout(() => {
        if (id !== thinkId) return;
        thinking = false;
        if (m >= 0) applyMove(m);
        else renderAll();
      }, wait);
    });
  }

  function hint() {
    if (over || thinking || aiTurn()) return;
    thinking = true;
    renderStatus();
    renderControls();
    $("#statusText").textContent = "Đang tìm nước hay…";
    think(turn, "medium", (m) => {
      thinking = false;
      hintMove = m;
      renderAll();
      setTimeout(() => {
        if (hintMove === m) {
          hintMove = -1;
          renderMarks();
        }
      }, 3000);
    });
  }

  // ---------- Điều khiển ----------
  boardEl.addEventListener("click", (e) => {
    if (e.target.closest(".result")) return;
    if (over || thinking || aiTurn()) return;
    const sq = squareAt(e.clientX, e.clientY);
    if (sq < 0) return;
    if (selected >= 0) {
      const m = selected * 90 + sq;
      if (targets.includes(sq)) return applyMove(m);
    }
    const p = board[sq];
    if (p && E.isRed(p) === turn && sq !== selected) {
      selected = sq;
      targets = E.legal(board, turn)
        .filter((m) => ((m / 90) | 0) === sq)
        .map((m) => m % 90);
      sfx.select();
    } else {
      selected = -1;
      targets = [];
    }
    renderMarks();
  });

  document.querySelectorAll(".seg").forEach((seg) =>
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const key = seg.dataset.set;
      if (settings[key] === b.dataset.v) return;
      settings[key] = b.dataset.v;
      sfx.select();
      // đổi độ khó không cần chơi lại; đổi chế độ/phe thì bắt đầu ván mới
      if (key === "level") {
        renderAll();
        persist();
      } else newGame();
    }),
  );
  $("#btnNew").addEventListener("click", newGame);
  $("#resNew").addEventListener("click", newGame);
  $("#resView").addEventListener("click", () => ($("#result").hidden = true));
  $("#btnUndo").addEventListener("click", undo);
  $("#btnHint").addEventListener("click", hint);
  $("#btnFlip").addEventListener("click", () => {
    flipped = !flipped;
    els.forEach((el, i) => el && Object.assign(el.style, pos(i)));
    renderAll();
  });
  $("#btnLabels").addEventListener("click", () => {
    settings.labels = settings.labels === "han" ? "vi" : "han";
    renderPieces();
    renderAll();
    persist();
  });
  $("#btnSound").addEventListener("click", () => {
    settings.muted = !settings.muted;
    renderControls();
    persist();
  });
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    } else if (e.key === "Escape") {
      selected = -1;
      targets = [];
      renderMarks();
    }
  });

  // ---------- Khởi động: khôi phục ván đang chơi dở ----------
  flipped = vsAI() && !humanRed();
  if (Array.isArray(saved.moves) && saved.moves.length) {
    replay(saved.moves);
    if (over) $("#result").hidden = true;
    maybeAI();
  } else newGame();
})();
