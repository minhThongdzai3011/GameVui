// Cúp châu Á: AFC Champions League Elite (C1) và AFC Champions League Two (C2), thể thức 2026/27.
// - CLB nước ngoài: tên, quốc gia, sân, màu áo, lịch bốc thăm thật (data/afc.json, scripts/afc-source.mjs);
//   cầu thủ được sinh ra theo quốc tịch và trình độ CLB (không lưu vào save — sinh lại y hệt khi cần).
// - C1: vòng phân hạng theo khu vực (Đông / Tây, mỗi khu 16 đội, mỗi đội 8 trận gặp 8 đối thủ khác
//   nhau), 8 đội đầu mỗi khu vào vòng 1/8 (hai lượt, trong khu vực); tứ kết – bán kết – chung kết đá
//   tập trung một trận (Đông gặp Tây từ tứ kết).
// - C2: 8 bảng 4 đội (A–D Tây, E–H Đông) vòng tròn hai lượt, nhất nhì bảng vào vòng 1/8; vòng 1/8,
//   tứ kết, bán kết hai lượt trong khu vực; chung kết Đông – Tây một trận trên sân một đội.
// - Việt Nam: vô địch V.League 1 đá play-off C1 (thua thì xuống bảng C2), á quân vào thẳng bảng C2.
//   Mùa đầu đúng như thật: CAHN ở C1 (đã thắng play-off), Thể Công – Viettel ở bảng E C2.
// - Trận có đội Việt Nam: mô phỏng đầy đủ bằng engine. Trận giữa hai đội nước ngoài: tính nhanh
//   theo sức mạnh (Poisson).
(function () {
  "use strict";
  const FM = window.FM;
  const W = FM.World;
  const D = window.FM_DATA;
  const A = (FM.AFC = {});
  const DATA = D.afc || null;
  const CLUB = new Map((DATA ? DATA.clubs : []).map((c) => [c.id, c]));
  const V1 = FM.V1;
  A.enabled = !!DATA;
  A.isForeign = (id) => CLUB.has(id);
  A.club = (id) => CLUB.get(id);
  A.COMPS = { acle: { name: "AFC Champions League Elite", short: "C1" }, acl2: { name: "AFC Champions League Two", short: "C2" } };
  // tiền thưởng (tỷ VND)
  const PRIZE = {
    acle: { join: 8, win: 1, draw: 0.3, r16: 3, qf: 5, sf: 8, f: 12, champ: 30 },
    acl2: { join: 2, win: 0.5, draw: 0.2, r16: 1, qf: 1.5, sf: 2.5, f: 4, champ: 10 },
  };
  const STAGE_NAME = { po: "Play-off", ls: "Vòng phân hạng", grp: "Vòng bảng", r16: "Vòng 1/8", qf: "Tứ kết", sf: "Bán kết", f: "Chung kết" };
  A.STAGE_NAME = STAGE_NAME;

  const shuffle = (rnd, arr) => arr.map((x) => [rnd(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);

  // ---------- Sức mạnh & đội hình sinh ra ----------
  // sức mạnh (thang năng lực 1–100 như cầu thủ V.League): CAHN ≈ 77, Viettel ≈ 72
  const TIER_STR = [0, 56, 64, 72, 78, 83];
  A.strengthOf = (id) => TIER_STR[CLUB.get(id).tier] + ((FM.hash(id) % 5) - 2);
  const POOLS = {
    jp: { nat: "Nhật Bản", f: ["Haruto", "Yuto", "Sota", "Ren", "Kaito", "Daiki", "Takumi", "Ryo", "Kenta", "Shota", "Yuki", "Kazuki", "Hiroki", "Tomoya", "Keisuke", "Ryota", "Shun", "Koki"], l: ["Sato", "Suzuki", "Takahashi", "Tanaka", "Watanabe", "Ito", "Yamamoto", "Nakamura", "Kobayashi", "Kato", "Yoshida", "Yamada", "Sasaki", "Matsumoto", "Inoue", "Kimura", "Hayashi", "Shimizu", "Mori", "Ikeda"] },
    kr: { nat: "Hàn Quốc", f: ["Min-jae", "Seung-ho", "Ji-sung", "Hyun-woo", "Jun-ho", "Dong-hyun", "Sang-min", "Tae-hwan", "Woo-young", "Jae-sung", "Young-gwon", "Kyung-won", "Sung-yong", "Hee-chan", "Jin-su", "Chang-hoon"], l: ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon", "Jang", "Lim", "Han", "Oh", "Seo", "Shin", "Kwon", "Hwang"], surFirst: true },
    cn: { nat: "Trung Quốc", f: ["Wei", "Lei", "Hao", "Jun", "Peng", "Tao", "Yu", "Bin", "Xin", "Long", "Chao", "Fei", "Kai", "Ming", "Yang", "Jian"], l: ["Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Zhao", "Huang", "Zhou", "Wu", "Xu", "Sun", "Hu", "Zhu", "Gao", "Lin"], surFirst: true },
    ar: { nat: null, f: ["Mohammed", "Abdullah", "Salem", "Fahad", "Saud", "Ali", "Hassan", "Khalid", "Faisal", "Nasser", "Saleh", "Hamad", "Yasser", "Omar", "Majed", "Sultan", "Ahmed", "Yousef"], l: ["Al-Dawsari", "Al-Shahrani", "Al-Faraj", "Al-Malki", "Al-Owais", "Al-Buraikan", "Al-Ghannam", "Al-Hamdan", "Al-Hassan", "Al-Ali", "Al-Mansoori", "Al-Khaldi", "Al-Rawi", "Al-Amri", "Al-Harbi", "Al-Shammari", "Al-Saadi", "Al-Kaabi"] },
    ir: { nat: "Iran", f: ["Ali", "Mehdi", "Reza", "Saeed", "Milad", "Ehsan", "Morteza", "Hossein", "Amir", "Sardar", "Omid", "Vahid"], l: ["Rezaei", "Mohammadi", "Hosseini", "Karimi", "Ahmadi", "Jafari", "Rahimi", "Nourollahi", "Hajsafi", "Kanaani", "Ghasemi", "Sadeghi"] },
    th: { nat: "Thái Lan", f: ["Chanathip", "Theerathon", "Supachok", "Ekanit", "Sarach", "Kritsada", "Pansa", "Weerathep", "Suphanat", "Bordin", "Patiwat", "Jakkaphan", "Peeradon", "Thitipan"], l: ["Songkrasin", "Bunmathan", "Sarachat", "Panya", "Yooyen", "Kaman", "Hemviboon", "Pomphan", "Mueanta", "Phala", "Khamyok", "Chamratsamee", "Puangchan", "Kraisorn"] },
    ma: { nat: null, f: ["Muhammad", "Ahmad", "Rizky", "Arif", "Safawi", "Faisal", "Hafiz", "Irfan", "Syahmi", "Egy", "Pratama", "Akmal", "Azri", "Dimas"], l: ["Rasid", "Ridwan", "Hakim", "Saputra", "Rahman", "Ismail", "Hasan", "Maulana", "Aziz", "Firdaus", "Nugroho", "Halim", "Yusof", "Hidayat"] },
    en: { nat: null, f: ["Jack", "Lachlan", "Mitchell", "Riley", "Connor", "Jordan", "Nathan", "Thomas", "Ryan", "Josh", "Kyle", "Liam", "Callum", "Daniel"], l: ["Smith", "Brown", "Wilson", "Taylor", "Anderson", "Martin", "Thompson", "White", "Harris", "Clarke", "Walker", "King", "Wright", "Hughes"] },
    uz: { nat: null, f: ["Eldor", "Jaloliddin", "Otabek", "Abbosbek", "Oston", "Khojimat", "Dostonbek", "Azizbek", "Sherzod", "Ruslan", "Timur", "Bobur"], l: ["Shomurodov", "Masharipov", "Shukurov", "Fayzullaev", "Urunov", "Erkinov", "Khamdamov", "Turgunboev", "Sayfiev", "Alikulov", "Nasriddinov", "Tursunov"] },
    in: { nat: "Ấn Độ", f: ["Sunil", "Sandesh", "Anirudh", "Lallianzuala", "Manvir", "Sahal", "Gurpreet", "Rahul", "Akash", "Liston", "Brandon", "Naorem"], l: ["Chhetri", "Jhingan", "Thapa", "Chhangte", "Singh", "Samad", "Bheke", "Colaco", "Mishra", "Bose", "Fernandes", "Kumar"] },
    sea: { nat: null, f: ["Sieng", "Keo", "Prak", "Aung", "Kyaw", "Htet", "Zaw", "Javier", "Patrick", "Kevin", "Soukaphone", "Bounphachan"], l: ["Chanthea", "Sokpheng", "Vathanaka", "Naing", "Win", "Lwin", "Reyes", "Santos", "Ramirez", "Vongchiengkham", "Phommapanya", "Oo"] },
  };
  // ngoại binh: tên đi theo quốc tịch
  const IMPORTS = [
    { nat: "Brazil", w: 4, f: ["Bruno", "Lucas", "Matheus", "Rafael", "Gabriel", "Thiago", "Leandro", "Wellington", "Everton", "Renato", "Marcos", "Vinícius"], l: ["Silva", "Santos", "Oliveira", "Souza", "Pereira", "Costa", "Almeida", "Ferreira", "Rocha", "Lima", "Barbosa", "Carvalho"] },
    { nat: "Argentina", w: 1, f: ["Federico", "Gonzalo", "Matías", "Nicolás", "Franco", "Lautaro"], l: ["Martínez", "González", "Fernández", "López", "Romero", "Díaz"] },
    { nat: "Colombia", w: 1, f: ["Juan", "Andrés", "Carlos", "Jhon", "Luis", "Jorge"], l: ["Rodríguez", "Muñoz", "Ramírez", "Valencia", "Cuesta", "Mosquera"] },
    { nat: "Tây Ban Nha", w: 1, f: ["Sergio", "Pablo", "Javier", "Álvaro", "Iker", "Raúl"], l: ["García", "Navarro", "Torres", "Ruiz", "Moreno", "Serrano"] },
    { nat: "Serbia", w: 1, f: ["Marko", "Aleksandar", "Nikola", "Stefan", "Luka", "Dušan"], l: ["Petrović", "Jovanović", "Nikolić", "Marković", "Krstić", "Ilić"] },
    { nat: "Croatia", w: 1, f: ["Ivan", "Mario", "Josip", "Ante", "Domagoj", "Marin"], l: ["Kovačević", "Horvat", "Babić", "Jurić", "Perić", "Knežević"] },
    { nat: "Senegal", w: 1, f: ["Moussa", "Cheikh", "Mamadou", "Ibrahima", "Pape", "Abdou"], l: ["Diallo", "Ndiaye", "Mendy", "Sarr", "Diop", "Faye"] },
    { nat: "Mali", w: 1, f: ["Moussa", "Adama", "Amadou", "Yves", "Souleymane", "Hamari"], l: ["Traoré", "Koné", "Coulibaly", "Keita", "Diarra", "Doumbia"] },
    { nat: "Nigeria", w: 1, f: ["Joel", "Samuel", "Victor", "Emmanuel", "Ahmed", "Chidera"], l: ["Okafor", "Musa", "Eze", "Onyeka", "Adeyemi", "Nwankwo"] },
    { nat: "Bờ Biển Ngà", w: 1, f: ["Yannick", "Serge", "Jean", "Wilfried", "Franck", "Max"], l: ["Kouassi", "Gbamin", "Boli", "Konan", "Yao", "Kessié"] },
  ];
  const POOL_OF = {
    "Nhật Bản": "jp", "Hàn Quốc": "kr", "Trung Quốc": "cn", "Đài Loan": "cn", "Hồng Kông": "cn", "Ma Cao": "cn", "Mông Cổ": "cn",
    "Iran": "ir", "Thái Lan": "th", "Indonesia": "ma", "Malaysia": "ma", "Singapore": "ma", "Brunei": "ma", "Úc": "en",
    "Uzbekistan": "uz", "Tajikistan": "uz", "Kyrgyzstan": "uz", "Turkmenistan": "uz", "Ấn Độ": "in", "Bangladesh": "in", "Nepal": "in", "Bhutan": "in", "Maldives": "in",
    "Campuchia": "sea", "Myanmar": "sea", "Lào": "sea", "Philippines": "sea", "Đông Timor": "sea",
  };
  const poolFor = (country) => POOLS[POOL_OF[country] || "ar"];
  const TEMPLATE = ["GK", "CB", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST", "GK", "CB", "CB", "LB", "RB", "DM", "CM", "AM", "LM", "RM", "ST", "ST"];
  const cache = new Map();
  A.squad = function (s, clubId) {
    const key = `${clubId}-${s.season}-${s.seed}`;
    if (cache.has(key)) return cache.get(key);
    const c = CLUB.get(clubId);
    const rnd = FM.rng(FM.hash(`afc-${key}`));
    const str = A.strengthOf(clubId);
    const pool = poolFor(c.country);
    const imports = c.tier >= 4 && ["Ả Rập Xê Út", "Qatar", "UAE"].includes(c.country) ? 7 : c.tier >= 3 ? 4 : 3;
    // ngoại binh: các vị trí đá chính (trừ thủ môn) chọn ngẫu nhiên
    const importSlots = new Set(shuffle(rnd, [...Array(10).keys()].map((i) => i + 1)).slice(0, imports));
    const usedNo = new Set();
    const out = TEMPLATE.map((pos, i) => {
      const starter = i < 11;
      const imp = starter && importSlots.has(i);
      const P = imp ? rnd.weighted(IMPORTS, (x) => x.w) : pool;
      const ca = FM.clamp(Math.round((starter ? str : str - 7) + (imp ? 3 : 0) + rnd.normal(2.5)), 35, 92);
      const age = rnd.int(starter ? 22 : 19, starter ? 32 : 30);
      const w = FM.PROFILE_W[pos];
      const a = w.map((wi, k) => (pos !== "GK" && k >= FM.A.reflexes ? rnd.int(1, 4) : FM.clamp(Math.round(ca * 0.21 * (0.5 + 0.5 * wi) + rnd.normal(1.2)), 1, 20)));
      const fn = rnd.pick(P.f);
      const ln = rnd.pick(P.l);
      const n = P.surFirst ? `${ln} ${fn}` : `${fn} ${ln}`;
      let no = pos === "GK" ? (starter ? 1 : 30) : i + 2;
      while (usedNo.has(no)) no++;
      usedNo.add(no);
      const alt = { [pos]: 20 };
      const nat = P.nat || c.country;
      const p = {
        id: `afc-${clubId}-${i}`,
        n,
        sn: P.surFirst ? n : ln,
        c: clubId,
        no,
        pos,
        alt,
        by: s.season - age,
        age,
        nat,
        h: pos === "GK" || pos === "CB" ? rnd.int(182, 193) : rnd.int(168, 186),
        w: rnd.int(64, 84),
        ca,
        pa: Math.min(92, ca + (age <= 23 ? rnd.int(3, 12) : rnd.int(0, 3))),
        ft: rnd() < 0.25 ? "left" : "right",
        a,
        hid: [rnd.int(8, 16), rnd.int(4, 12), rnd.int(8, 16)],
        fs: false,
        foreignClub: true,
        fit: 100,
        mor: 60,
        available: true,
        free: false,
        wage: Math.round(15 * Math.exp((ca - 45) * 0.0858) * 2.5),
        ce: `${s.season + 2}-06-30`,
        st: { ap: 0, g: 0, as: 0, yc: 0, rc: 0, rs: 0, mm: 0, cs: 0 },
      };
      p.val = Math.round(0.4 * Math.exp((ca - 45) * 0.109) * 2 * 10) / 10;
      return p;
    });
    cache.set(key, out);
    return out;
  };
  A.player = function (s, id) {
    const m = /^afc-(.+)-(\d+)$/.exec(id);
    if (!m || !CLUB.has(m[1])) return null;
    return A.squad(s, m[1])[+m[2]] || null;
  };
  A.state = (s, id) => (s.afc && s.afc.clubs[id]) || null;
  // đội nước ngoài ra sân: máy chọn sơ đồ hợp nhất với đội hình sinh ra
  A.side = function (s, clubId) {
    const squad = A.squad(s, clubId);
    const st = (s.afc.clubs[clubId] ||= { form: [] });
    if (!st.formation) st.formation = FM.bestFormation(squad).formation;
    const pick = FM.autoPick(squad, st.formation);
    const c = CLUB.get(clubId);
    return { clubId, name: c.name, code: c.code, formation: st.formation, tactics: { ...FM.DEFAULT_TACTICS }, lineup: pick.lineup, bench: pick.bench, players: Object.fromEntries(squad.map((p) => [p.id, p])), ai: true, fam: 1 };
  };

  // ---------- Lịch ----------
  // ngày tính theo các vòng V.League 1 để không trùng lịch (Cúp Quốc gia đá thứ Tư sau vòng 3, 8,
  // 13, 20, 24): C1 thứ Ba, C2 thứ Tư như thật; giai đoạn cuối sau vòng cuối V.League (tháng 4–5)
  const rdDate = (s, n) => s.fx.find((f) => f.lg === V1 && f.rd === n)?.d;
  const rel = (s, n, days) => FM.addDays(rdDate(s, n), days);
  const tue = (s, n) => rel(s, n, 3);
  const wed = (s, n) => rel(s, n, 4);
  const after = (s, days) => rel(s, 26, days);
  const C1_LS = (s) => [tue(s, 2), tue(s, 6), tue(s, 7), tue(s, 9), tue(s, 10), tue(s, 12), rel(s, 19, -11), rel(s, 19, -4)];
  const C2_GRP = (s) => [wed(s, 2), wed(s, 6), wed(s, 7), wed(s, 9), wed(s, 10), wed(s, 12)];
  function fixture(s, comp, stage, h, a, d, extra = {}) {
    const f = { id: `${s.season}-${comp}-${stage}-${h}-${a}${extra.leg ? `-${extra.leg}` : ""}`, lg: comp, stage, rd: 0, d, h, a, hg: null, ag: null, done: false, ...extra };
    s.fx.push(f);
    return f;
  }
  // vòng phân hạng C1: mỗi đội 8 trận với 8 đối thủ khác nhau (4 sân nhà, 4 sân khách).
  // schedule: lịch bốc thăm thật [[lượt, chủ, khách]]; không có thì lấy 8 vòng đầu của lịch vòng tròn
  function leagueStage(s, teams, schedule) {
    const dates = C1_LS(s);
    if (schedule) {
      for (const [md, h, a] of schedule) fixture(s, "acle", "ls", h, a, dates[md - 1], { md });
      return;
    }
    const n = teams.length;
    const arr = [...teams];
    for (let r = 0; r < 8; r++) {
      for (let i = 0; i < n / 2; i++) {
        let h = arr[i];
        let a = arr[n - 1 - i];
        if ((r + i) % 2) [h, a] = [a, h];
        fixture(s, "acle", "ls", h, a, dates[r], { md: r + 1 });
      }
      arr.splice(1, 0, arr.pop());
    }
  }
  // vòng bảng C2: [t0, t1, t2, t3] — lượt 1: t0–t1, t2–t3; lượt 2: t3–t0, t1–t2; lượt 3: t0–t2, t3–t1; lượt 4–6 đổi sân
  function groupStage(s, groups) {
    const dates = C2_GRP(s);
    for (const [g, [t0, t1, t2, t3]] of Object.entries(groups)) {
      [[[t0, t1], [t2, t3]], [[t3, t0], [t1, t2]], [[t0, t2], [t3, t1]]].forEach((pairs, r) => {
        for (const [h, a] of pairs) {
          fixture(s, "acl2", "grp", h, a, dates[r], { md: r + 1, grp: g });
          fixture(s, "acl2", "grp", a, h, dates[r + 3], { md: r + 4, grp: g });
        }
      });
    }
  }

  // ---------- Bắt đầu mùa ----------
  // Mùa đầu: đúng danh sách & lịch bốc thăm thật 2026/27 (CAHN đã thắng play-off C1 ngày 11/8/2026).
  // Các mùa sau: vô địch V.League 1 đá play-off C1 (một trận, sân khách) với đội giữ suất play-off;
  // thắng thì vào vòng phân hạng, thua xuống vòng bảng C2 (thế chỗ đối thủ). Á quân V.League 1 vào
  // thẳng vòng bảng C2. CLB nước ngoài giữ như mùa thật, đội Việt Nam thay vào đúng chỗ suất Việt Nam.
  A.start = function (s) {
    if (!DATA) return;
    s.afc = { season: s.season, clubs: {}, vn: { acle: [], acl2: [] }, comps: {}, map: {} };
    for (const c of DATA.clubs) s.afc.clubs[c.id] = { form: [] };
    if (s.season === DATA.season) {
      s.afc.vn = { acle: [...DATA.vn.acle], acl2: [...DATA.vn.acl2] };
      s.afc.map = { [DATA.vn.acle[0]]: DATA.vn.acle[0], [DATA.vn.acl2[0]]: DATA.vn.acl2[0] };
      build(s);
      return;
    }
    const inV1 = (id) => id && s.clubs[id] && s.clubs[id].league === V1;
    const champ = inV1(s.prevChamp) ? s.prevChamp : null;
    const second = inV1(s.prevRunnerUp) && s.prevRunnerUp !== champ ? s.prevRunnerUp : null;
    if (second) {
      s.afc.vn.acl2.push(second);
      s.afc.map[DATA.vn.acl2[0]] = second;
    }
    if (!champ) return build(s);
    const opp = DATA.acle.prelimOpp;
    // thật là giữa tháng 8; trong game mùa mới bắt đầu cuối tháng 8 nên đá ngay sau Siêu Cúp
    const d = [rel(s, 1, -25), FM.addDays(s.date, 6)].sort().pop();
    const f = fixture(s, "acle", "po", opp, champ, d, { ko: true });
    s.afc.comps.acle = { stage: "po", ties: [{ stage: "po", a: champ, b: opp, legs: [f.id], w: null }], out: {}, winner: null, runnerUp: null };
    s.afc.vn.acle.push(champ);
    if (champ === s.user) W.mail(s, "afc", "Play-off AFC Champions League Elite", `Là nhà vô địch V.League 1, CLB đá play-off C1 với ${W.baseClub(s, opp).name} ngày ${FM.fmtDate(f.d, false)} (sân khách, một trận, hoà đá luân lưu).\nThắng: vào vòng phân hạng C1. Thua: xuống vòng bảng C2.`);
  };
  // dựng vòng phân hạng C1 + vòng bảng C2. Có play-off: winner chiếm suất C1 của Việt Nam, loser vào
  // chỗ của đối thủ play-off ở bảng C2 (nếu đội Việt Nam thua thì đối thủ lên C1, đổi chỗ cho nhau)
  function build(s, poWinner, poLoser) {
    const vnC1 = DATA.vn.acle[0];
    const vnC2 = DATA.vn.acl2[0];
    const opp = DATA.acle.prelimOpp;
    const c1Team = poWinner || s.afc.vn.acle[0] || null;
    const swapped = poWinner === opp; // đội Việt Nam thua play-off
    const inC1 = (id) => (id === vnC1 ? c1Team : id);
    const inC2 = (id) => (id === vnC2 ? s.afc.map[vnC2] || null : swapped && id === opp ? poLoser : id);
    const east = DATA.acle.east.map(inC1).filter(Boolean);
    const west = [...DATA.acle.west];
    leagueStage(s, east, east.length === 16 ? DATA.acle.eastSchedule.map(([md, h, a]) => [md, inC1(h), inC1(a)]) : null);
    leagueStage(s, west);
    const acle = (s.afc.comps.acle ||= { ties: [], out: {}, winner: null, runnerUp: null });
    Object.assign(acle, { stage: "ls", regions: { East: east, West: west } });
    const groups = {};
    const used = new Set([...east, ...west]);
    for (const [g, teams] of Object.entries(DATA.acl2.groups)) groups[g] = teams.map(inC2).filter((id) => id && !used.has(id));
    // bảng thiếu người (vd. không có á quân đủ điều kiện): lấy CLB nước ngoài cùng khu vực còn trống
    for (const [g, t] of Object.entries(groups)) {
      const region = g >= "E" ? "East" : "West";
      const spare = DATA.clubs.filter((c) => c.region === region && !used.has(c.id) && !Object.values(groups).flat().includes(c.id));
      while (t.length < 4 && spare.length) t.push(spare.shift().id);
    }
    groupStage(s, groups);
    s.afc.comps.acl2 = { stage: "grp", groups, ties: [], out: {}, winner: null, runnerUp: null };
    const name = (id) => W.baseClub(s, id).name;
    for (const comp of ["acle", "acl2"])
      for (const id of s.afc.vn[comp]) {
        if (!s.clubs[id]) continue;
        s.clubs[id].bal += PRIZE[comp].join;
        if (id !== s.user) continue;
        const mine = s.fx.filter((f) => f.lg === comp && f.stage !== "po" && (f.h === id || f.a === id)).sort((a, b) => a.d.localeCompare(b.d));
        const grp = comp === "acl2" ? Object.entries(groups).find(([, t]) => t.includes(id))?.[0] : null;
        W.mail(s, "afc", `Dự ${A.COMPS[comp].name}!`, `CLB góp mặt ở ${A.COMPS[comp].name} (${A.COMPS[comp].short}) mùa này${grp ? `, bảng ${grp} (nhất nhì bảng vào vòng 1/8)` : ", vòng phân hạng khu vực Đông (16 đội, 8 đội đầu vào vòng 1/8)"}. Thưởng tham dự ${FM.fmtMoney(PRIZE[comp].join)}.\n\nCác trận ${comp === "acle" ? "vòng phân hạng" : "vòng bảng"}:\n${mine.map((f) => `• ${FM.fmtDate(f.d, false)}: ${f.h === id ? `tiếp ${name(f.a)}` : `làm khách ${name(f.h)}`}`).join("\n")}`);
      }
  }

  // ---------- Trận giữa hai đội nước ngoài: tính nhanh ----------
  const strength = (s, id) => (CLUB.has(id) ? A.strengthOf(id) : W.strength(s, id));
  function poisson(rnd, lam) {
    let k = 0;
    let p = Math.exp(-lam);
    let sum = p;
    const u = rnd();
    while (u > sum && k < 9) {
      k++;
      p *= lam / k;
      sum += p;
    }
    return k;
  }
  A.quickPlay = function (s, f) {
    if (!(CLUB.has(f.h) && CLUB.has(f.a))) return false;
    const rnd = FM.rng(W.matchSeed(s, f));
    const d = strength(s, f.h) - strength(s, f.a);
    const home = f.neutral ? 1 : 1.12;
    f.hg = poisson(rnd, 1.3 * Math.exp(d * 0.045) * home);
    f.ag = poisson(rnd, 1.3 * Math.exp(-d * 0.045) / home);
    if (f.ko && f.hg === f.ag) f.pens = penalties(rnd);
    f.done = true;
    return true;
  };
  function penalties(rnd) {
    const a = rnd.int(3, 5);
    let b = rnd.int(2, 5);
    if (a === b) b = a - 1;
    return rnd() < 0.5 ? [a, b] : [b, a];
  }

  // ---------- Bảng xếp hạng ----------
  A.table = function (s, comp, teams, filter) {
    const rows = Object.fromEntries(teams.map((id) => [id, { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
    for (const f of s.fx) {
      if (f.lg !== comp || !f.done || !filter(f) || !rows[f.h] || !rows[f.a]) continue;
      const h = rows[f.h];
      const a = rows[f.a];
      h.p++;
      a.p++;
      h.gf += f.hg;
      h.ga += f.ag;
      a.gf += f.ag;
      a.ga += f.hg;
      if (f.hg > f.ag) (h.w++, a.l++, (h.pts += 3));
      else if (f.hg < f.ag) (a.w++, h.l++, (a.pts += 3));
      else (h.d++, a.d++, h.pts++, a.pts++);
    }
    return Object.values(rows).sort((x, y) => y.pts - x.pts || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || x.id.localeCompare(y.id));
  };

  // ---------- Loại trực tiếp ----------
  // tie: { a, b, legs: [id lượt đi, id lượt về] | [id một trận], w, pens }
  function twoLegs(s, comp, stage, pairs, d1, d2) {
    const st = s.afc.comps[comp];
    for (const [a, b] of pairs) {
      // a (hạt giống cao hơn) đá lượt về trên sân nhà
      const f1 = fixture(s, comp, stage, b, a, d1, { leg: 1 });
      const f2 = fixture(s, comp, stage, a, b, d2, { leg: 2 });
      st.ties.push({ stage, a, b, legs: [f1.id, f2.id], w: null });
    }
    st.stage = stage;
  }
  function single(s, comp, stage, pairs, d) {
    const st = s.afc.comps[comp];
    for (const [a, b] of pairs) {
      const f = fixture(s, comp, stage, a, b, d, { ko: true, neutral: true });
      st.ties.push({ stage, a, b, legs: [f.id], w: null });
    }
    st.stage = stage;
  }
  function resolve(s, tie) {
    const fs = tie.legs.map((id) => s.fx.find((f) => f.id === id));
    if (fs.some((f) => !f.done)) return false;
    if (fs.length === 1) {
      const f = fs[0];
      tie.w = f.hg > f.ag || (f.hg === f.ag && f.pens && f.pens[0] > f.pens[1]) ? f.h : f.a;
      return true;
    }
    let ga = 0;
    let gb = 0;
    for (const f of fs) {
      ga += f.h === tie.a ? f.hg : f.ag;
      gb += f.h === tie.b ? f.hg : f.ag;
    }
    tie.agg = [ga, gb];
    if (ga !== gb) tie.w = ga > gb ? tie.a : tie.b;
    else {
      // hoà tổng tỉ số: hiệp phụ + luân lưu sau lượt về
      // pens: [đội chủ nhà lượt về (a), đội khách (b)]
      tie.pens = penalties(FM.rng(W.matchSeed(s, fs[1]) + 13));
      tie.w = tie.pens[0] > tie.pens[1] ? tie.a : tie.b;
    }
    return true;
  }

  // ---------- Tiến trình sau mỗi ngày thi đấu ----------
  A.progress = function (s) {
    if (!s.afc) return;
    payMatches(s);
    progressC1(s);
    progressC2(s);
  };
  function payMatches(s) {
    for (const f of s.fx) {
      if (!f.done || f.paid || (f.lg !== "acle" && f.lg !== "acl2")) continue;
      f.paid = true;
      const P = PRIZE[f.lg];
      for (const [id, me, op] of [[f.h, f.hg, f.ag], [f.a, f.ag, f.hg]]) if (s.clubs[id]) s.clubs[id].bal += me > op ? P.win : me === op ? P.draw : 0;
    }
  }
  const stageDone = (s, comp, stage) => {
    const list = s.fx.filter((f) => f.lg === comp && f.stage === stage);
    return list.length && list.every((f) => f.done);
  };
  function knockOut(s, comp, nextStage) {
    const st = s.afc.comps[comp];
    const ties = st.ties.filter((t) => t.stage === st.stage);
    if (!ties.every((t) => t.w || resolve(s, t))) return null;
    for (const t of ties) eliminated(s, comp, t.w === t.a ? t.b : t.a, st.stage);
    for (const t of ties) reached(s, comp, t.w, nextStage);
    return ties;
  }
  function eliminated(s, comp, id, stage) {
    s.afc.comps[comp].out[id] = stage;
    if (id === s.user) W.mail(s, "afc", `Dừng bước ở ${A.COMPS[comp].short}`, `CLB bị loại ở ${STAGE_NAME[stage]} ${A.COMPS[comp].name}.`);
  }
  function reached(s, comp, id, stage) {
    if (!stage || !s.clubs[id]) return;
    s.clubs[id].bal += PRIZE[comp][stage] || 0;
    if (id === s.user) {
      s.clubs[id].conf = Math.min(100, s.clubs[id].conf + 3);
      W.mail(s, "afc", `${A.COMPS[comp].short}: vào ${STAGE_NAME[stage]}!`, `CLB giành vé vào ${STAGE_NAME[stage]} ${A.COMPS[comp].name}. Thưởng ${FM.fmtMoney(PRIZE[comp][stage])}.`);
    }
  }
  function crown(s, comp, tie) {
    const st = s.afc.comps[comp];
    st.winner = tie.w;
    st.runnerUp = tie.w === tie.a ? tie.b : tie.a;
    st.stage = "done";
    if (s.clubs[tie.w]) {
      s.clubs[tie.w].bal += PRIZE[comp].champ;
      if (tie.w === s.user) s.clubs[s.user].conf = Math.min(100, s.clubs[s.user].conf + 15);
    }
    const name = (id) => W.baseClub(s, id).name;
    const f = s.fx.find((x) => x.id === tie.legs[tie.legs.length - 1]);
    W.mail(s, "afc", tie.w === s.user ? `🏆 VÔ ĐỊCH ${A.COMPS[comp].name.toUpperCase()}!` : `${name(tie.w)} vô địch ${A.COMPS[comp].short}`, `Chung kết ${A.COMPS[comp].name}: ${name(f.h)} ${f.hg}–${f.ag} ${name(f.a)}${f.pens ? ` (luân lưu ${f.pens.join("–")})` : ""}.${tie.w === s.user ? ` Thưởng ${FM.fmtMoney(PRIZE[comp].champ)}!` : ""}`);
  }
  function progressC1(s) {
    const st = s.afc.comps.acle;
    if (!st || st.stage === "done") return;
    const rnd = FM.rng(FM.hash(`acle-${s.season}-${st.stage}-${s.seed}`));
    if (st.stage === "po") {
      const t = st.ties.find((x) => x.stage === "po");
      if (!resolve(s, t)) return;
      const loser = t.w === t.a ? t.b : t.a;
      if (!CLUB.has(t.w)) {
        if (t.w === s.user) W.mail(s, "afc", "Vượt qua play-off C1!", `CLB thắng ${W.baseClub(s, loser).name} và giành vé vào vòng phân hạng AFC Champions League Elite.`);
        build(s, t.w, loser);
      } else {
        // đội Việt Nam thua: xuống vòng bảng C2
        st.out[loser] = "po";
        s.afc.vn.acle = [];
        s.afc.vn.acl2.push(loser);
        if (loser === s.user) W.mail(s, "afc", "Thua play-off C1", `CLB thua ${W.baseClub(s, t.w).name} ở play-off và xuống đá vòng bảng AFC Champions League Two.`);
        build(s, t.w, loser);
      }
      return;
    }
    if (st.stage === "ls") {
      if (!stageDone(s, "acle", "ls")) return;
      const pairs = [];
      for (const region of ["East", "West"]) {
        const t = A.table(s, "acle", st.regions[region], (f) => f.stage === "ls");
        st.final = st.final || {};
        st.final[region] = t.map((r) => r.id);
        t.slice(8).forEach((r) => eliminated(s, "acle", r.id, "ls"));
        t.slice(0, 8).forEach((r) => reached(s, "acle", r.id, "r16"));
        for (let i = 0; i < 4; i++) pairs.push([t[i].id, t[7 - i].id]);
      }
      twoLegs(s, "acle", "r16", pairs, tue(s, 21), tue(s, 22));
      return;
    }
    if (st.stage === "r16") {
      const ties = knockOut(s, "acle", "qf");
      if (!ties) return;
      const east = shuffle(rnd, ties.filter((t) => st.regions.East.includes(t.w)).map((t) => t.w));
      const west = shuffle(rnd, ties.filter((t) => st.regions.West.includes(t.w)).map((t) => t.w));
      single(s, "acle", "qf", east.map((e, i) => [e, west[i]]), after(s, 6));
      return;
    }
    if (st.stage === "qf" || st.stage === "sf") {
      const next = st.stage === "qf" ? "sf" : "f";
      const ties = knockOut(s, "acle", next);
      if (!ties) return;
      const w = ties.map((t) => t.w);
      const pairs = [];
      for (let i = 0; i < w.length; i += 2) pairs.push([w[i], w[i + 1]]);
      single(s, "acle", next, pairs, after(s, next === "sf" ? 9 : 14));
      return;
    }
    if (st.stage === "f") {
      const t = st.ties.find((x) => x.stage === "f");
      if (resolve(s, t)) crown(s, "acle", t);
    }
  }
  function progressC2(s) {
    const st = s.afc.comps.acl2;
    if (!st || st.stage === "done") return;
    if (st.stage === "grp") {
      if (!stageDone(s, "acl2", "grp")) return;
      const pos = {};
      st.final = {};
      for (const [g, teams] of Object.entries(st.groups)) {
        const t = A.table(s, "acl2", teams, (f) => f.grp === g);
        st.final[g] = t.map((r) => r.id);
        pos[g] = t;
        t.slice(2).forEach((r) => eliminated(s, "acl2", r.id, "grp"));
        t.slice(0, 2).forEach((r) => reached(s, "acl2", r.id, "r16"));
      }
      // nhất bảng gặp nhì bảng cặp đôi, trong khu vực: A–B, C–D (Tây), E–F, G–H (Đông)
      const pairs = [];
      for (const [x, y] of [["A", "B"], ["C", "D"], ["E", "F"], ["G", "H"]]) {
        if (!pos[x] || !pos[y]) continue;
        pairs.push([pos[x][0].id, pos[y][1].id], [pos[y][0].id, pos[x][1].id]);
      }
      twoLegs(s, "acl2", "r16", pairs, rel(s, 19, -10), rel(s, 19, -3));
      return;
    }
    const NEXT = { r16: "qf", qf: "sf", sf: "f" };
    if (NEXT[st.stage]) {
      const next = NEXT[st.stage];
      const ties = knockOut(s, "acl2", next);
      if (!ties) return;
      const w = ties.map((t) => t.w);
      const pairs = [];
      for (let i = 0; i < w.length; i += 2) pairs.push([w[i], w[i + 1]]);
      if (next === "f") {
        // chung kết một trận trên sân một đội vào chung kết, luân phiên Đông / Tây theo mùa
        const [w, e] = pairs[0];
        const host = s.season % 2 === 0 ? e : w;
        const f = fixture(s, "acl2", "f", host, host === e ? w : e, after(s, 28), { ko: true });
        st.ties.push({ stage: "f", a: f.h, b: f.a, legs: [f.id], w: null });
        st.stage = "f";
      } else if (next === "qf") twoLegs(s, "acl2", "qf", pairs, wed(s, 21), wed(s, 22));
      else twoLegs(s, "acl2", "sf", pairs, tue(s, 23), tue(s, 25));
      return;
    }
    if (st.stage === "f") {
      const t = st.ties.find((x) => x.stage === "f");
      if (resolve(s, t)) crown(s, "acl2", t);
    }
  }
  A.finished = (s) => !s.afc || Object.values(s.afc.comps).every((c) => c.stage === "done");

  // ---------- Cuối mùa ----------
  A.endOfSeason = function (s, sum) {
    if (!s.afc) return;
    sum.afc = {};
    for (const [comp, st] of Object.entries(s.afc.comps)) sum.afc[comp] = { winner: st.winner, runnerUp: st.runnerUp, vn: (s.afc.vn[comp] || []).map((id) => ({ id, result: A.result(s, comp, id) })) };
    const last = s.history[s.history.length - 1];
    if (last) last.afc = sum.afc;
  };
  // thành tích một đội ở giải
  A.result = function (s, comp, id) {
    const st = s.afc && s.afc.comps[comp];
    if (!st) return "";
    if (st.winner === id) return "Vô địch 🏆";
    if (st.runnerUp === id) return "Á quân";
    if (st.out[id]) return `Dừng ở ${STAGE_NAME[st.out[id]]}`;
    return st.stage === "done" ? "" : `Đang ở ${STAGE_NAME[st.stage]}`;
  };
  A.label = (f) => {
    const C = A.COMPS[f.lg];
    if (f.stage === "ls") return `${C.short} · Lượt ${f.md}`;
    if (f.stage === "grp") return `${C.short} · Bảng ${f.grp} · Lượt ${f.md}`;
    return `${C.short} · ${STAGE_NAME[f.stage]}${f.leg ? ` lượt ${f.leg === 1 ? "đi" : "về"}` : ""}`;
  };
  A.isAfc = (f) => f.lg === "acle" || f.lg === "acl2";
})();
