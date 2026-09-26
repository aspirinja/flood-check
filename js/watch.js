/* จุดที่ติดตามและการแจ้งเตือน */
(function () {
  'use strict';
  const FM = window.FM;
  const KEY = 'fm:watch', LV = 'fm:wlast';
  const W = (FM.watch = {});

  W.items = () => FM.store.get(KEY, []) || [];
  const save = a => { FM.store.set(KEY, a); FM.emit('watch'); };

  W.add = function (o) {
    const a = W.items();
    const it = { id: 'w' + Date.now().toString(36), name: o.name || 'จุดติดตาม', lat: o.lat, lon: o.lon, radius: o.radius || 1000, threshold: o.threshold || 10 };
    a.push(it); save(a); return it;
  };
  W.update = function (id, patch) { const a = W.items(); const i = a.findIndex(x => x.id === id); if (i > -1) { a[i] = Object.assign(a[i], patch); save(a); } };
  W.remove = function (id) { save(W.items().filter(x => x.id !== id)); const l = FM.store.get(LV, {}) || {}; delete l[id]; FM.store.set(LV, l); };
  W.get = id => W.items().find(x => x.id === id);

  /* สถานะของจุดติดตาม: ช่วงถนนและรายงานผู้ใช้ที่อยู่ในรัศมี */
  W.status = function (w) {
    const D = FM.data;
    const near = [];
    if (D) D.segs.forEach(s => {
      const dm = FM.distPoly(w.lat, w.lon, s.geom);
      if (dm <= w.radius) near.push({ seg: s, dist: dm });
    });
    near.sort((a, b) => a.dist - b.dist);
    const reps = (FM.reports.list || []).filter(r => FM.hav(w, r) * 1000 <= w.radius);
    let maxD = 0;
    near.forEach(n => { if (n.seg.d > maxD) maxD = n.seg.d; });
    reps.forEach(r => { if (r.depth > maxD) maxD = r.depth; });
    const rising = near.some(n => n.seg.trend === 'up' && n.seg.d >= FM.cfg.thresholds[0]);
    /* ประวัติรวม: ค่าสูงสุดของช่วงถนนใกล้เคียงในแต่ละช่วงเวลา */
    let hist = [];
    const H = near.filter(n => n.seg.history.length > 1);
    if (H.length) {
      const len = Math.min(...H.map(n => n.seg.history.length));
      for (let i = 0; i < len; i++) hist.push(Math.max(...H.map(n => n.seg.history[n.seg.history.length - len + i])));
    }
    return { near, reps, maxD, level: FM.sevOf(maxD), rising, hist, step: D ? D.meta.step : 30 };
  };

  /* ตรวจการเปลี่ยนแปลงทุกครั้งที่ข้อมูลหรือรายงานอัปเดต */
  let alerts = 0;
  W.check = function (silent) {
    if (FM.data && FM.data.meta.levelOnly) return;
    const last = FM.store.get(LV, {}) || {};
    const items = W.items();
    let n = 0;
    items.forEach(w => {
      const st = W.status(w);
      const prev = last[w.id];
      if (st.maxD >= w.threshold) n++;
      if (prev && !silent) {
        const crossed = st.maxD >= w.threshold && prev.d < w.threshold;
        const worse = st.maxD >= w.threshold && st.level > prev.l;
        if (crossed || worse) {
          const msg = w.name + ': น้ำสูง ' + st.maxD + ' ซม. (' + FM.SEV[st.level].t + ') ในรัศมี ' + (w.radius >= 1000 ? w.radius / 1000 + ' กม.' : w.radius + ' ม.');
          FM.toast(msg, 'alert');
          if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            try { new Notification('เตือนน้ำท่วม', { body: msg, tag: 'flood-' + w.id }); } catch (e) { /* ไม่รองรับบนบางอุปกรณ์ */ }
          }
        }
      }
      last[w.id] = { d: st.maxD, l: st.level };
    });
    FM.store.set(LV, last);
    alerts = n;
    document.title = (n ? '(' + n + ') ' : '') + FM.baseTitle;
    FM.emit('alerts', n);
  };
  W.alertCount = () => alerts;

  W.askPermission = async function () {
    if (!('Notification' in window)) { FM.toast('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน', 'warn'); return 'unsupported'; }
    const r = await Notification.requestPermission();
    FM.emit('watch');
    return r;
  };
})();
