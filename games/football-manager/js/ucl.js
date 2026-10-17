// UEFA Champions League, thể thức 36 đội từ 2024/25.
// - CLB không thuộc giải nào trong game (FM_DATA.ucl, cầu thủ thật mùa 2026/27 từ FotMob): không mua bán
//   được; mỗi mùa cầu thủ trẻ tiến bộ, cầu thủ lớn tuổi sa sút theo tuổi.
// - Đội thuộc các giải trong game (Anh, Tây Ban Nha — "local"): mùa đầu đúng như thật; các mùa sau mỗi
//   nước giữ số suất của mình (Anh 5, Tây Ban Nha 5), lấy các đội đầu bảng hạng cao nhất mùa trước, thế
//   vào đúng chỗ của các đội cùng nước trong lịch thi đấu (nên không gặp nhau ở vòng phân hạng).
// - Vòng phân hạng: một bảng 36 đội, mỗi đội 8 trận với 8 đối thủ khác nhau theo lịch bốc thăm thật
//   2026/27 (các mùa sau dùng lại lịch đó, ngày dời sang cùng thứ trong tuần của năm mới).
//   Hạng 1–8 vào thẳng vòng 1/8, hạng 9–24 đá play-off (9 gặp 24, 10 gặp 23…), hạng 25–36 bị loại.
// - Play-off, vòng 1/8, tứ kết, bán kết: hai lượt, đội xếp hạng cao hơn ở vòng phân hạng đá lượt về
//   trên sân nhà. Nhánh đấu cố định theo thứ hạng như thật. Chung kết một trận trên sân trung lập.
// - Mọi trận đều mô phỏng đầy đủ bằng engine (có cầu thủ ghi bàn → danh sách vua phá lưới).
(function () {
  "use strict";
  const FM = window.FM;
  const W = FM.World;
  const D = window.FM_DATA;
  const A = FM.AFC;
  const U = (FM.UCL = {});
  const DATA = D.ucl || null;
  U.enabled = !!(DATA && A && A.addGuest);
  U.NAME = "Champions League";
  const STAGE_NAME = { ls: "Vòng phân hạng", po: "Play-off", r16: "Vòng 1/8", qf: "Tứ kết", sf: "Bán kết", f: "Chung kết" };
  U.STAGE_NAME = STAGE_NAME;
  const NEXT = { po: "r16", r16: "qf", qf: "sf", sf: "f" };
  // tiền thưởng (nghìn £, theo quỹ UEFA 2025/26 quy ra bảng Anh): tham dự, thắng/hoà mỗi trận vòng phân hạng,
  // lọt vào từng vòng, vô địch
  const PRIZE = { join: 15800, win: 1800, draw: 600, po: 850, r16: 9400, qf: 10600, sf: 12800, f: 15800, champ: 5500 };

  // ---------- CLB châu Âu ----------
  if (U.enabled) {
    const byClub = new Map();
    for (const p of DATA.players) {
      if (!byClub.has(p.c)) byClub.set(p.c, []);
      byClub.get(p.c).push(p);
    }
    for (const c of DATA.clubs) A.addGuest({ ...c, players: byClub.get(c.id) || [], season0: DATA.season, full: true });
  }
  U.isForeign = (id) => !!(U.enabled && A.isForeign(id) && A.club(id).ucl);
  U.isUcl = (f) => f.lg === "ucl";

  // ---------- Ngày ----------
  const nth = (y, m, dow, n) => {
    let d = `${y}-${String(m).padStart(2, "0")}-01`;
    while (FM.weekday(d) !== dow) d = FM.addDays(d, 1);
    return FM.addDays(d, (n - 1) * 7);
  };
  // cùng "thứ mấy, tuần thứ mấy của tháng" sau k năm
  function shiftYears(iso, k) {
    if (!k) return iso;
    const m = +iso.slice(5, 7);
    const n = Math.ceil(+iso.slice(8, 10) / 7);
    let d = nth(+iso.slice(0, 4) + k, m, FM.weekday(iso), n);
    if (+d.slice(5, 7) !== m) d = FM.addDays(d, -7);
    return d;
  }
  const TUE = 2;
  const SAT = 6;
  // [lượt đi, lượt về] các vòng loại trực tiếp; chung kết: thứ Bảy cuối tháng 5
  function koDates(season) {
    const y = season + 1;
    let fin = nth(y, 5, SAT, 4);
    if (+FM.addDays(fin, 7).slice(5, 7) === 5) fin = FM.addDays(fin, 7);
    return { po: [nth(y, 2, TUE, 3), nth(y, 2, TUE, 4)], r16: [nth(y, 3, TUE, 2), nth(y, 3, TUE, 3)], qf: [nth(y, 4, TUE, 1), nth(y, 4, TUE, 2)], sf: [nth(y, 4, TUE, 4), nth(y, 5, TUE, 1)], f: [fin] };
  }
  // ngày giữa tuần có trận Champions League (để lịch Premier League né)
  U.midweeks = function (season) {
    if (!U.enabled) return [];
    const k = season - DATA.season;
    const ls = [...new Set(DATA.schedule.map((x) => shiftYears(x[3], k)))];
    const ko = Object.values(koDates(season)).flat().slice(0, -1);
    return [...ls, ...ko, ...ko.map((d) => FM.addDays(d, 1))];
  };

  // hạng cao nhất các giải châu Âu né ngày Champions League
  W.calendarBlocks.push((season, L) => (L.tier === 1 && L.country !== "vn" ? { mid: U.midweeks(season) } : null));

  // ---------- Bắt đầu mùa ----------
  function fixture(s, stage, h, a, d, extra = {}) {
    const f = { id: `${s.season}-ucl-${stage}-${h}-${a}${extra.leg ? `-${extra.leg}` : ""}`, lg: "ucl", stage, rd: 0, d, h, a, hg: null, ag: null, done: false, ...extra };
    s.fx.push(f);
    if (FM.EnCups && FM.EnCups.makeRoom) FM.EnCups.makeRoom(s, f); // hoãn trận Premier League trùng lịch
    return f;
  }
  U.start = function (s) {
    if (!U.enabled) return;
    const k = s.season - DATA.season;
    const base = (id) => D.clubs.find((c) => c.id === id);
    const isLocal = (id) => !U.isForeign(id) && !!base(id);
    const last = s.history[s.history.length - 1];
    const map = {};
    const local = [];
    // từng quốc gia: các suất mùa đầu của nước đó
    for (const cc of [...new Set(DATA.entrants.filter(isLocal).map((id) => base(id).country))]) {
      const slots = DATA.entrants.filter((id) => isLocal(id) && base(id).country === cc).sort((a, b) => base(b).strength - base(a).strength);
      const top = FM.leaguesOf(cc)[0];
      if (!top) continue;
      let picks;
      if (k === 0) picks = slots.filter((id) => s.clubs[id]);
      else picks = ((last && last.tables && last.tables[top.id]) || []).filter((id) => s.clubs[id] && s.clubs[id].league === top.id).slice(0, slots.length);
      for (const id of W.clubsIn(s, top.id).sort((a, b) => W.strength(s, b) - W.strength(s, a))) if (picks.length < slots.length && !picks.includes(id)) picks.push(id);
      picks.sort((a, b) => W.strength(s, b) - W.strength(s, a));
      slots.forEach((id, i) => (map[id] = picks[i]));
      local.push(...picks);
    }
    const teamOf = (id) => (isLocal(id) ? map[id] : id);
    const teams = DATA.entrants.map(teamOf).filter(Boolean);
    s.ucl = { season: s.season, teams, local, stage: "ls", ties: [], out: {}, rank: null, winner: null, runnerUp: null };
    for (const [md, h, a, d] of DATA.schedule) {
      const H = teamOf(h);
      const Aw = teamOf(a);
      if (!H || !Aw) continue;
      let day = shiftYears(d, k);
      if (day <= s.date) day = FM.addDays(s.date, 2);
      fixture(s, "ls", H, Aw, day, { md });
    }
    for (const id of local) {
      s.clubs[id].bal += FM.gbpToTy(PRIZE.join * 1000);
      if (id !== s.user) continue;
      const mine = s.fx.filter((f) => f.lg === "ucl" && (f.h === id || f.a === id)).sort((a, b) => a.d.localeCompare(b.d));
      const name = (x) => W.baseClub(s, x).name;
      W.mail(s, "ucl", "Dự UEFA Champions League!", `CLB góp mặt ở Champions League mùa này. Thưởng tham dự ${FM.fmtMoney(FM.gbpToTy(PRIZE.join * 1000))}.\n\nVòng phân hạng: một bảng 36 đội, mỗi đội đá 8 trận. Hạng 1–8 vào thẳng vòng 1/8, hạng 9–24 đá play-off, hạng 25–36 bị loại.\n\n${mine.map((f) => `• Lượt ${f.md}, ${FM.fmtDate(f.d, false)}: ${f.h === id ? `tiếp ${name(f.a)}` : `làm khách ${name(f.h)}`}`).join("\n")}`);
    }
  };

  // ---------- Sau mỗi ngày thi đấu ----------
  const name = (s, id) => W.baseClub(s, id).name;
  const gbp = (k) => FM.gbpToTy(k * 1000);
  U.table = (s) => (s.ucl ? A.table(s, "ucl", s.ucl.teams, (f) => f.stage === "ls") : []);
  function pay(s) {
    for (const f of s.fx) {
      if (f.lg !== "ucl" || !f.done || f.paid || f.stage !== "ls") continue;
      f.paid = true;
      for (const [id, me, op] of [[f.h, f.hg, f.ag], [f.a, f.ag, f.hg]]) if (s.clubs[id]) s.clubs[id].bal += gbp(me > op ? PRIZE.win : me === op ? PRIZE.draw : 0);
    }
  }
  function reached(s, id, stage) {
    const rc = (s.ucl.reach ||= {});
    if (rc[id] === stage || !s.clubs[id]) return; // hạng 1–8 đã nhận thưởng vòng 1/8 khi hết vòng phân hạng
    rc[id] = stage;
    s.clubs[id].bal += gbp(PRIZE[stage] || 0);
    if (id !== s.user) return;
    s.clubs[id].conf = Math.min(100, s.clubs[id].conf + (stage === "po" ? 1 : 3));
    W.mail(s, "ucl", `Champions League: vào ${STAGE_NAME[stage]}!`, `CLB giành vé vào ${STAGE_NAME[stage]} Champions League. Thưởng ${FM.fmtMoney(gbp(PRIZE[stage] || 0))}.`);
  }
  function eliminated(s, id, stage) {
    s.ucl.out[id] = stage;
    if (id === s.user) W.mail(s, "ucl", "Dừng bước ở Champions League", `CLB bị loại ở ${STAGE_NAME[stage]} Champions League.`);
  }
  // hai lượt: a là đội hạng cao hơn (đá lượt về sân nhà)
  function twoLegs(s, stage, pairs) {
    const [d1, d2] = koDates(s.season)[stage];
    pairs.forEach(([a, b], i) => {
      const off = i % 2; // nửa số cặp đá thứ Tư
      const at = (d) => (FM.addDays(d, off) > FM.addDays(s.date, 1) ? FM.addDays(d, off) : FM.addDays(s.date, 2 + off));
      const l1 = fixture(s, stage, b, a, at(d1), { leg: 1 });
      const l2 = fixture(s, stage, a, b, at(d2), { leg: 2 });
      s.ucl.ties.push({ stage, a, b, legs: [l1.id, l2.id], w: null, slot: i });
      if (a === s.user || b === s.user) {
        const opp = a === s.user ? b : a;
        W.mail(s, "ucl", `Champions League · ${STAGE_NAME[stage]}: gặp ${name(s, opp)}`, `${STAGE_NAME[stage]} Champions League: ${name(s, a)} – ${name(s, b)}. Lượt đi ${FM.fmtDate(l1.d, false)} ${l1.h === s.user ? "trên sân nhà" : `trên sân ${name(s, opp)}`}, lượt về ${FM.fmtDate(l2.d, false)}. Thắng theo tổng tỉ số, hoà thì đá luân lưu sau lượt về.`);
      }
    });
  }
  const seed = (s, id) => s.ucl.rank.indexOf(id);
  const order = (s, x, y) => (seed(s, x) <= seed(s, y) ? [x, y] : [y, x]);
  U.progress = function (s) {
    const st = s.ucl;
    if (!st || st.stage === "done") return;
    pay(s);
    if (st.stage === "ls") {
      const ls = s.fx.filter((f) => f.lg === "ucl" && f.stage === "ls");
      if (!ls.length || ls.some((f) => !f.done)) return;
      st.rank = U.table(s).map((r) => r.id);
      st.rank.slice(24).forEach((id) => eliminated(s, id, "ls"));
      st.rank.slice(0, 8).forEach((id) => reached(s, id, "r16"));
      st.rank.slice(8, 24).forEach((id) => reached(s, id, "po"));
      // play-off: 9 gặp 24, 10 gặp 23, …, 16 gặp 17
      twoLegs(s, "po", [...Array(8).keys()].map((k) => [st.rank[8 + k], st.rank[23 - k]]));
      st.stage = "po";
      return;
    }
    const ties = st.ties.filter((t) => t.stage === st.stage);
    if (!ties.every((t) => W.resolveTie(s, t))) return;
    if (st.stage !== "f") for (const t of ties) eliminated(s, t.w === t.a ? t.b : t.a, st.stage);
    if (st.stage === "f") {
      const t = ties[0];
      st.winner = t.w;
      st.runnerUp = t.w === t.a ? t.b : t.a;
      st.stage = "done";
      if (s.clubs[t.w]) {
        s.clubs[t.w].bal += gbp(PRIZE.champ);
        if (t.w === s.user) s.clubs[s.user].conf = Math.min(100, s.clubs[s.user].conf + 15);
      }
      const f = s.fx.find((x) => x.id === t.legs[0]);
      if (W.countryOfClub(s, s.user) !== "vn") W.mail(s, "ucl", t.w === s.user ? "🏆 VÔ ĐỊCH CHAMPIONS LEAGUE!" : `${name(s, t.w)} vô địch Champions League`, `Chung kết Champions League: ${name(s, f.h)} ${f.hg}–${f.ag} ${name(s, f.a)}${f.pens ? ` (luân lưu ${f.pens.join("–")})` : ""}.${t.w === s.user ? ` Thưởng ${FM.fmtMoney(gbp(PRIZE.champ))}!` : ""}`);
      return;
    }
    const next = NEXT[st.stage];
    const win = (slot) => ties.find((t) => t.slot === slot).w;
    let pairs;
    if (st.stage === "po") {
      // hạt giống j (1–8) gặp đội thắng cặp play-off của hạng 17−j / 16+j
      pairs = [...Array(8).keys()].map((j) => order(s, st.rank[j], win(7 - j)));
    } else if (st.stage === "r16") {
      // nhánh: (1, 8), (4, 5), (2, 7), (3, 6) theo hạt giống vòng 1/8
      pairs = [[0, 7], [3, 4], [1, 6], [2, 5]].map(([x, y]) => order(s, win(x), win(y)));
    } else if (st.stage === "qf") pairs = [[0, 1], [2, 3]].map(([x, y]) => order(s, win(x), win(y)));
    else pairs = [order(s, win(0), win(1))];
    for (const [a, b] of pairs) {
      reached(s, a, next);
      reached(s, b, next);
    }
    st.stage = next;
    if (next === "f") {
      let d = koDates(s.season).f[0];
      if (d <= FM.addDays(s.date, 1)) d = FM.addDays(s.date, 3);
      const [a, b] = pairs[0];
      const f = fixture(s, "f", a, b, d, { ko: true, neutral: true });
      st.ties.push({ stage: "f", a, b, legs: [f.id], w: null, slot: 0 });
      if (a === s.user || b === s.user) W.mail(s, "ucl", "Chung kết Champions League!", `CLB gặp ${name(s, a === s.user ? b : a)} ở trận chung kết ngày ${FM.fmtDate(d, false)} trên sân trung lập.`);
    } else twoLegs(s, next, pairs);
  };
  U.finished = (s) => !s.ucl || s.ucl.stage === "done";

  // ---------- Cuối mùa ----------
  U.endOfSeason = function (s, sum) {
    if (!s.ucl) return;
    sum.ucl = { winner: s.ucl.winner, runnerUp: s.ucl.runnerUp, local: s.ucl.local.map((id) => ({ id, result: U.result(s, id) })) };
    const last = s.history[s.history.length - 1];
    if (last) last.ucl = sum.ucl;
  };

  // ---------- Cho giao diện ----------
  U.result = function (s, id) {
    const st = s.ucl;
    if (!st || !st.teams.includes(id)) return "";
    if (st.winner === id) return "Vô địch 🏆";
    if (st.runnerUp === id) return "Á quân";
    if (st.out[id]) return `Dừng ở ${STAGE_NAME[st.out[id]]}`;
    if (st.stage === "ls") {
      const r = U.table(s).findIndex((x) => x.id === id) + 1;
      return `Vòng phân hạng · hạng ${r}`;
    }
    return `Đang ở ${STAGE_NAME[st.stage]}`;
  };
  U.label = (f) => (f.stage === "ls" ? `${U.NAME} · Lượt ${f.md}` : `${U.NAME} · ${STAGE_NAME[f.stage]}${f.leg ? ` lượt ${f.leg === 1 ? "đi" : "về"}` : ""}`);
  // vua phá lưới: [{ id, g }]
  U.scorers = function (s, n = 10) {
    const g = {};
    for (const f of s.fx) if (f.lg === "ucl" && f.done && f.sc) for (const x of f.sc) g[x.id] = (g[x.id] || 0) + 1;
    return Object.entries(g)
      .map(([id, v]) => ({ id, g: v }))
      .sort((a, b) => b.g - a.g)
      .slice(0, n);
  };
})();
