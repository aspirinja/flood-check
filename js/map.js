/* แผนที่ (Leaflet) และชั้นข้อมูลทั้งหมด */
(function () {
  'use strict';
  const FM = window.FM, cfg = FM.cfg, esc = FM.esc;

  const map = L.map('map', { zoomControl: false, minZoom: 8, maxZoom: cfg.tiles.maxZoom || 19, tap: true }).setView(cfg.center, cfg.zoom);
  L.control.zoom({ position: 'bottomright', zoomInTitle: 'ซูมเข้า', zoomOutTitle: 'ซูมออก' }).addTo(map);
  let tileErr = 0;
  const tiles = L.tileLayer(cfg.tiles.url, { attribution: cfg.tiles.attribution, maxZoom: cfg.tiles.maxZoom || 19 }).addTo(map);
  tiles.on('tileerror', () => { if (++tileErr === 8) FM.toast('โหลดแผนที่พื้นหลังไม่สำเร็จ แต่ยังดูจุดน้ำท่วมได้'); });

  const segLayer = L.layerGroup().addTo(map);
  const selLayer = L.layerGroup().addTo(map);
  const routeLayer = L.layerGroup().addTo(map);
  const watchLayer = L.layerGroup().addTo(map);
  const repLayer = L.layerGroup().addTo(map);
  const meLayer = L.layerGroup().addTo(map);

  const cluster = L.markerClusterGroup({
    maxClusterRadius: 44, showCoverageOnHover: false, spiderfyOnMaxZoom: true, disableClusteringAtZoom: 14,
    iconCreateFunction(c) {
      const ms = c.getAllChildMarkers();
      const mx = Math.max(...ms.map(m => m.sev));
      return L.divIcon({ className: '', html: '<div class="cl s' + mx + '">' + ms.length + '</div>', iconSize: [38, 38] });
    }
  }).addTo(map);

  const SEGW = [3, 5, 6, 7];
  const api = (FM.map = { map, picking: null });

  api.render = function () {
    const D = FM.data;
    if (!D) return;
    segLayer.clearLayers();
    cluster.clearLayers();
    const sel = FM.ui.sel;
    D.segs.forEach(s => {
      const dim = !FM.ui.match(s);
      const w = SEGW[s.sv];
      const drawLine = D.meta.mode !== 'sample';
      if (drawLine) L.polyline(s.geom, { color: 'var(--halo)', weight: w + 4, opacity: dim ? 0.12 : 0.9, lineCap: 'round', interactive: false }).addTo(segLayer);
      if (drawLine) L.polyline(s.geom, { color: s.sv ? 'var(--s' + s.sv + ')' : 'var(--road)', weight: w, opacity: dim ? 0.18 : 1, lineCap: 'round', dashArray: s.sv === 3 ? '10 6' : null, interactive: false }).addTo(segLayer);
      if (drawLine) {
        const hit = L.polyline(s.geom, { color: '#000', weight: 24, opacity: 0.01, interactive: true }).addTo(segLayer);
        hit.on('click', () => { if (!api.picking) FM.select({ type: 'seg', id: s.id }); });
      }
      if (s.sv > 0 && !dim && FM.ui.sevOn(s.sv)) {
        const on = sel && sel.type === 'seg' && sel.id === s.id;
        const m = L.marker([s.mid.lat, s.mid.lon], {
          icon: L.divIcon({ className: '', html: '<div class="pin s' + s.sv + (on ? ' sel' : '') + '">' + s.d + '</div>', iconSize: [30, 30] }),
          title: s.road + ' ' + s.d + ' ซม. ' + FM.SEV[s.sv].t, keyboard: true, riseOnHover: true
        });
        m.sev = s.sv;
        m.on('click', () => { if (!api.picking) FM.select({ type: 'seg', id: s.id }); });
        cluster.addLayer(m);
      }
    });
    api.renderSel();
  };

  api.renderSel = function () {
    selLayer.clearLayers();
    const sel = FM.ui.sel;
    if (sel && sel.type === 'seg' && FM.data && FM.data.byId[sel.id]) {
      const s = FM.data.byId[sel.id];
      L.polyline(s.geom, { color: 'var(--accent)', weight: SEGW[s.sv] + 12, opacity: 0.35, lineCap: 'round', interactive: false }).addTo(selLayer);
    }
  };

  api.renderReports = function () {
    repLayer.clearLayers();
    (FM.reports.list || []).forEach(r => {
      const sv = FM.sevOf(r.depth);
      const conf = r.c >= cfg.reportsConfirmNeeded;
      const m = L.marker([r.lat, r.lon], {
        icon: L.divIcon({ className: '', html: '<div class="rep s' + sv + (conf ? ' ok' : '') + '"><span>' + r.depth + '</span></div>', iconSize: [28, 28] }),
        title: 'ผู้ใช้รายงาน ' + r.depth + ' ซม.', keyboard: true
      });
      m.on('click', () => { if (!api.picking) FM.select({ type: 'rep', id: r.id }); });
      m.addTo(repLayer);
    });
  };

  api.renderWatch = function () {
    watchLayer.clearLayers();
    FM.watch.items().forEach(w => {
      const st = FM.watch.status(w);
      L.circle([w.lat, w.lon], { radius: w.radius, color: 'var(--accent)', weight: 1.5, dashArray: '5 5', fillColor: 'var(--accent)', fillOpacity: 0.06, interactive: false }).addTo(watchLayer);
      const m = L.marker([w.lat, w.lon], {
        icon: L.divIcon({ className: '', html: '<div class="wpin s' + st.level + '"><i></i><span>' + esc(w.name) + '</span></div>', iconSize: [0, 0], iconAnchor: [9, 9] }),
        title: w.name, keyboard: true
      });
      m.on('click', () => { if (!api.picking) FM.ui.openWatch(w.id); });
      m.addTo(watchLayer);
    });
  };

  api.drawRoute = function (r) {
    routeLayer.clearLayers();
    if (!r) return;
    if (r.risk && r.risk.length > 1) L.polyline(r.risk, { color: 'var(--ink2)', weight: 4, opacity: 0.9, dashArray: '2 8', lineCap: 'round', interactive: false }).addTo(routeLayer);
    if (r.safe && r.safe.length > 1) {
      L.polyline(r.safe, { color: 'var(--halo)', weight: 11, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(routeLayer);
      L.polyline(r.safe, { color: 'var(--accent)', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(routeLayer);
    }
    [['A', r.from], ['B', r.to]].forEach(p => {
      if (!p[1]) return;
      L.marker([p[1].lat, p[1].lon], { icon: L.divIcon({ className: '', html: '<div class="endpt">' + p[0] + '</div>', iconSize: [28, 28] }), interactive: false, zIndexOffset: 900 }).addTo(routeLayer);
    });
    const pts = [].concat(r.safe || [], r.risk || [], [[r.from.lat, r.from.lon], [r.to.lat, r.to.lon]]);
    fit(pts);
  };
  api.clearRoute = () => routeLayer.clearLayers();

  function fit(pts) {
    if (!pts.length) return;
    const b = L.latLngBounds(pts);
    const narrow = window.innerWidth < 820;
    map.fitBounds(b, { paddingTopLeft: [24, narrow ? 116 : 116], paddingBottomRight: [24, 24], maxZoom: 14, animate: !FM.reduceMotion });
  }
  api.fitAll = () => { const D = FM.data; if (D) fit(D.segs.reduce((a, s) => a.concat(s.geom), [])); else map.setView(cfg.center, cfg.zoom); };
  api.fitSegs = segs => fit(segs.reduce((a, s) => a.concat(s.geom), []));
  api.flyTo = (lat, lon, z) => {
    const target = map.project([lat, lon], z).subtract([0, -40]);
    map.setView(map.unproject(target, z), z, { animate: !FM.reduceMotion });
  };
  api.zoomNow = () => map.getZoom();

  /* เลือกตำแหน่งบนแผนที่ */
  const bar = FM.$('#pickbar');
  api.pick = function (hint, cb) {
    api.picking = { cb };
    FM.$('#pickhint').textContent = hint;
    bar.hidden = false;
    map.getContainer().classList.add('picking');
  };
  api.endPick = function () {
    api.picking = null; bar.hidden = true;
    map.getContainer().classList.remove('picking');
  };
  map.on('click', e => {
    if (!api.picking) return;
    const p = api.picking;
    api.endPick();
    p.cb({ lat: e.latlng.lat, lon: e.latlng.lng });
  });
  FM.$('#pickcancel').onclick = () => { const p = api.picking; api.endPick(); if (p && p.cancel) p.cancel(); FM.emit('pickcancel'); };

  /* ตำแหน่งปัจจุบัน */
  FM.me = null;
  api.locate = function () {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) { rej(new Error('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง')); return; }
      navigator.geolocation.getCurrentPosition(p => {
        FM.me = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
        meLayer.clearLayers();
        L.circle([FM.me.lat, FM.me.lon], { radius: FM.me.acc, color: 'var(--accent)', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(meLayer);
        L.marker([FM.me.lat, FM.me.lon], { icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [18, 18] }), interactive: false }).addTo(meLayer);
        FM.emit('me');
        res(FM.me);
      }, err => {
        rej(new Error(err.code === 1 ? 'ยังไม่ได้อนุญาตให้เข้าถึงตำแหน่ง ตรวจสอบการตั้งค่าเบราว์เซอร์' : 'หาตำแหน่งปัจจุบันไม่ได้ ลองใหม่อีกครั้ง'));
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
    });
  };

  FM.$('#zfit').onclick = () => api.fitAll();
  FM.$('#zloc').onclick = () => {
    api.locate().then(me => { if (!FM.inBounds(me.lat, me.lon)) FM.toast('ตำแหน่งของคุณอยู่นอกพื้นที่ที่แอปครอบคลุม'); else map.setView([me.lat, me.lon], 14, { animate: !FM.reduceMotion }); })
      .catch(e => FM.toast(e.message, 'warn'));
  };
})();
