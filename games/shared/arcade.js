window.startStandalone = function (type) {
  const c = document.querySelector("canvas"),
    x = c.getContext("2d"),
    scoreEl = document.querySelector("#score"),
    help = document.querySelector(".help"),
    controls = document.querySelector(".controls");
  let score = 0,
    run = 0,
    state = {},
    loop;
  const S = (v) => {
      score = v;
      scoreEl.textContent = v;
    },
    drawText = (t, y = 210) => {
      x.fillStyle = "#fff";
      x.font = "700 18px Arial";
      x.textAlign = "center";
      x.fillText(t, 200, y);
      x.textAlign = "left";
    },
    reset = () => {
      cancelAnimationFrame(loop);
      S(0);
      state = {};
      if (type === "flappy-bird" || type === "flappy-ufo") {
        help.textContent = "Chạm màn hình hoặc nút BAY để bay";
        state = { y: 200, vy: 0, pipes: [], started: false };
      } else if (type === "dodge" || type === "dino-runner") {
        help.textContent = "Chạm hoặc bấm NHẢY để vượt chướng ngại";
        state = { y: 330, vy: 0, obs: 400 };
      } else if (type === "mouse") {
        help.textContent = "Chạm vào mục tiêu để ghi điểm";
        state = { tx: 200, ty: 200, time: 30 };
      } else if (type === "memory") {
        help.textContent = "Lật hai thẻ giống nhau";
        state = {
          cards: ["★", "●", "◆", "♥", "★", "●", "◆", "♥"].sort(
            () => Math.random() - 0.5,
          ),
          open: [],
          lock: false,
        };
      } else if (type === "tic-tac-toe") {
        help.textContent = "Hai người thay phiên chạm vào ô";
        state = { b: Array(9).fill(""), turn: "X" };
      } else if (type === "2048") {
        help.textContent = "Dùng các nút mũi tên để ghép số";
        state = { b: Array(16).fill(0) };
        add2048();
        add2048();
      } else if (type === "breakout") {
        help.textContent = "Kéo thanh đỡ bằng nút trái/phải";
        state = {
          p: 160,
          bx: 200,
          by: 300,
          vx: 3,
          vy: -3,
          bricks: Array.from({ length: 24 }, (_, i) => [
            14 + (i % 6) * 63,
            35 + Math.floor(i / 6) * 25,
          ]),
        };
      } else {
        help.textContent = "Dùng trái/phải để hứng vật phẩm";
        state = { p: 170, items: [] };
      }
      draw();
      if (
        [
          "flappy-bird",
          "flappy-ufo",
          "dodge",
          "dino-runner",
          "breakout",
          "catch",
        ].includes(type)
      )
        loop = requestAnimationFrame(tick);
    };
  function add2048() {
    let e = state.b.map((v, i) => (v ? null : i)).filter((v) => v !== null);
    if (e.length) state.b[e[(Math.random() * e.length) | 0]] = 2;
  }
  function flap() {
    if (type.includes("flappy")) {
      state.started = true;
      state.vy = -6.5;
    } else if (type === "dodge" || type === "dino-runner") {
      if (state.y >= 330) state.vy = -10;
    }
  }
  function tick() {
    if (type.includes("flappy")) {
      if (!state.started) {
        draw();
        loop = requestAnimationFrame(tick);
        return;
      }
      state.vy += 0.34;
      state.y += state.vy;
      if (!state.pipes.length || state.pipes.at(-1).x < 230) {
        let t = 40 + Math.random() * 140;
        state.pipes.push({ x: 400, t, b: t + 125, p: false });
      }
      state.pipes.forEach((p) => {
        p.x -= 2.5;
        if (!p.p && p.x < 70) {
          p.p = true;
          S(score + 1);
        }
      });
      if (
        state.y < 0 ||
        state.y > 380 ||
        state.pipes.some(
          (p) =>
            70 + 16 > p.x &&
            70 - 16 < p.x + 45 &&
            (state.y - 16 < p.t || state.y + 16 > p.b),
        )
      )
        return over();
    } else if (type === "dodge" || type === "dino-runner") {
      state.vy += 0.62;
      state.y = Math.min(330, state.y + state.vy);
      if (state.y === 330) state.vy = 0;
      state.obs -= 5;
      if (state.obs < -40) {
        state.obs = 430;
        S(score + 1);
      }
      if (state.obs < 110 && state.obs + 35 > 65 && state.y > 305)
        return over();
    } else if (type === "breakout") {
      state.bx += state.vx;
      state.by += state.vy;
      if (state.bx < 6 || state.bx > 394) state.vx *= -1;
      if (state.by < 6) state.vy *= -1;
      if (state.by > 370 && state.bx > state.p && state.bx < state.p + 90)
        state.vy = -3;
      if (state.by > 410) return over();
      state.bricks = state.bricks.filter((b) => {
        if (
          state.bx > b[0] &&
          state.bx < b[0] + 52 &&
          state.by > b[1] &&
          state.by < b[1] + 18
        ) {
          state.vy *= -1;
          S(score + 1);
          return false;
        }
        return true;
      });
    } else if (type === "catch") {
      if (Math.random() < 0.035)
        state.items.push({
          x: 20 + Math.random() * 350,
          y: -15,
          bad: Math.random() < 0.2,
        });
      state.items.forEach((i) => (i.y += 3));
      state.items = state.items.filter((i) => {
        if (i.y > 350 && i.x > state.p && i.x < state.p + 90) {
          if (i.bad) {
            over();
            return false;
          }
          S(score + 1);
          return false;
        }
        return i.y < 410;
      });
    }
    draw();
    loop = requestAnimationFrame(tick);
  }
  function over() {
    cancelAnimationFrame(loop);
    draw();
    x.fillStyle = "#172138cc";
    x.fillRect(0, 0, 400, 400);
    drawText("GAME OVER", 185);
    drawText("Bấm Chơi lại", 218);
  }
  function draw() {
    x.fillStyle = type.includes("flappy")
      ? "#8ed8e8"
      : type === "2048"
        ? "#e7bd80"
        : "#23345c";
    x.fillRect(0, 0, 400, 400);
    if (type.includes("flappy")) {
      state.pipes.forEach((p) => {
        x.fillStyle = "#5cb477";
        x.fillRect(p.x, 0, 45, p.t);
        x.fillRect(p.x, p.b, 45, 400 - p.b);
      });
      x.font = "34px serif";
      x.fillText(type === "flappy-ufo" ? "🛸" : "🐤", 52, state.y + 12);
    } else if (type === "dodge" || type === "dino-runner") {
      x.fillStyle = "#e7c171";
      x.fillRect(0, 350, 400, 50);
      x.fillStyle = "#48a05c";
      x.fillRect(65, state.y - 42, 38, 42);
      x.fillStyle = "#ff7859";
      x.fillRect(state.obs, 310, 35, 40);
    } else if (type === "mouse") {
      x.fillStyle = "#ffd98a";
      x.fillRect(0, 0, 400, 400);
      x.font = "50px serif";
      x.fillText("🎯", state.tx - 25, state.ty + 18);
    } else if (type === "memory") {
      state.cards.forEach((v, i) => {
        let a = state.open.includes(i),
          px = 48 + (i % 4) * 78,
          py = 65 + Math.floor(i / 4) * 100;
        x.fillStyle = a ? "#fffaf1" : "#805fc0";
        x.fillRect(px, py, 60, 78);
        if (a) {
          x.fillStyle = "#192238";
          x.font = "30px Arial";
          x.textAlign = "center";
          x.fillText(v, px + 30, py + 49);
          x.textAlign = "left";
        }
      });
    } else if (type === "tic-tac-toe") {
      x.strokeStyle = "#fff";
      x.lineWidth = 5;
      [133, 267].forEach((v) => {
        x.beginPath();
        x.moveTo(v, 50);
        x.lineTo(v, 350);
        x.moveTo(50, v);
        x.lineTo(350, v);
        x.stroke();
      });
      x.fillStyle = "#fff";
      x.font = "55px Arial";
      state.b.forEach((v, i) =>
        x.fillText(v, 83 + (i % 3) * 135, 125 + Math.floor(i / 3) * 100),
      );
    } else if (type === "2048") {
      state.b.forEach((v, i) => {
        let px = 20 + (i % 4) * 92,
          py = 20 + Math.floor(i / 4) * 92;
        x.fillStyle = v ? "#fff4df" : "#d4a96e";
        x.fillRect(px, py, 78, 78);
        if (v) {
          x.fillStyle = "#192238";
          x.font = "24px Arial";
          x.fillText(v, px + 27, py + 48);
        }
      });
    } else if (type === "breakout") {
      state.bricks.forEach((b) => {
        x.fillStyle = "#ff7859";
        x.fillRect(b[0], b[1], 52, 18);
      });
      x.fillStyle = "#fff";
      x.fillRect(state.p, 370, 90, 10);
      x.beginPath();
      x.arc(state.bx, state.by, 7, 0, 7);
      x.fill();
    } else {
      state.items.forEach((i) => {
        x.font = "28px serif";
        x.fillText(i.bad ? "💣" : "⭐", i.x, i.y);
      });
      x.font = "40px serif";
      x.fillText("🧺", state.p, 375);
    }
  }
  function control(v) {
    if (v === "action") return flap();
    if (type === "2048") {
      let d = { up: 0, left: 1, down: 2, right: 3 }[v];
      if (d !== undefined) {
        let b = state.b;
        let lines =
          d < 2
            ? [0, 1, 2, 3].map((r) => [r, r + 4, r + 8, r + 12])
            : [0, 1, 2, 3].map((c) => [c, c + 4, c + 8, c + 12]);
        lines.forEach((l) => {
          if (d === 1 || d === 3) l.reverse();
          let a = l.map((i) => b[i]).filter(Boolean),
            o = [];
          for (let i = 0; i < a.length; i++)
            a[i] === a[i + 1]
              ? (o.push(a[i] * 2), S(score + a[i] * 2), i++)
              : o.push(a[i]);
          while (o.length < 4) o.push(0);
          if (d === 1 || d === 3) o.reverse();
          l.forEach((k, i) => (b[k] = o[i]));
        });
        add2048();
        draw();
      }
    } else if (type === "breakout" || type === "catch") {
      state.p = Math.max(0, Math.min(310, state.p + (v === "left" ? -30 : 30)));
    }
  }
  c.addEventListener("pointerdown", (e) => {
    let r = c.getBoundingClientRect(),
      px = ((e.clientX - r.left) * 400) / r.width,
      py = ((e.clientY - r.top) * 400) / r.height;
    if (type === "mouse") {
      if (Math.abs(px - state.tx) < 45 && Math.abs(py - state.ty) < 45) {
        S(score + 1);
        state.tx = 40 + Math.random() * 320;
        state.ty = 55 + Math.random() * 280;
        draw();
      }
    } else if (type === "memory" && !state.lock) {
      let i = Math.floor((px - 48) / 78) + Math.floor((py - 65) / 100) * 4;
      if (i >= 0 && i < 8 && !state.open.includes(i)) {
        state.open.push(i);
        if (
          state.open.length % 2 === 0 &&
          state.cards.at(-1) !== state.cards.at(-2)
        ) {
          state.lock = true;
          setTimeout(() => {
            state.open = state.open.slice(0, -2);
            state.lock = false;
            draw();
          }, 500);
        }
        draw();
      }
    } else if (type === "tic-tac-toe") {
      let i = Math.floor((py - 50) / 100) * 3 + Math.floor((px - 50) / 135);
      if (i >= 0 && i < 9 && !state.b[i]) {
        state.b[i] = state.turn;
        state.turn = state.turn === "X" ? "O" : "X";
        draw();
      }
    } else flap();
  });
  controls.addEventListener("pointerdown", (e) => {
    let b = e.target.closest("button");
    if (b) control(b.dataset.c);
  });
  document.addEventListener("keydown", (e) => {
    let m = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      Space: "action",
    };
    if (m[e.code] || m[e.key]) {
      e.preventDefault();
      control(m[e.code] || m[e.key]);
    }
  });
  document.querySelector(".restart").onclick = reset;
  reset();
};
