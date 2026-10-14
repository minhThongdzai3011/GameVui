// Cờ Vua — đủ luật: nhập thành, bắt tốt qua đường, phong cấp (chọn quân),
// chiếu hết, hết nước (hòa), lặp lại 3 lần, luật 50 nước, không đủ quân chiếu
// hết. Chơi với máy (AI alpha-beta trong Web Worker, có sách khai cuộc nhỏ)
// hoặc hai người; kéo thả hoặc bấm để đi quân; ván đang chơi được lưu.
(() => {
  "use strict";

  // =====================================================================
  // Engine: tự chứa hoàn toàn để chạy được cả trong Web Worker.
  // Bàn: mảng 64 ô, chỉ số = hàng*8 + cột, hàng 0 là hàng 8 (phía Đen).
  // Quân theo FEN: chữ hoa = Trắng. Nước đi mã hoá số nguyên:
  // from | to<<6 | phong<<12 (1 N, 2 B, 3 R, 4 Q) | cờ<<15 (1 bắt qua đường,
  // 2 nhập thành, 4 tốt đi 2 ô).
  // =====================================================================
  function Engine() {
    const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const FILES = "abcdefgh";
    const isW = (p) => p.charCodeAt(0) < 97;
    const sqName = (i) => FILES[i & 7] + (8 - (i >> 3));
    const sqIndex = (s) => (8 - Number(s[1])) * 8 + FILES.indexOf(s[0]);
    const PROMO = "?nbrq";

    function parseFEN(fen) {
      const [pos, t, cas, ep, h] = fen.split(" ");
      const b = [];
      for (const ch of pos) {
        if (ch === "/") continue;
        if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) b.push("");
        else b.push(ch);
      }
      let c = 0;
      if (cas.includes("K")) c |= 1;
      if (cas.includes("Q")) c |= 2;
      if (cas.includes("k")) c |= 4;
      if (cas.includes("q")) c |= 8;
      return { b, w: t === "w", c, ep: ep === "-" ? -1 : sqIndex(ep), h: Number(h) || 0 };
    }

    const N_OFF = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];
    const K_OFF = [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ];
    const ORTH = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const DIAG = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    const on = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

    // Ô `sq` có bị bên `byW` tấn công không
    function attacked(b, sq, byW) {
      const r = sq >> 3;
      const c = sq & 7;
      const pr = byW ? r + 1 : r - 1;
      const P = byW ? "P" : "p";
      if (on(pr, c - 1) && b[pr * 8 + c - 1] === P) return true;
      if (on(pr, c + 1) && b[pr * 8 + c + 1] === P) return true;
      const N = byW ? "N" : "n";
      for (const [dr, dc] of N_OFF) if (on(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === N) return true;
      const K = byW ? "K" : "k";
      for (const [dr, dc] of K_OFF) if (on(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === K) return true;
      const R = byW ? "R" : "r";
      const B = byW ? "B" : "b";
      const Q = byW ? "Q" : "q";
      for (const [dirs, S] of [
        [ORTH, R],
        [DIAG, B],
      ])
        for (const [dr, dc] of dirs) {
          let rr = r + dr;
          let cc = c + dc;
          while (on(rr, cc)) {
            const q = b[rr * 8 + cc];
            if (q) {
              if (q === S || q === Q) return true;
              break;
            }
            rr += dr;
            cc += dc;
          }
        }
      return false;
    }

    function inCheck(s, w) {
      const k = s.b.indexOf(w ? "K" : "k");
      return k < 0 || attacked(s.b, k, !w);
    }

    function gen(s, capsOnly) {
      const { b, w } = s;
      const out = [];
      for (let i = 0; i < 64; i++) {
        const p = b[i];
        if (!p || isW(p) !== w) continue;
        const r = i >> 3;
        const c = i & 7;
        const t = p.toLowerCase();
        if (t === "p") {
          const dir = w ? -1 : 1;
          const promoRow = w ? 0 : 7;
          const addP = (to, flag = 0) => {
            if (to >> 3 === promoRow) {
              for (let k = 4; k >= 1; k--) if (!capsOnly || k === 4) out.push(i | (to << 6) | (k << 12) | (flag << 15));
            } else out.push(i | (to << 6) | (flag << 15));
          };
          const one = (r + dir) * 8 + c;
          if (on(r + dir, c) && !b[one]) {
            if (!capsOnly || (r + dir) === promoRow) addP(one);
            const two = (r + 2 * dir) * 8 + c;
            if (!capsOnly && r === (w ? 6 : 1) && !b[two]) out.push(i | (two << 6) | (4 << 15));
          }
          for (const dc of [-1, 1]) {
            if (!on(r + dir, c + dc)) continue;
            const to = (r + dir) * 8 + c + dc;
            if (b[to] && isW(b[to]) !== w) addP(to);
            else if (to === s.ep) out.push(i | (to << 6) | (1 << 15));
          }
          continue;
        }
        const step = (offs) => {
          for (const [dr, dc] of offs) {
            if (!on(r + dr, c + dc)) continue;
            const to = (r + dr) * 8 + c + dc;
            const q = b[to];
            if (q ? isW(q) !== w : !capsOnly) out.push(i | (to << 6));
          }
        };
        const slide = (dirs) => {
          for (const [dr, dc] of dirs) {
            let rr = r + dr;
            let cc = c + dc;
            while (on(rr, cc)) {
              const to = rr * 8 + cc;
              const q = b[to];
              if (q) {
                if (isW(q) !== w) out.push(i | (to << 6));
                break;
              }
              if (!capsOnly) out.push(i | (to << 6));
              rr += dr;
              cc += dc;
            }
          }
        };
        if (t === "n") step(N_OFF);
        else if (t === "b") slide(DIAG);
        else if (t === "r") slide(ORTH);
        else if (t === "q") {
          slide(ORTH);
          slide(DIAG);
        } else if (t === "k") {
          step(K_OFF);
          if (capsOnly) continue;
          // nhập thành: vua và các ô đi qua không bị chiếu
          const home = w ? 60 : 4;
          if (i !== home) continue;
          const R = w ? "R" : "r";
          const ks = w ? 1 : 4;
          const qs = w ? 2 : 8;
          if (s.c & ks && !b[home + 1] && !b[home + 2] && b[home + 3] === R)
            if (!attacked(b, home, !w) && !attacked(b, home + 1, !w) && !attacked(b, home + 2, !w))
              out.push(i | ((home + 2) << 6) | (2 << 15));
          if (s.c & qs && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === R)
            if (!attacked(b, home, !w) && !attacked(b, home - 1, !w) && !attacked(b, home - 2, !w))
              out.push(i | ((home - 2) << 6) | (2 << 15));
        }
      }
      return out;
    }

    // Mất quyền nhập thành khi vua/xe rời chỗ hoặc xe bị ăn
    const CR = new Array(64).fill(15);
    CR[60] = 15 & ~3;
    CR[63] = 15 & ~1;
    CR[56] = 15 & ~2;
    CR[4] = 15 & ~12;
    CR[7] = 15 & ~4;
    CR[0] = 15 & ~8;

    function make(s, m) {
      const b = s.b;
      const f = m & 63;
      const t = (m >> 6) & 63;
      const pr = (m >> 12) & 7;
      const fl = m >> 15;
      const p = b[f];
      const u = { cap: b[t], c: s.c, ep: s.ep, h: s.h };
      b[t] = pr ? (s.w ? PROMO[pr].toUpperCase() : PROMO[pr]) : p;
      b[f] = "";
      if (fl & 1) {
        const capSq = t + (s.w ? 8 : -8);
        u.cap = b[capSq];
        b[capSq] = "";
      }
      if (fl & 2) {
        if (t === 62) [b[61], b[63]] = [b[63], ""];
        else if (t === 58) [b[59], b[56]] = [b[56], ""];
        else if (t === 6) [b[5], b[7]] = [b[7], ""];
        else if (t === 2) [b[3], b[0]] = [b[0], ""];
      }
      s.ep = fl & 4 ? (f + t) >> 1 : -1;
      s.c &= CR[f] & CR[t];
      s.h = p === "P" || p === "p" || u.cap ? 0 : s.h + 1;
      s.w = !s.w;
      return u;
    }

    function unmake(s, m, u) {
      const b = s.b;
      s.w = !s.w;
      const f = m & 63;
      const t = (m >> 6) & 63;
      const pr = (m >> 12) & 7;
      const fl = m >> 15;
      b[f] = pr ? (s.w ? "P" : "p") : b[t];
      if (fl & 1) {
        b[t] = "";
        b[t + (s.w ? 8 : -8)] = u.cap;
      } else b[t] = u.cap;
      if (fl & 2) {
        if (t === 62) [b[63], b[61]] = [b[61], ""];
        else if (t === 58) [b[56], b[59]] = [b[59], ""];
        else if (t === 6) [b[7], b[5]] = [b[5], ""];
        else if (t === 2) [b[0], b[3]] = [b[3], ""];
      }
      s.c = u.c;
      s.ep = u.ep;
      s.h = u.h;
    }

    function legal(s) {
      const out = [];
      for (const m of gen(s, false)) {
        const u = make(s, m);
        if (!inCheck(s, !s.w)) out.push(m);
        unmake(s, m, u);
      }
      return out;
    }

    // ---------- Đánh giá thế cờ ----------
    // Nền: bảng vị trí của Tomasz Michniewski; thêm cấu trúc tốt, xe cột mở,
    // độ linh hoạt của quân, lá chắn tốt quanh vua và dồn vua khi tàn cuộc.
    const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
    /* prettier-ignore */
    const PST = {
      p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
          0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
      n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30,
          -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
      b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10,
          -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
      r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
          -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
      q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5,
          0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
      k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
          -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
      ke: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30,
           -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50],
    };
    // thưởng tốt thông theo hàng (chỉ số hàng nhìn từ phía Trắng, 1 = sắp phong cấp)
    const PASSED = [0, 110, 75, 45, 28, 16, 10, 0];
    const MOB = { n: 4, b: 5, r: 3, q: 1 };

    function mobility(b, i, t, w) {
      const r = i >> 3;
      const c = i & 7;
      let n = 0;
      if (t === "n") {
        for (const [dr, dc] of N_OFF) {
          if (!on(r + dr, c + dc)) continue;
          const q = b[(r + dr) * 8 + c + dc];
          if (!q || isW(q) !== w) n++;
        }
        return n;
      }
      const dirs = t === "b" ? DIAG : t === "r" ? ORTH : K_OFF;
      for (const [dr, dc] of dirs) {
        let rr = r + dr;
        let cc = c + dc;
        while (on(rr, cc)) {
          const q = b[rr * 8 + cc];
          if (q) {
            if (isW(q) !== w) n++;
            break;
          }
          n++;
          rr += dr;
          cc += dc;
        }
      }
      return n;
    }
    function isPassed(b, i, w) {
      const r = i >> 3;
      const c = i & 7;
      const e = w ? "p" : "P";
      for (let rr = w ? r - 1 : r + 1; w ? rr >= 1 : rr <= 6; rr += w ? -1 : 1)
        for (let cc = Math.max(0, c - 1); cc <= Math.min(7, c + 1); cc++) if (b[rr * 8 + cc] === e) return false;
      return true;
    }
    // lá chắn tốt trước vua (chỉ khi vua còn ở hai hàng cuối)
    function shield(b, k, w) {
      if (k < 0) return 0;
      const kr = k >> 3;
      const kc = k & 7;
      if (w ? kr < 6 : kr > 1) return -20;
      const P = w ? "P" : "p";
      let s = 0;
      for (let cc = Math.max(0, kc - 1); cc <= Math.min(7, kc + 1); cc++) {
        if (on(kr + (w ? -1 : 1), cc) && b[(kr + (w ? -1 : 1)) * 8 + cc] === P) s += 14;
        else if (on(kr + (w ? -2 : 2), cc) && b[(kr + (w ? -2 : 2)) * 8 + cc] === P) s += 6;
        else s -= 10;
      }
      return s;
    }

    function evaluate(s) {
      const b = s.b;
      const pf = [new Int8Array(8), new Int8Array(8)];
      let npm = 0;
      let wb = 0;
      let bb = 0;
      let wk = -1;
      let bk = -1;
      let wMat = 0;
      let bMat = 0;
      for (let i = 0; i < 64; i++) {
        const p = b[i];
        if (!p) continue;
        const w = isW(p);
        const t = w ? p.toLowerCase() : p;
        if (t === "p") pf[w ? 0 : 1][i & 7]++;
        else if (t !== "k") npm += VAL[t];
        if (t === "b") w ? wb++ : bb++;
        if (t === "k") w ? (wk = i) : (bk = i);
        else if (w) wMat += VAL[t];
        else bMat += VAL[t];
      }
      const endgame = npm <= 1400;
      let score = 0;
      for (let i = 0; i < 64; i++) {
        const p = b[i];
        if (!p) continue;
        const w = isW(p);
        const t = w ? p.toLowerCase() : p;
        const idx = w ? i : i ^ 56;
        const c = i & 7;
        let v = VAL[t] + (t === "k" && endgame ? PST.ke[idx] : PST[t][idx]);
        if (t === "p") {
          const own = pf[w ? 0 : 1];
          if (own[c] > 1) v -= 12;
          if ((c === 0 || !own[c - 1]) && (c === 7 || !own[c + 1])) v -= 14;
          if (isPassed(b, i, w)) v += endgame ? PASSED[idx >> 3] * 1.7 : PASSED[idx >> 3];
          if (endgame) v += (7 - (idx >> 3)) * 6;
        } else if (t !== "k") {
          v += mobility(b, i, t, w) * MOB[t];
          if (t === "r") {
            const own = pf[w ? 0 : 1];
            const opp = pf[w ? 1 : 0];
            if (!own[c]) v += opp[c] ? 12 : 24;
          }
        }
        score += w ? v : -v;
      }
      if (wb >= 2) score += 30;
      if (bb >= 2) score -= 30;
      if (!endgame) score += shield(b, wk, true) - shield(b, bk, false);
      // tàn cuộc thắng thế: dồn vua đối phương ra mép và áp sát để chiếu hết
      if (endgame && wk >= 0 && bk >= 0 && Math.abs(wMat - bMat) >= 300) {
        const strongW = wMat > bMat;
        const loser = strongW ? bk : wk;
        const lr = loser >> 3;
        const lc = loser & 7;
        const edge = Math.max(3 - lr, lr - 4) + Math.max(3 - lc, lc - 4);
        const dist = Math.abs((wk >> 3) - (bk >> 3)) + Math.abs((wk & 7) - (bk & 7));
        const bonus = edge * 12 + (14 - dist) * 5;
        score += strongW ? bonus : -bonus;
      }
      return score + (s.w ? 10 : -10); // lợi thế được đi
    }

    // ---------- Băm Zobrist: mỗi thế cờ có một "dấu vân tay" 64-bit ----------
    let seed = 0x2f6b4a1d;
    const rnd = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed | 0;
    };
    const PIDX = { P: 0, N: 1, B: 2, R: 3, Q: 4, K: 5, p: 6, n: 7, b: 8, r: 9, q: 10, k: 11 };
    const ZA = Int32Array.from({ length: 768 }, rnd);
    const ZB = Int32Array.from({ length: 768 }, rnd);
    const CA = Int32Array.from({ length: 16 }, rnd);
    const CB = Int32Array.from({ length: 16 }, rnd);
    const EA = Int32Array.from({ length: 8 }, rnd);
    const EB = Int32Array.from({ length: 8 }, rnd);
    const SA = rnd();
    const SB = rnd();
    let hB = 0; // nửa thứ hai của khoá băm, trả kèm qua biến
    function hash(s) {
      let a = 0;
      let bb = 0;
      for (let i = 0; i < 64; i++) {
        const p = s.b[i];
        if (!p) continue;
        const k = PIDX[p] * 64 + i;
        a ^= ZA[k];
        bb ^= ZB[k];
      }
      if (!s.w) {
        a ^= SA;
        bb ^= SB;
      }
      a ^= CA[s.c];
      bb ^= CB[s.c];
      if (s.ep >= 0) {
        a ^= EA[s.ep & 7];
        bb ^= EB[s.ep & 7];
      }
      hB = bb;
      return a;
    }
    const key = (s) => hash(s) + ":" + hB;

    // ---------- Bảng ghi nhớ (transposition table) ----------
    const TT_SIZE = 1 << 19;
    const TT_MASK = TT_SIZE - 1;
    let ttA = null;
    let ttB;
    let ttS;
    let ttM;
    let ttD;
    let ttF; // 1 chính xác, 2 cận dưới, 3 cận trên
    function allocTT() {
      if (ttA) return;
      ttA = new Int32Array(TT_SIZE);
      ttB = new Int32Array(TT_SIZE);
      ttS = new Int32Array(TT_SIZE);
      ttM = new Int32Array(TT_SIZE);
      ttD = new Int8Array(TT_SIZE);
      ttF = new Int8Array(TT_SIZE);
    }

    // ---------- Tìm kiếm ----------
    const MATE = 100000;
    const INF = 1e9;
    let nodes = 0;
    let deadline = 0;
    let stop = false;
    let hist = new Int32Array(1 << 18);
    let killers = [];
    const pathA = new Int32Array(256);
    const pathB = new Int32Array(256);
    let gameKeys = new Set();

    const isCap = (s, m) => !!s.b[(m >> 6) & 63] || (m >> 15) & 1;
    function order(s, ms, ply, ttMove = 0) {
      const b = s.b;
      const k = killers[ply] || [];
      const sc = ms.map((m) => {
        if (m === ttMove) return 1e7;
        const t = (m >> 6) & 63;
        const pr = (m >> 12) & 7;
        if (b[t]) return 1e6 + VAL[b[t].toLowerCase()] * 10 - VAL[b[m & 63].toLowerCase()] / 10;
        if (pr === 4) return 9.5e5;
        if (m === k[0]) return 9e5;
        if (m === k[1]) return 8e5;
        return hist[m & 0x3ffff];
      });
      return ms
        .map((_, i) => i)
        .sort((a, c) => sc[c] - sc[a])
        .map((i) => ms[i]);
    }

    function qs(s, alpha, beta, ply) {
      if ((++nodes & 2047) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      const stand = evaluate(s) * (s.w ? 1 : -1);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      if (ply > 40) return stand;
      for (const m of order(s, gen(s, true), ply)) {
        // bỏ qua nước ăn quân chắc chắn không đủ kéo điểm lên alpha (delta pruning)
        const t = (m >> 6) & 63;
        const gain = s.b[t] ? VAL[s.b[t].toLowerCase()] : 100;
        if (stand + gain + 200 < alpha && !((m >> 12) & 7)) continue;
        const u = make(s, m);
        if (inCheck(s, !s.w)) {
          unmake(s, m, u);
          continue;
        }
        const v = -qs(s, -beta, -alpha, ply + 1);
        unmake(s, m, u);
        if (stop) return 0;
        if (v >= beta) return v;
        if (v > alpha) alpha = v;
      }
      return alpha;
    }

    function hasPieces(s, w) {
      for (const p of s.b) if (p && isW(p) === w && "nbrqNBRQ".includes(p)) return true;
      return false;
    }

    function negamax(s, depth, alpha, beta, ply, allowNull) {
      if ((++nodes & 2047) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      const a = hash(s);
      const bkey = hB;
      pathA[ply] = a;
      pathB[ply] = bkey;
      if (s.h >= 100) return 0;
      // lặp lại thế cờ → coi như hòa
      for (let p = ply - 2; p >= 0; p -= 2) if (pathA[p] === a && pathB[p] === bkey) return 0;
      if (gameKeys.has(a + ":" + bkey)) return 0;

      const chk = inCheck(s, s.w);
      if (chk && ply < 60) depth++; // gia hạn khi bị chiếu
      if (depth <= 0) return qs(s, alpha, beta, ply);

      // tra bảng ghi nhớ
      const idx = a & TT_MASK;
      let ttMove = 0;
      if (ttF[idx] && ttA[idx] === a && ttB[idx] === bkey) {
        ttMove = ttM[idx];
        if (ttD[idx] >= depth) {
          let v = ttS[idx];
          if (v > MATE - 1000) v -= ply;
          else if (v < -MATE + 1000) v += ply;
          const f = ttF[idx];
          if (f === 1 || (f === 2 && v >= beta) || (f === 3 && v <= alpha)) return v;
        }
      }

      const pvNode = beta - alpha > 1;
      if (!chk && !pvNode) {
        const ev = evaluate(s) * (s.w ? 1 : -1);
        // điểm tĩnh đã vượt xa beta ở độ sâu nhỏ → cắt luôn
        if (depth <= 3 && ev - 110 * depth >= beta) return ev;
        // nước bỏ lượt: cho đối thủ đi 2 lần mà vẫn ≥ beta thì nhánh này quá tốt
        if (allowNull && depth >= 3 && ev >= beta && hasPieces(s, s.w)) {
          const ep = s.ep;
          s.w = !s.w;
          s.ep = -1;
          const v = -negamax(s, depth - 1 - (depth > 6 ? 3 : 2), -beta, -beta + 1, ply + 1, false);
          s.w = !s.w;
          s.ep = ep;
          if (stop) return 0;
          if (v >= beta) return v > MATE - 1000 ? beta : v;
        }
      }

      const alpha0 = alpha;
      let best = -INF;
      let bestMove = 0;
      let count = 0;
      for (const m of order(s, gen(s, false), ply, ttMove)) {
        const quiet = !isCap(s, m) && !((m >> 12) & 7);
        const u = make(s, m);
        if (inCheck(s, !s.w)) {
          unmake(s, m, u);
          continue;
        }
        count++;
        const givesCheck = inCheck(s, s.w);
        let v;
        if (count === 1) v = -negamax(s, depth - 1, -beta, -alpha, ply + 1, true);
        else {
          // nước xếp sau, im lặng → tính nông hơn trước (late move reduction)
          const R = depth >= 3 && count > 3 && quiet && !chk && !givesCheck ? (count > 10 ? 2 : 1) : 0;
          v = -negamax(s, depth - 1 - R, -alpha - 1, -alpha, ply + 1, true);
          if (v > alpha && R && !stop) v = -negamax(s, depth - 1, -alpha - 1, -alpha, ply + 1, true);
          if (v > alpha && v < beta && !stop) v = -negamax(s, depth - 1, -beta, -alpha, ply + 1, true);
        }
        unmake(s, m, u);
        if (stop) return 0;
        if (v > best) {
          best = v;
          bestMove = m;
        }
        if (v > alpha) {
          alpha = v;
          if (alpha >= beta) {
            if (quiet) {
              const k = killers[ply] || (killers[ply] = []);
              if (k[0] !== m) {
                k[1] = k[0];
                k[0] = m;
              }
              hist[m & 0x3ffff] += depth * depth;
            }
            break;
          }
        }
      }
      if (!count) return chk ? -MATE + ply : 0; // chiếu hết / hết nước (hòa)

      // ghi vào bảng (điểm chiếu hết lưu theo khoảng cách từ nút này)
      if (depth >= ttD[idx] || ttA[idx] !== a) {
        let v = best;
        if (v > MATE - 1000) v += ply;
        else if (v < -MATE + 1000) v -= ply;
        ttA[idx] = a;
        ttB[idx] = bkey;
        ttS[idx] = v;
        ttM[idx] = bestMove;
        ttD[idx] = Math.min(depth, 127);
        ttF[idx] = best >= beta ? 2 : best > alpha0 ? 1 : 3;
      }
      return best;
    }

    // Sách khai cuộc nhỏ để máy đi đa dạng, đúng bài ở vài nước đầu
    const BOOK = {
      "": ["e2e4", "d2d4", "c2c4", "g1f3"],
      e2e4: ["e7e5", "c7c5", "e7e6", "c7c6"],
      d2d4: ["d7d5", "g8f6"],
      c2c4: ["e7e5", "g8f6", "c7c5"],
      g1f3: ["d7d5", "g8f6"],
      "e2e4 e7e5": ["g1f3"],
      "e2e4 e7e5 g1f3": ["b8c6"],
      "e2e4 e7e5 g1f3 b8c6": ["f1b5", "f1c4", "d2d4"],
      "e2e4 c7c5": ["g1f3", "b1c3"],
      "e2e4 c7c5 g1f3": ["d7d6", "b8c6", "e7e6"],
      "e2e4 e7e6": ["d2d4"],
      "e2e4 e7e6 d2d4": ["d7d5"],
      "e2e4 c7c6": ["d2d4"],
      "e2e4 c7c6 d2d4": ["d7d5"],
      "d2d4 d7d5": ["c2c4"],
      "d2d4 d7d5 c2c4": ["e7e6", "c7c6"],
      "d2d4 g8f6": ["c2c4"],
      "d2d4 g8f6 c2c4": ["e7e6", "g7g6"],
      "c2c4 e7e5": ["b1c3"],
      "g1f3 d7d5": ["d2d4"],
    };
    const uci = (m) => sqName(m & 63) + sqName((m >> 6) & 63) + ((m >> 12) & 7 ? PROMO[(m >> 12) & 7] : "");

    const LEVELS = {
      easy: { depth: 1, time: 500, noise: 160, book: false },
      medium: { depth: 3, time: 1200, noise: 30, book: true },
      hard: { depth: 64, time: 3000, noise: 0, book: true },
    };

    // opts: { level | cfg: {depth, time, noise, blunder, book}, line, keys }
    function search(state, opts = {}) {
      if (typeof opts === "string") opts = { level: opts };
      const cfg = opts.cfg || LEVELS[opts.level] || LEVELS.medium;
      const s = { ...state, b: state.b.slice() };
      allocTT();
      let root = legal(s);
      if (!root.length) return -1;
      if (root.length === 1) return root[0];
      if (cfg.book && opts.line != null && BOOK[opts.line] !== undefined) {
        const opts2 = BOOK[opts.line].map((u) => root.find((m) => uci(m) === u)).filter((m) => m !== undefined);
        if (opts2.length) return opts2[Math.floor(Math.random() * opts2.length)];
      }
      if (cfg.blunder && Math.random() < cfg.blunder) return root[Math.floor(Math.random() * root.length)];
      gameKeys = new Set(opts.keys || []);
      nodes = 0;
      stop = false;
      deadline = Date.now() + cfg.time;
      hist = new Int32Array(1 << 18);
      killers = [];
      const ra = hash(s);
      pathA[0] = ra;
      pathB[0] = hB;
      const ttm = ttA[ra & TT_MASK] === ra ? ttM[ra & TT_MASK] : 0;
      root = order(s, root, 0, ttm);
      let best = root[0];
      let scores = null;
      for (let d = 1; d <= cfg.depth; d++) {
        const sc = new Map();
        let alpha = -INF;
        let cur = -1;
        for (const m of root) {
          const u = make(s, m);
          let v;
          if (cfg.noise || cur < 0) v = -negamax(s, d - 1, -INF, cfg.noise ? INF : -alpha, 1, true);
          else {
            v = -negamax(s, d - 1, -alpha - 1, -alpha, 1, true);
            if (v > alpha && !stop) v = -negamax(s, d - 1, -INF, -alpha, 1, true);
          }
          unmake(s, m, u);
          if (stop) break;
          sc.set(m, v);
          if (v > alpha) {
            alpha = v;
            cur = m;
          }
        }
        if (stop) {
          // nước đầu luôn là nước tốt nhất vòng trước; nước khác chỉ thay khi đã chứng minh hơn
          if (cur >= 0 && !cfg.noise) best = cur;
          break;
        }
        best = cur;
        scores = sc;
        root = root.slice().sort((x, y) => (sc.get(y) ?? -INF) - (sc.get(x) ?? -INF));
        if (Math.abs(alpha) > MATE - 1000) break;
        if (Date.now() > deadline - cfg.time * 0.45) break; // không kịp xong vòng sau
      }
      if (cfg.noise && scores) {
        let pick = best;
        let top = -INF;
        const bestScore = scores.get(best);
        for (const [m, v] of scores) {
          if (v < -MATE + 1000 && bestScore > -MATE + 1000) continue; // không tự đi vào thế bị chiếu hết
          const r = v + Math.random() * cfg.noise;
          if (r > top) {
            top = r;
            pick = m;
          }
        }
        best = pick;
      }
      return best;
    }

    return { START, parseFEN, isW, sqName, uci, legal, make, unmake, inCheck, search, gen, key };
  }

  // =====================================================================
  // Giao diện
  // =====================================================================
  const E = Engine();
  const $ = (s) => document.querySelector(s);
  const boardEl = $("#board");
  const piecesEl = $("#pieces");
  const marksEl = $("#marks");

  // 2 lớp ký hiệu: lớp đặc (tô màu quân) + lớp viền (nét vẽ); ︎ ép dạng chữ, không phải emoji
  const FILL = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
  const LINE = { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" };
  const VS = "︎";
  const LEVEL_NAME = { easy: "Dễ", medium: "Vừa", hard: "Khó" };
  const THEMES = ["green", "wood", "blue"];
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  // ---------- Cày điểm: hệ Elo, máy mạnh dần theo điểm người chơi ----------
  const RANK_KEY = "gamevui-chess-rank";
  const RANK_START = { rating: 900, games: 0, w: 0, d: 0, l: 0, peak: 900, bot: null, lastBot: null, side: "w" };
  let rank = { ...RANK_START };
  try {
    rank = { ...rank, ...JSON.parse(localStorage.getItem(RANK_KEY) || "{}") };
  } catch {
    /* dữ liệu hỏng: dùng mặc định */
  }
  const saveRank = () => {
    try {
      localStorage.setItem(RANK_KEY, JSON.stringify(rank));
    } catch {
      /* bỏ qua */
    }
  };
  const TITLES = [
    [0, "Tập sự", "🌱"],
    [800, "Nghiệp dư", "♙"],
    [1100, "Kỳ thủ", "♘"],
    [1400, "Cao thủ", "♗"],
    [1700, "Kiện tướng", "♖"],
    [2000, "Đại kiện tướng", "♕"],
    [2300, "Huyền thoại", "♔"],
  ];
  const BOTS = [
    [0, "Bé Tập Đi", "🐣"],
    [700, "Gấu Con", "🐻"],
    [1000, "Cáo Lanh Lợi", "🦊"],
    [1300, "Sói Xám", "🐺"],
    [1600, "Đại Bàng", "🦅"],
    [1900, "Rồng Lửa", "🐉"],
    [2200, "Thần Cờ", "👑"],
  ];
  const tierOf = (list, r) => list.filter((t) => r >= t[0]).pop();
  const kFactor = () => (rank.games < 20 ? 40 : 24); // 20 ván đầu lên/xuống nhanh hơn
  const expected = (me, opp) => 1 / (1 + 10 ** ((opp - me) / 400));
  const eloDelta = (score) => Math.round(kFactor() * (score - expected(rank.rating, rank.bot)));
  // Sức máy theo Elo: tính càng sâu, càng lâu, càng ít "lơ đễnh" khi điểm càng cao
  function botCfg(elo) {
    const t = Math.min(1, Math.max(0, (elo - 300) / 1900));
    return {
      depth: elo < 600 ? 1 : elo < 900 ? 2 : elo < 1200 ? 3 : elo < 1500 ? 4 : elo < 1800 ? 6 : 64,
      time: Math.min(6000, Math.round(250 + 3750 * t * t + Math.max(0, elo - 2200) * 5)),
      noise: Math.round(260 * (1 - t) ** 2),
      blunder: elo < 900 ? (0.18 * (900 - elo)) / 600 : 0,
      book: elo >= 900,
    };
  }
  function pickBot() {
    // đối thủ ngang điểm bạn, lệch ngẫu nhiên ±60; luân phiên cầm Trắng/Đen
    rank.bot = Math.max(250, Math.round(rank.rating + Math.random() * 120 - 60));
    rank.side = rank.games % 2 ? "b" : "w";
    saveRank();
  }
  // ghi kết quả ván xếp hạng; score theo phía người chơi: 1 thắng, 0.5 hòa, 0 thua
  function settleRank(score) {
    const before = rank.rating;
    const d = eloDelta(score);
    const oldTitle = tierOf(TITLES, before);
    rank.rating = Math.max(100, before + d);
    rank.games++;
    if (score === 1) rank.w++;
    else if (score === 0) rank.l++;
    else rank.d++;
    rank.peak = Math.max(rank.peak, rank.rating);
    rank.lastBot = rank.bot; // giữ để vẫn hiện tên đối thủ sau ván
    rank.bot = null;
    saveRank();
    const newTitle = tierOf(TITLES, rank.rating);
    return { before, after: rank.rating, d, up: newTitle[0] > oldTitle[0] ? newTitle : null, down: newTitle[0] < oldTitle[0] };
  }

  // ---------- Lưu trữ ----------
  const KEY = "gamevui-chess";
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    saved = {};
  }
  const settings = { mode: "ai", level: "medium", side: "w", theme: "green", muted: false, ...(saved.settings || {}) };
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ settings, moves: history.map((h) => h.m) }));
    } catch {
      /* bỏ qua */
    }
  }

  // ---------- Âm thanh ----------
  let actx = null;
  function ac() {
    if (settings.muted) return null;
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        actx = new AC();
      } catch {
        return null;
      }
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
  function knock(vol = 0.5, freq = 1500, delay = 0) {
    const a = ac();
    if (!a) return;
    const t = a.currentTime + delay;
    const len = Math.floor(a.sampleRate * 0.08);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 7);
    const src = a.createBufferSource();
    src.buffer = buf;
    const bp = a.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 2;
    const g = a.createGain();
    g.gain.value = vol;
    src.connect(bp).connect(g).connect(a.destination);
    src.start(t);
  }
  function tone(f, dur, delay = 0, vol = 0.11) {
    const a = ac();
    if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "triangle";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  const sfx = {
    select: () => knock(0.15, 2600),
    move: () => knock(0.6, 1500),
    capture: () => {
      knock(0.9, 1100);
      knock(0.4, 2000, 0.05);
    },
    castle: () => {
      knock(0.55, 1500);
      knock(0.55, 1500, 0.12);
    },
    check: () => tone(1046, 0.18, 0.08),
    promote: () => [659, 880, 1175].forEach((f, i) => tone(f, 0.14, i * 0.07)),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, i * 0.11)),
    lose: () => [440, 370, 294].forEach((f, i) => tone(f, 0.26, i * 0.15)),
    draw: () => [523, 523].forEach((f, i) => tone(f, 0.15, i * 0.18)),
  };

  // ---------- Trạng thái ----------
  let state = E.parseFEN(E.START);
  let history = []; // {m, san, piece, cap}
  let positions = new Map();
  let over = null; // {winner: 'w'|'b'|null, reason}
  let legalNow = [];
  let selected = -1;
  let hintMove = -1;
  let flipped = false;
  let els = new Array(64).fill(null);
  let thinkId = 0;
  let thinking = false;

  let keys = []; // khoá băm của các thế cờ đã qua (để máy tránh lặp lại)
  const ranked = () => settings.mode === "ranked";
  const vsAI = () => settings.mode !== "pvp";
  const humanW = () => (ranked() ? rank.side === "w" : settings.side === "w");
  // ván xếp hạng đang dở (đã có nước đi, chưa kết thúc)
  const rankedInProgress = () => ranked() && !over && history.length > 0 && rank.bot != null;
  const aiTurn = () => vsAI() && !over && state.w !== humanW();
  const posKey = () => state.b.join(",") + (state.w ? "w" : "b") + state.c + "," + state.ep;
  const from = (m) => m & 63;
  const to = (m) => (m >> 6) & 63;
  const targetsOf = (sq) => legalNow.filter((m) => from(m) === sq);

  // ---------- Vẽ ô bàn cờ ----------
  function renderSquares() {
    const box = $("#squares");
    box.replaceChildren();
    for (let vr = 0; vr < 8; vr++)
      for (let vc = 0; vc < 8; vc++) {
        const r = flipped ? 7 - vr : vr;
        const c = flipped ? 7 - vc : vc;
        const d = document.createElement("div");
        d.className = "sq" + ((r + c) % 2 ? " d" : "");
        if (vc === 0) d.insertAdjacentHTML("beforeend", `<span class="rk">${8 - r}</span>`);
        if (vr === 7) d.insertAdjacentHTML("beforeend", `<span class="fl">${"abcdefgh"[c]}</span>`);
        box.append(d);
      }
    document.body.className = "theme-" + settings.theme;
  }
  function pos(i) {
    let r = i >> 3;
    let c = i & 7;
    if (flipped) {
      r = 7 - r;
      c = 7 - c;
    }
    return { left: c * 12.5 + "%", top: r * 12.5 + "%" };
  }
  function squareAt(x, y) {
    const rect = boardEl.getBoundingClientRect();
    let c = Math.floor(((x - rect.left) / rect.width) * 8);
    let r = Math.floor(((y - rect.top) / rect.height) * 8);
    if (c < 0 || c > 7 || r < 0 || r > 7) return -1;
    if (flipped) {
      r = 7 - r;
      c = 7 - c;
    }
    return r * 8 + c;
  }

  // ---------- Quân cờ ----------
  function pieceHTML(p) {
    const t = p.toLowerCase();
    return `<span class="fill">${FILL[t]}${VS}</span><span class="line">${LINE[t]}${VS}</span>`;
  }
  function makePiece(i) {
    const p = state.b[i];
    const el = document.createElement("div");
    el.className = "pc " + (E.isW(p) ? "w" : "b");
    el.innerHTML = pieceHTML(p);
    Object.assign(el.style, pos(i));
    return el;
  }
  function renderPieces() {
    piecesEl.replaceChildren();
    els = new Array(64).fill(null);
    for (let i = 0; i < 64; i++) {
      if (!state.b[i]) continue;
      els[i] = makePiece(i);
      piecesEl.append(els[i]);
    }
  }
  function slide(f, t) {
    const el = els[f];
    if (!el) return;
    els[t] = el;
    els[f] = null;
    el.classList.add("moving");
    Object.assign(el.style, pos(t));
    setTimeout(() => el.classList.remove("moving"), 220);
  }
  function kill(i) {
    const el = els[i];
    if (!el) return;
    els[i] = null;
    el.classList.add("dead");
    setTimeout(() => el.remove(), 220);
  }
  // Cập nhật DOM theo nước vừa đi (state.b đã là thế cờ mới)
  function animateMove(m) {
    const f = from(m);
    const t = to(m);
    const fl = m >> 15;
    kill(t);
    if (fl & 1) kill(t + (state.w ? -8 : 8)); // tốt bị bắt qua đường (state.w đã đổi lượt)
    slide(f, t);
    if (fl & 2) {
      const rook = { 62: [63, 61], 58: [56, 59], 6: [7, 5], 2: [0, 3] }[t];
      slide(rook[0], rook[1]);
    }
    if ((m >> 12) & 7) {
      const el = els[t];
      setTimeout(() => {
        if (el && els[t] === el) el.innerHTML = pieceHTML(state.b[t]);
      }, 200);
    }
  }

  // ---------- Dấu trên bàn ----------
  function mark(cls, i) {
    const d = document.createElement("div");
    d.className = "mk " + cls;
    Object.assign(d.style, pos(i));
    marksEl.append(d);
  }
  function renderMarks() {
    marksEl.replaceChildren();
    const last = history[history.length - 1];
    if (last) {
      mark("hl", from(last.m));
      mark("hl", to(last.m));
    }
    if (selected >= 0) {
      mark("sel", selected);
      const seen = new Set();
      for (const m of targetsOf(selected)) {
        const t = to(m);
        if (seen.has(t)) continue;
        seen.add(t);
        mark(state.b[t] || m >> 15 === 1 ? "cap" : "dot", t);
      }
    }
    if (hintMove >= 0) {
      mark("hint", from(hintMove));
      mark("hint", to(hintMove));
    }
    if (E.inCheck(state, state.w)) mark("check", state.b.indexOf(state.w ? "K" : "k"));
  }

  // ---------- Ký hiệu nước đi (SAN, quân hiển thị bằng hình) ----------
  function san(m) {
    const b = state.b;
    const f = from(m);
    const t = to(m);
    const pr = (m >> 12) & 7;
    const fl = m >> 15;
    const p = b[f];
    const T = p.toLowerCase();
    let s;
    if (fl & 2) s = (t & 7) === 6 ? "O-O" : "O-O-O";
    else {
      const cap = b[t] || fl & 1;
      const name = E.sqName(t);
      if (T === "p") s = (cap ? "abcdefgh"[f & 7] + "x" : "") + name + (pr ? "=" + `<i>${FILL["?nbrq"[pr]]}${VS}</i>` : "");
      else {
        const amb = legalNow.filter((o) => o !== m && to(o) === t && b[from(o)] === p);
        let dis = "";
        if (amb.length) {
          const sameFile = amb.some((o) => (from(o) & 7) === (f & 7));
          const sameRank = amb.some((o) => from(o) >> 3 === f >> 3);
          const sq = E.sqName(f);
          dis = !sameFile ? sq[0] : !sameRank ? sq[1] : sq;
        }
        s = `<i>${FILL[T]}${VS}</i>` + dis + (cap ? "x" : "") + name;
      }
    }
    const u = E.make(state, m);
    if (E.inCheck(state, state.w)) s += E.legal(state).length ? "+" : "#";
    E.unmake(state, m, u);
    return s;
  }

  // ---------- Bảng / người chơi ----------
  function sideName(w) {
    if (!vsAI()) return w ? "Quân Trắng" : "Quân Đen";
    if (ranked()) {
      if (w === humanW()) return `Bạn · ${rank.rating}`;
      const elo = rank.bot ?? rank.lastBot ?? rank.rating;
      const b = tierOf(BOTS, elo);
      return `${b[2]} ${b[1]} · ${elo}`;
    }
    return w === humanW() ? "Bạn" : `Máy · ${LEVEL_NAME[settings.level]}`;
  }
  function renderRank() {
    const card = $("#rankCard");
    card.hidden = !ranked();
    if (!ranked()) return;
    const t = tierOf(TITLES, rank.rating);
    const next = TITLES.find((x) => x[0] > rank.rating);
    $("#rkIco").textContent = t[2];
    $("#rkTitle").textContent = t[1];
    $("#rkElo").textContent = rank.rating;
    $("#rkW").textContent = rank.w;
    $("#rkD").textContent = rank.d;
    $("#rkL").textContent = rank.l;
    $("#rkPeak").textContent = rank.peak;
    if (next) {
      const pct = ((rank.rating - t[0]) / (next[0] - t[0])) * 100;
      $("#rkBar").style.width = Math.max(3, Math.min(100, pct)) + "%";
      $("#rkNext").textContent = `Còn ${next[0] - rank.rating} điểm để lên ${next[2]} ${next[1]}`;
    } else {
      $("#rkBar").style.width = "100%";
      $("#rkNext").textContent = "Bạn đã ở hạng cao nhất!";
    }
    if (rank.bot != null && !over) {
      const sign = (n) => (n > 0 ? "+" + n : n < 0 ? "−" + -n : "±0");
      $("#rkStake").innerHTML = `Ván này: thắng <b class="up">${sign(eloDelta(1))}</b> · hòa <b>${sign(
        eloDelta(0.5),
      )}</b> · thua <b class="down">${sign(eloDelta(0))}</b>`;
    } else $("#rkStake").textContent = "Bấm “Ván mới” để tìm đối thủ ngang sức";
  }
  function material(w) {
    let s = 0;
    for (const p of state.b) if (p && E.isW(p) === w) s += VAL[p.toLowerCase()];
    return s;
  }
  function renderPlayers() {
    const bottomW = !flipped;
    const diff = material(true) - material(false);
    for (const [id, w] of [
      ["#pBottom", bottomW],
      ["#pTop", !bottomW],
    ]) {
      const el = $(id);
      const av = el.querySelector(".avatar");
      av.className = "avatar " + (w ? "w" : "b");
      av.textContent = (w ? "♔" : "♚") + VS;
      el.querySelector(".pname").textContent = sideName(w) + (vsAI() ? (w ? " (Trắng)" : " (Đen)") : "");
      el.classList.toggle("active", !over && state.w === w);
      const caps = history
        .filter((h) => h.cap && E.isW(h.piece) === w)
        .map((h) => h.cap.toLowerCase())
        .sort((a, b) => VAL[a] - VAL[b]);
      const adv = w ? diff : -diff;
      el.querySelector(".pcap").innerHTML =
        caps.map((t) => FILL[t] + VS).join("") + (adv > 0 ? `<b>+${adv}</b>` : "");
    }
  }
  function renderStatus() {
    const st = $("#status");
    const dot = $("#statusDot");
    st.classList.remove("thinking", "check");
    dot.className = "dot " + (state.w ? "w" : "b");
    let text;
    if (over) {
      dot.className = "dot " + (over.winner || "");
      text = over.winner ? `${sideName(over.winner === "w")} thắng · ${over.reason}` : `Hòa · ${over.reason}`;
    } else {
      if (thinking) {
        st.classList.add("thinking");
        text = "Máy đang suy nghĩ…";
      } else if (vsAI()) text = state.w === humanW() ? "Đến lượt bạn" : "Lượt của máy";
      else text = `Lượt quân ${state.w ? "Trắng" : "Đen"}`;
      if (E.inCheck(state, state.w)) {
        st.classList.add("check");
        text += " · Đang bị chiếu!";
      }
    }
    $("#statusText").textContent = text;
  }
  function renderMoves() {
    const ol = $("#moveList");
    if (!history.length) {
      ol.innerHTML = `<li class="empty">Chưa có nước đi nào</li>`;
      return;
    }
    const rows = [];
    for (let i = 0; i < history.length; i += 2)
      rows.push(`<li><span>${history[i].san}</span><span>${history[i + 1] ? history[i + 1].san : ""}</span></li>`);
    ol.innerHTML = rows.join("");
    ol.scrollTop = ol.scrollHeight;
  }
  function renderControls() {
    document.querySelectorAll(".seg").forEach((seg) => {
      const key = seg.dataset.set;
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === settings[key]));
    });
    // xếp hạng: máy tự chọn theo điểm, phe luân phiên, không được đi lại / gợi ý
    $("#grpLevel").hidden = settings.mode !== "ai";
    $("#grpSide").hidden = settings.mode !== "ai";
    $("#btnSound").textContent = settings.muted ? "🔇 Âm thanh" : "🔊 Âm thanh";
    $("#btnUndo").disabled = !history.length || thinking || ranked();
    $("#btnHint").disabled = !!over || thinking || aiTurn() || ranked();
    $("#btnResign").disabled = !!over || !history.length || !vsAI();
  }
  function renderAll() {
    renderRank();
    renderPlayers();
    renderStatus();
    renderMoves();
    renderControls();
    renderMarks();
  }

  // ---------- Kết thúc ván ----------
  function insufficient() {
    const rest = state.b.filter((p) => p && p.toLowerCase() !== "k");
    if (!rest.length) return true;
    if (rest.length === 1 && "nNbB".includes(rest[0])) return true;
    // chỉ còn tượng cùng màu ô
    if (rest.every((p) => p === "b" || p === "B")) {
      const colors = new Set();
      state.b.forEach((p, i) => {
        if (p === "b" || p === "B") colors.add(((i >> 3) + (i & 7)) % 2);
      });
      return colors.size === 1;
    }
    return false;
  }
  function checkEnd() {
    if (!legalNow.length) {
      if (E.inCheck(state, state.w)) return { winner: state.w ? "b" : "w", reason: "Chiếu hết" };
      return { winner: null, reason: "Hết nước đi (pat)" };
    }
    if ((positions.get(posKey()) || 0) >= 3) return { winner: null, reason: "Lặp lại thế cờ 3 lần" };
    if (state.h >= 100) return { winner: null, reason: "Luật 50 nước" };
    if (insufficient()) return { winner: null, reason: "Không đủ quân để chiếu hết" };
    return null;
  }
  function showResult() {
    let ico;
    let title;
    if (!over.winner) {
      ico = "🤝";
      title = "Hòa cờ!";
      sfx.draw();
    } else if (vsAI()) {
      const youWin = (over.winner === "w") === humanW();
      ico = youWin ? "🏆" : "😵";
      title = youWin ? "Bạn thắng!" : "Máy thắng!";
      (youWin ? sfx.win : sfx.lose)();
    } else {
      ico = "🏆";
      title = over.winner === "w" ? "Quân Trắng thắng!" : "Quân Đen thắng!";
      sfx.win();
    }
    $("#resIco").textContent = ico;
    $("#resTitle").textContent = title;
    $("#resText").textContent = over.reason;
    const eloEl = $("#resElo");
    eloEl.hidden = !over.rank;
    if (over.rank) {
      const r = over.rank;
      const cls = r.d > 0 ? "up" : r.d < 0 ? "down" : "";
      eloEl.innerHTML =
        `Điểm Elo: ${r.before} → <b>${r.after}</b> <span class="${cls}">(${r.d > 0 ? "+" : ""}${r.d})</span>` +
        (r.up ? `<br><span class="up">🎉 Lên hạng ${r.up[2]} ${r.up[1]}!</span>` : "") +
        (r.down ? `<br><span class="down">Xuống hạng ${tierOf(TITLES, r.after)[1]}</span>` : "");
    }
    setTimeout(() => ($("#result").hidden = false), 450);
  }
  // Ván kết thúc: ghi điểm xếp hạng (một lần) rồi hiện kết quả
  function finishGame() {
    if (ranked() && rank.bot != null && !over.rank) {
      const score = !over.winner ? 0.5 : (over.winner === "w") === humanW() ? 1 : 0;
      over.rank = settleRank(score);
    }
    renderAll();
    persist();
    showResult();
  }
  function resign() {
    if (over || !history.length || !vsAI()) return;
    if (!confirm(ranked() ? "Xin thua ván này? Bạn sẽ bị trừ điểm." : "Xin thua ván này?")) return;
    thinkId++;
    thinking = false;
    over = { winner: humanW() ? "b" : "w", reason: "Bạn xin thua" };
    finishGame();
  }
  // Rời ván xếp hạng đang dở (ván mới / đổi chế độ) = tính thua
  function leaveRanked() {
    if (!rankedInProgress()) return true;
    if (!confirm("Ván xếp hạng đang dở. Bỏ ván bây giờ sẽ bị tính là THUA. Tiếp tục?")) return false;
    thinkId++;
    thinking = false;
    over = { winner: humanW() ? "b" : "w", reason: "Bỏ ván" };
    over.rank = settleRank(0);
    return true;
  }

  // ---------- Đi quân ----------
  function applyMove(m, { animate = true, quiet = false } = {}) {
    const f = from(m);
    const piece = state.b[f];
    const fl = m >> 15;
    const capSq = fl & 1 ? to(m) + (state.w ? 8 : -8) : to(m);
    const cap = state.b[capSq];
    const note = san(m);
    E.make(state, m);
    history.push({ m, san: note, piece, cap });
    positions.set(posKey(), (positions.get(posKey()) || 0) + 1);
    keys.push(E.key(state));
    legalNow = E.legal(state);
    selected = -1;
    hintMove = -1;
    if (animate) animateMove(m);
    over = checkEnd();
    if (quiet) return;
    if ((m >> 12) & 7) sfx.promote();
    else if (fl & 2) sfx.castle();
    else if (cap) sfx.capture();
    else sfx.move();
    if (!over && E.inCheck(state, state.w)) sfx.check();
    if (over) return finishGame();
    renderAll();
    persist();
    maybeAI();
  }

  function resetState() {
    state = E.parseFEN(E.START);
    history = [];
    positions = new Map([[posKey(), 1]]);
    keys = [E.key(state)];
    legalNow = E.legal(state);
    over = null;
    selected = -1;
    hintMove = -1;
  }
  function newGame() {
    thinkId++;
    thinking = false;
    resetState();
    if (ranked()) pickBot();
    flipped = vsAI() && !humanW();
    $("#result").hidden = true;
    $("#promo").hidden = true;
    renderSquares();
    renderPieces();
    renderAll();
    persist();
    maybeAI();
  }
  function replay(moves) {
    resetState();
    for (const m of moves) {
      if (over || !legalNow.includes(m)) break;
      applyMove(m, { animate: false, quiet: true });
    }
    selected = -1;
    renderPieces();
    renderAll();
  }
  function undo() {
    if (!history.length || ranked()) return; // ván xếp hạng không được đi lại
    thinkId++;
    thinking = false;
    let n = 1;
    if (vsAI()) {
      // lùi đến khi lại đến lượt người chơi
      n = 0;
      let w = history.length % 2 === 0;
      do {
        n++;
        w = !w;
      } while (n < history.length && w !== humanW());
      if (w !== humanW()) n = history.length;
    }
    $("#result").hidden = true;
    $("#promo").hidden = true;
    replay(history.slice(0, history.length - n).map((h) => h.m));
    sfx.select();
    persist();
    maybeAI();
  }

  // ---------- Máy suy nghĩ (Web Worker, dự phòng luồng chính) ----------
  let worker = null;
  const pending = new Map();
  try {
    const src = `const E=(${Engine.toString()})();onmessage=(e)=>{const d=e.data;postMessage({id:d.id,move:E.search(d.s,d.opts)});};`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    worker.onmessage = (e) => {
      const job = pending.get(e.data.id);
      pending.delete(e.data.id);
      if (job) job(e.data.move);
    };
    worker.onerror = () => {
      worker = null;
      const jobs = [...pending.values()];
      pending.clear();
      jobs.forEach((job) => setTimeout(job.run, 0));
    };
  } catch {
    worker = null;
  }
  // who: "bot" (máy đang đấu) hoặc "hint" (gợi ý cho người chơi)
  function think(who, cb) {
    const id = ++thinkId;
    const s = { ...state, b: state.b.slice() };
    const opts = {
      line: history.map((h) => E.uci(h.m)).join(" "),
      keys: keys.slice(0, -1),
    };
    if (who === "hint") opts.level = "medium";
    else if (ranked()) opts.cfg = botCfg(rank.bot ?? rank.rating);
    else opts.level = settings.level;
    const done = (move) => {
      if (id === thinkId) cb(move);
    };
    const run = () => {
      if (id === thinkId) done(E.search(s, opts));
    };
    if (worker) {
      const job = (move) => done(move);
      job.run = run;
      pending.set(id, job);
      worker.postMessage({ id, s, opts });
    } else setTimeout(run, 30);
  }
  function maybeAI() {
    if (!aiTurn()) return;
    thinking = true;
    renderStatus();
    renderControls();
    const start = performance.now();
    think("bot", (m) => {
      const id = thinkId;
      setTimeout(
        () => {
          if (id !== thinkId) return;
          thinking = false;
          if (m >= 0) applyMove(m);
          else renderAll();
        },
        Math.max(0, 400 - (performance.now() - start)),
      );
    });
  }
  function hint() {
    if (over || thinking || aiTurn()) return;
    thinking = true;
    renderStatus();
    renderControls();
    $("#statusText").textContent = "Đang tìm nước hay…";
    think("hint", (m) => {
      thinking = false;
      hintMove = m;
      renderAll();
      setTimeout(() => {
        if (hintMove === m) {
          hintMove = -1;
          renderMarks();
        }
      }, 3000);
    });
  }

  // ---------- Phong cấp ----------
  function tryMove(f, t) {
    const ms = legalNow.filter((m) => from(m) === f && to(m) === t);
    if (!ms.length) return false;
    if (ms.length === 1) {
      applyMove(ms[0]);
      return true;
    }
    // nhiều nước cùng ô đích = phong cấp → hỏi chọn quân
    const row = $("#promoRow");
    row.replaceChildren();
    const w = state.w;
    for (const k of [4, 3, 2, 1]) {
      const m = ms.find((x) => ((x >> 12) & 7) === k);
      const btn = document.createElement("button");
      const p = w ? "?NBRQ"[k] : "?nbrq"[k];
      btn.innerHTML = `<div class="pc ${w ? "w" : "b"}">${pieceHTML(p)}</div>`;
      btn.setAttribute("aria-label", ["", "Mã", "Tượng", "Xe", "Hậu"][k]);
      btn.addEventListener("click", () => {
        $("#promo").hidden = true;
        applyMove(m);
      });
      row.append(btn);
    }
    $("#promo").hidden = false;
    // đặt quân lên ô đích trong lúc chọn
    if (els[f]) Object.assign(els[f].style, pos(t));
    return true;
  }
  $("#promo").addEventListener("pointerdown", (e) => {
    if (e.target.id === "promo") {
      $("#promo").hidden = true;
      if (els[selected]) Object.assign(els[selected].style, pos(selected));
      selected = -1;
      renderMarks();
    }
    e.stopPropagation();
  });

  // ---------- Bấm / kéo thả ----------
  let drag = null; // {sq, el, x, y, moved, wasSelected}
  const canMove = () => !over && !thinking && !aiTurn() && $("#promo").hidden && $("#result").hidden;

  boardEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !canMove() || e.target.closest(".result, .promo")) return;
    const sq = squareAt(e.clientX, e.clientY);
    if (sq < 0) return;
    if (selected >= 0 && selected !== sq && targetsOf(selected).some((m) => to(m) === sq)) {
      tryMove(selected, sq);
      return;
    }
    const p = state.b[sq];
    if (p && E.isW(p) === state.w) {
      const wasSelected = selected === sq;
      if (!wasSelected) sfx.select();
      selected = sq;
      hintMove = -1;
      renderMarks();
      drag = { sq, el: els[sq], x: e.clientX, y: e.clientY, moved: false, wasSelected, over: -1 };
      boardEl.setPointerCapture(e.pointerId);
    } else {
      selected = -1;
      renderMarks();
    }
  });
  boardEl.addEventListener("pointermove", (e) => {
    if (!drag || !drag.el) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
    drag.moved = true;
    const rect = boardEl.getBoundingClientRect();
    drag.el.classList.add("drag");
    drag.el.style.left = ((e.clientX - rect.left) / rect.width) * 100 - 6.25 + "%";
    drag.el.style.top = ((e.clientY - rect.top) / rect.height) * 100 - 6.25 + "%";
    // viền trắng ô đang rê tới
    const sq = squareAt(e.clientX, e.clientY);
    if (sq !== drag.over) {
      drag.over = sq;
      marksEl.querySelector(".over")?.remove();
      if (sq >= 0) mark("over", sq);
    }
  });
  function endDrag(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    marksEl.querySelector(".over")?.remove();
    if (d.el) d.el.classList.remove("drag");
    if (d.moved) {
      const sq = squareAt(e.clientX, e.clientY);
      if (d.el) {
        // đặt thẳng vào ô đích, không trượt lại
        d.el.style.transition = "none";
        Object.assign(d.el.style, pos(sq >= 0 && targetsOf(d.sq).some((m) => to(m) === sq) ? sq : d.sq));
        void d.el.offsetWidth;
        d.el.style.transition = "";
      }
      if (sq >= 0 && sq !== d.sq && targetsOf(d.sq).some((m) => to(m) === sq)) tryMove(d.sq, sq);
    } else if (d.wasSelected) {
      selected = -1; // bấm lại quân đang chọn → bỏ chọn
      renderMarks();
    }
  }
  boardEl.addEventListener("pointerup", endDrag);
  boardEl.addEventListener("pointercancel", (e) => {
    if (drag && drag.el) Object.assign(drag.el.style, pos(drag.sq));
    endDrag(e);
  });

  // ---------- Nút ----------
  document.querySelectorAll(".seg").forEach((seg) =>
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || settings[seg.dataset.set] === b.dataset.v) return;
      if (seg.dataset.set !== "level" && !leaveRanked()) return;
      settings[seg.dataset.set] = b.dataset.v;
      sfx.select();
      if (seg.dataset.set === "level") {
        renderAll();
        persist();
      } else newGame();
    }),
  );
  $("#btnNew").addEventListener("click", () => leaveRanked() && newGame());
  $("#resNew").addEventListener("click", newGame);
  $("#btnResign").addEventListener("click", resign);
  $("#btnRankReset").addEventListener("click", () => {
    if (!confirm(`Đặt lại điểm về ${RANK_START.rating} và xoá toàn bộ thành tích xếp hạng?`)) return;
    rank = { ...RANK_START };
    saveRank();
    newGame(); // ván đang dở (nếu có) bỏ luôn, không tính điểm
  });
  $("#resView").addEventListener("click", () => ($("#result").hidden = true));
  $("#btnUndo").addEventListener("click", undo);
  $("#btnHint").addEventListener("click", hint);
  $("#btnFlip").addEventListener("click", () => {
    flipped = !flipped;
    renderSquares();
    els.forEach((el, i) => el && Object.assign(el.style, pos(i)));
    renderAll();
  });
  $("#btnTheme").addEventListener("click", () => {
    settings.theme = THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length];
    renderSquares();
    persist();
  });
  $("#btnSound").addEventListener("click", () => {
    settings.muted = !settings.muted;
    renderControls();
    persist();
  });
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    } else if (e.key === "Escape") {
      selected = -1;
      renderMarks();
    }
  });

  // ---------- Khởi động: khôi phục ván dở ----------
  flipped = vsAI() && !humanW();
  renderSquares();
  if (Array.isArray(saved.moves) && saved.moves.length && !(ranked() && rank.bot == null)) {
    replay(saved.moves);
    maybeAI();
  } else newGame();
})();
