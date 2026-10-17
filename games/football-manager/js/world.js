// Thế giới game: ván mới, lịch thi đấu, diễn biến theo ngày (thể lực, chấn thương, treo giò,
// tài chính), áp kết quả trận, bảng xếp hạng, hộp thư, cuối mùa (play-off, lên/xuống hạng)
// và sang mùa mới (già đi, phát triển, giải nghệ, lứa trẻ).
// Toàn bộ thứ thay đổi được nằm trong `state` (lưu được); dữ liệu gốc ở FM_DATA không đổi.
(function () {
  "use strict";
  const FM = window.FM;
  const D = window.FM_DATA;
  const A = FM.A;
  const V1 = "vietnam-v-league-1";
  const V2 = "vietnam-v-league-2";
  FM.V1 = V1;
  FM.V2 = V2;
  const BASE = new Map(D.players.map((p) => [p.id, p]));
  const BASE_CLUB = new Map(D.clubs.map((c) => [c.id, c]));
  const YELLOW_BAN = 4; // tích đủ 4 thẻ vàng → treo giò 1 trận

  const W = (FM.World = {});

  // ---------- Truy cập ----------
  W.baseClub = (s, id) => s.extraClubs[id] || BASE_CLUB.get(id) || (FM.AFC && FM.AFC.club(id));
  W.club = (s, id) => ({ ...W.baseClub(s, id), ...s.clubs[id], id });
  W.clubsIn = (s, league) => Object.keys(s.clubs).filter((id) => s.clubs[id].league === league);
  W.player = (s, id) => {
    if (FM.AFC && typeof id === "string" && id.startsWith("afc-")) return FM.AFC.player(s, id); // cầu thủ CLB nước ngoài (sinh ra)
    const base = s.extraPlayers[id] || BASE.get(id);
    const dyn = s.p[id];
    if (!base || !dyn) return null;
    const p = { ...base, ...dyn, a: dyn.a || base.a };
    p.age = FM.ageOn(p, s.date);
    p.available = !dyn.inj && !dyn.sus;
    p.free = dyn.c === "free"; // cầu thủ tự do
    if (FM.Transfers) p.val = FM.Transfers.value(s, p);
    return p;
  };
  W.squad = (s, clubId) => (FM.AFC && FM.AFC.isForeign(clubId) ? FM.AFC.squad(s, clubId) : null) || Object.keys(s.p).filter((id) => s.p[id].c === clubId).map((id) => W.player(s, id));

  // ---------- Tên người Việt cho cầu thủ trẻ / đội mới ----------
  const HO = ["Nguyễn", "Nguyễn", "Nguyễn", "Trần", "Trần", "Lê", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Đinh", "Trịnh", "Mai", "Cao"];
  const DEM = ["Văn", "Văn", "Văn", "Đức", "Minh", "Quang", "Thành", "Hữu", "Công", "Xuân", "Ngọc", "Tuấn", "Đình", "Hoàng", "Trọng", "Anh", "Thanh", "Gia", "Bá", "Hải"];
  const TEN = ["Hải", "Hùng", "Dũng", "Long", "Nam", "Phúc", "Tài", "Khoa", "Huy", "Đạt", "Thắng", "Lâm", "Sơn", "Tùng", "Vinh", "Kiên", "Toàn", "Hậu", "Mạnh", "Hiếu", "Trung", "Tâm", "Khang", "Bảo", "Lộc", "Quân", "Thịnh", "Tú", "Việt", "Cường", "Phong", "An", "Hoà", "Nghĩa", "Đông", "Tiến", "Bình", "Duy", "Khánh", "Thái"];
  const LOWER_CLUBS = ["Đắk Lắk", "Quảng Ngãi", "Tây Ninh", "Vĩnh Long", "Hà Tĩnh", "Phù Đổng", "Gia Định", "Kon Tum", "Bình Thuận", "Mekong Cần Thơ", "Đồng Tháp", "Bà Rịa", "Gia Lai", "Quảng Trị", "Nam Định B", "Hà Nội B"];

  // sinh một cầu thủ mới (lứa trẻ / đội mới lên hạng)
  function genPlayer(s, clubId, rnd, pos, caLo, caHi, age) {
    const id = `gen-${s.season}-${clubId}-${s.genCounter++}`;
    const ca = rnd.int(caLo, caHi);
    const pa = Math.min(85, ca + rnd.int(age <= 19 ? 12 : 2, age <= 19 ? 34 : 10));
    const w = FM.PROFILE_W[pos];
    const a = w.map((wi, i) => {
      if (pos !== "GK" && i >= A.reflexes) return rnd.int(1, 4);
      return FM.clamp(Math.round(ca * 0.21 * (0.5 + 0.5 * wi) + rnd.normal(1.2)), 1, 20);
    });
    const ho = rnd.pick(HO);
    const name = `${ho} ${rnd.pick(DEM)} ${rnd.pick(TEN)}`;
    const alt = { [pos]: 20 };
    const by = s.season - age;
    s.extraPlayers[id] = {
      id,
      n: name,
      sn: name.split(" ").slice(-2).join(" "),
      c: clubId,
      no: null,
      pos,
      alt,
      by,
      bd: null,
      nat: "Việt Nam",
      h: pos === "GK" || pos === "CB" ? rnd.int(178, 188) : rnd.int(166, 180),
      w: rnd.int(60, 76),
      ca,
      pa,
      ft: rnd() < 0.75 ? "right" : "left",
      a,
      hid: [rnd.int(6, 16), rnd.int(3, 14), rnd.int(6, 16)],
      fs: 0,
      vk: 0,
      nt: null,
      wage: Math.max(5, Math.round(6 + (ca - 35) * 0.8)),
      val: Math.round(Math.max(0.1, 0.4 * Math.exp((ca - 45) * 0.109) * (1 + (pa - ca) / 40)) * 10) / 10,
      ce: `${s.season + 3}-06-30`,
      ls: null,
      gen: true,
    };
    s.p[id] = newDyn(clubId, ca);
    return id;
  }
  function newDyn(clubId, ca) {
    return { c: clubId, ca, fit: 100, mor: 55, inj: null, injName: null, sus: 0, ycs: 0, st: blankStats() };
  }
  const blankStats = () => ({ ap: 0, g: 0, as: 0, yc: 0, rc: 0, rs: 0, mm: 0, cs: 0 });

  // ---------- Lịch thi đấu ----------
  // thứ Bảy đầu tiên của tháng 9; nghỉ các tuần FIFA và Tết; V.League 1 thứ Bảy, V.League 2 Chủ nhật
  const BREAK_WEEKS = new Set([5, 10, 16, 21, 22, 23, 28]);
  function roundDates(season) {
    let d = `${season}-09-01`;
    while (FM.weekday(d) !== 6) d = FM.addDays(d, 1);
    const dates = [];
    for (let w = 0; dates.length < 26; w++) if (!BREAK_WEEKS.has(w)) dates.push(FM.addDays(d, w * 7));
    return dates;
  }
  // vòng tròn 2 lượt (thuật toán xoay vòng), lượt về đảo sân
  function roundRobin(ids, rnd) {
    const t = [...ids].sort(() => rnd() - 0.5);
    if (t.length % 2) t.push(null);
    const n = t.length;
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) {
        const a = t[i];
        const b = t[n - 1 - i];
        if (a && b) pairs.push(r % 2 === (i === 0 ? 0 : i % 2) ? [a, b] : [b, a]);
      }
      rounds.push(pairs);
      t.splice(1, 0, t.pop());
    }
    return [...rounds, ...rounds.map((rd) => rd.map(([a, b]) => [b, a]))];
  }
  function makeFixtures(s) {
    const rnd = FM.rng(FM.hash(`fixtures-${s.season}-${s.seed}`));
    const dates = roundDates(s.season);
    s.fx = [];
    for (const league of [V1, V2]) {
      const rounds = roundRobin(W.clubsIn(s, league), rnd);
      rounds.forEach((pairs, ri) => {
        const date = league === V1 ? dates[ri] : FM.addDays(dates[ri], 1);
        for (const [h, a] of pairs) s.fx.push({ id: `${s.season}-${league === V1 ? 1 : 2}-${ri + 1}-${h}`, lg: league, rd: ri + 1, d: date, h, a, hg: null, ag: null, done: false });
      });
    }
    s.seasonStart = dates[0];
  }

  // ---------- Ván mới ----------
  W.newGame = function (userClubId, seed = Math.floor(Math.random() * 1e9)) {
    const season = D.meta.season;
    const s = {
      v: 1,
      seed,
      season,
      date: null,
      user: userClubId,
      manager: "Bạn",
      phase: "season",
      clubs: {},
      p: {},
      extraPlayers: {},
      extraClubs: {},
      fx: [],
      inbox: [],
      history: [],
      genCounter: 0,
      msgCounter: 0,
    };
    for (const c of D.clubs) s.clubs[c.id] = { league: c.league, bal: Math.round(c.budget * 2.5 * 10) / 10, conf: 60, form: [], formation: null, tactics: { ...FM.DEFAULT_TACTICS }, lineup: null, bench: null, gate: 0, wageCap: Math.round(c.wageBudget * 1.15) };
    for (const p of D.players) s.p[p.id] = newDyn(p.c, p.ca);
    startSeason(s);
    return s;
  };

  function startSeason(s) {
    makeFixtures(s);
    s.date = FM.addDays(s.seasonStart, -10);
    s.phase = "season";
    s.playoff = null;
    // máy chọn sơ đồ hợp đội hình nhất cho mỗi CLB, đặt mục tiêu ban lãnh đạo
    for (const id of Object.keys(s.clubs)) {
      const best = FM.bestFormation(W.squad(s, id));
      const c = s.clubs[id];
      if (id !== s.user || !c.formation) {
        c.formation = best.formation;
        c.lineup = best.lineup;
        c.bench = best.bench;
      }
      c.form = [];
    }
    for (const league of [V1, V2]) {
      const ranked = W.clubsIn(s, league).sort((a, b) => W.strength(s, b) - W.strength(s, a));
      ranked.forEach((id, i) => (s.clubs[id].obj = objective(league, i + 1)));
    }
    if (FM.Training) FM.Training.startSeason(s);
    if (FM.Cups) FM.Cups.start(s);
    if (FM.AFC) FM.AFC.start(s);
    const uc = W.club(s, s.user);
    mail(s, "board", `Chào mừng HLV mới của ${uc.name}`, `Ban lãnh đạo ${uc.name} chào mừng bạn đến với mùa giải ${label(s)} tại ${leagueName(uc.league)}.\n\nMục tiêu của CLB: **${uc.obj.label}** (xếp hạng ${uc.obj.target} trở lên).\nNgân sách hiện có: ${FM.fmtMoney(uc.bal)}.\n\nTrận đầu tiên: ${nextFixtureText(s)}. Chúc may mắn!`);
  }
  function objective(league, rank) {
    if (league === V1) {
      if (rank === 1) return { label: "Vô địch V.League 1", target: 1 };
      if (rank <= 3) return { label: "Lọt vào top 3", target: 3 };
      if (rank <= 6) return { label: "Nửa trên bảng xếp hạng", target: 7 };
      if (rank <= 10) return { label: "Trụ hạng an toàn", target: 10 };
      return { label: "Trụ hạng", target: 12 };
    }
    if (rank <= 2) return { label: "Lên hạng V.League 1", target: 1, promote: true };
    if (rank <= 5) return { label: "Lọt vào top 4", target: 4 };
    if (rank <= 10) return { label: "Nửa trên bảng xếp hạng", target: 7 };
    return { label: "Trụ hạng", target: 13 };
  }
  W.strength = (s, clubId) => {
    const top = W.squad(s, clubId).map((p) => p.ca).sort((a, b) => b - a).slice(0, 11);
    return top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
  };
  const label = (s) => `${s.season}/${String((s.season + 1) % 100).padStart(2, "0")}`;
  W.label = label;
  const leagueName = (id) => (id === V1 ? "V.League 1" : "V.League 2");
  W.leagueName = leagueName;
  function nextFixtureText(s) {
    const f = W.nextFixture(s, s.user);
    if (!f) return "chưa có";
    const home = f.h === s.user;
    return `${home ? "tiếp" : "làm khách trước"} ${W.baseClub(s, home ? f.a : f.h).name}, ${FM.fmtDate(f.d)}`;
  }

  // ---------- Hộp thư ----------
  function mail(s, kind, title, body) {
    const msg = { id: ++s.msgCounter, d: s.date, k: kind, t: title, b: body, r: kind === "result" };
    s.inbox.unshift(msg);
    if (s.inbox.length > 80) s.inbox.length = 80;
    return msg;
  }
  W.mail = mail;

  // ---------- Truy vấn lịch / BXH ----------
  W.fxLabel = (s, f) => (FM.AFC && FM.AFC.isAfc(f) ? FM.AFC.label(f) : f.po ? "Play-off" : f.lg === "super" ? "Siêu Cúp Quốc gia" : f.lg === "cup" ? `Cúp QG · ${FM.Cups ? FM.Cups.roundName(f.rd) : ""}` : `Vòng ${f.rd}`);
  W.nextFixture = (s, clubId) => s.fx.filter((f) => !f.done && (f.h === clubId || f.a === clubId)).sort((a, b) => a.d.localeCompare(b.d))[0] || null;
  W.table = function (s, league) {
    const rows = {};
    for (const id of W.clubsIn(s, league)) rows[id] = { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] };
    for (const f of s.fx) {
      if (!f.done || f.lg !== league || f.po) continue;
      const h = rows[f.h];
      const a = rows[f.a];
      if (!h || !a) continue;
      h.p++;
      a.p++;
      h.gf += f.hg;
      h.ga += f.ag;
      a.gf += f.ag;
      a.ga += f.hg;
      if (f.hg > f.ag) {
        h.w++;
        a.l++;
        h.pts += 3;
        h.form.push("W");
        a.form.push("L");
      } else if (f.hg < f.ag) {
        a.w++;
        h.l++;
        a.pts += 3;
        h.form.push("L");
        a.form.push("W");
      } else {
        h.d++;
        a.d++;
        h.pts++;
        a.pts++;
        h.form.push("D");
        a.form.push("D");
      }
    }
    return Object.values(rows)
      .map((r) => ({ ...r, gd: r.gf - r.ga, form: r.form.slice(-5) }))
      .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || W.baseClub(s, x.id).name.localeCompare(W.baseClub(s, y.id).name));
  };
  W.position = (s, clubId) => W.table(s, s.clubs[clubId].league).findIndex((r) => r.id === clubId) + 1;
  W.topScorers = (s, league, n = 15) =>
    Object.keys(s.p)
      .filter((id) => s.p[id].st.g > 0 && s.clubs[s.p[id].c]?.league === league)
      .map((id) => W.player(s, id))
      .sort((a, b) => b.st.g - a.st.g || b.st.as - a.st.as)
      .slice(0, n);

  // ---------- Chuẩn bị đội cho một trận ----------
  W.sideFor = function (s, clubId, ai) {
    if (FM.AFC && FM.AFC.isForeign(clubId)) return FM.AFC.side(s, clubId);
    const c = s.clubs[clubId];
    const squad = W.squad(s, clubId);
    const byId = Object.fromEntries(squad.map((p) => [p.id, p]));
    let lineup = c.lineup || [];
    let bench = c.bench || [];
    const slots = FM.FORMATIONS[c.formation];
    if (ai || lineup.length !== slots.length) {
      const pick = FM.autoPick(squad, c.formation);
      lineup = pick.lineup;
      bench = pick.bench;
    } else {
      // người chơi: ai không đá được thì thay bằng người hợp nhất còn lại
      lineup = W.fixLineup(s, clubId).lineup;
      bench = (c.bench || []).filter((id) => byId[id]?.available && !lineup.includes(id));
      // dự bị thiếu thì bổ sung người khoẻ nhất còn lại
      for (const p of squad.filter((q) => q.available && !lineup.includes(q.id) && !bench.includes(q.id)).sort((a, b) => b.ca - a.ca)) if (bench.length < FM.BENCH_SIZE) bench.push(p.id);
      bench = bench.slice(0, FM.BENCH_SIZE);
    }
    const base = W.baseClub(s, clubId);
    const fam = FM.Training ? FM.Training.famMult(s, clubId) : 1;
    return { clubId, name: base.name, code: base.code, formation: c.formation, tactics: { ...c.tactics }, lineup, bench, players: byId, ai, fam };
  };
  // sửa đội hình người chơi: thay người chấn thương/treo giò, đảm bảo ≤ 4 ngoại binh
  W.fixLineup = function (s, clubId) {
    const c = s.clubs[clubId];
    const squad = W.squad(s, clubId);
    const byId = Object.fromEntries(squad.map((p) => [p.id, p]));
    const slots = FM.FORMATIONS[c.formation];
    const lineup = slots.map((_, i) => (c.lineup && byId[c.lineup[i]]?.available ? c.lineup[i] : null));
    const changed = [];
    let foreign = lineup.filter((id) => id && byId[id].fs).length;
    while (foreign > FM.MAX_FOREIGN_ON_PITCH) {
      const i = lineup.findLastIndex((id) => id && byId[id].fs);
      lineup[i] = null;
      foreign--;
    }
    slots.forEach(([role], i) => {
      if (lineup[i]) return;
      const cand = squad
        .filter((p) => p.available && !lineup.includes(p.id) && !(p.fs && foreign >= FM.MAX_FOREIGN_ON_PITCH))
        .sort((a, b) => FM.effective(b, role, b.fit, b.mor) - FM.effective(a, role, a.fit, a.mor))[0];
      if (cand) {
        lineup[i] = cand.id;
        if (cand.fs) foreign++;
        changed.push(cand.id);
      }
    });
    return { lineup, changed };
  };

  // ---------- Đá một trận và áp kết quả ----------
  W.matchSeed = (s, f) => FM.hash(`${f.id}-${s.seed}`);
  W.playAI = function (s, f) {
    if (FM.AFC && FM.AFC.quickPlay(s, f)) return null; // hai đội nước ngoài: tính nhanh
    const m = FM.createMatch(W.sideFor(s, f.h, true), W.sideFor(s, f.a, true), { seed: W.matchSeed(s, f), neutral: !!(f.po || f.neutral) }).runToEnd();
    W.applyResult(s, f, m);
    return m;
  };
  W.applyResult = function (s, f, m) {
    const [H, A2] = m.sides;
    f.hg = H.goals;
    f.ag = A2.goals;
    // play-off / cúp hoà → đá luân lưu
    if ((f.po || f.ko) && f.hg === f.ag) {
      const rnd = FM.rng(W.matchSeed(s, f) + 7);
      const ph = rnd.int(3, 5);
      let pa = rnd.int(2, 5);
      if (pa === ph) pa = ph - 1;
      f.pens = [ph, pa];
    }
    f.done = true;
    f.sc = m.events.filter((e) => e.type === "goal").map((e) => ({ id: e.scorer, side: e.side, min: e.label }));
    f.motm = m.motm;
    const rnd = FM.rng(W.matchSeed(s, f) + 1);
    for (const side of m.sides) {
      const res = Math.sign(side.goals - m.sides[1 - side.idx].goals);
      const club = s.clubs[side.clubId];
      if (!club) {
        // CLB nước ngoài (cúp châu Á): chỉ ghi phong độ
        const st = FM.AFC && FM.AFC.state(s, side.clubId);
        if (st) {
          st.form.push(res > 0 ? "W" : res < 0 ? "L" : "D");
          if (st.form.length > 6) st.form.shift();
        }
        continue;
      }
      club.form.push(res > 0 ? "W" : res < 0 ? "L" : "D");
      if (club.form.length > 6) club.form.shift();
      // ban lãnh đạo: thắng đội mạnh hơn được nhiều điểm tin tưởng hơn
      const gap = W.strength(s, m.sides[1 - side.idx].clubId) - W.strength(s, side.clubId);
      club.conf = FM.clamp(club.conf + (res > 0 ? 2 + Math.max(0, gap) * 0.15 : res < 0 ? -2.5 + Math.max(0, gap) * 0.15 : 0.3), 0, 100);
      const afcGame = f.lg === "acle" || f.lg === "acl2";
      const cupGame = f.lg === "cup" || f.lg === "super" || afcGame;
      for (const L of Object.values(side.live)) {
        const d = s.p[L.id];
        if (L.from === null) continue;
        // thống kê cúp để riêng, không cộng vào vua phá lưới giải
        const st = afcGame ? (d.ast ||= blankStats()) : cupGame ? (d.cst ||= blankStats()) : d.st;
        st.ap++;
        st.g += L.g;
        st.as += L.as;
        st.yc += L.yc && !L.rc ? 1 : 0;
        st.rc += L.rc;
        st.rs += L.rating;
        if (m.motm === L.id) st.mm++;
        if (m.sides[1 - side.idx].goals === 0 && L.played >= 60 && ["GK", "CB", "LB", "RB"].includes(L.p.pos)) st.cs++;
        d.fit = Math.round(L.fit);
        d.mor = FM.clamp(d.mor + (res > 0 ? 6 : res < 0 ? -5 : 1) + (L.rating >= 7.5 ? 3 : L.rating < 6 ? -3 : 0), 0, 100);
        if (L.rc) d.sus = Math.max(d.sus, L.yc >= 2 ? 1 : 2);
        else if (L.yc && !cupGame) {
          d.ycs++;
          if (d.ycs % YELLOW_BAN === 0) d.sus = Math.max(d.sus, 1);
        }
        if (L.inj) {
          const days = rnd.weighted([3, 7, 14, 21, 35, 60], (x) => ({ 3: 30, 7: 30, 14: 18, 21: 10, 35: 8, 60: 4 })[x]) + rnd.int(0, 4);
          d.inj = FM.addDays(s.date, days);
          d.injName = rnd.pick(["căng cơ đùi", "bong gân cổ chân", "đau đầu gối", "va chạm mạnh", "rách cơ bắp chân", "chấn thương háng"]);
          if (side.clubId === s.user) mail(s, "medical", `${L.p.sn} chấn thương`, `${L.p.n} gặp ${d.injName} trong trận gặp ${m.sides[1 - side.idx].name}. Dự kiến nghỉ khoảng ${days} ngày (đến ${FM.fmtDate(d.inj, false)}).`);
        }
      }
      // ai đang treo giò mà không được đá trận này thì trừ đi 1 trận
      for (const id of Object.keys(s.p)) {
        const d = s.p[id];
        if (d.c === side.clubId && d.sus > 0 && !side.live[id]) d.sus--;
      }
      for (const L of Object.values(side.live)) {
        const d = s.p[L.id];
        if (side.clubId === s.user && d.sus > 0 && L.from !== null) mail(s, "discipline", `${L.p.sn} bị treo giò`, `${L.p.n} sẽ vắng mặt ${d.sus} trận tới vì ${L.rc ? "thẻ đỏ" : `tích đủ ${YELLOW_BAN} thẻ vàng`}.`);
      }
      // tiền vé cho đội chủ nhà
      if (side.idx === 0 && !f.po && !f.neutral) {
        const base = W.baseClub(s, side.clubId);
        const fill = FM.clamp(0.25 + base.rep / 160 + (club.form.filter((x) => x === "W").length - 2) * 0.04, 0.15, 0.95);
        const gate = Math.round(base.capacity * fill * 60000) / 1e9;
        club.bal += gate;
        club.gate += gate;
        f.att = Math.round(base.capacity * fill);
      }
    }
    if (f.h === s.user || f.a === s.user) {
      userReport(s, f, m);
      if (FM.Scout) FM.Scout.afterMatch(s, m.sides[f.h === s.user ? 1 : 0]);
      if (FM.Morale) FM.Morale.afterMatch(s, m.sides[f.h === s.user ? 0 : 1]);
    }
  };
  function userReport(s, f, m) {
    const home = f.h === s.user;
    const me = m.sides[home ? 0 : 1];
    const op = m.sides[home ? 1 : 0];
    const res = me.goals > op.goals ? "Thắng" : me.goals < op.goals ? "Thua" : "Hoà";
    const scorers = f.sc.filter((x) => x.side === me.idx).map((x) => `${me.live[x.id].p.sn} ${x.min}'`);
    const best = Object.values(me.live).filter((L) => L.from !== null).sort((a, b) => b.rating - a.rating)[0];
    const msg = mail(
      s,
      "result",
      `${res} ${me.goals}–${op.goals} trước ${op.name}`,
      `${f.neutral ? "Sân trung lập" : home ? "Sân nhà" : "Sân khách"} · ${W.fxLabel(s, f)}${f.pens ? ` · luân lưu ${home ? f.pens[0] : f.pens[1]}–${home ? f.pens[1] : f.pens[0]}` : ""}\nGhi bàn: ${scorers.join(", ") || "không"}\nKiểm soát bóng ${me.st.poss}% · Sút ${me.st.shots} (trúng ${me.st.on}) · xG ${me.st.xg.toFixed(2)}\nXuất sắc nhất đội: ${best.p.sn} (${best.rating})`,
    );
  }

  // ---------- Một ngày trôi qua ----------
  // trả về { kind: "match", fixture } khi tới trận của người chơi, "seasonEnd" khi hết mùa
  W.advance = function (s, maxDays = 60) {
    const startMsg = s.msgCounter;
    for (let i = 0; i < maxDays; i++) {
      // trận còn lại trong ngày hiện tại (sau khi người chơi đá xong trận của mình)
      playDay(s);
      if (s.phase === "ended") return { kind: "seasonEnd" };
      const next = W.nextFixture(s, s.user);
      if (next && next.d === s.date) return { kind: "match", fixture: next };
      nextDay(s);
      const today = s.fx.find((f) => !f.done && f.d === s.date && (f.h === s.user || f.a === s.user));
      if (today) return { kind: "match", fixture: today };
      // dừng khi có thư quan trọng mới (chấn thương, treo giò…) trong lần bấm này
      if (s.inbox.some((m) => m.id > startMsg && !m.r && m.k !== "finance" && m.k !== "news" && m.k !== "training")) return { kind: "mail" };
    }
    return { kind: "idle" };
  };
  function playDay(s) {
    for (const f of s.fx) if (!f.done && f.d === s.date && f.h !== s.user && f.a !== s.user) W.playAI(s, f);
    if (FM.Cups) FM.Cups.progress(s);
    if (FM.AFC) FM.AFC.progress(s);
    checkSeasonEnd(s);
  }
  function nextDay(s) {
    s.date = FM.addDays(s.date, 1);
    const rec = FM.Training ? FM.Training.recovery(s) : 1; // giáo án ảnh hưởng tốc độ hồi thể lực
    for (const id in s.p) {
      const d = s.p[id];
      const base = s.extraPlayers[id] || BASE.get(id);
      const stamina = (d.a || base.a)[A.stamina];
      d.fit = Math.min(100, d.fit + (7 + stamina * 0.45) * (d.c === s.user ? rec : 1));
      d.mor += ((FM.Morale ? FM.Morale.target(d) : 55) - d.mor) * 0.03; // người đòi ra đi / bất mãn thì buồn dần
      if (d.inj && d.inj <= s.date) {
        d.inj = null;
        d.fit = Math.min(d.fit, 80);
        if (d.c === s.user) mail(s, "medical", `${base.sn} đã bình phục`, `${base.n} đã khỏi ${d.injName} và có thể ra sân trở lại.`);
        d.injName = null;
      }
    }
    if (FM.Training && FM.weekday(s.date) === 1) FM.Training.weekly(s);
    if (FM.Morale && FM.weekday(s.date) === 1) FM.Morale.weekly(s);
    if (s.date.endsWith("-01")) {
      monthly(s);
      if (FM.Training) FM.Training.monthly(s);
    }
    if (FM.Transfers) FM.Transfers.daily(s);
    if (FM.Scout) FM.Scout.daily(s);
  }
  function monthly(s) {
    for (const id of Object.keys(s.clubs)) {
      const c = s.clubs[id];
      const wages = (FM.Transfers ? FM.Transfers.wageBill(s, id) : W.squad(s, id).reduce((a, p) => a + p.wage, 0)) / 1000; // tỷ / tháng
      const base = W.baseClub(s, id);
      const sponsor = wages * 0.92 + base.rep / 120; // chủ sở hữu + nhà tài trợ bù phần lớn quỹ lương
      c.bal = Math.round((c.bal + sponsor - wages) * 100) / 100;
      if (id === s.user)
        mail(s, "finance", `Báo cáo tài chính tháng ${+s.date.slice(5, 7) === 1 ? 12 : +s.date.slice(5, 7) - 1}`, `Lương cầu thủ: −${FM.fmtMoney(wages)}\nTài trợ & chủ sở hữu: +${FM.fmtMoney(sponsor)}\nTiền vé (cộng dồn mùa): ${FM.fmtMoney(c.gate)}\nSố dư hiện tại: ${FM.fmtMoney(c.bal)}`);
    }
  }

  // ---------- Cuối mùa ----------
  function checkSeasonEnd(s) {
    if (s.phase !== "season" || s.fx.some((f) => !f.done)) return;
    if (FM.Cups && !FM.Cups.finished(s)) return;
    if (FM.AFC && !FM.AFC.finished(s)) return;
    if (!s.playoff) {
      // play-off: đội thứ 13 V.League 1 gặp đội thứ 2 V.League 2, sân trung lập
      const t1 = W.table(s, V1);
      const t2 = W.table(s, V2);
      const last = s.fx.reduce((m, f) => (f.d > m ? f.d : m), s.date);
      const f = { id: `${s.season}-po`, lg: "playoff", po: true, rd: 0, d: FM.addDays(last, 6), h: t1[12].id, a: t2[1].id, hg: null, ag: null, done: false };
      s.fx.push(f);
      s.playoff = f.id;
      mail(s, "league", "Trận play-off lên/xuống hạng", `${W.baseClub(s, f.h).name} (hạng 13 V.League 1) gặp ${W.baseClub(s, f.a).name} (hạng nhì V.League 2) ngày ${FM.fmtDate(f.d)} trên sân trung lập. Đội thắng chơi ở V.League 1 mùa sau.`);
      return;
    }
    s.phase = "ended";
    s.summary = seasonSummary(s);
  }
  function seasonSummary(s) {
    const t1 = W.table(s, V1);
    const t2 = W.table(s, V2);
    const po = s.fx.find((f) => f.po);
    const poWinner = po.hg > po.ag || (po.pens && po.pens[0] > po.pens[1]) ? po.h : po.a;
    const poLoser = poWinner === po.h ? po.a : po.h;
    const userLeague = s.clubs[s.user].league;
    const pos = W.position(s, s.user);
    const obj = s.clubs[s.user].obj;
    const promoted = [t2[0].id, ...(poWinner === po.a ? [po.a] : [])];
    return {
      season: label(s),
      champions: { [V1]: t1[0].id, [V2]: t2[0].id },
      promoted,
      relegated: [t1[13].id, ...(poLoser === po.h ? [po.h] : [])],
      outOfGame: t2[t2.length - 1].id, // xuống Hạng Nhì
      playoff: { home: po.h, away: po.a, hg: po.hg, ag: po.ag, pens: po.pens || null, winner: poWinner },
      topScorer: { [V1]: W.topScorers(s, V1, 1)[0]?.id || null, [V2]: W.topScorers(s, V2, 1)[0]?.id || null },
      // mục tiêu lên hạng: lên qua play-off cũng tính là đạt
      user: { league: userLeague, pos, obj, achieved: pos <= obj.target || (!!obj.promote && promoted.includes(s.user)), conf: s.clubs[s.user].conf },
      awards: FM.History ? FM.History.awards(s) : null,
    };
  }

  // ---------- Sang mùa mới ----------
  W.newSeason = function (s) {
    const sum = s.summary;
    const rnd = FM.rng(FM.hash(`season-${s.season}-${s.seed}`));
    s.history.push({ ...sum, table: { [V1]: W.table(s, V1).map((r) => r.id), [V2]: W.table(s, V2).map((r) => r.id) } });
    // ban lãnh đạo đánh giá
    const uc = s.clubs[s.user];
    uc.conf = FM.clamp(uc.conf + (sum.user.achieved ? 15 : -20 - (sum.user.pos - sum.user.obj.target) * 3), 0, 100);
    if (sum.outOfGame === s.user || uc.conf < 15) {
      s.phase = "sacked";
      return { sacked: true, reason: sum.outOfGame === s.user ? "CLB xuống Hạng Nhì" : "Không đạt mục tiêu ban lãnh đạo giao" };
    }
    if (FM.Cups) FM.Cups.endOfSeason(s, sum);
    if (FM.AFC) FM.AFC.endOfSeason(s, sum);
    if (FM.History) FM.History.record(s, sum); // ghi sự nghiệp trước khi cầu thủ mượn trở về
    // tiền thưởng theo thứ hạng
    for (const league of [V1, V2])
      W.table(s, league).forEach((r, i) => {
        s.clubs[r.id].bal += (league === V1 ? 5 : 1.5) * Math.max(0.1, 1 - i / 13);
        s.clubs[r.id].gate = 0;
      });
    // cầu thủ cho mượn trở về CLB chủ quản (trước khi có đội bị loại khỏi giải)
    if (FM.Loans) FM.Loans.returnAll(s);
    // lên / xuống hạng
    for (const id of sum.relegated) s.clubs[id].league = V2;
    for (const id of sum.promoted) s.clubs[id].league = V1;
    const out = sum.outOfGame;
    const outName = W.baseClub(s, out).name;
    delete s.clubs[out];
    for (const id of Object.keys(s.p)) if (s.p[id].c === out) delete s.p[id];
    const newId = newLowerClub(s, rnd);
    // hợp đồng hết hạn 30/6: đội máy gia hạn người còn dùng được, còn lại thành cầu thủ tự do
    if (FM.Transfers) FM.Transfers.endOfSeason(s);
    // già đi, phát triển, giải nghệ
    s.season++;
    s.date = `${s.season}-07-01`;
    const retired = [];
    for (const id of Object.keys(s.p)) {
      const d = s.p[id];
      const base = s.extraPlayers[id] || BASE.get(id);
      const age = s.season - base.by;
      const apps = d.st.ap;
      let delta;
      // cầu thủ trẻ phát triển dần trong mùa qua tập luyện (training.js); ở đây chỉ còn biến động nhỏ
      if (FM.Training && age <= 28) delta = age <= 23 ? 0 : rnd.int(-1, 1);
      else if (age <= 23) delta = Math.round(rnd.range(0.3, 1) * Math.min(Math.max(0, base.pa - d.ca), (24 - age) * 1.5 + 2) * (0.5 + 0.5 * Math.min(1, apps / 15)));
      else if (age <= 28) delta = rnd.int(-1, 2);
      else if (age <= 31) delta = rnd.int(-2, 1);
      else if (age <= 33) delta = rnd.int(-4, 0);
      else delta = rnd.int(-6, -1);
      if (age <= 28) delta = Math.min(delta, Math.max(0, base.pa - d.ca));
      if ((age >= 35 && (d.ca < 60 || rnd() < 0.5)) || age >= 38) {
        retired.push(id);
        continue;
      }
      const attrs = [...(d.a || base.a)];
      const w = FM.PROFILE_W[base.pos];
      for (let i = 0; i < attrs.length; i++) {
        if (base.pos !== "GK" && i >= A.reflexes) continue;
        attrs[i] = FM.clamp(Math.round(attrs[i] + delta * 0.21 * (0.5 + 0.5 * w[i]) + rnd.normal(0.4)), 1, 20);
      }
      if (age >= 31) for (const k of ["pace", "agility", "stamina"]) if (rnd() < 0.5) attrs[A[k]] = Math.max(1, attrs[A[k]] - 1);
      d.a = attrs;
      d.ca = FM.clamp(d.ca + delta, 20, 95);
      d.st = blankStats();
      d.cst = null;
      d.ast = null;
      d.ycs = 0;
      d.sus = 0;
      d.fit = 100;
    }
    const userRetired = [];
    for (const id of retired) {
      if (s.p[id].c === s.user) userRetired.push((s.extraPlayers[id] || BASE.get(id)).n);
      delete s.p[id];
    }
    // lứa trẻ: mỗi đội 3 cầu thủ, bổ sung vị trí đang thiếu
    for (const id of Object.keys(s.clubs)) {
      const squad = W.squad(s, id);
      const need = ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LM", "RM", "ST"].sort((a, b) => squad.filter((p) => p.pos === a).length - squad.filter((p) => p.pos === b).length);
      const rep = W.baseClub(s, id).rep;
      // đội hình khoảng 30 người: ít người thì lên nhiều học viên hơn
      const n = FM.clamp(28 - squad.length, 1, 5);
      for (let i = 0; i < n; i++) genPlayer(s, id, rnd, need[i % need.length], 30 + Math.round(rep / 10), 40 + Math.round(rep / 8), rnd.int(17, 19));
      // đội máy quá 30 người thì thanh lý người yếu nhất (trên 23 tuổi)
      if (id !== s.user) {
        const extra = W.squad(s, id)
          .filter((p) => p.age > 23)
          .sort((a, b) => a.ca - b.ca);
        while (W.squad(s, id).length > 30 && extra.length) {
          const p = extra.shift();
          if (FM.Transfers) FM.Transfers.toFree(s, p.id);
          else delete s.p[p.id];
        }
      }
    }
    s.inbox = s.inbox.slice(0, 20);
    if (FM.Scout) FM.Scout.newSeason(s);
    if (FM.Training) FM.Training.newSeason(s);
    startSeason(s);
    const uc2 = W.club(s, s.user);
    mail(
      s,
      "league",
      `Mùa giải ${label(s)} bắt đầu`,
      `${W.baseClub(s, newId).name} lên chơi ở V.League 2 thay ${outName} (xuống Hạng Nhì).\nLên hạng V.League 1: ${sum.promoted.map((id) => W.baseClub(s, id).name).join(", ")}.\nXuống V.League 2: ${sum.relegated.map((id) => W.baseClub(s, id).name).join(", ")}.` +
        (userRetired.length ? `\n\nGiải nghệ ở ${uc2.name}: ${userRetired.join(", ")}.` : "") +
        `\nCác học viên mới đã được đôn lên đội một.`,
    );
    return { sacked: false };
  };
  function newLowerClub(s, rnd) {
    const used = new Set(Object.keys(s.clubs).map((id) => W.baseClub(s, id).name));
    const name = LOWER_CLUBS.find((n) => !used.has(n)) || `CLB Hạng Nhì ${s.season}`;
    const id = "gen-club-" + FM.hash(name + s.season).toString(36);
    const code = name.split(/\s+/).map((w) => w[0]).join("").toUpperCase() + "FC";
    s.extraClubs[id] = { id, name, code, league: V2, coach: "—", venue: `SVĐ ${name}`, capacity: 8000, rep: 38, strength: 45, budget: 1.5, wageBudget: 300, colors: [`hsl(${FM.hash(name) % 360},55%,40%)`, "#fff"], gen: true };
    s.clubs[id] = { league: V2, bal: 3, conf: 60, form: [], formation: null, tactics: { ...FM.DEFAULT_TACTICS }, lineup: null, bench: null, gate: 0 };
    const positions = ["GK", "GK", "CB", "CB", "CB", "CB", "LB", "RB", "LB", "RB", "DM", "DM", "CM", "CM", "CM", "AM", "LM", "RM", "LW", "RW", "ST", "ST", "ST"];
    for (const pos of positions) genPlayer(s, id, rnd, pos, 32, 50, rnd.int(18, 31));
    return id;
  }
})();
