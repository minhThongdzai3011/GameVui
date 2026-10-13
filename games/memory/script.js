// Memory Cards — theo phong cách "Memory Cards" (CrazyGames): mỗi màn một khung
// cảnh (đền cổ, rừng rậm, đáy biển, sa mạc) với mặt sau thẻ riêng; bố cục bàn
// nhiều hình dạng; màn có thể giới hạn thời gian hoặc số lượt; 3 sao giảm dần
// theo số lần lật sai; ghép đúng thì 2 thẻ bay ra giữa kèm tia sáng; đèn pin soi
// nhanh mọi thẻ; màn 1 có hướng dẫn từng bước; tiến độ lưu trên máy.
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const app = $("#app");
  const bg = $("#bg");
  const boardEl = $("#board");
  const fxEl = $("#fx");
  const handEl = $("#hand");
  const tutEl = $("#tut");

  // ---------- Lưu trữ ----------
  const KEY = "gamevui-memory";
  let progress = { stars: {}, flash: 3, tutDone: false, tipShown: false };
  try {
    progress = { ...progress, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    /* dữ liệu hỏng: dùng mặc định */
  }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(progress));
    } catch {
      /* bỏ qua */
    }
  };

  // ---------- Thế giới ----------
  const WORLDS = {
    temple: {
      bg:
        "radial-gradient(ellipse at 50% 12%, rgba(255,214,120,.55), transparent 45%)," +
        "repeating-linear-gradient(0deg, rgba(0,0,0,.13) 0 3px, transparent 3px 64px)," +
        "repeating-linear-gradient(90deg, rgba(0,0,0,.1) 0 3px, transparent 3px 128px)," +
        "linear-gradient(180deg,#5b3a20 0%,#7b5030 45%,#3a2214 100%)",
      items: ["💰", "🪙", "💎", "👑", "🏺", "🗝️", "📜", "🗿", "🔱", "🐍", "🧿", "⚱️"],
      deco: [
        ["🔥", { left: "1%", bottom: "8%", fontSize: "17vmin" }, "flicker"],
        ["🏺", { left: "7%", bottom: "1%", fontSize: "11vmin" }],
        ["🗿", { right: "2%", bottom: "5%", fontSize: "21vmin" }],
        ["🔥", { right: "16%", bottom: "30%", fontSize: "8vmin" }, "flicker soft"],
        ["🪙", { right: "12%", top: "16%", fontSize: "6vmin" }, "float soft"],
      ],
    },
    jungle: {
      bg:
        "radial-gradient(ellipse at 50% 45%, rgba(220,255,240,.5), transparent 35%)," +
        "linear-gradient(180deg,#a8dccf 0%,#5f9d63 42%,#2c5934 100%)",
      items: ["🦜", "🐒", "🍌", "🦋", "🌺", "🐸", "🍍", "🐯", "🦎", "🥥", "🐘", "🍄"],
      deco: [
        ["🌴", { left: "-2%", bottom: "-2%", fontSize: "30vmin" }, "sway"],
        ["🌿", { right: "-1%", bottom: "-2%", fontSize: "25vmin" }, "sway"],
        ["🦜", { right: "8%", top: "14%", fontSize: "9vmin" }, "float"],
        ["🌺", { left: "3%", bottom: "4%", fontSize: "10vmin" }],
        ["🦋", { left: "14%", top: "18%", fontSize: "6vmin" }, "float soft"],
      ],
    },
    ocean: {
      bg:
        "repeating-linear-gradient(100deg, rgba(255,255,255,.07) 0 34px, transparent 34px 110px)," +
        "radial-gradient(ellipse at 50% -10%, rgba(255,255,255,.55), transparent 50%)," +
        "linear-gradient(180deg,#63cbe8 0%,#1f72a8 55%,#0b375f 100%)",
      items: ["🐠", "🐙", "🦀", "🐚", "🐳", "🦑", "🪸", "🐢", "🦈", "⚓", "🐡", "🦞"],
      deco: [
        ["🪸", { left: "0%", bottom: "-1%", fontSize: "23vmin" }, "sway"],
        ["🐢", { right: "3%", bottom: "6%", fontSize: "15vmin" }, "float"],
        ["🐠", { right: "10%", top: "16%", fontSize: "8vmin" }, "float"],
        ["🫧", { left: "10%", top: "22%", fontSize: "7vmin" }, "float soft"],
        ["🐟", { left: "18%", bottom: "30%", fontSize: "6vmin" }, "float soft"],
      ],
    },
    desert: {
      bg:
        "radial-gradient(circle at 82% 16%, rgba(255,250,210,.9), rgba(255,220,120,.35) 12%, transparent 30%)," +
        "linear-gradient(180deg,#ffd98a 0%,#f3a95c 45%,#c4653a 100%)",
      items: ["🐪", "🌵", "🦂", "🧭", "🏺", "🦎", "🐫", "🌙", "⭐", "🪔", "🦅", "🐍"],
      deco: [
        ["🌵", { left: "1%", bottom: "0%", fontSize: "24vmin" }, "sway"],
        ["🐪", { right: "2%", bottom: "2%", fontSize: "19vmin" }],
        ["☀️", { right: "6%", top: "8%", fontSize: "11vmin" }, "soft"],
        ["🌵", { right: "20%", bottom: "26%", fontSize: "8vmin" }, "soft"],
        ["🦅", { left: "14%", top: "16%", fontSize: "6vmin" }, "float soft"],
      ],
    },
  };
  const WORLD_ORDER = ["temple", "jungle", "ocean", "desert"];

  function applyWorld(name) {
    const w = WORLDS[name];
    WORLD_ORDER.forEach((n) => app.classList.toggle("world-" + n, n === name));
    bg.style.background = w.bg;
    bg.replaceChildren();
    for (const [emoji, pos, cls] of w.deco) {
      const d = document.createElement("span");
      d.className = "deco " + (cls || "");
      d.textContent = emoji;
      Object.assign(d.style, pos);
      bg.append(d);
    }
  }

  // ---------- Màn chơi ----------
  const SHAPES = {
    s6: ["###", "###"],
    ring10: ["####", "#..#", "####"],
    g12: ["####", "####", "####"],
    plus12: [".##.", "####", "####", ".##."],
    ring14: ["#####", "#...#", "#...#", "#####"],
    g16: ["####", "####", "####", "####"],
    dia16: ["..##..", ".####.", "######", ".####."],
    g18: ["######", "######", "######"],
    g20: ["#####", "#####", "#####", "#####"],
    g24: ["######", "######", "######", "######"],
  };
  const PLAN = [
    ["s6", null],
    ["ring10", null],
    ["g12", null],
    ["plus12", "time"],
    ["ring14", null],
    ["g16", "moves"],
    ["dia16", null],
    ["g18", "time"],
    ["g20", null],
    ["g16", "time"],
    ["g18", "moves"],
    ["g24", null],
    ["plus12", "moves"],
    ["dia16", "time"],
    ["g20", "moves"],
    ["g24", "time"],
  ];
  const LEVEL_COUNT = 24;

  function levelInfo(n) {
    const [shape, limit] = PLAN[n <= PLAN.length ? n - 1 : 8 + ((n - 1) % 8)];
    const rows = SHAPES[shape];
    const cells = rows.join("").split("").filter((c) => c === "#").length;
    const pairs = cells / 2;
    const tight = n > PLAN.length ? 0.85 : 1; // các màn cuối khó hơn
    let value = 0;
    if (limit === "time") value = Math.round((pairs * 7 + 10) * tight);
    if (limit === "moves") value = Math.round((pairs * 2 + 3) * tight);
    const weight = pairs + (limit ? 3 : 0);
    const diff = weight <= 3 ? "easy" : weight <= 9 ? "medium" : "hard";
    return { n, rows, pairs, limit, value, diff, world: WORLD_ORDER[(n - 1) % 4] };
  }
  const DIFF_NAME = { easy: "DỄ", medium: "TRUNG BÌNH", hard: "KHÓ" };

  // ---------- Âm thanh ----------
  let actx = null;
  let muted = false;
  try {
    muted = localStorage.getItem("gamevui-memory-muted") === "1";
  } catch {
    /* bỏ qua */
  }
  function tone(freq, dur, { type = "sine", vol = 0.15, delay = 0, slide = 1 } = {}) {
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
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  const sfx = {
    click: () => tone(620, 0.07, { type: "triangle", vol: 0.12 }),
    flip: () => tone(500, 0.08, { type: "triangle", vol: 0.12, slide: 1.8 }),
    match: () => [784, 988, 1319].forEach((f, i) => tone(f, 0.22, { type: "triangle", vol: 0.13, delay: i * 0.08 })),
    miss: () => tone(220, 0.22, { type: "triangle", vol: 0.12, slide: 0.8 }),
    star: () => tone(330, 0.3, { type: "sine", vol: 0.12, slide: 0.6 }),
    win: () =>
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, { type: "triangle", vol: 0.14, delay: i * 0.1 })),
    fail: () => [392, 330, 262].forEach((f, i) => tone(f, 0.28, { type: "triangle", vol: 0.13, delay: i * 0.15 })),
    flash: () => tone(300, 0.5, { type: "sine", vol: 0.1, slide: 4 }),
    tick: () => tone(1200, 0.04, { type: "square", vol: 0.04 }),
  };
  function refreshSound() {
    $("#btnSound").textContent = muted ? "🔇 Âm thanh: Tắt" : "🔊 Âm thanh: Bật";
    $("#btnSoundMap").textContent = muted ? "🔇" : "🔊";
  }
  function toggleSound() {
    muted = !muted;
    try {
      localStorage.setItem("gamevui-memory-muted", muted ? "1" : "0");
    } catch {
      /* bỏ qua */
    }
    refreshSound();
  }
  refreshSound();

  // ---------- Trạng thái ván ----------
  let info = null;
  let cards = [];
  let open = [];
  let lock = false;
  let playing = false;
  let paused = false;
  let moves = 0;
  let mistakes = 0;
  let matched = 0;
  let timeLeft = 0;
  let timer = 0;
  let tut = null; // trạng thái hướng dẫn màn 1
  let cardSize = 100;
  let shapeRows = [];

  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  function starsNow() {
    const p = info.pairs;
    return mistakes <= p ? 3 : mistakes <= p * 2 ? 2 : 1;
  }
  function renderStars() {
    const s = starsNow();
    [...$("#stars").children].forEach((el, i) => el.classList.toggle("off", i >= s));
  }

  function renderLimit() {
    const el = $("#limit");
    el.hidden = !info.limit;
    if (!info.limit) return;
    if (info.limit === "time") {
      const m = Math.floor(timeLeft / 60);
      const s = String(timeLeft % 60).padStart(2, "0");
      el.textContent = `⏱ ${m}:${s}`;
      el.classList.toggle("warn", timeLeft <= 10);
    } else {
      const left = info.value - moves;
      el.textContent = `👣 ${left} lượt`;
      el.classList.toggle("warn", left <= 3);
    }
  }

  // ---------- Bố cục bàn theo kích thước màn hình ----------
  function currentShape() {
    const rows = info.rows;
    const w = app.clientWidth;
    const h = app.clientHeight;
    // màn hình dọc thì xoay bố cục cho vừa
    if (h > w * 1.1 && rows[0].length > rows.length)
      return rows[0].split("").map((_, c) => rows.map((r) => r[c]).join(""));
    return rows;
  }

  function layout() {
    if (!info) return;
    const W = app.clientWidth;
    const H = app.clientHeight;
    const cols = shapeRows[0].length;
    const rows = shapeRows.length;
    const portrait = H > W * 1.1;
    const top = portrait ? 112 : 78;
    const bottom = (tutEl.hidden ? 20 : portrait ? 150 : 118) + (portrait ? 70 : 0);
    const sideM = portrait ? 14 : Math.min(120, W * 0.1);
    const availW = W - sideM * 2;
    const availH = H - top - bottom;
    const g = 0.08;
    let s = Math.min(availW / (cols + g * (cols - 1)), availH / (rows + g * (rows - 1)), 200);
    s = Math.floor(s);
    const gap = Math.max(5, Math.round(s * g));
    cardSize = s;
    app.style.setProperty("--card", s + "px");
    app.style.setProperty("--gap", gap + "px");
    app.style.setProperty("--cols", cols);
    const bw = cols * s + (cols - 1) * gap;
    const bh = rows * s + (rows - 1) * gap;
    boardEl.style.left = Math.round((W - bw) / 2) + "px";
    boardEl.style.top = Math.round(top + (availH - bh) / 2) + "px";
    placeHand();
  }

  function buildBoard() {
    shapeRows = currentShape();
    const flat = shapeRows.join("").split("");
    const deck = shuffle(
      shuffle(WORLDS[info.world].items.slice())
        .slice(0, info.pairs)
        .flatMap((e) => [e, e]),
    );
    boardEl.replaceChildren();
    cards = [];
    let k = 0;
    flat.forEach((cell) => {
      const el = document.createElement("button");
      el.className = "card";
      if (cell !== "#") {
        el.classList.add("empty");
        el.tabIndex = -1;
        boardEl.append(el);
        return;
      }
      const item = deck[k++];
      el.setAttribute("aria-label", "Thẻ úp");
      el.innerHTML = `<div class="inner"><div class="back"><span>?</span></div><div class="face"><span>${item}</span></div></div>`;
      const card = { el, item, matched: false };
      el.addEventListener("click", () => flip(card));
      cards.push(card);
      boardEl.append(el);
    });
    layout();
  }

  // Xoay màn hình: dựng lại bố cục nếu hướng thay đổi, giữ nguyên trạng thái thẻ
  function relayout() {
    if (!info) return;
    const next = currentShape();
    if (next.join() !== shapeRows.join()) {
      shapeRows = next;
      const flat = next.join("").split("");
      const els = cards.map((c) => c.el);
      boardEl.replaceChildren();
      let k = 0;
      flat.forEach((cell) => {
        if (cell === "#") boardEl.append(els[k++]);
        else {
          const e = document.createElement("div");
          e.className = "card empty";
          boardEl.append(e);
        }
      });
    }
    layout();
  }
  window.addEventListener("resize", relayout);

  // ---------- Luồng màn ----------
  function hideModals() {
    ["#intro", "#pauseM", "#failM"].forEach((s) => ($(s).hidden = true));
  }

  function setupLevel(n) {
    clearInterval(timer);
    info = levelInfo(n);
    applyWorld(info.world);
    open = [];
    lock = false;
    playing = false;
    paused = false;
    moves = 0;
    mistakes = 0;
    matched = 0;
    timeLeft = info.value;
    tut = null;
    $("#btnNext").hidden = true;
    $("#lvl").textContent = `Màn ${n}`;
    $("#tip").hidden = true;
    tutEl.hidden = true;
    handEl.hidden = true;
    app.classList.remove("peek");
    fxEl.replaceChildren();
    $("#map").hidden = true;
    hideModals();
    renderStars();
    renderLimit();
    updateFlash();
    buildBoard();
  }

  function showIntro(n) {
    setupLevel(n);
    $("#introNum").textContent = n;
    const d = $("#introDiff");
    d.textContent = DIFF_NAME[info.diff];
    d.className = "diff " + info.diff;
    if (info.limit === "time") {
      $("#introIco").textContent = "⏱";
      $("#introTitle").textContent = "Đua với thời gian!";
      $("#introText").textContent = `Ghép hết ${info.pairs} cặp trong ${info.value} giây.`;
    } else if (info.limit === "moves") {
      $("#introIco").textContent = "👣";
      $("#introTitle").textContent = "Giới hạn lượt!";
      $("#introText").textContent = `Bạn chỉ có ${info.value} lượt lật để ghép hết ${info.pairs} cặp.`;
    } else {
      $("#introIco").textContent = "∞";
      $("#introTitle").textContent = "Không giới hạn!";
      $("#introText").textContent = "Cứ thong thả ghép hết các cặp nhé.";
    }
    $("#intro").hidden = false;
  }

  function begin() {
    hideModals();
    playing = true;
    if (info.n === 1 && !progress.tutDone) startTutorial();
    if (info.limit === "time") {
      timer = setInterval(() => {
        if (paused || !playing) return;
        timeLeft--;
        renderLimit();
        if (timeLeft <= 5 && timeLeft > 0) sfx.tick();
        if (timeLeft <= 0) fail("time");
      }, 1000);
    }
    if (info.n >= 2 && !progress.tipShown && progress.flash > 0) {
      progress.tipShown = true;
      save();
      $("#tip").hidden = false;
      setTimeout(() => ($("#tip").hidden = true), 5000);
    }
  }

  function flip(card) {
    if (!playing || paused || lock || card.matched || card.el.classList.contains("flipped")) return;
    if (open.length >= 2) return;
    if (tut && !tutAllows(card)) return;
    card.el.classList.add("flipped");
    card.el.setAttribute("aria-label", "Thẻ " + card.item);
    sfx.flip();
    open.push(card);
    if (tut) tutAfterFlip(card);
    if (open.length < 2) return;

    const [a, b] = open;
    open = [];
    moves++;
    if (a.item === b.item) {
      a.matched = b.matched = true;
      matched++;
      setTimeout(() => {
        sfx.match();
        fxMatch(a, b);
      }, 380);
      if (tut) tutMatched();
      if (matched === info.pairs) {
        playing = false;
        clearInterval(timer);
        setTimeout(win, 380 + 1200);
      }
    } else {
      const before = starsNow();
      mistakes++;
      lock = true;
      setTimeout(() => {
        sfx.miss();
        a.el.classList.add("shake");
        b.el.classList.add("shake");
      }, 380);
      setTimeout(() => {
        a.el.classList.remove("flipped", "shake");
        b.el.classList.remove("flipped", "shake");
        a.el.setAttribute("aria-label", "Thẻ úp");
        b.el.setAttribute("aria-label", "Thẻ úp");
        lock = false;
        if (tut) tutAfterMiss();
      }, 950);
      renderStars();
      if (starsNow() < before) setTimeout(sfx.star, 420);
    }
    renderLimit();
    if (info.limit === "moves" && moves >= info.value && matched < info.pairs) {
      playing = false;
      setTimeout(() => fail("moves"), 1000);
    }
  }

  // Hai thẻ vừa ghép bay ra giữa màn hình, nghiêng nhẹ, tia sáng xoay phía sau
  function fxMatch(a, b) {
    const appR = app.getBoundingClientRect();
    const W = appR.width;
    const H = appR.height;
    const big = Math.min(cardSize * 1.45, W * 0.3, H * 0.38);
    const rays = document.createElement("div");
    rays.className = "rays";
    const rs = big * 3.2;
    Object.assign(rays.style, { width: rs + "px", height: rs + "px", left: W / 2 - rs / 2 + "px", top: H / 2 - rs / 2 + "px" });
    fxEl.append(rays);
    rays.animate(
      [
        { transform: "scale(0) rotate(0deg)", opacity: 0 },
        { transform: "scale(1) rotate(40deg)", opacity: 1, offset: 0.3 },
        { transform: "scale(1.05) rotate(80deg)", opacity: 1, offset: 0.72 },
        { transform: "scale(1.3) rotate(110deg)", opacity: 0 },
      ],
      { duration: 1200, easing: "ease-out", fill: "forwards" },
    );
    [a, b].forEach((card, i) => {
      const r = card.el.getBoundingClientRect();
      card.el.classList.add("gone");
      const c = document.createElement("div");
      c.className = "face";
      c.innerHTML = `<span>${card.item}</span>`;
      Object.assign(c.style, {
        left: r.left - appR.left + "px",
        top: r.top - appR.top + "px",
        width: r.width + "px",
        height: r.height + "px",
      });
      fxEl.append(c);
      const dx = W / 2 + (i ? 1 : -1) * big * 0.56 - (r.left - appR.left + r.width / 2);
      const dy = H / 2 - (r.top - appR.top + r.height / 2);
      const k = big / r.width;
      const rot = i ? 10 : -10;
      const at = `translate(${dx}px,${dy}px) rotate(${rot}deg)`;
      c.animate(
        [
          { transform: "none" },
          { transform: `${at} scale(${k})`, offset: 0.3 },
          { transform: `${at} scale(${k})`, offset: 0.72 },
          { transform: `${at} scale(${k * 0.15})`, opacity: 0 },
        ],
        { duration: 1200, easing: "cubic-bezier(.3,1.2,.5,1)", fill: "forwards" },
      );
    });
    setTimeout(() => fxEl.replaceChildren(), 1250);
  }

  function win() {
    const stars = starsNow();
    const prev = progress.stars[info.n] || 0;
    progress.stars[info.n] = Math.max(prev, stars);
    if (stars === 3 && prev < 3) progress.flash = Math.min(9, progress.flash + 1);
    save();
    updateFlash();
    sfx.win();
    // lật ngửa lại toàn bộ thẻ như bản gốc
    cards.forEach((c, i) => {
      c.el.classList.remove("gone");
      c.el.classList.add("flipped");
      c.el.style.animationDelay = i * 40 + "ms";
      c.el.classList.add("reveal");
    });
    $("#btnNext").hidden = false;
    $("#btnNext").firstChild.textContent = info.n < LEVEL_COUNT ? "Màn tiếp " : "Danh sách màn ";
  }

  function fail(kind) {
    playing = false;
    clearInterval(timer);
    sfx.fail();
    $("#failIco").textContent = kind === "time" ? "⏱️" : "👣";
    $("#failTitle").textContent = kind === "time" ? "Hết giờ!" : "Hết lượt!";
    $("#failText").textContent = `Bạn đã ghép được ${matched}/${info.pairs} cặp. Thử lại nhé!`;
    $("#failM").hidden = false;
  }

  // ---------- Đèn pin ----------
  function updateFlash() {
    $("#flashCount").textContent = progress.flash;
    $("#btnFlash").disabled = progress.flash <= 0;
  }
  $("#btnFlash").addEventListener("click", () => {
    if (!playing || paused || lock || tut || progress.flash <= 0) return;
    progress.flash--;
    save();
    updateFlash();
    $("#tip").hidden = true;
    sfx.flash();
    lock = true;
    app.classList.add("peek");
    setTimeout(() => {
      app.classList.remove("peek");
      lock = false;
    }, 1500);
  });

  // ---------- Hướng dẫn màn 1 ----------
  function startTutorial() {
    const A = cards[0];
    const A2 = cards.find((c) => c !== A && c.item === A.item);
    const B = cards.find((c) => c.item !== A.item);
    tut = { step: 0, A, A2, B };
    tutEl.hidden = false;
    tutShow("Lật thẻ đầu tiên — thử thách trí nhớ bắt đầu!", A);
    layout();
  }
  function tutShow(text, target, ok = false) {
    $("#tutText").textContent = text;
    $("#tutOk").hidden = !ok;
    tut.target = target;
    handEl.hidden = !target;
    placeHand();
  }
  function placeHand() {
    if (!tut || !tut.target || handEl.hidden) return;
    const r = tut.target.el.getBoundingClientRect();
    const a = app.getBoundingClientRect();
    handEl.style.left = r.left - a.left + r.width * 0.55 + "px";
    handEl.style.top = r.top - a.top + r.height * 0.55 + "px";
  }
  const tutAllows = (card) => card === tut.target;
  function tutAfterFlip(card) {
    if (tut.step === 0 && card === tut.A) {
      tut.step = 1;
      tutShow("Giờ lật thêm một thẻ nữa xem có giống không!", tut.B);
    } else if (tut.step === 2 && card === tut.A2) {
      tut.step = 3;
      tutShow("Ơ… trông quen quen! Lật lại thẻ đầu tiên để ghép chúng nhé.", tut.A);
    } else tutShow($("#tutText").textContent, null);
  }
  function tutAfterMiss() {
    if (tut.step === 1) {
      tut.step = 2;
      tutShow("Ôi, không khớp rồi — nhưng giờ bạn đã biết dưới thẻ có gì! Thử lật thẻ này nhé.", tut.A2);
    }
  }
  function tutMatched() {
    lock = true;
    tutShow("Bùm! Ghép đúng rồi! Giờ hãy tự tìm nốt các cặp còn lại để hoàn thành màn chơi.", null, true);
  }
  $("#tutOk").addEventListener("click", () => {
    sfx.click();
    tut = null;
    progress.tutDone = true;
    save();
    tutEl.hidden = true;
    handEl.hidden = true;
    lock = false;
    layout();
  });

  // ---------- Danh sách màn ----------
  const unlocked = (n) => n === 1 || (progress.stars[n - 1] || 0) > 0;
  function highestUnlocked() {
    let n = 1;
    while (n < LEVEL_COUNT && unlocked(n + 1)) n++;
    return n;
  }
  function showMap() {
    clearInterval(timer);
    playing = false;
    hideModals();
    tutEl.hidden = true;
    handEl.hidden = true;
    const cur = highestUnlocked();
    const list = $("#levels");
    list.replaceChildren();
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const b = document.createElement("button");
      const ok = unlocked(n);
      const s = progress.stars[n] || 0;
      b.className = "lv" + (ok ? "" : " locked") + (n === cur ? " current" : "");
      b.innerHTML = ok
        ? `<b>${n}</b><small>${[0, 1, 2].map((i) => `<span class="${i < s ? "" : "off"}">★</span>`).join("")}</small>`
        : `<b>🔒</b><small style="color:#e8eef4;text-shadow:none">${n}</small>`;
      b.setAttribute("aria-label", ok ? `Màn ${n}, ${s} sao` : `Màn ${n} đang khóa`);
      if (ok)
        b.addEventListener("click", () => {
          sfx.click();
          showIntro(n);
        });
      list.append(b);
    }
    $("#map").hidden = false;
  }

  // ---------- Nút chung ----------
  $("#introStart").addEventListener("click", () => {
    sfx.click();
    begin();
  });
  $("#btnPause").addEventListener("click", () => {
    if (!playing) return;
    sfx.click();
    paused = true;
    $("#pauseM").hidden = false;
  });
  $("#btnNext").addEventListener("click", () => {
    sfx.click();
    if (info.n < LEVEL_COUNT) showIntro(info.n + 1);
    else showMap();
  });
  $("#btnSoundMap").addEventListener("click", toggleSound);
  app.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    sfx.click();
    switch (b.dataset.act) {
      case "resume":
        paused = false;
        $("#pauseM").hidden = true;
        break;
      case "restart":
        setupLevel(info.n);
        begin();
        break;
      case "sound":
        toggleSound();
        break;
      case "levels":
        showMap();
        break;
    }
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && playing) {
      if (paused) {
        paused = false;
        $("#pauseM").hidden = true;
      } else $("#btnPause").click();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && playing && !paused) $("#btnPause").click();
  });

  // ---------- Khởi động ----------
  if (!progress.tutDone) {
    // lần đầu: vào thẳng màn 1 có hướng dẫn như bản gốc
    setupLevel(1);
    begin();
  } else {
    setupLevel(highestUnlocked());
    showMap();
  }
})();
