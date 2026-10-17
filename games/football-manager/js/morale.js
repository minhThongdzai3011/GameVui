// Tâm lý cầu thủ (đội người chơi).
// - Mỗi cầu thủ kỳ vọng thời gian ra sân theo vị thế trong đội (trụ cột / đá chính / dự bị).
//   Mỗi thứ Hai xét 6 trận gần nhất (đá chính = 1, vào sân từ ghế dự bị = 0,5, vắng vì chấn
//   thương / treo giò thì không tính): thiếu thì bực dần → phàn nàn → đòi ra đi.
// - Nói chuyện riêng (14 ngày một lần mỗi người): khen, nhắc nhở, hứa cho ra sân, thuyết phục ở lại.
//   Lời hứa có hạn 6 tuần: giữ lời thì vui hẳn, thất hứa thì đòi ra đi.
// - Họp đội (14 ngày một lần): khen cả đội, đòi hỏi nhiều hơn, giải toả áp lực — hiệu quả tuỳ
//   phong độ gần đây và tính chuyên nghiệp.
// - Ký / gia hạn hợp đồng kèm lời hứa suất đá chính thì cầu thủ bớt 10% lương đòi hỏi.
// - Tâm lý ảnh hưởng sức mạnh trong trận (engine), tốc độ phát triển (training) và gia hạn hợp đồng.
(function () {
  "use strict";
  const FM = window.FM;
  const W = FM.World;
  const M = (FM.Morale = {});
  const COOLDOWN = 14;
  const PROMISE_DAYS = 42;
  const NEED = { key: 3, starter: 2, squad: 0.5, surplus: 0 };
  const GROUP_STARTERS = { GK: 1, DF: 4, MF: 4, FW: 2 };
  const COMPLAIN = 4; // số tuần bực liên tiếp thì phàn nàn
  const WANTS_OUT = 10; // … thì đòi ra đi
  M.ROLE_LABEL = { key: "Trụ cột", starter: "Đá chính", squad: "Xoay tua", surplus: "Dự bị" };

  // vị thế trong đội theo tuyến: trụ cột (3 người giỏi nhất), đá chính, xoay tua, dự bị
  M.role = function (s, p) {
    const squad = W.squad(s, s.user).filter((q) => !q.loan);
    if (squad.filter((q) => q.ca > p.ca).length < 3) return "key";
    const g = FM.POS_GROUP[p.pos];
    const better = squad.filter((q) => FM.POS_GROUP[q.pos] === g && q.ca > p.ca).length;
    const n = GROUP_STARTERS[g];
    return better < n ? "starter" : better < n * 2 && g !== "GK" ? "squad" : "surplus";
  };
  // mức ra sân cần có trong 6 trận (cầu thủ trẻ ≤ 21 và lão tướng ≥ 32 ngồi dự bị thì kiên nhẫn)
  M.need = (s, p) => {
    const r = M.role(s, p);
    return r === "squad" && (p.age <= 21 || p.age >= 32) ? 0 : NEED[r];
  };
  M.played = (d) => (d.pt || []).reduce((a, x) => a + (x ?? 0), 0);
  const counted = (d) => (d.pt || []).filter((x) => x !== null).length;
  // phong độ: điểm trung bình 3 trận gần nhất
  M.form = (d) => {
    const r = (d.rr || []).slice(-3);
    return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
  };
  M.target = (d) => (d.wantsOut ? 30 : (d.unhappy || 0) >= COMPLAIN ? 40 : 55);
  M.reset = (d) => {
    d.pt = d.rr = d.promise = d.talk = null;
    d.unhappy = 0;
    d.wantsOut = false;
  };
  const add = (d, v) => (d.mor = FM.clamp(Math.round(d.mor + v), 0, 100));

  // ---------- Sau mỗi trận của người chơi ----------
  M.afterMatch = function (s, side) {
    for (const p of W.squad(s, s.user)) {
      const d = s.p[p.id];
      const L = side.live[p.id];
      const v = L && L.from !== null ? (L.from === 0 ? 1 : 0.5) : !p.available ? null : 0;
      (d.pt ||= []).push(v);
      if (d.pt.length > 6) d.pt.shift();
      if (L && L.from !== null) {
        (d.rr ||= []).push(L.rating);
        if (d.rr.length > 5) d.rr.shift();
      }
    }
  };

  // ---------- Mỗi thứ Hai ----------
  M.weekly = function (s) {
    for (const p of W.squad(s, s.user)) {
      const d = s.p[p.id];
      if (p.loan) continue;
      // lời hứa đến hạn
      if (d.promise && d.promise.due <= s.date) {
        const ok = M.played(d) >= d.promise.need;
        d.promise = null;
        if (ok) {
          add(d, 12);
          d.unhappy = 0;
          W.mail(s, "morale", `${p.sn} hài lòng`, `Bạn đã giữ lời hứa cho ${p.n} ra sân nhiều hơn. Cầu thủ rất vui.`);
        } else {
          add(d, -25);
          d.wantsOut = true;
          W.mail(s, "morale", `${p.sn} thấy bị lừa dối`, `Bạn đã hứa cho ${p.n} ra sân nhiều hơn nhưng không giữ lời. Cầu thủ yêu cầu được ra đi.\n\nRao bán, hoặc nói chuyện thuyết phục cậu ấy ở lại.`);
        }
        continue;
      }
      if (counted(d) < 4 || d.promise) continue;
      const need = M.need(s, p);
      if (M.played(d) < need) {
        d.unhappy = (d.unhappy || 0) + 1;
        add(d, -4);
        if (d.unhappy === COMPLAIN) W.mail(s, "morale", `${p.sn} muốn được ra sân nhiều hơn`, `${p.n} (${M.ROLE_LABEL[M.role(s, p)].toLowerCase()} của đội) chỉ được ra sân ${fmtPlayed(d)} trong 6 trận gần đây và tỏ ra không vui.\n\nCho cậu ấy đá nhiều hơn hoặc nói chuyện riêng (trong hồ sơ cầu thủ).`);
        if (d.unhappy === WANTS_OUT && !d.wantsOut) {
          d.wantsOut = true;
          W.mail(s, "morale", `${p.sn} đòi ra đi`, `${p.n} chán cảnh ngồi ngoài và yêu cầu được chuyển đi. Các CLB khác sẽ để ý nếu cậu ấy được rao bán.`);
        }
      } else if (d.unhappy) d.unhappy = Math.max(0, d.unhappy - 1);
    }
  };
  const fmtPlayed = (d) => `${String(M.played(d)).replace(".", ",")}/6 trận`;

  // ---------- Lời hứa ----------
  M.promise = function (s, pid) {
    const d = s.p[pid];
    const p = W.player(s, pid);
    d.promise = { due: FM.addDays(s.date, PROMISE_DAYS), need: Math.max(2, M.need(s, p)) };
    d.pt = []; // tính lại từ hôm nay
  };

  // ---------- Nói chuyện riêng ----------
  M.canTalk = (s, d) => !d.talk || FM.daysBetween(d.talk, s.date) >= COOLDOWN;
  M.talkOptions = function (s, p) {
    const d = s.p[p.id];
    const o = [
      { k: "praise", label: "👏 Khen phong độ" },
      { k: "criticize", label: "☝️ Nhắc nhở phong độ" },
    ];
    if (!d.promise && ((d.unhappy || 0) > 0 || d.wantsOut || ["squad", "surplus"].includes(M.role(s, p)))) o.push({ k: "promise", label: "🤝 Hứa cho ra sân nhiều hơn" });
    if (d.wantsOut) o.push({ k: "stay", label: "🙏 Thuyết phục ở lại" });
    return o;
  };
  M.talk = function (s, pid, kind) {
    const d = s.p[pid];
    const p = W.player(s, pid);
    if (!M.canTalk(s, d)) return { text: `Vừa nói chuyện với ${p.sn} gần đây — để vài hôm nữa.`, delta: 0 };
    d.talk = s.date;
    const rnd = FM.rng(FM.hash(`talk-${pid}-${s.date}-${s.seed}`));
    const form = M.form(d);
    const pro = p.hid[2];
    const before = d.mor;
    // [lời đáp, thay đổi tâm lý]
    let res;
    if (kind === "praise") {
      if (form === null) res = [`${p.sn} chưa ra sân nhiều, lời khen không có tác dụng mấy.`, 1];
      else if (form >= 6.9) res = [`${p.sn} rất vui vì được ghi nhận.`, 7];
      else res = [`${p.sn} thấy lời khen không thật lòng khi phong độ đang kém.`, -3];
    } else if (kind === "criticize") {
      if (form !== null && form >= 6.9) res = [`${p.sn} bực bội: "Tôi đang chơi tốt cơ mà!"`, -8];
      else if (pro >= 12) res = [`${p.sn} nhận lỗi và hứa sẽ cố gắng hơn.`, 5];
      else if (rnd() < 0.4) res = [`${p.sn} im lặng lắng nghe.`, 1];
      else res = [`${p.sn} phản ứng gay gắt với lời nhắc nhở.`, -6];
    } else if (kind === "promise") {
      M.promise(s, pid);
      d.unhappy = 0;
      res = [`${p.sn} tin lời bạn. Hạn đến ${FM.fmtDate(d.promise.due, false)}: cần ra sân khoảng ${String(d.promise.need).replace(".", ",")}/6 trận, nếu không cậu ấy sẽ đòi ra đi.`, 8];
    } else if (rnd() < 0.3 + pro / 40 - (d.unhappy || 0) * 0.03) {
      d.wantsOut = false;
      d.unhappy = 0;
      res = [`${p.sn} đồng ý ở lại và sẽ cố gắng giành suất.`, 10];
    } else res = [`${p.sn} vẫn muốn ra đi.`, -4];
    add(d, res[1]);
    const text = res[0];
    return { text, delta: d.mor - before };
  };

  // ---------- Họp đội ----------
  M.canMeet = (s) => !s.meet || FM.daysBetween(s.meet, s.date) >= COOLDOWN;
  M.MEETINGS = [
    { k: "praise", label: "👏 Khen ngợi cả đội", desc: "Tốt khi đội đang thắng nhiều." },
    { k: "demand", label: "📢 Đòi hỏi nhiều hơn", desc: "Hợp khi đội đang thua; cầu thủ chuyên nghiệp phản ứng tốt hơn." },
    { k: "calm", label: "🧘 Giải toả áp lực", desc: "Giúp những người đang buồn, an toàn nhưng tác dụng ít." },
  ];
  M.meeting = function (s, kind) {
    if (!M.canMeet(s)) return { text: "Vừa họp đội gần đây." };
    s.meet = s.date;
    const form = s.clubs[s.user].form.slice(-5);
    const wins = form.filter((x) => x === "W").length;
    const losses = form.filter((x) => x === "L").length;
    let up = 0;
    let down = 0;
    for (const p of W.squad(s, s.user)) {
      const d = s.p[p.id];
      let v = 0;
      if (kind === "praise") v = wins >= 3 ? 5 : (M.form(d) ?? 6.5) >= 6.9 ? 1 : -3;
      else if (kind === "demand") v = losses >= 3 || wins <= 1 ? (p.hid[2] >= 12 ? 5 : 1) : -4;
      else v = d.mor < 45 ? 6 : 0;
      add(d, v);
      if (v > 0) up++;
      else if (v < 0) down++;
    }
    const text =
      kind === "praise"
        ? wins >= 3 ? "Cả đội phấn khởi sau lời khen." : "Nhiều cầu thủ thấy lời khen chưa xứng với kết quả gần đây."
        : kind === "demand"
          ? losses >= 3 || wins <= 1 ? "Phòng thay đồ quyết tâm hơn sau buổi họp." : "Cả đội thấy khó hiểu khi bị đòi hỏi lúc đang chơi tốt."
          : "Không khí nhẹ nhàng hơn.";
    return { text, up, down };
  };

  // ---------- Lý do tâm lý (hiển thị trong hồ sơ) ----------
  M.reasons = function (s, p) {
    const d = s.p[p.id];
    const r = [];
    if (d.wantsOut) r.push(["bad", "Muốn được ra đi"]);
    if (d.promise) r.push(["info", `Bạn đã hứa cho ra sân nhiều hơn — hạn ${FM.fmtDate(d.promise.due, false)} (đã ra sân ${fmtPlayed(d)})`]);
    else if (counted(d) >= 4 && M.need(s, p) > 0) {
      const ok = M.played(d) >= M.need(s, p);
      r.push([ok ? "good" : "bad", `${ok ? "Hài lòng với" : "Không hài lòng vì ít"} thời gian ra sân (${fmtPlayed(d)} gần đây)`]);
    }
    const f = M.form(d);
    if (f !== null) r.push([f >= 7 ? "good" : f < 6.3 ? "bad" : "info", `Phong độ 3 trận gần nhất: điểm TB ${f.toFixed(1)}`]);
    return r;
  };
  M.squadMood = function (s) {
    const squad = W.squad(s, s.user).filter((p) => !p.loan);
    const avg = squad.reduce((a, p) => a + p.mor, 0) / Math.max(1, squad.length);
    return {
      avg,
      unhappy: squad.filter((p) => (s.p[p.id].unhappy || 0) >= COMPLAIN && !s.p[p.id].wantsOut),
      wantsOut: squad.filter((p) => s.p[p.id].wantsOut),
      promises: squad.filter((p) => s.p[p.id].promise),
    };
  };
})();
