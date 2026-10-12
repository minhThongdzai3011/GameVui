const canvas = document.getElementById("game"),
  ctx = canvas.getContext("2d"),
  scoreEl = document.getElementById("score");
let snake, food, dir, next, score, timer;
function reset() {
  snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  dir = { x: 1, y: 0 };
  next = dir;
  score = 0;
  scoreEl.textContent = 0;
  placeFood();
  clearInterval(timer);
  draw();
  timer = setInterval(step, 115);
}
function placeFood() {
  do {
    food = {
      x: Math.floor(Math.random() * 20),
      y: Math.floor(Math.random() * 20),
    };
  } while (snake.some((p) => p.x === food.x && p.y === food.y));
}
function step() {
  dir = next;
  const h = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
  if (
    h.x < 0 ||
    h.x >= 20 ||
    h.y < 0 ||
    h.y >= 20 ||
    snake.some((p) => p.x === h.x && p.y === h.y)
  ) {
    clearInterval(timer);
    setTimeout(() => alert(`Game over! Điểm: ${score}`), 20);
    return;
  }
  snake.unshift(h);
  if (h.x === food.x && h.y === food.y) {
    score++;
    scoreEl.textContent = score;
    placeFood();
  } else snake.pop();
  draw();
}
function draw() {
  ctx.fillStyle = "#1d2840";
  ctx.fillRect(0, 0, 400, 400);
  ctx.strokeStyle = "#ffffff10";
  for (let i = 0; i < 20; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 20, 0);
    ctx.lineTo(i * 20, 400);
    ctx.moveTo(0, i * 20);
    ctx.lineTo(400, i * 20);
    ctx.stroke();
  }
  ctx.fillStyle = "#ff7859";
  ctx.beginPath();
  ctx.arc(food.x * 20 + 10, food.y * 20 + 10, 7, 0, Math.PI * 2);
  ctx.fill();
  snake.forEach((p, i) => {
    ctx.fillStyle = i ? "#38ae83" : "#ffd66b";
    ctx.beginPath();
    ctx.roundRect(p.x * 20 + 2, p.y * 20 + 2, 16, 16, 5);
    ctx.fill();
  });
}
function setDir(d) {
  if (d.x !== -dir.x || d.y !== -dir.y) next = d;
}
const dirs = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};
document.addEventListener("keydown", (e) => {
  if (dirs[e.key]) {
    e.preventDefault();
    setDir(dirs[e.key]);
  }
});
document.querySelectorAll("[data-dir]").forEach((b) =>
  b.addEventListener("pointerdown", () =>
    setDir(
      dirs[
        {
          up: "ArrowUp",
          down: "ArrowDown",
          left: "ArrowLeft",
          right: "ArrowRight",
        }[b.dataset.dir]
      ],
    ),
  ),
);
document.getElementById("restart").addEventListener("click", reset);
reset();
