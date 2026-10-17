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
  const ui = { view: "start", tab: "home", sel: null, pickCountry: "en", pickLeague: "england-premier-league", pickClub: null, tableTab: null, tableCountry: null, fxTab: "mine", fxRound: null, live: null };
  const SAVE_VERSION = 2; // bản thấp nhất còn chơi tiếp được (2: thế giới chung, thang chỉ số mới); cũ hơn W.VERSION thì W.migrate
  const userCountry = () => W.countryOfClub(S, S.user);
  const leagueTabs = (country) => FM.leaguesOf(country);

  // ---------- Mẩu giao diện dùng chung ----------
  const FREE_CLUB = { id: "free", name: "Tự do", code: "TD", colors: ["#4a5a52", "#dfe9e3"], venue: "" };
  const club = (id) => (id === "free" ? FREE_CLUB : W.baseClub(S, id));
  const T = FM.Transfers;
  const AF = FM.AFC;
  // trạng thái CLB: đội Việt Nam trong S.clubs, đội nước ngoài trong S.afc
  const cstate = (id) => S.clubs[id] || { form: [], ...(AF.state(S, id) || {}), formation: AF.isForeign(id) ? AF.side(S, id).formation : "?" };
  // độ sáng tương đối (#rrggbb) để chữ trên huy hiệu luôn đọc được
  function lum(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return null;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function crestColors(colors) {
    let [c1, c2] = colors || ["#1fa865", "#fff"];
    const l1 = lum(c1);
    const l2 = lum(c2);
    if (l1 != null && l2 != null && (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) < 2.2) c2 = l1 > 0.35 ? "#111111" : "#ffffff";
    return [c1, c2];
  }
  function crest(id, size = "") {
    const c = S ? club(id) : D.clubs.find((x) => x.id === id);
    const [c1, c2] = crestColors(c.colors);
    return `<span class="crest ${size}" style="--c1:${c1};--c2:${c2}">${esc((c.code || "").replace(/FC$/, "").slice(0, 5))}</span>`;
  }
  function stars(ca, est) {
    const v = FM.stars(ca);
    let h = "";
    for (let i = 1; i <= 5; i++) h += v >= i ? "★" : v >= i - 0.5 ? '<span class="half">★</span>' : '<span class="off">★</span>';
    return `<span class="stars${est ? " est" : ""}" title="${est ? "Ước tính của tuyển trạch" : `Năng lực ${ca}`}">${h}</span>`;
  }
  // những gì người chơi thấy về cầu thủ đội khác phụ thuộc vào độ hiểu biết (tuyển trạch)
  const SC = FM.Scout;
  const kn = (p) => SC.know(S, p);
  const caStars = (p, k = kn(p)) => (k >= SC.EXACT ? stars(p.ca) : stars(SC.estCa(S, p, k), true));
  const paStars = (p, k = kn(p)) => (k < SC.HIDDEN ? '<span class="stars est" title="Chưa rõ — cần tuyển trạch">?</span>' : k >= SC.EXACT ? stars(p.pa) : stars(SC.estPa(S, p, k), true));
  const valText = (p, k = kn(p)) => (k >= SC.EXACT ? FM.fmtMoney(p.val) : `≈ ${FM.fmtMoney(SC.estVal(S, p, k))}`);
  // chỉ số tổng (năng lực 1–100); cầu thủ đội khác là ước tính theo tuyển trạch
  const ovrCls = (v) => (v >= 75 ? "o4" : v >= 65 ? "o3" : v >= 55 ? "o2" : "o1");
  function ovr(p, k = p.c === S.user ? 100 : kn(p)) {
    if (k >= SC.EXACT) return `<b class="ovr ${ovrCls(p.ca)}" title="Chỉ số tổng">${p.ca}</b>`;
    const e = SC.estCa(S, p, k);
    return `<b class="ovr est ${ovrCls(e)}" title="Chỉ số tổng — ước tính của tuyển trạch">~${e}</b>`;
  }
  const gradePill = (id) => {
    const r = SC.ensure(S).reports[id];
    return r ? ` <span class="pill grade g${r.grade}" title="Báo cáo tuyển trạch ${FM.fmtDate(r.d, false)}">${r.grade}</span>` : "";
  };
  const posTag = (pos) => `<span class="pos ${FM.POS_GROUP[pos]}">${FM.POS_LABEL[pos]}</span>`;
  const formIcons = (form) => `<span class="form">${form.map((r) => `<i class="${r}">${{ W: "T", D: "H", L: "B" }[r]}</i>`).join("")}</span>`;
  function flags(p) {
    let h = "";
    if (p.fs) h += ` <span class="flag fs" title="Chiếm suất ngoại binh">NB</span>`;
    else if (p.vk) h += ` <span class="flag" title="Việt kiều">VK</span>`;
    if (p.loan) h += ` <span class="flag loan" title="Cầu thủ mượn từ ${esc(club(p.loan.from).name)}">MƯỢN</span>`;
    if (p.nt === "senior") h += ` <span class="flag" title="Tuyển Việt Nam">🇻🇳</span>`;
    else if (p.nt === "u23") h += ` <span class="flag" title="U23 Việt Nam">U23</span>`;
    return h;
  }
  function status(p) {
    if (p.wantsOut) return `<span title="Đòi ra đi">📤</span>`;
    if (p.c === S?.user && (p.unhappy || 0) >= 4) return `<span title="Muốn được ra sân nhiều hơn">😤</span>`;
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
      <p>Dẫn dắt một CLB ở Premier League và các hạng dưới của Anh, hoặc V.League mùa ${W.label({ season: D.meta.season })}. Một thế giới chung: ${D.clubs.length} CLB, ${D.players.length.toLocaleString("vi-VN")} cầu thủ thật (premierleague.com, FotMob, VPF), mua bán qua lại giữa hai nước.</p>
    </div>
    <div class="page" style="max-width:460px;margin:0 auto">
      ${sv && (sv.v || 1) >= SAVE_VERSION ? `<button class="btn primary block" data-act="resume">▶ Tiếp tục: ${esc(svClub ? svClub.name : "")} · ${FM.fmtDate(sv.date, false)}</button>` : ""}
      ${sv && (sv.v || 1) < SAVE_VERSION ? `<div class="pill gold" style="white-space:normal">Ván lưu cũ (${esc(svClub ? svClub.name : "")}) thuộc bản chỉ có V.League, không chơi tiếp được với thế giới mới (thang chỉ số đã đổi). Hãy bắt đầu ván mới.</div>` : ""}
      <button class="btn ${sv ? "" : "primary"} block" data-act="newgame">Ván mới</button>
      <button class="btn block" data-act="import">Nhập mã save từ trình duyệt khác</button>
      <p class="small muted center">Ván chơi tự lưu trong trình duyệt này. Muốn chơi tiếp ở trình duyệt / máy khác: vào CLB → "Xuất mã save" rồi dán mã ở đây.</p>
    </div>`;
  }
  function viewPick() {
    const clubs = D.clubs.filter((c) => c.league === ui.pickLeague).sort((a, b) => b.strength - a.strength);
    const countries = Object.entries(FM.COUNTRIES);
    const sel = ui.pickClub && D.clubs.find((c) => c.id === ui.pickClub);
    return `<a class="back" href="#" data-act="to-start">← Quay lại</a>
    <div class="page">
      <h2 class="t" style="margin:4px 0 0;font-size:28px">Chọn câu lạc bộ</h2>
      <div class="seg">${countries.map(([k, c]) => `<button class="${ui.pickCountry === k ? "on" : ""}" data-act="pick-country" data-c="${k}">${esc(c.name)}</button>`).join("")}</div>
      <div class="tabs">${leagueTabs(ui.pickCountry).map((L) => `<button data-act="pick-league" data-l="${L.id}" class="${ui.pickLeague === L.id ? "on" : ""}">${esc(L.name)}</button>`).join("")}</div>
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
          <div class="small">Sức mạnh ${sel.strength} · Ngân sách ${FM.fmtMoney(sel.budget * FM.econOf(sel.country).startCash)} · ${D.players.filter((p) => p.c === sel.id).length} cầu thủ</div>
          </div></div><div class="card-b"><button class="btn primary block" data-act="start-game">Dẫn dắt ${esc(sel.name)}</button></div></div>`
          : `<p class="muted center">Chọn một CLB để xem thông tin.</p>`
      }
    </div>`;
  }
  function crestPlain(c, size = "") {
    const [c1, c2] = crestColors(c.colors);
    return `<span class="crest ${size}" style="--c1:${c1};--c2:${c2}">${esc((c.code || "").replace(/FC$/, "").slice(0, 5))}</span>`;
  }

  // ---------- Trang chủ ----------
  function viewHome() {
    const c = W.club(S, S.user);
    const f = W.nextFixture(S, S.user);
    let next = `<div class="card-b muted">Không còn trận nào trong mùa.</div>`;
    if (f) {
      const opp = f.h === S.user ? f.a : f.h;
      const tH = FM.LEAGUE[f.lg] ? W.table(S, f.lg) : null;
      const posOf = (id) => (tH ? `hạng ${tH.findIndex((r) => r.id === id) + 1}` : AF.isForeign(id) ? esc(AF.club(id).lgName || AF.club(id).country) : "");
      next = `<div class="next">
        <div class="team">${crest(f.h, "lg")}<span>${esc(club(f.h).name)}</span><span class="small muted">${posOf(f.h)}</span>${formIcons(cstate(f.h).form.slice(-5))}</div>
        <div><div class="vs">VS</div><div class="small muted">${FM.fmtDate(f.d)}</div><div class="pill ${f.po || f.ko ? "gold" : ""}">${esc(W.fxLabel(S, f))}</div></div>
        <div class="team">${crest(f.a, "lg")}<span>${esc(club(f.a).name)}</span><span class="small muted">${posOf(f.a)}</span>${formIcons(cstate(f.a).form.slice(-5))}</div>
      </div>
      <div class="card-b row" style="border-top:1px solid var(--line)"><span class="small muted grow">${f.neutral ? "Sân trung lập" : f.h === S.user ? "Sân nhà" : "Sân khách"} · ${f.neutral ? "" : esc(club(f.h).venue || "")} · ${FM.daysBetween(S.date, f.d) === 0 ? "<b>Hôm nay!</b>" : `còn ${FM.daysBetween(S.date, f.d)} ngày`}</span><button class="btn sm" data-act="club-view" data-id="${opp}">Xem đối thủ</button></div>`;
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
    ${viewDressingRoom()}
    <div class="card"><h3>Hộp thư <span class="grow"></span>${S.inbox.some((m) => !m.r) ? `<button class="link small" data-act="read-all">Đánh dấu đã đọc</button>` : ""}</h3>
      ${S.inbox.length ? S.inbox.slice(0, 25).map(mailRow).join("") : `<div class="card-b muted">Chưa có thư.</div>`}
    </div>`;
  }
  const MAIL_ICON = { board: "🏛️", result: "⚽", medical: "🚑", discipline: "🟥", finance: "💰", league: "🏆", transfer: "🔁", contract: "📝", news: "📰", cup: "🏆", scout: "🔍", training: "🏋️", morale: "💬", afc: "🌏", ucl: "🌍" };
  // ---------- Phòng thay đồ (tâm lý) ----------
  const MO = FM.Morale;
  const moraleText = (m) => (m >= 75 ? "Rất vui" : m >= 58 ? "Vui vẻ" : m >= 42 ? "Bình thường" : m >= 28 ? "Không vui" : "Rất tệ");
  function viewDressingRoom() {
    const mood = MO.squadMood(S);
    const who = (list) => list.map((p) => `<b class="link" data-act="info" data-id="${p.id}">${esc(p.sn)}</b>`).join(", ");
    const issues = [
      mood.wantsOut.length ? `<div>📤 Đòi ra đi: ${who(mood.wantsOut)}</div>` : "",
      mood.unhappy.length ? `<div>😤 Muốn được ra sân nhiều hơn: ${who(mood.unhappy)}</div>` : "",
      mood.promises.length ? `<div>🤝 Đang chờ bạn giữ lời hứa: ${who(mood.promises)}</div>` : "",
    ].join("");
    const can = MO.canMeet(S);
    return `<div class="card"><h3>Phòng thay đồ</h3><div class="card-b" style="display:grid;gap:8px">
      <div class="row"><span style="font-size:22px">${moraleIcon(mood.avg)}</span><span class="grow">Tinh thần toàn đội: <b>${moraleText(mood.avg)}</b></span><span class="small muted">${Math.round(mood.avg)}/100</span></div>
      ${issues ? `<div class="small" style="display:grid;gap:4px">${issues}</div>` : `<div class="small muted">Không có vấn đề gì trong phòng thay đồ.</div>`}
      <div class="row wrap">${MO.MEETINGS.map((x) => `<button class="btn sm" data-act="meeting" data-k="${x.k}" title="${esc(x.desc)}" ${can ? "" : "disabled"}>${x.label}</button>`).join("")}</div>
      <div class="small muted">${can ? "Họp đội: khen khi đang thắng, đòi hỏi khi đang thua, giải toả khi nhiều người buồn. 14 ngày họp một lần." : `Vừa họp đội ngày ${FM.fmtDate(S.meet, false)} — họp lại sau 14 ngày.`}</div>
    </div></div>`;
  }
  function moraleBox(p) {
    const d = S.p[p.id];
    const reasons = MO.reasons(S, p);
    const col = { good: "var(--accent)", bad: "var(--red)", info: "var(--muted)" };
    const can = MO.canTalk(S, d);
    return `<div class="scoutbox"><div class="row"><span style="font-size:20px">${moraleIcon(p.mor)}</span><b class="grow">Tâm lý: ${moraleText(p.mor)}</b><span class="small muted">${Math.round(p.mor)}/100</span></div>
      <div class="bar"><i style="width:${Math.round(p.mor)}%;background:${p.mor >= 58 ? "var(--accent)" : p.mor >= 42 ? "var(--gold)" : "var(--red)"}"></i></div>
      ${reasons.length ? `<div class="small" style="display:grid;gap:2px">${reasons.map(([k, t]) => `<div style="color:${col[k]}">• ${esc(t)}</div>`).join("")}</div>` : ""}
      ${ui.talkMsg && ui.talkMsg.id === p.id ? `<div class="pill ${ui.talkMsg.delta > 0 ? "green" : ui.talkMsg.delta < 0 ? "red" : ""}" style="white-space:normal">${esc(ui.talkMsg.text)}</div>` : ""}
      ${can ? `<div class="row wrap">${MO.talkOptions(S, p).map((o) => `<button class="btn sm" data-act="talk" data-id="${p.id}" data-k="${o.k}">${o.label}</button>`).join("")}</div>` : `<div class="small muted">Đã nói chuyện ngày ${FM.fmtDate(d.talk, false)} — chờ 14 ngày.</div>`}
    </div>`;
  }
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
    const f = ui.sq;
    const selRole = ui.sel && ui.sel.t === "xi" ? slots[ui.sel.i][0] : null;
    const canPlay = (p, role) => p.pos === role || !!(p.alt && p.alt[role]);
    const STATUS = {
      xi: (p) => c.lineup.includes(p.id),
      bench: (p) => c.bench.includes(p.id),
      out: (p) => !c.lineup.includes(p.id) && !c.bench.includes(p.id),
      ready: (p) => p.available && p.fit >= 75,
      unavail: (p) => !p.available,
      tired: (p) => p.available && p.fit < 75,
      fs: (p) => p.fs,
      young: (p) => p.age <= 23,
      unhappy: (p) => p.wantsOut || (p.unhappy || 0) >= 4 || p.mor < 42,
    };
    const SORT = {
      pos: (a, b) => order.indexOf(a.pos) - order.indexOf(b.pos) || b.ca - a.ca,
      ovr: (a, b) => b.ca - a.ca,
      fit: (a, b) => b.fit - a.fit,
      mor: (a, b) => b.mor - a.mor,
      age: (a, b) => a.age - b.age,
      role: (a, b) => FM.effective(b, f.pos, b.fit, b.mor) - FM.effective(a, f.pos, a.fit, a.mor),
    };
    const list = squad
      .filter((p) => !f.g || FM.POS_GROUP[p.pos] === f.g)
      .filter((p) => !f.pos || canPlay(p, f.pos))
      .filter((p) => !f.st || STATUS[f.st](p))
      .sort(SORT[f.pos && f.sort === "pos" ? "role" : f.sort] || SORT.pos);
    const groups = [["", "Tất cả"], ["GK", "GK"], ["DF", "DF"], ["MF", "MF"], ["FW", "FW"]];
    const sqSel = (k, opts) => `<select data-change="sq" data-k="${k}" class="btn sm">${opts.map(([v, l]) => `<option value="${v}" ${f[k] === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
    const filterBar = `<div class="card-b" style="display:grid;gap:8px;padding-bottom:4px">
        <div class="seg">${groups.map(([g, l]) => `<button class="${f.g === g ? "on" : ""}" data-act="sq" data-k="g" data-v="${g}">${l}</button>`).join("")}</div>
        <div class="row wrap">
          ${sqSel("pos", [["", "Mọi vị trí"], ...order.map((r) => [r, `Đá được ${r} – ${FM.POS_NAME[r]}`])])}
          ${sqSel("st", [["", "Mọi trạng thái"], ["xi", "Đá chính"], ["bench", "Dự bị"], ["out", "Ngoài đội hình"], ["ready", "Sẵn sàng (thể lực ≥ 75%)"], ["tired", "Đang mệt"], ["unavail", "Chấn thương / treo giò"], ["fs", "Ngoại binh"], ["young", "≤ 23 tuổi"], ["unhappy", "Đang không vui"]])}
          ${sqSel("sort", [["pos", "Xếp theo vị trí"], ["ovr", "Chỉ số tổng"], ["fit", "Thể lực"], ["mor", "Tâm lý"], ["age", "Trẻ nhất"]])}
          ${f.g || f.pos || f.st || f.sort !== "pos" ? `<button class="btn sm" data-act="sq-reset">✕ Bỏ lọc</button>` : ""}
        </div>
        ${selRole && f.pos !== selRole ? `<button class="btn sm primary" data-act="sq" data-k="pos" data-v="${selRole}">Chỉ hiện người đá được ${selRole} (ô đang chọn)</button>` : ""}
      </div>`;
    const rows = list
      .map((p) => {
        const inXI = c.lineup.includes(p.id);
        const onB = c.bench.includes(p.id);
        return `<tr class="click ${inXI ? "inxi" : onB ? "onbench" : ""}" data-act="prow" data-id="${p.id}">
          <td>${posTag(p.pos)}</td>
          <td class="l"><b>${esc(p.sn)}</b>${flags(p)} ${status(p)}<div class="small muted">${p.no ?? "–"} · ${p.age} tuổi${inXI ? " · đá chính" : onB ? " · dự bị" : ""}</div></td>
          <td class="nowrap">${ovr(p)} ${stars(p.ca)}${f.pos && p.pos !== f.pos ? `<div class="small muted">${f.pos}: ${FM.famLevel(p.alt[f.pos])}</div>` : ""}</td>
          <td class="small" style="color:${p.fit > 75 ? "var(--accent)" : p.fit > 55 ? "var(--orange)" : "var(--red)"}">${Math.round(p.fit)}%</td>
          <td>${moraleIcon(p.mor)}</td>
          <td><button class="btn sm" data-act="info" data-id="${p.id}">ⓘ</button></td>
        </tr>`;
      })
      .join("");
    return `<div class="card"><h3>Sơ đồ</h3><div class="card-b">${formationSeg(c.formation)}</div></div>
    <div class="card"><h3>Đội hình ra sân <span class="grow"></span>${userCountry() === "vn" ? `<span class="pill ${foreign > FM.MAX_FOREIGN_ON_PITCH ? "red" : ""}">Ngoại binh ${foreign}/${FM.MAX_FOREIGN_ON_PITCH}</span>` : ""}</h3>
      <div class="card-b" style="display:grid;gap:10px">
        <p class="small muted" style="margin:0">${ui.sel ? "Đã chọn một ô — bấm một cầu thủ trong danh sách (hoặc ô khác) để đưa vào / đổi chỗ." : "Bấm một ô trên sân hoặc ghế dự bị, rồi bấm cầu thủ ở danh sách bên dưới để xếp vào."}</p>
        <div class="pitch">${pitch}</div>
        <div class="row wrap"><button class="btn sm primary" data-act="auto">⚡ Tự xếp đội hình tốt nhất</button>${ui.sel ? `<button class="btn sm" data-act="unsel">Bỏ chọn</button>` : ""}${ui.sel && ui.sel.t === "bench" && c.bench[ui.sel.i] ? `<button class="btn sm" data-act="bench-clear">Bỏ khỏi dự bị</button>` : ""}</div>
        <div class="small muted">Dự bị (tối đa ${FM.BENCH_SIZE}, thay được ${FM.MAX_SUBS} người mỗi trận)</div>
        <div class="bench">${bench}</div>
      </div></div>
    <div class="card"><h3>Cầu thủ (${list.length === squad.length ? squad.length : `${list.length}/${squad.length}`})</h3>${filterBar}<div class="scroll-x"><table class="plist"><thead><tr><th>VT</th><th class="l">Tên</th><th>Tổng</th><th>Thể lực</th><th>Tâm lý</th><th></th></tr></thead><tbody>${rows || `<tr><td class="muted" colspan="6">Không có cầu thủ phù hợp.</td></tr>`}</tbody></table></div></div>`;
  }
  ui.sq = { g: "", pos: "", st: "", sort: "pos" };
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
    const fam = TRN.familiarity(S, S.user);
    return `<div class="card"><h3>Sơ đồ</h3><div class="card-b">${formationSeg(c.formation)}<p class="small muted" style="margin:8px 0 0">Đổi sơ đồ sẽ tự xếp lại đội hình hợp nhất; bạn có thể chỉnh lại ở mục Đội hình.</p>
      <div class="row small" style="margin-top:8px"><span class="grow">Độ ăn ý với ${c.formation}</span><b>${fam}%</b></div><div class="bar"><i style="width:${fam}%;background:${fam >= 75 ? "var(--accent)" : fam >= 50 ? "var(--gold)" : "var(--orange)"}"></i></div>
      <p class="small muted" style="margin:6px 0 0">Sơ đồ càng quen đội càng chơi tốt (sơ đồ mới yếu hơn tới 6%). Tập dần mỗi tuần; bỏ lâu thì quên.</p></div></div>
    <div class="card"><h3>Chỉ đạo chiến thuật</h3>
      ${Object.entries(FM.TACTIC_OPTIONS)
        .map(
          ([k, opts]) => `<div class="field"><label>${FM.TACTIC_LABEL[k]}</label><div class="seg">${opts
            .map((o, i) => `<button class="${c.tactics[k] === i ? "on" : ""}" data-act="tac" data-k="${k}" data-v="${i}">${o}</button>`)
            .join("")}</div><div class="small muted">${TACTIC_HELP[k]}</div></div>`,
        )
        .join("")}
    </div>
    ${viewTraining()}
    <div class="card"><h3>Luật cần nhớ</h3><div class="card-b small muted" style="display:grid;gap:4px">
      ${userCountry() === "vn" ? `<div>• Tối đa ${FM.MAX_FOREIGN_ON_PITCH} ngoại binh có mặt trên sân cùng lúc (Việt kiều, cầu thủ nhập tịch không tính).</div>` : ""}
      <div>• Thẻ đỏ: nghỉ 1–2 trận. Tích đủ 4 thẻ vàng: nghỉ 1 trận.</div>
      <div>• Mỗi trận thay tối đa ${FM.MAX_SUBS} người. Thể lực hồi dần theo ngày.</div>
    </div></div>`;
  }

  // ---------- Tập luyện ----------
  const TRN = FM.Training;
  function viewTraining() {
    TRN.ensure(S);
    const t = S.clubs[S.user].train;
    const plan = TRN.plan(S, S.user);
    const x = (v) => (v === 1 ? "bình thường" : `×${v.toFixed(2).replace(/0$/, "")}`);
    const prog = W.squad(S, S.user)
      .filter((p) => p.dg > 0)
      .sort((a, b) => b.dg - a.dg || a.age - b.age)
      .slice(0, 10);
    const others = Object.entries(S.clubs[S.user].fam || {}).filter(([f]) => f !== S.clubs[S.user].formation && f in FM.FORMATIONS);
    return `<div class="card"><h3>Tập luyện</h3><div class="card-b" style="display:grid;gap:10px">
      <div class="field"><label>Giáo án</label><div class="seg">${TRN.FOCUS.map((f, i) => `<button class="${t.focus === i ? "on" : ""}" data-act="train" data-k="focus" data-v="${i}">${f.name}</button>`).join("")}</div><div class="small muted">${TRN.FOCUS[t.focus].desc}</div></div>
      <div class="field"><label>Cường độ</label><div class="seg">${TRN.INTENSITY.map((f, i) => `<button class="${t.int === i ? "on" : ""}" data-act="train" data-k="int" data-v="${i}">${f.name}</button>`).join("")}</div></div>
      <div class="kv"><div><small>Phát triển</small><b>${x(plan.dev)}</b></div><div><small>Hồi thể lực</small><b>${x(plan.rec)}</b></div><div><small>Nguy cơ chấn thương khi tập</small><b style="color:${plan.inj > 1.2 ? "var(--red)" : plan.inj < 0.8 ? "var(--accent)" : "var(--text)"}">${x(plan.inj)}</b></div><div><small>Độ ăn ý sơ đồ</small><b>${plan.fam > 1 ? "tăng gấp đôi" : "bình thường"}</b></div></div>
      <div class="small muted">Cầu thủ đến 27 tuổi còn khoảng cách tới tiềm năng sẽ tiến bộ dần mỗi tuần, nhanh nhất là cầu thủ trẻ, được ra sân nhiều và chuyên nghiệp. Cầu thủ từ khoảng 29 tuổi sa sút dần khi sang mùa mới. Đội máy tập cân bằng, cường độ vừa.</div>
    </div>
    ${others.length ? `<div class="card-b small muted" style="border-top:1px solid var(--line)">Sơ đồ đã tập: ${others.map(([f, v]) => `<b>${f}</b>: ${Math.round(v)}%`).join(" · ")}</div>` : ""}
    </div>
    <div class="card"><h3>Tiến bộ mùa này</h3>${
      prog.length
        ? `<table class="plist"><tbody>${prog.map((p) => `<tr class="click" data-act="info" data-id="${p.id}"><td>${posTag(p.pos)}</td><td class="l"><b>${esc(p.sn)}</b><div class="small muted">${p.age} tuổi</div></td><td class="nowrap">${ovr(p)} ${stars(p.ca)}</td><td><b style="color:var(--accent)">+${p.dg}</b></td></tr>`).join("")}</tbody></table>`
        : `<div class="card-b small muted">Chưa ai tiến bộ — chờ vài tuần tập luyện.</div>`
    }</div>`;
  }

  // ---------- Lịch thi đấu ----------
  function viewFixtures() {
    const vn = userCountry() === "vn";
    const tabs = `<div class="tabs"><button data-act="fx-tab" data-t="mine" class="${ui.fxTab === "mine" ? "on" : ""}">Đội của tôi</button>${leagueTabs(userCountry())
      .map((L) => `<button data-act="fx-tab" data-t="${L.id}" class="${ui.fxTab === L.id ? "on" : ""}">${esc(L.short)}</button>`)
      .join("")}${vn ? `<button data-act="fx-tab" data-t="cup" class="${ui.fxTab === "cup" ? "on" : ""}">Cúp QG</button>` : ""}${vn && S.afc ? `<button data-act="fx-tab" data-t="afc" class="${ui.fxTab === "afc" ? "on" : ""}">Châu Á</button>` : ""}${userCountry() === "en" && S.enc ? `<button data-act="fx-tab" data-t="encup" class="${ui.fxTab === "encup" ? "on" : ""}">Cúp</button>` : ""}${userCountry() === "es" && S.esc ? `<button data-act="fx-tab" data-t="escup" class="${ui.fxTab === "escup" ? "on" : ""}">Cúp</button>` : ""}${!vn && S.ucl ? `<button data-act="fx-tab" data-t="ucl" class="${ui.fxTab === "ucl" ? "on" : ""}">Châu Âu</button>` : ""}</div>`;
    if (ui.fxTab === "cup") return tabs + viewCup();
    if (ui.fxTab === "encup") return tabs + viewEnCup();
    if (ui.fxTab === "escup") return tabs + viewEsCup();
    if (ui.fxTab === "ucl") return tabs + viewEurope();
    if (ui.fxTab === "afc") return tabs + viewAsia();
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
  function viewAsia() {
    if (!S.afc) return `<div class="card"><div class="card-b muted">Mùa này không có giải châu Á.</div></div>`;
    const comp = ui.afcTab || (S.afc.vn.acl2.includes(S.user) ? "acl2" : "acle");
    const st = S.afc.comps[comp];
    const fx = (id) => S.fx.find((f) => f.id === id);
    const nm = (id) => `<span class="tclub">${crest(id, "sm")}<span class="ellipsis link" data-act="club-view" data-id="${id}">${esc(club(id).name)}</span></span>`;
    const vn = S.afc.vn[comp] || [];
    const head = `<div class="seg" style="margin-bottom:10px">${Object.entries(AF.COMPS).map(([k, c]) => `<button class="${comp === k ? "on" : ""}" data-act="afc-tab" data-t="${k}">${c.short} · ${esc(c.name.replace("AFC ", ""))}</button>`).join("")}</div>
      <div class="card"><div class="card-b" style="display:grid;gap:6px">
        <div class="small muted">Đại diện Việt Nam</div>
        ${vn.length ? vn.map((id) => `<div class="row">${crest(id, "sm")}<b class="grow">${esc(club(id).name)}</b><span class="small">${esc(AF.result(S, comp, id))}</span></div>`).join("") : `<div class="small muted">Không có.</div>`}
        ${st.winner ? `<div class="row"><span style="font-size:20px">🏆</span><span class="grow">Vô địch: <b>${esc(club(st.winner).name)}</b></span></div>` : `<div class="small muted">Giai đoạn hiện tại: ${AF.STAGE_NAME[st.stage] || ""}</div>`}
      </div></div>`;
    // các vòng loại trực tiếp (mới nhất trước)
    const ko = ["f", "sf", "qf", "r16"]
      .map((stage) => {
        const ties = st.ties.filter((t) => t.stage === stage);
        if (!ties.length) return "";
        return `<div class="card"><h3>${AF.STAGE_NAME[stage]}</h3><table><tbody>${ties
          .map((t) => {
            const legs = t.legs.map(fx);
            const last = legs[legs.length - 1];
            let score;
            if (legs.length === 1) score = last.done ? `<b>${last.h === t.a ? last.hg : last.ag} – ${last.h === t.a ? last.ag : last.hg}</b>${last.pens ? `<div class="small muted">pen</div>` : ""}` : `<span class="small muted">${FM.fmtShortDate(last.d)}</span>`;
            else score = t.agg ? `<b>${t.agg[0]} – ${t.agg[1]}</b><div class="small muted">${legs.map((f) => `${f.h === t.a ? f.hg : f.ag}-${f.h === t.a ? f.ag : f.hg}`).join(", ")}${t.pens ? " · pen" : ""}</div>` : `<span class="small muted">${legs.map((f) => (f.done ? `${f.h === t.a ? f.hg : f.ag}-${f.h === t.a ? f.ag : f.hg}` : FM.fmtShortDate(f.d))).join(" / ")}</span>`;
            const me = t.a === S.user || t.b === S.user;
            return `<tr class="${me ? "me" : ""}"><td class="right" style="${t.w && t.w !== t.a ? "opacity:.55" : ""}">${nm(t.a)}</td><td class="center nowrap">${score}</td><td class="l" style="${t.w && t.w !== t.b ? "opacity:.55" : ""}">${nm(t.b)}</td></tr>`;
          })
          .join("")}</tbody></table></div>`;
      })
      .join("");
    const mini = (title, teams, filter, cut) => {
      const rows = AF.table(S, comp, teams, filter);
      return `<div class="card"><h3>${title}</h3><table><thead><tr><th>#</th><th class="l">CLB</th><th>Tr</th><th>HS</th><th>Đ</th></tr></thead><tbody>${rows
        .map((r, i) => `<tr class="${r.id === S.user ? "me" : ""} ${i < cut ? "zone-up" : ""}"><td>${i + 1}</td><td class="l">${nm(r.id)}<div class="small muted" style="margin-left:32px">${esc(AF.isForeign(r.id) ? AF.club(r.id).country : "Việt Nam")}</div></td><td>${r.p}</td><td>${r.gf - r.ga > 0 ? "+" : ""}${r.gf - r.ga}</td><td><b>${r.pts}</b></td></tr>`)
        .join("")}</tbody></table></div>`;
    };
    let tables = "";
    if (comp === "acle") tables = ["East", "West"].map((r) => mini(`Vòng phân hạng · Khu vực ${r === "East" ? "Đông" : "Tây"}`, st.regions[r], (f) => f.stage === "ls", 8)).join("");
    else {
      const order = Object.keys(st.groups).sort((a, b) => (vn.some((id) => st.groups[b].includes(id)) - vn.some((id) => st.groups[a].includes(id))) || (b >= "E") - (a >= "E") || a.localeCompare(b));
      tables = order.map((g) => mini(`Bảng ${g} · ${g >= "E" ? "Đông" : "Tây"}`, st.groups[g], (f) => f.grp === g, 2)).join("");
    }
    const mine = S.fx.filter((f) => f.lg === comp && vn.some((id) => f.h === id || f.a === id)).sort((a, b) => a.d.localeCompare(b.d));
    return head + ko + `<div class="card"><h3>Lịch đội Việt Nam</h3><table><tbody>${mine.map((f) => fixtureRow(f, false)).join("") || `<tr><td class="muted">—</td></tr>`}</tbody></table></div>` + tables;
  }
  function viewCup() {
    if (!S.cup) return `<div class="card"><div class="card-b muted">Chưa có Cúp mùa này.</div></div>`;
    const sc = S.fx.find((f) => f.lg === "super");
    const rounds = FM.Cups.rounds(S);
    return `<div class="card"><div class="card-b row"><span class="grow">Đội của bạn: <b>${esc(FM.Cups.userStatus(S))}</b></span>${S.cup.winner ? `<span class="pill gold">Vô địch: ${esc(club(S.cup.winner).name)}</span>` : ""}</div></div>
      ${sc ? `<div class="card"><h3>Siêu Cúp Quốc gia</h3><table><tbody>${fixtureRow(sc, false)}</tbody></table></div>` : ""}
      ${rounds
        .slice()
        .reverse()
        .map((R) => `<div class="card"><h3>${R.name}<span class="grow"></span><span class="small muted">${FM.fmtDate(R.ties[0].d)}</span></h3><table><tbody>${R.ties.map((f) => fixtureRow(f, false)).join("")}</tbody></table></div>`)
        .join("")}
      ${S.cup.round === 0 && S.cup.byes.length ? `<div class="card"><div class="card-b small muted">Miễn vòng loại: ${S.cup.byes.map((id) => esc(club(id).name)).join(", ")}</div></div>` : ""}`;
  }
  // FA Cup / League Cup / Community Shield
  // cúp quốc nội châu Âu (Anh: FA Cup / League Cup / Community Shield; Tây Ban Nha: Copa del Rey / Supercopa)
  function viewEnCup() {
    const EC = FM.EnCups;
    if (!S.enc) return `<div class="card"><div class="card-b muted">Mùa này chưa có cúp.</div></div>`;
    const comp = ui.encTab || "fac";
    const cs = S.enc.cs && S.fx.find((f) => f.id === S.enc.cs.fx);
    return natCups(EC, S.enc, ["fac", "efl"], comp, "enc-tab", {
      top: cs && comp === "fac" ? `<div class="card"><h3>Community Shield<span class="grow"></span><span class="small muted">Wembley · ${FM.fmtDate(cs.d)}</span></h3><table><tbody>${fixtureRow(cs, false)}</tbody></table></div>` : "",
      venue: "Wembley",
      note: comp === "fac" ? "Vòng 1 – 2: League One, League Two và 32 đội bán chuyên nghiệp. Premier League và Championship vào từ vòng 3 (tháng 1). Bán kết và chung kết ở Wembley." : "Vòng 1: 72 đội EFL. 12 đội Premier League vào vòng 2, 8 đội dự cúp châu Âu vào vòng 3. Bán kết hai lượt, chung kết ở Wembley.",
    });
  }
  function viewEsCup() {
    const EC = FM.EsCups;
    if (!S.esc) return `<div class="card"><div class="card-b muted">Mùa này chưa có cúp.</div></div>`;
    const comp = ui.escTab || "copa";
    return natCups(EC, S.esc, ["copa", "sup"], comp, "esc-tab", {
      venue: comp === "sup" ? "Ả Rập Xê Út" : "La Cartuja",
      note: comp === "copa" ? "Vòng 1: 16 đội LaLiga, 22 đội LaLiga 2 và các CLB hạng dưới; 4 đội dự Supercopa vào từ vòng 1/16. Một trận trên sân đội hạng thấp hơn, hoà đá luân lưu. Bán kết hai lượt, chung kết ở La Cartuja (Sevilla)." : "4 đội: vô địch và á quân LaLiga, hai đội vào chung kết Copa del Rey mùa trước. Đá tập trung ở Ả Rập Xê Út.",
    });
  }
  function natCups(EC, state, comps, comp, act, opt) {
    const st = state[comp];
    const nm = (id) => `<span class="tclub">${crest(id, "sm")}<span class="ellipsis link" data-act="club-view" data-id="${id}">${esc(club(id).name)}</span></span>`;
    const lvl = (id) => (EC.isGuest(id) ? `<div class="small muted" style="text-align:left;margin-left:32px">${esc(AF.club(id).lgName)}</div>` : "");
    const head = `<div class="seg" style="margin-bottom:10px">${comps.map((k) => `<button class="${comp === k ? "on" : ""}" data-act="${act}" data-t="${k}">${EC.COMPS[k].name}</button>`).join("")}</div>
      <div class="card"><div class="card-b row"><span class="grow">Đội của bạn: <b>${esc(EC.userStatus(S, comp) || "—")}</b></span>${st.winner ? `<span class="pill gold">Vô địch: ${esc(club(st.winner).name)}</span>` : ""}</div></div>
      ${opt.top || ""}`;
    const rounds = EC.rounds(S, comp)
      .map((R) => {
        const d = R.ties[0].legs[0].d;
        return `<div class="card"><h3>${R.name}<span class="grow"></span><span class="small muted">${R.ties[0].legs.length > 1 ? `${FM.fmtShortDate(d)} / ${FM.fmtShortDate(R.ties[0].legs[1].d)}` : FM.fmtDate(d)}${R.ties[0].legs[0].neutral ? ` · ${opt.venue}` : ""}</span></h3><table><tbody>${R.ties
          .sort((x, y) => (y.a === S.user || y.b === S.user) - (x.a === S.user || x.b === S.user))
          .map((t) => {
            const legs = t.legs;
            const f = legs[legs.length - 1];
            let score;
            const sc = (g) => `${g.h === t.a ? g.hg : g.ag}–${g.h === t.a ? g.ag : g.hg}`;
            if (legs.length === 1) score = f.done ? `<b>${sc(f)}</b>${f.pens ? `<div class="small muted">pen ${f.h === t.a ? f.pens[0] : f.pens[1]}–${f.h === t.a ? f.pens[1] : f.pens[0]}</div>` : ""}` : `<span class="small muted">${FM.fmtShortDate(f.d)}</span>`;
            else score = t.agg ? `<b>${t.agg[0]}–${t.agg[1]}</b><div class="small muted">${legs.map(sc).join(", ")}${t.pens ? " · pen" : ""}</div>` : `<span class="small muted">${legs.map((g) => (g.done ? sc(g) : FM.fmtShortDate(g.d))).join(" / ")}</span>`;
            const click = legs.length === 1 && f.done ? `class="click ${t.a === S.user || t.b === S.user ? "me" : ""}" data-act="fx-detail" data-id="${f.id}"` : `class="${t.a === S.user || t.b === S.user ? "me" : ""}"`;
            return `<tr ${click}><td class="right" style="${t.w && t.w !== t.a ? "opacity:.55" : ""}">${nm(t.a)}${lvl(t.a)}</td><td class="center nowrap">${score}</td><td class="l" style="${t.w && t.w !== t.b ? "opacity:.55" : ""}">${nm(t.b)}${lvl(t.b)}</td></tr>`;
          })
          .join("")}</tbody></table></div>`;
      })
      .join("");
    const pending = st.winner ? "" : `<div class="card"><div class="card-b small muted">${opt.note}</div></div>`;
    return head + rounds + pending;
  }
  // Champions League: đại diện Anh, các vòng loại trực tiếp, bảng 36 đội, vua phá lưới
  function viewEurope() {
    const UC = FM.UCL;
    const st = S.ucl;
    if (!st) return `<div class="card"><div class="card-b muted">Mùa này không có Champions League.</div></div>`;
    const fx = (id) => S.fx.find((f) => f.id === id);
    const nm = (id) => `<span class="tclub">${crest(id, "sm")}<span class="ellipsis link" data-act="club-view" data-id="${id}">${esc(club(id).name)}</span></span>`;
    const where = (id) => (AF.isForeign(id) ? AF.club(id).country : FM.COUNTRIES[W.countryOfClub(S, id)].name);
    const mineCountry = st.local.filter((id) => W.countryOfClub(S, id) === userCountry());
    const head = `<div class="card"><div class="card-b" style="display:grid;gap:6px">
        <div class="small muted">Đại diện ${esc(FM.COUNTRIES[userCountry()].name)}</div>
        ${mineCountry.map((id) => `<div class="row">${crest(id, "sm")}<b class="grow">${esc(club(id).name)}</b><span class="small">${esc(UC.result(S, id))}</span></div>`).join("")}
        ${st.winner ? `<div class="row"><span style="font-size:20px">🏆</span><span class="grow">Vô địch: <b>${esc(club(st.winner).name)}</b></span></div>` : `<div class="small muted">Giai đoạn hiện tại: ${UC.STAGE_NAME[st.stage] || ""}</div>`}
      </div></div>`;
    const ko = ["f", "sf", "qf", "r16", "po"]
      .map((stage) => {
        const ties = st.ties.filter((t) => t.stage === stage);
        if (!ties.length) return "";
        return `<div class="card"><h3>${UC.STAGE_NAME[stage]}</h3><table><tbody>${ties
          .map((t) => {
            const legs = t.legs.map(fx);
            const last = legs[legs.length - 1];
            const sc = (g) => `${g.h === t.a ? g.hg : g.ag}-${g.h === t.a ? g.ag : g.hg}`;
            let score;
            if (legs.length === 1) score = last.done ? `<b>${sc(last)}</b>${last.pens ? `<div class="small muted">pen</div>` : ""}` : `<span class="small muted">${FM.fmtShortDate(last.d)}</span>`;
            else score = t.agg ? `<b>${t.agg[0]} – ${t.agg[1]}</b><div class="small muted">${legs.map(sc).join(", ")}${t.pens ? " · pen" : ""}</div>` : `<span class="small muted">${legs.map((g) => (g.done ? sc(g) : FM.fmtShortDate(g.d))).join(" / ")}</span>`;
            return `<tr class="${t.a === S.user || t.b === S.user ? "me" : ""}"><td class="right" style="${t.w && t.w !== t.a ? "opacity:.55" : ""}">${nm(t.a)}</td><td class="center nowrap">${score}</td><td class="l" style="${t.w && t.w !== t.b ? "opacity:.55" : ""}">${nm(t.b)}</td></tr>`;
          })
          .join("")}</tbody></table></div>`;
      })
      .join("");
    const mine = S.fx.filter((f) => f.lg === "ucl" && mineCountry.some((id) => f.h === id || f.a === id) && (f.h === S.user || f.a === S.user || !mineCountry.includes(S.user))).sort((a, b) => a.d.localeCompare(b.d));
    const rows = UC.table(S);
    const zone = (i) => (i < 8 ? "zone-up" : i < 24 ? "zone-po" : "zone-down");
    const table = `<div class="card"><h3>Vòng phân hạng</h3><table><thead><tr><th>#</th><th class="l">CLB</th><th>Tr</th><th>HS</th><th>Đ</th></tr></thead><tbody>${rows
      .map((r, i) => `<tr class="${r.id === S.user ? "me" : ""} ${zone(i)}"><td>${i + 1}</td><td class="l">${nm(r.id)}<div class="small muted" style="margin-left:32px">${esc(where(r.id))}</div></td><td>${r.p}</td><td>${r.gf - r.ga > 0 ? "+" : ""}${r.gf - r.ga}</td><td><b>${r.pts}</b></td></tr>`)
      .join("")}</tbody></table><div class="card-b small muted">Hạng 1–8 vào thẳng vòng 1/8 · 9–24 đá play-off · 25–36 bị loại</div></div>`;
    const top = UC.scorers(S, 10);
    const scorers = top.length ? `<div class="card"><h3>Vua phá lưới</h3><table class="plist"><tbody>${top.map((x, i) => { const p = W.player(S, x.id); return p ? `<tr class="click" data-act="info" data-id="${x.id}"><td>${i + 1}</td><td class="l"><b>${esc(p.sn)}</b><div class="small muted">${esc(club(p.c).name)}</div></td><td><b>${x.g}</b></td></tr>` : ""; }).join("")}</tbody></table></div>` : "";
    return head + ko + `<div class="card"><h3>${mineCountry.includes(S.user) ? "Lịch của đội bạn" : `Lịch các đội ${esc(FM.COUNTRIES[userCountry()].name)}`}</h3><table><tbody>${mine.map((f) => fixtureRow(f, false)).join("") || `<tr><td class="muted">—</td></tr>`}</tbody></table></div>` + table + scorers;
  }
  function trophies() {
    const list = [];
    for (const h of S.history) {
      for (const [lg, id] of Object.entries(h.champions)) if (id === S.user) list.push([FM.LEAGUE[lg]?.tier === 1 ? "🏆" : "🥇", `Vô địch ${W.leagueName(lg)}`, h.season]);
      if (h.cup && h.cup.winner === S.user) list.push(["🏆", "Cúp Quốc gia", h.season]);
      if (h.cup && h.cup.superWinner === S.user) list.push(["🛡️", "Siêu Cúp Quốc gia", h.season]);
      if (h.promoted.includes(S.user)) list.push(["⬆️", `Lên hạng${h.moves ? ` ${W.leagueName((h.moves.find((m) => m.id === S.user) || {}).to)}` : ""}`, h.season]);
      for (const [k, c] of Object.entries(AF.COMPS)) if (h.afc && h.afc[k] && h.afc[k].winner === S.user) list.push(["🌏", c.name, h.season]);
      if (h.enc && h.enc.fac.winner === S.user) list.push(["🏆", "FA Cup", h.season]);
      if (h.enc && h.enc.efl.winner === S.user) list.push(["🏆", "League Cup", h.season]);
      if (h.enc && h.enc.cs === S.user) list.push(["🛡️", "Community Shield", h.season]);
      if (h.ucl && h.ucl.winner === S.user) list.push(["🌍", "Champions League", h.season]);
      if (h.esc && h.esc.copa.winner === S.user) list.push(["🏆", "Copa del Rey", h.season]);
      if (h.esc && h.esc.sup.winner === S.user) list.push(["🛡️", "Supercopa de España", h.season]);
    }
    if (S.enc && S.enc.cs && S.enc.cs.winner === S.user && !S.history.some((h) => h.season === W.label(S))) list.push(["🛡️", "Community Shield", W.label(S)]);
    if (S.enc && !S.history.some((h) => h.season === W.label(S))) for (const k of ["fac", "efl"]) if (S.enc[k].winner === S.user) list.push(["🏆", FM.EnCups.COMPS[k].name, W.label(S)]);
    if (S.esc && !S.history.some((h) => h.season === W.label(S))) for (const k of ["copa", "sup"]) if (S.esc[k].winner === S.user) list.push([k === "sup" ? "🛡️" : "🏆", FM.EsCups.COMPS[k].name, W.label(S)]);
    if (S.cup && S.cup.superWinner === S.user && !S.history.some((h) => h.season === W.label(S))) list.push(["🛡️", "Siêu Cúp Quốc gia", W.label(S)]);
    return list;
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
      ${mine ? `<td class="small muted">${f.po ? (f.poLg ? "PO" : "PO") : AF.isAfc(f) ? AF.COMPS[f.lg].short : FM.EnCups.isEn(f) ? FM.EnCups.COMPS[f.lg].short : FM.EsCups && FM.EsCups.isEs(f) ? FM.EsCups.COMPS[f.lg].short : FM.UCL.isUcl(f) ? "UCL" : f.lg === "super" ? "SC" : f.lg === "cup" ? "CQG" : `${FM.leagueShort(f.lg)}·${f.rd}`}</td>` : ""}
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
        <div><small>Quỹ lương (mỗi tuần)</small><b style="color:${bill > c.wageCap ? "var(--red)" : "var(--text)"}">${FM.fmtWage(bill)} / ${FM.fmtWage(c.wageCap)}</b></div>
      </div>${win.open ? "" : `<div class="card-b small muted" style="padding-top:0">Ngoài kỳ chuyển nhượng vẫn ký được cầu thủ tự do.</div>`}</div>
      <div class="tabs">${tab("search", "Tìm kiếm")}${tab("offers", `Đề nghị${open.length ? ` (${open.length})` : ""}`)}${tab("scout", `Tuyển trạch${SC.ensure(S).jobs.length ? ` (${S.sc.jobs.length})` : ""}`)}${tab("contracts", "Hợp đồng")}${tab("news", "Tin tức")}</div>`;
    if (ui.mk.tab === "offers") return head + viewOffers();
    if (ui.mk.tab === "contracts") return head + viewContracts();
    if (ui.mk.tab === "news") return head + viewTransferNews();
    if (ui.mk.tab === "scout") return head + viewScouting();
    const f = ui.mk;
    const list = T.search(S, { group: f.group, where: f.where === "listed" ? "all" : f.where, listed: f.where === "listed", sort: f.sort, maxAge: +f.maxAge || 0, maxFee: +f.maxFee || 0 });
    const groups = [["", "Tất cả"], ["GK", "Thủ môn"], ["DF", "Hậu vệ"], ["MF", "Tiền vệ"], ["FW", "Tiền đạo"]];
    const sel = (name, opts, cur) => `<select data-change="mk" data-k="${name}" class="btn sm">${opts.map(([v, l]) => `<option value="${v}" ${String(cur) === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
    return (
      head +
      `<div class="card"><div class="card-b" style="display:grid;gap:8px">
        <div class="seg">${groups.map(([g, l]) => `<button class="${f.group === g ? "on" : ""}" data-act="mk-group" data-g="${g}">${l}</button>`).join("")}</div>
        <div class="row wrap">
          ${sel("where", [["all", "Mọi CLB"], ...Object.entries(FM.COUNTRIES).map(([k, c]) => [`country:${k}`, `Cả nước ${c.name}`]), ...FM.LEAGUES.map((L) => [L.id, `${L.name} (${FM.COUNTRIES[L.country].name})`]), ["free", "Cầu thủ tự do"], ["listed", "Đang rao bán"]], f.where)}
          ${sel("sort", [["ca", "Năng lực cao"], ["pot", "Tiềm năng cao"], ["value", "Giá trị cao"], ["age", "Trẻ nhất"]], f.sort)}
          ${sel("maxAge", [["", "Mọi tuổi"], ["21", "≤ 21 tuổi"], ["23", "≤ 23 tuổi"], ["27", "≤ 27 tuổi"], ["30", "≤ 30 tuổi"]], f.maxAge)}
          ${sel("maxFee", [["", "Mọi mức giá"], ...[1e5, 5e5, 1e6, 5e6, 2e7, 5e7].map((g) => [String(Math.round(FM.gbpToTy(g) * 100) / 100), `≤ ${FM.fmtGbp(g)}`])], f.maxFee)}
        </div>
      </div>
      <div class="scroll-x"><table class="plist"><thead><tr><th>VT</th><th class="l">Cầu thủ</th><th>Năng lực · giá trị</th></tr></thead><tbody>${
        list
          .slice(0, f.limit)
          .map(
            (p) => `<tr class="click" data-act="info" data-id="${p.id}"><td>${posTag(p.pos)}</td><td class="l" style="white-space:normal"><b>${esc(p.sn)}</b>${flags(p)} ${status(p)}${S.p[p.id].listed ? ' <span class="pill gold">Rao bán</span>' : ""}${gradePill(p.id)}<div class="small muted">${p.age} tuổi · ${esc(club(p.c).name)}${p.ce ? ` · HĐ ${p.ce.slice(0, 4)}` : ""}</div></td><td>${ovr(p)} ${caStars(p)}<div class="small muted">TN ${paStars(p)}</div><b class="small">${valText(p)}</b></td></tr>`,
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
              if (o.type === "loan")
                return `<div class="card-b" style="border-top:1px solid var(--line);display:grid;gap:8px"><div class="row">${crest(o.from, "sm")}<div class="grow"><b>${esc(club(o.from).name)}</b> muốn mượn <b class="link" data-act="info" data-id="${p.id}">${esc(p.sn)}</b><div class="small muted">Đến hết mùa · vai trò dự kiến: ${FM.Loans.ROLE_LABEL[o.role].toLowerCase()} · hết hạn ${FM.fmtDate(o.exp, false)}</div></div><b style="font-size:15px">${Math.round(o.share * 100)}% lương</b></div>
              <div class="row wrap"><button class="btn sm primary" data-act="loan-accept" data-id="${o.id}">Đồng ý cho mượn</button><button class="btn sm danger" data-act="offer-reject" data-id="${o.id}">Từ chối</button></div></div>`;
              return `<div class="card-b" style="border-top:1px solid var(--line);display:grid;gap:8px"><div class="row">${crest(o.from, "sm")}<div class="grow"><b>${esc(club(o.from).name)}</b> muốn mua <b class="link" data-act="info" data-id="${p.id}">${esc(p.sn)}</b><div class="small muted">Giá trị ${FM.fmtMoney(p.val)} · hết hạn ${FM.fmtDate(o.exp, false)}</div></div><b style="font-size:16px">${FM.fmtMoney(o.fee)}</b></div>
              <div class="row wrap"><button class="btn sm primary" data-act="offer-accept" data-id="${o.id}">Đồng ý bán</button><button class="btn sm" data-act="offer-counter" data-id="${o.id}">Ra giá</button><button class="btn sm danger" data-act="offer-reject" data-id="${o.id}">Từ chối</button></div></div>`;
            })
            .join("")
        : `<div class="card-b muted">Chưa có đề nghị nào. Rao bán hoặc đánh dấu cho mượn (trong hồ sơ cầu thủ) để các CLB khác chú ý.</div>`
    }</div>
    ${past.length ? `<div class="card"><h3>Đã xử lý</h3><table><tbody>${past.map((o) => `<tr><td class="l">${esc(W.player(S, o.pid)?.sn || "?")}</td><td class="l small">${esc(club(o.from).name)}</td><td>${o.type === "loan" ? `Mượn ${Math.round(o.share * 100)}%` : FM.fmtMoney(o.fee)}</td><td class="small">${{ accepted: o.type === "loan" ? "Đã cho mượn" : "Đã bán", rejected: "Từ chối", expired: "Hết hạn" }[o.status] || o.status}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  }
  function viewContracts() {
    const end = `${S.season + 1}-06-30`;
    const squad = W.squad(S, S.user)
      .filter((p) => !p.loan)
      .sort((a, b) => (a.ce || "").localeCompare(b.ce || "") || b.ca - a.ca);
    return `<div class="card"><h3>Hợp đồng (${squad.length} cầu thủ)</h3><div class="scroll-x"><table class="plist"><thead><tr><th>VT</th><th class="l">Cầu thủ</th><th>Lương</th><th>Hết hạn</th><th></th></tr></thead><tbody>${squad
      .map(
        (p) => `<tr><td>${posTag(p.pos)}</td><td class="l click" data-act="info" data-id="${p.id}"><b>${esc(p.sn)}</b>${flags(p)}${S.p[p.id].listed ? ' <span class="pill gold">Rao bán</span>' : ""}<div class="small muted">${p.age} tuổi · ${T.ROLE_LABEL[T.role(S, p)]}</div></td><td class="small">${FM.fmtWage(p.wage)}</td><td class="small" style="color:${p.ce <= end ? "var(--red)" : "var(--text)"}">${FM.fmtDate(p.ce, false)}</td><td><button class="btn sm" data-act="renew" data-id="${p.id}">Gia hạn</button></td></tr>`,
      )
      .join("")}</tbody></table></div><div class="card-b small muted">Hợp đồng hết hạn ngày 30/6 (màu đỏ: hết hạn cuối mùa này). Không gia hạn thì cầu thủ ra đi tự do.</div></div>${viewLoans()}`;
  }
  function viewLoans() {
    const all = Object.keys(S.p).filter((id) => S.p[id].loan).map((id) => W.player(S, id));
    const out = all.filter((p) => p.loan.from === S.user);
    const inn = all.filter((p) => p.c === S.user);
    const stat = (p) => `${p.st.ap} trận · ${p.st.g} bàn${p.st.ap ? ` · TB ${(p.st.rs / p.st.ap).toFixed(1)}` : ""}${p.dg ? ` · <b style="color:var(--accent)">+${p.dg}</b>` : ""}`;
    const end = FM.fmtDate(`${S.season + 1}-06-30`, false);
    return `<div class="card"><h3>Đang cho mượn (${out.length})</h3>${
      out.length
        ? `<table class="plist"><tbody>${out.map((p) => `<tr class="click" data-act="info" data-id="${p.id}"><td>${posTag(p.pos)}</td><td class="l" style="white-space:normal"><b>${esc(p.sn)}</b><div class="small muted">${p.age} tuổi · ${esc(club(p.c).name)} · họ trả ${Math.round(p.loan.share * 100)}% lương</div></td><td class="small">${stat(p)}</td></tr>`).join("")}</tbody></table>`
        : `<div class="card-b small muted">Chưa cho mượn ai. Cầu thủ trẻ ít được đá có thể cho mượn để có trận và phát triển nhanh hơn: mở hồ sơ cầu thủ → "Cho mượn", các CLB cần người sẽ gửi đề nghị trong kỳ chuyển nhượng.</div>`
    }</div>
    <div class="card"><h3>Đang mượn (${inn.length})</h3>${
      inn.length
        ? `<table class="plist"><tbody>${inn.map((p) => `<tr><td>${posTag(p.pos)}</td><td class="l click" data-act="info" data-id="${p.id}" style="white-space:normal"><b>${esc(p.sn)}</b><div class="small muted">từ ${esc(club(p.loan.from).name)} · bạn trả ${Math.round(p.loan.share * 100)}% lương (${FM.fmtWage(p.wage * p.loan.share)})</div></td><td>${p.loan.buy ? `<button class="btn sm primary" data-act="loan-exercise" data-id="${p.id}">Mua đứt ${FM.fmtMoney(p.loan.buy)}</button>` : `<span class="small muted">${stat(p)}</span>`}</td></tr>`).join("")}</tbody></table>`
        : `<div class="card-b small muted">Chưa mượn ai. Mở hồ sơ cầu thủ đội khác → "Hỏi mượn" khi kỳ chuyển nhượng mở.</div>`
    }<div class="card-b small muted" style="border-top:1px solid var(--line)">Mọi hợp đồng cho mượn kết thúc ngày ${end}, cầu thủ trở về CLB chủ quản.</div></div>`;
  }
  function viewScouting() {
    const sc = SC.ensure(S);
    const slots = SC.slots(S);
    const jobName = (j) => (j.kind === "club" ? `CLB ${esc(club(j.target).name)}` : esc(W.player(S, j.target)?.n || "?"));
    const jobs = sc.jobs
      .map(
        (j) => `<div class="card-b" style="border-top:1px solid var(--line);display:grid;gap:6px"><div class="row"><span style="font-size:18px">${j.kind === "club" ? "🏟️" : "🔍"}</span><b class="grow link" data-act="${j.kind === "club" ? "club-view" : "info"}" data-id="${j.target}">${jobName(j)}</b><span class="small muted">xong ${FM.fmtDate(j.end, false)}</span><button class="btn sm danger" data-act="scout-cancel" data-id="${j.id}">Huỷ</button></div><div class="bar"><i style="width:${Math.round(SC.progress(S, j) * 100)}%"></i></div></div>`,
      )
      .join("");
    const reps = Object.entries(sc.reports)
      .map(([id, r]) => [W.player(S, id), r])
      .filter(([p]) => p && p.c !== S.user)
      .sort((a, b) => a[1].grade.localeCompare(b[1].grade) || b[1].d.localeCompare(a[1].d));
    return `<div class="card"><h3>Tuyển trạch viên (${sc.jobs.length}/${slots} đang bận)</h3>${
      jobs || `<div class="card-b muted small">Chưa giao việc nào. Mở hồ sơ một cầu thủ đội khác và bấm "Cử tuyển trạch", hoặc mở trang một CLB để theo dõi cả đội.</div>`
    }<div class="card-b small muted" style="border-top:1px solid var(--line)">Một cầu thủ: 5–8 ngày, ${FM.fmtMoney(SC.cost(S, "player"))}, biết chính xác mọi chỉ số kèm báo cáo. Cả CLB: 14–18 ngày, ${FM.fmtMoney(SC.cost(S, "club"))}, biết khá rõ cả đội. Khác giải thì lâu hơn. Cầu thủ đối thủ đã ra sân gặp đội bạn cũng được biết thêm.</div></div>
    <div class="card"><h3>Báo cáo (${reps.length})</h3>${
      reps.length
        ? `<table class="plist"><tbody>${reps.map(([p, r]) => `<tr class="click" data-act="info" data-id="${p.id}"><td><span class="pill grade g${r.grade}">${r.grade}</span></td><td>${posTag(p.pos)}</td><td class="l" style="white-space:normal"><b>${esc(p.sn)}</b>${flags(p)}<div class="small muted">${p.age} tuổi · ${esc(club(p.c).name)}${r.season !== S.season ? " · báo cáo mùa trước" : ""}</div></td><td>${ovr(p)} ${caStars(p)}<div class="small"><b>${valText(p)}</b></div></td></tr>`).join("")}</tbody></table>`
        : `<div class="card-b muted small">Chưa có báo cáo nào.</div>`
    }</div>`;
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
  // ô nhập tiền bằng £: phí theo £ nghìn, lương theo £ / tuần (bên trong vẫn là tỷ / triệu VND)
  const toK = (ty) => Math.max(0, Math.round(FM.tyToGbp(ty) / 1000));
  const fromK = (k) => Math.round(FM.gbpToTy(Math.max(0, +k) * 1000) * 1000) / 1000;
  const toWeek = (tr) => Math.max(0, Math.round(FM.trToGbpWeek(tr)));
  const fromWeek = (w) => Math.max(1, Math.round(FM.gbpWeekToTr(Math.max(0, +w))));
  const stepper = (id, value, steps, unit) =>
    `<div class="row wrap">${steps.filter((x) => x < 0).map((x) => `<button class="btn sm" data-act="adj" data-for="${id}" data-step="${x}">${x}</button>`).join("")}
     <input id="${id}" type="number" step="any" value="${value}" class="btn" style="width:110px;text-align:center"> <span class="small muted">${unit}</span>
     ${steps.filter((x) => x > 0).map((x) => `<button class="btn sm" data-act="adj" data-for="${id}" data-step="${x}">+${x}</button>`).join("")}</div>`;
  function loanModal(pid) {
    const p = W.player(S, pid);
    const t = FM.Loans.terms(S, p);
    const role = FM.Loans.roleAt(S, p, S.user);
    const share = ui.loanShare ?? 0.5;
    openModal(`<div class="sheet-h">${crest(p.c)}<div class="grow"><div class="t" style="font-size:20px">Hỏi mượn ${esc(p.sn)}</div><div class="small muted">${esc(club(p.c).name)} · ${T.ROLE_LABEL[T.role(S, p)]} · đến ${FM.fmtDate(`${S.season + 1}-06-30`, false)}</div></div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b">
        <div class="kv"><div><small>Lương cầu thủ</small><b>${FM.fmtWage(p.wage)}</b></div><div><small>Bạn trả</small><b>${FM.fmtWage(p.wage * share)}</b></div><div><small>Ở đội bạn sẽ</small><b>${role ? FM.Loans.ROLE_LABEL[role] : "khó có suất"}</b></div><div><small>Quỹ lương</small><b>${FM.fmtWage(T.wageBill(S, S.user))} / ${FM.fmtWage(S.clubs[S.user].wageCap)}</b></div></div>
        ${t.refuse ? `<div class="pill red" style="white-space:normal">${esc(t.refuse)}</div>` : ""}
        <label class="small muted">Phần lương bạn trả</label>
        <div class="seg">${FM.Loans.SHARES.map((x) => `<button class="${share === x ? "on" : ""}" data-act="loan-share" data-id="${pid}" data-v="${x}">${Math.round(x * 100)}%</button>`).join("")}</div>
        ${t.buy ? `<button class="btn ${ui.loanBuy ? "primary" : ""}" data-act="loan-buy-toggle" data-id="${pid}">${ui.loanBuy ? "☑" : "☐"} Kèm điều khoản mua đứt: ${FM.fmtMoney(t.buy)}</button>` : `<div class="small muted">Không thể kèm điều khoản mua đứt cho cầu thủ này.</div>`}
        <div id="negMsg" class="small"></div>
        <button class="btn primary block" data-act="loan-send" data-id="${pid}" ${t.refuse ? "disabled" : ""}>Gửi đề nghị mượn</button>
      </div>`);
  }
  function bidModal(pid, fee) {
    const p = W.player(S, pid);
    openModal(`<div class="sheet-h">${crest(p.c)}<div class="grow"><div class="t" style="font-size:20px">Hỏi mua ${esc(p.sn)}</div><div class="small muted">${esc(club(p.c).name)} · ${T.ROLE_LABEL[T.role(S, p)]} · HĐ đến ${FM.fmtDate(p.ce, false)}</div></div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b">
        <div class="kv"><div><small>Giá trị ước tính</small><b>${valText(p)}</b></div><div><small>Số dư của bạn</small><b>${FM.fmtMoney(S.clubs[S.user].bal)}</b></div><div><small>Lương hiện tại</small><b>${FM.fmtWage(p.wage)}</b></div></div>
        <label class="small muted">Phí chuyển nhượng đề nghị (£ nghìn)</label>
        ${stepper("feeIn", toK(fee ?? SC.estVal(S, p)), [-1000, -100, -10, 10, 100, 1000], "£ nghìn")}
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
        <label class="small muted">Lương đề nghị (£ / tuần)</label>
        ${stepper("wageIn", toWeek(dem.wage * 0.9), [-1000, -100, -10, 10, 100, 1000], "£ / tuần")}
        <label class="small muted">Thời hạn</label>
        <div class="seg">${[1, 2, 3, 4, 5].map((y) => `<button data-act="years" data-y="${y}" class="${y === dem.years ? "on" : ""}">${y} năm</button>`).join("")}</div>
        <button class="btn ${ui.promise ? "primary" : ""}" data-act="promise-toggle">${ui.promise ? "☑" : "☐"} Hứa suất đá chính (cầu thủ bớt 10% lương đòi hỏi)</button>
        <div class="small muted">Đã hứa thì trong 6 tuần cầu thủ cần đá khoảng 2/6 trận, thất hứa cậu ấy sẽ đòi ra đi.</div>
        <div id="negMsg" class="small"></div>
        <button class="btn primary block" data-act="contract-send" data-id="${pid}" data-kind="${kind}">Đề nghị hợp đồng</button>
        <div class="small muted">Cầu thủ chỉ chấp nhận tối đa 3 lần trả giá.</div>
      </div>`);
    ui.years = dem.years;
  }
  ui.promise = false;
  function counterModal(offerId) {
    const o = S.tr.offers.find((x) => x.id === offerId);
    const p = W.player(S, o.pid);
    openModal(`<div class="sheet-h"><div class="grow t" style="font-size:20px">Ra giá ${esc(p.sn)}</div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b"><div class="small muted">${esc(club(o.from).name)} đang đề nghị ${FM.fmtMoney(o.fee)}. Giá trị ước tính ${FM.fmtMoney(p.val)}. Đòi quá cao họ sẽ rút lui.</div>
      ${stepper("feeIn", toK(o.fee * 1.2), [-1000, -100, -10, 10, 100, 1000], "£ nghìn")}
      <button class="btn primary block" data-act="counter-send" data-id="${offerId}">Gửi mức giá</button></div>`);
  }
  function listModal(pid) {
    const p = W.player(S, pid);
    openModal(`<div class="sheet-h"><div class="grow t" style="font-size:20px">Rao bán ${esc(p.sn)}</div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b"><div class="small muted">Giá trị ước tính ${FM.fmtMoney(p.val)}. Cầu thủ đang rao bán được các CLB chú ý hơn trong kỳ chuyển nhượng.</div>
      <label class="small muted">Giá chào bán</label>${stepper("feeIn", toK(p.val * 1.1), [-1000, -100, -10, 10, 100, 1000], "£ nghìn")}
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
    const country = ui.tableCountry || userCountry();
    const leagues = leagueTabs(country);
    if (!ui.tableTab || (ui.tableTab !== "scorers" && !leagues.some((L) => L.id === ui.tableTab))) ui.tableTab = leagues.some((L) => L.id === S.clubs[S.user].league) ? S.clubs[S.user].league : leagues[0].id;
    const others = Object.keys(FM.COUNTRIES).filter((k) => k !== country);
    const tabs = `<div class="tabs">${leagues.map((L) => `<button data-act="table-tab" data-t="${L.id}" class="${ui.tableTab === L.id ? "on" : ""}">${esc(L.short)}</button>`).join("")}<button data-act="table-tab" data-t="scorers" class="${ui.tableTab === "scorers" ? "on" : ""}">Vua phá lưới</button>${others.map((k) => `<button data-act="table-country" data-c="${k}">${esc(FM.COUNTRIES[k].name)}</button>`).join("")}</div>`;
    if (ui.tableTab === "scorers") {
      const block = (lg) => {
        const list = W.topScorers(S, lg, 12);
        return `<div class="card"><h3>${W.leagueName(lg)}</h3><table><tbody>${list.length ? list.map((p, i) => `<tr class="click ${p.c === S.user ? "me" : ""}" data-act="info" data-id="${p.id}"><td>${i + 1}</td><td class="l"><b>${esc(p.sn)}</b>${flags(p)}<div class="small muted">${esc(club(p.c).name)}</div></td><td><b>${p.st.g}</b> <span class="small muted">bàn</span></td><td class="small muted">${p.st.as} kt</td></tr>`).join("") : `<tr><td class="muted">Chưa có bàn thắng.</td></tr>`}</tbody></table></div>`;
      };
      return tabs + leagues.map((L) => block(L.id)).join("");
    }
    const lg = ui.tableTab;
    const L = FM.LEAGUE[lg];
    const R = L.rules;
    const rows = W.table(S, lg);
    const n = rows.length;
    const above = FM.leagueAbove(lg);
    const below = FM.leagueBelow(lg);
    const zone = (i) => {
      const r = i + 1;
      if (R.vnPlayoff && L.tier === 1) return r === n ? "zone-down" : r === R.vnPlayoff ? "zone-po" : "";
      if (R.vnPlayoff) return r <= (R.up || 0) ? "zone-up" : r === R.vnPlayoff ? "zone-po" : r > n - (R.out || 0) ? "zone-down" : "";
      // đội B không được lên hạng: các suất dồn xuống đội kế tiếp
      const elig = W.promotable(S, rows.map((x) => x.id), above && above.id);
      const k = elig.indexOf(rows[i].id);
      if (R.up && k >= 0 && k < R.up) return "zone-up";
      if (R.po && k >= (R.up || 0) && k < (R.up || 0) + R.po[1] - R.po[0] + 1) return "zone-po";
      if (r > n - (R.down || R.out || 0)) return "zone-down";
      return "";
    };
    const legend = [
      R.up && above ? `🟩 Hạng 1${R.up > 1 ? `–${R.up}` : ""} lên ${above.name}` : "",
      R.vnPlayoff ? `🟨 Hạng ${R.vnPlayoff} đá play-off với ${L.tier === 1 ? "hạng nhì V.League 2" : "hạng 13 V.League 1"}` : R.po ? `🟨 Hạng ${R.po[0]}–${R.po[1]} đá play-off (bán kết hai lượt, chung kết ${R.poFinal === "twoLegs" ? "hai lượt" : "ở Wembley"}${R.poTie === "seed" ? "; hoà tổng tỉ số thì đội xếp trên đi tiếp" : ""})` : "",
      R.down && below ? `🟥 ${R.down} đội cuối xuống ${below.name}` : R.out ? `🟥 ${R.out > 1 ? `${R.out} đội cuối` : "Đội cuối"} rời giải (xuống ${FM.lowerName(country)})` : "",
    ].filter(Boolean);
    return (
      tabs +
      `<div class="card scroll-x"><h3>${esc(L.name)}</h3><table><thead><tr><th>#</th><th class="l">CLB</th><th>Tr</th><th>T</th><th>H</th><th>B</th><th>HS</th><th>Đ</th><th>Phong độ</th></tr></thead><tbody>${rows
        .map(
          (r, i) => `<tr class="click ${zone(i)} ${r.id === S.user ? "me" : ""}" data-act="club-view" data-id="${r.id}"><td>${i + 1}</td><td class="l"><span class="tclub">${crest(r.id, "sm")}<span class="ellipsis">${esc(club(r.id).name)}</span></span></td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gd > 0 ? "+" : ""}${r.gd}</td><td><b>${r.pts}</b></td><td>${formIcons(r.form)}</td></tr>`,
        )
        .join("")}</tbody></table>
      <div class="card-b small muted">${legend.join(" · ")}</div></div>`
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
      <div><small>Quỹ lương (mỗi tuần)</small><b>${FM.fmtWage(wages)}</b></div>
      <div><small>Tiền vé mùa này</small><b>${FM.fmtMoney(c.gate)}</b></div>
      <div><small>Giá trị đội hình</small><b>${FM.fmtMoney(value)}</b></div>
    </div></div>
    ${(() => {
      const t = trophies();
      return `<div class="card"><h3>Phòng danh hiệu</h3>${t.length ? `<table><tbody>${t.map(([i, n, ss]) => `<tr><td style="font-size:20px">${i}</td><td class="l"><b>${n}</b></td><td class="small muted">${ss}</td></tr>`).join("")}</tbody></table>` : `<div class="card-b muted small">Chưa có danh hiệu nào dưới thời bạn. Vô địch giải, Cúp Quốc gia hoặc Siêu Cúp để ghi tên ở đây.</div>`}</div>`;
    })()}
    ${hist ? `<div class="card"><h3>Lịch sử</h3><table><tbody>${hist}</tbody></table></div>` : ""}
    ${S.history.some((h) => h.awards) ? `<div class="card"><h3>Giải thưởng các mùa</h3>${S.history
      .slice()
      .reverse()
      .filter((h) => h.awards)
      .map((h) => leagueTabs(userCountry()).map((L) => L.id).filter((lg) => h.awards[lg]).map((lg) => `<div class="card-b" style="border-top:1px solid var(--line);display:grid;gap:6px"><b class="small">${h.season} · ${W.leagueName(lg)}</b>${awardsBox(h.awards, lg, true)}</div>`).join(""))
      .join("")}</div>` : ""}
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
    const k = kn(p);
    const cell = (i) => {
      const r = SC.attrRange(S, p, i, k);
      if (!r) return `<b class="fog">?</b>`;
      const up = r[0] === r[1] && p.up && p.up[i] && FM.daysBetween(p.up[i], S.date) <= 30 ? `<i class="up" title="Tăng ngày ${FM.fmtDate(p.up[i], false)}">▲</i>` : "";
      return r[0] === r[1] ? `<b class="${cls(r[0])}">${up}${r[0]}</b>` : `<b class="${cls((r[0] + r[1]) / 2)} range">${r[0]}–${r[1]}</b>`;
    };
    const groups = FM.ATTR_GROUPS.filter(([g]) => (p.pos === "GK" ? g !== "Kỹ thuật" : g !== "Thủ môn"))
      .map(([g, keys]) => `<div><h4>${g}</h4>${keys.map((key) => `<div class="attr"><span>${FM.ATTR_LABEL[key]}</span>${cell(FM.A[key])}</div>`).join("")}</div>`)
      .join("");
    const st = p.st;
    const avg = st.ap ? (st.rs / st.ap).toFixed(2) : "–";
    const alt = Object.keys(p.alt || {})
      .filter((k) => k !== p.pos)
      .sort((a, b) => p.alt[b] - p.alt[a])
      .map((k) => `${FM.POS_LABEL[k]} – ${FM.POS_NAME[k]} (${FM.famLevel(p.alt[k])})`)
      .join(", ");
    openModal(`<div class="sheet-h">${crest(p.c)}<div class="grow"><div class="t" style="font-size:22px">${esc(p.n)}</div><div class="small muted">${esc(c.name)} · số ${p.no ?? "–"} · ${FM.POS_LABEL[p.pos]} – ${FM.POS_NAME[p.pos]}</div></div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b">
        <div class="row wrap">${posTag(p.pos)} ${ovr(p, k)} ${caStars(p, k)} <span class="small muted">tiềm năng</span> ${paStars(p, k)} ${flags(p)} ${status(p)}${gradePill(p.id)}</div>
        ${p.c === S.user ? (p.loan ? "" : moraleBox(p)) : scoutBox(p, k)}
        <div class="kv">
          <div><small>Tuổi</small><b>${p.age}</b></div>
          <div><small>Quốc tịch</small><b>${esc(p.nat)}</b></div>
          <div><small>Chiều cao / cân nặng</small><b>${p.h || "?"} cm · ${p.w || "?"} kg</b></div>
          <div><small>Chân thuận</small><b>${{ right: "Phải", left: "Trái", both: "Hai chân" }[p.ft]}</b></div>
          <div><small>Giá trị</small><b>${valText(p, k)}</b></div>
          <div><small>Lương</small><b>${p.free ? "—" : FM.fmtWage(p.wage)}</b></div>
          <div><small>Hợp đồng đến</small><b>${p.ce ? FM.fmtDate(p.ce, false) : "Tự do"}</b></div>
          ${p.free || p.foreignClub ? "" : `<div><small>Vai trò ở CLB</small><b>${p.c === S.user && !p.loan ? MO.ROLE_LABEL[MO.role(S, p)] : T.ROLE_LABEL[T.role(S, p)]}${S.p[id].listed ? " · đang rao bán" : ""}</b></div>`}
          ${p.dg && kn(p) >= SC.EXACT ? `<div><small>Tiến bộ mùa này</small><b style="color:var(--accent)">+${p.dg} năng lực</b></div>` : ""}
          <div><small>Thể lực · tâm lý</small><b>${Math.round(p.fit)}% · ${moraleIcon(p.mor)}</b></div>
        </div>
        ${alt ? `<div class="small muted">Vị trí khác: ${esc(alt)}</div>` : ""}
        ${p.inj ? `<div class="pill red">Chấn thương: ${esc(p.injName)} · đến ${FM.fmtDate(p.inj, false)}</div>` : ""}
        ${p.sus ? `<div class="pill gold">Treo giò ${p.sus} trận</div>` : ""}
        <div class="attrs">${groups}</div>
        ${p.c !== S.user && k >= SC.EXACT && SC.ensure(S).reports[p.id] ? reportBox(p) : k >= SC.EXACT ? `<div class="small muted">Tính cách: ${esc(SC.traits(p).join(", "))}</div>` : ""}
        <div class="kv">
          <div><small>Mùa này</small><b>${st.ap} trận · ${st.g} bàn · ${st.as} kiến tạo</b></div>
          <div><small>Điểm TB · cầu thủ hay nhất</small><b>${avg} · ${st.mm} lần</b></div>
          ${p.ast ? `<div><small>Châu Á mùa này</small><b>${p.ast.ap} trận · ${p.ast.g} bàn · ${p.ast.as} kiến tạo</b></div>` : ""}
          ${p.cst ? `<div><small>Cúp mùa này</small><b>${p.cst.ap} trận · ${p.cst.g} bàn · ${p.cst.as} kiến tạo</b></div>` : ""}
        </div>
        ${p.foreignClub ? "" : careerBox(p)}
        ${playerActions(p)}
      </div>`);
  }
  // độ hiểu biết + nút cử tuyển trạch trong hồ sơ cầu thủ đội khác
  function scoutBox(p, k) {
    const job = SC.jobFor(S, "player", p.id) || SC.jobFor(S, "club", p.c);
    const msg = k >= 100 ? "Đã nắm rõ cầu thủ này." : k >= SC.EXACT ? "Biết khá chính xác." : k < SC.HIDDEN ? "Chưa có thông tin — chỉ số chưa hiện." : "Chỉ số là khoảng ước tính.";
    const btn = job
      ? `<span class="small muted">${job.kind === "club" ? "🏟️ Đang theo dõi cả đội" : "🔍 Đang theo dõi"} · xong ${FM.fmtDate(job.end, false)}</span>`
      : k < 100 && !p.foreignClub
        ? `<button class="btn sm" data-act="scout-player" data-id="${p.id}">🔍 Cử tuyển trạch (${SC.duration(S, "player", p.id)} ngày, ${FM.fmtMoney(SC.cost(S, "player"))})</button>`
        : "";
    return `<div class="scoutbox"><div class="small">Độ hiểu biết <b>${k}%</b> · <span class="muted">${msg}</span></div><div class="bar"><i style="width:${k}%;background:${k >= SC.EXACT ? "var(--accent)" : k >= 50 ? "var(--gold)" : "var(--orange)"}"></i></div>${btn ? `<div class="row wrap">${btn}</div>` : ""}</div>`;
  }
  function reportBox(p) {
    const r = SC.report(S, p);
    return `<div class="scoutbox"><div class="row"><span class="pill grade g${r.grade}">${r.grade}</span><b class="grow">Báo cáo tuyển trạch</b><span class="small muted">${FM.fmtDate(S.sc.reports[p.id].d, false)}</span></div><div class="small" style="white-space:pre-line">${esc(r.lines.join("\n"))}</div></div>`;
  }
  // sự nghiệp: các mùa thật (vpf.vn) + các mùa trong game + mùa đang đá
  function careerBox(p) {
    const HI = FM.History;
    const rows = HI.career(S, p);
    const curClubs = (p.sc && p.sc.length ? p.sc : [p.c]).map((id) => club(id).name);
    if (curClubs[curClubs.length - 1] !== club(p.c).name) curClubs.push(club(p.c).name);
    const lgNow = S.clubs[p.c]?.league;
    rows.push({ s: `${W.label(S)}*`, clubs: curClubs, loan: !!p.loan, lg: FM.leagueShort(lgNow) || 0, ap: p.st.ap, g: p.st.g, as: p.st.as, r: p.st.ap ? Math.round((p.st.rs / p.st.ap) * 10) / 10 : null, cap: (p.cst ? p.cst.ap : 0) + (p.ast ? p.ast.ap : 0), cg: (p.cst ? p.cst.g : 0) + (p.ast ? p.ast.g : 0) });
    const aw = (p.aw || []).slice().reverse();
    return `<div><h4 class="small muted" style="margin:4px 0;letter-spacing:.06em">SỰ NGHIỆP</h4><div class="scroll-x"><table class="career"><thead><tr><th class="l">Mùa</th><th class="l">CLB</th><th>Giải</th><th>Trận</th><th>Bàn</th><th>KT</th><th>Điểm</th><th>Cúp</th></tr></thead><tbody>${rows
      .slice()
      .reverse()
      .map(
        (r) => `<tr><td class="l nowrap">${esc(r.s)}</td><td class="l">${r.clubs.map(esc).join(" → ")}${r.loan ? ' <span class="flag loan">MƯỢN</span>' : ""}</td><td>${r.lg ? (typeof r.lg === "number" ? `V${r.lg}` : esc(r.lg)) : "–"}</td><td>${r.ap ?? "–"}</td><td>${r.g ?? "–"}</td><td>${r.real ? "–" : r.as}</td><td>${r.r ?? "–"}</td><td>${r.real ? "–" : r.cap ? `${r.cap}/${r.cg}` : "–"}</td></tr>`,
      )
      .join("")}</tbody></table></div>
      <div class="small muted">* mùa đang đá. Các mùa trước khi vào game lấy từ số liệu thật vpf.vn (không có kiến tạo / điểm). Cúp: trận/bàn.</div>
      ${aw.length ? `<div style="display:grid;gap:2px;margin-top:6px">${aw.map(([ss, t]) => `<div class="small">🏅 <b>${esc(t)}</b> <span class="muted">${esc(ss)}</span></div>`).join("")}</div>` : ""}</div>`;
  }
  // khối giải thưởng một mùa (màn tổng kết và tab CLB)
  function awardsBox(aw, lg, compact) {
    const a = aw && aw[lg];
    if (!a) return "";
    const HI = FM.History;
    const pl = (id) => {
      const p = id && W.player(S, id);
      if (!p) return "—";
      return `<b class="link" data-act="info" data-id="${p.id}">${esc(p.sn)}</b> <span class="small muted">${esc(club(p.c).name)}</span>`;
    };
    const top = a.top && W.player(S, a.top);
    const team = a.team.map((id) => W.player(S, id)).filter(Boolean);
    return `<div class="kv">
      <div><small>${HI.AWARD_LABEL.mvp}</small><span>${pl(a.mvp)}</span></div>
      <div><small>${HI.AWARD_LABEL.top}</small><span>${pl(a.top)}${top && !compact ? ` <span class="small">${top.st.g} bàn</span>` : ""}</span></div>
      <div><small>${HI.AWARD_LABEL.young}</small><span>${pl(a.young)}</span></div>
      <div><small>${HI.AWARD_LABEL.gk}</small><span>${pl(a.gk)}</span></div>
      <div><small>HLV xuất sắc nhất</small><span><b>${esc(a.coachName)}</b> <span class="small muted">${esc(club(a.coach).name)}</span></span></div>
    </div>${compact || !team.length ? "" : `<div class="small"><span class="muted">Đội hình tiêu biểu (4-3-3):</span> ${team.map((p) => `<span class="link" data-act="info" data-id="${p.id}">${posTag(p.pos)} ${esc(p.sn)}</span>`).join(" · ")}</div>`}`;
  }
  // nút chuyển nhượng / hợp đồng trong hồ sơ cầu thủ
  function playerActions(p) {
    if (p.foreignClub) return `<div class="small muted center">${String(p.id).startsWith("ucl-") ? "Cầu thủ CLB châu Âu ngoài hệ thống giải trong game" : "Cầu thủ CLB nước ngoài (đội hình do game sinh ra)"} — không chuyển nhượng được.</div>`;
    const win = T.window(S);
    const end = FM.fmtDate(`${S.season + 1}-06-30`, false);
    if (p.loan && p.loan.from === S.user)
      return `<div class="pill blue" style="white-space:normal">Đang cho mượn tại ${esc(club(p.c).name)} đến ${end} · họ trả ${Math.round(p.loan.share * 100)}% lương</div><button class="btn sm primary" data-act="renew" data-id="${p.id}">📝 Gia hạn hợp đồng</button>`;
    if (p.loan && p.c === S.user)
      return `<div class="pill blue" style="white-space:normal">Đang mượn từ ${esc(club(p.loan.from).name)} đến ${end} · bạn trả ${Math.round(p.loan.share * 100)}% lương</div>${p.loan.buy ? `<button class="btn primary block" data-act="loan-exercise" data-id="${p.id}">Kích hoạt mua đứt (${FM.fmtMoney(p.loan.buy)})</button>` : ""}`;
    if (p.c === S.user) {
      const listed = S.p[p.id].listed;
      const loanListed = S.p[p.id].loanListed;
      return `<div class="row wrap"><button class="btn sm primary" data-act="renew" data-id="${p.id}">📝 Gia hạn hợp đồng</button><button class="btn sm" data-act="${listed ? "unlist" : "list"}" data-id="${p.id}">${listed ? "Bỏ rao bán" : "🏷️ Rao bán"}</button><button class="btn sm" data-act="loan-list" data-id="${p.id}">${loanListed ? "Bỏ cho mượn" : "🔁 Cho mượn"}</button><button class="btn sm danger" data-act="release" data-id="${p.id}">Thanh lý</button></div>${loanListed ? `<div class="small muted">Đang tìm CLB mượn — đề nghị đến trong kỳ chuyển nhượng, từ những đội có chỗ cho cầu thủ này đá chính hoặc dự bị.</div>` : ""}`;
    }
    if (p.free) return `<button class="btn primary block" data-act="sign-free" data-id="${p.id}">✍️ Ký hợp đồng (cầu thủ tự do)</button>`;
    if (p.loan) return `<div class="small muted center">Đang được ${esc(club(p.loan.from).name)} cho mượn đến ${end} — chưa thể hỏi mua.</div>`;
    return win.open
      ? `<div class="row wrap"><button class="btn primary grow" data-act="bid" data-id="${p.id}">💸 Hỏi mua (giá trị ${valText(p)})</button><button class="btn grow" data-act="loan" data-id="${p.id}">🤝 Hỏi mượn</button></div>`
      : `<div class="small muted center">Kỳ chuyển nhượng đang đóng${win.next ? ` — mở lại ${FM.fmtDate(win.next, false)}` : ""}.</div>`;
  }
  function afcClubModal(id) {
    const c = AF.club(id);
    const squad = W.squad(S, id)
      .map((p) => [p, kn(p)])
      .sort((a, b) => SC.estCa(S, b[0], b[1]) - SC.estCa(S, a[0], a[1]));
    const job = SC.jobFor(S, "club", id);
    const st = cstate(id);
    openModal(`<div class="sheet-h">${crest(id)}<div class="grow"><div class="t" style="font-size:22px">${esc(c.name)}</div><div class="small muted">${c.ucl ? `${esc(c.country)} · ${esc(c.venue || "")} · HLV ${esc(c.coach || "—")}` : c.lgName ? `${esc((FM.COUNTRIES[c.country] || {}).name || c.country)} · ${esc(c.lgName)} · ${FM.fmtNum ? FM.fmtNum(c.capacity) : c.capacity} chỗ` : `${esc(c.country)} · khu vực ${c.region === "East" ? "Đông" : "Tây"} · ${esc(c.venue || "")}`}</div></div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b"><div class="row small">${formIcons(st.form.slice(-5))}<span class="grow"></span>Trình độ ${stars(AF.strengthOf(id))} · ${st.formation}</div>
      <div class="small muted">${c.ucl ? "Đội hình thật mùa 2026/27, không thuộc giải nào trong game" : c.lgName ? "Đội bán chuyên nghiệp — đội hình do game sinh ra" : "Đội hình do game sinh ra theo trình độ thật của CLB"}; chỉ số là ước tính cho tới khi tuyển trạch.</div>
      <div class="row wrap">${job ? `<span class="small muted">🏟️ Đang theo dõi cả đội · xong ${FM.fmtDate(job.end, false)}</span>` : `<button class="btn sm" data-act="scout-club" data-id="${id}">🏟️ Tuyển trạch cả đội (${SC.duration(S, "club", id)} ngày, ${FM.fmtMoney(SC.cost(S, "club"))})</button>`}</div>
      <table class="plist"><tbody>${squad.map(([p, k]) => `<tr class="click" data-act="info" data-id="${p.id}"><td>${posTag(p.pos)}</td><td class="l"><b>${esc(p.sn)}</b> <span class="small muted">${esc(p.nat)}</span><div class="small muted">${p.age} tuổi</div></td><td class="nowrap">${ovr(p, k)} ${caStars(p, k)}</td></tr>`).join("")}</tbody></table></div>`);
  }
  function clubModal(id) {
    if (AF.isForeign(id)) return afcClubModal(id);
    const c = W.club(S, id);
    const squad = W.squad(S, id)
      .map((p) => [p, kn(p)])
      .sort((a, b) => SC.estCa(S, b[0], b[1]) - SC.estCa(S, a[0], a[1]));
    const pos = W.position(S, id);
    const job = id !== S.user && SC.jobFor(S, "club", id);
    const scoutBtn = id === S.user ? "" : job ? `<span class="small muted">🏟️ Đang theo dõi cả đội · xong ${FM.fmtDate(job.end, false)}</span>` : `<button class="btn sm" data-act="scout-club" data-id="${id}">🏟️ Tuyển trạch cả đội (${SC.duration(S, "club", id)} ngày, ${FM.fmtMoney(SC.cost(S, "club"))})</button>`;
    openModal(`<div class="sheet-h">${crest(id)}<div class="grow"><div class="t" style="font-size:22px">${esc(c.name)}</div><div class="small muted">${W.leagueName(c.league)} · hạng ${pos} · ${c.formation} · ${esc(c.venue || "")}</div></div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b"><div class="row small">${formIcons(c.form.slice(-5))}<span class="grow"></span>Sức mạnh ${W.strength(S, id).toFixed(1)}</div>
      ${scoutBtn ? `<div class="row wrap">${scoutBtn}</div>` : ""}
      <table class="plist"><tbody>${squad.map(([p, k]) => `<tr class="click" data-act="info" data-id="${p.id}"><td>${posTag(p.pos)}</td><td class="l"><b>${esc(p.sn)}</b>${flags(p)} ${status(p)}${gradePill(p.id)}<div class="small muted">${p.age} tuổi</div></td><td class="nowrap">${ovr(p, k)} ${caStars(p, k)}</td></tr>`).join("")}</tbody></table></div>`);
  }
  function fixtureModal(fid) {
    const f = S.fx.find((x) => x.id === fid);
    const line = (side) =>
      (f.sc || [])
        .filter((x) => x.side === side)
        .map((x) => `${esc(W.player(S, x.id)?.sn || "?")} ${x.min}'`)
        .join(", ") || "—";
    const motm = f.motm && W.player(S, f.motm);
    openModal(`<div class="sheet-h"><div class="grow t" style="font-size:20px">${esc(W.fxLabel(S, f))} · ${FM.fmtDate(f.d)}</div><button class="x" data-act="close">✕</button></div>
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
    openModal(`<div class="sheet-h"><div class="grow"><div class="t" style="font-size:22px">Ngày thi đấu</div><div class="small muted">${f.po ? `${esc(W.fxLabel(S, f))}${f.neutral || !f.poLg ? " · sân trung lập" : ""}${f.leg === 2 ? " · tính tổng hai lượt" : " · hoà đá luân lưu"}` : FM.LEAGUE[f.lg] ? `${W.leagueName(f.lg)} · Vòng ${f.rd}` : AF.isAfc(f) ? `${esc(AF.COMPS[f.lg].name)} · ${esc(W.fxLabel(S, f))}${f.neutral ? " · sân trung lập" : ""}${f.ko ? " · hoà đá luân lưu" : f.leg === 2 ? " · lượt về, tính tổng tỉ số" : ""}` : `${esc(W.fxLabel(S, f))}${f.neutral ? " · sân trung lập" : ""}${f.ko ? " · loại trực tiếp, hoà đá luân lưu" : f.leg === 2 ? " · lượt về, tính tổng tỉ số" : f.leg === 1 ? " · lượt đi" : ""}`}</div></div><button class="x" data-act="close">✕</button></div>
      <div class="sheet-b">
        <div class="next" style="padding:4px 0"><div class="team">${crest(f.h, "lg")}${esc(club(f.h).name)}</div><div class="vs">VS</div><div class="team">${crest(f.a, "lg")}${esc(club(f.a).name)}</div></div>
        <div class="kv"><div><small>Sơ đồ của bạn</small><b>${c.formation}</b></div><div><small>Lối chơi</small><b>${FM.TACTIC_OPTIONS.mentality[c.tactics.mentality]}</b></div><div><small>Đối thủ</small><b>${cstate(opp).formation} · ${formIcons(cstate(opp).form.slice(-5))}</b></div></div>
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
    const m = FM.createMatch(W.sideFor(S, f.h, f.h !== S.user), W.sideFor(S, f.a, f.a !== S.user), { seed: W.matchSeed(S, f) + (live ? 99 : 0), live, neutral: !!(f.po || f.neutral) });
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
      ${seasonEndCountry(s, userCountry())}
      <div class="card"><div class="card-b kv">
        ${userCountry() === "vn" && S.cup ? `<div><small>Vô địch Cúp Quốc gia</small><b>${S.cup.winner ? name(S.cup.winner) : "—"}</b></div><div><small>Siêu Cúp Quốc gia</small><b>${S.cup.superWinner ? name(S.cup.superWinner) : "—"}</b></div><div><small>Đội bạn ở Cúp</small><b>${esc(FM.Cups.userStatus(S))}</b></div>` : ""}
        ${userCountry() === "en" && S.enc ? `<div><small>Vô địch FA Cup</small><b>${S.enc.fac.winner ? name(S.enc.fac.winner) : "—"}</b></div><div><small>Đội bạn ở FA Cup</small><b>${esc(FM.EnCups.userStatus(S, "fac") || "—")}</b></div><div><small>Vô địch League Cup</small><b>${S.enc.efl.winner ? name(S.enc.efl.winner) : "—"}</b></div><div><small>Đội bạn ở League Cup</small><b>${esc(FM.EnCups.userStatus(S, "efl") || "—")}</b></div><div><small>Community Shield</small><b>${S.enc.cs && S.enc.cs.winner ? name(S.enc.cs.winner) : "—"}</b></div>` : ""}
        ${userCountry() === "es" && S.esc ? `<div><small>Vô địch Copa del Rey</small><b>${S.esc.copa.winner ? name(S.esc.copa.winner) : "—"}</b></div><div><small>Đội bạn ở Copa del Rey</small><b>${esc(FM.EsCups.userStatus(S, "copa") || "—")}</b></div><div><small>Supercopa</small><b>${S.esc.sup.winner ? name(S.esc.sup.winner) : "—"}</b></div>` : ""}
        ${userCountry() !== "vn" && S.ucl ? `<div><small>Vô địch Champions League</small><b>${S.ucl.winner ? name(S.ucl.winner) : "—"}</b></div>${S.ucl.local.filter((id) => W.countryOfClub(S, id) === userCountry()).map((id) => `<div><small>${name(id)} ở Champions League</small><b>${esc(FM.UCL.result(S, id))}</b></div>`).join("")}` : ""}
        ${userCountry() === "vn" && S.afc ? Object.entries(AF.COMPS).map(([k, c]) => `<div><small>Vô địch ${c.short} (${esc(c.name)})</small><b>${S.afc.comps[k].winner ? name(S.afc.comps[k].winner) : "—"}</b></div>${(S.afc.vn[k] || []).map((id) => `<div><small>${name(id)} ở ${c.short}</small><b>${esc(AF.result(S, k, id))}</b></div>`).join("")}`).join("") : ""}
      </div></div>
      ${Object.keys(FM.COUNTRIES)
        .filter((k) => k !== userCountry())
        .map((k) => `<div class="card"><h3>${esc(FM.COUNTRIES[k].name)}</h3><div class="card-b kv">${leagueTabs(k).map((L) => (s.champions[L.id] ? `<div><small>Vô địch ${esc(L.name)}</small><b>${name(s.champions[L.id])}</b></div>` : "")).join("")}</div></div>`)
        .join("")}
      ${s.awards ? leagueTabs(userCountry()).map((L) => L.id).filter((lg) => s.awards[lg]).map((lg) => `<div class="card"><h3>Giải thưởng ${W.leagueName(lg)}</h3><div class="card-b" style="display:grid;gap:8px">${awardsBox(s.awards, lg)}</div></div>`).join("") : ""}
      <button class="btn primary block" data-act="next-season">Sang mùa giải mới ▶</button>
      <button class="btn block" data-act="see-table">Xem lại bảng xếp hạng</button>
    </div>`;
  }
  // tổng kết các giải của một quốc gia: vô địch, vua phá lưới, play-off, lên / xuống hạng
  function seasonEndCountry(s, country) {
    const name = (id) => esc(club(id).name);
    const ts = (lg) => {
      const p = s.topScorer[lg] && W.player(S, s.topScorer[lg]);
      return p ? `${esc(p.sn)} (${name(p.c)}) — ${p.st.g} bàn` : "—";
    };
    const tierNow = (id) => FM.LEAGUE[S.clubs[id]?.league]?.tier;
    return leagueTabs(country)
      .filter((L) => s.champions[L.id])
      .map((L) => {
        const ups = s.moves.filter((m) => m.to === L.id && FM.LEAGUE[m.to].tier < tierNow(m.id)).map((m) => m.id);
        const downs = s.moves.filter((m) => m.to === L.id && FM.LEAGUE[m.to].tier > tierNow(m.id)).map((m) => m.id);
        const po = L.country === "vn" ? (L.tier === 1 && s.playoff ? s.playoff : null) : (s.playoffs || []).find((x) => FM.leagueAbove(x.league)?.id === L.id);
        const outs = (s.out || []).filter((id) => S.clubs[id]?.league === L.id);
        return `<div class="card"><h3>${esc(L.name)}</h3><div class="card-b kv">
          <div><small>Vô địch</small><b>${name(s.champions[L.id])}</b></div>
          <div><small>Vua phá lưới</small><b>${ts(L.id)}</b></div>
          ${po ? `<div><small>Chung kết play-off${po.twoLegs ? " (tổng hai lượt)" : ""}</small><b>${name(po.home)} ${po.hg}–${po.ag}${po.pens ? ` (pen ${po.pens.join("–")})` : ""} ${name(po.away)}</b></div>` : ""}
          ${ups.length ? `<div><small>Lên ${esc(L.name)} mùa sau</small><b>${ups.map(name).join(", ")}</b></div>` : ""}
          ${downs.length ? `<div><small>Xuống ${esc(L.name)} mùa sau</small><b>${downs.map(name).join(", ")}</b></div>` : ""}
          ${outs.length ? `<div><small>Rời giải</small><b>${outs.map(name).join(", ")}</b></div>` : ""}
        </div></div>`;
      })
      .join("");
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
      if (W.migrate(S).length) persist(true);
      ui.view = "main";
      ui.tab = "home";
      render();
    },
    "pick-country": (d) => {
      ui.pickCountry = d.c;
      ui.pickLeague = FM.leaguesOf(d.c)[0].id;
      ui.pickClub = null;
      render();
    },
    "table-country": (d) => {
      ui.tableCountry = d.c;
      ui.tableTab = null;
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
      ui.tableTab = null;
      ui.tableCountry = null;
      ui.fxTab = "mine";
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
      TRN.formationChanged(S);
      autoLineup();
      ui.sel = null;
      render();
      toast(`Đã chuyển sang ${d.f} và tự xếp lại đội hình.`);
    },
    sq: (d) => {
      ui.sq[d.k] = d.v;
      render();
    },
    "sq-reset": () => {
      ui.sq = { g: "", pos: "", st: "", sort: "pos" };
      render();
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
    info: (d) => {
      ui.talkMsg = null;
      playerModal(d.id);
    },
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
        if ((st.v || 1) < SAVE_VERSION) throw new Error("Mã save này thuộc bản cũ chỉ có V.League — không dùng được với thế giới mới (thang chỉ số đã đổi).");
        W.migrate(st);
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
    "afc-tab": (d) => {
      ui.afcTab = d.t;
      render();
    },
    "enc-tab": (d) => {
      ui.encTab = d.t;
      render();
    },
    "esc-tab": (d) => {
      ui.escTab = d.t;
      render();
    },
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
      el.value = Math.max(0, Math.round(+el.value + +d.step));
    },
    years: (d, el) => {
      ui.years = +d.y;
      el.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === el));
    },
    bid: (d) => bidModal(d.id),
    "scout-player": (d) => {
      const r = SC.start(S, "player", d.id);
      if (r.error) return toast(r.error);
      persist();
      toast(`Đã cử tuyển trạch viên — báo cáo sau ${r.days} ngày.`);
      playerModal(d.id);
    },
    "scout-club": (d) => {
      const r = SC.start(S, "club", d.id);
      if (r.error) return toast(r.error);
      persist();
      toast(`Đã cử tuyển trạch viên theo dõi cả đội — báo cáo sau ${r.days} ngày.`);
      clubModal(d.id);
    },
    train: (d) => {
      TRN.set(S, d.k, +d.v);
      persist();
      render();
    },
    "scout-cancel": (d) => {
      SC.cancel(S, +d.id);
      persist();
      render();
    },
    "bid-send": (d) => {
      const fee = fromK($("#feeIn").value);
      const r = T.bid(S, d.id, fee);
      if (r.result === "accepted") {
        persist();
        ui.promise = false;
        contractModal(d.id, "sign");
        toast("CLB chủ quản đồng ý! Giờ đàm phán hợp đồng với cầu thủ.");
      } else if (r.result === "countered") {
        $("#feeIn").value = toK(r.counter);
        negMsg(`${r.reason} Bấm Gửi đề nghị lần nữa để đồng ý mức này.`);
      } else negMsg(r.reason);
    },
    contract: (d) => {
      ui.promise = false;
      contractModal(d.id, d.kind);
    },
    renew: (d) => {
      ui.promise = false;
      contractModal(d.id, "renew");
    },
    "sign-free": (d) => {
      ui.promise = false;
      contractModal(d.id, "sign");
    },
    "promise-toggle": (d, el) => {
      ui.promise = !ui.promise;
      el.classList.toggle("primary", ui.promise);
      el.textContent = `${ui.promise ? "☑" : "☐"} Hứa suất đá chính (cầu thủ bớt 10% lương đòi hỏi)`;
    },
    talk: (d) => {
      const r = MO.talk(S, d.id, d.k);
      ui.talkMsg = { id: d.id, text: r.text, delta: Math.round(r.delta) };
      persist();
      playerModal(d.id);
      render();
    },
    meeting: (d) => {
      const r = MO.meeting(S, d.k);
      persist();
      render();
      toast(r.up != null ? `${r.text} (${r.up} người vui hơn${r.down ? `, ${r.down} người không vui` : ""})` : r.text);
    },
    "contract-send": (d) => {
      const wage = fromWeek($("#wageIn").value);
      const r = T.offerContract(S, d.id, wage, ui.years, d.kind, ui.promise);
      if (r.result === "accepted") {
        persist(true);
        closeModal();
        toast(d.kind === "renew" ? "Đã gia hạn hợp đồng." : "Ký hợp đồng thành công!");
        render();
      } else if (r.result === "countered") {
        $("#wageIn").value = toWeek(r.counterWage);
        negMsg(r.reason);
      } else {
        negMsg(r.reason);
        persist();
        render();
      }
    },
    list: (d) => listModal(d.id),
    "list-send": (d) => {
      T.setListed(S, d.id, true, fromK($("#feeIn").value));
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
    loan: (d) => {
      ui.loanShare = 0.5;
      ui.loanBuy = false;
      loanModal(d.id);
    },
    "loan-share": (d) => {
      ui.loanShare = +d.v;
      loanModal(d.id);
    },
    "loan-buy-toggle": (d) => {
      ui.loanBuy = !ui.loanBuy;
      loanModal(d.id);
    },
    "loan-send": (d) => {
      const r = FM.Loans.request(S, d.id, ui.loanShare, ui.loanBuy);
      if (r.result === "accepted") {
        persist(true);
        closeModal();
        toast("Đã mượn thành công!");
        render();
      } else if (r.result === "countered") {
        ui.loanShare = r.share;
        loanModal(d.id);
        negMsg(`${r.reason} Bấm gửi lần nữa để đồng ý.`);
      } else negMsg(r.reason);
    },
    "loan-list": (d) => {
      FM.Loans.setListed(S, d.id, !S.p[d.id].loanListed);
      persist();
      toast(S.p[d.id].loanListed ? "Đã đánh dấu cho mượn — chờ đề nghị trong kỳ chuyển nhượng." : "Đã bỏ cho mượn.");
      playerModal(d.id);
      render();
    },
    "loan-accept": (d) => {
      const r = FM.Loans.respond(S, +d.id, true);
      persist(true);
      toast(r.result === "accepted" ? "Đã cho mượn." : r.reason || "Đề nghị không còn hiệu lực.");
      render();
    },
    "loan-exercise": (d) => {
      const r = FM.Loans.exercise(S, d.id);
      if (r.error) return toast(r.error);
      persist(true);
      closeModal();
      toast(`Đã mua đứt với giá ${FM.fmtMoney(r.fee)}.`);
      render();
    },
    "offer-reject": (d) => {
      T.respond(S, +d.id, "reject");
      persist();
      render();
    },
    "offer-counter": (d) => counterModal(+d.id),
    "counter-send": (d) => {
      const r = T.respond(S, +d.id, "counter", fromK($("#feeIn").value));
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
    if (el && el.dataset.change === "sq") {
      ui.sq[el.dataset.k] = el.value;
      render();
      return;
    }
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
