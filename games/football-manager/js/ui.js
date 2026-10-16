// Giao diện: vẽ lại toàn bộ #app từ state mỗi khi có thay đổi (đủ nhanh với vài trăm dòng),
// sự kiện bắt chung qua data-act. Màn hình: mở đầu → chọn CLB → khung chính (trang chủ, đội
// hình, chiến thuật, lịch, BXH, CLB) + hộp thoại (hồ sơ cầu thủ, trước trận, sau trận, mã
// save) + màn trận đấu trực tiếp + tổng kết mùa.
(function () {
  "use strict";
  const FM = window.FM;
  const W = FM.World;
  const D = window.FM_DATA;
  const V1 = FM.V1;
  const V2 = FM.V2;
  const $ = (s) => document.querySelector(s);
  const esc = FM.esc;

  let S = null; // ván đang chơi
  let savedInfo = null; // ván đã lưu (màn mở đầu)
  const ui = { view: "start", tab: "home", sel: null, pickLeague: V1, pickClub: null, tableTab: V1, fxTab: "mine", fxRound: null, live: null };

  // ---------- Mẩu giao diện dùng chung ----------
  const FREE_CLUB = { id: "free", name: "Tự do", code: "TD", colors: ["#4a5a52", "#dfe9e3"], venue: "" };
  const club = (id) => (id === "free" ? FREE_CLUB : W.baseClub(S, id));
  const T = FM.Transfers;
  function crest(id, size = "") {
    const c = S ? club(id) : D.clubs.find((x) => x.id === id);
    const [c1, c2] = c.colors || ["#1fa865", "#fff"];
    return `<span class="crest ${size}" style="--c1:${c1};--c2:${c2}">${esc((c.code || "").replace(/FC$/, "").slice(0, 5))}</span>`;
  }
  function stars(ca) {
    const v = FM.stars(ca);
    let h = "";
    for (let i = 1; i <= 5; i++) h += v >= i ? "★" : v >= i - 0.5 ? '<span class="half">★</span>' : '<span class="off">★</span>';
    return `<span class="stars" title="Năng lực ${ca}">${h}</span>`;
  }
  const posTag = (pos) => `<span class="pos ${FM.POS_GROUP[pos]}">${FM.POS_LABEL[pos]}</span>`;
  const formIcons = (form) => `<span class="form">${form.map((r) => `<i class="${r}">${{ W: "T", D: "H", L: "B" }[r]}</i>`).join("")}</span>`;
  function flags(p) {
    let h = "";
    if (p.fs) h += ` <span class="flag fs" title="Chiếm suất ngoại binh">NB</span>`;
    else if (p.vk) h += ` <span class="flag" title="Việt kiều">VK</span>`;
    if (p.nt === "senior") h += ` <span class="flag" title="Tuyển Việt Nam">🇻🇳</span>`;
    else if (p.nt === "u23") h += ` <span class="flag" title="U23 Việt Nam">U23</span>`;
    return h;
  }
  function status(p) {
    if (p.inj) return `<span class="status-inj" title="Chấn thương đến ${FM.fmtDate(p.inj, false)}">✚</span>`;
    if (p.sus) return `<span class="status-sus" title="Treo giò ${p.sus} trận">⛔</span>`;
    return "";
  }
  const moraleIcon = (m) => (m >= 75 ? "😀" : m >= 58 ? "🙂" : m >= 42 ? "😐" : m >= 28 ? "🙁" : "😠");
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 2600);
  }
  let saveTimer = 0;
  function persist(now) {
    clearTimeout(saveTimer);
    const run = () => S && FM.Save.store(S);
    if (now) return run();
    saveTimer = setTimeout(run, 400);
  }

  // ---------- Khung ----------
  function render() {
    const app = $("#app");
    if (ui.view === "start") app.innerHTML = viewStart();
    else if (ui.view === "pick") app.innerHTML = viewPick();
    else if (ui.view === "seasonEnd") app.innerHTML = viewSeasonEnd();
    else if (ui.view === "sacked") app.innerHTML = viewSacked();
    else app.innerHTML = viewTop() + `<div class="page">${TABS[ui.tab].view()}</div>` + viewNav();
    if (S) {
      const c = club(S.user);
      document.documentElement.style.setProperty("--club1", c.colors[0]);
      document.documentElement.style.setProperty("--club2", c.colors[1]);
    }
  }
  function viewTop() {
    const c = W.club(S, S.user);
    const started = S.fx.some((f) => f.done && f.lg === c.league);
    const pos = started ? `hạng ${W.position(S, S.user)}` : "chưa đá";
    return `<header class="top">
      ${crest(S.user)}
      <div class="grow">
        <div class="club ellipsis">${esc(c.name)}</div>
        <div class="sub">${FM.fmtDate(S.date)} · ${W.leagueName(c.league)} · ${pos}</div>
      </div>
      <button class="btn primary go" data-act="go">Tiếp tục ▶</button>
    </header>`;
  }
  const TABS = {
    home: { icon: "🏠", label: "Trang chủ", view: viewHome },
    squad: { icon: "👕", label: "Đội hình", view: viewSquad },
    tactics: { icon: "🧠", label: "Lối chơi", view: viewTactics },
    market: { icon: "💸", label: "Thị trường", view: viewMarket },
    fixtures: { icon: "📅", label: "Lịch", view: viewFixtures },
    table: { icon: "🏆", label: "BXH", view: viewTable },
    club: { icon: "🏟️", label: "CLB", view: viewClub },
  };
  function viewNav() {
    const unread = S.inbox.filter((m) => !m.r).length;
    const offers = S.tr ? S.tr.offers.filter((o) => o.status === "open").length : 0;
    const badge = (k) => (k === "home" && unread ? `<b class="badge">${unread}</b>` : k === "market" && offers ? `<b class="badge">${offers}</b>` : "");
    return `<nav class="nav">${Object.entries(TABS)
      .map(([k, t]) => `<button data-act="tab" data-t="${k}" class="${ui.tab === k ? "on" : ""}"><span>${t.icon}</span>${t.label}${badge(k)}</button>`)
      .join("")}</nav>`;
  }

  // ---------- Màn mở đầu ----------
  function viewStart() {
    const sv = savedInfo && savedInfo.state;
    const svClub = sv && (sv.extraClubs[sv.user] || D.clubs.find((c) => c.id === sv.user));
    return `<a class="back" href="../../index.html">← Về GameVui</a>
    <div class="hero">
      <div class="ball">⚽</div>
      <h1>Bóng Đá Việt <em>Manager</em></h1>
      <p>Dẫn dắt một CLB ở V.League 1 hoặc V.League 2 mùa ${W.label({ season: D.meta.season })}. Dữ liệu cầu thủ thật từ VPF, ${D.players.length} cầu thủ, ${D.clubs.length} CLB.</p>
    </div>
    <div class="page" style="max-width:460px;margin:0 auto">
      ${sv ? `<button class="btn primary block" data-act="resume">▶ Tiếp tục: ${esc(svClub ? svClub.name : "")} · ${FM.fmtDate(sv.date, false)}</button>` : ""}
      <button class="btn ${sv ? "" : "primary"} block" data-act="newgame">Ván mới</button>
      <button class="btn block" data-act="import">Nhập mã save từ trình duyệt khác</button>
      <p class="small muted center">Ván chơi tự lưu trong trình duyệt này. Muốn chơi tiếp ở trình duyệt / máy khác: vào CLB → "Xuất mã save" rồi dán mã ở đây.</p>
    </div>`;
  }
  function viewPick() {
    const clubs = D.clubs.filter((c) => c.league === ui.pickLeague).sort((a, b) => b.strength - a.strength);
    const sel = ui.pickClub && D.clubs.find((c) => c.id === ui.pickClub);
    return `<a class="back" href="#" data-act="to-start">← Quay lại</a>
    <div class="page">
      <h2 class="t" style="margin:4px 0 0;font-size:28px">Chọn câu lạc bộ</h2>
      <div class="tabs">
        <button data-act="pick-league" data-l="${V1}" class="${ui.pickLeague === V1 ? "on" : ""}">V.League 1</button>
        <button data-act="pick-league" data-l="${V2}" class="${ui.pickLeague === V2 ? "on" : ""}">V.League 2 (Hạng Nhất)</button>
      </div>
      <div class="clubpick">${clubs
        .map(
          (c, i) => `<button class="clubbtn ${ui.pickClub === c.id ? "on" : ""}" data-act="pick-club" data-id="${c.id}">
          ${crestPlain(c)}
          <span class="grow"><b class="ellipsis" style="display:block">${esc(c.name)}</b>
          <span class="small muted">${stars(c.strength)} · ${esc(c.venue || "")}</span></span>
          <span class="pill">#${i + 1}</span></button>`,
        )
        .join("")}</div>
      ${
        sel
          ? `<div class="card"><div class="card-b row">${crestPlain(sel, "lg")}<div class="grow">
          <div class="t" style="font-size:22px">${esc(sel.name)}</div>
          <div class="small muted">${esc(sel.venue || "")} (${sel.capacity.toLocaleString("vi-VN")} chỗ) · HLV hiện tại: ${esc(sel.coach || "—")}</div>
          <div class="small">Sức mạnh ${sel.strength} · Ngân sách ${FM.fmtMoney(sel.budget * 2.5)} · ${D.players.filter((p) => p.c === sel.id).length} cầu thủ</div>
          </div></div><div class="card-b"><button class="btn primary block" data-act="start-game">Dẫn dắt ${esc(sel.name)}</button></div></div>`
          : `<p class="muted center">Chọn một CLB để xem thông tin.</p>`
      }
    </div>`;
  }
  function crestPlain(c, size = "") {
    return `<span class="crest ${size}" style="--c1:${c.colors[0]};--c2:${c.colors[1]}">${esc((c.code || "").replace(/FC$/, "").slice(0, 5))}</span>`;
  }

  // ---------- Trang chủ ----------
  function viewHome() {
    const c = W.club(S, S.user);
    const f = W.nextFixture(S, S.user);
    let next = `<div class="card-b muted">Không còn trận nào trong mùa.</div>`;
    if (f) {
      const opp = f.h === S.user ? f.a : f.h;
      const tH = f.po ? null : W.table(S, f.lg);
      const posOf = (id) => (tH ? `hạng ${tH.findIndex((r) => r.id === id) + 1}` : "");
      next = `<div class="next">
        <div class="team">${crest(f.h, "lg")}<span>${esc(club(f.h).name)}</span><span class="small muted">${posOf(f.h)}</span>${formIcons(S.clubs[f.h].form.slice(-5))}</div>
        <div><div class="vs">VS</div><div class="small muted">${FM.fmtDate(f.d)}</div><div class="pill ${f.po ? "gold" : ""}">${f.po ? "Play-off" : `Vòng ${f.rd}`}</div></div>
        <div class="team">${crest(f.a, "lg")}<span>${esc(club(f.a).name)}</span><span class="small muted">${posOf(f.a)}</span>${formIcons(S.clubs[f.a].form.slice(-5))}</div>
      </div>
      <div class="card-b row" style="border-top:1px solid var(--line)"><span class="small muted grow">${f.h === S.user ? "Sân nhà" : "Sân khách"} · ${esc(club(f.h).venue || "")} · ${FM.daysBetween(S.date, f.d) === 0 ? "<b>Hôm nay!</b>" : `còn ${FM.daysBetween(S.date, f.d)} ngày`}</span><button class="btn sm" data-act="club-view" data-id="${opp}">Xem đối thủ</button></div>`;
    }
    const pos = W.position(S, S.user);
    const conf = Math.round(c.conf);
    const table = W.table(S, c.league);
    const me = table.findIndex((r) => r.id === S.user);
    const from = FM.clamp(me - 2, 0, Math.max(0, table.length - 5));
    return `<div class="card"><h3>Trận tiếp theo</h3>${next}</div>
    <div class="grid2">
      <div class="card"><h3>Ban lãnh đạo</h3><div class="card-b" style="display:grid;gap:8px">
        <div>Mục tiêu: <b>${esc(c.obj.label)}</b> <span class="small muted">(hạng ${c.obj.target} trở lên)</span></div>
        <div class="row small"><span class="grow">Hiện tại: hạng ${pos}</span>${pos <= c.obj.target ? '<span class="pill green">Đúng hướng</span>' : '<span class="pill red">Chưa đạt</span>'}</div>
        <div class="small muted">Mức tin tưởng ${conf}/100</div>
        <div class="bar"><i style="width:${conf}%;background:${conf >= 50 ? "var(--accent)" : conf >= 25 ? "var(--orange)" : "var(--red)"}"></i></div>
      </div></div>
      <div class="card"><h3>${W.leagueName(c.league)}</h3>${miniTable(table.slice(from, from + 5), from)}</div>
    </div>
    <div class="card"><h3>Hộp thư <span class="grow"></span>${S.inbox.some((m) => !m.r) ? `<button class="link small" data-act="read-all">Đánh dấu đã đọc</button>` : ""}</h3>
      ${S.inbox.length ? S.inbox.slice(0, 25).map(mailRow).join("") : `<div class="card-b muted">Chưa có thư.</div>`}
    </div>`;
  }
  const MAIL_ICON = { board: "🏛️", result: "⚽", medical: "🚑", discipline: "🟥", finance: "💰", league: "🏆", transfer: "🔁", contract: "📝", news: "📰" };
  function mailRow(m) {
    const body = esc(m.b).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    return `<details class="mail ${m.r ? "" : "unread"}" data-mail="${m.id}">
      <summary><span class="ico">${MAIL_ICON[m.k] || "✉️"}</span><span class="grow"><span class="ttl ellipsis" style="display:block">${esc(m.t)}</span><span class="small muted">${FM.fmtDate(m.d)}</span></span></summary>
      <div class="body">${body}</div></details>`;
  }
  function miniTable(rows, offset) {
    return `<table><tbody>${rows
      .map((r, i) => `<tr class="${r.id === S.user ? "me" : ""} click" data-act="club-view" data-id="${r.id}"><td>${offset + i + 1}</td><td class="l"><span class="tclub">${crest(r.id, "sm")}<span class="ellipsis">${esc(club(r.id).name)}</span></span></td><td>${r.p}</td><td>${r.gd > 0 ? "+" : ""}${r.gd}</td><td><b>${r.pts}</b></td></tr>`)
      .join("")}</tbody></table>`;
  }

  // ---------- Đội hình ----------
  function cleanLineup() {
    const c = S.clubs[S.user];
    const ids = new Set(Object.keys(S.p).filter((id) => S.p[id].c === S.user));
    const n = FM.FORMATIONS[c.formation].length;
    c.lineup = Array.from({ length: n }, (_, i) => (c.lineup && ids.has(c.lineup[i]) ? c.lineup[i] : null));
    c.bench = (c.bench || []).filter((id) => ids.has(id) && !c.lineup.includes(id)).slice(0, FM.BENCH_SIZE);
  }
  function viewSquad() {
    cleanLineup();
    const c = S.clubs[S.user];
    const squad = W.squad(S, S.user);
    const byId = Object.fromEntries(squad.map((p) => [p.id, p]));
    const slots = FM.FORMATIONS[c.formation];
    const foreign = c.lineup.filter((id) => id && byId[id].fs).length;
    const pitch = slots
      .map(([role, x, y], i) => {
        const p = byId[c.lineup[i]];
        const sel = ui.sel && ui.sel.t === "xi" && ui.sel.i === i;
        const bad = p && (!p.available || (p.fs && foreign > FM.MAX_FOREIGN_ON_PITCH));
        const fam = p ? FM.familiarity(p, role) : 1;
        return `<button class="slot ${role === "GK" ? "gk" : ""} ${p ? "" : "empty"} ${sel ? "sel" : ""} ${bad ? "warn" : ""}" style="left:${x}%;top:${100 - y}%" data-act="slot" data-t="xi" data-i="${i}">
          <span class="shirt">${p ? (p.no ?? "?") : "+"}</span>
          <span class="nm">${p ? esc(p.sn) : "Trống"}</span>
          ${p ? `<span class="fitbar"><i style="width:${p.fit}%;background:${p.fit > 75 ? "var(--accent)" : p.fit > 55 ? "var(--orange)" : "var(--red)"}"></i></span>` : ""}
          <span class="rl" style="${fam < 0.9 ? "color:var(--orange)" : ""}">${FM.POS_LABEL[role]}${fam < 0.9 ? " ⚠" : ""}</span>
        </button>`;
      })
      .join("");
    const bench = Array.from({ length: FM.BENCH_SIZE }, (_, i) => {
      const p = byId[c.bench[i]];
      const sel = ui.sel && ui.sel.t === "bench" && ui.sel.i === i;
      return `<button class="benchslot ${sel ? "sel" : ""}" data-act="slot" data-t="bench" data-i="${i}">${p ? `${posTag(p.pos)} <b class="ellipsis">${esc(p.sn)}</b>` : `<span class="muted">+ Dự bị ${i + 1}</span>`}</button>`;
    }).join("");
    const order = ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LM", "RM", "LW", "RW", "ST"];
    const rows = [...squad]
      .sort((a, b) => order.indexOf(a.pos) - order.indexOf(b.pos) || b.ca - a.ca)
      .map((p) => {
        const inXI = c.lineup.includes(p.id);
        const onB = c.bench.includes(p.id);
        return `<tr class="click ${inXI ? "inxi" : onB ? "onbench" : ""}" data-act="prow" data-id="${p.id}">
          <td>${posTag(p.pos)}</td>
          <td class="l"><b>${esc(p.sn)}</b>${flags(p)} ${status(p)}<div class="small muted">${p.no ?? "–"} · ${p.age} tuổi${inXI ? " · đá chính" : onB ? " · dự bị" : ""}</div></td>
          <td>${stars(p.ca)}</td>
          <td class="small" style="color:${p.fit > 75 ? "var(--accent)" : p.fit > 55 ? "var(--orange)" : "var(--red)"}">${Math.round(p.fit)}%</td>
          <td>${moraleIcon(p.mor)}</td>
          <td><button class="btn sm" data-act="info" data-id="${p.id}">ⓘ</button></td>
        </tr>`;
      })
      .join("");
    return `<div class="card"><h3>Sơ đồ</h3><div class="card-b">${formationSeg(c.formation)}</div></div>
    <div class="card"><h3>Đội hình ra sân <span class="grow"></span><span class="pill ${foreign > FM.MAX_FOREIGN_ON_PITCH ? "red" : ""}">Ngoại binh ${foreign}/${FM.MAX_FOREIGN_ON_PITCH}</span></h3>
      <div class="card-b" style="display:grid;gap:10px">
        <p class="small muted" style="margin:0">${ui.sel ? "Đã chọn một ô — bấm một cầu thủ trong danh sách (hoặc ô khác) để đưa vào / đổi chỗ." : "Bấm một ô trên sân hoặc ghế dự bị, rồi bấm cầu thủ ở danh sách bên dưới để xếp vào."}</p>
        <div class="pitch">${pitch}</div>
        <div class="row wrap"><button class="btn sm primary" data-act="auto">⚡ Tự xếp đội hình tốt nhất</button>${ui.sel ? `<button class="btn sm" data-act="unsel">Bỏ chọn</button>` : ""}${ui.sel && ui.sel.t === "bench" && c.bench[ui.sel.i] ? `<button class="btn sm" data-act="bench-clear">Bỏ khỏi dự bị</button>` : ""}</div>
        <div class="small muted">Dự bị (tối đa ${FM.BENCH_SIZE}, thay được ${FM.MAX_SUBS} người mỗi trận)</div>
        <div class="bench">${bench}</div>
      </div></div>
    <div class="card"><h3>Cầu thủ (${squad.length})</h3><div class="scroll-x"><table class="plist"><thead><tr><th>VT</th><th class="l">Tên</th><th>Năng lực</th><th>Thể lực</th><th>Tâm lý</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  function formationSeg(cur) {
    return `<div class="seg">${Object.keys(FM.FORMATIONS)
      .map((f) => `<button class="${f === cur ? "on" : ""}" data-act="formation" data-f="${f}">${f}</button>`)
      .join("")}</div>`;
  }
  // đặt cầu thủ vào ô đang chọn (đổi chỗ nếu cầu thủ đang ở ô khác)
  function assign(id, target) {
    const c = S.clubs[S.user];
    const where = (pid) => {
      const i = c.lineup.indexOf(pid);
      if (i >= 0) return { t: "xi", i };
      const b = c.bench.indexOf(pid);
      return b >= 0 ? { t: "bench", i: b } : null;
    };
    const get = (loc) => (loc.t === "xi" ? c.lineup[loc.i] : c.bench[loc.i]);
    const put = (loc, v) => {
      if (loc.t === "xi") c.lineup[loc.i] = v;
      else c.bench[loc.i] = v;
    };
    const from = where(id);
    const cur = get(target);
    put(target, id);
    if (from) put(from, cur ?? null);
    c.bench = c.bench.filter(Boolean);
    const p = W.player(S, id);
    if (!p.available) toast(`${p.sn} ${p.inj ? "đang chấn thương" : "đang bị treo giò"} — sẽ được thay khi vào trận.`);
    persist();
  }
  function autoLineup() {
    const c = S.clubs[S.user];
    const pick = FM.autoPick(W.squad(S, S.user), c.formation);
    c.lineup = pick.lineup;
    c.bench = pick.bench;
    persist();
  }

  // ---------- Chiến thuật ----------
  const TACTIC_HELP = {
    mentality: "Tấn công nhiều tạo nhiều cơ hội hơn nhưng để lộ khoảng trống phía sau.",
    pressing: "Pressing cao giành lại bóng sớm, nhưng cầu thủ mệt nhanh và dễ phạm lỗi.",
    tempo: "Nhịp nhanh tạo nhiều tình huống hơn nhưng chất lượng mỗi cơ hội thấp hơn.",
    passing: "Bóng dài hợp với tiền đạo cao to, đánh đầu tốt; chuyền ngắn giữ bóng lâu hơn.",
  };
  function viewTactics() {
    const c = S.clubs[S.user];
    return `<div class="card"><h3>Sơ đồ</h3><div class="card-b">${formationSeg(c.formation)}<p class="small muted" style="margin:8px 0 0">Đổi sơ đồ sẽ tự xếp lại đội hình hợp nhất; bạn có thể chỉnh lại ở mục Đội hình.</p></div></div>
    <div class="card"><h3>Chỉ đạo chiến thuật</h3>
      ${Object.entries(FM.TACTIC_OPTIONS)
        .map(
          ([k, opts]) => `<div class="field"><label>${FM.TACTIC_LABEL[k]}</label><div class="seg">${opts
            .map((o, i) => `<button class="${c.tactics[k] === i ? "on" : ""}" data-act="tac" data-k="${k}" data-v="${i}">${o}</button>`)
            .join("")}</div><div class="small muted">${TACTIC_HELP[k]}</div></div>`,
        )
        .join("")}
    </div>
    <div class="card"><h3>Luật cần nhớ</h3><div class="card-b small muted" style="display:grid;gap:4px">
      <div>• Tối đa ${FM.MAX_FOREIGN_ON_PITCH} ngoại binh có mặt trên sân cùng lúc (Việt kiều, cầu thủ nhập tịch không tính).</div>
      <div>• Thẻ đỏ: nghỉ 1–2 trận. Tích đủ 4 thẻ vàng: nghỉ 1 trận.</div>
      <div>• Mỗi trận thay tối đa ${FM.MAX_SUBS} người. Thể lực hồi dần theo ngày.</div>
    </div></div>`;
  }

  // ---------- Lịch thi đấu ----------
  function viewFixtures() {
    const tabs = `<div class="tabs"><button data-act="fx-tab" data-t="mine" class="${ui.fxTab === "mine" ? "on" : ""}">Đội của tôi</button><button data-act="fx-tab" data-t="${V1}" class="${ui.fxTab === V1 ? "on" : ""}">V.League 1</button><button data-act="fx-tab" data-t="${V2}" class="${ui.fxTab === V2 ? "on" : ""}">V.League 2</button></div>`;
    if (ui.fxTab === "mine") {
      const list = S.fx.filter((f) => f.h === S.user || f.a === S.user).sort((a, b) => a.d.localeCompare(b.d));
      return tabs + `<div class="card"><table><tbody>${list.map((f) => fixtureRow(f, true)).join("")}</tbody></table></div>`;
    }
    const lg = ui.fxTab;
    const rounds = Math.max(...S.fx.filter((f) => f.lg === lg).map((f) => f.rd));
    if (!ui.fxRound) {
      const pending = S.fx.filter((f) => f.lg === lg && !f.done).sort((a, b) => a.rd - b.rd)[0];
      ui.fxRound = pending ? pending.rd : rounds;
    }
    const list = S.fx.filter((f) => f.lg === lg && f.rd === ui.fxRound);
    return (
      tabs +
      `<div class="card"><div class="card-h"><button class="btn sm" data-act="round" data-d="-1" ${ui.fxRound <= 1 ? "disabled" : ""}>‹</button><span class="grow center">Vòng ${ui.fxRound} · ${list[0] ? FM.fmtDate(list[0].d) : ""}</span><button class="btn sm" data-act="round" data-d="1" ${ui.fxRound >= rounds ? "disabled" : ""}>›</button></div>
      <table><tbody>${list.map((f) => fixtureRow(f, false)).join("")}</tbody></table></div>`
    );
  }
  function fixtureRow(f, mine) {
    const score = f.done ? `<b>${f.hg} – ${f.ag}</b>${f.pens ? `<div class="small muted">pen ${f.pens[0]}–${f.pens[1]}</div>` : ""}` : `<span class="muted small">${FM.fmtShortDate(f.d)}</span>`;
    let res = "";
    if (mine && f.done) {
      const my = f.h === S.user ? f.hg : f.ag;
      const op = f.h === S.user ? f.ag : f.hg;
      res = my > op ? '<span class="pill green">T</span>' : my < op ? '<span class="pill red">B</span>' : '<span class="pill">H</span>';
    }
    return `<tr class="${f.h === S.user || f.a === S.user ? "me" : ""} ${f.done ? "click" : ""}" ${f.done ? `data-act="fx-detail" data-id="${f.id}"` : ""}>
      ${mine ? `<td class="small muted">${f.po ? "PO" : `V${f.rd}`}</td>` : ""}
      <td class="right"><span class="tclub" style="justify-content:flex-end;margin-left:auto"><span class="ellipsis">${esc(club(f.h).name)}</span>${crest(f.h, "sm")}</span></td>
      <td>${score}</td>
      <td class="l"><span class="tclub">${crest(f.a, "sm")}<span class="ellipsis">${esc(club(f.a).name)}</span></span></td>
      ${mine ? `<td>${res}</td>` : ""}
    </tr>`;
  }

  // ---------- Thị trường chuyển nhượng ----------
  ui.mk = { tab: "search", group: "", where: "all", sort: "ca", maxAge: "", maxFee: "", limit: 40 };
  function viewMarket() {
    T.ensure(S);
    const win = T.window(S);
    const c = S.clubs[S.user];
    const bill = T.wageBill(S, S.user);
    const open = S.tr.offers.filter((o) => o.status === "open");
    const tab = (k, label) => `<button data-act="mk-tab" data-t="${k}" class="${ui.mk.tab === k ? "on" : ""}">${label}</button>`;
    const head = `<div class="card"><div class="card-b kv">
        <div><small>Kỳ chuyển nhượng</small><b style="color:${win.open ? "var(--accent)" : "var(--orange)"}">${win.open ? `Mở đến ${FM.fmtDate(win.until, false)}` : `Đóng${win.next ? ` · mở ${FM.fmtDate(win.next, false)}` : ""}`}</b></div>
        <div><small>Số dư</small><b>${FM.fmtMoney(c.bal)}</b></div>
        <div><small>Quỹ lương / tháng</small><b style="color:${bill > c.wageCap ? "var(--red)" : "var(--text)"}">${FM.fmtWage(bill)} / ${FM.fmtWage(c.wageCap)}</b></div>
      </div>${win.open ? "" : `<div class="card-b small muted" style="padding-top:0">Ngoài kỳ chuyển nhượng vẫn ký được cầu thủ tự do.</div>`}</div>
      <div class="tabs">${tab("search", "Tìm cầu thủ")}${tab("offers", `Đề nghị${open.length ? ` (${open.length})` : ""}`)}${tab("contracts", "Hợp đồng")}${tab("news", "Tin tức")}</div>`;
    if (ui.mk.tab === "offers") return head + viewOffers();
    if (ui.mk.tab === "contracts") return head + viewContracts();
    if (ui.mk.tab === "news") return head + viewTransferNews();
    const f = ui.mk;
    const list = T.search(S, { group: f.group, where: f.where === "listed" ? "all" : f.where, listed: f.where === "listed", sort: f.sort, maxAge: +f.maxAge || 0, maxFee: +f.maxFee || 0 });
    const groups = [["", "Tất cả"], ["GK", "Thủ môn"], ["DF", "Hậu vệ"], ["MF", "Tiền vệ"], ["FW", "Tiền đạo"]];
    const sel = (name, opts, cur) => `<select data-change="mk" data-k="${name}" class="btn sm">${opts.map(([v, l]) => `<option value="${v}" ${String(cur) === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
    return (
      head +
      `<div class="card"><div class="card-b" style="display:grid;gap:8px">
        <div class="seg">${groups.map(([g, l]) => `<button class="${f.group === g ? "on" : ""}" data-act="mk-group" data-g="${g}">${l}</button>`).join("")}</div>
        <div class="row wrap">
          ${sel("where", [["all", "Mọi CLB"], ["v1", "V.League 1"], ["v2", "V.League 2"], ["free", "Cầu thủ tự do"], ["listed", "Đang rao bán"]], f.where)}
          ${sel("sort", [["ca", "Năng lực cao"], ["pot", "Tiềm năng cao"], ["value", "Giá trị cao"], ["age", "Trẻ nhất"]], f.sort)}
          ${sel("maxAge", [["", "Mọi tuổi"], ["21", "≤ 21 tuổi"], ["23", "≤ 23 tuổi"], ["27", "≤ 27 tuổi"], ["30", "≤ 30 tuổi"]], f.maxAge)}
          ${sel("maxFee", [["", "Mọi mức giá"], ["1", "≤ 1 tỷ"], ["3", "≤ 3 tỷ"], ["5", "≤ 5 tỷ"], ["10", "≤ 10 tỷ"]], f.maxFee)}
        </div>
      </div>
      <div class="scroll-x"><table class="plist"><thead><tr><th>VT</th><th class="l">Cầu thủ</th><th>Năng lực · giá trị</th></tr></thead><tbody>${
        list
          .slice(0, f.limit)
          .map(
            (p) => `<tr class="click" data-act="info" data-id="${p.id}"><td>${posTag(p.pos)}</td><td class="l" style="white-space:normal"><b>${esc(p.sn)}</b>${flags(p)} ${status(p)}${S.p[p.id].listed ? ' <span class="pill gold">Rao bán</span>' : ""}<div class="small muted">${p.age} tuổi · ${esc(club(p.c).name)}${p.ce ? ` · HĐ ${p.ce.slice(0, 4)}` : ""}</div></td><td>${stars(p.ca)}<div class="small muted">TN ${stars(p.pa)}</div><b class="small">${FM.fmtMoney(p.val)}</b></td></tr>`,
          )
          .join("") || `<tr><td class="muted">Không có cầu thủ phù hợp.</td></tr>`
      }</tbody></table></div>
      ${list.length > f.limit ? `<div class="card-b"><button class="btn block sm" data-act="mk-more">Xem thêm (${list.length - f.limit})</button></div>` : ""}</div>`
    );
  }
  function viewOffers() {
    const open = S.tr.offers.filter((o) => o.status === "open");
    const past = S.tr.offers.filter((o) => o.status !== "open").slice(-8).reverse();
    const neg = S.tr.neg && W.player(S, S.tr.neg.pid);
    return `${
      neg
        ? `<div class="card"><h3>Đang đàm phán</h3><div class="card-b row">${posTag(neg.pos)}<div class="grow"><b>${esc(neg.n)}</b><div class="small muted">Đã thống nhất phí ${FM.fmtMoney(S.tr.neg.fee)} với ${esc(club(neg.c).name)} — còn hợp đồng cá nhân</div></div><button class="btn sm primary" data-act="contract" data-id="${neg.id}" data-kind="sign">Đàm phán lương</button></div></div>`
        : ""
    }
    <div class="card"><h3>Đề nghị mua cầu thủ của bạn</h3>${
      open.length
        ? open
            .map((o) => {
              const p = W.player(S, o.pid);
              return `<div class="card-b" style="border-top:1px solid var(--line);display:grid;gap:8px"><div class="row">${crest(o.from, "sm")}<div class="grow"><b>${esc(club(o.from).name)}</b> muốn mua <b class="link" data-act="info" data-id="${p.id}">${esc(p.sn)}</b><div class="small muted">Giá trị ${FM.fmtMoney(p.val)} · hết hạn ${FM.fmtDate(o.exp, false)}</div></div><b style="font-size:16px">${FM.fmtMoney(o.fee)}</b></div>
              <div class="row wrap"><button class="btn sm primary" data-act="offer-accept" data-id="${o.id}">Đồng ý bán</button><button class="btn sm" data-act="offer-counter" data-id="${o.id}">Ra giá</button><button class="btn sm danger" data-act="offer-reject" data-id="${o.id}">Từ chối</button></div></div>`;
            })
            .join("")
        : `<div class="card-b muted">Chưa có đề nghị nào. Rao bán cầu thủ (trong hồ sơ cầu thủ) để thu hút người mua.</div>`
    }</div>
    ${past.length ? `<div class="card"><h3>Đã xử lý</h3><table><tbody>${past.map((o) => `<tr><td class="l">${esc(W.player(S, o.pid)?.sn || "?")}</td><td class="l small">${esc(club(o.from).name)}</td><td>${FM.fmtMoney(o.fee)}</td><td class="small">${{ accepted: "Đã bán", rejected: "Từ chối", expired: "Hết hạn" }[o.status] || o.status}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  }
  function viewContracts() {
    const end = `${S.season + 1}-06-30`;
    const squad = W.squad(S, S.user).sort((a, b) => (a.ce || "").localeCompare(b.ce || "") || b.ca - a.ca);
    return `<div class="card"><h3>Hợp đồng (${squad.length} cầu thủ)</h3><div class="scroll-x"><table class="plist"><thead><tr><th>VT</th><th class="l">Cầu thủ</th><th>Lương</th><th>Hết hạn</th><th></th></tr></thead><tbody>${squad
      .map(
        (p) => `<tr><td>${posTag(p.pos)}</td><td class="l click" data-act="info" data-id="${p.id}"><b>${esc(p.sn)}</b>${flags(p)}${S.p[p.id].listed ? ' <span class="pill gold">Rao bán</span>' : ""}<div class="small muted">${p.age} tuổi · ${T.ROLE_LABEL[T.role(S, p)]}</div></td><td class="small">${FM.fmtWage(p.wage)}</td><td class="small" style="color:${p.ce <= end ? "var(--red)" : "var(--text)"}">${FM.fmtDate(p.ce, false)}</td><td><button class="btn sm" data-act="renew" data-id="${p.id}">Gia hạn</button></td></tr>`,
      )
      .join("")}</tbody></table></div><div class="card-b small muted">Hợp đồng hết hạn ngày 30/6 (màu đỏ: hết hạn cuối mùa này). Không gia hạn thì cầu thủ ra đi tự do.</div></div>`;
  }
  function viewTransferNews() {
    const log = S.tr.log.slice(0, 60);
    return `<div class="card"><h3>Chuyển nhượng gần đây</h3><table><tbody>${
      log
        .map((e) => `<tr class="${e.from === S.user || e.to === S.user ? "me" : ""} ${S.p[e.pid] ? "click" : ""}" ${S.p[e.pid] ? `data-act="info" data-id="${e.pid}"` : ""}><td class="small muted">${FM.fmtShortDate(e.d)}</td><td class="l"><b>${esc(e.name)}</b><div class="small muted">${esc(club(e.from).name)} → ${esc(club(e.to).name)}</div></td><td class="nowrap">${e.to === "free" ? "Thanh lý" : e.fee ? FM.fmtMoney(e.fee) : "Tự do"}</td></tr>`)
        .join("") || `<tr><td class="muted">Chưa có vụ chuyển nhượng nào.</td></tr>`
    }</tbody></table></div>`;
  }

  // ---------- Hộp thoại đàm phán ----------
  const stepper = (id, value, steps, unit) =>
    `<div class="row wrap">${steps.filter((x) => x < 0).map((x) => `<button class="btn sm" data-act="adj" data-for="${id}" data-step="${x}">${x}</button>`).join("")}
     <input id="${id}" type="number" step="any" value="${value}" class="btn" style="width:110px;text-align:center"> <span class="small muted">${unit}</span>
     ${steps.filter((x) => x > 0).map((x) => `<button class="btn sm" data-act="adj" data-for="${id}" data-step="${x}">+${x}</button>`).join("")}</div>`;
  function bidModal(pid, fee) {
    const p = W.player(S, pid);
    openModal(`<div class="sheet-h">${crest(p.c)}<div class="grow"><div class="t" style="font-size:20px">Hỏi mua ${esc(p.sn)}</div><div class="small muted">${esc(club(p.c).name)} · ${T.ROLE_LABEL[T.role(S, p)]} · HĐ đến ${FM.fmtDate(p.ce, false)}</div></div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b">
        <div class="kv"><div><small>Giá trị ước tính</small><b>${FM.fmtMoney(p.val)}</b></div><div><small>Số dư của bạn</small><b>${FM.fmtMoney(S.clubs[S.user].bal)}</b></div><div><small>Lương hiện tại</small><b>${FM.fmtWage(p.wage)}</b></div></div>
        <label class="small muted">Phí chuyển nhượng đề nghị (tỷ VND)</label>
        ${stepper("feeIn", fee ?? p.val, [-1, -0.5, -0.1, 0.1, 0.5, 1], "tỷ")}
        <div id="negMsg" class="small"></div>
        <button class="btn primary block" data-act="bid-send" data-id="${pid}">Gửi đề nghị</button>
      </div>`);
  }
  function contractModal(pid, kind) {
    const p = W.player(S, pid);
    const dem = T.demand(S, p, S.user, kind);
    const c = S.clubs[S.user];
    const title = kind === "renew" ? `Gia hạn với ${p.sn}` : `Hợp đồng với ${p.sn}`;
    if (dem.refuse) {
      openModal(`<div class="sheet-h"><div class="grow t" style="font-size:20px">${esc(title)}</div><button class="x" data-act="close">✕</button></div><div class="sheet-b"><div class="pill red" style="white-space:normal">${esc(dem.refuse)}</div><button class="btn block" data-act="close">Đóng</button></div>`);
      return;
    }
    const bill = T.wageBill(S, S.user) - (kind === "renew" ? p.wage : 0);
    openModal(`<div class="sheet-h">${crest(p.c)}<div class="grow"><div class="t" style="font-size:20px">${esc(title)}</div><div class="small muted">${p.age} tuổi · ${FM.POS_NAME[p.pos]} · lương hiện tại ${p.free ? "—" : FM.fmtWage(p.wage)}</div></div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b">
        <div class="kv"><div><small>Cầu thủ mong muốn</small><b>${FM.fmtWage(dem.wage)} · ${dem.years} năm</b></div><div><small>Quỹ lương còn trống</small><b style="color:${c.wageCap - bill > 0 ? "var(--accent)" : "var(--red)"}">${FM.fmtWage(c.wageCap - bill)}</b></div>${kind === "sign" && S.tr.neg && S.tr.neg.pid === pid ? `<div><small>Phí đã thống nhất</small><b>${FM.fmtMoney(S.tr.neg.fee)}</b></div>` : ""}</div>
        <label class="small muted">Lương đề nghị (triệu VND / tháng)</label>
        ${stepper("wageIn", Math.round(dem.wage * 0.9), [-10, -5, -1, 1, 5, 10], "tr/tháng")}
        <label class="small muted">Thời hạn</label>
        <div class="seg">${[1, 2, 3, 4, 5].map((y) => `<button data-act="years" data-y="${y}" class="${y === dem.years ? "on" : ""}">${y} năm</button>`).join("")}</div>
        <div id="negMsg" class="small"></div>
        <button class="btn primary block" data-act="contract-send" data-id="${pid}" data-kind="${kind}">Đề nghị hợp đồng</button>
        <div class="small muted">Cầu thủ chỉ chấp nhận tối đa 3 lần trả giá.</div>
      </div>`);
    ui.years = dem.years;
  }
  function counterModal(offerId) {
    const o = S.tr.offers.find((x) => x.id === offerId);
    const p = W.player(S, o.pid);
    openModal(`<div class="sheet-h"><div class="grow t" style="font-size:20px">Ra giá ${esc(p.sn)}</div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b"><div class="small muted">${esc(club(o.from).name)} đang đề nghị ${FM.fmtMoney(o.fee)}. Giá trị ước tính ${FM.fmtMoney(p.val)}. Đòi quá cao họ sẽ rút lui.</div>
      ${stepper("feeIn", Math.round(o.fee * 12) / 10, [-1, -0.5, -0.1, 0.1, 0.5, 1], "tỷ")}
      <button class="btn primary block" data-act="counter-send" data-id="${offerId}">Gửi mức giá</button></div>`);
  }
  function listModal(pid) {
    const p = W.player(S, pid);
    openModal(`<div class="sheet-h"><div class="grow t" style="font-size:20px">Rao bán ${esc(p.sn)}</div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b"><div class="small muted">Giá trị ước tính ${FM.fmtMoney(p.val)}. Cầu thủ đang rao bán được các CLB chú ý hơn trong kỳ chuyển nhượng.</div>
      <label class="small muted">Giá chào bán (tỷ VND)</label>${stepper("feeIn", Math.round(p.val * 11) / 10, [-1, -0.5, -0.1, 0.1, 0.5, 1], "tỷ")}
      <button class="btn primary block" data-act="list-send" data-id="${pid}">Rao bán</button></div>`);
  }
  function releaseModal(pid) {
    const p = W.player(S, pid);
    const cost = T.releaseCost(S, p);
    openModal(`<div class="sheet-h"><div class="grow t" style="font-size:20px">Thanh lý ${esc(p.sn)}?</div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b"><div>${esc(p.n)} sẽ trở thành cầu thủ tự do. CLB phải đền bù một nửa số lương còn lại của hợp đồng: <b>${FM.fmtMoney(cost)}</b>.</div>
      <div class="row"><button class="btn" data-act="close">Huỷ</button><span class="grow"></span><button class="btn danger" data-act="release-send" data-id="${pid}">Thanh lý</button></div></div>`);
  }
  function negMsg(text, ok) {
    const el = $("#negMsg");
    if (el) {
      el.textContent = text;
      el.style.color = ok ? "var(--accent)" : "var(--orange)";
    }
  }

  // ---------- Bảng xếp hạng ----------
  function viewTable() {
    const tabs = `<div class="tabs"><button data-act="table-tab" data-t="${V1}" class="${ui.tableTab === V1 ? "on" : ""}">V.League 1</button><button data-act="table-tab" data-t="${V2}" class="${ui.tableTab === V2 ? "on" : ""}">V.League 2</button><button data-act="table-tab" data-t="scorers" class="${ui.tableTab === "scorers" ? "on" : ""}">Vua phá lưới</button></div>`;
    if (ui.tableTab === "scorers") {
      const block = (lg) => {
        const list = W.topScorers(S, lg, 12);
        return `<div class="card"><h3>${W.leagueName(lg)}</h3><table><tbody>${list.length ? list.map((p, i) => `<tr class="click ${p.c === S.user ? "me" : ""}" data-act="info" data-id="${p.id}"><td>${i + 1}</td><td class="l"><b>${esc(p.sn)}</b>${flags(p)}<div class="small muted">${esc(club(p.c).name)}</div></td><td><b>${p.st.g}</b> <span class="small muted">bàn</span></td><td class="small muted">${p.st.as} kt</td></tr>`).join("") : `<tr><td class="muted">Chưa có bàn thắng.</td></tr>`}</tbody></table></div>`;
      };
      return tabs + block(V1) + block(V2);
    }
    const lg = ui.tableTab;
    const rows = W.table(S, lg);
    const zone = (i) => (lg === V1 ? (i === 13 ? "zone-down" : i === 12 ? "zone-po" : "") : i === 0 ? "zone-up" : i === 1 ? "zone-po" : i === rows.length - 1 ? "zone-down" : "");
    return (
      tabs +
      `<div class="card scroll-x"><table><thead><tr><th>#</th><th class="l">CLB</th><th>Tr</th><th>T</th><th>H</th><th>B</th><th>HS</th><th>Đ</th><th>Phong độ</th></tr></thead><tbody>${rows
        .map(
          (r, i) => `<tr class="click ${zone(i)} ${r.id === S.user ? "me" : ""}" data-act="club-view" data-id="${r.id}"><td>${i + 1}</td><td class="l"><span class="tclub">${crest(r.id, "sm")}<span class="ellipsis">${esc(club(r.id).name)}</span></span></td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gd > 0 ? "+" : ""}${r.gd}</td><td><b>${r.pts}</b></td><td>${formIcons(r.form)}</td></tr>`,
        )
        .join("")}</tbody></table>
      <div class="card-b small muted">${lg === V1 ? "🟨 Hạng 13 đá play-off với hạng nhì V.League 2 · 🟥 Hạng 14 xuống hạng" : "🟩 Vô địch lên V.League 1 · 🟨 Hạng nhì đá play-off · 🟥 Hạng cuối xuống Hạng Nhì"}</div></div>`
    );
  }

  // ---------- CLB ----------
  function viewClub() {
    const c = W.club(S, S.user);
    const squad = W.squad(S, S.user);
    const wages = squad.reduce((a, p) => a + p.wage, 0);
    const value = squad.reduce((a, p) => a + p.val, 0);
    const hist = S.history
      .map((h) => {
        const me = h.table[h.user.league].indexOf(S.user) + 1 || h.user.pos;
        return `<tr><td>${h.season}</td><td>${W.leagueName(h.user.league)}</td><td><b>${me}</b></td><td class="small">${h.user.achieved ? '<span class="pill green">Đạt mục tiêu</span>' : '<span class="pill red">Không đạt</span>'}</td></tr>`;
      })
      .join("");
    return `<div class="card"><div class="card-b row">${crest(S.user, "lg")}<div class="grow"><div class="t" style="font-size:24px">${esc(c.name)}</div><div class="small muted">${esc(c.venue || "")} · ${(c.capacity || 0).toLocaleString("vi-VN")} chỗ · Uy tín ${c.rep}</div></div></div></div>
    <div class="card"><h3>Tài chính</h3><div class="card-b kv">
      <div><small>Số dư</small><b style="color:${c.bal >= 0 ? "var(--accent)" : "var(--red)"}">${FM.fmtMoney(c.bal)}</b></div>
      <div><small>Quỹ lương / tháng</small><b>${FM.fmtMoney(wages / 1000)}</b></div>
      <div><small>Tiền vé mùa này</small><b>${FM.fmtMoney(c.gate)}</b></div>
      <div><small>Giá trị đội hình</small><b>${FM.fmtMoney(value)}</b></div>
    </div></div>
    ${hist ? `<div class="card"><h3>Lịch sử</h3><table><tbody>${hist}</tbody></table></div>` : ""}
    <div class="card"><h3>Lưu game</h3><div class="card-b" style="display:grid;gap:8px">
      <div class="small muted">Ván chơi tự lưu trong trình duyệt sau mỗi lần bấm Tiếp tục và sau mỗi trận. Để chơi tiếp trên trình duyệt / máy khác, xuất mã save rồi dán vào màn hình mở đầu ở bên kia.</div>
      <div class="row wrap"><button class="btn sm primary" data-act="export">Xuất mã save</button><button class="btn sm" data-act="import">Nhập mã save</button><button class="btn sm" data-act="save-now">Lưu ngay</button><button class="btn sm danger" data-act="quit">Về màn hình chính</button></div>
    </div></div>
    <div class="card"><h3>Dữ liệu</h3><div class="card-b small muted">Cầu thủ, CLB, thống kê lấy từ vpf.vn (snapshot ${D.meta.snapshot}). Chỉ số do mô hình riêng của GameVui tính từ số trận, bàn thắng, đội tuyển, sức mạnh CLB.</div></div>`;
  }

  // ---------- Hộp thoại ----------
  function openModal(html) {
    const m = $("#modal");
    m.innerHTML = `<div class="sheet">${html}</div>`;
    m.hidden = false;
  }
  function closeModal() {
    $("#modal").hidden = true;
    $("#modal").innerHTML = "";
  }
  function playerModal(id) {
    const p = W.player(S, id);
    if (!p) return;
    const c = club(p.c);
    T.ensure(S);
    const cls = (v) => (v >= 16 ? "a4" : v >= 12 ? "a3" : v >= 8 ? "a2" : "a1");
    const groups = FM.ATTR_GROUPS.filter(([g]) => (p.pos === "GK" ? g !== "Kỹ thuật" : g !== "Thủ môn"))
      .map(([g, keys]) => `<div><h4>${g}</h4>${keys.map((k) => `<div class="attr"><span>${FM.ATTR_LABEL[k]}</span><b class="${cls(p.a[FM.A[k]])}">${p.a[FM.A[k]]}</b></div>`).join("")}</div>`)
      .join("");
    const st = p.st;
    const avg = st.ap ? (st.rs / st.ap).toFixed(2) : "–";
    const alt = Object.keys(p.alt || {})
      .filter((k) => k !== p.pos)
      .map((k) => FM.POS_NAME[k])
      .join(", ");
    openModal(`<div class="sheet-h">${crest(p.c)}<div class="grow"><div class="t" style="font-size:22px">${esc(p.n)}</div><div class="small muted">${esc(c.name)} · số ${p.no ?? "–"} · ${FM.POS_NAME[p.pos]}</div></div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b">
        <div class="row wrap">${posTag(p.pos)} ${stars(p.ca)} <span class="small muted">tiềm năng</span> ${stars(p.pa)} ${flags(p)} ${status(p)}</div>
        <div class="kv">
          <div><small>Tuổi</small><b>${p.age}</b></div>
          <div><small>Quốc tịch</small><b>${esc(p.nat)}</b></div>
          <div><small>Chiều cao / cân nặng</small><b>${p.h || "?"} cm · ${p.w || "?"} kg</b></div>
          <div><small>Chân thuận</small><b>${{ right: "Phải", left: "Trái", both: "Hai chân" }[p.ft]}</b></div>
          <div><small>Giá trị</small><b>${FM.fmtMoney(p.val)}</b></div>
          <div><small>Lương</small><b>${p.free ? "—" : FM.fmtWage(p.wage)}</b></div>
          <div><small>Hợp đồng đến</small><b>${p.ce ? FM.fmtDate(p.ce, false) : "Tự do"}</b></div>
          ${p.free ? "" : `<div><small>Vai trò ở CLB</small><b>${T.ROLE_LABEL[T.role(S, p)]}${S.p[id].listed ? " · đang rao bán" : ""}</b></div>`}
          <div><small>Thể lực · tâm lý</small><b>${Math.round(p.fit)}% · ${moraleIcon(p.mor)}</b></div>
        </div>
        ${alt ? `<div class="small muted">Vị trí khác: ${esc(alt)}</div>` : ""}
        ${p.inj ? `<div class="pill red">Chấn thương: ${esc(p.injName)} · đến ${FM.fmtDate(p.inj, false)}</div>` : ""}
        ${p.sus ? `<div class="pill gold">Treo giò ${p.sus} trận</div>` : ""}
        <div class="attrs">${groups}</div>
        <div class="kv">
          <div><small>Mùa này</small><b>${st.ap} trận · ${st.g} bàn · ${st.as} kiến tạo</b></div>
          <div><small>Điểm TB · cầu thủ hay nhất</small><b>${avg} · ${st.mm} lần</b></div>
          ${p.ls ? `<div><small>V.League 2025/26 (thật)</small><b>${p.ls.apps} trận · ${p.ls.goals} bàn</b></div>` : ""}
        </div>
        ${playerActions(p)}
      </div>`);
  }
  // nút chuyển nhượng / hợp đồng trong hồ sơ cầu thủ
  function playerActions(p) {
    const win = T.window(S);
    if (p.c === S.user) {
      const listed = S.p[p.id].listed;
      return `<div class="row wrap"><button class="btn sm primary" data-act="renew" data-id="${p.id}">📝 Gia hạn hợp đồng</button><button class="btn sm" data-act="${listed ? "unlist" : "list"}" data-id="${p.id}">${listed ? "Bỏ rao bán" : "🏷️ Rao bán"}</button><button class="btn sm danger" data-act="release" data-id="${p.id}">Thanh lý</button></div>`;
    }
    if (p.free) return `<button class="btn primary block" data-act="sign-free" data-id="${p.id}">✍️ Ký hợp đồng (cầu thủ tự do)</button>`;
    return win.open
      ? `<button class="btn primary block" data-act="bid" data-id="${p.id}">💸 Hỏi mua (giá trị ước tính ${FM.fmtMoney(p.val)})</button>`
      : `<div class="small muted center">Kỳ chuyển nhượng đang đóng${win.next ? ` — mở lại ${FM.fmtDate(win.next, false)}` : ""}.</div>`;
  }
  function clubModal(id) {
    const c = W.club(S, id);
    const squad = W.squad(S, id).sort((a, b) => b.ca - a.ca);
    const pos = W.position(S, id);
    openModal(`<div class="sheet-h">${crest(id)}<div class="grow"><div class="t" style="font-size:22px">${esc(c.name)}</div><div class="small muted">${W.leagueName(c.league)} · hạng ${pos} · ${c.formation} · ${esc(c.venue || "")}</div></div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b"><div class="row small">${formIcons(c.form.slice(-5))}<span class="grow"></span>Sức mạnh ${W.strength(S, id).toFixed(1)}</div>
      <table class="plist"><tbody>${squad.map((p) => `<tr class="click" data-act="info" data-id="${p.id}"><td>${posTag(p.pos)}</td><td class="l"><b>${esc(p.sn)}</b>${flags(p)} ${status(p)}<div class="small muted">${p.age} tuổi</div></td><td>${stars(p.ca)}</td></tr>`).join("")}</tbody></table></div>`);
  }
  function fixtureModal(fid) {
    const f = S.fx.find((x) => x.id === fid);
    const line = (side) =>
      (f.sc || [])
        .filter((x) => x.side === side)
        .map((x) => `${esc(W.player(S, x.id)?.sn || "?")} ${x.min}'`)
        .join(", ") || "—";
    const motm = f.motm && W.player(S, f.motm);
    openModal(`<div class="sheet-h"><div class="grow t" style="font-size:20px">${f.po ? "Play-off" : `Vòng ${f.rd}`} · ${FM.fmtDate(f.d)}</div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b"><div class="next" style="padding:6px 0"><div class="team">${crest(f.h, "lg")}${esc(club(f.h).name)}</div><div class="vs" style="color:var(--text)">${f.hg} – ${f.ag}${f.pens ? `<div class="small muted">pen ${f.pens.join("–")}</div>` : ""}</div><div class="team">${crest(f.a, "lg")}${esc(club(f.a).name)}</div></div>
      <div class="kv"><div><small>⚽ ${esc(club(f.h).name)}</small><b>${line(0)}</b></div><div><small>⚽ ${esc(club(f.a).name)}</small><b>${line(1)}</b></div>${motm ? `<div><small>Cầu thủ hay nhất</small><b>${esc(motm.sn)}</b></div>` : ""}${f.att ? `<div><small>Khán giả</small><b>${f.att.toLocaleString("vi-VN")}</b></div>` : ""}</div></div>`);
  }

  // ---------- Trước trận ----------
  function preMatch(f) {
    const opp = f.h === S.user ? f.a : f.h;
    const fix = W.fixLineup(S, S.user);
    const c = S.clubs[S.user];
    const changed = fix.changed.map((id) => W.player(S, id).sn);
    const missing = W.squad(S, S.user).filter((p) => !p.available && c.lineup.includes(p.id));
    openModal(`<div class="sheet-h"><div class="grow"><div class="t" style="font-size:22px">Ngày thi đấu</div><div class="small muted">${f.po ? "Play-off lên/xuống hạng · sân trung lập" : `${W.leagueName(f.lg)} · Vòng ${f.rd}`}</div></div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b">
        <div class="next" style="padding:4px 0"><div class="team">${crest(f.h, "lg")}${esc(club(f.h).name)}</div><div class="vs">VS</div><div class="team">${crest(f.a, "lg")}${esc(club(f.a).name)}</div></div>
        <div class="kv"><div><small>Sơ đồ của bạn</small><b>${c.formation}</b></div><div><small>Lối chơi</small><b>${FM.TACTIC_OPTIONS.mentality[c.tactics.mentality]}</b></div><div><small>Đối thủ</small><b>${S.clubs[opp].formation} · ${formIcons(S.clubs[opp].form.slice(-5))}</b></div></div>
        ${missing.length ? `<div class="pill red" style="white-space:normal">Không thể ra sân: ${missing.map((p) => esc(p.sn)).join(", ")} → tự thay bằng ${changed.map(esc).join(", ") || "người phù hợp"}.</div>` : ""}
        <div class="row wrap"><button class="btn" data-act="edit-lineup">Chỉnh đội hình</button><span class="grow"></span><button class="btn" data-act="quick">⏩ Mô phỏng nhanh</button><button class="btn primary" data-act="live">▶ Đá trực tiếp</button></div>
      </div>`);
    ui.pending = f.id;
  }

  // ---------- Trận đấu trực tiếp ----------
  function startMatch(live) {
    const f = S.fx.find((x) => x.id === ui.pending);
    closeModal();
    const fix = W.fixLineup(S, S.user);
    S.clubs[S.user].lineup = fix.lineup;
    const m = FM.createMatch(W.sideFor(S, f.h, f.h !== S.user), W.sideFor(S, f.a, f.a !== S.user), { seed: W.matchSeed(S, f) + (live ? 99 : 0), live, neutral: !!f.po });
    const me = f.h === S.user ? 0 : 1;
    if (!live) {
      m.runToEnd();
      return endMatch(f, m, me);
    }
    ui.live = { f, m, me, speed: 1, paused: false, timer: 0, panel: false, subOut: null, done: false };
    renderLive(true);
    loop();
  }
  const SPEEDS = { 1: 330, 2: 150, 4: 55 };
  function loop() {
    const L = ui.live;
    clearTimeout(L.timer);
    if (L.paused || L.done) return;
    const evs = L.m.tick();
    if (L.m.over) {
      L.done = true;
      renderLive();
      return;
    }
    if (L.m.halftime && evs.some((e) => e.type === "half")) {
      L.paused = true;
      L.panel = true;
      toast("Nghỉ giữa hiệp — chỉnh đội nếu cần rồi bấm Tiếp tục");
    }
    if (L.m.pendingInjury && L.m.pendingInjury.side === L.me) {
      L.paused = true;
      L.panel = true;
      L.subOut = L.m.pendingInjury.id;
      toast("Cầu thủ chấn thương — chọn người vào thay");
    }
    renderLive();
    L.timer = setTimeout(loop, SPEEDS[L.speed]);
  }
  function renderLive(first) {
    const L = ui.live;
    const { m, me } = L;
    const [H, A2] = m.sides;
    const last = m.events[m.events.length - 1];
    const minute = m.over ? "Hết giờ" : m.halftime && L.paused ? "Nghỉ giữa hiệp" : `${last ? last.label : 0}'`;
    const pct = (a, b) => (a + b ? Math.round((a / (a + b)) * 100) : 50);
    const possH = pct(H.st.poss, A2.st.poss);
    // a, b: số để chia thanh; da, db: chữ hiển thị hai bên
    const stat = (label, a, b, da = a, db = b) => `<div class="ls"><b class="right">${da}</b><div><div class="small muted center">${label}</div><div class="dual"><i style="width:${pct(a, b)}%"></i><i style="width:${100 - pct(a, b)}%"></i></div></div><b>${db}</b></div>`;
    const feed = [...m.events]
      .reverse()
      .map((e) => `<div class="ev ${e.type}"><span class="m">${e.type === "kickoff" ? "" : e.label + "'"}</span><span class="txt ${e.side === 0 ? "home-ev" : e.side === 1 ? "away-ev" : ""}">${esc(e.text)}</span></div>`)
      .join("");
    const html = `<div class="scoreboard">
        <div class="tm">${crest(H.clubId, "lg")}<span class="ellipsis">${esc(H.name)}</span></div>
        <div class="sc">${H.goals} – ${A2.goals}<span class="min">${minute}</span></div>
        <div class="tm">${crest(A2.clubId, "lg")}<span class="ellipsis">${esc(A2.name)}</span></div>
      </div>
      <div class="livestats">${stat("Kiểm soát bóng", possH, 100 - possH, possH + "%", 100 - possH + "%")}${stat("Dứt điểm (trúng đích)", H.st.shots, A2.st.shots, `${H.st.shots} (${H.st.on})`, `${A2.st.shots} (${A2.st.on})`)}${stat("xG", H.st.xg, A2.st.xg, H.st.xg.toFixed(2), A2.st.xg.toFixed(2))}</div>
      <div class="feed">${feed}</div>
      ${L.panel && !L.done ? subPanel() : ""}
      <div class="livebar">
        ${
          L.done
            ? `<button class="btn primary block" data-act="match-end">Xem kết quả ▶</button>`
            : `<button class="btn sm" data-act="lpause">${L.paused ? "▶ Tiếp tục" : "⏸ Dừng"}</button>
          ${[1, 2, 4].map((s) => `<button class="btn sm ${L.speed === s ? "primary" : ""}" data-act="lspeed" data-s="${s}">${s}×</button>`).join("")}
          <button class="btn sm" data-act="lpanel">🔄 Thay người · chiến thuật (${m.sides[me].subs}/${FM.MAX_SUBS})</button>
          <span class="grow"></span><button class="btn sm" data-act="lskip">Kết quả ngay ⏭</button>`
        }
      </div>`;
    let el = $("#live");
    if (!el) {
      el = document.createElement("div");
      el.id = "live";
      el.className = "live";
      document.body.append(el);
    }
    el.innerHTML = html;
    if (first) el.scrollTop = 0;
  }
  function subPanel() {
    const L = ui.live;
    const side = L.m.sides[L.me];
    const on = L.m.onPitch(L.me).map((s) => ({ s, x: side.live[s.id] }));
    const bench = side.bench.map((id) => side.live[id]).filter((x) => x && !x.onPitch && x.to === null);
    const t = side.tactics;
    return `<div class="subpanel">
      <div class="card-h">Chiến thuật trong trận</div>
      <div class="card-b"><div class="seg">${FM.TACTIC_OPTIONS.mentality.map((o, i) => `<button class="${t.mentality === i ? "on" : ""}" data-act="ltac" data-k="mentality" data-v="${i}">${o}</button>`).join("")}</div>
      <div class="seg" style="margin-top:6px">${FM.TACTIC_OPTIONS.pressing.map((o, i) => `<button class="${t.pressing === i ? "on" : ""}" data-act="ltac" data-k="pressing" data-v="${i}">${o}</button>`).join("")}</div></div>
      <div class="card-h">Thay người — ${L.subOut ? "chọn người vào sân" : "chọn người rời sân"} (${side.subs}/${FM.MAX_SUBS})</div>
      ${
        side.subs >= FM.MAX_SUBS
          ? `<div class="card-b muted">Đã hết quyền thay người.</div>`
          : L.subOut
            ? bench.map((x) => `<div class="subrow" data-act="lsub-in" data-id="${x.id}">${posTag(x.p.pos)}<b class="grow">${esc(x.p.sn)}</b>${flags(x.p)}${stars(x.p.ca)}</div>`).join("") || `<div class="card-b muted">Không còn ai dự bị.</div>`
            : on.map(({ s, x }) => `<div class="subrow ${L.subOut === x.id ? "sel" : ""}" data-act="lsub-out" data-id="${x.id}">${posTag(s.role)}<b class="grow">${esc(x.p.sn)}${x.inj ? " 🚑" : ""}${x.yc ? " 🟨" : ""}</b><span class="small" style="color:${x.fit > 70 ? "var(--accent)" : x.fit > 50 ? "var(--orange)" : "var(--red)"}">${Math.round(x.fit)}%</span></div>`).join("")
      }
      ${L.subOut ? `<div class="card-b"><button class="btn sm" data-act="lsub-cancel">Huỷ</button></div>` : ""}
    </div>`;
  }
  function endMatch(f, m, me) {
    W.applyResult(S, f, m);
    persist(true);
    const el = $("#live");
    if (el) el.remove();
    ui.live = null;
    const [H, A2] = m.sides;
    const my = m.sides[me];
    const lines = (side) =>
      m.events
        .filter((e) => e.type === "goal" && e.side === side.idx)
        .map((e) => `${esc(side.live[e.scorer].p.sn)} ${e.label}'`)
        .join(", ") || "—";
    const ratings = Object.values(my.live)
      .filter((x) => x.from !== null)
      .sort((a, b) => b.rating - a.rating)
      .map((x) => `<tr class="click" data-act="info" data-id="${x.id}"><td>${posTag(x.p.pos)}</td><td class="l">${esc(x.p.sn)}${x.id === m.motm ? " ⭐" : ""}${x.g ? " " + "⚽".repeat(x.g) : ""}${x.as ? ` <span class="small muted">${x.as} kt</span>` : ""}${x.yc ? " 🟨" : ""}${x.rc ? " 🟥" : ""}${x.inj ? " 🚑" : ""}</td><td class="small muted">${x.played}'</td><td><b style="color:${x.rating >= 7.5 ? "var(--accent)" : x.rating < 6 ? "var(--red)" : "var(--text)"}">${x.rating.toFixed(1)}</b></td></tr>`)
      .join("");
    const row = (label, a, b) => `<tr><td><b>${a}</b></td><td class="small muted">${label}</td><td><b>${b}</b></td></tr>`;
    const res = my.goals > m.sides[1 - me].goals ? "Chiến thắng!" : my.goals < m.sides[1 - me].goals ? "Thất bại" : "Hoà";
    openModal(`<div class="sheet-h"><div class="grow t" style="font-size:22px">${res}</div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b">
        <div class="next" style="padding:4px 0"><div class="team">${crest(H.clubId, "lg")}${esc(H.name)}<span class="small muted">${lines(H)}</span></div><div class="vs" style="color:var(--text)">${H.goals} – ${A2.goals}${f.pens ? `<div class="small muted">pen ${f.pens.join("–")}</div>` : ""}</div><div class="team">${crest(A2.clubId, "lg")}${esc(A2.name)}<span class="small muted">${lines(A2)}</span></div></div>
        <table><tbody>${row("Kiểm soát bóng", H.st.poss + "%", A2.st.poss + "%")}${row("Dứt điểm", H.st.shots, A2.st.shots)}${row("Trúng đích", H.st.on, A2.st.on)}${row("xG", H.st.xg.toFixed(2), A2.st.xg.toFixed(2))}${row("Phạt góc", H.st.corners, A2.st.corners)}${row("Phạm lỗi", H.st.fouls, A2.st.fouls)}${row("Thẻ vàng / đỏ", `${H.st.yc}/${H.st.rc}`, `${A2.st.yc}/${A2.st.rc}`)}</tbody></table>
        <div class="card"><h3>Điểm cầu thủ của bạn</h3><table class="plist"><tbody>${ratings}</tbody></table></div>
        <button class="btn primary block" data-act="close">Tiếp tục</button>
      </div>`);
    ui.tab = "home";
    render();
  }

  // ---------- Tổng kết mùa ----------
  function viewSeasonEnd() {
    const s = S.summary;
    const name = (id) => esc(club(id).name);
    const ts = (lg) => {
      const p = s.topScorer[lg] && W.player(S, s.topScorer[lg]);
      return p ? `${esc(p.sn)} (${name(p.c)}) — ${p.st.g} bàn` : "—";
    };
    return `<div class="hero"><div class="ball">🏆</div><h1>Mùa giải <em>${s.season}</em> khép lại</h1></div>
    <div class="page">
      <div class="card"><h3>Đội của bạn</h3><div class="card-b" style="display:grid;gap:6px">
        <div class="row">${crest(S.user, "lg")}<div class="grow"><b class="t" style="font-size:22px">${name(S.user)}</b><div>${W.leagueName(s.user.league)} · hạng <b>${s.user.pos}</b></div></div>${s.user.achieved ? '<span class="pill green">Đạt mục tiêu</span>' : '<span class="pill red">Không đạt</span>'}</div>
        <div class="small muted">Mục tiêu: ${esc(s.user.obj.label)} (hạng ${s.user.obj.target} trở lên)</div>
      </div></div>
      <div class="card"><div class="card-b kv">
        <div><small>Vô địch V.League 1</small><b>${name(s.champions[V1])}</b></div>
        <div><small>Vô địch V.League 2</small><b>${name(s.champions[V2])}</b></div>
        <div><small>Vua phá lưới V.League 1</small><b>${ts(V1)}</b></div>
        <div><small>Vua phá lưới V.League 2</small><b>${ts(V2)}</b></div>
        <div><small>Play-off</small><b>${name(s.playoff.home)} ${s.playoff.hg}–${s.playoff.ag}${s.playoff.pens ? ` (pen ${s.playoff.pens.join("–")})` : ""} ${name(s.playoff.away)}</b></div>
        <div><small>Lên V.League 1</small><b>${s.promoted.map(name).join(", ")}</b></div>
        <div><small>Xuống V.League 2</small><b>${s.relegated.map(name).join(", ")}</b></div>
        <div><small>Xuống Hạng Nhì</small><b>${name(s.outOfGame)}</b></div>
      </div></div>
      <button class="btn primary block" data-act="next-season">Sang mùa giải mới ▶</button>
      <button class="btn block" data-act="see-table">Xem lại bảng xếp hạng</button>
    </div>`;
  }
  function viewSacked() {
    return `<div class="hero"><div class="ball">📉</div><h1>Bạn đã bị <em>sa thải</em></h1><p>${esc(ui.sackReason || "")}. Ban lãnh đạo ${esc(club(S.user).name)} quyết định chia tay.</p></div>
    <div class="page" style="max-width:460px;margin:0 auto"><button class="btn primary block" data-act="newgame">Bắt đầu lại với CLB khác</button></div>`;
  }

  // ---------- Xuất / nhập mã ----------
  async function exportModal() {
    persist(true);
    const code = await FM.Save.exportCode(S);
    openModal(`<div class="sheet-h"><div class="grow t" style="font-size:22px">Mã save</div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b"><div class="small muted">Sao chép toàn bộ mã này (${(code.length / 1024).toFixed(0)} KB ký tự), cất vào ghi chú, rồi dán ở màn hình mở đầu trên trình duyệt khác. Hoặc tải về thành file.</div>
      <textarea class="code" readonly id="codeOut">${code}</textarea>
      <div class="row wrap"><button class="btn primary" data-act="copy">Sao chép</button><button class="btn" data-act="download">Tải file .txt</button></div></div>`);
  }
  function importModal() {
    openModal(`<div class="sheet-h"><div class="grow t" style="font-size:22px">Nhập mã save</div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b"><div class="small muted">Dán mã (bắt đầu bằng GVFM1: hoặc GVFM0:) hoặc mở file mã đã tải về. Ván đang lưu trong trình duyệt này sẽ bị thay thế.</div>
      <textarea class="code" id="codeIn" placeholder="GVFM1:..."></textarea>
      <div class="row wrap"><label class="btn">Mở file…<input type="file" accept=".txt,text/plain" id="codeFile" hidden></label><span class="grow"></span><button class="btn primary" data-act="import-apply">Nạp ván chơi</button></div>
      <div class="small" id="codeMsg" style="color:var(--red)"></div></div>`);
    $("#codeFile").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (f) $("#codeIn").value = await f.text();
    });
  }

  // ---------- Hành động ----------
  async function go() {
    if (ui.live) return;
    const r = W.advance(S);
    persist(true);
    ui.sel = null;
    ui.fxRound = null;
    if (r.kind === "match") {
      ui.tab = "home";
      render();
      preMatch(r.fixture);
      return;
    }
    if (r.kind === "seasonEnd") ui.view = "seasonEnd";
    else if (r.kind === "mail") ui.tab = "home";
    render();
  }
  const ACTIONS = {
    newgame: () => {
      ui.view = "pick";
      ui.pickClub = null;
      render();
    },
    "to-start": () => {
      ui.view = "start";
      render();
    },
    resume: () => {
      S = savedInfo.state;
      ui.view = "main";
      ui.tab = "home";
      render();
    },
    "pick-league": (d) => {
      ui.pickLeague = d.l;
      ui.pickClub = null;
      render();
    },
    "pick-club": (d) => {
      ui.pickClub = d.id;
      render();
    },
    "start-game": () => {
      S = W.newGame(ui.pickClub);
      ui.view = "main";
      ui.tab = "home";
      persist(true);
      render();
    },
    tab: (d) => {
      ui.tab = d.t;
      ui.sel = null;
      render();
      window.scrollTo(0, 0);
    },
    go,
    "read-all": () => {
      S.inbox.forEach((m) => (m.r = true));
      render();
    },
    formation: (d) => {
      const c = S.clubs[S.user];
      c.formation = d.f;
      autoLineup();
      ui.sel = null;
      render();
      toast(`Đã chuyển sang ${d.f} và tự xếp lại đội hình.`);
    },
    auto: () => {
      autoLineup();
      ui.sel = null;
      render();
      toast("Đã xếp đội hình tốt nhất.");
    },
    unsel: () => {
      ui.sel = null;
      render();
    },
    "bench-clear": () => {
      const c = S.clubs[S.user];
      c.bench.splice(ui.sel.i, 1);
      ui.sel = null;
      persist();
      render();
    },
    slot: (d) => {
      const target = { t: d.t, i: +d.i };
      const c = S.clubs[S.user];
      if (ui.sel && ui.sel.t === target.t && ui.sel.i === target.i) ui.sel = null;
      else if (ui.sel) {
        // đổi chỗ hai ô
        const get = (l) => (l.t === "xi" ? c.lineup[l.i] : c.bench[l.i]) ?? null;
        const a = get(ui.sel);
        const b = get(target);
        if (a) assign(a, target);
        else if (b) assign(b, ui.sel);
        ui.sel = null;
      } else ui.sel = target;
      render();
    },
    prow: (d) => {
      if (ui.sel) {
        assign(d.id, ui.sel);
        ui.sel = null;
        render();
      } else playerModal(d.id);
    },
    info: (d) => playerModal(d.id),
    tac: (d) => {
      S.clubs[S.user].tactics[d.k] = +d.v;
      persist();
      render();
    },
    "fx-tab": (d) => {
      ui.fxTab = d.t;
      ui.fxRound = null;
      render();
    },
    round: (d) => {
      ui.fxRound += +d.d;
      render();
    },
    "fx-detail": (d) => fixtureModal(d.id),
    "table-tab": (d) => {
      ui.tableTab = d.t;
      render();
    },
    "club-view": (d) => clubModal(d.id),
    close: closeModal,
    "edit-lineup": () => {
      closeModal();
      ui.tab = "squad";
      render();
      toast("Chỉnh xong bấm Tiếp tục để vào trận.");
    },
    quick: () => startMatch(false),
    live: () => startMatch(true),
    lpause: () => {
      ui.live.paused = !ui.live.paused;
      if (!ui.live.paused) ui.live.panel = false;
      renderLive();
      loop();
    },
    lspeed: (d) => {
      ui.live.speed = +d.s;
      renderLive();
    },
    lpanel: () => {
      const L = ui.live;
      L.panel = !L.panel;
      L.paused = L.panel;
      L.subOut = null;
      renderLive();
      if (!L.paused) loop();
    },
    lskip: () => {
      const L = ui.live;
      clearTimeout(L.timer);
      // người chơi bỏ qua: nếu có chấn thương đang chờ thì máy tự thay
      L.m.sides[L.me].ai = true;
      L.m.runToEnd();
      L.done = true;
      renderLive();
    },
    "lsub-out": (d) => {
      ui.live.subOut = d.id;
      renderLive();
    },
    "lsub-in": (d) => {
      const L = ui.live;
      if (!L.m.sub(L.me, L.subOut, d.id)) toast(`Không thay được (đã đủ ${FM.MAX_FOREIGN_ON_PITCH} ngoại binh trên sân?)`);
      L.subOut = null;
      renderLive();
    },
    "lsub-cancel": () => {
      ui.live.subOut = null;
      renderLive();
    },
    ltac: (d) => {
      ui.live.m.setTactics(ui.live.me, { [d.k]: +d.v });
      renderLive();
    },
    "match-end": () => endMatch(ui.live.f, ui.live.m, ui.live.me),
    "next-season": () => {
      const r = W.newSeason(S);
      if (r.sacked) {
        ui.view = "sacked";
        ui.sackReason = r.reason;
        FM.Save.clear();
      } else {
        ui.view = "main";
        ui.tab = "home";
        persist(true);
      }
      render();
    },
    "see-table": () => {
      ui.view = "main";
      ui.tab = "table";
      render();
    },
    export: exportModal,
    import: importModal,
    copy: async () => {
      const t = $("#codeOut");
      t.select();
      try {
        await navigator.clipboard.writeText(t.value);
      } catch {
        document.execCommand("copy");
      }
      toast("Đã sao chép mã save.");
    },
    download: () => {
      const blob = new Blob([$("#codeOut").value], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `bong-da-viet-${S.date}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    "import-apply": async () => {
      try {
        const st = await FM.Save.importCode($("#codeIn").value);
        S = st;
        await FM.Save.store(S);
        closeModal();
        ui.view = S.phase === "ended" ? "seasonEnd" : "main";
        ui.tab = "home";
        render();
        toast("Đã nạp ván chơi.");
      } catch (err) {
        $("#codeMsg").textContent = err.message;
      }
    },
    // ---- thị trường ----
    "mk-tab": (d) => {
      ui.mk.tab = d.t;
      render();
    },
    "mk-group": (d) => {
      ui.mk.group = d.g;
      ui.mk.limit = 40;
      render();
    },
    "mk-more": () => {
      ui.mk.limit += 40;
      render();
    },
    adj: (d) => {
      const el = $("#" + d.for);
      el.value = Math.max(0, Math.round((+el.value + +d.step) * 10) / 10);
    },
    years: (d, el) => {
      ui.years = +d.y;
      el.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === el));
    },
    bid: (d) => bidModal(d.id),
    "bid-send": (d) => {
      const fee = Math.round(+$("#feeIn").value * 10) / 10;
      const r = T.bid(S, d.id, fee);
      if (r.result === "accepted") {
        persist();
        contractModal(d.id, "sign");
        toast("CLB chủ quản đồng ý! Giờ đàm phán hợp đồng với cầu thủ.");
      } else if (r.result === "countered") {
        $("#feeIn").value = r.counter;
        negMsg(`${r.reason} Bấm Gửi đề nghị lần nữa để đồng ý mức này.`);
      } else negMsg(r.reason);
    },
    contract: (d) => contractModal(d.id, d.kind),
    renew: (d) => contractModal(d.id, "renew"),
    "sign-free": (d) => contractModal(d.id, "sign"),
    "contract-send": (d) => {
      const wage = Math.round(+$("#wageIn").value);
      const r = T.offerContract(S, d.id, wage, ui.years, d.kind);
      if (r.result === "accepted") {
        persist(true);
        closeModal();
        toast(d.kind === "renew" ? "Đã gia hạn hợp đồng." : "Ký hợp đồng thành công!");
        render();
      } else if (r.result === "countered") {
        $("#wageIn").value = r.counterWage;
        negMsg(r.reason);
      } else {
        negMsg(r.reason);
        persist();
        render();
      }
    },
    list: (d) => listModal(d.id),
    "list-send": (d) => {
      T.setListed(S, d.id, true, Math.round(+$("#feeIn").value * 10) / 10);
      persist();
      closeModal();
      toast("Đã rao bán.");
      render();
    },
    unlist: (d) => {
      T.setListed(S, d.id, false);
      persist();
      playerModal(d.id);
      render();
    },
    release: (d) => releaseModal(d.id),
    "release-send": (d) => {
      T.release(S, d.id);
      persist(true);
      closeModal();
      toast("Đã thanh lý hợp đồng.");
      render();
    },
    "offer-accept": (d) => {
      const r = T.respond(S, +d.id, "accept");
      persist(true);
      toast(r.result === "accepted" ? `Đã bán với giá ${FM.fmtMoney(r.fee)}.` : r.reason || "Đề nghị không còn hiệu lực.");
      render();
    },
    "offer-reject": (d) => {
      T.respond(S, +d.id, "reject");
      persist();
      render();
    },
    "offer-counter": (d) => counterModal(+d.id),
    "counter-send": (d) => {
      const r = T.respond(S, +d.id, "counter", Math.round(+$("#feeIn").value * 10) / 10);
      persist(true);
      closeModal();
      toast(r.result === "accepted" ? `Họ đồng ý! Đã bán với giá ${FM.fmtMoney(r.fee)}.` : r.reason || "Họ không đồng ý.");
      render();
    },
    "save-now": async () => {
      await persist(true);
      toast("Đã lưu.");
    },
    quit: async () => {
      await persist(true);
      savedInfo = await FM.Save.load();
      S = null;
      ui.view = "start";
      render();
    },
  };
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (el) {
      if (el.tagName === "A") e.preventDefault();
      if (el.closest("details") && !el.closest(".body")) return; // để thẻ mở / đóng thư tự xử lý
      const fn = ACTIONS[el.dataset.act];
      if (fn) {
        e.stopPropagation();
        fn(el.dataset, el);
      }
      return;
    }
    // mở thư → đánh dấu đã đọc
    const m = e.target.closest("details.mail");
    if (m && S) {
      const msg = S.inbox.find((x) => x.id === +m.dataset.mail);
      if (msg && !msg.r) {
        msg.r = true;
        m.classList.remove("unread");
        const badge = document.querySelector(".nav .badge");
        const unread = S.inbox.filter((x) => !x.r).length;
        if (badge) unread ? (badge.textContent = unread) : badge.remove();
        persist();
      }
    }
    // bấm ra ngoài hộp thoại thì đóng
    if (e.target.id === "modal") closeModal();
  });
  // bộ lọc dạng ô chọn ở thị trường
  document.addEventListener("change", (e) => {
    const el = e.target.closest("[data-change]");
    if (el && el.dataset.change === "mk") {
      ui.mk[el.dataset.k] = el.value;
      ui.mk.limit = 40;
      render();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#modal").hidden) closeModal();
  });

  // ---------- Khởi động ----------
  (async () => {
    savedInfo = await FM.Save.load();
    render();
  })();
  FM.UI = { get state() { return S; }, render, ui };
})();
