/* ตั้งค่าแอป แก้ไขไฟล์นี้ไฟล์เดียวเมื่อย้ายไปโฮสต์ของตัวเอง */
window.FLOOD_CONFIG = {
  /* ไฟล์ข้อมูลน้ำท่วม (รูปแบบดู README) ใส่ URL เต็มได้ เช่น ไฟล์ในบรานช์ data ของ GitHub */
  dataUrl: 'data/flood.json',
  refreshSeconds: 120,          // ดึงข้อมูลใหม่ทุกกี่วินาที
  staleAfterMinutes: 120,       // ข้อมูลเก่ากว่านี้ถือว่าไม่ทันสมัย

  /* ระบบรายงานจากผู้ใช้ ชี้ไปที่ API ของ functions/api ใส่ '' เพื่อปิดการแชร์ (จะเก็บเฉพาะในเครื่อง) */
  reportsApi: '/api/reports',
  reportLifetimeHours: 6,       // ต้องตรงกับ REPORT_TTL_HOURS ฝั่งเซิร์ฟเวอร์
  reportsConfirmNeeded: 2,      // จำนวนคนที่ต้องยืนยันก่อนขึ้นสถานะ "ยืนยันแล้ว"

  /* แผนที่พื้นหลัง
     ค่าเริ่มต้นเป็นไทล์ของ OpenStreetMap ซึ่งมีข้อกำหนดการใช้งานที่ไม่รองรับผู้ใช้จำนวนมาก
     ถ้าเปิดให้คนทั่วไปใช้ ควรเปลี่ยนเป็นผู้ให้บริการไทล์ที่มีสัญญา เช่น MapTiler, Stadia, Thunderforest */
  tiles: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; ผู้ร่วมจัดทำ <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    maxZoom: 19
  },
  center: [13.80, 100.55],
  zoom: 10,
  /* ขอบเขตที่ระบบรายงานยอมรับ (ใต้ซ้าย, บนขวา) */
  bounds: { south: 13.3, north: 14.3, west: 100.0, east: 101.1 },

  /* เกณฑ์ระดับน้ำ (ซม.) ปกติ < a, เฝ้าระวัง < b, ผ่านลำบาก < c, ห้ามผ่าน >= c */
  thresholds: [5, 15, 30],
  vehicles: {
    bike:  { name: 'มอเตอร์ไซค์',   max: 10 },
    sedan: { name: 'รถเก๋ง',        max: 20 },
    suv:   { name: 'กระบะ / SUV',   max: 35 }
  },

  /* ลิงก์แหล่งข้อมูลทางการที่แสดงท้ายหน้า */
  officialLinks: [
    { name: 'สำนักการระบายน้ำ กทม.', url: 'https://weather.bangkok.go.th/' },
    { name: 'ThaiWater', url: 'https://www.thaiwater.net/' },
    { name: 'GISTDA', url: 'https://www.gistda.or.th/' }
  ]
};
