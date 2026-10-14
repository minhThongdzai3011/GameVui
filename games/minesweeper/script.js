// Dò Mìn — tái hiện Minesweeper của Windows 98/XP: 3 cấp Sơ cấp 9×9/10,
// Trung cấp 16×16/40, Cao cấp 30×16/99 và Tuỳ chỉnh; mìn đặt SAU cú bấm đầu nên
// ô đầu (và các ô quanh nó) luôn an toàn; chuột phải cắm cờ / dấu ?; bấm vào số
// đã đủ cờ (hoặc bấm 2 chuột / chuột giữa) để mở nhanh các ô xung quanh;
// đồng hồ LED tối đa 999; lưu kỷ lục từng cấp. Cảm ứng: chạm giữ để cắm cờ.
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const fieldEl = $("#field");
  const faceEl = $("#face");

  const LEVELS = {
    beginner: { r: 9, c: 9, m: 10, name: "Sơ cấp" },
    intermediate: { r: 16, c: 16, m: 40, name: "Trung cấp" },
    expert: { r: 16, c: 30, m: 99, name: "Cao cấp" },
  };

  // ---------- Lưu trữ ----------
  const load = (k, d) => {
    try {
      return { ...d, ...JSON.parse(localStorage.getItem(k) || "{}") };
    } catch {
      return d;
    }
  };
  const save = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* bỏ qua */
    }
  };
  const settings = load("gamevui-mines", { level: "beginner", custom: { r: 16, c: 30, m: 99 }, marks: true });
  let best = load("gamevui-mines-best", {});

  // ---------- Hình vẽ (SVG) ----------
  const MINE =
    '<svg viewBox="0 0 16 16"><g stroke="#000" stroke-width="1.5"><path d="M8 1.5v13M1.5 8h13M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2"/></g>' +
    '<circle cx="8" cy="8" r="4.6"/><rect x="5.6" y="5.6" width="2" height="2" fill="#fff"/></svg>';
  const FLAG =
    '<svg viewBox="0 0 16 16"><path d="M9.6 1.5 2.5 5.2 9.6 8.9z" fill="#f00"/><rect x="8.6" y="1.5" width="1.6" height="9.5"/>' +
    '<rect x="5.5" y="11" width="7" height="1.5"/><rect x="3.5" y="12.5" width="11" height="2"/></svg>';
  const WRONG = MINE.replace("</svg>", '<path d="M2 2l12 12M14 2 2 14" stroke="#f00" stroke-width="1.8"/></svg>');
  const face = (eyes, mouth) =>
    `<svg viewBox="0 0 22 22"><circle cx="11" cy="11" r="9.8" fill="#ff0" stroke="#000" stroke-width="1.2"/>${eyes}${mouth}</svg>`;
  const EYES = '<rect x="7" y="7" width="2" height="2.4"/><rect x="13" y="7" width="2" height="2.4"/>';
  const FACES = {
    smile: face(EYES, '<path d="M6.5 13Q11 17.6 15.5 13" fill="none" stroke="#000" stroke-width="1.4"/>'),
    oh: face(
      '<rect x="6.5" y="6.5" width="2.5" height="3"/><rect x="13" y="6.5" width="2.5" height="3"/>',
      '<circle cx="11" cy="14.6" r="2.1" fill="none" stroke="#000" stroke-width="1.4"/>',
    ),
    dead: face(
      '<path d="M6 6l3 3M9 6 6 9M13 6l3 3M16 6l-3 3" stroke="#000" stroke-width="1.3"/>',
      '<path d="M6.5 16.2Q11 11.6 15.5 16.2" fill="none" stroke="#000" stroke-width="1.4"/>',
    ),
    cool: face(
      '<path d="M3.5 7.2h15v1.4l-1.2 2.6h-4.1l-1.2-2.3h-2l-1.2 2.3H4.7L3.5 8.6z"/><path d="M3 7.6 1.6 6M19 7.6 20.4 6" stroke="#000"/>',
      '<path d="M6.5 13.4Q11 17.6 15.5 13.4" fill="none" stroke="#000" stroke-width="1.4"/>',
    ),
  };

  // Đồng hồ LED 7 đoạn
  const SEG = {
    a: [2, 0.8, 9, 1.8],
    b: [10.4, 2, 1.8, 8.6],
    c: [10.4, 12.4, 1.8, 8.6],
    d: [2, 20.4, 9, 1.8],
    e: [0.8, 12.4, 1.8, 8.6],
    f: [0.8, 2, 1.8, 8.6],
    g: [2, 10.6, 9, 1.8],
  };
  const DIGIT = {
    0: "abcdef",
    1: "bc",
    2: "abged",
    3: "abgcd",
    4: "fgbc",
    5: "afgcd",
    6: "afgedc",
    7: "abc",
    8: "abcdefg",
    9: "abcdfg",
    "-": "g",
  };
  function led(el, v) {
    v = Math.max(-99, Math.min(999, v));
    const s = v < 0 ? "-" + String(-v).padStart(2, "0") : String(v).padStart(3, "0");
    el.innerHTML = [...s]
      .map(
        (ch) =>
          '<svg viewBox="0 0 13 23">' +
          Object.entries(SEG)
            .map(([k, [x, y, w, h]]) => `<rect class="${DIGIT[ch].includes(k) ? "on" : "off"}" x="${x}" y="${y}" width="${w}" height="${h}" rx="0.6"/>`)
            .join("") +
          "</svg>",
      )
      .join("");
  }

  // ---------- Trạng thái ván ----------
  let R = 9;
  let C = 9;
  let M = 10;
  let mine;
  let opened;
  let mark; // 0 trống, 1 cờ, 2 dấu ?
  let num;
  let started = false;
  let over = false;
  let openCount = 0;
  let time = 0;
  let timerId = 0;
  let cellEls = [];
  let flagMode = false;

  const cfg = () => (settings.level === "custom" ? settings.custom : LEVELS[settings.level]);
  const flags = () => mark.reduce((s, v) => s + (v === 1), 0);
  function neighbors(i) {
    const r = (i / C) | 0;
    const c = i % C;
    const out = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < R && cc >= 0 && cc < C) out.push(rr * C + cc);
      }
    return out;
  }

  function fitCells() {
    const byW = Math.floor((window.innerWidth - 46) / C);
    const byH = Math.floor((window.innerHeight - 230) / R);
    const size = Math.max(16, Math.min(30, byW, Math.max(byH, 16)));
    document.documentElement.style.setProperty("--cell", size + "px");
  }

  function newGame() {
    const k = cfg();
    R = k.r;
    C = k.c;
    M = k.m;
    mine = new Uint8Array(R * C);
    opened = new Uint8Array(R * C);
    mark = new Uint8Array(R * C);
    num = new Uint8Array(R * C);
    started = false;
    over = false;
    openCount = 0;
    time = 0;
    clearInterval(timerId);
    fieldEl.style.setProperty("--cols", C);
    fieldEl.replaceChildren();
    cellEls = [];
    for (let i = 0; i < R * C; i++) {
      const el = document.createElement("div");
      el.className = "c";
      el.dataset.i = i;
      fieldEl.append(el);
      cellEls.push(el);
    }
    fitCells();
    setFace("smile");
    led($("#ledMines"), M);
    led($("#ledTime"), 0);
    syncMenu();
  }

  // Đặt mìn sau cú bấm đầu: tránh ô đó và 8 ô quanh nó (nếu đủ chỗ)
  function placeMines(safe) {
    const banned = new Set([safe]);
    if (R * C - M >= 9) neighbors(safe).forEach((n) => banned.add(n));
    const pool = [];
    for (let i = 0; i < R * C; i++) if (!banned.has(i)) pool.push(i);
    for (let k = 0; k < M; k++) {
      const j = k + Math.floor(Math.random() * (pool.length - k));
      [pool[k], pool[j]] = [pool[j], pool[k]];
      mine[pool[k]] = 1;
    }
    for (let i = 0; i < R * C; i++) num[i] = neighbors(i).reduce((s, n) => s + mine[n], 0);
  }

  function startTimer() {
    time = 1; // Windows bắt đầu đếm từ 1 ngay khi bấm ô đầu
    led($("#ledTime"), time);
    timerId = setInterval(() => {
      if (time < 999) led($("#ledTime"), ++time);
    }, 1000);
  }

  // ---------- Vẽ ô ----------
  function draw(i) {
    const el = cellEls[i];
    if (opened[i]) {
      el.className = "c open" + (num[i] && !mine[i] ? " n" + num[i] : "");
      el.textContent = mine[i] ? "" : num[i] || "";
      if (mine[i]) el.innerHTML = MINE;
    } else {
      el.className = "c" + (mark[i] === 2 ? " q" : "");
      el.innerHTML = mark[i] === 1 ? FLAG : "";
    }
  }

  // ---------- Luật chơi ----------
  function reveal(i) {
    if (over || opened[i] || mark[i] === 1) return;
    if (!started) {
      started = true;
      placeMines(i);
      startTimer();
    }
    if (mine[i]) return lose(i);
    // loang: ô 0 tự mở các ô xung quanh (cả ô có dấu ?, trừ ô cắm cờ)
    const stack = [i];
    while (stack.length) {
      const j = stack.pop();
      if (opened[j] || mark[j] === 1) continue;
      opened[j] = 1;
      mark[j] = 0;
      openCount++;
      draw(j);
      if (!num[j]) for (const n of neighbors(j)) if (!opened[n]) stack.push(n);
    }
    if (openCount === R * C - M) win();
  }

  // Mở nhanh: số đã có đủ cờ xung quanh → mở các ô còn lại quanh nó
  function chord(i) {
    if (over || !opened[i] || !num[i]) return;
    const ns = neighbors(i);
    if (ns.reduce((s, n) => s + (mark[n] === 1), 0) !== num[i]) return;
    for (const n of ns) if (!opened[n] && mark[n] !== 1) reveal(n);
  }

  function toggleMark(i) {
    if (over || opened[i]) return;
    mark[i] = mark[i] === 0 ? 1 : mark[i] === 1 && settings.marks ? 2 : 0;
    draw(i);
    led($("#ledMines"), M - flags());
    if (navigator.vibrate) navigator.vibrate(15);
  }

  function lose(i) {
    over = true;
    clearInterval(timerId);
    for (let j = 0; j < R * C; j++) {
      if (mine[j] && mark[j] !== 1) {
        opened[j] = 1;
        draw(j);
      } else if (!mine[j] && mark[j] === 1) {
        cellEls[j].className = "c open";
        cellEls[j].innerHTML = WRONG; // cắm cờ sai
      }
    }
    cellEls[i].classList.add("boom");
    setFace("dead");
  }

  function win() {
    over = true;
    clearInterval(timerId);
    for (let j = 0; j < R * C; j++)
      if (mine[j] && mark[j] !== 1) {
        mark[j] = 1;
        draw(j);
      }
    led($("#ledMines"), 0);
    setFace("cool");
    const lv = settings.level;
    if (lv !== "custom" && (!best[lv] || time < best[lv].t)) {
      best[lv] = { t: time, d: new Date().toLocaleDateString("vi-VN") };
      save("gamevui-mines-best", best);
      setTimeout(
        () =>
          dialog(
            "Kỷ lục mới!",
            `<p style="text-align:center">🏆 Bạn đã lập kỷ lục mới cho cấp <b>${LEVELS[lv].name}</b>:<br><b style="font-size:20px">${time} giây</b></p>` +
              '<div class="dlg-btns"><button class="btn98" data-close>OK</button></div>',
          ),
        350,
      );
    }
  }

  function setFace(f) {
    faceEl.innerHTML = FACES[f];
    faceEl.dataset.f = f;
  }

  // ---------- Chuột & cảm ứng ----------
  let press = null; // {i, chord, touch, timer, long}
  const pressed = new Set();
  function showPress(i, isChord) {
    pressed.forEach((j) => !opened[j] && cellEls[j].classList.remove("press"));
    pressed.clear();
    if (i < 0) return;
    const list = isChord ? [i, ...neighbors(i)] : [i];
    for (const j of list)
      if (!opened[j] && mark[j] !== 1) {
        cellEls[j].classList.add("press");
        pressed.add(j);
      }
  }
  const cellAt = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return el && el.classList.contains("c") && fieldEl.contains(el) ? Number(el.dataset.i) : -1;
  };

  fieldEl.addEventListener("contextmenu", (e) => e.preventDefault());
  fieldEl.addEventListener("pointerdown", (e) => {
    if (over) return;
    const i = cellAt(e);
    if (i < 0) return;
    if (e.pointerType === "mouse") {
      // chuột phải (một mình) = cắm cờ ngay khi nhấn, như Windows
      if (e.button === 2 && !(e.buttons & 1)) {
        if (!opened[i]) toggleMark(i);
        press = { i, chord: false, right: true };
        return;
      }
      const isChord = e.button === 1 || (e.buttons & 3) === 3;
      press = { i, chord: isChord };
    } else {
      press = { i, chord: false, touch: true, long: false };
      // chạm giữ = cắm cờ
      press.timer = setTimeout(() => {
        if (!press) return;
        press.long = true;
        showPress(-1);
        setFace("smile");
        if (!opened[press.i]) toggleMark(press.i);
      }, 380);
    }
    fieldEl.setPointerCapture(e.pointerId);
    setFace("oh");
    showPress(i, press.chord || opened[i]);
  });
  fieldEl.addEventListener("pointermove", (e) => {
    if (!press || press.right || over) return;
    const i = cellAt(e);
    if (press.touch && i !== press.i) {
      clearTimeout(press.timer);
      press.cancel = true; // kéo tay đi chỗ khác = huỷ
    }
    // giữ chuột trái rồi nhấn thêm chuột phải → mở nhanh
    if (e.pointerType === "mouse" && (e.buttons & 3) === 3) press.chord = true;
    press.i = i;
    showPress(i, press.chord || (i >= 0 && opened[i]));
  });
  function release(e) {
    if (!press) return;
    const p = press;
    press = null;
    clearTimeout(p.timer);
    showPress(-1);
    if (over) return;
    setFace("smile");
    if (p.right || p.long || p.cancel || p.i < 0) return;
    const i = p.i;
    if (p.touch && flagMode && !opened[i]) return toggleMark(i);
    if (p.chord || opened[i]) chord(i);
    else reveal(i);
    if (over && faceEl.dataset.f === "smile") setFace("smile");
  }
  fieldEl.addEventListener("pointerup", release);
  fieldEl.addEventListener("pointercancel", () => {
    if (press) clearTimeout(press.timer);
    press = null;
    showPress(-1);
    if (!over) setFace("smile");
  });

  faceEl.addEventListener("pointerdown", () => faceEl.classList.add("down"));
  faceEl.addEventListener("pointerup", () => faceEl.classList.remove("down"));
  faceEl.addEventListener("pointerleave", () => faceEl.classList.remove("down"));
  faceEl.addEventListener("click", newGame);

  $("#btnFlagMode").addEventListener("click", () => {
    flagMode = !flagMode;
    const b = $("#btnFlagMode");
    b.setAttribute("aria-pressed", String(flagMode));
    b.lastChild.textContent = ` Chế độ cắm cờ: ${flagMode ? "BẬT" : "TẮT"}`;
  });

  // ---------- Menu ----------
  const menuList = $("#menuList");
  const menuBtn = $("#menuGame");
  function syncMenu() {
    menuList.querySelectorAll("[data-lv]").forEach((b) => b.classList.toggle("on", b.dataset.lv === settings.level));
    $("#optMarks").classList.toggle("on", settings.marks);
  }
  function closeMenu() {
    menuList.hidden = true;
    menuBtn.classList.remove("open");
  }
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    menuList.hidden = !menuList.hidden;
    menuBtn.classList.toggle("open", !menuList.hidden);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".menu")) closeMenu();
  });
  menuList.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    closeMenu();
    if (b.dataset.lv === "custom") return customDialog();
    if (b.dataset.lv) {
      settings.level = b.dataset.lv;
      save("gamevui-mines", settings);
      return newGame();
    }
    switch (b.dataset.act) {
      case "new":
        newGame();
        break;
      case "marks":
        settings.marks = !settings.marks;
        if (!settings.marks)
          for (let i = 0; i < mark.length; i++)
            if (mark[i] === 2) {
              mark[i] = 0;
              draw(i);
            }
        save("gamevui-mines", settings);
        syncMenu();
        break;
      case "best":
        bestDialog();
        break;
      case "exit":
        location.href = "../../index.html";
        break;
    }
  });
  $("#menuHelp").addEventListener("click", () =>
    dialog(
      "Hướng dẫn",
      "<p>Mở hết các ô không có mìn để thắng.</p>" +
        "<p>• <b>Chuột trái</b>: mở ô. Số trên ô cho biết có bao nhiêu mìn trong 8 ô quanh nó.<br>" +
        "• <b>Chuột phải</b>: cắm cờ 🚩 (bấm thêm lần nữa để đặt dấu ?).<br>" +
        "• Bấm vào <b>một số đã đủ cờ</b> xung quanh (hoặc bấm cả 2 chuột / chuột giữa) để mở nhanh các ô còn lại.<br>" +
        "• Điện thoại: <b>chạm giữ</b> để cắm cờ, hoặc bật chế độ cắm cờ.<br>" +
        "• Ô đầu tiên bạn mở không bao giờ có mìn. <b>F2</b>: ván mới.</p>" +
        '<div class="dlg-btns"><button class="btn98" data-close>OK</button></div>',
    ),
  );

  // ---------- Hộp thoại ----------
  const dlgWrap = $("#dlgWrap");
  function dialog(title, html) {
    $("#dlgTitle").textContent = title;
    $("#dlgBody").innerHTML = html;
    dlgWrap.hidden = false;
    const btn = dlgWrap.querySelector(".dlg-body .btn98");
    if (btn) btn.focus();
  }
  dlgWrap.addEventListener("click", (e) => {
    if (e.target === dlgWrap || e.target.closest("[data-close]")) dlgWrap.hidden = true;
  });

  function customDialog() {
    const c = settings.custom;
    dialog(
      "Bãi mìn tuỳ chỉnh",
      `<table>
        <tr><td>Chiều cao (9–24):</td><td><input id="cuR" type="number" min="9" max="24" value="${c.r}"></td></tr>
        <tr><td>Chiều rộng (9–30):</td><td><input id="cuC" type="number" min="9" max="30" value="${c.c}"></td></tr>
        <tr><td>Số mìn:</td><td><input id="cuM" type="number" min="10" value="${c.m}"></td></tr>
      </table>
      <div class="dlg-btns"><button class="btn98" id="cuOk">OK</button><button class="btn98" data-close>Huỷ</button></div>`,
    );
    $("#cuOk").addEventListener("click", () => {
      const clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(Number(v) || a)));
      const r = clamp($("#cuR").value, 9, 24);
      const cc = clamp($("#cuC").value, 9, 30);
      const m = clamp($("#cuM").value, 10, (r - 1) * (cc - 1)); // giới hạn như Windows
      settings.custom = { r, c: cc, m };
      settings.level = "custom";
      save("gamevui-mines", settings);
      dlgWrap.hidden = true;
      newGame();
    });
  }
  function bestDialog() {
    const row = (lv) =>
      `<tr><td>${LEVELS[lv].name}:</td><td><b>${best[lv] ? best[lv].t + " giây" : "999 giây"}</b></td><td>${best[lv] ? best[lv].d : "—"}</td></tr>`;
    dialog(
      "Kỷ lục dò mìn",
      `<table>${row("beginner")}${row("intermediate")}${row("expert")}</table>
      <div class="dlg-btns"><button class="btn98" id="bestReset">Xoá kỷ lục</button><button class="btn98" data-close>OK</button></div>`,
    );
    $("#bestReset").addEventListener("click", () => {
      best = {};
      save("gamevui-mines-best", best);
      bestDialog();
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "F2") {
      e.preventDefault();
      newGame();
    } else if (e.key === "Escape") {
      dlgWrap.hidden = true;
      closeMenu();
    }
  });
  window.addEventListener("resize", fitCells);

  newGame();
})();
