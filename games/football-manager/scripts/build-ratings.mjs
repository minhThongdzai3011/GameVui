#!/usr/bin/env node
/**
 * Mô hình chỉ số: sinh năng lực, thuộc tính, tiềm năng, lương, giá trị cho mọi cầu thủ của
 * snapshot mới nhất (hoặc --snapshot=YYYY-MM-DD) → ratings.json trong thư mục snapshot đó.
 *
 *   node scripts/build-ratings.mjs
 *
 * Căn cứ (VPF không có số phút nên dựa vào mức được sử dụng):
 * - Sức mạnh CLB: điểm/trận 2 mùa trước + mùa hiện tại, V.League 1 nền cao hơn V.League 2.
 * - Mức được dùng của cầu thủ từng mùa: (đá chính + 0,35 × vào thay) / số vòng của mùa đó,
 *   ở giải nào, ghi bao nhiêu bàn/trận. Ít dữ liệu thì nghiêng về mức "trung bình của CLB".
 * - Ngoại binh (CLB chỉ thuê để đá chính), cầu thủ đội tuyển / U23 (data/national-team.json).
 * - Điểm thô xếp hạng trong từng giải rồi quy về phân bố mục tiêu (TARGET) → CA 1–100.
 * - Thuộc tính 1–20 sinh từ CA theo đặc trưng vị trí + chiều cao, cân nặng, tuổi, bàn thắng.
 * Ngẫu nhiên có hạt giống theo mã cầu thủ: chạy lại cho đúng kết quả cũ.
 * data/ratings-overrides.json (nếu có): sửa tay ca, pa, position, attributes… sau cùng.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const snapRoot = join(root, "data", "snapshots");
const snapshot = args.snapshot || (await readdir(snapRoot)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
const dir = join(snapRoot, snapshot);
const load = async (f, fallback) => {
  try {
    return JSON.parse(await readFile(f, "utf8"));
  } catch (err) {
    if (fallback !== undefined && err.code === "ENOENT") return fallback;
    throw err;
  }
};
const [meta, clubs, players, squads, stats, standings] = await Promise.all(
  ["meta", "clubs", "players", "squads", "stats", "standings"].map((n) => load(join(dir, n + ".json"))),
);
const nationalTeam = await load(join(root, "data", "national-team.json"), { teams: [] });
const manual = await load(join(root, "data", "ratings-overrides.json"), {});

const V1 = "vietnam-v-league-1";
const V2 = "vietnam-v-league-2";
const SEASON = meta.seasonLabel; // "2026/27"
const YEAR = meta.season; // 2026
const HISTORY_W = { "2025/26": 0.65, "2024/25": 0.35 };
const LEAGUE_BASE = { [V1]: 58, [V2]: 46 };
// phân bố CA mục tiêu theo phân vị trong giải
const TARGET = {
  [V1]: [[0, 40], [0.1, 47], [0.3, 54], [0.5, 58], [0.7, 63], [0.9, 70], [0.97, 75], [1, 82]],
  [V2]: [[0, 33], [0.1, 39], [0.3, 44], [0.5, 48], [0.7, 52], [0.9, 58], [0.97, 63], [1, 70]],
};

// ---------- Ngẫu nhiên có hạt giống ----------
function rngFor(key) {
  let h = 1779033703 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
  next.normal = (sd = 1) => {
    const u = Math.max(1e-9, next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next()) * sd;
  };
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;

// ---------- Tra cứu ----------
const clubById = new Map(clubs.map((c) => [c.id, c]));
const squadOf = new Map(squads.map((s) => [s.playerId, s]));
const statsOf = new Map();
for (const s of stats) {
  if (!statsOf.has(s.playerId)) statsOf.set(s.playerId, []);
  statsOf.get(s.playerId).push(s);
}
const isForeign = (p) => !!p.nationality && p.nationality !== "Việt Nam";
// Việt kiều mang quốc tịch nước ngoài: nhận theo họ Việt trong tên (VD "Kevin Pham Ba",
// "Tran Lenn Minh Quang") hoặc đánh dấu tay vietHeritage trong overrides.json
// (không có "Đỗ", "Võ": bỏ dấu thành "do", "vo" trùng chữ nước ngoài như "Do Nascimento", "Yvo")
const VIET_SURNAMES = new Set("nguyen tran pham le hoang huynh phan vu dang bui ho ngo duong ly luong mai dinh trinh thai lam doan cao".split(" "));
const vietHeritage = (p) =>
  p.vietHeritage === true ||
  (isForeign(p) &&
    String(p.name)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z]+/)
      .some((w) => VIET_SURNAMES.has(w)));

// ---------- Sức mạnh CLB ----------
const seasonLength = {}; // "2025/26|league" → số vòng
const avgPpg = {};
for (const key of new Set(standings.map((r) => `${r.season}|${r.leagueId}`))) {
  const rows = standings.filter((r) => `${r.season}|${r.leagueId}` === key && r.played > 0);
  seasonLength[key] = Math.max(...rows.map((r) => r.played));
  avgPpg[key] = rows.reduce((a, r) => a + r.points / r.played, 0) / Math.max(1, rows.length);
}
const clubIndex = {};
for (const c of clubs) {
  let sum = 0;
  let w = 0;
  for (const r of standings.filter((r) => r.clubId === c.id && r.played > 0)) {
    const key = `${r.season}|${r.leagueId}`;
    const weight = r.season === SEASON ? 0.12 * Math.min(1, r.played / 8) : HISTORY_W[r.season] || 0;
    sum += (LEAGUE_BASE[r.leagueId] + (r.points / r.played - avgPpg[key]) * 12) * weight;
    w += weight;
  }
  const base = LEAGUE_BASE[c.leagueId];
  // đội mới lên/xuống hạng thường thay nhiều người → kéo một phần về mức nền của giải hiện tại
  clubIndex[c.id] = w ? 0.7 * (sum / w) + 0.3 * base : base - 3;
}

// ---------- Đội tuyển ----------
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const callups = new Map(); // playerId → "senior" | "u23"
for (const team of nationalTeam.teams || []) {
  const level = /u2[0-3]/i.test(team.team) ? "u23" : "senior";
  for (const np of team.players || []) {
    if (np.id !== undefined) {
      // đã đối chiếu sẵn mã cầu thủ (null = không đăng ký V.League mùa này)
      if (!np.id) continue;
      if (!squadOf.has(np.id)) console.warn(`  đội tuyển: không thấy mã ${np.id} (${np.name})`);
      else if (callups.get(np.id) !== "senior") callups.set(np.id, level);
      continue;
    }
    const n = norm(np.name);
    let hits = players.filter((p) => norm(p.name) === n);
    if (hits.length > 1 && np.club) hits = hits.filter((p) => norm(clubById.get(squadOf.get(p.id).clubId).name).includes(norm(np.club).split(" ").pop()));
    if (hits.length === 1) {
      if (callups.get(hits[0].id) !== "senior") callups.set(hits[0].id, level);
    } else if (!team.silent) console.warn(`  đội tuyển: không khớp được "${np.name}" (${np.club || "?"}) → ${hits.length} người`);
  }
}

// ---------- Vị trí chi tiết ----------
const DETAIL_TEXT = [
  [/thủ môn/, "GK"],
  [/hậu vệ trái/, "LB"],
  [/hậu vệ phải/, "RB"],
  [/trung vệ/, "CB"],
  [/phòng ngự/, "DM"],
  [/tấn công|số 10/, "AM"],
  [/tiền vệ cánh trái/, "LM"],
  [/tiền vệ cánh/, "RM"],
  [/tiền đạo cánh trái/, "LW"],
  [/tiền đạo cánh/, "RW"],
  [/tiền vệ/, "CM"],
  [/tiền đạo/, "ST"],
];
const NEIGHBORS = {
  GK: [],
  CB: ["DM", "RB", "LB"],
  LB: ["LM", "CB", "RB"],
  RB: ["RM", "CB", "LB"],
  DM: ["CM", "CB"],
  CM: ["DM", "AM"],
  AM: ["CM", "ST", "LW", "RW"],
  LM: ["LW", "LB", "AM", "RM"],
  RM: ["RW", "RB", "AM", "LM"],
  LW: ["LM", "ST", "RW"],
  RW: ["RM", "ST", "LW"],
  ST: ["AM", "LW", "RW"],
};
const goalRate = (id) => {
  const rows = (statsOf.get(id) || []).filter((r) => r.apps > 0);
  const apps = rows.reduce((a, r) => a + r.apps, 0);
  return apps ? rows.reduce((a, r) => a + r.goals, 0) / apps : 0;
};
const detailOf = {};
for (const c of clubs) {
  const list = squads.filter((s) => s.clubId === c.id).map((s) => ({ s, p: players.find((p) => p.id === s.playerId), rnd: rngFor("pos:" + s.playerId) }));
  const take = (group, fn) => list.filter((x) => x.s.position === group && !detailOf[x.p.id]).forEach(fn);
  for (const x of list) {
    const text = (x.s.positionDetail || "").toLowerCase();
    const hit = DETAIL_TEXT.find(([re]) => re.test(text));
    if (hit && hit[1] !== "GK") detailOf[x.p.id] = hit[1];
    if (x.s.position === "GK") detailOf[x.p.id] = "GK";
  }
  // theo số áo quen thuộc
  const BY_NUMBER = { DF: { 2: "RB", 3: "LB", 4: "CB", 5: "CB", 12: "RB", 13: "LB", 22: "RB", 23: "LB" }, MF: { 6: "DM", 8: "CM", 10: "AM", 7: "RM", 11: "LM" }, FW: { 9: "ST", 7: "RW", 11: "LW", 10: "ST" } };
  for (const g of ["DF", "MF", "FW"]) take(g, (x) => BY_NUMBER[g][x.s.number] && (detailOf[x.p.id] = BY_NUMBER[g][x.s.number]));
  // hậu vệ còn lại: cao → trung vệ, thấp → biên; cân đối 2 cánh
  const dfs = list.filter((x) => x.s.position === "DF" && !detailOf[x.p.id]).sort((a, b) => (b.p.height || 176) - (a.p.height || 176));
  const counts = () => list.reduce((m, x) => ((m[detailOf[x.p.id]] = (m[detailOf[x.p.id]] || 0) + 1), m), {});
  // chọn cánh bên ít người hơn, bằng nhau thì ngẫu nhiên (không thiên về trái)
  const side = (m, l, r, x) => ((m[l] || 0) < (m[r] || 0) ? l : (m[l] || 0) > (m[r] || 0) ? r : x.rnd() < 0.5 ? l : r);
  dfs.forEach((x, i) => {
    const m = counts();
    if ((x.p.height || 176) >= 180 || i < Math.ceil(dfs.length * 0.45)) detailOf[x.p.id] = "CB";
    else detailOf[x.p.id] = side(m, "LB", "RB", x);
  });
  // tiền vệ còn lại: cao → phòng ngự, ghi bàn nhiều → tấn công, cần thêm cánh thì cánh
  take("MF", (x) => {
    const m = counts();
    const gr = goalRate(x.p.id);
    if ((m.LM || 0) + (m.RM || 0) < 3 && (x.p.height || 172) <= 174 && x.rnd() < 0.6) detailOf[x.p.id] = side(m, "LM", "RM", x);
    else if (gr >= 0.18) detailOf[x.p.id] = "AM";
    else if ((x.p.height || 172) >= 180 || (m.DM || 0) < 2) detailOf[x.p.id] = "DM";
    else detailOf[x.p.id] = x.rnd() < 0.7 ? "CM" : "AM";
  });
  // tiền đạo còn lại: cao hoặc ghi bàn đều → cắm, thấp → cánh
  take("FW", (x) => {
    const m = counts();
    if ((x.p.height || 176) >= 178 || goalRate(x.p.id) >= 0.3 || (m.LW || 0) + (m.RW || 0) >= 3) detailOf[x.p.id] = "ST";
    else detailOf[x.p.id] = side(m, "LW", "RW", x);
  });
  // đội nào cũng phải đủ vai trò tối thiểu để xếp được đội hình: thiếu thì đổi người ở vị trí
  // gần nhất (ưu tiên người ghi bàn nhiều cho tiền đạo, người cao cho trung vệ)
  const NEED = [
    ["ST", 2, ["LW", "RW", "AM"], (x) => goalRate(x.p.id) * 100 + (x.p.height || 176) / 10],
    ["CB", 3, ["DM", "LB", "RB"], (x) => x.p.height || 176],
    ["LB", 1, ["RB", "LM", "CB"], (x) => -(x.p.height || 176)],
    ["RB", 1, ["LB", "RM", "CB"], (x) => -(x.p.height || 176)],
    ["CM", 2, ["DM", "AM", "LM", "RM"], () => 0],
    ["DM", 1, ["CM", "CB"], (x) => x.p.height || 176],
  ];
  for (const [role, min, from, score] of NEED) {
    const m = counts();
    let missing = min - (m[role] || 0);
    for (const src of from) {
      if (missing <= 0) break;
      const spare = list
        .filter((x) => detailOf[x.p.id] === src && (counts()[src] || 0) > (NEED.find((n) => n[0] === src)?.[1] || 1))
        .sort((a, b) => score(b) - score(a));
      for (const x of spare.slice(0, missing)) {
        detailOf[x.p.id] = role;
        missing--;
      }
    }
  }
}

// ---------- Điểm thô → CA ----------
const ageOf = (p) => (p.birthDate ? (Date.parse(`${YEAR}-10-16`) - Date.parse(p.birthDate)) / 31557600000 : p.birthYear ? YEAR - p.birthYear : null);
const raw = {};
const evidence = {};
const estimatedBirth = new Set();
for (const p of players) {
  const sq = squadOf.get(p.id);
  const club = clubById.get(sq.clubId);
  const rows = (statsOf.get(p.id) || []).filter((r) => HISTORY_W[r.season] && r.apps > 0);
  if (!p.birthYear) {
    // VPF bỏ trống năm sinh: không có lịch sử thi đấu → thường là cầu thủ trẻ mới lên
    p.birthYear = rows.length ? 1999 : 2006;
    estimatedBirth.add(p.id);
  }
  const age = ageOf(p);
  let sum = 0;
  let w = 0;
  for (const r of rows) {
    const len = seasonLength[`${r.season}|${r.leagueId}`] || (r.leagueId === V1 ? 26 : 22);
    const usage = clamp((r.starts + 0.35 * r.subsIn) / len, 0, 1);
    const gpg = r.goals / Math.max(1, r.apps);
    const goalBonus = { FW: clamp(gpg * 16 - 3, -3, 8), MF: clamp(gpg * 10 - 1, -1, 6), DF: clamp(gpg * 6, 0, 3), GK: 0 }[sq.position];
    const weight = HISTORY_W[r.season] * Math.min(1, r.apps / 8);
    sum += (LEAGUE_BASE[r.leagueId] + 22 * (usage - 0.45) + goalBonus) * weight;
    w += weight;
  }
  const ev = Math.min(1, w);
  const youth = age <= 19 ? -9 : age <= 21 ? -4 : 0;
  const prior = clubIndex[club.id] - 4 + youth + (isForeign(p) && !callups.has(p.id) ? 3 : 0);
  let score = w ? (2 * ev * (sum / w) + prior) / (2 * ev + 1) : prior;
  score += (clubIndex[club.id] - LEAGUE_BASE[club.leagueId]) * 0.35;
  if (isForeign(p) && !callups.has(p.id)) score += 2;
  if (age >= 34) score -= (age - 33) * 1.5;
  const call = callups.get(p.id);
  if (call === "senior") score += 6;
  if (call === "u23") score += 3;
  raw[p.id] = score + rngFor("raw:" + p.id).normal(0.8); // phá thế hoà
  evidence[p.id] = ev;
}
const ca = {};
for (const league of [V1, V2]) {
  const ids = players.filter((p) => clubById.get(squadOf.get(p.id).clubId).leagueId === league).map((p) => p.id);
  ids.sort((a, b) => raw[a] - raw[b]);
  const curve = TARGET[league];
  ids.forEach((id, i) => {
    const q = ids.length > 1 ? i / (ids.length - 1) : 0.5;
    const j = curve.findIndex(([x]) => x >= q);
    const [x0, y0] = curve[Math.max(0, j - 1)];
    const [x1, y1] = curve[j];
    ca[id] = Math.round(x1 === x0 ? y1 : y0 + ((q - x0) / (x1 - x0)) * (y1 - y0));
  });
}

// ---------- Thuộc tính ----------
const ATTRS = {
  technical: ["finishing", "longShots", "passing", "crossing", "dribbling", "firstTouch", "tackling", "marking", "heading"],
  mental: ["vision", "decisions", "positioning", "offTheBall", "composure", "workRate"],
  physical: ["pace", "stamina", "strength", "agility", "jumping"],
  goalkeeping: ["reflexes", "handling", "oneOnOne", "aerial", "kicking"],
};
const OUTFIELD = [...ATTRS.technical, ...ATTRS.mental, ...ATTRS.physical];
// tầm quan trọng của từng thuộc tính theo vị trí (mặc định 0,8)
const PROFILE = {
  GK: { reflexes: 1.6, handling: 1.5, oneOnOne: 1.4, aerial: 1.3, kicking: 1, positioning: 1.4, decisions: 1.2, composure: 1.2, agility: 1.1, jumping: 1, passing: 0.6, finishing: 0.15, longShots: 0.15, crossing: 0.15, dribbling: 0.2, tackling: 0.2, marking: 0.2, heading: 0.3, offTheBall: 0.15, vision: 0.5, workRate: 0.7, pace: 0.6 },
  CB: { tackling: 1.5, marking: 1.5, heading: 1.5, positioning: 1.4, strength: 1.3, jumping: 1.3, decisions: 1.1, composure: 1, passing: 0.8, pace: 0.9, finishing: 0.3, longShots: 0.4, crossing: 0.4, dribbling: 0.5, offTheBall: 0.4, vision: 0.6 },
  LB: { pace: 1.4, stamina: 1.4, crossing: 1.3, tackling: 1.3, marking: 1.2, positioning: 1.1, workRate: 1.3, dribbling: 1, passing: 1, heading: 0.7, finishing: 0.4, strength: 0.9 },
  DM: { tackling: 1.4, positioning: 1.4, passing: 1.2, decisions: 1.3, stamina: 1.3, workRate: 1.4, marking: 1.2, strength: 1.1, composure: 1.1, vision: 1, finishing: 0.5, dribbling: 0.7, crossing: 0.5 },
  CM: { passing: 1.5, vision: 1.3, decisions: 1.3, firstTouch: 1.3, stamina: 1.3, workRate: 1.2, composure: 1.1, tackling: 1, longShots: 1, dribbling: 1, offTheBall: 1, finishing: 0.8 },
  AM: { vision: 1.5, passing: 1.4, dribbling: 1.4, firstTouch: 1.4, offTheBall: 1.3, composure: 1.2, finishing: 1.1, longShots: 1.2, decisions: 1.2, agility: 1.2, tackling: 0.4, marking: 0.3, heading: 0.6 },
  LM: { crossing: 1.5, pace: 1.4, dribbling: 1.3, stamina: 1.4, workRate: 1.3, passing: 1.1, offTheBall: 1.1, agility: 1.2, tackling: 0.8, finishing: 0.9 },
  LW: { pace: 1.5, dribbling: 1.5, agility: 1.3, finishing: 1.2, offTheBall: 1.3, crossing: 1.2, firstTouch: 1.2, composure: 1, tackling: 0.4, marking: 0.3, heading: 0.6 },
  ST: { finishing: 1.6, offTheBall: 1.5, composure: 1.3, firstTouch: 1.2, heading: 1.2, strength: 1.1, pace: 1.1, dribbling: 1, agility: 1, tackling: 0.3, marking: 0.3, crossing: 0.5, passing: 0.8 },
};
PROFILE.RB = PROFILE.LB;
PROFILE.RM = PROFILE.LM;
PROFILE.RW = PROFILE.LW;
const EXPECTED_GPG = { ST: 0.35, LW: 0.22, RW: 0.22, AM: 0.18, LM: 0.1, RM: 0.1, CM: 0.07, DM: 0.04 };

function attributes(p, pos, level, rnd) {
  const age = ageOf(p);
  const h = p.height || (pos === "GK" ? 183 : pos === "CB" ? 181 : 173);
  const kg = p.weight || Math.round(h - 105);
  const base = level * 0.21;
  const prof = PROFILE[pos];
  const a = {};
  for (const k of [...OUTFIELD, ...ATTRS.goalkeeping]) {
    if (pos !== "GK" && ATTRS.goalkeeping.includes(k)) {
      a[k] = rnd.int(1, 4);
      continue;
    }
    a[k] = base * (0.5 + 0.5 * (prof[k] ?? 0.8)) + rnd.normal(1.2);
  }
  // vóc dáng
  a.heading += (h - 176) * 0.12;
  a.jumping += (h - 176) * 0.1;
  a.strength += (h - 176) * 0.08 + (kg - 68) * 0.08;
  a.agility -= (h - 176) * 0.06;
  a.pace -= (h - 178) * 0.04;
  if (pos === "GK") a.aerial += (h - 183) * 0.12;
  // tuổi: già thì chậm đi nhưng chín chắn hơn, trẻ thì ngược lại
  a.pace -= Math.max(0, age - 29) * 0.5;
  a.agility -= Math.max(0, age - 30) * 0.4;
  a.stamina -= Math.max(0, age - 31) * 0.4;
  for (const k of ["decisions", "composure", "positioning"]) a[k] += clamp((age - 23) * 0.15, -1, 1.2);
  if (age < 20) a.pace += 0.8;
  // ghi bàn nhiều hơn mức thường của vị trí → dứt điểm tốt hơn
  if (pos !== "GK" && EXPECTED_GPG[pos] !== undefined) a.finishing += clamp((goalRate(p.id) - EXPECTED_GPG[pos]) * 12, -2, 3);
  for (const k in a) a[k] = clamp(Math.round(a[k]), 1, 20);
  return a;
}

// ---------- Lương, giá trị, hợp đồng ----------
function wageOf(caV, league, foreign) {
  // triệu VND/tháng: CA 45 ≈ 15tr, 60 ≈ 54tr, 70 ≈ 128tr, 80 ≈ 300tr (V.League 1)
  let w = 15 * Math.exp((caV - 45) * 0.0858);
  if (league === V2) w *= 0.55;
  if (foreign) w *= 1.6;
  return Math.max(5, Math.round(w));
}
function valueOf(caV, paV, age, league) {
  // tỷ VND: CA 45 ≈ 0,4 · 60 ≈ 2 · 70 ≈ 6 · 80 ≈ 18
  let v = 0.4 * Math.exp((caV - 45) * 0.109);
  if (age <= 21) v *= 1 + (paV - caV) / 40;
  else if (age >= 33) v *= 0.3;
  else if (age >= 31) v *= 0.55;
  else if (age >= 28) v *= 0.8;
  if (league === V2) v *= 0.7;
  return Math.max(0.1, round1(v));
}

// ---------- Ghép lại ----------
const out = {};
for (const p of players) {
  const sq = squadOf.get(p.id);
  const club = clubById.get(sq.clubId);
  const rnd = rngFor("attr:" + p.id);
  const age = ageOf(p);
  const pos = detailOf[p.id] || { GK: "GK", DF: "CB", MF: "CM", FW: "ST" }[sq.position];
  const caV = ca[p.id];
  const head = age <= 18 ? rnd.range(18, 32) : age <= 20 ? rnd.range(12, 26) : age <= 22 ? rnd.range(7, 18) : age <= 24 ? rnd.range(3, 10) : age <= 27 ? rnd.range(0, 4) : 0;
  const paV = Math.min(92, Math.round(caV + head + (callups.has(p.id) && age <= 23 ? 4 : 0)));
  const familiarity = { [pos]: 20 };
  for (const n of NEIGHBORS[pos]) if (rnd() < 0.45) familiarity[n] = rnd.int(10, 16);
  const leftSide = /^L/.test(pos);
  const r = rnd();
  const foot = leftSide ? (r < 0.75 ? "left" : r < 0.9 ? "right" : "both") : r < 0.75 ? "right" : r < 0.94 ? "left" : "both";
  // đã lên đội tuyển Việt Nam thì chắc chắn là cầu thủ nội (nhập tịch, Việt kiều có quốc tịch)
  // ngoại binh = chiếm suất ngoại (luật 2026/27: tối đa 4 người trên sân cùng lúc); tuyển
  // thủ Việt Nam (nhập tịch) và Việt kiều không tính
  const foreign = isForeign(p) && !callups.has(p.id) && !vietHeritage(p);
  const years = foreign ? (rnd() < 0.7 ? 1 : 2) : age <= 20 ? rnd.int(2, 4) : rnd.int(1, 3);
  out[p.id] = {
    ca: caV,
    pa: paV,
    position: pos,
    positions: familiarity,
    foot,
    attributes: attributes(p, pos, caV, rnd),
    hidden: { consistency: rnd.int(6, 18), injuryProneness: rnd.int(3, 15), professionalism: rnd.int(6, 18) },
    wage: wageOf(caV, club.leagueId, foreign),
    value: valueOf(caV, paV, age, club.leagueId),
    contractEnd: `${YEAR + years}-06-30`,
    foreignSlot: foreign,
    vietHeritage: vietHeritage(p) || undefined,
    nationalTeam: callups.get(p.id) || null,
    birthYearEstimated: estimatedBirth.has(p.id) || undefined,
    birthYear: estimatedBirth.has(p.id) ? p.birthYear : undefined,
    evidence: round1(evidence[p.id]),
  };
}
// sửa tay sau cùng
for (const [id, o] of Object.entries(manual.players || {})) {
  if (!out[id]) {
    console.warn(`  ratings-overrides: không thấy ${id}`);
    continue;
  }
  const { attributes: attrs, ...rest } = o;
  Object.assign(out[id], rest);
  if (attrs) Object.assign(out[id].attributes, attrs);
}

const clubOut = {};
for (const c of clubs) {
  const ids = squads.filter((s) => s.clubId === c.id).map((s) => s.playerId);
  const top = ids.map((id) => out[id].ca).sort((a, b) => b - a).slice(0, 11);
  const rep = Math.round(clamp(clubIndex[c.id], 1, 100));
  const wageBill = ids.reduce((a, id) => a + out[id].wage, 0);
  clubOut[c.id] = {
    reputation: rep,
    strength: round1(top.reduce((a, b) => a + b, 0) / top.length),
    transferBudget: round1(2 * Math.exp((rep - 45) * 0.08)), // tỷ VND
    wageBudget: Math.round(wageBill * 1.08), // triệu VND/tháng
  };
}
await writeFile(
  join(dir, "ratings.json"),
  JSON.stringify({ meta: { model: 1, snapshot, generatedAt: new Date().toISOString(), scale: { ca: "1-100", attributes: "1-20", wage: "triệu VND/tháng", value: "tỷ VND", budget: "tỷ VND" } }, clubs: clubOut, players: out }, null, 1) + "\n",
  "utf8",
);

// ---------- Báo cáo kiểm tra ----------
const nameOf = (id) => players.find((p) => p.id === id).name;
for (const league of [V1, V2]) {
  const ids = players.filter((p) => clubById.get(squadOf.get(p.id).clubId).leagueId === league).map((p) => p.id);
  const cas = ids.map((id) => out[id].ca).sort((a, b) => a - b);
  console.log(`\n${league}: ${ids.length} cầu thủ, CA min ${cas[0]} · trung vị ${cas[cas.length >> 1]} · max ${cas.at(-1)}`);
  console.log(
    "  top 12: " +
      ids
        .sort((a, b) => out[b].ca - out[a].ca)
        .slice(0, 12)
        .map((id) => `${nameOf(id)} ${out[id].ca}/${out[id].pa} ${out[id].position} [${clubById.get(squadOf.get(id).clubId).code}]`)
        .join(", "),
  );
  const prev = SEASON === "2026/27" ? "2025/26" : null;
  const table = clubs
    .filter((c) => c.leagueId === league)
    .map((c) => ({ c, s: clubOut[c.id].strength, last: standings.find((r) => r.clubId === c.id && r.season === prev) }))
    .sort((a, b) => b.s - a.s);
  console.log("  sức mạnh 11 người tốt nhất (hạng mùa trước): " + table.map((x) => `${x.c.code} ${x.s}${x.last ? ` (${x.last.leagueId === V1 ? "V1" : "V2"} #${x.last.rank})` : ""}`).join(", "));
}
console.log(`\nĐội tuyển khớp được: ${callups.size} cầu thủ. Năm sinh ước lượng: ${estimatedBirth.size}.`);
console.log(`Đã ghi ${join(dir, "ratings.json")}`);
