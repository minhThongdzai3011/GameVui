// Chuyển nhượng & hợp đồng.
// - Kỳ chuyển nhượng: hè (trước mùa → 2 tuần sau vòng 1) và giữa mùa (đợt nghỉ Tết giữa vòng
//   18 và 19). Ngoài kỳ chỉ ký được cầu thủ tự do.
// - Giá trị cầu thủ theo năng lực, tiềm năng, tuổi, giải và thời hạn hợp đồng còn lại; đội máy
//   hét giá theo vai trò của cầu thủ trong đội.
// - Đàm phán hợp đồng: cầu thủ đòi lương theo năng lực / giải / quốc tịch, ra giá lại hoặc từ
//   chối; quỹ lương có trần do ban lãnh đạo đặt.
// - Đội máy hỏi mua cầu thủ của người chơi, mua bán với nhau, ký cầu thủ tự do.
// - Hợp đồng hết hạn 30/6: không gia hạn thì thành cầu thủ tự do.
(function () {
  "use strict";
  const FM = window.FM;
  const W = FM.World;
  const V1 = FM.V1;
  const V2 = FM.V2;
  const T = (FM.Transfers = {});
  const FREE = "free";
  const round1 = (v) => Math.round(v * 10) / 10;

  // ---------- Khởi tạo (cả cho ván lưu từ bản cũ chưa có chuyển nhượng) ----------
  T.ensure = function (s) {
    s.tr ||= { offers: [], log: [], shortlist: [], talks: {}, seq: 0 };
    s.tr.talks ||= {};
    for (const id of Object.keys(s.clubs)) {
      const c = s.clubs[id];
      if (!c.wageCap) c.wageCap = Math.round((W.baseClub(s, id).wageBudget || 400) * 1.15);
    }
    if (s.windowsSeason !== s.season) {
      // ngày các vòng V.League 1 của mùa hiện tại
      const rd = (n) => s.fx.find((f) => f.lg === V1 && f.rd === n)?.d;
      const r1 = rd(1);
      s.windows = [
        [FM.addDays(r1, -70), FM.addDays(r1, 14)],
        [FM.addDays(rd(18), 1), FM.addDays(rd(19), -1)],
      ];
      s.windowsSeason = s.season;
    }
  };
  T.window = function (s) {
    T.ensure(s);
    const open = s.windows.find(([a, b]) => s.date >= a && s.date <= b);
    if (open) return { open: true, until: open[1] };
    const next = s.windows.find(([a]) => a > s.date);
    return { open: false, next: next ? next[0] : null };
  };

  // ---------- Định giá ----------
  T.value = function (s, p) {
    let v = 0.4 * Math.exp((p.ca - 45) * 0.109);
    const age = p.age ?? FM.ageOn(p, s.date);
    if (age <= 21) v *= 1 + Math.max(0, p.pa - p.ca) / 40;
    else if (age >= 33) v *= 0.3;
    else if (age >= 31) v *= 0.55;
    else if (age >= 28) v *= 0.8;
    const club = s.clubs[p.c];
    if (club && club.league === V2) v *= 0.7;
    if (p.c === FREE || !p.ce) return Math.max(0.1, round1(v));
    const months = FM.daysBetween(s.date, p.ce) / 30.4;
    if (months <= 6) v *= 0.55;
    else if (months <= 12) v *= 0.8;
    return Math.max(0.1, round1(v));
  };
  // lương "đúng giá" (triệu/tháng) ở một giải
  T.fairWage = function (p, league) {
    let w = 15 * Math.exp((p.ca - 45) * 0.0858);
    if (league === V2) w *= 0.55;
    if (p.fs) w *= 1.6;
    return Math.max(5, Math.round(w));
  };
  // vai trò trong đội: trụ cột / đá chính / dự bị / thừa
  // cache: Map CLB → danh sách năng lực đã sắp xếp (dùng lại trong một lượt tìm kiếm cho nhanh)
  T.role = function (s, p, cache) {
    if (p.c === FREE) return "free";
    let cas = cache && cache.get(p.c);
    if (!cas) {
      cas = Object.keys(s.p)
        .filter((id) => s.p[id].c === p.c)
        .map((id) => s.p[id].ca)
        .sort((a, b) => b - a);
      if (cache) cache.set(p.c, cas);
    }
    const rank = cas.indexOf(p.ca);
    return rank < 3 ? "key" : rank < 11 ? "starter" : rank < 22 ? "squad" : "surplus";
  };
  const ROLE_MULT = { key: 2, starter: 1.4, squad: 1.05, surplus: 0.8, free: 0 };
  T.ROLE_LABEL = { key: "Trụ cột", starter: "Đá chính", squad: "Dự bị", surplus: "Không cần thiết", free: "Tự do" };
  T.asking = function (s, p, cache) {
    if (p.c === FREE) return 0;
    const d = s.p[p.id];
    if (d.listed && d.c === s.user) return d.ask || T.value(s, p);
    return round1(T.value(s, p) * ROLE_MULT[T.role(s, p, cache)] * (d.listed ? 0.9 : 1));
  };
  T.wageBill = (s, clubId) => W.squad(s, clubId).reduce((a, p) => a + p.wage, 0);
  const contractEnd = (s, years) => `${s.season + years}-06-30`;
  const prefYears = (age) => (age <= 23 ? 4 : age <= 29 ? 3 : age <= 32 ? 2 : 1);

  // ---------- Yêu cầu hợp đồng của cầu thủ ----------
  // kind: "sign" (về CLB mới, kể cả tự do) | "renew" (gia hạn ở CLB hiện tại)
  T.demand = function (s, p, clubId, kind) {
    const club = W.club(s, clubId);
    const age = p.age;
    let wage = T.fairWage(p, club.league);
    if (kind === "renew") {
      wage = Math.max(Math.round(p.wage * 1.05), wage);
      if (p.mor < 45) wage = Math.round(wage * 1.15);
      if (p.mor < 28) return { refuse: "Cầu thủ không vui ở CLB và không muốn gia hạn." };
      if (p.ca >= W.strength(s, clubId) + 8 && age < 29 && FM.hash(p.id + s.season) % 2) return { refuse: "Cầu thủ muốn tìm thử thách ở CLB lớn hơn." };
    } else {
      const from = p.c !== FREE ? W.club(s, p.c) : null;
      if (from) {
        const gap = from.rep - club.rep;
        if (from.league === V1 && club.league === V2 && p.ca >= 62 && age < 31) return { refuse: `${p.sn} không muốn xuống chơi ở V.League 2.` };
        if (gap > 18 && p.ca >= 58) return { refuse: `${p.sn} không muốn rời ${from.name} sang một đội kém tên tuổi hơn.` };
        if (gap > 0) wage = Math.round(wage * (1 + gap / 40));
        wage = Math.max(wage, Math.round(p.wage * 1.1)); // chuyển CLB thì phải được tăng lương
      } else wage = Math.round(wage * 0.9); // tự do thì dễ tính hơn
    }
    return { wage: Math.max(5, wage), years: prefYears(age) };
  };

  // ---------- Hỏi mua (người chơi mua) ----------
  T.bid = function (s, pid, fee) {
    T.ensure(s);
    const p = W.player(s, pid);
    if (!p || p.c === s.user) return { result: "rejected", reason: "Cầu thủ đã thuộc CLB của bạn." };
    if (p.c !== FREE && !T.window(s).open) return { result: "rejected", reason: "Kỳ chuyển nhượng đang đóng — chỉ ký được cầu thủ tự do." };
    if (fee > s.clubs[s.user].bal) return { result: "rejected", reason: `Không đủ tiền (số dư ${FM.fmtMoney(s.clubs[s.user].bal)}).` };
    const ask = T.asking(s, p);
    let res;
    if (fee >= ask) res = { result: "accepted" };
    else if (fee >= ask * 0.75) res = { result: "countered", counter: ask, reason: `${W.baseClub(s, p.c).name} đòi ${FM.fmtMoney(ask)}.` };
    else res = { result: "rejected", hint: Math.ceil(ask * 2) / 2, reason: `${W.baseClub(s, p.c).name} cho rằng đề nghị quá thấp — họ muốn khoảng ${FM.fmtMoney(Math.ceil(ask * 2) / 2)}.` };
    if (res.result === "accepted") s.tr.neg = { pid, fee, club: s.user };
    return res;
  };

  // ---------- Đàm phán hợp đồng ----------
  // trả về accepted / countered (kèm counterWage) / rejected
  T.offerContract = function (s, pid, wage, years, kind) {
    T.ensure(s);
    const p = W.player(s, pid);
    const clubId = s.user;
    const dem = T.demand(s, p, clubId, kind);
    if (dem.refuse) return { result: "rejected", reason: dem.refuse };
    if (kind !== "renew" && p.c !== FREE && !(s.tr.neg && s.tr.neg.pid === pid)) return { result: "rejected", reason: "Chưa thoả thuận phí chuyển nhượng với CLB chủ quản." };
    const c = s.clubs[clubId];
    const bill = T.wageBill(s, clubId) - (kind === "renew" ? p.wage : 0) + wage;
    if (bill > c.wageCap) return { result: "rejected", reason: `Vượt quỹ lương ban lãnh đạo cho phép (${FM.fmtWage(bill)} / ${FM.fmtWage(c.wageCap)}).` };
    const talk = (s.tr.talks[pid] ||= { n: 0 });
    talk.n++;
    if (wage >= dem.wage * 0.97) {
      delete s.tr.talks[pid];
      if (kind === "renew") {
        const d = s.p[pid];
        d.wage = wage;
        d.ce = contractEnd(s, years);
        d.mor = Math.min(100, d.mor + 8);
        W.mail(s, "contract", `${p.sn} gia hạn hợp đồng`, `${p.n} đồng ý gia hạn đến ${FM.fmtDate(d.ce, false)} với mức lương ${FM.fmtWage(wage)}.`);
      } else {
        const fee = p.c === FREE ? 0 : s.tr.neg.fee;
        T.complete(s, pid, clubId, fee, wage, years);
        s.tr.neg = null;
      }
      return { result: "accepted" };
    }
    if (talk.n >= 3) {
      delete s.tr.talks[pid];
      if (kind !== "renew") s.tr.neg = null;
      return { result: "rejected", reason: `${p.sn} cắt đứt đàm phán sau nhiều lần không thống nhất được lương.` };
    }
    if (wage >= dem.wage * 0.85) return { result: "countered", counterWage: dem.wage, reason: `${p.sn} muốn ${FM.fmtWage(dem.wage)}.` };
    return { result: "countered", counterWage: dem.wage, reason: `Đề nghị quá thấp. ${p.sn} muốn ${FM.fmtWage(dem.wage)}.` };
  };

  // ---------- Hoàn tất một vụ chuyển nhượng ----------
  T.complete = function (s, pid, toClub, fee, wage, years) {
    const d = s.p[pid];
    const p = W.player(s, pid);
    const from = d.c;
    if (from !== FREE) s.clubs[from].bal = round1(s.clubs[from].bal + fee);
    s.clubs[toClub].bal = round1(s.clubs[toClub].bal - fee);
    // gỡ khỏi đội hình / dự bị đội cũ
    if (from !== FREE) {
      const oc = s.clubs[from];
      if (oc.lineup) oc.lineup = oc.lineup.map((id) => (id === pid ? null : id));
      if (oc.bench) oc.bench = oc.bench.filter((id) => id !== pid);
    }
    d.c = toClub;
    d.wage = wage;
    d.ce = contractEnd(s, years);
    d.mor = 68;
    d.listed = false;
    d.ask = null;
    d.joined = s.date;
    // số áo: giữ số cũ nếu còn trống, không thì lấy số nhỏ nhất còn trống
    const taken = new Set(W.squad(s, toClub).filter((q) => q.id !== pid).map((q) => q.no));
    if (p.no == null || taken.has(p.no)) for (let n = 2; n < 100; n++) if (!taken.has(n)) {
      d.no = n;
      break;
    }
    s.tr.offers = s.tr.offers.filter((o) => o.pid !== pid || o.status !== "open");
    const entry = { d: s.date, pid, name: p.n, from, to: toClub, fee };
    s.tr.log.unshift(entry);
    if (s.tr.log.length > 200) s.tr.log.length = 200;
    const fromName = from === FREE ? "tự do" : W.baseClub(s, from).name;
    if (toClub === s.user) W.mail(s, "transfer", `Chào mừng ${p.sn}!`, `${p.n} đã gia nhập ${W.baseClub(s, toClub).name} từ ${fromName}${fee ? ` với phí ${FM.fmtMoney(fee)}` : ""}. Lương ${FM.fmtWage(wage)}, hợp đồng đến ${FM.fmtDate(d.ce, false)}.`);
    else if (from === s.user) W.mail(s, "transfer", `${p.sn} rời CLB`, `${p.n} đã chuyển sang ${W.baseClub(s, toClub).name} với phí ${FM.fmtMoney(fee)}.`);
    else if (fee >= 2 || p.ca >= 66) (s.tr.news ||= []).push(entry);
  };
  T.toFree = function (s, pid) {
    const d = s.p[pid];
    if (!d) return;
    const oc = s.clubs[d.c];
    if (oc) {
      if (oc.lineup) oc.lineup = oc.lineup.map((id) => (id === pid ? null : id));
      if (oc.bench) oc.bench = oc.bench.filter((id) => id !== pid);
    }
    d.c = FREE;
    d.ce = null;
    d.listed = false;
    d.mor = 45;
  };
  // thanh lý: đền bù nửa số lương còn lại
  T.releaseCost = function (s, p) {
    if (!p.ce) return 0;
    const months = Math.max(0, FM.daysBetween(s.date, p.ce) / 30.4);
    return round1((months * p.wage * 0.5) / 1000);
  };
  T.release = function (s, pid) {
    const p = W.player(s, pid);
    const cost = T.releaseCost(s, p);
    s.clubs[s.user].bal = round1(s.clubs[s.user].bal - cost);
    T.toFree(s, pid);
    s.tr.log.unshift({ d: s.date, pid, name: p.n, from: s.user, to: FREE, fee: 0 });
    W.mail(s, "transfer", `Đã thanh lý hợp đồng ${p.sn}`, `${p.n} trở thành cầu thủ tự do. Tiền đền bù: ${FM.fmtMoney(cost)}.`);
    return cost;
  };
  T.setListed = function (s, pid, on, ask) {
    const d = s.p[pid];
    d.listed = on;
    d.ask = on ? ask : null;
  };

  // ---------- Đề nghị mua cầu thủ của người chơi ----------
  T.respond = function (s, offerId, action, counterFee) {
    const o = s.tr.offers.find((x) => x.id === offerId);
    if (!o || o.status !== "open") return { result: "gone" };
    const p = W.player(s, o.pid);
    if (action === "reject") {
      o.status = "rejected";
      return { result: "rejected" };
    }
    if (action === "counter") {
      const maxPay = Math.min(T.value(s, p) * 1.35, s.clubs[o.from].bal * 0.8);
      if (counterFee <= maxPay) o.fee = round1(counterFee);
      else {
        o.status = "rejected";
        return { result: "rejected", reason: `${W.baseClub(s, o.from).name} không chấp nhận mức ${FM.fmtMoney(counterFee)} và rút lui.` };
      }
    }
    if (!T.window(s).open) {
      o.status = "expired";
      return { result: "rejected", reason: "Kỳ chuyển nhượng đã đóng." };
    }
    const dem = T.demand(s, p, o.from, "sign");
    T.complete(s, o.pid, o.from, o.fee, dem.refuse ? p.wage : dem.wage, dem.years || 2);
    o.status = "accepted";
    return { result: "accepted", fee: o.fee };
  };

  // ---------- Mỗi ngày ----------
  T.daily = function (s) {
    T.ensure(s);
    const rnd = FM.rng(FM.hash(`tr-${s.date}-${s.seed}`));
    for (const o of s.tr.offers) if (o.status === "open" && o.exp < s.date) o.status = "expired";
    s.tr.offers = s.tr.offers.filter((o) => o.status === "open" || FM.daysBetween(o.d, s.date) < 20);
    const win = T.window(s);
    if (win.open) {
      aiBidsForUser(s, rnd);
      for (const id of Object.keys(s.clubs)) if (id !== s.user && rnd() < 0.035) aiBuy(s, id, rnd);
    }
    // đội máy thiếu người thì ký cầu thủ tự do (cả ngoài kỳ chuyển nhượng)
    for (const id of Object.keys(s.clubs)) if (id !== s.user && rnd() < 0.02 && W.squad(s, id).length < 25) aiBuy(s, id, rnd, true);
    trimFreeAgents(s);
    // tin chuyển nhượng lớn: gộp thành một thư mỗi ngày
    if (s.tr.news && s.tr.news.length) {
      const lines = s.tr.news.map((e) => `• ${e.name}: ${e.from === FREE ? "tự do" : W.baseClub(s, e.from).name} → ${W.baseClub(s, e.to).name}${e.fee ? ` (${FM.fmtMoney(e.fee)})` : ""}`);
      W.mail(s, "news", `Tin chuyển nhượng (${lines.length})`, lines.join("\n"));
      s.tr.news = [];
    }
    // ngày đầu kỳ chuyển nhượng
    if (s.windows.some(([a]) => a === s.date)) W.mail(s, "transfer", "Kỳ chuyển nhượng mở cửa", `Kỳ chuyển nhượng mở đến ${FM.fmtDate(win.until, false)}. Vào mục Thị trường để tìm cầu thủ. Số dư: ${FM.fmtMoney(s.clubs[s.user].bal)}, quỹ lương ${FM.fmtWage(T.wageBill(s, s.user))} / ${FM.fmtWage(s.clubs[s.user].wageCap)}.`);
    // nhắc hợp đồng sắp hết hạn: đầu tháng 1, 3, 5
    if (/-0[135]-01$/.test(s.date)) {
      const end = `${s.season + 1}-06-30`;
      const list = W.squad(s, s.user).filter((p) => p.ce && p.ce <= end);
      if (list.length) W.mail(s, "contract", `${list.length} hợp đồng hết hạn 30/6`, `Những cầu thủ sau sẽ ra đi tự do nếu không được gia hạn:\n${list.map((p) => `• ${p.n} (${p.age} tuổi, ${FM.fmtWage(p.wage)})`).join("\n")}\n\nGia hạn trong hồ sơ cầu thủ hoặc mục Thị trường → Hợp đồng.`);
    }
  };

  function aiBidsForUser(s, rnd) {
    const squad = W.squad(s, s.user).filter((p) => !p.joined || FM.daysBetween(p.joined, s.date) > 30);
    const listed = squad.filter((p) => s.p[p.id].listed).length;
    if (rnd() > 0.05 + listed * 0.05) return;
    const target = rnd.weighted(squad, (p) => Math.max(1, p.ca - 42) ** 2 * (s.p[p.id].listed ? 5 : 1));
    if (!target || s.tr.offers.some((o) => o.pid === target.id && o.status === "open")) return;
    const fee = s.p[target.id].listed ? round1(T.asking(s, target) * rnd.range(0.85, 1.05)) : round1(T.value(s, target) * rnd.range(0.8, 1.2));
    const buyers = Object.keys(s.clubs).filter((id) => id !== s.user && s.clubs[id].bal * 0.7 >= fee && W.strength(s, id) <= target.ca + 6);
    if (!buyers.length) return;
    const from = rnd.pick(buyers);
    const o = { id: ++s.tr.seq, pid: target.id, from, to: s.user, fee, d: s.date, exp: FM.addDays(s.date, 5), status: "open" };
    s.tr.offers.push(o);
    W.mail(s, "transfer", `${W.baseClub(s, from).name} hỏi mua ${target.sn}`, `${W.baseClub(s, from).name} đề nghị ${FM.fmtMoney(fee)} cho ${target.n} (giá trị ước tính ${FM.fmtMoney(target.val)}). Trả lời trong mục Thị trường → Đề nghị trước ${FM.fmtDate(o.exp, false)}.`);
  }

  // đội máy mua người lấp vị trí yếu nhất (freeOnly: chỉ cầu thủ tự do)
  function aiBuy(s, clubId, rnd, freeOnly) {
    const squad = W.squad(s, clubId);
    if (squad.length >= 34) return;
    const c = s.clubs[clubId];
    // tối đa 3 người mỗi kỳ chuyển nhượng (không tính cầu thủ tự do)
    const win = s.windows.find(([a, b]) => s.date >= a && s.date <= b);
    if (!freeOnly && win) {
      if (!c.buys || c.buys.w !== win[0]) c.buys = { w: win[0], n: 0 };
      if (c.buys.n >= 3) return;
    }
    const myRep = W.baseClub(s, clubId).rep;
    const slots = FM.FORMATIONS[c.formation];
    const pick = FM.autoPick(squad, c.formation);
    let weakest = null;
    pick.lineup.forEach((id, i) => {
      const p = squad.find((q) => q.id === id);
      const e = p ? FM.effective(p, slots[i][0], 100, 55) : 0;
      if (!weakest || e < weakest.e) weakest = { role: slots[i][0], e, ca: p ? p.ca : 30 };
    });
    if (!weakest) return;
    const budget = c.bal * 0.6;
    const room = c.wageCap * 1.1 - T.wageBill(s, clubId);
    const cands = [];
    const cache = new Map();
    for (const id of Object.keys(s.p)) {
      const d = s.p[id];
      if (d.c === clubId || d.c === s.user || (freeOnly && d.c !== FREE)) continue;
      const p = W.player(s, id);
      if (!p || p.age > 31 || p.ca < weakest.ca + 3 || FM.familiarity(p, weakest.role) < 0.85) continue;
      if (p.c !== FREE) {
        // không mua trụ cột; người đá chính chỉ khi đội mua có tên tuổi lớn hơn rõ rệt
        const r = T.role(s, p, cache);
        if (r === "key" || (r === "starter" && myRep <= W.baseClub(s, p.c).rep + 5)) continue;
      }
      const fee = T.asking(s, p, cache);
      if (fee > budget) continue;
      const dem = T.demand(s, p, clubId, "sign");
      if (dem.refuse || dem.wage > room) continue;
      cands.push({ p, fee, dem, score: (p.ca - weakest.ca) / (fee + 0.5) });
    }
    if (!cands.length) return;
    cands.sort((a, b) => b.score - a.score);
    const x = rnd.pick(cands.slice(0, 4));
    T.complete(s, x.p.id, clubId, x.fee, x.dem.wage, x.dem.years);
    if (x.fee > 0 && c.buys) c.buys.n++;
    // thừa người thì thanh lý người yếu nhất
    const now = W.squad(s, clubId);
    if (now.length > 32) {
      const worst = now.filter((p) => p.age > 21 && p.id !== x.p.id).sort((a, b) => a.ca - b.ca)[0];
      if (worst) T.toFree(s, worst.id);
    }
  }
  function trimFreeAgents(s) {
    const free = Object.keys(s.p).filter((id) => s.p[id].c === FREE);
    if (free.length <= 140) return;
    free.sort((a, b) => s.p[a].ca - s.p[b].ca);
    for (const id of free.slice(0, free.length - 120)) delete s.p[id];
  }

  // ---------- Cuối mùa: hợp đồng hết hạn ----------
  T.endOfSeason = function (s) {
    T.ensure(s);
    const end = `${s.season + 1}-06-30`;
    const left = [];
    for (const id of Object.keys(s.p)) {
      const d = s.p[id];
      if (d.c === FREE) continue;
      const p = W.player(s, id);
      if (!p.ce || p.ce > end) continue;
      if (d.c === s.user) {
        left.push(p.n);
        T.toFree(s, id);
        continue;
      }
      const rank = W.squad(s, d.c)
        .map((q) => q.ca)
        .sort((a, b) => b - a)
        .indexOf(p.ca);
      if (rank < 24 && p.age <= 33) {
        d.ce = `${s.season + 1 + FM.clamp(prefYears(p.age), 1, 3)}-06-30`;
        d.wage = Math.max(p.wage, T.fairWage(p, s.clubs[d.c].league));
      } else T.toFree(s, id);
    }
    if (left.length) W.mail(s, "contract", "Hợp đồng hết hạn", `Các cầu thủ sau đã hết hợp đồng và rời CLB theo dạng tự do:\n${left.map((n) => "• " + n).join("\n")}`);
    s.tr.offers = [];
    s.tr.talks = {};
    s.tr.neg = null;
  };

  // ---------- Tìm kiếm cầu thủ ----------
  // f: { group: "GK|DF|MF|FW|", maxAge, maxFee (tỷ), where: "all|v1|v2|free", sort: "ca|value|age" }
  T.search = function (s, f) {
    const out = [];
    const cache = new Map();
    for (const id of Object.keys(s.p)) {
      const d = s.p[id];
      if (d.c === s.user) continue;
      if (f.where === "free" && d.c !== FREE) continue;
      if ((f.where === "v1" || f.where === "v2") && (d.c === FREE || s.clubs[d.c].league !== (f.where === "v1" ? V1 : V2))) continue;
      const p = W.player(s, id);
      if (f.group && FM.POS_GROUP[p.pos] !== f.group) continue;
      if (f.maxAge && p.age > f.maxAge) continue;
      if (f.listed && !d.listed) continue;
      if (f.maxFee && T.asking(s, p, cache) > f.maxFee) continue;
      out.push(p);
    }
    const key = { ca: (p) => -p.ca, value: (p) => -p.val, age: (p) => p.age, pot: (p) => -p.pa }[f.sort || "ca"];
    return out.sort((a, b) => key(a) - key(b));
  };
})();
