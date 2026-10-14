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
const TOP_SPIKES_Y = 14;
const keys = { left: false, right: false };
let ball, platforms, score, lives, speed, running, lastTime, animation, platformNumber, elapsed;

function spikeChance() {
  return Math.min(0.42, 0.12 + elapsed / 90000);
}

function makePlatform(y, previous, safe = false) {
  const width = 52 + Math.random() * 43;
  const range = previous ? 108 : WIDTH - width - 24;
  const center = previous ? previous.x + previous.w / 2 + (Math.random() - 0.5) * range : WIDTH / 2;
  const x = Math.max(12, Math.min(WIDTH - width - 12, center - width / 2));
  platformNumber++;
  return { x, y, w: width, h: 7, spikes: !safe && platformNumber > 4 && Math.random() < spikeChance(), scored: false };
}

function resetRound() {
  platformNumber = 0;
  const spawn = { x: 57, y: 236, w: 156, h: 7, spikes: false, scored: true };
  ball = { x: WIDTH / 2, y: spawn.y - 9, radius: 9, vx: 0, vy: 0, on: spawn };
  platforms = [spawn];
  let previous = spawn;
  for (let y = 326; y < HEIGHT + 110; y += 82) {
    previous = makePlatform(y, previous, platformNumber < 3);
    platforms.push(previous);
  }
  speed = 0.92;
}

function newGame() {
  score = 0;
  lives = 3;
  elapsed = 0;
  resetRound();
  draw();
  showMessage("READY", "Rời bệ để rơi xuống, tránh hàng gai!", "BẮT ĐẦU");
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

function landOn(platform) {
  if (platform.spikes) return loseLife();
  ball.on = platform;
  ball.y = platform.y - ball.radius;
  ball.vy = 0;
  if (!platform.scored) {
    platform.scored = true;
    score += 10;
  }
}

function move(delta) {
  const factor = delta / 16.67;
  elapsed += delta;
  speed = Math.min(3.1, 0.92 + Math.floor(elapsed / 20000) * 0.24);
  ball.vx += (keys.left ? -0.42 : 0) + (keys.right ? 0.42 : 0);
  ball.vx *= Math.pow(0.79, factor);
  ball.vx = Math.max(-3.8, Math.min(3.8, ball.vx));
  ball.x += ball.vx * factor;
  ball.x = Math.max(ball.radius + 5, Math.min(WIDTH - ball.radius - 5, ball.x));
  platforms.forEach((platform) => (platform.y -= speed * factor));

  if (ball.on) {
    const platform = ball.on;
    const stillOnPlatform = platforms.includes(platform) && ball.x + ball.radius > platform.x && ball.x - ball.radius < platform.x + platform.w;
    if (stillOnPlatform) {
      ball.y = platform.y - ball.radius;
    } else {
      ball.on = null;
      ball.vy = 0.5;
    }
  }

  if (!ball.on) {
    const oldBottom = ball.y + ball.radius;
    ball.vy = Math.min(5.8, ball.vy + 0.2 * factor);
    ball.y += ball.vy * factor;
    for (const platform of platforms) {
      const overlaps = ball.x + ball.radius > platform.x && ball.x - ball.radius < platform.x + platform.w;
      const crossesTop = oldBottom <= platform.y + speed * factor + 2 && ball.y + ball.radius >= platform.y;
      if (ball.vy > 0 && overlaps && crossesTop) {
        landOn(platform);
        break;
      }
    }
  }

  if (ball.y - ball.radius <= TOP_SPIKES_Y + 11 || ball.y - ball.radius > HEIGHT + 5) return loseLife();
  while (platforms.length && platforms[0].y < -28) platforms.shift();
  while (platforms.length < 9) {
    const previous = platforms[platforms.length - 1];
    platforms.push(makePlatform(previous.y + 70 + Math.random() * 24, previous));
  }
}

function loseLife() {
  lives--;
  keys.left = false;
  keys.right = false;
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

function drawSpikes(x, y, width) {
  context.fillStyle = "#073c43";
  for (let point = x; point < x + width; point += 7) {
    context.beginPath();
    context.moveTo(point, y + 7);
    context.lineTo(point + 3.5, y);
    context.lineTo(point + 7, y + 7);
    context.fill();
  }
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
  drawSpikes(10, TOP_SPIKES_Y, WIDTH - 20);
  for (let y = 32; y < HEIGHT - 10; y += 25) {
    context.fillStyle = "#073c43";
    context.fillRect(8, y, 4, 10);
    context.fillRect(WIDTH - 12, y, 4, 10);
  }
  platforms.forEach((platform) => {
    dotsLine(Math.round(platform.x), Math.round(platform.y), platform.w);
    if (platform.spikes) drawSpikes(Math.round(platform.x), Math.round(platform.y - 8), platform.w);
  });
  drawBall();
  scoreEl.textContent = String(score).padStart(6, "0");
  livesEl.textContent = "♥".repeat(lives);
  livesEl.setAttribute("aria-label", `${lives} mạng còn lại`);
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
