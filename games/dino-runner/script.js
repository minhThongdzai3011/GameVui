// T-Rex Runner — trò khủng long của trình duyệt Chrome khi mất mạng.
// Hình và thông số lấy từ mã nguồn mở Chromium (components/neterror,
// giấy phép BSD — © The Chromium Authors): khung 600×150, tốc độ 6 → 13,
// gia tốc 0.001/khung, trọng lực 0.6, nhảy -10 - tốc độ/10, ↓ khi đang nhảy để
// rơi nhanh, ↓ trên mặt đất để cúi; xương rồng (nhóm 1–3 cây khi đủ nhanh),
// thằn lằn bay từ tốc độ 8.5; điểm = quãng đường × 0.025; nhấp nháy mỗi 100
// điểm; ban đêm mỗi 700 điểm; va chạm theo các hộp va chạm của bản gốc.
(() => {
  "use strict";

  const W = 600;
  const H = 150;
  const MS_PER_FRAME = 1000 / 60;
  const CFG = {
    speed: 6,
    maxSpeed: 13,
    accel: 0.001,
    gravity: 0.6,
    jumpV: -10,
    dropV: -5,
    minJumpHeight: 30,
    maxJumpHeight: 30,
    speedDropCoef: 3,
    clearTime: 3000,
    gapCoef: 0.6,
    maxGapCoef: 1.5,
    scoreCoef: 0.025,
    achievement: 100,
    invertDistance: 700,
    invertDuration: 12000,
    gameoverClear: 750,
  };

  // ---------- Bản đồ tấm hình (toạ độ bản 100% và 200%) ----------
  const SHEETS = {
    1: {
      src: "assets/sprite-100.png",
      s: 1,
      CACTUS_LARGE: [332, 2],
      CACTUS_SMALL: [228, 2],
      CLOUD: [86, 2],
      HORIZON: [2, 54],
      MOON: [484, 2],
      PTERODACTYL: [134, 2],
      RESTART: [2, 68],
      TEXT: [655, 2],
      TREX: [848, 2],
      STAR: [645, 2],
    },
    2: {
      src: "assets/sprite-200.png",
      s: 2,
      CACTUS_LARGE: [652, 2],
      CACTUS_SMALL: [446, 2],
      CLOUD: [166, 2],
      HORIZON: [2, 104],
      MOON: [954, 2],
      PTERODACTYL: [260, 2],
      RESTART: [2, 130],
      TEXT: [1294, 2],
      TREX: [1678, 2],
      STAR: [1276, 2],
    },
  };

  // Khủng long: các khung trên tấm hình (lệch x so với TREX)
  const TREX = {
    w: 44,
    h: 47,
    wDuck: 59,
    groundY: H - 47 - 10, // 93
    startX: 50,
    frames: { waiting: [44, 0], running: [88, 132], crashed: [220], jumping: [0], ducking: [264, 323] },
    fps: { waiting: 1000 / 3, running: 1000 / 12, crashed: 1000 / 60, jumping: 1000 / 60, ducking: 1000 / 8 },
    boxes: {
      running: [
        [22, 0, 17, 16],
        [1, 18, 30, 9],
        [10, 35, 14, 8],
        [1, 24, 29, 5],
        [5, 30, 21, 4],
        [9, 34, 15, 4],
      ],
      ducking: [[1, 18, 55, 25]],
    },
  };
  const OBSTACLES = [
    {
      type: "CACTUS_SMALL",
      w: 17,
      h: 35,
      y: [105],
      multiSpeed: 4,
      minGap: 120,
      minSpeed: 0,
      boxes: [
        [0, 7, 5, 27],
        [4, 0, 6, 34],
        [10, 4, 7, 14],
      ],
    },
    {
      type: "CACTUS_LARGE",
      w: 25,
      h: 50,
      y: [90],
      multiSpeed: 7,
      minGap: 120,
      minSpeed: 0,
      boxes: [
        [0, 12, 7, 38],
        [8, 0, 7, 49],
        [13, 10, 10, 38],
      ],
    },
    {
      type: "PTERODACTYL",
      w: 46,
      h: 40,
      y: [100, 75, 50],
      multiSpeed: 999,
      minGap: 150,
      minSpeed: 8.5,
      speedOffset: 0.8,
      frames: 2,
      frameMs: 1000 / 6,
      boxes: [
        [15, 15, 16, 5],
        [18, 21, 24, 6],
        [2, 14, 4, 3],
        [6, 10, 4, 7],
        [10, 8, 6, 9],
      ],
    },
  ];

  // ---------- Âm thanh (bíp đơn giản như bản gốc) ----------
  let actx = null;
  let muted = false;
  try {
    muted = localStorage.getItem("gamevui-dino-muted") === "1";
  } catch {
    /* bỏ qua */
  }
  function beep(f, dur, delay = 0, vol = 0.06, type = "square") {
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
    o.frequency.value = f;
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.01);
  }
  const sfx = {
    jump: () => beep(760, 0.05),
    score: () => {
      beep(1046, 0.07);
      beep(1046, 0.1, 0.1);
    },
    hit: () => {
      beep(110, 0.08, 0, 0.08);
      beep(80, 0.15, 0.08, 0.08);
    },
  };

  // ---------- Canvas & tấm hình ----------
  const $ = (s) => document.querySelector(s);
  const canvas = $("#canvas");
  const ctx = canvas.getContext("2d");
  const gameEl = $("#game");
  let sheet = SHEETS[1];
  const images = {};
  for (const k of [1, 2]) {
    const img = new Image();
    img.src = SHEETS[k].src;
    images[k] = img;
  }
  // vẽ một phần tấm hình: (sx, sy) là độ lệch theo đơn vị bản 100% so với vị trí của phần tử
  function blit(key, sx, sy, sw, sh, dx, dy, dw = sw, dh = sh) {
    const s = sheet.s;
    const [px, py] = sheet[key];
    ctx.drawImage(images[s], px + sx * s, py + sy * s, sw * s, sh * s, Math.round(dx), Math.round(dy), dw, dh);
  }

  // ---------- Trạng thái ----------
  let high = 0;
  try {
    high = Number(localStorage.getItem("gamevui-dino-high")) || 0;
  } catch {
    /* bỏ qua */
  }
  let state = "waiting"; // waiting | intro | running | crashed
  let runTime = 0;
  let speed = CFG.speed;
  let distanceRan = 0;
  let reveal = TREX.w; // bề rộng khung đã mở (hiệu ứng mở màn của bản gốc)
  let crashAt = 0;
  let obstacles = [];
  let history = [];
  let clouds = [];
  let horizon = [
    { x: 0, src: 0 },
    { x: W, src: W },
  ];
  // ban đêm
  let inverted = false;
  let invertTimer = 0;
  let invertTrigger = false;
  let moon = { x: W - 50, phase: 0, opacity: 0 };
  let stars = [];
  // nhấp nháy điểm
  let flashTimer = -1;
  let flashIter = 0;
  let achieved = false;
  let restartFrame = 7;
  let restartT = 0;

  const trex = {
    x: 0, // lúc chờ đứng sát mép trái, mở màn chạy dần tới x = 50
    y: TREX.groundY,
    v: 0,
    status: "waiting",
    jumping: false,
    ducking: false,
    speedDrop: false,
    reachedMin: false,
    holdJump: false,
    frame: 0,
    timer: 0,
    blinkAt: 0,
  };

  // ---------- Khủng long ----------
  function setStatus(st) {
    trex.status = st;
    trex.frame = 0;
    trex.timer = 0;
  }
  function startJump() {
    if (trex.jumping) return;
    setStatus("jumping");
    trex.jumping = true;
    trex.ducking = false;
    trex.reachedMin = false;
    trex.speedDrop = false;
    trex.v = CFG.jumpV - speed / 10;
    sfx.jump();
  }
  function endJump() {
    if (trex.reachedMin && trex.v < CFG.dropV) trex.v = CFG.dropV;
  }
  function updateTrex(dt) {
    if (trex.jumping) {
      const frames = dt / MS_PER_FRAME;
      trex.y += Math.round(trex.v * (trex.speedDrop ? CFG.speedDropCoef : 1) * frames);
      trex.v += CFG.gravity * frames;
      if (trex.y < TREX.groundY - CFG.minJumpHeight || trex.speedDrop) trex.reachedMin = true;
      if (trex.y < CFG.maxJumpHeight || trex.speedDrop) endJump();
      if (!trex.holdJump) endJump(); // nhả phím sớm = nhảy thấp
      if (trex.y > TREX.groundY) {
        trex.y = TREX.groundY;
        trex.v = 0;
        trex.jumping = false;
        trex.speedDrop = false;
        setStatus(keysDown.down ? "ducking" : "running");
        trex.ducking = keysDown.down;
      }
    }
    trex.timer += dt;
    if (trex.timer >= TREX.fps[trex.status]) {
      trex.timer = 0;
      trex.frame = (trex.frame + 1) % TREX.frames[trex.status].length;
    }
  }
  function drawTrex() {
    let st = trex.status;
    let frame = TREX.frames[st][trex.frame];
    if (st === "waiting") frame = performance.now() % 4000 < 150 ? 0 : 44; // thỉnh thoảng chớp mắt
    const w = st === "ducking" ? TREX.wDuck : TREX.w;
    blit("TREX", frame, 0, w, TREX.h, trex.x, trex.y, w, TREX.h);
  }

  // ---------- Chướng ngại vật ----------
  function spawn() {
    let def;
    for (let i = 0; i < 10; i++) {
      def = OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)];
      const dup = history.length >= 2 && history.every((h) => h === def.type);
      if (speed >= def.minSpeed && !dup) break;
      def = OBSTACLES[0];
    }
    history = [def.type, ...history].slice(0, 2);
    const size = speed > def.multiSpeed ? 1 + Math.floor(Math.random() * 3) : 1;
    const width = def.w * size;
    const minGap = Math.round(width * speed + def.minGap * CFG.gapCoef);
    const maxGap = Math.round(minGap * CFG.maxGapCoef);
    // hộp va chạm giãn theo số cây trong nhóm (như bản gốc)
    const boxes = def.boxes.map((b) => b.slice());
    if (size > 1) {
      boxes[1][2] = width - boxes[0][2] - boxes[2][2];
      boxes[2][0] = width - boxes[2][2];
    }
    obstacles.push({
      def,
      size,
      width,
      x: W,
      y: def.y[Math.floor(Math.random() * def.y.length)],
      gap: minGap + Math.random() * (maxGap - minGap),
      speedOffset: def.speedOffset ? (Math.random() > 0.5 ? def.speedOffset : -def.speedOffset) : 0,
      boxes,
      frame: 0,
      timer: 0,
    });
  }
  function drawObstacle(o) {
    const d = o.def;
    let sx = d.w * o.size * (0.5 * (o.size - 1)); // nhóm 1/2/3 cây nằm liền nhau trên tấm hình
    if (d.frames) sx += d.w * o.frame;
    blit(d.type, sx, 0, d.w * o.size, d.h, o.x, o.y, d.w * o.size, d.h);
  }

  // ---------- Va chạm (hộp va chạm của bản gốc) ----------
  const overlap = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
  function hits(o) {
    const tw = trex.ducking ? TREX.wDuck : TREX.w;
    const tBox = [trex.x + 1, trex.y + 1, tw - 2, TREX.h - 2];
    const oBox = [o.x + 1, o.y + 1, o.def.w * o.size - 2, o.def.h - 2];
    if (!overlap(tBox, oBox)) return false;
    const tBoxes = trex.ducking ? TREX.boxes.ducking : TREX.boxes.running;
    for (const a of tBoxes)
      for (const b of o.boxes)
        if (overlap([a[0] + trex.x, a[1] + trex.y, a[2], a[3]], [b[0] + o.x, b[1] + o.y, b[2], b[3]])) return true;
    return false;
  }

  // ---------- Vòng chơi ----------
  const score = () => Math.round(distanceRan * CFG.scoreCoef);
  function reset() {
    runTime = 0;
    speed = CFG.speed;
    distanceRan = 0;
    obstacles = [];
    history = [];
    clouds = [];
    inverted = false;
    invertTimer = 0;
    flashTimer = -1;
    achieved = false;
    canvas.classList.remove("night");
    gameEl.classList.remove("night");
    Object.assign(trex, { x: TREX.startX, y: TREX.groundY, v: 0, jumping: false, ducking: false, speedDrop: false });
    setStatus("running");
  }
  function start() {
    if (state === "waiting") {
      $("#btnStart").hidden = true;
      state = "intro";
      trex.holdJump = true;
      startJump();
    } else if (state === "crashed" && performance.now() - crashAt > CFG.gameoverClear) {
      reset();
      state = "running";
    }
  }

  function update(dt) {
    if (state === "waiting") return;
    if (state === "crashed") {
      restartT += dt;
      if (restartFrame < 7 && restartT > 60) {
        restartT = 0;
        restartFrame++;
      }
      return;
    }
    updateTrex(dt);
    if (state === "intro") {
      // mở màn như bản gốc: khung mở rộng ra, khủng long chạy tới vị trí trong 1.5 giây
      reveal = Math.min(W, reveal + dt * 1.4);
      trex.x = Math.min(TREX.startX, trex.x + (TREX.startX / 1500) * dt);
      if (reveal >= W && trex.x >= TREX.startX && !trex.jumping) state = "running";
      if (!trex.jumping && trex.status === "jumping") setStatus("running");
      return;
    }

    runTime += dt;
    const frames = dt / MS_PER_FRAME;
    distanceRan += speed * frames;
    if (speed < CFG.maxSpeed) speed += CFG.accel * frames;

    // mặt đất cuộn: hết đoạn thì chọn ngẫu nhiên đoạn phẳng hoặc gồ ghề
    for (const h of horizon) h.x -= speed * frames;
    if (horizon[0].x <= -W) {
      horizon[0].x += 2 * W;
      horizon[0].src = Math.random() > 0.5 ? W : 0;
      horizon.reverse();
    }

    // mây
    const lastCloud = clouds[clouds.length - 1];
    if (!lastCloud || (W - lastCloud.x > lastCloud.gap && clouds.length < 6))
      clouds.push({ x: W, y: 30 + Math.random() * 41, gap: 100 + Math.random() * 300 });
    for (const c of clouds) c.x -= speed * 0.04 * frames;
    clouds = clouds.filter((c) => c.x > -46);

    // chướng ngại vật
    for (const o of obstacles) {
      o.x -= (speed + o.speedOffset) * frames;
      if (o.def.frames) {
        o.timer += dt;
        if (o.timer >= o.def.frameMs) {
          o.timer = 0;
          o.frame = (o.frame + 1) % o.def.frames;
        }
      }
    }
    obstacles = obstacles.filter((o) => o.x + o.width > 0);
    if (runTime > CFG.clearTime) {
      const last = obstacles[obstacles.length - 1];
      if (!last || last.x + last.width + last.gap < W) spawn();
    }

    // mốc 100 điểm: nhấp nháy 3 lần + âm thanh
    const sc = score();
    if (sc > 0 && sc % CFG.achievement === 0 && !achieved) {
      achieved = true;
      flashTimer = 0;
      flashIter = 0;
      sfx.score();
    } else if (sc % CFG.achievement !== 0) achieved = false;
    if (flashTimer >= 0) {
      flashTimer += dt;
      if (flashTimer > 500) {
        flashTimer = 0;
        if (++flashIter >= 3) flashTimer = -1;
      }
    }

    // ban đêm mỗi 700 điểm, kéo dài 12 giây
    if (inverted) {
      invertTimer += dt;
      if (invertTimer > CFG.invertDuration) {
        inverted = false;
        invertTimer = 0;
      }
    } else if (sc > 0 && sc % CFG.invertDistance === 0 && !invertTrigger) {
      invertTrigger = true;
      inverted = true;
      invertTimer = 0;
      moon.phase = (moon.phase + 1) % 7;
      stars = [0, 1].map((i) => ({ x: Math.random() * W, y: Math.random() * 70, i }));
    }
    if (sc % CFG.invertDistance !== 0) invertTrigger = false;
    canvas.classList.toggle("night", inverted);
    gameEl.classList.toggle("night", inverted);
    if (inverted) {
      moon.x -= 0.25 * frames;
      if (moon.x < -40) moon.x = W;
      for (const s of stars) {
        s.x -= 0.3 * frames;
        if (s.x < -9) s.x = W;
      }
    }

    for (const o of obstacles) if (hits(o)) return crash();
  }

  function crash() {
    state = "crashed";
    crashAt = performance.now();
    setStatus("crashed");
    restartFrame = 0;
    restartT = 0;
    sfx.hit();
    if (navigator.vibrate) navigator.vibrate(200);
    if (score() > high) {
      high = score();
      try {
        localStorage.setItem("gamevui-dino-high", String(high));
      } catch {
        /* bỏ qua */
      }
    }
  }

  // ---------- Vẽ ----------
  const PHASES = [140, 120, 100, 60, 40, 20, 0];
  function drawDigits(str, x, y) {
    // chữ số cao 13, rộng 10, mỗi ký tự cách 11 px; "H","I" ở vị trí 10, 11
    [...str].forEach((ch, i) => {
      const idx = ch === "H" ? 10 : ch === "I" ? 11 : Number(ch);
      if (ch === " " || Number.isNaN(idx)) return;
      blit("TEXT", idx * 10, 0, 10, 13, x + i * 11, y, 10, 13);
    });
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!images[sheet.s].complete) return;

    // trăng sao: vẽ đảo màu trước, để khi cả khung bị đảo sang đêm thì chúng sáng lên
    if (inverted) {
      ctx.filter = "invert(1)";
      for (const s of stars) blit("STAR", 0, s.i * 9, 9, 9, s.x, s.y, 9, 9);
      const mw = moon.phase === 3 ? 40 : 20;
      blit("MOON", PHASES[moon.phase], 0, mw, 40, moon.x, 30, mw, 40);
      ctx.filter = "none";
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, reveal, H);
    ctx.clip();
    for (const c of clouds) blit("CLOUD", 0, 0, 46, 14, c.x, c.y, 46, 14);
    for (const h of horizon) blit("HORIZON", h.src, 0, W, 12, h.x, 127, W, 12);
    ctx.restore();

    for (const o of obstacles) drawObstacle(o);
    drawTrex();

    // điểm số: góc phải trên, điểm cao "HI" bên trái mờ hơn
    if (state !== "waiting") {
      const x = W - 11 * 6;
      const showScore = flashTimer < 0 || flashTimer < 250;
      const shown = flashTimer >= 0 ? Math.floor(score() / CFG.achievement) * CFG.achievement : score();
      if (showScore) drawDigits(String(shown).padStart(5, "0"), x, 5);
      if (high) {
        ctx.globalAlpha = 0.8;
        drawDigits("HI " + String(high).padStart(5, "0"), x - 5 * 2 * 10, 5);
        ctx.globalAlpha = 1;
      }
    }

    if (state === "crashed") {
      blit("TEXT", 0, 13, 191, 11, Math.round(W / 2 - 191 / 2), Math.round((H - 25) / 3), 191, 11);
      blit("RESTART", restartFrame * 36, 0, 36, 32, W / 2 - 18, H / 2, 36, 32);
    }
  }

  // ---------- Độ nét theo màn hình ----------
  function fit() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const k = Math.max(1, Math.round((canvas.clientWidth / W) * dpr));
    sheet = k >= 2 ? SHEETS[2] : SHEETS[1];
    canvas.width = W * k;
    canvas.height = H * k;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener("resize", fit);
  fit();

  // ---------- Điều khiển ----------
  const keysDown = { up: false, down: false };
  function press(kind) {
    if (kind === "up") {
      keysDown.up = true;
      if (state === "waiting" || state === "crashed") return start();
      trex.holdJump = true;
      if (!trex.ducking) startJump();
    } else if (kind === "down") {
      keysDown.down = true;
      if (state !== "running") return;
      if (trex.jumping) {
        // đang nhảy mà bấm ↓ → rơi nhanh
        trex.speedDrop = true;
        trex.v = 1;
      } else {
        trex.ducking = true;
        setStatus("ducking");
      }
    }
  }
  function release(kind) {
    if (kind === "up") {
      keysDown.up = false;
      trex.holdJump = false;
      endJump();
    } else if (kind === "down") {
      keysDown.down = false;
      trex.speedDrop = false;
      if (trex.ducking) {
        trex.ducking = false;
        if (state === "running") setStatus("running");
      }
    }
  }
  const KEYMAP = { Space: "up", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down" };
  window.addEventListener("keydown", (e) => {
    const k = KEYMAP[e.code];
    if (!k) {
      if (e.code === "Enter" && state === "crashed") start();
      return;
    }
    e.preventDefault();
    if (e.repeat) return;
    press(k);
  });
  window.addEventListener("keyup", (e) => {
    const k = KEYMAP[e.code];
    if (k) release(k);
  });
  gameEl.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    e.preventDefault();
    press("up");
  });
  window.addEventListener("pointerup", () => keysDown.up && release("up"));
  $("#btnStart").addEventListener("click", (e) => {
    e.stopPropagation();
    press("up");
    release("up");
  });
  for (const [id, kind] of [
    ["#kUp", "up"],
    ["#kSpace", "up"],
    ["#kDown", "down"],
  ]) {
    const b = $(id);
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      press(kind);
    });
    b.addEventListener("pointerup", () => release(kind));
    b.addEventListener("pointerleave", () => release(kind));
  }
  const soundBtn = $("#btnSound");
  const refreshSound = () => (soundBtn.textContent = muted ? "🔇" : "🔊");
  soundBtn.addEventListener("click", () => {
    muted = !muted;
    try {
      localStorage.setItem("gamevui-dino-muted", muted ? "1" : "0");
    } catch {
      /* bỏ qua */
    }
    refreshSound();
  });
  refreshSound();

  // ---------- Vòng lặp (bước cố định 60 khung/giây) ----------
  let acc = 0;
  let last = performance.now();
  let hidden = false;
  document.addEventListener("visibilitychange", () => {
    hidden = document.hidden;
    last = performance.now();
  });
  function loop(now) {
    acc += Math.min(100, now - last);
    last = now;
    if (!hidden)
      while (acc >= MS_PER_FRAME) {
        update(MS_PER_FRAME);
        acc -= MS_PER_FRAME;
      }
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
