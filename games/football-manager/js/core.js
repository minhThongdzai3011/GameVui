// Lõi dùng chung: không gian tên FM, ngẫu nhiên có hạt giống, ngày tháng, định dạng tiền,
// sơ đồ chiến thuật và cách tính "điểm vai trò" của cầu thủ ở từng vị trí trên sân.
// Script thường (không phải module) vì game chạy được cả khi mở thẳng file://.
(function () {
  "use strict";
  const FM = (window.FM = window.FM || {});
  const D = window.FM_DATA;

  // ---------- Ngẫu nhiên có hạt giống (để trận đấu / sinh cầu thủ lặp lại được) ----------
  FM.rng = function (seed) {
    let a = seed >>> 0 || 1;
    const next = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.range = (lo, hi) => lo + next() * (hi - lo);
    next.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    next.weighted = (items, weight) => {
      const ws = items.map(weight);
      let r = next() * ws.reduce((s, w) => s + w, 0);
      for (let i = 0; i < items.length; i++) if ((r -= ws[i]) <= 0) return items[i];
      return items[items.length - 1];
    };
    next.normal = (sd = 1) => Math.sqrt(-2 * Math.log(Math.max(1e-9, next()))) * Math.cos(2 * Math.PI * next()) * sd;
    next.state = () => a;
    return next;
  };
  FM.hash = function (s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  FM.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---------- Ngày tháng (chuỗi "YYYY-MM-DD", tính theo UTC cho khỏi lệch múi giờ) ----------
  FM.addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  FM.daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
  FM.weekday = (iso) => new Date(iso + "T00:00:00Z").getUTCDay();
  const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  FM.fmtDate = (iso, withDay = true) => {
    const [y, m, d] = iso.split("-");
    return `${withDay ? WD[FM.weekday(iso)] + ", " : ""}${+d}/${+m}/${y}`;
  };
  FM.fmtShortDate = (iso) => {
    const [, m, d] = iso.split("-");
    return `${+d}/${+m}`;
  };
  // ---------- Tiền ----------
  // Đơn vị nội bộ giữ như bản V.League: giá trị / phí / số dư = tỷ VND, lương = triệu VND / tháng.
  // Giao diện quy hết ra bảng Anh (một thế giới chung Anh – Việt Nam): 1 £ = 33.000 VND.
  FM.VND_PER_GBP = 33000;
  FM.tyToGbp = (ty) => (ty * 1e9) / FM.VND_PER_GBP;
  FM.gbpToTy = (g) => (g * FM.VND_PER_GBP) / 1e9;
  FM.trToGbpWeek = (tr) => (tr * 1e6 * 12) / 52 / FM.VND_PER_GBP;
  FM.gbpWeekToTr = (g) => (g * 52 * FM.VND_PER_GBP) / 12 / 1e6;
  const gbp = (g) => {
    const v = Math.abs(g);
    if (v >= 1e6) return `£${(v / 1e6).toLocaleString("en-GB", { maximumFractionDigits: v >= 1e8 ? 0 : v >= 1e7 ? 1 : 2 })}m`;
    if (v >= 1e3) return `£${(v / 1e3).toLocaleString("en-GB", { maximumFractionDigits: v >= 1e5 ? 0 : 1 })}k`;
    return `£${Math.round(v)}`;
  };
  FM.fmtMoney = (ty) => (ty < 0 ? "−" : "") + gbp(FM.tyToGbp(ty));
  FM.fmtWage = (tr) => `${gbp(FM.trToGbpWeek(tr))}/tuần`;
  FM.fmtGbp = gbp;
  FM.esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ---------- Dữ liệu gốc ----------
  FM.ATTRS = D.meta.attrs;
  FM.A = Object.fromEntries(FM.ATTRS.map((k, i) => [k, i])); // tên thuộc tính → chỉ số trong mảng a[]
  FM.ATTR_LABEL = {
    finishing: "Dứt điểm",
    longShots: "Sút xa",
    passing: "Chuyền bóng",
    crossing: "Tạt bóng",
    dribbling: "Rê bóng",
    firstTouch: "Khống chế",
    tackling: "Tắc bóng",
    marking: "Kèm người",
    heading: "Đánh đầu",
    vision: "Nhãn quan",
    decisions: "Quyết định",
    positioning: "Chọn vị trí",
    offTheBall: "Di chuyển",
    composure: "Bình tĩnh",
    workRate: "Năng nổ",
    pace: "Tốc độ",
    stamina: "Thể lực",
    strength: "Sức mạnh",
    agility: "Nhanh nhẹn",
    jumping: "Bật nhảy",
    reflexes: "Phản xạ",
    handling: "Bắt bóng",
    oneOnOne: "Đối mặt",
    aerial: "Không chiến",
    kicking: "Phát bóng",
  };
  FM.ATTR_GROUPS = [
    ["Kỹ thuật", ["finishing", "longShots", "passing", "crossing", "dribbling", "firstTouch", "tackling", "marking", "heading"]],
    ["Tinh thần", ["vision", "decisions", "positioning", "offTheBall", "composure", "workRate"]],
    ["Thể chất", ["pace", "stamina", "strength", "agility", "jumping"]],
    ["Thủ môn", ["reflexes", "handling", "oneOnOne", "aerial", "kicking"]],
  ];
  // mã vị trí kiểu quốc tế (tên đầy đủ tiếng Việt ở POS_NAME)
  FM.POS_LABEL = { GK: "GK", CB: "CB", LB: "LB", RB: "RB", DM: "DM", CM: "CM", AM: "AM", LM: "LM", RM: "RM", LW: "LW", RW: "RW", ST: "ST" };
  FM.POS_NAME = {
    GK: "Thủ môn",
    CB: "Trung vệ",
    LB: "Hậu vệ trái",
    RB: "Hậu vệ phải",
    DM: "Tiền vệ phòng ngự",
    CM: "Tiền vệ trung tâm",
    AM: "Tiền vệ tấn công",
    LM: "Tiền vệ trái",
    RM: "Tiền vệ phải",
    LW: "Tiền đạo cánh trái",
    RW: "Tiền đạo cánh phải",
    ST: "Tiền đạo cắm",
  };
  FM.POS_GROUP = { GK: "GK", CB: "DF", LB: "DF", RB: "DF", DM: "MF", CM: "MF", AM: "MF", LM: "MF", RM: "MF", LW: "FW", RW: "FW", ST: "FW" };

  // ---------- Sơ đồ: vị trí từng ô, x 0→100 trái→phải, y 0→100 khung thành nhà → khung thành bạn ----------
  FM.FORMATIONS = {
    "4-4-2": [["GK", 50, 4], ["RB", 86, 24], ["CB", 62, 18], ["CB", 38, 18], ["LB", 14, 24], ["RM", 86, 52], ["CM", 62, 46], ["CM", 38, 46], ["LM", 14, 52], ["ST", 62, 80], ["ST", 38, 80]],
    "4-3-3": [["GK", 50, 4], ["RB", 86, 24], ["CB", 62, 18], ["CB", 38, 18], ["LB", 14, 24], ["DM", 50, 38], ["CM", 70, 50], ["CM", 30, 50], ["RW", 84, 76], ["ST", 50, 84], ["LW", 16, 76]],
    "4-2-3-1": [["GK", 50, 4], ["RB", 86, 24], ["CB", 62, 18], ["CB", 38, 18], ["LB", 14, 24], ["DM", 62, 38], ["DM", 38, 38], ["RM", 84, 62], ["AM", 50, 62], ["LM", 16, 62], ["ST", 50, 84]],
    "4-1-4-1": [["GK", 50, 4], ["RB", 86, 24], ["CB", 62, 18], ["CB", 38, 18], ["LB", 14, 24], ["DM", 50, 36], ["RM", 86, 56], ["CM", 62, 52], ["CM", 38, 52], ["LM", 14, 56], ["ST", 50, 82]],
    "3-5-2": [["GK", 50, 4], ["CB", 74, 20], ["CB", 50, 16], ["CB", 26, 20], ["RM", 88, 50], ["DM", 50, 36], ["CM", 68, 50], ["CM", 32, 50], ["LM", 12, 50], ["ST", 62, 80], ["ST", 38, 80]],
    "5-3-2": [["GK", 50, 4], ["RB", 88, 30], ["CB", 70, 18], ["CB", 50, 15], ["CB", 30, 18], ["LB", 12, 30], ["CM", 70, 48], ["DM", 50, 40], ["CM", 30, 48], ["ST", 62, 78], ["ST", 38, 78]],
  };
  FM.DEFAULT_TACTICS = { mentality: 2, pressing: 1, tempo: 1, passing: 1 }; // chỉ số trong TACTIC_OPTIONS
  FM.TACTIC_OPTIONS = {
    mentality: ["Phòng ngự", "Thận trọng", "Cân bằng", "Tấn công", "Tổng tấn công"],
    pressing: ["Lùi sâu", "Vừa phải", "Pressing tầm cao"],
    tempo: ["Chậm, chắc", "Bình thường", "Nhanh"],
    passing: ["Ngắn", "Kết hợp", "Dài, bóng bổng"],
  };
  FM.TACTIC_LABEL = { mentality: "Lối chơi", pressing: "Pressing", tempo: "Nhịp độ", passing: "Chuyền bóng" };
  FM.MAX_FOREIGN_ON_PITCH = 4;
  FM.MAX_SUBS = 5;
  FM.BENCH_SIZE = 9;

  // tầm quan trọng của thuộc tính theo vai trò (giống mô hình chỉ số, mặc định 0,8)
  const PROFILE = {
    GK: { reflexes: 1.6, handling: 1.5, oneOnOne: 1.4, aerial: 1.3, kicking: 1, positioning: 1.4, decisions: 1.2, composure: 1.2, agility: 1.1, jumping: 1, passing: 0.6, finishing: 0, longShots: 0, crossing: 0, dribbling: 0, tackling: 0, marking: 0, heading: 0, offTheBall: 0, vision: 0.4, workRate: 0.4, pace: 0.4, stamina: 0.3, strength: 0.4 },
    CB: { tackling: 1.5, marking: 1.5, heading: 1.5, positioning: 1.4, strength: 1.3, jumping: 1.3, decisions: 1.1, composure: 1, passing: 0.8, pace: 0.9, finishing: 0.1, longShots: 0.1, crossing: 0.2, dribbling: 0.3, offTheBall: 0.2, vision: 0.5 },
    LB: { pace: 1.4, stamina: 1.4, crossing: 1.3, tackling: 1.3, marking: 1.2, positioning: 1.1, workRate: 1.3, dribbling: 1, passing: 1, heading: 0.6, finishing: 0.3, strength: 0.8 },
    DM: { tackling: 1.4, positioning: 1.4, passing: 1.2, decisions: 1.3, stamina: 1.3, workRate: 1.4, marking: 1.2, strength: 1.1, composure: 1.1, vision: 1, finishing: 0.3, dribbling: 0.6, crossing: 0.4 },
    CM: { passing: 1.5, vision: 1.3, decisions: 1.3, firstTouch: 1.3, stamina: 1.3, workRate: 1.2, composure: 1.1, tackling: 1, longShots: 1, dribbling: 1, offTheBall: 1, finishing: 0.7 },
    AM: { vision: 1.5, passing: 1.4, dribbling: 1.4, firstTouch: 1.4, offTheBall: 1.3, composure: 1.2, finishing: 1.1, longShots: 1.2, decisions: 1.2, agility: 1.2, tackling: 0.3, marking: 0.2, heading: 0.5 },
    LM: { crossing: 1.5, pace: 1.4, dribbling: 1.3, stamina: 1.4, workRate: 1.3, passing: 1.1, offTheBall: 1.1, agility: 1.2, tackling: 0.7, finishing: 0.8 },
    LW: { pace: 1.5, dribbling: 1.5, agility: 1.3, finishing: 1.2, offTheBall: 1.3, crossing: 1.2, firstTouch: 1.2, composure: 1, tackling: 0.3, marking: 0.2, heading: 0.5 },
    ST: { finishing: 1.6, offTheBall: 1.5, composure: 1.3, firstTouch: 1.2, heading: 1.2, strength: 1.1, pace: 1.1, dribbling: 1, agility: 1, tackling: 0.2, marking: 0.2, crossing: 0.4, passing: 0.7 },
  };
  PROFILE.RB = PROFILE.LB;
  PROFILE.RM = PROFILE.LM;
  PROFILE.RW = PROFILE.LW;
  // trọng số dạng mảng theo thứ tự FM.ATTRS cho nhanh
  FM.PROFILE_W = {};
  for (const role in PROFILE) FM.PROFILE_W[role] = FM.ATTRS.map((k) => (PROFILE[role][k] ?? (role === "GK" ? 0 : FM.ATTRS.indexOf(k) >= FM.A.reflexes ? 0 : 0.8)));

  // điểm vai trò 1–20: trung bình có trọng số các thuộc tính theo vai trò
  FM.roleScore = function (attrs, role) {
    const w = FM.PROFILE_W[role];
    let s = 0;
    let t = 0;
    for (let i = 0; i < w.length; i++) {
      s += attrs[i] * w[i];
      t += w[i];
    }
    return s / t;
  };
  // mức thành thạo vị trí phụ (10–20)
  FM.famLevel = (v) => (v >= 16 ? "thành thạo" : v >= 13 ? "khá" : "tạm được");
  // mức quen vị trí → hệ số hiệu quả
  FM.familiarity = function (p, role) {
    if (p.pos === role) return 1;
    const fam = p.alt && p.alt[role];
    if (fam) return 0.86 + 0.14 * (fam / 20); // vị trí phụ: 93% (tạm được) → 100%
    if (role === "GK" || p.pos === "GK") return 0.25;
    return FM.POS_GROUP[role] === FM.POS_GROUP[p.pos] ? 0.82 : 0.66;
  };

  FM.ageOn = (p, iso) => {
    if (p.bd) return Math.floor((Date.parse(iso) - Date.parse(p.bd)) / 31557600000);
    return +iso.slice(0, 4) - p.by - (iso.slice(5) < "07-01" ? 1 : 0);
  };
  FM.stars = (ca) => Math.max(0.5, Math.min(5, Math.round(((ca - 35) / 52) * 10) / 2)); // 0,5–5 sao (thang chung: 87+ = 5 sao)

  // ---------- Giải đấu & quốc gia ----------
  // up / po / down / out: số đội lên thẳng, khoảng hạng đá play-off, xuống hạng, rời hệ thống giải.
  // poFinal: "neutral" (Anh: một trận ở Wembley) | "twoLegs" (Tây Ban Nha); poTie: "pens" | "seed"
  // (hoà tổng tỉ số thì đội xếp trên đi tiếp, như play-off LaLiga 2)
  const RULES = {
    "vietnam-v-league-1": { down: 1, vnPlayoff: 13 },
    "vietnam-v-league-2": { up: 1, vnPlayoff: 2, out: 1 },
    "england-premier-league": { down: 3 },
    "england-championship": { up: 2, po: [3, 6], down: 3 },
    "england-league-one": { up: 2, po: [3, 6], down: 4 },
    "england-league-two": { up: 3, po: [4, 7], out: 2 },
    "spain-la-liga": { down: 3 },
    "spain-la-liga-2": { up: 2, po: [3, 6], poFinal: "twoLegs", poTie: "seed", out: 4 },
  };
  FM.LEAGUES = D.leagues.map((l) => ({ ...l, rules: RULES[l.id] || {} }));
  FM.LEAGUE = Object.fromEntries(FM.LEAGUES.map((l) => [l.id, l]));
  FM.COUNTRIES = D.countries;
  FM.leaguesOf = (country) => FM.LEAGUES.filter((l) => l.country === country).sort((a, b) => a.tier - b.tier);
  FM.countryOf = (leagueId) => (FM.LEAGUE[leagueId] ? FM.LEAGUE[leagueId].country : null);
  FM.leagueName = (id) => (FM.LEAGUE[id] ? FM.LEAGUE[id].name : "");
  FM.leagueShort = (id) => (FM.LEAGUE[id] ? FM.LEAGUE[id].short : "");
  // giải trên / dưới cùng quốc gia
  FM.leagueAbove = (id) => FM.LEAGUES.find((l) => l.country === FM.LEAGUE[id].country && l.tier === FM.LEAGUE[id].tier - 1) || null;
  FM.leagueBelow = (id) => FM.LEAGUES.find((l) => l.country === FM.LEAGUE[id].country && l.tier === FM.LEAGUE[id].tier + 1) || null;
  // hạng đấu ngay dưới hệ thống giải trong game (đội rớt khỏi giải thấp nhất), quốc tịch mặc định
  FM.lowerName = (country) => (FM.COUNTRIES[country] && FM.COUNTRIES[country].lower) || "hạng dưới";
  FM.natOf = (country) => (FM.COUNTRIES[country] && FM.COUNTRIES[country].nat) || "";

  // ---------- Mức chi tiêu theo quốc gia (đơn vị nội bộ: tỷ VND / triệu VND mỗi tháng) ----------
  // Việt Nam: công thức gốc của bản V.League, tính trên thang năng lực cũ (trước khi quy về thang
  // chung: cũ = 34 + (mới − 34) / 0,75). Anh: theo giá trị thị trường thật (FotMob) và lương £/tuần.
  const oldVn = (ca) => 34 + (ca - 34) / 0.75;
  const EN_PAY = { 1: 2.2, 2: 1.8, 3: 1, 4: 0.8 };
  const ES_PAY = { 1: 1.3, 2: 1.2 };
  FM.ECON = {
    vn: {
      value: (ca) => 0.4 * Math.exp((oldVn(ca) - 45) * 0.109),
      wage: (ca, tier) => 15 * Math.exp((oldVn(ca) - 45) * 0.0858) * (tier >= 2 ? 0.55 : 1),
      foreignWage: 1.6, // ngoại binh đòi lương cao hơn
      ticket: 60000, // VND / vé
      startCash: 2.5, // số dư đầu game = ngân sách × hệ số
      prize: (tier, i, n) => (tier === 1 ? 5 : 1.5) * Math.max(0.1, 1 - i / (n - 1)),
      sponsorPerRep: 1 / 120,
      cost: 1, // hệ số chi phí dịch vụ (tuyển trạch…)
    },
    en: {
      value: (ca) => FM.gbpToTy(0.86 * 10 ** ((ca + 12.6) / 12.8)),
      wage: (ca, tier) => FM.gbpWeekToTr(500 * Math.exp((ca - 50) * 0.13) * (EN_PAY[tier] || 1)),
      foreignWage: 1,
      ticket: [0, 1485000, 825000, 660000, 594000], // £45 / £25 / £20 / £18 theo hạng
      startCash: 1,
      prize: (tier, i, n) => [0, 900, 90, 20, 8][tier] * Math.max(0.15, 1 - i / (n - 1)),
      sponsorPerRep: 30 / 120,
      cost: 25,
    },
    // Tây Ban Nha: cùng thang giá trị với Anh, lương và tiền bản quyền thấp hơn
    es: {
      value: (ca) => FM.gbpToTy(0.86 * 10 ** ((ca + 12.6) / 12.8)),
      wage: (ca, tier) => FM.gbpWeekToTr(500 * Math.exp((ca - 50) * 0.13) * (ES_PAY[tier] || 1.2)),
      foreignWage: 1,
      ticket: [0, 1155000, 495000], // £35 / £15
      startCash: 1,
      prize: (tier, i, n) => [0, 600, 45][tier] * Math.max(0.2, 1 - i / (n - 1)),
      sponsorPerRep: 20 / 120,
      cost: 20,
    },
  };
  FM.econOf = (country) => FM.ECON[country] || FM.ECON.vn;
})();
