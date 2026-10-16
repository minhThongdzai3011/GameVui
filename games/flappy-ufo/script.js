// Flappy UFO — chạm để UFO bốc lên, bay qua khe của các cổng năng lượng.
// Khác Flappy Bird ở chỗ: có cổng di động (khe trượt lên xuống), cổng đảo trọng
// lực (UFO lộn ngược, bị hút lên trần, chạm để đẩy xuống), pha lê +1 điểm, khiên
// đỡ một lần va chạm, và 3 mức độ khó. Huy chương theo điểm như bản gốc.
// Toạ độ thế giới 400×600, vật lý chạy bước cố định 1/120 giây.
(() => {
  "use strict";

  const W = 400;
  const H = 600;
  const UX = 112; // UFO đứng yên theo chiều ngang, cổng trôi về phía nó
  const READY_Y = H * 0.45;
  const PW = 64; // bề ngang cổng
  const SPACING = 235; // khoảng cách giữa hai cổng
  const MARGIN = 55; // khe không sát mép trên / dưới quá
  const MAX_FALL = 560;
  const STEP = 1 / 120;
  const OMEGA = (Math.PI * 2) / 2.6; // cổng di động: 2,6 giây một vòng
  const HW = 19; // nửa bề ngang vùng va chạm của UFO
  const HH = 10; // nửa bề cao
  const DIFFS = {
    easy: { name: "Dễ", note: "khe rộng · có khiên", gap: 200, speed: 135, grav: 1250, flap: 390, shield: true, move: 15, portal: 30 },
    normal: { name: "Thường", note: "như Flappy Bird", gap: 168, speed: 155, grav: 1450, flap: 420, shield: false, move: 8, portal: 20 },
    hard: { name: "Khó", note: "khe hẹp · nhanh", gap: 142, speed: 178, grav: 1550, flap: 440, shield: false, move: 4, portal: 12 },
  };
  const MEDALS = [
    [100, "🏆", "Bạch kim"],
    [50, "🥇", "Vàng"],
    [25, "🥈", "Bạc"],
    [10, "🥉", "Đồng"],
  ];

  const $ = (s) => document.querySelector(s);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- Lưu trữ ----------
  const STORE = "gamevui-flappy-ufo";
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
  function noise(dur, vol, freq) {
    const a = audio();
    if (!a) return;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = freq;
    const gn = a.createGain();
    gn.gain.value = vol;
    src.connect(f).connect(gn).connect(a.destination);
    src.start();
  }
  const sfx = {
    flap: () => tone(360, 0.12, { type: "sine", vol: 0.08, to: 720 }),
    point: () => {
      tone(1046, 0.08, { vol: 0.07 });
      tone(1568, 0.14, { delay: 0.07, vol: 0.07 });
    },
    gem: () => [1319, 1760, 2093].forEach((f, i) => tone(f, 0.1, { delay: i * 0.04, vol: 0.05 })),
    shield: () => [440, 660, 880].forEach((f, i) => tone(f, 0.12, { delay: i * 0.06, vol: 0.07 })),
    shieldBreak: () => [1800, 1400, 2200].forEach((f, i) => tone(f, 0.12, { delay: i * 0.03, type: "square", vol: 0.03 })),
    portal: () => {
      tone(200, 0.5, { type: "sine", vol: 0.09, to: 1200 });
      tone(1200, 0.5, { type: "sine", vol: 0.05, to: 200 });
    },
    crash: () => {
      noise(0.45, 0.6, 700);
      tone(220, 0.4, { type: "sawtooth", vol: 0.07, to: 50 });
    },
    over: () => [523, 392, 330, 262].forEach((f, i) => tone(f, 0.25, { delay: i * 0.14, vol: 0.07 })),
    record: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, { delay: i * 0.1, vol: 0.09 })),
  };

  // ---------- Canvas ----------
  const cv = $("#sky");
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

  // nền sao 3 lớp trôi với tốc độ khác nhau
  const STARS = [0.08, 0.2, 0.45].map((k, li) =>
    Array.from({ length: [70, 40, 22][li] }, () => ({ x: rand(0, W), y: rand(0, H), r: [0.7, 1.1, 1.6][li], tw: rand(0, 6) })).map((s) => ({ ...s, k })),
  );

  // ---------- Trạng thái ----------
  let state = "menu"; // menu | ready | play | dying | pause | over
  let D = DIFFS[prefs.diff];
  let ufo;
  let gates;
  let portals;
  let parts;
  let texts;
  let score = 0;
  let gems = 0;
  let flips = 0;
  let flip = false;
  let gateNo = 0;
  let sincePortal = 0;
  let sinceShield = 0;
  let shieldOn = false;
  let invuln = 0;
  let time = 0; // đồng hồ ván (cổng di động chạy theo nó)
  let clock = 0; // đồng hồ hiệu ứng
  let scroll = 0;
  let thrust = 0;
  let flash = 0;
  let flashColor = "255,255,255";
  let shake = 0;
  let dyingLeft = 0;

  const speed = () => D.speed * (1 + Math.min(0.25, score * 0.005));
  const center = (gt) => gt.base + (gt.moving ? gt.amp * Math.sin(time * OMEGA + gt.phase) : 0);

  function reset() {
    D = DIFFS[prefs.diff];
    ufo = { y: READY_Y, vy: 0, rot: 0, flipAng: 0, spin: 0 };
    gates = [];
    portals = [];
    parts = [];
    texts = [];
    score = gems = flips = gateNo = sincePortal = sinceShield = 0;
    flip = false;
    shieldOn = D.shield;
    invuln = time = thrust = flash = shake = 0;
    renderHud();
  }

  // ---------- Cổng ----------
  function addGate(x) {
    const gap = D.gap;
    const lo = MARGIN + gap / 2;
    const hi = H - MARGIN - gap / 2;
    const prev = gates.length ? gates[gates.length - 1].base : H / 2;
    let base = clamp(prev + rand(-190, 190), lo, hi);
    const moving = gateNo >= D.move && Math.random() < 0.35;
    let amp = 0;
    if (moving) {
      amp = Math.min(55, (hi - lo) / 2);
      base = clamp(base, lo + amp, hi - amp);
    }
    const gt = { x, base, gap, moving, amp, phase: rand(0, Math.PI * 2), passed: false, gem: null, shield: null };
    if (gateNo > 0 && Math.random() < 0.55) gt.gem = { dy: rand(-gap * 0.22, gap * 0.22), taken: false };
    else if (gateNo > 3 && sinceShield >= 14 && Math.random() < 0.5) {
      gt.shield = { taken: false };
      sinceShield = 0;
    }
    sinceShield++;
    // cổng đảo trọng lực đặt giữa cổng trước và cổng này
    if (gateNo >= D.portal && sincePortal >= 7 && Math.random() < 0.35) {
      portals.push({ x: x - (SPACING - PW) / 2, used: false });
      sincePortal = 0;
    }
    sincePortal++;
    gateNo++;
    gates.push(gt);
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

  // ---------- Bay ----------
  function flap() {
    if (state === "ready") {
      state = "play";
      addGate(W + 120);
    }
    if (state !== "play") return;
    ufo.vy = -D.flap * (flip ? -1 : 1);
    thrust = 0.18;
    // luồng sáng phụt ra phía "dưới" (ngược hướng bay lên)
    const s = flip ? -1 : 1;
    for (let i = 0; i < 6; i++)
      parts.push({ x: UX + rand(-8, 8), y: ufo.y + 12 * s, vx: rand(-40, 40) - 60, vy: rand(80, 160) * s, life: 0.35, max: 0.35, color: "125,255,138", size: rand(1.5, 2.5) });
    sfx.flap();
  }

  function step(dt) {
    time += dt;
    const target = flip ? Math.PI : 0;
    ufo.flipAng += clamp(target - ufo.flipAng, -9 * dt, 9 * dt);
    if (state === "ready") {
      ufo.y = READY_Y + Math.sin(time * 3) * 8;
      scroll += D.speed * dt;
      return;
    }
    const sgn = flip ? -1 : 1;
    if (state === "dying") {
      ufo.vy = clamp(ufo.vy + D.grav * 1.3 * sgn * dt, -MAX_FALL * 1.4, MAX_FALL * 1.4);
      ufo.y = clamp(ufo.y + ufo.vy * dt, 14, H - 14);
      ufo.spin += 9 * dt;
      if ((dyingLeft -= dt) <= 0) endGame();
      return;
    }
    // ---- đang chơi ----
    ufo.vy = clamp(ufo.vy + D.grav * sgn * dt, -MAX_FALL, MAX_FALL);
    ufo.y += ufo.vy * dt;
    if (invuln > 0) invuln -= dt;
    const sp = speed();
    scroll += sp * dt;
    for (const gt of gates) gt.x -= sp * dt;
    for (const p of portals) p.x -= sp * dt;
    gates = gates.filter((gt) => gt.x > -PW - 20);
    portals = portals.filter((p) => p.x > -40);
    if (gates[gates.length - 1].x <= W + 40 - SPACING) addGate(gates[gates.length - 1].x + SPACING);

    for (const gt of gates) {
      if (!gt.passed && gt.x + PW < UX - HW) {
        gt.passed = true;
        score++;
        sfx.point();
        renderHud();
      }
      const c = center(gt);
      const px = gt.x + PW / 2;
      if (gt.gem && !gt.gem.taken && Math.hypot(px - UX, c + gt.gem.dy - ufo.y) < 24) {
        gt.gem.taken = true;
        gems++;
        score++;
        boom(px, c + gt.gem.dy, "111,231,255", 12, 110);
        say(px, c + gt.gem.dy - 16, "+1", "#6fe7ff");
        sfx.gem();
        renderHud();
      }
      if (gt.shield && !gt.shield.taken && Math.hypot(px - UX, c - ufo.y) < 28) {
        gt.shield.taken = true;
        shieldOn = true;
        say(px, c - 22, "Khiên!", "#6fe7ff");
        sfx.shield();
      }
    }
    for (const p of portals) {
      if (p.used || p.x > UX) continue;
      p.used = true;
      flip = !flip;
      flips++;
      ufo.vy *= 0.3;
      flash = 0.6;
      flashColor = "180,140,255";
      say(W / 2, H * 0.3, flip ? "Đảo trọng lực!" : "Trọng lực trở lại!", "#d9c7ff", 26);
      sfx.portal();
    }

    // ---- va chạm ----
    if (ufo.y < HH + 2 || ufo.y > H - HH - 2) crash(true);
    else
      for (const gt of gates) {
        if (UX + HW <= gt.x || UX - HW >= gt.x + PW) continue;
        const c = center(gt);
        if (ufo.y - HH < c - gt.gap / 2 || ufo.y + HH > c + gt.gap / 2) {
          crash(false);
          break;
        }
      }
    if (thrust > 0) thrust -= dt;
  }

  function crash(edge) {
    if (invuln <= 0 && shieldOn) {
      // khiên vỡ: đỡ cú này, được xuyên qua cổng thêm 1 giây
      shieldOn = false;
      invuln = 1;
      boom(UX, ufo.y, "111,231,255", 26, 190);
      say(UX + 30, ufo.y - 26, "Khiên vỡ!", "#6fe7ff");
      sfx.shieldBreak();
    }
    if (invuln > 0) {
      if (edge) {
        // chạm mép thì bật ngược vào trong
        ufo.y = clamp(ufo.y, HH + 3, H - HH - 3);
        ufo.vy = ufo.y < H / 2 ? 260 : -260;
      }
      return;
    }
    state = "dying";
    dyingLeft = 1;
    ufo.vy = (flip ? 1 : -1) * 200;
    flash = 0.7;
    flashColor = "255,80,110";
    shake = 16;
    boom(UX, ufo.y, "255,160,90", 30, 230);
    sfx.crash();
  }

  // ---------- Vẽ ----------
  function draw() {
    g.setTransform(scale, 0, 0, scale, 0, 0);
    if (shake > 0) g.translate(rand(-shake, shake) / 2, rand(-shake, shake) / 2);
    drawSpace();
    for (const p of portals) drawPortal(p);
    for (const gt of gates) drawGate(gt);
    for (const gt of gates) drawPickups(gt);
    if (state !== "menu") drawUfo();
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
      text(s.text, s.x, s.y, s.size, s.color);
    }
    g.globalAlpha = 1;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    if (state === "play" || state === "dying" || state === "pause") text(String(score), W / 2, 62, 58, "#fff", 7);
    if (state === "ready") {
      text("Chạm hoặc Space để bay", W / 2, H * 0.68, 22, "#d9ffdf");
      g.globalAlpha = 0.6 + 0.4 * Math.sin(clock * 5);
      text("👆", W / 2, H * 0.68 + 42 + Math.sin(clock * 5) * 5, 30, "#fff", 0);
      g.globalAlpha = 1;
    }
    if (flash > 0) {
      g.fillStyle = `rgba(${flashColor},${flash * 0.4})`;
      g.fillRect(0, 0, W, H);
    }
  }
  function text(s, x, y, size, color, stroke = 4) {
    g.font = `800 ${size}px "Baloo 2", "Segoe UI Emoji", sans-serif`;
    if (stroke) {
      g.lineWidth = stroke;
      g.lineJoin = "round";
      g.strokeStyle = "rgba(12,6,35,0.85)";
      g.strokeText(s, x, y);
    }
    g.fillStyle = color;
    g.fillText(s, x, y);
  }

  function drawSpace() {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0d0830");
    bg.addColorStop(0.6, "#1d1250");
    bg.addColorStop(1, "#2e1a5e");
    g.fillStyle = bg;
    g.fillRect(-20, -20, W + 40, H + 40);
    // đang đảo trọng lực: phủ ánh tím
    const k = ufo ? ufo.flipAng / Math.PI : 0;
    if (k > 0) {
      g.fillStyle = `rgba(150,60,200,${0.18 * k})`;
      g.fillRect(-20, -20, W + 40, H + 40);
    }
    // hành tinh có vành đai, trôi rất chậm
    const px = W + 90 - ((scroll * 0.04) % (W + 240));
    const pg = g.createRadialGradient(px - 18, 150, 6, px, 168, 60);
    pg.addColorStop(0, "#ff9ad5");
    pg.addColorStop(0.6, "#a54ab8");
    pg.addColorStop(1, "#4a1d6e");
    g.fillStyle = pg;
    g.beginPath();
    g.arc(px, 168, 58, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(255,200,240,0.45)";
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(px, 168, 92, 16, -0.3, 0, Math.PI * 2);
    g.stroke();
    for (const layer of STARS)
      for (const s of layer) {
        const x = (((s.x - scroll * s.k) % W) + W) % W;
        g.fillStyle = `rgba(255,255,255,${0.45 + 0.4 * Math.sin(clock * 2 + s.tw)})`;
        g.fillRect(x, s.y, s.r * 1.6, s.r * 1.6);
      }
  }

  function drawGate(gt) {
    const c = center(gt);
    const edge = gt.moving ? "#ffb347" : "#7dff8a";
    pillar(gt.x, 0, c - gt.gap / 2, edge, true);
    pillar(gt.x, c + gt.gap / 2, H - c - gt.gap / 2, edge, false);
  }
  function pillar(x, y, h, edge, top) {
    if (h <= 0) return;
    const body = g.createLinearGradient(x, 0, x + PW, 0);
    body.addColorStop(0, "#232c63");
    body.addColorStop(0.45, "#5a6cc2");
    body.addColorStop(1, "#232c63");
    g.fillStyle = body;
    g.fillRect(x + 5, y, PW - 10, h);
    // đèn chấm dọc thân
    g.fillStyle = "rgba(160,180,255,0.35)";
    for (let yy = top ? y + h - 40 : y + 30; top ? yy > y : yy < y + h; yy += top ? -34 : 34) g.fillRect(x + PW / 2 - 2, yy, 4, 10);
    // nắp ở đầu khe + vạch neon
    const capY = top ? y + h - 20 : y;
    const cap = g.createLinearGradient(x, 0, x + PW, 0);
    cap.addColorStop(0, "#2c377a");
    cap.addColorStop(0.5, "#7385dc");
    cap.addColorStop(1, "#2c377a");
    g.fillStyle = cap;
    g.fillRect(x, capY, PW, 20);
    g.shadowColor = edge;
    g.shadowBlur = 14;
    g.fillStyle = edge;
    g.fillRect(x, top ? y + h - 4 : y, PW, 4);
    g.shadowBlur = 0;
  }
  function drawPickups(gt) {
    const c = center(gt);
    const px = gt.x + PW / 2;
    if (gt.gem && !gt.gem.taken) {
      const y = c + gt.gem.dy;
      const s = 1 + 0.1 * Math.sin(clock * 6 + gt.x);
      g.save();
      g.translate(px, y);
      g.scale(s, s);
      g.shadowColor = "#6fe7ff";
      g.shadowBlur = 12;
      g.fillStyle = "#6fe7ff";
      g.beginPath();
      g.moveTo(0, -11);
      g.lineTo(8, -2);
      g.lineTo(0, 11);
      g.lineTo(-8, -2);
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.beginPath();
      g.moveTo(0, -11);
      g.lineTo(4, -2);
      g.lineTo(0, 2);
      g.lineTo(-4, -2);
      g.closePath();
      g.fill();
      g.restore();
    }
    if (gt.shield && !gt.shield.taken) {
      g.strokeStyle = `rgba(111,231,255,${0.6 + 0.3 * Math.sin(clock * 6)})`;
      g.lineWidth = 2;
      g.fillStyle = "rgba(111,231,255,0.15)";
      g.beginPath();
      g.arc(px, c, 17, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      text("🛡️", px, c + 1, 18, "#fff", 0);
    }
  }
  function drawPortal(p) {
    // cổng tím chạy hết chiều cao: không né được, bay qua là đảo trọng lực
    const a = p.used ? 0.25 : 0.9;
    const gr = g.createLinearGradient(0, 0, 0, H);
    for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, i % 2 ? `rgba(77,232,255,${a})` : `rgba(180,140,255,${a})`);
    g.save();
    g.shadowColor = "#b48cff";
    g.shadowBlur = p.used ? 0 : 20;
    g.fillStyle = gr;
    g.fillRect(p.x - 5, 0, 10, H);
    g.restore();
    if (p.used) return;
    for (let i = 0; i < 6; i++) {
      const y = (((clock * 120 + i * 100) % H) + H) % H;
      g.fillStyle = "rgba(255,255,255,0.8)";
      g.beginPath();
      g.arc(p.x + Math.sin(clock * 5 + i) * 6, flip ? H - y : y, 2, 0, Math.PI * 2);
      g.fill();
    }
    text("⇅", p.x, H / 2, 26, "#fff");
  }

  function drawUfo() {
    const blink = invuln > 0 && state === "play" && Math.floor(clock * 14) % 2 === 0;
    const tilt = clamp(ufo.vy / MAX_FALL, -1, 1) * 0.3;
    g.save();
    g.translate(UX, ufo.y);
    g.rotate(ufo.flipAng + tilt + ufo.spin);
    g.globalAlpha = blink ? 0.35 : 1;
    // luồng sáng dưới đáy, mạnh lên khi vừa bốc
    g.fillStyle = `rgba(125,255,138,${0.22 + Math.max(0, thrust) * 3})`;
    g.beginPath();
    g.ellipse(0, 12, 11 + Math.max(0, thrust) * 30, 4, 0, 0, Math.PI * 2);
    g.fill();
    // vòm kính + người ngoài hành tinh
    const dome = g.createRadialGradient(-4, -12, 1, 0, -6, 14);
    dome.addColorStop(0, "rgba(230,255,255,0.95)");
    dome.addColorStop(0.5, "rgba(130,220,255,0.5)");
    dome.addColorStop(1, "rgba(90,160,255,0.35)");
    g.fillStyle = "#7dff8a";
    g.beginPath();
    g.arc(0, -6, 5.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#10241a";
    g.beginPath();
    g.ellipse(-2.2, -7, 1.4, 2.1, 0, 0, Math.PI * 2);
    g.ellipse(2.2, -7, 1.4, 2.1, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = dome;
    g.beginPath();
    g.ellipse(0, -4, 12.5, 11.5, 0, Math.PI, 0);
    g.fill();
    // đĩa bay
    const body = g.createLinearGradient(0, -4, 0, 10);
    body.addColorStop(0, "#f1f4ff");
    body.addColorStop(0.5, "#98a6e0");
    body.addColorStop(1, "#4b5a9a");
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 3, 23, 7.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#38457f";
    g.beginPath();
    g.ellipse(0, 5.5, 20, 2.6, 0, 0, Math.PI * 2);
    g.fill();
    const colors = ["#ffd23f", "#ff4fa3", "#4de8ff"];
    for (let i = 0; i < 5; i++) {
      g.fillStyle = colors[(i + Math.floor(clock * 6)) % 3];
      g.beginPath();
      g.arc(-15 + i * 7.5, 5.3, 1.8, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    if (shieldOn && state !== "dying") {
      g.strokeStyle = `rgba(111,231,255,${0.55 + 0.3 * Math.sin(clock * 7)})`;
      g.lineWidth = 2.5;
      g.fillStyle = "rgba(111,231,255,0.08)";
      g.beginPath();
      g.arc(UX, ufo.y, 30, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }

  // ---------- Vòng lặp ----------
  let last = 0;
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state !== "pause") {
      clock += dt;
      if (state === "ready" || state === "play" || state === "dying") {
        acc += dt;
        while (acc >= STEP) {
          step(STEP);
          acc -= STEP;
          if (state === "over") break;
        }
      } else {
        acc = 0;
        scroll += 25 * dt; // màn chọn / kết quả: sao vẫn trôi nhẹ
      }
      for (const p of parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      parts = parts.filter((p) => p.life > 0);
      for (const s of texts) {
        s.y -= 36 * dt;
        s.life -= dt;
      }
      texts = texts.filter((s) => s.life > 0);
      flash = Math.max(0, flash - dt * 1.8);
      shake = Math.max(0, shake - dt * 40);
    }
    draw();
    requestAnimationFrame(frame);
  }

  // ---------- HUD & hộp thoại ----------
  function renderHud() {
    $("#stScore").textContent = score;
    $("#stGems").textContent = gems;
    $("#stBest").textContent = prefs.best[prefs.diff];
  }
  const refreshSound = () => ($("#btnSound").textContent = prefs.muted ? "🔇 Âm thanh" : "🔊 Âm thanh");
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
          `<button data-diff="${k}" class="${k === prefs.diff ? "on" : ""}">${d.name}<small>${d.note}</small><small>kỷ lục ${prefs.best[k]}</small></button>`,
      )
      .join("");
    card(
      "🛸",
      "Flappy UFO",
      `<div class="seg">${seg}</div>
      <ul class="legend">
        <li><span><i class="gate"></i></span>Bay qua khe của cổng năng lượng<em>+1 điểm</em></li>
        <li><span><i class="gate moving"></i></span>Cổng viền cam: khe trượt lên xuống<em>từ điểm ${D.move}</em></li>
        <li><span><i class="portal"></i></span>Cổng tím: đảo trọng lực, UFO bị hút lên trần<em>từ điểm ${D.portal}</em></li>
        <li><span>💎</span>Pha lê +1 điểm · 🛡️ khiên đỡ 1 lần va chạm</li>
        <li><span>🏅</span>🥉 10 · 🥈 25 · 🥇 50 · 🏆 100 điểm</li>
      </ul>
      <p class="tip">Chạm màn hình, bấm chuột, <kbd>Space</kbd> hoặc <kbd>↑</kbd> để UFO bốc lên.
      Khi trọng lực bị đảo, mỗi lần chạm sẽ đẩy UFO <b>xuống</b>.</p>`,
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
    state = "ready";
  }
  function endGame() {
    state = "over";
    const record = score > prefs.best[prefs.diff];
    if (record) {
      prefs.best[prefs.diff] = score;
      persist();
    }
    renderHud();
    if (record && score > 0) sfx.record();
    else sfx.over();
    const medal = MEDALS.find(([min]) => score >= min);
    const next = [...MEDALS].reverse().find(([min]) => score < min);
    card(
      record && score > 0 ? "🏆" : "💥",
      record && score > 0 ? "Kỷ lục mới!" : "UFO va chạm!",
      `<div class="medal">${medal ? medal[1] : "🛸"}</div>
      <div class="final">${score}</div>
      <div class="final-sub">${medal ? `Huy chương ${medal[2]}` : "Chưa có huy chương"}${next ? ` · cần ${next[0]} điểm để có ${next[2]}` : ""}</div>
      <div class="results">
        <div><small>Cổng vượt qua</small><b>${score - gems}</b></div>
        <div><small>Pha lê</small><b>${gems}</b></div>
        <div><small>Lần đảo trọng lực</small><b>${flips}</b></div>
        <div><small>Kỷ lục (${D.name})</small><b>${prefs.best[prefs.diff]}</b></div>
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
    card("⏸", "Tạm dừng", `<p>Điểm: <b>${score}</b><br>Bấm <b>P</b> hoặc <b>Esc</b> để chơi tiếp.</p>`, [
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
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "arrowup" || k === "w") {
      if (state !== "ready" && state !== "play") return; // Space còn để bấm nút trong hộp thoại
      e.preventDefault();
      if (!e.repeat) flap();
    } else if ((k === "p" || k === "escape") && !e.repeat) {
      if (state === "pause") resumeGame();
      else pauseGame();
    }
  });
  cv.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    flap();
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
