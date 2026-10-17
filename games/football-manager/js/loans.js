// Cho mượn cầu thủ.
// - Hợp đồng cho mượn kéo dài đến hết mùa (cầu thủ trở về CLB chủ quản trước khi sang mùa mới).
//   CLB mượn trả một phần lương (50 / 75 / 100%), CLB chủ quản trả phần còn lại.
// - Người chơi mượn cầu thủ đội máy: đội máy chỉ cho mượn người không phải trụ cột (người đá
//   chính chỉ khi ≤ 21 tuổi và được trả đủ lương); cầu thủ chỉ đến nếu có cơ hội ra sân. Có thể
//   kèm điều khoản mua đứt (giá chốt trước), kích hoạt lúc nào cũng được trong thời gian mượn.
// - Người chơi đem cho mượn: đánh dấu "cho mượn" trong hồ sơ, các đội cần người ở vị trí đó gửi
//   đề nghị (kèm vai trò dự kiến). Được ra sân thường xuyên thì cầu thủ trẻ phát triển nhanh hơn.
// - Đội máy cho nhau mượn cầu thủ trẻ dư thừa.
// - Cầu thủ đang được cho mượn không mua bán, thanh lý được.
(function () {
  "use strict";
  const FM = window.FM;
  const W = FM.World;
  const T = FM.Transfers;
  const L = (FM.Loans = {});
  const FREE = "free";
  const round1 = (v) => Math.round(v * 10) / 10;
    L.SHARES = [0.5, 0.75, 1];
  const name = (s, id) => W.baseClub(s, id).name;
  const until = (s) => `${s.season + 1}-06-30`;

  // vai trò của p nếu về CLB clubId (xếp đội hình tốt nhất theo sơ đồ của CLB đó):
  // "starter" (đá chính) | "squad" (dự bị) | null (không có chỗ trong 20 người)
  L.roleAt = function (s, p, clubId) {
    const squad = W.squad(s, clubId).filter((q) => q.id !== p.id);
    const pick = FM.autoPick([...squad, p], s.clubs[clubId].formation);
    return pick.lineup.includes(p.id) ? "starter" : pick.bench.includes(p.id) ? "squad" : null;
  };
  L.ROLE_LABEL = { starter: "Đá chính", squad: "Dự bị" };
  // lương mỗi CLB phải trả cho cầu thủ (tính cả người đang mượn / cho mượn)
  L.wageShare = (d, clubId) => (!d.loan ? (d.c === clubId ? 1 : 0) : d.c === clubId ? d.loan.share : d.loan.from === clubId ? 1 - d.loan.share : 0);

  function detach(s, pid, clubId) {
    const c = s.clubs[clubId];
    if (!c) return;
    if (c.lineup) c.lineup = c.lineup.map((id) => (id === pid ? null : id));
    if (c.bench) c.bench = c.bench.filter((id) => id !== pid);
  }
  function freeNumber(s, clubId, pid, want) {
    const taken = new Set(W.squad(s, clubId).filter((q) => q.id !== pid).map((q) => q.no));
    if (want != null && !taken.has(want)) return want;
    for (let n = 2; n < 100; n++) if (!taken.has(n)) return n;
    return null;
  }

  // ---------- Bắt đầu / kết thúc ----------
  L.loan = function (s, pid, toClub, share, buy, role) {
    const d = s.p[pid];
    const p = W.player(s, pid);
    const from = d.c;
    detach(s, pid, from);
    if (FM.History) FM.History.moved(d, from, toClub);
    d.loan = { from, share, buy: buy || null, d: s.date, no: d.no, role: role || L.roleAt(s, p, toClub) };
    d.c = toClub;
    d.no = freeNumber(s, toClub, pid, d.no);
    d.loanListed = false;
    d.listed = false;
    d.ask = null;
    d.joined = s.date;
    s.tr.offers = s.tr.offers.filter((o) => o.pid !== pid || o.status !== "open");
    const entry = { d: s.date, pid, name: p.n, from, to: toClub, fee: 0, loan: true };
    s.tr.log.unshift(entry);
    if (s.tr.log.length > 200) s.tr.log.length = 200;
    const wageTxt = `${Math.round(share * 100)}% lương`;
    if (toClub === s.user) W.mail(s, "transfer", `${p.sn} đến theo dạng cho mượn`, `${p.n} gia nhập theo dạng mượn từ ${name(s, from)} đến ${FM.fmtDate(until(s), false)}. CLB trả ${wageTxt} (${FM.fmtWage(p.wage * share)}).${buy ? ` Điều khoản mua đứt: ${FM.fmtMoney(buy)}.` : ""}`);
    else if (from === s.user) W.mail(s, "transfer", `${p.sn} được cho mượn`, `${p.n} sang ${name(s, toClub)} theo dạng cho mượn đến ${FM.fmtDate(until(s), false)}. ${name(s, toClub)} trả ${wageTxt}. Theo dõi trong Thị trường → Hợp đồng.`);
    else if (p.ca >= 58) (s.tr.news ||= []).push(entry);
  };
  L.returnPlayer = function (s, pid) {
    const d = s.p[pid];
    if (!d || !d.loan) return;
    detach(s, pid, d.c);
    const { from, no } = d.loan;
    d.loan = null;
    if (!s.clubs[from]) return T.toFree(s, pid);
    d.c = from;
    d.no = freeNumber(s, from, pid, no);
    d.joined = s.date;
  };
  // hết mùa: mọi cầu thủ cho mượn trở về
  L.returnAll = function (s) {
    const back = [];
    const left = [];
    for (const id of Object.keys(s.p)) {
      const d = s.p[id];
      if (!d.loan) continue;
      const p = W.player(s, id);
      const line = `• ${p.n} (${name(s, d.c)}): ${p.st.ap} trận, ${p.st.g} bàn${p.st.ap ? `, điểm TB ${(p.st.rs / p.st.ap).toFixed(2)}` : ""}${p.dg ? `, tiến bộ +${p.dg}` : ""}`;
      if (d.loan.from === s.user) back.push(line);
      else if (d.c === s.user) left.push(`• ${p.n} về lại ${name(s, d.loan.from)}`);
      L.returnPlayer(s, id);
    }
    if (back.length) W.mail(s, "transfer", `${back.length} cầu thủ hết hạn cho mượn trở về`, `Thành tích trong thời gian cho mượn:\n${back.join("\n")}`);
    if (left.length) W.mail(s, "transfer", "Hết hạn mượn cầu thủ", left.join("\n"));
  };

  // ---------- Người chơi hỏi mượn ----------
  L.terms = function (s, p) {
    const r = T.role(s, p);
    if (r === "key") return { refuse: `${name(s, p.c)} không cho mượn trụ cột của họ.` };
    if (r === "starter" && p.age > 21) return { refuse: `${name(s, p.c)} cần ${p.sn} đá chính, không cho mượn.` };
    const need = r === "starter" ? 1 : r === "squad" ? 0.75 : 0.5;
    const buy = r === "starter" ? null : round1(T.asking(s, p) * 1.15);
    return { need, buy, role: r };
  };
  L.request = function (s, pid, share, withBuy) {
    T.ensure(s);
    const p = W.player(s, pid);
    if (!p || p.c === s.user || p.c === FREE) return { result: "rejected", reason: "Không thể mượn cầu thủ này." };
    if (p.loan) return { result: "rejected", reason: `${p.sn} đang được cho mượn rồi.` };
    if (!T.window(s).open) return { result: "rejected", reason: "Kỳ chuyển nhượng đang đóng." };
    const t = L.terms(s, p);
    if (t.refuse) return { result: "rejected", reason: t.refuse };
    if (withBuy && !t.buy) return { result: "rejected", reason: `${name(s, p.c)} không đồng ý điều khoản mua đứt cho ${p.sn}.` };
    if (share < t.need) return { result: "countered", share: t.need, reason: `${name(s, p.c)} muốn bạn trả ${Math.round(t.need * 100)}% lương.` };
    const role = L.roleAt(s, p, s.user);
    if (!role) return { result: "rejected", reason: `${p.sn} không muốn đến vì khó có suất đá chính.` };
    const c = s.clubs[s.user];
    const bill = T.wageBill(s, s.user) + p.wage * share;
    if (bill > c.wageCap) return { result: "rejected", reason: `Vượt quỹ lương ban lãnh đạo cho phép (${FM.fmtWage(bill)} / ${FM.fmtWage(c.wageCap)}).` };
    L.loan(s, pid, s.user, share, withBuy ? t.buy : null, role);
    return { result: "accepted" };
  };
  // kích hoạt điều khoản mua đứt
  L.exercise = function (s, pid) {
    const d = s.p[pid];
    if (!d || !d.loan || d.c !== s.user || !d.loan.buy) return { error: "Không có điều khoản mua đứt." };
    const fee = d.loan.buy;
    if (s.clubs[s.user].bal < fee) return { error: `Không đủ tiền (cần ${FM.fmtMoney(fee)}).` };
    const p = W.player(s, pid);
    const bill = T.wageBill(s, s.user) + p.wage * (1 - d.loan.share);
    if (bill > s.clubs[s.user].wageCap) return { error: `Mua đứt thì phải trả đủ lương — vượt quỹ lương (${FM.fmtWage(bill)} / ${FM.fmtWage(s.clubs[s.user].wageCap)}).` };
    const years = Math.max(1, +p.ce.slice(0, 4) - s.season);
    const no = d.no;
    d.c = d.loan.from;
    d.loan = null;
    T.complete(s, pid, s.user, fee, p.wage, years);
    d.no = no;
    return { fee };
  };

  // ---------- Người chơi đem cho mượn ----------
  L.setListed = function (s, pid, on) {
    s.p[pid].loanListed = on;
  };
  L.respond = function (s, offerId, accept) {
    const o = s.tr.offers.find((x) => x.id === offerId && x.type === "loan");
    if (!o || o.status !== "open") return { result: "gone" };
    if (!accept) {
      o.status = "rejected";
      return { result: "rejected" };
    }
    if (!T.window(s).open) {
      o.status = "expired";
      return { result: "rejected", reason: "Kỳ chuyển nhượng đã đóng." };
    }
    o.status = "accepted";
    L.loan(s, o.pid, o.from, o.share, null, o.role);
    return { result: "accepted" };
  };
  // các đội có chỗ cho p (không tính CLB chủ quản)
  function takers(s, p, rnd) {
    const out = [];
    for (const id of Object.keys(s.clubs)) {
      if (id === p.c || id === s.user) continue;
      if (W.squad(s, id).length >= 32) continue;
      const role = L.roleAt(s, p, id);
      if (!role) continue;
      const room = s.clubs[id].wageCap * 1.1 - T.wageBill(s, id);
      const share = role === "starter" ? 1 : rnd() < 0.5 ? 0.75 : 0.5;
      if (p.wage * share > room) continue;
      out.push({ id, role, share });
    }
    return out;
  }

  // ---------- Mỗi ngày trong kỳ chuyển nhượng ----------
  L.daily = function (s, rnd) {
    // đề nghị mượn cầu thủ người chơi đã đánh dấu cho mượn
    for (const p of W.squad(s, s.user)) {
      const d = s.p[p.id];
      if (!d.loanListed || d.loan || rnd() > 0.2) continue;
      if (s.tr.offers.filter((o) => o.pid === p.id && o.status === "open").length >= 3) continue;
      const list = takers(s, p, rnd).filter((x) => !s.tr.offers.some((o) => o.pid === p.id && o.from === x.id && o.status === "open"));
      if (!list.length) continue;
      const x = rnd.weighted(list, (t) => (t.role === "starter" ? 4 : 1));
      const o = { id: ++s.tr.seq, type: "loan", pid: p.id, from: x.id, to: s.user, fee: 0, share: x.share, role: x.role, d: s.date, exp: FM.addDays(s.date, 6), status: "open" };
      s.tr.offers.push(o);
      W.mail(s, "transfer", `${name(s, x.id)} muốn mượn ${p.sn}`, `${name(s, x.id)} đề nghị mượn ${p.n} đến hết mùa, trả ${Math.round(x.share * 100)}% lương. Vai trò dự kiến: ${L.ROLE_LABEL[x.role].toLowerCase()}. Trả lời trong Thị trường → Đề nghị trước ${FM.fmtDate(o.exp, false)}.`);
    }
    // đội máy cho nhau mượn cầu thủ trẻ ít được dùng
    const win = s.windows.find(([a, b]) => s.date >= a && s.date <= b);
    for (const id of Object.keys(s.clubs)) {
      if (id === s.user || rnd() > 0.012) continue;
      const c = s.clubs[id];
      if (!c.loansOut || c.loansOut.w !== win[0]) c.loansOut = { w: win[0], n: 0 };
      if (c.loansOut.n >= 2) continue;
      const cache = new Map();
      const young = W.squad(s, id).filter((p) => !p.loan && p.age <= 22 && p.ca >= 40 && (T.role(s, p, cache) === "surplus" || (p.age <= 20 && T.role(s, p, cache) === "squad")));
      if (!young.length || W.squad(s, id).length <= 22) continue;
      const p = rnd.pick(young);
      // giữa các đội máy: chỉ cho mượn khi người đó được đá chính ở đội mới
      const list = takers(s, p, rnd).filter((t) => t.role === "starter");
      if (!list.length) continue;
      const x = rnd.pick(list);
      L.loan(s, p.id, x.id, x.share, null, x.role);
      c.loansOut.n++;
    }
  };
})();
