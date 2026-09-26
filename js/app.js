/* หน้าจอหลัก: แท็บ ภาพรวม จุดท่วม จุดติดตาม ฟอร์ม และการเชื่อมทุกส่วน */
(function () {
  'use strict';
  const FM = window.FM, cfg = FM.cfg, esc = FM.esc, $ = FM.$, $$ = FM.$$;
  FM.baseTitle = document.title;

  const S = { pv: 'ทั้งหมด', q: '', sev: new Set([1, 2, 3]), mode: 'all', tab: 'overview' };
  const UI = (FM.ui = { sel: null });
  const PVS = ['ทั้งหมด', 'กทม.', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'สมุทรสาคร', 'นครปฐม'];
  const trendTxt = s => (s.d > 0 && !s.lv ? '<span>' + FM.TREND[s.trend] + '</span>' : '');

  UI.match = s => {
    if (S.pv !== 'ทั้งหมด' && s.pvs.indexOf(S.pv) < 0) return false;
    if (S.q && s.hay.indexOf(S.q) < 0) return false;
    return true;
  };
  UI.sevOn = sv => S.sev.has(sv);

  /* ---------- ธีม ---------- */
  const themes = ['auto', 'dark', 'light'], themeName = { auto: 'ตามอุปกรณ์', dark: 'มืด', light: 'สว่าง' };
  let theme = FM.store.get('fm:theme', 'auto');
  function applyTheme() {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    $('#theme').textContent = themeName[theme];
    $('#theme').setAttribute('aria-label', 'ธีมหน้าจอ ตอนนี้: ' + themeName[theme] + ' กดเพื่อเปลี่ยน');
  }
  $('#theme').onclick = () => { theme = themes[(themes.indexOf(theme) + 1) % 3]; FM.store.set('fm:theme', theme); applyTheme(); };
  applyTheme();

  /* ---------- แท็บ ---------- */
  const TABS = ['overview', 'list', 'route', 'watch'];
  function setTab(t) {
    if (S.tab === 'route' && t !== 'route') FM.route.hide();
    S.tab = t;
    TABS.forEach(k => { const on = k === t; $('#t-' + k).setAttribute('aria-selected', String(on)); $('#p-' + k).hidden = !on; });
    if (t === 'route') FM.route.show();
  }
  UI.setTab = setTab;
  TABS.forEach(k => { $('#t-' + k).onclick = () => setTab(k); });

  /* ---------- ส่วนหัว ---------- */
  function updateFresh() {
    const D = FM.data, el = $('#fresh');
    if (!D) { el.textContent = FM.dataError ? 'เชื่อมต่อข้อมูลไม่ได้' : 'กำลังโหลด…'; el.className = 'fresh bad'; return; }
    const ageMin = (Date.now() - D.meta.updatedAt) / 60000;
    const stale = ageMin > cfg.staleAfterMinutes;
    el.textContent = (FM.dataError ? 'เชื่อมต่อไม่ได้ ใช้ข้อมูลเดิม · ' : '') + 'อัปเดต ' + FM.ago(D.meta.updatedAt);
    el.className = 'fresh ' + (FM.dataError ? 'bad' : stale ? 'warn' : 'ok');
    el.title = stale ? 'ข้อมูลเก่ากว่า ' + cfg.staleAfterMinutes + ' นาที อาจไม่ตรงกับสถานการณ์ปัจจุบัน' : '';
    const b = $('#modebadge');
    b.hidden = !(D.meta.mode === 'sample');
    b.textContent = FM.demo ? 'โหมดสาธิต' : 'ข้อมูลตัวอย่าง';
    const pvBox = $('#pv'); if (pvBox) pvBox.style.display = D.meta.levelOnly ? 'none' : '';
    const stBox = $('#stats'); if (stBox) stBox.style.gridTemplateColumns = D.meta.levelOnly ? 'repeat(3,1fr)' : '';
  }
  setInterval(updateFresh, 30000);

  /* ---------- ตัวกรอง ---------- */
  function renderChips() {
    const box = $('#pv'); box.innerHTML = '';
    PVS.forEach(p => {
      const b = document.createElement('button');
      b.className = 'chip-b'; b.type = 'button'; b.textContent = p; b.setAttribute('aria-pressed', String(S.pv === p));
      b.onclick = () => { S.pv = p; renderAll(); fitFiltered(); };
      box.appendChild(b);
    });
  }
  function fitFiltered() {
    const D = FM.data; if (!D) return;
    if (S.pv === 'ทั้งหมด' && !S.q) { FM.map.fitAll(); return; }
    const m = D.segs.filter(UI.match);
    if (m.length) FM.map.fitSegs(m);
  }
  const qi = $('#q');
  qi.addEventListener('input', () => {
    S.q = qi.value.trim().toLowerCase().replace(/ถนน/g, 'ถ.');
    $('#searchbox').classList.toggle('has', !!qi.value);
    renderAll();
  });
  qi.addEventListener('keydown', ev => { if (ev.key === 'Enter') { if (S.q && FM.data && FM.data.segs.some(UI.match)) setTab('list'); fitFiltered(); qi.blur(); } });
  $('#qclear').onclick = () => { qi.value = ''; qi.dispatchEvent(new Event('input')); qi.focus(); fitFiltered(); };

  /* ---------- การ์ดสถิติ ---------- */
  function statCells(c, opt) {
    return SEVS().map(i => '<button class="stat" type="button" data-sv="' + i + '" style="--sc:var(--s' + i + ')" aria-pressed="' + (opt.toggle ? S.sev.has(i) : 'false') + '"><b>' + c[i] + '</b><span><i class="dot"></i>' + FM.SEV[i].t + '</span><small>' + FM.SEV[i].r + '</small></button>').join('');
  }
  const SEVS = () => (FM.data && FM.data.meta.levelOnly ? [1, 2, 3] : [0, 1, 2, 3]);
  function countAll(list) { const c = [0, 0, 0, 0]; list.forEach(s => c[s.sv]++); return c; }

  /* ---------- ภาพรวม ---------- */
  function renderOverview() {
    const D = FM.data, box = $('#ov');
    if (!D) { box.innerHTML = '<p class="note">' + (FM.dataError ? 'โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชหน้านี้' : 'กำลังโหลดข้อมูล…') + '</p>'; return; }
    const c = countAll(D.segs);
    const level = c[3] >= 3 ? 3 : (c[3] >= 1 || c[2] >= 3) ? 2 : (c[1] + c[2] + c[3]) > 0 ? 1 : 0;
    const LT = ['สถานการณ์ปกติ', 'เฝ้าระวัง', 'เฝ้าระวังสูง', 'น้ำท่วมรุนแรงหลายจุด'];
    let h = '<div class="headline lv' + level + '"><div class="hl-top"><span class="chip s' + level + '">' + LT[level] + '</span><span class="hl-time">อัปเดต ' + FM.ago(D.meta.updatedAt) + '</span></div>' +
      (D.meta.levelOnly ? '<p class="hl-text">ห้ามผ่าน <b>' + c[3] + '</b> จุด ควรเลี่ยง <b>' + c[2] + '</b> จุด ผ่านได้แต่มีน้ำท่วม <b>' + c[1] + '</b> จุด จากรายงานทั้งหมด ' + D.segs.length + ' จุด</p></div>' : '<p class="hl-text">ถนนห้ามผ่าน <b>' + c[3] + '</b> ช่วง ผ่านลำบาก <b>' + c[2] + '</b> ช่วง เฝ้าระวัง <b>' + c[1] + '</b> ช่วง จากที่ตรวจวัดทั้งหมด ' + D.segs.length + ' ช่วง</p></div>');
    if (D.meta.mode === 'sample') h += '<div class="warnbox sample"><b>' + (FM.demo ? 'โหมดสาธิต' : 'ข้อมูลตัวอย่าง') + '</b> ตัวเลขทั้งหมดเป็นข้อมูลสมมติสำหรับทดสอบแอป ไม่ใช่สถานการณ์จริง ' + (FM.demo ? 'ระดับน้ำจะขึ้นลงเองทุก 8 วินาทีเพื่อลองระบบแจ้งเตือน' : '') + '</div>';
    if (D.meta.levelOnly) h += '<div class="warnbox"><b>ข้อมูลจริงจากรายงานการผ่านของเส้นทาง</b> ระดับ ห้ามผ่าน/ควรเลี่ยง/ผ่านได้ มาจากผู้ร่วมรายงาน Longdo/iTIC และกรมทางหลวง ไม่ใช่ความลึกน้ำเป็น ซม. และไม่ใช่ประกาศทางการ ถนนที่ไม่มีรายงานไม่ได้แปลว่าไม่ท่วม</div>';
    h += '<div class="stats" id="ovstats"' + (D.meta.levelOnly ? ' style="grid-template-columns:repeat(3,1fr)"' : '') + '>' + statCells(c, { toggle: false }) + '</div>';
    h += '<div id="ovoff"></div>';

    /* เปลี่ยนแปลงจากครั้งก่อน */
    const ch = FM.changes;
    h += '<section class="sec"><h3>เปลี่ยนแปลงตั้งแต่คุณเปิดดูครั้งก่อน' + (ch && ch.since ? ' <small>(' + FM.ago(ch.since) + ')</small>' : '') + '</h3>';
    if (!ch || !ch.since) h += '<p class="note">เปิดครั้งแรกบนเครื่องนี้ จึงยังไม่มีข้อมูลเปรียบเทียบ ครั้งหน้าจะบอกว่าอะไรเปลี่ยนไป</p>';
    else {
      const rows = (D.meta.levelOnly ? [['newly', 'มีรายงานใหม่', 's2'], ['up', 'ระดับแย่ลง', 's3'], ['down', 'ระดับดีขึ้น', 's0'], ['cleared', 'รายงานหมดอายุ', 's0']] : [['newly', 'ท่วมใหม่', 's2'], ['up', 'น้ำเพิ่มขึ้น', 's3'], ['down', 'น้ำลดลง', 's0'], ['cleared', 'น้ำแห้งแล้ว', 's0']]).filter(r => ch[r[0]].length);
      if (!rows.length) h += '<p class="note">ไม่มีการเปลี่ยนแปลงที่มีนัยสำคัญ</p>';
      else h += '<ul class="chg">' + rows.map(r => '<li><span class="chip ' + r[2] + '">' + r[1] + ' ' + ch[r[0]].length + '</span> ' + ch[r[0]].slice(0, 3).map(s => '<button class="lnk" type="button" data-id="' + s.id + '">' + esc(s.road) + '</button>').join(' ') + (ch[r[0]].length > 3 ? ' และอีก ' + (ch[r[0]].length - 3) : '') + '</li>').join('') + '</ul>';
    }
    h += '</section>';

    /* กราฟรวม */
    const H = D.segs.filter(s => s.history.length > 1);
    if (H.length) {
      const len = Math.min(...H.map(s => s.history.length)), T = cfg.thresholds[0], ser = [];
      for (let i = 0; i < len; i++) ser.push(H.filter(s => s.history[s.history.length - len + i] >= T).length);
      h += '<section class="sec"><h3>จำนวนถนนที่น้ำท่วมขัง (≥ ' + T + ' ซม.) ย้อนหลัง</h3>' + FM.charts.line(ser, { stepMin: D.meta.step, unit: 'ช่วง', label: 'กราฟจำนวนถนนที่น้ำท่วมขังย้อนหลัง', height: 118 }) + '</section>';
    }

    /* แยกตามจังหวัด */
    h += '<section class="sec"><h3>แยกตามจังหวัด</h3><div class="pbars">';
    PVS.slice(1).forEach(p => {
      const list = D.segs.filter(s => s.pvs[0] === p); if (!list.length) return;
      const pc = countAll(list), wet = pc[1] + pc[2] + pc[3];
      h += '<button class="pbar" type="button" data-pv="' + esc(p) + '"><span class="pn">' + esc(p) + '</span><span class="bar" role="img" aria-label="' + esc(p) + ' ปกติ ' + pc[0] + ' เฝ้าระวัง ' + pc[1] + ' ผ่านลำบาก ' + pc[2] + ' ห้ามผ่าน ' + pc[3] + '">' +
        [3, 2, 1, 0].map(i => pc[i] ? '<i class="b' + i + '" style="flex:' + pc[i] + '"></i>' : '').join('') + '</span><span class="pc"><b>' + wet + '</b>/' + list.length + '</span></button>';
    });
    h += '</div><p class="note">ตัวเลขคือจำนวนช่วงถนนที่น้ำท่วมขังต่อช่วงที่ตรวจวัดในจังหวัดนั้น กดเพื่อดูบนแผนที่</p></section>';

    if (D.meta.levelOnly) h = h.replace(/<section class="sec"><h3>แยกตามจังหวัด<\/h3>[\s\S]*?<\/section>/, '');

    /* น้ำสูงสุด */
    const top = D.segs.slice().sort((a, b) => b.d - a.d).filter(s => s.d >= cfg.thresholds[0]).slice(0, 5);
    if (top.length) h += '<section class="sec"><h3>' + (D.meta.levelOnly ? 'จุดที่ควรระวังที่สุด' : 'จุดที่น้ำสูงที่สุด') + '</h3><div>' + top.map(s => itemHTML(s, false)).join('') + '</div></section>';

    /* แหล่งข้อมูล */
    h += '<section class="sec"><h3>แหล่งข้อมูล</h3>';
    if (D.meta.sources.length) {
      h += '<ul class="srcs">' + D.meta.sources.map(x => '<li><span>' + (x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.name) + '</a>' : esc(x.name)) + '</span><span class="chip ' + (x.status === 'ok' ? 's0' : x.status === 'sample' ? 's1' : 's3') + '">' + (x.status === 'ok' ? 'ปกติ' : x.status === 'sample' ? 'ตัวอย่าง' : x.status === 'stale' ? 'ข้อมูลเก่า' : 'ขัดข้อง') + '</span><small>' + (x.at ? FM.ago(x.at) : '') + '</small></li>').join('') + '</ul>';
    } else h += '<p class="note">ไฟล์ข้อมูลนี้ไม่ได้ระบุแหล่งที่มา</p>';
    if (D.meta.note) h += '<p class="note">' + esc(D.meta.note) + '</p>';
    h += '</section>';
    h += '<div class="src">ข้อมูลทางการและประกาศจากหน่วยงาน: ' + cfg.officialLinks.map(l => '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.name) + '</a>').join('') +
      '<p>แอปนี้แสดงข้อมูลเพื่อประกอบการตัดสินใจ ไม่ใช่ประกาศทางการ และอาจคลาดเคลื่อนจากสภาพจริง ถ้าต้องเดินทางในพื้นที่น้ำท่วม ให้ประเมินสภาพหน้างานอีกครั้ง</p></div>';
    box.innerHTML = h;
    if (FM.emit) FM.emit('overview');
    $$('#ovstats .stat', box).forEach(b => { b.onclick = () => { S.sev = new Set([+b.dataset.sv]); S.mode = 'all'; renderAll(); setTab('list'); }; });
    $$('.lnk', box).forEach(b => { b.onclick = () => UI.select({ type: 'seg', id: b.dataset.id }, { fly: true }); });
    $$('.pbar', box).forEach(b => { b.onclick = () => { S.pv = b.dataset.pv; renderAll(); fitFiltered(); setTab('list'); }; });
    bindItems(box);
  }

  /* ---------- รายการจุดท่วม ---------- */
  function passChips(d) {
    return Object.keys(FM.VEH).map(k => { const ok = d <= FM.VEH[k].max; return '<span class="' + (ok ? 'ok' : 'no') + '"><b>' + (ok ? '✓' : '✕') + '</b>' + FM.VEH[k].name + '</span>'; }).join('');
  }
  function itemHTML(s, pass) {
    if (s.lv) {
      return '<button class="item" type="button" data-id="' + s.id + '"><span class="it-main"><span class="it-road">' + esc(s.road) + '</span><span class="it-sec">รายงานผ่าน Longdo / iTIC / กรมทางหลวง</span></span>' +
        '<span class="it-depth"><strong>' + ({ no: '✕', hard: '!', yes: '✓' }[s.lv] || '?') + '</strong></span>' +
        '<span class="it-meta"><span class="chip s' + s.sv + '">' + FM.SEV[s.sv].t + '</span><span>' + FM.ago(s.updated) + '</span></span></button>';
    }
    const A = FM.data.nodes[s.a], B = FM.data.nodes[s.b];
    return '<button class="item" type="button" data-id="' + s.id + '"><span class="it-main"><span class="it-road">' + esc(s.road) + '</span><span class="it-sec">' + esc(A.name) + ' → ' + esc(B.name) + ' · ' + esc(A.province === B.province ? A.province : A.province + ' / ' + B.province) + '</span></span>' +
      '<span class="it-depth"><strong>' + s.d + '</strong><small>ซม.</small></span>' +
      '<span class="it-meta"><span class="chip s' + s.sv + '">' + FM.SEV[s.sv].t + '</span>' + trendTxt(s) + '<span>' + FM.ago(s.updated) + '</span></span>' +
      '<span class="it-spark">' + FM.charts.spark(s.history, { color: 'var(--s' + s.sv + ')', w: 70, h: 20 }) + '</span>' +
      (pass ? '<span class="pass">' + passChips(s.d) + '</span>' : '') + '</button>';
  }
  function bindItems(root) { $$('.item', root).forEach(b => { b.onclick = () => UI.select({ type: 'seg', id: b.dataset.id }, { fly: true }); }); }

  function renderList() {
    const D = FM.data; if (!D) return;
    const base = D.segs.filter(UI.match);
    $('#stats').innerHTML = statCells(countAll(base), { toggle: true });
    $$('#stats .stat').forEach(b => { b.onclick = () => { const i = +b.dataset.sv; S.sev.has(i) ? S.sev.delete(i) : S.sev.add(i); renderAll(); }; });
    const avoidN = base.filter(s => s.d >= cfg.thresholds[1]).length;
    $$('#modeseg button').forEach(b => {
      b.setAttribute('aria-pressed', String(S.mode === b.dataset.mode));
      if (b.dataset.mode === 'avoid') b.textContent = 'ควรเลี่ยง (' + avoidN + ')';
    });
    let items = base.filter(s => S.sev.has(s.sv));
    if (S.mode === 'avoid') items = items.filter(s => s.d >= cfg.thresholds[1]);
    items.sort((a, b) => b.d - a.d);
    const box = $('#list');
    if (!items.length) {
      box.innerHTML = '<div class="empty">ไม่พบจุดที่ตรงกับตัวกรอง<br><button class="btn" id="reset" type="button">ล้างตัวกรอง</button></div>';
      $('#reset').onclick = () => { S.pv = 'ทั้งหมด'; S.q = ''; qi.value = ''; $('#searchbox').classList.remove('has'); S.sev = new Set([1, 2, 3]); S.mode = 'all'; renderAll(); FM.map.fitAll(); };
      return;
    }
    box.innerHTML = items.map(s => itemHTML(s, S.mode === 'avoid')).join('');
    bindItems(box);
  }
  $$('#modeseg button').forEach(b => { b.onclick = () => { S.mode = b.dataset.mode; renderList(); }; });

  /* รายงานผู้ใช้ */
  function repItem(r) {
    const sv = FM.sevOf(r.depth), ok = r.c >= cfg.reportsConfirmNeeded;
    return '<button class="item rep-item" type="button" data-rid="' + esc(r.id) + '"><span class="it-main"><span class="it-road">' + (r.road ? esc(r.road) : 'ตำแหน่งที่ผู้ใช้ปักหมุด') + '</span><span class="it-sec">' + (r.note ? esc(r.note) : FM.fmtCoord(r.lat, r.lon)) + '</span></span>' +
      '<span class="it-depth"><strong>' + r.depth + '</strong><small>ซม.</small></span>' +
      '<span class="it-meta"><span class="chip s' + sv + '">' + FM.SEV[sv].t + '</span><span class="tag ' + (ok ? 'ok' : '') + '">' + (ok ? '✓ ยืนยันแล้ว' : 'ยังไม่ยืนยัน') + ' (' + r.c + ')</span><span>' + FM.ago(r.t) + '</span></span></button>';
  }
  function renderReports() {
    const box = $('#replist'), list = FM.reports.list.slice().sort((a, b) => b.t - a.t);
    $('#repnote').textContent = FM.reports.mode === 'server'
      ? 'รายงานจากผู้ใช้แสดงนาน ' + cfg.reportLifetimeHours + ' ชม. ยังไม่ใช่ข้อมูลทางการ'
      : 'ยังไม่ได้เชื่อมเซิร์ฟเวอร์รายงาน รายงานที่ส่งจะเห็นเฉพาะในเครื่องนี้';
    if (!list.length) { box.innerHTML = '<p class="note">ยังไม่มีรายงานจากผู้ใช้ในตอนนี้</p>'; return; }
    box.innerHTML = list.map(repItem).join('');
    $$('.rep-item', box).forEach(b => { b.onclick = () => UI.select({ type: 'rep', id: b.dataset.rid }, { fly: true }); });
  }

  /* ---------- รายละเอียด ---------- */
  UI.select = function (sel, o) {
    o = o || {};
    UI.sel = sel;
    renderDetail();
    FM.map.render(); FM.map.renderReports();
    if (sel) {
      setTab('list');
      $('#p-list').scrollTo({ top: 0, behavior: FM.reduceMotion ? 'auto' : 'smooth' });
      if (o.fly) {
        if (sel.type === 'seg') { const s = FM.data.byId[sel.id]; if (s) FM.map.fitSegs([s]); }
        else { const r = FM.reports.list.find(x => x.id === sel.id); if (r) FM.map.flyTo(r.lat, r.lon, Math.max(FM.map.zoomNow(), 15)); }
      }
    }
  };
  FM.select = UI.select;

  function srcName(id) { const x = FM.data.meta.sources.find(y => y.id === id); return x ? x.name : id; }
  function renderDetail() {
    const box = $('#detail'), sel = UI.sel;
    if (!sel || !FM.data) { box.innerHTML = ''; return; }
    let h = '';
    if (sel.type === 'seg') {
      const s = FM.data.byId[sel.id]; if (!s) { box.innerHTML = ''; return; }
      const A = FM.data.nodes[s.a], B = FM.data.nodes[s.b];
      const hl = Object.keys(FM.VEH).map(k => ({ v: FM.VEH[k].max, label: FM.VEH[k].name }));
      h = '<div class="detail"><button class="close" type="button" id="dclose" aria-label="ปิดรายละเอียด">×</button><h3>' + esc(s.road) + '</h3><div class="it-sec">' + (s.lv ? 'รายงานผ่าน Longdo / iTIC / กรมทางหลวง' : esc(A.name) + ' → ' + esc(B.name) + ' · ' + esc(A.province === B.province ? A.province : A.province + ' / ' + B.province)) + '</div>' +
        '<div class="row"><span class="big">' + (s.lv ? '' : s.d + '<small>ซม.</small>') + '</span><span class="chip s' + s.sv + '">' + FM.SEV[s.sv].t + '</span>' + trendTxt(s) + '<span>อัปเดต ' + FM.ago(s.updated) + '</span></div>' +
        (s.source ? '<div class="row">แหล่งข้อมูล: ' + esc(srcName(s.source)) + '</div>' : '') +
        (s.lv ? '<div class="row">ระดับนี้มาจากรายงานการผ่านของเส้นทาง ไม่ใช่ความลึกน้ำ ตำแหน่งเส้นเป็นค่าโดยประมาณจาก OpenStreetMap ควรประเมินสภาพหน้างานอีกครั้ง</div>' : s.sv === 0 ? '<div class="row">น้ำไม่ท่วมขัง รถทุกประเภทผ่านได้ตามปกติ</div>' : '<div class="pass">' + passChips(s.d) + '</div>') +
        (s.lv ? '' : '<h4>ระดับน้ำย้อนหลัง</h4>' + FM.charts.line(s.history, { stepMin: FM.data.meta.step, hlines: hl, unit: 'ซม.', color: 'var(--s' + Math.max(1, s.sv) + ')', label: 'กราฟระดับน้ำย้อนหลังของ ' + s.road })) +
        '<div class="actions">' + (s.lv ? '' : '<button class="btn primary" type="button" id="dwatch">ติดตามจุดนี้</button>') + '<a class="btn linkbtn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + s.mid.lat + ',' + s.mid.lon + '">เปิดใน Google Maps</a></div></div>';
      box.innerHTML = h;
      if ($('#dwatch')) $('#dwatch').onclick = () => openForm('watch', { name: s.road + ' ' + A.name, pos: { lat: s.mid.lat, lon: s.mid.lon }, radius: 1000, threshold: 10 });
    } else {
      const r = FM.reports.list.find(x => x.id === sel.id); if (!r) { box.innerHTML = ''; return; }
      const sv = FM.sevOf(r.depth), ok = r.c >= cfg.reportsConfirmNeeded, done = FM.reports.mine(r.id) || FM.reports.confirmedByMe(r.id);
      h = '<div class="detail rep"><button class="close" type="button" id="dclose" aria-label="ปิดรายละเอียด">×</button><h3>รายงานจากผู้ใช้' + (r.road ? ': ' + esc(r.road) : '') + '</h3>' +
        '<div class="row"><span class="big">' + r.depth + '<small>ซม.</small></span><span class="chip s' + sv + '">' + FM.SEV[sv].t + '</span><span class="tag ' + (ok ? 'ok' : '') + '">' + (ok ? '✓ ยืนยันแล้ว' : 'ยังไม่ยืนยัน') + ' (' + r.c + '/' + cfg.reportsConfirmNeeded + ')</span><span>รายงาน ' + FM.ago(r.t) + '</span></div>' +
        (r.note ? '<p class="repnote">“' + esc(r.note) + '”</p>' : '') +
        '<div class="row">พิกัด ' + FM.fmtCoord(r.lat, r.lon) + '</div>' +
        '<div class="pass">' + passChips(r.depth) + '</div>' +
        '<p class="note">ข้อมูลจากผู้ใช้ทั่วไป ยังไม่ได้ตรวจสอบโดยหน่วยงาน ถ้าคุณอยู่แถวนี้และเห็นว่าท่วมจริง กดยืนยันเพื่อช่วยให้คนอื่นเชื่อถือได้มากขึ้น</p>' +
        '<div class="actions"><button class="btn primary" type="button" id="dconfirm"' + (done ? ' disabled' : '') + '>' + (done ? 'คุณยืนยันแล้ว' : 'ยืนยันว่ายังท่วมอยู่') + '</button><a class="btn linkbtn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + r.lat + ',' + r.lon + '">เปิดใน Google Maps</a></div></div>';
      box.innerHTML = h;
      const cb = $('#dconfirm');
      cb.onclick = () => { cb.disabled = true; FM.reports.confirm(r.id).then(() => FM.toast('ขอบคุณที่ช่วยยืนยัน')).catch(e => { FM.toast(e.message, 'warn'); cb.disabled = false; }); };
    }
    $('#dclose').onclick = () => UI.select(null);
  }

  /* ---------- จุดติดตาม ---------- */
  function renderWatch() {
    const box = $('#watchbody'), items = FM.watch.items();
    if (FM.data && FM.data.meta.levelOnly) { box.innerHTML = '<div class="empty">ยังไม่รองรับการติดตามและแจ้งเตือนกับข้อมูลจริง<br><small>ข้อมูลจริงเป็นระดับการผ่านของเส้นทาง ไม่มีความลึกน้ำ จึงยังตั้งเกณฑ์แจ้งเตือนเป็น ซม. ไม่ได้ แผนที่และรายการจุดท่วมใช้งานได้ตามปกติ</small></div>'; return; }
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    let h = '<div class="notif">';
    if (perm === 'granted') h += '<p><span class="chip s0">เปิดแจ้งเตือนแล้ว</span> ระบบจะเด้งเตือนเมื่อน้ำใกล้จุดที่ติดตามสูงขึ้นถึงระดับที่ตั้งไว้ ขณะที่เปิดหน้านี้ค้างไว้ในเบราว์เซอร์ ยังไม่ส่งข้อความเมื่อปิดหน้าไปแล้ว</p>';
    else if (perm === 'denied') h += '<p><span class="chip s3">ถูกปิดไว้</span> เบราว์เซอร์บล็อกการแจ้งเตือนของเว็บนี้ เปิดใหม่ได้ที่การตั้งค่าเว็บไซต์ ระหว่างนี้จะยังเห็นข้อความเตือนในหน้านี้</p>';
    else if (perm === 'unsupported') h += '<p>เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนของเว็บ ยังเห็นข้อความเตือนในหน้านี้ตามปกติ</p>';
    else h += '<p>ให้เบราว์เซอร์เด้งเตือนเมื่อน้ำใกล้จุดที่ติดตามสูงขึ้น (ทำงานขณะเปิดหน้านี้ค้างไว้)</p><button class="btn" type="button" id="wperm">เปิดการแจ้งเตือน</button>';
    h += '</div><div class="actions"><button class="btn primary" type="button" id="wadd">+ เพิ่มจุดติดตาม</button></div>';
    if (!items.length) h += '<div class="empty">ยังไม่มีจุดติดตาม<br><small>เพิ่มบ้าน ที่ทำงาน หรือจุดที่ต้องผ่านบ่อย แล้วดูสถานะและรับเตือนได้ในที่เดียว</small></div>';
    items.forEach(w => {
      const st = FM.watch.status(w);
      const rad = w.radius >= 1000 ? (w.radius / 1000) + ' กม.' : w.radius + ' ม.';
      h += '<article class="wcard" id="wc-' + w.id + '"><header><b>' + esc(w.name) + '</b><span class="chip s' + st.level + '">' + FM.SEV[st.level].t + '</span></header>' +
        '<div class="wmain"><span class="wnum">' + st.maxD + '<small>ซม.</small></span><span class="wdesc">สูงสุดในรัศมี ' + rad + (st.rising ? '<br><b class="up">▲ มีช่วงที่น้ำกำลังเพิ่ม</b>' : '') + (st.maxD >= w.threshold ? '<br><b class="over">เกินระดับที่ตั้งเตือนไว้ (' + w.threshold + ' ซม.)</b>' : '') + '</span>' +
        (st.hist.length > 1 ? '<span class="wspark">' + FM.charts.spark(st.hist, { w: 110, h: 34, color: 'var(--s' + Math.max(1, st.level) + ')' }) + '</span>' : '') + '</div>' +
        (st.near.length ? '<ul class="wnear">' + st.near.slice(0, 3).map(n => '<li>' + esc(n.seg.road) + ' ช่วง' + esc(FM.data.nodes[n.seg.a].name) + '–' + esc(FM.data.nodes[n.seg.b].name) + ' <b>' + n.seg.d + ' ซม.</b> <small>ห่าง ' + (n.dist < 1000 ? Math.round(n.dist) + ' ม.' : (n.dist / 1000).toFixed(1) + ' กม.') + '</small></li>').join('') + '</ul>' : '<p class="note">ไม่มีช่วงถนนที่ตรวจวัดอยู่ในรัศมีนี้ ลองขยายรัศมี</p>') +
        (st.reps.length ? '<p class="note">ผู้ใช้รายงานในรัศมีนี้ ' + st.reps.length + ' จุด</p>' : '') +
        '<details><summary>ตั้งค่า</summary><div class="wset"><label>รัศมี<select data-w="' + w.id + '" data-k="radius">' + [500, 1000, 2000, 3000].map(v => '<option value="' + v + '"' + (v === w.radius ? ' selected' : '') + '>' + (v >= 1000 ? v / 1000 + ' กม.' : v + ' ม.') + '</option>').join('') + '</select></label>' +
        '<label>เตือนเมื่อสูงตั้งแต่<select data-w="' + w.id + '" data-k="threshold">' + [5, 10, 20, 30].map(v => '<option value="' + v + '"' + (v === w.threshold ? ' selected' : '') + '>' + v + ' ซม.</option>').join('') + '</select></label></div></details>' +
        '<div class="wact"><button class="btn" type="button" data-a="map" data-w="' + w.id + '">ดูบนแผนที่</button><button class="btn" type="button" data-a="from" data-w="' + w.id + '">เส้นทางจากที่นี่</button><button class="btn" type="button" data-a="to" data-w="' + w.id + '">เส้นทางมาที่นี่</button><button class="btn danger" type="button" data-a="del" data-w="' + w.id + '">ลบ</button></div></article>';
    });
    box.innerHTML = h;
    const pb = $('#wperm'); if (pb) pb.onclick = () => FM.watch.askPermission();
    $('#wadd').onclick = () => openForm('watch', { name: 'จุดติดตาม ' + (items.length + 1), pos: null, radius: 1000, threshold: 10 });
    $$('select[data-w]', box).forEach(sel => { sel.onchange = () => { FM.watch.update(sel.dataset.w, { [sel.dataset.k]: +sel.value }); FM.watch.check(true); }; });
    $$('button[data-a]', box).forEach(b => {
      b.onclick = () => {
        const w = FM.watch.get(b.dataset.w); if (!w) return;
        if (b.dataset.a === 'map') { FM.map.flyTo(w.lat, w.lon, 14); }
        else if (b.dataset.a === 'from') { FM.route.setEnds('w:' + w.id, null); setTab('route'); }
        else if (b.dataset.a === 'to') { FM.route.setEnds(null, 'w:' + w.id); setTab('route'); }
        else if (b.dataset.a === 'del') { FM.watch.remove(w.id); FM.toast('ลบจุดติดตามแล้ว'); }
      };
    });
  }
  UI.openWatch = function (id) {
    setTab('watch');
    const el = $('#wc-' + id);
    if (el) { el.scrollIntoView({ block: 'start', behavior: FM.reduceMotion ? 'auto' : 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
  };

  /* ---------- ฟอร์ม (จุดติดตาม / รายงานน้ำท่วม) ---------- */
  const dlg = $('#dlg'), dform = $('#dform');
  let FORM = null;
  const DEPTHS = [[0, 'น้ำแห้งแล้ว', 'ไม่มีน้ำขัง'], [10, 'ระดับข้อเท้า', '≈ 10 ซม.'], [25, 'ครึ่งน่อง', '≈ 25 ซม.'], [45, 'ระดับเข่า', '≈ 45 ซม.'], [70, 'เกินเข่า', '≈ 70 ซม.']];

  function posBlock(d) {
    const near = d.pos && FM.data ? FM.route.nearest(d.pos.lat, d.pos.lon) : null;
    return '<div class="posrow"><div><span class="legend">ตำแหน่ง</span><div class="posval" id="posval">' + (d.pos ? FM.fmtCoord(d.pos.lat, d.pos.lon) + (near ? ' <small>ใกล้' + esc(near.node.name) + '</small>' : '') : '<span class="warn-t">ยังไม่ได้เลือก</span>') + '</div></div>' +
      '<div class="posbtns"><button class="btn" type="button" id="fpick">เลือกบนแผนที่</button><button class="btn" type="button" id="fme">ใช้ตำแหน่งของฉัน</button></div></div>';
  }
  function openForm(kind, draft) {
    FORM = { kind, d: draft, err: '' };
    drawForm();
    if (!dlg.open) dlg.showModal();
  }
  function drawForm() {
    const d = FORM.d;
    let h = '<div class="dhead"><h2>' + (FORM.kind === 'report' ? 'รายงานน้ำท่วม' : 'เพิ่มจุดติดตาม') + '</h2><button class="close" type="button" id="fclose" aria-label="ปิด">×</button></div>';
    if (FORM.kind === 'watch') {
      h += '<label class="fld"><span class="legend">ชื่อจุด</span><input id="f-name" maxlength="40" value="' + esc(d.name) + '" autocomplete="off"></label>' + posBlock(d) +
        '<div class="two"><label class="fld"><span class="legend">รัศมีที่ดู</span><select id="f-rad">' + [500, 1000, 2000, 3000].map(v => '<option value="' + v + '"' + (v === d.radius ? ' selected' : '') + '>' + (v >= 1000 ? v / 1000 + ' กม.' : v + ' ม.') + '</option>').join('') + '</select></label>' +
        '<label class="fld"><span class="legend">เตือนเมื่อน้ำสูงตั้งแต่</span><select id="f-thr">' + [5, 10, 20, 30].map(v => '<option value="' + v + '"' + (v === d.threshold ? ' selected' : '') + '>' + v + ' ซม.</option>').join('') + '</select></label></div>' +
        '<p class="note">จุดติดตามเก็บไว้ในเครื่องนี้เท่านั้น ไม่ถูกส่งไปที่เซิร์ฟเวอร์</p>';
    } else {
      h += posBlock(d) + '<fieldset class="fld"><legend class="legend">น้ำสูงประมาณเท่าไร</legend><div class="depths">' +
        DEPTHS.map(x => '<label><input type="radio" name="fdepth" value="' + x[0] + '"' + (d.depth === x[0] ? ' checked' : '') + '><span><b>' + x[1] + '</b><small>' + x[2] + '</small></span></label>').join('') + '</div></fieldset>' +
        '<label class="fld"><span class="legend">ถนนหรือจุดสังเกต (ไม่บังคับ)</span><input id="f-road" maxlength="60" value="' + esc(d.road || '') + '" placeholder="เช่น หน้าปั๊ม ปากซอยสุขุมวิท 71" autocomplete="off"></label>' +
        '<label class="fld"><span class="legend">รายละเอียดเพิ่มเติม (ไม่บังคับ)</span><textarea id="f-note" maxlength="120" rows="2" placeholder="เช่น รถเล็กผ่านไม่ได้ น้ำยังไหลแรง">' + esc(d.note || '') + '</textarea></label>' +
        '<p class="note">' + (FM.reports.mode === 'server' ? 'รายงานจะแสดงให้ทุกคนเห็นนาน ' + cfg.reportLifetimeHours + ' ชม. และยังไม่ใช่ข้อมูลทางการ อย่าใส่ข้อมูลส่วนตัว' : 'ตอนนี้ยังไม่ได้เชื่อมเซิร์ฟเวอร์ รายงานที่ส่งจะเห็นเฉพาะในเครื่องนี้') + '</p>';
    }
    h += '<p class="form-err" id="ferr" role="alert">' + esc(FORM.err) + '</p><div class="dfoot"><button class="btn" type="button" id="fcancel">ยกเลิก</button><button class="btn primary" type="submit" id="fsave">' + (FORM.kind === 'report' ? 'ส่งรายงาน' : 'บันทึก') + '</button></div>';
    dform.innerHTML = h;
    $('#fclose').onclick = $('#fcancel').onclick = () => { dlg.close(); FORM = null; };
    $('#fpick').onclick = () => {
      dlg.close();
      FM.map.picking = null;
      FM.map.pick(FORM.kind === 'report' ? 'แตะตำแหน่งที่น้ำท่วมบนแผนที่' : 'แตะตำแหน่งที่ต้องการติดตามบนแผนที่', pos => { FORM.d.pos = pos; drawForm(); dlg.showModal(); });
      FM.map.picking.cancel = () => { drawForm(); dlg.showModal(); };
    };
    $('#fme').onclick = () => { FM.map.locate().then(me => { if (!FM.inBounds(me.lat, me.lon)) { FORM.err = 'ตำแหน่งของคุณอยู่นอกพื้นที่ที่แอปครอบคลุม'; } else { FORM.d.pos = { lat: me.lat, lon: me.lon }; FORM.err = ''; } drawForm(); }).catch(e => { FORM.err = e.message; drawForm(); }); };
  }
  dform.addEventListener('input', ev => {
    if (!FORM) return;
    const d = FORM.d, id = ev.target.id;
    if (id === 'f-name') d.name = ev.target.value;
    else if (id === 'f-rad') d.radius = +ev.target.value;
    else if (id === 'f-thr') d.threshold = +ev.target.value;
    else if (id === 'f-road') d.road = ev.target.value;
    else if (id === 'f-note') d.note = ev.target.value;
    else if (ev.target.name === 'fdepth') d.depth = +ev.target.value;
  });
  dform.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!FORM) return;
    const d = FORM.d, err = m => { FORM.err = m; $('#ferr').textContent = m; };
    if (!d.pos) return err('เลือกตำแหน่งก่อน');
    if (!FM.inBounds(d.pos.lat, d.pos.lon)) return err('ตำแหน่งอยู่นอกพื้นที่กรุงเทพฯ และปริมณฑล');
    if (FORM.kind === 'watch') {
      const w = FM.watch.add({ name: (d.name || '').trim() || 'จุดติดตาม', lat: d.pos.lat, lon: d.pos.lon, radius: d.radius, threshold: d.threshold });
      FM.watch.check(true);
      dlg.close(); FORM = null;
      FM.toast('เพิ่มจุดติดตามแล้ว');
      UI.openWatch(w.id);
    } else {
      if (d.depth == null) return err('เลือกระดับน้ำก่อน');
      const btn = $('#fsave'); btn.disabled = true; btn.textContent = 'กำลังส่ง…';
      try {
        await FM.reports.submit({ lat: +d.pos.lat.toFixed(5), lon: +d.pos.lon.toFixed(5), depth: d.depth, road: (d.road || '').trim(), note: (d.note || '').trim() });
        dlg.close(); FORM = null;
        FM.toast('ส่งรายงานแล้ว ขอบคุณที่ช่วยแจ้ง');
      } catch (e) { btn.disabled = false; btn.textContent = 'ส่งรายงาน'; err(e.message); }
    }
  });
  dlg.addEventListener('click', ev => { if (ev.target === dlg) { dlg.close(); FORM = null; } });
  $('#fab-report').onclick = () => openForm('report', { pos: null, depth: null, road: '', note: '' });

  /* ---------- เชื่อมทุกส่วน ---------- */
  function renderAll() {
    renderChips(); renderList();
    if (FM.data) { FM.map.render(); }
  }
  FM.on('data', ev => {
    updateFresh();
    if (!FM.data) { renderOverview(); return; }
    if (UI.sel && UI.sel.type === 'seg' && !FM.data.byId[UI.sel.id]) UI.sel = null;
    renderAll(); renderOverview(); renderDetail(); renderReports(); renderWatch();
    FM.map.renderReports(); FM.map.renderWatch();
    FM.watch.check(ev.first);
    if (ev.first) FM.map.fitAll();
  });
  FM.on('reports', ev => {
    renderReports(); FM.map.renderReports(); renderDetail(); renderWatch(); FM.map.renderWatch();
    FM.watch.check(!!(ev && (ev.initial || ev.self)));
  });
  FM.on('watch', () => { renderWatch(); FM.map.renderWatch(); });
  FM.on('alerts', n => {
    const t = $('#t-watch'); t.classList.toggle('alert', n > 0);
    t.textContent = n > 0 ? 'ติดตาม (' + n + ')' : 'ติดตาม';
  });

  renderChips();
  setTab('overview');
  renderOverview();
  FM.reports.load();
  FM.startPolling();
})();
