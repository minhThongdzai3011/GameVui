// Cúp Tây Ban Nha — mọi CLB Tây Ban Nha trong game đều tham dự, dù người chơi dẫn dắt nước nào.
// - Supercopa de España (tuần thứ hai tháng 1, sân trung lập ở Ả Rập Xê Út; Copa vòng 1/8 đá tuần sau đó): 4 đội — vô địch và á quân LaLiga, hai đội
//   vào chung kết Copa del Rey mùa trước (trùng thì lấy đội xếp tiếp theo ở LaLiga). Bán kết: vô địch LaLiga
//   gặp á quân Copa, vô địch Copa gặp á quân LaLiga; chung kết. Hoà thì đá luân lưu. Mùa đầu đúng như
//   thật: Barcelona – Atlético Madrid, Real Sociedad – Real Madrid (2–6/2/2027).
// - Copa del Rey: vòng 1 có 112 đội — 16 đội LaLiga (trừ 4 đội dự Supercopa), 22 đội LaLiga 2 và các CLB
//   hạng dưới (Primera / Segunda / Tercera Federación, giải khu vực: tên, sân, sức chứa thật; đội hình do
//   game sinh ra). Mùa đầu dùng đúng 56 cặp bốc thăm thật. Vòng 2 (56 đội), vòng 1/16 (4 đội Supercopa
//   vào), 1/8, tứ kết: một trận trên sân đội hạng thấp hơn, hoà đá luân lưu. Bán kết hai lượt, chung kết
//   một trận ở La Cartuja (Sevilla). Ngày các vòng theo lịch thật mùa 2025/26.
(function () {
  "use strict";
  const FM = window.FM;
  const W = FM.World;
  const D = window.FM_DATA;
  const A = FM.AFC;
  const E = FM.EnCups;
  const DATA = (D.cups && D.cups.es) || null;
  const S = (FM.EsCups = {});
  const LL = "spain-la-liga";
  const LL2 = "spain-la-liga-2";
  S.enabled = !!(DATA && A && A.addGuest && FM.LEAGUE[LL]);
  S.COMPS = { copa: { name: "Copa del Rey", short: "CDR" }, sup: { name: "Supercopa", short: "SUP" } };
  const ROUNDS = { copa: ["Vòng 1", "Vòng 2", "Vòng 1/16", "Vòng 1/8", "Tứ kết", "Bán kết", "Chung kết"], sup: ["Bán kết", "Chung kết"] };
  const R_SEMI = 5;
  // tiền thưởng (nghìn £) cho đội thắng mỗi vòng Copa; Supercopa: tham dự (tiền Ả Rập Xê Út) + vô địch
  const PRIZE = { copa: [20, 40, 80, 150, 300, 600], copaChamp: 1500, supJoin: 3500, supChamp: 2000 };
  const CONF = { copa: 8, sup: 3 };

  // ---------- Ngày (theo lịch thật 2025/26) ----------
  const nth = (y, m, dow, n) => {
    let d = `${y}-${String(m).padStart(2, "0")}-01`;
    while (FM.weekday(d) !== dow) d = FM.addDays(d, 1);
    return FM.addDays(d, (n - 1) * 7);
  };
  const lastDow = (y, m, dow) => {
    let d = nth(y, m, dow, 4);
    while (+FM.addDays(d, 7).slice(5, 7) === m) d = FM.addDays(d, 7);
    return d;
  };
  const WED = 3;
  const SAT = 6;
  const copaDates = (y) => [lastDow(y, 10, WED), nth(y, 12, WED, 1), nth(y, 12, WED, 3), nth(y + 1, 1, WED, 3), nth(y + 1, 2, WED, 1), [nth(y + 1, 2, WED, 2), nth(y + 1, 3, WED, 1)], nth(y + 1, 4, SAT, 3)];
  // Supercopa: tuần thứ hai tháng 1 (bán kết thứ Tư, thứ Năm; chung kết Chủ nhật)
  const supDates = (y) => {
    const w = nth(y + 1, 1, WED, 2);
    return [[w, FM.addDays(w, 1)], FM.addDays(w, 4)];
  };
  // LaLiga không xếp vòng giữa tuần sát ngày Copa
  W.calendarBlocks.push((season, L) => (L.country === "es" ? { mid: copaDates(season).flat().slice(0, -1) } : null));

  // ---------- CLB hạng dưới ----------
  const LEVEL_STR = (lv) => (/primera fed/i.test(lv || "") ? 56 : /segunda fed/i.test(lv || "") ? 51 : /tercera fed/i.test(lv || "") ? 46 : 41);
  const usedCodes = new Set(D.clubs.map((c) => c.code));
  function codeFor(name) {
    const w = name.replace(/^(CD|CF|UD|SD|CE|AD|FC|UE|RCD|SCR|CP|Real|Club|Atlético|Atletico) /i, "").split(/\s+/).map((x) => x.normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase()).filter(Boolean);
    const [a = "XXX", b = ""] = w;
    const cands = [a.slice(0, 3), a.slice(0, 2) + (b[0] || a[2] || "X"), a[0] + b.slice(0, 2), a[0] + a.slice(2, 4)];
    const code = cands.find((c) => c.length === 3 && !usedCodes.has(c)) || a.slice(0, 2) + (usedCodes.size % 10);
    usedCodes.add(code);
    return code;
  }
  const GUESTS = [];
  if (S.enabled)
    for (const g of DATA.guests) {
      const c = { id: g.id, name: g.name, code: codeFor(g.name), country: "es", nat: "Tây Ban Nha", lgName: g.level ? g.level.replace(/Federacion/i, "Federación").replace(/\s*-\s*Group\s*(\d+)/i, " · bảng $1") : "Giải khu vực", level: g.level, colors: [g.color || "#888888", "#ffffff"], capacity: g.capacity || 2000, venue: g.venue || "", rep: Math.round(LEVEL_STR(g.level) / 3), str: LEVEL_STR(g.level) + (FM.hash(g.id) % 4) - 1, imports: 0, coach: "—" };
      GUESTS.push(c);
      A.addGuest(c);
    }
  S.isGuest = (id) => typeof id === "string" && id.startsWith("g-") && A.isForeign(id);

  // ---------- Tiện ích ----------
  const name = (s, id) => W.baseClub(s, id).name;
  const shuffle = (rnd, arr) => arr.map((x) => [rnd(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
  const gbp = (k) => FM.gbpToTy(k * 1000);
  // cấp độ: 1 LaLiga, 2 LaLiga 2, 3+ hạng dưới
  const level = (s, id) => (s.clubs[id] ? FM.LEAGUE[s.clubs[id].league]?.tier || 9 : /primera fed/i.test(A.club(id)?.level || "") ? 3 : /segunda fed/i.test(A.club(id)?.level || "") ? 4 : /tercera fed/i.test(A.club(id)?.level || "") ? 5 : 6);
  S.isEs = (f) => f.lg === "copa" || f.lg === "sup";
  S.roundName = (comp, r) => ROUNDS[comp]?.[r] || "";
  S.label = (f) => `${S.COMPS[f.lg].name} · ${S.roundName(f.lg, f.rd)}${f.leg ? ` lượt ${f.leg === 1 ? "đi" : "về"}` : ""}`;
  const near = (a, b) => Math.abs(FM.daysBetween(a, b)) <= 1;
  function fixture(s, comp, r, h, a, d, extra = {}) {
    const f = { id: `${s.season}-${comp}-${r}-${h}${extra.leg ? `-${extra.leg}` : ""}`, lg: comp, rd: r, d, h, a, hg: null, ag: null, done: false, ...extra };
    s.fx.push(f);
    if (E && E.makeRoom) E.makeRoom(s, f); // hoãn trận giải trùng lịch
    // trùng trận cúp / châu Âu khác của một đội → lùi trận này vài ngày
    let moved = false;
    for (let i = 0; i < 6 && s.fx.some((g) => g !== f && !g.done && !FM.LEAGUE[g.lg] && [f.h, f.a].some((id) => s.clubs[id] && (g.h === id || g.a === id)) && near(g.d, f.d)); i++) {
      f.d = FM.addDays(f.d, 1);
      moved = true;
    }
    if (moved && E && E.makeRoom) E.makeRoom(s, f);
    return f;
  }
  const after = (s, d) => (d > FM.addDays(s.date, 2) ? d : FM.addDays(s.date, 3));

  // ---------- Bắt đầu mùa ----------
  S.start = function (s) {
    if (!S.enabled || !W.clubsIn(s, LL).length) return;
    const rnd = FM.rng(FM.hash(`escup-${s.season}-${s.seed}`));
    const first = s.season === D.meta.season;
    const last = s.history[s.history.length - 1];
    const ok = (id) => id && s.clubs[id];
    // Supercopa
    let sup;
    if (first && DATA.supercopa.length >= 2 && DATA.supercopa.slice(0, 2).every((m) => ok(m.h) && ok(m.a))) sup = DATA.supercopa.slice(0, 2).map((m) => [m.h, m.a]);
    else {
      const t = (last && last.tables && last.tables[LL]) || W.clubsIn(s, LL).sort((a, b) => W.baseClub(s, b).rep - W.baseClub(s, a).rep);
      const cw = last && last.esc && last.esc.copa && last.esc.copa.winner;
      const cr = last && last.esc && last.esc.copa && last.esc.copa.runnerUp;
      const lgc = t.filter(ok);
      const champ = lgc[0];
      const second = lgc[1];
      const pool = [champ, second];
      const cupW = ok(cw) && !pool.includes(cw) ? cw : null;
      if (cupW) pool.push(cupW);
      const cupR = ok(cr) && !pool.includes(cr) ? cr : null;
      if (cupR) pool.push(cupR);
      for (const id of lgc) if (pool.length < 4 && !pool.includes(id)) pool.push(id);
      // vô địch LaLiga – á quân Copa, vô địch Copa – á quân LaLiga
      sup = [[champ, pool[3]], [pool[2], second]];
    }
    const supTeams = sup.flat();
    s.esc = {
      season: s.season,
      copa: { round: 0, ties: [], alive: [], out: {}, winner: null, runnerUp: null, byes: [], sup: supTeams },
      sup: { round: 0, ties: [], alive: supTeams, out: {}, winner: null, runnerUp: null },
    };
    for (const id of supTeams) if (s.clubs[id]) s.clubs[id].bal += gbp(PRIZE.supJoin);
    // Supercopa: lịch thật mùa đầu
    const [sfd, fd] = supDates(s.season);
    const realD = first && DATA.supercopa.length >= 2 ? DATA.supercopa.map((m) => m.d) : null;
    sup.forEach(([h, a], i) => {
      const f = fixture(s, "sup", 0, h, a, after(s, realD ? realD[i] : sfd[i]), { ko: true, neutral: true });
      s.esc.sup.ties.push({ r: 0, a: h, b: a, legs: [f.id], w: null });
    });
    s.esc.sup.finalDate = realD && realD[2] ? realD[2] : fd;
    // Copa del Rey vòng 1
    const copa = s.esc.copa;
    const inGame = W.clubsIn(s, LL).concat(W.clubsIn(s, LL2)).filter((id) => !supTeams.includes(id) && !W.baseClub(s, id).parent); // đội B không dự Copa
    const real = first ? DATA.copa.r1.filter((m) => [m.h, m.a].every((id) => ok(id) || S.isGuest(id))) : [];
    const realIds = new Set(real.flatMap((m) => [m.h, m.a]));
    if (first && real.length && inGame.every((id) => realIds.has(id))) {
      for (const m of real) {
        const f = fixture(s, "copa", 0, m.h, m.a, after(s, m.d), { ko: true });
        copa.ties.push({ r: 0, a: m.h, b: m.a, legs: [f.id], w: null });
      }
      copa.alive = [...realIds];
    } else {
      // các mùa sau: đội trong giải gặp đội hạng thấp nhất trước, phần còn lại đá với nhau
      const taken = new Set(Object.keys(s.clubs).map((id) => name(s, id)));
      const guests = GUESTS.filter((g) => !taken.has(g.name)).map((g) => g.id);
      const need = 112 - inGame.length;
      let gs = shuffle(rnd, guests).slice(0, need);
      const byes = Math.max(0, need - gs.length);
      // thiếu đội hạng dưới: các đội LaLiga mạnh nhất được miễn vòng 1 (vòng 2 vẫn đủ 56 đội)
      const byeTeams = W.clubsIn(s, LL).filter((id) => !supTeams.includes(id)).sort((a, b) => W.strength(s, b) - W.strength(s, a)).slice(0, byes);
      copa.byes = byeTeams;
      const pros = shuffle(rnd, inGame.filter((id) => !byeTeams.includes(id))).sort((a, b) => level(s, a) - level(s, b));
      gs = gs.sort((a, b) => level(s, b) - level(s, a));
      const pairs = [];
      const rest = [...gs];
      for (const id of pros) pairs.push([id, rest.length ? rest.shift() : null]);
      for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]);
      const leftovers = pairs.filter(([, b]) => !b).map(([a]) => a);
      const d = copaDates(s.season)[0];
      for (let i = 0; i + 1 < leftovers.length; i += 2) pairs.push([leftovers[i], leftovers[i + 1]]);
      for (const [x, y] of pairs.filter(([, b]) => b)) {
        const [h, a] = level(s, x) >= level(s, y) ? [x, y] : [y, x]; // đội hạng thấp hơn làm chủ nhà
        const f = fixture(s, "copa", 0, h, a, after(s, d), { ko: true });
        copa.ties.push({ r: 0, a: h, b: a, legs: [f.id], w: null });
      }
      copa.alive = copa.ties.flatMap((t) => [t.a, t.b]);
    }
    if (W.countryOfClub(s, s.user) === "es") {
      const lines = [];
      if (supTeams.includes(s.user)) {
        const t = s.esc.sup.ties.find((x) => x.a === s.user || x.b === s.user);
        const f = s.fx.find((x) => x.id === t.legs[0]);
        lines.push(`• Supercopa: bán kết gặp ${name(s, t.a === s.user ? t.b : t.a)} ngày ${FM.fmtDate(f.d, false)} (sân trung lập ở Ả Rập Xê Út). Thưởng tham dự ${FM.fmtMoney(gbp(PRIZE.supJoin))}.`);
        lines.push("• Copa del Rey: vào thẳng vòng 1/16 (đội dự Supercopa).");
      } else if (copa.byes.includes(s.user)) lines.push("• Copa del Rey: được miễn vòng 1.");
      else {
        const t = copa.ties.find((x) => x.a === s.user || x.b === s.user);
        if (t) {
          const opp = t.a === s.user ? t.b : t.a;
          const f = s.fx.find((x) => x.id === t.legs[0]);
          lines.push(`• Copa del Rey vòng 1: gặp ${name(s, opp)}${S.isGuest(opp) ? ` (${A.club(opp).lgName})` : ""} ngày ${FM.fmtDate(f.d, false)}, ${t.a === s.user ? "sân nhà" : "sân khách"}.`);
        }
      }
      W.mail(s, "cup", "Các cúp trong nước mùa này", `${lines.join("\n")}\n\nCopa del Rey đá một trận trên sân đội hạng thấp hơn, hoà đá luân lưu; bán kết hai lượt, chung kết ở La Cartuja (Sevilla).`);
    }
  };

  function draw(s, comp, rnd) {
    const st = s.esc[comp];
    const r = st.round;
    let teams = shuffle(rnd, st.alive);
    // vòng 1/16: các đội dự Supercopa gặp đội hạng thấp nhất còn lại (như thật)
    if (comp === "copa" && r === 2) {
      const sup = teams.filter((id) => st.sup.includes(id));
      const rest = teams.filter((id) => !st.sup.includes(id)).sort((a, b) => level(s, b) - level(s, a));
      teams = sup.flatMap((id) => [id, rest.shift()]).concat(shuffle(rnd, rest));
    }
    const twoLegs = comp === "copa" && r === R_SEMI;
    const final = r === ROUNDS[comp].length - 1;
    const date = comp === "sup" ? st.finalDate : copaDates(s.season)[r];
    for (let i = 0; i + 1 < teams.length; i += 2) {
      let [h, a] = [teams[i], teams[i + 1]];
      if (!final && !twoLegs && level(s, a) > level(s, h)) [h, a] = [a, h]; // đội hạng thấp hơn làm chủ nhà
      let legs;
      if (twoLegs) legs = [fixture(s, comp, r, h, a, after(s, date[0]), { leg: 1 }).id, fixture(s, comp, r, a, h, after(s, date[1]), { leg: 2 }).id];
      else legs = [fixture(s, comp, r, h, a, after(s, date), { ko: true, neutral: final || comp === "sup" }).id];
      st.ties.push({ r, a: h, b: a, legs, w: null });
      if (h === s.user || a === s.user) {
        const opp = h === s.user ? a : h;
        const fs = legs.map((id) => s.fx.find((f) => f.id === id));
        const where = twoLegs ? `lượt đi ${FM.fmtDate(fs[0].d, false)} (${fs[0].h === s.user ? "sân nhà" : "sân khách"}), lượt về ${FM.fmtDate(fs[1].d, false)}` : `${FM.fmtDate(fs[0].d, false)} ${fs[0].neutral ? "trên sân trung lập" : h === s.user ? "(sân nhà)" : "(sân khách)"}`;
        W.mail(s, "cup", `${S.COMPS[comp].name} · ${S.roundName(comp, r)}: gặp ${name(s, opp)}`, `${S.roundName(comp, r)} ${S.COMPS[comp].name}: ${name(s, h)} – ${name(s, a)}${S.isGuest(opp) ? ` (${A.club(opp).lgName})` : ""}, ${where}.`);
      }
    }
  }

  // ---------- Sau mỗi ngày thi đấu ----------
  S.progress = function (s) {
    if (!s.esc) return;
    for (const comp of ["sup", "copa"]) step(s, comp);
  };
  function step(s, comp) {
    const st = s.esc[comp];
    if (st.winner) return;
    const ties = st.ties.filter((t) => t.r === st.round);
    if (!ties.length || !ties.every((t) => W.resolveTie(s, t))) return;
    const last = st.round === ROUNDS[comp].length - 1;
    for (const t of ties) {
      const loser = t.w === t.a ? t.b : t.a;
      st.out[loser] = st.round;
      if (comp === "copa" && s.clubs[t.w] && PRIZE.copa[st.round]) s.clubs[t.w].bal += gbp(PRIZE.copa[st.round]);
      if (loser === s.user && !last) W.mail(s, "cup", `Bị loại khỏi ${S.COMPS[comp].name}`, `CLB dừng bước ở ${S.roundName(comp, st.round)} ${S.COMPS[comp].name} sau ${t.legs.length > 1 ? "hai lượt trận" : "trận"} gặp ${name(s, t.w)}.`);
    }
    if (last) {
      const t = ties[0];
      st.winner = t.w;
      st.runnerUp = t.w === t.a ? t.b : t.a;
      if (s.clubs[t.w]) s.clubs[t.w].bal += gbp(comp === "copa" ? PRIZE.copaChamp : PRIZE.supChamp);
      if (t.w === s.user) s.clubs[s.user].conf = Math.min(100, s.clubs[s.user].conf + CONF[comp]);
      const f = s.fx.find((x) => x.id === t.legs[0]);
      if (W.countryOfClub(s, s.user) === "es") W.mail(s, "cup", t.w === s.user ? `🏆 VÔ ĐỊCH ${S.COMPS[comp].name.toUpperCase()}!` : `${name(s, t.w)} vô địch ${S.COMPS[comp].name}`, `Chung kết ${S.COMPS[comp].name}: ${name(s, f.h)} ${f.hg}–${f.ag} ${name(s, f.a)}${f.pens ? ` (luân lưu ${f.pens.join("–")})` : ""}.`);
      return;
    }
    st.alive = ties.map((t) => t.w);
    st.round++;
    if (comp === "copa" && st.round === 1) st.alive.push(...st.byes.filter((id) => s.clubs[id]));
    if (comp === "copa" && st.round === 2) st.alive.push(...st.sup.filter((id) => s.clubs[id]));
    draw(s, comp, FM.rng(FM.hash(`escup-${comp}-${s.season}-${st.round}-${s.seed}`)));
  }
  S.finished = (s) => !s.esc || (!!s.esc.copa.winner && !!s.esc.sup.winner);

  // ---------- Cuối mùa ----------
  S.endOfSeason = function (s, sum) {
    if (!s.esc) return;
    sum.esc = { copa: { winner: s.esc.copa.winner, runnerUp: s.esc.copa.runnerUp }, sup: { winner: s.esc.sup.winner, runnerUp: s.esc.sup.runnerUp } };
    const last = s.history[s.history.length - 1];
    if (last) last.esc = sum.esc;
  };

  // ---------- Cho giao diện ----------
  S.rounds = (s, comp) => {
    const st = s.esc && s.esc[comp];
    if (!st) return [];
    const out = [];
    for (let r = st.round; r >= 0; r--) {
      const ties = st.ties.filter((t) => t.r === r).map((t) => ({ ...t, legs: t.legs.map((id) => s.fx.find((f) => f.id === id)) }));
      if (ties.length) out.push({ name: S.roundName(comp, r), r, ties });
    }
    return out;
  };
  S.userStatus = function (s, comp, id = s.user) {
    const st = s.esc && s.esc[comp];
    if (!st) return "";
    if (st.winner === id) return "Vô địch 🏆";
    if (st.runnerUp === id) return "Á quân";
    if (st.out[id] !== undefined) return `Bị loại ở ${S.roundName(comp, st.out[id])}`;
    if (st.winner) return comp === "sup" ? "Không tham dự" : "";
    if (st.alive.includes(id)) {
      const t = st.ties.find((x) => x.r === st.round && (x.a === id || x.b === id));
      const fs = t ? t.legs.map((fid) => s.fx.find((f) => f.id === fid)) : [];
      if (t && fs.every((f) => f.done) && W.resolveTie(s, t) && t.w === id) return `Vào ${S.roundName(comp, st.round + 1)}, chờ bốc thăm`;
      return `Đang ở ${S.roundName(comp, st.round)}`;
    }
    if (comp === "copa" && st.sup.includes(id) && st.round < 2) return "Vào từ vòng 1/16";
    if (comp === "copa" && st.byes.includes(id) && st.round < 1) return "Miễn vòng 1";
    return comp === "sup" ? "Không tham dự" : "";
  };
})();
