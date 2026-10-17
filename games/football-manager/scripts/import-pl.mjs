#!/usr/bin/env node
/**
 * Lấy dữ liệu Premier League từ API công khai mà premierleague.com dùng (footballapi.pulselive.com,
 * không cần key): 20 CLB mùa 2026/27, đội hình (vị trí chi tiết, số áo, quốc tịch, ngày sinh, chiều
 * cao, cân nặng, ngày gia nhập), HLV, sân, bảng xếp hạng 2024/25 – 2026/27 và thống kê từng cầu thủ
 * ở Premier League ba mùa đó (số trận, đá chính, phút, bàn, kiến tạo, giữ sạch lưới, chuyền, tắc
 * bóng, không chiến, rê bóng, cứu thua…). CLB của cầu thủ ở các mùa trước lấy từ đội hình mùa đó.
 *
 *   node scripts/import-pl.mjs            → data/pl-snapshots/YYYY-MM-DD/*.json
 *   node scripts/import-pl.mjs --refresh  → bỏ bộ đệm, tải lại hết
 *
 * Mỗi phản hồi được lưu ở data/pl-cache/ (bỏ qua trong Git) nên chạy lại / chạy tiếp rất nhanh.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(root, "data", "pl-cache");
const args = new Set(process.argv.slice(2));
const API = "https://footballapi.pulselive.com/football";
const SEASON = { id: 841, label: "2026/27", year: 2026 };
const HISTORY = [
  { id: 777, label: "2025/26" },
  { id: 719, label: "2024/25" },
];
const DELAY = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Tải có bộ đệm ----------
async function get(path) {
  const file = join(CACHE, path.replace(/[^a-z0-9]+/gi, "_").slice(0, 180) + ".json");
  if (!args.has("--refresh")) {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch {}
  }
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(API + path, { headers: { Origin: "https://www.premierleague.com", Referer: "https://www.premierleague.com/", "User-Agent": "Mozilla/5.0 GameVui importer" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      await writeFile(file, JSON.stringify(json));
      await sleep(DELAY);
      return json;
    } catch (e) {
      if (attempt >= 4) throw new Error(`${path}: ${e.message}`);
      await sleep(1000 * attempt);
    }
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    }),
  );
  return out;
}

// ---------- Tên / quốc tịch ----------
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
  England: "Anh", Scotland: "Scotland", Wales: "Xứ Wales", "Northern Ireland": "Bắc Ireland", Ireland: "Ireland", "Republic of Ireland": "Ireland",
  France: "Pháp", Spain: "Tây Ban Nha", Portugal: "Bồ Đào Nha", Germany: "Đức", Italy: "Ý", Netherlands: "Hà Lan", Belgium: "Bỉ", Brazil: "Brazil",
  Argentina: "Argentina", Uruguay: "Uruguay", Colombia: "Colombia", Ecuador: "Ecuador", Paraguay: "Paraguay", Chile: "Chile", Mexico: "Mexico", USA: "Mỹ", "United States": "Mỹ", Canada: "Canada", Jamaica: "Jamaica",
  Denmark: "Đan Mạch", Norway: "Na Uy", Sweden: "Thụy Điển", Finland: "Phần Lan", Iceland: "Iceland", Switzerland: "Thụy Sĩ", Austria: "Áo", Poland: "Ba Lan", "Czech Republic": "Séc", Czechia: "Séc", Slovakia: "Slovakia",
  Croatia: "Croatia", Serbia: "Serbia", Slovenia: "Slovenia", "Bosnia and Herzegovina": "Bosnia", Montenegro: "Montenegro", Albania: "Albania", Kosovo: "Kosovo", Greece: "Hy Lạp", Turkey: "Thổ Nhĩ Kỳ", Türkiye: "Thổ Nhĩ Kỳ", Ukraine: "Ukraine", Hungary: "Hungary", Romania: "Romania", Georgia: "Georgia",
  Nigeria: "Nigeria", Ghana: "Ghana", Senegal: "Senegal", "Ivory Coast": "Bờ Biển Ngà", "Côte d'Ivoire": "Bờ Biển Ngà", Cameroon: "Cameroon", Mali: "Mali", Morocco: "Maroc", Algeria: "Algeria", Egypt: "Ai Cập", Tunisia: "Tunisia", "Burkina Faso": "Burkina Faso", Guinea: "Guinea", "DR Congo": "CHDC Congo", Congo: "Congo", Gabon: "Gabon", Zimbabwe: "Zimbabwe", Zambia: "Zambia", "South Africa": "Nam Phi", Gambia: "Gambia", "Cape Verde": "Cape Verde", Angola: "Angola",
  "Cote D’Ivoire": "Bờ Biển Ngà", "Cote D'Ivoire": "Bờ Biển Ngà", Turkiye: "Thổ Nhĩ Kỳ", "Bosnia & Herzegovina": "Bosnia", Bulgaria: "Bulgaria", Mozambique: "Mozambique", Haiti: "Haiti",
  Japan: "Nhật Bản", "South Korea": "Hàn Quốc", "Korea Republic": "Hàn Quốc", Australia: "Úc", "New Zealand": "New Zealand", Iran: "Iran", Israel: "Israel", Iraq: "Iraq", "Saudi Arabia": "Ả Rập Xê Út", Uzbekistan: "Uzbekistan",
};
const natVi = (n) => (n ? NAT[n] || n : null);
// vị trí: G / D / M / F + mô tả chi tiết → mã như trong game (GK, CB, LB, RB, DM, CM, AM, LM, RM, LW, RW, ST)
function detailPos(pos, info) {
  const t = (info || "").toLowerCase();
  if (pos === "G") return "GK";
  if (/left (full|wing) back/.test(t)) return "LB";
  if (/right (full|wing) back/.test(t)) return "RB";
  if (/central defender|centre back|defender/.test(t) && pos === "D") return "CB";
  if (/defensive midfielder/.test(t)) return "DM";
  if (/left winger/.test(t)) return pos === "F" ? "LW" : "LM";
  if (/right winger/.test(t)) return pos === "F" ? "RW" : "RM";
  if (/left (wide )?midfielder/.test(t)) return "LM";
  if (/right (wide )?midfielder/.test(t)) return "RM";
  if (/attacking midfielder/.test(t)) return "AM";
  if (/central midfielder|midfielder/.test(t)) return "CM";
  if (/second striker/.test(t)) return "ST";
  if (/striker|forward|centre forward/.test(t)) return "ST";
  return { D: "CB", M: "CM", F: "ST" }[pos] || null;
}
// chỉ số giữ lại (tên trong API → tên gọn)
const STAT_KEYS = {
  appearances: "apps", game_started: "starts", mins_played: "mins", goals: "goals", goal_assist: "assists", clean_sheet: "cleanSheets",
  yellow_card: "yellow", red_card: "red", total_sub_on: "subOn", total_sub_off: "subOff", saves: "saves", goals_conceded: "conceded",
  total_tackle: "tackles", won_tackle: "tacklesWon", interception: "interceptions", total_clearance: "clearances", ball_recovery: "recoveries",
  total_pass: "passes", accurate_pass: "passesAcc", total_long_balls: "longBalls", accurate_long_balls: "longBallsAcc", total_through_ball: "throughBalls",
  total_att_assist: "keyPasses", big_chance_created: "bigChancesCreated", total_cross: "crosses", accurate_cross: "crossesAcc",
  total_scoring_att: "shots", ontarget_scoring_att: "shotsOn", big_chance_missed: "bigChancesMissed", won_contest: "dribbles", total_contest: "dribblesTried",
  aerial_won: "aerialWon", aerial_lost: "aerialLost", duel_won: "duelsWon", duel_lost: "duelsLost", fouls: "fouls", was_fouled: "fouled",
  dispossessed: "dispossessed", touches: "touches", att_pen_goal: "penGoals", penalty_save: "penSaves", good_high_claim: "highClaims", wins: "wins", draws: "draws", losses: "losses",
};

// ---------- Chạy ----------
await mkdir(CACHE, { recursive: true });
const day = new Date().toISOString().slice(0, 10);
const OUT = join(root, "data", "pl-snapshots", day);
await mkdir(OUT, { recursive: true });

const teamsRes = await get(`/teams?pageSize=40&compSeasons=${SEASON.id}&comps=1&altIds=true&page=0`);
const teams = teamsRes.content;
console.log(`${SEASON.label}: ${teams.length} CLB`);
const clubId = (t) => slug(t.club?.name || t.name);

const clubs = [];
const players = new Map();
const squads = [];
const staff = [];
for (const t of teams) {
  const [sq, club] = await Promise.all([get(`/teams/${t.id}/compseasons/${SEASON.id}/staff?pageSize=80&altIds=true&compCodeForActivePlayer=EN_PR`), get(`/clubs/${t.club?.id || t.id}`)]);
  const first = club.teams?.find((x) => x.teamType === "FIRST") || club.teams?.[0];
  const ground = first?.grounds?.find((g) => g.compSeasonIds?.includes(SEASON.id)) || first?.grounds?.[0];
  const manager = (sq.officials || []).find((o) => /manager|head coach/i.test(o.role) && !/assistant/i.test(o.role));
  const id = clubId(t);
  clubs.push({ id, plId: t.id, name: t.club?.name || t.name, shortName: t.shortName || t.club?.shortName, code: t.club?.abbr, founded: club.founded || null, city: club.city || ground?.city || null, venue: ground?.name || null, coach: manager?.name?.display || null, opta: t.altIds?.opta || null });
  for (const o of sq.officials || []) staff.push({ clubId: id, name: o.name?.display, role: o.role });
  for (const p of sq.players) {
    const pid = slug(p.name.display);
    let key = pid;
    if (players.has(key) && players.get(key).plId !== p.id) key = `${pid}-${p.id}`;
    players.set(key, {
      id: key,
      plId: p.id,
      name: p.name.display,
      firstName: p.name.first || null,
      lastName: p.name.last || null,
      birthDate: p.birth?.date?.millis ? new Date(p.birth.date.millis).toISOString().slice(0, 10) : null,
      birthPlace: p.birth?.place || null,
      nationality: natVi(p.nationalTeam?.country || p.birth?.country?.country),
      nationalityEn: p.nationalTeam?.country || p.birth?.country?.country || null,
      height: p.height || null,
      weight: p.weight || null,
      opta: p.altIds?.opta || null,
    });
    squads.push({ clubId: id, playerId: key, number: p.info?.shirtNum ?? null, position: p.info?.position || null, positionInfo: p.info?.positionInfo || null, positionDetail: detailPos(p.info?.position, p.info?.positionInfo), joined: p.joinDate?.millis ? new Date(p.joinDate.millis).toISOString().slice(0, 10) : null, appsSeason: p.appearances ?? 0 });
  }
  console.log(`  ${t.name}: ${sq.players.length} cầu thủ, HLV ${manager?.name?.display || "?"}, sân ${ground?.name || "?"}`);
}

// CLB của cầu thủ ở các mùa trước (đội hình từng mùa)
const pastClub = {};
for (const h of HISTORY) {
  const ts = (await get(`/teams?pageSize=40&compSeasons=${h.id}&comps=1&altIds=true&page=0`)).content;
  for (const t of ts) {
    const sq = await get(`/teams/${t.id}/compseasons/${h.id}/staff?pageSize=80&altIds=true&compCodeForActivePlayer=EN_PR`);
    for (const p of sq.players) ((pastClub[p.id] ||= {})[h.label] ||= []).push(t.club?.name || t.name);
  }
  console.log(`  đội hình ${h.label}: ${ts.length} CLB`);
}

// bảng xếp hạng
const standings = [];
for (const s of [SEASON, ...HISTORY]) {
  const st = await get(`/standings?compSeasons=${s.id}&altIds=true`);
  for (const e of st.tables?.[0]?.entries || [])
    standings.push({ season: s.label, clubId: clubs.find((c) => c.plId === e.team.id)?.id || slug(e.team.club?.name || e.team.name), club: e.team.club?.name || e.team.name, rank: e.position, played: e.overall.played, won: e.overall.won, drawn: e.overall.drawn, lost: e.overall.lost, goalsFor: e.overall.goalsFor, goalsAgainst: e.overall.goalsAgainst, points: e.overall.points });
}

// thống kê từng cầu thủ, từng mùa
const list = [...players.values()];
let done = 0;
const stats = [];
await pool(list, 4, async (p) => {
  for (const s of [SEASON, ...HISTORY]) {
    const r = await get(`/stats/player/${p.plId}?compSeasons=${s.id}&comps=1`);
    const raw = Object.fromEntries((r.stats || []).map((x) => [x.name, x.value]));
    if (!raw.appearances) continue;
    const row = { playerId: p.id, season: s.label, club: s.id === SEASON.id ? null : (pastClub[p.plId]?.[s.label] || []).join(" / ") || null };
    for (const [k, v] of Object.entries(STAT_KEYS)) row[v] = raw[k] ?? 0;
    stats.push(row);
  }
  if (++done % 50 === 0) console.log(`  thống kê: ${done}/${list.length}`);
});
for (const r of stats) if (r.season === SEASON.label) r.club = clubs.find((c) => c.id === squads.find((q) => q.playerId === r.playerId)?.clubId)?.name || null;

const meta = { source: "premierleague.com (footballapi.pulselive.com)", importedAt: new Date().toISOString(), season: SEASON.year, seasonLabel: SEASON.label, history: HISTORY.map((h) => h.label), competition: { id: "england-premier-league", name: "Premier League", country: "Anh" } };
const write = (name, data) => writeFile(join(OUT, `${name}.json`), JSON.stringify(data, null, 1) + "\n");
await Promise.all([write("meta", meta), write("clubs", clubs), write("players", list), write("squads", squads), write("stats", stats), write("standings", standings), write("staff", staff)]);
const withStats = new Set(stats.filter((r) => r.season !== SEASON.label).map((r) => r.playerId));
console.log(`\nXong → data/pl-snapshots/${day}: ${clubs.length} CLB, ${list.length} cầu thủ (${withStats.size} có số liệu Premier League mùa trước), ${stats.length} dòng thống kê, ${standings.length} dòng BXH`);
const noPos = squads.filter((q) => !q.positionDetail).length;
if (noPos) console.log(`Chưa xác định vị trí chi tiết: ${noPos} cầu thủ`);
