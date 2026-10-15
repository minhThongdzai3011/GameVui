(() => {
  "use strict";

  // ======================================================================
  //  BẢNG SỐ LIỆU — lấy đúng từ bản gốc Idle Farming Business (MarketJS)
  // ======================================================================
  const CROPS = [
    { name: "Khoai tây", emoji: "🥔", cost: 3, coef: 1.07, time: 0.6, rev: 1 },
    { name: "Cà rốt", emoji: "🥕", cost: 60, coef: 1.15, time: 3, rev: 60 },
    { name: "Lúa mì", emoji: "🌾", cost: 720, coef: 1.14, time: 6, rev: 540 },
    { name: "Cà chua", emoji: "🍅", cost: 8640, coef: 1.13, time: 12, rev: 4320 },
    { name: "Dưa chuột", emoji: "🥒", cost: 105000, coef: 1.12, time: 24, rev: 51840 },
    { name: "Ớt", emoji: "🌶️", cost: 1.25e6, coef: 1.11, time: 96, rev: 622080 },
    { name: "Củ cải", emoji: "🥬", cost: 1.5e7, coef: 1.1, time: 384, rev: 7464960 },
    { name: "Hành tây", emoji: "🧅", cost: 1.78e8, coef: 1.09, time: 1536, rev: 89579520 },
    { name: "Ngô", emoji: "🌽", cost: 2.15e9, coef: 1.08, time: 6144, rev: 1074954240 },
  ];
  // cửa hàng: [giá, mũ 10, hệ số] — hệ số 0 = tự động thu hoạch ("Stack the Harvest")
  const UPG = [
    [[200, 0, 0], [250, 3, 3], [20, 12, 3], [2, 18, 3], [25, 21, 3], [10, 24, 3], [5, 42, 2], [250, 45, 3], [1, 54, 3], [10, 75, 3], [50, 90, 3]],
    [[15, 3, 0], [500, 3, 3], [50, 12, 3], [5, 18, 3], [50, 21, 3], [1, 27, 3], [25, 42, 2], [500, 45, 3], [1, 60, 3], [100, 75, 3], [100, 90, 3]],
    [[100, 3, 0], [1, 6, 3], [100, 12, 3], [7, 18, 3], [100, 21, 3], [25, 27, 3], [50, 42, 2], [750, 45, 3], [10, 60, 3], [1, 78, 3], [250, 90, 3]],
    [[500, 3, 0], [5, 6, 3], [500, 12, 3], [10, 18, 3], [200, 21, 3], [100, 27, 3], [100, 42, 2], [1, 48, 3], [100, 60, 3], [10, 78, 3], [500, 90, 3]],
    [[1.2, 6, 0], [10, 6, 3], [1, 15, 3], [35, 18, 3], [300, 21, 3], [250, 27, 3], [250, 42, 2], [5, 48, 3], [1, 66, 3], [100, 78, 3], [1, 93, 3]],
    [[10, 6, 0], [25, 6, 3], [2, 15, 3], [50, 18, 3], [400, 21, 3], [500, 27, 3], [500, 42, 2], [15, 48, 3], [10, 66, 3], [1, 84, 3], [5, 93, 3]],
    [[111111111, 0, 0], [500, 6, 3], [5, 15, 3], [75, 18, 3], [500, 21, 3], [1, 30, 3], [1, 45, 2], [50, 48, 3], [100, 66, 3], [3, 87, 3], [10, 93, 3]],
    [[555555555, 0, 0], [10, 9, 3], [10, 15, 3], [100, 18, 3], [600, 21, 3], [5, 30, 3], [5, 45, 2], [100, 48, 3], [1, 72, 3], [1, 90, 3], [500, 93, 3]],
    [[10, 9, 0], [50, 9, 3], [20, 15, 3], [200, 18, 3], [700, 21, 3], [25, 30, 3], [10, 45, 2], [250, 48, 3], [10, 72, 3], [5, 90, 3], [2, 96, 3]],
  ].map((list) => list.map(([c, e, x]) => ({ price: c * Math.pow(10, e), auto: x === 0, x })));
  // mốc cấp độ: tới cấp này thì giảm nửa thời gian / nhân lợi nhuận
  const UNLOCKS = [];
  [25, 50, 100, 200, 300, 400].forEach((lv) => UNLOCKS.push({ lv, speed: 0.5 }));
  for (let lv = 500; lv <= 2000; lv += 100) UNLOCKS.push({ lv, profit: lv === 1000 || lv === 2000 ? 5 : 4 });
  for (let lv = 2250; lv <= 5000; lv += 250) UNLOCKS.push({ lv, profit: lv === 4000 || lv === 5000 ? 5 : 2 });

  const SEED_PROFIT = 0.02; // mỗi hạt giống +2% lợi nhuận
  const SUN_DUR = 30;
  const SUN_CD = 300;
  const RAIN_DUR = 3600;
  const RAIN_LIMIT = 5;
  const DAILY_HOURS = [1, 2, 3, 4, 6, 8, 10];
  const IDLE_GUIDE = 10;
  const SAVE_KEY = "gamevui-farm";
  const HIT_R = 75; // bán kính vuốt trúng ô (đơn vị thiết kế, như bản gốc)

  // vị trí 9 ô — đúng công thức createPlot của bản gốc (lệch 190 theo góc -30° / -150°)
  const PLOTS = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) PLOTS.push({ x: 10 + (r - c) * 164.5, y: 230 - (r + c) * 95 });
  const DRAW_ORDER = PLOTS.map((p, i) => i).sort((a, b) => PLOTS[a].y - PLOTS[b].y);
  const SUN = { x: 0, y: -400 };
  const CLOUD = { x: 400, y: -350 };
  const TRUCK = { x: 335, y: 330, k: 0.55 };

  // ======================================================================
  //  TIỆN ÍCH
  // ======================================================================
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const num = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : 0);
  const trim0 = (s) => (s.indexOf(".") >= 0 ? s.replace(/\.?0+$/, "") : s);
  const SUF = ["", "K", "M", "B", "T"];
  function fmt(n) {
    if (!isFinite(n)) return "∞";
    if (n < 1000) return trim0(n.toFixed(2));
    let p = Math.floor(Math.log10(n) + 1e-9);
    p -= p % 3;
    let sig = n / Math.pow(10, p);
    if (sig >= 999.995) {
      p += 3;
      sig /= 1000;
    }
    const o = p / 3;
    const suf = o < 5 ? SUF[o] : String.fromCharCode(65 + Math.floor((o - 5) / 26), 65 + ((o - 5) % 26));
    return trim0(sig.toFixed(2)) + suf;
  }
  const money = (n) => "$" + fmt(n);
  const pad = (n) => String(Math.floor(n)).padStart(2, "0");
  const mmss = (s) => pad(s / 60) + ":" + pad(s % 60);
  const hhmmss = (s) => pad(s / 3600) + ":" + pad((s % 3600) / 60) + ":" + pad(s % 60);
  function dayKey(d) {
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  const today = () => dayKey(new Date());
  const yesterday = () => dayKey(new Date(Date.now() - 864e5));
  function spanText(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h} giờ ${m} phút` : m > 0 ? `${m} phút` : `${Math.floor(sec)} giây`;
  }

  // ======================================================================
  //  BỘ HÌNH (assets/*.png cắt từ bản gốc) — thiếu file nào thì dùng hình vẽ/emoji
  // ======================================================================
  const SPRITES = ["bg", "title", "plot-lock", "plot-buy", "plot-sign", "coin", "prog-bar", "prog-fill", "lv-bar", "lv-fill"];
  SPRITES.push("sun", "cloud", "rain", "ray", "truck", "finger", "farmer", "reward");
  SPRITES.push("btn-shop", "btn-up", "btn-up2", "btn-ach", "btn-set", "pill-cash", "pill-idle", "pill-seed");
  for (let i = 0; i < 9; i++) SPRITES.push("plot-" + i, "icon-" + i);
  for (let i = 1; i <= 8; i++) SPRITES.push("ach-" + i);
  let SPR = null;
  function loadSprites() {
    return Promise.all(
      SPRITES.map(
        (n) =>
          new Promise((ok) => {
            const im = new Image();
            im.onload = () => ok(im);
            im.onerror = () => ok(null);
            im.src = `assets/${n}.png`;
          }),
      ),
    ).then((list) => (list.every(Boolean) ? Object.fromEntries(SPRITES.map((n, i) => [n, list[i]])) : null));
  }
  const iconHTML = (i) => (SPR ? `<img src="assets/icon-${i}.png" alt="">` : `<span>${CROPS[i].emoji}</span>`);

  // ======================================================================
  //  TRẠNG THÁI + LƯU (localStorage của trình duyệt)
  // ======================================================================
  function blank() {
    return {
      v: 1,
      money: 0,
      life: 0, // tổng tiền kiếm được từ trước tới nay (không mất khi thu hoạch)
      start: 0, // tổng tiền lúc bắt đầu vụ hiện tại
      seeds: 0,
      farms: CROPS.map(() => ({ lv: 0, up: 0, acc: 0, prog: 0, on: false })),
      tut: 0,
      sunT: 0,
      sunCd: 0,
      rainT: 0,
      rainUsed: 0,
      day: "",
      daily: { on: false, idx: 0, got: "", streak: 0, login: "" },
      ach: {},
      stat: { rain: 0, sun: 0, shop: 0, harvest: 0 },
      mult: 0,
      sfx: true,
      truckTip: false,
      last: Date.now(),
    };
  }
  function sanitize(o) {
    if (!o || typeof o !== "object" || !Array.isArray(o.farms) || o.farms.length !== 9) return null;
    const b = blank();
    const s = Object.assign(b, o);
    for (const k of ["money", "life", "start", "seeds", "sunT", "sunCd", "rainT", "rainUsed", "tut", "mult", "last"]) s[k] = num(o[k]);
    s.mult = clamp(Math.floor(s.mult), 0, 3);
    s.daily = Object.assign(blank().daily, o.daily);
    s.stat = Object.assign(blank().stat, o.stat);
    s.ach = o.ach && typeof o.ach === "object" ? o.ach : {};
    s.sfx = o.sfx !== false;
    s.farms = o.farms.map((f) => ({
      lv: Math.floor(num(f && f.lv)),
      up: clamp(Math.floor(num(f && f.up)), 0, 11),
      acc: num(f && f.acc),
      prog: num(f && f.prog),
      on: !!(f && f.on),
    }));
    return s;
  }
  function load() {
    try {
      return sanitize(JSON.parse(localStorage.getItem(SAVE_KEY)));
    } catch (e) {
      return null;
    }
  }
  function save() {
    if (!S) return;
    S.last = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(S));
    } catch (e) {}
  }

  let S = null;
  const D = CROPS.map(() => ({ auto: false, sb: 1, pb: 1, ht: 1, profit: 0, next: 0, prevLv: 0 }));

  function calc(i) {
    const f = S.farms[i];
    const c = CROPS[i];
    const d = D[i];
    d.sb = 1;
    d.pb = 1;
    d.auto = false;
    d.next = -1;
    d.prevLv = 0;
    for (let k = 0; k < UNLOCKS.length; k++) {
      const u = UNLOCKS[k];
      if (f.lv < u.lv) {
        d.next = k;
        break;
      }
      if (u.speed) d.sb *= u.speed;
      else d.pb *= u.profit;
      d.prevLv = u.lv;
    }
    for (let k = 0; k < f.up; k++) {
      const u = UPG[i][k];
      if (u.auto) d.auto = true;
      else d.pb *= u.x;
    }
    d.ht = c.time * d.sb;
    d.profit = c.rev * f.lv * d.pb * (1 + S.seeds * SEED_PROFIT);
  }
  const calcAll = () => CROPS.forEach((c, i) => calc(i));
  const speedMul = () => (S.rainT > 0 ? 0.5 : 1);
  const profitMul = () => (S.sunT > 0 ? 2 : 1);
  const owned = (i) => S.farms[i].lv > 0;
  const ownedCount = () => S.farms.filter((f) => f.lv > 0).length;
  const plotPrice = (i) => (i === 0 ? 0 : CROPS[i].cost);
  function income(base) {
    let r = 0;
    for (let i = 0; i < 9; i++) if (owned(i) && D[i].auto) r += D[i].profit / (D[i].ht * (base ? 1 : speedMul()));
    return base ? r : r * profitMul();
  }
  const seedsAt = (life) => 150 * Math.sqrt(life / 1e15);
  const seedGain = () => Math.max(0, Math.floor(seedsAt(S.life) - seedsAt(S.start) + 1e-9));

  function addMoney(v) {
    S.money = clamp(S.money + v, 0, Number.MAX_VALUE);
    if (v > 0) S.life = clamp(S.life + v, 0, Number.MAX_VALUE);
  }

  // ---------- mô phỏng ----------
  function step(dt) {
    const sm = speedMul();
    const pm = profitMul();
    for (let i = 0; i < 9; i++) {
      const f = S.farms[i];
      const d = D[i];
      if (f.lv <= 0) continue;
      if (!f.on) {
        if (!d.auto) continue;
        f.on = true;
      }
      f.prog += dt;
      const T = d.ht * sm;
      if (d.auto) {
        if (f.prog >= T) {
          const n = Math.floor(f.prog / T);
          f.acc += n * d.profit * pm;
          f.prog -= n * T;
        }
      } else if (f.prog >= T) {
        f.acc += d.profit * pm;
        f.prog = 0;
        f.on = false;
      }
    }
    if (S.sunT > 0) {
      S.sunT -= dt;
      if (S.sunT <= 0) {
        S.sunT = 0;
        S.sunCd = SUN_CD;
      }
    } else if (S.sunCd > 0) S.sunCd = Math.max(0, S.sunCd - dt);
    if (S.rainT > 0) S.rainT = Math.max(0, S.rainT - dt);
  }

  // tính bù khoảng thời gian vắng mặt (đóng trang / ẩn tab)
  function catchUp(sec) {
    if (!(sec > 0)) return 0;
    let earned = 0;
    const fast = Math.min(sec, S.rainT);
    const rainLeft = S.rainT - fast > 0;
    for (let i = 0; i < 9; i++) {
      const f = S.farms[i];
      const d = D[i];
      if (f.lv <= 0 || (!d.auto && !f.on)) continue;
      const cycles = f.prog / (d.ht * speedMul()) + fast / (d.ht * 0.5) + (sec - fast) / d.ht;
      const endT = d.ht * (rainLeft ? 0.5 : 1);
      if (d.auto) {
        const n = Math.floor(cycles);
        const add = n * d.profit;
        f.acc += add;
        earned += add;
        f.prog = (cycles - n) * endT;
        f.on = true;
      } else if (cycles >= 1) {
        f.acc += d.profit;
        earned += d.profit;
        f.prog = 0;
        f.on = false;
      } else f.prog = cycles * endT;
    }
    S.rainT = Math.max(0, S.rainT - sec);
    if (S.sunT > 0) {
      const over = sec - S.sunT;
      S.sunT = Math.max(0, S.sunT - sec);
      if (S.sunT === 0) S.sunCd = Math.max(0, SUN_CD - over);
    } else S.sunCd = Math.max(0, S.sunCd - sec);
    return earned;
  }

  // ---------- số cấp mua một lần (1X / 10X / tới mốc / MAX) ----------
  function upgPrice(i, n) {
    const c = CROPS[i];
    const a = Math.pow(c.coef, S.farms[i].lv);
    return (c.cost * (Math.pow(c.coef, S.farms[i].lv + n) - a)) / (c.coef - 1);
  }
  function upgCount(i) {
    const f = S.farms[i];
    const c = CROPS[i];
    if (S.mult === 0) return 1;
    if (S.mult === 1) return 10;
    if (S.mult === 2) return D[i].next >= 0 ? UNLOCKS[D[i].next].lv - f.lv : 1;
    const k = (S.money * (c.coef - 1)) / (c.cost * Math.pow(c.coef, f.lv)) + 1;
    let n = Math.floor(Math.log(k) / Math.log(c.coef));
    if (!(n > 0)) return 1;
    while (n > 1 && upgPrice(i, n) > S.money) n--;
    return n;
  }

  // ======================================================================
  //  ÂM THANH (tự tổng hợp bằng WebAudio)
  // ======================================================================
  let AC = null;
  function ac() {
    if (!AC) {
      try {
        AC = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        AC = null;
      }
    }
    if (AC && AC.state === "suspended") AC.resume();
    return AC;
  }
  function tone(a, freq, dur, type, vol, to, delay) {
    const t0 = a.currentTime + (delay || 0);
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  function noise(a, dur, vol, freq, q) {
    const n = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, n, a.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q || 1;
    const g = a.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination);
    src.start();
  }
  const SFX = {
    crop: (a) => {
      noise(a, 0.12, 0.35, 900, 0.8);
      tone(a, 300, 0.1, "triangle", 0.12, 620);
    },
    coin: (a) => {
      tone(a, 988, 0.08, "square", 0.05);
      tone(a, 1319, 0.22, "square", 0.05, null, 0.07);
    },
    buy: (a) => {
      [523, 659, 784, 1047].forEach((f, k) => tone(a, f, 0.14, "triangle", 0.12, null, k * 0.06));
      noise(a, 0.08, 0.25, 3000, 2);
    },
    click: (a) => tone(a, 700, 0.05, "square", 0.05, 500),
    pop: (a) => tone(a, 380, 0.14, "sine", 0.14, 900),
    nope: (a) => tone(a, 200, 0.16, "sawtooth", 0.06, 140),
    rain: (a) => {
      noise(a, 1.4, 0.5, 2500, 0.4);
      tone(a, 600, 0.3, "sine", 0.08, 300);
    },
    sun: (a) => [523, 659, 784, 1047, 1319].forEach((f, k) => tone(a, f, 0.35, "sine", 0.1, null, k * 0.08)),
    reward: (a) => [784, 988, 1175, 1568].forEach((f, k) => tone(a, f, 0.2, "triangle", 0.12, null, k * 0.09)),
    unlock: (a) => [659, 880, 1319].forEach((f, k) => tone(a, f, 0.18, "square", 0.05, null, k * 0.07)),
  };
  const sfxLast = {};
  function sfx(n, gap) {
    if (!S || !S.sfx) return;
    const now = performance.now();
    if (gap && now - (sfxLast[n] || 0) < gap) return;
    sfxLast[n] = now;
    const a = ac();
    if (a && SFX[n]) SFX[n](a);
  }

  // ======================================================================
  //  CANVAS + TỌA ĐỘ (gốc ở giữa màn hình, đơn vị thiết kế như bản gốc)
  // ======================================================================
  const cv = $("cv");
  const ctx = cv.getContext("2d");
  let W = 0;
  let H = 0;
  let DPR = 1;
  let SC = 1;
  let CX = 0;
  let CY = 0;
  function resize() {
    W = innerWidth;
    H = innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    SC = Math.min(W / (W < H ? 980 : 1040), H / 930, 1.35);
    CX = W / 2;
    CY = H / 2 + 5 * SC;
    document.documentElement.style.setProperty("--ui", clamp(Math.min(W, H) / 720, 0.62, 1).toFixed(3));
  }
  const toScreen = (x, y) => [CX + x * SC, CY + y * SC];
  const toWorld = (sx, sy) => [(sx - CX) / SC, (sy - CY) / SC];

  const FONT = '"Baloo 2", "Segoe UI", Arial, sans-serif';
  function text(str, x, y, size, fill, stroke, lw) {
    ctx.font = `800 ${size}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (stroke) {
      ctx.lineWidth = lw || 5;
      ctx.lineJoin = "round";
      ctx.strokeStyle = stroke;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
  }
  function emoji(e, x, y, size) {
    ctx.font = `${size}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(e, x, y);
  }
  function diamond(x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x, y - h / 2);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x, y + h / 2);
    ctx.lineTo(x - w / 2, y);
    ctx.closePath();
  }
  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  }

  // ---------- vẽ từng phần (ảnh gốc hoặc hình dự phòng) ----------
  function drawCoin(x, y, k) {
    k = k || 1;
    if (SPR) ctx.drawImage(SPR.coin, x - 31 * k, y - 32 * k, 62 * k, 64 * k);
    else {
      ctx.beginPath();
      ctx.arc(x, y, 28 * k, 0, Math.PI * 2);
      ctx.fillStyle = "#ffc928";
      ctx.fill();
      ctx.lineWidth = 5 * k;
      ctx.strokeStyle = "#a86a00";
      ctx.stroke();
      text("$", x, y + 2 * k, 34 * k, "#fff", "#a86a00", 5 * k);
    }
  }
  function drawIcon(i, x, y, k) {
    if (SPR) {
      const im = SPR["icon-" + i];
      ctx.drawImage(im, x - (im.width * k) / 2, y - (im.height * k) / 2, im.width * k, im.height * k);
    } else emoji(CROPS[i].emoji, x, y, 64 * k);
  }
  function drawBar(x, y, w, h, frac, big) {
    if (SPR) {
      const a = SPR[big ? "lv-bar" : "prog-bar"];
      const b = SPR[big ? "lv-fill" : "prog-fill"];
      ctx.drawImage(a, x - w / 2, y - h / 2, w, h);
      const fw = clamp(frac, 0, 1) * b.width;
      if (fw > 0.5) ctx.drawImage(b, 0, 0, fw, b.height, x - w / 2, y - h / 2, (fw / b.width) * w, h);
    } else {
      rrect(x - w / 2, y - h / 2, w, h, h / 2);
      ctx.fillStyle = "#2c1d24";
      ctx.fill();
      if (frac > 0) {
        rrect(x - w / 2 + 3, y - h / 2 + 3, (w - 6) * clamp(frac, 0, 1), h - 6, (h - 6) / 2);
        ctx.fillStyle = big ? "#ff6f91" : "#ffd23f";
        ctx.fill();
      }
    }
  }
  function drawBg() {
    if (SPR) ctx.drawImage(SPR.bg, -693, -705 - 150);
    else {
      ctx.fillStyle = "#9fd987";
      diamond(10, -60, 1100, 640);
      ctx.fill();
      ctx.fillStyle = "#fff59a";
      diamond(-420, -330, 360, 200);
      ctx.fill();
      diamond(430, 300, 360, 200);
      ctx.fill();
      emoji("🏠", -430, -420, 170);
      emoji("🌳", 300, -470, 110);
      emoji("🌳", 400, -400, 90);
      emoji("🌳", -420, 230, 80);
    }
  }
  function drawPlotBase(i, x, y, kind) {
    if (SPR) {
      if (kind === "lock" || kind === "buy") ctx.drawImage(SPR["plot-" + kind], x - 140, y - 85);
      else if (kind === "sign") ctx.drawImage(SPR["plot-sign"], x - 138, y + 85 - 218);
      else ctx.drawImage(SPR["plot-" + i], x - 138, y + 85 - 218);
      return;
    }
    if (kind === "lock" || kind === "buy") {
      diamond(x, y, 264, 152);
      ctx.fillStyle = kind === "buy" ? "#9be15d" : "#cfcfcf";
      ctx.fill();
      ctx.lineWidth = 9;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      diamond(x, y, 200, 114);
      ctx.fillStyle = kind === "buy" ? "#7ccf3a" : "#b5b5b5";
      ctx.fill();
      return;
    }
    diamond(x, y + 10, 262, 152);
    ctx.fillStyle = "#eaa25a";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#c27a35";
    ctx.stroke();
    if (kind === "sign") {
      ctx.fillStyle = "#5a2e22";
      ctx.fillRect(x - 46, y - 60, 12, 80);
      ctx.fillRect(x + 34, y - 60, 12, 80);
      rrect(x - 72, y - 112, 144, 74, 10);
      ctx.fillStyle = "#e3cfc8";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#3a1e1e";
      ctx.stroke();
    } else {
      for (const [dx, dy] of [[0, -38], [-62, -4], [62, -4], [0, 30], [0, -4]]) emoji(CROPS[i].emoji, x + dx, y + dy, 50);
    }
  }

  // ---------- hạt / đồng xu / vệt vuốt ----------
  const crops = []; // hạt nông sản bắn ra (tọa độ thế giới)
  const coins = []; // xu bay về ô tiền (tọa độ màn hình)
  const trail = [];
  const pops = new Array(9).fill(0);
  function burstCrops(i) {
    const p = PLOTS[i];
    const n = 8 + Math.floor(Math.random() * 6);
    for (let k = 0; k < n; k++) {
      const ang = -Math.PI * Math.random();
      const sp = 300 + Math.random() * 120;
      crops.push({ i, x: p.x, y: p.y + 10, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t: 0, life: 0.5 + Math.random() * 0.5 });
    }
  }
  function cashTarget() {
    const r = $("tCash").parentElement.getBoundingClientRect();
    return [r.left + r.height / 2, r.top + r.height / 2];
  }
  function burstCoins(i, amount) {
    const [sx, sy] = toScreen(PLOTS[i].x, PLOTS[i].y - 10);
    const n = clamp(4 + Math.round(Math.log10(amount + 1) * 1.5), 5, 14);
    for (let k = 0; k < n; k++) {
      const ang = -Math.PI * (0.15 + Math.random() * 0.7);
      const sp = (160 + Math.random() * 200) * Math.max(SC, 0.5);
      coins.push({ x: sx, y: sy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t: 0, delay: k * 0.025 });
    }
  }

  // ======================================================================
  //  HÀNH ĐỘNG CỦA NGƯỜI CHƠI
  // ======================================================================
  let upMode = false;
  let tutHarvests = 0;

  function collect(i) {
    const f = S.farms[i];
    const d = D[i];
    if (f.lv <= 0 || f.acc <= 0 || (!d.auto && f.on)) return false;
    const v = f.acc;
    addMoney(v);
    f.acc = 0;
    if (!d.auto) {
      f.on = true;
      f.prog = 0;
      burstCrops(i);
    }
    burstCoins(i, v);
    pops[i] = 1;
    tutHarvests++;
    sfx("crop", 50);
    return true;
  }
  function buyPlot(i) {
    const price = plotPrice(i);
    if (S.money < price) {
      sfx("nope", 120);
      return;
    }
    S.money -= price;
    Object.assign(S.farms[i], { lv: 1, on: true, prog: 0, acc: 0 });
    calc(i);
    pops[i] = 1;
    burstCrops(i);
    sfx("buy");
    checkAch();
    save();
  }
  function upgradePlot(i) {
    const n = upgCount(i);
    const p = upgPrice(i, n);
    if (!(S.money >= p)) {
      sfx("nope", 120);
      return;
    }
    const oldNext = D[i].next;
    S.money -= p;
    S.farms[i].lv += n;
    calc(i);
    if (oldNext >= 0) for (let k = oldNext; k < UNLOCKS.length && UNLOCKS[k].lv <= S.farms[i].lv; k++) notifyUnlock(i, UNLOCKS[k]);
    pops[i] = 1;
    sfx("buy");
    checkAch();
  }
  function setUpMode(on) {
    upMode = on;
    $("btnUp").classList.toggle("on", on);
    $("mults").hidden = !on;
    $("upTitle").hidden = !on;
    $("btnShop").hidden = on;
    markMult();
    sfx("click");
  }
  function markMult() {
    $("mults")
      .querySelectorAll("button")
      .forEach((b) => b.classList.toggle("on", +b.dataset.m === S.mult));
  }

  // ======================================================================
  //  THÀNH TỰU (theo đúng các nhóm của bản gốc)
  // ======================================================================
  const ACH = [];
  {
    const add = (id, name, desc, goal, val, reward, icon) => ACH.push({ id, name, desc, goal, val, reward, icon });
    const TIERS = ["Tập Sự", "Mới Vào Nghề", "Nghiệp Dư", "Chăm Chỉ", "Khá", "Giỏi", "Thạo Việc", "Lành Nghề", "Chuyên Gia", "Cao Thủ"];
    TIERS.push("Bậc Thầy", "Đại Sư", "Huyền Thoại", "Siêu Sao", "Vô Địch", "Tối Thượng", "Bất Bại", "Truyền Kỳ", "Thần Nông", "Vua Nông Trại");
    TIERS.push("Đế Vương", "Bất Tử");
    const plotNames = ["Nông Dân Tập Sự", "Nông Dân Mới", "Nông Dân Nghiệp Dư", "Nông Dân Chăm Chỉ", "Nông Dân Kỳ Cựu"];
    plotNames.push("Nông Dân Lão Luyện", "Nhà Nông Học", "Nhà Nông Học Bậc Thầy", "Nhà Nông Học Chuyên Gia");
    const plotRw = [30, 1e3, 3e3, 1e4, 3e4, 1e5, 3e5, 1e6, 1e9];
    plotRw.forEach((rw, k) =>
      add("p" + k, plotNames[k], k === 0 ? "Mua ô đất đầu tiên" : k === 8 ? "Sở hữu cả 9 ô đất" : `Sở hữu ${k + 1} ô đất`, k + 1, ownedCount, rw, 1),
    );
    add("rain", "Mùa Mưa", "Dùng mưa tăng tốc lần đầu", 1, () => S.stat.rain, 300, 2);
    add("sun", "Mùa Hè", "Dùng nắng nhân đôi lần đầu", 1, () => S.stat.sun, 2000, 2);
    const maxLv = () => Math.max(...S.farms.map((f) => f.lv));
    const lvG = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 75, 100, 125, 150, 175, 200, 250, 300, 350, 400, 500, 750];
    const lvR = [100, 300, 500, 1e3, 3e3, 5e3, 7e3, 1e4, 1.5e4, 2.5e4, 5e4, 7.5e4, 1e5, 2e5, 5e5, 1e6, 1.25e6, 1.5e6, 2e6, 3e6, 8e6, 2e7];
    lvG.forEach((g, k) => add("lv" + k, "Tá Điền " + TIERS[k], `Nâng 1 ô đất lên cấp ${g}`, g, maxLv, lvR[k], 3));
    const nAt = (L) => () => S.farms.filter((f) => f.lv >= L).length;
    const grp = (id, title, n, Ls, Rs, icon) =>
      Ls.forEach((L, k) => add(id + k, title + " " + TIERS[k], n === 9 ? `Nâng cả 9 ô đất lên cấp ${L}` : `Nâng ${n} ô đất lên cấp ${L}`, n, nAt(L), Rs[k], icon));
    const L10 = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
    grp("a", "Nhà Vườn", 3, L10.concat([75, 100, 125, 150, 200]), [7e3, 1e4, 1.5e4, 2.5e4, 5e4, 7.5e4, 1e5, 2e5, 5e5, 1e6, 1.25e6, 1.5e6, 2e6, 3e6, 8e6], 3);
    grp("b", "Trang Trại", 6, L10.concat([75, 100, 125, 150, 175]), [2.1e4, 3e4, 4.5e4, 7.5e4, 1.5e5, 2.25e5, 3e5, 6e5, 1.5e6, 3e6, 6e6, 1e7, 2.5e7, 5e7, 1e8], 4);
    grp("c", "Đồn Điền", 9, L10.concat([75, 100, 125, 150, 175, 200]), [1e6, 2e6, 1e7, 5e7, 1e8, 2.5e8, 5e8, 1e9, 1.5e10, 5e10, 1e15, 5e15, 1e16, 2.5e16, 5e16, 1e17], 4);
    [3, 6, 9, 12, 15, 18].forEach((g, k) =>
      add("s" + k, "Kỹ Sư Nông Nghiệp " + TIERS[k], `Mua ${g} món ở cửa hàng nâng cấp`, g, () => S.stat.shop, [4e4, 8e4, 2.5e5, 1e6, 2e8, 1e9][k], 5),
    );
    const mN = ["Có Lãi", "Doanh Nhân Nông Trại", "Triệu Phú", "Tỷ Phú", "Nghìn Tỷ Phú", "Địa Chủ Giàu Nhất", "Độc Quyền Nông Sản", "Vua Nông Nghiệp"];
    [1e3, 1e5, 1e6, 1e9, 1e12, 1e15, 1e18, 1e21].forEach((g, k) =>
      add("m" + k, mN[k], `Có trong tay ${money(g)}`, g, () => S.money, [300, 3e4, 3e5, 3e8, 3e11, 3e14, 3e17, 3e20][k], 6),
    );
    const sN = ["Hạt Giống Đầu Tiên", "Vườn Ươm", "Kho Hạt Giống", "Ngân Hàng Hạt Giống", "Đế Chế Hạt Giống"];
    [1, 10, 100, 1000, 10000].forEach((g, k) => add("g" + k, sN[k], `Sở hữu ${fmt(g)} hạt giống`, g, () => S.seeds, [1e4, 5e4, 1e5, 5e5, 1e6][k], 7));
    const dN = ["Làm Thuê", "Công Nhân Nông Trại", "Thợ Gặt", "Nông Dân Cả Tuần", "Nông Dân Kiên Trì", "Nông Dân Cả Tháng"];
    dN.push("Nông Dân Chuyên Nghiệp", "Nông Dân Giỏi Nhất Thế Giới");
    [2, 3, 5, 7, 14, 30, 60, 90].forEach((g, k) =>
      add("d" + k, dN[k], `Vào chơi ${g} ngày liên tiếp`, g, () => S.daily.streak, [1e3, 3e3, 1e4, 1e5, 1e8, 1e11, 1e14, 9.99e20][k], 8),
    );
  }
  const ACH_EMO = ["", "🌱", "🌦️", "🧑‍🌾", "🏡", "🛒", "💰", "🤝", "📅"];
  const achReady = () => S.tut > 4;
  function checkAch() {
    if (!achReady()) return;
    const fresh = ACH.filter((a) => !S.ach[a.id] && a.val() >= a.goal);
    if (!fresh.length) return;
    fresh.forEach((a) => (S.ach[a.id] = 1));
    toast(fresh.length === 1 ? `🏆 Thành tựu mới: ${fresh[0].name}` : `🏆 ${fresh.length} thành tựu mới — bấm cúp để nhận thưởng`);
    sfx("unlock", 300);
  }
  const achClaimable = () => ACH.some((a) => S.ach[a.id] === 1);

  // ======================================================================
  //  HƯỚNG DẪN (đúng thứ tự 9 bước của bản gốc)
  // ======================================================================
  const TUT = [
    { text: "Mua mảnh đất này để bắt đầu trồng trọt", target: () => ({ plot: 0 }), done: () => owned(0) },
    { text: "Vuốt liên tục qua ô đất để thu hoạch", target: () => ({ plot: 0, swipe: true }), done: () => tutHarvests >= 3 && S.money >= 3.3 },
    { text: "Nâng cấp ô đất để kiếm được nhiều hơn", target: () => ({ el: $("btnUp") }), done: () => upMode },
    {
      text: "Chọn ô đất bạn muốn nâng cấp",
      target: () => (upMode ? { sign: 0 } : { el: $("btnUp"), text: "Nâng cấp ô đất để kiếm được nhiều hơn" }),
      done: () => S.farms[0].lv >= 2,
    },
    {
      text: "Giờ hãy mua thêm mảnh đất này",
      target: () => (upMode ? { el: $("btnUpClose"), text: "Bấm ✕ để thoát chế độ nâng cấp" } : { plot: 1 }),
      done: () => owned(1),
    },
    { text: "Hừm, ở đây có gì nhỉ?", target: () => ({ el: $("btnShop") }), done: () => modalKind === "shop" },
    {
      text: "Mua món này để đỡ tốn công nhé",
      target: () => (modalKind === "shop" ? { el: modal.querySelector('[data-act="buy"]') } : { el: $("btnShop") }),
      done: () => S.farms[0].up >= 1,
    },
    {
      text: "Mưa sắp đến rồi!",
      target: () => (modalKind === "rain" ? { el: modal.querySelector('[data-act="rain"]') } : { cloud: true }),
      done: () => S.stat.rain > 0,
    },
    {
      text: "Mặt trời đang chiếu sáng rực rỡ",
      target: () => (modalKind === "sun" ? { el: modal.querySelector('[data-act="sun"]') } : { sun: true }),
      done: () => S.stat.sun > 0,
    },
  ];
  const tutDone = () => S.tut >= TUT.length;
  const cloudOn = () => S.tut >= 7;
  const sunOn = () => S.tut >= 8;
  const truckOn = () => tutDone() && seedGain() >= 1;

  // ======================================================================
  //  GIAO DIỆN DOM: hộp thoại, thông báo, bộ đếm
  // ======================================================================
  const modal = $("modal");
  let modalKind = null;
  let shopPage = 0;
  function openModal(kind, title, body, noClose) {
    modal.innerHTML =
      `<div class="panel ${kind}"><div class="ph">${title}</div>` +
      (noClose ? "" : '<button class="x" data-close title="Đóng">✕</button>') +
      `<div class="pb">${body}</div></div>`;
    modal.hidden = false;
    modalKind = kind;
    sfx("pop");
  }
  function closeModal() {
    const k = modalKind;
    modal.hidden = true;
    modal.innerHTML = "";
    modalKind = null;
    sfx("click");
    if (k === "shop" && S.farms[1].up >= 1 && !S.daily.on) S.daily.on = true;
    save();
  }
  function toast(t) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = t;
    const box = $("toasts");
    while (box.children.length >= 3) box.firstChild.remove();
    box.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
  function notifyUnlock(i, u) {
    const box = $("notifs");
    while (box.children.length >= 3) box.firstChild.remove();
    const el = document.createElement("div");
    el.className = "unl";
    el.innerHTML = `<span class="fr">${iconHTML(i)}</span><div>${u.speed ? "Thời gian sản xuất" : "Hệ số lợi nhuận"} · ${CROPS[i].name}<b>${
      u.speed ? "-" + Math.round(u.speed * 100) + "%" : "x" + u.profit
    }</b></div>`;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3600);
    sfx("unlock", 200);
  }

  // ---------- cửa hàng ----------
  function shopList() {
    const out = [];
    for (let i = 0; i < 9; i++) if (owned(i) && S.farms[i].up < UPG[i].length) out.push({ i, u: UPG[i][S.farms[i].up] });
    return out.sort((a, b) => a.u.price - b.u.price);
  }
  function openShop() {
    shopPage = 0;
    openModal("shop", "CỬA HÀNG NÂNG CẤP", '<div class="items" id="shopItems"></div><div class="pager" id="shopPager"></div>');
    renderShop();
  }
  function renderShop() {
    const list = shopList();
    const pages = Math.max(1, Math.ceil(list.length / 3));
    shopPage = clamp(shopPage, 0, pages - 1);
    const items = list.slice(shopPage * 3, shopPage * 3 + 3);
    $("shopItems").innerHTML = items.length
      ? items
          .map(
            ({ i, u }) =>
              `<div class="item"><span class="fr">${iconHTML(i)}</span><div class="t"><small>${
                u.auto ? "Tự động thu hoạch" : "Tăng lợi nhuận x" + u.x
              }</small><h4>${CROPS[i].name}</h4><button class="btn sm${S.money >= u.price ? "" : " off"}" data-act="buy" data-i="${i}" data-p="${
                u.price
              }">${money(u.price)}</button></div></div>`,
          )
          .join("")
      : '<div class="empty">Đã mua hết nâng cấp hiện có.<br>Mua thêm ô đất để mở món mới!</div>';
    $("shopPager").innerHTML =
      pages > 1
        ? `<button class="x" data-act="prev" title="Trang trước">‹</button><span>${shopPage + 1} / ${pages}</span><button class="x" data-act="next" title="Trang sau">›</button>`
        : `<span>1 / 1</span>`;
  }
  function refreshShopButtons() {
    modal.querySelectorAll('[data-act="buy"]').forEach((b) => b.classList.toggle("off", S.money < +b.dataset.p));
  }
  function buyShop(i) {
    const u = UPG[i][S.farms[i].up];
    if (!u || S.money < u.price) {
      sfx("nope", 120);
      return;
    }
    S.money -= u.price;
    S.farms[i].up++;
    S.stat.shop++;
    calc(i);
    sfx("buy");
    toast(u.auto ? `${CROPS[i].name}: tự động thu hoạch!` : `${CROPS[i].name}: lợi nhuận x${u.x}!`);
    checkAch();
    renderShop();
    save();
  }

  // ---------- nắng / mưa ----------
  function openSun() {
    let foot;
    if (S.sunT > 0) foot = `<p>Trời đang nắng · còn <b>${mmss(S.sunT)}</b></p><button class="btn" data-close>OK</button>`;
    else if (S.sunCd > 0)
      foot = `<p class="sub">Mặt trời đang nghỉ, quay lại sau <b>${mmss(S.sunCd)}</b></p><button class="btn off" disabled>${mmss(S.sunCd)}</button>`;
    else foot = `<button class="btn yellow" data-act="sun">KÍCH HOẠT</button>`;
    const pic = SPR ? '<img class="big" src="assets/sun.png" alt="">' : '<span class="bigemo">☀️</span>';
    openModal("sun", "NGÀY NẮNG!", `${pic}<p>Nhân đôi lợi nhuận!</p><p class="sub">${SUN_DUR} giây</p>${foot}`);
  }
  function openRain() {
    const left = RAIN_LIMIT - S.rainUsed;
    const pic = SPR ? '<img class="big" src="assets/cloud.png" alt="">' : '<span class="bigemo">🌧️</span>';
    const now = S.rainT > 0 ? `<p class="sub">Đang mưa · còn <b>${hhmmss(S.rainT)}</b> (kích hoạt thêm để cộng dồn)</p>` : "";
    openModal(
      "rain",
      "NGÀY MƯA!",
      `${pic}<p>Tốc độ thu hoạch x2!</p><p class="sub">1 giờ · còn lại hôm nay: <b>${left}/${RAIN_LIMIT}</b></p>${now}` +
        `<button class="btn yellow${left > 0 ? "" : " off"}" data-act="rain"${left > 0 ? "" : " disabled"}>KÍCH HOẠT</button>`,
    );
  }
  function useSun() {
    if (S.sunT > 0 || S.sunCd > 0) return;
    S.sunT = SUN_DUR;
    S.stat.sun++;
    closeModal();
    sfx("sun");
    checkAch();
  }
  function useRain() {
    if (S.rainUsed >= RAIN_LIMIT) return;
    S.rainUsed++;
    S.rainT += RAIN_DUR;
    S.stat.rain++;
    closeModal();
    sfx("rain");
    checkAch();
  }

  // ---------- quà hằng ngày ----------
  const dailyDue = () => S.daily.on && S.daily.got !== today();
  function openDaily() {
    const idx = S.daily.idx;
    const ico = SPR ? '<img src="assets/reward.png" alt="">' : "🎁";
    const days = DAILY_HOURS.map(
      (h, k) =>
        `<div class="day${k < idx ? " got" : k === idx ? " now" : ""}">NGÀY ${k + 1}<span class="e">${k < idx ? "✅" : ico}</span>${h} giờ</div>`,
    ).join("");
    openModal(
      "daily",
      "QUÀ HẰNG NGÀY",
      `<div class="days">${days}</div><p class="sub">Quà = số tiền nông trại tự kiếm trong ${DAILY_HOURS[idx]} giờ</p><button class="btn yellow" data-act="claim">NHẬN</button>`,
      true,
    );
  }
  function claimDaily() {
    const v = DAILY_HOURS[S.daily.idx] * 3600 * Math.max(income(true), 1);
    addMoney(v);
    S.daily.got = today();
    S.daily.idx = (S.daily.idx + 1) % 7;
    sfx("reward");
    const ico = SPR ? '<img class="big" src="assets/reward.png" alt="" style="max-width:96px">' : '<span class="bigemo">🎁</span>';
    openModal("claim", "PHẦN THƯỞNG", `${ico}<p>Bạn nhận được</p><div class="card"><b style="font-size:34px">${money(v)}</b></div><button class="btn" data-close>OK</button>`, true);
    checkAch();
    save();
  }
  function checkDay() {
    const t = today();
    if (S.day === t) return false;
    S.daily.streak = S.daily.login === yesterday() ? S.daily.streak + 1 : 1;
    S.daily.login = t;
    S.day = t;
    S.rainUsed = 0;
    return true;
  }

  // ---------- xe tải: thu hoạch toàn bộ đổi hạt giống ----------
  function openHarvest() {
    const g = seedGain();
    const pic = SPR ? '<img class="big" src="assets/farmer.png" alt="">' : '<span class="bigemo">🧑‍🌾</span>';
    openModal(
      "harvest",
      "THU HOẠCH",
      `<p class="sub">Đổi nông sản lấy hạt giống<br>+2% lợi nhuận / hạt</p>${pic}` +
        `<div class="card">Hạt hiện có: <b>${fmt(S.seeds)}</b><br>Hạt nhận được: <b>+${fmt(g)}</b><br>Lợi nhuận thưởng: <b>+${fmt(
          S.seeds * 2,
        )}% → +${fmt((S.seeds + g) * 2)}%</b></div>` +
        `<p class="sub" style="font-size:15px">Tiền, ô đất và nâng cấp sẽ làm lại từ đầu (giữ hạt giống, thành tựu).</p>` +
        `<button class="btn yellow" data-act="prestige">THU HOẠCH NGAY</button>`,
    );
  }
  function prestige() {
    const g = seedGain();
    if (g < 1) return;
    const k = S;
    S = blank();
    Object.assign(S, {
      life: k.life,
      start: k.life,
      seeds: k.seeds + g,
      tut: k.tut,
      day: k.day,
      rainUsed: k.rainUsed,
      daily: k.daily,
      ach: k.ach,
      stat: Object.assign(k.stat, { harvest: (k.stat.harvest || 0) + 1 }),
      mult: k.mult,
      sfx: k.sfx,
      truckTip: true,
    });
    calcAll();
    closeModal();
    if (upMode) setUpMode(false);
    crops.length = 0;
    coins.length = 0;
    truckAnim = 0;
    sfx("reward");
    toast(`🌱 Nhận ${fmt(g)} hạt giống · lợi nhuận +${fmt(S.seeds * 2)}%`);
    checkAch();
    save();
  }

  // ---------- thành tựu ----------
  function openAch() {
    openModal("achs", "THÀNH TỰU", '<div class="achs" id="achList"></div>');
    renderAch();
  }
  function renderAch() {
    const list = $("achList");
    if (!list) return;
    const keep = list.parentElement.scrollTop;
    const order = (a) => (S.ach[a.id] === 1 ? 0 : S.ach[a.id] === 2 ? 2 : 1);
    list.innerHTML = ACH.slice()
      .sort((a, b) => order(a) - order(b))
      .map((a) => {
        const st = S.ach[a.id] || 0;
        const v = Math.min(a.val(), a.goal);
        const ico = SPR ? `<img src="assets/ach-${a.icon}.png" alt="">` : ACH_EMO[a.icon];
        const right =
          st === 1
            ? `<button class="btn sm yellow" data-act="achClaim" data-id="${a.id}">NHẬN</button>`
            : st === 2
              ? "✅ Đã nhận"
              : `Thưởng<br>${money(a.reward)}`;
        const bar = st ? "" : `<div class="bar"><i style="width:${((v / a.goal) * 100).toFixed(1)}%"></i></div>`;
        return `<div class="ach${st === 1 ? " ok" : st === 2 ? " done" : ""}"><span class="ai">${ico}</span><div class="t">${a.name}<small>${a.desc}${
          st === 1 ? " · " + money(a.reward) : ""
        }</small>${bar}</div><div class="r">${right}</div></div>`;
      })
      .join("");
    list.parentElement.scrollTop = keep;
  }
  function claimAch(id) {
    const a = ACH.find((x) => x.id === id);
    if (!a || S.ach[id] !== 1) return;
    S.ach[id] = 2;
    addMoney(a.reward);
    sfx("reward");
    toast(`Nhận ${money(a.reward)}`);
    renderAch();
    save();
  }

  // ---------- cài đặt + sao lưu ----------
  const CODE_PREFIX = "GVFARM1:";
  function exportCode() {
    save();
    return CODE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(S))));
  }
  function importCode(str) {
    str = (str || "").trim();
    if (!str.startsWith(CODE_PREFIX)) return null;
    try {
      return sanitize(JSON.parse(decodeURIComponent(escape(atob(str.slice(CODE_PREFIX.length))))));
    } catch (e) {
      return null;
    }
  }
  function openSettings() {
    openModal(
      "settings",
      "CÀI ĐẶT",
      `<div class="opts">
        <button class="btn${S.sfx ? "" : " off"}" data-act="sfx">Âm thanh: ${S.sfx ? "BẬT" : "TẮT"}</button>
        <button class="btn yellow" data-act="export">Sao lưu dữ liệu</button>
        <button class="btn" data-act="import">Khôi phục từ mã</button>
        <textarea id="codeBox" hidden spellcheck="false"></textarea>
        <button class="btn sm" data-act="loadCode" hidden id="btnLoadCode">Nạp mã này</button>
        <div class="msg" id="setMsg">Dữ liệu tự lưu trong trình duyệt này.</div>
        <button class="btn red" data-act="reset">Chơi lại từ đầu</button>
        <a href="../../index.html">← Về trang GameVui</a>
      </div>`,
    );
  }
  let resetArm = 0;
  function settingsAct(act, btn) {
    const box = $("codeBox");
    const msg = $("setMsg");
    if (act === "sfx") {
      S.sfx = !S.sfx;
      btn.textContent = "Âm thanh: " + (S.sfx ? "BẬT" : "TẮT");
      btn.classList.toggle("off", !S.sfx);
      sfx("click");
      save();
    } else if (act === "export") {
      box.hidden = false;
      box.readOnly = true;
      box.value = exportCode();
      $("btnLoadCode").hidden = true;
      box.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (e) {}
      if (navigator.clipboard) navigator.clipboard.writeText(box.value).catch(() => {});
      msg.textContent = ok ? "Đã sao chép mã! Hãy dán vào ghi chú để giữ lại." : "Hãy sao chép đoạn mã trên và cất giữ cẩn thận.";
    } else if (act === "import") {
      box.hidden = false;
      box.readOnly = false;
      box.value = "";
      box.placeholder = "Dán mã sao lưu (bắt đầu bằng GVFARM1:) vào đây";
      $("btnLoadCode").hidden = false;
      box.focus();
      msg.textContent = "Dán mã rồi bấm “Nạp mã này”.";
    } else if (act === "loadCode") {
      const s = importCode(box.value);
      if (!s) {
        msg.textContent = "Mã không hợp lệ, hãy kiểm tra lại.";
        sfx("nope");
        return;
      }
      S = s;
      calcAll();
      catchUp((Date.now() - S.last) / 1000);
      checkDay();
      if (upMode) setUpMode(false);
      save();
      closeModal();
      toast("Đã khôi phục dữ liệu!");
    } else if (act === "reset") {
      if (Date.now() - resetArm > 3000) {
        resetArm = Date.now();
        btn.textContent = "Bấm lần nữa để xoá hết!";
        sfx("nope");
        return;
      }
      S = blank();
      calcAll();
      checkDay();
      if (upMode) setUpMode(false);
      tutHarvests = 0;
      save();
      closeModal();
      toast("Đã bắt đầu nông trại mới");
    }
  }
  function openInfo() {
    openModal(
      "info",
      "HẠT GIỐNG",
      `${SPR ? '<img class="big" src="assets/farmer.png" alt="">' : '<span class="bigemo">🌱</span>'}<div class="card">Bạn có <b>${fmt(
        S.seeds,
      )}</b> hạt giống<br>Mỗi hạt +2% lợi nhuận<br>Tổng thưởng: <b>+${fmt(S.seeds * 2)}%</b></div><p class="sub">Kiếm thật nhiều tiền rồi bấm xe tải để thu hoạch và nhận thêm hạt.</p>`,
    );
  }

  modal.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-close")) return closeModal();
    const act = b.dataset.act;
    if (!act) return;
    if (act === "buy") buyShop(+b.dataset.i);
    else if (act === "prev" || act === "next") {
      shopPage += act === "next" ? 1 : -1;
      renderShop();
      sfx("click");
    } else if (act === "sun") useSun();
    else if (act === "rain") useRain();
    else if (act === "claim") claimDaily();
    else if (act === "prestige") prestige();
    else if (act === "achClaim") claimAch(b.dataset.id);
    else settingsAct(act, b);
  });

  // ---------- nút giao diện ----------
  $("btnShop").onclick = () => !modalKind && openShop();
  $("btnUp").onclick = () => setUpMode(!upMode);
  $("btnUpClose").onclick = () => setUpMode(false);
  $("btnSet").onclick = () => !modalKind && openSettings();
  $("btnAch").onclick = () => !modalKind && openAch();
  $("btnInfo").onclick = () => !modalKind && openInfo();
  $("mults").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    S.mult = +b.dataset.m;
    markMult();
    sfx("click");
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (modalKind && modal.querySelector("[data-close]")) closeModal();
      else if (upMode) setUpMode(false);
    }
  });

  // ---------- bộ đếm góc trái + trạng thái nút ----------
  let hudT = 0;
  function hud() {
    $("tCash").textContent = money(S.money);
    $("tIdle").textContent = money(income()) + " /s";
    $("tSeed").textContent = fmt(Math.floor(S.seeds));
    $("btnInfo").hidden = !(S.seeds > 0);
    $("shopNotif").hidden = upMode || !shopList().some((x) => S.money >= x.u.price);
    $("btnAch").hidden = upMode || !achReady();
    $("achBang").hidden = !achClaimable();
    if (modalKind === "shop") refreshShopButtons();
    if (modalKind === "sun" && (S.sunT > 0 || S.sunCd > 0)) {
      const b = modal.querySelector(".btn.off");
      if (b) b.textContent = mmss(S.sunCd);
    }
  }

  // ---------- hướng dẫn: dải chữ + ngón tay ----------
  const tutEl = $("tut");
  const finger = $("finger");
  document.body.appendChild(tutEl);
  document.body.appendChild(finger);
  let idleT = 0;
  function placeFinger(sx, sy, swipe) {
    finger.hidden = false;
    finger.style.left = sx + "px";
    finger.style.top = sy + "px";
    finger.classList.toggle("swipe", !!swipe);
  }
  function updateTutorial() {
    while (!tutDone() && TUT[S.tut].done()) {
      S.tut++;
      save();
    }
    let tg = null;
    let txt = "";
    if (!tutDone()) {
      tg = TUT[S.tut].target();
      txt = (tg && tg.text) || TUT[S.tut].text;
    } else if (truckOn() && !S.truckTip) {
      tg = { truck: true };
      txt = "Đến lúc thu hoạch toàn bộ để đổi lấy hạt giống!";
      if (modalKind === "harvest") S.truckTip = true;
    }
    // dải chữ ẩn khi đang mở hộp thoại không liên quan
    const inModal = tg && tg.el && modal.contains(tg.el);
    const hideAll = screen !== "game" || (modalKind && !inModal);
    tutEl.hidden = hideAll || !tg;
    if (!tutEl.hidden && tutEl.textContent !== txt) tutEl.textContent = txt;
    if (hideAll || !tg) {
      // gợi ý vuốt khi đứng yên lâu
      if (!hideAll && !upMode && idleT > IDLE_GUIDE) {
        const i = S.farms.findIndex((f, k) => f.lv > 0 && f.acc > 0 && !D[k].auto && !f.on);
        if (i >= 0) {
          const [sx, sy] = toScreen(PLOTS[i].x, PLOTS[i].y);
          placeFinger(sx, sy, true);
          return;
        }
      }
      finger.hidden = true;
      return;
    }
    let p = null;
    if (tg.el) {
      if (!tg.el.isConnected || tg.el.offsetParent === null) {
        finger.hidden = true;
        return;
      }
      const r = tg.el.getBoundingClientRect();
      p = [r.left + r.width / 2, r.top + r.height * (r.top > H * 0.7 ? 0.3 : 0.55)];
    } else if (tg.plot !== undefined) p = toScreen(PLOTS[tg.plot].x, PLOTS[tg.plot].y + (tg.swipe ? 0 : -10));
    else if (tg.sign !== undefined) p = toScreen(PLOTS[tg.sign].x, PLOTS[tg.sign].y + 18);
    else if (tg.cloud) p = toScreen(CLOUD.x, CLOUD.y + 20);
    else if (tg.sun) p = toScreen(SUN.x, SUN.y + 30);
    else if (tg.truck) p = toScreen(TRUCK.x, TRUCK.y);
    if (p) placeFinger(p[0], p[1], tg.swipe);
  }

  // ======================================================================
  //  NHẬP LIỆU: chạm / bấm / vuốt
  // ======================================================================
  let ptr = null;
  function segHits(ax, ay, bx, by, cx, cy, r) {
    const dx = bx - ax;
    const dy = by - ay;
    const L = dx * dx + dy * dy;
    let t = L > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / L : 0;
    t = clamp(t, 0, 1);
    const px = ax + t * dx - cx;
    const py = ay + t * dy - cy;
    return px * px + py * py <= r * r;
  }
  function swipeAt(ax, ay, bx, by) {
    if (upMode) return;
    const [wax, way] = toWorld(ax, ay);
    const [wbx, wby] = toWorld(bx, by);
    for (let i = 0; i < 9; i++) if (owned(i) && segHits(wax, way, wbx, wby, PLOTS[i].x, PLOTS[i].y, HIT_R)) collect(i);
  }
  const near = (x, y, p, r) => (x - p.x) ** 2 + (y - p.y) ** 2 <= r * r;
  function hitAt(sx, sy) {
    const [x, y] = toWorld(sx, sy);
    if (upMode) {
      for (let i = 0; i < 9; i++) if (owned(i) && Math.abs(x - PLOTS[i].x) <= 72 && Math.abs(y - (PLOTS[i].y + 10)) <= 36) return { up: i };
      return null;
    }
    if (truckOn() && near(x, y, TRUCK, 115)) return { truck: true };
    if (sunOn() && near(x, y, { x: SUN.x, y: SUN.y + sunFloat }, 80)) return { sun: true };
    if (cloudOn() && near(x, y, { x: CLOUD.x, y: CLOUD.y + cloudFloat }, 90)) return { cloud: true };
    for (let i = 0; i < 9; i++) if (near(x, y, PLOTS[i], HIT_R)) return { plot: i };
    return null;
  }
  function tap(sx, sy) {
    const h = hitAt(sx, sy);
    if (!h) return;
    if (h.up !== undefined) upgradePlot(h.up);
    else if (h.truck) openHarvest();
    else if (h.sun) openSun();
    else if (h.cloud) openRain();
    else if (h.plot !== undefined) {
      if (!owned(h.plot)) buyPlot(h.plot);
      else collect(h.plot);
    }
  }
  cv.addEventListener("pointerdown", (e) => {
    idleT = 0;
    if (screen !== "game" || modalKind) return;
    ac();
    try {
      cv.setPointerCapture(e.pointerId);
    } catch (er) {}
    ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, dist: 0 };
    trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  });
  cv.addEventListener("pointermove", (e) => {
    idleT = 0;
    if (screen !== "game") return;
    if (!ptr || ptr.id !== e.pointerId) {
      if (e.pointerType === "mouse" && !modalKind) cv.style.cursor = hitAt(e.clientX, e.clientY) ? "pointer" : "";
      return;
    }
    const dx = e.clientX - ptr.x;
    const dy = e.clientY - ptr.y;
    ptr.dist += Math.hypot(dx, dy);
    swipeAt(ptr.x, ptr.y, e.clientX, e.clientY);
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  });
  function endPtr(e) {
    if (!ptr || ptr.id !== e.pointerId) return;
    if (ptr.dist < 12 && e.type === "pointerup") tap(e.clientX, e.clientY);
    ptr = null;
  }
  cv.addEventListener("pointerup", endPtr);
  cv.addEventListener("pointercancel", endPtr);

  // ======================================================================
  //  VẼ KHUNG HÌNH
  // ======================================================================
  let screen = "title";
  let sunScale = 1;
  let sunFloat = 0;
  let cloudFloat = 0;
  let truckAnim = 0;

  function drawSunCloud(t) {
    if (cloudOn()) {
      cloudFloat = Math.sin(t * 1.7) * 10;
      const cx = CLOUD.x;
      const cy = CLOUD.y + cloudFloat;
      if (S.rainT > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - 115, cy + 30, 230, 330);
        ctx.clip();
        const off = (t * 220) % 79;
        for (let k = -1; k < 5; k++) {
          const yy = cy + 30 + k * 79 + off;
          ctx.globalAlpha = clamp(1 - (yy - cy - 30) / 330, 0, 1);
          if (SPR) ctx.drawImage(SPR.rain, cx - 115, yy, 230, 79);
          else {
            ctx.fillStyle = "#7fd8f5";
            for (let d = 0; d < 6; d++) ctx.fillRect(cx - 100 + d * 40 + (k % 2) * 18, yy + (d % 2) * 30, 5, 18);
          }
        }
        ctx.restore();
      }
      if (SPR) ctx.drawImage(SPR.cloud, cx - 119, cy - 69);
      else emoji("☁️", cx, cy, 150);
    }
    if (sunOn()) {
      sunScale += ((S.sunT > 0 ? 2 : 1) - sunScale) * 0.12;
      sunFloat = Math.sin(t * 2.1) * 14 - 6;
      const sx = SUN.x;
      const sy = SUN.y + sunFloat;
      ctx.save();
      if (S.sunT > 0) {
        ctx.translate(sx, sy);
        ctx.rotate(t * 0.5);
        ctx.globalAlpha = 0.85;
        const rs = 260 * sunScale;
        if (SPR) ctx.drawImage(SPR.ray, -rs, -rs, rs * 2, rs * 2);
        else {
          ctx.fillStyle = "rgba(255,240,140,.55)";
          for (let k = 0; k < 12; k++) {
            ctx.rotate(Math.PI / 6);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-30, -rs);
            ctx.lineTo(30, -rs);
            ctx.fill();
          }
        }
        ctx.setTransform(DPR * SC, 0, 0, DPR * SC, DPR * CX, DPR * CY);
        ctx.globalAlpha = 1;
      }
      if (S.sunT <= 0 && S.sunCd > 0) ctx.globalAlpha = 0.55;
      const k = sunScale;
      if (SPR) ctx.drawImage(SPR.sun, sx - 92 * k, sy - 94 * k, 184 * k, 188 * k);
      else emoji("☀️", sx, sy, 150 * k);
      ctx.restore();
    }
  }
  // đồng hồ nắng / mưa vẽ sau cùng để không bị ô đất che
  function drawTimers() {
    if (cloudOn() && S.rainT > 0) text(hhmmss(S.rainT), CLOUD.x, CLOUD.y + cloudFloat - 69 - 26, 34, "#fff", "#000", 6);
    if (!sunOn()) return;
    const sy = SUN.y + sunFloat;
    if (S.sunT > 0) text(mmss(S.sunT), SUN.x - 92 * sunScale - 62, sy, 36, "#fff", "#000", 6);
    else if (S.sunCd > 0) text(mmss(S.sunCd), SUN.x, sy + 94 + 22, 28, "#f4f4f4", "#555", 5);
  }
  function drawPlot(i, t) {
    const p = PLOTS[i];
    const f = S.farms[i];
    const d = D[i];
    const x = p.x;
    const y = p.y;
    if (pops[i] > 0) {
      const s = 1 + 0.07 * Math.sin((1 - pops[i]) * Math.PI);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.translate(-x, -y);
    }
    if (f.lv <= 0) {
      const price = plotPrice(i);
      drawPlotBase(i, x, y, !upMode && S.money >= price ? "buy" : "lock");
      drawCoin(x, y - 25);
      if (!upMode) text(price > 0 ? fmt(price) : "MIỄN PHÍ", x, y + 25, 25, "#fff", "#000", 5);
    } else if (!upMode) {
      drawPlotBase(i, x, y, "crop");
      const T = d.ht * speedMul();
      if (f.on && T >= 0.2) drawBar(x, y + 45, 88, 18, f.prog / T);
      if (d.auto || !f.on) {
        if (T < 0.2) drawBar(x, y + 45, 88, 18, 1);
        if (f.acc > 0) {
          const bob = -5 + Math.sin(t * 7 + i) * 5;
          drawCoin(x, y - 25 + bob);
          text(money(f.acc), x, y + 25, 25, "#fff", "#000", 5);
        }
      }
    } else {
      drawPlotBase(i, x, y, "sign");
      const im = SPR && SPR["icon-" + i];
      if (im) ctx.drawImage(im, x - 140 + im.width / 2 + 15, y - 85 - im.height / 2 - 20);
      else emoji(CROPS[i].emoji, x - 88, y - 112, 52);
      const n = upgCount(i);
      const price = upgPrice(i, n);
      text("+" + n, x, y - 75, 25, "#000");
      const frac = d.next < 0 ? 1 : (f.lv - d.prevLv) / (UNLOCKS[d.next].lv - d.prevLv);
      drawBar(x, y - 50, 118, 28, Math.max(frac, 0.001), true);
      text(String(f.lv), x, y - 50, 25, "#fff", "#190d3a", 5);
      // nút mua cấp
      const can = S.money >= price;
      rrect(x - 67, y + 10 - 31, 134, 62, 12);
      const g = ctx.createLinearGradient(0, y - 21, 0, y + 41);
      g.addColorStop(0, can ? "#8ff3ff" : "#d3dbe6");
      g.addColorStop(1, can ? "#3fc6f2" : "#9fadc2");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#23141a";
      ctx.stroke();
      text(money(price), x, y + 12, price >= 1e6 ? 23 : 25, can ? "#000" : "#4d5869");
    }
    if (pops[i] > 0) ctx.restore();
  }
  function drawTruck(t) {
    if (!truckOn()) {
      truckAnim = 0;
      return;
    }
    truckAnim = Math.min(1, truckAnim + 0.02);
    const e = 1 - Math.pow(1 - truckAnim, 3);
    const x = TRUCK.x + (1 - e) * 500;
    const y = TRUCK.y + Math.abs(Math.sin(t * 6)) * -6;
    const k = TRUCK.k;
    if (SPR) ctx.drawImage(SPR.truck, x - 228 * k, y - 194 * k, 456 * k, 388 * k);
    else emoji("🚚", x, y, 190);
    text("THU HOẠCH!", x, y - 194 * k - 14 + Math.sin(t * 4) * 4, 28, "#ffe36b", "#000", 6);
  }

  function render(t, dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = "#afe597";
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(DPR * SC, 0, 0, DPR * SC, DPR * CX, DPR * CY);
    drawBg();
    if (screen !== "game") return;
    drawSunCloud(t);
    for (const i of DRAW_ORDER) drawPlot(i, t);
    drawTruck(t);
    drawTimers();
    // nông sản bắn ra
    for (let k = crops.length - 1; k >= 0; k--) {
      const c = crops[k];
      c.t += dt;
      if (c.t >= c.life) {
        crops.splice(k, 1);
        continue;
      }
      c.vy += 900 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      ctx.globalAlpha = clamp(1 - (c.t / c.life) ** 3, 0, 1);
      drawIcon(c.i, c.x, c.y, 0.5);
    }
    ctx.globalAlpha = 1;
    // xu bay về ô tiền (tọa độ màn hình)
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const [tx, ty] = cashTarget();
    const ck = clamp(SC, 0.45, 1) * 0.55;
    for (let k = coins.length - 1; k >= 0; k--) {
      const c = coins[k];
      c.t += dt;
      if (c.t < c.delay) continue;
      const u = c.t - c.delay;
      if (u < 0.32) {
        c.vy += 900 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
      } else {
        const sp = Math.min(1, (u - 0.32) * 3.2);
        c.x += (tx - c.x) * sp * 0.35;
        c.y += (ty - c.y) * sp * 0.35;
        if (Math.hypot(tx - c.x, ty - c.y) < 14) {
          coins.splice(k, 1);
          sfx("coin", 70);
          bumpCash();
          continue;
        }
      }
      drawCoin(c.x, c.y, ck);
    }
    // vệt vuốt
    const now = performance.now();
    while (trail.length && now - trail[0].t > 160) trail.shift();
    if (trail.length > 1) {
      ctx.lineCap = "round";
      for (let k = 1; k < trail.length; k++) {
        const a = 1 - (now - trail[k].t) / 160;
        ctx.strokeStyle = `rgba(255,255,255,${(a * 0.85).toFixed(3)})`;
        ctx.lineWidth = 2 + a * 9;
        ctx.beginPath();
        ctx.moveTo(trail[k - 1].x, trail[k - 1].y);
        ctx.lineTo(trail[k].x, trail[k].y);
        ctx.stroke();
      }
    }
  }
  let bumpT = 0;
  function bumpCash() {
    const el = $("tCash").parentElement;
    if (performance.now() - bumpT < 120) return;
    bumpT = performance.now();
    el.animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: 160 });
  }

  // ======================================================================
  //  VÒNG LẶP
  // ======================================================================
  let lastT = performance.now();
  let saveT = 0;
  let slowT = 0;
  function frame(now) {
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt < 0) dt = 0;
    if (S && screen === "game") {
      if (dt > 1) catchUp(dt);
      else step(dt);
      idleT += Math.min(dt, 1);
      for (let i = 0; i < 9; i++) if (pops[i] > 0) pops[i] = Math.max(0, pops[i] - dt * 4);
      hudT += dt;
      if (hudT > 0.1) {
        hudT = 0;
        hud();
      }
      slowT += dt;
      if (slowT > 1) {
        slowT = 0;
        checkAch();
        if (modalKind === "achs") renderAch();
        if (checkDay()) toast("Ngày mới! Lượt mưa đã được làm mới");
        if (!modalKind && dailyDue()) openDaily();
      }
      saveT += dt;
      if (saveT > 3) {
        saveT = 0;
        save();
      }
      updateTutorial();
    }
    render(now / 1000, Math.min(dt, 0.05));
    requestAnimationFrame(frame);
  }

  // ẩn tab: lưu lại; mở lại: tính bù thời gian đã qua
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (!S) return;
    if (document.hidden) {
      hiddenAt = Date.now();
      save();
    } else if (hiddenAt) {
      const sec = (Date.now() - hiddenAt) / 1000;
      hiddenAt = 0;
      lastT = performance.now();
      if (screen === "game" && sec > 1) {
        const got = catchUp(sec);
        if (got > 0 && sec > 30) toast(`Vắng ${spanText(sec)} · nông trại làm ra ${money(got)}`);
      }
    }
  });
  addEventListener("pagehide", save);
  addEventListener("resize", resize);

  // ======================================================================
  //  KHỞI ĐỘNG
  // ======================================================================
  resize();
  S = load() || blank();
  calcAll();
  checkDay();
  const away = (Date.now() - S.last) / 1000;
  const offlineGot = away > 5 ? catchUp(away) : 0;
  requestAnimationFrame(frame);

  const fontReady = document.fonts && document.fonts.load ? document.fonts.load(`800 25px "Baloo 2"`).catch(() => {}) : Promise.resolve();
  Promise.all([loadSprites(), fontReady]).then(([spr]) => {
    SPR = spr;
    if (!SPR) document.body.classList.add("noimg");
  });

  $("btnPlay").onclick = () => {
    ac();
    sfx("click");
    screen = "game";
    $("title").hidden = true;
    $("ui").hidden = false;
    markMult();
    hud();
    lastT = performance.now();
    if (offlineGot > 0 && away > 60) {
      openModal(
        "welcome",
        "CHÀO MỪNG TRỞ LẠI!",
        `<p>Bạn đã vắng mặt <b>${spanText(away)}</b>.</p><p class="sub">Trong lúc đó nông trại tự làm ra</p><div class="card"><b style="font-size:32px">${money(
          offlineGot,
        )}</b></div><p class="sub" style="font-size:15px">Vuốt qua các ô đất để gom tiền nhé!</p><button class="btn yellow" data-close>TUYỆT!</button>`,
      );
    } else if (dailyDue()) openDaily();
  };

  // móc kiểm thử (chỉ dùng khi chạy test tự động)
  window.__farm = {
    get S() {
      return S;
    },
    set S(v) {
      S = v;
      calcAll();
    },
    D,
    fmt,
    calcAll,
    catchUp,
    toScreen,
    PLOTS,
    upgPrice,
    upgCount,
    seedGain,
  };
})();
