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
    if (FM.AFC && typeof id === "string" && (id.startsWith("afc-") || id.startsWith("ucl-"))) return FM.AFC.player(s, id); // cầu thủ CLB nước ngoài (sinh ra)
    const base = s.extraPlayers[id] || BASE.get(id);
    const dyn = s.p[id];
    if (!base || !dyn) return null;
    const p = { ...base, ...dyn, a: dyn.a || base.a };
    p.age = FM.ageOn(p, s.date);
    p.available = !dyn.inj && !dyn.sus;
    p.free = dyn.c === "free"; // cầu thủ tự do
    p.fs = !!p.fs && W.countryOfClub(s, dyn.c) === "vn"; // luật ngoại binh chỉ có ở V.League
    if (FM.Transfers) p.val = FM.Transfers.value(s, p);
    return p;
  };
  W.squad = (s, clubId) => (FM.AFC && FM.AFC.isForeign(clubId) ? FM.AFC.squad(s, clubId) : null) || Object.keys(s.p).filter((id) => s.p[id].c === clubId).map((id) => W.player(s, id));

  // ---------- Tên người Việt cho cầu thủ trẻ / đội mới ----------
  const HO = ["Nguyễn", "Nguyễn", "Nguyễn", "Trần", "Trần", "Lê", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Đinh", "Trịnh", "Mai", "Cao"];
  const DEM = ["Văn", "Văn", "Văn", "Đức", "Minh", "Quang", "Thành", "Hữu", "Công", "Xuân", "Ngọc", "Tuấn", "Đình", "Hoàng", "Trọng", "Anh", "Thanh", "Gia", "Bá", "Hải"];
  const TEN = ["Hải", "Hùng", "Dũng", "Long", "Nam", "Phúc", "Tài", "Khoa", "Huy", "Đạt", "Thắng", "Lâm", "Sơn", "Tùng", "Vinh", "Kiên", "Toàn", "Hậu", "Mạnh", "Hiếu", "Trung", "Tâm", "Khang", "Bảo", "Lộc", "Quân", "Thịnh", "Tú", "Việt", "Cường", "Phong", "An", "Hoà", "Nghĩa", "Đông", "Tiến", "Bình", "Duy", "Khánh", "Thái"];
  // Anh: tên cầu thủ trẻ, CLB National League thay đội rớt khỏi League Two
  const EN_FIRST = ["Jack", "Harry", "Charlie", "George", "Oliver", "Alfie", "Freddie", "Archie", "Leo", "Oscar", "Jacob", "Thomas", "James", "Joshua", "Noah", "Reggie", "Tyler", "Callum", "Kai", "Ethan", "Mason", "Rhys", "Kian", "Liam", "Max", "Ben", "Sam", "Ryan", "Kieran", "Jamal"];
  const EN_LAST = ["Smith", "Jones", "Taylor", "Brown", "Williams", "Wilson", "Johnson", "Davies", "Robinson", "Wright", "Thompson", "Evans", "Walker", "White", "Roberts", "Green", "Hall", "Wood", "Jackson", "Clarke", "Hughes", "Edwards", "Turner", "Hill", "Cooper", "Ward", "Morris", "Mensah", "Okafor", "Campbell", "Murphy", "Kelly"];
  const EN_LOWER_CLUBS = ["Forest Green Rovers", "Southend United", "Hartlepool United", "Altrincham", "Boston United", "Aldershot Town", "Solihull Moors", "Eastleigh", "Woking", "FC Halifax Town", "Gateshead", "Yeovil Town", "Sutton United", "Dagenham & Redbridge", "Ebbsfleet United", "Wealdstone", "Braintree Town", "Morecambe", "Scunthorpe United", "Carlisle United", "Tamworth", "Hereford", "Maidenhead United", "Torquay United"];
  // Tây Ban Nha: tên cầu thủ trẻ, CLB Primera Federación thay đội rớt khỏi LaLiga 2
  const ES_FIRST = ["Pablo", "Álvaro", "Hugo", "Mario", "Javier", "Sergio", "Adrián", "Diego", "Iker", "Marcos", "Raúl", "Rubén", "Daniel", "Carlos", "Alejandro", "Unai", "Aitor", "Jon", "Pol", "Marc", "Gonzalo", "Iván", "Víctor", "Nico", "Óscar", "Manu", "Dani", "Juanjo", "Borja", "Asier"];
  const ES_LAST = ["García", "Fernández", "González", "Rodríguez", "López", "Martínez", "Sánchez", "Pérez", "Gómez", "Martín", "Jiménez", "Ruiz", "Hernández", "Díaz", "Moreno", "Álvarez", "Muñoz", "Romero", "Navarro", "Torres", "Domínguez", "Gil", "Vázquez", "Serrano", "Ramos", "Blanco", "Molina", "Castro", "Ortega", "Rubio", "Iglesias", "Etxeberria"];
  const ES_LOWER_CLUBS = ["Real Murcia", "Hércules", "Racing de Ferrol", "Tenerife", "UD Ibiza", "Alcorcón", "Gimnàstic de Tarragona", "Ponferradina", "FC Cartagena", "Real Unión", "CD Lugo", "Algeciras", "Antequera", "Mérida", "Unionistas de Salamanca", "Arenteiro", "Teruel", "Sabadell", "Zamora", "Ourense CF", "Guadalajara", "Alcoyano", "Talavera", "Pontevedra", "Barakaldo", "SD Logroñés", "Atlético Baleares"];
  // tên sinh ra theo quốc gia: [tên đầy đủ, tên ngắn]
  function genName(rnd, country) {
    if (country === "en") {
      const n = `${rnd.pick(EN_FIRST)} ${rnd.pick(EN_LAST)}`;
      return [n, n.split(" ").slice(-1)[0]];
    }
    if (country === "es") {
      const last = rnd.pick(ES_LAST);
      return [`${rnd.pick(ES_FIRST)} ${last}`, last];
    }
    const n = `${rnd.pick(HO)} ${rnd.pick(DEM)} ${rnd.pick(TEN)}`;
    return [n, n.split(" ").slice(-2).join(" ")];
  }
  const LOWER_CLUBS = ["Đắk Lắk", "Quảng Ngãi", "Tây Ninh", "Vĩnh Long", "Hà Tĩnh", "Phù Đổng", "Gia Định", "Kon Tum", "Bình Thuận", "Mekong Cần Thơ", "Đồng Tháp", "Bà Rịa", "Gia Lai", "Quảng Trị", "Nam Định B", "Hà Nội B"];

  // sinh một cầu thủ mới (lứa trẻ / đội mới lên hạng)
  function genPlayer(s, clubId, rnd, pos, caLo, caHi, age) {
    const id = `gen-${s.season}-${clubId}-${s.genCounter++}`;
    const country = W.countryOfClub(s, clubId);
    const econ = FM.econOf(country);
    const tier = FM.LEAGUE[s.clubs[clubId]?.league]?.tier || 2;
    const ca = rnd.int(caLo, caHi);
    const pa = Math.min(85, ca + rnd.int(age <= 19 ? 12 : 2, age <= 19 ? 34 : 10));
    const w = FM.PROFILE_W[pos];
    const a = w.map((wi, i) => {
      if (pos !== "GK" && i >= A.reflexes) return rnd.int(1, 4);
      return FM.clamp(Math.round(ca * 0.21 * (0.5 + 0.5 * wi) + rnd.normal(1.2)), 1, 20);
    });
    const eu = country !== "vn"; // cầu thủ châu Âu cao hơn, là ngoại binh nếu sang V.League
    const [name, short] = genName(rnd, country);
    const alt = { [pos]: 20 };
    const by = s.season - age;
    s.extraPlayers[id] = {
      id,
      n: name,
      sn: short,
      c: clubId,
      no: null,
      pos,
      alt,
      by,
      bd: null,
      nat: FM.natOf(country) || "Việt Nam",
      h: pos === "GK" || pos === "CB" ? rnd.int(178, 188) + (eu ? 4 : 0) : rnd.int(166, 180) + (eu ? 4 : 0),
      w: rnd.int(60, 76),
      ca,
      pa,
      ft: rnd() < 0.75 ? "right" : "left",
      a,
      hid: [rnd.int(6, 16), rnd.int(3, 14), rnd.int(6, 16)],
      fs: eu ? 1 : 0,
      vk: 0,
      nt: null,
      wage: Math.max(5, Math.round(econ.wage(ca, tier) * 0.6)),
      val: Math.round(Math.max(0.1, econ.value(ca) * (1 + (pa - ca) / 40)) * 10) / 10,
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
  // Giải châu Âu: mỗi vòng một ngày cuối tuần (Anh: thứ Bảy 8/8 → 9/5; Tây Ban Nha: LaLiga Chủ nhật,
  // LaLiga 2 thứ Bảy, 15/8 → 30/5); hạng cao nhất nghỉ các đợt FIFA (tháng 9, 10, 11, 3).
  // Thiếu ngày thì thêm vòng giữa tuần (thứ Ba) rải đều; thừa thì bỏ bớt rải đều.
  // Né các ngày cúp: mỗi module cúp đăng ký W.calendarBlocks (season, league) → { sat: [ngày cuối tuần bỏ], mid: [ngày giữa tuần] }
  W.calendarBlocks = [];
  const CAL = { en: { start: "08-08", end: "05-09", dow: [6, 6, 6, 6] }, es: { start: "08-15", end: "05-30", dow: [0, 6] } };
  function leagueDates(season, rounds, L) {
    const cal = CAL[L.country] || CAL.en;
    const dow = cal.dow[L.tier - 1] ?? 6;
    const block = { sat: [], mid: [] };
    for (const fn of W.calendarBlocks) {
      const b = fn(season, L) || {};
      block.sat.push(...(b.sat || []));
      block.mid.push(...(b.mid || []));
    }
    let d = `${season}-${cal.start}`;
    while (FM.weekday(d) !== dow) d = FM.addDays(d, 1);
    const end = `${season + 1}-${cal.end}`;
    const breaks = new Set();
    if (L.tier === 1)
      for (const [m, nth] of [["09", 2], ["10", 2], ["11", 2], ["03", 4]]) {
        const y = m === "03" ? season + 1 : season;
        let x = `${y}-${m}-01`;
        while (FM.weekday(x) !== 6) x = FM.addDays(x, 1);
        x = FM.addDays(x, (nth - 1) * 7);
        breaks.add(FM.addDays(x, (dow - 6 + 7) % 7)); // cuối tuần của đợt FIFA (thứ Bảy hoặc Chủ nhật)
      }
    for (const x of block.sat) breaks.add(FM.weekday(x) === dow ? x : FM.addDays(x, (dow - FM.weekday(x) + 7) % 7));
    const sats = [];
    for (; d <= end; d = FM.addDays(d, 7)) if (!breaks.has(d)) sats.push(d);
    const dates = [...sats];
    if (dates.length > rounds) {
      const drop = dates.length - rounds;
      for (let k = 0; k < drop; k++) dates.splice(Math.floor(((k + 0.5) * dates.length) / (drop + 1)), 1);
    } else {
      const extra = rounds - dates.length;
      // vòng giữa tuần (thứ Ba) không sát ngày League Cup
      const mid = (x) => FM.addDays(x, (2 - FM.weekday(x) + 7) % 7); // thứ Ba sau ngày x
      const pool = sats.filter((x) => !block.mid.some((m) => Math.abs(FM.daysBetween(mid(x), m)) <= 1));
      const from = pool.length >= extra ? pool : sats;
      for (let k = 0; k < extra; k++) dates.push(mid(from[Math.floor(((k + 0.5) * from.length) / extra)]));
    }
    return dates.sort();
  }
  function makeFixtures(s) {
    const rnd = FM.rng(FM.hash(`fixtures-${s.season}-${s.seed}`));
    const vnDates = roundDates(s.season);
    s.fx = [];
    let first = null;
    for (const L of FM.LEAGUES) {
      const rounds = roundRobin(W.clubsIn(s, L.id), rnd);
      if (!rounds.length) continue;
      // Việt Nam: V.League 1 thứ Bảy, V.League 2 Chủ nhật. Anh: lịch riêng từng giải
      const dates = L.country === "vn" ? vnDates.map((x) => FM.addDays(x, L.tier - 1)) : leagueDates(s.season, rounds.length, L);
      rounds.forEach((pairs, ri) => {
        for (const [h, a] of pairs) s.fx.push({ id: `${s.season}-${L.short}-${ri + 1}-${h}`, lg: L.id, rd: ri + 1, d: dates[ri], h, a, hg: null, ag: null, done: false });
      });
      if (!first || dates[0] < first) first = dates[0];
    }
    s.seasonStart = first;
  }

  // ---------- Phiên bản save ----------
  // 2: thế giới chung Anh + Việt Nam (thang chỉ số mới) · 3: thêm Tây Ban Nha
  W.VERSION = 3;
  // ván cũ (v2) chơi tiếp được: thêm các CLB / cầu thủ mới có trong dữ liệu. Giải mới bắt đầu từ mùa sau
  // (mùa đang đá giữ nguyên lịch); trả về danh sách CLB đã thêm
  W.migrate = function (s) {
    if ((s.v || 1) >= W.VERSION) return [];
    const added = [];
    for (const c of D.clubs) {
      if (s.clubs[c.id]) continue;
      s.clubs[c.id] = { league: c.league, bal: Math.round(c.budget * FM.econOf(c.country).startCash * 10) / 10, conf: 60, form: [], formation: null, tactics: { ...FM.DEFAULT_TACTICS }, lineup: null, bench: null, gate: 0, wageCap: Math.round(c.wageBudget * 1.15) };
      added.push(c.id);
    }
    const addedSet = new Set(added);
    for (const p of D.players) if (!s.p[p.id] && addedSet.has(p.c)) s.p[p.id] = newDyn(p.c, p.ca);
    for (const L of FM.LEAGUES) {
      const ids = W.clubsIn(s, L.id).filter((id) => addedSet.has(id));
      if (!ids.length) continue;
      const ranked = W.clubsIn(s, L.id).sort((a, b) => W.strength(s, b) - W.strength(s, a));
      for (const id of ids) {
        const best = FM.bestFormation(W.squad(s, id));
        Object.assign(s.clubs[id], { formation: best.formation, lineup: best.lineup, bench: best.bench, obj: objective(L.id, ranked.indexOf(id) + 1, ranked.length) });
      }
    }
    if (s.ucl && !s.ucl.local) s.ucl.local = (s.ucl.en || []).filter((id) => s.clubs[id]);
    if (s.windows && !s.windows.es) s.windowsSeason = null; // tính lại kỳ chuyển nhượng
    s.v = W.VERSION;
    if (added.length) {
      const names = [...new Set(added.map((id) => FM.countryOf(s.clubs[id].league)))].map((k) => FM.COUNTRIES[k].name);
      mail(s, "news", `Thế giới mở rộng: ${names.join(", ")}`, `${added.length} CLB mới (${FM.LEAGUES.filter((L) => added.some((id) => s.clubs[id].league === L.id)).map((L) => L.name).join(", ")}) đã có trong thế giới. Cầu thủ của họ mua bán được ngay khi kỳ chuyển nhượng nước đó mở; các giải mới bắt đầu từ mùa sau.`);
    }
    return added;
  };

  // ---------- Ván mới ----------
  W.newGame = function (userClubId, seed = Math.floor(Math.random() * 1e9)) {
    const season = D.meta.season;
    const s = {
      v: W.VERSION,
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
    for (const c of D.clubs) s.clubs[c.id] = { league: c.league, bal: Math.round(c.budget * FM.econOf(c.country).startCash * 10) / 10, conf: 60, form: [], formation: null, tactics: { ...FM.DEFAULT_TACTICS }, lineup: null, bench: null, gate: 0, wageCap: Math.round(c.wageBudget * 1.15) };
    for (const p of D.players) s.p[p.id] = newDyn(p.c, p.ca);
    startSeason(s);
    return s;
  };

  function startSeason(s) {
    makeFixtures(s);
    s.date = FM.addDays(s.seasonStart, -10);
    s.phase = "season";
    s.playoff = null;
    s.enPo = {}; // play-off nước Anh của mùa mới
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
    for (const L of FM.LEAGUES) {
      const ranked = W.clubsIn(s, L.id).sort((a, b) => W.strength(s, b) - W.strength(s, a));
      ranked.forEach((id, i) => (s.clubs[id].obj = objective(L.id, i + 1, ranked.length)));
    }
    if (FM.Training) FM.Training.startSeason(s);
    if (FM.Cups) FM.Cups.start(s);
    if (FM.AFC) FM.AFC.start(s);
    if (FM.EnCups) FM.EnCups.start(s); // sau AFC: đội bán chuyên nghiệp dùng chung kho CLB khách
    if (FM.EsCups) FM.EsCups.start(s);
    if (FM.UCL) FM.UCL.start(s);
    const uc = W.club(s, s.user);
    mail(s, "board", `Chào mừng HLV mới của ${uc.name}`, `Ban lãnh đạo ${uc.name} chào mừng bạn đến với mùa giải ${label(s)} tại ${leagueName(uc.league)}.\n\nMục tiêu của CLB: **${uc.obj.label}** (xếp hạng ${uc.obj.target} trở lên).\nNgân sách hiện có: ${FM.fmtMoney(uc.bal)}.\n\nTrận đầu tiên: ${nextFixtureText(s)}. Chúc may mắn!`);
  }
  // mục tiêu theo thứ hạng sức mạnh đầu mùa (rank) trong giải n đội
  function objective(league, rank, n) {
    const L = FM.LEAGUE[league];
    const R = L.rules;
    const safe = n - (R.down || R.out || 0) - (R.vnPlayoff && L.tier === 1 ? 1 : 0); // hạng thấp nhất còn an toàn
    const half = Math.ceil(n / 2);
    if (L.tier === 1) {
      const top = L.country === "vn" ? 3 : 4; // châu Âu: suất Champions League
      if (rank === 1) return { label: `Vô địch ${L.name}`, target: 1 };
      if (rank <= top) return { label: `Lọt vào top ${top}`, target: top };
      if (rank <= Math.round(n * 0.45)) return { label: "Nửa trên bảng xếp hạng", target: half };
      if (rank <= Math.round(n * 0.72)) return { label: "Trụ hạng an toàn", target: safe - 2 };
      return { label: "Trụ hạng", target: safe };
    }
    const above = FM.leagueAbove(league);
    if (rank <= Math.max(2, R.up || 1)) return { label: `Lên hạng ${above ? above.name : ""}`.trim(), target: R.up || 1, promote: true };
    if (R.po && rank <= R.po[1] + 1) return { label: "Vào nhóm đá play-off", target: R.po[1] };
    if (rank <= Math.round(n * 0.45)) return { label: "Nửa trên bảng xếp hạng", target: half };
    return { label: "Trụ hạng", target: safe };
  }
  W.strength = (s, clubId) => {
    const top = W.squad(s, clubId).map((p) => p.ca).sort((a, b) => b - a).slice(0, 11);
    return top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
  };
  const label = (s) => `${s.season}/${String((s.season + 1) % 100).padStart(2, "0")}`;
  W.label = label;
  const leagueName = (id) => FM.leagueName(id);
  W.leagueName = leagueName;
  W.countryOfClub = (s, id) => FM.countryOf(s.clubs[id]?.league) || W.baseClub(s, id)?.country || "vn";
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
  W.fxLabel = (s, f) => (FM.AFC && FM.AFC.isAfc(f) ? FM.AFC.label(f) : FM.EnCups && FM.EnCups.isEn(f) ? FM.EnCups.label(f) : FM.EsCups && FM.EsCups.isEs(f) ? FM.EsCups.label(f) : FM.UCL && FM.UCL.isUcl(f) ? FM.UCL.label(f) : f.po ? (f.poLg ? `Play-off ${FM.leagueShort(f.poLg)} · ${f.stage === "f" ? "Chung kết" : "Bán kết"}${f.leg ? ` lượt ${f.leg === 1 ? "đi" : "về"}` : ""}` : "Play-off") : f.lg === "super" ? "Siêu Cúp Quốc gia" : f.lg === "cup" ? `Cúp QG · ${FM.Cups ? FM.Cups.roundName(f.rd) : ""}` : `Vòng ${f.rd}`);
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
    if ((f.ko || (f.po && !f.leg)) && f.hg === f.ag) {
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
      const afcGame = f.lg === "acle" || f.lg === "acl2" || f.lg === "ucl"; // cúp châu lục
      const cupGame = f.lg === "cup" || f.lg === "super" || afcGame || (FM.EnCups && FM.EnCups.isEn(f)) || (FM.EsCups && FM.EsCups.isEs(f));
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
        const econ = FM.econOf(W.countryOfClub(s, side.clubId));
        const ticket = Array.isArray(econ.ticket) ? econ.ticket[FM.LEAGUE[club.league]?.tier || 1] || econ.ticket[1] : econ.ticket;
        const gate = Math.round(base.capacity * fill * ticket) / 1e9;
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
    if (FM.EnCups) FM.EnCups.progress(s);
    if (FM.EsCups) FM.EsCups.progress(s);
    if (FM.UCL) FM.UCL.progress(s);
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
      const sponsor = wages * 0.92 + base.rep * FM.econOf(W.countryOfClub(s, id)).sponsorPerRep; // chủ sở hữu + nhà tài trợ bù phần lớn quỹ lương
      c.bal = Math.round((c.bal + sponsor - wages) * 100) / 100;
      if (id === s.user)
        mail(s, "finance", `Báo cáo tài chính tháng ${+s.date.slice(5, 7) === 1 ? 12 : +s.date.slice(5, 7) - 1}`, `Lương cầu thủ: −${FM.fmtMoney(wages)}\nTài trợ & chủ sở hữu: +${FM.fmtMoney(sponsor)}\nTiền vé (cộng dồn mùa): ${FM.fmtMoney(c.gate)}\nSố dư hiện tại: ${FM.fmtMoney(c.bal)}`);
    }
  }

  // ---------- Cuối mùa ----------
  function checkSeasonEnd(s) {
    if (s.phase !== "season") return;
    euroPlayoffs(s);
    // play-off Việt Nam: đội thứ 13 V.League 1 gặp đội thứ 2 V.League 2, sân trung lập — khi hai giải đã đá xong
    const vnFx = s.fx.filter((f) => f.lg === V1 || f.lg === V2);
    if (!s.playoff && vnFx.length && vnFx.every((f) => f.done) && (!FM.Cups || FM.Cups.finished(s))) {
      const t1 = W.table(s, V1);
      const t2 = W.table(s, V2);
      const last = vnFx.reduce((m, f) => (f.d > m ? f.d : m), s.date);
      const f = { id: `${s.season}-po`, lg: "playoff", po: true, rd: 0, d: FM.addDays(last > s.date ? last : s.date, 6), h: t1[12].id, a: t2[1].id, hg: null, ag: null, done: false };
      s.fx.push(f);
      s.playoff = f.id;
      if (W.countryOfClub(s, s.user) === "vn") mail(s, "league", "Trận play-off lên/xuống hạng", `${W.baseClub(s, f.h).name} (hạng 13 V.League 1) gặp ${W.baseClub(s, f.a).name} (hạng nhì V.League 2) ngày ${FM.fmtDate(f.d)} trên sân trung lập. Đội thắng chơi ở V.League 1 mùa sau.`);
    }
    if (s.fx.some((f) => !f.done)) return;
    if (FM.Cups && !FM.Cups.finished(s)) return;
    if (FM.AFC && !FM.AFC.finished(s)) return;
    if (FM.EnCups && !FM.EnCups.finished(s)) return;
    if (FM.EsCups && !FM.EsCups.finished(s)) return;
    if (FM.UCL && !FM.UCL.finished(s)) return;
    if (vnFx.length && !s.playoff) return;
    s.phase = "ended";
    s.summary = seasonSummary(s);
  }
  // hai lượt: thắng theo tổng tỉ số, hoà thì luân lưu sau lượt về (pens: [chủ nhà lượt về, khách])
  function resolveTie(s, t) {
    if (t.w) return true;
    const fs = t.legs.map((id) => s.fx.find((f) => f.id === id));
    if (fs.some((f) => !f.done)) return false;
    if (fs.length === 1) {
      const f = fs[0];
      t.w = f.hg > f.ag || (f.hg === f.ag && f.pens && f.pens[0] > f.pens[1]) ? f.h : f.a;
      return true;
    }
    let ga = 0;
    let gb = 0;
    for (const f of fs) {
      ga += f.h === t.a ? f.hg : f.ag;
      gb += f.h === t.b ? f.hg : f.ag;
    }
    t.agg = [ga, gb];
    if (ga !== gb) t.w = ga > gb ? t.a : t.b;
    else if (t.seedWins) t.w = t.seedWins;
    else {
      const rnd = FM.rng(W.matchSeed(s, fs[1]) + 13);
      const x = rnd.int(3, 5);
      let y = rnd.int(2, 5);
      if (x === y) y = x - 1;
      t.pens = rnd() < 0.5 ? [x, y] : [y, x];
      t.w = t.pens[0] > t.pens[1] ? fs[1].h : fs[1].a;
    }
    return true;
  }
  W.resolveTie = resolveTie;
  // play-off châu Âu: bán kết hai lượt (hạt giống cao đá lượt về sân nhà). Chung kết: Anh một trận ở
  // Wembley; Tây Ban Nha hai lượt. LaLiga 2: hoà tổng tỉ số thì đội xếp trên đi tiếp (không đá luân lưu)
  const poVenue = (L) => (L.rules.poFinal === "twoLegs" ? "hai lượt" : "một trận ở Wembley");
  function euroPlayoffs(s) {
    s.enPo ||= {};
    for (const L of FM.LEAGUES) {
      const R = L.rules;
      if (!R.po) continue;
      let st = s.enPo[L.id];
      const lgFx = s.fx.filter((f) => f.lg === L.id);
      const user = (ids) => ids.includes(s.user);
      if (!st) {
        if (!lgFx.length || lgFx.some((f) => !f.done)) continue;
        // các suất play-off sau các đội lên thẳng, bỏ qua đội B không được lên hạng
        const seeds = promotable(s, W.table(s, L.id).map((r) => r.id), FM.leagueAbove(L.id)?.id).slice(R.up || 0, (R.up || 0) + R.po[1] - R.po[0] + 1);
        const last = lgFx.reduce((m, f) => (f.d > m ? f.d : m), "");
        st = s.enPo[L.id] = { stage: "sf", ties: [], winner: null, seeds };
        [[seeds[0], seeds[3]], [seeds[1], seeds[2]]].forEach(([hi, lo], k) => {
          const mk = (h, a, leg, days) => {
            const f = { id: `${s.season}-po-${L.short}-sf${k + 1}-${leg}`, lg: "playoff", po: true, poLg: L.id, stage: "sf", leg, rd: 0, d: FM.addDays(last, days), h, a, hg: null, ag: null, done: false };
            s.fx.push(f);
            return f.id;
          };
          st.ties.push({ a: hi, b: lo, legs: [mk(lo, hi, 1, 4), mk(hi, lo, 2, 7)], w: null, seedWins: R.poTie === "seed" ? hi : null });
        });
        if (user(seeds)) mail(s, "league", `Play-off ${L.name}`, `CLB vào nhóm đá play-off thăng hạng ${L.name}. Bán kết hai lượt: ${st.ties.map((t) => `${W.baseClub(s, t.a).name} – ${W.baseClub(s, t.b).name}`).join(", ")}; chung kết ${poVenue(L)}.${R.poTie === "seed" ? " Hoà tổng tỉ số thì đội xếp trên ở vòng đấu thường đi tiếp." : ""}`);
        continue;
      }
      if (st.stage === "sf" && st.ties.every((t) => resolveTie(s, t))) {
        // a: đội xếp trên ở vòng đấu thường
        const [a, b] = st.ties.map((t) => t.w).sort((x, y) => st.seeds.indexOf(x) - st.seeds.indexOf(y));
        const lastLeg = s.fx.find((f) => f.id === st.ties[0].legs[1]).d;
        if (R.poFinal === "twoLegs") {
          const mk = (h, aw, leg, days) => {
            const f = { id: `${s.season}-po-${L.short}-f-${leg}`, lg: "playoff", po: true, poLg: L.id, stage: "f", leg, rd: 0, d: FM.addDays(lastLeg, days), h, a: aw, hg: null, ag: null, done: false };
            s.fx.push(f);
            return f;
          };
          const f1 = mk(b, a, 1, 4);
          const f2 = mk(a, b, 2, 7);
          st.final = { a, b, legs: [f1.id, f2.id], w: null, seedWins: R.poTie === "seed" ? a : null };
          if (user([a, b])) mail(s, "league", `Chung kết play-off ${L.name}`, `${W.baseClub(s, a).name} gặp ${W.baseClub(s, b).name}, hai lượt: lượt đi ${FM.fmtDate(f1.d)} trên sân ${W.baseClub(s, b).name}, lượt về trên sân ${W.baseClub(s, a).name}. Đội thắng lên ${FM.leagueAbove(L.id)?.name}.`);
        } else {
          const f = { id: `${s.season}-po-${L.short}-f`, lg: "playoff", po: true, poLg: L.id, stage: "f", ko: true, neutral: true, rd: 0, d: FM.addDays(lastLeg, 9), h: a, a: b, hg: null, ag: null, done: false };
          s.fx.push(f);
          st.final = { a, b, legs: [f.id], w: null };
          if (user([a, b])) mail(s, "league", `Chung kết play-off ${L.name}`, `${W.baseClub(s, a).name} gặp ${W.baseClub(s, b).name} ở Wembley ngày ${FM.fmtDate(f.d)}. Đội thắng lên ${FM.leagueAbove(L.id)?.name}.`);
        }
        st.stage = "f";
      } else if (st.stage === "f" && resolveTie(s, st.final)) {
        st.winner = st.final.w;
        st.stage = "done";
      }
    }
  }
  // đội được phép lên giải `to` (đội B không lên nếu đội một đang ở giải đó)
  function promotable(s, ids, to) {
    return ids.filter((id) => {
      const par = W.baseClub(s, id).parent;
      return !par || !s.clubs[par] || s.clubs[par].league !== to;
    });
  }
  W.promotable = promotable;
  function seasonSummary(s) {
    const tables = {};
    const champions = {};
    const topScorer = {};
    for (const L of FM.LEAGUES) {
      const t = W.table(s, L.id);
      if (!t.length || !s.fx.some((f) => f.lg === L.id)) continue; // giải mới thêm giữa mùa (ván cũ) chưa đá
      tables[L.id] = t.map((r) => r.id);
      champions[L.id] = t[0].id;
      topScorer[L.id] = W.topScorers(s, L.id, 1)[0]?.id || null;
    }
    const moves = [];
    const out = [];
    // Việt Nam: vô địch V.League 2 lên hạng, đội cuối V.League 1 xuống, play-off 13 V1 – 2 V2, đội cuối V.League 2 xuống Hạng Nhì
    let playoff = null;
    const po = s.fx.find((f) => f.po && !f.poLg);
    if (po && tables[V1] && tables[V2]) {
      const t1 = tables[V1];
      const t2 = tables[V2];
      const winner = po.hg > po.ag || (po.pens && po.pens[0] > po.pens[1]) ? po.h : po.a;
      moves.push({ id: t2[0], to: V1 }, { id: t1[t1.length - 1], to: V2 });
      if (winner === po.a) moves.push({ id: po.a, to: V1 }, { id: po.h, to: V2 });
      out.push(t2[t2.length - 1]);
      playoff = { home: po.h, away: po.a, hg: po.hg, ag: po.ag, pens: po.pens || null, winner };
    }
    // châu Âu: lên thẳng + thắng play-off, xuống hạng, các đội cuối hạng thấp nhất rời hệ thống giải.
    // Đội B không lên hạng nếu đội một đang ở hạng trên → suất chuyển cho đội kế tiếp
    const playoffs = [];
    for (const L of FM.LEAGUES.filter((x) => x.country !== "vn")) {
      const t = tables[L.id];
      if (!t) continue;
      const R = L.rules;
      const above = FM.leagueAbove(L.id);
      const below = FM.leagueBelow(L.id);
      if (R.up && above) {
        promotable(s, t, above.id).slice(0, R.up).forEach((id) => moves.push({ id, to: above.id }));
        const st = s.enPo && s.enPo[L.id];
        if (st && st.winner) {
          moves.push({ id: st.winner, to: above.id });
          const f = s.fx.find((x) => x.id === st.final.legs[0]);
          if (st.final.legs.length > 1) playoffs.push({ league: L.id, home: st.final.a, away: st.final.b, hg: st.final.agg[0], ag: st.final.agg[1], pens: st.final.pens || null, winner: st.winner, twoLegs: true });
          else playoffs.push({ league: L.id, home: f.h, away: f.a, hg: f.hg, ag: f.ag, pens: f.pens || null, winner: st.winner });
        }
      }
      if (R.down && below) t.slice(-R.down).forEach((id) => moves.push({ id, to: below.id }));
      if (R.out) t.slice(-R.out).forEach((id) => out.push(id));
    }
    const tierOf = (lg) => FM.LEAGUE[lg].tier;
    const promoted = moves.filter((m) => tierOf(m.to) < tierOf(s.clubs[m.id].league)).map((m) => m.id);
    const relegated = moves.filter((m) => tierOf(m.to) > tierOf(s.clubs[m.id].league)).map((m) => m.id);
    const userLeague = s.clubs[s.user].league;
    const pos = W.position(s, s.user);
    const obj = s.clubs[s.user].obj;
    return {
      season: label(s),
      champions,
      topScorer,
      tables,
      moves,
      promoted,
      relegated,
      out,
      outOfGame: out.find((id) => W.countryOfClub(s, id) === "vn") || null,
      playoff,
      playoffs,
      // mục tiêu lên hạng: lên qua play-off cũng tính là đạt
      user: { league: userLeague, pos, obj, achieved: pos <= obj.target || (!!obj.promote && promoted.includes(s.user)), conf: s.clubs[s.user].conf },
      awards: FM.History ? FM.History.awards(s) : null,
    };
  }

  // ---------- Sang mùa mới ----------
  W.newSeason = function (s) {
    const sum = s.summary;
    const rnd = FM.rng(FM.hash(`season-${s.season}-${s.seed}`));
    s.history.push({ ...sum, table: sum.tables });
    // ban lãnh đạo đánh giá
    const uc = s.clubs[s.user];
    uc.conf = FM.clamp(uc.conf + (sum.user.achieved ? 15 : -20 - (sum.user.pos - sum.user.obj.target) * 3), 0, 100);
    if (sum.out.includes(s.user) || uc.conf < 15) {
      s.phase = "sacked";
      return { sacked: true, reason: sum.out.includes(s.user) ? `CLB rớt xuống ${FM.lowerName(W.countryOfClub(s, s.user))}` : "Không đạt mục tiêu ban lãnh đạo giao" };
    }
    if (FM.Cups) FM.Cups.endOfSeason(s, sum);
    if (FM.AFC) FM.AFC.endOfSeason(s, sum);
    if (FM.EnCups) FM.EnCups.endOfSeason(s, sum);
    if (FM.EsCups) FM.EsCups.endOfSeason(s, sum);
    if (FM.UCL) FM.UCL.endOfSeason(s, sum);
    if (FM.History) FM.History.record(s, sum); // ghi sự nghiệp trước khi cầu thủ mượn trở về
    // tiền thưởng theo thứ hạng
    for (const [league, ids] of Object.entries(sum.tables)) {
      const L = FM.LEAGUE[league];
      const econ = FM.econOf(L.country);
      ids.forEach((id, i) => {
        s.clubs[id].bal += econ.prize(L.tier, i, ids.length);
        s.clubs[id].gate = 0;
      });
    }
    // cầu thủ cho mượn trở về CLB chủ quản (trước khi có đội bị loại khỏi giải)
    if (FM.Loans) FM.Loans.returnAll(s);
    // lên / xuống hạng
    for (const m of sum.moves) s.clubs[m.id].league = m.to;
    // đội rời hệ thống giải → thay bằng đội mới (Việt Nam: lên từ Hạng Nhì; Anh: từ National League)
    const replaced = [];
    for (const id of sum.out) {
      const country = W.countryOfClub(s, id);
      const league = s.clubs[id].league;
      const outName = W.baseClub(s, id).name;
      delete s.clubs[id];
      for (const pid of Object.keys(s.p)) if (s.p[pid].c === id) delete s.p[pid];
      replaced.push({ out: outName, in: newLowerClub(s, rnd, country, league), country });
    }
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
      for (let i = 0; i < n; i++) genPlayer(s, id, rnd, need[i % need.length], Math.round(22 + rep * 0.3), Math.round(32 + rep * 0.33), rnd.int(17, 19));
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
      seasonNews(s, sum, replaced) +
        (userRetired.length ? `\n\nGiải nghệ ở ${uc2.name}: ${userRetired.join(", ")}.` : "") +
        `\nCác học viên mới đã được đôn lên đội một.`,
    );
    return { sacked: false };
  };
  // tin đầu mùa: lên / xuống hạng ở quốc gia của người chơi
  function seasonNews(s, sum, replaced) {
    const country = W.countryOfClub(s, s.user);
    const name = (id) => W.baseClub(s, id).name;
    const lines = [];
    for (const L of FM.leaguesOf(country)) {
      const up = sum.moves.filter((m) => m.to === L.id && FM.LEAGUE[m.to].tier < FM.LEAGUE[s.clubs[m.id].league]?.tier);
      const ins = sum.moves.filter((m) => m.to === L.id).map((m) => m.id);
      if (ins.length) lines.push(`${L.name} mùa này có thêm: ${ins.map(name).join(", ")}.`);
      void up;
    }
    for (const r of replaced.filter((x) => x.country === country)) lines.push(`${name(r.in)} vào ${FM.leagueName(s.clubs[r.in].league)} thay ${r.out} (rớt xuống ${FM.lowerName(country)}).`);
    return lines.join("\n");
  }
  // CLB mới vào giải thấp nhất: Việt Nam từ Hạng Nhì, Anh từ National League
  function newLowerClub(s, rnd, country = "vn", league = V2) {
    const used = new Set(Object.keys(s.clubs).map((id) => W.baseClub(s, id).name));
    const en = country !== "vn"; // châu Âu
    const name = ({ en: EN_LOWER_CLUBS, es: ES_LOWER_CLUBS }[country] || LOWER_CLUBS).find((n) => !used.has(n)) || `${FM.lowerName(country)} ${s.season}`;
    const id = "gen-club-" + FM.hash(name + s.season).toString(36);
    const code = en ? name.replace(/[^A-Za-z ]/g, "").split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 3) : name.split(/\s+/).map((w) => w[0]).join("").toUpperCase() + "FC";
    const capacity = en ? 6000 : 8000;
    s.extraClubs[id] = { id, name, code, league, country, coach: "—", venue: en ? `${name} Stadium` : `SVĐ ${name}`, capacity, rep: 30, strength: en ? 50 : 41, budget: en ? 40 : 1.5, wageBudget: 0, colors: [`hsl(${FM.hash(name) % 360},55%,40%)`, "#fff"], gen: true };
    s.clubs[id] = { league, bal: en ? 40 : 3, conf: 60, form: [], formation: null, tactics: { ...FM.DEFAULT_TACTICS }, lineup: null, bench: null, gate: 0 };
    const positions = ["GK", "GK", "CB", "CB", "CB", "CB", "LB", "RB", "LB", "RB", "DM", "DM", "CM", "CM", "CM", "AM", "LM", "RM", "LW", "RW", "ST", "ST", "ST"];
    for (const pos of positions) genPlayer(s, id, rnd, pos, en ? 42 : 33, en ? 56 : 46, rnd.int(18, 31));
    const bill = W.squad(s, id).reduce((a, p) => a + p.wage, 0);
    s.extraClubs[id].wageBudget = Math.round(bill * 1.1);
    s.clubs[id].wageCap = Math.round(bill * 1.25);
    return id;
  }
})();
