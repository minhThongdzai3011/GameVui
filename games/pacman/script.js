// Pac-Man — tái hiện bản arcade 1980: mê cung 28×31, 240 chấm + 4 chấm năng
// lượng; 4 ma với cách đuổi riêng (Blinky đuổi thẳng, Pinky chặn đầu 4 ô, Inky
// lấy đối xứng qua Blinky, Clyde đến gần 8 ô thì bỏ chạy về góc); luân phiên
// Tản ra / Truy đuổi theo lịch từng màn; ô "cấm rẽ lên" trên nhà ma; đường hầm
// làm ma chậm lại; ăn ma 200-400-800-1600; trái cây khi ăn 70 và 170 chấm;
// Blinky tăng tốc ("Elroy") khi còn ít chấm; thêm mạng ở 10.000 điểm.
(() => {
  "use strict";

  // ---------- Mê cung ('#' tường, '.' chấm, 'o' chấm năng lượng, '-' cửa nhà ma) ----------
  const MAP = [
    "############################",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#o####.#####.##.#####.####o#",
    "#.####.#####.##.#####.####.#",
    "#..........................#",
    "#.####.##.########.##.####.#",
    "#.####.##.########.##.####.#",
    "#......##....##....##......#",
    "######.##### ## #####.######",
    "     #.##### ## #####.#     ",
    "     #.##          ##.#     ",
    "     #.## ###--### ##.#     ",
    "######.## #      # ##.######",
    "      .   #      #   .      ",
    "######.## #      # ##.######",
    "     #.## ######## ##.#     ",
    "     #.##          ##.#     ",
    "     #.## ######## ##.#     ",
    "######.## ######## ##.######",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#.####.#####.##.#####.####.#",
    "#o..##.......  .......##..o#",
    "###.##.##.########.##.##.###",
    "###.##.##.########.##.##.###",
    "#......##....##....##......#",
    "#.##########.##.##########.#",
    "#.##########.##.##########.#",
    "#..........................#",
    "############################",
  ];
  const W = 28;
  const H = 31;
  const TOP = 3; // 3 hàng trên cho điểm số
  const ROWS = 36;
  const TUNNEL_ROW = 14;
  const UP = { x: 0, y: -1, a: -Math.PI / 2 };
  const LEFT = { x: -1, y: 0, a: Math.PI };
  const DOWN = { x: 0, y: 1, a: Math.PI / 2 };
  const RIGHT = { x: 1, y: 0, a: 0 };
  const STOP = { x: 0, y: 0, a: 0 };
  const ORDER = [UP, LEFT, DOWN, RIGHT]; // thứ tự ưu tiên khi hoà như bản gốc
  const opposite = (d) => (d === UP ? DOWN : d === DOWN ? UP : d === LEFT ? RIGHT : d === RIGHT ? LEFT : STOP);
  const BASE = 9.47; // 100% tốc độ = 75.75 px/giây = 9.47 ô/giây

  // ---------- Bảng thông số theo màn ----------
  function levelSpec(lv) {
    const i = Math.min(lv, 21);
    const pac = i === 1 ? 0.8 : i < 5 ? 0.9 : i < 21 ? 1 : 0.9;
    const pacF = i === 1 ? 0.9 : i < 5 ? 0.95 : 1;
    const ghost = i === 1 ? 0.75 : i < 5 ? 0.85 : 0.95;
    const ghostF = i === 1 ? 0.5 : i < 5 ? 0.55 : 0.6;
    const tunnel = i === 1 ? 0.4 : i < 5 ? 0.45 : 0.5;
    const FRIGHT = [0, 6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1, 0, 0, 0];
    const FLASH = [0, 5, 5, 5, 5, 5, 5, 5, 5, 3, 5, 5, 3, 3, 5, 3, 3, 0, 3, 0, 0, 0];
    const ELROY = [0, 20, 30, 40, 40, 40, 50, 50, 50, 60, 60, 60, 80, 80, 80, 100, 100, 100, 100, 120, 120, 120];
    const schedule =
      i === 1
        ? [7, 20, 7, 20, 5, 20, 5, Infinity]
        : i < 5
          ? [7, 20, 7, 20, 5, 1033, 1 / 60, Infinity]
          : [5, 20, 5, 20, 5, 1037, 1 / 60, Infinity];
    return {
      pac,
      pacF,
      ghost,
      ghostF,
      tunnel,
      fright: FRIGHT[i],
      flashes: FLASH[i],
      elroy: ELROY[i],
      schedule,
      fruit: lv === 1 ? 0 : lv === 2 ? 1 : lv < 5 ? 2 : lv < 7 ? 3 : lv < 9 ? 4 : lv < 11 ? 5 : lv < 13 ? 6 : 7,
    };
  }
  const FRUITS = [
    { e: "🍒", pts: 100 },
    { e: "🍓", pts: 300 },
    { e: "🍊", pts: 500 },
    { e: "🍎", pts: 700 },
    { e: "🍈", pts: 1000 },
    { e: "🛸", pts: 2000 },
    { e: "🔔", pts: 3000 },
    { e: "🔑", pts: 5000 },
  ];

  // ---------- Lưới ----------
  let grid = [];
  const cellAt = (c, r) => {
    if (r === TUNNEL_ROW && (c < 0 || c >= W)) return " ";
    if (c < 0 || c >= W || r < 0 || r >= H) return "#";
    return grid[r][c];
  };
  const blocked = (c, r) => {
    const ch = cellAt(c, r);
    return ch === "#" || ch === "-";
  };
  // 4 ô ma không được rẽ lên (trên nhà ma và trên chỗ Pac-Man xuất phát)
  const noUp = (c, r) => (c === 12 || c === 15) && (r === 11 || r === 23);
  const inTunnel = (e) => Math.floor(e.y) === TUNNEL_ROW && (e.x < 6 || e.x > 22);

  // ---------- Âm thanh ----------
  let actx = null;
  let muted = false;
  try {
    muted = localStorage.getItem("gamevui-pacman-muted") === "1";
  } catch {
    /* bỏ qua */
  }
  function ac() {
    if (muted) return null;
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
  function sweep(f0, f1, dur, { type = "square", vol = 0.05, delay = 0 } = {}) {
    const a = ac();
    if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + dur * 0.85);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.01);
  }
  let wakaFlip = false;
  const sfx = {
    waka() {
      wakaFlip = !wakaFlip;
      if (wakaFlip) sweep(260, 520, 0.075, { type: "triangle", vol: 0.12 });
      else sweep(520, 260, 0.075, { type: "triangle", vol: 0.12 });
    },
    pellet: () => sweep(200, 700, 0.18, { type: "triangle", vol: 0.12 }),
    eatGhost: () => sweep(180, 1400, 0.45, { type: "square", vol: 0.05 }),
    fruit: () => [880, 1320, 1760].forEach((f, i) => sweep(f, f, 0.06, { delay: i * 0.06, vol: 0.05 })),
    extra: () => [0, 1, 2, 3, 4, 5].forEach((i) => sweep(1046, 1046, 0.06, { delay: i * 0.12, vol: 0.05 })),
    death() {
      for (let i = 0; i < 9; i++) sweep(780 - i * 60, 380 - i * 30, 0.13, { delay: i * 0.13, vol: 0.05 });
      sweep(120, 60, 0.15, { delay: 1.25, vol: 0.06 });
      sweep(120, 60, 0.15, { delay: 1.45, vol: 0.06 });
    },
    // nhạc mở màn (giai điệu tự sáng tác, không phải nhạc gốc)
    intro() {
      const n = [523, 659, 784, 1047, 784, 988, 784, 659, 587, 698, 880, 1175, 880, 1047, 880, 784, 523, 659, 784, 1047, 1175, 1319, 1568, 2093];
      n.forEach((f, i) => sweep(f, f, 0.15, { type: "square", vol: 0.04, delay: i * 0.17 }));
      n.forEach((f, i) => i % 2 === 0 && sweep(f / 4, f / 4, 0.3, { type: "triangle", vol: 0.08, delay: i * 0.17 }));
    },
  };
  // còi nền liên tục (đổi giọng khi ma hoảng sợ / khi chỉ còn mắt chạy về)
  let siren = null;
  function setSiren(kind) {
    const a = ac();
    if (!a || kind === "off") {
      if (siren) {
        siren.g.gain.setTargetAtTime(0, siren.a.currentTime, 0.03);
        const s = siren;
        setTimeout(() => s.o.stop(), 200);
        siren = null;
      }
      return;
    }
    if (siren && siren.kind === kind) return;
    setSiren("off");
    const o = a.createOscillator();
    const g = a.createGain();
    const lfo = a.createOscillator();
    const lg = a.createGain();
    o.type = kind === "fright" ? "square" : "sine";
    o.frequency.value = kind === "fright" ? 180 : kind === "eyes" ? 900 : 440;
    lfo.frequency.value = kind === "fright" ? 8 : kind === "eyes" ? 14 : 2.6;
    lg.gain.value = kind === "fright" ? 70 : kind === "eyes" ? 300 : 160;
    lfo.connect(lg).connect(o.frequency);
    g.gain.value = 0;
    g.gain.setTargetAtTime(kind === "fright" ? 0.025 : 0.04, a.currentTime, 0.05);
    o.connect(g).connect(a.destination);
    o.start();
    lfo.start();
    lfo.onended = null;
    siren = { o, g, a, kind };
    o.onended = () => lfo.stop();
  }

  // ---------- Trạng thái ----------
  let level = 1;
  let spec = levelSpec(1);
  let score = 0;
  let high = 0;
  try {
    high = Number(localStorage.getItem("gamevui-pacman-high")) || 0;
  } catch {
    /* bỏ qua */
  }
  let lives = 3;
  let extraGiven = false;
  let dotsLeft = 0;
  let dotsEaten = 0;
  let state = "title"; // title | ready | play | eat | dying | clear | over
  let stateT = 0;
  let paused = false;
  let pac;
  let ghosts = [];
  let modeIdx = 0;
  let modeT = 0;
  let frightT = 0;
  let ghostChain = 0;
  let sinceDot = 0;
  let globalDots = -1; // >=0 khi đang dùng bộ đếm chung sau khi mất mạng
  let fruit = null; // {t}
  let popups = []; // {text, x, y, t, color}
  let eatInfo = null;
  let fruitsShown = [];

  const scatterMode = () => modeIdx % 2 === 0;

  function resetGrid() {
    grid = MAP.map((row) => row.split(""));
    dotsLeft = MAP.join("").split("").filter((c) => c === "." || c === "o").length;
    dotsEaten = 0;
  }

  function makeGhost(name, color, x, y, scatter, dotLimit) {
    return { name, color, x, y, home: { x, y }, dir: name === "blinky" ? LEFT : name === "pinky" ? DOWN : UP, scatter, dotLimit, dots: 0, state: name === "blinky" ? "active" : "house", fright: false, reverse: false };
  }

  function resetActors() {
    pac = { x: 14, y: 23.5, dir: LEFT, next: LEFT, dist: 0, stall: 0 };
    const keep = Object.fromEntries(ghosts.map((g) => [g.name, g.dots]));
    ghosts = [
      makeGhost("blinky", "#ff0000", 14, 11.5, { x: 25, y: -3 }, 0),
      makeGhost("pinky", "#ffb8ff", 14, 14.5, { x: 2, y: -3 }, 0),
      makeGhost("inky", "#00ffff", 12, 14.5, { x: 27, y: 32 }, level === 1 ? 30 : 0),
      makeGhost("clyde", "#ffb852", 16, 14.5, { x: 0, y: 32 }, level === 1 ? 60 : level === 2 ? 50 : 0),
    ];
    for (const g of ghosts) if (keep[g.name] != null) g.dots = keep[g.name];
    modeIdx = 0;
    modeT = 0;
    frightT = 0;
    sinceDot = 0;
    fruit = null;
    eatInfo = null;
  }

  function startLevel(first) {
    spec = levelSpec(level);
    resetGrid();
    ghosts = [];
    globalDots = -1;
    resetActors();
    fruitsShown = [...fruitsShown, spec.fruit].slice(-7); // góc dưới: trái cây các màn đã qua
    state = "ready";
    stateT = first ? 4.2 : 2;
    if (first) sfx.intro();
  }

  function newGame() {
    level = 1;
    score = 0;
    lives = 3;
    extraGiven = false;
    fruitsShown = [];
    popups = [];
    $("#start").hidden = true;
    startLevel(true);
  }

  const $ = (s) => document.querySelector(s);

  function addScore(n) {
    score += n;
    if (!extraGiven && score >= 10000) {
      extraGiven = true;
      lives++;
      sfx.extra();
    }
    if (score > high) {
      high = score;
      try {
        localStorage.setItem("gamevui-pacman-high", String(high));
      } catch {
        /* bỏ qua */
      }
    }
  }

  // ---------- Di chuyển trên lưới ----------
  // Đi `dist` ô theo hướng hiện tại; mỗi lần chạm tâm ô gọi decide(e) để rẽ / dừng
  function travel(e, dist, decide) {
    for (let guard = 0; dist > 1e-9 && guard < 8; guard++) {
      if (e.dir === STOP) {
        decide(e);
        if (e.dir === STOP) return;
      }
      const cx = Math.floor(e.x) + 0.5;
      const cy = Math.floor(e.y) + 0.5;
      const off = e.dir.x ? (e.x - cx) * e.dir.x : (e.y - cy) * e.dir.y;
      if (off < -1e-9) {
        // tâm ô ở phía trước
        const need = -off;
        if (need > dist) {
          e.x += e.dir.x * dist;
          e.y += e.dir.y * dist;
          return;
        }
        e.x = e.dir.x ? cx : e.x;
        e.y = e.dir.y ? cy : e.y;
        dist -= need;
        decide(e);
        if (e.dir === STOP) return;
      }
      // rời tâm ô, đi tới mép để sang ô kế
      const m = Math.min(dist, 0.5 - Math.max(0, off) + 1e-6);
      e.x += e.dir.x * m;
      e.y += e.dir.y * m;
      dist -= m;
      if (e.x < -0.5) e.x += W;
      else if (e.x >= W + 0.5) e.x -= W;
    }
  }

  function pacDecide(e) {
    const tx = Math.floor(e.x);
    const ty = Math.floor(e.y);
    if (e.next && e.next !== STOP && !blocked(tx + e.next.x, ty + e.next.y)) e.dir = e.next;
    if (e.dir !== STOP && blocked(tx + e.dir.x, ty + e.dir.y)) e.dir = STOP;
  }

  // ---------- Trí khôn của ma ----------
  function targetOf(g) {
    const px = Math.floor(pac.x);
    const py = Math.floor(pac.y);
    const blinky = ghosts[0];
    const elroy = g.name === "blinky" && dotsLeft <= spec.elroy && ghosts.every((o) => o.state !== "house");
    if (scatterMode() && !elroy) return g.scatter;
    const d = pac.dir === STOP ? pac.lastDir || LEFT : pac.dir;
    switch (g.name) {
      case "blinky":
        return { x: px, y: py };
      case "pinky": // 4 ô trước mặt (khi nhìn lên thì lệch thêm 4 ô trái — lỗi kinh điển của bản gốc)
        return { x: px + d.x * 4 - (d === UP ? 4 : 0), y: py + d.y * 4 };
      case "inky": {
        const ax = px + d.x * 2 - (d === UP ? 2 : 0);
        const ay = py + d.y * 2;
        return { x: 2 * ax - Math.floor(blinky.x), y: 2 * ay - Math.floor(blinky.y) };
      }
      default: {
        // Clyde: xa hơn 8 ô thì đuổi, gần thì chạy về góc
        const dx = px - Math.floor(g.x);
        const dy = py - Math.floor(g.y);
        return dx * dx + dy * dy > 64 ? { x: px, y: py } : g.scatter;
      }
    }
  }

  function ghostDecide(g) {
    const tx = Math.floor(g.x);
    const ty = Math.floor(g.y);
    if (g.state === "eaten" && ty === 11 && (tx === 13 || tx === 14)) {
      g.x = 14;
      g.y = 11.5;
      g.state = "entering";
      g.dir = DOWN;
      return;
    }
    if (g.reverse) {
      g.reverse = false;
      const back = opposite(g.dir);
      if (!blocked(tx + back.x, ty + back.y)) {
        g.dir = back;
        return;
      }
    }
    const opts = ORDER.filter(
      (d) =>
        d !== opposite(g.dir) &&
        !blocked(tx + d.x, ty + d.y) &&
        !(d === UP && noUp(tx, ty) && !g.fright && g.state !== "eaten"),
    );
    if (!opts.length) {
      g.dir = opposite(g.dir);
      return;
    }
    if (g.fright && g.state === "active") {
      g.dir = opts[Math.floor(Math.random() * opts.length)];
      return;
    }
    const t = g.state === "eaten" ? { x: 13.5, y: 11 } : targetOf(g);
    let best = opts[0];
    let bestD = Infinity;
    for (const d of opts) {
      const dx = tx + d.x - t.x;
      const dy = ty + d.y - t.y;
      const dd = dx * dx + dy * dy;
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    g.dir = best;
  }

  function ghostSpeed(g) {
    if (g.state === "eaten" || g.state === "entering") return BASE * 1.6;
    if (g.state === "house" || g.state === "leaving") return BASE * 0.5;
    if (inTunnel(g)) return BASE * spec.tunnel;
    if (g.fright) return BASE * spec.ghostF;
    if (g.name === "blinky" && ghosts.every((o) => o.state !== "house")) {
      if (dotsLeft <= spec.elroy / 2) return BASE * (spec.ghost + 0.1);
      if (dotsLeft <= spec.elroy) return BASE * (spec.ghost + 0.05);
    }
    return BASE * spec.ghost;
  }

  const approach = (v, target, step) => (Math.abs(target - v) <= step ? target : v + Math.sign(target - v) * step);

  function updateGhost(g, dt) {
    const sp = ghostSpeed(g) * dt;
    switch (g.state) {
      case "house": // nhấp nhô trong nhà
        g.y += (g.dir === UP ? -1 : 1) * sp;
        if (g.y <= 14) {
          g.y = 14;
          g.dir = DOWN;
        } else if (g.y >= 15) {
          g.y = 15;
          g.dir = UP;
        }
        break;
      case "leaving":
        if (g.x !== 14) {
          g.y = approach(g.y, 14.5, sp);
          if (g.y === 14.5) g.x = approach(g.x, 14, sp);
          g.dir = g.x < 14 ? RIGHT : LEFT;
        } else {
          g.dir = UP;
          g.y = approach(g.y, 11.5, sp);
          if (g.y === 11.5) {
            g.state = "active";
            g.dir = LEFT;
          }
        }
        break;
      case "entering":
        if (g.y < 14.5) g.y = approach(g.y, 14.5, sp);
        else {
          // Blinky không có chỗ riêng trong nhà → về giữa nhà
          const hx = g.name === "blinky" ? 14 : g.home.x;
          g.x = approach(g.x, hx, sp);
          if (g.x === hx) {
            g.fright = false;
            g.state = "leaving";
          }
        }
        break;
      default:
        travel(g, sp, ghostDecide);
    }
  }

  function releaseGhosts(dt) {
    const waiting = ghosts.filter((g) => g.state === "house");
    if (!waiting.length) return;
    const next = waiting[0];
    sinceDot += dt;
    let go = false;
    if (globalDots >= 0) {
      const need = { pinky: 7, inky: 17, clyde: 32 }[next.name];
      if (globalDots >= need) go = true;
    } else if (next.dots >= next.dotLimit) go = true;
    if (sinceDot >= (level < 5 ? 4 : 3)) {
      go = true;
      sinceDot = 0;
    }
    if (go) next.state = "leaving";
  }

  function countDot() {
    sinceDot = 0;
    if (globalDots >= 0) {
      globalDots++;
      if (globalDots >= 32 && ghosts[3].state !== "house") globalDots = -1;
    } else {
      const next = ghosts.find((g) => g.state === "house");
      if (next) next.dots++;
    }
  }

  // ---------- Cập nhật mỗi khung hình ----------
  function eat() {
    const tx = Math.floor(pac.x);
    const ty = Math.floor(pac.y);
    const ch = cellAt(tx, ty);
    if (ch !== "." && ch !== "o") return;
    grid[ty][tx] = " ";
    dotsLeft--;
    dotsEaten++;
    countDot();
    if (ch === ".") {
      addScore(10);
      pac.stall = 1 / 60; // bản gốc khựng 1 khung hình mỗi chấm
      sfx.waka();
    } else {
      addScore(50);
      pac.stall = 3 / 60;
      sfx.pellet();
      ghostChain = 0;
      frightT = spec.fright;
      for (const g of ghosts) {
        if (g.state === "active") g.reverse = true;
        if (spec.fright && g.state !== "eaten" && g.state !== "entering") g.fright = true;
      }
    }
    if (dotsEaten === 70 || dotsEaten === 170) fruit = { t: 9.5 };
    if (!dotsLeft) {
      state = "clear";
      stateT = 3;
      setSiren("off");
    }
  }

  function update(dt) {
    if (state === "ready") {
      if ((stateT -= dt) <= 0) state = "play";
      return;
    }
    if (state === "eat") {
      if ((stateT -= dt) <= 0) {
        state = "play";
        eatInfo.g.state = "eaten";
        eatInfo = null;
      }
      // mắt của các ma đã bị ăn vẫn chạy về
      for (const g of ghosts) if (g.state === "eaten" || g.state === "entering") updateGhost(g, dt);
      return;
    }
    if (state === "dying") {
      if ((stateT -= dt) <= 0) {
        lives--;
        if (lives <= 0) {
          state = "over";
          stateT = 0;
          setTimeout(() => {
            $("#start").hidden = false;
            $("#btnPlay").textContent = "▶ CHƠI LẠI";
          }, 2500);
        } else {
          resetActors();
          globalDots = 0; // sau khi mất mạng dùng bộ đếm chấm chung
          state = "ready";
          stateT = 2;
        }
      }
      return;
    }
    if (state === "clear") {
      if ((stateT -= dt) <= 0) {
        level++;
        startLevel(false);
      }
      return;
    }
    if (state !== "play") return;

    // lịch Tản ra / Truy đuổi (dừng lại khi ma đang hoảng sợ)
    if (frightT > 0) {
      frightT -= dt;
      if (frightT <= 0) for (const g of ghosts) g.fright = false;
    } else {
      modeT += dt;
      if (modeT >= spec.schedule[modeIdx]) {
        modeT = 0;
        modeIdx++;
        for (const g of ghosts) if (g.state === "active") g.reverse = true;
      }
    }

    // Pac-Man
    if (pac.stall > 0) pac.stall -= dt;
    else {
      if (pac.next === opposite(pac.dir)) pac.dir = pac.next; // quay đầu được ngay lập tức
      if (pac.dir !== STOP) pac.lastDir = pac.dir;
      const sp = BASE * (frightT > 0 ? spec.pacF : spec.pac) * dt;
      const bx = pac.x;
      const by = pac.y;
      travel(pac, sp, pacDecide);
      const mx = Math.abs(pac.x - bx);
      pac.dist += Math.min(mx, W - mx) + Math.abs(pac.y - by); // tính đúng cả khi xuyên đường hầm
      eat();
      if (state !== "play") return;
    }

    releaseGhosts(dt);
    for (const g of ghosts) updateGhost(g, dt);

    // trái cây
    if (fruit) {
      fruit.t -= dt;
      if (fruit.t <= 0) fruit = null;
      else if (Math.abs(pac.x - 14) < 0.8 && Math.floor(pac.y) === 17) {
        const f = FRUITS[spec.fruit];
        addScore(f.pts);
        popups.push({ text: String(f.pts), x: 14, y: 17.5, t: 2, color: "#ffb8ff" });
        fruit = null;
        sfx.fruit();
      }
    }

    // va chạm với ma
    for (const g of ghosts) {
      if (g.state !== "active") continue;
      let dx = Math.abs(g.x - pac.x);
      if (dx > W / 2) dx = W - dx;
      if (dx + Math.abs(g.y - pac.y) > 0.75) continue;
      if (g.fright) {
        const pts = 200 * 2 ** ghostChain;
        ghostChain = Math.min(ghostChain + 1, 3);
        addScore(pts);
        g.fright = false;
        eatInfo = { g, pts };
        state = "eat";
        stateT = 1;
        sfx.eatGhost();
        return;
      }
      state = "dying";
      stateT = 3;
      setSiren("off");
      setTimeout(() => state === "dying" && sfx.death(), 900);
      return;
    }

    // còi nền
    if (ghosts.some((g) => g.state === "eaten" || g.state === "entering")) setSiren("eyes");
    else if (frightT > 0) setSiren("fright");
    else setSiren("normal");
  }

  // =====================================================================
  // Vẽ
  // =====================================================================
  const canvas = $("#game");
  const ctx = canvas.getContext("2d");
  let T = 16; // điểm ảnh thật cho mỗi ô
  let mazeBlue = null;
  let mazeWhite = null;

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const coarse = matchMedia("(pointer: coarse)").matches;
    const availW = window.innerWidth - 12;
    const availH = window.innerHeight - 40 - (coarse ? 125 : 0);
    const cssTile = Math.max(6, Math.min(availW / W, availH / ROWS));
    T = Math.max(6, Math.floor(cssTile * dpr));
    canvas.width = W * T;
    canvas.height = ROWS * T;
    canvas.style.width = (W * T) / dpr + "px";
    canvas.style.height = (ROWS * T) / dpr + "px";
    mazeBlue = buildMaze("#2121ff");
    mazeWhite = buildMaze("#ffffff");
  }

  // Tường: đường viền chạy qua tâm các ô tường giáp lối đi (giống nét vẽ arcade)
  function buildMaze(color) {
    const c = document.createElement("canvas");
    c.width = W * T;
    c.height = H * T;
    const g = c.getContext("2d");
    const wall = (x, y) => x >= 0 && x < W && y >= 0 && y < H && MAP[y][x] === "#";
    const open = (x, y) => !wall(x, y);
    const boundary = (x, y) => {
      if (!wall(x, y)) return false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (open(x + dx, y + dy)) return true;
      return false;
    };
    g.strokeStyle = color;
    g.lineWidth = Math.max(1, T * 0.16);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!boundary(x, y)) continue;
        const cx = (x + 0.5) * T;
        const cy = (y + 0.5) * T;
        if (boundary(x + 1, y) && (open(x, y - 1) || open(x + 1, y - 1) || open(x, y + 1) || open(x + 1, y + 1))) {
          g.moveTo(cx, cy);
          g.lineTo(cx + T, cy);
        }
        if (boundary(x, y + 1) && (open(x - 1, y) || open(x - 1, y + 1) || open(x + 1, y) || open(x + 1, y + 1))) {
          g.moveTo(cx, cy);
          g.lineTo(cx, cy + T);
        }
      }
    g.stroke();
    // cửa nhà ma
    g.fillStyle = "#ffb8ff";
    g.fillRect(13 * T, 12.5 * T - T * 0.12, 2 * T, T * 0.24);
    return c;
  }

  function text(str, col, row, color, align = "left") {
    ctx.fillStyle = color;
    ctx.font = `${Math.round(T * 0.95)}px "Press Start 2P", monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.fillText(str, col * T, row * T + T * 0.05);
  }

  function drawPac(x, y, angle, mouth, r = T * 0.82) {
    ctx.fillStyle = "#ffff00";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, angle + mouth, angle + Math.PI * 2 - mouth);
    ctx.closePath();
    ctx.fill();
  }

  function drawGhost(g, now) {
    const x = g.x * T;
    const y = (g.y + TOP) * T;
    const r = T * 0.86;
    const eyesOnly = g.state === "eaten" || g.state === "entering";
    if (!eyesOnly) {
      let body = g.color;
      let face = null;
      if (g.fright) {
        const flashing = frightT < spec.flashes * 0.45 && Math.floor(now / 230) % 2 === 0;
        body = flashing ? "#dedeff" : "#2121ff";
        face = flashing ? "#ff0000" : "#ffb8ae";
      }
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(x, y - r * 0.1, r, Math.PI, 0);
      const bottom = y + r * 0.9;
      ctx.lineTo(x + r, bottom);
      // chân váy lượn sóng, đổi kiểu theo nhịp
      const wave = Math.floor(now / 140) % 2;
      const n = 4;
      for (let i = 0; i < n; i++) {
        const x1 = x + r - ((i + 0.5) * 2 * r) / n;
        const x2 = x + r - ((i + 1) * 2 * r) / n;
        ctx.lineTo(x1, bottom - (wave ? r * 0.32 : r * 0.12));
        ctx.lineTo(x2, bottom - (wave ? 0 : r * 0.3) * (i === n - 1 ? 0 : 1));
      }
      ctx.closePath();
      ctx.fill();
      if (face) {
        // mặt hoảng sợ: mắt chấm + miệng răng cưa
        ctx.fillStyle = face;
        ctx.fillRect(x - r * 0.42, y - r * 0.35, r * 0.24, r * 0.24);
        ctx.fillRect(x + r * 0.18, y - r * 0.35, r * 0.24, r * 0.24);
        ctx.strokeStyle = face;
        ctx.lineWidth = Math.max(1, T * 0.1);
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) ctx.lineTo(x - r * 0.62 + (i * r * 1.24) / 6, y + r * (i % 2 ? 0.18 : 0.36));
        ctx.stroke();
        return;
      }
    }
    // mắt nhìn theo hướng đi
    const d = g.dir === STOP ? LEFT : g.dir;
    for (const s of [-1, 1]) {
      const ex = x + s * r * 0.38;
      const ey = y - r * 0.25;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(ex + d.x * r * 0.08, ey + d.y * r * 0.08, r * 0.28, r * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2121ff";
      ctx.beginPath();
      ctx.arc(ex + d.x * r * 0.2, ey + d.y * r * 0.22, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw(now) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // điểm số
    if (Math.floor(now / 270) % 2 === 0 || state === "title" || state === "over") text("1UP", 3, 0, "#fff");
    text("HIGH SCORE", 9, 0, "#fff");
    text(String(score || "00"), 7, 1, "#fff", "right");
    text(String(high || ""), 17, 1, "#fff", "right");

    // mê cung (nhấp nháy trắng khi qua màn)
    const flash = state === "clear" && stateT < 2 && Math.floor(stateT * 4) % 2 === 1;
    ctx.drawImage(flash ? mazeWhite : mazeBlue, 0, TOP * T);

    // chấm
    ctx.fillStyle = "#ffb8ae";
    const blinkOn = state !== "play" || Math.floor(now / 180) % 2 === 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const ch = grid[y] && grid[y][x];
        if (ch === ".") {
          const s = Math.max(2, Math.round(T * 0.25));
          ctx.fillRect((x + 0.5) * T - s / 2, (y + TOP + 0.5) * T - s / 2, s, s);
        } else if (ch === "o" && blinkOn) {
          ctx.beginPath();
          ctx.arc((x + 0.5) * T, (y + TOP + 0.5) * T, T * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
      }

    if (fruit && state !== "dying") {
      ctx.font = `${Math.round(T * 1.5)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(FRUITS[spec.fruit].e, 14 * T, (17.5 + TOP) * T);
    }

    // ma
    const intro = state === "ready" && stateT > 2 && level === 1 && score === 0; // lúc hiện "PLAYER ONE"
    const showGhosts = state !== "clear" && !(state === "dying" && stateT < 2) && state !== "title" && !intro;
    if (showGhosts)
      for (const g of ghosts) {
        if (eatInfo && eatInfo.g === g) continue;
        drawGhost(g, now);
      }

    // Pac-Man
    if (pac && state !== "title" && state !== "eat" && !intro) {
      const px = pac.x * T;
      const py = (pac.y + TOP) * T;
      if (state === "dying") {
        if (stateT < 2 && stateT > 0.35) {
          // miệng mở dần đến hết
          const k = Math.min(1, (2 - stateT) / 1.5);
          drawPac(px, py, -Math.PI / 2, 0.15 + k * (Math.PI - 0.15));
        } else if (stateT >= 2) drawPac(px, py, (pac.lastDir || LEFT).a, 0.35);
        else {
          ctx.strokeStyle = "#ffff00";
          ctx.lineWidth = Math.max(1, T * 0.12);
          for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4;
            ctx.beginPath();
            ctx.moveTo(px + Math.cos(a) * T * 0.35, py + Math.sin(a) * T * 0.35);
            ctx.lineTo(px + Math.cos(a) * T * 0.75, py + Math.sin(a) * T * 0.75);
            ctx.stroke();
          }
        }
      } else if (state !== "over") {
        const d = pac.dir === STOP ? pac.lastDir || LEFT : pac.dir;
        const mouth = state === "ready" ? 0.02 : 0.05 + Math.abs(Math.sin(pac.dist * Math.PI * 1.6)) * 0.75;
        drawPac(px, py, d.a, state === "clear" ? 0.02 : mouth);
      }
    }

    // điểm khi ăn ma / trái cây
    if (eatInfo) text(String(eatInfo.pts), eatInfo.g.x, eatInfo.g.y + TOP - 0.45, "#00ffff", "center");
    popups = popups.filter((p) => (p.t -= 1 / 60) > 0);
    for (const p of popups) text(p.text, p.x, p.y + TOP - 0.45, p.color, "center");

    if (state === "ready") {
      if (intro) text("PLAYER ONE", 14, 14 + TOP, "#00ffff", "center");
      text("READY!", 14, 17 + TOP, "#ffff00", "center");
    }
    if (state === "over") text("GAME  OVER", 14, 17 + TOP, "#ff0000", "center");

    // mạng còn lại và trái cây đã qua
    for (let i = 0; i < Math.min(lives - (state === "title" ? 0 : 1), 5); i++)
      drawPac((2.5 + i * 2) * T, (ROWS - 1) * T, Math.PI, 0.6, T * 0.75);
    ctx.font = `${Math.round(T * 1.3)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fruitsShown.forEach((f, i) => ctx.fillText(FRUITS[f].e, (25.5 - i * 2) * T, (ROWS - 1) * T));
  }

  // ---------- Điều khiển ----------
  const KEYS = {
    ArrowUp: UP,
    KeyW: UP,
    ArrowDown: DOWN,
    KeyS: DOWN,
    ArrowLeft: LEFT,
    KeyA: LEFT,
    ArrowRight: RIGHT,
    KeyD: RIGHT,
  };
  const steer = (d) => {
    if (pac) pac.next = d;
  };
  window.addEventListener("keydown", (e) => {
    if (KEYS[e.code]) {
      e.preventDefault();
      steer(KEYS[e.code]);
    } else if (e.code === "KeyP" || e.code === "Escape") togglePause();
    else if ((e.code === "Enter" || e.code === "Space") && !$("#start").hidden) {
      e.preventDefault();
      newGame();
    }
  });
  // vuốt
  let touch0 = null;
  window.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      touch0 = { x: t.clientX, y: t.clientY };
    },
    { passive: true },
  );
  window.addEventListener(
    "touchmove",
    (e) => {
      if (!touch0) return;
      const t = e.touches[0];
      const dx = t.clientX - touch0.x;
      const dy = t.clientY - touch0.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
      steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : dy > 0 ? DOWN : UP);
      touch0 = { x: t.clientX, y: t.clientY };
    },
    { passive: true },
  );
  document.querySelectorAll(".dpad button").forEach((b) =>
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      steer({ up: UP, down: DOWN, left: LEFT, right: RIGHT }[b.dataset.d]);
    }),
  );

  function togglePause(force) {
    if (state === "title" || state === "over") return;
    paused = force ?? !paused;
    $("#pause").hidden = !paused;
    if (paused) setSiren("off");
  }
  document.addEventListener("visibilitychange", () => document.hidden && togglePause(true));
  $("#btnResume").addEventListener("click", () => togglePause(false));
  $("#btnPlay").addEventListener("click", newGame);
  const soundBtn = $("#btnSound");
  const refreshSound = () => (soundBtn.textContent = muted ? "🔇" : "🔊");
  soundBtn.addEventListener("click", () => {
    muted = !muted;
    if (muted) setSiren("off");
    try {
      localStorage.setItem("gamevui-pacman-muted", muted ? "1" : "0");
    } catch {
      /* bỏ qua */
    }
    refreshSound();
    soundBtn.blur();
  });
  refreshSound();

  // ---------- Vòng lặp (bước cố định 60 lần/giây) ----------
  const STEP = 1 / 60;
  let acc = 0;
  let last = performance.now();
  function loop(now) {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused)
      while (acc >= STEP) {
        update(STEP);
        acc -= STEP;
      }
    else acc = 0;
    draw(now);
    requestAnimationFrame(loop);
  }

  window.addEventListener("resize", fit);
  fit();
  resetGrid();
  // màn chờ: vẽ mê cung phía sau màn mở đầu
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => draw(performance.now()));
  requestAnimationFrame(loop);
})();
