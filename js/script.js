const modal = document.getElementById("gameModal"),
  canvas = document.getElementById("gameCanvas"),
  ctx = canvas.getContext("2d"),
  scoreEl = document.getElementById("score"),
  titleEl = document.getElementById("modalTitle"),
  helpEl = document.getElementById("modalHelp"),
  touchControls = document.getElementById("touchControls");
let timer = null,
  activeGame = null,
  snake = [],
  direction = { x: 1, y: 0 },
  nextDirection = direction,
  food = { x: 10, y: 10 },
  score = 0,
  bird = { x: 70, y: 190, velocity: 0 },
  pipes = [],
  birdFrame = 0;
let birdStarted = false,
  ufoStarted = false,
  memoryLocked = false,
  jumpVelocity = 0,
  jumpY = 330,
  animating2048 = false;
let move2048At = 0;
const gameCards = [...document.querySelectorAll(".game-grid .game-card")];
const pagination = document.getElementById("pagination");
const gamesPerPage = 4;
let currentPage = 1;
const totalPages = Math.ceil(gameCards.length / gamesPerPage);
function renderPage(page) {
  currentPage = page;
  gameCards.forEach((card, index) => {
    card.style.display =
      index >= (page - 1) * gamesPerPage && index < page * gamesPerPage
        ? "block"
        : "none";
  });
  pagination.innerHTML = "";
  for (let i = 1; i <= totalPages; i++) {
    const button = document.createElement("button");
    button.className = `page-button${i === page ? " active" : ""}`;
    button.textContent = i;
    button.setAttribute("aria-label", `Trang ${i}`);
    button.setAttribute("aria-current", i === page ? "page" : "false");
    button.addEventListener("click", () => {
      renderPage(i);
      document
        .getElementById("games")
        .scrollIntoView({ behavior: "smooth", block: "start" });
    });
    pagination.appendChild(button);
  }
}
renderPage(currentPage);
document
  .querySelectorAll(".play-button[data-game]")
  .forEach((b) => b.addEventListener("click", () => openGame(b.dataset.game)));
document.getElementById("closeGame").addEventListener("click", closeGame);
document
  .getElementById("restartGame")
  .addEventListener("click", () => startGame(activeGame));
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeGame();
});
function openGame(g) {
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  startGame(g);
}
function closeGame() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  clearInterval(timer);
  cancelAnimationFrame(birdFrame);
}
function startGame(g) {
  activeGame = g;
  clearInterval(timer);
  cancelAnimationFrame(birdFrame);
  score = 0;
  scoreEl.textContent = 0;
  touchControls.style.display = g === "snake" ? "block" : "none";
  const mobileControls = document.getElementById("mobileGameControls");
  mobileControls.dataset.game = g;
  mobileControls.style.display = ["snake", "mouse", "memory", "tic"].includes(g)
    ? "none"
    : "grid";
  mobileControls.querySelector('[data-mobile-control="action"]').textContent = [
    "dodge",
    "dino",
  ].includes(g)
    ? "▲"
    : "●";
  mobileControls.querySelector('[data-mobile-control="up"]').style.display =
    g === "2048" ? "block" : "none";
  mobileControls.querySelector('[data-mobile-control="down"]').style.display =
    g === "2048" || g === "dino" ? "block" : "none";
  mobileControls.querySelector('[data-mobile-control="left"]').style.display = [
    "2048",
    "breakout",
    "catch",
  ].includes(g)
    ? "block"
    : "none";
  mobileControls.querySelector('[data-mobile-control="right"]').style.display =
    ["2048", "breakout", "catch"].includes(g) ? "block" : "none";
  if (g === "snake") startSnake();
  else if (g === "bird") startBird();
  else if (g === "mouse") startMouse();
  else if (g === "dodge") startDodge();
  else if (g === "memory") startMemory();
  else if (g === "tic") startTicTacToe();
  else if (g === "2048") start2048();
  else if (g === "breakout") startBreakout();
  else if (g === "ufo") startUfo();
  else if (g === "catch") startCatch();
  else startDino();
  if (g === "dodge")
    helpEl.textContent = "Nhan mui ten len, Space hoac cham de nhay";
}
function startSnake() {
  titleEl.textContent = "Rắn săn mồi";
  helpEl.textContent = "Dùng các phím mũi tên để di chuyển";
  snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  direction = { x: 1, y: 0 };
  nextDirection = direction;
  placeFood();
  drawSnake();
  timer = setInterval(stepSnake, 115);
}
function placeFood() {
  do {
    food = {
      x: Math.floor(Math.random() * 20),
      y: Math.floor(Math.random() * 20),
    };
  } while (snake.some((p) => p.x === food.x && p.y === food.y));
}
function stepSnake() {
  direction = nextDirection;
  const h = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
  if (
    h.x < 0 ||
    h.x >= 20 ||
    h.y < 0 ||
    h.y >= 20 ||
    snake.some((p) => p.x === h.x && p.y === h.y)
  )
    return endGame();
  snake.unshift(h);
  if (h.x === food.x && h.y === food.y) {
    score++;
    scoreEl.textContent = score;
    placeFood();
  } else snake.pop();
  drawSnake();
}
function drawSnake() {
  ctx.fillStyle = "#1d2840";
  ctx.fillRect(0, 0, 400, 400);
  ctx.strokeStyle = "#ffffff0b";
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
function startBird() {
  titleEl.textContent = "Flappy Bird";
  helpEl.textContent = "Nhấn SPACE hoặc click để bay";
  bird = { x: 70, y: 190, velocity: 0 };
  pipes = [];
  score = 0;
  scoreEl.textContent = 0;
  birdStarted = false;
  drawBird();
  ctx.fillStyle = "#192238";
  ctx.font = "bold 20px Space Grotesk";
  ctx.textAlign = "center";
  ctx.fillText("Nhan Space hoac cham de bat dau", 200, 215);
  ctx.textAlign = "left";
}
function flap() {
  if (activeGame === "bird") {
    if (!birdStarted) {
      birdStarted = true;
      birdFrame = requestAnimationFrame(stepBird);
    }
    bird.velocity = -6.5;
  }
  if (activeGame === "ufo") {
    if (!ufoStarted) {
      ufoStarted = true;
      birdFrame = requestAnimationFrame(stepUfo);
    }
    ufo.vy = -6.5;
  }
}
function addPipe() {
  const gap = 125,
    top = 35 + Math.random() * 130;
  pipes.push({ x: 400, top, bottom: top + gap, passed: false });
}
function stepBird() {
  bird.velocity += 0.34;
  bird.y += bird.velocity;
  if (!pipes.length || pipes[pipes.length - 1].x < 225) addPipe();
  pipes.forEach((p) => {
    p.x -= 2.4;
    if (!p.passed && p.x < bird.x) {
      p.passed = true;
      score++;
      scoreEl.textContent = score;
    }
  });
  pipes = pipes.filter((p) => p.x > -65);
  const hit =
    bird.y < 0 ||
    bird.y > 380 ||
    pipes.some(
      (p) =>
        bird.x + 17 > p.x &&
        bird.x - 17 < p.x + 50 &&
        (bird.y - 17 < p.top || bird.y + 17 > p.bottom),
    );
  drawBird();
  if (hit) return endGame();
  birdFrame = requestAnimationFrame(stepBird);
}
function drawBird() {
  ctx.fillStyle = "#9bdbea";
  ctx.fillRect(0, 0, 400, 400);
  pipes.forEach((p) => {
    ctx.fillStyle = "#5eb575";
    ctx.fillRect(p.x, 0, 50, p.top);
    ctx.fillRect(p.x, p.bottom, 50, 400 - p.bottom);
    ctx.fillStyle = "#78ca89";
    ctx.fillRect(p.x - 6, p.top - 10, 62, 13);
    ctx.fillRect(p.x - 6, p.bottom - 3, 62, 13);
  });
  ctx.font = "35px serif";
  ctx.fillText("🐤", bird.x - 18, bird.y + 12);
  ctx.fillStyle = "#8fc98d";
  ctx.fillRect(0, 385, 400, 15);
}
function endGame() {
  clearInterval(timer);
  cancelAnimationFrame(birdFrame);
  setTimeout(() => alert(`Game over! Điểm của bạn: ${score}`), 30);
}
let mouseTarget = { x: 200, y: 200 },
  mouseTime = 30,
  runnerX = 65,
  runnerY = 330,
  obstacleX = 400,
  jumping = false,
  cards = [],
  picked = [],
  ticBoard = [],
  ticTurn = "X";
function startMouse() {
  titleEl.textContent = "Đập chuột";
  helpEl.textContent = "Click vào chuột càng nhanh càng tốt";
  mouseTime = 30;
  score = 0;
  scoreEl.textContent = 0;
  moveMouse();
  clearInterval(timer);
  timer = setInterval(() => {
    mouseTime--;
    if (mouseTime <= 0) endGame();
  }, 1000);
  drawMouse();
}
function moveMouse() {
  mouseTarget = { x: 35 + Math.random() * 330, y: 45 + Math.random() * 300 };
  drawMouse();
}
function drawMouse() {
  ctx.fillStyle = "#ffd98a";
  ctx.fillRect(0, 0, 400, 400);
  ctx.fillStyle = "#192238";
  ctx.font = "16px Space Grotesk";
  ctx.fillText(`Thời gian: ${mouseTime}s`, 16, 25);
  ctx.font = "48px serif";
  ctx.fillText("🐭", mouseTarget.x - 24, mouseTarget.y + 18);
}
function startDodge() {
  titleEl.textContent = "Né vật cản";
  helpEl.textContent = "Mũi tên trái/phải hoặc chạm hai bên màn hình";
  runnerX = 65;
  obstacleX = 400;
  jumping = false;
  jumpY = 330;
  jumpVelocity = 0;
  score = 0;
  scoreEl.textContent = 0;
  clearInterval(timer);
  timer = setInterval(stepDodge, 35);
  drawDodge();
}
function stepDodge() {
  obstacleX -= 4;
  if (jumping) {
    jumpY += jumpVelocity;
    jumpVelocity += 0.7;
    if (jumpY >= 330) {
      jumpY = 330;
      jumpVelocity = 0;
      jumping = false;
    }
  }
  if (obstacleX < -35) {
    obstacleX = 400;
    score++;
    scoreEl.textContent = score;
  }
  if (obstacleX < runnerX + 32 && obstacleX + 35 > runnerX && jumpY > 295)
    return endGame();
  drawDodge();
}
function drawDodge() {
  ctx.fillStyle = "#b8e8a2";
  ctx.fillRect(0, 0, 400, 400);
  ctx.fillStyle = "#78b879";
  ctx.fillRect(0, 350, 400, 50);
  ctx.font = "42px serif";
  ctx.fillText("🏃", runnerX, jumping ? 285 : 340);
  ctx.fillStyle = "#ff7859";
  ctx.fillRect(obstacleX, 315, 35, 25);
}
function drawDino() {
  const g = ctx.createLinearGradient(0, 0, 0, 400);
  g.addColorStop(0, dinoNight ? "#111a40" : "#8ed9eb");
  g.addColorStop(1, dinoNight ? "#52649b" : "#f5d18a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 400, 400);
  ctx.fillStyle = dinoNight ? "#fff4b855" : "#fff9df88";
  ctx.beginPath();
  ctx.arc(320, 70, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dinoNight ? "#202b54" : "#d9ad62";
  for (let i = 0; i < 10; i++) {
    const x = i * 48 - (dinoDistance % 48),
      h = 30 + (i % 3) * 22;
    ctx.fillRect(x, 355 - h, 35, h);
  }
  ctx.fillStyle = dinoNight ? "#1b2649" : "#c99c59";
  ctx.fillRect(0, 355, 400, 45);
  ctx.strokeStyle = dinoNight ? "#dce5ff55" : "#fff1bd99";
  ctx.setLineDash([14, 12]);
  ctx.lineDashOffset = -dinoDistance;
  ctx.beginPath();
  ctx.moveTo(0, 378);
  ctx.lineTo(400, 378);
  ctx.stroke();
  ctx.setLineDash([]);
  dinoObstacles.forEach((o) => {
    if (o.type === "bird") {
      ctx.fillStyle = "#26334f";
      ctx.fillRect(o.x, o.y - 12, 35, 12);
      ctx.fillRect(o.x + 12, o.y - 24, 12, 12);
      ctx.fillRect(o.x - 9, o.y - 5, 14, 5);
      ctx.fillRect(o.x + 32, o.y - 5, 14, 5);
    } else {
      ctx.fillStyle = "#287b55";
      ctx.fillRect(o.x + 8, o.y - 38, 14, 38);
      ctx.fillRect(o.x, o.y - 27, 30, 13);
      ctx.fillRect(o.x + 20, o.y - 20, 13, 9);
    }
  });
  const base = dino.y,
    top = base - (dino.duck ? 25 : 52),
    run = Math.floor(dinoDistance / 7) % 2;
  ctx.fillStyle = "#4a9b59";
  if (dino.duck) {
    ctx.fillRect(68, top + 10, 48, 19);
    ctx.fillRect(108, top + 2, 20, 16);
    ctx.fillStyle = "#172d2c";
    ctx.fillRect(117, top + 6, 4, 4);
    ctx.fillRect(73, base, 13, 5);
    ctx.fillRect(100, base, 13, 5);
  } else {
    ctx.fillRect(78, top + 16, 34, 35);
    ctx.fillRect(92, top + 2, 29, 25);
    ctx.fillRect(113, top + 12, 20, 15);
    ctx.fillRect(73, top + 23, 14, 8);
    ctx.fillStyle = "#172d2c";
    ctx.fillRect(112, top + 8, 5, 5);
    ctx.fillStyle = "#4a9b59";
    ctx.fillRect(78, base - 1, 13, 7);
    ctx.fillRect(run ? 101 : 108, base - 1, 13, 7);
    ctx.fillRect(66, top + 22, 20, 7);
    ctx.fillRect(73, top + 8, 10, 18);
  }
  ctx.fillStyle = "#fff";
  ctx.font = "700 13px Space Grotesk";
  ctx.fillText("DISTANCE", 18, 28);
  ctx.font = "700 23px Space Grotesk";
  ctx.fillText(String(score).padStart(5, "0"), 18, 52);
  if (!dinoStarted && !dinoOver) {
    ctx.fillStyle = "#192238bb";
    ctx.fillRect(0, 0, 400, 400);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "800 22px Space Grotesk";
    ctx.fillText("PRESS SPACE TO START", 200, 210);
    ctx.textAlign = "left";
  }
  if (dinoOver) {
    ctx.fillStyle = "#192238cc";
    ctx.fillRect(0, 0, 400, 400);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "800 29px Space Grotesk";
    ctx.fillText("GAME OVER", 200, 190);
    ctx.font = "500 14px Space Grotesk";
    ctx.fillText("Bấm Chơi lại để chạy tiếp", 200, 222);
    ctx.textAlign = "left";
  }
}
let dino = { y: 330, vy: 0, duck: false },
  dinoObstacles = [],
  dinoStarted = false,
  dinoOver = false,
  dinoSpeed = 5,
  dinoDistance = 0,
  dinoNight = false;
function startDino() {
  titleEl.textContent = "Dino Runner";
  helpEl.textContent = "Space / ↑ để nhảy, ↓ để cúi";
  dino = { y: 330, vy: 0, duck: false };
  dinoObstacles = [];
  dinoStarted = false;
  dinoOver = false;
  dinoSpeed = 5;
  dinoDistance = 0;
  dinoNight = false;
  score = 0;
  scoreEl.textContent = 0;
  drawDino();
}
function dinoJump() {
  if (activeGame === "dino" && !dinoOver) {
    if (!dinoStarted) {
      dinoStarted = true;
      birdFrame = requestAnimationFrame(stepDino);
    }
    if (dino.y >= 329) dino.vy = -11;
  }
}
function stepDino() {
  dino.vy += 0.62;
  dino.y += dino.vy;
  if (dino.y > 330) {
    dino.y = 330;
    dino.vy = 0;
  }
  dinoSpeed = Math.min(10, 5 + dinoDistance / 4500);
  dinoDistance += dinoSpeed;
  score = Math.floor(dinoDistance / 10);
  scoreEl.textContent = score;
  if (
    !dinoObstacles.length ||
    dinoObstacles[dinoObstacles.length - 1].x < 250
  ) {
    const birdType = Math.random() > 0.72 && dinoDistance > 500;
    dinoObstacles.push({
      x: 420,
      type: birdType ? "bird" : "cactus",
      y: birdType ? 255 : 330,
      w: birdType ? 42 : 30,
      h: birdType ? 25 : 42,
    });
  }
  dinoObstacles.forEach((o) => (o.x -= dinoSpeed));
  dinoObstacles = dinoObstacles.filter((o) => o.x > -60);
  if (dinoDistance > 1800) dinoNight = true;
  const playerH = dino.duck ? 28 : 48,
    playerTop = dino.y - playerH;
  const hit = dinoObstacles.some((o) =>
    dinoObstaclesOverlap(o.x, o.y, o.w, o.h, 70, playerTop, 38, playerH),
  );
  drawDino();
  if (hit) {
    dinoOver = true;
    cancelAnimationFrame(birdFrame);
  } else birdFrame = requestAnimationFrame(stepDino);
}
function dinoObstaclesOverlap(x, y, w, h, px, py, pw, ph) {
  return x < px + pw - 6 && x + w > px + 6 && y < py + ph && y + h > py + 6;
}
function drawDino() {
  const g = ctx.createLinearGradient(0, 0, 0, 400);
  if (dinoNight) {
    g.addColorStop(0, "#101a43");
    g.addColorStop(1, "#51649c");
  } else {
    g.addColorStop(0, "#85d4ea");
    g.addColorStop(1, "#f8d38b");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 400, 400);
  ctx.fillStyle = dinoNight ? "#fff2a644" : "#fff8df88";
  ctx.beginPath();
  ctx.arc(320, 75, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dinoNight ? "#202c54" : "#e5b96c";
  ctx.fillRect(0, 355, 400, 45);
  ctx.strokeStyle = dinoNight ? "#c8dcff55" : "#fff0bd99";
  ctx.setLineDash([14, 12]);
  ctx.lineDashOffset = -dinoDistance;
  ctx.beginPath();
  ctx.moveTo(0, 375);
  ctx.lineTo(400, 375);
  ctx.stroke();
  ctx.setLineDash([]);
  dinoObstacles.forEach((o) => {
    ctx.fillStyle = o.type === "bird" ? "#ef6d61" : "#2d9b71";
    if (o.type === "bird") {
      ctx.font = "28px serif";
      ctx.fillText("✦", o.x, o.y + 20);
    } else {
      ctx.fillRect(o.x, o.y - o.h, o.w, o.h);
      ctx.fillRect(o.x - 7, o.y - o.h + 13, 8, 20);
      ctx.fillRect(o.x + o.w - 1, o.y - o.h + 5, 8, 25);
    }
  });
  const top = dino.y - (dino.duck ? 28 : 48);
  ctx.fillStyle = "#e85e52";
  ctx.fillRect(70, top, 38, dino.duck ? 25 : 35);
  ctx.fillStyle = "#ffd66b";
  ctx.fillRect(78, top - 13, 22, 18);
  ctx.fillStyle = "#192238";
  ctx.fillRect(94, top - 7, 4, 4);
  ctx.fillStyle = "#fff";
  ctx.fillRect(75, dino.y - 2, 12, 5);
  ctx.fillRect(96, dino.y - 2, 12, 5);
  ctx.fillStyle = "#fff";
  ctx.font = "700 13px Space Grotesk";
  ctx.fillText("DISTANCE", 18, 28);
  ctx.font = "700 23px Space Grotesk";
  ctx.fillText(String(score).padStart(5, "0"), 18, 52);
  if (!dinoStarted && !dinoOver) {
    ctx.fillStyle = "#192238cc";
    ctx.fillRect(0, 0, 400, 400);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "800 22px Space Grotesk";
    ctx.fillText("PRESS SPACE TO START", 200, 210);
    ctx.textAlign = "left";
  }
  if (dinoOver) {
    ctx.fillStyle = "#192238cc";
    ctx.fillRect(0, 0, 400, 400);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "800 29px Space Grotesk";
    ctx.fillText("GAME OVER", 200, 190);
    ctx.font = "500 14px Space Grotesk";
    ctx.fillText("Bấm Chơi lại để chạy tiếp", 200, 222);
    ctx.textAlign = "left";
  }
}
document.addEventListener("keydown", (e) => {
  if (activeGame === "dino") {
    if (e.code === "Space" || e.key === "ArrowUp") {
      e.preventDefault();
      dinoJump();
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      dino.duck = true;
    }
  }
});
document.addEventListener("keyup", (e) => {
  if (activeGame === "dino" && e.key === "ArrowDown") dino.duck = false;
});
canvas.addEventListener("pointerdown", () => {
  if (activeGame === "dino") dinoJump();
});
document.querySelectorAll("[data-mobile-control]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const control = button.dataset.mobileControl;
    if (activeGame === "bird" || activeGame === "ufo") {
      if (control === "action") flap();
      return;
    }
    if (activeGame === "dodge" && control === "action") {
      if (!jumping) {
        jumping = true;
        jumpY = 330;
        jumpVelocity = -10;
      }
      return;
    }
    if (activeGame === "dino") {
      if (control === "action") dinoJump();
      if (control === "down") dino.duck = true;
      return;
    }
    if (activeGame === "2048") {
      const map = { up: 0, left: 1, down: 2, right: 3 };
      if (control in map) move2048(map[control]);
      return;
    }
    if (activeGame === "breakout") {
      if (control === "left") paddle = Math.max(0, paddle - 30);
      if (control === "right") paddle = Math.min(312, paddle + 30);
      return;
    }
    if (activeGame === "catch") {
      if (control === "left") basket = Math.max(0, basket - 35);
      if (control === "right") basket = Math.min(300, basket + 35);
    }
  });
  button.addEventListener("pointerup", () => {
    if (activeGame === "dino" && button.dataset.mobileControl === "down")
      dino.duck = false;
  });
});
// Keep the polished renderer as the final draw function used by Neon Runner.
function drawDodge() {
  const g = ctx.createLinearGradient(0, 0, 0, 400);
  g.addColorStop(0, "#151d45");
  g.addColorStop(0.58, "#4359a1");
  g.addColorStop(1, "#f59b79");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 400, 400);
  ctx.fillStyle = "#202a55";
  for (let i = 0; i < 11; i++) {
    const x = i * 46 - ((dodgeSpeed * 18) % 46),
      h = 35 + (i % 4) * 20;
    ctx.fillRect(x, 330 - h, 34, h);
  }
  ctx.fillStyle = "#18213e";
  ctx.fillRect(0, 340, 400, 60);
  ctx.fillStyle = "#2e3960";
  ctx.fillRect(0, 340, 400, 4);
  ctx.strokeStyle = "#f7c96d66";
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 18]);
  ctx.lineDashOffset = -dodgeFrame;
  ctx.beginPath();
  ctx.moveTo(0, 370);
  ctx.lineTo(400, 370);
  ctx.stroke();
  ctx.setLineDash([]);
  const py = jumpY + 10,
    bob = jumping ? 0 : Math.sin(dodgeFrame * 0.15) * 2;
  ctx.save();
  ctx.translate(runnerX + 22, py + bob - 24);
  ctx.fillStyle = "#ffc857";
  ctx.shadowColor = "#ffc857";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(0, -17, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#f8f9ff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(0, 15);
  ctx.moveTo(0, 0);
  ctx.lineTo(-13, 9);
  ctx.moveTo(0, 0);
  ctx.lineTo(13, 9);
  ctx.moveTo(0, 15);
  ctx.lineTo(-11, 28);
  ctx.moveTo(0, 15);
  ctx.lineTo(11, 28);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(obstacleX, 300);
  ctx.shadowColor = "#ff506f";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#ff506f";
  ctx.fillRect(0, 8, 42, 32);
  ctx.fillStyle = "#ff7890";
  ctx.fillRect(6, 0, 30, 12);
  ctx.fillStyle = "#631f4e";
  ctx.fillRect(8, 18, 6, 6);
  ctx.fillRect(28, 18, 6, 6);
  ctx.restore();
  dodgeParticles.forEach((p) => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = "#ffd66b";
    ctx.fillRect(p.x, p.y, 4, 4);
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#fff";
  ctx.font = "700 13px Space Grotesk";
  ctx.fillText("SCORE", 18, 28);
  ctx.font = "700 24px Space Grotesk";
  ctx.fillText(String(score).padStart(2, "0"), 18, 52);
  ctx.font = "600 11px Space Grotesk";
  ctx.fillStyle = "#ffffffaa";
  ctx.fillText("NEON RUNNER", 282, 28);
  if (dodgeOver) {
    ctx.fillStyle = "#10162dcc";
    ctx.fillRect(0, 0, 400, 400);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "800 30px Space Grotesk";
    ctx.fillText("GAME OVER", 200, 175);
    ctx.fillStyle = "#ffc857";
    ctx.font = "600 16px Space Grotesk";
    ctx.fillText(`Điểm của bạn: ${score}`, 200, 208);
    ctx.font = "500 13px Space Grotesk";
    ctx.fillStyle = "#ffffffcc";
    ctx.fillText("Bấm Chơi lại để chạy tiếp", 200, 240);
    ctx.textAlign = "left";
  }
}
document.addEventListener("keydown", (e) => {
  if (activeGame === "dodge" && (e.key === "ArrowUp" || e.code === "Space")) {
    e.preventDefault();
    if (jumpY >= 329) {
      jumping = true;
      jumpY = 330;
      jumpVelocity = -10;
    }
  }
});
canvas.addEventListener("pointerdown", (e) => {
  if (activeGame === "dodge") {
    e.preventDefault();
    if (!jumping) {
      jumping = true;
      jumpY = 330;
      jumpVelocity = -10;
    }
  }
});

// --- Neon Runner: phiên bản nâng cấp của game Né vật cản ---
let dodgeSpeed = 4.2,
  dodgeFrame = 0,
  dodgeOver = false,
  dodgeStartedAt = 0;
let dodgeParticles = [],
  dodgeClouds = [
    { x: 65, y: 72, s: 1 },
    { x: 280, y: 118, s: 0.7 },
  ];
function startDodge() {
  titleEl.textContent = "Neon Runner";
  helpEl.textContent = "↑ / SPACE hoặc chạm để nhảy";
  runnerX = 70;
  obstacleX = 430;
  jumpY = 330;
  jumpVelocity = 0;
  jumping = false;
  dodgeSpeed = 4.2;
  dodgeOver = false;
  dodgeParticles = [];
  score = 0;
  scoreEl.textContent = 0;
  dodgeStartedAt = performance.now();
  clearInterval(timer);
  timer = setInterval(stepDodge, 16);
  drawDodge();
}
function stepDodge() {
  if (dodgeOver) return;
  dodgeSpeed = Math.min(
    8.2,
    4.2 + (performance.now() - dodgeStartedAt) / 18000,
  );
  obstacleX -= dodgeSpeed;
  if (jumping) {
    jumpY += jumpVelocity;
    jumpVelocity += 0.62;
    if (jumpY >= 330) {
      jumpY = 330;
      jumpVelocity = 0;
      jumping = false;
    }
  }
  if (obstacleX < -48) {
    obstacleX = 430 + Math.random() * 110;
    score++;
    scoreEl.textContent = score;
    for (let i = 0; i < 10; i++)
      dodgeParticles.push({
        x: obstacleX + 30,
        y: 340,
        vx: -Math.random() * 2,
        vy: -Math.random() * 2 - 1,
        life: 1,
      });
  }
  const playerLeft = runnerX + 8,
    playerRight = runnerX + 39,
    playerBottom = jumpY + 10;
  if (
    obstacleX < playerRight &&
    obstacleX + 42 > playerLeft &&
    playerBottom > 321
  ) {
    dodgeOver = true;
    clearInterval(timer);
    for (let i = 0; i < 20; i++)
      dodgeParticles.push({
        x: runnerX + 22,
        y: 330,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 4,
        life: 1,
      });
  }
  dodgeParticles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    p.life -= 0.025;
  });
  dodgeParticles = dodgeParticles.filter((p) => p.life > 0);
  drawDodge();
}
function drawDodge() {
  const g = ctx.createLinearGradient(0, 0, 0, 400);
  g.addColorStop(0, "#151d45");
  g.addColorStop(0.58, "#4359a1");
  g.addColorStop(1, "#f59b79");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 400, 400);
  ctx.fillStyle = "#ffffff18";
  dodgeClouds.forEach((c) => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, 22 * c.s, 0, Math.PI * 2);
    ctx.arc(c.x + 22 * c.s, c.y + 6 * c.s, 16 * c.s, 0, Math.PI * 2);
    ctx.arc(c.x - 22 * c.s, c.y + 8 * c.s, 14 * c.s, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#202a55";
  for (let i = 0; i < 11; i++) {
    const x = i * 46 - ((dodgeSpeed * 18) % 46),
      h = 35 + (i % 4) * 20;
    ctx.fillRect(x, 330 - h, 34, h);
    ctx.fillStyle = "#ffffff20";
    for (let w = 0; w < 2; w++)
      for (let z = 0; z < 3; z++)
        ctx.fillRect(x + 7 + w * 12, 338 - h + z * 12, 4, 6);
    ctx.fillStyle = "#202a55";
  }
  ctx.fillStyle = "#18213e";
  ctx.fillRect(0, 340, 400, 60);
  ctx.fillStyle = "#2e3960";
  ctx.fillRect(0, 340, 400, 4);
  ctx.strokeStyle = "#f7c96d66";
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 18]);
  ctx.lineDashOffset = -dodgeFrame;
  ctx.beginPath();
  ctx.moveTo(0, 370);
  ctx.lineTo(400, 370);
  ctx.stroke();
  ctx.setLineDash([]);
  dodgeFrame += dodgeSpeed;
  const py = jumpY + 10,
    bob = jumping ? 0 : Math.sin(dodgeFrame * 0.15) * 2;
  ctx.save();
  ctx.translate(runnerX + 22, py + bob - 24);
  ctx.fillStyle = "#ffc857";
  ctx.shadowColor = "#ffc857";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(0, -17, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#f8f9ff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(0, 15);
  ctx.moveTo(0, 0);
  ctx.lineTo(-13, 9);
  ctx.moveTo(0, 0);
  ctx.lineTo(13, 9);
  ctx.moveTo(0, 15);
  ctx.lineTo(-11, 28);
  ctx.moveTo(0, 15);
  ctx.lineTo(11, 28);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(obstacleX, 285);
  ctx.shadowColor = "#ff506f";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#ff506f";
  ctx.fillRect(0, 8, 42, 47);
  ctx.fillStyle = "#ff7890";
  ctx.fillRect(6, 0, 30, 12);
  ctx.fillStyle = "#631f4e";
  ctx.fillRect(8, 22, 6, 6);
  ctx.fillRect(28, 22, 6, 6);
  ctx.restore();
  dodgeParticles.forEach((p) => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = "#ffd66b";
    ctx.fillRect(p.x, p.y, 4, 4);
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 13px Space Grotesk";
  ctx.fillText("SCORE", 18, 28);
  ctx.font = "700 24px Space Grotesk";
  ctx.fillText(String(score).padStart(2, "0"), 18, 52);
  ctx.font = "600 11px Space Grotesk";
  ctx.fillStyle = "#ffffffaa";
  ctx.fillText("NEON RUNNER", 282, 28);
  if (dodgeOver) {
    ctx.fillStyle = "#10162dcc";
    ctx.fillRect(0, 0, 400, 400);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "800 30px Space Grotesk";
    ctx.fillText("GAME OVER", 200, 175);
    ctx.fillStyle = "#ffc857";
    ctx.font = "600 16px Space Grotesk";
    ctx.fillText(`Điểm của bạn: ${score}`, 200, 208);
    ctx.font = "500 13px Space Grotesk";
    ctx.fillStyle = "#ffffffcc";
    ctx.fillText("Bấm Chơi lại để chạy tiếp", 200, 240);
    ctx.textAlign = "left";
  }
}
function startMemory() {
  titleEl.textContent = "Memory Card";
  helpEl.textContent = "Mở hai thẻ giống nhau";
  cards = ["🦊", "🐸", "🐼", "🐵", "🦊", "🐸", "🐼", "🐵"].sort(
    () => Math.random() - 0.5,
  );
  picked = [];
  score = 0;
  scoreEl.textContent = 0;
  drawMemory();
}
function drawMemory() {
  ctx.fillStyle = "#d7c4f1";
  ctx.fillRect(0, 0, 400, 400);
  cards.forEach((card, i) => {
    const x = 48 + (i % 4) * 78,
      y = 55 + Math.floor(i / 4) * 100;
    ctx.fillStyle = picked.includes(i) ? "#fffaf1" : "#7d5fba";
    ctx.fillRect(x, y, 60, 78);
    if (picked.includes(i)) {
      ctx.font = "34px serif";
      ctx.textAlign = "center";
      ctx.fillText(card, x + 30, y + 52);
      ctx.textAlign = "left";
    }
  });
}
function startTicTacToe() {
  titleEl.textContent = "Tic Tac Toe";
  helpEl.textContent = "Hai người chơi lần lượt chọn ô";
  ticBoard = Array(9).fill("");
  ticTurn = "X";
  score = 0;
  scoreEl.textContent = "X";
  drawTicTacToe();
}
function drawTicTacToe() {
  ctx.fillStyle = "#f6b7a5";
  ctx.fillRect(0, 0, 400, 400);
  ctx.strokeStyle = "#192238";
  ctx.lineWidth = 5;
  [130, 270].forEach((v) => {
    ctx.beginPath();
    ctx.moveTo(v, 55);
    ctx.lineTo(v, 345);
    ctx.moveTo(55, v);
    ctx.lineTo(345, v);
    ctx.stroke();
  });
  ctx.font = "64px Space Grotesk";
  ticBoard.forEach((v, i) => {
    if (v) ctx.fillText(v, 80 + (i % 3) * 140, 140 + Math.floor(i / 3) * 100);
  });
}
canvas.addEventListener("pointerdown", (e) => {
  if (!activeGame) return;
  const r = canvas.getBoundingClientRect(),
    x = ((e.clientX - r.left) * 400) / r.width,
    y = ((e.clientY - r.top) * 400) / r.height;
  if (
    activeGame === "mouse" &&
    Math.abs(x - mouseTarget.x) < 40 &&
    Math.abs(y - mouseTarget.y) < 45
  ) {
    score++;
    scoreEl.textContent = score;
    moveMouse();
  } else if (activeGame === "memory") {
    if (memoryLocked) return;
    const i = Math.floor((x - 48) / 78) + Math.floor((y - 55) / 100) * 4;
    if (i >= 0 && i < 8 && !picked.includes(i)) {
      picked.push(i);
      if (picked.length % 2 === 0) {
        const pair = picked.slice(-2);
        if (cards[pair[0]] !== cards[pair[1]]) {
          memoryLocked = true;
          setTimeout(() => {
            picked = picked.slice(0, -2);
            memoryLocked = false;
            drawMemory();
          }, 500);
        } else {
          score++;
          scoreEl.textContent = score;
        }
      }
      drawMemory();
    }
  } else if (activeGame === "tic") {
    const col = Math.floor((x - 55) / 140),
      row = Math.floor((y - 55) / 100),
      i = row * 3 + col;
    if (col >= 0 && col < 3 && row >= 0 && row < 3 && !ticBoard[i]) {
      ticBoard[i] = ticTurn;
      ticTurn = ticTurn === "X" ? "O" : "X";
      scoreEl.textContent = ticTurn;
      drawTicTacToe();
    }
  } else if (activeGame === "breakout" || activeGame === "catch") {
    if (activeGame === "breakout") paddle = Math.max(0, Math.min(312, x - 44));
    else basket = Math.max(0, Math.min(300, x - 50));
  } else if (activeGame === "ufo") {
    ufo.vy = -6.5;
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeGame();
  if (
    activeGame === "dodge" &&
    (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.code === "Space")
  ) {
    e.preventDefault();
    if (e.key === "ArrowLeft") runnerX = Math.max(20, runnerX - 25);
    if (e.key === "ArrowRight") runnerX = Math.min(345, runnerX + 25);
    if (e.code === "Space") {
      if (!jumping) {
        jumping = true;
        jumpY = 330;
        jumpVelocity = -10;
      }
    }
  }
  if (activeGame === "2048" && e.key.startsWith("Arrow")) {
    e.preventDefault();
    move2048({ ArrowUp: 0, ArrowLeft: 1, ArrowDown: 2, ArrowRight: 3 }[e.key]);
  }
  if (
    (activeGame === "breakout" || activeGame === "catch") &&
    (e.key === "ArrowLeft" || e.key === "ArrowRight")
  ) {
    e.preventDefault();
    const step = activeGame === "breakout" ? 25 : 30;
    if (activeGame === "breakout")
      paddle =
        e.key === "ArrowLeft"
          ? Math.max(0, paddle - step)
          : Math.min(312, paddle + step);
    else
      basket =
        e.key === "ArrowLeft"
          ? Math.max(0, basket - step)
          : Math.min(300, basket + step);
  }
  if (activeGame === "ufo" && (e.code === "Space" || e.key === "ArrowUp")) {
    e.preventDefault();
    flap();
  }
  if (activeGame === "snake") {
    const m = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    if (m[e.key]) {
      e.preventDefault();
      const d = m[e.key];
      if (d.x !== -direction.x || d.y !== -direction.y) nextDirection = d;
    }
  }
  if (activeGame === "bird" && e.code === "Space") {
    e.preventDefault();
    flap();
  }
});
document.querySelectorAll("[data-direction]").forEach((button) => {
  button.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const directions = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };
    const d = directions[button.dataset.direction];
    if (
      activeGame === "snake" &&
      (d.x !== -direction.x || d.y !== -direction.y)
    ) {
      nextDirection = d;
    }
  });
});
canvas.addEventListener("click", flap);
let board2048,
  paddle = 160,
  ball = { x: 200, y: 300, vx: 3, vy: -3 },
  bricks = [],
  ufo = { y: 200, vy: 0 },
  catchItems = [],
  basket = 170;
function start2048() {
  titleEl.textContent = "2048";
  helpEl.textContent = "Dùng phím mũi tên hoặc vuốt để ghép ô";
  board2048 = Array(16).fill(0);
  add2048();
  add2048();
  score = 0;
  scoreEl.textContent = 0;
  draw2048();
}
function add2048() {
  const empty = board2048
    .map((v, i) => (v ? null : i))
    .filter((v) => v !== null);
  if (empty.length)
    board2048[empty[Math.floor(Math.random() * empty.length)]] =
      Math.random() < 0.9 ? 2 : 4;
}
function move2048(dir) {
  if (animating2048) return;
  const lines =
    dir < 2
      ? [0, 1, 2, 3].map((r) => [r, r + 4, r + 8, r + 12])
      : [0, 1, 2, 3].map((c) => [c, c + 4, c + 8, c + 12]);
  let moved = false;
  lines.forEach((line) => {
    if (dir === 1 || dir === 3) line.reverse();
    let a = line.map((i) => board2048[i]).filter(Boolean),
      out = [];
    for (let i = 0; i < a.length; i++) {
      if (a[i] === a[i + 1]) {
        out.push(a[i] * 2);
        score += a[i] * 2;
        i++;
      } else out.push(a[i]);
    }
    while (out.length < 4) out.push(0);
    if (dir === 1 || dir === 3) out.reverse();
    line.forEach((i, j) => {
      if (board2048[i] !== out[j]) moved = true;
      board2048[i] = out[j];
    });
  });
  if (moved) {
    add2048();
    scoreEl.textContent = score;
    animating2048 = true;
    move2048At = performance.now();
    animate2048();
  }
}
function animate2048(now = performance.now()) {
  draw2048(now);
  if (now - move2048At < 180) requestAnimationFrame(animate2048);
  else animating2048 = false;
}
function draw2048(now = performance.now()) {
  ctx.fillStyle = "#e6bd80";
  ctx.fillRect(0, 0, 400, 400);
  board2048.forEach((v, i) => {
    let x = 20 + (i % 4) * 92,
      y = 20 + Math.floor(i / 4) * 92;
    const pulse = Math.min(1, Math.max(0, (now - move2048At) / 180));
    const scale = v && pulse < 1 ? 0.88 + pulse * 0.12 : 1;
    const size = 78 * scale,
      offset = (78 - size) / 2;
    ctx.fillStyle = v ? "#fff4df" : "#d4a96e";
    ctx.fillRect(x + offset, y + offset, size, size);
    if (v) {
      ctx.fillStyle = "#192238";
      ctx.font = "bold 25px Space Grotesk";
      ctx.textAlign = "center";
      ctx.fillText(v, x + 39, y + 47);
      ctx.textAlign = "left";
    }
  });
}
function startBreakout() {
  titleEl.textContent = "Breakout";
  helpEl.textContent = "Di chuyển thanh đỡ bằng phím trái/phải";
  paddle = 160;
  ball = { x: 200, y: 300, vx: 3, vy: -3 };
  bricks = Array.from({ length: 24 }, (_, i) => ({
    x: 14 + (i % 6) * 63,
    y: 35 + Math.floor(i / 6) * 25,
    alive: true,
  }));
  score = 0;
  scoreEl.textContent = 0;
  clearInterval(timer);
  timer = setInterval(stepBreakout, 16);
}
function stepBreakout() {
  ball.x += ball.vx;
  ball.y += ball.vy;
  if (ball.x < 8 || ball.x > 392) ball.vx *= -1;
  if (ball.y < 8) ball.vy *= -1;
  if (ball.y > 370 && ball.x > paddle - 8 && ball.x < paddle + 88)
    ball.vy = -Math.abs(ball.vy);
  bricks.forEach((b) => {
    if (
      b.alive &&
      ball.x > b.x &&
      ball.x < b.x + 52 &&
      ball.y > b.y &&
      ball.y < b.y + 18
    ) {
      b.alive = false;
      ball.vy *= -1;
      score++;
      scoreEl.textContent = score;
    }
  });
  if (ball.y > 410) return endGame();
  drawBreakout();
}
function drawBreakout() {
  ctx.fillStyle = "#8eb8e8";
  ctx.fillRect(0, 0, 400, 400);
  bricks.forEach((b) => {
    if (b.alive) {
      ctx.fillStyle = "#ff7859";
      ctx.fillRect(b.x, b.y, 52, 18);
    }
  });
  ctx.fillStyle = "#192238";
  ctx.fillRect(paddle, 370, 88, 12);
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, 7, 0, Math.PI * 2);
  ctx.fill();
}
function startUfo() {
  titleEl.textContent = "Flappy UFO";
  helpEl.textContent = "Nhấn SPACE hoặc chạm để bay";
  ufo = { y: 200, vy: 0 };
  pipes = [];
  score = 0;
  scoreEl.textContent = 0;
  ufoStarted = false;
  drawUfo();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 20px Space Grotesk";
  ctx.textAlign = "center";
  ctx.fillText("Nhan Space hoac cham de bat dau", 200, 215);
  ctx.textAlign = "left";
}
function stepUfo() {
  ufo.vy += 0.32;
  ufo.y += ufo.vy;
  if (!pipes.length || pipes[pipes.length - 1].x < 230) {
    const top = 30 + Math.random() * 140;
    pipes.push({ x: 400, top, bottom: top + 120, passed: false });
  }
  pipes.forEach((p) => {
    p.x -= 2.5;
    if (!p.passed && p.x < 70) {
      p.passed = true;
      score++;
      scoreEl.textContent = score;
    }
  });
  pipes = pipes.filter((p) => p.x > -60);
  const hit =
    ufo.y < 0 ||
    ufo.y > 380 ||
    pipes.some(
      (p) =>
        70 + 18 > p.x &&
        70 - 18 < p.x + 45 &&
        (ufo.y - 18 < p.top || ufo.y + 18 > p.bottom),
    );
  drawUfo();
  if (hit) return endGame();
  birdFrame = requestAnimationFrame(stepUfo);
}
function drawUfo() {
  ctx.fillStyle = "#6b6ab0";
  ctx.fillRect(0, 0, 400, 400);
  ctx.font = "35px serif";
  ctx.fillText("🛸", 52, ufo.y + 12);
  pipes.forEach((p) => {
    ctx.fillStyle = "#8ee0c0";
    ctx.fillRect(p.x, 0, 45, p.top);
    ctx.fillRect(p.x, p.bottom, 45, 400 - p.bottom);
  });
}
function startCatch() {
  titleEl.textContent = "Bắt vật phẩm";
  helpEl.textContent = "Di chuyển giỏ bằng phím trái/phải";
  basket = 170;
  catchItems = [];
  score = 0;
  scoreEl.textContent = 0;
  clearInterval(timer);
  timer = setInterval(stepCatch, 35);
}
function stepCatch() {
  if (Math.random() < 0.035)
    catchItems.push({
      x: 20 + Math.random() * 350,
      y: -20,
      bad: Math.random() < 0.2,
    });
  catchItems.forEach((i) => (i.y += 3));
  catchItems = catchItems.filter((i) => {
    if (i.y > 350 && i.x > basket - 12 && i.x < basket + 100) {
      if (i.bad) return endGame();
      score++;
      scoreEl.textContent = score;
      return false;
    }
    return i.y < 410;
  });
  drawCatch();
}
function drawCatch() {
  ctx.fillStyle = "#f3d28d";
  ctx.fillRect(0, 0, 400, 400);
  ctx.font = "30px serif";
  catchItems.forEach((i) => ctx.fillText(i.bad ? "💣" : "⭐", i.x, i.y));
  ctx.font = "46px serif";
  ctx.fillText("🧺", basket, 370);
}
function drawDodge() {
  ctx.fillStyle = "#b8e8a2";
  ctx.fillRect(0, 0, 400, 400);
  ctx.fillStyle = "#78b879";
  ctx.fillRect(0, 350, 400, 50);
  const playerBottom = jumpY + 10;
  ctx.fillStyle = "#3d6fd6";
  ctx.fillRect(runnerX + 12, playerBottom - 42, 20, 20);
  ctx.strokeStyle = "#192238";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(runnerX + 22, playerBottom - 22);
  ctx.lineTo(runnerX + 22, playerBottom - 4);
  ctx.moveTo(runnerX + 22, playerBottom - 16);
  ctx.lineTo(runnerX + 8, playerBottom - 7);
  ctx.moveTo(runnerX + 22, playerBottom - 16);
  ctx.lineTo(runnerX + 36, playerBottom - 7);
  ctx.moveTo(runnerX + 22, playerBottom - 4);
  ctx.lineTo(runnerX + 10, playerBottom + 10);
  ctx.moveTo(runnerX + 22, playerBottom - 4);
  ctx.lineTo(runnerX + 34, playerBottom + 10);
  ctx.stroke();
  ctx.fillStyle = "#ff7859";
  ctx.fillRect(obstacleX, 315, 35, 25);
}
