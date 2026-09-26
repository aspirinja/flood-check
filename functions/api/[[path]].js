/**
 * API รายงานน้ำท่วมจากผู้ใช้ สำหรับ Cloudflare Pages Functions
 *
 *   GET  /api/reports               รายการรายงานที่ยังไม่หมดอายุ
 *   POST /api/reports               ส่งรายงานใหม่  { lat, lon, depth, road?, note? }
 *   POST /api/reports/:id/confirm   ยืนยันรายงาน (1 คนต่อ 1 รายงาน)
 *
 * ต้องผูก KV namespace ชื่อ REPORTS กับโปรเจกต์ (ดู README)
 * ตัวแปรเสริม: REPORT_TTL_HOURS (ค่าเริ่มต้น 6), SALT (ข้อความสุ่มสำหรับแฮช IP)
 *
 * รายงานเก็บใน metadata ของ KV (ไม่เกิน 1 KB ต่อรายการ) จึงอ่านทั้งรายการได้ในการ list ครั้งเดียว
 * การป้องกันการใช้ในทางที่ผิดเป็นแบบพื้นฐาน: จำกัดจำนวนครั้งต่อ IP, ตรวจขอบเขตพิกัด, ตัดความยาวข้อความ
 * ถ้าเปิดให้คนทั่วไปใช้จริง ควรเพิ่ม Cloudflare Turnstile และหน้าคัดกรองรายงาน
 */

const BOUNDS = { south: 13.3, north: 14.3, west: 100.0, east: 101.1 };
const MAX_ACTIVE = 500;         // จำนวนรายงานที่แสดงพร้อมกันสูงสุด
const RATE_LIMIT = 6;           // ส่งได้กี่ครั้ง
const RATE_WINDOW_SEC = 600;    // ต่อกี่วินาที
const MAX_TEXT = { road: 60, note: 120 };

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });

const clean = (v, max) =>
  String(v == null ? '' : v)
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function limited(env, ip, action, limit, windowSec) {
  const key = `rl:${action}:${await sha((env.SALT || '') + ip)}`;
  const cur = parseInt((await env.REPORTS.get(key)) || '0', 10);
  if (cur >= limit) return true;
  await env.REPORTS.put(key, String(cur + 1), { expirationTtl: Math.max(60, windowSec) });
  return false;
}

async function listReports(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.REPORTS.list({ prefix: 'r:', cursor, limit: 1000 });
    for (const k of page.keys) if (k.metadata) out.push(k.metadata);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor && out.length < MAX_ACTIVE * 2);
  return out.sort((a, b) => b.t - a.t).slice(0, MAX_ACTIVE);
}

export async function onRequest({ request, env }) {
  if (!env.REPORTS) return json({ error: 'ยังไม่ได้ผูก KV namespace ชื่อ REPORTS กับโปรเจกต์' }, 501);

  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const ttlSec = Math.round(parseFloat(env.REPORT_TTL_HOURS || '6') * 3600);
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';

  if (parts[0] !== 'reports') return json({ error: 'ไม่พบ endpoint นี้' }, 404);

  /* รายการ */
  if (parts.length === 1 && request.method === 'GET') {
    return json({ reports: await listReports(env) }, 200, { 'Cache-Control': 'public, max-age=20' });
  }

  /* ส่งรายงานใหม่ */
  if (parts.length === 1 && request.method === 'POST') {
    if (await limited(env, ip, 'post', RATE_LIMIT, RATE_WINDOW_SEC)) {
      return json({ error: 'ส่งรายงานถี่เกินไป รอสักครู่แล้วลองใหม่' }, 429);
    }
    let body;
    try { body = await request.json(); } catch { return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400); }
    const lat = Number(body.lat), lon = Number(body.lon), depth = Math.round(Number(body.depth));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < BOUNDS.south || lat > BOUNDS.north || lon < BOUNDS.west || lon > BOUNDS.east) {
      return json({ error: 'ตำแหน่งอยู่นอกพื้นที่กรุงเทพฯ และปริมณฑล' }, 400);
    }
    if (!Number.isFinite(depth) || depth < 0 || depth > 150) return json({ error: 'ระดับน้ำไม่ถูกต้อง' }, 400);

    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const now = Date.now();
    const report = {
      id,
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      depth,
      road: clean(body.road, MAX_TEXT.road),
      note: clean(body.note, MAX_TEXT.note),
      t: now,
      c: 0,
    };
    await env.REPORTS.put(`r:${id}`, '1', { metadata: report, expirationTtl: ttlSec });
    return json({ report }, 201);
  }

  /* ยืนยันรายงาน */
  if (parts.length === 3 && parts[2] === 'confirm' && request.method === 'POST') {
    const id = parts[1].replace(/[^a-z0-9]/gi, '').slice(0, 24);
    if (await limited(env, ip, 'confirm', 30, 600)) return json({ error: 'ยืนยันถี่เกินไป รอสักครู่แล้วลองใหม่' }, 429);
    const cur = await env.REPORTS.getWithMetadata(`r:${id}`);
    if (!cur || !cur.metadata) return json({ error: 'ไม่พบรายงานนี้ หรือหมดอายุแล้ว' }, 404);
    const mark = `c:${id}:${await sha((env.SALT || '') + ip)}`;
    if (await env.REPORTS.get(mark)) return json({ error: 'คุณยืนยันรายงานนี้ไปแล้ว' }, 409);
    const report = { ...cur.metadata, c: (cur.metadata.c || 0) + 1 };
    const expiration = Math.floor((report.t + ttlSec * 1000) / 1000);
    if (expiration <= Math.floor(Date.now() / 1000) + 60) return json({ error: 'รายงานนี้ใกล้หมดอายุแล้ว' }, 410);
    await env.REPORTS.put(`r:${id}`, '1', { metadata: report, expiration });
    await env.REPORTS.put(mark, '1', { expiration });
    return json({ report });
  }

  return json({ error: 'วิธีเรียกใช้ไม่ถูกต้อง' }, 405);
}
