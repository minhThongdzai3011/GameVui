#!/usr/bin/env node
/**
 * Kiểm tra cân bằng engine trận đấu: cho các đội cùng giải đá vòng tròn nhiều mùa (máy tự chọn
 * đội hình + sơ đồ) rồi in số bàn / trận, tỉ lệ thắng sân nhà–hoà–thua, cú sút, thẻ, và đội
 * mạnh có đứng cao không.
 *
 *   node scripts/sim-test.mjs [--seasons=20] [--league=vietnam-v-league-1]
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const ctx = { window: {}, console };
ctx.window.window = ctx.window;
vm.createContext(ctx);
for (const f of ["data/game-data.js", "js/core.js", "js/engine.js"]) vm.runInContext((await readFile(join(root, f), "utf8")).replace(/^window\./m, "window."), ctx, { filename: f });
const FM = ctx.window.FM;
const D = ctx.window.FM_DATA;

const league = args.league || "vietnam-v-league-1";
const clubs = D.clubs.filter((c) => c.league === league);
const squads = Object.fromEntries(clubs.map((c) => [c.id, D.players.filter((p) => p.c === c.id).map((p) => ({ ...p, fit: 100, mor: 55, available: true }))]));
const picks = Object.fromEntries(clubs.map((c) => [c.id, FM.bestFormation(squads[c.id])]));
const side = (c) => ({ clubId: c.id, name: c.name, code: c.code, formation: picks[c.id].formation, tactics: {}, lineup: picks[c.id].lineup, bench: picks[c.id].bench, players: Object.fromEntries(squads[c.id].map((p) => [p.id, p])), ai: true });

const seasons = Number(args.seasons || 20);
const pts = Object.fromEntries(clubs.map((c) => [c.id, 0]));
let n = 0, goals = 0, hw = 0, dr = 0, aw = 0, shots = 0, on = 0, yc = 0, rc = 0, xg = 0, poss = 0, subs = 0, zero = 0;
const scorelines = {};
let seed = 1;
for (let s = 0; s < seasons; s++)
  for (const h of clubs)
    for (const a of clubs) {
      if (h === a) continue;
      const m = FM.createMatch(side(h), side(a), { seed: seed++ }).runToEnd();
      const [H, W] = m.sides;
      n++;
      goals += H.goals + W.goals;
      if (H.goals > W.goals) (hw++, (pts[h.id] += 3));
      else if (H.goals < W.goals) (aw++, (pts[a.id] += 3));
      else (dr++, pts[h.id]++, pts[a.id]++);
      if (H.goals + W.goals === 0) zero++;
      shots += H.st.shots + W.st.shots;
      on += H.st.on + W.st.on;
      yc += H.st.yc + W.st.yc;
      rc += H.st.rc + W.st.rc;
      xg += H.st.xg + W.st.xg;
      poss += H.st.poss;
      subs += H.subs + W.subs;
      const k = `${H.goals}-${W.goals}`;
      scorelines[k] = (scorelines[k] || 0) + 1;
    }
const pct = (x) => ((100 * x) / n).toFixed(1) + "%";
console.log(`${league}: ${n} trận (${seasons} mùa)`);
console.log(`bàn/trận ${(goals / n).toFixed(2)} (thực tế ~2,5–2,9) · xG/trận ${(xg / n).toFixed(2)} · 0-0 ${pct(zero)}`);
console.log(`chủ nhà thắng ${pct(hw)} · hoà ${pct(dr)} · khách thắng ${pct(aw)} (thực tế ~44 / 27 / 29)`);
console.log(`cú sút/trận ${(shots / n).toFixed(1)} · trúng đích ${(on / n).toFixed(1)} · thẻ vàng ${(yc / n).toFixed(1)} · thẻ đỏ ${(rc / n).toFixed(2)} · thay người/đội ${(subs / n / 2).toFixed(1)} · kiểm soát bóng chủ nhà ${(poss / n).toFixed(0)}%`);
console.log("tỉ số hay gặp: " + Object.entries(scorelines).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${pct(v)}`).join(", "));
const table = clubs.map((c) => ({ c, p: pts[c.id] / seasons, s: c.strength, f: picks[c.id].formation })).sort((a, b) => b.p - a.p);
console.log("BXH trung bình / mùa (sức mạnh, sơ đồ):");
for (const [i, t] of table.entries()) console.log(`  ${String(i + 1).padStart(2)}. ${t.c.code.padEnd(8)} ${t.p.toFixed(1).padStart(5)} điểm  (sức mạnh ${t.s}, ${t.f})`);
// tương quan hạng theo sức mạnh và hạng theo điểm (Spearman)
const rankBy = (arr, key) => Object.fromEntries([...arr].sort((a, b) => b[key] - a[key]).map((t, i) => [t.c.id, i]));
const r1 = rankBy(table, "p"), r2 = rankBy(table, "s");
const d2 = clubs.reduce((s, c) => s + (r1[c.id] - r2[c.id]) ** 2, 0);
console.log(`tương quan sức mạnh ↔ điểm (Spearman): ${(1 - (6 * d2) / (clubs.length * (clubs.length ** 2 - 1))).toFixed(2)}`);
