#!/usr/bin/env node
/**
 * Lấy dữ liệu V.League 1 và V.League 2 (Hạng Nhất) từ trang chính thức của VPF (vpf.vn)
 * thành một snapshot có ngày.
 *
 *   node scripts/import-vpf.mjs                 # mùa 2026/27 + thống kê 2025/26, 2024/25
 *   node scripts/import-vpf.mjs --history=1     # chỉ lấy thống kê 1 mùa trước
 *   node scripts/import-vpf.mjs --refresh       # bỏ bộ nhớ tạm, tải lại tất cả
 *
 * - Trang đội (/team/<slug>/?sid=<mùa>): danh sách cầu thủ (số áo, vị trí, cao, nặng, ngày
 *   sinh, bàn thắng/thẻ mùa hiện tại), HLV, sân nhà + sức chứa.
 * - Trang cầu thủ (/player/<slug>/?sid=<mùa>): họ, tên, quốc tịch, thống kê của đúng mùa đó
 *   (số trận, đá chính, vào sân, rời sân, bàn, thẻ; VPF không ghi số phút) và ô chọn mùa chỉ
 *   liệt kê những mùa cầu thủ có đá → chỉ tải đúng các mùa V.League 1/2 cần thống kê.
 * Mỗi trang đã bóc tách được lưu ở data/vpf-cache/ nên chạy lại sẽ tiếp tục từ chỗ dừng.
 * Nghỉ 1 giây giữa hai lần tải để không làm phiền máy chủ VPF.
 * Sau cùng áp data/overrides.json (sửa tay chỗ VPF bỏ trống / đăng ký trùng).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const cacheDir = join(root, "data", "vpf-cache");
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);

// Mã mùa giải trên vpf.vn (sid, lấy từ ô chọn mùa ở trang cầu thủ)
const SEASON = { year: 2026, label: "2026/27" };
const COMPETITIONS = [
  { id: "vietnam-v-league-1", name: "V.League 1", tier: 1, officialName: "Vô địch Quốc gia LPBank 2026/27", slug: "v-league-2027", sid: 154439 },
  { id: "vietnam-v-league-2", name: "V.League 2", tier: 2, officialName: "Sacombank V.League 2 2026/27", slug: "hang-nhat-quoc-gia-2027", sid: 154445 },
];
const HISTORY = [
  {
    label: "2025/26",
    sids: { "vietnam-v-league-1": 121994, "vietnam-v-league-2": 123011 },
    slugs: { "vietnam-v-league-1": "v-league-2026", "vietnam-v-league-2": "hang-nhat-quoc-gia-2026" },
  },
  {
    label: "2024/25",
    sids: { "vietnam-v-league-1": 90366, "vietnam-v-league-2": 92760 },
    slugs: { "vietnam-v-league-1": "v-league-2025", "vietnam-v-league-2": "hang-nhat-quoc-gia-2025" },
  },
].slice(0, Math.max(0, Number(args.history ?? 2)));
const DELAY_MS = 1000;
const POSITIONS = { "Thủ môn": "GK", "Hậu vệ": "DF", "Tiền vệ": "MF", "Tiền đạo": "FW" };

// ---------- Tải trang (có nghỉ, thử lại, bộ nhớ tạm) ----------
let lastFetch = 0;
let fetched = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function download(url) {
  for (let attempt = 1; ; attempt++) {
    const wait = lastFetch + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastFetch = Date.now();
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (GameVui personal data import)" } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      fetched++;
      return await res.text();
    } catch (err) {
      if (attempt >= 4) throw new Error(`${url}: ${err.message}`);
      console.warn(`  thử lại (${attempt}) ${url}: ${err.message}`);
      await sleep(2000 * attempt);
    }
  }
}
// Tải + bóc tách, kết quả bóc tách được nhớ lại theo khoá. valid(): bản nhớ cũ còn dùng được
// không (VD bản bóc tách từ phiên bản script cũ thiếu trường mới thì tải lại).
async function cached(key, url, parse, valid = () => true) {
  const file = join(cacheDir, key.replace(/[^a-z0-9-]+/gi, "_") + ".json");
  if (!args.refresh) {
    try {
      const data = JSON.parse(await readFile(file, "utf8"));
      if (valid(data)) return data;
    } catch {
      /* chưa có → tải */
    }
  }
  const data = parse(await download(url));
  await writeFile(file, JSON.stringify(data), "utf8");
  return data;
}

// ---------- Bóc tách HTML ----------
const decode = (s) =>
  String(s ?? "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
const text = (html) => decode(String(html ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const int = (s) => (/^-?\d+$/.test(String(s).trim()) ? Number(s) : null);

// "01-07-1991", "14/04/2004" → "1991-07-01"; "1999" → năm
function birth(raw) {
  const s = String(raw || "").trim();
  let m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return { birthDate: `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`, birthYear: Number(m[3]) };
  m = s.match(/^(\d{4})$/);
  if (m) return { birthDate: null, birthYear: Number(m[1]) };
  return { birthDate: null, birthYear: null };
}

function parseTeamLinks(html, sid) {
  const out = new Map();
  for (const m of html.matchAll(new RegExp(`/team/([a-z0-9-]+)/\\?sid=${sid}"[^>]*>([^<]*)<`, "g"))) {
    const name = text(m[2]);
    if (!out.has(m[1])) out.set(m[1], new Set());
    if (name) out.get(m[1]).add(name);
  }
  return [...out].map(([slug, names]) => ({ slug, names: [...names] }));
}

function parseTeam(html) {
  const info = (title) => {
    const m = html.match(new RegExp(`jo-title">\\s*${title}\\s*</p>\\s*<strong>([^<]*)</strong>`));
    return m ? text(m[1]) : null;
  };
  const home = info("Sân Nhà");
  const cap = home?.match(/Sức chứa:\s*([\d.,]+)/);
  // tiêu đề cột bảng cầu thủ, để biết thứ tự các cột số
  const head = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => {
    const t = m[1].match(/title="([^"]*)"/);
    return t ? decode(t[1]) : text(m[1]);
  });
  const rows = [];
  for (const tr of html.split(/<tr[\s>]/).slice(1)) {
    const link = tr.match(/\/player\/([^/"]+)\/\?sid=\d+"[^>]*>([^<]*)<\/a>\s*<\/div>/);
    if (!link) continue;
    const photo = tr.match(/<img[^>]*src="([^"]+)"/);
    const cells = [...tr.matchAll(/<td class="jsTextAlignCenter">([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
    rows.push({ slug: link[1], name: text(link[2]), photo: photo ? photo[1] : null, cells });
  }
  // tên viết tắt của các đội trong khung lịch đấu đầu trang (VD "THFC", "SHBĐN")
  const codes = {};
  for (const m of html.matchAll(/\/team\/([a-z0-9-]+)\/\?sid=\d+">([\p{Lu}0-9.]{2,10})<\/a>/gu)) codes[m[1]] = m[2];
  return {
    name: text((html.match(/<title>([^<|]*)/) || [])[1]),
    coach: info("Huấn luyện viên"),
    venue: home ? { name: home.replace(/\s*\(Sức chứa[^)]*\)\s*/, "").trim(), capacity: cap ? Number(cap[1].replace(/[.,]/g, "")) : null } : null,
    head,
    rows,
    codes,
  };
}

// bảng xếp hạng ở trang mùa giải: hạng, đội, trận, thắng, hoà, thua, "bàn thắng - bàn thua", điểm
function parseStandings(html) {
  const title = text((html.match(/<title>([^<|]*)/) || [])[1]);
  const rows = [];
  for (const tr of html.split(/<tr[\s>]/).slice(1)) {
    const rank = tr.match(/ranking-cell-rank">\s*(\d+)/);
    const team = tr.match(/\/team\/([a-z0-9-]+)\/\?sid=\d+"/);
    if (!rank || !team) continue;
    const cell = (k) => text((tr.match(new RegExp(`ranking-cell-${k}">([\\s\\S]*?)</td>`)) || [])[1]);
    const [gf, ga] = cell("diff_chk").split("-").map((s) => int(s));
    rows.push({ rank: +rank[1], clubId: team[1], played: int(cell("played_chk")), won: int(cell("win_chk")), drawn: int(cell("draw_chk")), lost: int(cell("lost_chk")), goalsFor: gf, goalsAgainst: ga, points: int(cell("point_chk")) });
  }
  return { title, rows };
}

function parsePlayer(html) {
  const profile = {};
  for (const m of html.matchAll(/<strong>([^<]*):<\/strong><\/div><div class="jstable-cell">([\s\S]*?)<\/div>/g)) profile[text(m[1])] = text(m[2]);
  // ô chọn mùa: chỉ có những mùa cầu thủ này có thi đấu
  const seasons = {};
  for (const m of html.matchAll(/<option[^>]*value="(\d+)"[^>]*>([^<]*)/g)) if (m[1] !== "0") seasons[m[1]] = text(m[2]);
  // bảng thống kê của mùa đang chọn: tên đội + 8 cột số
  const stats = [];
  const start = html.indexOf('title="Played minutes"');
  if (start > 0) {
    const table = html.slice(start, html.indexOf("</table>", start));
    for (const tr of table.split(/<tr[\s>]/).slice(1)) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
      const nums = cells.slice(1).map(int);
      if (cells.length >= 9 && nums.slice(0, 8).every((n) => n !== null)) {
        const [apps, starts, minutes, subsIn, subsOut, goals, yellow, red] = nums;
        stats.push({ club: cells[0], apps, starts, minutes, subsIn, subsOut, goals, yellow, red });
      }
    }
  }
  return { profile, seasons, stats };
}

// ---------- Chạy ----------
await mkdir(cacheDir, { recursive: true });
console.log(
  `${COMPETITIONS.map((c) => c.name).join(" + ")} ${SEASON.label} từ vpf.vn (thống kê thêm: ${HISTORY.map((h) => h.label).join(", ") || "không"})`,
);

const clubs = [];
const players = new Map();
const squads = [];
const stats = [];
const staff = [];
const codes = {};
const teamNames = {};

for (const comp of COMPETITIONS) {
  const seasonPage = await cached(`season-${comp.sid}`, `https://vpf.vn/season/${comp.slug}/`, (html) => parseTeamLinks(html, comp.sid));
  if (seasonPage.length < 10) throw new Error(`${comp.name}: chỉ tìm thấy ${seasonPage.length} đội ở trang mùa giải, cấu trúc trang có thể đã đổi.`);
  console.log(`${comp.name}: ${seasonPage.length} đội`);
  for (const t of seasonPage) teamNames[t.slug] = t.names;
  let headLogged = false;
  for (const team of seasonPage) {
    const page = await cached(`team-${team.slug}-${comp.sid}`, `https://vpf.vn/team/${team.slug}/?sid=${comp.sid}`, parseTeam);
    Object.assign(codes, page.codes);
    if (!headLogged) {
      console.log(`  cột bảng cầu thủ: ${page.head.join(" | ")}`);
      headLogged = true;
    }
    clubs.push({ id: team.slug, leagueId: comp.id, name: page.name || team.names[0], code: null, coach: page.coach, venue: page.venue });
    let count = 0;
    for (const row of page.rows) {
      // cột: vị trí, số áo, cao, nặng, ngày sinh, bàn thắng, phản lưới, thẻ vàng, thẻ đỏ
      const [position, number, height, weight, dob, goals, ownGoals, yellow, red] = row.cells;
      // có chức danh (Trợ lý HLV, Quan chức…) là ban huấn luyện; ô vị trí trống là cầu
      // thủ mới đăng ký, vị trí lấy sau ở trang cầu thủ
      if (position && !POSITIONS[position]) {
        staff.push({ clubId: team.slug, name: row.name, role: position, slug: row.slug });
        continue;
      }
      if (players.has(row.slug)) {
        console.warn(`  ${row.name} có tên ở 2 đội, giữ đội đầu tiên`);
        continue;
      }
      count++;
      players.set(row.slug, { id: row.slug, name: row.name, ...birth(dob), height: int(height), weight: int(weight), photo: row.photo });
      squads.push({ clubId: team.slug, playerId: row.slug, position: POSITIONS[position] || null, positionName: position || null, number: int(number) });
      stats.push({ playerId: row.slug, season: SEASON.label, leagueId: comp.id, clubId: team.slug, apps: null, starts: null, goals: int(goals), ownGoals: int(ownGoals), yellow: int(yellow), red: int(red) });
    }
    console.log(`  ${page.name}: ${count} cầu thủ, HLV ${page.coach || "?"}, ${page.venue?.name || "?"}`);
  }
}
// tên viết tắt: từ khung lịch đấu, không có thì lấy ở trang mùa giải (VD "SHBĐN", "ĐNFC")
for (const c of clubs) c.code = codes[c.id] || teamNames[c.id]?.find((n) => /^[\p{Lu}0-9.]{2,10}$/u.test(n)) || null;

// bảng xếp hạng các mùa trước (sức mạnh CLB) và mùa hiện tại
const standings = [];
for (const [label, comps] of [
  ...HISTORY.map((h) => [h.label, Object.entries(h.slugs).map(([leagueId, slug]) => ({ leagueId, slug, sid: h.sids[leagueId] }))]),
  [SEASON.label, COMPETITIONS.map((c) => ({ leagueId: c.id, slug: c.slug, sid: c.sid }))],
])
  for (const c of comps) {
    const table = await cached(`standings-${c.sid}`, `https://vpf.vn/season/${c.slug}/`, parseStandings);
    if (!table.rows.length) console.warn(`  không đọc được bảng xếp hạng ${label} ${c.slug} ("${table.title}")`);
    else console.log(`  BXH ${label} ${c.leagueId}: ${table.rows.length} đội (${table.title}), đầu bảng ${table.rows[0].clubId}`);
    for (const r of table.rows) standings.push({ season: label, leagueId: c.leagueId, ...r });
  }

// trang cầu thủ: trang mùa hiện tại cho hồ sơ + danh sách mùa đã đá, rồi các mùa cũ cần thống kê
const leagueOf = new Map(squads.map((s) => [s.playerId, clubs.find((c) => c.id === s.clubId).leagueId]));
const playerPage = (id, sid, needSeasons) =>
  cached(`player-${id}-${sid}`, `https://vpf.vn/player/${id}/?sid=${sid}`, parsePlayer, (d) => !needSeasons || d.seasons);
let done = 0;
for (const p of players.values()) {
  const curSid = COMPETITIONS.find((c) => c.id === leagueOf.get(p.id)).sid;
  const cur = await playerPage(p.id, curSid, true);
  const pr = cur.profile;
  p.firstname = pr["First Name"] || null;
  p.lastname = pr["Last Name"] || null;
  p.nationality = pr["Quốc tịch"] || null;
  const sq = squads.find((s) => s.playerId === p.id);
  if (!sq.position && POSITIONS[pr["Vị trí"]]) {
    sq.position = POSITIONS[pr["Vị trí"]];
    sq.positionName = pr["Vị trí"];
  }
  if (!p.birthYear && pr["Năm sinh"]) Object.assign(p, birth(pr["Năm sinh"]));
  if (!p.height && int(pr["Cao (cm)"])) p.height = int(pr["Cao (cm)"]);
  if (!p.weight && int(pr["Nặng (kg)"])) p.weight = int(pr["Nặng (kg)"]);
  for (const h of HISTORY)
    for (const [leagueId, sid] of Object.entries(h.sids)) {
      if (!cur.seasons[sid]) continue; // mùa đó không đá giải này
      const page = await playerPage(p.id, sid, false);
      for (const s of page.stats)
        stats.push({ playerId: p.id, season: h.label, leagueId, club: s.club, apps: s.apps, starts: s.starts, subsIn: s.subsIn, subsOut: s.subsOut, goals: s.goals, yellow: s.yellow, red: s.red });
    }
  if (++done % 50 === 0 || done === players.size) console.log(`  cầu thủ ${done}/${players.size} (đã tải mạng ${fetched} trang)`);
}

// ---------- Chuẩn hoá ----------
// VPF viết quốc tịch lẫn lộn Anh / Việt / viết tắt → đưa về một tên tiếng Việt
const NATIONALITY = {
  "viet nam": "Việt Nam", vietnam: "Việt Nam",
  brasil: "Brazil", bra: "Brazil",
  usa: "Mỹ", "united states": "Mỹ", "hoa kỳ": "Mỹ",
  "united kingdom": "Anh", england: "Anh",
  australia: "Úc", "ai len": "Ireland",
};
// chữ cái chỉ tiếng Việt mới có: tên có dấu thì gần như chắc là cầu thủ Việt Nam
const VIET_LETTERS = /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i;
for (const p of players.values()) {
  if (p.nationality) {
    p.nationality = NATIONALITY[p.nationality.toLowerCase()] || p.nationality;
    p.nationalitySource = "vpf";
  } else if (VIET_LETTERS.test(p.name)) {
    p.nationality = "Việt Nam";
    p.nationalitySource = "name";
  } else p.nationalitySource = null;
}

// File sửa tay: điền chỗ VPF bỏ trống (vị trí, năm sinh, quốc tịch), gộp cầu thủ bị đăng
// ký trùng, chuyển người không phải cầu thủ sang BHL. Áp sau cùng nên luôn thắng dữ liệu tải về.
let overrides = { players: {}, merge: [], toStaff: [] };
try {
  overrides = { ...overrides, ...JSON.parse(await readFile(join(root, "data", "overrides.json"), "utf8")) };
} catch (err) {
  if (err.code !== "ENOENT") throw new Error(`overrides.json: ${err.message}`);
}
for (const { keep, drop } of overrides.merge) {
  if (!players.has(keep) || !players.has(drop)) {
    console.warn(`  bỏ qua gộp ${drop} → ${keep}: không thấy cầu thủ`);
    continue;
  }
  players.delete(drop);
  squads.splice(squads.findIndex((s) => s.playerId === drop), 1);
  for (let i = stats.length - 1; i >= 0; i--) {
    if (stats[i].playerId !== drop) continue;
    // mùa hiện tại đã có dòng của người giữ lại → bỏ dòng trùng, mùa cũ thì chuyển sang
    if (stats[i].season === SEASON.label) stats.splice(i, 1);
    else stats[i].playerId = keep;
  }
}
for (const { slug, role } of overrides.toStaff) {
  const p = players.get(slug);
  if (!p) {
    console.warn(`  bỏ qua chuyển ${slug} sang BHL: không thấy cầu thủ`);
    continue;
  }
  const i = squads.findIndex((s) => s.playerId === slug);
  staff.push({ clubId: squads[i].clubId, name: p.name, role, slug });
  squads.splice(i, 1);
  players.delete(slug);
  for (let j = stats.length - 1; j >= 0; j--) if (stats[j].playerId === slug) stats.splice(j, 1);
}
let overridden = 0;
for (const [id, o] of Object.entries(overrides.players)) {
  const p = players.get(id);
  if (!p) {
    console.warn(`  bỏ qua sửa tay ${id}: không thấy cầu thủ`);
    continue;
  }
  overridden++;
  for (const k of ["name", "birthDate", "birthYear", "nationality", "height", "weight", "vietHeritage"]) if (o[k] != null) p[k] = o[k];
  if (o.nationality) p.nationalitySource = "override";
  if (o.birthDate && !o.birthYear) p.birthYear = Number(o.birthDate.slice(0, 4));
  const sq = squads.find((s) => s.playerId === id);
  if (o.position) sq.position = o.position;
  if (o.positionDetail) sq.positionDetail = o.positionDetail;
}
for (const comp of COMPETITIONS) {
  const ids = new Set(squads.filter((s) => clubs.find((c) => c.id === s.clubId).leagueId === comp.id).map((s) => s.playerId));
  const list = [...players.values()].filter((p) => ids.has(p.id));
  console.log(
    `${comp.name}: còn thiếu vị trí ${squads.filter((s) => ids.has(s.playerId) && !s.position).length}, ` +
      `năm sinh ${list.filter((p) => !p.birthYear).length}, quốc tịch ${list.filter((p) => !p.nationality).length}`,
  );
}
console.log(`Sửa tay ${overridden} cầu thủ, gộp ${overrides.merge.length} trùng, chuyển ${overrides.toStaff.length} sang BHL.`);

const snapshotDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const destination = join(root, "data", "snapshots", snapshotDate);
await mkdir(destination, { recursive: true });
const files = {
  "meta.json": {
    schemaVersion: 1,
    snapshotDate,
    season: SEASON.year,
    seasonLabel: SEASON.label,
    source: "VPF (vpf.vn)",
    importedAt: new Date().toISOString(),
    vpfSeasonIds: {
      current: Object.fromEntries(COMPETITIONS.map((c) => [c.id, c.sid])),
      history: Object.fromEntries(HISTORY.map((h) => [h.label, h.sids])),
    },
    notes: "VPF không ghi số phút thi đấu. Thống kê mùa hiện tại lấy từ trang đội (chỉ bàn thắng và thẻ).",
  },
  "leagues.json": COMPETITIONS.map((c) => ({ id: c.id, key: c.id, name: c.name, officialName: c.officialName, tier: c.tier, country: "Vietnam", season: SEASON.year, seasonLabel: SEASON.label, vpfSid: c.sid })),
  "clubs.json": clubs,
  "players.json": [...players.values()],
  "squads.json": squads,
  "stats.json": stats,
  "standings.json": standings,
  "staff.json": staff,
};
for (const [name, data] of Object.entries(files)) await writeFile(join(destination, name), JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`Xong: ${clubs.length} CLB, ${players.size} cầu thủ, ${stats.length} dòng thống kê, ${staff.length} thành viên BHL (đã tải mạng ${fetched} trang).`);
console.log(`Snapshot: ${destination}`);
