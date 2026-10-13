const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const scoreEl = document.querySelector(".score");
const livesEl = document.querySelector("#lives");
const message = document.querySelector("#message");
const messageTitle = document.querySelector("#messageTitle");
const messageText = document.querySelector("#messageText");
const startButton = document.querySelector("#start");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const keys = { left: false, right: false };
let ball;
let platforms;
let score;
let lives;
let speed;
let running = false;
let lastTime = 0;
let animation = 0;

function makePlatform(y, previous) {
  const width = 48 + Math.random() * 42;
  const gap = previous ? Math.min(105, 64 + score * 0.25) : 0;
  let x = 12 + Math.random() * (WIDTH - width - 24);
  if (previous) {
    const min = Math.max(12, previous.x - gap);
    const max = Math.min(WIDTH - width - 12, previous.x + previous.w + gap - width);
    x = max > min ? min + Math.random() * (max - min) : x;
  }
  return { x, y, w: width, h: 7 };
}

function resetRound() {
  ball = { x: WIDTH / 2, y: 128, radius: 9, vx: 0, vy: 0 };
  platforms = [];
  const base = { x: 83, y: 185, w: 95, h: 7 };
  platforms.push(base);
  let previous = base;
  for (let y = 265; y < HEIGHT + 100; y += 78) {
    previous = makePlatform(y, previous);
    platforms.push(previous);
  }
  speed = 1.18;
}

function newGame() {
  score = 0;
  lives = 3;
  resetRound();
  draw();
  showMessage("READY", "Bấm bắt đầu để lăn!", "BẮT ĐẦU");
}

function showMessage(title, text, buttonText) {
  messageTitle.textContent = title;
  messageText.textContent = text;
  startButton.textContent = buttonText;
  message.hidden = false;
}

function start() {
  if (running) return;
  running = true;
  message.hidden = true;
  lastTime = performance.now();
  animation = requestAnimationFrame(loop);
}

function move(delta) {
  const factor = delta / 16.67;
  ball.vx += (keys.left ? -0.46 : 0) + (keys.right ? 0.46 : 0);
  ball.vx *= Math.pow(0.82, factor);
  ball.vx = Math.max(-4.2, Math.min(4.2, ball.vx));
  ball.x += ball.vx * factor;
  ball.x = Math.max(ball.radius + 5, Math.min(WIDTH - ball.radius - 5, ball.x));
  ball.vy += 0.2 * factor;
  ball.vy = Math.min(ball.vy, 5.5);
  const oldBottom = ball.y + ball.radius;
  ball.y += ball.vy * factor;

  speed = Math.min(3.25, 1.18 + score / 620);
  platforms.forEach((platform) => (platform.y -= speed * factor));
  for (const platform of platforms) {
    const overlaps = ball.x + ball.radius > platform.x && ball.x - ball.radius < platform.x + platform.w;
    const crossesTop = oldBottom <= platform.y + speed * factor + 2 && ball.y + ball.radius >= platform.y;
    if (ball.vy > 0 && overlaps && crossesTop) {
      ball.y = platform.y - ball.radius;
      ball.vy = -4.05;
      score += 5;
      break;
    }
  }
  while (platforms.length && platforms[0].y < -20) platforms.shift();
  while (platforms.length < 9) {
    const last = platforms[platforms.length - 1];
    platforms.push(makePlatform(last.y + 72 + Math.random() * 21, last));
  }
  if (ball.y - ball.radius > HEIGHT + 4) loseLife();
}

function loseLife() {
  lives--;
  if (lives <= 0) {
    running = false;
    cancelAnimationFrame(animation);
    draw();
    showMessage("GAME OVER", `Điểm của bạn: ${String(score).padStart(6, "0")}`, "CHƠI LẠI");
    return;
  }
  resetRound();
}

function loop(now) {
  const delta = Math.min(32, now - lastTime || 16.67);
  lastTime = now;
  move(delta);
  draw();
  if (running) animation = requestAnimationFrame(loop);
}

function dotsLine(x, y, width) {
  context.fillStyle = "#073c43";
  for (let dot = x; dot < x + width; dot += 5) context.fillRect(dot, y, 3, 3);
}

function drawBall() {
  context.fillStyle = "#073c43";
  context.beginPath();
  context.arc(Math.round(ball.x), Math.round(ball.y), ball.radius, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#9af0ec";
  context.fillRect(Math.round(ball.x - 3), Math.round(ball.y - 5), 3, 3);
}

function draw() {
  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = "#9af0ec";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.strokeStyle = "#073c43";
  context.lineWidth = 3;
  context.strokeRect(7, 7, WIDTH - 14, HEIGHT - 14);
  for (let y = 12; y < HEIGHT - 10; y += 25) {
    context.fillStyle = "#073c43";
    context.fillRect(8, y, 4, 10);
    context.fillRect(WIDTH - 12, y, 4, 10);
  }
  platforms.forEach((platform) => dotsLine(Math.round(platform.x), Math.round(platform.y), platform.w));
  drawBall();
  scoreEl.textContent = String(score).padStart(6, "0");
  livesEl.textContent = `×${lives}`;
}

function setKey(name, value) {
  keys[name] = value;
  document.querySelector(`#${name}`).classList.toggle("pressed", value);
}

document.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "a", "A"].includes(event.key)) { event.preventDefault(); setKey("left", true); }
  if (["ArrowRight", "d", "D"].includes(event.key)) { event.preventDefault(); setKey("right", true); }
  if ((event.code === "Space" || event.key === "Enter") && !running) start();
});
document.addEventListener("keyup", (event) => {
  if (["ArrowLeft", "a", "A"].includes(event.key)) setKey("left", false);
  if (["ArrowRight", "d", "D"].includes(event.key)) setKey("right", false);
});
["left", "right"].forEach((name) => {
  const button = document.querySelector(`#${name}`);
  button.addEventListener("pointerdown", (event) => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); setKey(name, true); });
  ["pointerup", "pointercancel", "pointerleave"].forEach((type) => button.addEventListener(type, () => setKey(name, false)));
});
startButton.addEventListener("click", () => { if (!running && lives <= 0) newGame(); start(); });
document.querySelector("#restart").addEventListener("click", () => { running = false; cancelAnimationFrame(animation); newGame(); });
newGame();
