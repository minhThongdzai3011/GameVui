// Pikachu cổ điển (Onet) — nối 2 ô giống nhau bằng đường gấp khúc tối đa 3 đoạn
// (2 lần rẽ), được đi vòng ra ngoài mép bàn. Mỗi bàn một kiểu dồn ô: đứng yên,
// dồn xuống/lên/trái/phải, dồn vào giữa, tách ra hai bên... Hết nước thì tự đổi
// vị trí (tốn 1 lượt đổi); hết lượt đổi hoặc hết giờ là thua. Luật theo bản
// 2003: 4 giây/ô, 9 bàn, mỗi bàn 720 điểm + thưởng thời gian tối đa 576, qua bàn
// +1 lượt đổi, 3 gợi ý cho cả ván. Có đủ assets/tiles/1..36.png thì dùng bộ hình
// đó (chỉ dùng ở máy cá nhân), không thì dùng hình con vật.
(() => {
  "use strict";

  const ICONS = [..."🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🦜🐤🦆🦉🐳🦒🐴🦄🐝🐛🦋🐌🐞🐢🐍🦖🐙🦀🐠"]
    .join("")
    .match(/\p{Extended_Pictographic}/gu);
  const SIZES = {
    small: { c: 10, r: 6, name: "Nhỏ 10×6" },
    medium: { c: 14, r: 8, name: "Vừa 14×8" },
    large: { c: 16, r: 9, name: "Cổ điển 16×9" },
  };
  // kiểu dồn ô theo thứ tự bàn chơi
  const MODES = [
    { id: "none", name: "Đứng yên" },
    { id: "down", name: "Dồn xuống" },
    { id: "up", name: "Dồn lên" },
    { id: "left", name: "Dồn sang trái" },
    { id: "right", name: "Dồn sang phải" },
    { id: "hin", name: "Dồn vào giữa ↔" },
    { id: "hout", name: "Tách ra hai bên" },
    { id: "vin", name: "Dồn vào giữa ↕" },
    { id: "vout", name: "Tách lên xuống" },
  ];
  const START_SHUFFLES = 10;
  const START_HINTS = 3; // cho CẢ ván, không cộng thêm mỗi bàn (như bản 2003)
  const LEVELS = 9; // qua hết 9 bàn là hoàn thành
  const SEC_PER_PIECE = 4; // 16×9 → 576 giây mỗi bàn, như bản gốc
  const PTS_LEVEL = 720; // ăn hết một bàn luôn được 720 điểm, mọi cỡ bàn
  const PTS_TIME = 576; // thưởng thời gian tối đa khi qua bàn

  const $ = (s) => document.querySelector(s);
  const boardEl = $("#board");
  const linkEl = $("#link");

  // ---------- Lưu trữ ----------
  const load = (k, d) => {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  };
  const save = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* bỏ qua */
    }
  };
  let sizeKey = load("gamevui-pikachu-size", "large");
  if (!SIZES[sizeKey]) sizeKey = "large";
  let best = load("gamevui-pikachu-best", 0);
  let muted = load("gamevui-pikachu-muted", false);

  // ---------- Âm thanh ----------
  let actx = null;
  function tone(f, dur, { delay = 0, type = "triangle", vol = 0.1, to = f } = {}) {
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
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  const sfx = {
    pick: () => tone(880, 0.06, { vol: 0.07 }),
    match: () => {
      tone(660, 0.08, { vol: 0.1 });
      tone(990, 0.12, { delay: 0.07, vol: 0.1 });
    },
    wrong: () => tone(200, 0.15, { type: "square", vol: 0.04, to: 150 }),
    shuffle: () => [0, 1, 2, 3].forEach((i) => tone(400 + i * 120, 0.06, { delay: i * 0.05, vol: 0.06 })),
    clear: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, { delay: i * 0.1, vol: 0.1 })),
    over: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.28, { delay: i * 0.16, vol: 0.09 })),
    tick: () => tone(1500, 0.03, { type: "square", vol: 0.03 }),
  };

  // ---------- Trạng thái ----------
  let R = 9;
  let C = 16;
  let grid = []; // grid[r][c] = id ô hoặc null
  let tiles = new Map(); // id → {type, el, r, c}
  let level = 1;
  let score = 0;
  let shuffles = START_SHUFFLES;
  let hints = START_HINTS;
  let sel = null;
  let busy = false;
  let timeMax = 300;
  let timeLeft = 300;
  let timerId = 0;
  let running = false;
  let hintPair = null;
  let pairsDone = 0;
  let levelAwarded = 0;
  let tileImages = null; // danh sách đường dẫn hình riêng (assets/tiles), null = dùng hình con vật

  const mode = () => MODES[(level - 1) % MODES.length];

  // ---------- Kích thước ô theo màn hình ----------
  let TW = 40;
  let TH = 48;
  function layout() {
    const availW = Math.min(window.innerWidth - 16, 1100);
    const availH = window.innerHeight - 230;
    // bàn có thêm viền 1 ô mỗi bên cho đường nối đi vòng
    const tw = Math.floor(Math.min(availW / (C + 1), (availH / (R + 1)) * 0.84));
    TW = Math.max(20, Math.min(52, tw));
    TH = Math.round(TW * (tileImages ? 1.25 : 1.2)); // hình gốc 40×50
    document.documentElement.style.setProperty("--tw", TW + "px");
    document.documentElement.style.setProperty("--th", TH + "px");
    boardEl.style.width = (C + 1) * TW + "px";
    boardEl.style.height = (R + 1) * TH + "px";
    for (const t of tiles.values()) place(t);
  }
  // tâm điểm ảnh của ô (r,c); bàn chừa nửa ô mỗi bên nên hàng/cột -1 và R/C
  // (viền ngoài, nơi đường nối đi vòng) nằm đúng mép bàn
  const px = (r, c) => ({ x: (c + 1) * TW, y: (r + 1) * TH });
  function place(t) {
    const p = px(t.r, t.c);
    t.el.style.left = p.x - TW / 2 + "px";
    t.el.style.top = p.y - TH / 2 + "px";
  }

  // ---------- Tạo bàn ----------
  const shuffleArr = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  function buildBoard() {
    const sz = SIZES[sizeKey];
    // màn hình dọc: xoay bàn cho vừa
    const portrait = window.innerHeight > window.innerWidth * 1.15;
    C = portrait ? sz.r : sz.c;
    R = portrait ? sz.c : sz.r;
    const n = R * C;
    const kinds = Math.min(ICONS.length, n / 4); // mỗi loại 4 ô như bản gốc
    const types = [];
    for (let i = 0; types.length < n; i++) types.push(i % kinds, i % kinds);
    shuffleArr(types);
    boardEl.querySelectorAll(".tile").forEach((e) => e.remove());
    tiles = new Map();
    grid = Array.from({ length: R }, () => Array(C).fill(null));
    let id = 0;
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++) {
        const t = { id: id++, type: types[r * C + c], r, c, el: document.createElement("button") };
        t.el.className = tileImages ? "tile pic" : "tile";
        t.el.innerHTML = tileImages
          ? `<img src="${tileImages[t.type]}" alt="" draggable="false">`
          : `<span>${ICONS[t.type]}</span>`;
        t.el.setAttribute("aria-label", "Ô loại " + (t.type + 1));
        t.el.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          pick(t);
        });
        grid[r][c] = t.id;
        tiles.set(t.id, t);
        boardEl.append(t.el);
      }
    layout();
    if (!findAnyMove()) reshuffle(false);
  }

  // ---------- Tìm đường nối (tối đa 2 lần rẽ, được đi ra viền ngoài) ----------
  const inPad = (r, c) => r >= -1 && r <= R && c >= -1 && c <= C;
  const empty = (r, c) => r < 0 || r >= R || c < 0 || c >= C || grid[r][c] == null;
  // đoạn thẳng từ a tới b (cùng hàng hoặc cùng cột) không vướng ô nào, không tính 2 đầu
  function clear(r1, c1, r2, c2) {
    if (r1 === r2) {
      for (let c = Math.min(c1, c2) + 1; c < Math.max(c1, c2); c++) if (!empty(r1, c)) return false;
      return true;
    }
    if (c1 === c2) {
      for (let r = Math.min(r1, r2) + 1; r < Math.max(r1, r2); r++) if (!empty(r, c1)) return false;
      return true;
    }
    return false;
  }
  const len = (pts) => pts.reduce((s, p, i) => (i ? s + Math.abs(p[0] - pts[i - 1][0]) + Math.abs(p[1] - pts[i - 1][1]) : 0), 0);
  function findPath(a, b) {
    const A = [a.r, a.c];
    const B = [b.r, b.c];
    if ((a.r === b.r || a.c === b.c) && clear(a.r, a.c, b.r, b.c)) return [A, B];
    const found = [];
    // 1 lần rẽ
    for (const [r, c] of [
      [a.r, b.c],
      [b.r, a.c],
    ])
      if (empty(r, c) && clear(a.r, a.c, r, c) && clear(r, c, b.r, b.c)) found.push([A, [r, c], B]);
    if (found.length) return found.sort((x, y) => len(x) - len(y))[0];
    // 2 lần rẽ: đi thẳng từ a tới điểm p rồi nối 1 lần rẽ tới b
    for (const [dr, dc] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      let r = a.r + dr;
      let c = a.c + dc;
      while (inPad(r, c) && empty(r, c)) {
        const q = dr ? [r, b.c] : [b.r, c];
        if (empty(q[0], q[1]) && clear(r, c, q[0], q[1]) && clear(q[0], q[1], b.r, b.c)) found.push([A, [r, c], q, B]);
        r += dr;
        c += dc;
      }
    }
    return found.length ? found.sort((x, y) => len(x) - len(y))[0] : null;
  }
  function findAnyMove() {
    const byType = new Map();
    for (const t of tiles.values()) {
      if (t.gone) continue;
      if (!byType.has(t.type)) byType.set(t.type, []);
      byType.get(t.type).push(t);
    }
    for (const list of byType.values())
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) if (findPath(list[i], list[j])) return [list[i], list[j]];
    return null;
  }

  // ---------- Đường nối ----------
  function drawLink(pts) {
    const p = pts.map(([r, c]) => px(r, c)).map((q) => `${q.x},${q.y}`).join(" ");
    linkEl.innerHTML = `<polyline points="${p}"/>`;
  }

  // ---------- Thao tác ----------
  function pick(t) {
    if (!running || busy || t.gone) return;
    clearHint();
    if (!sel) {
      sel = t;
      t.el.classList.add("sel");
      sfx.pick();
      return;
    }
    if (sel === t) {
      t.el.classList.remove("sel");
      sel = null;
      return;
    }
    const a = sel;
    a.el.classList.remove("sel");
    sel = null;
    const path = a.type === t.type ? findPath(a, t) : null;
    if (!path) {
      // khác hình hoặc không nối được → chọn ô mới
      sfx.wrong();
      for (const x of [a, t]) {
        x.el.classList.remove("bad");
        void x.el.offsetWidth;
        x.el.classList.add("bad");
      }
      sel = t;
      t.el.classList.add("sel");
      return;
    }
    match(a, t, path);
  }

  function match(a, b, path) {
    busy = true;
    sfx.match();
    drawLink(path);
    a.el.classList.add("sel");
    b.el.classList.add("sel");
    // cộng theo tỉ lệ đã ăn để hết bàn đúng bằng 720 điểm, không lệch vì làm tròn
    pairsDone++;
    const target = Math.round((PTS_LEVEL * pairsDone) / ((R * C) / 2));
    setScore(score + target - levelAwarded);
    levelAwarded = target;
    setTimeout(() => {
      linkEl.innerHTML = "";
      for (const t of [a, b]) {
        t.gone = true;
        t.el.classList.add("gone");
        grid[t.r][t.c] = null;
        setTimeout(() => t.el.remove(), 220);
      }
      gravity();
      busy = false;
      afterMove();
    }, 260);
  }

  function afterMove() {
    const left = [...tiles.values()].filter((t) => !t.gone).length;
    if (!left) return levelClear();
    if (!findAnyMove()) {
      if (shuffles > 0) {
        toast("Hết nước đi!", "Tự đổi vị trí (−1 lượt)");
        setTimeout(() => reshuffle(true), 700);
      } else gameOver("Hết lượt đổi", "Không còn nước đi và cũng hết lượt đổi vị trí.");
    }
  }

  // ---------- Dồn ô theo kiểu của bàn ----------
  function compactLine(cells, toStart) {
    // cells: danh sách [r,c] theo thứ tự; dồn các ô còn lại về đầu (toStart) hoặc cuối
    const ids = cells.map(([r, c]) => grid[r][c]).filter((v) => v != null);
    const order = toStart ? cells : [...cells].reverse();
    const fill = toStart ? ids : [...ids].reverse();
    order.forEach(([r, c], i) => {
      const id = i < fill.length ? fill[i] : null;
      grid[r][c] = id;
      if (id != null) {
        const t = tiles.get(id);
        t.r = r;
        t.c = c;
      }
    });
  }
  function gravity() {
    const m = mode().id;
    const rows = (c, r0, r1) => Array.from({ length: r1 - r0 }, (_, i) => [r0 + i, c]);
    const cols = (r, c0, c1) => Array.from({ length: c1 - c0 }, (_, i) => [r, c0 + i]);
    const hr = Math.floor(R / 2);
    const hc = Math.floor(C / 2);
    if (m === "down" || m === "up") for (let c = 0; c < C; c++) compactLine(rows(c, 0, R), m === "up");
    else if (m === "left" || m === "right") for (let r = 0; r < R; r++) compactLine(cols(r, 0, C), m === "left");
    else if (m === "hin" || m === "hout")
      for (let r = 0; r < R; r++) {
        compactLine(cols(r, 0, hc), m === "hout");
        compactLine(cols(r, hc, C), m === "hin");
      }
    else if (m === "vin" || m === "vout")
      for (let c = 0; c < C; c++) {
        compactLine(rows(c, 0, hr), m === "vout");
        compactLine(rows(c, hr, R), m === "vin");
      }
    for (const t of tiles.values()) if (!t.gone) place(t);
  }

  // ---------- Đổi vị trí ----------
  function reshuffle(cost) {
    if (cost) setShuffles(shuffles - 1);
    const live = [...tiles.values()].filter((t) => !t.gone);
    const spots = live.map((t) => [t.r, t.c]);
    for (let tries = 0; tries < 60; tries++) {
      shuffleArr(spots);
      live.forEach((t, i) => {
        [t.r, t.c] = spots[i];
        grid[t.r][t.c] = t.id;
      });
      if (findAnyMove()) break;
    }
    live.forEach(place);
    sfx.shuffle();
    if (sel) {
      sel.el.classList.remove("sel");
      sel = null;
    }
    clearHint();
  }

  // ---------- Gợi ý ----------
  function clearHint() {
    if (hintPair) hintPair.forEach((t) => t.el.classList.remove("hint"));
    hintPair = null;
  }
  function hint() {
    if (!running || busy || hints <= 0) return;
    const pair = findAnyMove();
    if (!pair) return;
    clearHint();
    hints--;
    $("#hintCount").textContent = hints;
    $("#btnHint").disabled = hints <= 0;
    hintPair = pair;
    pair.forEach((t) => t.el.classList.add("hint"));
  }

  // ---------- Thời gian & điểm ----------
  function setScore(v) {
    score = v;
    const el = $("#stScore");
    el.textContent = score;
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
    if (score > best) {
      best = score;
      save("gamevui-pikachu-best", best);
      $("#stBest").textContent = best;
    }
  }
  function setShuffles(v) {
    shuffles = v;
    $("#stShuffles").textContent = shuffles;
    $("#btnShuffle").disabled = shuffles <= 0;
  }
  function renderTime() {
    const k = Math.max(0, timeLeft / timeMax);
    const fill = $("#timeFill");
    fill.style.width = k * 100 + "%";
    fill.classList.toggle("warn", k < 0.35 && k >= 0.15);
    fill.classList.toggle("danger", k < 0.15);
  }
  function startTimer() {
    clearInterval(timerId);
    timerId = setInterval(() => {
      if (!running || document.hidden) return;
      timeLeft -= 0.25;
      renderTime();
      if (timeLeft <= 10 && timeLeft > 0 && timeLeft % 1 === 0) sfx.tick();
      if (timeLeft <= 0) gameOver("Hết giờ!", `Bạn dừng lại ở bàn ${level}.`);
    }, 250);
  }

  // ---------- Luồng chơi ----------
  function startLevel() {
    buildBoard();
    timeMax = R * C * SEC_PER_PIECE;
    pairsDone = 0;
    levelAwarded = 0;
    timeLeft = timeMax;
    renderTime();
    $("#stLevel").textContent = level;
    $("#stMode").textContent = mode().name;
    running = true;
    startTimer();
    toast(`Bàn ${level}`, mode().name);
  }
  function newGame() {
    closeModal();
    level = 1;
    setScore(0);
    setShuffles(START_SHUFFLES);
    hints = START_HINTS;
    $("#hintCount").textContent = hints;
    $("#btnHint").disabled = false;
    startLevel();
  }
  function levelClear() {
    running = false;
    clearInterval(timerId);
    const bonus = Math.round((PTS_TIME * Math.max(0, timeLeft)) / timeMax);
    setScore(score + bonus);
    sfx.clear();
    if (level >= LEVELS) {
      modal("🏆", "Hoàn thành!", `Bạn đã qua hết ${LEVELS} bàn.<br>Tổng điểm: <b>${score}</b> · Kỷ lục: <b>${best}</b>`, [
        ["Chơi lại", newGame, true],
      ]);
      return;
    }
    setShuffles(shuffles + 1); // qua bàn được thêm 1 lượt đổi
    modal(
      "🎉",
      `Qua bàn ${level}!`,
      `Thưởng thời gian: <b>+${bonus}</b> điểm · thêm 1 lượt đổi.<br>Bàn tiếp theo: <b>${MODES[level % MODES.length].name}</b>`,
      [
        [
          "Bàn tiếp theo",
          () => {
            closeModal();
            level++;
            startLevel();
          },
          true,
        ],
      ],
    );
  }
  function gameOver(title, text) {
    running = false;
    clearInterval(timerId);
    sfx.over();
    modal("😵", title, `${text}<br>Điểm: <b>${score}</b> · Kỷ lục: <b>${best}</b>`, [["Chơi lại", newGame, true]]);
  }

  // ---------- Thông báo / hộp thoại ----------
  let toastTimer = 0;
  function toast(title, sub = "") {
    const t = $("#toast");
    t.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ""}`;
    t.hidden = true;
    void t.offsetWidth;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 1650);
  }
  function modal(ico, title, html, buttons) {
    $("#mIco").textContent = ico;
    $("#mTitle").textContent = title;
    $("#mText").innerHTML = html;
    const box = $("#mBtns");
    box.replaceChildren();
    for (const [label, fn, primary, on] of buttons) {
      const b = document.createElement("button");
      b.className = "btn" + (primary ? " primary" : "") + (on ? " on" : "");
      b.textContent = label;
      b.addEventListener("click", fn);
      box.append(b);
    }
    $("#modal").hidden = false;
  }
  const closeModal = () => ($("#modal").hidden = true);

  // ---------- Nút ----------
  function pauseThen(fn) {
    const was = running;
    running = false;
    return () => {
      closeModal();
      if (was) running = true;
      if (fn) fn();
    };
  }
  $("#btnShuffle").addEventListener("click", () => {
    if (!running || busy || shuffles <= 0) return;
    reshuffle(true);
    if (shuffles <= 0 && !findAnyMove()) afterMove();
  });
  $("#btnHint").addEventListener("click", hint);
  $("#btnRestart").addEventListener("click", () => {
    const resume = pauseThen();
    modal("↻", "Chơi lại?", "Ván hiện tại sẽ bị huỷ và bắt đầu lại từ bàn 1.", [
      ["Chơi lại", newGame, true],
      ["Tiếp tục", resume],
    ]);
  });
  $("#btnSize").addEventListener("click", () => {
    const resume = pauseThen();
    modal(
      "▦",
      "Cỡ bàn",
      "Chọn cỡ bàn — đổi cỡ sẽ bắt đầu ván mới.",
      [
        ...Object.entries(SIZES).map(([k, s]) => [
          s.name,
          () => {
            sizeKey = k;
            save("gamevui-pikachu-size", k);
            newGame();
          },
          false,
          k === sizeKey,
        ]),
        ["Huỷ", resume],
      ],
    );
  });
  const soundBtn = $("#btnSound");
  const refreshSound = () => (soundBtn.firstElementChild.textContent = muted ? "🔇" : "🔊");
  soundBtn.addEventListener("click", () => {
    muted = !muted;
    save("gamevui-pikachu-muted", muted);
    refreshSound();
  });
  refreshSound();
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 120);
  });

  $("#stBest").textContent = best;

  // Bộ hình riêng: nếu có đủ assets/tiles/1.png … 36.png thì dùng thay cho hình con vật
  function loadTileImages() {
    const urls = Array.from({ length: ICONS.length }, (_, i) => `assets/tiles/${i + 1}.png`);
    return Promise.all(
      urls.map(
        (u) =>
          new Promise((ok) => {
            const img = new Image();
            img.onload = () => ok(true);
            img.onerror = () => ok(false);
            img.src = u;
          }),
      ),
    ).then((res) => (res.every(Boolean) ? urls : null));
  }
  loadTileImages().then((urls) => {
    tileImages = urls;
    newGame();
  });
})();
