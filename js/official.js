/* สถานีวัดฝนและระดับน้ำทางการ (ThaiWater/สสน. ผ่านไฟล์ data/official.json) แสดงเป็นส่วนเสริม
   ไม่ใช่ความลึกน้ำท่วมบนถนน ถ้าไม่มีไฟล์นี้ แอปจะทำงานตามปกติโดยไม่แสดงส่วนนี้ */
(function () {
  'use strict';
  const FM = window.FM, cfg = FM.cfg, esc = FM.esc;
  FM.official = null;
  const url = cfg.officialUrl;
  if (!url) return;
  const layer = L.layerGroup();
  let shown = false;

  /* เกณฑ์ฝนสะสม 24 ชม. ตามการจัดระดับของกรมอุตุนิยมวิทยา (มม.) */
  const RAIN = [[90, 'หนักมาก', 3], [35, 'หนัก', 2], [10, 'ปานกลาง', 1], [0, 'เล็กน้อย', 0]];
  const rainLv = v => RAIN.find(r => v >= r[0]);
  const STALE_MS = 3 * 3600 * 1000;

  function drawMap() {
    layer.clearLayers();
    const O = FM.official; if (!O) return;
    O.rain.forEach(r => {
      const lv = rainLv(r.rain24h);
      L.marker([r.lat, r.lon], { icon: L.divIcon({ className: '', html: '<div class="st rain s' + lv[2] + '">' + Math.round(r.rain24h) + '</div>', iconSize: [30, 20] }), keyboard: false })
        .bindPopup('<b>' + esc(r.name) + '</b><br>ฝนสะสม 24 ชม. ' + r.rain24h + ' มม. (' + lv[1] + ')<br><small>' + esc(r.province) + ' · ' + esc(r.agency) + ' · ' + FM.ago(Date.parse(r.at)) + '</small>').addTo(layer);
    });
    O.water.forEach(w => {
      const over = (w.overBank || -1) > 0;
      L.marker([w.lat, w.lon], { icon: L.divIcon({ className: '', html: '<div class="st wl' + (over ? ' over' : '') + '">' + (over ? '▲' : '≈') + '</div>', iconSize: [22, 22] }), keyboard: false })
        .bindPopup('<b>' + esc(w.name) + '</b><br>' + (w.overBank == null ? 'ไม่ทราบระดับตลิ่ง' : over ? 'ล้นตลิ่ง ' + w.overBank + ' ม.' : 'ต่ำกว่าตลิ่ง ' + Math.abs(w.overBank) + ' ม.') + (w.change ? '<br>เทียบรอบก่อน ' + (w.change > 0 ? '+' : '') + w.change + ' ม.' : '') + '<br><small>' + esc(w.province) + ' · ' + esc(w.agency) + ' · ' + FM.ago(Date.parse(w.at)) + '</small>').addTo(layer);
    });
  }

  function render() {
    const box = document.getElementById('ovoff'), O = FM.official;
    if (!box || !O) return;
    const age = Date.now() - Date.parse(O.updatedAt), S = O.summary || {};
    const stale = age > STALE_MS;
    const bkk = S.bkkRainAvg == null ? null : rainLv(S.bkkRainAvg);
    const wet = O.water.filter(w => (w.overBank || -1) > 0).sort((a, b) => b.overBank - a.overBank);
    const near = O.water.filter(w => w.overBank != null && w.overBank <= 0 && w.overBank > -0.3).length;
    let h = '<section class="sec"><h3>ฝนและระดับน้ำจากสถานีทางการ <small>(ไม่ใช่ความลึกน้ำบนถนน)</small></h3>';
    if (stale) h += '<div class="warnbox">ข้อมูลชุดนี้เก่ากว่า 3 ชั่วโมง (อัปเดต ' + FM.ago(Date.parse(O.updatedAt)) + ') อาจไม่ตรงกับสถานการณ์ปัจจุบัน</div>';
    if (bkk) h += '<p class="hl-text">ฝนสะสม 24 ชม. เฉลี่ยในกรุงเทพฯ <b>' + S.bkkRainAvg + ' มม.</b> สูงสุด <b>' + S.bkkRainMax + ' มม.</b> อยู่ในเกณฑ์ <span class="chip s' + bkk[2] + '">' + bkk[1] + '</span></p>';
    h += '<p class="hl-text">ระดับน้ำในคลอง/แม่น้ำ: ล้นตลิ่ง <b>' + wet.length + '</b> สถานี ใกล้ตลิ่ง (ต่ำกว่าไม่เกิน 0.3 ม.) <b>' + near + '</b> สถานี จาก ' + O.water.length + ' สถานี</p>';
    if (wet.length) h += '<ul class="chg">' + wet.slice(0, 5).map(w => '<li>' + esc(w.name) + ' <small>(' + esc(w.province) + ')</small> ล้นตลิ่ง ' + w.overBank + ' ม.</li>').join('') + '</ul>';
    h += '<label class="note"><input type="checkbox" id="offshow"' + (shown ? ' checked' : '') + '> แสดงสถานีวัดบนแผนที่</label>';
    h += '<p class="note">แหล่งข้อมูล: ThaiWater/สถาบันสารสนเทศทรัพยากรน้ำ รวมสถานีของ สสน. กรมชลประทาน กรมอุตุนิยมวิทยา และ กทม. ค่าฝนคือปริมาณสะสม ไม่ได้บอกว่าถนนสายใดท่วม</p></section>';
    box.innerHTML = h;
    const cb = box.querySelector('#offshow');
    cb.onchange = () => { shown = cb.checked; if (shown) { drawMap(); layer.addTo(FM.map.map); } else FM.map.map.removeLayer(layer); };
  }

  async function load() {
    try {
      const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const O = await r.json();
      if (!O || !Array.isArray(O.rain) || !Array.isArray(O.water)) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
      FM.official = O;
      if (shown) drawMap();
      render();
    } catch (e) { FM.official = null; console.info('ไม่มีข้อมูลสถานีทางการ:', e.message); }
  }
  FM.on('overview', render);   // ภาพรวมถูกวาดใหม่ทุกครั้ง จึงต้องวาดส่วนนี้ตาม
  load();
  setInterval(load, (cfg.refreshSeconds || 120) * 1000);
})();
