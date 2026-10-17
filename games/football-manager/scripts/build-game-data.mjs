#!/usr/bin/env node
/**
 * Đóng gói snapshot mới nhất + ratings.json thành data/game-data.js cho game.
 * Game mở thẳng bằng file:// (không máy chủ) nên không fetch được JSON → dữ liệu là một
 * file script gán vào window.FM_DATA.
 *
 *   node scripts/build-game-data.mjs
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const snapRoot = join(root, "data", "snapshots");
const snapshot = (await readdir(snapRoot)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
const dir = join(snapRoot, snapshot);
const load = async (n) => JSON.parse(await readFile(join(dir, n + ".json"), "utf8"));
const [meta, leagues, clubs, players, squads, stats, ratings] = await Promise.all(["meta", "leagues", "clubs", "players", "squads", "stats", "ratings"].map(load));

// thứ tự thuộc tính trong mảng a[] của mỗi cầu thủ
const ATTRS = Object.keys(Object.values(ratings.players)[0].attributes);
const VI_LETTERS = /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i;
// tên ngắn hiển thị: người Việt lấy 2 chữ cuối ("Quang Hải"), người nước ngoài giữ tên nếu ngắn
function shortName(p) {
  const words = p.name.split(/\s+/);
  if (VI_LETTERS.test(p.name) || p.nationality === "Việt Nam") return words.length > 2 ? words.slice(-2).join(" ") : p.name;
  return p.name.length <= 16 ? p.name : words.slice(0, 2).join(" ");
}
// màu áo: chưa có dữ liệu thật → màu cố định theo mã CLB
// màu áo thật (data/club-colors.json, tra cứu tay); CLB chưa có thì sinh màu từ mã CLB
const realColors = JSON.parse(await readFile(join(root, "data", "club-colors.json"), "utf8"));
// cúp châu Á (scripts/afc-source.mjs → data/afc.json)
const afc = JSON.parse(await readFile(join(root, "data", "afc.json"), "utf8"));
function colors(code) {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.codePointAt(0)) % 360;
  return [`hsl(${h},62%,42%)`, `hsl(${(h + 180) % 360},70%,92%)`];
}

// sự nghiệp thật trước khi vào game: [mùa, CLB, giải 1/2, trận, bàn]
const realHistory = {};
for (const s of stats) {
  if (s.season === meta.seasonLabel || !s.apps) continue;
  (realHistory[s.playerId] ||= []).push([s.season, s.club, s.leagueId === "vietnam-v-league-1" ? 1 : 2, s.apps, s.goals]);
}
for (const rows of Object.values(realHistory)) rows.sort((a, b) => a[0].localeCompare(b[0]));
const lastSeason = {};
for (const s of stats) {
  if (s.season !== "2025/26" || !s.apps) continue;
  const o = (lastSeason[s.playerId] ||= { apps: 0, goals: 0 });
  o.apps += s.apps;
  o.goals += s.goals;
}

const out = {
  meta: { snapshot, season: meta.season, seasonLabel: meta.seasonLabel, source: meta.source, attrs: ATTRS },
  leagues: leagues.map((l) => ({ id: l.id, name: l.name, tier: l.tier, official: l.officialName })),
  clubs: clubs.map((c) => {
    const r = ratings.clubs[c.id];
    return {
      id: c.id,
      name: c.name,
      code: c.code,
      league: c.leagueId,
      coach: c.coach,
      venue: c.venue?.name || null,
      capacity: c.venue?.capacity || 5000,
      rep: r.reputation,
      strength: r.strength,
      budget: r.transferBudget,
      wageBudget: r.wageBudget,
      colors: realColors[c.id]?.colors || colors(c.code || c.id),
    };
  }),
  players: squads.map((s) => {
    const p = players.find((x) => x.id === s.playerId);
    const r = ratings.players[s.playerId];
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
      ca: r.ca,
      pa: r.pa,
      ft: r.foot,
      a: ATTRS.map((k) => r.attributes[k]),
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
  }),
  afc,
};
const js = `// Sinh tự động bởi scripts/build-game-data.mjs từ snapshot ${snapshot}. Không sửa tay.\nwindow.FM_DATA = ${JSON.stringify(out)};\n`;
await writeFile(join(root, "data", "game-data.js"), js, "utf8");
console.log(`data/game-data.js: ${out.clubs.length} CLB, ${out.players.length} cầu thủ, ${(js.length / 1024).toFixed(0)} KB (snapshot ${snapshot})`);
