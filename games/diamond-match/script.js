const SIZE = 8;
const TYPES = ["◆", "●", "✦", "♥", "⬟", "✚"];
const boardEl = document.querySelector("#board");
const scoreEl = document.querySelector("#score");
const comboEl = document.querySelector("#combo");
let board = [];
let selected = null;
let busy = false;
let score = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomGem = () => TYPES[Math.floor(Math.random() * TYPES.length)];

function createBoard() {
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(""));
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      do {
        board[row][col] = randomGem();
      } while (
        (col >= 2 &&
          board[row][col] === board[row][col - 1] &&
          board[row][col] === board[row][col - 2]) ||
        (row >= 2 &&
          board[row][col] === board[row - 1][col] &&
          board[row][col] === board[row - 2][col])
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
      gem.className = `gem${selected?.row === row && selected?.col === col ? " selected" : ""}${matches.has(key) ? " match" : ""}`;
      gem.textContent = board[row][col] || "";
      gem.addEventListener("click", () => pick(row, col));
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
      if (col - start >= 3)
        for (let i = start; i < col; i++) matches.add(`${row},${i}`);
      start = col;
    }
  }
  for (let col = 0; col < SIZE; col++) {
    let start = 0;
    for (let row = 1; row <= SIZE; row++) {
      if (row < SIZE && board[row][col] === board[start][col]) continue;
      if (row - start >= 3)
        for (let i = start; i < row; i++) matches.add(`${i},${col}`);
      start = row;
    }
  }
  return matches;
}

function isAdjacent(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function swap(a, b) {
  [board[a.row][a.col], board[b.row][b.col]] = [
    board[b.row][b.col],
    board[a.row][a.col],
  ];
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

  busy = true;
  swap(selected, next);
  let matches = findMatches();
  if (!matches.size) {
    swap(selected, next);
    selected = null;
    render();
    comboEl.textContent = "Nước đi này không tạo match";
    await wait(450);
    comboEl.textContent = "Thử nước khác nhé!";
  } else {
    selected = null;
    let chain = 0;
    while (matches.size) {
      chain++;
      const gained = matches.size * 10 * chain;
      score += gained;
      scoreEl.textContent = score;
      comboEl.textContent =
        chain > 1
          ? `Combo x${chain}! +${gained}`
          : `Đã ghép ${matches.size} kim cương!`;
      render(matches);
      await wait(260);
      matches.forEach((key) => {
        const [matchRow, matchCol] = key.split(",").map(Number);
        board[matchRow][matchCol] = "";
      });
      dropGems();
      render();
      await wait(160);
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
  scoreEl.textContent = 0;
  comboEl.textContent = "Sẵn sàng!";
  createBoard();
  render();
}

document.querySelector("#restart").addEventListener("click", start);
start();
