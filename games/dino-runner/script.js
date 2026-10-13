// Dino Runner — tái hiện cơ chế của game khủng long offline trên Chrome.
// Toàn bộ số liệu vật lý / sinh chướng ngại / tính điểm / chế độ đêm theo bản gốc;
// hình ảnh được vẽ mới hoàn toàn bằng canvas.
(() => {
  "use strict";

  // ---------- Cấu hình (giá trị theo game gốc) ----------
  const W = 600;
  const H = 150;
  const FPS = 60;
  const MS_PER_FRAME = 1000 / FPS;

  const CFG = {
    ACCELERATION: 0.001,
    BG_CLOUD_SPEED: 0.2,
    BOTTOM_PAD: 10,
    CLEAR_TIME: 3000,
    CLOUD_FREQUENCY: 0.5,
    GAMEOVER_CLEAR_TIME: 750,
    GAP_COEFFICIENT: 0.6,
    MAX_GAP_COEFFICIENT: 1.5,
    INVERT_FADE_DURATION: 12000,
    INVERT_DISTANCE: 700,
    MAX_BLINK_COUNT: 3,
    MAX_CLOUDS: 6,
    MAX_OBSTACLE_LENGTH: 3,
    MAX_OBSTACLE_DUPLICATION: 2,
    MAX_SPEED: 13,
    SPEED: 6,
    INTRO_REVEAL: 400,
  };

  const TREX = {
    WIDTH: 44,
    HEIGHT: 47,
    WIDTH_DUCK: 59,
    GRAVITY: 0.6,
    INITIAL_JUMP_VELOCITY: -10,
    DROP_VELOCITY: -5,
    MAX_JUMP_HEIGHT: 30,
    MIN_JUMP_HEIGHT: 30,
    SPEED_DROP_COEFFICIENT: 3,
    START_X_POS: 50,
    INTRO_DURATION: 1500,
    BLINK_TIMING: 7000,
  };

  const ANIM = {
    WAITING: { frames: 2, ms: 1000 / 3 },
    RUNNING: { frames: 2, ms: 1000 / 12 },
    CRASHED: { frames: 1, ms: 1000 / 60 },
    JUMPING: { frames: 1, ms: 1000 / 60 },
    DUCKING: { frames: 2, ms: 1000 / 8 },
  };

  const box = (x, y, w, h) => ({ x, y, w, h });

  const TREX_BOXES = {
    DUCKING: [box(1, 18, 55, 25)],
    RUNNING: [
      box(22, 0, 17, 16),
      box(1, 18, 30, 9),
      box(10, 35, 14, 8),
      box(1, 24, 29, 5),
      box(5, 30, 21, 4),
      box(9, 34, 15, 4),
    ],
  };

  const OBSTACLE_TYPES = [
    {
      type: "CACTUS_SMALL",
      width: 17,
      height: 35,
      yPos: 105,
      multipleSpeed: 4,
      minGap: 120,
      minSpeed: 0,
      boxes: [box(0, 7, 5, 27), box(4, 0, 6, 34), box(10, 4, 7, 14)],
    },
    {
      type: "CACTUS_LARGE",
      width: 25,
      height: 50,
      yPos: 90,
      multipleSpeed: 7,
      minGap: 120,
      minSpeed: 0,
      boxes: [box(0, 12, 7, 38), box(8, 0, 7, 49), box(13, 10, 10, 38)],
    },
    {
      type: "PTERODACTYL",
      width: 46,
      height: 40,
      yPos: [100, 75, 50],
      multipleSpeed: 999,
      minSpeed: 8.5,
      minGap: 150,
      boxes: [
        box(15, 15, 16, 5),
        box(18, 21, 24, 6),
        box(2, 14, 4, 3),
        box(6, 10, 4, 7),
        box(10, 8, 6, 9),
      ],
      numFrames: 2,
      frameRate: 1000 / 6,
      speedOffset: 0.8,
    },
  ];

  const CLOUD = { WIDTH: 46, HEIGHT: 14, MIN_GAP: 100, MAX_GAP: 400, MIN_SKY: 71, MAX_SKY: 30 };
  const NIGHT = { FADE_SPEED: 0.035, MOON_SPEED: 0.25, NUM_STARS: 2, STAR_SPEED: 0.3, STAR_MAX_Y: 70, WIDTH: 20 };
  const METER = { COEFFICIENT: 0.025, MAX_UNITS: 5, ACHIEVEMENT: 100, FLASH_DURATION: 1000 / 4, FLASH_ITERATIONS: 3 };

  const INK = "#535353";
  const PAPER = "#ffffff";
  const HI_KEY = "gamevui-dino-hi";

  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  // ---------- Canvas ----------
  const stage = document.getElementById("stage");
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const DPR = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  // ---------- Âm thanh (tổng hợp bằng WebAudio) ----------
  const Sound = {
    ac: null,
    unlock() {
      try {
        if (!this.ac) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) this.ac = new AC();
        }
        if (this.ac && this.ac.state === "suspended") this.ac.resume();
      } catch (e) {}
    },
    tone(freq, start, dur, vol = 0.05, endFreq) {
      const ac = this.ac;
      if (!ac) return;
      const t = ac.currentTime + start;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(freq, t);
      if (endFreq) o.frequency.linearRampToValueAtTime(endFreq, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    jump() { this.tone(520, 0, 0.08, 0.04, 760); },
    hit() { this.tone(180, 0, 0.1, 0.06); this.tone(110, 0.09, 0.22, 0.06); },
    score() { this.tone(880, 0, 0.07, 0.04); this.tone(1320, 0.08, 0.12, 0.04); },
  };

  // ---------- Hình ảnh (tự vẽ, cache thành sprite) ----------
  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.ceil(w * DPR);
    c.height = Math.ceil(h * DPR);
    const g = c.getContext("2d");
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    return [c, g];
  }

  const spriteCache = new Map();
  function sprite(key, w, h, paint) {
    let s = spriteCache.get(key);
    if (!s) {
      const [c, g] = makeCanvas(w, h);
      paint(g);
      s = { c, w, h };
      spriteCache.set(key, s);
    }
    return s;
  }
  function drawSprite(s, x, y) {
    ctx.drawImage(s.c, Math.round(x), Math.round(y), s.w, s.h);
  }

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    g.fill();
  }
  function poly(g, pts) {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fill();
  }

  // Bảng màu nhân vật (tự thiết kế): khủng long con màu ngọc, gai cam.
  const C = {
    body: "#3fa58a",
    dark: "#2b7a66",
    belly: "#f6e7c1",
    spike: "#ff8a5b",
    pupil: "#1d2433",
    blush: "#ff9e9e",
    cactus: "#5b9e4c",
    cactusDark: "#467d3a",
    bird: "#7d62c9",
    birdDark: "#5c449f",
    beak: "#ffb347",
  };
  function circle(g, x, y, r) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  function oval(g, x, y, rx, ry) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  }
  function paintEye(g, x, y, eye) {
    if (eye === "dead") {
      g.strokeStyle = C.pupil;
      g.lineWidth = 1.8;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(x - 3, y - 3);
      g.lineTo(x + 3, y + 3);
      g.moveTo(x + 3, y - 3);
      g.lineTo(x - 3, y + 3);
      g.stroke();
    } else if (eye === "closed") {
      g.strokeStyle = C.pupil;
      g.lineWidth = 1.6;
      g.lineCap = "round";
      g.beginPath();
      g.arc(x, y - 1, 3, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    } else {
      g.fillStyle = "#fff";
      circle(g, x, y, 4.2);
      g.fillStyle = C.pupil;
      circle(g, x + 1, y + 0.5, 2.4);
      g.fillStyle = "#fff";
      circle(g, x + 1.8, y - 0.6, 0.9);
    }
  }

  // Khủng long con đứng / chạy / nhảy / va chạm — khung 44x47.
  function paintDino(g, legs, eye) {
    const leg = (x, up) => {
      g.fillStyle = C.dark;
      if (up) {
        rr(g, x, 34, 7, 7, 3);
        rr(g, x, 38, 10, 4, 2);
      } else {
        rr(g, x, 34, 7, 11, 3);
        rr(g, x, 43, 10, 4, 2);
      }
    };
    leg(9, legs === "backUp");
    g.fillStyle = C.spike;
    poly(g, [5, 23, 8, 15, 12, 21]);
    poly(g, [10, 20, 14, 12, 18, 19]);
    poly(g, [17, 17, 21, 9, 24, 17]);
    poly(g, [24, 6, 27, -1, 31, 4]);
    g.fillStyle = C.body;
    poly(g, [8, 26, 0, 20, 2, 27, 7, 35]); // đuôi
    oval(g, 18, 29, 13, 10); // thân
    circle(g, 31, 12, 12); // đầu
    g.fillStyle = C.belly;
    oval(g, 21, 31, 7, 6);
    g.fillStyle = C.body;
    rr(g, 27, 26, 8, 4, 2); // tay
    leg(21, legs === "frontUp");
    g.fillStyle = C.blush;
    circle(g, 37, 17, 2.2);
    paintEye(g, 34, 9, eye);
    g.fillStyle = C.pupil;
    if (eye === "dead") {
      oval(g, 39, 18, 2.5, 3);
    } else {
      g.strokeStyle = C.pupil;
      g.lineWidth = 1.2;
      g.lineCap = "round";
      g.beginPath();
      g.arc(38, 16, 3, 0.2 * Math.PI, 0.8 * Math.PI);
      g.stroke();
    }
  }

  // Khủng long con cúi — khung 59x47.
  function paintDinoDuck(g, frame) {
    const leg = (x, up) => {
      g.fillStyle = C.dark;
      if (up) {
        rr(g, x, 38, 7, 5, 3);
        rr(g, x, 40, 10, 4, 2);
      } else {
        rr(g, x, 38, 7, 8, 3);
        rr(g, x, 43, 10, 4, 2);
      }
    };
    leg(10, frame === 1);
    g.fillStyle = C.spike;
    poly(g, [9, 29, 12, 21, 16, 27]);
    poly(g, [16, 27, 20, 19, 24, 26]);
    poly(g, [24, 26, 28, 18, 32, 25]);
    g.fillStyle = C.body;
    poly(g, [8, 31, 0, 27, 2, 34, 8, 39]);
    oval(g, 23, 34, 18, 8);
    circle(g, 46, 31, 10);
    g.fillStyle = C.belly;
    oval(g, 26, 37, 9, 4);
    leg(30, frame === 0);
    g.fillStyle = C.blush;
    circle(g, 51, 35, 2);
    paintEye(g, 49, 28, "open");
  }

  // Chim bay — khung 46x40, 2 khung cánh.
  function paintBird(g, frame) {
    g.fillStyle = C.birdDark;
    if (frame === 0) poly(g, [20, 18, 27, 1, 32, 0, 35, 19]);
    g.fillStyle = C.bird;
    oval(g, 29, 21, 13, 5.5);
    poly(g, [40, 19, 46, 13, 44, 26]);
    poly(g, [12, 10, 21, 16, 19, 23, 10, 16]);
    circle(g, 12, 13, 5.5);
    g.fillStyle = C.spike;
    poly(g, [12, 9, 23, 4, 17, 12]);
    g.fillStyle = C.beak;
    poly(g, [8, 11, 0, 15, 8, 17]);
    g.fillStyle = C.birdDark;
    if (frame === 1) poly(g, [20, 22, 28, 39, 33, 39, 36, 22]);
    g.fillStyle = "#fff";
    circle(g, 11.5, 12, 1.8);
    g.fillStyle = C.pupil;
    circle(g, 11, 12, 0.9);
  }

  // Một cây xương rồng; variant thay đổi vị trí cành.
  function paintCactus(g, ox, large, variant) {
    const h = large ? 50 : 35;
    const sx = large ? 9 : 5;
    const sw = large ? 7 : 6;
    const aw = large ? 5 : 3;
    const v1 = (variant % 3) - 1;
    const v2 = (Math.floor(variant / 3) % 3) - 1;
    g.fillStyle = C.cactus;
    rr(g, ox + sx, 0, sw, h, sw / 2);
    g.fillRect(ox + sx, h - 4, sw, 4);
    if (large) {
      rr(g, ox + 1, 12 + v1 * 3, aw, 18, 2.5);
      g.fillRect(ox + 1, 26 + v1 * 3, sx, aw);
      rr(g, ox + 18, 10 + v2 * 3, aw, 16, 2.5);
      g.fillRect(ox + sx + sw - 1, 22 + v2 * 3, 18 + aw - sx - sw + 1, aw);
    } else {
      rr(g, ox, 8 + v1 * 2, aw, 12, 1.5);
      g.fillRect(ox, 18 + v1 * 2, sx, aw);
      rr(g, ox + 14, 5 + v2 * 2, aw, 11, 1.5);
      g.fillRect(ox + sx + sw - 1, 13 + v2 * 2, 14 + aw - sx - sw + 1, aw);
    }
    g.fillStyle = C.cactusDark;
    g.fillRect(ox + sx + Math.floor(sw / 2), 3, 1, h - 7);
    if (variant % 2 === 0) {
      g.fillStyle = C.blush;
      circle(g, ox + sx + sw / 2, 2, 2);
    }
  }

  function paintCloud(g) {
    g.fillStyle = "#dcdcdc";
    g.beginPath();
    g.arc(13, 9, 5, 0, Math.PI * 2);
    g.arc(23, 6, 6, 0, Math.PI * 2);
    g.arc(33, 8, 5, 0, Math.PI * 2);
    g.fill();
    rr(g, 6, 8, 35, 6, 3);
  }

  function paintStar(g) {
    g.fillStyle = INK;
    g.fillRect(4, 0, 1, 9);
    g.fillRect(0, 4, 9, 1);
    g.fillRect(3, 3, 3, 3);
  }

  const MOON_PHASES = [4, 7, 11, null, -11, -7, -4];
  function paintMoon(g, phase) {
    g.fillStyle = "#6a6a6a";
    g.beginPath();
    g.arc(10, 10, 9, 0, Math.PI * 2);
    g.fill();
    const dx = MOON_PHASES[phase];
    if (dx !== null) {
      g.globalCompositeOperation = "destination-out";
      g.beginPath();
      g.arc(10 + dx, 10, 9, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = "source-over";
    }
  }

  function paintRestart(g) {
    g.strokeStyle = INK;
    g.fillStyle = INK;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(18, 17, 10, -0.35 * Math.PI, 1.45 * Math.PI);
    g.stroke();
    poly(g, [17, 0, 27, 6, 17, 13]);
  }

  // Mặt đất: 2 kiểu (phẳng / gồ ghề), mỗi đoạn rộng 600.
  function makeGround(bumpy) {
    const [c, g] = makeCanvas(W, 24);
    g.fillStyle = INK;
    g.fillRect(0, 11, W, 1);
    if (bumpy) {
      for (let x = rand(20, 80); x < W - 30; x += rand(90, 220)) {
        const w = rand(10, 26);
        g.fillStyle = PAPER;
        g.fillRect(x, 11, w, 1);
        g.fillStyle = INK;
        g.beginPath();
        g.moveTo(x, 12);
        g.quadraticCurveTo(x + w / 2, 6, x + w, 12);
        g.lineTo(x + w - 1, 12);
        g.quadraticCurveTo(x + w / 2, 8, x + 1, 12);
        g.closePath();
        g.fill();
      }
    }
    g.fillStyle = INK;
    for (let i = 0; i < 46; i++) {
      g.fillRect(rand(0, W - 3), rand(14, 21), rand(1, 3), 1);
    }
    return c;
  }

  // ---------- Khủng long ----------
  class Trex {
    constructor() {
      this.groundYPos = H - TREX.HEIGHT - CFG.BOTTOM_PAD;
      this.minJumpHeight = this.groundYPos - TREX.MIN_JUMP_HEIGHT;
      this.xPos = 0;
      this.yPos = this.groundYPos;
      this.jumpVelocity = 0;
      this.jumping = false;
      this.ducking = false;
      this.speedDrop = false;
      this.reachedMinHeight = false;
      this.jumpCount = 0;
      this.playingIntro = false;
      this.timer = 0;
      this.blinkCount = 0;
      this.setStatus("WAITING");
    }

    setStatus(status) {
      this.status = status;
      this.currentFrame = 0;
      this.msPerFrame = ANIM[status].ms;
      this.numFrames = ANIM[status].frames;
      if (status === "WAITING") {
        this.animStartTime = performance.now();
        this.setBlinkDelay();
      }
    }

    update(deltaTime, status) {
      this.timer += deltaTime;
      if (status) this.setStatus(status);

      if (this.playingIntro && this.xPos < TREX.START_X_POS) {
        this.xPos += Math.round((TREX.START_X_POS / TREX.INTRO_DURATION) * deltaTime);
        if (this.xPos >= TREX.START_X_POS) {
          this.xPos = TREX.START_X_POS;
          this.playingIntro = false;
        }
      }

      if (this.status === "WAITING") this.blink(performance.now());
      else this.draw();

      if (this.timer >= this.msPerFrame) {
        this.currentFrame = this.currentFrame === this.numFrames - 1 ? 0 : this.currentFrame + 1;
        this.timer = 0;
      }
    }

    draw(eyeOverride) {
      const x = this.xPos;
      const y = this.yPos;
      if (this.ducking && this.status !== "CRASHED") {
        const f = this.currentFrame;
        drawSprite(sprite("duck" + f, TREX.WIDTH_DUCK, TREX.HEIGHT, (g) => paintDinoDuck(g, f)), x, y);
        return;
      }
      let legs = "both";
      let eye = eyeOverride || "open";
      if (this.status === "RUNNING") legs = this.currentFrame === 0 ? "backUp" : "frontUp";
      if (this.status === "CRASHED") eye = "dead";
      const key = "dino-" + legs + "-" + eye;
      drawSprite(sprite(key, TREX.WIDTH, TREX.HEIGHT, (g) => paintDino(g, legs, eye)), x, y);
    }

    setBlinkDelay() {
      this.blinkDelay = Math.ceil(Math.random() * TREX.BLINK_TIMING);
    }

    blink(now) {
      const elapsed = now - this.animStartTime;
      let closed = false;
      if (elapsed >= this.blinkDelay) {
        closed = true;
        if (elapsed >= this.blinkDelay + 160) {
          this.setBlinkDelay();
          this.animStartTime = now;
          this.blinkCount++;
          closed = false;
        }
      }
      this.draw(closed ? "closed" : "open");
    }

    startJump(speed) {
      if (!this.jumping) {
        this.setStatus("JUMPING");
        this.jumpVelocity = TREX.INITIAL_JUMP_VELOCITY - speed / 10;
        this.jumping = true;
        this.reachedMinHeight = false;
        this.speedDrop = false;
      }
    }

    endJump() {
      if (this.reachedMinHeight && this.jumpVelocity < TREX.DROP_VELOCITY) {
        this.jumpVelocity = TREX.DROP_VELOCITY;
      }
    }

    updateJump(deltaTime) {
      const framesElapsed = deltaTime / ANIM.JUMPING.ms;
      if (this.speedDrop) {
        this.yPos += Math.round(this.jumpVelocity * TREX.SPEED_DROP_COEFFICIENT * framesElapsed);
      } else {
        this.yPos += Math.round(this.jumpVelocity * framesElapsed);
      }
      this.jumpVelocity += TREX.GRAVITY * framesElapsed;

      if (this.yPos < this.minJumpHeight || this.speedDrop) this.reachedMinHeight = true;
      if (this.yPos < TREX.MAX_JUMP_HEIGHT || this.speedDrop) this.endJump();

      if (this.yPos > this.groundYPos) {
        this.reset();
        this.jumpCount++;
      }
    }

    setSpeedDrop() {
      this.speedDrop = true;
      this.jumpVelocity = 1;
    }

    setDuck(isDucking) {
      if (isDucking && this.status !== "DUCKING") {
        this.setStatus("DUCKING");
        this.ducking = true;
      } else if (!isDucking && this.status === "DUCKING") {
        this.setStatus("RUNNING");
        this.ducking = false;
      }
    }

    reset() {
      this.yPos = this.groundYPos;
      this.jumpVelocity = 0;
      this.jumping = false;
      this.ducking = false;
      this.setStatus("RUNNING");
      this.speedDrop = false;
      this.jumpCount = 0;
    }
  }

  // ---------- Chướng ngại vật ----------
  class Obstacle {
    constructor(cfg, speed, xOffset) {
      this.cfg = cfg;
      this.size = rand(1, CFG.MAX_OBSTACLE_LENGTH);
      if (this.size > 1 && cfg.multipleSpeed > speed) this.size = 1;
      this.width = cfg.width * this.size;
      this.xPos = W + (xOffset || 0);
      this.yPos = Array.isArray(cfg.yPos) ? cfg.yPos[rand(0, cfg.yPos.length - 1)] : cfg.yPos;
      this.boxes = cfg.boxes.map((b) => box(b.x, b.y, b.w, b.h));
      if (this.size > 1) {
        this.boxes[1].w = this.width - this.boxes[0].w - this.boxes[2].w;
        this.boxes[2].x = this.width - this.boxes[2].w;
      }
      this.speedOffset = cfg.speedOffset
        ? Math.random() > 0.5 ? cfg.speedOffset : -cfg.speedOffset
        : 0;
      this.gap = this.getGap(CFG.GAP_COEFFICIENT, speed);
      this.timer = 0;
      this.currentFrame = 0;
      this.remove = false;
      this.followingObstacleCreated = false;
      this.variants = Array.from({ length: this.size }, () => rand(0, 8));
    }

    getGap(gapCoefficient, speed) {
      const minGap = Math.round(this.width * speed + this.cfg.minGap * gapCoefficient);
      const maxGap = Math.round(minGap * CFG.MAX_GAP_COEFFICIENT);
      return rand(minGap, maxGap);
    }

    update(deltaTime, speed) {
      if (this.remove) return;
      if (this.speedOffset) speed += this.speedOffset;
      this.xPos -= Math.floor(((speed * FPS) / 1000) * deltaTime);
      if (this.cfg.numFrames) {
        this.timer += deltaTime;
        if (this.timer >= this.cfg.frameRate) {
          this.currentFrame = this.currentFrame === this.cfg.numFrames - 1 ? 0 : this.currentFrame + 1;
          this.timer = 0;
        }
      }
      this.draw();
      if (!this.isVisible()) this.remove = true;
    }

    draw() {
      const { type, width, height } = this.cfg;
      if (type === "PTERODACTYL") {
        const f = this.currentFrame;
        drawSprite(sprite("bird" + f, width, height, (g) => paintBird(g, f)), this.xPos, this.yPos);
        return;
      }
      const large = type === "CACTUS_LARGE";
      for (let i = 0; i < this.size; i++) {
        const v = this.variants[i];
        const s = sprite(type + v, width, height, (g) => paintCactus(g, 0, large, v));
        drawSprite(s, this.xPos + i * width, this.yPos);
      }
    }

    isVisible() {
      return this.xPos + this.width > 0;
    }
  }

  // ---------- Mây ----------
  class Cloud {
    constructor() {
      this.xPos = W;
      this.yPos = rand(CLOUD.MAX_SKY, CLOUD.MIN_SKY);
      this.gap = rand(CLOUD.MIN_GAP, CLOUD.MAX_GAP);
      this.remove = false;
    }
    update(speed) {
      if (this.remove) return;
      this.xPos -= Math.ceil(speed);
      drawSprite(sprite("cloud", CLOUD.WIDTH, CLOUD.HEIGHT, paintCloud), this.xPos, this.yPos);
      if (!(this.xPos + CLOUD.WIDTH > 0)) this.remove = true;
    }
  }

  // ---------- Mặt đất ----------
  class HorizonLine {
    constructor() {
      this.textures = [makeGround(false), makeGround(true)];
      this.src = [0, 1];
      this.reset();
    }
    reset() {
      this.xPos = [0, W];
    }
    draw() {
      ctx.drawImage(this.textures[this.src[0]], this.xPos[0], 126, W, 24);
      ctx.drawImage(this.textures[this.src[1]], this.xPos[1], 126, W, 24);
    }
    updateXPos(pos, increment) {
      const line1 = pos;
      const line2 = pos === 0 ? 1 : 0;
      this.xPos[line1] -= increment;
      this.xPos[line2] = this.xPos[line1] + W;
      if (this.xPos[line1] <= -W) {
        this.xPos[line1] += W * 2;
        this.xPos[line2] = this.xPos[line1] - W;
        this.src[line1] = Math.random() > 0.5 ? 1 : 0;
      }
    }
    update(deltaTime, speed) {
      const increment = Math.floor(speed * (FPS / 1000) * deltaTime);
      if (this.xPos[0] <= 0) this.updateXPos(0, increment);
      else this.updateXPos(1, increment);
      this.draw();
    }
  }

  // ---------- Chế độ đêm (trăng + sao) ----------
  class NightMode {
    constructor() {
      this.xPos = W - 50;
      this.yPos = 30;
      this.phase = 0;
      this.opacity = 0;
      this.stars = [];
      this.drawStars = false;
      this.placeStars();
    }
    update(activated) {
      if (activated && this.opacity === 0) {
        this.phase = (this.phase + 1) % MOON_PHASES.length;
      }
      if (activated && (this.opacity < 1 || this.opacity === 0)) this.opacity += NIGHT.FADE_SPEED;
      else if (this.opacity > 0) this.opacity -= NIGHT.FADE_SPEED;

      if (this.opacity > 0) {
        this.xPos = this.updateXPos(this.xPos, NIGHT.MOON_SPEED);
        if (this.drawStars) {
          for (const s of this.stars) s.x = this.updateXPos(s.x, NIGHT.STAR_SPEED);
        }
        this.draw();
      } else {
        this.opacity = 0;
        this.placeStars();
      }
      this.drawStars = true;
    }
    updateXPos(pos, speed) {
      return pos < -NIGHT.WIDTH ? W : pos - speed;
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.opacity);
      if (this.drawStars) {
        const star = sprite("star", 9, 9, paintStar);
        for (const s of this.stars) drawSprite(star, s.x, s.y);
      }
      const p = this.phase;
      drawSprite(sprite("moon" + p, 20, 20, (g) => paintMoon(g, p)), this.xPos, this.yPos);
      ctx.restore();
    }
    placeStars() {
      const seg = Math.round(W / NIGHT.NUM_STARS);
      for (let i = 0; i < NIGHT.NUM_STARS; i++) {
        this.stars[i] = { x: rand(seg * i, seg * (i + 1)), y: rand(0, NIGHT.STAR_MAX_Y) };
      }
    }
    reset() {
      this.phase = 0;
      this.opacity = 0;
      this.update(false);
    }
  }

  // ---------- Đường chân trời: mây, đất, chướng ngại ----------
  class Horizon {
    constructor() {
      this.obstacles = [];
      this.history = [];
      this.clouds = [];
      this.line = new HorizonLine();
      this.night = new NightMode();
      this.addCloud();
    }
    update(deltaTime, speed, updateObstacles, showNightMode) {
      this.night.update(showNightMode);
      this.updateClouds(deltaTime, speed);
      this.line.update(deltaTime, speed);
      if (updateObstacles) this.updateObstacles(deltaTime, speed);
    }
    updateClouds(deltaTime, speed) {
      const cloudSpeed = (CFG.BG_CLOUD_SPEED / 1000) * deltaTime * speed;
      const n = this.clouds.length;
      if (n) {
        for (let i = n - 1; i >= 0; i--) this.clouds[i].update(cloudSpeed);
        const last = this.clouds[n - 1];
        if (n < CFG.MAX_CLOUDS && W - last.xPos > last.gap && CFG.CLOUD_FREQUENCY > Math.random()) {
          this.addCloud();
        }
        this.clouds = this.clouds.filter((c) => !c.remove);
      } else {
        this.addCloud();
      }
    }
    addCloud() {
      this.clouds.push(new Cloud());
    }
    updateObstacles(deltaTime, speed) {
      const kept = this.obstacles.slice(0);
      for (const o of this.obstacles) {
        o.update(deltaTime, speed);
        if (o.remove) kept.shift();
      }
      this.obstacles = kept;

      if (this.obstacles.length > 0) {
        const last = this.obstacles[this.obstacles.length - 1];
        if (!last.followingObstacleCreated && last.isVisible() && last.xPos + last.width + last.gap < W) {
          this.addNewObstacle(speed);
          last.followingObstacleCreated = true;
        }
      } else {
        this.addNewObstacle(speed);
      }
    }
    addNewObstacle(speed) {
      const t = OBSTACLE_TYPES[rand(0, OBSTACLE_TYPES.length - 1)];
      if (this.duplicateObstacleCheck(t.type) || speed < t.minSpeed) {
        this.addNewObstacle(speed);
        return;
      }
      this.obstacles.push(new Obstacle(t, speed, t.width));
      this.history.unshift(t.type);
      if (this.history.length > 1) this.history.splice(CFG.MAX_OBSTACLE_DUPLICATION);
    }
    duplicateObstacleCheck(type) {
      let count = 0;
      for (const h of this.history) count = h === type ? count + 1 : 0;
      return count >= CFG.MAX_OBSTACLE_DUPLICATION;
    }
    reset() {
      this.obstacles = [];
      this.line.reset();
      this.night.reset();
    }
  }

  // ---------- Bảng điểm ----------
  class DistanceMeter {
    constructor() {
      this.maxUnits = METER.MAX_UNITS;
      this.maxScore = Number("9".repeat(METER.MAX_UNITS));
      this.digits = "0".repeat(this.maxUnits);
      this.highScore = "";
      this.achievement = false;
      this.flashTimer = 0;
      this.flashIterations = 0;
    }
    getActualDistance(distance) {
      return distance ? Math.round(distance * METER.COEFFICIENT) : 0;
    }
    pad(n) {
      return String(n).padStart(this.maxUnits, "0").slice(-this.maxUnits);
    }
    update(deltaTime, distance) {
      let paint = true;
      let playSound = false;
      if (!this.achievement) {
        distance = this.getActualDistance(distance);
        if (distance > this.maxScore && this.maxUnits === METER.MAX_UNITS) {
          this.maxUnits++;
          this.maxScore = Number(String(this.maxScore) + "9");
        }
        if (distance > 0) {
          if (distance % METER.ACHIEVEMENT === 0) {
            this.achievement = true;
            this.flashTimer = 0;
            playSound = true;
          }
          this.digits = this.pad(distance);
        } else {
          this.digits = "0".repeat(this.maxUnits);
        }
      } else if (this.flashIterations <= METER.FLASH_ITERATIONS) {
        this.flashTimer += deltaTime;
        if (this.flashTimer < METER.FLASH_DURATION) {
          paint = false;
        } else if (this.flashTimer > METER.FLASH_DURATION * 2) {
          this.flashTimer = 0;
          this.flashIterations++;
        }
      } else {
        this.achievement = false;
        this.flashIterations = 0;
        this.flashTimer = 0;
      }
      this.draw(paint);
      return playSound;
    }
    draw(paintScore) {
      ctx.save();
      ctx.font = "700 14px 'Courier New', Courier, monospace";
      ctx.textBaseline = "top";
      ctx.textAlign = "right";
      const right = W - 10;
      const scoreW = ctx.measureText(this.digits).width;
      if (paintScore) {
        ctx.fillStyle = INK;
        ctx.fillText(this.digits, right, 8);
      }
      if (this.highScore) {
        ctx.fillStyle = "#757575";
        ctx.fillText(this.highScore, right - scoreW - 18, 8);
      }
      ctx.restore();
    }
    setHighScore(distance) {
      this.highScore = "HI " + this.pad(this.getActualDistance(distance));
    }
    reset() {
      this.achievement = false;
      this.flashTimer = 0;
      this.flashIterations = 0;
      this.update(0, 0);
    }
  }

  // ---------- Va chạm ----------
  function boxCompare(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.h + a.y > b.y;
  }

  function checkForCollision(obstacle, trex) {
    if (!obstacle) return false;
    const tBox = box(trex.xPos + 1, trex.yPos + 1, TREX.WIDTH - 2, TREX.HEIGHT - 2);
    const oBox = box(
      obstacle.xPos + 1,
      obstacle.yPos + 1,
      obstacle.cfg.width * obstacle.size - 2,
      obstacle.cfg.height - 2,
    );
    if (!boxCompare(tBox, oBox)) return false;
    const trexBoxes = trex.ducking ? TREX_BOXES.DUCKING : TREX_BOXES.RUNNING;
    for (const a of trexBoxes) {
      const ta = box(a.x + tBox.x, a.y + tBox.y, a.w, a.h);
      for (const b of obstacle.boxes) {
        if (boxCompare(ta, box(b.x + oBox.x, b.y + oBox.y, b.w, b.h))) return true;
      }
    }
    return false;
  }

  // ---------- Runner (vòng lặp chính) ----------
  function loadHigh() {
    try {
      return Number(localStorage.getItem(HI_KEY)) || 0;
    } catch (e) {
      return 0;
    }
  }
  function saveHigh(v) {
    try {
      localStorage.setItem(HI_KEY, String(v));
    } catch (e) {}
  }

  const trex = new Trex();
  const horizon = new Horizon();
  const meter = new DistanceMeter();

  const R = {
    playing: false,
    activated: false,
    crashed: false,
    paused: false,
    playingIntro: false,
    introStart: 0,
    visibleWidth: TREX.WIDTH,
    currentSpeed: CFG.SPEED,
    distanceRan: 0,
    runningTime: 0,
    time: 0,
    highestScore: loadHigh(),
    inverted: false,
    invertTimer: 0,
    invertTrigger: false,
    raf: 0,
    downHeld: false,
  };
  if (R.highestScore > 0) meter.setHighScore(R.highestScore);

  function schedule() {
    if (!R.raf) R.raf = requestAnimationFrame(update);
  }

  function update() {
    if (R.raf) cancelAnimationFrame(R.raf);
    R.raf = 0;
    const now = performance.now();
    let deltaTime = now - (R.time || now);
    R.time = now;

    if (R.playingIntro) {
      const p = Math.min(1, (now - R.introStart) / CFG.INTRO_REVEAL);
      R.visibleWidth = TREX.WIDTH + (W - TREX.WIDTH) * (1 - Math.pow(1 - p, 3));
    }

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, R.visibleWidth, H);
    ctx.clip();

    if (R.playing) {
      if (trex.jumping) {
        trex.updateJump(deltaTime);
        if (!trex.jumping && R.downHeld) trex.setDuck(true);
      }

      R.runningTime += deltaTime;
      const hasObstacles = R.runningTime > CFG.CLEAR_TIME;

      if (trex.jumpCount === 1 && !R.playingIntro) playIntro();

      if (R.playingIntro) {
        horizon.update(0, R.currentSpeed, hasObstacles);
      } else {
        deltaTime = !R.activated ? 0 : deltaTime;
        horizon.update(deltaTime, R.currentSpeed, hasObstacles, R.inverted);
      }

      const collision = hasObstacles && checkForCollision(horizon.obstacles[0], trex);
      if (!collision) {
        R.distanceRan += (R.currentSpeed * deltaTime) / MS_PER_FRAME;
        if (R.currentSpeed < CFG.MAX_SPEED) R.currentSpeed += CFG.ACCELERATION;
      } else {
        gameOver();
      }

      if (meter.update(deltaTime, Math.ceil(R.distanceRan))) Sound.score();

      // Đảo màu ngày/đêm mỗi 700 điểm, kéo dài 12 giây.
      if (R.invertTimer > CFG.INVERT_FADE_DURATION) {
        R.invertTimer = 0;
        R.invertTrigger = false;
        invert(false);
      } else if (R.invertTimer) {
        R.invertTimer += deltaTime;
      } else {
        const actual = meter.getActualDistance(Math.ceil(R.distanceRan));
        if (actual > 0) {
          R.invertTrigger = !(actual % CFG.INVERT_DISTANCE);
          if (R.invertTrigger && R.invertTimer === 0) {
            R.invertTimer += deltaTime;
            invert(false);
          }
        }
      }
    } else if (!R.crashed) {
      horizon.line.draw();
    }

    if (R.playing || (!R.activated && !R.crashed && trex.blinkCount < CFG.MAX_BLINK_COUNT)) {
      trex.update(deltaTime);
      schedule();
    }
    ctx.restore();
  }

  function playIntro() {
    if (!R.activated && !R.crashed) {
      R.playingIntro = true;
      R.introStart = performance.now();
      trex.playingIntro = true;
      setTimeout(startGame, CFG.INTRO_REVEAL);
    }
  }

  function startGame() {
    R.activated = true;
    R.playingIntro = false;
    R.visibleWidth = W;
    R.runningTime = 0;
    document.body.classList.add("started");
  }

  function drawGameOver() {
    ctx.save();
    ctx.fillStyle = INK;
    ctx.font = "700 18px 'Courier New', Courier, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("G A M E   O V E R", W / 2, 40);
    ctx.restore();
    drawSprite(sprite("restart", 36, 34, paintRestart), W / 2 - 18, 70);
  }

  function gameOver() {
    Sound.hit();
    if (navigator.vibrate) navigator.vibrate(200);
    stop();
    R.crashed = true;
    meter.achievement = false;
    trex.update(100, "CRASHED");
    drawGameOver();
    if (R.distanceRan > R.highestScore) {
      R.highestScore = Math.ceil(R.distanceRan);
      meter.setHighScore(R.highestScore);
      saveHigh(R.highestScore);
    }
    R.time = performance.now();
  }

  function stop() {
    R.playing = false;
    R.paused = true;
    cancelAnimationFrame(R.raf);
    R.raf = 0;
  }

  function play() {
    if (!R.crashed) {
      R.playing = true;
      R.paused = false;
      if (!trex.jumping && !trex.ducking) trex.update(0, "RUNNING");
      R.time = performance.now();
      update();
    }
  }

  function restart() {
    stop();
    R.runningTime = 0;
    R.playing = true;
    R.paused = false;
    R.crashed = false;
    R.distanceRan = 0;
    R.currentSpeed = CFG.SPEED;
    R.time = performance.now();
    R.downHeld = false;
    meter.reset();
    horizon.reset();
    trex.reset();
    invert(true);
    update();
  }

  function invert(reset) {
    if (reset) {
      stage.classList.remove("inverted");
      R.invertTimer = 0;
      R.inverted = false;
    } else {
      R.inverted = stage.classList.toggle("inverted", R.invertTrigger);
    }
  }

  // ---------- Điều khiển ----------
  function jumpDown() {
    Sound.unlock();
    if (R.crashed) return;
    if (!R.playing) {
      if (R.paused && R.activated) return;
      R.playing = true;
      R.time = performance.now();
      update();
    }
    if (!trex.jumping && !trex.ducking) {
      Sound.jump();
      trex.startJump(R.currentSpeed);
    }
  }

  function jumpUp(allowRestart) {
    if (R.playing && trex.jumping) {
      trex.endJump();
    } else if (R.crashed && (allowRestart || performance.now() - R.time >= CFG.GAMEOVER_CLEAR_TIME)) {
      restart();
    }
  }

  function duckDown() {
    R.downHeld = true;
    if (!R.playing) return;
    if (trex.jumping) trex.setSpeedDrop();
    else if (!trex.ducking) trex.setDuck(true);
  }

  function duckUp() {
    R.downHeld = false;
    trex.speedDrop = false;
    trex.setDuck(false);
  }

  const JUMP_KEYS = ["Space", "ArrowUp"];
  document.addEventListener("keydown", (e) => {
    if (JUMP_KEYS.includes(e.code)) {
      e.preventDefault();
      jumpDown();
    } else if (e.code === "ArrowDown") {
      e.preventDefault();
      duckDown();
    }
  });
  document.addEventListener("keyup", (e) => {
    if (JUMP_KEYS.includes(e.code)) {
      e.preventDefault();
      jumpUp(false);
    } else if (e.code === "ArrowDown") {
      duckUp();
    } else if (e.code === "Enter" && R.crashed) {
      restart();
    }
  });

  stage.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    jumpDown();
  });
  stage.addEventListener("pointerup", (e) => {
    e.preventDefault();
    jumpUp(e.pointerType === "mouse");
  });
  stage.addEventListener("contextmenu", (e) => e.preventDefault());

  function holdButton(el, onDown, onUp) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      onDown();
    });
    el.addEventListener("pointerup", (e) => {
      e.preventDefault();
      onUp();
    });
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  holdButton(document.getElementById("btnJump"), jumpDown, () => jumpUp(false));
  holdButton(document.getElementById("btnDuck"), duckDown, duckUp);

  document.getElementById("restart").addEventListener("click", (e) => {
    e.currentTarget.blur();
    Sound.unlock();
    if (R.activated) restart();
  });

  // Tạm dừng khi rời tab, chạy tiếp khi quay lại (như bản gốc).
  function onVisibility() {
    if (document.hidden || !document.hasFocus()) {
      if (R.playing && R.activated) stop();
    } else if (R.paused && R.activated && !R.crashed) {
      play();
    }
  }
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", onVisibility);
  window.addEventListener("focus", onVisibility);

  update();
})();
