/* โหลดและดูแลข้อมูลน้ำท่วม */
(function () {
  'use strict';
  const FM = window.FM, cfg = FM.cfg;
  const DEMO = new URLSearchParams(location.search).has('demo');
  FM.demo = DEMO;
  FM.data = null;
  FM.dataError = null;
  FM.changes = null;

  function normalize(raw) {
    const now = Date.now();
    const meta = raw.meta || {};
    const nodes = {};
    (raw.nodes || []).forEach(n => { nodes[n.id] = { id: n.id, name: n.name, lat: n.lat, lon: n.lon, province: n.province, major: !!n.major }; });
    const step = meta.historyStepMin || 30;
    const segs = [];
    (raw.segments || []).forEach(s => {
      const a = nodes[s.from], b = nodes[s.to];
      if (!a || !b) return;
      const hasGeom = Array.isArray(s.geometry) && s.geometry.length >= 2;
      const geom = hasGeom ? s.geometry : [[a.lat, a.lon], [b.lat, b.lon]];
      const km = FM.lenKm(geom) * (hasGeom ? 1 : 1.2);
      const mid = geom[Math.floor((geom.length - 1) / 2)];
      const mid2 = geom[Math.ceil((geom.length - 1) / 2)];
      const d = Math.max(0, Math.round(Number(s.depth) || 0));
      const updated = s.updatedAt ? Date.parse(s.updatedAt) : now - (s.ageMin || 0) * 60000;
      const seg = {
        id: s.id, road: s.road, a: s.from, b: s.to, d, d0: d, sv: s.level ? ({ no: 3, hard: 2 }[s.level] || 1) : FM.sevOf(d), lv: s.level || null,
        trend: s.trend || 'flat', updated, geom, km,
        mid: { lat: (mid[0] + mid2[0]) / 2, lon: (mid[1] + mid2[1]) / 2 },
        pvs: [a.province, b.province], source: s.source || '',
        history: Array.isArray(s.history) ? s.history.slice() : [d],
        hay: (s.road + ' ' + a.name + ' ' + b.name + ' ' + a.province + ' ' + b.province).toLowerCase()
      };
      segs.push(seg);
    });
    const updatedAt = meta.updatedAt ? Date.parse(meta.updatedAt) : now - (meta.ageMin || 0) * 60000;
    const sources = (meta.sources || []).map(x => ({ id: x.id, name: x.name, status: x.status || 'ok', url: x.url || '', at: x.fetchedAt ? Date.parse(x.fetchedAt) : (x.ageMin != null ? now - x.ageMin * 60000 : null) }));
    const byId = {};
    segs.forEach(s => { byId[s.id] = s; });
    return { meta: { mode: meta.mode || 'live', levelOnly: !!meta.levelOnly, updatedAt, step, sources, note: meta.note || '' }, nodes, segs, byId };
  }

  /* ข้อมูลจริง: แปลง roads.json (เหตุการณ์น้ำท่วมบนถนน) ให้อยู่ในรูปเดียวกับข้อมูลช่วงถนน
     ไม่มีความลึกน้ำ จึงใช้ระดับ ห้ามผ่าน/ควรเลี่ยง/ผ่านได้ แทนตัวเลข ซม. (depth ที่ใส่ไว้ใช้จัดเรียงเท่านั้น ไม่แสดง) */
  const LV_D = { no: 30, hard: 15, yes: 5, unk: 5 }, LV_RANK = { no: 3, hard: 2, yes: 1, unk: 1 };
  const SEV_CM = FM.SEV;
  const SEV_LIVE = [{ t: 'ปกติ', r: '' }, { t: 'ผ่านได้', r: 'ผ่านได้/ไม่ระบุ' }, { t: 'ควรเลี่ยง', r: 'รายงานว่าควรเลี่ยง' }, { t: 'ห้ามผ่าน', r: 'รายงานว่าผ่านไม่ได้' }];
  function fromRoads(R) {
    const nodes = [], segments = [];
    R.incidents.slice().sort((a, b) => (LV_RANK[a.pass] || 1) - (LV_RANK[b.pass] || 1)).forEach(i => {
      const g = Array.isArray(i.g) && i.g.length >= 2 ? i.g : [[i.lat, i.lon], [i.lat + 0.0002, i.lon]];
      nodes.push({ id: i.id + 'a', name: '', lat: g[0][0], lon: g[0][1], province: 'ไม่ระบุ' },
                 { id: i.id + 'b', name: '', lat: g[g.length - 1][0], lon: g[g.length - 1][1], province: 'ไม่ระบุ' });
      segments.push({ id: i.id, road: i.title.replace(/\s*\((ผ่านไม่ได้|ผ่านได้)\)\s*$/, '').replace(/ถนน/g, 'ถ.'), from: i.id + 'a', to: i.id + 'b',
        depth: LV_D[i.pass] || 5, level: i.pass, geometry: g, updatedAt: i.at, source: 'longdo' });
    });
    const src = (R.sources || []).filter(x => x.id === 'longdo');
    return { meta: { mode: 'live', levelOnly: true, updatedAt: R.updatedAt, historyStepMin: 15,
      sources: src.length ? src : [{ id: 'longdo', name: 'Longdo Traffic / iTIC / กรมทางหลวง', status: 'ok' }] }, nodes, segments };
  }

  /* โหมด ?demo จำลองระดับน้ำที่ขึ้นลงเพื่อลองระบบแจ้งเตือน */
  function tickDemo(D) {
    D.segs.forEach(s => {
      if (Math.random() < 0.4) {
        const delta = Math.round((Math.random() - 0.4) * 10);
        const nd = Math.max(0, s.d + delta);
        if (nd !== s.d) s.trend = nd > s.d ? 'up' : 'down';
        s.d = nd; s.sv = FM.sevOf(nd); s.updated = Date.now();
        s.history[s.history.length - 1] = nd;
      }
    });
    D.meta.updatedAt = Date.now();
  }

  function computeChanges(D) {
    const snap = FM.store.get('fm:snap', null);
    if (!snap || !snap.d) { FM.changes = { since: null }; }
    else {
      const ch = { since: snap.t, up: [], down: [], newly: [], cleared: [] };
      const T = cfg.thresholds[0];
      D.segs.forEach(s => {
        const b = snap.d[s.id];
        if (b == null) return;
        if (b < T && s.d >= T) ch.newly.push(s);
        else if (b >= T && s.d < T) ch.cleared.push(s);
        else if (s.d - b >= 5) ch.up.push(s);
        else if (b - s.d >= 5) ch.down.push(s);
      });
      FM.changes = ch;
    }
    if (!snap || Date.now() - snap.t > 30 * 60000) {
      const d = {};
      D.segs.forEach(s => { d[s.id] = s.d; });
      FM.store.set('fm:snap', { t: Date.now(), d });
    }
  }

  let first = true;
  FM.refresh = async function () {
    const prev = FM.data;
    try {
      let D;
      if (DEMO && prev) { D = prev; tickDemo(D); }
      else {
        const base = DEMO || !cfg.roadsUrl ? cfg.dataUrl : cfg.roadsUrl;
        const url = base + (base.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now();
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        let raw = await r.json();
        if (base === cfg.roadsUrl) {
          if (!raw || !Array.isArray(raw.incidents)) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
          raw = fromRoads(raw);
        }
        D = normalize(raw);
        if (DEMO) D.meta.mode = 'sample';
      }
      FM.data = D;
      FM.SEV = D.meta.levelOnly ? SEV_LIVE : SEV_CM;
      FM.dataError = null;
      if (first) computeChanges(D);
    } catch (e) {
      console.error('โหลดข้อมูลไม่สำเร็จ', e);
      FM.dataError = e;
    }
    const wasFirst = first;
    first = false;
    FM.emit('data', { first: wasFirst, prev: prev });
  };

  FM.startPolling = function () {
    FM.refresh();
    setInterval(FM.refresh, (DEMO ? 8 : cfg.refreshSeconds) * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) FM.refresh(); });
  };
})();
