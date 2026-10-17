#!/usr/bin/env node
/**
 * Lấy dữ liệu một quốc gia từ JSON công khai của fotmob.com (không cần key):
 * - en: Premier League, Championship, League One, League Two + các đội dự Champions League;
 * - es: LaLiga, LaLiga 2 + Copa del Rey (cặp đấu vòng 1 thật, các CLB hạng dưới) và Supercopa.
 * - giải: bảng xếp hạng mùa này và mùa trước, danh sách CLB;
 * - CLB: tên, mã, sân + sức chứa, HLV, đội hình (số áo, vị trí, quốc tịch, chiều cao, ngày sinh,
 *   giá trị chuyển nhượng ước tính, điểm FotMob mùa này);
 * - cầu thủ (4 hạng Anh): chân thuận, hạn hợp đồng, vị trí chính + phụ (số trận ở mỗi vị trí),
 *   chỉ số mùa giải gần nhất (trận, đá chính, phút, bàn, kiến tạo, điểm), "traits" (phân vị so với
 *   cầu thủ cùng vị trí), lịch sử CLB (số trận / bàn mỗi giai đoạn), lịch sử giá trị.
 * Đội Champions League ngoài nước Anh chỉ lấy đội hình (không tải trang từng cầu thủ).
 *
 *   node scripts/import-fotmob.mjs                → data/en-snapshots/YYYY-MM-DD/*.json
 *   node scripts/import-fotmob.mjs --country=es   → data/es-snapshots/YYYY-MM-DD/*.json
 *   node scripts/import-fotmob.mjs --refresh      → bỏ bộ đệm
 *
 * Bộ đệm ở data/fotmob-cache/ (bỏ qua trong Git), nghỉ 350 ms giữa các lần tải.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(root, "data", "fotmob-cache");
const args = new Set(process.argv.slice(2));
const API = "https://www.fotmob.com/api/data";
const SEASON = { label: "2026/27", fotmob: "2026/2027", year: 2026 };
const PREV = { label: "2025/26", fotmob: "2025/2026" };
const COUNTRY = ([...args].find((a) => a.startsWith("--country=")) || "--country=en").slice(10);
const CONFIG = {
  en: {
    dir: "en-snapshots",
    name: "Anh",
    ucl: true,
    leagues: [
      { id: "england-premier-league", fotmob: 47, name: "Premier League", tier: 1 },
      { id: "england-championship", fotmob: 48, name: "Championship", tier: 2 },
      { id: "england-league-one", fotmob: 108, name: "League One", tier: 3 },
      { id: "england-league-two", fotmob: 109, name: "League Two", tier: 4 },
    ],
  },
  es: {
    dir: "es-snapshots",
    name: "Tây Ban Nha",
    leagues: [
      { id: "spain-la-liga", fotmob: 87, name: "LaLiga", tier: 1 },
      { id: "spain-la-liga-2", fotmob: 140, name: "LaLiga 2", tier: 2 },
    ],
    copa: 138,
    supercopa: 139,
  },
}[COUNTRY];
if (!CONFIG) throw new Error(`Không có cấu hình cho quốc gia ${COUNTRY}`);
const LEAGUES = CONFIG.leagues;
const UCL = { id: "uefa-champions-league", fotmob: 42, name: "UEFA Champions League" };
const DELAY = 350;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
  const file = join(CACHE, path.replace(/[^a-z0-9]+/gi, "_").slice(0, 180) + ".json");
  if (!args.has("--refresh")) {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch {}
  }
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(API + path, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      await writeFile(file, JSON.stringify(json));
      await sleep(DELAY);
      return json;
    } catch (e) {
      if (attempt >= 4) throw new Error(`${path}: ${e.message}`);
      await sleep(1500 * attempt);
    }
  }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        await fn(items[k], k);
      }
    }),
  );
}
const slug = (s) =>
  s
    .replace(/&/g, " and ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/g, "o")
    .replace(/ß/g, "ss")
    .replace(/[łŁ]/g, "l")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const NAT = {
  England: "Anh", Scotland: "Scotland", Wales: "Xứ Wales", "Northern Ireland": "Bắc Ireland", Ireland: "Ireland", France: "Pháp", Spain: "Tây Ban Nha", Portugal: "Bồ Đào Nha",
  Germany: "Đức", Italy: "Ý", Netherlands: "Hà Lan", Belgium: "Bỉ", USA: "Mỹ", "United States": "Mỹ", Denmark: "Đan Mạch", Norway: "Na Uy", Sweden: "Thụy Điển", Finland: "Phần Lan",
  Switzerland: "Thụy Sĩ", Austria: "Áo", Poland: "Ba Lan", Czechia: "Séc", "Czech Republic": "Séc", Greece: "Hy Lạp", Turkey: "Thổ Nhĩ Kỳ", Türkiye: "Thổ Nhĩ Kỳ", Turkiye: "Thổ Nhĩ Kỳ",
  "Ivory Coast": "Bờ Biển Ngà", "Côte d'Ivoire": "Bờ Biển Ngà", Morocco: "Maroc", Egypt: "Ai Cập", "DR Congo": "CHDC Congo", "South Africa": "Nam Phi", Japan: "Nhật Bản", "South Korea": "Hàn Quốc",
  Australia: "Úc", "Saudi Arabia": "Ả Rập Xê Út", Algeria: "Algeria", Cameroon: "Cameroon", "Cape Verde": "Cabo Verde", "Equatorial Guinea": "Guinea Xích Đạo",
  "Dominican Republic": "CH Dominica", Venezuela: "Venezuela", Mexico: "Mexico", Croatia: "Croatia", Serbia: "Serbia", Slovenia: "Slovenia", Georgia: "Georgia", Ukraine: "Ukraina",
  Hungary: "Hungary", Romania: "Romania", Iceland: "Iceland", "New Zealand": "New Zealand", Canada: "Canada", Jamaica: "Jamaica", "Guinea-Bissau": "Guinea-Bissau", "Bosnia and Herzegovina": "Bosnia", "Bosnia & Herzegovina": "Bosnia", Vietnam: "Việt Nam", China: "Trung Quốc", Russia: "Nga",
};
const natVi = (n) => (n ? NAT[n] || n : null);
// mã vị trí FotMob → mã trong game
const POS = { GK: "GK", CB: "CB", LB: "LB", RB: "RB", LWB: "LB", RWB: "RB", DM: "DM", CDM: "DM", CM: "CM", AM: "AM", CAM: "AM", LM: "LM", RM: "RM", LW: "LW", RW: "RW", ST: "ST", CF: "ST" };
// ngày: chuỗi ISO hoặc { utcTime }
const ds = (v) => (typeof v === "string" ? v.slice(0, 10) : v && typeof v.utcTime === "string" ? v.utcTime.slice(0, 10) : null);
const posCode = (s) => POS[(s || "").toUpperCase()] || null;
const GROUP_POS = { keepers: "GK", defenders: "CB", midfielders: "CM", attackers: "ST" };

await mkdir(CACHE, { recursive: true });
const day = new Date().toISOString().slice(0, 10);
const OUT = join(root, "data", CONFIG.dir, day);
await mkdir(OUT, { recursive: true });

const leagues = [];
const clubs = [];
const players = new Map();
const squads = [];
const standings = [];
const stats = [];
const tableOf = (j) => {
  const d = j.table?.[0]?.data;
  return d?.table?.all || d?.tables?.[0]?.table?.all || [];
};
const enc = encodeURIComponent;

async function importTeam(teamId, leagueId, deep) {
  const t = await get(`/teams?id=${teamId}`);
  const d = t.details;
  const id = slug(d.name);
  const venue = t.overview?.venue;
  const cap = venue?.statPairs?.find((x) => x[0] === "Capacity")?.[1] || null;
  // FotMob không có danh sách đội (vd. Sabah FK): lấy cầu thủ từ đội hình các trận Champions League đã đá
  if (!t.squad?.squad) t.squad = { squad: await squadFromLineups(teamId) };
  const coach = (t.squad?.squad || []).find((g) => g.title === "coach")?.members?.[0];
  clubs.push({ id, fotmob: teamId, name: d.name, shortName: d.shortName, country: d.country, league: leagueId, venue: venue?.widget?.name || null, city: venue?.widget?.city || null, capacity: cap, coach: coach?.name || null, color: d.teamColor || null });
  for (const g of t.squad?.squad || []) {
    if (g.title === "coach") continue;
    for (const m of g.members || []) {
      let key = slug(m.name);
      if (players.has(key) && players.get(key).fotmob !== m.id) key = `${key}-${m.id}`;
      const pos = (m.positionIdsDesc || "").split(",").map((x) => posCode(x.trim())).filter(Boolean);
      players.set(key, { id: key, fotmob: m.id, name: m.name, birthDate: m.dateOfBirth || null, nationality: natVi(m.cname), nationalityEn: m.cname || null, height: m.height || null, value: m.transferValue || null, pos: pos[0] || GROUP_POS[g.title] || null, alt: pos.slice(1), injury: m.injury ? m.injury.expectedReturn || "yes" : null });
      squads.push({ clubId: id, playerId: key, number: m.shirtNumber ?? null, ratingNow: m.rating ?? null, goalsNow: m.goals ?? 0, assistsNow: m.assists ?? 0, deep });
    }
  }
  return id;
}

async function squadFromLineups(teamId) {
  const lg = await get(`/leagues?id=${UCL.fotmob}`);
  const done = (lg.fixtures?.allMatches || []).filter((m) => m.status?.finished && (+m.home.id === +teamId || +m.away.id === +teamId));
  const seen = new Map();
  let coach = null;
  for (const m of done) {
    const md = await get(`/matchDetails?matchId=${m.id}`);
    const side = [md.content?.lineup?.homeTeam, md.content?.lineup?.awayTeam].find((x) => x && +x.id === +teamId);
    if (!side) continue;
    coach ||= side.coach;
    for (const x of [...(side.starters || []), ...(side.subs || [])]) if (!seen.has(x.id)) seen.set(x.id, x);
  }
  const members = [];
  for (const x of seen.values()) {
    const pd = await get(`/playerData?id=${x.id}`);
    const info = Object.fromEntries((pd.playerInformation || []).map((i) => [i.title, i.value]));
    const pos = (pd.positionDescription?.positions || []).sort((a, b) => b.isMainPosition - a.isMainPosition).map((q) => q.strPosShort?.label).filter(Boolean);
    members.push({ id: x.id, name: x.name, dateOfBirth: ds(pd.birthDate), cname: x.countryName, height: info.Height?.numberValue || null, transferValue: x.marketValue || info["Market value"]?.numberValue || null, positionIdsDesc: pos.join(","), shirtNumber: +x.shirtNumber || null });
  }
  return [...(coach ? [{ title: "coach", members: [{ name: coach.name }] }] : []), { title: "players", members }];
}

for (const L of LEAGUES) {
  const now = await get(`/leagues?id=${L.fotmob}`);
  const prev = await get(`/leagues?id=${L.fotmob}&season=${enc(PREV.fotmob)}`);
  leagues.push({ id: L.id, name: L.name, tier: L.tier, country: CONFIG.name, fotmob: L.fotmob });
  for (const [season, j] of [[SEASON.label, now], [PREV.label, prev]])
    tableOf(j).forEach((r, i) => standings.push({ season, leagueId: L.id, rank: r.idx ?? i + 1, club: r.name, fotmob: r.id, played: r.played, won: r.wins, drawn: r.draws, lost: r.losses, goals: r.scoresStr, points: r.pts }));
  const teams = tableOf(now);
  for (const r of teams) await importTeam(r.id, L.id, true);
  console.log(`${L.name}: ${teams.length} CLB`);
}

// Champions League: đội ngoài nước Anh (đội Anh đã có)
const uclTeams = [];
let uclSchedule = [];
if (CONFIG.ucl) {
const ucl = await get(`/leagues?id=${UCL.fotmob}`);
for (const r of tableOf(ucl)) uclTeams.push({ fotmob: r.id, name: r.name });
leagues.push({ id: UCL.id, name: UCL.name, tier: 0, country: "Châu Âu", fotmob: UCL.fotmob });
for (const r of uclTeams) {
  const known = clubs.find((c) => c.fotmob === r.fotmob);
  r.clubId = known ? known.id : await importTeam(r.fotmob, null, false);
}
// lịch vòng phân hạng thật: [{ md, h, a, d }] theo id CLB
uclSchedule = (ucl.fixtures?.allMatches || []).map((m) => ({ md: +m.round, h: uclTeams.find((t) => +t.fotmob === +m.home.id)?.clubId, a: uclTeams.find((t) => +t.fotmob === +m.away.id)?.clubId, d: ds(m.status.utcTime) }));
console.log(`Champions League: ${uclTeams.length} đội (${uclTeams.filter((r) => !clubs.find((c) => c.fotmob === r.fotmob)?.league).length} ngoài nước Anh)`);
}

// Cúp Tây Ban Nha: cặp đấu thật vòng 1 Copa del Rey mùa này, chung kết mùa trước, Supercopa;
// CLB hạng dưới (không thuộc 2 giải) chỉ lấy tên, hạng đấu, sân, sức chứa, màu áo
let cups = null;
if (CONFIG.copa) {
  const idOf = new Map(clubs.map((c) => [+c.fotmob, c.id]));
  const guests = new Map();
  const ref = async (team) => {
    if (idOf.has(+team.id)) return idOf.get(+team.id);
    const gid = `g-${slug(team.name)}`;
    if (!guests.has(+team.id)) {
      const t = await get(`/teams?id=${team.id}`);
      const v = t.overview?.venue;
      guests.set(+team.id, { id: gid, fotmob: +team.id, name: t.details?.name || team.name, level: t.details?.primaryLeagueName || null, venue: v?.widget?.name || null, city: v?.widget?.city || null, capacity: v?.statPairs?.find((x) => x[0] === "Capacity")?.[1] || null, color: t.details?.teamColor || null });
    }
    return gid;
  };
  const matchesOf = (j) => j.fixtures?.allMatches || [];
  const copaNow = await get(`/leagues?id=${CONFIG.copa}`);
  const copaPrev = await get(`/leagues?id=${CONFIG.copa}&season=${enc(PREV.fotmob)}`);
  const sc = await get(`/leagues?id=${CONFIG.supercopa}`);
  const r1 = [];
  for (const m of matchesOf(copaNow)) r1.push({ h: await ref(m.home), a: await ref(m.away), d: ds(m.status.utcTime) });
  // vòng / ngày thật mùa trước (để xếp lịch các vòng sau)
  const rounds = {};
  for (const m of matchesOf(copaPrev)) (rounds[m.roundName || m.round] ||= []).push(ds(m.status.utcTime));
  const fin = matchesOf(copaPrev).find((m) => /final/i.test(m.roundName || "") && !/semi|quarter/i.test(m.roundName || ""));
  const prevFinal = fin ? { h: idOf.get(+fin.home.id) || fin.home.name, a: idOf.get(+fin.away.id) || fin.away.name, score: fin.status?.scoreStr || null, pens: fin.status?.reason?.penalties || null, winner: fin.home.winner ? idOf.get(+fin.home.id) : fin.away.winner ? idOf.get(+fin.away.id) : null } : null;
  const supercopa = matchesOf(sc).map((m) => ({ round: m.roundName || m.round, h: idOf.get(+m.home.id) || null, a: idOf.get(+m.away.id) || null, d: ds(m.status.utcTime) }));
  cups = { copa: { r1, prevRounds: Object.fromEntries(Object.entries(rounds).map(([k, v]) => [k, [...new Set(v)].sort()])), prevFinal }, supercopa, guests: [...guests.values()] };
  console.log(`Copa del Rey: vòng 1 ${r1.length} cặp, ${guests.size} CLB hạng dưới · Supercopa: ${supercopa.length} trận`);
}

// trang chi tiết từng cầu thủ của các giải
const deep = [...new Set(squads.filter((q) => q.deep).map((q) => q.playerId))].map((id) => players.get(id));
let done = 0;
await pool(deep, 3, async (p) => {
  let j;
  try {
    j = await get(`/playerData?id=${p.fotmob}`);
  } catch (e) {
    console.log(`  bỏ qua ${p.name}: ${e.message}`);
    return;
  }
  try {
    parsePlayer(p, j);
  } catch (e) {
    console.log(`  lỗi đọc ${p.name}: ${e.message}`);
  }
  if (++done % 100 === 0) console.log(`  cầu thủ: ${done}/${deep.length}`);
});
function parsePlayer(p, j) {
  const info = Object.fromEntries((j.playerInformation || []).map((x) => [x.title, x.value]));
  p.foot = info["Preferred foot"]?.key || null;
  p.height ||= info.Height?.numberValue || null;
  p.contractEnd = ds(j.contractEnd);
  const ps = j.positionDescription?.positions || [];
  const main = ps.find((x) => x.isMainPosition);
  if (main && posCode(main.strPosShort?.label)) p.pos = posCode(main.strPosShort.label);
  p.posApps = Object.fromEntries(ps.map((x) => [posCode(x.strPosShort?.label), x.occurences]).filter((x) => x[0]));
  p.alt = [...new Set([...Object.keys(p.posApps).filter((k) => k !== p.pos), ...(p.alt || [])])];
  p.traits = j.traits && Array.isArray(j.traits.items) ? { group: j.traits.key, items: Object.fromEntries(j.traits.items.map((x) => [x.key, x.value])) } : null;
  if (j.mainLeague && Array.isArray(j.mainLeague.stats)) {
    const s = Object.fromEntries(j.mainLeague.stats.map((x) => [x.localizedTitleId, x.value]));
    stats.push({ playerId: p.id, season: j.mainLeague.season.replace(/(\d{4})\/(\d{2})(\d{2})/, "$1/$3"), league: j.mainLeague.leagueName, leagueFotmob: j.mainLeague.leagueId, apps: s.matches_uppercase ?? 0, starts: s.started ?? 0, mins: s.minutes_played ?? 0, goals: s.goals ?? 0, assists: s.assists ?? 0, rating: s.rating ?? null, cleanSheets: s.clean_sheet_team_title ?? s.clean_sheets ?? null, yellow: s.yellow_cards ?? 0, red: s.red_cards ?? 0 });
  }
  p.career = (j.careerHistory?.careerItems?.senior?.teamEntries || []).slice(0, 8).map((e) => ({ team: e.team, from: ds(e.startDate), to: ds(e.endDate), apps: +e.appearances || 0, goals: +e.goals || 0, loan: /loan/i.test(e.transferType?.text || "") }));
  const mv = j.marketValues?.values || [];
  if (mv.length) p.valueHistory = mv.slice(-4).map((v) => [ds(v.date), v.value]);
}

const meta = { source: "fotmob.com", importedAt: new Date().toISOString(), season: SEASON.year, seasonLabel: SEASON.label, previous: PREV.label, currency: "EUR (giá trị chuyển nhượng ước tính của FotMob)", leagues: leagues.map((l) => l.id) };
const write = (name, data) => writeFile(join(OUT, `${name}.json`), JSON.stringify(data, null, 1) + "\n");
await Promise.all([write("meta", meta), write("leagues", leagues), write("clubs", clubs), write("players", [...players.values()]), write("squads", squads), write("standings", standings), write("stats", stats), ...(CONFIG.ucl ? [write("ucl", uclTeams), write("ucl-schedule", uclSchedule)] : []), ...(cups ? [write("cups", cups)] : [])]);
console.log(`\nXong → data/${CONFIG.dir}/${day}: ${clubs.length} CLB, ${players.size} cầu thủ (${deep.length} cầu thủ có trang chi tiết), ${stats.length} dòng thống kê mùa gần nhất`);
