/* กราฟ SVG ขนาดเล็ก ใช้สีจากตัวแปรธีมของหน้า */
(function () {
  'use strict';
  const FM = window.FM;

  FM.charts = {
    spark(vals, o) {
      o = o || {};
      if (!vals || vals.length < 2) return '';
      const w = o.w || 64, h = o.h || 22, col = o.color || 'var(--ink2)';
      const mx = Math.max(10, ...vals);
      const pts = vals.map((v, i) => [2 + i / (vals.length - 1) * (w - 4), h - 2 - (v / mx) * (h - 4)]);
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
      const last = pts[pts.length - 1];
      return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">' +
        '<path d="' + d + 'L' + (w - 2) + ' ' + (h - 2) + 'L2 ' + (h - 2) + 'Z" fill="' + col + '" opacity=".16"/>' +
        '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="2.3" fill="' + col + '"/></svg>';
    },

    /* กราฟเส้นพร้อมแกนและเส้นอ้างอิง
       o: stepMin, color, hlines:[{v,label}], unit, label (คำอธิบายสำหรับผู้ใช้โปรแกรมอ่านหน้าจอ) */
    line(vals, o) {
      o = o || {};
      if (!vals || vals.length < 2) return '<p class="note">ยังไม่มีประวัติย้อนหลังพอสำหรับวาดกราฟ</p>';
      const W = 320, H = o.height || 132, ml = 30, mr = 10, mt = 14, mb = 22;
      const col = o.color || 'var(--accent)';
      const hl = o.hlines || [];
      const rawMax = Math.max(...vals, ...hl.map(x => x.v), 10) * 1.12;
      const nice = [10, 20, 40, 60, 80, 100, 150, 200, 300, 500, 1000];
      const ymax = nice.find(v => v >= rawMax) || Math.ceil(rawMax / 100) * 100;
      const X = i => ml + i / (vals.length - 1) * (W - ml - mr);
      const Y = v => mt + (1 - v / ymax) * (H - mt - mb);
      const d = vals.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join('');
      const step = o.stepMin || 30;
      const spanH = (vals.length - 1) * step / 60;
      const fmtH = h => (h >= 1 ? Math.round(h) + ' ชม.' : Math.round(h * 60) + ' น.');
      let g = '';
      [0, ymax / 2, ymax].forEach(v => {
        g += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="var(--line)" stroke-width="1"/>' +
          '<text x="' + (ml - 5) + '" y="' + (Y(v) + 3.5).toFixed(1) + '" text-anchor="end" font-size="10" fill="var(--ink2)">' + Math.round(v) + '</text>';
      });
      hl.forEach(x => {
        if (x.v > ymax) return;
        g += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(x.v).toFixed(1) + '" y2="' + Y(x.v).toFixed(1) + '" stroke="var(--ink2)" stroke-width="1" stroke-dasharray="3 4" opacity=".8"/>' +
          '<text x="' + (W - mr - 2) + '" y="' + (Y(x.v) - 3).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="var(--ink2)">' + x.label + '</text>';
      });
      const xl = [[0, 'start', '-' + fmtH(spanH)], [(vals.length - 1) / 2, 'middle', '-' + fmtH(spanH / 2)], [vals.length - 1, 'end', 'ตอนนี้']];
      xl.forEach(a => { g += '<text x="' + X(a[0]).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + a[1] + '" font-size="10" fill="var(--ink2)">' + a[2] + '</text>'; });
      const lx = X(vals.length - 1), ly = Y(vals[vals.length - 1]);
      const lastLabelY = ly < mt + 10 ? ly + 14 : ly - 6;
      return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + FM.esc(o.label || 'กราฟย้อนหลัง') + '">' + g +
        '<path d="' + d + 'L' + lx.toFixed(1) + ' ' + Y(0).toFixed(1) + 'L' + ml + ' ' + Y(0).toFixed(1) + 'Z" fill="' + col + '" opacity=".14"/>' +
        '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<circle cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="3.6" fill="' + col + '" stroke="var(--panel)" stroke-width="1.5"/>' +
        '<text x="' + (lx - 6).toFixed(1) + '" y="' + lastLabelY.toFixed(1) + '" text-anchor="end" font-size="11" font-weight="600" fill="var(--ink)">' + vals[vals.length - 1] + (o.unit ? ' ' + o.unit : '') + '</text></svg>';
    }
  };
})();
