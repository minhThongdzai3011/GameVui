#!/usr/bin/env node
/**
 * Mô hình chỉ số cho cầu thủ châu Âu lấy từ FotMob — Anh (Premier League → League Two, các đội Champions
 * League) và Tây Ban Nha (LaLiga, LaLiga 2) — trên
 * CÙNG THANG với V.League sau khi quy đổi (build-game-data hạ V.League: ca' = 30 + (ca − 30) × 0,7).
 *
 * - Năng lực (CA 1–100) chủ yếu từ giá trị chuyển nhượng ước tính của FotMob (log10 €), chỉnh theo
 *   tuổi (cầu thủ trẻ được định giá cao vì tiềm năng, lão tướng thì ngược lại), điểm FotMob mùa này
 *   và thời gian thi đấu thật ở Premier League (premierleague.com). Thiếu giá trị thì ước lượng từ
 *   mặt bằng giải + vị trí + tuổi.
 *     €0,2tr ≈ 55 (trung vị League Two) · €0,4tr ≈ 59 · €1,7tr ≈ 67 (Championship) · €20tr ≈ 80 (PL) · €150tr ≈ 92
 * - Thuộc tính 1–20 theo hồ sơ vị trí (giống V.League), chỉnh theo "traits" của FotMob (phân vị so với
 *   cầu thủ cùng vị trí: tạo cơ hội, không chiến, phòng ngự, ghi bàn, dứt điểm, chạm bóng; thủ môn:
 *   cứu thua, bắt bóng bổng, lao ra, chuyền dài) và tỉ lệ chuyền / rê bóng thật ở Premier League.
 * - Vị trí phụ từ số trận thật ở mỗi vị trí. Chân thuận, hạn hợp đồng thật khi có.
 * - Tiền dùng đơn vị nội bộ của game (giá trị: tỷ VND, lương: triệu VND/tháng; giao diện quy ra £).
 *   Giá trị = giá trị thật của FotMob. Lương theo năng lực × mức chi của hạng đấu.
 *
 *   node scripts/build-ratings-en.mjs               → ratings.json trong snapshot data/en-snapshots mới nhất
 *   node scripts/build-ratings-en.mjs --country=es  → data/es-snapshots (không có số liệu premierleague.com)
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const latest = async (d) => join(d, (await readdir(d)).sort().at(-1));
const COUNTRY = (process.argv.find((a) => a.startsWith("--country=")) || "--country=en").slice(10);
const dir = await latest(join(root, "data", `${COUNTRY}-snapshots`));
const load = async (d, n) => JSON.parse(await readFile(join(d, `${n}.json`), "utf8"));
const [meta, clubs, players, squads, stats, leagueList] = await Promise.all(["meta", "clubs", "players", "squads", "stats", "leagues"].map((n) => load(dir, n)));
// số liệu chi tiết premierleague.com chỉ có cho nước Anh
const [plPlayers, plStats] = COUNTRY === "en" ? await (async () => { const plDir = await latest(join(root, "data", "pl-snapshots")); return Promise.all([load(plDir, "players"), load(plDir, "stats")]); })() : [[], []];
const YEAR = meta.season;
const TODAY = `${YEAR}-10-16`;

// quy đổi tiền: 1 £ = 33.000 VND, 1 € = 0,86 £
const VND_PER_GBP = 33000;
const EUR_GBP = 0.86;
const eurToTy = (e) => (e * EUR_GBP * VND_PER_GBP) / 1e9;
const gbpWeekToTrMonth = (g) => (g * 52) / 12 * VND_PER_GBP / 1e6;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round1 = (v) => Math.round(v * 10) / 10;
function rngFor(key) {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  let a = h >>> 0;
  const r = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.range = (lo, hi) => lo + r() * (hi - lo);
  r.normal = (sd = 1) => {
    let u = 0;
    let v = 0;
    while (!u) u = r();
    while (!v) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd;
  };
  return r;
}
const ageOf = (p) => (p.birthDate ? (Date.parse(TODAY) - Date.parse(p.birthDate)) / 31557600000 : 25);

// ---------- Giải & CLB ----------
const TIER = Object.fromEntries(leagueList.filter((l) => l.tier).map((l) => [l.id, l.tier]));
const RANGE = { 1: [62, 94], 2: [52, 82], 3: [45, 74], 4: [40, 68], 0: [48, 94] };
// mức lương của hạng đấu (nhân với lương cơ bản theo năng lực)
const PAY = { en: { 1: 2.2, 2: 1.8, 3: 1, 4: 0.8 }, es: { 1: 1.3, 2: 1.2 } }[COUNTRY];
const clubById = new Map(clubs.map((c) => [c.id, c]));
const squadOf = new Map(squads.map((q) => [q.playerId, q]));
const tierOf = (p) => TIER[clubById.get(squadOf.get(p.id).clubId).league] ?? 0;

// ---------- Ghép số liệu Premier League (premierleague.com) theo tên + ngày sinh ----------
const norm = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
const plByKey = new Map();
for (const q of plPlayers) {
  plByKey.set(`${norm(q.name)}|${q.birthDate}`, q);
  plByKey.set(`${norm(q.lastName)}|${q.birthDate}`, q);
}
const plStatsBy = new Map();
for (const r of plStats) (plStatsBy.get(r.playerId) || plStatsBy.set(r.playerId, []).get(r.playerId)).push(r);
function plMatch(p) {
  const last = p.name.split(" ").slice(-1)[0];
  return plByKey.get(`${norm(p.name)}|${p.birthDate}`) || plByKey.get(`${norm(last)}|${p.birthDate}`) || null;
}

// ---------- Năng lực ----------
const fotStats = new Map();
for (const r of stats) if (r.season === "2026/27" || !fotStats.has(r.playerId)) fotStats.set(r.playerId, r);
const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
const fromValue = (v) => 12.8 * Math.log10(v) - 12.6;
function ageAdj(age) {
  if (age <= 19) return -6;
  if (age <= 21) return -4;
  if (age <= 23) return -2;
  if (age <= 28) return 0;
  if (age <= 30) return 2;
  if (age <= 32) return 4;
  return 6;
}
const raw = {};
const why = {};
for (const p of players) {
  const age = ageOf(p);
  const tier = tierOf(p);
  let score = null;
  if (p.value) score = fromValue(p.value) + ageAdj(age) + (p.pos === "GK" ? 2.5 : 0);
  why[p.id] = { value: p.value || null };
  // điểm FotMob mùa này (ít nhất 3 trận ở giải hiện tại)
  const fs = fotStats.get(p.id);
  if (score !== null && fs && fs.rating && fs.apps >= 3) {
    const d = clamp((fs.rating - 6.75) * 2.5, -2.5, 2.5);
    score += d;
    why[p.id].rating = fs.rating;
  }
  // thời gian thi đấu thật ở Premier League mùa trước
  const pl = plMatch(p);
  if (pl) {
    const last = (plStatsBy.get(pl.id) || []).find((r) => r.season === "2025/26");
    if (last && score !== null) {
      const share = last.mins / 3420;
      if (share > 0.65) score += 1;
      else if (share < 0.12 && age >= 24) score -= 1;
      why[p.id].plMins = last.mins;
    }
    p._pl = pl;
  }
  raw[p.id] = score;
}
// thiếu giá trị: lấy mặt bằng của hạng đấu (trung vị cầu thủ cùng hạng), trẻ thì thấp hơn
const byTier = {};
for (const p of players) if (raw[p.id] !== null) (byTier[tierOf(p)] ||= []).push(raw[p.id]);
// giá chuyển nhượng thiên vị theo vị trí (thủ môn / hậu vệ hạng dưới được định giá tương đối cao hơn
// tiền đạo) → trong mỗi hạng, kéo trung vị từng tuyến về trung vị chung (70%)
const GROUP = { GK: "GK", CB: "DF", LB: "DF", RB: "DF", DM: "MF", CM: "MF", AM: "MF", LM: "MF", RM: "MF", LW: "FW", RW: "FW", ST: "FW" };
{
  const by = {};
  for (const p of players) if (raw[p.id] !== null) ((by[tierOf(p)] ||= {})[GROUP[p.pos] || "MF"] ||= []).push(raw[p.id]);
  for (const p of players) {
    if (raw[p.id] === null) continue;
    const t = by[tierOf(p)];
    const all = Object.values(t).flat();
    raw[p.id] += (median(all) - median(t[GROUP[p.pos] || "MF"])) * 0.7;
  }
}
const ca = {};
for (const p of players) {
  const tier = tierOf(p);
  const rnd = rngFor("ca:" + p.id);
  let v = raw[p.id];
  if (v === null) {
    const age = ageOf(p);
    v = median(byTier[tier] || byTier[0]) - 4 - (age <= 20 ? 4 : 0) + rnd.normal(2);
    why[p.id].estimated = true;
  }
  // nén phần đỉnh: trên 84 tăng chậm lại để ngôi sao không dồn cục ở 93–94
  if (v > 84) v = 84 + (v - 84) * 0.6;
  const [lo, hi] = RANGE[tier];
  ca[p.id] = Math.round(clamp(v + rnd.normal(0.6), lo, hi));
}

// ---------- Thuộc tính ----------
const ATTRS = {
  technical: ["finishing", "longShots", "passing", "crossing", "dribbling", "firstTouch", "tackling", "marking", "heading"],
  mental: ["vision", "decisions", "positioning", "offTheBall", "composure", "workRate"],
  physical: ["pace", "stamina", "strength", "agility", "jumping"],
  goalkeeping: ["reflexes", "handling", "oneOnOne", "aerial", "kicking"],
};
const OUTFIELD = [...ATTRS.technical, ...ATTRS.mental, ...ATTRS.physical];
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
// trait FotMob (phân vị 0–1) → thuộc tính được cộng / trừ (tối đa ±w)
const TRAIT_W = {
  chances_created: { passing: 2, vision: 2, crossing: 1.5 },
  aerials_won: { heading: 2.5, jumping: 1.5, strength: 1 },
  defensive_actions: { tackling: 2, marking: 2, positioning: 1, workRate: 1.5 },
  goals: { finishing: 2.5, offTheBall: 1.5, composure: 1 },
  shot_attempts: { longShots: 2, finishing: 1 },
  touches: { firstTouch: 1.5, passing: 1, composure: 1 },
  save_percentage: { reflexes: 2.5, oneOnOne: 1.5 },
  keeper_high_claim: { aerial: 2.5, handling: 1 },
  keeper_sweeper_actions: { oneOnOne: 1.5, pace: 1 },
  long_ball_succeeeded_accuracy: { kicking: 2.5 },
  clean_sheet: { positioning: 1.5 },
};
// tỉ lệ chuyền / rê bóng trung bình theo vị trí ở Premier League (để so sánh)
const PASS_AVG = {};
const DRIB_AVG = {};
{
  const acc = {};
  for (const p of players) {
    const pl = p._pl;
    if (!pl) continue;
    const s = (plStatsBy.get(pl.id) || []).find((r) => r.season === "2025/26");
    if (!s || s.passes < 200) continue;
    (acc[p.pos] ||= { pa: [], dr: [] }).pa.push(s.passesAcc / s.passes);
    if (s.dribblesTried >= 15) acc[p.pos].dr.push(s.dribbles / s.dribblesTried);
  }
  for (const [pos, a] of Object.entries(acc)) {
    PASS_AVG[pos] = a.pa.reduce((x, y) => x + y, 0) / a.pa.length;
    DRIB_AVG[pos] = a.dr.length ? a.dr.reduce((x, y) => x + y, 0) / a.dr.length : 0.45;
  }
}
function attributes(p, pos, level, rnd) {
  const age = ageOf(p);
  const h = p.height || (pos === "GK" ? 188 : pos === "CB" ? 186 : 178);
  const kg = p._pl?.weight || Math.round(h - 104);
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
  a.heading += (h - 180) * 0.12;
  a.jumping += (h - 180) * 0.1;
  a.strength += (h - 180) * 0.08 + (kg - 74) * 0.08;
  a.agility -= (h - 180) * 0.06;
  a.pace -= (h - 182) * 0.04;
  if (pos === "GK") a.aerial += (h - 188) * 0.12;
  a.pace -= Math.max(0, age - 29) * 0.5;
  a.agility -= Math.max(0, age - 30) * 0.4;
  a.stamina -= Math.max(0, age - 31) * 0.4;
  for (const k of ["decisions", "composure", "positioning"]) a[k] += clamp((age - 23) * 0.15, -1, 1.2);
  if (age < 20) a.pace += 0.8;
  // traits của FotMob
  for (const [key, val] of Object.entries(p.traits?.items || {})) {
    const w = TRAIT_W[key];
    if (!w) continue;
    for (const [k, m] of Object.entries(w)) if (a[k] !== undefined && (pos === "GK") === ATTRS.goalkeeping.includes(k) || (pos === "GK" && ["positioning", "pace"].includes(k))) a[k] += (val - 0.5) * 2 * m;
  }
  // chuyền / rê bóng thật ở Premier League
  const s = p._pl && (plStatsBy.get(p._pl.id) || []).find((r) => r.season === "2025/26");
  if (s && s.passes >= 200 && PASS_AVG[pos]) a.passing += clamp((s.passesAcc / s.passes - PASS_AVG[pos]) * 40, -2, 2);
  if (s && s.dribblesTried >= 15 && DRIB_AVG[pos]) a.dribbling += clamp((s.dribbles / s.dribblesTried - DRIB_AVG[pos]) * 12, -2, 2);
  for (const k in a) a[k] = clamp(Math.round(a[k]), 1, 20);
  return a;
}

// sự nghiệp thật ở Premier League (premierleague.com): hs = [[mùa, CLB, giải, trận, bàn]], ls = mùa trước
function careerOf(p) {
  const rows = (p._pl && plStatsBy.get(p._pl.id)) || [];
  const past = rows.filter((r) => r.season !== "2026/27" && r.apps).sort((a, b) => a.season.localeCompare(b.season));
  const last = past.find((r) => r.season === "2025/26");
  return {
    hs: past.length ? past.map((r) => [r.season, r.club || "?", "PL", r.apps, r.goals]) : undefined,
    ls: last ? { apps: last.apps, goals: last.goals } : null,
  };
}

// ---------- Ghép lại ----------
const out = {};
for (const p of players) {
  const q = squadOf.get(p.id);
  const club = clubById.get(q.clubId);
  const tier = TIER[club.league] ?? 0;
  const rnd = rngFor("attr:" + p.id);
  const age = ageOf(p);
  const pos = p.pos || "CM";
  const caV = ca[p.id];
  // tiềm năng: cầu thủ trẻ có giá cao thì trần cao
  const head = age <= 18 ? rnd.range(14, 26) : age <= 20 ? rnd.range(9, 20) : age <= 22 ? rnd.range(5, 13) : age <= 24 ? rnd.range(2, 7) : age <= 27 ? rnd.range(0, 3) : 0;
  const valueHint = p.value ? fromValue(p.value) + 2 : 0;
  const paV = Math.min(96, Math.round(Math.max(caV + head, age <= 23 ? valueHint : 0)));
  const fam = { [pos]: 20 };
  for (const [k, n] of Object.entries(p.posApps || {})) if (k !== pos) fam[k] = clamp(Math.round(10 + Math.log2(n + 1) * 2), 10, 18);
  for (const k of p.alt || []) if (k !== pos && !fam[k]) fam[k] = 12;
  const r = rnd();
  const leftSide = /^L/.test(pos);
  const foot = p.foot || (leftSide ? (r < 0.75 ? "left" : r < 0.9 ? "right" : "both") : r < 0.75 ? "right" : r < 0.94 ? "left" : "both");
  const ce = p.contractEnd && p.contractEnd > TODAY ? `${p.contractEnd.slice(0, 4)}-06-30` : `${YEAR + (age <= 21 ? rnd.int(2, 4) : rnd.int(1, 3))}-06-30`;
  // lương: £/tuần theo năng lực × mức chi của hạng đấu (đội châu Âu: theo giá trị đội hình)
  const pay = tier ? PAY[tier] : club._pay;
  const weekly = 500 * Math.exp((caV - 50) * 0.13) * (pay || 1.8);
  out[p.id] = {
    ca: caV,
    pa: paV,
    position: pos,
    positions: fam,
    foot,
    attributes: attributes(p, pos, caV, rnd),
    hidden: { consistency: rnd.int(6, 18), injuryProneness: rnd.int(3, 15), professionalism: rnd.int(6, 18) },
    wage: Math.max(5, Math.round(gbpWeekToTrMonth(weekly))), // triệu VND / tháng (nội bộ)
    value: round1(eurToTy(p.value || 0.4 * 10 ** ((caV + 12.6) / 12.8))), // tỷ VND (nội bộ)
    contractEnd: ce,
    estimated: why[p.id].estimated || undefined,
    weight: p._pl?.weight || null,
    ...careerOf(p),
  };
}
// mức chi của đội châu Âu theo giá trị đội hình (tính sau khi biết cầu thủ thuộc đội nào)
for (const c of clubs) {
  if (TIER[c.league]) continue;
  const vals = squads.filter((q) => q.clubId === c.id).map((q) => players.find((p) => p.id === q.playerId)?.value || 0);
  const med = median(vals);
  c._pay = med > 15e6 ? 2.2 : med > 4e6 ? 1.6 : 1;
  for (const q of squads.filter((x) => x.clubId === c.id)) {
    const o = out[q.playerId];
    o.wage = Math.max(5, Math.round(gbpWeekToTrMonth(500 * Math.exp((o.ca - 50) * 0.13) * c._pay)));
  }
}

const clubOut = {};
for (const c of clubs) {
  const ids = squads.filter((q) => q.clubId === c.id).map((q) => q.playerId);
  const top = ids.map((id) => out[id].ca).sort((a, b) => b - a).slice(0, 11);
  const total = ids.reduce((a, id) => a + (players.find((p) => p.id === id).value || 0), 0);
  const rep = Math.round(clamp(95 - 25 * (9.08 - Math.log10(Math.max(total, 1e6))), 25, 98));
  const wageBill = ids.reduce((a, id) => a + out[id].wage, 0);
  const tier = TIER[c.league] ?? 0;
  clubOut[c.id] = {
    reputation: rep,
    strength: round1(top.reduce((a, b) => a + b, 0) / top.length),
    squadValue: round1(eurToTy(total)), // tỷ VND
    transferBudget: round1(eurToTy(total) * (tier === 1 ? 0.15 : 0.08)),
    wageBudget: Math.round(wageBill * 1.08),
  };
}
await writeFile(
  join(dir, "ratings.json"),
  JSON.stringify({ meta: { model: `${COUNTRY}-1`, generatedAt: new Date().toISOString(), scale: { ca: "1-100 (thang chung với V.League đã quy đổi)", attributes: "1-20", wage: "triệu VND/tháng (giao diện: £/tuần)", value: "tỷ VND (giao diện: £)" }, money: { vndPerGbp: VND_PER_GBP, eurGbp: EUR_GBP } }, clubs: clubOut, players: out }, null, 1) + "\n",
);

// ---------- Báo cáo ----------
const LGS = [...Object.keys(TIER), ...(clubs.some((c) => !c.league) ? [null] : [])];
const gbp = (ty) => (ty * 1e9) / VND_PER_GBP;
const fmt = (g) => (g >= 1e6 ? `£${(g / 1e6).toFixed(1)}m` : `£${Math.round(g / 1e3)}k`);
for (const lg of LGS) {
  const ids = squads.filter((q) => (clubById.get(q.clubId).league ?? null) === lg).map((q) => q.playerId);
  const cas = ids.map((id) => out[id].ca).sort((a, b) => a - b);
  const wk = ids.map((id) => (out[id].wage * 1e6 * 12) / 52 / VND_PER_GBP).sort((a, b) => a - b);
  console.log(`\n${lg || "Champions League (ngoài Anh)"}: ${ids.length} cầu thủ, CA ${cas[0]} · trung vị ${cas[cas.length >> 1]} · max ${cas.at(-1)} · lương trung vị ${fmt(wk[wk.length >> 1])}/tuần`);
  console.log(
    "  top 10: " +
      ids
        .sort((a, b) => out[b].ca - out[a].ca)
        .slice(0, 10)
        .map((id) => `${players.find((p) => p.id === id).name} ${out[id].ca}/${out[id].pa} ${out[id].position}`)
        .join(", "),
  );
  if (lg) {
    const cl = clubs.filter((c) => c.league === lg).sort((a, b) => clubOut[b.id].strength - clubOut[a.id].strength);
    console.log("  sức mạnh: " + cl.map((c) => `${c.shortName || c.name} ${clubOut[c.id].strength}/${clubOut[c.id].reputation}`).join(", "));
  }
}
const est = Object.values(out).filter((o) => o.estimated).length;
const matched = players.filter((p) => p._pl).length;
console.log(`\nƯớc lượng (không có giá trị): ${est}. Ghép được số liệu premierleague.com: ${matched}. Đã ghi ${join(dir, "ratings.json")}`);
