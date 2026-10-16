// Đập chuột — 9 hang, chuột chui lên rồi lặn xuống; đập trúng ghi điểm, đập liên
// tiếp không trượt thì nhân điểm (5 con ×2, 10 con ×3… tối đa ×5). Chuột vàng lặn
// rất nhanh, chuột đội mũ phải đập 2 lần, đập bom mất 5 giây, đập đồng hồ thêm 5
// giây. Một ván 60 giây, càng về cuối chuột ra càng nhanh và càng nhiều.
// Mọi mốc thời gian tính theo đồng hồ của ván (clock, chỉ chạy khi đang chơi)
// nên tạm dừng là mọi thứ đứng yên.
(() => {
  "use strict";

  const ROUND = 60000;
  const BOMB_MS = 5000;
  const CLOCK_MS = 5000;
  const KINDS = {
    mole: { face: "🐭", pts: 10, stay: 1 },
    helmet: { face: "🐭", pts: 20, stay: 1.35, hp: 2 },
    gold: { face: "🐭", pts: 30, stay: 0.6 },
    bomb: { face: "💣", stay: 1.1 },
    clock: { face: "⏰", stay: 0.8 },
  };
  // stay/gap/max: [đầu ván, cuối ván]; còn lại là tỉ lệ xuất hiện mỗi loại
  const DIFFS = {
    easy: { name: "Dễ", stay: [1500, 1000], gap: [950, 650], max: [1, 2], bomb: 0.05, clock: 0.06, gold: 0.08, helmet: 0.08 },
    normal: { name: "Thường", stay: [1100, 700], gap: [750, 420], max: [1, 3], bomb: 0.1, clock: 0.05, gold: 0.1, helmet: 0.15 },
    hard: { name: "Khó", stay: [850, 500], gap: [560, 300], max: [2, 4], bomb: 0.14, clock: 0.04, gold: 0.12, helmet: 0.2 },
  };
  const KEYS = "789456123"; // hang trên cùng là 7 8 9, đúng như bàn phím số
  const KEYS2 = "qweasdzxc";

  const $ = (s) => document.querySelector(s);
  const field = $("#field");

  // ---------- Lưu trữ ----------
  const STORE = "gamevui-mouse";
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORE)) || {};
  } catch {
    stored = {};
  }
  const prefs = {
    diff: DIFFS[stored.diff] ? stored.diff : "normal",
    muted: !!stored.muted,
    best: { easy: 0, normal: 0, hard: 0 },
  };
  for (const k in prefs.best) if (Number.isFinite(stored.best?.[k])) prefs.best[k] = stored.best[k];
  const persist = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify(prefs));
    } catch {
      /* bỏ qua */
    }
  };

  // ---------- Âm thanh ----------
  let actx = null;
  function audio() {
    if (prefs.muted) return null;
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
  function tone(f, dur, { delay = 0, type = "triangle", vol = 0.1, to = f } = {}) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq) {
    const a = audio();
    if (!a) return;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = freq;
    const g = a.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination);
    src.start();
  }
  const sfx = {
    bonk: () => {
      tone(240, 0.12, { type: "square", vol: 0.07, to: 90 });
      noise(0.06, 0.3, 1200);
    },
    gold: () => [988, 1319, 1760].forEach((f, i) => tone(f, 0.14, { delay: i * 0.05, vol: 0.08 })),
    clank: () => {
      tone(1500, 0.08, { type: "square", vol: 0.04, to: 1200 });
      tone(2300, 0.12, { vol: 0.05 });
    },
    bomb: () => {
      noise(0.55, 0.7, 380);
      tone(130, 0.4, { type: "sawtooth", vol: 0.07, to: 40 });
    },
    clock: () => {
      tone(660, 0.08, { vol: 0.09 });
      tone(990, 0.16, { delay: 0.08, vol: 0.09 });
    },
    miss: () => noise(0.05, 0.18, 500),
    tick: () => tone(1500, 0.03, { type: "square", vol: 0.03 }),
    count: (go) => tone(go ? 880 : 520, go ? 0.3 : 0.12, { type: "square", vol: 0.05 }),
    end: () => [784, 659, 523, 392].forEach((f, i) => tone(f, 0.22, { delay: i * 0.13, vol: 0.08 })),
    record: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, { delay: i * 0.1, vol: 0.09 })),
  };

  // ---------- Hang ----------
  const holes = [...KEYS].map((key, i) => {
    const el = document.createElement("div");
    el.className = "hole";
    el.innerHTML =
      '<div class="pit"></div><div class="slot"><div class="critter"><span class="face"></span>' +
      `<span class="hat">⛑️</span><span class="stars">💫</span></div></div><div class="rim"></div><kbd>${key}</kbd>`;
    field.append(el);
    const h = { i, el, critter: el.querySelector(".critter"), face: el.querySelector(".face"), state: "empty", kind: null, until: 0, hp: 0 };
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      whack(h);
    });
    return h;
  });

  // ---------- Trạng thái ----------
  let state = "menu"; // menu | count | play | pause | over
  let clock = 0; // thời gian đã chơi (ms), chỉ chạy khi state === "play"
  let timeLeft = ROUND;
  let nextSpawn = 0;
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let hits = 0;
  let misses = 0;
  let kills = 0;
  let escaped = 0;
  let lastTick = 0;

  const cfg = () => DIFFS[prefs.diff];
  const lerp = (a, b, k) => a + (b - a) * k;
  const mult = () => Math.min(5, 1 + Math.floor(combo / 5));

  // ---------- Vòng lặp ----------
  let last = 0;
  function frame(t) {
    const dt = Math.min(100, t - last); // quay lại sau khi tab ẩn thì không nhảy cóc
    last = t;
    if (state === "play") step(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });

  function step(dt) {
    clock += dt;
    timeLeft -= dt;
    for (const h of holes) {
      if (h.state === "empty" || clock < h.until) continue;
      if (h.state === "up") {
        // chạy thoát: chuột thì mất combo, bom / đồng hồ thì thôi
        if (KINDS[h.kind].pts) {
          escaped++;
          breakCombo();
        }
        retreat(h);
      } else if (h.state === "hit") retreat(h);
      else clearHole(h);
    }
    const c = cfg();
    const k = Math.min(1, clock / ROUND);
    if (clock >= nextSpawn) {
      const up = holes.filter((h) => h.state === "up").length;
      if (up < Math.round(lerp(c.max[0], c.max[1], k)) && spawn(c, k))
        nextSpawn = clock + lerp(c.gap[0], c.gap[1], k) * (0.7 + Math.random() * 0.6);
      else nextSpawn = clock + 100; // đủ chuột rồi / hết hang trống → thử lại ngay sau
    }
    const sec = Math.ceil(timeLeft / 1000);
    if (sec <= 5 && sec > 0 && sec !== lastTick) {
      lastTick = sec;
      sfx.tick();
    }
    renderTime();
    if (timeLeft <= 0) endGame();
  }

  function spawn(c, k) {
    const free = holes.filter((h) => h.state === "empty");
    if (!free.length) return false;
    const h = free[(Math.random() * free.length) | 0];
    let kind = "mole";
    if (clock > 2500) {
      // vài giây đầu chỉ có chuột thường cho quen tay
      let r = Math.random();
      for (const kk of ["bomb", "clock", "gold", "helmet"])
        if ((r -= c[kk]) < 0) {
          kind = kk;
          break;
        }
    }
    h.kind = kind;
    h.hp = KINDS[kind].hp || 1;
    h.state = "up";
    h.until = clock + lerp(c.stay[0], c.stay[1], k) * KINDS[kind].stay;
    h.face.textContent = KINDS[kind].face;
    h.critter.className = "critter up " + kind;
    return true;
  }
  function retreat(h) {
    h.state = "leaving";
    h.until = clock + 180;
    h.critter.classList.remove("up");
  }
  function clearHole(h) {
    h.state = "empty";
    h.kind = null;
    h.critter.className = "critter";
  }

  // ---------- Đập ----------
  function whack(h) {
    if (state !== "play") return;
    if (h.state === "hit" || h.state === "leaving") return; // vừa đập xong, bấm thêm không tính trượt
    if (h.state === "empty") {
      misses++;
      sfx.miss();
      float(h, "💨", "meh");
      breakCombo();
      return;
    }
    const kind = h.kind;
    if (kind === "bomb") {
      sfx.bomb();
      timeLeft -= BOMB_MS;
      h.face.textContent = "💥";
      float(h, "−5 giây", "bad");
      breakCombo();
      field.classList.remove("shake");
      void field.offsetWidth;
      field.classList.add("shake");
      smash(h, 320);
      renderTime();
      return;
    }
    if (kind === "clock") {
      sfx.clock();
      timeLeft += CLOCK_MS;
      float(h, "+5 giây", "good");
      smash(h, 250);
      renderTime();
      return;
    }
    hits++;
    if (--h.hp > 0) {
      // chuột đội mũ: cú đầu chỉ làm bay mũ, chuột nán lại thêm chút cho kịp đập tiếp
      sfx.clank();
      h.critter.classList.add("nohat");
      h.until = Math.max(h.until, clock + 450);
      float(h, "Cốp!", "meh");
      return;
    }
    kills++;
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    const gained = KINDS[kind].pts * mult();
    setScore(score + gained);
    if (kind === "gold") sfx.gold();
    else sfx.bonk();
    float(h, `+${gained}`, kind === "gold" ? "gold" : "");
    if (combo % 5 === 0 && combo <= 20) showBig(`Combo ×${mult()}!`, true);
    smash(h, 260);
    renderCombo();
  }
  function smash(h, ms) {
    h.state = "hit";
    h.until = clock + ms;
    h.critter.classList.add("hit");
  }
  function breakCombo() {
    if (!combo) return;
    combo = 0;
    renderCombo();
  }
  function float(h, text, cls) {
    const f = document.createElement("span");
    f.className = "float " + (cls || "");
    f.textContent = text;
    h.el.append(f);
    setTimeout(() => f.remove(), 800);
  }
  const big = $("#big");
  function showBig(text, small = false) {
    big.textContent = text;
    big.className = "big" + (small ? " small" : "");
    void big.offsetWidth;
    big.classList.add("pop");
  }

  // ---------- Búa ----------
  const hammer = $("#hammer");
  let hammerTimer = 0;
  function moveHammer(x, y) {
    hammer.style.left = x + "px";
    hammer.style.top = y + "px";
  }
  function swing(x, y, brief) {
    moveHammer(x, y);
    hammer.classList.add("show");
    hammer.classList.remove("swing");
    void hammer.offsetWidth;
    hammer.classList.add("swing");
    clearTimeout(hammerTimer);
    // cảm ứng / phím: búa hiện lúc đập rồi ẩn; chuột: búa luôn theo con trỏ
    if (brief) hammerTimer = setTimeout(() => hammer.classList.remove("show"), 380);
  }
  field.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    moveHammer(e.clientX, e.clientY);
    hammer.classList.add("show");
  });
  field.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") hammer.classList.remove("show");
  });
  field.addEventListener("pointerdown", (e) => swing(e.clientX, e.clientY, e.pointerType !== "mouse"));

  // ---------- Hiển thị ----------
  function setScore(v) {
    score = v;
    const el = $("#stScore");
    el.textContent = score;
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }
  function renderTime() {
    const t = Math.max(0, timeLeft);
    $("#stTime").textContent = Math.ceil(t / 1000);
    $("#stTime").classList.toggle("danger", t <= 10000 && state !== "menu");
    const fill = $("#timeFill");
    fill.style.width = Math.min(100, (t / ROUND) * 100) + "%";
    fill.classList.toggle("warn", t <= 20000 && t > 10000);
    fill.classList.toggle("danger", t <= 10000);
  }
  function renderCombo() {
    $("#stCombo").textContent = combo;
    const m = $("#stMult");
    m.hidden = mult() < 2;
    m.textContent = "×" + mult();
  }
  const renderBest = () => ($("#stBest").textContent = prefs.best[prefs.diff]);
  const refreshSound = () => ($("#btnSound").textContent = prefs.muted ? "🔇 Âm thanh" : "🔊 Âm thanh");

  // ---------- Hộp thoại ----------
  function card(ico, title, html, buttons) {
    $("#cIco").textContent = ico;
    $("#cTitle").textContent = title;
    $("#cBody").innerHTML = html;
    const box = $("#cBtns");
    box.replaceChildren();
    for (const [label, fn, primary] of buttons) {
      const b = document.createElement("button");
      b.className = "btn" + (primary ? " primary" : "");
      b.textContent = label;
      b.addEventListener("click", fn);
      box.append(b);
    }
    $("#overlay").hidden = false;
    box.querySelector(".primary")?.focus(); // Enter / Space bấm luôn nút chính
  }
  const closeCard = () => ($("#overlay").hidden = true);

  // ---------- Luồng chơi ----------
  function resetBoard() {
    holes.forEach(clearHole);
    clock = 0;
    timeLeft = ROUND;
    nextSpawn = 600;
    lastTick = 0;
    score = 0;
    combo = 0;
    maxCombo = hits = misses = kills = escaped = 0;
    $("#stScore").textContent = 0;
    renderCombo();
    renderTime();
    renderBest();
  }
  function showMenu() {
    clearTimeout(countTimer);
    state = "menu";
    resetBoard();
    const seg = Object.entries(DIFFS)
      .map(
        ([k, d]) =>
          `<button data-diff="${k}" class="${k === prefs.diff ? "on" : ""}">${d.name}<small>Kỷ lục ${prefs.best[k]}</small></button>`,
      )
      .join("");
    card(
      "🔨",
      "Đập chuột",
      `<div class="seg">${seg}</div>
      <ul class="legend">
        <li><span>🐭</span>Chuột thường<b>+10</b></li>
        <li><span class="gold-ico">🐭</span>Chuột vàng, lặn rất nhanh<b>+30</b></li>
        <li><span class="helmet-ico">🐭<i>⛑️</i></span>Chuột đội mũ, đập 2 lần<b>+20</b></li>
        <li><span>⏰</span>Đồng hồ<b>+5 giây</b></li>
        <li><span>💣</span>Bom, đừng đập!<b class="bad">−5 giây</b></li>
      </ul>
      <p class="tip">Đập liên tiếp không trượt, không để chuột chạy thoát để nhân điểm:
      5 con ×2, 10 con ×3… tối đa ×5.</p>`,
      [["Bắt đầu", startGame, true]],
    );
    $("#cBody")
      .querySelectorAll("[data-diff]")
      .forEach((b) =>
        b.addEventListener("click", () => {
          prefs.diff = b.dataset.diff;
          persist();
          showMenu();
        }),
      );
  }
  let countTimer = 0;
  function startGame() {
    closeCard();
    clearTimeout(countTimer);
    resetBoard();
    state = "count";
    let n = 3;
    const tick = () => {
      if (n > 0) {
        showBig(n--);
        sfx.count(false);
        countTimer = setTimeout(tick, 650);
      } else {
        showBig("Đập!");
        sfx.count(true);
        state = "play";
      }
    };
    tick();
  }
  function endGame() {
    state = "over";
    timeLeft = 0;
    renderTime();
    holes.forEach(clearHole);
    const record = score > prefs.best[prefs.diff];
    if (record) {
      prefs.best[prefs.diff] = score;
      persist();
      renderBest();
    }
    if (record) sfx.record();
    else sfx.end();
    const acc = hits + misses ? Math.round((hits * 100) / (hits + misses)) : 0;
    card(
      record ? "🏆" : "⏰",
      record ? "Kỷ lục mới!" : "Hết giờ!",
      `<div class="final">${score}</div>
      <div class="final-sub">điểm · mức ${cfg().name} · kỷ lục ${prefs.best[prefs.diff]}</div>
      <div class="results">
        <div><small>Đập trúng</small><b>${kills}</b></div>
        <div><small>Chính xác</small><b>${acc}%</b></div>
        <div><small>Combo dài nhất</small><b>${maxCombo}</b></div>
        <div><small>Chạy thoát</small><b>${escaped}</b></div>
      </div>`,
      [
        ["Chơi lại", startGame, true],
        ["Đổi độ khó", showMenu],
      ],
    );
  }

  // ---------- Tạm dừng ----------
  function pauseGame() {
    if (state !== "play") return;
    state = "pause";
    card(
      "⏸",
      "Tạm dừng",
      `<p>Điểm: <b>${score}</b> · còn ${Math.ceil(timeLeft / 1000)} giây<br>Bấm <b>P</b> hoặc <b>Esc</b> để chơi tiếp.</p>`,
      [
        ["Chơi tiếp", resumeGame, true],
        ["Chơi lại", startGame],
        ["Đổi độ khó", showMenu],
      ],
    );
  }
  function resumeGame() {
    if (state !== "pause") return;
    closeCard();
    state = "play";
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame();
  });

  // ---------- Nút & phím ----------
  $("#btnPause").addEventListener("click", pauseGame);
  $("#btnRestart").addEventListener("click", startGame);
  $("#btnSound").addEventListener("click", () => {
    prefs.muted = !prefs.muted;
    persist();
    refreshSound();
  });
  window.addEventListener("keydown", (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "p" || k === "escape") {
      if (state === "pause") resumeGame();
      else pauseGame();
      return;
    }
    let i = KEYS.indexOf(k);
    if (i < 0) i = KEYS2.indexOf(k);
    if (i < 0 || state !== "play") return;
    e.preventDefault();
    const r = holes[i].el.querySelector(".pit").getBoundingClientRect();
    swing(r.left + r.width / 2, r.top, true);
    whack(holes[i]);
  });

  refreshSound();
  showMenu();
})();
