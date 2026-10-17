#!/usr/bin/env node
/**
 * Đóng gói dữ liệu cho game thành data/game-data.js (game mở bằng file:// nên không fetch JSON được →
 * dữ liệu là một file script gán vào window.FM_DATA). Một thế giới chung gồm hai quốc gia:
 * - Việt Nam: snapshot vpf.vn mới nhất + ratings.json (build-ratings.mjs). Chỉ số được quy về
 *   thang chung với nước Anh: ca' = 34 + (ca − 34) × 0,75 (thuộc tính, tiềm năng, uy tín theo cùng tỷ lệ).
 * - Anh: data/en-snapshots mới nhất (import-fotmob.mjs) + ratings.json (build-ratings-en.mjs):
 *   Premier League, Championship, League One, League Two; màu áo ở data/en-club-colors.json.
 * - Tây Ban Nha: data/es-snapshots mới nhất (import-fotmob.mjs --country=es) + ratings.json
 *   (build-ratings-en.mjs --country=es): LaLiga, LaLiga 2, Copa del Rey / Supercopa (cups.json);
 *   màu áo ở data/es-club-colors.json.
 * - Cúp châu Á: data/afc.json (afc-source.mjs).
 * - Champions League: 31 CLB ngoài nước Anh với cầu thủ thật (en-snapshots: ucl.json, ucl-schedule.json),
 *   để riêng trong FM_DATA.ucl — không thuộc giải nào, cầu thủ có id "ucl-…" và không chuyển nhượng được.
 * Tiền trong dữ liệu là đơn vị nội bộ (giá trị: tỷ VND, lương: triệu VND/tháng); giao diện quy ra £.
 *
 *   node scripts/build-game-data.mjs
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const latest = async (d) => join(d, (await readdir(d)).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort().pop());
const vnDir = await latest(join(root, "data", "snapshots"));
const enDir = await latest(join(root, "data", "en-snapshots"));
const loadFrom = (d) => async (n) => JSON.parse(await readFile(join(d, n + ".json"), "utf8"));
const readJson = async (...p) => JSON.parse(await readFile(join(root, ...p), "utf8"));
const [meta, clubs, players, squads, stats, ratings] = await Promise.all(["meta", "clubs", "players", "squads", "stats", "ratings"].map(loadFrom(vnDir)));
const [enClubs, enPlayers, enSquads, enRatings, uclTeams, uclSchedule] = await Promise.all(["clubs", "players", "squads", "ratings", "ucl", "ucl-schedule"].map(loadFrom(enDir)));
// Tây Ban Nha (khi đã chạy import-fotmob --country=es và build-ratings-en --country=es)
const esDir = await latest(join(root, "data", "es-snapshots")).catch(() => null);
const esSnap = esDir ? Object.fromEntries(await Promise.all(["clubs", "players", "squads", "ratings"].map(async (n) => [n, await loadFrom(esDir)(n)]))) : null;
const esCups = esDir ? await loadFrom(esDir)("cups").catch(() => null) : null;
const esColors = await readJson("data", "es-club-colors.json").catch(() => ({}));
const realColors = await readJson("data", "club-colors.json");
const enColors = await readJson("data", "en-club-colors.json");
const afc = await readJson("data", "afc.json");
const snapshot = vnDir.split(/[\\/]/).pop();

// thứ tự thuộc tính trong mảng a[] của mỗi cầu thủ
const ATTRS = Object.keys(Object.values(ratings.players)[0].attributes);
const V1 = "vietnam-v-league-1";
const V2 = "vietnam-v-league-2";
const LEAGUES = [
  { id: V1, name: "V.League 1", short: "V1", country: "vn", tier: 1 },
  { id: V2, name: "V.League 2", short: "V2", country: "vn", tier: 2 },
  { id: "england-premier-league", name: "Premier League", short: "PL", country: "en", tier: 1 },
  { id: "england-championship", name: "Championship", short: "CH", country: "en", tier: 2 },
  { id: "england-league-one", name: "League One", short: "L1", country: "en", tier: 3 },
  { id: "england-league-two", name: "League Two", short: "L2", country: "en", tier: 4 },
  { id: "spain-la-liga", name: "LaLiga", short: "LL", country: "es", tier: 1 },
  { id: "spain-la-liga-2", name: "LaLiga 2", short: "LL2", country: "es", tier: 2 },
];
// nat: quốc tịch mặc định của cầu thủ sinh ra; lower: hạng đấu ngay dưới hệ thống giải trong game
const COUNTRIES = {
  en: { name: "Anh", flag: "🏴", currency: "GBP", nat: "Anh", lower: "National League" },
  es: { name: "Tây Ban Nha", flag: "🇪🇸", currency: "EUR", nat: "Tây Ban Nha", lower: "Primera Federación" },
  vn: { name: "Việt Nam", flag: "🇻🇳", currency: "VND", nat: "Việt Nam", lower: "Hạng Nhì" },
};

const VI_LETTERS = /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i;
// tên ngắn hiển thị: người Việt lấy 2 chữ cuối ("Quang Hải"), người nước ngoài giữ tên nếu ngắn
function shortName(p) {
  const words = p.name.split(/\s+/);
  if (VI_LETTERS.test(p.name) || p.nationality === "Việt Nam") return words.length > 2 ? words.slice(-2).join(" ") : p.name;
  return p.name.length <= 16 ? p.name : words.slice(0, 2).join(" ");
}
// cầu thủ Anh / châu Âu: thường gọi bằng họ ("Saka", "Haaland"); tên một chữ giữ nguyên
function shortNameEn(name) {
  const w = name.split(/\s+/);
  if (w.length === 1) return name;
  const last = w.slice(-1)[0];
  const particle = w.length >= 3 && /^(de|da|van|von|di|dos|del|le|la|al|el|ten|ter)$/i.test(w.at(-2));
  return particle ? w.slice(-2).join(" ") : last.length <= 2 ? w.slice(-2).join(" ") : last;
}
function colors(code) {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.codePointAt(0)) % 360;
  return [`hsl(${h},62%,42%)`, `hsl(${(h + 180) % 360},70%,92%)`];
}

// ---------- Việt Nam ----------
// quy về thang chung với nước Anh
const vnScale = (v) => Math.round(34 + (v - 34) * 0.75);
const vnRep = (r) => Math.round(25 + (r - 25) * 0.75);
const realHistory = {};
for (const s of stats) {
  if (s.season === meta.seasonLabel || !s.apps) continue;
  (realHistory[s.playerId] ||= []).push([s.season, s.club, s.leagueId === V1 ? "V1" : "V2", s.apps, s.goals]);
}
for (const rows of Object.values(realHistory)) rows.sort((a, b) => a[0].localeCompare(b[0]));
const lastSeason = {};
for (const s of stats) {
  if (s.season !== "2025/26" || !s.apps) continue;
  const o = (lastSeason[s.playerId] ||= { apps: 0, goals: 0 });
  o.apps += s.apps;
  o.goals += s.goals;
}
const vnPlayers = squads.map((s) => {
  const p = players.find((x) => x.id === s.playerId);
  const r = ratings.players[s.playerId];
  const ca = vnScale(r.ca);
  const k = ca / r.ca;
  return {
    id: p.id,
    n: p.name,
    sn: shortName(p),
    c: s.clubId,
    no: s.number,
    pos: r.position,
    alt: r.positions,
    by: p.birthYear,
    bd: p.birthDate || null,
    nat: p.nationality || "?",
    h: p.height,
    w: p.weight,
    ca,
    pa: Math.max(ca, vnScale(r.pa)),
    ft: r.foot,
    // thuộc tính tỉ lệ với năng lực (thủ môn / cầu thủ giữ nguyên các chỉ số "không phải nghề" 1–4)
    a: ATTRS.map((key) => (r.attributes[key] <= 4 ? r.attributes[key] : Math.max(1, Math.min(20, Math.round(r.attributes[key] * k))))),
    hid: [r.hidden.consistency, r.hidden.injuryProneness, r.hidden.professionalism],
    fs: r.foreignSlot ? 1 : 0,
    vk: r.vietHeritage ? 1 : 0,
    nt: r.nationalTeam,
    wage: r.wage,
    val: r.value,
    ce: r.contractEnd,
    ls: lastSeason[p.id] || null,
    hs: realHistory[p.id] || undefined,
  };
});
const strengthOf = (list) => {
  const top = list.map((p) => p.ca).sort((a, b) => b - a).slice(0, 11);
  return Math.round((top.reduce((a, b) => a + b, 0) / Math.max(1, top.length)) * 10) / 10;
};
const vnClubs = clubs.map((c) => {
  const r = ratings.clubs[c.id];
  return {
    id: c.id,
    name: c.name,
    code: c.code,
    league: c.leagueId,
    country: "vn",
    coach: c.coach,
    venue: c.venue?.name || null,
    capacity: c.venue?.capacity || 5000,
    rep: vnRep(r.reputation),
    strength: strengthOf(vnPlayers.filter((p) => p.c === c.id)),
    budget: r.transferBudget,
    wageBudget: r.wageBudget,
    colors: realColors[c.id]?.colors || colors(c.code || c.id),
  };
});

// ---------- Châu Âu (FotMob): Anh, Tây Ban Nha ----------
const usedIds = new Set(vnPlayers.map((p) => p.id));
const playerOut = (p, q, r, id, ucl) => ({
  id,
  n: p.name,
  sn: shortNameEn(p.name),
  c: q.clubId,
  no: q.number,
  pos: r.position,
  alt: r.positions,
  by: p.birthDate ? +p.birthDate.slice(0, 4) : 2000,
  bd: p.birthDate || null,
  nat: p.nationality || "?",
  h: p.height || null,
  w: r.weight || null,
  ca: r.ca,
  pa: r.pa,
  ft: r.foot,
  a: ATTRS.map((key) => r.attributes[key]),
  hid: [r.hidden.consistency, r.hidden.injuryProneness, r.hidden.professionalism],
  fs: ucl ? 0 : p.nationality === "Việt Nam" ? 0 : 1, // chỉ có ý nghĩa nếu sang V.League (luật ngoại binh)
  vk: 0,
  nt: null,
  wage: r.wage,
  val: r.value,
  ce: r.contractEnd,
  ls: r.ls || null,
  hs: r.hs,
});
// đội B (đội dự bị): không được lên cùng hạng với đội một, không dự cúp quốc gia
const B_PARENT = { "celta-fortuna": "celta-vigo" };
const parentOf = (c, ids) => B_PARENT[c.id] || (/ B$/.test(c.name) && ids.has(c.id.replace(/-b$/, "")) ? c.id.replace(/-b$/, "") : null);
// snap: { clubs, players, squads, ratings } → { clubs, players } của các CLB thuộc giải
function euroCountry(cc, snap, colorMap) {
  const squadOf = new Map(snap.squads.map((q) => [q.playerId, q]));
  const lgClubs = snap.clubs.filter((c) => c.league);
  const ids = new Set(lgClubs.map((c) => c.id));
  const players = [];
  for (const p of snap.players) {
    const q = squadOf.get(p.id);
    if (!q || !ids.has(q.clubId)) continue;
    const r = snap.ratings.players[p.id];
    if (!r) continue;
    const id = usedIds.has(p.id) ? `${cc}-${p.id}` : p.id;
    usedIds.add(id);
    players.push(playerOut(p, q, r, id, false));
  }
  const clubsOut = lgClubs.map((c) => {
    const r = snap.ratings.clubs[c.id];
    const col = colorMap[c.id];
    return {
      id: c.id,
      name: c.name,
      code: col?.code || c.name.replace(/[^A-Z]/g, "").slice(0, 3) || c.name.slice(0, 3).toUpperCase(),
      league: c.league,
      country: cc,
      coach: c.coach || "—",
      venue: c.venue || null,
      capacity: c.capacity || 10000,
      rep: r.reputation,
      strength: r.strength,
      budget: r.transferBudget,
      wageBudget: r.wageBudget,
      colors: col?.colors || (c.color ? [c.color, "#ffffff"] : colors(c.name)),
      ...(parentOf(c, ids) ? { parent: parentOf(c, ids) } : {}),
    };
  });
  return { clubs: clubsOut, players };
}
const en = euroCountry("en", { clubs: enClubs, players: enPlayers, squads: enSquads, ratings: enRatings }, enColors);
const es = esSnap ? euroCountry("es", esSnap, esColors) : { clubs: [], players: [] };
const leagueClubIds = new Set([...en.clubs, ...es.clubs].map((c) => c.id));

// Champions League: CLB không thuộc giải nào trong game (quốc gia ghi bằng tiếng Việt)
const enSquadOf = new Map(enSquads.map((q) => [q.playerId, q]));
const uclForeign = new Set(uclTeams.map((t) => t.clubId).filter((id) => !leagueClubIds.has(id)));
const uclOut = [];
for (const p of enPlayers) {
  const q = enSquadOf.get(p.id);
  if (!q || !uclForeign.has(q.clubId)) continue;
  const r = enRatings.players[p.id];
  if (!r) continue;
  uclOut.push(playerOut(p, q, r, `ucl-${p.id}`, true));
}
const COUNTRY_VI = { FRA: "Pháp", ESP: "Tây Ban Nha", GER: "Đức", POR: "Bồ Đào Nha", UKR: "Ukraina", ITA: "Ý", BEL: "Bỉ", GRE: "Hy Lạp", AZE: "Azerbaijan", NED: "Hà Lan", NOR: "Na Uy", TUR: "Thổ Nhĩ Kỳ", CZE: "Séc", AUT: "Áo", SVK: "Slovakia", ENG: "Anh" };
const uclClubs = enClubs
  .filter((c) => uclForeign.has(c.id))
  .map((c) => {
    const r = enRatings.clubs[c.id];
    const col = enColors[c.id];
    return {
      id: c.id,
      name: c.name,
      code: col?.code || c.name.replace(/[^A-Z]/g, "").slice(0, 3),
      country: COUNTRY_VI[c.country] || c.country,
      venue: c.venue || null,
      capacity: c.capacity || 30000,
      coach: c.coach || "—",
      rep: r.reputation,
      str: strengthOf(uclOut.filter((p) => p.c === c.id)),
      colors: col?.colors || colors(c.name),
      ucl: true,
    };
  });
const ucl = {
  season: meta.season,
  // thứ tự bảng FotMob lúc nhập (dùng làm thứ tự hạt giống mùa đầu)
  entrants: uclTeams.map((t) => t.clubId),
  schedule: uclSchedule.map((x) => [x.md, x.h, x.a, x.d]),
  clubs: uclClubs,
  players: uclOut,
};

const out = {
  meta: { snapshot, enSnapshot: enDir.split(/[\\/]/).pop(), esSnapshot: esDir ? esDir.split(/[\\/]/).pop() : null, season: meta.season, seasonLabel: meta.seasonLabel, source: `${meta.source} · premierleague.com · fotmob.com`, attrs: ATTRS },
  countries: COUNTRIES,
  leagues: LEAGUES.filter((l) => l.country !== "es" || es.clubs.length),
  clubs: [...vnClubs, ...en.clubs, ...es.clubs],
  players: [...vnPlayers, ...en.players, ...es.players],
  afc,
  ucl,
  cups: esCups ? { es: esCups } : {},
};
const js = `// Sinh tự động bởi scripts/build-game-data.mjs. Không sửa tay.\nwindow.FM_DATA = ${JSON.stringify(out)};\n`;
await writeFile(join(root, "data", "game-data.js"), js, "utf8");
const per = (country) => out.players.filter((p) => out.clubs.find((c) => c.id === p.c)?.country === country).length;
console.log(`Champions League: ${uclClubs.length} CLB ngoài các giải trong game, ${uclOut.length} cầu thủ, lịch ${ucl.schedule.length} trận vòng phân hạng`);
console.log(`data/game-data.js: ${out.clubs.length} CLB, ${out.players.length} cầu thủ (Việt Nam ${per("vn")}, Anh ${per("en")}, Tây Ban Nha ${per("es")}), ${(js.length / 1024).toFixed(0)} KB`);
const vnTop = vnClubs.filter((c) => c.league === V1).sort((a, b) => b.strength - a.strength).slice(0, 3);
console.log(`Việt Nam sau quy đổi: ${vnTop.map((c) => `${c.code} ${c.strength}`).join(", ")} · Anh: ${en.clubs.filter((c) => c.league === "england-premier-league").sort((a, b) => b.strength - a.strength).slice(0, 3).map((c) => `${c.code} ${c.strength}`).join(", ")} · Tây Ban Nha: ${es.clubs.filter((c) => c.league === "spain-la-liga").sort((a, b) => b.strength - a.strength).slice(0, 3).map((c) => `${c.code} ${c.strength}`).join(", ")}`);
