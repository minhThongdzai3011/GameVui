// Tuyển trạch (sương mù thông tin).
// - Mỗi cầu thủ ngoài CLB có "độ hiểu biết" 0–100: cầu thủ cùng giải biết sơ sơ, khác giải /
//   tự do gần như không biết gì, tuyển thủ Việt Nam / U23 được biết nhiều hơn. Đá với đội nào
//   thì biết thêm về những người ra sân của đội đó.
// - Hiểu biết thấp: chỉ số hiện dạng khoảng (11–15), năng lực / tiềm năng / giá trị là ước tính
//   có sai số; dưới 25 thì chưa thấy chỉ số nào. Từ 90 trở lên thấy chính xác.
// - Cử tuyển trạch viên theo dõi một cầu thủ (vài ngày) hoặc cả một CLB (lâu hơn, ít chi tiết
//   hơn); số việc cùng lúc tuỳ uy tín CLB. Xong việc có báo cáo: vai trò ở đội bạn, điểm mạnh /
//   yếu, tính cách, giá CLB chủ quản có thể đòi, lương cầu thủ đòi, và khuyến nghị.
// - Chỉ ảnh hưởng thứ người chơi nhìn thấy; máy và trận đấu dùng chỉ số thật.
(function () {
  "use strict";
  const FM = window.FM;
  const W = FM.World;
  const SC = (FM.Scout = {});
  const FREE = "free";
  const EXACT = 90; // từ mức này trở lên thấy chỉ số chính xác
  const HIDDEN = 25; // dưới mức này chưa thấy chỉ số
  const CLUB_LEVEL = 75; // tuyển trạch cả CLB đưa mọi cầu thủ lên mức này
  const COST = { player: 0.02, club: 0.08 }; // tỷ VND
  SC.EXACT = EXACT;
  SC.HIDDEN = HIDDEN;
  SC.COST = COST;
  const unit = (key) => (FM.hash(key) % 10007) / 10007; // 0..1 cố định theo khoá

  SC.ensure = (s) => (s.sc ||= { kn: {}, jobs: [], seq: 0, reports: {} });
  SC.slots = (s) => (W.baseClub(s, s.user).rep >= 60 ? 3 : 2);
  // mức biết sẵn, chưa cần cử ai đi xem
  SC.base = function (s, p) {
    if (p.c === s.user) return 100;
    let k = p.c === FREE ? 15 : s.clubs[p.c] && s.clubs[p.c].league === s.clubs[s.user].league ? 30 : 15;
    if (p.nt === "senior") k = Math.max(k, 60);
    else if (p.nt === "u23") k = Math.max(k, 45);
    return k;
  };
  // việc tuyển trạch đang theo dõi cầu thủ này (nếu có) và mức đã đạt tới hôm nay
  function jobLevel(s, p) {
    let best = 0;
    for (const j of s.sc.jobs) {
      if (j.kind === "player" ? j.target !== p.id : j.target !== p.c) continue;
      const goal = j.kind === "player" ? 100 : CLUB_LEVEL;
      const k0 = j.k0[p.id] ?? SC.base(s, p);
      const frac = FM.clamp(FM.daysBetween(j.d0, s.date) / Math.max(1, FM.daysBetween(j.d0, j.end)), 0, 1);
      best = Math.max(best, Math.round(k0 + (goal - k0) * frac));
    }
    return best;
  }
  SC.know = function (s, p) {
    if (p.c === s.user) return 100;
    SC.ensure(s);
    return Math.max(SC.base(s, p), s.sc.kn[p.id] || 0, s.sc.jobs.length ? jobLevel(s, p) : 0);
  };
  const fog = (k) => (k >= EXACT ? 0 : (100 - k) / 100);

  // ---------- Giá trị ước tính ----------
  // sai số cố định trong mùa (không nhảy lung tung mỗi lần mở), thu hẹp dần khi biết nhiều hơn
  SC.estCa = (s, p, k = SC.know(s, p)) => FM.clamp(Math.round(p.ca + (unit(`ca-${p.id}-${s.season}`) - 0.5) * 24 * fog(k)), 20, 95);
  SC.estPa = (s, p, k = SC.know(s, p)) => {
    const est = Math.round(p.pa + (unit(`pa-${p.id}-${s.season}`) - 0.5) * 36 * fog(k));
    return FM.clamp(Math.max(est, SC.estCa(s, p, k)), 20, 95);
  };
  // giá trị là thông tin thị trường nên sai số chỉ bằng nửa sai số năng lực
SC.estVal = (s, p, k = SC.know(s, p)) => Math.max(0.1, Math.round(p.val * Math.exp((SC.estCa(s, p, k) - p.ca) * 0.055) * 10) / 10);
  // chỉ số dạng khoảng: [thấp, cao] (bằng nhau khi đã biết chính xác), null khi chưa thấy
  SC.attrRange = function (s, p, i, k = SC.know(s, p)) {
    const v = p.a[i];
    if (k < HIDDEN) return null;
    const width = Math.round(fog(k) * 7);
    if (!width) return [v, v];
    let lo = v - Math.floor(unit(`a-${p.id}-${i}-${s.season}`) * (width + 1));
    lo = FM.clamp(lo, 1, 20 - width);
    return [lo, lo + width];
  };

  // ---------- Giao việc ----------
  const sameLeague = (s, clubId) => clubId !== FREE && s.clubs[clubId] && s.clubs[clubId].league === s.clubs[s.user].league;
  SC.duration = (s, kind, target) => (kind === "club" ? (sameLeague(s, target) ? 14 : 18) : sameLeague(s, W.player(s, target).c) ? 5 : 8);
  SC.jobFor = (s, kind, target) => SC.ensure(s).jobs.find((j) => j.kind === kind && j.target === target) || null;
  SC.start = function (s, kind, target) {
    const sc = SC.ensure(s);
    if (sc.jobs.length >= SC.slots(s)) return { error: `Cả ${SC.slots(s)} tuyển trạch viên đều đang bận. Huỷ bớt một việc hoặc chờ báo cáo.` };
    if (SC.jobFor(s, kind, target)) return { error: "Đã có người đang theo dõi." };
    const c = s.clubs[s.user];
    if (c.bal < COST[kind]) return { error: "Không đủ tiền để cử người đi." };
    const players = kind === "player" ? [W.player(s, target)] : W.squad(s, target);
    if (kind === "player" && (!players[0] || players[0].c === s.user)) return { error: "Không cần tuyển trạch cầu thủ của đội mình." };
    if (kind === "player" && players[0].foreignClub) return { error: "Cầu thủ CLB nước ngoài: hãy tuyển trạch cả đội." };
    const k0 = {};
    for (const p of players) k0[p.id] = SC.know(s, p);
    const days = SC.duration(s, kind, target);
    const job = { id: ++sc.seq, kind, target, d0: s.date, end: FM.addDays(s.date, days), k0 };
    sc.jobs.push(job);
    c.bal = Math.round((c.bal - COST[kind]) * 100) / 100;
    return { job, days };
  };
  SC.cancel = function (s, id) {
    const sc = SC.ensure(s);
    const j = sc.jobs.find((x) => x.id === id);
    if (!j) return;
    // giữ lại phần đã tìm hiểu được
    const players = j.kind === "player" ? [W.player(s, j.target)].filter(Boolean) : W.squad(s, j.target);
    for (const p of players) sc.kn[p.id] = Math.max(sc.kn[p.id] || 0, SC.know(s, p));
    sc.jobs = sc.jobs.filter((x) => x !== j);
  };
  SC.progress = (s, j) => FM.clamp(FM.daysBetween(j.d0, s.date) / Math.max(1, FM.daysBetween(j.d0, j.end)), 0, 1);

  // ---------- Mỗi ngày ----------
  SC.daily = function (s) {
    const sc = SC.ensure(s);
    for (const id in s.p) if (s.p[id].c === s.user) sc.kn[id] = 100; // người đã qua đội mình thì biết rõ
    const done = sc.jobs.filter((j) => j.end <= s.date);
    if (!done.length) return;
    sc.jobs = sc.jobs.filter((j) => j.end > s.date);
    for (const j of done) {
      if (j.kind === "player") {
        const p = W.player(s, j.target);
        if (!p) continue;
        sc.kn[p.id] = 100;
        const r = SC.report(s, p);
        sc.reports[p.id] = { d: s.date, season: s.season, grade: r.grade };
        W.mail(s, "scout", `Báo cáo tuyển trạch: ${p.sn} (${r.grade})`, `${p.n} · ${p.age} tuổi · ${FM.POS_NAME[p.pos]} · ${clubName(s, p.c)}\n\n${r.lines.join("\n")}\n\nXem chi tiết trong hồ sơ cầu thủ.`);
      } else {
        const squad = W.squad(s, j.target);
        for (const p of squad) sc.kn[p.id] = Math.max(sc.kn[p.id] || 0, CLUB_LEVEL);
        const top = squad.sort((a, b) => b.ca - a.ca).slice(0, 4);
        const young = squad.filter((p) => p.age <= 21 && !top.includes(p)).sort((a, b) => b.pa - a.pa).slice(0, 2);
        const line = (p) => `• ${p.n} (${FM.POS_LABEL[p.pos]}, ${p.age} tuổi) — ${SC.roleAtUser(s, p).label.toLowerCase()} ở đội ta`;
        W.mail(s, "scout", `Báo cáo tuyển trạch: ${clubName(s, j.target)}`, `Tuyển trạch viên đã theo dõi ${clubName(s, j.target)} (${squad.length} cầu thủ). Chỉ số cả đội giờ đã rõ hơn nhiều.\n\nCầu thủ đáng chú ý nhất:\n${top.map(line).join("\n")}${young.length ? `\n\nTài năng trẻ:\n${young.map(line).join("\n")}` : ""}\n\nMuốn biết chính xác từng người thì cử tuyển trạch riêng cầu thủ đó.`);
      }
    }
  };
  const clubName = (s, id) => (id === FREE ? "tự do" : W.baseClub(s, id).name);

  // sau trận của người chơi: biết thêm về những người đối thủ đã cho ra sân
  SC.afterMatch = function (s, side) {
    const sc = SC.ensure(s);
    for (const L of Object.values(side.live)) {
      if (L.from === null) continue;
      const p = W.player(s, L.id);
      if (p && p.c !== s.user) sc.kn[p.id] = Math.max(sc.kn[p.id] || 0, Math.min(60, SC.know(s, p) + 10));
    }
  };
  // mùa mới: cầu thủ phát triển / sa sút nên thông tin cũ bớt chính xác
  SC.newSeason = function (s) {
    const sc = SC.ensure(s);
    for (const id of Object.keys(sc.kn)) {
      if (!s.p[id]) delete sc.kn[id];
      else if (s.p[id].c !== s.user) {
        sc.kn[id] = Math.min(sc.kn[id], 70);
        if (sc.kn[id] <= 30) delete sc.kn[id];
      }
    }
    for (const id of Object.keys(sc.reports)) if (!s.p[id] || s.p[id].c === s.user) delete sc.reports[id];
    sc.jobs = [];
  };

  // ---------- Báo cáo ----------
  const GROUP_STARTERS = { GK: 1, DF: 4, MF: 4, FW: 2 };
  // nếu về đội người chơi thì người này đứng ở đâu so với những người cùng tuyến
  SC.roleAtUser = function (s, p) {
    const g = FM.POS_GROUP[p.pos];
    const mates = W.squad(s, s.user).filter((q) => q.id !== p.id && FM.POS_GROUP[q.pos] === g);
    const rank = mates.filter((q) => q.ca > p.ca).length;
    const n = GROUP_STARTERS[g];
    if (rank === 0 && p.ca >= W.strength(s, s.user) + 3) return { key: "key", label: "Trụ cột", rank };
    if (rank < n) return { key: "starter", label: "Đá chính", rank };
    if (rank < n * 2) return { key: "squad", label: "Dự bị", rank };
    return { key: "surplus", label: "Không cần thiết", rank };
  };
  SC.traits = function (p) {
    const [cons, inj, pro] = p.hid || [10, 8, 10];
    const t = [];
    if (pro >= 14) t.push("Rất chuyên nghiệp");
    else if (pro <= 7) t.push("Thiếu chuyên nghiệp");
    if (cons >= 14) t.push("Phong độ ổn định");
    else if (cons <= 7) t.push("Phong độ thất thường");
    if (inj >= 11) t.push("Dễ chấn thương");
    else if (inj <= 4) t.push("Thể trạng bền bỉ");
    return t.length ? t : ["Không có gì đặc biệt"];
  };
  SC.report = function (s, p) {
    const role = SC.roleAtUser(s, p);
    const growth = p.age <= 23 && p.pa - p.ca >= 8;
    const futureStar = growth && p.pa >= W.strength(s, s.user) + 4;
    const grade = role.key === "key" || (role.key === "starter" && futureStar) ? "A" : role.key === "starter" || futureStar ? "B" : role.key === "squad" ? "C" : "D";
    const verdict = { A: "Nên mua ngay nếu đủ tiền", B: "Đáng cân nhắc", C: "Phương án dự phòng", D: "Không phù hợp với đội ta" }[grade];
    // điểm mạnh / yếu trong các chỉ số quan trọng của vị trí
    const w = FM.PROFILE_W[p.pos];
    const keys = FM.ATTRS.map((k, i) => i).filter((i) => w[i] >= 0.6);
    const byVal = keys.slice().sort((a, b) => p.a[b] - p.a[a]);
    const label = (i) => `${FM.ATTR_LABEL[FM.ATTRS[i]].toLowerCase()} ${p.a[i]}`;
    const weak = byVal.filter((i) => p.a[i] <= 10).slice(-2).reverse();
    const lines = [
      `Đánh giá: ${grade} — ${verdict}.`,
      `Nếu về đội ta: ${role.label.toLowerCase()}${role.key === "surplus" ? "" : ` (xếp thứ ${role.rank + 1} ở tuyến ${{ GK: "thủ môn", DF: "phòng ngự", MF: "tiền vệ", FW: "tấn công" }[FM.POS_GROUP[p.pos]]})`}.`,
      growth ? `Tiềm năng: còn phát triển được nhiều${futureStar ? ", có thể thành trụ cột trong vài mùa" : ""}.` : p.age >= 31 ? "Tiềm năng: đã qua đỉnh cao, sẽ sa sút dần." : "Tiềm năng: đã gần chạm trần.",
      `Điểm mạnh: ${byVal.slice(0, 3).map(label).join(", ")}.`,
      `Điểm yếu: ${weak.length ? weak.map(label).join(", ") : "không có điểm yếu rõ rệt"}.`,
      `Tính cách: ${SC.traits(p).join(", ").toLowerCase()}.`,
    ];
    const T = FM.Transfers;
    if (T && p.c !== FREE) lines.push(`Giá ${clubName(s, p.c)} có thể đòi: khoảng ${FM.fmtMoney(Math.ceil(T.asking(s, p) * 2) / 2)} (${T.ROLE_LABEL[T.role(s, p)].toLowerCase()} ở CLB hiện tại).`);
    if (T) {
      const dem = T.demand(s, p, s.user, "sign");
      lines.push(dem.refuse ? `Lương: ${dem.refuse}` : `Lương có thể đòi: khoảng ${FM.fmtWage(dem.wage)}, hợp đồng ${dem.years} năm.`);
    }
    return { grade, verdict, role, lines };
  };
})();
