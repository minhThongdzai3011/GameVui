// Breakout — theo bản Breakout của chilligamez.com: sân 800×600 nền xanh đen,
// 8 cột × 5 hàng gạch (đỏ cam, cam hồng, vàng, xanh lá, xanh dương), thanh đỡ
// trắng, bóng đỏ cam; đếm ngược 3-2-1; mỗi viên 10 điểm; rơi bóng là thua;
// phá hết gạch thì lên cấp: nhanh hơn, nhiều hàng gạch hơn.
(() => {
  "use strict";

  const W = 800;
  const H = 600;
  const PAD_W = 132;
  const PAD_H = 20;
  const PAD_Y = 565;
  const BALL_R = 12;
  const COLS = 8;
  const BRICK_TOP = 50;
  const BRICK_H = 30;
  const GAP = 10;
  const SIDE = 18;
  const BRICK_W = (W - SIDE * 2 - GAP * (COLS - 1)) / COLS;
  const ROW_COLORS = ["#f05023", "#ff7a52", "#fbbf24", "#4ade80", "#38bdf8", "#a78bfa", "#f472b6", "#2dd4bf"];
  const BASE_SPEED = 400; // px/giây ở cấp 1
  const KEY_SPEED = 760;
  const STEP = 1 / 240; // bước vật lý nhỏ để bóng không xuyên gạch

  const $ = (id) => document.getElementById(id);
  const canvas = $("game");
  const ctx = canvas.getContext("2d");
  const side = $("side");
  const overlay = $("overlay");
  const toast = $("toast");

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
  let muted = store.get("gamevui-breakout-muted") === "1";
  function tone(freq, dur, type = "square", vol = 0.06, delay = 0, slide = 1) {
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
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  const sfx = {
    paddle: () => tone(330, 0.08, "square", 0.06),
    wall: () => tone(220, 0.04, "square", 0.035),
    brick: (row) => tone(880 - row * 70, 0.07, "square", 0.05),
    tick: () => tone(660, 0.09, "triangle", 0.12),
    go: () => tone(990, 0.18, "triangle", 0.12),
    drop: () => tone(392, 0.6, "triangle", 0.14, 0, 0.4),
    level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "triangle", 0.12, i * 0.09)),
  };
  const soundBtn = $("btnSound");
  function refreshSound() {
    soundBtn.textContent = muted ? "🔇" : "🔊";
    soundBtn.setAttribute("aria-label", muted ? "Bật âm thanh" : "Tắt âm thanh");
  }
  soundBtn.addEventListener("click", () => {
    muted = !muted;
    store.set("gamevui-breakout-muted", muted ? "1" : "0");
    refreshSound();
    soundBtn.blur();
  });
  refreshSound();

  // ---------- Trạng thái ----------
  // state: menu | count | play | paused | over
  let state = "menu";
  let level = 1;
  let score = 0;
  let best = Number(store.get("gamevui-breakout-best")) || 0;
  let bricks = [];
  let paddleX = W / 2 - PAD_W / 2;
  let targetX = null; // vị trí chuột / ngón tay
  let keys = { left: false, right: false };
  let ball = { x: W / 2, y: PAD_Y - BALL_R, vx: 0, vy: 0 };
  let countStart = 0;
  let lastCount = 0;
  let flashes = []; // hiệu ứng gạch vỡ

  const speedFor = (lv) => BASE_SPEED * (1 + 0.1 * (lv - 1));

  function buildBricks() {
    const rows = Math.min(ROW_COLORS.length, 5 + Math.floor((level - 1) / 2));
    bricks = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < COLS; c++)
        bricks.push({
          x: SIDE + c * (BRICK_W + GAP),
          y: BRICK_TOP + r * (BRICK_H + GAP),
          row: r,
          alive: true,
        });
  }

  function resetBall() {
    paddleX = W / 2 - PAD_W / 2;
    ball = { x: W / 2, y: PAD_Y - BALL_R - 14, vx: 0, vy: 0 };
  }

  function setSide(mode) {
    side.classList.toggle("live", mode === "live");
    side.classList.toggle("over", mode === "over");
    $("statusPill").textContent = mode === "live" ? "LIVE" : mode === "over" ? "ROUND OVER" : "STARTING";
    $("sideLabel").textContent = mode === "starting" ? "Sẵn sàng!" : "ĐIỂM";
    $("sideScore").hidden = mode === "starting";
    $("sideLevel").hidden = mode === "starting";
    $("score").textContent = score;
    $("level").textContent = level;
  }

  function showCard({ pill, title, text, final, button }) {
    $("ovPill").textContent = pill;
    $("ovTitle").textContent = title;
    $("ovText").textContent = text;
    $("ovFinal").hidden = final == null;
    if (final != null) {
      $("ovScore").textContent = final;
      $("ovBest").textContent = `Kỷ lục: ${best}`;
    }
    $("ovBtn").textContent = button;
    overlay.classList.remove("hide");
  }
  const hideCard = () => overlay.classList.add("hide");

  function startCountdown() {
    state = "count";
    countStart = performance.now();
    lastCount = 0;
    resetBall();
    setSide("starting");
  }

  function newGame() {
    level = 1;
    score = 0;
    buildBricks();
    hideCard();
    startCountdown();
  }

  function launch() {
    const a = ((Math.random() * 2 - 1) * Math.PI) / 6; // lệch tối đa 30°
    const s = speedFor(level);
    ball.vx = s * Math.sin(a);
    ball.vy = -s * Math.cos(a);
    state = "play";
    setSide("live");
  }

  function praise(s) {
    if (s < 30) return "Cố lên!";
    if (s < 120) return "Khá lắm!";
    if (s < 300) return "Tuyệt vời!";
    return "Siêu đỉnh!";
  }

  function lose() {
    state = "over";
    sfx.drop();
    if (score > best) {
      best = score;
      store.set("gamevui-breakout-best", String(best));
    }
    setSide("over");
    $("toastScore").textContent = score;
    $("toastPraise").textContent = praise(score);
    toast.hidden = false;
    setTimeout(() => {
      toast.hidden = true;
      showCard({
        pill: "HẾT LƯỢT",
        title: "Bóng rơi rồi!",
        text: `Bạn đã tới Cấp ${level}`,
        final: score,
        button: "Chơi lại",
      });
    }, 1800);
  }

  function levelUp() {
    sfx.level();
    level++;
    buildBricks();
    startCountdown();
  }

  function pause() {
    if (state !== "play" && state !== "count") return;
    state = "paused";
    showCard({ pill: "TẠM DỪNG", title: "Tạm dừng", text: "Nghỉ chút rồi chơi tiếp nhé!", button: "Tiếp tục" });
  }

  $("ovBtn").addEventListener("click", () => {
    if (state === "paused") {
      hideCard();
      startCountdownResume();
    } else newGame();
  });

  // Tiếp tục sau tạm dừng: đếm ngược lại nhưng giữ nguyên bóng
  let resumeVel = null;
  function startCountdownResume() {
    // tạm dừng khi bóng chưa bay thì chỉ cần đếm ngược lại như bình thường
    resumeVel = ball.vx || ball.vy ? { vx: ball.vx, vy: ball.vy } : null;
    state = "count";
    countStart = performance.now();
    lastCount = 0;
    setSide("starting");
  }

  // ---------- Vật lý ----------
  function circleRect(cx, cy, r, x, y, w, h) {
    const nx = Math.max(x, Math.min(cx, x + w));
    const ny = Math.max(y, Math.min(cy, y + h));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy <= r * r;
  }

  function physics(dt) {
    // Thanh đỡ
    if (keys.left) paddleX -= KEY_SPEED * dt;
    if (keys.right) paddleX += KEY_SPEED * dt;
    if (targetX != null && !keys.left && !keys.right) paddleX = targetX - PAD_W / 2;
    paddleX = Math.max(0, Math.min(W - PAD_W, paddleX));

    if (state !== "play") {
      if (state === "count" && !resumeVel) ball.x = paddleX + PAD_W / 2;
      return;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Tường
    if (ball.x < BALL_R) {
      ball.x = BALL_R;
      ball.vx = Math.abs(ball.vx);
      sfx.wall();
    } else if (ball.x > W - BALL_R) {
      ball.x = W - BALL_R;
      ball.vx = -Math.abs(ball.vx);
      sfx.wall();
    }
    if (ball.y < BALL_R) {
      ball.y = BALL_R;
      ball.vy = Math.abs(ball.vy);
      sfx.wall();
    }

    // Thanh đỡ: góc bật phụ thuộc vị trí chạm (mép thanh → góc nghiêng 60°)
    if (ball.vy > 0 && circleRect(ball.x, ball.y, BALL_R, paddleX, PAD_Y, PAD_W, PAD_H) && ball.y < PAD_Y + PAD_H / 2) {
      const rel = Math.max(-1, Math.min(1, (ball.x - (paddleX + PAD_W / 2)) / (PAD_W / 2)));
      const a = (rel * Math.PI) / 3;
      const s = Math.hypot(ball.vx, ball.vy);
      ball.vx = s * Math.sin(a);
      ball.vy = -s * Math.cos(a);
      ball.y = PAD_Y - BALL_R;
      sfx.paddle();
    }

    // Gạch (mỗi bước chỉ xử lý 1 viên)
    for (const b of bricks) {
      if (!b.alive || !circleRect(ball.x, ball.y, BALL_R, b.x, b.y, BRICK_W, BRICK_H)) continue;
      b.alive = false;
      score += 10;
      $("score").textContent = score;
      flashes.push({ x: b.x, y: b.y, row: b.row, t: 0 });
      sfx.brick(b.row);
      // Bật theo cạnh chạm: bóng nằm ngoài khoảng ngang của gạch → chạm cạnh bên
      const outsideX = ball.x < b.x || ball.x > b.x + BRICK_W;
      const outsideY = ball.y < b.y || ball.y > b.y + BRICK_H;
      if (outsideX && !outsideY) ball.vx = -ball.vx;
      else if (outsideY && !outsideX) ball.vy = -ball.vy;
      else {
        ball.vx = -ball.vx;
        ball.vy = -ball.vy;
      }
      break;
    }
    if (bricks.every((b) => !b.alive)) return levelUp();

    if (ball.y - BALL_R > H) lose();
  }

  // ---------- Vẽ ----------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(now) {
    const dim = state === "count" || state === "menu" || state === "paused" || state === "over";
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = dim ? 0.6 : 1;
    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = ROW_COLORS[b.row];
      ctx.fillRect(b.x, b.y, BRICK_W, BRICK_H);
    }
    // gạch vỡ: loé sáng rồi mờ dần
    flashes = flashes.filter((f) => (f.t += 1 / 60) < 0.25);
    for (const f of flashes) {
      const k = f.t / 0.25;
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.fillStyle = ROW_COLORS[f.row];
      const grow = k * 8;
      ctx.fillRect(f.x - grow, f.y - grow, BRICK_W + grow * 2, BRICK_H + grow * 2);
    }
    ctx.globalAlpha = dim ? 0.6 : 1;

    ctx.fillStyle = dim ? "#a5a8b4" : "#f8fafc";
    ctx.fillRect(Math.round(paddleX), PAD_Y, PAD_W, PAD_H);

    if (state !== "over" || ball.y - BALL_R < H) {
      ctx.fillStyle = "#f05023";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (state === "count") {
      const n = 3 - Math.floor((now - countStart) / 700);
      if (n > 0) {
        if (lastCount !== n) {
          lastCount = n;
          sfx.tick();
        }
        const t = ((now - countStart) % 700) / 700;
        ctx.save();
        ctx.translate(W / 2, 290);
        ctx.scale(1.25 - t * 0.25, 1.25 - t * 0.25);
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "rgba(240,80,35,.55)";
        ctx.shadowBlur = 30;
        ctx.font = "800 110px 'Plus Jakarta Sans', Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(n), 0, 0);
        ctx.restore();
        if (level > 1 || resumeVel) {
          ctx.fillStyle = "#cbd5e1";
          ctx.font = "800 26px 'Plus Jakarta Sans', Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(resumeVel ? "Tiếp tục…" : `Cấp ${level}`, W / 2, 200);
        }
      } else {
        sfx.go();
        if (resumeVel) {
          ball.vx = resumeVel.vx;
          ball.vy = resumeVel.vy;
          resumeVel = null;
          state = "play";
          setSide("live");
        } else launch();
      }
    }
  }

  // ---------- Điều khiển ----------
  function pointerToX(e) {
    const r = canvas.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * W;
  }
  canvas.addEventListener("pointermove", (e) => {
    targetX = pointerToX(e);
  });
  canvas.addEventListener("pointerdown", (e) => {
    targetX = pointerToX(e);
    canvas.setPointerCapture?.(e.pointerId);
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") {
      keys.left = true;
      targetX = null;
      e.preventDefault();
    } else if (e.code === "ArrowRight" || e.code === "KeyD") {
      keys.right = true;
      targetX = null;
      e.preventDefault();
    } else if (e.code === "KeyP" || e.code === "Escape") {
      if (state === "paused") $("ovBtn").click();
      else pause();
    } else if ((e.code === "Enter" || e.code === "Space") && !overlay.classList.contains("hide")) {
      e.preventDefault();
      $("ovBtn").click();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  window.addEventListener("blur", pause);

  // ---------- Canvas sắc nét theo màn hình ----------
  function fit() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(r.width * dpr);
    const h = Math.round(r.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(w / W, 0, 0, h / H, 0, 0);
  }
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(canvas);
  window.addEventListener("resize", fit);
  fit();

  // ---------- Vòng lặp ----------
  let last = performance.now();
  let acc = 0;
  function loop(now) {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= STEP) {
      physics(STEP);
      acc -= STEP;
    }
    draw(now);
    requestAnimationFrame(loop);
  }

  buildBricks();
  resetBall();
  setSide("starting");
  showCard({
    pill: "SẴN SÀNG",
    title: "Breakout!",
    text: "Phá hết gạch để lên cấp tiếp theo!",
    button: "Bắt đầu",
  });
  requestAnimationFrame(loop);
})();
