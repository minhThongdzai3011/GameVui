const COLS = 10, ROWS = 20, SIZE = 30;
const boardCanvas = document.querySelector("#board"), ctx = boardCanvas.getContext("2d");
const nextCanvas = document.querySelector("#next"), nextCtx = nextCanvas.getContext("2d");
const holdCanvas = document.querySelector("#hold"), holdCtx = holdCanvas.getContext("2d");
const scoreEl = document.querySelector("#score"), linesEl = document.querySelector("#lines"), levelEl = document.querySelector("#level");
const overlay = document.querySelector("#overlay"), overlayTitle = document.querySelector("#overlayTitle"), overlayText = document.querySelector("#overlayText");
const SHAPES = { I:[[1,1,1,1]], O:[[1,1],[1,1]], T:[[0,1,0],[1,1,1]], S:[[0,1,1],[1,1,0]], Z:[[1,1,0],[0,1,1]], J:[[1,0,0],[1,1,1]], L:[[0,0,1],[1,1,1]] };
const COLORS = { I:"#39d8e6", O:"#ffd34d", T:"#ad72ec", S:"#57ca7a", Z:"#f26175", J:"#4f7eea", L:"#ff9b4d" };
let grid, bag, queue, active, held, holdUsed, score, lines, level, running, paused, last, dropTimer, animation;
const copy = (shape) => shape.map((row) => [...row]);
function randomBag() { return Object.keys(SHAPES).sort(() => Math.random() - .5); }
function refill() { while (queue.length < 6) queue.push(...randomBag()); }
function fresh(type) { const matrix = copy(SHAPES[type]); return { type, matrix, x:Math.floor((COLS - matrix[0].length) / 2), y:-1 }; }
function reset() { grid = Array.from({length:ROWS}, () => Array(COLS).fill("")); bag=[]; queue=[]; refill(); active=null; held=null; holdUsed=false; score=0; lines=0; level=1; running=false; paused=false; dropTimer=0; drawAll(); show("BLOCK DROP", "Xếp kín hàng để xoá chúng!", "BẮT ĐẦU"); }
function show(title,text,button) { overlayTitle.textContent=title; overlayText.textContent=text; document.querySelector("#start").textContent=button; overlay.hidden=false; }
function start() { if (running) return; running=true; paused=false; dropTimer=0; overlay.hidden=true; if (!active) spawn(); last=performance.now(); animation=requestAnimationFrame(loop); }
function spawn(type) { refill(); active=fresh(type || queue.shift()); refill(); holdUsed=false; if (collides(active)) gameOver(); }
function collides(piece, dx=0, dy=0, matrix=piece.matrix) { return matrix.some((row,y) => row.some((cell,x) => { if (!cell) return false; const px=piece.x+x+dx, py=piece.y+y+dy; return px<0 || px>=COLS || py>=ROWS || (py>=0 && grid[py][px]); })); }
function move(dx,dy) { if (!running || paused || !active || collides(active,dx,dy)) return false; active.x+=dx; active.y+=dy; return true; }
function rotate() { if (!running || paused || !active || active.type==="O") return; const rotated=active.matrix[0].map((_,x) => active.matrix.map(row => row[x]).reverse()); for (const kick of [0,-1,1,-2,2]) if (!collides(active,kick,0,rotated)) { active.matrix=rotated; active.x+=kick; return; } }
function lock() { active.matrix.forEach((row,y) => row.forEach((cell,x) => { const py=active.y+y; if (cell && py>=0) grid[py][active.x+x]=active.type; })); clearRows(); spawn(); }
function clearRows() { let count=0; grid=grid.filter(row => { if (row.every(Boolean)) { count++; return false; } return true; }); while(grid.length<ROWS) grid.unshift(Array(COLS).fill("")); if(count) { score += [0,100,300,500,800][count]*level; lines+=count; level=Math.floor(lines/10)+1; } }
function hardDrop() { if (!running || paused) return; let distance=0; while(move(0,1)) distance++; score+=distance*2; lock(); }
function hold() { if (!running || paused || holdUsed) return; const current=active.type; if (held) { active=fresh(held); held=current; if(collides(active)) return gameOver(); } else { held=current; spawn(); } holdUsed=true; }
function gameOver() { running=false; cancelAnimationFrame(animation); show("GAME OVER", `Điểm của bạn: ${score}`, "CHƠI LẠI"); }
function loop(now) { const delta=now-last; last=now; if(!paused) { dropTimer+=delta; const speed=Math.max(90,800-(level-1)*65); if(dropTimer>speed) { if(!move(0,1)) lock(); dropTimer=0; } } drawAll(); if(running) animation=requestAnimationFrame(loop); }
function drawCell(context,x,y,color,size=SIZE,alpha=1) { context.globalAlpha=alpha; context.fillStyle=color; context.fillRect(x*size+1,y*size+1,size-2,size-2); context.fillStyle="#ffffff55"; context.fillRect(x*size+3,y*size+3,size-7,3); context.globalAlpha=1; }
function drawBoard() { ctx.fillStyle="#111733"; ctx.fillRect(0,0,300,600); for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) { ctx.strokeStyle="#ffffff0c"; ctx.strokeRect(x*SIZE,y*SIZE,SIZE,SIZE); if(grid[y][x]) drawCell(ctx,x,y,COLORS[grid[y][x]]); } if(active) { let ghostY=active.y; while(!collides({...active,y:ghostY},0,1)) ghostY++; active.matrix.forEach((row,y)=>row.forEach((cell,x)=>{ if(cell && ghostY+y>=0) drawCell(ctx,active.x+x,ghostY+y,COLORS[active.type],SIZE,.18); })); active.matrix.forEach((row,y)=>row.forEach((cell,x)=>{ if(cell && active.y+y>=0) drawCell(ctx,active.x+x,active.y+y,COLORS[active.type]); })); } }
function drawMini(context,canvas,types) { context.clearRect(0,0,canvas.width,canvas.height); types.forEach((type,index)=>{ if(!type) return; const shape=SHAPES[type], size=18, offsetY=index*82+10, offsetX=(canvas.width-shape[0].length*size)/2; shape.forEach((row,y)=>row.forEach((cell,x)=>{ if(cell) { context.fillStyle=COLORS[type]; context.fillRect(offsetX+x*size,offsetY+y*size,size-2,size-2); } })); }); }
function drawAll() { drawBoard(); drawMini(nextCtx,nextCanvas,queue.slice(0,3)); drawMini(holdCtx,holdCanvas,[held]); scoreEl.textContent=score; linesEl.textContent=lines; levelEl.textContent=level; }
function action(name) { if(name==="left") move(-1,0); if(name==="right") move(1,0); if(name==="down" && move(0,1)) score++; if(name==="rotate") rotate(); if(name==="drop") hardDrop(); if(name==="hold") hold(); drawAll(); }
document.addEventListener("keydown",event=>{ const map={ArrowLeft:"left",ArrowRight:"right",ArrowDown:"down",ArrowUp:"rotate",z:"rotate",Z:"rotate",c:"hold",C:"hold",Space:"drop"}; if(map[event.key]||event.code==="Space") { event.preventDefault(); action(event.code==="Space"?"drop":map[event.key]); } if(event.key==="Escape") togglePause(); });
document.querySelectorAll("[data-action]").forEach(button=>{ const name=button.dataset.action; let repeat; button.addEventListener("pointerdown",event=>{ event.preventDefault(); action(name); if(["left","right","down"].includes(name)) repeat=setInterval(()=>action(name),105); }); ["pointerup","pointerleave","pointercancel"].forEach(type=>button.addEventListener(type,()=>clearInterval(repeat))); });
function togglePause() { if(!running) return; paused=!paused; if(paused) show("TẠM DỪNG", "Bấm nút tiếp tục để chơi.", "TIẾP TỤC"); else { overlay.hidden=true; last=performance.now(); } }
document.querySelector("#pause").addEventListener("click",togglePause);
document.querySelector("#start").addEventListener("click",()=>{ if(!running && overlayTitle.textContent==="GAME OVER") reset(); if(paused) { paused=false; overlay.hidden=true; last=performance.now(); } else start(); });
document.querySelector("#restart").addEventListener("click",()=>{ cancelAnimationFrame(animation); reset(); });
reset();
