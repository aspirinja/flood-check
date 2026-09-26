/* ฟังก์ชันพื้นฐานที่ใช้ร่วมกัน */
(function () {
  'use strict';
  const FM = (window.FM = {});
  const cfg = (FM.cfg = window.FLOOD_CONFIG);

  FM.$ = (s, r) => (r || document).querySelector(s);
  FM.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  FM.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const t = cfg.thresholds;
  FM.SEV = [
    { t: 'ปกติ', r: '< ' + t[0] + ' ซม.' },
    { t: 'เฝ้าระวัง', r: t[0] + '–' + (t[1] - 1) + ' ซม.' },
    { t: 'ผ่านลำบาก', r: t[1] + '–' + (t[2] - 1) + ' ซม.' },
    { t: 'ห้ามผ่าน', r: '≥ ' + t[2] + ' ซม.' }
  ];
  FM.sevOf = d => (d < t[0] ? 0 : d < t[1] ? 1 : d < t[2] ? 2 : 3);
  FM.TREND = { up: '▲ กำลังเพิ่ม', flat: '▬ ทรงตัว', down: '▼ กำลังลด' };
  FM.VEH = cfg.vehicles;

  FM.hav = (a, b) => {
    const R = 6371, r = Math.PI / 180;
    const dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r;
    const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  /* ระยะจากจุดหนึ่งถึงเส้นหลายท่อน หน่วยเมตร geom = [[lat,lon],...] */
  FM.distPoly = (lat, lon, geom) => {
    const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540;
    let best = Infinity;
    for (let i = 0; i < geom.length - 1; i++) {
      const ax = (geom[i][1] - lon) * kx, ay = (geom[i][0] - lat) * ky;
      const bx = (geom[i + 1][1] - lon) * kx, by = (geom[i + 1][0] - lat) * ky;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      let u = l2 ? -(ax * dx + ay * dy) / l2 : 0;
      u = Math.max(0, Math.min(1, u));
      const px = ax + u * dx, py = ay + u * dy;
      best = Math.min(best, Math.hypot(px, py));
    }
    return best;
  };
  FM.lenKm = geom => {
    let s = 0;
    for (let i = 0; i < geom.length - 1; i++) s += FM.hav({ lat: geom[i][0], lon: geom[i][1] }, { lat: geom[i + 1][0], lon: geom[i + 1][1] });
    return s;
  };

  FM.ago = ms => {
    const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (m < 1) return 'เมื่อสักครู่';
    if (m < 60) return m + ' นาทีก่อน';
    const h = Math.floor(m / 60);
    if (h < 48) return h + ' ชม.ก่อน';
    return Math.floor(h / 24) + ' วันก่อน';
  };
  FM.fmtKm = k => (k < 10 ? k.toFixed(1) : Math.round(k)) + ' กม.';
  FM.fmtMin = m => {
    m = Math.max(5, Math.round(m / 5) * 5);
    return m >= 60 ? Math.floor(m / 60) + ' ชม.' + (m % 60 ? ' ' + (m % 60) + ' นาที' : '') : m + ' นาที';
  };
  FM.fmtCoord = (lat, lon) => lat.toFixed(5) + ', ' + lon.toFixed(5);
  FM.inBounds = (lat, lon) => { const b = cfg.bounds; return lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east; };

  FM.store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ใช้ต่อได้แม้เก็บไม่ได้ */ } }
  };

  const L = {};
  FM.on = (e, f) => { (L[e] = L[e] || []).push(f); };
  FM.emit = (e, a) => { (L[e] || []).forEach(f => { try { f(a); } catch (err) { console.error(err); } }); };

  FM.toast = (msg, kind) => {
    const box = FM.$('#toasts');
    if (!box) return;
    const n = document.createElement('div');
    n.className = 'toast' + (kind ? ' ' + kind : '');
    n.textContent = msg;
    box.appendChild(n);
    setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 300); }, kind === 'alert' ? 9000 : 4500);
  };

  FM.gmapsUrl = (o, d) => 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + o.lat + ',' + o.lon + '&destination=' + d.lat + ',' + d.lon;
  FM.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
})();
