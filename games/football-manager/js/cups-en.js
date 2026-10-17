// Cúp nước Anh — mọi CLB Anh trong game đều tham dự, kể cả khi người chơi dẫn dắt đội Việt Nam.
// - FA Community Shield: Chủ nhật trước vòng 1 Premier League, ở Wembley. Vô địch Premier League gặp
//   vô địch FA Cup mùa trước (cùng một đội thì lấy á quân Premier League). Hoà thì đá luân lưu luôn.
// - FA Cup: vòng 1 (đầu tháng 11) có 48 đội League One + League Two và 32 đội bán chuyên nghiệp
//   (National League, National League North/South — tên thật, đội hình do game sinh ra). Premier League +
//   Championship vào từ vòng 3 (tháng 1). Một trận, hoà đá luân lưu (không đá lại, như từ 2024/25);
//   bán kết và chung kết ở Wembley. Đội bốc thăm trước làm chủ nhà.
// - League Cup (EFL Cup): 72 đội EFL đá vòng 1 (tháng 8), 12 đội Premier League vào vòng 2, 8 đội dự cúp
//   châu Âu (8 đội đầu Premier League mùa trước) vào vòng 3. Bán kết hai lượt (tháng 1 – 2), chung kết
//   ở Wembley (Chủ nhật thứ tư của tháng 3).
// Ngày các vòng theo lịch thật mùa 2025/26. Lịch giải Anh né ngày cúp (W.calendarBlocks); trận giải
// vẫn trùng lịch với trận cúp của một đội thì được hoãn sang giữa tuần gần nhất.
(function () {
  "use strict";
  const FM = window.FM;
  const W = FM.World;
  const D = window.FM_DATA;
  const A = FM.AFC;
  const E = (FM.EnCups = {});
  const PL = "england-premier-league";
  const CH = "england-championship";
  const L1 = "england-league-one";
  const L2 = "england-league-two";
  E.COMPS = { fac: { name: "FA Cup", short: "FAC" }, efl: { name: "League Cup", short: "LC" }, cs: { name: "Community Shield", short: "CS" } };
  const ROUNDS = {
    fac: ["Vòng 1", "Vòng 2", "Vòng 3", "Vòng 4", "Vòng 5", "Tứ kết", "Bán kết", "Chung kết"],
    efl: ["Vòng 1", "Vòng 2", "Vòng 3", "Vòng 4", "Tứ kết", "Bán kết", "Chung kết"],
  };
  const NEUTRAL_FROM = { fac: 6, efl: 6 }; // Wembley
  const TWO_LEGS = { efl: [5] };
  // tiền thưởng cho đội thắng mỗi vòng (nghìn £, theo quỹ thưởng thật); chung kết: thêm cho nhà vô địch
  const PRIZE = { fac: [41, 67, 113, 150, 225, 450, 1000], efl: [5, 10, 20, 30, 50, 100] };
  const CHAMP = { fac: 2000, efl: 100 };
  const CONF = { fac: 10, efl: 6, cs: 2 };
  // mùa đầu (2026/27): đúng như thật — Community Shield 16/8/2026 Arsenal (vô địch Premier League
  // 2025/26) gặp Man City (vô địch FA Cup); 8 đội đầu Premier League 2025/26 dự cúp châu Âu
  const SEASON1 = {
    shield: ["arsenal", "manchester-city"],
    euro: ["arsenal", "manchester-city", "manchester-united", "aston-villa", "liverpool", "bournemouth", "sunderland", "brighton-and-hove-albion"],
  };
  const EURO = 8;

  // ---------- Ngày ----------
  const nth = (y, m, dow, n) => {
    let d = `${y}-${String(m).padStart(2, "0")}-01`;
    while (FM.weekday(d) !== dow) d = FM.addDays(d, 1);
    return FM.addDays(d, (n - 1) * 7);
  };
  const SAT = 6;
  const TUE = 2;
  const SUN = 0;
  // ngày của từng vòng (EFL bán kết: [lượt đi, lượt về])
  const DATES = {
    fac: (y) => [nth(y, 11, SAT, 1), nth(y, 12, SAT, 1), nth(y + 1, 1, SAT, 2), nth(y + 1, 2, SAT, 2), nth(y + 1, 3, SAT, 1), nth(y + 1, 4, SAT, 1), nth(y + 1, 4, SAT, 4), nth(y + 1, 5, SAT, 3)],
    efl: (y) => [nth(y, 8, TUE, 2), nth(y, 8, TUE, 4), nth(y, 9, TUE, 3), nth(y, 10, TUE, 4), nth(y, 12, TUE, 3), [nth(y + 1, 1, TUE, 2), nth(y + 1, 2, TUE, 1)], nth(y + 1, 3, SUN, 4)],
  };
  // ngày giải Anh phải né: thứ Bảy FA Cup (theo hạng đấu nào còn nhiều đội đá vòng đó) và các ngày League Cup
  E.blocked = function (season, tier) {
    const fac = DATES.fac(season);
    const idx = tier === 1 ? [2, 3, 4, 5, 6] : tier === 2 ? [2, 3] : [0, 1, 2, 3];
    return { sat: idx.map((i) => fac[i]), mid: DATES.efl(season).flat().slice(0, -1) };
  };

  // ---------- Đội bán chuyên nghiệp (FA Cup vòng 1 – 2) ----------
  // [tên, màu áo, sức chứa]; nl: National League (bậc 5), ns: National League North/South (bậc 6)
  const NON_LEAGUE = {
    nl: [
      ["York City", ["#d4021d", "#1d2c4d"], 8500], ["Rochdale", ["#0057b8", "#000000"], 10200], ["Aldershot Town", ["#d50032", "#0033a0"], 7100], ["Altrincham", ["#d50000", "#ffffff"], 7700],
      ["Boreham Wood", ["#ffffff", "#000000"], 4500], ["Boston United", ["#ffb000", "#000000"], 5000], ["Brackley Town", ["#c8102e", "#ffffff"], 3500], ["Braintree Town", ["#ff7f00", "#003399"], 4200],
      ["Carlisle United", ["#0033a0", "#ffffff"], 17900], ["Eastleigh", ["#005baa", "#ffffff"], 5200], ["FC Halifax Town", ["#003b8e", "#ffffff"], 10400], ["Forest Green Rovers", ["#7cb518", "#000000"], 5100],
      ["Gateshead", ["#000000", "#ffffff"], 11800], ["Hartlepool United", ["#0047ab", "#ffffff"], 7800], ["Morecambe", ["#c8102e", "#ffffff"], 6500], ["Scunthorpe United", ["#7a263a", "#8ac5ff"], 9100],
      ["Solihull Moors", ["#ffd700", "#003087"], 5500], ["Southend United", ["#0033a0", "#ffffff"], 12300], ["Sutton United", ["#ffb300", "#4b2e1a"], 5000], ["Tamworth", ["#c8102e", "#000000"], 4100],
      ["Truro City", ["#000000", "#ffffff"], 3000], ["Wealdstone", ["#0066b3", "#ffffff"], 4100], ["Woking", ["#c8102e", "#ffffff"], 6000], ["Yeovil Town", ["#006b3f", "#ffffff"], 9600],
    ],
    ns: [
      ["Chester", ["#0047ab", "#ffffff"], 5400], ["Darlington", ["#000000", "#ffffff"], 3300], ["Spennymoor Town", ["#111111", "#ffffff"], 3000], ["Scarborough Athletic", ["#c8102e", "#ffffff"], 2800],
      ["South Shields", ["#7a1f3d", "#6cace4"], 4000], ["Buxton", ["#003399", "#ffffff"], 5200], ["Macclesfield", ["#005ba6", "#ffffff"], 5900], ["King's Lynn Town", ["#003399", "#ffd100"], 8200],
      ["Kidderminster Harriers", ["#c8102e", "#ffffff"], 6200], ["Hereford", ["#000000", "#ffffff"], 4900], ["Chorley", ["#000000", "#ffffff"], 4100], ["Marine", ["#000000", "#ffffff"], 3200],
      ["AFC Fylde", ["#ffffff", "#002147"], 6000], ["Oxford City", ["#002f6c", "#ffffff"], 3000], ["Hemel Hempstead Town", ["#c8102e", "#ffffff"], 3200], ["Dorking Wanderers", ["#c8102e", "#ffffff"], 3000],
      ["Worthing", ["#c8102e", "#ffffff"], 4000], ["Chelmsford City", ["#7b1e3a", "#ffffff"], 3000], ["Weston-super-Mare", ["#ffffff", "#000000"], 3500], ["Bath City", ["#000000", "#ffffff"], 3500],
      ["Farnborough", ["#ffd700", "#003087"], 6500], ["Slough Town", ["#ffb000", "#001f5b"], 2000], ["Hampton & Richmond Borough", ["#c8102e", "#003087"], 3500], ["Maidstone United", ["#ffb000", "#000000"], 4200],
      ["Ebbsfleet United", ["#c8102e", "#ffffff"], 4800], ["Torquay United", ["#ffd100", "#0033a0"], 6200], ["Hornchurch", ["#c8102e", "#ffffff"], 3500], ["Dagenham & Redbridge", ["#c8102e", "#0033a0"], 6000],
      ["Enfield Town", ["#ffffff", "#003399"], 2500], ["Maidenhead United", ["#000000", "#ffffff"], 4000],
    ],
  };
  const slug = (n) => n.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // mã 3 chữ không trùng CLB nào trong game (vd. Chelmsford City ≠ Chelsea)
  const usedCodes = new Set([...D.clubs.map((c) => c.code), ...((D.afc && D.afc.clubs) || []).map((c) => c.code)]);
  function codeFor(name) {
    const w = name.replace(/^(FC|AFC) /, "").split(/\s+/).map((x) => x.replace(/[^A-Za-z]/g, "").toUpperCase()).filter(Boolean);
    const [a, b = ""] = w;
    const cands = [a.slice(0, 3), a.slice(0, 2) + (b[0] || a[2]), a[0] + b.slice(0, 2), a[0] + a.slice(2, 4)];
    const code = cands.find((c) => c.length === 3 && !usedCodes.has(c)) || a.slice(0, 2) + usedCodes.size % 10;
    usedCodes.add(code);
    return code;
  }
  const GUESTS = [];
  for (const [level, list] of Object.entries(NON_LEAGUE))
    for (const [name, colors, capacity] of list) {
      const id = `nl-${slug(name)}`;
      const h = FM.hash(id);
      const c = { id, name, code: codeFor(name), country: "en", nat: "Anh", lgName: level === "nl" ? "National League" : "National League North/South", level, colors, capacity, venue: "", rep: level === "nl" ? 22 : 15, str: (level === "nl" ? 48 : 43) + (h % 5), imports: 0, coach: "—" };
      GUESTS.push(c);
      if (A && A.addGuest) A.addGuest(c);
    }
  W.calendarBlocks.push((season, L) => (L.country === "en" ? E.blocked(season, L.tier) : null));
  E.isGuest = (id) => typeof id === "string" && id.startsWith("nl-");

  // ---------- Tiện ích ----------
  const name = (s, id) => W.baseClub(s, id).name;
  const shuffle = (rnd, arr) => arr.map((x) => [rnd(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
  const gbp = (k) => FM.gbpToTy(k * 1000);
  const tierOf = (s, id) => (s.clubs[id] ? FM.LEAGUE[s.clubs[id].league]?.tier || 9 : 9);
  E.isEn = (f) => f.lg === "fac" || f.lg === "efl" || f.lg === "cs";
  E.roundName = (comp, r) => ROUNDS[comp]?.[r] || "";
  E.label = (f) => (f.lg === "cs" ? "Community Shield" : `${E.COMPS[f.lg].name} · ${E.roundName(f.lg, f.rd)}${f.leg ? ` lượt ${f.leg === 1 ? "đi" : "về"}` : ""}`);
  const near = (a, b) => Math.abs(FM.daysBetween(a, b)) <= 1;
  const busy = (s, id, d, except) => s.fx.some((g) => g !== except && !g.done && (g.h === id || g.a === id) && near(g.d, d));

  // trận giải của đội dự cúp trùng lịch (cách nhau ≤ 1 ngày) → hoãn sang thứ Ba / thứ Tư gần nhất còn trống
  function makeRoom(s, f) {
    for (const id of [f.h, f.a]) {
      if (!s.clubs[id]) continue;
      for (const g of s.fx.filter((x) => x !== f && !x.done && (x.h === id || x.a === id) && near(x.d, f.d))) {
        if (!FM.LEAGUE[g.lg]) continue;
        let d = FM.addDays(f.d, 2);
        for (let i = 0; i < 60; i++, d = FM.addDays(d, 1)) if ([2, 3].includes(FM.weekday(d)) && !busy(s, g.h, d, g) && !busy(s, g.a, d, g)) break;
        const was = g.d;
        g.d = d;
        if (g.h === s.user || g.a === s.user)
          W.mail(s, "league", "Trận đấu bị hoãn", `Trận ${name(s, g.h)} – ${name(s, g.a)} (${W.leagueName(g.lg)}, vòng ${g.rd}) dời từ ${FM.fmtDate(was, false)} sang ${FM.fmtDate(d, false)} vì lịch ${W.fxLabel(s, f)}.`);
      }
    }
  }
  E.makeRoom = makeRoom; // dùng cả cho Champions League
  function fixture(s, comp, r, h, a, d, extra = {}) {
    const f = { id: `${s.season}-${comp}-${r}-${h}${extra.leg ? `-${extra.leg}` : ""}`, lg: comp, rd: r, d, h, a, hg: null, ag: null, done: false, ...extra };
    s.fx.push(f);
    makeRoom(s, f);
    return f;
  }

  // ---------- Bắt đầu mùa ----------
  E.start = function (s) {
    const en = Object.keys(s.clubs).filter((id) => W.countryOfClub(s, id) === "en");
    if (!en.length) return;
    const rnd = FM.rng(FM.hash(`encup-${s.season}-${s.seed}`));
    const inLg = (lg) => W.clubsIn(s, lg);
    const last = s.history[s.history.length - 1];
    const first = s.season === D.meta.season;
    // cúp châu Âu: 8 đội đầu Premier League mùa trước còn ở Premier League (thiếu thì lấy đội mạnh nhất)
    let euro = first ? [...SEASON1.euro] : (last && last.tables && last.tables[PL]) || [];
    euro = euro.filter((id) => s.clubs[id] && s.clubs[id].league === PL);
    for (const id of inLg(PL).sort((a, b) => W.strength(s, b) - W.strength(s, a))) if (euro.length < EURO && !euro.includes(id)) euro.push(id);
    euro = euro.slice(0, EURO);
    // đội bán chuyên nghiệp: 20 đội National League + 12 đội bậc 6, trừ những đội đang ở trong hệ thống giải
    const taken = new Set(en.map((id) => name(s, id)));
    const pickG = (level, n) => shuffle(rnd, GUESTS.filter((g) => g.level === level && !taken.has(g.name))).slice(0, n);
    let guests = pickG("nl", 20);
    guests = [...guests, ...pickG("ns", 32 - guests.length)].map((g) => g.id);
    s.enc = {
      season: s.season,
      fac: { round: 0, ties: [], alive: [...inLg(L1), ...inLg(L2), ...guests], out: {}, winner: null, runnerUp: null, guests },
      efl: { round: 0, ties: [], alive: [...inLg(CH), ...inLg(L1), ...inLg(L2)], out: {}, winner: null, runnerUp: null, euro },
      cs: null,
    };
    // Community Shield
    let a = first ? SEASON1.shield[0] : last && last.champions && last.champions[PL];
    let b = first ? SEASON1.shield[1] : last && last.enc && last.enc.fac && last.enc.fac.winner;
    const ok = (id) => id && s.clubs[id];
    if (!ok(a)) a = inLg(PL).sort((x, y) => W.baseClub(s, y).rep - W.baseClub(s, x).rep)[0];
    if (!ok(b) || b === a) b = (last && last.tables && (last.tables[PL] || []).find((id) => id !== a && ok(id))) || inLg(PL).filter((id) => id !== a).sort((x, y) => W.baseClub(s, y).rep - W.baseClub(s, x).rep)[0];
    const r1 = s.fx.filter((f) => f.lg === PL && f.rd === 1).map((f) => f.d).sort()[0];
    let d = r1 ? FM.addDays(r1, -6) : FM.addDays(s.date, 4);
    if (d <= s.date) d = FM.addDays(s.date, 2);
    const cs = fixture(s, "cs", 0, a, b, d, { ko: true, neutral: true });
    s.enc.cs = { fx: cs.id, winner: null };
    draw(s, "fac", rnd);
    draw(s, "efl", rnd);
    if (W.countryOfClub(s, s.user) === "en") {
      const lines = [];
      if (a === s.user || b === s.user) lines.push(`• Community Shield ${FM.fmtDate(d, false)} ở Wembley gặp ${name(s, a === s.user ? b : a)}.`);
      lines.push(`• League Cup: vào từ ${E.roundName("efl", entry(s, "efl", s.user))}.`);
      lines.push(`• FA Cup: vào từ ${E.roundName("fac", entry(s, "fac", s.user))}.`);
      W.mail(s, "cup", "Các cúp trong nước mùa này", `${lines.join("\n")}\n\nTất cả đá loại trực tiếp; hoà thì đá luân lưu (riêng bán kết League Cup đá hai lượt). Bán kết FA Cup và các trận chung kết ở Wembley.`);
    }
  };
  // vòng đội bắt đầu tham dự
  function entry(s, comp, id) {
    const lg = s.clubs[id] && s.clubs[id].league;
    if (comp === "fac") return lg === PL || lg === CH ? 2 : 0;
    if (lg !== PL) return 0;
    return s.enc.efl.euro.includes(id) ? 2 : 1;
  }

  function draw(s, comp, rnd) {
    const st = s.enc[comp];
    const r = st.round;
    const teams = shuffle(rnd, st.alive);
    const dates = DATES[comp](s.season);
    const twoLegs = (TWO_LEGS[comp] || []).includes(r);
    const neutral = r >= NEUTRAL_FROM[comp];
    const at = (d) => (d > FM.addDays(s.date, 2) ? d : FM.addDays(s.date, 3));
    for (let i = 0; i + 1 < teams.length; i += 2) {
      const [h, a] = [teams[i], teams[i + 1]];
      let legs;
      if (twoLegs) {
        const [d1, d2] = dates[r];
        legs = [fixture(s, comp, r, h, a, at(d1), { leg: 1 }).id, fixture(s, comp, r, a, h, at(d2), { leg: 2 }).id];
      } else legs = [fixture(s, comp, r, h, a, at(dates[r]), { ko: true, neutral }).id];
      st.ties.push({ r, a: h, b: a, legs, w: null });
      if (h === s.user || a === s.user) {
        const opp = h === s.user ? a : h;
        const fs = legs.map((id) => s.fx.find((f) => f.id === id));
        const where = twoLegs ? `lượt đi ${FM.fmtDate(fs[0].d, false)} (${fs[0].h === s.user ? "sân nhà" : "sân khách"}), lượt về ${FM.fmtDate(fs[1].d, false)}` : `${FM.fmtDate(fs[0].d, false)} ${neutral ? "ở Wembley" : h === s.user ? "(sân nhà)" : "(sân khách)"}`;
        const lv = E.isGuest(opp) ? ` — đội bán chuyên nghiệp ở ${A.club(opp).lgName}` : "";
        W.mail(s, "cup", `${E.COMPS[comp].name} · ${E.roundName(comp, r)}: gặp ${name(s, opp)}`, `Kết quả bốc thăm ${E.roundName(comp, r)} ${E.COMPS[comp].name}: ${name(s, h)} – ${name(s, a)}${lv}, ${where}.${twoLegs ? " Thắng theo tổng tỉ số hai lượt, hoà thì đá luân lưu sau lượt về." : " Đá một trận, hoà thì đá luân lưu."}`);
      }
    }
  }

  // ---------- Sau mỗi ngày thi đấu ----------
  E.progress = function (s) {
    if (!s.enc) return;
    const cs = s.enc.cs;
    if (cs && !cs.winner) {
      const f = s.fx.find((x) => x.id === cs.fx);
      if (f && f.done) {
        cs.winner = f.hg > f.ag || (f.hg === f.ag && f.pens && f.pens[0] > f.pens[1]) ? f.h : f.a;
        if (f.h === s.user || f.a === s.user) {
          const won = cs.winner === s.user;
          if (won) s.clubs[s.user].conf = Math.min(100, s.clubs[s.user].conf + CONF.cs);
          W.mail(s, "cup", won ? "🛡️ Giành Community Shield!" : "Thua ở Community Shield", `Community Shield ở Wembley: ${name(s, f.h)} ${f.hg}–${f.ag} ${name(s, f.a)}${f.pens ? ` (luân lưu ${f.pens.join("–")})` : ""}.`);
        }
      }
    }
    for (const comp of ["fac", "efl"]) step(s, comp);
  };
  function step(s, comp) {
    const st = s.enc[comp];
    if (st.winner) return;
    const ties = st.ties.filter((t) => t.r === st.round);
    if (!ties.length || !ties.every((t) => W.resolveTie(s, t))) return;
    const last = st.round === ROUNDS[comp].length - 1;
    for (const t of ties) {
      const loser = t.w === t.a ? t.b : t.a;
      st.out[loser] = st.round;
      if (s.clubs[t.w] && PRIZE[comp][st.round]) s.clubs[t.w].bal += gbp(PRIZE[comp][st.round]);
      if (loser === s.user && !last) W.mail(s, "cup", `Bị loại khỏi ${E.COMPS[comp].name}`, `CLB dừng bước ở ${E.roundName(comp, st.round)} ${E.COMPS[comp].name} sau ${t.legs.length > 1 ? `hai lượt trận (tổng tỉ số ${t.agg ? (t.a === s.user ? t.agg : [t.agg[1], t.agg[0]]).join("–") : "?"}${t.pens ? ", thua luân lưu" : ""})` : "trận"} gặp ${name(s, t.w)}.`);
      else if (t.w === s.user && !last && st.round + 1 < ROUNDS[comp].length) W.mail(s, "cup", `${E.COMPS[comp].name}: vào ${E.roundName(comp, st.round + 1)}`, `CLB vượt qua ${name(s, loser)} ở ${E.roundName(comp, st.round)}. Thưởng ${FM.fmtMoney(gbp(PRIZE[comp][st.round] || 0))}.`);
    }
    if (last) {
      const t = ties[0];
      st.winner = t.w;
      st.runnerUp = t.w === t.a ? t.b : t.a;
      if (s.clubs[t.w]) s.clubs[t.w].bal += gbp(CHAMP[comp]);
      if (t.w === s.user) s.clubs[s.user].conf = Math.min(100, s.clubs[s.user].conf + CONF[comp]);
      const f = s.fx.find((x) => x.id === t.legs[0]);
      const pens = f.pens ? ` (luân lưu ${f.pens.join("–")})` : "";
      if (W.countryOfClub(s, s.user) === "en") W.mail(s, "cup", t.w === s.user ? `🏆 VÔ ĐỊCH ${E.COMPS[comp].name.toUpperCase()}!` : `${name(s, t.w)} vô địch ${E.COMPS[comp].name}`, `Chung kết ${E.COMPS[comp].name} ở Wembley: ${name(s, f.h)} ${f.hg}–${f.ag} ${name(s, f.a)}${pens}.${t.w === s.user ? ` Thưởng ${FM.fmtMoney(gbp(CHAMP[comp]))}, ban lãnh đạo rất hài lòng!` : ""}`);
      return;
    }
    st.alive = ties.map((t) => t.w);
    st.round++;
    // đội vào từ vòng sau
    if (comp === "fac" && st.round === 2) st.alive.push(...W.clubsIn(s, PL), ...W.clubsIn(s, CH));
    if (comp === "efl" && st.round === 1) st.alive.push(...W.clubsIn(s, PL).filter((id) => !st.euro.includes(id)));
    if (comp === "efl" && st.round === 2) st.alive.push(...st.euro.filter((id) => s.clubs[id]));
    draw(s, comp, FM.rng(FM.hash(`encup-${comp}-${s.season}-${st.round}-${s.seed}`)));
  }
  E.finished = (s) => !s.enc || (!!s.enc.fac.winner && !!s.enc.efl.winner && (!s.enc.cs || !!s.enc.cs.winner));

  // ---------- Cuối mùa ----------
  E.endOfSeason = function (s, sum) {
    if (!s.enc) return;
    sum.enc = { fac: { winner: s.enc.fac.winner, runnerUp: s.enc.fac.runnerUp }, efl: { winner: s.enc.efl.winner, runnerUp: s.enc.efl.runnerUp }, cs: s.enc.cs ? s.enc.cs.winner : null };
    const last = s.history[s.history.length - 1];
    if (last) last.enc = sum.enc;
  };

  // ---------- Cho giao diện ----------
  // [{ name, r, ties: [{ a, b, legs: [fixture], w, agg, pens }] }] — vòng mới nhất trước
  E.rounds = (s, comp) => {
    const st = s.enc && s.enc[comp];
    if (!st) return [];
    const out = [];
    for (let r = st.round; r >= 0; r--) {
      const ties = st.ties.filter((t) => t.r === r).map((t) => ({ ...t, legs: t.legs.map((id) => s.fx.find((f) => f.id === id)) }));
      if (ties.length) out.push({ name: E.roundName(comp, r), r, ties });
    }
    return out;
  };
  E.userStatus = function (s, comp, id = s.user) {
    const st = s.enc && s.enc[comp];
    if (!st) return "";
    if (st.winner === id) return "Vô địch 🏆";
    if (st.runnerUp === id) return "Á quân";
    if (st.out[id] !== undefined) return `Bị loại ở ${E.roundName(comp, st.out[id])}`;
    if (st.winner) return "Không tham dự";
    if (st.alive.includes(id)) {
      // đã thắng trận của mình, chờ các cặp khác đá xong để bốc thăm
      const t = st.ties.find((x) => x.r === st.round && (x.a === id || x.b === id));
      const fs = t ? t.legs.map((fid) => s.fx.find((f) => f.id === fid)) : [];
      if (t && fs.every((f) => f.done) && W.resolveTie(s, t) && t.w === id) return `Vào ${E.roundName(comp, st.round + 1)}, chờ bốc thăm`;
      if (t && fs.every((f) => f.done) && t.w !== id) return `Bị loại ở ${E.roundName(comp, st.round)}`;
      return `Đang ở ${E.roundName(comp, st.round)}`;
    }
    if (!s.clubs[id]) return "";
    const e = entry(s, comp, id);
    return e > st.round ? `Vào từ ${E.roundName(comp, e)}` : "";
  };
})();
