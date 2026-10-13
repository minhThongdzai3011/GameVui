// Rắn săn mồi — tái hiện Snake II trên điện thoại "cục gạch" (màn LCD 84×48).
// Lưới chơi 20×9 ô, mỗi ô 4×4 điểm ảnh; 9 cấp tốc độ; 6 mê cung; mồi thưởng
// xuất hiện sau mỗi 5 mồi; rắn nuốt mồi tạo chỗ phình chạy dọc thân và chỉ dài
// thêm khi chỗ phình tới đuôi; "Không mê cung" thì đi xuyên qua mép màn hình.
(() => {
  "use strict";

  // ---------- Màn hình LCD ----------
  const LW = 84;
  const LH = 48;
  const COLS = 20;
  const ROWS = 9;
  const FX = 2; // gốc toạ độ ô (0,0) trên LCD
  const FY = 9;
  const LCD_BG = "#c7f0d8";
  const LCD_ON = "#43523d";
  const LCD_OFF = "rgba(67,82,61,0.07)";
  const FONT = "bold 9px Tahoma, Verdana, Geneva, sans-serif";
  const FONT_BIG = "bold 11px Tahoma, Verdana, Geneva, sans-serif";

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

  // Số 3×5 dùng cho bảng điểm, phóng to được
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
  const HEAD = [".##.", "##.#", "####", ".##."];
  const HEAD_OPEN = [".#.#", "##..", "##..", ".#.#"];
  const TAIL = ["....", "..##", "..##", "...."]; // thân nối ở bên phải
  const BULGE = [".##.", "####", "####", ".##."];
  const FOOD = [".#..", "#.#.", ".#..", "...."];
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

  // ---------- Mê cung (22×11, vòng ngoài là mép màn hình) ----------
  // '#' = tường, '.' = trống; ô mép trống nghĩa là đi xuyên sang phía đối diện.
  const ring = (top, side) => (inner) => [
    top,
    ...inner.map((r, i) => side[i] + r + side[i]),
    top,
  ];
  const OPEN_TOP = ".".repeat(22);
  const WALL_TOP = "#".repeat(22);
  const EMPTY = Array(9).fill(".".repeat(20));
  const MAZES = [
    { name: "Không có", map: ring(OPEN_TOP, ".........")(EMPTY) },
    { name: "Hộp", map: ring(WALL_TOP, "#########")(EMPTY) },
    {
      name: "Đường hầm",
      map: ring("######..........######", "###...###")([
        "....................",
        "....................",
        "......########......",
        "....................",
        "....................",
        "....................",
        "......########......",
        "....................",
        "....................",
      ]),
    },
    {
      name: "Cối xay",
      map: ring(OPEN_TOP, ".........")([
        "..........#.........",
        "..........#.........",
        "..........#######...",
        "....................",
        "....................",
        "....................",
        "...#######..........",
        ".........#..........",
        ".........#..........",
      ]),
    },
    {
      name: "Đường ray",
      map: ring(OPEN_TOP, "#########")([
        "....................",
        "..################..",
        "....................",
        "....................",
        "....................",
        "....................",
        "....................",
        "..################..",
        "....................",
      ]),
    },
    {
      name: "Căn hộ",
      map: ring(WALL_TOP, "#########")([
        "......#......#......",
        "......#......#......",
        "......#......#......",
        "....................",
        "....................",
        "....................",
        "......#......#......",
        "......#......#......",
        "......#......#......",
      ]),
    },
  ];
  // c, r tính theo lưới trong (−1 và 20/9 là vòng mép)
  const mazeAt = (c, r) => MAZES[maze].map[r + 1][c + 1] === "#";

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

  const HELP = [
    "Dùng 2, 4, 6, 8",
    "hoặc mũi tên để",
    "điều khiển rắn.",
    "Ăn mồi để lớn",
    "lên, ghi điểm.",
    "Cứ 5 mồi sẽ có",
    "một mồi thưởng,",
    "ăn càng nhanh",
    "càng nhiều điểm.",
    "Đừng cắn vào",
    "thân hay đâm",
    "vào tường!",
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
  const occupied = (x, y) =>
    mazeAt(x, y) ||
    snake.some((s) => s.x === x && s.y === y) ||
    (food && food.x === x && food.y === y) ||
    (bonus && bonus.y === y && (bonus.x === x || bonus.x + 1 === x));

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
    for (let i = 0; i < 5; i++) snake.push({ x: 7 - i, y: 4, full: false });
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

  // Ô phía trước (có tính đi xuyên mép), null nếu là tường mép
  function ahead(from, d) {
    let x = from.x + d.x;
    let y = from.y + d.y;
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) {
      if (mazeAt(x, y)) return null;
      x = (x + COLS) % COLS;
      y = (y + ROWS) % ROWS;
    }
    return { x, y };
  }

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
    if (!next || mazeAt(next.x, next.y)) return die();
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
    } else if (bonus && next.y === bonus.y && (next.x === bonus.x || next.x === bonus.x + 1)) {
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
  function drawField() {
    const m = MAZES[maze].map;
    // Viền: nét mảnh luôn có, ô mép là tường thì vẽ dày
    frame(0, 7, LW, 40);
    for (let c = 0; c < COLS; c++) {
      if (m[0][c + 1] === "#") rect(FX + c * 4, 8, 4, 1);
      if (m[10][c + 1] === "#") rect(FX + c * 4, 45, 4, 1);
    }
    for (let r = 0; r < ROWS; r++) {
      if (m[r + 1][0] === "#") rect(1, FY + r * 4, 1, 4);
      if (m[r + 1][21] === "#") rect(82, FY + r * 4, 1, 4);
    }
    if (m[0][0] === "#") dot(1, 8);
    if (m[0][21] === "#") dot(82, 8);
    if (m[10][0] === "#") dot(1, 45);
    if (m[10][21] === "#") dot(82, 45);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) if (m[r + 1][c + 1] === "#") rect(FX + c * 4, FY + r * 4, 4, 4);
  }

  function drawSnake() {
    const n = snake.length;
    const front = ahead(snake[0], dir);
    const mouth =
      state === "run" &&
      front &&
      ((food && same(food, front)) ||
        (bonus && front.y === bonus.y && (front.x === bonus.x || front.x === bonus.x + 1)));
    for (let i = n - 1; i >= 0; i--) {
      const s = snake[i];
      const ox = FX + s.x * 4;
      const oy = FY + s.y * 4;
      if (i === 0) {
        blitDir(mouth ? HEAD_OPEN : HEAD, ox, oy, dirTo(snake[1], s));
      } else if (s.full) {
        blit(BULGE, ox, oy);
      } else if (i === n - 1) {
        // Sprite đuôi nối bên phải → xoay theo hướng về phía đốt trước
        blitDir(TAIL, ox, oy, dirTo(s, snake[i - 1]));
      } else {
        rect(ox + 1, oy + 1, 2, 2);
        for (const d of [dirTo(s, snake[i - 1]), dirTo(s, snake[i + 1])]) {
          if (d.x === 1) rect(ox + 3, oy + 1, 1, 2);
          if (d.x === -1) rect(ox, oy + 1, 1, 2);
          if (d.y === 1) rect(ox + 1, oy + 3, 2, 1);
          if (d.y === -1) rect(ox + 1, oy, 2, 1);
        }
      }
    }
  }

  function drawGame(now) {
    digits(String(score).padStart(4, "0"), 1, 1);
    if (bonus) {
      blit(BONUS[bonus.kind], 60, 1);
      digits(String(bonus.time).padStart(2, "0"), 76, 1);
    }
    drawField();
    if (food) blit(FOOD, FX + food.x * 4, FY + food.y * 4);
    if (bonus && (bonus.time > 6 || Math.floor(now / 150) % 2 === 0))
      blit(BONUS[bonus.kind], FX + bonus.x * 4, FY + bonus.y * 4);
    const visible = state !== "dying" || Math.floor((now - diedAt) / 220) % 2 === 1;
    if (visible) drawSnake();
  }

  // ---------- Vẽ menu kiểu điện thoại ----------
  function drawScrollbar(total, first, shown) {
    if (total <= shown) return;
    rect(82, 12, 1, 36);
    const h = Math.max(4, Math.round((36 * shown) / total));
    const y = 12 + Math.round(((36 - h) * first) / (total - shown));
    rect(81, y, 3, h);
  }

  function drawList(title, items, sel, scroll, marker) {
    text(title, 41, 9, { align: "center" });
    for (let k = 0; k < 3; k++) {
      const i = scroll + k;
      if (i >= items.length) break;
      const y = 12 + k * 12;
      const on = i === sel;
      if (on) rect(0, y, 80, 12);
      text(items[i], 2, y + 9, { v: on ? 0 : 1 });
      if (marker) marker(i, y, on ? 0 : 1);
    }
    drawScrollbar(items.length, scroll, 3);
  }

  function keepVisible(sel, scroll) {
    if (sel < scroll) return sel;
    if (sel > scroll + 2) return sel - 2;
    return scroll;
  }

  function drawSplash(now) {
    text("Rắn săn mồi", 42, 13, { font: FONT_BIG, align: "center" });
    // Chú rắn uốn lượn
    const t = now / 120;
    for (let x = 8; x < 66; x += 2) {
      const y = 28 + Math.round(Math.sin((x + t * 2) / 7) * 4);
      rect(x, y, 2, 2);
    }
    const hy = 28 + Math.round(Math.sin((66 + t * 2) / 7) * 4);
    rect(66, hy - 1, 4, 4);
    dot(68, hy, 0);
    dot(71, hy + 1);
    blit(FOOD, 76, 27);
    if (Math.floor(now / 500) % 2 === 0) text("Bấm để chơi", 42, 46, { align: "center" });
  }

  function drawLevel() {
    text("Cấp độ", 41, 9, { align: "center" });
    digits(String(levelPick), 42 - 4, 13, 3);
    for (let i = 0; i < 9; i++) {
      const x = 7 + i * 8;
      if (i < levelPick) rect(x, 36, 6, 7);
      else frame(x, 36, 6, 7);
    }
  }

  function drawMazes() {
    drawList(
      "Mê cung",
      MAZES.map((m) => m.name),
      listSel,
      listScroll,
      (i, y, v) => {
        frame(73, y + 3, 6, 6, v);
        if (i === maze) rect(75, y + 5, 2, 2, v);
      },
    );
  }

  function drawTop() {
    text("Điểm cao nhất", 41, 9, { align: "center" });
    const s = String(top);
    digits(s, 42 - Math.floor(digitsWidth(s, 3) / 2), 20, 3);
  }

  function drawHelp() {
    text("Hướng dẫn", 41, 9, { align: "center" });
    for (let k = 0; k < 3; k++) {
      const line = HELP[listScroll + k];
      if (line) text(line, 1, 21 + k * 12);
    }
    drawScrollbar(HELP.length, listScroll, 3);
  }

  function drawOver() {
    text("Kết thúc!", 42, 10, { align: "center" });
    text("Điểm của bạn:", 42, 23, { align: "center" });
    const s = String(score);
    digits(s, 42 - Math.floor(digitsWidth(s, 2) / 2), 27, 2);
    if (newTop) text("Kỷ lục mới!", 42, 47, { align: "center" });
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
            listScroll = keepVisible(maze, Math.max(0, maze - 2));
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
        else if (k === "down") listScroll = Math.min(HELP.length - 3, listScroll + 1);
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
