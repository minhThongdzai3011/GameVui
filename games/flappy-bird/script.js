// Flappy Bird — tái hiện game gốc (2013) càng sát càng tốt.
// Khung hình logic 288×512, 1 "pixel art" = 2px logic như bộ sprite gốc.
// Thông số vật lý quy đổi từ bản gốc chạy 30fps sang bước cố định 60fps;
// toàn bộ hình ảnh và âm thanh được vẽ / tổng hợp mới bằng canvas + WebAudio.
(() => {
  "use strict";

  // ---------- Cấu hình ----------
  const W = 288;
  const H = 512;
  const GROUND_Y = 400;
  const STEP = 1000 / 60;
  const FADE_FRAMES = 12;

  const CFG = {
    GRAVITY: 0.25, // 1px/frame² @30fps
    FLAP_VELOCITY: -4.5, // -9px/frame @30fps
    MAX_FALL_SPEED: 5, // 10px/frame @30fps
    ROT_FLAP: 45, // góc ngóc đầu sau mỗi lần vỗ cánh
    ROT_SPEED: 1.5, // độ/frame chúi đầu xuống
    ROT_VISIBLE_MAX: 20, // góc hiển thị tối đa khi ngóc lên
    DEATH_GRAVITY: 0.5,
    DEATH_MAX_FALL: 7.5,
    DEATH_ROT_SPEED: 3.5,
    PIPE_SPEED: 2, // 120px/s
    PIPE_W: 52,
    PIPE_GAP: 100,
    PIPE_SPACING: 144,
    FIRST_PIPE_X: W + 200,
    GAP_MIN: 80, // 20% chiều cao vùng chơi
    GAP_RANGE: 140, // 60% vùng chơi trừ khe
    BIRD_X: 57, // 20% chiều rộng màn hình
    BIRD_W: 36,
    BIRD_H: 24,
    WING_FRAMES: 6, // đổi khung cánh mỗi 100ms
  };

  const OUT = "#543847"; // màu viền chung của bộ sprite gốc
  const PLAY_BTN = { x: 92, y: 326, w: 104, h: 58 };
  const PAUSE_BTN = { x: 12, y: 12, w: 26, h: 28 };
  const PANEL = { x: 31, y: 186, w: 226, h: 114 };
  const PANEL_IN = 40;
  const COUNT_START = 70;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const soundBtn = document.getElementById("btnSound");

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
        /* chế độ ẩn danh: bỏ qua */
      }
    },
  };

  // ---------- Tiện ích vẽ pixel ----------
  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d");
    x.imageSmoothingEnabled = false;
    return [c, x];
  }

  function paint(x, rows, pal, ox = 0, oy = 0, px = 2) {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const col = pal[row[c]];
        if (!col) continue;
        x.fillStyle = col;
        x.fillRect(ox + c * px, oy + r * px, px, px);
      }
    }
  }

  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const [buf, g] = makeCanvas(W, H);

  // Hình chữ nhật bo góc kiểu pixel (cắt 2px ở 4 góc)
  function box(x, y, w, h, color) {
    g.fillStyle = color;
    g.fillRect(x + 2, y, w - 4, h);
    g.fillRect(x, y + 2, w, h - 4);
  }

  // ---------- Font bitmap nét dày (giống phong cách 04b_19) ----------
  const FONT = {
    0: [".###.", "##.##", "##.##", "##.##", "##.##", "##.##", ".###."],
    1: [".##", "###", ".##", ".##", ".##", ".##", ".##"],
    2: [".###.", "##.##", "...##", "..##.", ".##..", "##...", "#####"],
    3: ["####.", "...##", "...##", ".###.", "...##", "...##", "####."],
    4: ["...##", "..###", ".####", "##.##", "#####", "...##", "...##"],
    5: ["#####", "##...", "####.", "...##", "...##", "##.##", ".###."],
    6: [".###.", "##...", "####.", "##.##", "##.##", "##.##", ".###."],
    7: ["#####", "...##", "..##.", "..##.", ".##..", ".##..", ".##.."],
    8: [".###.", "##.##", "##.##", ".###.", "##.##", "##.##", ".###."],
    9: [".###.", "##.##", "##.##", ".####", "...##", "...##", ".###."],
    A: [".###.", "##.##", "##.##", "#####", "##.##", "##.##", "##.##"],
    B: ["####.", "##.##", "##.##", "####.", "##.##", "##.##", "####."],
    C: [".###.", "##.##", "##...", "##...", "##...", "##.##", ".###."],
    D: ["####.", "##.##", "##.##", "##.##", "##.##", "##.##", "####."],
    E: ["#####", "##...", "##...", "####.", "##...", "##...", "#####"],
    F: ["#####", "##...", "##...", "####.", "##...", "##...", "##..."],
    G: [".####", "##...", "##...", "##.##", "##.##", "##.##", ".####"],
    I: ["##", "##", "##", "##", "##", "##", "##"],
    L: ["##...", "##...", "##...", "##...", "##...", "##...", "#####"],
    M: [
      "##...##",
      "###.###",
      "#######",
      "##.#.##",
      "##...##",
      "##...##",
      "##...##",
    ],
    N: ["##..##", "###.##", "######", "##.###", "##..##", "##..##", "##..##"],
    O: [".###.", "##.##", "##.##", "##.##", "##.##", "##.##", ".###."],
    P: ["####.", "##.##", "##.##", "####.", "##...", "##...", "##..."],
    R: ["####.", "##.##", "##.##", "####.", "##.##", "##.##", "##.##"],
    S: [".####", "##...", "##...", ".###.", "...##", "...##", "####."],
    T: ["######", "..##..", "..##..", "..##..", "..##..", "..##..", "..##.."],
    U: ["##.##", "##.##", "##.##", "##.##", "##.##", "##.##", ".###."],
    V: ["##.##", "##.##", "##.##", "##.##", "##.##", ".###.", "..#.."],
    W: [
      "##...##",
      "##...##",
      "##...##",
      "##.#.##",
      "#######",
      "###.###",
      "##...##",
    ],
    Y: ["##..##", "##..##", ".####.", "..##..", "..##..", "..##..", "..##.."],
    "!": ["##", "##", "##", "##", "##", "..", "##"],
  };

  function textWidth(str, s, sp) {
    let w = 0;
    for (const ch of str) w += ((FONT[ch] ? FONT[ch][0].length : 3) + sp) * s;
    return w - sp * s;
  }

  // o = { s: cỡ pixel, fill, c1/o1: viền trong, c2/o2: viền ngoài, align, sp }
  function drawText(str, x, y, o) {
    const s = o.s || 2;
    const sp = o.sp ?? 1;
    const w = textWidth(str, s, sp);
    let cx =
      o.align === "right" ? x - w : o.align === "left" ? x : Math.round(x - w / 2);
    const px = [];
    for (const ch of str) {
      const gl = FONT[ch];
      if (!gl) {
        cx += (3 + sp) * s;
        continue;
      }
      gl.forEach((row, r) => {
        for (let c = 0; c < row.length; c++)
          if (row[c] === "#") px.push(cx + c * s, y + r * s);
      });
      cx += (gl[0].length + sp) * s;
    }
    const pass = (pad, color) => {
      g.fillStyle = color;
      for (let i = 0; i < px.length; i += 2)
        g.fillRect(px[i] - pad, px[i + 1] - pad, s + pad * 2, s + pad * 2);
    };
    if (o.c2) pass((o.o1 || 0) + (o.o2 || 0), o.c2);
    if (o.c1) pass(o.o1 || 0, o.c1);
    pass(0, o.fill);
  }

  const STYLE = {
    score: { s: 4, fill: "#fff", c1: "#000", o1: 2 },
    logo: { s: 4, fill: "#fff", c1: "#73bf2e", o1: 2, c2: OUT, o2: 2 },
    ready: { s: 4, fill: "#6fc94a", c1: "#fff", o1: 2, c2: OUT, o2: 2 },
    over: { s: 4, fill: "#fc9a3c", c1: "#fff", o1: 2, c2: OUT, o2: 2 },
    label: { s: 2, fill: "#e86b31" },
    small: { s: 2, fill: "#fff", c1: "#000", o1: 2 },
    tap: { s: 2, fill: "#f8582c", c1: "#fff", o1: 2 },
    badge: { s: 1, fill: "#fff" },
  };

  // ---------- Sprite chim (18×12 pixel art, 3 khung cánh, 3 màu) ----------
  const BIRD_BODY = [
    "......KKKKKKK.....",
    "....KKhhyyKeeK....",
    "...KhhyyyKeeeeK...",
    "..KyyyyyyKeeeKeK..",
    ".KyyyyyyyKeeeKeK..",
    ".KyyyyyyyyKeeeeK..",
    ".KyyyyyyyyyKKKKKK.",
    ".KyyyyyyyyKrrrrrrK",
    "..KooooooKrKKKKKK.",
    "..KoooooooKrrrrrK.",
    "...KKoooooKKKKK...",
    ".....KKKKK........",
  ];
  const WINGS = [
    // cánh vẩy lên
    { y: 2, rows: [".KKK...", "KwwwK..", "KwwwwK.", "KwwwwwK", ".KKKKK."] },
    // cánh ngang
    { y: 4, rows: [".KKKK..", "KwwwwK.", "KwwwwwK", "KywwwyK", ".KKKKK."] },
    // cánh cụp xuống
    { y: 6, rows: [".KKKKK.", "KwwwwwK", ".KwwwwK", "..KwwK.", "...KK.."] },
  ];
  const BIRD_BASE = { K: OUT, e: "#ffffff", w: "#fbf7e6", r: "#f75c2a" };
  const BIRD_COLORS = {
    yellow: { h: "#fdf3a6", y: "#f8c52c", o: "#f2a52c" },
    blue: { h: "#c8f2f8", y: "#56bcd8", o: "#3b93bf" },
    red: { h: "#fcc6b4", y: "#ea5b3f", o: "#c93b2c" },
  };

  const BIRD = {};
  for (const [name, cols] of Object.entries(BIRD_COLORS)) {
    const pal = { ...BIRD_BASE, ...cols };
    BIRD[name] = WINGS.map((wing) => {
      const [c, x] = makeCanvas(CFG.BIRD_W, CFG.BIRD_H);
      paint(x, BIRD_BODY, pal);
      paint(x, wing.rows, pal, 0, wing.y * 2);
      // Mặt nạ va chạm từng pixel (như bản gốc)
      const data = x.getImageData(0, 0, CFG.BIRD_W, CFG.BIRD_H).data;
      const mask = new Uint8Array(CFG.BIRD_W * CFG.BIRD_H);
      for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 0 ? 1 : 0;
      return { img: c, mask };
    });
  }

  // ---------- Ống nước ----------
  const PIPE = (() => {
    const P = {
      K: OUT,
      L: "#9ce659",
      H: "#e4fd8b",
      M: "#73bf2e",
      D: "#558022",
      S: "#43701a",
    };
    const cols = (n) =>
      Array.from({ length: n }, (_, i) => {
        const f = i / (n - 1);
        if (i === 0 || i === n - 1) return "K";
        if (f < 0.1) return "L";
        if (f < 0.16) return "H";
        if (f < 0.28) return "L";
        if (f < 0.62) return "M";
        if (f < 0.8) return i % 2 ? "D" : "M";
        return i % 2 ? "S" : "D";
      });
    const [body, bx] = makeCanvas(48, 2);
    cols(24).forEach((k, i) => {
      bx.fillStyle = P[k];
      bx.fillRect(i * 2, 0, 2, 2);
    });
    const [cap, cx] = makeCanvas(52, 24);
    cols(26).forEach((k, i) => {
      cx.fillStyle = P[k];
      cx.fillRect(i * 2, 0, 2, 24);
    });
    cx.fillStyle = P.D;
    cx.fillRect(2, 18, 48, 2);
    cx.fillStyle = OUT;
    cx.fillRect(0, 0, 52, 2);
    cx.fillRect(0, 22, 52, 2);
    return { body, cap };
  })();

  // ---------- Mặt đất (chu kỳ sọc 12px) ----------
  const GROUND = (() => {
    const w = W + 24;
    const h = H - GROUND_Y;
    const [c, x] = makeCanvas(w, h);
    x.fillStyle = "#ded895";
    x.fillRect(0, 0, w, h);
    x.fillStyle = OUT;
    x.fillRect(0, 0, w, 2);
    x.fillStyle = "#e4fd8b";
    x.fillRect(0, 2, w, 2);
    for (let ax = 0; ax < w / 2; ax++)
      for (let ay = 0; ay < 6; ay++) {
        x.fillStyle = (ax + ay) % 6 < 3 ? "#9ce659" : "#73bf2e";
        x.fillRect(ax * 2, 4 + ay * 2, 2, 2);
      }
    x.fillStyle = "#558022";
    x.fillRect(0, 16, w, 2);
    x.fillStyle = "#cbbf6e";
    x.fillRect(0, 18, w, 2);
    return c;
  })();

  // ---------- Nền ngày / đêm (mây, thành phố, bụi cây) ----------
  const THEMES = {
    day: {
      sky: "#4ec0ca",
      cloud: "#e9fcd9",
      cloudEdge: "#ffffff",
      bld: "#dcf5ce",
      bldEdge: "#a6dfb8",
      win: "#b9e8c6",
      winOff: null,
      bush: "#5ee270",
      bushEdge: "#45c35a",
    },
    night: {
      sky: "#008793",
      cloud: "#0f6f86",
      cloudEdge: "#1a8a9a",
      bld: "#0d4f5e",
      bldEdge: "#083b47",
      win: "#f2d94f",
      winOff: "#0a4250",
      bush: "#1f9150",
      bushEdge: "#13703a",
    },
  };

  function buildBackground(T) {
    const [c, x] = makeCanvas(W, GROUND_Y);
    const AW = W / 2;
    const AH = GROUND_Y / 2;
    const r = rng(2013); // cùng bố cục cho cả ngày và đêm
    const lit = rng(42);
    const rand = (a, b) => a + r() * (b - a);
    x.fillStyle = T.sky;
    x.fillRect(0, 0, W, GROUND_Y);

    const bumps = (baseY, rMin, rMax, sMin, sMax) => {
      const list = [];
      for (let cx = -4; cx < AW + rMax; cx += rand(sMin, sMax))
        list.push({ x: cx, y: baseY + rand(-2, 2), r: rand(rMin, rMax) });
      return list;
    };
    const silhouette = (list, fill, edge) => {
      const tops = new Array(AW).fill(AH);
      for (const b of list)
        for (let ax = 0; ax < AW; ax++) {
          const dx = ax + 0.5 - b.x;
          if (Math.abs(dx) >= b.r) continue;
          const t = Math.round(b.y - Math.sqrt(b.r * b.r - dx * dx));
          if (t < tops[ax]) tops[ax] = t;
        }
      for (let ax = 0; ax < AW; ax++) {
        const t = tops[ax];
        if (t >= AH) continue;
        const nb = Math.min(
          AH,
          Math.max(t + 1, tops[ax - 1] ?? AH, tops[ax + 1] ?? AH),
        );
        x.fillStyle = edge;
        x.fillRect(ax * 2, t * 2, 2, (nb - t) * 2);
        x.fillStyle = fill;
        x.fillRect(ax * 2, nb * 2, 2, (AH - nb) * 2);
      }
    };

    silhouette(bumps(176, 9, 16, 9, 15), T.cloud, T.cloudEdge);

    let bx = -3;
    while (bx < AW) {
      const bw = Math.round(rand(6, 12));
      const top = Math.round(rand(166, 184));
      x.fillStyle = T.bldEdge;
      x.fillRect(bx * 2, top * 2, bw * 2, (AH - top) * 2);
      x.fillStyle = T.bld;
      x.fillRect((bx + 1) * 2, (top + 1) * 2, (bw - 2) * 2, (AH - top - 1) * 2);
      for (let wy = top + 3; wy < AH - 3; wy += 3)
        for (let wx = bx + 2; wx < bx + bw - 2; wx += 2) {
          x.fillStyle = T.winOff && lit() < 0.55 ? T.winOff : T.win;
          x.fillRect(wx * 2, wy * 2, 2, 2);
        }
      bx += bw - 1 + Math.round(rand(0, 3));
    }

    silhouette(bumps(199, 6, 11, 6, 11), T.bush, T.bushEdge);
    return c;
  }
  const BG = { day: buildBackground(THEMES.day), night: buildBackground(THEMES.night) };

  // ---------- Biểu tượng giao diện ----------
  const TRI = ["KK.....", "KgKK...", "KgggKK.", "KgggggK", "KgggKK.", "KgKK...", "KK....."];
  const ARROW = [
    "...KK...",
    "..KwwK..",
    ".KwwwwK.",
    "KwwwwwwK",
    "KKKwwKKK",
    "..KwwK..",
    "..KKKK..",
  ];
  const HAND = [
    "...KK.....",
    "..KwwK....",
    "..KwwK....",
    "..KwwKKK..",
    ".KKwwKwwKK",
    "KwKwwwwwwK",
    "KwwwwwwwwK",
    ".KwwwwwwK.",
    "..KwwwwwK.",
    "..KKKKKK..",
  ];
  const UI_PAL = { K: OUT, w: "#fff", g: "#5ec43a" };

  const MEDALS = {
    bronze: { rim: "#b8692c", face: "#e2924a", hi: "#f8c99a" },
    silver: { rim: "#9b9ba3", face: "#d6d6dc", hi: "#ffffff" },
    gold: { rim: "#c99112", face: "#f6cd3c", hi: "#fff2a6" },
    platinum: { rim: "#8fb7bd", face: "#dff3f3", hi: "#ffffff" },
  };
  const medalFor = (s) =>
    s >= 40 ? "platinum" : s >= 30 ? "gold" : s >= 20 ? "silver" : s >= 10 ? "bronze" : null;

  // ---------- Âm thanh (tổng hợp bằng WebAudio) ----------
  let actx = null;
  let noiseBuf = null;
  let muted = store.get("gamevui-flappy-muted") === "1";

  function audio() {
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
  function envelope(a, t, peak, attack, dur) {
    const gain = a.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    gain.connect(a.destination);
    return gain;
  }
  function noise(a, t, dur, filterType, f0, f1, peak, attack) {
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    const f = a.createBiquadFilter();
    f.type = filterType;
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    src.connect(f).connect(envelope(a, t, peak, attack, dur));
    src.start(t);
    src.stop(t + dur + 0.02);
  }
  function tone(a, type, f0, f1, t, dur, peak) {
    const o = a.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(envelope(a, t, peak, 0.005, dur));
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  const sfx = {
    wing() {
      const a = audio();
      if (a) noise(a, a.currentTime, 0.1, "bandpass", 900, 2400, 0.4, 0.01);
    },
    point() {
      const a = audio();
      if (!a) return;
      const t = a.currentTime;
      tone(a, "triangle", 1320, 1320, t, 0.08, 0.25);
      tone(a, "triangle", 1760, 1760, t + 0.07, 0.24, 0.25);
      tone(a, "sine", 3520, 3520, t + 0.07, 0.16, 0.05);
    },
    hit() {
      const a = audio();
      if (!a) return;
      const t = a.currentTime;
      noise(a, t, 0.14, "lowpass", 1600, 400, 0.6, 0.002);
      tone(a, "sine", 190, 60, t, 0.15, 0.5);
    },
    die() {
      const a = audio();
      if (a) tone(a, "triangle", 640, 160, a.currentTime, 0.5, 0.25);
    },
    swoosh() {
      const a = audio();
      if (a) noise(a, a.currentTime, 0.3, "bandpass", 400, 2800, 0.3, 0.12);
    },
  };

  function refreshSoundBtn() {
    soundBtn.textContent = muted ? "🔇 Âm thanh: Tắt" : "🔊 Âm thanh: Bật";
    soundBtn.setAttribute("aria-pressed", String(!muted));
  }
  soundBtn.addEventListener("click", () => {
    muted = !muted;
    store.set("gamevui-flappy-muted", muted ? "1" : "0");
    refreshSoundBtn();
    soundBtn.blur();
  });
  refreshSoundBtn();

  // ---------- Trạng thái game ----------
  // mode: title → ready → play → dying → over → (ready...)
  let mode = "title";
  let tick = 0;
  let theme = "day";
  let bird;
  let pipes = [];
  let score = 0;
  let best = Number(store.get("gamevui-flappy-best")) || 0;
  let newBest = false;
  let shownScore = 0;
  let groundShift = 0;
  let wingTimer = 0;
  let wingStep = 0;
  let flash = 0;
  let fade = null;
  let pending = null;
  let pressed = null;
  let paused = false;
  let crashedGround = false;
  let dieAt = -1;
  let overT = 0;
  let doneAt = -1;
  let sparkle = { t: 0, x: 0, y: 0 };

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function resetRound() {
    theme = Math.random() < 0.5 ? "day" : "night";
    bird = {
      color: pick(Object.keys(BIRD_COLORS)),
      x: CFG.BIRD_X,
      y: 232,
      baseY: 232,
      vy: 0,
      rot: 0,
      frame: 1,
      flapped: false,
    };
    pipes = [];
    score = 0;
    shownScore = 0;
    newBest = false;
    flash = 0;
    paused = false;
    crashedGround = false;
    dieAt = -1;
    overT = 0;
    doneAt = -1;
  }

  function newPipe(x) {
    return {
      x,
      top: CFG.GAP_MIN + Math.floor(Math.random() * CFG.GAP_RANGE),
      scored: false,
    };
  }

  function startFade(cb) {
    sfx.swoosh();
    fade = { t: 0, cb };
  }

  function pressButton(name, action) {
    pressed = name;
    pending = {
      at: tick + 6,
      action: () => {
        pressed = null;
        action();
      },
    };
  }

  function goReady() {
    startFade(() => {
      resetRound();
      mode = "ready";
    });
  }

  function startPlay() {
    mode = "play";
    pipes = [newPipe(CFG.FIRST_PIPE_X)];
    flap();
  }

  function flap() {
    if (bird.y <= -2 * CFG.BIRD_H) return;
    bird.vy = CFG.FLAP_VELOCITY;
    bird.flapped = true;
    sfx.wing();
  }

  function togglePause() {
    if (mode !== "play") return;
    paused = !paused;
  }

  const visibleRot = () => Math.min(bird.rot, CFG.ROT_VISIBLE_MAX);

  // Nửa chiều cao của chim theo góc xoay (để chim nằm sát mặt đất khi chết)
  function birdBottom() {
    const a = (visibleRot() * Math.PI) / 180;
    return bird.y + 12 + 17 * Math.abs(Math.sin(a)) + 12 * Math.abs(Math.cos(a));
  }

  function pipeRects(p) {
    const bot = p.top + CFG.PIPE_GAP;
    return [
      [p.x, p.top - 24, 52, 24],
      [p.x + 2, -1000, 48, p.top - 24 + 1000],
      [p.x, bot, 52, 24],
      [p.x + 2, bot + 24, 48, GROUND_Y - bot - 24],
    ];
  }

  function maskHit(mask, r) {
    const fx = Math.floor(bird.x);
    const fy = Math.floor(bird.y);
    const x0 = Math.max(fx, r[0]);
    const x1 = Math.min(fx + CFG.BIRD_W, r[0] + r[2]);
    const y0 = Math.max(fy, r[1]);
    const y1 = Math.min(fy + CFG.BIRD_H, r[1] + r[3]);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++)
        if (mask[(y - fy) * CFG.BIRD_W + (x - fx)]) return true;
    return false;
  }

  function hitPipe() {
    const mask = BIRD[bird.color][bird.frame].mask;
    return pipes.some((p) => pipeRects(p).some((r) => maskHit(mask, r)));
  }

  function crash(onGround) {
    mode = "dying";
    crashedGround = onGround;
    bird.rot = visibleRot();
    flash = 1;
    sfx.hit();
    if (!onGround) dieAt = tick + 18;
  }

  function land() {
    bird.y = GROUND_Y - (birdBottom() - bird.y);
    mode = "over";
    overT = 0;
    doneAt = -1;
    if (score > best) {
      best = score;
      newBest = true;
      store.set("gamevui-flappy-best", String(best));
    }
  }

  const buttonsReady = () => mode === "over" && doneAt >= 0 && overT >= doneAt + 10;

  // ---------- Cập nhật (bước cố định 60fps) ----------
  function update() {
    tick++;
    if (pending && tick >= pending.at) {
      const a = pending.action;
      pending = null;
      a();
    }
    if (fade) {
      fade.t++;
      if (fade.t === FADE_FRAMES) fade.cb();
      if (fade.t >= FADE_FRAMES * 2) fade = null;
    }
    if (paused) return;
    if (tick === dieAt) sfx.die();
    if (flash > 0) flash = Math.max(0, flash - 0.08);

    if (mode === "title" || mode === "ready" || mode === "play") {
      groundShift = (groundShift + CFG.PIPE_SPEED) % 12;
      if (++wingTimer >= CFG.WING_FRAMES) {
        wingTimer = 0;
        wingStep = (wingStep + 1) % 4;
        bird.frame = [0, 1, 2, 1][wingStep];
      }
    }

    if (mode === "title" || mode === "ready") {
      bird.y = bird.baseY + Math.round(Math.sin((tick / 48) * Math.PI * 2) * 4);
    } else if (mode === "play") {
      if (bird.rot > -90) bird.rot -= CFG.ROT_SPEED;
      if (!bird.flapped)
        bird.vy = Math.min(CFG.MAX_FALL_SPEED, bird.vy + CFG.GRAVITY);
      else {
        bird.flapped = false;
        bird.rot = CFG.ROT_FLAP;
      }
      bird.y += Math.min(bird.vy, GROUND_Y - bird.y - CFG.BIRD_H);

      const birdMid = bird.x + CFG.BIRD_W / 2;
      for (const p of pipes) {
        p.x -= CFG.PIPE_SPEED;
        if (!p.scored && p.x + CFG.PIPE_W / 2 <= birdMid) {
          p.scored = true;
          score++;
          sfx.point();
        }
      }
      if (pipes.length && pipes[0].x < -CFG.PIPE_W) pipes.shift();
      const last = pipes[pipes.length - 1];
      if (last.x + CFG.PIPE_SPACING <= W + 10)
        pipes.push(newPipe(last.x + CFG.PIPE_SPACING));

      if (birdBottom() >= GROUND_Y - 1) crash(true);
      else if (hitPipe()) crash(false);
    } else if (mode === "dying") {
      if (!crashedGround && bird.rot > -90)
        bird.rot = Math.max(-90, bird.rot - CFG.DEATH_ROT_SPEED);
      bird.vy = Math.min(CFG.DEATH_MAX_FALL, bird.vy + CFG.DEATH_GRAVITY);
      bird.y += bird.vy;
      if (birdBottom() >= GROUND_Y) land();
    } else if (mode === "over") {
      overT++;
      if (overT === PANEL_IN) sfx.swoosh();
      if (overT >= COUNT_START) {
        if (shownScore < score)
          shownScore = Math.min(score, shownScore + Math.max(1, Math.round(score / 40)));
        else if (doneAt < 0) doneAt = overT;
      }
      if (doneAt >= 0) {
        sparkle.t = (sparkle.t + 1) % 30;
        if (sparkle.t === 0) {
          const ang = Math.random() * Math.PI * 2;
          const d = Math.random() * 15;
          sparkle.x = Math.round(Math.cos(ang) * d);
          sparkle.y = Math.round(Math.sin(ang) * d);
        }
      }
    }
  }

  // ---------- Vẽ ----------
  function drawPipe(p) {
    const top = p.top;
    const bot = p.top + CFG.PIPE_GAP;
    g.drawImage(PIPE.body, p.x + 2, 0, 48, top - 24);
    g.drawImage(PIPE.cap, p.x, top - 24);
    g.drawImage(PIPE.body, p.x + 2, bot + 24, 48, GROUND_Y - bot - 24);
    g.drawImage(PIPE.cap, p.x, bot);
  }

  function drawBird() {
    const spr = BIRD[bird.color][bird.frame];
    const rot = mode === "title" || mode === "ready" ? 0 : visibleRot();
    g.save();
    g.translate(Math.round(bird.x + 18), Math.round(bird.y + 12));
    g.rotate((-rot * Math.PI) / 180);
    g.drawImage(spr.img, -18, -12);
    g.restore();
  }

  function drawPlayButton() {
    const isDown = pressed === "play";
    const { x, w, h } = PLAY_BTN;
    const y = PLAY_BTN.y + (isDown ? 3 : 0);
    if (!isDown) box(x, y + 3, w, h, "rgba(84,56,71,0.35)");
    box(x, y, w, h, OUT);
    box(x + 2, y + 2, w - 4, h - 4, "#fff");
    g.fillStyle = "#e6e6e6";
    g.fillRect(x + 4, y + h - 10, w - 8, 6);
    paint(g, TRI, UI_PAL, x + w / 2 - 9, y + (h - 6) / 2 - 10, 3);
  }

  function drawPauseButton() {
    const { x, y, w, h } = PAUSE_BTN;
    box(x, y, w, h, OUT);
    box(x + 2, y + 2, w - 4, h - 4, "#fff");
    box(x + 4, y + 4, w - 8, h - 8, "#f0883a");
    if (paused) {
      paint(g, TRI, UI_PAL, x + 7, y + 7);
    } else {
      g.fillStyle = OUT;
      g.fillRect(x + 7, y + 7, 5, 14);
      g.fillRect(x + 14, y + 7, 5, 14);
      g.fillStyle = "#fff";
      g.fillRect(x + 8, y + 8, 3, 12);
      g.fillRect(x + 15, y + 8, 3, 12);
    }
  }

  function drawMedal(cx, cy, kind) {
    const R = 11;
    const C = MEDALS[kind];
    for (let ay = -R; ay < R; ay++)
      for (let ax = -R; ax < R; ax++) {
        const dx = ax + 0.5;
        const dy = ay + 0.5;
        const d = Math.hypot(dx, dy);
        if (d > R) continue;
        let col;
        if (!C) col = "#d2c47a";
        else if (d > R - 1) col = OUT;
        else if (d > R - 2.5) col = dx + dy < -R * 0.6 ? C.hi : C.rim;
        else if (d > R - 6 && d < R - 4.8) col = C.rim;
        else col = dx + dy < -6 && d < R - 6 ? C.hi : C.face;
        g.fillStyle = col;
        g.fillRect(cx + ax * 2, cy + ay * 2, 2, 2);
      }
  }

  function drawPanel(py) {
    const { x, w, h } = PANEL;
    box(x, py, w, h, OUT);
    box(x + 2, py + 2, w - 4, h - 4, "#ded895");
    box(x + 6, py + 6, w - 12, h - 12, "#cbbd6d");
    box(x + 8, py + 8, w - 16, h - 16, "#ded895");

    const mx = x + 56;
    const my = py + 64;
    drawText("MEDAL", mx, py + 16, STYLE.label);
    const done = doneAt >= 0;
    const medal = done ? medalFor(score) : null;
    drawMedal(mx, my, medal);
    if (medal) {
      const st = sparkle.t;
      const size = st < 8 ? 1 : st < 16 ? 2 : st < 24 ? 1 : 0;
      if (size) {
        const s = size * 2;
        const sx = mx + sparkle.x;
        const sy = my + sparkle.y;
        g.fillStyle = "#fff";
        g.fillRect(sx - 1, sy - 1 - s, 2, 2 + 2 * s);
        g.fillRect(sx - 1 - s, sy - 1, 2 + 2 * s, 2);
      }
    }

    const rx = x + w - 18;
    drawText("SCORE", rx, py + 16, { ...STYLE.label, align: "right" });
    drawText(String(shownScore), rx, py + 34, { ...STYLE.small, align: "right" });
    drawText("BEST", rx, py + 60, { ...STYLE.label, align: "right" });
    drawText(String(best), rx, py + 78, { ...STYLE.small, align: "right" });
    if (done && newBest) {
      const bxp = rx - textWidth("BEST", 2, 1) - 36;
      box(bxp, py + 59, 30, 15, "#f73a2e");
      drawText("NEW", bxp + 15, py + 63, STYLE.badge);
    }
  }

  function drawTitle() {
    drawText("FLAPPY BIRD", W / 2, 110, STYLE.logo);
    drawPlayButton();
  }

  function drawReady() {
    drawText("GET READY!", W / 2, 110, STYLE.ready);
    g.globalAlpha = 0.45;
    g.drawImage(BIRD[bird.color][1].img, W / 2 - 18, 176);
    g.globalAlpha = 1;
    paint(g, ARROW, UI_PAL, W / 2 - 8, 210);
    paint(g, HAND, UI_PAL, W / 2 - 10, 232);
    drawText("TAP", 96, 268, STYLE.tap);
    drawText("TAP", 192, 268, STYLE.tap);
  }

  function drawOver() {
    const t = overT;
    const yOff = t < 18 ? Math.round(-Math.sin((t / 18) * Math.PI) * 8) : 0;
    g.globalAlpha = Math.min(1, t / 12);
    drawText("GAME OVER", W / 2, 128 + yOff, STYLE.over);
    g.globalAlpha = 1;
    if (t >= PANEL_IN) {
      const p = Math.min(1, (t - PANEL_IN) / 22);
      const e = 1 - Math.pow(1 - p, 3);
      drawPanel(Math.round(H + (PANEL.y - H) * e));
    }
    if (buttonsReady()) drawPlayButton();
  }

  function render() {
    g.drawImage(BG[theme], 0, 0);
    for (const p of pipes) drawPipe(p);
    g.drawImage(GROUND, -groundShift, GROUND_Y);
    drawBird();

    if (mode === "title") drawTitle();
    else if (mode === "ready") drawReady();
    else if (mode === "over") drawOver();
    if (mode === "ready" || mode === "play" || mode === "dying")
      drawText(String(score), W / 2, 36, STYLE.score);
    if (mode === "play") drawPauseButton();

    if (flash > 0) {
      g.fillStyle = `rgba(255,255,255,${flash})`;
      g.fillRect(0, 0, W, H);
    }
    if (fade) {
      const a =
        fade.t < FADE_FRAMES ? fade.t / FADE_FRAMES : 1 - (fade.t - FADE_FRAMES) / FADE_FRAMES;
      g.fillStyle = `rgba(0,0,0,${a})`;
      g.fillRect(0, 0, W, H);
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, canvas.width, canvas.height);
  }

  // ---------- Điều khiển ----------
  const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

  function handlePress(p) {
    if (fade || pending) return;
    if (mode === "title") {
      if (inRect(p, PLAY_BTN)) pressButton("play", goReady);
    } else if (mode === "ready") {
      startPlay();
    } else if (mode === "play") {
      if (inRect(p, PAUSE_BTN)) togglePause();
      else if (!paused) flap();
    } else if (mode === "over") {
      if (buttonsReady() && inRect(p, PLAY_BTN)) pressButton("play", goReady);
    }
  }

  function handleKey() {
    if (fade || pending) return;
    if (mode === "title") pressButton("play", goReady);
    else if (mode === "ready") startPlay();
    else if (mode === "play") paused ? togglePause() : flap();
    else if (mode === "over" && buttonsReady()) pressButton("play", goReady);
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    audio();
    const r = canvas.getBoundingClientRect();
    handlePress({
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
    });
  });

  window.addEventListener("keydown", (e) => {
    if (["Space", "ArrowUp", "KeyW", "Enter"].includes(e.code)) {
      e.preventDefault();
      if (e.repeat) return;
      audio();
      handleKey();
    } else if (e.code === "KeyP" || e.code === "Escape") {
      togglePause();
    }
  });

  const autoPause = () => {
    if (mode === "play") paused = true;
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) autoPause();
  });
  window.addEventListener("blur", autoPause);

  // ---------- Kích thước canvas theo màn hình ----------
  function fit() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(canvas);
  else window.addEventListener("resize", fit);
  fit();

  // ---------- Vòng lặp chính ----------
  resetRound();
  bird.x = W / 2 - 18;
  bird.baseY = 196;

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    acc += Math.min(250, now - last);
    last = now;
    while (acc >= STEP) {
      update();
      acc -= STEP;
    }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
