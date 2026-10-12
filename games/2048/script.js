const SIZE = 4,
  boardEl = document.querySelector("#board"),
  scoreEl = document.querySelector("#score"),
  bestEl = document.querySelector("#best"),
  message = document.querySelector("#message"),
  titleEl = document.querySelector("#messageTitle"),
  textEl = document.querySelector("#messageText");
let board = [],
  score = 0,
  best = Number(localStorage.getItem("gamevui-2048-best") || 0),
  previous = null,
  won = false;
bestEl.textContent = best;
for (let i = 0; i < 16; i++) {
  const e = document.createElement("div");
  e.className = "cell";
  boardEl.append(e);
}
const copy = (b) => b.map((row) => row.map((t) => (t ? { ...t } : null)));
function empty() {
  const a = [];
  board.forEach((r, y) =>
    r.forEach((t, x) => {
      if (!t) a.push([y, x]);
    }),
  );
  return a;
}
function add() {
  const a = empty();
  if (!a.length) return;
  const [y, x] = a[(Math.random() * a.length) | 0];
  board[y][x] = { v: Math.random() < 0.9 ? 2 : 4, new: true };
}
function start() {
  board = Array.from({ length: 4 }, () => Array(4).fill(null));
  score = 0;
  previous = null;
  won = false;
  message.classList.remove("show");
  add();
  add();
  render();
}
function lineIndexes(dir, n) {
  return dir === "left" || dir === "right"
    ? Array.from({ length: 4 }, (_, i) => [n, i])
    : Array.from({ length: 4 }, (_, i) => [i, n]);
}
function move(dir) {
  if (message.classList.contains("show")) return;
  const before = copy(board);
  let changed = false,
    merged = [];
  for (let n = 0; n < 4; n++) {
    let cells = lineIndexes(dir, n);
    if (dir === "right" || dir === "down") cells.reverse();
    const values = cells.map(([y, x]) => board[y][x]).filter(Boolean),
      next = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i + 1] && values[i].v === values[i + 1].v) {
        const v = values[i].v * 2;
        next.push({ v, merged: true });
        score += v;
        merged.push(v);
        i++;
      } else next.push({ ...values[i], new: false, merged: false });
    }
    while (next.length < 4) next.push(null);
    cells.forEach(([y, x], i) => {
      if ((board[y][x]?.v || 0) !== (next[i]?.v || 0)) changed = true;
      board[y][x] = next[i];
    });
  }
  if (!changed) return;
  previous = {
    board: before,
    score: score - merged.reduce((a, b) => a + b, 0),
    won,
  };
  add();
  if (score > best) {
    best = score;
    localStorage.setItem("gamevui-2048-best", best);
  }
  render();
  if (merged.includes(2048) && !won) {
    won = true;
    show("Bạn thắng!", "Bạn đã tạo được ô 2048.");
  } else if (!canMove())
    show("Hết nước đi", "Không còn ô trống hoặc cặp số để gộp.");
}
function canMove() {
  if (empty().length) return true;
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const v = board[y][x].v;
      if (
        (x < 3 && board[y][x + 1].v === v) ||
        (y < 3 && board[y + 1][x].v === v)
      )
        return true;
    }
  return false;
}
function render() {
  scoreEl.textContent = score;
  bestEl.textContent = best;
  boardEl.querySelectorAll(".tile").forEach((e) => e.remove());
  board.forEach((r, y) =>
    r.forEach((t, x) => {
      if (!t) return;
      const e = document.createElement("div"),
        pos = `translate(calc(${x} * (100% + 10px)), calc(${y} * (100% + 10px)))`;
      e.className = `tile n${t.v}${t.new ? " new" : ""}${t.merged ? " merged" : ""}`;
      e.style.transform = pos;
      e.style.setProperty("--tile-transform", pos);
      e.textContent = t.v;
      boardEl.append(e);
      t.new = false;
      t.merged = false;
    }),
  );
}
function show(title, text) {
  titleEl.textContent = title;
  textEl.textContent = text;
  message.classList.add("show");
}
function undo() {
  if (!previous) return;
  board = copy(previous.board);
  score = previous.score;
  won = previous.won;
  previous = null;
  message.classList.remove("show");
  render();
}
const key = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};
document.addEventListener("keydown", (e) => {
  if (key[e.key]) {
    e.preventDefault();
    move(key[e.key]);
  }
});
document
  .querySelectorAll("[data-move]")
  .forEach((b) => (b.onclick = () => move(b.dataset.move)));
document.querySelector("#restart").onclick = start;
document.querySelector("#undo").onclick = undo;
document.querySelector("#keepPlaying").onclick = () =>
  message.classList.remove("show");
let sx, sy;
boardEl.addEventListener(
  "touchstart",
  (e) => {
    const t = e.changedTouches[0];
    sx = t.clientX;
    sy = t.clientY;
  },
  { passive: true },
);
boardEl.addEventListener(
  "touchend",
  (e) => {
    const t = e.changedTouches[0],
      dx = t.clientX - sx,
      dy = t.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 25) return;
    move(
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? "right"
          : "left"
        : dy > 0
          ? "down"
          : "up",
    );
  },
  { passive: true },
);
start();
