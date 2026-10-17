// Cúp trong nước.
// - Siêu Cúp Quốc gia: đầu mùa, sân trung lập — vô địch V.League 1 gặp vô địch Cúp mùa trước
//   (cùng một đội thì lấy á quân V.League 1). Mùa đầu chưa có dữ liệu Cúp: hai đội uy tín nhất.
// - Cúp Quốc gia: 28 đội V.League 1 + 2, loại trực tiếp một trận, hoà đá luân lưu. Vòng loại
//   12 cặp (4 đội mạnh nhất V.League 1 miễn đá), rồi 1/8, tứ kết, bán kết, chung kết (sân trung
//   lập). Đá thứ Tư giữa các vòng giải; đội hạng dưới được làm chủ nhà khi gặp đội hạng trên.
(function () {
  "use strict";
  const FM = window.FM;
  const W = FM.World;
  const V1 = FM.V1;
  const C = (FM.Cups = {});
  // after: đá vào thứ Tư sau vòng giải này
  const ROUNDS = [
    { name: "Vòng loại", after: 3 },
    { name: "Vòng 1/8", after: 8 },
    { name: "Tứ kết", after: 13 },
    { name: "Bán kết", after: 20 },
    { name: "Chung kết", after: 24, neutral: true },
  ];
  const BYES = 4;
  const PRIZE = { winner: 3, runnerUp: 1.5, super: 1 }; // tỷ VND
  C.roundName = (r) => ROUNDS[r]?.name || "";
  const name = (s, id) => W.baseClub(s, id).name;
  const winnerOf = (f) => (f.hg > f.ag || (f.hg === f.ag && f.pens && f.pens[0] > f.pens[1]) ? f.h : f.a);
  const leagueRoundDate = (s, n) => s.fx.find((f) => f.lg === V1 && f.rd === n)?.d;

  C.start = function (s) {
    const rnd = FM.rng(FM.hash(`cup-${s.season}-${s.seed}`));
    const v1 = W.clubsIn(s, V1).sort((a, b) => W.strength(s, b) - W.strength(s, a));
    s.cup = { season: s.season, round: 0, alive: [...W.clubsIn(s, V1), ...W.clubsIn(s, FM.V2)], byes: v1.slice(0, BYES), winner: null, runnerUp: null, superWinner: null, out: {} };
    // Siêu Cúp
    const exists = (id) => id && s.clubs[id];
    let a = exists(s.prevChamp) ? s.prevChamp : null;
    let b = exists(s.prevCupWinner) ? s.prevCupWinner : null;
    if (!a || !b || a === b) {
      const ranked = exists(s.prevChamp) ? [s.prevChamp, ...(s.prevRunnerUp && exists(s.prevRunnerUp) ? [s.prevRunnerUp] : [])] : [];
      const byRep = W.clubsIn(s, V1).sort((x, y) => W.baseClub(s, y).rep - W.baseClub(s, x).rep);
      const pool = [...ranked, ...byRep].filter((id, i, arr) => arr.indexOf(id) === i);
      a = a || pool[0];
      b = pool.find((id) => id !== a);
    }
    s.fx.push({ id: `${s.season}-sc`, lg: "super", rd: 0, d: FM.addDays(s.date, 4), h: a, a: b, hg: null, ag: null, done: false, ko: true, neutral: true });
    draw(s, rnd);
  };

  function draw(s, rnd) {
    const r = s.cup.round;
    const R = ROUNDS[r];
    const teams = (r === 0 ? s.cup.alive.filter((id) => !s.cup.byes.includes(id)) : [...s.cup.alive]).sort(() => rnd() - 0.5);
    let d = FM.addDays(leagueRoundDate(s, R.after) || s.date, 4);
    if (d <= s.date) d = FM.addDays(s.date, 3);
    const mine = [];
    for (let i = 0; i + 1 < teams.length; i += 2) {
      let [h, a] = [teams[i], teams[i + 1]];
      const tier = (id) => (s.clubs[id].league === V1 ? 1 : 2);
      if (!R.neutral && tier(a) > tier(h)) [h, a] = [a, h]; // đội hạng dưới làm chủ nhà
      const f = { id: `${s.season}-cup-${r}-${h}`, lg: "cup", rd: r, d, h, a, hg: null, ag: null, done: false, ko: true, neutral: !!R.neutral };
      s.fx.push(f);
      if (h === s.user || a === s.user) mine.push(f);
    }
    for (const f of mine) {
      const opp = f.h === s.user ? f.a : f.h;
      W.mail(s, "cup", `Cúp Quốc gia · ${R.name}: gặp ${name(s, opp)}`, `Kết quả bốc thăm ${R.name} Cúp Quốc gia: ${name(s, f.h)} – ${name(s, f.a)}, ${FM.fmtDate(f.d)}${f.neutral ? " (sân trung lập)" : f.h === s.user ? " (sân nhà)" : " (sân khách)"}. Đá loại trực tiếp một trận, hoà thì đá luân lưu.`);
    }
    if (r === 0 && s.cup.byes.includes(s.user)) W.mail(s, "cup", "Cúp Quốc gia: được miễn vòng loại", `Là một trong ${BYES} đội mạnh nhất V.League 1, CLB vào thẳng vòng 1/8 Cúp Quốc gia.`);
  }

  // sau mỗi ngày thi đấu: xong một vòng thì bốc thăm vòng sau
  C.progress = function (s) {
    const cup = s.cup;
    if (!cup) return;
    const sc = s.fx.find((f) => f.lg === "super" && f.done);
    if (sc && !cup.superWinner) {
      cup.superWinner = winnerOf(sc);
      s.clubs[cup.superWinner].bal += PRIZE.super;
      if (sc.h === s.user || sc.a === s.user) {
        const won = cup.superWinner === s.user;
        if (won) s.clubs[s.user].conf = Math.min(100, s.clubs[s.user].conf + 4);
        W.mail(s, "cup", won ? "🏆 Vô địch Siêu Cúp Quốc gia!" : "Lỡ Siêu Cúp Quốc gia", won ? `CLB giành Siêu Cúp sau khi thắng ${name(s, sc.h === s.user ? sc.a : sc.h)}. Thưởng ${FM.fmtMoney(PRIZE.super)}.` : `CLB thua ${name(s, cup.superWinner)} ở trận tranh Siêu Cúp.`);
      }
    }
    if (cup.winner) return;
    const ties = s.fx.filter((f) => f.lg === "cup" && f.rd === cup.round);
    if (!ties.length || ties.some((f) => !f.done)) return;
    const winners = ties.map(winnerOf);
    for (const f of ties) {
      const loser = winnerOf(f) === f.h ? f.a : f.h;
      cup.out[loser] = cup.round;
      if (loser === s.user && cup.round < ROUNDS.length - 1) W.mail(s, "cup", `Bị loại khỏi Cúp Quốc gia`, `CLB dừng bước ở ${ROUNDS[cup.round].name} sau trận gặp ${name(s, winnerOf(f))}.`);
    }
    if (cup.round === ROUNDS.length - 1) {
      const fin = ties[0];
      cup.winner = winners[0];
      cup.runnerUp = winners[0] === fin.h ? fin.a : fin.h;
      s.clubs[cup.winner].bal += PRIZE.winner;
      s.clubs[cup.runnerUp].bal += PRIZE.runnerUp;
      const pens = fin.pens ? ` (luân lưu ${fin.pens.join("–")})` : "";
      if (cup.winner === s.user) s.clubs[s.user].conf = Math.min(100, s.clubs[s.user].conf + 10);
      if (W.countryOfClub(s, s.user) === "vn") W.mail(s, "cup", cup.winner === s.user ? "🏆 VÔ ĐỊCH CÚP QUỐC GIA!" : `${name(s, cup.winner)} vô địch Cúp Quốc gia`, `Chung kết: ${name(s, fin.h)} ${fin.hg}–${fin.ag} ${name(s, fin.a)}${pens}.${cup.winner === s.user ? ` Thưởng ${FM.fmtMoney(PRIZE.winner)}, ban lãnh đạo rất hài lòng!` : cup.runnerUp === s.user ? ` Á quân được thưởng ${FM.fmtMoney(PRIZE.runnerUp)}.` : ""}`);
      return;
    }
    cup.alive = cup.round === 0 ? [...winners, ...cup.byes] : winners;
    cup.round++;
    draw(s, FM.rng(FM.hash(`cup-${s.season}-${cup.round}-${s.seed}`)));
  };
  C.finished = (s) => !s.cup || !!s.cup.winner;

  // cuối mùa: nhớ nhà vô địch cho Siêu Cúp mùa sau, ghi danh hiệu vào tổng kết
  C.endOfSeason = function (s, sum) {
    s.prevChamp = sum.champions[V1];
    const t1 = W.table(s, V1);
    s.prevRunnerUp = t1[1] && t1[1].id;
    s.prevCupWinner = s.cup ? s.cup.winner : null;
    sum.cup = s.cup ? { winner: s.cup.winner, runnerUp: s.cup.runnerUp, superWinner: s.cup.superWinner } : null;
    const last = s.history[s.history.length - 1];
    if (last) last.cup = sum.cup;
  };

  // vòng đấu của Cúp cho giao diện: [{ name, ties: [fixture] }]
  C.rounds = (s) =>
    ROUNDS.map((R, r) => ({ name: R.name, ties: s.fx.filter((f) => f.lg === "cup" && f.rd === r) })).filter((x) => x.ties.length || x === undefined);
  C.userStatus = function (s) {
    const cup = s.cup;
    if (!cup) return "";
    if (cup.winner === s.user) return "Vô địch 🏆";
    if (cup.out[s.user] !== undefined) return `Bị loại ở ${ROUNDS[cup.out[s.user]].name}`;
    if (cup.winner) return "Bị loại";
    if (cup.round === 0 && cup.byes.includes(s.user)) return "Miễn vòng loại, chờ vòng 1/8";
    return `Đang ở ${ROUNDS[cup.round].name}`;
  };
})();
