// Sudoku — mỗi ván tự sinh đề mới và luôn có đúng MỘT lời giải. Độ khó Dễ/Vừa
// được kiểm tra giải được chỉ bằng suy luận "ô đơn" (không phải đoán); Khó và
// Chuyên gia ít số gợi ý hơn và cần kỹ thuật cao hơn. Có ghi chú (bút chì),
// sai 3 lần là thua, hoàn tác, gợi ý, đồng hồ; ván đang chơi được lưu lại.
(() => {
  "use strict";

  // =====================================================================
  // Bộ sinh & giải đề (bảng 81 ô, 0 = trống)
  // =====================================================================
  const ROW = (i) => (i / 9) | 0;
  const COL = (i) => i % 9;
  const BOX = (i) => ((ROW(i) / 3) | 0) * 3 + ((COL(i) / 3) | 0);
  // các ô "cùng nhóm" (cùng hàng, cột hoặc khối 3×3) với mỗi ô
  const PEERS = Array.from({ length: 81 }, (_, i) => {
    const s = new Set();
    for (let j = 0; j < 81; j++)
      if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) s.add(j);
    return [...s];
  });
  const UNITS = [
    ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
    ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
    ...Array.from({ length: 9 }, (_, b) =>
      Array.from({ length: 9 }, (_, k) => (((b / 3) | 0) * 3 + ((k / 3) | 0)) * 9 + (b % 3) * 3 + (k % 3)),
    ),
  ];
  const bitCount = (x) => {
    let n = 0;
    while (x) {
      x &= x - 1;
      n++;
    }
    return n;
  };
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Đếm số lời giải (dừng khi đạt `limit`); chọn ô ít khả năng nhất trước
  function countSolutions(g, limit = 2, out = null) {
    const rows = new Int16Array(9);
    const cols = new Int16Array(9);
    const boxes = new Int16Array(9);
    for (let i = 0; i < 81; i++)
      if (g[i]) {
        const b = 1 << g[i];
        if (rows[ROW(i)] & b || cols[COL(i)] & b || boxes[BOX(i)] & b) return 0; // đề mâu thuẫn
        rows[ROW(i)] |= b;
        cols[COL(i)] |= b;
        boxes[BOX(i)] |= b;
      }
    let count = 0;
    const randomOrder = !!out; // dùng để sinh bảng đầy đủ ngẫu nhiên
    function rec() {
      let best = -1;
      let bestMask = 0;
      let bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const mask = ~(rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]) & 0x3fe;
        const n = bitCount(mask);
        if (n < bestN) {
          best = i;
          bestMask = mask;
          bestN = n;
          if (n <= 1) break;
        }
      }
      if (best < 0) {
        count++;
        if (out) out.set(g);
        return count >= limit;
      }
      if (!bestN) return false;
      const digits = [];
      for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d);
      if (randomOrder) shuffle(digits);
      const r = ROW(best);
      const c = COL(best);
      const bx = BOX(best);
      for (const d of digits) {
        const b = 1 << d;
        g[best] = d;
        rows[r] |= b;
        cols[c] |= b;
        boxes[bx] |= b;
        const done = rec();
        rows[r] &= ~b;
        cols[c] &= ~b;
        boxes[bx] &= ~b;
        g[best] = 0;
        if (done) return true;
      }
      return false;
    }
    rec();
    return count;
  }

  function randomFull() {
    const out = new Int8Array(81);
    countSolutions(new Int8Array(81), 1, out);
    return out;
  }

  // Giải chỉ bằng "ô đơn": ô chỉ còn 1 số có thể, hoặc số chỉ còn 1 chỗ trong nhóm.
  // Trả về số vòng suy luận cần (0 nếu không giải trọn được bằng cách này).
  function singlesSolve(start) {
    const g = Int8Array.from(start);
    const cand = (i) => {
      let m = 0x3fe;
      for (const p of PEERS[i]) if (g[p]) m &= ~(1 << g[p]);
      return m;
    };
    let rounds = 0;
    for (;;) {
      let progress = false;
      rounds++;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = cand(i);
        if (!m) return 0;
        if (bitCount(m) === 1) {
          g[i] = 31 - Math.clz32(m);
          progress = true;
        }
      }
      for (const unit of UNITS)
        for (let d = 1; d <= 9; d++) {
          let spot = -1;
          let n = 0;
          let placed = false;
          for (const i of unit) {
            if (g[i] === d) placed = true;
            else if (!g[i] && cand(i) & (1 << d)) {
              spot = i;
              n++;
            }
          }
          if (!placed && n === 1) {
            g[spot] = d;
            progress = true;
          }
        }
      if (g.every(Boolean)) return rounds;
      if (!progress) return 0;
    }
  }

  // tries: số đề thử sinh, chọn đề ít số gợi ý nhất
  const LEVELS = {
    easy: { name: "Dễ", clues: 40, singles: true, tries: 1 },
    medium: { name: "Vừa", clues: 32, singles: true, tries: 1 },
    hard: { name: "Khó", clues: 28, singles: false, tries: 4 },
    expert: { name: "Chuyên gia", clues: 17, singles: false, tries: 12 },
  };

  function carve(cfg) {
    const sol = randomFull();
    const p = Int8Array.from(sol);
    let clues = 81;
    const tryRemove = (list) => {
      const old = list.map((i) => p[i]);
      list.forEach((i) => (p[i] = 0));
      const ok = countSolutions(Int8Array.from(p), 2) === 1 && (!cfg.singles || singlesSolve(p) > 0);
      if (ok) clues -= list.length;
      else list.forEach((i, k) => (p[i] = old[k]));
    };
    // lượt 1: bỏ theo cặp đối xứng tâm cho đẹp, giữ điều kiện đúng 1 lời giải
    for (const i of shuffle([...Array(41).keys()])) {
      if (clues <= cfg.clues) break;
      tryRemove(i === 40 ? [40] : [i, 80 - i]);
    }
    // lượt 2: bỏ từng ô lẻ còn bỏ được
    for (const i of shuffle([...Array(81).keys()])) {
      if (clues <= cfg.clues) break;
      if (p[i]) tryRemove([i]);
    }
    return { puzzle: [...p], solution: [...sol], clues };
  }

  function generate(level) {
    const cfg = LEVELS[level];
    let best = null;
    for (let attempt = 0; attempt < cfg.tries * 4 && (!best || !best.fits || attempt < cfg.tries); attempt++) {
      const res = carve(cfg);
      // Khó/Chuyên gia: chỉ nhận đề KHÔNG giải được chỉ bằng ô đơn (nếu tìm được)
      const fits = cfg.singles || !singlesSolve(Int8Array.from(res.puzzle));
      if (fits && (!best || !best.fits || res.clues < best.clues)) best = { ...res, fits };
      else if (!best) best = { ...res, fits };
    }
    return { puzzle: best.puzzle, solution: best.solution };
  }

  // =====================================================================
  // Giao diện
  // =====================================================================
  const $ = (s) => document.querySelector(s);
  const boardEl = $("#board");
  const padEl = $("#pad");
  const KEY = "gamevui-sudoku";
  const STATS_KEY = "gamevui-sudoku-stats";
  const MAX_MISTAKES = 3;

  const load = (k, d) => {
    try {
      return JSON.parse(localStorage.getItem(k)) || d;
    } catch {
      return d;
    }
  };
  const store = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* bỏ qua */
    }
  };
  let stats = load(STATS_KEY, { best: {}, wins: {}, played: {} });

  let g = null; // trạng thái ván
  let sel = -1;
  let notesMode = false;
  let paused = false;
  let timerId = 0;

  // ---------- Âm thanh ----------
  let actx = null;
  function tone(f, dur, delay = 0, type = "sine", vol = 0.1) {
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
    const gn = actx.createGain();
    o.type = type;
    o.frequency.value = f;
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  const sfx = {
    place: () => tone(660, 0.07, 0, "triangle", 0.08),
    wrong: () => tone(180, 0.22, 0, "square", 0.05),
    unit: () => [784, 988].forEach((f, i) => tone(f, 0.12, i * 0.07, "triangle", 0.08)),
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, i * 0.1, "triangle", 0.1)),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.26, i * 0.15, "triangle", 0.09)),
  };

  // ---------- Dựng bảng & bàn phím số ----------
  const cells = [];
  for (let i = 0; i < 81; i++) {
    const c = document.createElement("div");
    c.className = "cell";
    c.setAttribute("role", "gridcell");
    c.addEventListener("pointerdown", () => select(i));
    boardEl.append(c);
    cells.push(c);
  }
  const padBtns = [];
  for (let n = 1; n <= 9; n++) {
    const b = document.createElement("button");
    b.innerHTML = `${n}<small></small>`;
    b.setAttribute("aria-label", "Số " + n);
    b.addEventListener("click", () => input(n));
    padEl.append(b);
    padBtns.push(b);
  }

  // ---------- Lưu / tải ván ----------
  const save = () => store(KEY, { ...g, history: g.history.slice(-150) });
  function newGame(level = g ? g.level : "easy") {
    clearInterval(timerId);
    stopFlash();
    $("#result").hidden = true;
    $("#pauseCover").hidden = true;
    boardEl.style.opacity = "0.4";
    // nhường một khung hình để giao diện kịp cập nhật trước khi sinh đề
    setTimeout(() => {
      const { puzzle, solution } = generate(level);
      g = {
        level,
        puzzle,
        solution,
        values: puzzle.slice(),
        notes: Array(81).fill(0),
        mistakes: 0,
        time: 0,
        hints: 3,
        secondChance: true,
        over: null,
        history: [],
      };
      stats.played[level] = (stats.played[level] || 0) + 1;
      store(STATS_KEY, stats);
      sel = -1;
      paused = false;
      boardEl.style.opacity = "";
      save();
      startTimer();
      render();
    }, 30);
  }

  // ---------- Đồng hồ ----------
  const fmt = (s) => {
    const h = Math.floor(s / 3600);
    const m = String(Math.floor(s / 60) % 60).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return h ? `${h}:${m}:${ss}` : `${m}:${ss}`;
  };
  function startTimer() {
    clearInterval(timerId);
    timerId = setInterval(() => {
      if (paused || !g || g.over) return;
      g.time++;
      $("#timer").textContent = fmt(g.time);
      if (g.time % 5 === 0) save();
    }, 1000);
  }
  function setPaused(p) {
    if (!g || g.over) return;
    paused = p;
    $("#pauseCover").hidden = !p;
    $("#btnPause").textContent = p ? "▶" : "❚❚";
    save();
  }

  // ---------- Hiển thị ----------
  const correct = (i) => g.values[i] && g.values[i] === g.solution[i];
  function render() {
    const v = sel >= 0 ? g.values[sel] : 0;
    for (let i = 0; i < 81; i++) {
      const c = cells[i];
      const val = g.values[i];
      const given = !!g.puzzle[i];
      const wrong = val && val !== g.solution[i];
      let cls = "cell";
      if (given) cls += " given";
      if (wrong) cls += " wrong";
      if (sel >= 0) {
        if (i === sel) cls += " sel";
        else if (v && val === v) cls += " same";
        else if (ROW(i) === ROW(sel) || COL(i) === COL(sel) || BOX(i) === BOX(sel)) cls += " peer";
      }
      // số sai: tô đỏ các ô cùng nhóm đang trùng số
      if (val && PEERS[i].some((p) => g.values[p] === val && g.values[p] !== g.solution[p])) cls += " conflict";
      c.className = cls;
      if (val) c.textContent = val;
      else if (g.notes[i]) {
        let h = '<div class="notes">';
        for (let d = 1; d <= 9; d++)
          h += `<span${v === d && g.notes[i] & (1 << d) ? ' class="hl"' : ""}>${g.notes[i] & (1 << d) ? d : ""}</span>`;
        c.innerHTML = h + "</div>";
      } else c.textContent = "";
      c.setAttribute("aria-label", `Hàng ${ROW(i) + 1}, cột ${COL(i) + 1}: ${val || "trống"}`);
    }
    for (let n = 1; n <= 9; n++) {
      const left = 9 - g.values.filter((x, i) => x === n && x === g.solution[i]).length;
      padBtns[n - 1].classList.toggle("done", left === 0);
      padBtns[n - 1].querySelector("small").textContent = left;
    }
    padEl.classList.toggle("notes-on", notesMode);
    $("#lvName").textContent = LEVELS[g.level].name;
    $("#mistakes").textContent = `${g.mistakes}/${MAX_MISTAKES}`;
    $("#mistakes").classList.toggle("bad", g.mistakes > 0);
    $("#timer").textContent = fmt(g.time);
    $("#notesBadge").textContent = notesMode ? "BẬT" : "TẮT";
    $("#notesBadge").classList.toggle("on", notesMode);
    $("#hintBadge").textContent = g.hints;
    $("#btnHint").disabled = !g.hints || !!g.over;
    $("#btnUndo").disabled = !g.history.length || !!g.over;
    document.querySelectorAll("#levels button").forEach((b) => b.classList.toggle("on", b.dataset.lv === g.level));
  }

  // ---------- Thao tác ----------
  function select(i) {
    if (!g || g.over || paused) return;
    sel = i;
    render();
  }
  function snapshot() {
    g.history.push({ values: g.values.slice(), notes: g.notes.slice() });
  }
  let flashTimers = [];
  function flash(list, cls) {
    list.forEach((i, k) => {
      const c = cells[i];
      c.classList.remove(cls);
      flashTimers.push(
        setTimeout(() => {
          c.classList.add(cls);
          flashTimers.push(setTimeout(() => c.classList.remove(cls), 650));
        }, k * 35),
      );
    });
  }
  function stopFlash() {
    flashTimers.forEach(clearTimeout);
    flashTimers = [];
    cells.forEach((c) => c.classList.remove("wave", "pop"));
  }

  function input(n) {
    if (!g || g.over || paused || sel < 0) return;
    const i = sel;
    if (g.puzzle[i] || correct(i)) return;
    if (notesMode) {
      if (g.values[i]) return;
      snapshot();
      g.notes[i] ^= 1 << n;
      save();
      return render();
    }
    if (g.values[i] === n) return;
    snapshot();
    g.values[i] = n;
    g.notes[i] = 0;
    if (n !== g.solution[i]) {
      g.mistakes++;
      sfx.wrong();
      render();
      cells[i].classList.add("pop");
      setTimeout(() => cells[i].classList.remove("pop"), 260);
      if (g.mistakes >= MAX_MISTAKES) lose();
      save();
      return;
    }
    // đúng: xoá ghi chú số này ở các ô cùng nhóm
    for (const p of PEERS[i]) g.notes[p] &= ~(1 << n);
    render();
    cells[i].classList.add("pop");
    setTimeout(() => cells[i].classList.remove("pop"), 260);
    // hoàn thành hàng / cột / khối → hiệu ứng sóng
    const doneUnits = UNITS.filter((u) => u.includes(i) && u.every(correct));
    if (doneUnits.length) {
      sfx.unit();
      flash([...new Set(doneUnits.flat())], "wave");
    } else sfx.place();
    if (g.values.every((x, k) => x === g.solution[k])) win();
    save();
  }

  function erase() {
    if (!g || g.over || paused || sel < 0) return;
    if (g.puzzle[sel] || correct(sel) || (!g.values[sel] && !g.notes[sel])) return;
    snapshot();
    g.values[sel] = 0;
    g.notes[sel] = 0;
    save();
    render();
  }
  function undo() {
    if (!g || g.over || paused || !g.history.length) return;
    const h = g.history.pop();
    g.values = h.values;
    g.notes = h.notes;
    save();
    render();
  }
  function hint() {
    if (!g || g.over || paused || !g.hints) return;
    let i = sel;
    if (i < 0 || correct(i)) {
      const empty = g.values.map((x, k) => (x === g.solution[k] ? -1 : k)).filter((k) => k >= 0);
      if (!empty.length) return;
      i = empty[Math.floor(Math.random() * empty.length)];
    }
    g.hints--;
    sel = i;
    const prevMistakes = g.mistakes;
    const wasNotes = notesMode;
    notesMode = false;
    input(g.solution[i]);
    notesMode = wasNotes;
    g.mistakes = prevMistakes;
    save();
    render();
  }

  // ---------- Kết thúc ----------
  function win() {
    g.over = "win";
    clearInterval(timerId);
    const lv = g.level;
    const prevBest = stats.best[lv];
    stats.wins[lv] = (stats.wins[lv] || 0) + 1;
    const record = !prevBest || g.time < prevBest;
    if (record) stats.best[lv] = g.time;
    store(STATS_KEY, stats);
    sfx.win();
    flash([...Array(81).keys()], "wave");
    $("#resIco").textContent = record ? "🏆" : "🎉";
    $("#resTitle").textContent = record ? "Kỷ lục mới!" : "Xuất sắc!";
    $("#resText").textContent = `Bạn đã giải xong đề ${LEVELS[lv].name}.`;
    $("#resStats").innerHTML =
      `<div>Thời gian<b>${fmt(g.time)}</b></div>` +
      `<div>Tốt nhất<b>${fmt(stats.best[lv])}</b></div>` +
      `<div>Đã thắng<b>${stats.wins[lv]}</b></div>`;
    $("#resStats").hidden = false;
    $("#resSecond").hidden = true;
    setTimeout(() => ($("#result").hidden = false), 900);
    save();
    render();
  }
  function lose() {
    g.over = "lose";
    sfx.lose();
    $("#resIco").textContent = "😵";
    $("#resTitle").textContent = "Hết lượt!";
    $("#resText").textContent = `Bạn đã sai ${MAX_MISTAKES} lần trong ván này.`;
    $("#resStats").hidden = true;
    $("#resSecond").hidden = !g.secondChance;
    setTimeout(() => ($("#result").hidden = false), 400);
    render();
  }
  $("#resSecond").addEventListener("click", () => {
    // cơ hội thứ hai (1 lần mỗi ván): bỏ số sai vừa điền, được sai thêm 1 lần
    g.secondChance = false;
    g.over = null;
    g.mistakes = MAX_MISTAKES - 1;
    g.values = g.values.map((x, k) => (x && x !== g.solution[k] ? 0 : x));
    $("#result").hidden = true;
    startTimer();
    save();
    render();
  });

  // ---------- Nút & phím ----------
  $("#btnUndo").addEventListener("click", undo);
  $("#btnErase").addEventListener("click", erase);
  $("#btnHint").addEventListener("click", hint);
  $("#btnNotes").addEventListener("click", () => {
    notesMode = !notesMode;
    render();
  });
  $("#btnNew").addEventListener("click", () => {
    if (g && !g.over && g.values.some((x, i) => x && !g.puzzle[i]) && !confirm("Bỏ ván đang chơi và bắt đầu đề mới?"))
      return;
    newGame();
  });
  $("#resNew").addEventListener("click", () => newGame());
  $("#btnPause").addEventListener("click", () => setPaused(!paused));
  $("#btnResume").addEventListener("click", () => setPaused(false));
  document.querySelectorAll("#levels button").forEach((b) =>
    b.addEventListener("click", () => {
      if (g && b.dataset.lv === g.level && !g.over) return;
      if (g && !g.over && g.values.some((x, i) => x && !g.puzzle[i]) && !confirm("Bỏ ván đang chơi và chuyển độ khó?"))
        return;
      newGame(b.dataset.lv);
    }),
  );
  window.addEventListener("keydown", (e) => {
    if (!g) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return undo();
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 9) return input(n);
    const k = e.key;
    if (k === "Backspace" || k === "Delete" || k === "0") return erase();
    if (k === "n" || k === "N") {
      notesMode = !notesMode;
      return render();
    }
    const move = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[k];
    if (move) {
      e.preventDefault();
      if (sel < 0) return select(40);
      const r = ROW(sel);
      const c = COL(sel);
      if (move === -9) select(((r + 8) % 9) * 9 + c);
      else if (move === 9) select(((r + 1) % 9) * 9 + c);
      else if (move === -1) select(r * 9 + ((c + 8) % 9));
      else select(r * 9 + ((c + 1) % 9));
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) setPaused(true);
  });

  // ---------- Khởi động: tiếp tục ván dở nếu có ----------
  const saved = load(KEY, null);
  if (saved && Array.isArray(saved.puzzle) && saved.puzzle.length === 81 && !saved.over) {
    g = saved;
    g.history = g.history || [];
    startTimer();
    render();
  } else newGame(saved && LEVELS[saved.level] ? saved.level : "easy");
})();
