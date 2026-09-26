/* เช็คเส้นทางที่เลี่ยงถนนท่วมตามประเภทรถ */
(function () {
  'use strict';
  const FM = window.FM, esc = FM.esc, $ = FM.$;
  const R = (FM.route = { from: 'n:donmueang', to: 'n:suvarn', veh: 'sedan', visible: false });
  let ADJ = {};

  function build() {
    ADJ = {};
    if (!FM.data) return;
    FM.data.segs.forEach(s => {
      (ADJ[s.a] = ADJ[s.a] || []).push({ to: s.b, s });
      (ADJ[s.b] = ADJ[s.b] || []).push({ to: s.a, s });
    });
  }

  function dijkstra(src, dst, w) {
    const nodes = Object.keys(FM.data.nodes);
    const dist = {}, prev = {}, done = new Set();
    nodes.forEach(k => { dist[k] = Infinity; });
    dist[src] = 0;
    for (;;) {
      let u = null, best = Infinity;
      for (const k of nodes) if (!done.has(k) && dist[k] < best) { best = dist[k]; u = k; }
      if (u === null || u === dst) break;
      done.add(u);
      for (const o of ADJ[u] || []) {
        const c = w(o.s);
        if (c === Infinity) continue;
        if (dist[u] + c < dist[o.to]) { dist[o.to] = dist[u] + c; prev[o.to] = { from: u, s: o.s }; }
      }
    }
    if (dist[dst] === Infinity) return null;
    const path = [];
    let c = dst;
    while (c !== src) { const p = prev[c]; path.unshift({ from: p.from, to: c, s: p.s }); c = p.from; }
    return path;
  }

  const speed = d => (d >= 15 ? 8 : d >= 5 ? 15 : 30);
  const minutes = path => path.reduce((a, x) => a + x.s.km / speed(x.s.d) * 60, 0);
  const kmOf = path => path.reduce((a, x) => a + x.s.km, 0);
  function geomOf(path) {
    const out = [];
    path.forEach(x => {
      const g = x.from === x.s.a ? x.s.geom : x.s.geom.slice().reverse();
      g.forEach((p, i) => { if (out.length && i === 0) return; out.push(p); });
    });
    return out;
  }
  function steps(path) {
    const out = [];
    path.forEach(x => {
      const l = out[out.length - 1];
      if (l && l.road === x.s.road) { l.to = x.to; l.km += x.s.km; l.d = Math.max(l.d, x.s.d); l.trend = l.trend === 'up' || x.s.trend === 'up' ? 'up' : l.trend; }
      else out.push({ road: x.s.road, from: x.from, to: x.to, km: x.s.km, d: x.s.d, trend: x.s.trend });
    });
    return out;
  }

  R.nearest = function (lat, lon) {
    let best = null, bd = Infinity;
    Object.values(FM.data.nodes).forEach(n => { const d = FM.hav({ lat, lon }, n); if (d < bd) { bd = d; best = n; } });
    return { node: best, km: bd };
  };

  /* แปลงค่าที่เลือกเป็นตำแหน่งจริงและจุดบนโครงข่าย */
  R.resolve = function (val) {
    const D = FM.data;
    if (val.startsWith('n:')) { const n = D.nodes[val.slice(2)]; return n ? { lat: n.lat, lon: n.lon, node: n, label: n.name, km: 0 } : null; }
    if (val === 'me') { if (!FM.me) return null; const q = R.nearest(FM.me.lat, FM.me.lon); return { lat: FM.me.lat, lon: FM.me.lon, node: q.node, label: 'ตำแหน่งของฉัน', km: q.km }; }
    if (val.startsWith('w:')) { const w = FM.watch.get(val.slice(2)); if (!w) return null; const q = R.nearest(w.lat, w.lon); return { lat: w.lat, lon: w.lon, node: q.node, label: w.name, km: q.km }; }
    return null;
  };

  R.plan = function (fromV, toV, veh) {
    const A = R.resolve(fromV), B = R.resolve(toV);
    if (!A || !B) return { error: 'need-place' };
    const lim = FM.VEH[veh].max;
    const safe = A.node.id === B.node.id ? [] : dijkstra(A.node.id, B.node.id, s => (s.d <= lim ? s.km * (1 + s.d / 30) : Infinity));
    const short = A.node.id === B.node.id ? [] : dijkstra(A.node.id, B.node.id, s => s.km);
    const same = !!(safe && short && safe.length === short.length && safe.every((x, i) => x.s.id === short[i].s.id));
    const blocked = short ? short.filter(x => x.s.d > lim).map(x => x.s) : [];
    const warn = { rising: [], reports: [] };
    if (safe && safe.length) {
      safe.forEach(x => { if (x.s.trend === 'up' && x.s.d >= FM.cfg.thresholds[0] && x.s.d >= lim * 0.6) warn.rising.push(x.s); });
      const g = geomOf(safe);
      (FM.reports.list || []).forEach(r => { if (r.depth >= FM.cfg.thresholds[0] && FM.distPoly(r.lat, r.lon, g) <= 300) warn.reports.push(r); });
    }
    return { A, B, safe, short, same, blocked, warn, veh, lim };
  };

  /* ---------- ส่วนแสดงผล ---------- */
  function fillOptions() {
    const D = FM.data;
    if (!D) return;
    const groups = {};
    Object.values(D.nodes).forEach(n => { (groups[n.province] = groups[n.province] || []).push(n); });
    let html = '<option value="me">📍 ตำแหน่งของฉัน</option>';
    const ws = FM.watch.items();
    if (ws.length) html += '<optgroup label="จุดที่ติดตาม">' + ws.map(w => '<option value="w:' + w.id + '">' + esc(w.name) + '</option>').join('') + '</optgroup>';
    Object.keys(groups).forEach(g => {
      html += '<optgroup label="' + esc(g) + '">' + groups[g].sort((a, b) => a.name.localeCompare(b.name, 'th')).map(n => '<option value="n:' + n.id + '">' + esc(n.name) + '</option>').join('') + '</optgroup>';
    });
    ['from', 'to'].forEach(k => {
      const el = $('#' + k);
      el.innerHTML = html;
      if (!el.querySelector('option[value="' + R[k] + '"]')) R[k] = k === 'from' ? 'n:donmueang' : 'n:suvarn';
      el.value = R[k];
    });
  }

  R.render = function (fit) {
    const out = $('#routeout');
    if (!FM.data) { out.innerHTML = ''; return; }
    build();
    const res = R.plan(R.from, R.to, R.veh);
    if (res.error) {
      out.innerHTML = '<div class="result"><h3>ยังไม่ทราบตำแหน่งของคุณ</h3><p>กดปุ่มด้านล่างเพื่อให้แอปหาตำแหน่งปัจจุบัน หรือเลือกย่านอื่นจากรายการ</p><button class="btn primary" id="rlocate" type="button">หาตำแหน่งของฉัน</button></div>';
      $('#rlocate').onclick = () => FM.map.locate().then(() => { fillOptions(); R.render(true); }).catch(e => FM.toast(e.message, 'warn'));
      FM.map.clearRoute();
      return;
    }
    const { A, B, safe, short, same, blocked, warn, veh } = res;
    const vn = FM.VEH[veh].name;
    let h = '';
    if (A.node.id === B.node.id) {
      h = '<div class="result"><h3>ต้นทางกับปลายทางอยู่ใกล้กันมาก</h3><p>เลือกสองที่ที่ห่างกันมากกว่านี้เพื่อดูเส้นทาง</p></div>';
      out.innerHTML = h; FM.map.clearRoute(); return;
    }
    const snap = [A, B].filter(x => x.km > 1.5).map(x => x.label + ' อยู่ห่างจุดเชื่อม' + x.node.name + ' ' + FM.fmtKm(x.km)).join(', ');
    const gm = '<a class="btn linkbtn" target="_blank" rel="noopener" href="' + FM.gmapsUrl(A, B) + '">เปิดใน Google Maps</a>';
    const listBlocked = [...new Set(blocked.map(s => esc(s.road) + ' ช่วง' + esc(FM.data.nodes[s.a].name) + '–' + esc(FM.data.nodes[s.b].name) + ' (' + s.d + ' ซม.)'))].join(', ');
    if (safe) {
      const st = steps(safe), wet = safe.filter(x => x.s.d >= FM.cfg.thresholds[0]);
      h += '<div class="result good"><h3>มีทางที่' + vn + 'ผ่านได้</h3><div class="kpis"><span><b>' + FM.fmtKm(kmOf(safe)).replace(' กม.', '') + '</b><small>กม.</small></span><span><b>' + FM.fmtMin(minutes(safe)) + '</b><small>โดยประมาณ</small></span></div>' +
        '<p>' + (wet.length ? 'ผ่านจุดน้ำขัง ' + wet.length + ' ช่วง สูงสุด ' + Math.max(...wet.map(x => x.s.d)) + ' ซม. ขับช้าลงและระวังเครื่องดับ' : 'ไม่ผ่านจุดน้ำขังที่รู้จัก') + '</p></div>';
      if (warn.rising.length) h += '<div class="warnbox"><b>น้ำกำลังเพิ่ม</b> บนเส้นทางนี้: ' + [...new Set(warn.rising.map(s => esc(s.road) + ' (' + s.d + ' ซม.)'))].join(', ') + ' ตรวจอีกครั้งก่อนออกเดินทาง</div>';
      if (warn.reports.length) h += '<div class="warnbox"><b>ผู้ใช้รายงานน้ำท่วมใกล้เส้นทาง</b> ' + warn.reports.length + ' จุด (ยังไม่ใช่ข้อมูลทางการ) ' + warn.reports.slice(0, 3).map(r => r.depth + ' ซม.' + (r.road ? ' ' + esc(r.road) : '')).join(', ') + '</div>';
      if (!same && blocked.length) h += '<div class="warnbox">เส้นที่สั้นที่สุด (เส้นจุดบนแผนที่) ' + vn + 'ผ่านไม่ได้ เพราะ ' + listBlocked + '</div>';
      h += '<ol class="steps">' + st.map(s => '<li><span class="ln ' + (s.d >= FM.cfg.thresholds[0] ? 'w' : '') + '"></span><span><b>' + esc(s.road) + '</b><small>' + esc(FM.data.nodes[s.from].name) + ' → ' + esc(FM.data.nodes[s.to].name) + (s.d >= FM.cfg.thresholds[0] ? ' · น้ำสูงสุด ' + s.d + ' ซม.' + (s.trend === 'up' ? ' ▲' : '') : '') + '</small></span><span class="km">' + FM.fmtKm(s.km) + '</span></li>').join('') + '</ol>';
    } else {
      h += '<div class="result bad"><h3>ไม่พบทางที่' + vn + 'ผ่านได้</h3><p>ทุกเส้นทางไป' + esc(B.label) + 'ต้องผ่านถนนที่น้ำสูงเกินที่' + vn + 'ไปไหว ลองเลือกรถที่สูงกว่า หรือรอให้น้ำลด</p></div>';
      if (blocked.length) h += '<div class="warnbox">เส้นที่สั้นที่สุด (เส้นจุดบนแผนที่) ติดที่ ' + listBlocked + '</div>';
    }
    h += '<div class="actions">' + gm + '</div>';
    h += '<p class="note">' + (snap ? esc(snap) + '. ' : '') + 'แอปคำนวณจากถนนสายหลักที่มีข้อมูลระดับน้ำเท่านั้น ใช้ Google Maps ช่วยดูซอยและการจราจรจริงอีกครั้ง</p>';
    out.innerHTML = h;
    if (R.visible) FM.map.drawRoute({ safe: safe ? geomOf(safe) : null, risk: short && !same ? geomOf(short) : null, from: A, to: B }, fit);
  };

  R.show = function () { R.visible = true; fillOptions(); R.render(true); };
  R.hide = function () { R.visible = false; FM.map.clearRoute(); };
  R.setEnds = function (from, to) { if (from) R.from = from; if (to) R.to = to; fillOptions(); };

  $('#from').onchange = e => { R.from = e.target.value; ensureMe(R.from); };
  $('#to').onchange = e => { R.to = e.target.value; ensureMe(R.to); };
  function ensureMe(v) {
    if (v === 'me' && !FM.me) FM.map.locate().then(() => R.render(true)).catch(e => { FM.toast(e.message, 'warn'); R.render(true); });
    else R.render(true);
  }
  $('#swap').onclick = () => { const t = R.from; R.from = R.to; R.to = t; $('#from').value = R.from; $('#to').value = R.to; R.render(true); };
  FM.$$('input[name=veh]').forEach(i => { i.onchange = () => { R.veh = i.value; R.render(false); }; });
  FM.on('data', () => { if (R.visible) { if (!$('#from').options.length) fillOptions(); R.render(false); } });
  FM.on('reports', () => { if (R.visible) R.render(false); });
  FM.on('watch', () => { if (FM.data) { const keep = [R.from, R.to]; fillOptions(); if (R.visible) R.render(false); void keep; } });
})();
