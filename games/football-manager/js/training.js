// Tập luyện.
// - Người chơi chọn giáo án (cân bằng / thể lực / kỹ thuật / chiến thuật / phục hồi) và cường
//   độ (nhẹ / vừa / nặng). Đội máy tập cân bằng, cường độ vừa.
// - Mỗi thứ Hai: cầu thủ trẻ (≤ 27 tuổi, còn khoảng cách tới tiềm năng) tích luỹ điểm phát
//   triển theo tuổi, số trận được đá, tính chuyên nghiệp và giáo án; đủ 1 điểm thì năng lực +1
//   và vài chỉ số tăng, ưu tiên nhóm chỉ số đang tập. Sa sút do tuổi vẫn tính lúc sang mùa.
// - Cường độ nặng: phát triển nhanh hơn nhưng hồi thể lực chậm, dễ chấn thương trên sân tập.
// - Độ ăn ý với từng sơ đồ (0–100): sơ đồ đang dùng tăng dần mỗi tuần (tập chiến thuật tăng
//   nhanh gấp đôi), sơ đồ bỏ không thì quên dần. Đá sơ đồ quen mạnh hơn sơ đồ mới tới 6%.
(function () {
  "use strict";
  const FM = window.FM;
  const W = FM.World;
  const A = FM.A;
  const TR = (FM.Training = {});
  const groupIdx = (name) => FM.ATTR_GROUPS.find(([g]) => g === name)[1].map((k) => A[k]);
  TR.FOCUS = [
    { name: "Cân bằng", desc: "Tập đều mọi mặt.", groups: [] },
    { name: "Thể lực", desc: "Tốc độ, thể lực, sức mạnh… Hơi dễ chấn thương hơn.", groups: ["Thể chất"], inj: 1.3 },
    { name: "Kỹ thuật", desc: "Dứt điểm, chuyền, rê bóng, phòng ngự; thủ môn tập chuyên môn.", groups: ["Kỹ thuật", "Thủ môn"] },
    { name: "Chiến thuật", desc: "Nhãn quan, quyết định, chọn vị trí… và tăng độ ăn ý sơ đồ gấp đôi.", groups: ["Tinh thần"], fam: 2 },
    { name: "Phục hồi", desc: "Hồi thể lực nhanh, ít chấn thương, gần như không phát triển.", groups: [], dev: 0.3, rec: 1.3, inj: 0.4 },
  ];
  TR.INTENSITY = [
    { name: "Nhẹ", dev: 0.7, rec: 1.15, inj: 0.4 },
    { name: "Vừa", dev: 1, rec: 1, inj: 1 },
    { name: "Nặng", dev: 1.3, rec: 0.85, inj: 2.2 },
  ];
  const FAM_NEW = 30; // sơ đồ chưa tập bao giờ
  const FAM_START = 80; // sơ đồ đội đang dùng khi bắt đầu ván
  const INJ_WEEK = 0.0025; // xác suất chấn thương trên sân tập mỗi tuần (cường độ vừa)

  TR.plan = (s, clubId) => {
    const t = (clubId === s.user && s.clubs[clubId].train) || { focus: 0, int: 1 };
    const f = TR.FOCUS[t.focus];
    const i = TR.INTENSITY[t.int];
    return { ...t, dev: (f.dev ?? 1) * i.dev, rec: (f.rec ?? 1) * i.rec, inj: (f.inj ?? 1) * i.inj, fam: f.fam ?? 1, groups: f.groups.flatMap(groupIdx) };
  };
  TR.ensure = function (s) {
    for (const id of Object.keys(s.clubs)) {
      const c = s.clubs[id];
      if (c.fam) continue;
      c.fam = {};
      if (c.formation) c.fam[c.formation] = FAM_START;
    }
    s.clubs[s.user].train ||= { focus: 0, int: 1 };
  };
  TR.familiarity = (s, clubId, formation) => {
    const c = s.clubs[clubId];
    return Math.round((c.fam && c.fam[formation || c.formation]) ?? FAM_NEW);
  };
  // hệ số sức mạnh khi ra sân với sơ đồ hiện tại: 0,94 (mới tinh) → 1 (thuộc lòng)
  TR.famMult = (s, clubId) => 0.94 + 0.06 * (TR.familiarity(s, clubId) / 100);
  TR.recovery = (s) => TR.plan(s, s.user).rec;
  // đầu mùa: sơ đồ mới của đội máy đã có cả tiền mùa giải để tập
  TR.startSeason = function (s) {
    TR.ensure(s);
    for (const id of Object.keys(s.clubs)) {
      const c = s.clubs[id];
      if (c.fam[c.formation] == null) c.fam[c.formation] = 60;
    }
  };
  TR.formationChanged = function (s) {
    TR.ensure(s);
    const c = s.clubs[s.user];
    if (c.fam[c.formation] == null) c.fam[c.formation] = FAM_NEW;
  };
  TR.set = function (s, key, v) {
    TR.ensure(s);
    s.clubs[s.user].train[key] = v;
  };

  // ---------- Mỗi tuần (thứ Hai) ----------
  TR.weekly = function (s) {
    TR.ensure(s);
    const rnd = FM.rng(FM.hash(`train-${s.date}-${s.seed}`));
    // số trận mỗi CLB đã đá mùa này (để biết ai được ra sân thường xuyên)
    const played = {};
    for (const f of s.fx) if (f.done) for (const id of [f.h, f.a]) played[id] = (played[id] || 0) + 1;
    const plans = {};
    for (const id of Object.keys(s.clubs)) {
      const plan = (plans[id] = TR.plan(s, id));
      const c = s.clubs[id];
      for (const f of Object.keys(c.fam)) {
        if (f === c.formation) c.fam[f] = Math.min(100, c.fam[f] + 4 * plan.fam);
        else c.fam[f] = Math.max(FAM_NEW, c.fam[f] - 1.5);
      }
      if (c.fam[c.formation] == null) c.fam[c.formation] = FAM_NEW;
    }
    const gains = [];
    for (const id of Object.keys(s.p)) {
      const d = s.p[id];
      if (d.c === "free" || !plans[d.c]) continue;
      const plan = plans[d.c];
      const p = W.player(s, id);
      // chấn thương trên sân tập
      if (!d.inj && rnd() < INJ_WEEK * plan.inj * (0.7 + p.hid[1] / 20)) {
        const days = rnd.int(3, 14);
        d.inj = FM.addDays(s.date, days);
        d.injName = rnd.pick(["căng cơ khi tập", "lật cổ chân trên sân tập", "va chạm khi tập", "đau lưng"]);
        if (d.c === s.user) W.mail(s, "medical", `${p.sn} chấn thương trên sân tập`, `${p.n} bị ${d.injName}, nghỉ khoảng ${days} ngày (đến ${FM.fmtDate(d.inj, false)}).${plan.int === 2 ? " Tập cường độ nặng làm tăng nguy cơ chấn thương." : ""}`);
      }
      // dấu ▲ chỉ hiện 30 ngày; xoá dấu cũ cho save gọn
      if (d.up) {
        for (const i in d.up) if (FM.daysBetween(d.up[i], s.date) > 30) delete d.up[i];
        if (!Object.keys(d.up).length) d.up = null;
      }
      const g = weeklyGain(p, d, plan, played[d.c] || 0);
      if (!g) continue;
      d.dp = Math.round(((d.dp || 0) + g) * 1000) / 1000;
      while (d.dp >= 1 && d.ca < p.pa) {
        d.dp -= 1;
        improve(s, p, d, plan, rnd);
        if (d.c === s.user) gains.push(id);
      }
      if (d.ca >= p.pa) d.dp = 0;
    }
    if (gains.length) (s.trainLog ||= []).push(...gains.map((id) => ({ id, d: s.date })));
  };
  function weeklyGain(p, d, plan, clubPlayed) {
    const gap = Math.max(0, p.pa - d.ca);
    if (!gap) return 0;
    let annual;
    if (p.age <= 23) annual = Math.min(gap, (24 - p.age) * 1.5 + 2) * 0.65;
    else if (p.age <= 27) annual = Math.min(gap, 3) * 0.45;
    else return 0;
    const apps = d.st.ap + (d.cst ? d.cst.ap : 0);
    const play = 0.55 + 0.45 * Math.min(1, apps / Math.max(4, clubPlayed * 0.6));
    const prof = 0.75 + p.hid[2] / 40;
    const mood = d.mor < 35 ? 0.8 : d.mor > 75 ? 1.1 : 1; // buồn thì tập uể oải
    return (annual / 44) * plan.dev * play * prof * mood;
  }
  // +1 năng lực: tăng 4 chỉ số, ưu tiên chỉ số quan trọng của vị trí và nhóm đang tập
  function improve(s, p, d, plan, rnd) {
    const a = (d.a ||= [...p.a]);
    const w = FM.PROFILE_W[p.pos];
    const gk = p.pos === "GK";
    const pool = FM.ATTRS.map((k, i) => i).filter((i) => a[i] < 20 && (gk ? w[i] > 0 : i < A.reflexes));
    for (let n = 0; n < 4 && pool.length; n++) {
      const i = rnd.weighted(pool, (j) => (0.3 + w[j]) * (plan.groups.includes(j) ? 3 : 1));
      a[i]++;
      (d.up ||= {})[i] = s.date;
      pool.splice(pool.indexOf(i), 1);
    }
    d.ca++;
    d.dg = (d.dg || 0) + 1;
  }

  // báo cáo đầu tháng cho người chơi
  TR.monthly = function (s) {
    const log = s.trainLog || [];
    s.trainLog = [];
    if (!log.length) return;
    const by = {};
    for (const e of log) if (s.p[e.id] && s.p[e.id].c === s.user) by[e.id] = (by[e.id] || 0) + 1;
    const lines = Object.entries(by)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => {
        const p = W.player(s, id);
        return `• ${p.n} (${p.age} tuổi, ${FM.POS_LABEL[p.pos]}): +${n} năng lực`;
      });
    if (!lines.length) return;
    const plan = TR.plan(s, s.user);
    W.mail(s, "training", `Báo cáo tập luyện: ${lines.length} cầu thủ tiến bộ`, `Giáo án: ${TR.FOCUS[plan.focus].name}, cường độ ${TR.INTENSITY[plan.int].name.toLowerCase()}.\n\n${lines.join("\n")}\n\nCầu thủ trẻ, được đá nhiều và chuyên nghiệp thì tiến bộ nhanh nhất.`);
  };
  // sang mùa: xoá dấu tiến bộ của mùa cũ
  TR.newSeason = function (s) {
    for (const d of Object.values(s.p)) {
      d.dg = 0;
      d.up = null;
    }
    s.trainLog = [];
  };
})();
