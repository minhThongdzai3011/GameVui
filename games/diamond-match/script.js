const SIZE = 8;
const TYPES = ["a", "b", "c", "d", "e", "f"];
const boardEl = document.querySelector("#board");
const scoreEl = document.querySelector("#score");
const comboEl = document.querySelector("#combo");

let board = [];
let selected = null;
let busy = false;
let score = 0;
let dragStart = null;
let ignoreClickUntil = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomGem = () => TYPES[Math.floor(Math.random() * TYPES.length)];

function createBoard() {
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(""));
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      do {
        board[row][col] = randomGem();
      } while (
        (col >= 2 && board[row][col] === board[row][col - 1] && board[row][col] === board[row][col - 2]) ||
        (row >= 2 && board[row][col] === board[row - 1][col] && board[row][col] === board[row - 2][col])
      );
    }
  }
}

function render(matches = new Set()) {
  boardEl.replaceChildren();
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const gem = document.createElement("button");
      const key = `${row},${col}`;
      const type = TYPES.indexOf(board[row][col]);
      gem.className = `gem type-${type}${selected?.row === row && selected?.col === col ? " selected" : ""}${matches.has(key) ? " match" : ""}`;
      gem.dataset.row = row;
      gem.dataset.col = col;
      gem.setAttribute("aria-label", `Kim cương hàng ${row + 1}, cột ${col + 1}`);
      gem.addEventListener("click", () => {
        if (Date.now() >= ignoreClickUntil) pick(row, col);
      });
      gem.addEventListener("pointerdown", (event) => beginDrag(event, row, col, gem));
      gem.addEventListener("pointerup", endDrag);
      gem.addEventListener("pointercancel", cancelDrag);
      boardEl.append(gem);
    }
  }
}

function findMatches() {
  const matches = new Set();
  for (let row = 0; row < SIZE; row++) {
    let start = 0;
    for (let col = 1; col <= SIZE; col++) {
      if (col < SIZE && board[row][col] === board[row][start]) continue;
      if (col - start >= 3) {
        for (let index = start; index < col; index++) matches.add(`${row},${index}`);
      }
      start = col;
    }
  }
  for (let col = 0; col < SIZE; col++) {
    let start = 0;
    for (let row = 1; row <= SIZE; row++) {
      if (row < SIZE && board[row][col] === board[start][col]) continue;
      if (row - start >= 3) {
        for (let index = start; index < row; index++) matches.add(`${index},${col}`);
      }
      start = row;
    }
  }
  return matches;
}

function isAdjacent(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function swap(a, b) {
  [board[a.row][a.col], board[b.row][b.col]] = [board[b.row][b.col], board[a.row][a.col]];
}

function dropGems() {
  for (let col = 0; col < SIZE; col++) {
    let writeRow = SIZE - 1;
    for (let row = SIZE - 1; row >= 0; row--) {
      if (board[row][col]) board[writeRow--][col] = board[row][col];
    }
    while (writeRow >= 0) board[writeRow--][col] = randomGem();
  }
}

async function animateSwap(first, second) {
  const firstGem = boardEl.querySelector(`[data-row="${first.row}"][data-col="${first.col}"]`);
  const secondGem = boardEl.querySelector(`[data-row="${second.row}"][data-col="${second.col}"]`);
  if (!firstGem || !secondGem) return;

  const boardRect = boardEl.getBoundingClientRect();
  const firstRect = firstGem.getBoundingClientRect();
  const secondRect = secondGem.getBoundingClientRect();
  const duration = 260;
  const makeGhost = (gem, rect, depth) => {
    const ghost = gem.cloneNode(true);
    ghost.classList.add("swap-ghost");
    ghost.style.left = `${rect.left - boardRect.left}px`;
    ghost.style.top = `${rect.top - boardRect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.zIndex = depth;
    boardEl.append(ghost);
    return ghost;
  };
  const firstGhost = makeGhost(firstGem, firstRect, "8");
  const secondGhost = makeGhost(secondGem, secondRect, "7");
  firstGem.style.visibility = "hidden";
  secondGem.style.visibility = "hidden";

  requestAnimationFrame(() => {
    firstGhost.style.transform = `translate(${secondRect.left - firstRect.left}px, ${secondRect.top - firstRect.top}px) scale(1.08)`;
    secondGhost.style.transform = `translate(${firstRect.left - secondRect.left}px, ${firstRect.top - secondRect.top}px) scale(1.04)`;
  });
  await wait(duration);
  firstGhost.remove();
  secondGhost.remove();
  firstGem.style.visibility = "";
  secondGem.style.visibility = "";
}

function burst(matches) {
  matches.forEach((key) => {
    const [row, col] = key.split(",").map(Number);
    const type = TYPES.indexOf(board[row][col]);
    for (let index = 0; index < 8; index++) {
      const spark = document.createElement("i");
      const angle = (Math.PI * 2 * index) / 8 + Math.random() * 0.35;
      const distance = 20 + Math.random() * 22;
      spark.className = "spark";
      spark.style.left = `${((col + 0.5) / SIZE) * 100}%`;
      spark.style.top = `${((row + 0.5) / SIZE) * 100}%`;
      spark.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
      spark.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
      spark.style.setProperty("--spark", `var(--gem-${type})`);
      boardEl.append(spark);
      setTimeout(() => spark.remove(), 500);
    }
  });
}

function beginDrag(event, row, col, gem) {
  if (busy) return;
  dragStart = { row, col };
  gem.classList.add("dragging");
  gem.setPointerCapture?.(event.pointerId);
}

function cancelDrag() {
  dragStart = null;
  document.querySelectorAll(".gem.dragging").forEach((gem) => gem.classList.remove("dragging"));
}

function endDrag(event) {
  const origin = dragStart;
  cancelDrag();
  if (!origin || busy) return;

  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".gem");
  if (!target) return;
  const next = { row: Number(target.dataset.row), col: Number(target.dataset.col) };
  ignoreClickUntil = Date.now() + 250;

  if (isAdjacent(origin, next)) {
    selected = null;
    resolveSwap(origin, next);
  } else if (origin.row === next.row && origin.col === next.col) {
    pick(origin.row, origin.col);
  }
}

async function pick(row, col) {
  if (busy) return;
  const next = { row, col };
  if (!selected) {
    selected = next;
    render();
    return;
  }
  if (selected.row === row && selected.col === col) {
    selected = null;
    render();
    return;
  }
  if (!isAdjacent(selected, next)) {
    selected = next;
    render();
    return;
  }

  const origin = selected;
  selected = null;
  await resolveSwap(origin, next);
}

async function resolveSwap(origin, next) {
  if (busy) return;
  busy = true;
  await animateSwap(origin, next);
  swap(origin, next);
  render();
  let matches = findMatches();

  if (!matches.size) {
    await wait(160);
    await animateSwap(origin, next);
    swap(origin, next);
    render();
    comboEl.textContent = "Nước đi này chưa tạo được match";
    await wait(450);
    comboEl.textContent = "Thử nước khác nhé!";
  } else {
    let chain = 0;
    while (matches.size) {
      chain++;
      const gained = matches.size * 10 * chain;
      score += gained;
      scoreEl.textContent = score;
      comboEl.textContent = chain > 1 ? `Combo x${chain}! +${gained}` : `Đã ghép ${matches.size} kim cương!`;
      render(matches);
      burst(matches);
      await wait(300);
      matches.forEach((key) => {
        const [row, col] = key.split(",").map(Number);
        board[row][col] = "";
      });
      dropGems();
      render();
      await wait(180);
      matches = findMatches();
    }
    comboEl.textContent = "Tuyệt vời, tiếp tục nào!";
  }
  busy = false;
}

function start() {
  score = 0;
  selected = null;
  busy = false;
  cancelDrag();
  scoreEl.textContent = 0;
  comboEl.textContent = "Sẵn sàng!";
  createBoard();
  render();
}

document.querySelector("#restart").addEventListener("click", start);
start();
