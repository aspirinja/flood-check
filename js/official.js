/* ข้อมูลเสริมจากแหล่งสาธารณะ แสดงในหน้าภาพรวม
   1) ถนนที่มีรายงานน้ำท่วม (data/roads.json จาก Longdo/iTIC/กรมทางหลวง และ Traffy Fondue) ไม่ใช่ความลึกน้ำ
   2) สถานีวัดฝนและระดับน้ำ (data/official.json จาก ThaiWater/สสน.)
   ถ้าไม่มีไฟล์ใด ส่วนนั้นจะไม่แสดง และแอปทำงานตามปกติ */
(function () {
  'use strict';
  const FM = window.FM, cfg = FM.cfg, esc = FM.esc;
  FM.official = null;
  FM.roads = null;
  if (!cfg.officialUrl && !cfg.roadsUrl) return;
  const stLayer = L.layerGroup(), rdLayer = L.layerGroup();
  let stShown = false, rdShown = false;

  /* เกณฑ์ฝนสะสม 24 ชม. ตามการจัดระดับของกรมอุตุนิยมวิทยา (มม.) */
  const RAIN = [[90, 'หนักมาก', 3], [35, 'หนัก', 2], [10, 'ปานกลาง', 1], [0, 'เล็กน้อย', 0]];
  const rainLv = v => RAIN.find(r => v >= r[0]);
  const STALE_MS = 3 * 3600 * 1000;
  const PASS = { no: ['ห้ามผ่าน', 3], hard: ['ควรเลี่ยง', 2], yes: ['ผ่านได้', 1], unk: ['มีรายงานน้ำท่วม', 1] };
  const ago = iso => FM.ago(Date.parse(iso));

  function drawStations() {
    stLayer.clearLayers();
    const O = FM.official; if (!O) return;
    O.rain.forEach(r => {
      const lv = rainLv(r.rain24h);
      L.marker([r.lat, r.lon], { icon: L.divIcon({ className: '', html: '<div class="st rain s' + lv[2] + '">' + Math.round(r.rain24h) + '</div>', iconSize: [30, 20] }), keyboard: false })
        .bindPopup('<b>' + esc(r.name) + '</b><br>ฝนสะสม 24 ชม. ' + r.rain24h + ' มม. (' + lv[1] + ')<br><small>' + esc(r.province) + ' · ' + esc(r.agency) + ' · ' + ago(r.at) + '</small>').addTo(stLayer);
    });
    O.water.forEach(w => {
      const over = (w.overBank || -1) > 0;
      L.marker([w.lat, w.lon], { icon: L.divIcon({ className: '', html: '<div class="st wl' + (over ? ' over' : '') + '">' + (over ? '▲' : '≈') + '</div>', iconSize: [22, 22] }), keyboard: false })
        .bindPopup('<b>' + esc(w.name) + '</b><br>' + (w.overBank == null ? 'ไม่ทราบระดับตลิ่ง' : over ? 'ล้นตลิ่ง ' + w.overBank + ' ม.' : 'ต่ำกว่าตลิ่ง ' + Math.abs(w.overBank) + ' ม.') + (w.change ? '<br>เทียบรอบก่อน ' + (w.change > 0 ? '+' : '') + w.change + ' ม.' : '') + '<br><small>' + esc(w.province) + ' · ' + esc(w.agency) + ' · ' + ago(w.at) + '</small>').addTo(stLayer);
    });
  }

  function drawRoads() {
    rdLayer.clearLayers();
    const R = FM.roads; if (!R) return;
    R.reports.forEach(t => {
      L.marker([t.lat, t.lon], { icon: L.divIcon({ className: '', html: '<div class="st tf' + (t.help ? ' help' : '') + '"></div>', iconSize: [14, 14] }), keyboard: false })
        .bindPopup('<b>' + (t.help ? 'ประชาชนขอความช่วยเหลือ' : 'ประชาชนแจ้งน้ำท่วม') + '</b> (ยังไม่ตรวจสอบ)<br><small>เขต' + esc(t.district) + ' · สถานะ ' + esc(t.state) + ' · ' + ago(t.at) + '<br>ที่มา Traffy Fondue</small>').addTo(rdLayer);
    });
    R.incidents.slice().reverse().forEach(i => {  // วาดระดับสูงทีหลังเพื่อให้อยู่ด้านบน
      const p = PASS[i.pass] || PASS.unk;
      L.marker([i.lat, i.lon], { icon: L.divIcon({ className: '', html: '<div class="st rd k' + p[1] + '">' + (i.pass === 'no' ? '✕' : i.pass === 'hard' ? '!' : '') + '</div>', iconSize: [22, 22] }), keyboard: false })
        .bindPopup('<b>' + esc(i.title) + '</b><br><span class="chip s' + p[1] + '">' + p[0] + '</span><br><small>' + (i.by === 'DOH' ? 'กรมทางหลวง' : 'ผู้ร่วมรายงาน iTIC/Longdo') + ' · ' + ago(i.at) + '<br>ที่มา Longdo Traffic</small>').addTo(rdLayer);
    });
  }

  function roadsHTML() {
    const R = FM.roads; if (!R) return '';
    const S = R.summary || {}, stale = Date.now() - Date.parse(R.updatedAt) > STALE_MS;
    let h = '<section class="sec"><h3>ถนนที่มีรายงานน้ำท่วม <small>(ไม่ใช่ความลึกน้ำ)</small></h3>';
    if (stale) h += '<div class="warnbox">ข้อมูลชุดนี้เก่ากว่า 3 ชั่วโมง (อัปเดต ' + ago(R.updatedAt) + ') อาจไม่ตรงกับสถานการณ์ปัจจุบัน</div>';
    h += '<p class="hl-text">ห้ามผ่าน <b>' + (S.blocked || 0) + '</b> จุด ควรเลี่ยง <b>' + (S.avoid || 0) + '</b> จุด ผ่านได้แต่มีน้ำท่วม <b>' + (S.passable || 0) + '</b> จุด ไม่ระบุการผ่าน <b>' + (S.unknown || 0) + '</b> จุด และประชาชนแจ้งผ่าน Traffy Fondue ใน 6 ชม.ล่าสุด <b>' + (S.reports || 0) + '</b> เรื่อง</p>';
    const top = R.incidents.filter(i => i.pass === 'no' || i.pass === 'hard').slice(0, 8);
    if (top.length) h += '<ul class="chg">' + top.map(i => '<li><span class="chip s' + PASS[i.pass][1] + '">' + PASS[i.pass][0] + '</span> ' + esc(i.title.replace(/\s*\((ผ่านไม่ได้|ผ่านได้)\)\s*$/, '')) + ' <small>' + ago(i.at) + '</small></li>').join('') + '</ul>';
    else h += '<p class="note">ตอนนี้ไม่มีจุดที่ระบุว่าห้ามผ่านหรือควรเลี่ยงในพื้นที่กรุงเทพฯ และปริมณฑล</p>';
    h += '<label class="note"><input type="checkbox" id="rdshow"' + (rdShown ? ' checked' : '') + '> แสดงจุดถนนท่วมบนแผนที่ (วงกลมเล็กสีเหลืองคือประชาชนแจ้ง ยังไม่ตรวจสอบ)</label>';
    h += '<p class="note">ที่มา: Longdo Traffic / iTIC / กรมทางหลวง (รายงานการผ่านของเส้นทาง) และ Traffy Fondue (เรื่องแจ้งจากประชาชน ยังไม่ผ่านการตรวจสอบ) ไม่ใช่ประกาศทางการ ถนนที่ไม่มีรายงานไม่ได้แปลว่าไม่ท่วม ให้ประเมินสภาพหน้างานอีกครั้ง</p></section>';
    return h;
  }

  function stationsHTML() {
    const O = FM.official; if (!O) return '';
    const S = O.summary || {}, stale = Date.now() - Date.parse(O.updatedAt) > STALE_MS;
    const bkk = S.bkkRainAvg == null ? null : rainLv(S.bkkRainAvg);
    const wet = O.water.filter(w => (w.overBank || -1) > 0).sort((a, b) => b.overBank - a.overBank);
    const near = O.water.filter(w => w.overBank != null && w.overBank <= 0 && w.overBank > -0.3).length;
    let h = '<section class="sec"><h3>ฝนและระดับน้ำจากสถานีทางการ <small>(ไม่ใช่ความลึกน้ำบนถนน)</small></h3>';
    if (stale) h += '<div class="warnbox">ข้อมูลชุดนี้เก่ากว่า 3 ชั่วโมง (อัปเดต ' + ago(O.updatedAt) + ') อาจไม่ตรงกับสถานการณ์ปัจจุบัน</div>';
    if (bkk) h += '<p class="hl-text">ฝนสะสม 24 ชม. เฉลี่ยในกรุงเทพฯ <b>' + S.bkkRainAvg + ' มม.</b> สูงสุด <b>' + S.bkkRainMax + ' มม.</b> อยู่ในเกณฑ์ <span class="chip s' + bkk[2] + '">' + bkk[1] + '</span></p>';
    h += '<p class="hl-text">ระดับน้ำในคลอง/แม่น้ำ: ล้นตลิ่ง <b>' + wet.length + '</b> สถานี ใกล้ตลิ่ง (ต่ำกว่าไม่เกิน 0.3 ม.) <b>' + near + '</b> สถานี จาก ' + O.water.length + ' สถานี</p>';
    if (wet.length) h += '<ul class="chg">' + wet.slice(0, 5).map(w => '<li>' + esc(w.name) + ' <small>(' + esc(w.province) + ')</small> ล้นตลิ่ง ' + w.overBank + ' ม.</li>').join('') + '</ul>';
    h += '<label class="note"><input type="checkbox" id="offshow"' + (stShown ? ' checked' : '') + '> แสดงสถานีวัดบนแผนที่</label>';
    h += '<p class="note">แหล่งข้อมูล: ThaiWater/สถาบันสารสนเทศทรัพยากรน้ำ รวมสถานีของ สสน. กรมชลประทาน กรมอุตุนิยมวิทยา และ กทม. ค่าฝนคือปริมาณสะสม ไม่ได้บอกว่าถนนสายใดท่วม</p></section>';
    return h;
  }

  function toggle(box, id, layer, draw, flagSet) {
    const cb = box.querySelector(id);
    if (!cb) return;
    cb.onchange = () => { flagSet(cb.checked); if (cb.checked) { draw(); layer.addTo(FM.map.map); } else FM.map.map.removeLayer(layer); };
  }

  function render() {
    const box = document.getElementById('ovoff');
    if (!box) return;
    box.innerHTML = roadsHTML() + stationsHTML();
    toggle(box, '#rdshow', rdLayer, drawRoads, v => { rdShown = v; });
    toggle(box, '#offshow', stLayer, drawStations, v => { stShown = v; });
  }

  async function grab(url) {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function loadOfficial() {
    if (!cfg.officialUrl) return;
    try {
      const O = await grab(cfg.officialUrl);
      if (!O || !Array.isArray(O.rain) || !Array.isArray(O.water)) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
      FM.official = O;
      if (stShown) drawStations();
    } catch (e) { FM.official = null; console.info('ไม่มีข้อมูลสถานีทางการ:', e.message); }
  }

  async function loadRoads() {
    if (!cfg.roadsUrl) return;
    try {
      const R = await grab(cfg.roadsUrl);
      if (!R || !Array.isArray(R.incidents) || !Array.isArray(R.reports)) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
      FM.roads = R;
      if (rdShown) drawRoads();
    } catch (e) { FM.roads = null; console.info('ไม่มีข้อมูลถนนท่วม:', e.message); }
  }

  async function loadAll() { await Promise.all([loadOfficial(), loadRoads()]); render(); }

  FM.on('overview', render);   // ภาพรวมถูกวาดใหม่ทุกครั้ง จึงต้องวาดส่วนนี้ตาม
  loadAll();
  setInterval(loadAll, (cfg.refreshSeconds || 120) * 1000);
})();
