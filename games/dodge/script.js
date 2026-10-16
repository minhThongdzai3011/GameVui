// Né vật cản (nhìn từ trên xuống) — điều khiển quả cầu sáng né mọi thứ bay tới,
// sống càng lâu càng nhiều điểm (10 điểm/giây + nhặt sao + né sượt qua).
// Vật cản mở dần theo thời gian: thiên thạch (ngay từ đầu), laser có vạch báo
// trước (giây 15), tên lửa bám đuôi (giây 30), nổ vòng toả đạn (giây 45); càng
// lâu càng dày và nhanh. Lướt lao nhanh và xuyên qua vật cản, có thời gian hồi.
// Toạ độ thế giới cố định 600×600, canvas chỉ co giãn lúc vẽ.
(() => {
  "use strict";

  const W = 600;
  const H = 600;
  const PR = 11; // bán kính người chơi
  const HIT = PR * 0.8; // vùng trúng nhỏ hơn hình vẽ một chút cho công bằng
  const SPEED = 270;
  const DASH_TIME = 0.18;
  const DASH_MUL = 3.3;
  const DASH_CD = 1.6;
  const INVULN = 1.5;
  const DIFFS = {
    easy: { name: "Dễ", lives: 5, speed: 0.75, rate: 0.7 },
    normal: { name: "Thường", lives: 3, speed: 1, rate: 1 },
    hard: { name: "Khó", lives: 1, speed: 1.2, rate: 1.3 },
  };
  const UNLOCK = { laser: 15, missile: 30, burst: 45 };
  const PICKUPS = {
    star: { icon: "⭐", w: 0.5, color: "255,210,63" },
    shield: { icon: "🛡️", w: 0.25, color: "77,232,255" },
    slow: { icon: "⏳", w: 0.25, color: "180,140,255" },
  };

  const $ = (s) => document.querySelector(s);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- Lưu trữ ----------
  const STORE = "gamevui-dodge";
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
    const t0 = a.currentTime + delay;
    const o = a.createOscillator();
    const gn = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn).connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, freq, type = "lowpass") {
    const a = audio();
    if (!a) return;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const gn = a.createGain();
    gn.gain.value = vol;
    src.connect(f).connect(gn).connect(a.destination);
    src.start();
  }
  const sfx = {
    hit: () => {
      noise(0.35, 0.6, 600);
      tone(180, 0.3, { type: "sawtooth", vol: 0.07, to: 50 });
    },
    shield: () => [1800, 1400, 2200].forEach((f, i) => tone(f, 0.12, { delay: i * 0.03, type: "square", vol: 0.03 })),
    star: () => [988, 1319, 1760].forEach((f, i) => tone(f, 0.14, { delay: i * 0.05, vol: 0.07 })),
    power: () => [440, 660, 880].forEach((f, i) => tone(f, 0.12, { delay: i * 0.06, vol: 0.07 })),
    warn: () => tone(880, 0.07, { type: "square", vol: 0.025 }),
    laser: () => tone(1400, 0.3, { type: "sawtooth", vol: 0.04, to: 200 }),
    burst: () => noise(0.25, 0.35, 900),
    missile: () => tone(300, 0.4, { type: "sawtooth", vol: 0.025, to: 600 }),
    dash: () => noise(0.16, 0.3, 2500, "highpass"),
    near: () => tone(1700, 0.05, { vol: 0.04 }),
    count: (go) => tone(go ? 880 : 520, go ? 0.3 : 0.12, { type: "square", vol: 0.05 }),
    over: () => [523, 392, 330, 262].forEach((f, i) => tone(f, 0.25, { delay: i * 0.14, vol: 0.08 })),
    record: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, { delay: i * 0.1, vol: 0.09 })),
  };

  // ---------- Canvas ----------
  const cv = $("#arena");
  const g = cv.getContext("2d");
  let scale = 1;
  function resize() {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    scale = cv.width / W;
  }
  new ResizeObserver(resize).observe(cv);
  resize();

  // ---------- Trạng thái ----------
  let state = "menu"; // menu | count | play | dying | pause | over
  let D = DIFFS[prefs.diff];
  let t = 0; // thời gian đã sống (giây)
  let clock = 0; // đồng hồ hiệu ứng, luôn chạy
  let countLeft = 0;
  let dyingLeft = 0;
  let player;
  let trail;
  let obs; // thiên thạch, đạn, tên lửa
  let warns; // laser, nổ vòng (có giai đoạn báo trước)
  let pickups;
  let parts;
  let texts;
  let cd; // đếm ngược tới lần sinh tiếp theo của từng loại
  let lives = 3;
  let bonus = 0;
  let nearCount = 0;
  let starCount = 0;
  let shieldOn = false;
  let slowLeft = 0;
  let invuln = 0;
  let dashLeft = 0;
  let dashCd = 0;
  let dashDir = { x: 0, y: -1 };
  let shake = 0;
  let flash = 0;
  let bigText = null;

  const inten = () => Math.min(3, 1 + t / 60); // gấp đôi sau 60 giây, tối đa gấp 3
  const score = () => Math.floor(t * 10) + bonus;

  function reset() {
    D = DIFFS[prefs.diff];
    t = 0;
    player = { x: W / 2, y: H / 2, fx: 0, fy: -1 };
    trail = [];
    obs = [];
    warns = [];
    pickups = [];
    parts = [];
    texts = [];
    cd = { rock: 0.6, laser: UNLOCK.laser, missile: UNLOCK.missile, burst: UNLOCK.burst, pickup: 7 };
    lives = D.lives;
    bonus = nearCount = starCount = 0;
    shieldOn = false;
    slowLeft = invuln = dashLeft = dashCd = shake = flash = 0;
    bigText = null;
    touchDX = touchDY = 0;
    lastShown = -1;
    renderHud(true);
  }

  // ---------- Sinh vật cản ----------
  function edgePoint(m = 30) {
    const side = (Math.random() * 4) | 0;
    if (side === 0) return { x: rand(0, W), y: -m };
    if (side === 1) return { x: W + m, y: rand(0, H) };
    if (side === 2) return { x: rand(0, W), y: H + m };
    return { x: -m, y: rand(0, H) };
  }
  function spawnRock() {
    const p = edgePoint();
    const tx = player.x + rand(-80, 80);
    const ty = player.y + rand(-80, 80);
    const d = Math.hypot(tx - p.x, ty - p.y) || 1;
    const sp = rand(120, 200) * D.speed * (0.85 + 0.15 * inten());
    obs.push({ type: "rock", x: p.x, y: p.y, vx: ((tx - p.x) / d) * sp, vy: ((ty - p.y) / d) * sp, r: rand(8, 17), rot: rand(0, 6), spin: rand(-3, 3) });
  }
  function spawnLaser(cross) {
    const last = warns.filter((w) => w.type === "laser").pop();
    const horiz = cross && last ? !last.horiz : Math.random() < 0.5;
    // nhắm gần chỗ người chơi đang đứng để buộc phải di chuyển
    const pos = clamp((horiz ? player.y : player.x) + rand(-70, 70), 25, (horiz ? H : W) - 25);
    warns.push({ type: "laser", horiz, pos, age: 0, warn: 1.15 / Math.sqrt(D.speed), active: 0.35, beeps: 0 });
  }
  function spawnMissile() {
    const p = edgePoint(20);
    obs.push({ type: "missile", x: p.x, y: p.y, a: Math.atan2(player.y - p.y, player.x - p.x), v: 150 * D.speed, turn: 1.7, life: 6, r: 8 });
    sfx.missile();
  }
  function spawnBurst() {
    let x;
    let y;
    for (let i = 0; i < 20; i++) {
      x = rand(70, W - 70);
      y = rand(70, H - 70);
      if (Math.hypot(x - player.x, y - player.y) > 170) break;
    }
    warns.push({ type: "burst", x, y, age: 0, warn: 0.95, n: 10 + Math.floor(inten() * 3) });
  }
  function spawnPickup() {
    let r = Math.random();
    let kind = "star";
    for (const k in PICKUPS)
      if ((r -= PICKUPS[k].w) < 0) {
        kind = k;
        break;
      }
    let x;
    let y;
    for (let i = 0; i < 20; i++) {
      x = rand(60, W - 60);
      y = rand(60, H - 60);
      if (Math.hypot(x - player.x, y - player.y) > 120) break;
    }
    pickups.push({ kind, x, y, life: 7 });
  }

  // ---------- Hiệu ứng ----------
  function boom(x, y, color, n = 16, sp = 160) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(sp * 0.3, sp);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.35, 0.7), max: 0.7, color, size: rand(1.5, 3.5) });
    }
  }
  function say(x, y, text, color = "#fff", size = 18) {
    texts.push({ x, y, text, color, size, life: 0.9 });
  }

  // ---------- Cập nhật ----------
  function update(dt) {
    clock += dt;
    if (state === "count") {
      const before = Math.ceil(countLeft);
      countLeft -= dt;
      if (Math.ceil(countLeft) !== before && countLeft > 0) sfx.count(false);
      if (countLeft <= 0) {
        state = "play";
        sfx.count(true);
        bigText = { text: "Né!", life: 0.7 };
      }
    }
    if (bigText && (bigText.life -= dt) <= 0) bigText = null;
    shake = Math.max(0, shake - dt * 40);
    flash = Math.max(0, flash - dt * 1.6);
    for (const p of parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
    }
    parts = parts.filter((p) => p.life > 0);
    for (const s of texts) {
      s.y -= 40 * dt;
      s.life -= dt;
    }
    texts = texts.filter((s) => s.life > 0);

    if (state === "dying") {
      // vật cản trôi chậm lại một nhịp rồi mới hiện bảng kết quả
      stepWorld(dt * 0.3);
      if ((dyingLeft -= dt) <= 0) endGame();
      return;
    }
    if (state !== "play") return;

    t += dt;
    if (slowLeft > 0) slowLeft -= dt;
    if (invuln > 0) invuln -= dt;
    if (dashCd > 0) dashCd -= dt;
    if (dashLeft > 0) dashLeft -= dt;
    movePlayer(dt);
    const odt = dt * (slowLeft > 0 ? 0.45 : 1); // ⏳ chỉ làm chậm vật cản
    spawners(odt);
    stepWorld(odt);
    collide();
    renderHud();
  }

  function spawners(dt) {
    const I = inten();
    const R = D.rate;
    if ((cd.rock -= dt) <= 0) {
      spawnRock();
      if (I > 1.8 && Math.random() < 0.3) spawnRock();
      cd.rock = (0.95 / (R * I)) * rand(0.7, 1.3);
    }
    if ((cd.laser -= dt) <= 0) {
      spawnLaser(false);
      if (t > 40 && Math.random() < 0.4) spawnLaser(true); // về sau hay có 2 tia chéo nhau
      cd.laser = (4.2 / (R * Math.sqrt(I))) * rand(0.8, 1.2);
    }
    if ((cd.missile -= dt) <= 0) {
      spawnMissile();
      cd.missile = (6.5 / (R * Math.sqrt(I))) * rand(0.8, 1.2);
    }
    if ((cd.burst -= dt) <= 0) {
      spawnBurst();
      cd.burst = (7 / (R * Math.sqrt(I))) * rand(0.8, 1.2);
    }
    if ((cd.pickup -= dt) <= 0) {
      spawnPickup();
      cd.pickup = rand(8, 13);
    }
  }

  function stepWorld(dt) {
    for (const o of obs) {
      if (o.type === "missile") {
        o.life -= dt;
        let diff = Math.atan2(player.y - o.y, player.x - o.x) - o.a;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        o.a += clamp(diff, -o.turn * dt, o.turn * dt);
        o.x += Math.cos(o.a) * o.v * dt;
        o.y += Math.sin(o.a) * o.v * dt;
        if (Math.random() < 0.6)
          parts.push({ x: o.x - Math.cos(o.a) * 12, y: o.y - Math.sin(o.a) * 12, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.3, max: 0.3, color: "255,150,60", size: 2.5 });
        if (o.life <= 0) {
          o.dead = true; // hết nhiên liệu → tự nổ, không gây sát thương
          boom(o.x, o.y, "255,120,60", 14, 120);
        }
      } else {
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        if (o.rot != null) o.rot += o.spin * dt;
        if (o.x < -60 || o.x > W + 60 || o.y < -60 || o.y > H + 60) o.dead = true;
      }
    }
    for (const w of warns) {
      const was = w.age;
      w.age += dt;
      if (w.type === "laser") {
        const beeps = Math.floor(w.age / 0.25);
        if (w.age < w.warn && beeps > w.beeps) {
          w.beeps = beeps;
          if (state === "play") sfx.warn();
        }
        if (was < w.warn && w.age >= w.warn && state === "play") sfx.laser();
        if (w.age >= w.warn + w.active) w.dead = true;
      } else if (w.age >= w.warn) {
        // nổ vòng: toả đạn đều ra mọi hướng
        const off = rand(0, Math.PI * 2);
        const sp = 125 * D.speed * (0.9 + 0.1 * inten());
        for (let i = 0; i < w.n; i++) {
          const a = off + (i / w.n) * Math.PI * 2;
          obs.push({ type: "bullet", x: w.x, y: w.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 6 });
        }
        boom(w.x, w.y, "255,79,163", 18, 140);
        if (state === "play") sfx.burst();
        w.dead = true;
      }
    }
    for (const p of pickups) {
      p.life -= dt;
      if (p.life <= 0) p.dead = true;
    }
    obs = obs.filter((o) => !o.dead);
    warns = warns.filter((w) => !w.dead);
    pickups = pickups.filter((p) => !p.dead);
  }

  // ---------- Người chơi ----------
  const keys = { up: false, down: false, left: false, right: false };
  let inputMode = "keys"; // keys | mouse | touch
  let aim = null; // điểm chuột đang trỏ (toạ độ thế giới)
  let drag = null; // ngón tay đang kéo
  let touchDX = 0;
  let touchDY = 0;

  function movePlayer(dt) {
    let vx = 0;
    let vy = 0;
    const kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const ky = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (kx || ky) {
      inputMode = "keys";
      const l = Math.hypot(kx, ky);
      vx = (kx / l) * SPEED;
      vy = (ky / l) * SPEED;
    } else if (inputMode === "mouse" && aim) {
      // đi tới chỗ con trỏ, chậm lại khi gần tới để không rung
      const dx = aim.x - player.x;
      const dy = aim.y - player.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.5) {
        const sp = Math.min(SPEED, d * 12);
        vx = (dx / d) * sp;
        vy = (dy / d) * sp;
      }
    }
    if (dashLeft > 0) {
      vx = dashDir.x * SPEED * DASH_MUL;
      vy = dashDir.y * SPEED * DASH_MUL;
    }
    let mx = vx * dt;
    let my = vy * dt;
    if (touchDX || touchDY) {
      // cảm ứng: nhân vật dịch theo quãng ngón tay kéo (không nhảy tới dưới ngón tay).
      // Mỗi khung đi tối đa lim, phần dư để khung sau đi tiếp; dư quá nhiều thì bỏ
      // bớt để không trôi lâu sau khi đã nhấc tay
      const l = Math.hypot(touchDX, touchDY);
      if (l > 90) {
        touchDX *= 90 / l;
        touchDY *= 90 / l;
      }
      const lim = SPEED * 3 * dt;
      const k = Math.min(1, lim / Math.hypot(touchDX, touchDY));
      mx += touchDX * k;
      my += touchDY * k;
      touchDX -= touchDX * k;
      touchDY -= touchDY * k;
    }
    player.x = clamp(player.x + mx, PR, W - PR);
    player.y = clamp(player.y + my, PR, H - PR);
    const l = Math.hypot(mx, my);
    if (l > 0.3) {
      player.fx = mx / l;
      player.fy = my / l;
    }
    trail.push({ x: player.x, y: player.y });
    if (trail.length > 12) trail.shift();
  }

  function dash() {
    if (state !== "play" || dashCd > 0) return;
    dashLeft = DASH_TIME;
    dashCd = DASH_CD;
    dashDir = { x: player.fx, y: player.fy };
    boom(player.x, player.y, "77,232,255", 10, 90);
    sfx.dash();
  }

  // ---------- Va chạm ----------
  function collide() {
    const safe = invuln > 0 || dashLeft > 0;
    for (const o of obs) {
      const d = Math.hypot(o.x - player.x, o.y - player.y);
      if (d < o.r + HIT) {
        if (safe) continue;
        o.dead = true;
        boom(o.x, o.y, o.type === "bullet" ? "255,79,163" : "255,122,47", 14);
        hurt();
        return;
      }
      // né sượt: đã lướt qua rất sát rồi bay ra xa mà không trúng
      if (!safe && d < o.r + PR + 16) o.close = true;
      else if (o.close && !o.awarded && d > o.r + PR + 34) {
        o.awarded = true;
        nearCount++;
        bonus += 15;
        say(player.x, player.y - 22, "Sượt! +15", "#9ff3ff", 15);
        sfx.near();
      }
    }
    for (const w of warns) {
      if (w.type !== "laser" || w.age < w.warn || safe) continue;
      const dist = w.horiz ? Math.abs(player.y - w.pos) : Math.abs(player.x - w.pos);
      if (dist < 9 + HIT) {
        hurt();
        return;
      }
    }
    for (const p of pickups) {
      if (Math.hypot(p.x - player.x, p.y - player.y) > 16 + PR) continue;
      p.dead = true;
      boom(p.x, p.y, PICKUPS[p.kind].color, 14, 110);
      if (p.kind === "star") {
        bonus += 100;
        starCount++;
        say(p.x, p.y - 16, "+100", "#ffd23f");
        sfx.star();
      } else if (p.kind === "shield") {
        shieldOn = true;
        say(p.x, p.y - 16, "Khiên!", "#4de8ff");
        sfx.power();
      } else {
        slowLeft = 4;
        say(p.x, p.y - 16, "Chậm lại!", "#c9a8ff");
        sfx.power();
      }
    }
  }

  function hurt() {
    if (shieldOn) {
      shieldOn = false;
      invuln = 1;
      boom(player.x, player.y, "77,232,255", 24, 180);
      say(player.x, player.y - 22, "Khiên vỡ!", "#4de8ff");
      sfx.shield();
      return;
    }
    lives--;
    invuln = INVULN;
    shake = 14;
    flash = 0.6;
    boom(player.x, player.y, "255,84,112", 22, 200);
    sfx.hit();
    renderHud(true);
    if (lives <= 0) {
      state = "dying";
      dyingLeft = 1.1;
      boom(player.x, player.y, "77,232,255", 40, 260);
      shake = 22;
    }
  }

  // ---------- Vẽ ----------
  function draw() {
    g.setTransform(scale, 0, 0, scale, 0, 0);
    if (shake > 0) g.translate(rand(-shake, shake) / 2, rand(-shake, shake) / 2);
    drawFloor();
    for (const w of warns) drawWarn(w);
    for (const p of pickups) drawPickup(p);
    for (const o of obs) drawObstacle(o);
    if (state !== "dying" && state !== "over") drawPlayer();
    g.globalCompositeOperation = "lighter";
    for (const p of parts) {
      g.fillStyle = `rgba(${p.color},${Math.max(0, p.life / p.max)})`;
      g.beginPath();
      g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = "source-over";
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const s of texts) {
      g.globalAlpha = Math.min(1, s.life * 2);
      g.font = `800 ${s.size}px "Baloo 2", sans-serif`;
      g.lineWidth = 4;
      g.strokeStyle = "rgba(5,8,25,0.8)";
      g.strokeText(s.text, s.x, s.y);
      g.fillStyle = s.color;
      g.fillText(s.text, s.x, s.y);
    }
    g.globalAlpha = 1;

    g.setTransform(scale, 0, 0, scale, 0, 0);
    if (slowLeft > 0 && state === "play") {
      g.fillStyle = `rgba(120,90,255,${0.1 + 0.04 * Math.sin(clock * 6)})`;
      g.fillRect(0, 0, W, H);
    }
    if (flash > 0) {
      g.fillStyle = `rgba(255,40,80,${flash * 0.45})`;
      g.fillRect(0, 0, W, H);
    }
    if (state === "count" || bigText) {
      const text = state === "count" ? String(Math.ceil(countLeft)) : bigText.text;
      const k = state === "count" ? countLeft % 1 : bigText.life / 0.7;
      g.globalAlpha = Math.min(1, k * 2);
      g.font = `800 ${110 + (1 - k) * 30}px "Baloo 2", sans-serif`;
      g.lineWidth = 8;
      g.strokeStyle = "rgba(5,8,25,0.7)";
      g.strokeText(text, W / 2, H / 2);
      g.fillStyle = "#4de8ff";
      g.fillText(text, W / 2, H / 2);
      g.globalAlpha = 1;
    }
  }

  function drawFloor() {
    const bg = g.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.75);
    bg.addColorStop(0, "#141a45");
    bg.addColorStop(1, "#070a1d");
    g.fillStyle = bg;
    g.fillRect(-30, -30, W + 60, H + 60);
    g.strokeStyle = "rgba(90,120,255,0.09)";
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 40; i < W; i += 40) {
      g.moveTo(i, 0);
      g.lineTo(i, H);
      g.moveTo(0, i);
      g.lineTo(W, i);
    }
    g.stroke();
  }

  function drawPlayer() {
    // vệt sáng phía sau
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      const k = i / trail.length;
      g.fillStyle = `rgba(77,232,255,${k * (dashLeft > 0 ? 0.45 : 0.18)})`;
      g.beginPath();
      g.arc(p.x, p.y, PR * (0.4 + 0.6 * k), 0, Math.PI * 2);
      g.fill();
    }
    const blink = invuln > 0 && Math.floor(clock * 14) % 2 === 0;
    g.globalAlpha = blink ? 0.3 : 1;
    g.shadowColor = "#4de8ff";
    g.shadowBlur = 18;
    const body = g.createRadialGradient(player.x - 3, player.y - 3, 1, player.x, player.y, PR);
    body.addColorStop(0, "#ffffff");
    body.addColorStop(0.45, "#9ff3ff");
    body.addColorStop(1, "#18b7d8");
    g.fillStyle = body;
    g.beginPath();
    g.arc(player.x, player.y, PR, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    // "mắt" chỉ hướng đang đi
    g.fillStyle = "#06303a";
    g.beginPath();
    g.arc(player.x + player.fx * 5, player.y + player.fy * 5, 2.6, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    if (shieldOn) {
      g.strokeStyle = `rgba(77,232,255,${0.6 + 0.3 * Math.sin(clock * 8)})`;
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(player.x, player.y, PR + 8, 0, Math.PI * 2);
      g.stroke();
    }
    if (dashCd > 0) {
      // vòng hồi chiêu lướt
      g.strokeStyle = "rgba(77,232,255,0.45)";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(player.x, player.y, PR + 4, -Math.PI / 2, -Math.PI / 2 + (1 - dashCd / DASH_CD) * Math.PI * 2);
      g.stroke();
    }
  }

  function drawObstacle(o) {
    if (o.type === "rock") {
      g.fillStyle = "rgba(255,122,47,0.18)";
      g.beginPath();
      g.arc(o.x, o.y, o.r * 1.6, 0, Math.PI * 2);
      g.fill();
      const gr = g.createRadialGradient(o.x - o.r * 0.3, o.y - o.r * 0.3, 1, o.x, o.y, o.r);
      gr.addColorStop(0, "#ffd08a");
      gr.addColorStop(0.55, "#ff7a2f");
      gr.addColorStop(1, "#b8360f");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      g.fill();
      // vết lõm xoay theo cho có cảm giác đang lăn
      g.fillStyle = "rgba(120,30,5,0.45)";
      for (const [k, s] of [
        [0, 0.28],
        [2.2, 0.2],
        [4.1, 0.16],
      ]) {
        g.beginPath();
        g.arc(o.x + Math.cos(o.rot + k) * o.r * 0.45, o.y + Math.sin(o.rot + k) * o.r * 0.45, o.r * s, 0, Math.PI * 2);
        g.fill();
      }
    } else if (o.type === "bullet") {
      g.fillStyle = "rgba(255,79,163,0.25)";
      g.beginPath();
      g.arc(o.x, o.y, o.r * 1.9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ff4fa3";
      g.beginPath();
      g.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ffe0f0";
      g.beginPath();
      g.arc(o.x, o.y, o.r * 0.45, 0, Math.PI * 2);
      g.fill();
    } else {
      // tên lửa: thân đỏ, lửa phụt phía sau; sắp hết nhiên liệu thì nhấp nháy
      g.save();
      g.translate(o.x, o.y);
      g.rotate(o.a);
      if (o.life < 1.2 && Math.floor(clock * 10) % 2) g.globalAlpha = 0.45;
      g.fillStyle = "#ffb347";
      g.beginPath();
      g.moveTo(-9, -4);
      g.lineTo(-9 - rand(8, 16), 0);
      g.lineTo(-9, 4);
      g.fill();
      g.fillStyle = "#ff3b5c";
      g.beginPath();
      g.moveTo(13, 0);
      g.lineTo(-9, -7);
      g.lineTo(-6, 0);
      g.lineTo(-9, 7);
      g.closePath();
      g.fill();
      g.fillStyle = "#ffe3e8";
      g.beginPath();
      g.arc(3, 0, 2.2, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }

  function drawWarn(w) {
    if (w.type === "laser") {
      const x0 = w.horiz ? 0 : w.pos;
      const y0 = w.horiz ? w.pos : 0;
      const x1 = w.horiz ? W : w.pos;
      const y1 = w.horiz ? w.pos : H;
      g.lineCap = "butt";
      if (w.age < w.warn) {
        // báo trước: dải đỏ mờ + vạch đứt nhấp nháy nhanh dần
        const k = w.age / w.warn;
        g.strokeStyle = `rgba(255,59,92,${0.08 + 0.1 * k})`;
        g.lineWidth = 18 + HIT;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        g.setLineDash([14, 10]);
        g.lineDashOffset = -clock * 60;
        g.strokeStyle = `rgba(255,59,92,${0.35 + 0.45 * Math.abs(Math.sin(clock * (8 + k * 16)))})`;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        g.setLineDash([]);
      } else {
        const k = 1 - (w.age - w.warn) / w.active;
        g.shadowColor = "#ff3b5c";
        g.shadowBlur = 25;
        g.strokeStyle = `rgba(255,59,92,${0.85 * k})`;
        g.lineWidth = 18;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        g.shadowBlur = 0;
        g.strokeStyle = `rgba(255,240,245,${k})`;
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
      }
    } else {
      // nổ vòng: vòng tròn co dần lại = sắp nổ
      const k = w.age / w.warn;
      g.strokeStyle = `rgba(255,79,163,${0.4 + 0.5 * k})`;
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(w.x, w.y, 46 * (1 - k) + 8, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = `rgba(255,79,163,${0.25 + 0.5 * Math.abs(Math.sin(clock * 14))})`;
      g.beginPath();
      g.arc(w.x, w.y, 6, 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawPickup(p) {
    if (p.life < 2 && Math.floor(clock * 8) % 2) return; // sắp biến mất thì nhấp nháy
    const c = PICKUPS[p.kind].color;
    const bob = Math.sin(clock * 4 + p.x) * 2;
    g.fillStyle = `rgba(${c},${0.18 + 0.08 * Math.sin(clock * 5)})`;
    g.beginPath();
    g.arc(p.x, p.y + bob, 20, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(${c},0.7)`;
    g.lineWidth = 1.5;
    g.stroke();
    g.font = '22px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#fff";
    g.fillText(PICKUPS[p.kind].icon, p.x, p.y + bob + 1);
  }

  // ---------- Vòng lặp ----------
  let last = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); // quay lại sau khi ẩn tab thì không nhảy cóc
    last = now;
    if (state !== "pause" && state !== "over") update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // ---------- HUD ----------
  let lastShown = -1;
  function renderHud(force) {
    const tenth = Math.floor(t * 10);
    if (tenth !== lastShown || force) {
      lastShown = tenth;
      $("#stTime").textContent = (tenth / 10).toFixed(1);
      $("#stScore").textContent = score();
    }
    if (force) {
      const lost = Math.max(0, D.lives - lives);
      $("#stLives").innerHTML = "♥".repeat(Math.max(0, lives)) + (lost ? `<s>${"♥".repeat(lost)}</s>` : "");
      $("#stBest").textContent = prefs.best[prefs.diff];
    }
    const btn = $("#btnDash");
    btn.style.setProperty("--cd", (100 * (1 - Math.max(0, dashCd) / DASH_CD)).toFixed(0) + "%");
    btn.classList.toggle("cooling", dashCd > 0);
  }
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
    box.querySelector(".primary")?.focus();
  }
  const closeCard = () => ($("#overlay").hidden = true);

  // ---------- Luồng chơi ----------
  function showMenu() {
    state = "menu";
    reset();
    const seg = Object.entries(DIFFS)
      .map(
        ([k, d]) =>
          `<button data-diff="${k}" class="${k === prefs.diff ? "on" : ""}">${d.name}<small>${d.lives} mạng · kỷ lục ${prefs.best[k]}</small></button>`,
      )
      .join("");
    card(
      "☄️",
      "Né vật cản",
      `<div class="seg">${seg}</div>
      <ul class="legend">
        <li><span><i class="meteor"></i></span>Thiên thạch bay về phía bạn<em>từ đầu</em></li>
        <li><span><i class="laser"></i></span>Tia laser, vạch đỏ nhấp nháy báo trước<em>giây ${UNLOCK.laser}</em></li>
        <li><span>🚀</span>Tên lửa bám đuôi, dụ cho hết nhiên liệu<em>giây ${UNLOCK.missile}</em></li>
        <li><span>💥</span>Vòng đỏ co lại rồi nổ, đạn toả mọi hướng<em>giây ${UNLOCK.burst}</em></li>
        <li><span>⭐</span>+100 điểm · 🛡️ khiên đỡ 1 lần · ⏳ làm chậm 4 giây</li>
      </ul>
      <p class="tip">10 điểm mỗi giây sống, né sát sượt +15.<br>
      <b>Lướt</b> để lao nhanh và xuyên qua vật cản: <kbd>Space</kbd>, bấm chuột, nút ⚡ hoặc chạm thêm ngón thứ hai.<br>
      Điện thoại: kéo ngón tay ở bất kỳ đâu trên sân để di chuyển.</p>`,
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
  function startGame() {
    closeCard();
    reset();
    state = "count";
    countLeft = 3;
    sfx.count(false);
  }
  function endGame() {
    state = "over";
    const s = score();
    const record = s > prefs.best[prefs.diff];
    if (record) {
      prefs.best[prefs.diff] = s;
      persist();
    }
    renderHud(true);
    if (record) sfx.record();
    else sfx.over();
    card(
      record ? "🏆" : "💥",
      record ? "Kỷ lục mới!" : "Trúng đòn rồi!",
      `<div class="final">${s}</div>
      <div class="final-sub">điểm · mức ${D.name} · kỷ lục ${prefs.best[prefs.diff]}</div>
      <div class="results">
        <div><small>Sống được</small><b>${t.toFixed(1)} giây</b></div>
        <div><small>Né sát sượt</small><b>${nearCount}</b></div>
        <div><small>Sao nhặt được</small><b>${starCount}</b></div>
        <div><small>Đã gặp</small><b>${["thiên thạch", "laser", "tên lửa", "nổ vòng"].filter((_, i) => t >= [0, UNLOCK.laser, UNLOCK.missile, UNLOCK.burst][i]).length}/4 loại</b></div>
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
    for (const k in keys) keys[k] = false;
    card("⏸", "Tạm dừng", `<p>Đã sống <b>${t.toFixed(1)} giây</b> · ${score()} điểm<br>Bấm <b>P</b> hoặc <b>Esc</b> để chơi tiếp.</p>`, [
      ["Chơi tiếp", resumeGame, true],
      ["Chơi lại", startGame],
      ["Đổi độ khó", showMenu],
    ]);
  }
  function resumeGame() {
    if (state !== "pause") return;
    closeCard();
    state = "play";
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame();
  });

  // ---------- Điều khiển ----------
  const KEYMAP = { arrowup: "up", w: "up", arrowdown: "down", s: "down", arrowleft: "left", a: "left", arrowright: "right", d: "right" };
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (KEYMAP[k]) {
      keys[KEYMAP[k]] = true;
      if (state === "play" || state === "count") e.preventDefault();
    } else if (k === " " || k === "shift") {
      if (state !== "play") return; // để Space còn bấm được nút trong hộp thoại
      e.preventDefault();
      if (!e.repeat) dash();
    } else if ((k === "p" || k === "escape") && !e.repeat) {
      if (state === "pause") resumeGame();
      else pauseGame();
    }
  });
  window.addEventListener("keyup", (e) => {
    const k = KEYMAP[e.key.toLowerCase()];
    if (k) keys[k] = false;
  });
  window.addEventListener("blur", () => {
    for (const k in keys) keys[k] = false;
  });

  const toWorld = (e) => {
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  cv.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (e.pointerType === "mouse") {
      aim = toWorld(e);
      inputMode = "mouse";
      dash(); // bấm chuột = lướt
      return;
    }
    if (drag) return dash(); // đang kéo mà chạm thêm ngón nữa = lướt
    const p = toWorld(e);
    drag = { id: e.pointerId, x: p.x, y: p.y };
    inputMode = "touch";
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") {
      aim = toWorld(e);
      inputMode = "mouse";
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const p = toWorld(e);
    if (state === "play") {
      touchDX += (p.x - drag.x) * 1.2;
      touchDY += (p.y - drag.y) * 1.2;
    }
    drag.x = p.x;
    drag.y = p.y;
  });
  const endDrag = (e) => {
    if (drag && e.pointerId === drag.id) drag = null;
  };
  cv.addEventListener("pointerup", endDrag);
  cv.addEventListener("pointercancel", endDrag);
  $("#btnDash").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dash();
  });

  $("#btnPause").addEventListener("click", pauseGame);
  $("#btnRestart").addEventListener("click", startGame);
  $("#btnSound").addEventListener("click", () => {
    prefs.muted = !prefs.muted;
    persist();
    refreshSound();
  });

  refreshSound();
  showMenu();
  requestAnimationFrame((now) => {
    last = now;
    frame(now);
  });
})();
