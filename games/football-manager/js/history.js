// Lịch sử sự nghiệp & giải thưởng cuối mùa.
// - Sự nghiệp: các mùa thật trước khi vào game (số liệu vpf.vn, trường `hs` trong dữ liệu gốc) +
//   mỗi mùa trong game một dòng (CLB — kể cả chuyển đi / cho mượn giữa mùa —, giải, trận, bàn,
//   kiến tạo, điểm TB, cúp).
// - Giải thưởng mỗi giải đấu: cầu thủ xuất sắc nhất, vua phá lưới, cầu thủ trẻ xuất sắc (≤ 23),
//   thủ môn xuất sắc, HLV xuất sắc (vượt kỳ vọng nhiều nhất) và đội hình tiêu biểu 4-3-3.
(function () {
  "use strict";
  const FM = window.FM;
  const W = FM.World;
  const H = (FM.History = {});
  const V1 = FM.V1;
  const V2 = FM.V2;
  const r1 = (v) => Math.round(v * 10) / 10;

  // ---------- Chuyển CLB giữa mùa ----------
  // d.sc: các CLB cầu thủ đã khoác áo trong mùa (chỉ tính CLB cũ nếu đã ra sân cho họ)
  H.moved = function (d, from, to) {
    const played = d.st.ap + (d.cst ? d.cst.ap : 0) > 0;
    if (!d.sc) d.sc = played && from !== "free" ? [from] : [];
    else if (!played) d.sc = d.sc.filter((id) => id !== from);
    if (d.sc[d.sc.length - 1] !== to) d.sc.push(to);
  };

  // ---------- Giải thưởng ----------
  const avg = (p) => (p.st.ap ? p.st.rs / p.st.ap : 0);
  function score(s, p) {
    const pos = W.position(s, p.c);
    return avg(p) * 10 + p.st.g * 0.6 + p.st.as * 0.4 + p.st.mm * 0.5 + (15 - pos) * 0.25;
  }
  H.awards = function (s) {
    const out = {};
    for (const lg of [V1, V2]) {
      const all = Object.keys(s.p)
        .filter((id) => s.clubs[s.p[id].c]?.league === lg && s.p[id].st.ap >= 10)
        .map((id) => W.player(s, id));
      const sc = new Map(all.map((p) => [p.id, score(s, p)]));
      const best = (list) => list.sort((a, b) => sc.get(b.id) - sc.get(a.id))[0]?.id || null;
      const gkScore = (p) => avg(p) * 10 + p.st.cs * 0.6;
      const gks = all.filter((p) => p.pos === "GK").sort((a, b) => gkScore(b) - gkScore(a));
      // đội hình tiêu biểu 4-3-3: mỗi ô lấy người hay nhất đúng vị trí, thiếu thì lấy cùng tuyến
      const SLOTS = [["CB"], ["CB"], ["LB"], ["RB"], ["DM", "CM"], ["CM", "AM"], ["AM", "CM", "LM", "RM"], ["LW", "LM"], ["ST"], ["RW", "RM"]];
      const used = new Set(gks[0] ? [gks[0].id] : []);
      const ranked = all.filter((p) => p.st.ap >= 12).sort((a, b) => sc.get(b.id) - sc.get(a.id));
      const team = [...used];
      for (const roles of SLOTS) {
        const g = FM.POS_GROUP[roles[0]];
        const p = ranked.find((q) => !used.has(q.id) && roles.includes(q.pos)) || ranked.find((q) => !used.has(q.id) && FM.POS_GROUP[q.pos] === g);
        if (p) {
          used.add(p.id);
          team.push(p.id);
        }
      }
      // HLV: vượt kỳ vọng (thứ hạng theo sức mạnh) nhiều nhất
      const table = W.table(s, lg).map((r) => r.id);
      const byStr = W.clubsIn(s, lg).sort((a, b) => W.strength(s, b) - W.strength(s, a));
      const coach = table
        .map((id, i) => ({ id, v: byStr.indexOf(id) - i + (i === 0 ? 1.5 : 0) }))
        .sort((a, b) => b.v - a.v)[0].id;
      const mvp = best(all.filter((p) => p.st.ap >= 15));
      out[lg] = {
        mvp,
        young: best(all.filter((p) => p.age <= 23 && p.id !== mvp)),
        gk: gks[0] ? gks[0].id : null,
        top: W.topScorers(s, lg, 1)[0]?.id || null,
        team,
        coach,
        coachName: coach === s.user ? s.manager : W.baseClub(s, coach).coach || "—",
      };
    }
    return out;
  };
  H.AWARD_LABEL = { mvp: "Cầu thủ xuất sắc nhất", top: "Vua phá lưới", young: "Cầu thủ trẻ xuất sắc nhất", gk: "Thủ môn xuất sắc nhất", team: "Đội hình tiêu biểu" };

  // ---------- Ghi sự nghiệp khi hết mùa (trước khi cầu thủ mượn trở về) ----------
  H.record = function (s, sum) {
    const label = W.label(s);
    const aw = sum.awards || {};
    for (const id of Object.keys(s.p)) {
      const d = s.p[id];
      const lg = s.clubs[d.c]?.league;
      const cap = (d.cst ? d.cst.ap : 0) + (d.ast ? d.ast.ap : 0); // cúp trong nước + châu Á
      if (d.c !== "free" || d.st.ap || cap) {
        const clubs = d.sc && d.sc.length ? d.sc : [d.c];
        if (clubs[clubs.length - 1] !== d.c) clubs.push(d.c);
        (d.car ||= []).push({ s: label, c: clubs, lo: d.loan ? 1 : 0, lg: lg === V1 ? 1 : lg === V2 ? 2 : 0, ap: d.st.ap, g: d.st.g, as: d.st.as, r: d.st.ap ? r1(d.st.rs / d.st.ap) : null, cap, cg: (d.cst ? d.cst.g : 0) + (d.ast ? d.ast.g : 0) });
      }
      d.sc = null;
    }
    // danh hiệu cá nhân
    const mine = [];
    for (const lg of [V1, V2]) {
      const a = aw[lg];
      if (!a) continue;
      const lname = W.leagueName(lg);
      const give = (pid, key) => {
        if (!pid || !s.p[pid]) return;
        (s.p[pid].aw ||= []).push([label, `${H.AWARD_LABEL[key]} ${lname}`]);
        if (s.p[pid].c === s.user) mine.push(`• ${W.player(s, pid).n}: ${H.AWARD_LABEL[key]} ${lname}`);
      };
      for (const k of ["mvp", "top", "young", "gk"]) give(a[k], k);
      for (const pid of a.team) give(pid, "team");
      if (a.coach === s.user) mine.push(`• Bạn: HLV xuất sắc nhất ${lname}`);
    }
    if (mine.length) W.mail(s, "board", `Giải thưởng mùa ${label}`, `Chúc mừng! Thành viên của CLB nhận giải:\n${mine.join("\n")}`);
  };

  // ---------- Sự nghiệp để hiển thị: [{ s, clubs: [tên], loan, lg, ap, g, as, r, cap, cg, real }] ----------
  H.career = function (s, p) {
    const rows = [];
    for (const [season, club, lg, ap, g] of p.hs || []) rows.push({ s: season, clubs: [club], lg, ap, g, real: true });
    for (const x of p.car || []) rows.push({ s: x.s, clubs: x.c.map((id) => (id === "free" ? "Tự do" : W.baseClub(s, id)?.name || "?")), loan: !!x.lo, lg: x.lg, ap: x.ap, g: x.g, as: x.as, r: x.r, cap: x.cap, cg: x.cg });
    return rows;
  };
})();
