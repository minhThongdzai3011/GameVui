// Engine trận đấu dạng chữ + máy tự chọn đội hình.
// Mỗi phút: sức mạnh tấn công / tuyến giữa / phòng ngự của hai đội (từ điểm vai trò của 11
// người trên sân × độ quen vị trí × thể lực trong trận × chiến thuật) quyết định đội nào có
// cơ hội, cơ hội tốt cỡ nào (xG), ai sút, ai kiến tạo, thủ môn có cản được không. Thêm phạm
// lỗi, thẻ, chấn thương, thay người, bình luận và chấm điểm cầu thủ.
(function () {
  "use strict";
  const FM = window.FM;
  const A = FM.A;

  // mỗi vai trò đóng góp vào tấn công / tuyến giữa / phòng ngự bao nhiêu
  const UNIT_W = {
    GK: { att: 0, mid: 0, def: 0 },
    CB: { att: 0, mid: 0, def: 1 },
    LB: { att: 0.15, mid: 0.2, def: 0.65 },
    RB: { att: 0.15, mid: 0.2, def: 0.65 },
    DM: { att: 0, mid: 0.55, def: 0.45 },
    CM: { att: 0.15, mid: 0.7, def: 0.15 },
    AM: { att: 0.6, mid: 0.4, def: 0 },
    LM: { att: 0.45, mid: 0.45, def: 0.1 },
    RM: { att: 0.45, mid: 0.45, def: 0.1 },
    LW: { att: 0.8, mid: 0.2, def: 0 },
    RW: { att: 0.8, mid: 0.2, def: 0 },
    ST: { att: 1, mid: 0, def: 0 },
  };
  // tổng trọng số của một sơ đồ 4-4-2 chuẩn → đội dồn nhiều người lên trên thì tấn công mạnh hơn
  const UNIT_BASE = { att: 3.5, mid: 2.7, def: 3.8 };
  // ai hay dứt điểm / kiến tạo / phạm lỗi theo vai trò
  const SHOOT_W = { GK: 0, CB: 0.5, LB: 0.5, RB: 0.5, DM: 0.6, CM: 1.4, AM: 3, LM: 1.8, RM: 1.8, LW: 3, RW: 3, ST: 5 };
  const ASSIST_W = { GK: 0.05, CB: 0.3, LB: 1.2, RB: 1.2, DM: 0.8, CM: 1.8, AM: 2.6, LM: 2.2, RM: 2.2, LW: 2, RW: 2, ST: 1.2 };
  const FOUL_W = { GK: 0.1, CB: 1.6, LB: 1.2, RB: 1.2, DM: 1.8, CM: 1.2, AM: 0.7, LM: 0.9, RM: 0.9, LW: 0.6, RW: 0.6, ST: 0.8 };

  // hệ số chiến thuật (chỉ số theo FM.TACTIC_OPTIONS)
  const MENT = [
    { att: 0.84, def: 1.13, rate: 0.82, opp: 0.88 },
    { att: 0.93, def: 1.06, rate: 0.92, opp: 0.94 },
    { att: 1, def: 1, rate: 1, opp: 1 },
    { att: 1.08, def: 0.94, rate: 1.1, opp: 1.06 },
    { att: 1.16, def: 0.86, rate: 1.2, opp: 1.14 },
  ];
  const PRESS = [
    { poss: 0.94, opp: 1.0, def: 1.04, tire: 0.85, foul: 0.85 },
    { poss: 1, opp: 1, def: 1, tire: 1, foul: 1 },
    { poss: 1.06, opp: 0.93, def: 0.98, tire: 1.25, foul: 1.25 },
  ];
  const TEMPO = [
    { poss: 1.05, rate: 0.9, xg: 1.06, tire: 0.9 },
    { poss: 1, rate: 1, xg: 1, tire: 1 },
    { poss: 0.96, rate: 1.1, xg: 0.94, tire: 1.12 },
  ];
  const PASS = [
    { poss: 1.06, header: 0.6 },
    { poss: 1, header: 1 },
    { poss: 0.93, header: 1.7 },
  ];

  // ---------- Hiệu quả của một cầu thủ ở một vai trò ----------
  function effective(p, role, fit, morale) {
    const base = FM.roleScore(p.a, role) * FM.familiarity(p, role);
    return base * (0.72 + 0.28 * FM.clamp(fit, 0, 100) / 100) * (0.96 + 0.08 * FM.clamp(morale ?? 50, 0, 100) / 100);
  }
  FM.effective = effective;

  // ---------- Máy chọn đội hình ----------
  // ghép (ô, cầu thủ) có điểm cao nhất trước; tối đa 4 ngoại binh; dự bị: 1 thủ môn + người tốt nhất còn lại
  FM.autoPick = function (squad, formation) {
    const slots = FM.FORMATIONS[formation];
    const avail = squad.filter((p) => p.available);
    const pairs = [];
    slots.forEach(([role], si) => {
      for (const p of avail) pairs.push({ si, p, s: effective(p, role, p.fit, p.mor) * (p.fit < 75 ? 0.9 : 1) });
    });
    pairs.sort((a, b) => b.s - a.s);
    const lineup = new Array(slots.length).fill(null);
    const used = new Set();
    let foreign = 0;
    for (const { si, p } of pairs) {
      if (lineup[si] || used.has(p.id)) continue;
      if (p.fs && foreign >= FM.MAX_FOREIGN_ON_PITCH) continue;
      lineup[si] = p.id;
      used.add(p.id);
      if (p.fs) foreign++;
    }
    const rest = avail.filter((p) => !used.has(p.id)).sort((a, b) => b.ca - a.ca);
    const bench = [];
    const gk = rest.find((p) => p.pos === "GK");
    if (gk) bench.push(gk.id);
    for (const p of rest) if (bench.length < FM.BENCH_SIZE && !bench.includes(p.id)) bench.push(p.id);
    const score = lineup.reduce((s, id, i) => s + (id ? effective(squad.find((p) => p.id === id), slots[i][0], 100, 50) : 0), 0);
    return { lineup, bench, score };
  };
  FM.bestFormation = function (squad) {
    let best = null;
    for (const f in FM.FORMATIONS) {
      const pick = FM.autoPick(squad, f);
      if (!best || pick.score > best.score) best = { formation: f, ...pick };
    }
    return best;
  };

  // ---------- Bình luận ----------
  const T = {
    kickoff: ["Trọng tài nổi còi, trận đấu bắt đầu!", "Bóng lăn! {home} và {away} bước vào cuộc so tài."],
    goal: [
      "VÀOOO! {p} dứt điểm hiểm hóc, {team} có bàn thắng!",
      "{p} không bỏ lỡ cơ hội, lưới đã rung! ⚽",
      "Bàn thắng! {p} đặt lòng chân chuẩn xác, thủ môn chịu thua.",
      "{p} tung cú sút căng như kẻ chỉ, bóng găm thẳng vào góc lưới!",
      "Lưới rung lên! {p} ghi bàn cho {team}!",
    ],
    goalHeader: ["{p} bật cao đánh đầu, VÀOOO! ⚽", "Đánh đầu cắm xuống của {p}, bóng nảy vào lưới!"],
    assist: ["Đường chuyền thành bàn của {a}.", "{a} kiến tạo tinh tế.", "Pha phối hợp đẹp mắt, {a} là người dọn cỗ."],
    save: ["{p} dứt điểm, {gk} bay người cản phá xuất sắc!", "Cú sút của {p} bị {gk} bắt gọn.", "{gk} phản xạ nhanh, từ chối bàn thắng của {p}!"],
    miss: ["{p} dứt điểm vọt xà.", "Cú sút của {p} đi chệch cột dọc trong gang tấc.", "{p} băng xuống nhưng dứt điểm không tới.", "Cơ hội cho {team}! {p} sút nhưng không trúng đích."],
    post: ["{p} sút trúng cột dọc! {team} không may mắn."],
    blocked: ["Cú sút của {p} bị hậu vệ chặn lại.", "{p} vừa ngả người dứt điểm thì bị chắn mất."],
    bigChance: ["Cơ hội mười mươi! "],
    yellow: ["Thẻ vàng cho {p} sau pha vào bóng thô bạo.", "{p} nhận thẻ vàng vì phạm lỗi chiến thuật.", "Trọng tài rút thẻ vàng cảnh cáo {p}."],
    red2: ["Thẻ vàng thứ hai! {p} bị truất quyền thi đấu, {team} chỉ còn {n} người."],
    red: ["THẺ ĐỎ trực tiếp! {p} phải rời sân sau pha phạm lỗi nguy hiểm."],
    injury: ["{p} nằm sân ôm chân, có vẻ không thể tiếp tục.", "Không ổn rồi, {p} dính chấn thương."],
    sub: ["{team} thay người: {in} vào sân thay {out}."],
    half: ["Hết hiệp một. Tỉ số {hs}–{as}."],
    second: ["Hiệp hai bắt đầu."],
    full: ["Trận đấu kết thúc! Tỉ số chung cuộc {hs}–{as}."],
    pressure: ["{team} đang dồn ép đối phương.", "{team} kiểm soát bóng tốt ở giữa sân.", "Thế trận khá cân bằng ở khu trung tuyến."],
  };
  const fill = (tpl, o) => tpl.replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ""));

  // ---------- Trận đấu ----------
  // side: { clubId, name, code, formation, tactics, lineup: [id × 11], bench: [id], players: {id → cầu thủ} }
  FM.createMatch = function (homeIn, awayIn, opts = {}) {
    const rnd = FM.rng(opts.seed ?? (Date.now() & 0x7fffffff));
    const stoppage1 = rnd.int(1, 3);
    const stoppage2 = rnd.int(2, 6);
    const sides = [homeIn, awayIn].map((s, idx) => {
      const live = {};
      const roster = [...s.lineup, ...s.bench];
      for (const id of roster) {
        const p = s.players[id];
        live[id] = { id, p, fit: p.fit ?? 100, mor: p.mor ?? 50, onPitch: false, played: 0, from: null, to: null, g: 0, as: 0, sh: 0, on: 0, kp: 0, sv: 0, yc: 0, rc: 0, inj: false, rating: 0 };
      }
      const slots = FM.FORMATIONS[s.formation].map(([role], i) => ({ role, id: s.lineup[i] }));
      for (const sl of slots) if (sl.id) {
        live[sl.id].onPitch = true;
        live[sl.id].from = 0;
      }
      return {
        idx,
        clubId: s.clubId,
        name: s.name,
        code: s.code,
        formation: s.formation,
        tactics: { ...FM.DEFAULT_TACTICS, ...s.tactics },
        slots,
        bench: [...s.bench],
        live,
        subs: 0,
        ai: !!s.ai,
        goals: 0,
        st: { shots: 0, on: 0, xg: 0, poss: 0, fouls: 0, yc: 0, rc: 0, corners: 0 },
        units: null,
      };
    });
    const m = { minute: 0, sides, events: [], over: false, rnd, half: 1, stoppage1, stoppage2, homeAdv: opts.neutral ? 1 : 1.16, live: !!opts.live };
    const name = (side, id) => side.live[id].p.sn;
    const push = (type, side, text, extra = {}) => {
      const e = { min: m.minute, label: minuteLabel(), type, side: side ? side.idx : null, text, ...extra };
      m.events.push(e);
      return e;
    };
    function minuteLabel() {
      if (m.half === 1 && m.minute > 45) return `45+${m.minute - 45}`;
      if (m.half === 2 && m.minute > 90) return `90+${m.minute - 90}`;
      return String(m.minute);
    }
    const onPitch = (side) => side.slots.filter((s) => s.id && side.live[s.id].onPitch);

    function computeUnits(side) {
      const u = { att: 0, mid: 0, def: 0, gk: 6 };
      for (const sl of onPitch(side)) {
        const L = side.live[sl.id];
        const e = effective(L.p, sl.role, L.fit, L.mor);
        if (sl.role === "GK") {
          u.gk = e;
          continue;
        }
        const w = UNIT_W[sl.role];
        u.att += e * w.att;
        u.mid += e * w.mid;
        u.def += e * w.def;
      }
      const t = side.tactics;
      u.att = (u.att / UNIT_BASE.att) * MENT[t.mentality].att;
      u.def = (u.def / UNIT_BASE.def) * MENT[t.mentality].def * PRESS[t.pressing].def;
      u.mid = u.mid / UNIT_BASE.mid;
      // thiếu người (thẻ đỏ / chấn thương hết quyền thay) → yếu hẳn
      const n = onPitch(side).length;
      if (n < 11) {
        const k = Math.pow(n / 11, 1.5);
        u.att *= k;
        u.mid *= k;
        u.def *= k;
      }
      side.units = u;
    }

    function pickPlayer(side, weights, attrBoost) {
      const list = onPitch(side).filter((s) => s.role !== "GK" || weights === FOUL_W);
      return rnd.weighted(list, (s) => (weights[s.role] || 0.1) * (attrBoost ? attrBoost(side.live[s.id].p) : 1));
    }

    function chance(att, def) {
      const ua = att.units;
      const ud = def.units;
      const ta = att.tactics;
      const header = rnd() < 0.18 * PASS[ta.passing].header;
      const shooterSlot = pickPlayer(att, SHOOT_W, (p) => (header ? p.a[A.heading] + p.a[A.jumping] : p.a[A.finishing] + p.a[A.offTheBall]) / 20);
      const S = att.live[shooterSlot.id];
      const ratio = ua.att / Math.max(4, ud.def);
      let xg = 0.145 * Math.pow(ratio, 0.6) * Math.exp(rnd.normal(0.75) - 0.28) * TEMPO[ta.tempo].xg;
      if (header) xg *= 0.75;
      xg = FM.clamp(xg, 0.015, 0.7);
      const big = xg > 0.32;
      const fin = header ? (S.p.a[A.heading] * 2 + S.p.a[A.jumping]) / 3 : (S.p.a[A.finishing] * 2 + S.p.a[A.composure]) / 3;
      const gkSlot = onPitch(def).find((s) => s.role === "GK");
      const G = gkSlot ? def.live[gkSlot.id] : null;
      const gk = G ? ud.gk : 3;
      const pGoal = FM.clamp(xg * Math.pow(fin / 12, 0.55) * Math.pow(12 / Math.max(3, gk), 0.65), 0.01, 0.8);
      const pOn = FM.clamp(0.36 * Math.pow(fin / 12, 0.4) + xg * 0.6, 0.15, 0.85);
      att.st.shots++;
      att.st.xg += xg;
      S.sh++;
      const r = rnd();
      const team = att.name;
      const p = name(att, S.id);
      if (r < pGoal) {
        att.goals++;
        att.st.on++;
        S.on++;
        S.g++;
        let assist = null;
        if (rnd() < 0.72) {
          const aSlot = pickPlayer(att, ASSIST_W, (q) => (q.a[A.passing] + q.a[A.vision] + q.a[A.crossing] * 0.5) / 25);
          if (aSlot.id !== S.id) assist = att.live[aSlot.id];
        }
        if (assist) assist.as++;
        if (G) G.p && (def.live[G.id].conceded = (def.live[G.id].conceded || 0) + 1);
        const text = fill(rnd.pick(header ? T.goalHeader : T.goal), { p, team }) + (assist ? " " + fill(rnd.pick(T.assist), { a: name(att, assist.id) }) : "");
        push("goal", att, text, { scorer: S.id, assist: assist ? assist.id : null, xg, score: [sides[0].goals, sides[1].goals] });
        return;
      }
      if (r < pOn) {
        att.st.on++;
        S.on++;
        if (G) G.sv++;
        if (rnd() < 0.45) att.st.corners++;
        if (m.live || big) push("save", att, (big ? rnd.pick(T.bigChance) : "") + fill(rnd.pick(T.save), { p, gk: G ? name(def, G.id) : "hậu vệ", team }), { xg });
        return;
      }
      if (rnd() < 0.3) {
        att.st.corners++;
        if (m.live) push("blocked", att, fill(rnd.pick(T.blocked), { p, team }), { xg });
        return;
      }
      const post = rnd() < 0.06;
      if (m.live || big || post) push("miss", att, (big ? rnd.pick(T.bigChance) : "") + fill(rnd.pick(post ? T.post : T.miss), { p, team }), { xg });
      // người kiến tạo cơ hội (key pass) cũng được tính điểm
      const kp = pickPlayer(att, ASSIST_W);
      if (kp.id !== S.id) att.live[kp.id].kp++;
    }

    function foul(side) {
      side.st.fouls++;
      const sl = pickPlayer(side, FOUL_W, (p) => ((p.a[A.tackling] + p.a[A.strength]) / 20) * (side.live[p.id].yc ? 0.5 : 1));
      const L = side.live[sl.id];
      const r = rnd();
      if (r < 0.0015) return sendOff(side, L, false);
      // đã có thẻ vàng thì cẩn thận hơn
      if (r < (L.yc ? 0.075 : 0.175)) {
        L.yc++;
        side.st.yc++;
        if (L.yc >= 2) return sendOff(side, L, true);
        push("yellow", side, fill(rnd.pick(T.yellow), { p: name(side, L.id) }), { player: L.id });
      }
    }
    function sendOff(side, L, second) {
      L.rc = 1;
      side.st.rc++;
      L.onPitch = false;
      L.to = m.minute;
      const n = onPitch(side).length;
      push("red", side, fill(rnd.pick(second ? T.red2 : T.red), { p: name(side, L.id), team: side.name, n }), { player: L.id });
      computeUnits(side);
    }

    function injury(side) {
      const list = onPitch(side);
      const sl = rnd.weighted(list, (s) => 0.5 + side.live[s.id].p.hid[1] / 10);
      const L = side.live[sl.id];
      L.inj = true;
      push("injury", side, fill(rnd.pick(T.injury), { p: name(side, L.id) }), { player: L.id });
      if (side.subs < FM.MAX_SUBS && (side.ai || !m.live)) aiReplace(side, sl);
      else if (!m.live || side.subs >= FM.MAX_SUBS) {
        L.onPitch = false;
        L.to = m.minute;
        computeUnits(side);
      } else m.pendingInjury = { side: side.idx, id: L.id }; // người chơi tự chọn người vào thay
    }

    // ---------- Thay người ----------
    function doSub(side, outId, inId) {
      const sl = side.slots.find((s) => s.id === outId && side.live[outId].onPitch);
      const IN = side.live[inId];
      if (!sl || !IN || IN.onPitch || IN.to !== null || side.subs >= FM.MAX_SUBS) return false;
      if (IN.p.fs && !side.live[outId].p.fs && onPitch(side).filter((s) => side.live[s.id].p.fs).length >= FM.MAX_FOREIGN_ON_PITCH) return false;
      const OUT = side.live[outId];
      OUT.onPitch = false;
      OUT.to = m.minute;
      IN.onPitch = true;
      IN.from = m.minute;
      sl.id = inId;
      side.bench = side.bench.filter((id) => id !== inId);
      side.subs++;
      push("sub", side, fill(T.sub[0], { team: side.name, in: name(side, inId), out: name(side, outId) }), { in: inId, out: outId });
      if (m.pendingInjury && m.pendingInjury.id === outId) m.pendingInjury = null;
      computeUnits(side);
      return true;
    }
    function bestSub(side, role, outP) {
      const foreignOn = onPitch(side).filter((s) => side.live[s.id].p.fs).length - (outP.fs ? 1 : 0);
      const cands = side.bench.map((id) => side.live[id]).filter((L) => L && !L.onPitch && L.to === null && !(L.p.fs && foreignOn >= FM.MAX_FOREIGN_ON_PITCH));
      cands.sort((a, b) => effective(b.p, role, b.fit, b.mor) - effective(a.p, role, a.fit, a.mor));
      return cands[0];
    }
    function aiReplace(side, sl) {
      const c = bestSub(side, sl.role, side.live[sl.id].p);
      if (c) doSub(side, sl.id, c.id);
      else {
        side.live[sl.id].onPitch = false;
        side.live[sl.id].to = m.minute;
        computeUnits(side);
      }
    }
    function aiDecisions(side) {
      if (!side.ai || side.subs >= FM.MAX_SUBS) return;
      if (![58, 66, 74, 82].includes(m.minute)) return;
      const other = sides[1 - side.idx];
      const diff = side.goals - other.goals;
      // đang thua sau phút 70 → tấn công
      if (m.minute >= 66 && diff < 0 && side.tactics.mentality < 4) side.tactics.mentality = Math.min(4, side.tactics.mentality + 1);
      if (m.minute >= 74 && diff > 0 && side.tactics.mentality > 1) side.tactics.mentality = 1;
      const tired = onPitch(side)
        .filter((s) => s.role !== "GK")
        .map((s) => ({ s, L: side.live[s.id] }))
        .sort((a, b) => a.L.fit - b.L.fit);
      const n = m.minute >= 74 ? 2 : 1;
      for (const { s, L } of tired.slice(0, n)) {
        if (L.fit > 86 && !(m.minute >= 74 && L.yc)) continue;
        const c = bestSub(side, s.role, L.p);
        if (c && effective(c.p, s.role, c.fit, c.mor) > effective(L.p, s.role, L.fit, L.mor) * 0.92) doSub(side, s.id, c.id);
      }
      computeUnits(side);
    }

    // ---------- Một phút ----------
    function tick() {
      if (m.over) return [];
      const start = m.events.length;
      if (m.minute === 0) {
        sides.forEach(computeUnits);
        push("kickoff", null, fill(rnd.pick(T.kickoff), { home: sides[0].name, away: sides[1].name }));
      }
      m.minute++;
      const [H, W] = sides;
      // thể lực giảm dần, tính lại sức mạnh mỗi 5 phút
      for (const side of sides)
        for (const sl of onPitch(side)) {
          const L = side.live[sl.id];
          const t = side.tactics;
          const drain = (0.36 + (sl.role === "GK" ? -0.26 : 0)) * PRESS[t.pressing].tire * TEMPO[t.tempo].tire * (1.35 - (L.p.a[A.stamina] / 20) * 0.7);
          L.fit = Math.max(20, L.fit - drain);
        }
      if (m.minute % 5 === 0) sides.forEach(computeUnits);
      // kiểm soát bóng
      const ph = Math.pow(H.units.mid, 2) * PRESS[H.tactics.pressing].poss * TEMPO[H.tactics.tempo].poss * PASS[H.tactics.passing].poss * m.homeAdv;
      const pa = Math.pow(W.units.mid, 2) * PRESS[W.tactics.pressing].poss * TEMPO[W.tactics.tempo].poss * PASS[W.tactics.passing].poss;
      const shareH = ph / (ph + pa);
      H.st.poss += shareH;
      W.st.poss += 1 - shareH;
      // cơ hội của mỗi đội trong phút này
      for (const [att, def, share] of [
        [H, W, shareH],
        [W, H, 1 - shareH],
      ]) {
        const ratio = att.units.att / Math.max(4, def.units.def);
        const rate =
          0.148 *
          Math.pow(ratio, 1.1) *
          Math.pow(share / 0.5, 0.55) *
          MENT[att.tactics.mentality].rate *
          MENT[def.tactics.mentality].opp *
          PRESS[def.tactics.pressing].opp *
          TEMPO[att.tactics.tempo].rate *
          (att === H ? m.homeAdv : 1);
        if (rnd() < rate) chance(att, def);
      }
      // phạm lỗi, chấn thương
      for (const side of sides) {
        if (rnd() < 0.12 * PRESS[side.tactics.pressing].foul) foul(side);
        if (rnd() < 0.0009) injury(side);
      }
      if (m.live && rnd() < 0.035) {
        const lead = shareH > 0.56 ? H : shareH < 0.44 ? W : null;
        push("info", lead, fill(rnd.pick(lead ? T.pressure.slice(0, 2) : T.pressure.slice(2)), { team: lead ? lead.name : "" }));
      }
      sides.forEach(aiDecisions);
      // hết hiệp / hết trận
      if (m.half === 1 && m.minute === 45 + stoppage1) {
        push("half", null, fill(T.half[0], { hs: H.goals, as: W.goals }));
        m.half = 2;
        m.minute = 45;
        m.halftime = true; // UI dừng lại cho người chơi chỉnh đội
        for (const side of sides) for (const sl of onPitch(side)) side.live[sl.id].fit = Math.min(100, side.live[sl.id].fit + 4);
      } else if (m.half === 2 && m.minute === 46 && m.halftime) {
        m.halftime = false;
      } else if (m.half === 2 && m.minute === 90 + stoppage2) finish();
      return m.events.slice(start);
    }

    // ---------- Kết thúc: chấm điểm ----------
    function finish() {
      const [H, W] = sides;
      push("full", null, fill(T.full[0], { hs: H.goals, as: W.goals }));
      m.over = true;
      for (const side of sides) {
        const other = sides[1 - side.idx];
        const res = Math.sign(side.goals - other.goals);
        side.st.poss = Math.round((side.st.poss / (H.st.poss + W.st.poss)) * 100);
        for (const L of Object.values(side.live)) {
          if (L.from === null) continue;
          const end = L.to ?? m.minute;
          L.played = Math.max(1, end - L.from);
          const sl = side.slots.find((s) => s.id === L.id) || { role: L.p.pos };
          const role = L.p.pos;
          const isDef = ["CB", "LB", "RB", "DM"].includes(role);
          let r =
            6.2 +
            1.1 * L.g +
            0.7 * L.as +
            0.12 * L.on +
            0.08 * L.kp +
            (role === "GK" ? 0.3 * L.sv - 0.35 * other.goals : 0) +
            (isDef ? -0.15 * other.goals : 0) +
            (other.goals === 0 && (role === "GK" || isDef) && L.played >= 60 ? 0.5 : 0) +
            res * 0.35 -
            0.3 * L.yc -
            1.2 * L.rc +
            (effective(L.p, sl.role, 100, 50) - 12) * 0.06 +
            rnd.normal(0.32);
          if (L.played < 20) r = 6.3 + (r - 6.3) * 0.4;
          L.rating = Math.round(FM.clamp(r, 3.5, 10) * 10) / 10;
        }
      }
      const all = sides.flatMap((s) => Object.values(s.live).filter((L) => L.from !== null));
      m.motm = all.sort((a, b) => b.rating - a.rating)[0]?.id;
    }

    m.tick = tick;
    m.sub = (sideIdx, outId, inId) => doSub(sides[sideIdx], outId, inId);
    m.setTactics = (sideIdx, t) => {
      Object.assign(sides[sideIdx].tactics, t);
      computeUnits(sides[sideIdx]);
    };
    m.onPitch = (sideIdx) => onPitch(sides[sideIdx]);
    m.runToEnd = () => {
      while (!m.over) tick();
      return m;
    };
    return m;
  };
})();
