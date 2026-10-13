// Rắn săn mồi — tái hiện Snake Xenzia trên điện thoại "cục gạch" (màn LCD 96×68
// vàng xanh). Lưới chơi 24×14 ô, mỗi ô 4×4 điểm ảnh; thân rắn dạng vảy so le có
// chấm sáng ở mỗi đốt; điểm hiển thị ở đáy màn hình; 9 cấp tốc độ; 6 mê cung;
// mồi thưởng sau mỗi 5 mồi; nuốt mồi tạo chỗ phình chạy dọc thân và rắn chỉ dài
// thêm khi chỗ phình tới đuôi; đi ra mép (nếu không có tường) thì xuyên sang bên kia.
(() => {
  "use strict";

  // ---------- Màn hình LCD ----------
  const LW = 96;
  const LH = 68;
  const COLS = 24;
  const ROWS = 14;
  const HUD_Y = 57; // vạch kẻ phía trên điểm số
  const CX = LW / 2;
  const LCD_BG = "#a3a02a";
  const LCD_ON = "#2f2a0c";
  const LCD_OFF = "rgba(47,42,12,0.06)";
  const FONT = "bold 9px Tahoma, Verdana, Geneva, sans-serif";
  const FONT_BIG = "bold 12px Tahoma, Verdana, Geneva, sans-serif";

  // Mili-giây cho mỗi bước đi theo cấp độ 1..9
  const SPEED = [0, 500, 420, 350, 290, 235, 190, 150, 115, 85];

  const lcd = document.getElementById("lcd");
  const lctx = lcd.getContext("2d");
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
        /* bỏ qua */
      }
    },
  };

  const px = new Uint8Array(LW * LH); // khung hình 1-bit đang vẽ
  const glow = new Float32Array(LW * LH); // độ đậm hiển thị (mô phỏng LCD chậm)

  const clear = () => px.fill(0);
  function dot(x, y, v = 1) {
    if (x >= 0 && y >= 0 && x < LW && y < LH) px[y * LW + x] = v;
  }
  function rect(x, y, w, h, v = 1) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) dot(i, j, v);
  }
  function frame(x, y, w, h, v = 1) {
    rect(x, y, w, 1, v);
    rect(x, y + h - 1, w, 1, v);
    rect(x, y, 1, h, v);
    rect(x + w - 1, y, 1, h, v);
  }
  function blit(map, x, y, v = 1) {
    for (let r = 0; r < map.length; r++)
      for (let c = 0; c < map[r].length; c++) if (map[r][c] === "#") dot(x + c, y + r, v);
  }

  // ---------- Chữ: vẽ bằng font hệ thống rồi lấy ngưỡng thành 1-bit ----------
  const [tc, tx] = (() => {
    const c = document.createElement("canvas");
    c.width = 240;
    c.height = 28;
    return [c, c.getContext("2d", { willReadFrequently: true })];
  })();
  const textCache = new Map();
  function glyphs(str, font) {
    const key = font + "|" + str;
    let t = textCache.get(key);
    if (t) return t;
    tx.clearRect(0, 0, tc.width, tc.height);
    tx.font = font;
    tx.textBaseline = "alphabetic";
    tx.fillStyle = "#000";
    tx.fillText(str, 0, 18);
    const w = Math.min(tc.width, Math.ceil(tx.measureText(str).width) + 1);
    const data = tx.getImageData(0, 0, w, tc.height).data;
    const bits = [];
    for (let y = 0; y < tc.height; y++)
      for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 110) bits.push(x, y - 18);
    t = { w, bits };
    textCache.set(key, t);
    return t;
  }
  // (x, baseline): toạ độ đường chân chữ
  function text(str, x, baseline, { font = FONT, align = "left", v = 1 } = {}) {
    const t = glyphs(str, font);
    const ox = align === "center" ? Math.round(x - t.w / 2) : align === "right" ? x - t.w : x;
    for (let i = 0; i < t.bits.length; i += 2) dot(ox + t.bits[i], baseline + t.bits[i + 1], v);
  }

  // Số 4×7 nét mảnh cho điểm ở đáy màn hình
  const DIGITS7 = {
    0: [".##.", "#..#", "#..#", "#..#", "#..#", "#..#", ".##."],
    1: ["..#.", ".##.", "..#.", "..#.", "..#.", "..#.", ".###"],
    2: [".##.", "#..#", "...#", "..#.", ".#..", "#...", "####"],
    3: [".##.", "#..#", "...#", "..#.", "...#", "#..#", ".##."],
    4: ["..#.", ".##.", "#.#.", "#.#.", "####", "..#.", "..#."],
    5: ["####", "#...", "###.", "...#", "...#", "#..#", ".##."],
    6: [".##.", "#...", "###.", "#..#", "#..#", "#..#", ".##."],
    7: ["####", "...#", "..#.", "..#.", ".#..", ".#..", ".#.."],
    8: [".##.", "#..#", "#..#", ".##.", "#..#", "#..#", ".##."],
    9: [".##.", "#..#", "#..#", ".###", "...#", "...#", ".##."],
  };
  function digits7(str, x, y) {
    for (const ch of str) {
      if (DIGITS7[ch]) blit(DIGITS7[ch], x, y);
      x += 5;
    }
  }

  // Số 3×5 phóng to cho các màn điểm / cấp độ
  const DIGITS = {
    0: ["###", "#.#", "#.#", "#.#", "###"],
    1: [".#.", "##.", ".#.", ".#.", "###"],
    2: ["###", "..#", "###", "#..", "###"],
    3: ["###", "..#", "###", "..#", "###"],
    4: ["#.#", "#.#", "###", "..#", "..#"],
    5: ["###", "#..", "###", "..#", "###"],
    6: ["###", "#..", "###", "#.#", "###"],
    7: ["###", "..#", "..#", "..#", "..#"],
    8: ["###", "#.#", "###", "#.#", "###"],
    9: ["###", "#.#", "###", "..#", "###"],
  };
  function digits(str, x, y, s = 1, v = 1) {
    for (const ch of str) {
      const d = DIGITS[ch];
      if (d)
        for (let r = 0; r < 5; r++)
          for (let c = 0; c < 3; c++) if (d[r][c] === "#") rect(x + c * s, y + r * s, s, s, v);
      x += 4 * s;
    }
  }
  const digitsWidth = (str, s = 1) => str.length * 4 * s - s;

  // ---------- Sprite (ô 4×4) ----------
  // Đầu rắn hướng sang phải, thân nối ở bên trái
  const HEAD = ["###.", "#.##", "####", "###."];
  const HEAD_OPEN = ["####", "#.#.", "##..", "####"];
  const TAIL = ["....", "..##", "####", "...."]; // thon dần, thân nối ở bên phải
  const FOOD = [".##.", "##.#", "####", ".##."];
  const BONUS = [
    ["#..##..#", ".######.", "#.#..#.#", ".#....#."],
    [".##..##.", "#..##..#", ".######.", "#.#..#.#"],
    ["..####.#", ".#.#####", "########", "..####.#"],
    [".######.", "##.##.##", ".######.", "#.#..#.#"],
  ];

  // Vẽ sprite 4×4 xoay theo hướng (sprite gốc hướng sang phải)
  function blitDir(map, ox, oy, d) {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        if (map[y][x] !== "#") continue;
        let X = x;
        let Y = y;
        if (d.x === -1) X = 3 - x;
        else if (d.y === 1) {
          X = 3 - y;
          Y = x;
        } else if (d.y === -1) {
          X = y;
          Y = 3 - x;
        }
        dot(ox + X, oy + Y);
      }
  }

  // ---------- Mê cung 24×14 ('#' = tường) ----------
  // Ra khỏi mép lưới thì xuyên sang phía đối diện, nên mép nào có tường mới chặn.
  const grid = (wall) =>
    Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => (wall(c, r) ? "#" : ".")).join(""),
    );
  const edge = (c, r) => c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1;
  const MAZES = [
    { name: "Không có", map: grid(() => false) },
    { name: "Hộp", map: grid(edge) },
    {
      name: "Đường hầm",
      map: grid(
        (c, r) =>
          (edge(c, r) && !((r === 0 || r === ROWS - 1) && c >= 9 && c <= 14) && !((c === 0 || c === COLS - 1) && r >= 5 && r <= 8)) ||
          ((r === 4 || r === 9) && c >= 7 && c <= 16),
      ),
    },
    {
      name: "Cối xay",
      map: grid(
        (c, r) =>
          (c === 12 && r <= 3) ||
          (r === 3 && c >= 12 && c <= 19) ||
          (c === 11 && r >= 10) ||
          (r === 10 && c >= 4 && c <= 11),
      ),
    },
    {
      name: "Đường ray",
      map: grid(
        (c, r) => c === 0 || c === COLS - 1 || ((r === 3 || r === 10) && c >= 3 && c <= 20),
      ),
    },
    {
      name: "Căn hộ",
      map: grid(
        (c, r) => edge(c, r) || ((c === 8 || c === 15) && ((r >= 1 && r <= 4) || (r >= 9 && r <= 12))),
      ),
    },
  ];
  const mazeAt = (c, r) => MAZES[maze].map[r][c] === "#";

  // ---------- Âm thanh: tiếng bíp sóng vuông như loa điện thoại cũ ----------
  let actx = null;
  let muted = store.get("gamevui-snake-muted") === "1";
  function beep(freq, dur, delay = 0, vol = 0.06) {
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
    o.type = "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.01);
  }
  const sfx = {
    key: () => beep(1400, 0.03, 0, 0.035),
    eat: () => beep(2100, 0.035),
    bonusShow: () => {
      beep(1760, 0.05);
      beep(1760, 0.05, 0.09);
    },
    bonusEat: () => {
      beep(1320, 0.05);
      beep(1760, 0.05, 0.06);
      beep(2640, 0.09, 0.12);
    },
    die: () => {
      beep(440, 0.12);
      beep(330, 0.12, 0.14);
      beep(220, 0.3, 0.28);
    },
  };
  function refreshSoundBtn() {
    soundBtn.textContent = muted ? "🔇 Âm thanh: Tắt" : "🔊 Âm thanh: Bật";
    soundBtn.setAttribute("aria-pressed", String(!muted));
  }
  soundBtn.addEventListener("click", () => {
    muted = !muted;
    store.set("gamevui-snake-muted", muted ? "1" : "0");
    refreshSoundBtn();
    soundBtn.blur();
  });
  refreshSoundBtn();

  // ---------- Trạng thái ----------
  let level = Math.min(9, Math.max(1, Number(store.get("gamevui-snake-level")) || 5));
  let maze = Math.min(MAZES.length - 1, Math.max(0, Number(store.get("gamevui-snake-maze")) || 0));
  let top = Number(store.get("gamevui-snake-top")) || 0;

  // screen: splash | menu | level | maze | top | help | game | over
  let screen = "splash";
  let screenAt = 0;
  let menuSel = 0;
  let menuScroll = 0;
  let listSel = 0;
  let listScroll = 0;
  let levelPick = level;
  let paused = false; // đang có ván dở (hiện mục "Tiếp tục")

  let snake = [];
  let dir = { x: 1, y: 0 };
  let queue = [];
  let food = null;
  let bonus = null;
  let eaten = 0;
  let score = 0;
  let state = "run"; // run | dying
  let resumeAt = 0;
  let acc = 0;
  let diedAt = 0;
  let newTop = false;

  const VISIBLE = 4; // số dòng hiện được trong danh sách
  const HELP = [
    "Dùng 2, 4, 6, 8 hoặc",
    "mũi tên để điều",
    "khiển rắn.",
    "Ăn mồi để lớn lên",
    "và ghi điểm.",
    "Cứ 5 mồi sẽ có một",
    "mồi thưởng, ăn càng",
    "nhanh càng nhiều",
    "điểm.",
    "Đừng cắn vào thân",
    "hay đâm vào tường!",
    "C: tạm dừng.",
  ];

  const menuItems = () => [
    ...(paused ? [["Tiếp tục", "continue"]] : []),
    ["Trò chơi mới", "new"],
    ["Cấp độ", "level"],
    ["Mê cung", "maze"],
    ["Điểm cao nhất", "top"],
    ["Hướng dẫn", "help"],
  ];

  function go(name) {
    screen = name;
    screenAt = performance.now();
  }

  // ---------- Logic rắn ----------
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const onBonus = (p) => bonus && p.y === bonus.y && (p.x === bonus.x || p.x === bonus.x + 1);
  const occupied = (x, y) =>
    mazeAt(x, y) ||
    snake.some((s) => s.x === x && s.y === y) ||
    (food && food.x === x && food.y === y) ||
    onBonus({ x, y });

  function randomFree(width = 1) {
    const free = [];
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x + width - 1 < COLS; x++) {
        let ok = true;
        for (let k = 0; k < width; k++) if (occupied(x + k, y)) ok = false;
        if (ok) free.push({ x, y });
      }
    return free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  function newGame() {
    snake = [];
    for (let i = 0; i < 6; i++) snake.push({ x: 9 - i, y: 7, full: false });
    dir = { x: 1, y: 0 };
    queue = [];
    bonus = null;
    food = null;
    eaten = 0;
    score = 0;
    state = "run";
    newTop = false;
    acc = 0;
    food = randomFree();
    paused = false;
    resumeAt = performance.now() + 700;
    go("game");
  }

  function turn(d) {
    const last = queue.length ? queue[queue.length - 1] : dir;
    if ((d.x === last.x && d.y === last.y) || (d.x === -last.x && d.y === -last.y)) return;
    if (queue.length < 2) queue.push(d);
  }

  // Ô phía trước, xuyên mép sang phía đối diện
  const ahead = (from, d) => ({
    x: (from.x + d.x + COLS) % COLS,
    y: (from.y + d.y + ROWS) % ROWS,
  });

  function die() {
    state = "dying";
    diedAt = performance.now();
    sfx.die();
    if (score > top) {
      top = score;
      newTop = true;
      store.set("gamevui-snake-top", String(top));
    }
  }

  function step() {
    if (queue.length) dir = queue.shift();
    const next = ahead(snake[0], dir);
    if (mazeAt(next.x, next.y)) return die();
    const tail = snake[snake.length - 1];
    const grow = tail.full;
    const body = grow ? snake : snake.slice(0, -1);
    if (body.some((s) => same(s, next))) return die();

    snake.unshift({ x: next.x, y: next.y, full: false });
    // Chỗ phình tới đuôi thì rắn dài thêm 1 đốt
    if (grow) tail.full = false;
    else snake.pop();

    if (food && same(food, next)) {
      score += level;
      snake[0].full = true;
      eaten++;
      food = null;
      food = randomFree();
      if (eaten % 5 === 0 && !bonus) {
        const spot = randomFree(2);
        if (spot) {
          bonus = {
            ...spot,
            kind: Math.floor(Math.random() * BONUS.length),
            time: 20 + level * 4,
          };
          sfx.bonusShow();
        } else sfx.eat();
      } else sfx.eat();
    } else if (onBonus(next)) {
      score += 5 * level + bonus.time;
      snake[0].full = true;
      bonus = null;
      sfx.bonusEat();
    }
    if (bonus && --bonus.time <= 0) bonus = null;
  }

  // Hướng từ ô a sang ô b kề nhau (tính cả trường hợp xuyên mép)
  function dirTo(a, b) {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    if (dx > 1) dx = -1;
    else if (dx < -1) dx = 1;
    if (dy > 1) dy = -1;
    else if (dy < -1) dy = 1;
    return { x: dx, y: dy };
  }

  // ---------- Vẽ màn chơi ----------
  function drawWalls() {
    const m = MAZES[maze].map;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (m[r][c] === "#") {
          rect(c * 4, r * 4, 4, 4);
          dot(c * 4 + 1 + ((c + r) & 1), r * 4 + 1 + ((c + r) & 1), 0);
        }
  }

  // Đốt thân: dải dày 4px, lệch lên/xuống 1px xen kẽ (tạo vảy lượn sóng),
  // cách một đốt có một chấm sáng.
  function drawBody(s, conns, ox, oy) {
    const p = (s.x + s.y) & 1; // 0: dải nằm gọn trong ô, 1: lệch xuống/phải 1px
    if (conns.some((d) => d.x !== 0)) {
      const x0 = conns.some((d) => d.x === -1) ? 0 : 1;
      const x1 = conns.some((d) => d.x === 1) ? 3 : 2;
      rect(ox + x0, oy + p, x1 - x0 + 1, 4);
    }
    if (conns.some((d) => d.y !== 0)) {
      const y0 = conns.some((d) => d.y === -1) ? 0 : 1;
      const y1 = conns.some((d) => d.y === 1) ? 3 : 2;
      rect(ox + p, oy + y0, 4, y1 - y0 + 1);
    }
    if (s.full) {
      // Chỗ phình khi vừa nuốt mồi
      rect(ox, oy, 4, 4);
    }
    if (!p) dot(ox + 1, oy + 1, 0);
    else dot(ox + 2, oy + 2, 0);
  }

  function drawSnake() {
    const n = snake.length;
    const front = ahead(snake[0], dir);
    const mouth = state === "run" && ((food && same(food, front)) || onBonus(front));
    for (let i = n - 1; i >= 0; i--) {
      const s = snake[i];
      const ox = s.x * 4;
      const oy = s.y * 4;
      if (i === 0) blitDir(mouth ? HEAD_OPEN : HEAD, ox, oy, dirTo(snake[1], s));
      else if (i === n - 1 && !s.full) blitDir(TAIL, ox, oy, dirTo(s, snake[i - 1]));
      else {
        const conns = [dirTo(s, snake[i - 1])];
        if (i < n - 1) conns.push(dirTo(s, snake[i + 1]));
        drawBody(s, conns, ox, oy);
      }
    }
  }

  function drawGame(now) {
    drawWalls();
    if (food) blit(FOOD, food.x * 4, food.y * 4);
    if (bonus && (bonus.time > 6 || Math.floor(now / 150) % 2 === 0))
      blit(BONUS[bonus.kind], bonus.x * 4, bonus.y * 4);
    const visible = state !== "dying" || Math.floor((now - diedAt) / 220) % 2 === 1;
    if (visible) drawSnake();

    // Thanh điểm ở đáy màn hình
    rect(0, HUD_Y, LW, 1);
    digits7(String(score).padStart(4, "0"), 1, 60);
    if (bonus) {
      blit(BONUS[bonus.kind], 72, 62);
      digits7(String(bonus.time).padStart(2, "0"), 86, 60);
    }
  }

  // ---------- Vẽ menu kiểu điện thoại ----------
  function drawScrollbar(total, first, shown) {
    if (total <= shown) return;
    rect(94, 13, 1, 55);
    const h = Math.max(5, Math.round((55 * shown) / total));
    const y = 13 + Math.round(((55 - h) * first) / (total - shown));
    rect(93, y, 3, h);
  }

  function drawHeader(title) {
    text(title, CX, 10, { align: "center" });
  }

  function drawList(title, items, sel, scroll, marker) {
    drawHeader(title);
    for (let k = 0; k < VISIBLE; k++) {
      const i = scroll + k;
      if (i >= items.length) break;
      const y = 13 + k * 13;
      const on = i === sel;
      if (on) rect(0, y, 92, 13);
      text(items[i], 2, y + 10, { v: on ? 0 : 1 });
      if (marker) marker(i, y, on ? 0 : 1);
    }
    drawScrollbar(items.length, scroll, VISIBLE);
  }

  function keepVisible(sel, scroll) {
    if (sel < scroll) return sel;
    if (sel > scroll + VISIBLE - 1) return sel - VISIBLE + 1;
    return scroll;
  }

  // Màn chào: chú rắn vảy uốn lượn đi về phía mồi
  function drawSplash(now) {
    text("Rắn săn mồi", CX, 16, { font: FONT_BIG, align: "center" });
    const t = now / 90;
    for (let x = 6; x < 74; x += 2) {
      const y = 34 + Math.round(Math.sin((x + t) / 8) * 5);
      rect(x, y + ((x >> 1) & 1), 2, 3);
      if (x % 4 === 2) dot(x, y + 1 + ((x >> 1) & 1), 0);
    }
    const hy = 34 + Math.round(Math.sin((74 + t) / 8) * 5);
    blit(HEAD, 74, hy);
    blit(FOOD, 84, 35);
    if (Math.floor(now / 500) % 2 === 0) text("Bấm để chơi", CX, 62, { align: "center" });
  }

  function drawLevel() {
    drawHeader("Cấp độ");
    digits(String(levelPick), CX - 6, 16, 4);
    for (let i = 0; i < 9; i++) {
      const x = 4 + i * 10;
      if (i < levelPick) rect(x, 46, 8, 10);
      else frame(x, 46, 8, 10);
    }
  }

  function drawMazes() {
    drawList(
      "Mê cung",
      MAZES.map((m) => m.name),
      listSel,
      listScroll,
      (i, y, v) => {
        frame(84, y + 3, 7, 7, v);
        if (i === maze) rect(86, y + 5, 3, 3, v);
      },
    );
  }

  function drawTop() {
    drawHeader("Điểm cao nhất");
    const s = String(top);
    digits(s, CX - Math.floor(digitsWidth(s, 4) / 2), 24, 4);
  }

  function drawHelp() {
    drawHeader("Hướng dẫn");
    for (let k = 0; k < VISIBLE; k++) {
      const line = HELP[listScroll + k];
      if (line) text(line, 1, 24 + k * 13);
    }
    drawScrollbar(HELP.length, listScroll, VISIBLE);
  }

  function drawOver() {
    text("Kết thúc!", CX, 13, { font: FONT_BIG, align: "center" });
    text("Điểm của bạn:", CX, 29, { align: "center" });
    const s = String(score);
    digits(s, CX - Math.floor(digitsWidth(s, 3) / 2), 34, 3);
    if (newTop) text("Kỷ lục mới!", CX, 65, { align: "center" });
  }

  // ---------- Điều khiển ----------
  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  function pause() {
    if (screen !== "game" || state !== "run") return;
    paused = true;
    menuSel = 0;
    menuScroll = 0;
    go("menu");
  }

  function input(k) {
    const now = performance.now();
    if (screen !== "game") sfx.key();
    switch (screen) {
      case "splash":
        if (now - screenAt > 300) go("menu");
        break;
      case "menu": {
        const items = menuItems();
        if (k === "up" || k === "down") {
          menuSel = (menuSel + (k === "up" ? -1 : 1) + items.length) % items.length;
          menuScroll = keepVisible(menuSel, menuScroll);
        } else if (k === "ok" || k === "right") {
          const act = items[menuSel][1];
          if (act === "continue") {
            resumeAt = now + 600;
            acc = 0;
            go("game");
          } else if (act === "new") newGame();
          else if (act === "level") {
            levelPick = level;
            go("level");
          } else if (act === "maze") {
            listSel = maze;
            listScroll = keepVisible(maze, 0);
            go("maze");
          } else if (act === "top") go("top");
          else if (act === "help") {
            listScroll = 0;
            go("help");
          }
        } else if (k === "back" || k === "left") {
          if (paused) {
            resumeAt = now + 600;
            acc = 0;
            go("game");
          } else go("splash");
        }
        break;
      }
      case "level":
        if (k === "up" || k === "right") levelPick = Math.min(9, levelPick + 1);
        else if (k === "down" || k === "left") levelPick = Math.max(1, levelPick - 1);
        else if (k === "ok") {
          level = levelPick;
          store.set("gamevui-snake-level", String(level));
          go("menu");
        } else if (k === "back") go("menu");
        break;
      case "maze":
        if (k === "up" || k === "down") {
          listSel = (listSel + (k === "up" ? -1 : 1) + MAZES.length) % MAZES.length;
          listScroll = keepVisible(listSel, listScroll);
        } else if (k === "ok" || k === "right") {
          maze = listSel;
          store.set("gamevui-snake-maze", String(maze));
          paused = false; // đổi mê cung thì ván dở không còn hợp lệ
          menuSel = Math.min(menuSel, menuItems().length - 1);
          go("menu");
        } else if (k === "back" || k === "left") go("menu");
        break;
      case "top":
        if (k === "ok" || k === "back" || k === "left") go("menu");
        break;
      case "help":
        if (k === "up") listScroll = Math.max(0, listScroll - 1);
        else if (k === "down") listScroll = Math.min(HELP.length - VISIBLE, listScroll + 1);
        else if (k === "ok" || k === "back" || k === "left") go("menu");
        break;
      case "game":
        if (DIRS[k]) {
          if (state === "run") turn(DIRS[k]);
        } else if (k === "back") pause();
        break;
      case "over":
        if (now - screenAt > 600) {
          menuSel = 0;
          menuScroll = 0;
          go("menu");
        }
        break;
    }
  }

  const KEYMAP = {
    ArrowUp: "up",
    KeyW: "up",
    Digit2: "up",
    Numpad2: "up",
    ArrowDown: "down",
    KeyS: "down",
    Digit8: "down",
    Numpad8: "down",
    ArrowLeft: "left",
    KeyA: "left",
    Digit4: "left",
    Numpad4: "left",
    ArrowRight: "right",
    KeyD: "right",
    Digit6: "right",
    Numpad6: "right",
    Enter: "ok",
    NumpadEnter: "ok",
    Space: "ok",
    Digit5: "ok",
    Numpad5: "ok",
    Escape: "back",
    Backspace: "back",
    KeyC: "back",
    KeyP: "back",
  };
  window.addEventListener("keydown", (e) => {
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    if (e.repeat && (k === "ok" || k === "back")) return;
    input(k);
  });

  document.querySelectorAll(".phone [data-key]").forEach((b) => {
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const k = b.dataset.key;
      if (k === "none") sfx.key();
      else input(k);
    });
  });

  // Vuốt trên màn hình để đổi hướng, chạm để chọn
  let touchStart = null;
  lcd.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    touchStart = { x: e.clientX, y: e.clientY };
  });
  lcd.addEventListener("pointerup", (e) => {
    if (!touchStart) return;
    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) {
      if (screen !== "game") input("ok");
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) input(dx > 0 ? "right" : "left");
    else input(dy > 0 ? "down" : "up");
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  window.addEventListener("blur", pause);

  // ---------- Xuất hình ra canvas (lưới điểm ảnh + bóng mờ LCD) ----------
  // Mỗi điểm ảnh LCD = số nguyên điểm ảnh thật để hình luôn sắc nét
  let P = 4;
  let gridCache = null;
  const holder = lcd.parentElement;
  function fit() {
    const cs = getComputedStyle(holder);
    const avail = holder.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const dpr = window.devicePixelRatio || 1;
    P = Math.max(2, Math.floor((avail * dpr) / LW));
    lcd.style.width = (LW * P) / dpr + "px";
    if (lcd.width !== LW * P || lcd.height !== LH * P) {
      lcd.width = LW * P;
      lcd.height = LH * P;
      gridCache = null;
    }
  }
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(holder);
  else window.addEventListener("resize", fit);
  fit();

  function present() {
    const gap = P >= 6 ? 1 : 0;
    if (!gridCache) {
      gridCache = document.createElement("canvas");
      gridCache.width = LW * P;
      gridCache.height = LH * P;
      const g = gridCache.getContext("2d");
      g.fillStyle = LCD_BG;
      g.fillRect(0, 0, LW * P, LH * P);
      g.fillStyle = LCD_OFF;
      for (let y = 0; y < LH; y++)
        for (let x = 0; x < LW; x++) g.fillRect(x * P, y * P, P - gap, P - gap);
    }
    lctx.globalAlpha = 1;
    lctx.drawImage(gridCache, 0, 0);
    lctx.fillStyle = LCD_ON;
    for (let i = 0; i < px.length; i++) {
      glow[i] += (px[i] - glow[i]) * 0.5;
      const v = glow[i];
      if (v < 0.03) continue;
      lctx.globalAlpha = v;
      lctx.fillRect((i % LW) * P, Math.floor(i / LW) * P, P - gap, P - gap);
    }
    lctx.globalAlpha = 1;
  }

  // ---------- Vòng lặp ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(250, now - last);
    last = now;

    if (screen === "game") {
      if (state === "run" && now >= resumeAt) {
        acc += dt;
        while (acc >= SPEED[level] && state === "run") {
          acc -= SPEED[level];
          step();
        }
      } else if (state === "dying" && now - diedAt > 1900) {
        paused = false;
        go("over");
      }
    }

    clear();
    if (screen === "splash") drawSplash(now);
    else if (screen === "menu") {
      const items = menuItems();
      menuSel = Math.min(menuSel, items.length - 1);
      drawList("Rắn săn mồi", items.map((i) => i[0]), menuSel, menuScroll);
    } else if (screen === "level") drawLevel();
    else if (screen === "maze") drawMazes();
    else if (screen === "top") drawTop();
    else if (screen === "help") drawHelp();
    else if (screen === "game") drawGame(now);
    else if (screen === "over") drawOver();
    present();
    requestAnimationFrame(loop);
  }
  go("splash");
  requestAnimationFrame(loop);
})();
