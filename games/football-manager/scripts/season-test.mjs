#!/usr/bin/env node
/**
 * Chạy thử cả mùa giải không cần giao diện: chọn CLB, bấm "Tiếp tục" liên tục, tự đá trận
 * của mình, hết mùa → play-off → sang mùa mới → đá tiếp vài vòng. Bắt lỗi logic, đo tốc độ
 * và dung lượng save.
 *
 *   node scripts/season-test.mjs [--club=ha-noi] [--seasons=2]
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { deflateRawSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const ctx = { window: {}, console };
ctx.window.window = ctx.window;
vm.createContext(ctx);
for (const f of ["data/game-data.js", "js/core.js", "js/engine.js", "js/world.js", "js/transfers.js", "js/loans.js", "js/cups.js", "js/afc.js", "js/scout.js", "js/training.js", "js/morale.js", "js/history.js"]) vm.runInContext(await readFile(join(root, f), "utf8"), ctx, { filename: f });
const { FM } = ctx.window;
const W = FM.World;

const t0 = Date.now();
const s = W.newGame(args.club || "ha-noi", 12345);
console.log(`Ván mới: ${W.club(s, s.user).name}, mục tiêu "${s.clubs[s.user].obj.label}", ngày ${s.date}, ${s.fx.length} trận`);
let userMatches = 0;
let seasonsDone = 0;
const wanted = Number(args.seasons || 2);
for (let guard = 0; guard < 5000; guard++) {
  const r = W.advance(s);
  if (r.kind === "match") {
    const f = r.fixture;
    const m = FM.createMatch(W.sideFor(s, f.h, f.h !== s.user), W.sideFor(s, f.a, f.a !== s.user), { seed: W.matchSeed(s, f), neutral: !!f.po }).runToEnd();
    W.applyResult(s, f, m);
    userMatches++;
  } else if (r.kind === "seasonEnd") {
    const sum = s.summary;
    const name = (id) => W.baseClub(s, id).name;
    console.log(`\nHết mùa ${sum.season} (${s.date}):`);
    console.log(`  Vô địch V1: ${name(sum.champions[FM.V1])} · V2: ${name(sum.champions[FM.V2])}`);
    console.log(`  Play-off: ${name(sum.playoff.home)} ${sum.playoff.hg}-${sum.playoff.ag}${sum.playoff.pens ? ` (pen ${sum.playoff.pens.join("-")})` : ""} ${name(sum.playoff.away)}`);
    console.log(`  Lên hạng: ${sum.promoted.map(name).join(", ")} · Xuống hạng: ${sum.relegated.map(name).join(", ")} · Xuống Hạng Nhì: ${name(sum.outOfGame)}`);
    console.log(`  Đội của bạn: hạng ${sum.user.pos} (mục tiêu ≤ ${sum.user.obj.target}) ${sum.user.achieved ? "ĐẠT" : "không đạt"}, tin tưởng ${Math.round(sum.user.conf)}`);
    const cupF = s.fx.filter((f) => f.lg === "cup" && f.rd === 4)[0];
    const sc = s.fx.find((f) => f.lg === "super");
    console.log(`  Siêu Cúp: ${name(sc.h)} ${sc.hg}-${sc.ag}${sc.pens ? ` (pen ${sc.pens.join("-")})` : ""} ${name(sc.a)} → ${name(s.cup.superWinner)}`);
    console.log(`  Cúp QG: ${s.fx.filter((f) => f.lg === "cup").length} trận, chung kết ${name(cupF.h)} ${cupF.hg}-${cupF.ag}${cupF.pens ? ` (pen ${cupF.pens.join("-")})` : ""} ${name(cupF.a)} (${cupF.d}) → vô địch ${name(s.cup.winner)} · đội bạn: ${FM.Cups.userStatus(s)}`);
    if (s.afc) for (const [k, c] of Object.entries(s.afc.comps)) console.log(`  ${FM.AFC.COMPS[k].short}: vô địch ${c.winner ? name(c.winner) : "—"} · Việt Nam: ${s.afc.vn[k].map((id) => `${name(id)} (${FM.AFC.result(s, k, id)})`).join(", ") || "—"}`);
    const cupGoals = Object.values(s.p).reduce((a, d) => a + (d.cst ? d.cst.g : 0), 0);
    console.log(`  Bàn thắng ở cúp (thống kê riêng): ${cupGoals}`);
    const ts = W.player(s, sum.topScorer[FM.V1]);
    console.log(`  Vua phá lưới V1: ${ts.n} ${ts.st.g} bàn`);
    const t1 = W.table(s, FM.V1);
    console.log("  BXH V1: " + t1.map((r, i) => `${i + 1}.${W.baseClub(s, r.id).code} ${r.pts}`).join(" "));
    console.log(`  ${userMatches} trận của bạn, ${Date.now() - t0} ms, save ${(JSON.stringify(s).length / 1024).toFixed(0)} KB (nén ${(deflateRawSync(JSON.stringify(s)).length / 1024).toFixed(0)} KB)`);
    seasonsDone++;
    if (seasonsDone >= wanted) break;
    const tr = s.tr ? s.tr.log : [];
    const paid = tr.filter((e) => e.fee > 0);
    console.log(`  Cho mượn mùa này: ${tr.filter((e) => e.loan).length} vụ, đang mượn: ${Object.values(s.p).filter((d) => d.loan).length}`);
    console.log(`  Chuyển nhượng mùa này: ${tr.length} vụ (${paid.length} có phí, tổng ${paid.reduce((a, e) => a + e.fee, 0).toFixed(1)} tỷ), tự do: ${Object.values(s.p).filter((d) => d.c === "free").length}`);
    console.log("  Vụ lớn nhất: " + [...paid].sort((a, b) => b.fee - a.fee).slice(0, 4).map((e) => `${e.name} ${W.baseClub(s, e.from).code}→${W.baseClub(s, e.to).code} ${e.fee}`).join(" | "));
    console.log("  Đề nghị cho đội bạn: " + (s.tr ? s.tr.offers.length : 0) + " · số dư các đội: " + Object.keys(s.clubs).map((id) => W.baseClub(s, id).code + ":" + s.clubs[id].bal.toFixed(1)).join(" "));
    const res = W.newSeason(s);
    if (res.sacked) {
      console.log("  BỊ SA THẢI: " + res.reason);
      break;
    }
    const sq = W.squad(s, s.user);
    console.log(`Mùa mới ${W.label(s)}: ${W.club(s, s.user).name} ở ${W.leagueName(s.clubs[s.user].league)}, mục tiêu "${s.clubs[s.user].obj.label}", đội hình ${sq.length} người, ${s.fx.length} trận, ${Object.keys(s.p).length} cầu thủ toàn giải`);
  }
}
const injured = Object.values(s.p).filter((d) => d.inj).length;
const suspended = Object.values(s.p).filter((d) => d.sus).length;
console.log(`\nKết thúc test: ngày ${s.date}, đang chấn thương ${injured}, treo giò ${suspended}, thư ${s.inbox.length}, ${Date.now() - t0} ms`);
console.log("Thư mới nhất: " + s.inbox.slice(0, 4).map((m) => `[${m.k}] ${m.t}`).join(" | "));
