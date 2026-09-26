/* รายงานน้ำท่วมจากผู้ใช้ คุยกับ API ที่ functions/api ถ้าไม่มี API จะเก็บเฉพาะในเครื่อง */
(function () {
  'use strict';
  const FM = window.FM, cfg = FM.cfg;
  const LKEY = 'fm:localreports', MKEY = 'fm:mine', CKEY = 'fm:confirmed';
  const R = (FM.reports = { list: [], mode: cfg.reportsApi ? 'server' : 'local' });

  const ttl = () => cfg.reportLifetimeHours * 3600000;
  const readLocal = () => (FM.store.get(LKEY, []) || []).filter(r => Date.now() - r.t < ttl());

  R.mine = id => (FM.store.get(MKEY, []) || []).indexOf(id) > -1;
  R.confirmedByMe = id => (FM.store.get(CKEY, []) || []).indexOf(id) > -1;
  const push = (k, id) => { const a = FM.store.get(k, []) || []; if (a.indexOf(id) < 0) { a.push(id); FM.store.set(k, a.slice(-100)); } };

  let loadedOnce = false;
  R.load = async function () {
    const initial = !loadedOnce; loadedOnce = true;
    if (cfg.reportsApi) {
      try {
        const r = await fetch(cfg.reportsApi, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        R.list = (j.reports || []).filter(x => Date.now() - x.t < ttl());
        R.mode = 'server';
        FM.emit('reports', { initial });
        return;
      } catch (e) { R.mode = 'local'; }
    } else { R.mode = 'local'; }
    R.list = readLocal();
    FM.emit('reports', { initial });
  };

  R.submit = async function (rep) {
    if (R.mode === 'server') {
      const r = await fetch(cfg.reportsApi, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rep) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'ส่งรายงานไม่สำเร็จ (' + r.status + ')');
      push(MKEY, j.report.id);
      R.list.push(j.report);
    } else {
      const item = { id: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), lat: rep.lat, lon: rep.lon, depth: rep.depth, road: rep.road || '', note: rep.note || '', t: Date.now(), c: 0, local: true };
      const all = readLocal(); all.push(item); FM.store.set(LKEY, all);
      push(MKEY, item.id);
      R.list.push(item);
    }
    FM.emit('reports', { self: true });
  };

  R.confirm = async function (id) {
    if (R.confirmedByMe(id) || R.mine(id)) return;
    const rep = R.list.find(x => x.id === id);
    if (!rep) return;
    if (R.mode === 'server' && !rep.local) {
      const r = await fetch(cfg.reportsApi + '/' + encodeURIComponent(id) + '/confirm', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'ยืนยันไม่สำเร็จ');
      rep.c = j.report ? j.report.c : rep.c + 1;
    } else {
      rep.c += 1;
      const all = readLocal(); const x = all.find(y => y.id === id); if (x) { x.c = rep.c; FM.store.set(LKEY, all); }
    }
    push(CKEY, id);
    FM.emit('reports', { self: true });
  };

  R.status = r => (r.c >= cfg.reportsConfirmNeeded ? 'ยืนยันแล้ว' : 'ยังไม่ยืนยัน');

  setInterval(R.load, 90000);
})();
