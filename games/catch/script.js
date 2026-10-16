(() => {
  "use strict";

  const W = 700, H = 800;
  const canvas = document.querySelector("#field"), ctx = canvas.getContext("2d");
  canvas.width = W; canvas.height = H;
  const $ = (s) => document.querySelector(s);
  const ui = { score: $("#stScore"), lives: $("#stLives"), combo: $("#stCombo"), mult: $("#stMult"), best: $("#stBest"), overlay: $("#overlay"), icon: $("#cIco"), title: $("#cTitle"), body: $("#cBody"), buttons: $("#cBtns"), pause: $("#btnPause"), sound: $("#btnSound"), restart: $("#btnRestart") };
  const levels = { easy: { name: "Dễ", lives: 5, speed: .78, interval: 1.18 }, normal: { name: "Thường", lives: 3, speed: 1, interval: .92 }, hard: { name: "Khó", lives: 2, speed: 1.26, interval: .72 } };
  const fruits = ["🍎", "🍐", "🍊", "🍓", "🍑", "🍒"];
  let game, raf = 0, last = 0, audio = null, soundOn = true;
  let best = Number(localStorage.getItem("gamevui-catch-best") || 0);
  ui.best.textContent = best;

  function newGame(level = "normal") {
    cancelAnimationFrame(raf);
    const d = levels[level];
    game = { level, d, active: true, paused: false, elapsed: 0, score: 0, lives: d.lives, combo: 0,
      basket: { x: W / 2, target: W / 2, width: 125 }, items: [], particles: [], texts: [], keys: {},
      nextFruit: .65, nextExtra: 1.25, lastSafeX: W / 2, magnetUntil: 0, largeUntil: 0, snowUntil: 0,
      flash: 0, caught: 0, missed: 0, maxCombo: 0 };
    updateUI(); hideOverlay(); last = performance.now(); raf = requestAnimationFrame(frame);
  }
  function multiplier() { return Math.min(5, 1 + Math.floor(game.combo / 5)); }
  function updateUI() {
    if (!game) return;
    ui.score.textContent = game.score.toLocaleString("vi-VN");
    ui.lives.innerHTML = Array.from({ length: game.d.lives }, (_, i) => i < game.lives ? "♥" : "<s>♥</s>").join("");
    ui.combo.textContent = game.combo; ui.mult.hidden = multiplier() === 1; ui.mult.textContent = `×${multiplier()}`;
  }
  function showOverlay(icon, title, body, buttons) {
    ui.icon.textContent = icon; ui.title.textContent = title; ui.body.innerHTML = body; ui.buttons.innerHTML = "";
    buttons.forEach(({ label, primary, action }) => { const b = document.createElement("button"); b.className = `btn${primary ? " primary" : ""}`; b.textContent = label; b.addEventListener("click", action); ui.buttons.append(b); });
    ui.overlay.hidden = false;
  }
  function hideOverlay() { ui.overlay.hidden = true; }
  function intro() {
    cancelAnimationFrame(raf); game = null;
    showOverlay("🧺", "Bắt vật phẩm", `<p>Rê chuột, chạm màn hình hoặc dùng <b>← → / A D</b> để kéo rổ.</p>
      <div class="seg" id="levels"><button data-level="easy">Dễ<small>5 mạng · chậm</small></button><button class="on" data-level="normal">Thường<small>3 mạng · vừa</small></button><button data-level="hard">Khó<small>2 mạng · nhanh</small></button></div>
      <ul class="legend"><li><span>🍎 🍊</span>Trái cây <b>+10</b></li><li><span>⭐</span>Sao nhanh <b>+50</b></li><li><span>🧧</span>Lì xì Tết <b>+20–200</b></li><li><span>💣</span>Bom <b class="bad">−1 mạng</b></li><li><span>❤️ 🧲 🧺 ❄️</span>Vật phẩm hỗ trợ <b>hữu ích</b></li></ul>
      <p class="tip">Hứng liên tiếp để tăng combo và nhân điểm. Trái cây được sắp xếp để luôn kịp chạy tới!</p>`, [{ label: "Bắt đầu", primary: true, action: () => newGame(chosen) }]);
    let chosen = "normal";
    $("#levels").addEventListener("click", (e) => { const b = e.target.closest("button[data-level]"); if (!b) return; chosen = b.dataset.level; $("#levels").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); });
  }
  function frame(now) { if (!game || !game.active) return; const dt = Math.min(.034, (now - last) / 1000 || 0); last = now; if (!game.paused) update(dt); draw(); raf = requestAnimationFrame(frame); }
  function update(dt) {
    const g = game; g.elapsed += dt; g.flash = Math.max(0, g.flash - dt); moveBasket(dt);
    while (g.elapsed >= g.nextFruit) scheduleFruit(); while (g.elapsed >= g.nextExtra) scheduleExtra();
    const slow = g.elapsed < g.snowUntil ? .58 : 1, basketY = H - 89;
    for (const item of g.items) {
      if (g.elapsed < g.magnetUntil && item.kind !== "bomb" && item.y > H * .25) item.x += (g.basket.x - item.x) * Math.min(1, dt * 5.5);
      item.phase += dt * 3; item.y += item.speed * slow * dt; if (item.swing) item.x += Math.sin(item.phase) * item.swing * dt;
      if (!item.done && item.y + item.radius >= basketY && item.y - item.radius <= basketY + 45 && Math.abs(item.x - g.basket.x) < g.basket.width / 2 + item.radius * .45) { item.done = true; catchItem(item); }
      if (!item.done && item.y - item.radius > H + 12) { item.done = true; missItem(item); }
    }
    g.items = g.items.filter((item) => !item.done || item.y < H + 40); updateParticles(dt);
  }
  function moveBasket(dt) { const b = game.basket, direction = (game.keys.left ? -1 : 0) + (game.keys.right ? 1 : 0); if (direction) b.target += direction * 620 * dt; b.width = game.elapsed < game.largeUntil ? 184 : 125; b.target = clamp(b.target, b.width / 2 + 12, W - b.width / 2 - 12); b.x += (b.target - b.x) * Math.min(1, dt * 14); }
  // Mỗi trái cây cần hứng được đặt trong phạm vi rổ có thể chạy đến trước quả tiếp theo.
  function scheduleFruit() { const g = game, pressure = Math.min(1, g.elapsed / 110), interval = Math.max(.34, g.d.interval - pressure * .37), reach = Math.max(90, 620 * interval * .76), min = clamp(g.lastSafeX - reach, 55, W - 55), max = clamp(g.lastSafeX + reach, 55, W - 55), x = min + Math.random() * Math.max(1, max - min); g.lastSafeX = x; addItem("fruit", x, true); g.nextFruit += interval; }
  function scheduleExtra() {
    const g = game, pressure = Math.min(1, g.elapsed / 120), roll = Math.random();
    let kind = roll < .25 ? "bomb" : roll < .46 ? "star" : roll < .57 ? "lucky" : roll < .73 ? ["heart", "magnet", "basket", "snow"][Math.floor(Math.random() * 4)] : "star";
    let x = 60 + Math.random() * (W - 120);
    if (kind === "bomb") { const bombSpeed = (116 + Math.min(105, g.elapsed * 1.15)) * g.d.speed * 1.14, bombArrival = (H - 47) / bombSpeed; const unsafe = (candidate) => g.items.some((i) => i.required && !i.done && Math.abs(i.x - candidate) < 120 && Math.abs((H - 89 - i.y) / i.speed - bombArrival) < 1.25); let tries = 0; while (unsafe(x) && tries++ < 18) x = 60 + Math.random() * (W - 120); if (unsafe(x)) kind = "star"; }
    addItem(kind, x, false); g.nextExtra += Math.max(.42, 1.25 - pressure * .72) + Math.random() * .6;
  }
  function addItem(kind, x, required) {
    const g = game, fast = kind === "star" ? 1.43 : kind === "bomb" ? 1.14 : 1, speed = (116 + Math.min(105, g.elapsed * 1.15)) * g.d.speed * fast;
    const data = { fruit: { emoji: fruits[Math.floor(Math.random() * fruits.length)], radius: 28 }, star: { emoji: "⭐", radius: 28 }, lucky: { emoji: "🧧", radius: 29 }, bomb: { emoji: "💣", radius: 29 }, heart: { emoji: "❤️", radius: 26 }, magnet: { emoji: "🧲", radius: 27 }, basket: { emoji: "🧺", radius: 28 }, snow: { emoji: "❄️", radius: 27 } }[kind];
    g.items.push({ kind, x, y: -42, speed, required, phase: Math.random() * 6.28, swing: g.elapsed > 42 && (kind === "fruit" || kind === "star") ? 18 + Math.random() * 28 : 0, done: false, ...data });
  }
  function catchItem(item) {
    const g = game; pop(item.x, item.y, item.kind === "bomb" ? "#ff5555" : "#fff1a8", 15);
    if (item.kind === "bomb") { loseLife(item.x, "💥 BÙM!"); return; }
    if (item.kind === "heart") { if (g.lives < g.d.lives) g.lives++; text(item.x, item.y, "+1 MẠNG", "#e03131"); sound("power"); updateUI(); return; }
    if (item.kind === "magnet") { g.magnetUntil = g.elapsed + 7; powerText(item, "NAM CHÂM 7s"); return; }
    if (item.kind === "basket") { g.largeUntil = g.elapsed + 8; powerText(item, "RỔ TO 8s"); return; }
    if (item.kind === "snow") { g.snowUntil = g.elapsed + 7; powerText(item, "CHẬM LẠI 7s"); return; }
    const base = item.kind === "star" ? 50 : item.kind === "lucky" ? 20 + Math.floor(Math.random() * 10) * 20 : 10;
    g.combo++; g.maxCombo = Math.max(g.maxCombo, g.combo); const gained = base * multiplier(); g.score += gained; g.caught++; text(item.x, item.y, `+${gained}`, item.kind === "lucky" ? "#d9480f" : "#2b8a3e"); sound(item.kind === "star" || item.kind === "lucky" ? "bonus" : "catch"); updateUI();
  }
  function powerText(item, label) { text(item.x, item.y, label, "#1971c2"); sound("power"); updateUI(); }
  function missItem(item) { if (item.kind !== "fruit") return; game.missed++; loseLife(item.x, "TRƯỢT! −1 MẠNG"); }
  function loseLife(x, label) { const g = game; g.lives--; g.combo = 0; g.flash = .18; text(x, H - 125, label, "#e03131"); sound("hurt"); updateUI(); if (g.lives <= 0) endGame(); }
  function endGame() {
    game.active = false; if (game.score > best) { best = game.score; localStorage.setItem("gamevui-catch-best", best); ui.best.textContent = best; }
    const g = game; showOverlay("🏆", g.score >= best && g.score > 0 ? "Kỷ lục mới!" : "Hết lượt rồi!", `<div class="final">${g.score.toLocaleString("vi-VN")}</div><div class="final-sub">điểm · ${levels[g.level].name}</div><div class="results"><div><small>Đã hứng</small><b>${g.caught}</b></div><div><small>Combo cao nhất</small><b>${g.maxCombo}</b></div></div>`, [{ label: "Chơi lại", primary: true, action: () => newGame(g.level) }, { label: "Đổi độ khó", action: intro }]);
  }
  function updateParticles(dt) { for (const p of game.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 390 * dt; p.life -= dt; } game.particles = game.particles.filter((p) => p.life > 0); for (const t of game.texts) { t.y -= 35 * dt; t.life -= dt; } game.texts = game.texts.filter((t) => t.life > 0); }
  function pop(x, y, color, n) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 65 + Math.random() * 170; game.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 50, life: .55 + Math.random() * .25, color }); } }
  function text(x, y, value, color) { game.texts.push({ x, y, value, color, life: 1 }); }
  function draw() {
    drawGarden(); if (!game) return; ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); game.items.forEach(drawItem); drawBasket();
    game.particles.forEach((p) => { ctx.globalAlpha = Math.max(0, p.life * 1.4); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1;
    game.texts.forEach((t) => { ctx.globalAlpha = Math.min(1, t.life * 2); ctx.fillStyle = t.color; ctx.font = "800 26px 'Baloo 2', sans-serif"; ctx.textAlign = "center"; ctx.fillText(t.value, t.x, t.y); });
    if (game.elapsed < game.magnetUntil) badge("🧲 HÚT", "#1971c2", 18); if (game.elapsed < game.largeUntil) badge("🧺 RỔ TO", "#e67700", 56); if (game.elapsed < game.snowUntil) badge("❄️ CHẬM", "#1864ab", 94);
    if (game.flash) { ctx.fillStyle = `rgba(255,40,40,${game.flash * 1.3})`; ctx.fillRect(0, 0, W, H); } ctx.restore();
    if (game.paused) { ctx.fillStyle = "rgba(56,37,17,.44)"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#fffdf6"; ctx.textAlign = "center"; ctx.font = "800 48px 'Baloo 2', sans-serif"; ctx.fillText("TẠM DỪNG", W / 2, H / 2); ctx.textAlign = "left"; }
  }
  function drawGarden() {
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#8edcf5"); sky.addColorStop(.58, "#d5f4c4"); sky.addColorStop(1, "#80c65b"); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff3aa"; ctx.beginPath(); ctx.arc(88, 92, 48, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = .38; ctx.fillStyle = "#fff";
    [[225,100,62],[500,82,75],[390,180,43]].forEach(([x,y,r]) => { ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.arc(x+r*.7,y+8,r*.75,0,Math.PI*2); ctx.fill(); }); ctx.globalAlpha = 1; ctx.fillStyle = "#79bd53"; ctx.fillRect(0,H-135,W,135);
    tree(40,260,1.05); tree(637,242,1.18); tree(117,420,.76); tree(560,420,.72); ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(0,H-135,W,4);
  }
  function tree(x,y,s) { ctx.save(); ctx.translate(x,y); ctx.scale(s,s); ctx.fillStyle="#85501f"; ctx.fillRect(-15,105,30,188); ctx.fillStyle="#4c9c46"; [[0,70,88],[-52,112,56],[52,112,58],[0,10,64]].forEach(([px,py,r])=>{ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);ctx.fill();}); ctx.fillStyle="#e8590c"; [[-36,65],[28,81],[7,132],[-6,16]].forEach(([px,py])=>{ctx.beginPath();ctx.arc(px,py,9,0,Math.PI*2);ctx.fill();}); ctx.restore(); }
  function drawItem(item) { ctx.save(); ctx.translate(item.x,item.y); ctx.rotate(Math.sin(item.phase)*.08); ctx.font=`${item.radius*2}px serif`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(item.emoji,0,0); ctx.restore(); }
  function drawBasket() { const b=game.basket,y=H-72; ctx.save();ctx.translate(b.x,y); if(game.elapsed<game.magnetUntil){ctx.strokeStyle="rgba(44,130,201,.6)";ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,-10,b.width*.72,0,Math.PI*2);ctx.stroke();} ctx.fillStyle="#c87925";ctx.beginPath();ctx.moveTo(-b.width/2,0);ctx.lineTo(b.width/2,0);ctx.lineTo(b.width*.38,53);ctx.lineTo(-b.width*.38,53);ctx.closePath();ctx.fill();ctx.strokeStyle="#88420e";ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-b.width*.38,-6);ctx.quadraticCurveTo(0,-45,b.width*.38,-6);ctx.stroke();ctx.strokeStyle="rgba(255,218,132,.6)";ctx.lineWidth=4;[-.22,.22].forEach(n=>{ctx.beginPath();ctx.moveTo(n*b.width,6);ctx.lineTo(n*b.width*.75,45);ctx.stroke();});ctx.restore(); }
  function badge(label,color,y) { ctx.font="700 15px 'Be Vietnam Pro',sans-serif";const w=ctx.measureText(label).width+22;ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(W-w-16,y,w,27,13);ctx.fill();ctx.fillStyle="#fff";ctx.textAlign="center";ctx.fillText(label,W-w/2-16,y+19);ctx.textAlign="left"; }
  function clamp(v,min,max) { return Math.max(min,Math.min(max,v)); }
  function togglePause() { if (!game || !game.active) return; game.paused=!game.paused;ui.pause.textContent=game.paused?"▶ Tiếp tục":"⏸ Tạm dừng";last=performance.now(); }
  function sound(kind) { if(!soundOn)return;try{audio ||= new AudioContext();const o=audio.createOscillator(),g=audio.createGain(),s={catch:[620,.07,"sine"],bonus:[920,.16,"triangle"],power:[420,.14,"sine"],hurt:[130,.2,"sawtooth"]}[kind];o.type=s[2];o.frequency.setValueAtTime(s[0],audio.currentTime);if(kind==="bonus")o.frequency.exponentialRampToValueAtTime(1300,audio.currentTime+s[1]);g.gain.setValueAtTime(.09,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+s[1]);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+s[1]);}catch(_){}}
  function pointer(e) { if(!game||!game.active||game.paused)return;const r=canvas.getBoundingClientRect();game.basket.target=clamp((e.clientX-r.left)*W/r.width,70,W-70); }
  canvas.addEventListener("pointerdown",pointer);canvas.addEventListener("pointermove",e=>{if(e.buttons||e.pointerType==="touch")pointer(e);});
  document.addEventListener("keydown",e=>{if(["ArrowLeft","ArrowRight","KeyA","KeyD","KeyP","Escape"].includes(e.code))e.preventDefault();if(!game)return;if(e.code==="KeyP"||e.code==="Escape"){togglePause();return;}if(e.code==="ArrowLeft"||e.code==="KeyA")game.keys.left=true;if(e.code==="ArrowRight"||e.code==="KeyD")game.keys.right=true;});
  document.addEventListener("keyup",e=>{if(!game)return;if(e.code==="ArrowLeft"||e.code==="KeyA")game.keys.left=false;if(e.code==="ArrowRight"||e.code==="KeyD")game.keys.right=false;});
  ui.pause.addEventListener("click",togglePause);ui.restart.addEventListener("click",()=>game?newGame(game.level):intro());ui.sound.addEventListener("click",()=>{soundOn=!soundOn;ui.sound.textContent=soundOn?"🔊 Âm thanh":"🔇 Tắt tiếng";if(soundOn)sound("catch");});
  drawGarden(); intro();
})();
