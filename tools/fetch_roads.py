#!/usr/bin/env python3
"""ดึงข้อมูลน้ำท่วมบนถนนจาก 2 แหล่งสาธารณะ แล้วเขียน data/roads.json

  1. Longdo Traffic / iTIC (traffic.longdo.com/incident.json) เหตุการณ์น้ำท่วมจากกรมทางหลวงและผู้ร่วมรายงาน
     มีชื่อถนน พิกัด ช่วงเวลา และข้อความสถานะการผ่าน เช่น (ผ่านได้) (ผ่านไม่ได้)
  2. Traffy Fondue (publicapi.traffy.in.th) เรื่องร้องเรียนของประชาชนที่เกี่ยวกับน้ำท่วม ยังไม่ผ่านการตรวจสอบ

ข้อควรรู้
  - ไม่มีความลึกน้ำเป็นเซนติเมตร แอปจึงแสดงเป็นระดับ ห้ามผ่าน / ควรเลี่ยง / ผ่านได้ / ไม่ระบุ
  - ทั้งสองเป็นไฟล์ที่เว็บของเจ้าของข้อมูลใช้เอง ไม่ใช่ API ที่ประกาศรับรอง อาจเปลี่ยนรูปแบบโดยไม่แจ้ง
  - ต้องให้เครดิต Longdo/iTIC/กรมทางหลวง และ Traffy Fondue ทุกครั้งที่แสดงข้อมูล
  - ไม่เก็บข้อความ รูปภาพ หรือชื่อผู้รายงาน เก็บเฉพาะตำแหน่ง เวลา และสถานะ
ตัวแปรสภาพแวดล้อม  ROADS_FIXTURE_DIR = โฟลเดอร์ไฟล์ตัวอย่างสำหรับทดสอบ (incident.json, traffy_geojson.json)
"""
import gzip
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "roads.json"
FIXTURE = os.getenv("ROADS_FIXTURE_DIR", "")
TZ = timezone(timedelta(hours=7))          # เวลาในข้อมูลเป็นเวลาไทย
BOUNDS = (13.3, 14.3, 100.0, 101.1)        # ใต้, เหนือ, ตะวันตก, ตะวันออก (ให้ตรงกับ bounds ใน js/config.js)
LONGDO_URL = "https://traffic.longdo.com/incident.json"
TRAFFY_URL = "https://publicapi.traffy.in.th/teamchadchart-stat-api/geojson/v2"
LONGDO_MAX_AGE_H = 48                      # เหตุการณ์ที่สร้างนานกว่านี้ไม่นับ
TRAFFY_MAX_AGE_H = 6                       # เรื่องร้องเรียนที่เก่ากว่านี้ไม่นับ


def get_json(url, label, fixture_name):
    if FIXTURE:
        return json.loads((Path(FIXTURE) / fixture_name).read_text(encoding="utf-8"))
    last = None
    for attempt in (1, 2):   # ลองสูงสุด 2 ครั้ง และจำกัดเวลาทุกขั้นตอน เพื่อไม่ให้ค้าง
        t0 = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "flood-check/1.0", "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=20) as r:
                print(f"{label}: เชื่อมต่อได้ HTTP {r.status} ใน {time.time() - t0:.1f} วินาที", flush=True)
                gz = (r.headers.get("Content-Encoding") or "").lower() == "gzip"
                buf = bytearray()
                while True:
                    chunk = r.read(65536)
                    if not chunk:
                        break
                    buf += chunk
                    if time.time() - t0 > 90:
                        raise TimeoutError("อ่านข้อมูลนานเกิน 90 วินาที")
            print(f"{label}: ได้ {len(buf) / 1e6:.1f} MB ใน {time.time() - t0:.1f} วินาที", flush=True)
            raw = gzip.decompress(bytes(buf)) if gz else bytes(buf)
            return json.loads(raw.decode("utf-8"))
        except Exception as e:
            last = e
            print(f"{label}: ครั้งที่ {attempt} ล้มเหลวหลัง {time.time() - t0:.1f} วินาที: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
    raise last


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def in_bounds(lat, lon):
    return lat is not None and lon is not None and BOUNDS[0] <= lat <= BOUNDS[1] and BOUNDS[2] <= lon <= BOUNDS[3]


def to_dt(s):
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=TZ)
    except (TypeError, ValueError):
        return None


def iso(dt):
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def classify(title):
    """แปลงข้อความชื่อเหตุการณ์เป็นระดับ  no=ห้ามผ่าน hard=ควรเลี่ยง yes=ผ่านได้ unk=ไม่ระบุ"""
    if "ผ่านไม่ได้" in title or re.search(r"(?<!เ)ปิด", title):   # (?<!เ) กันคำว่า "เปิด" ไม่ให้นับเป็นปิด
        return "no", 3
    if "รถเล็กควรเลี่ยง" in title or "ผ่านได้ยาก" in title or "ควรเลี่ยง" in title:
        return "hard", 2
    if "(ผ่านได้)" in title or "ผ่านได้" in title:
        return "yes", 1
    return "unk", 1


def parse_longdo(raw, now):
    out, seen = [], set()
    for x in raw.get("item", []):
        title = (x.get("title") or "").strip()
        if "ท่วม" not in title:
            continue
        lat, lon = num(x.get("latitude")), num(x.get("longitude"))
        created, stop, start = to_dt(x.get("createtime")), to_dt(x.get("stop_time")), to_dt(x.get("start_time"))
        if not in_bounds(lat, lon) or created is None or stop is None:
            continue
        if now - created > timedelta(hours=LONGDO_MAX_AGE_H) or stop < now:
            continue
        key = (title, round(lat, 4), round(lon, 4))
        if key in seen:
            continue
        seen.add(key)
        pas, level = classify(title)
        out.append({"id": "L" + str(x.get("eid")), "title": title, "lat": round(lat, 5), "lon": round(lon, 5),
                    "pass": pas, "level": level, "at": iso(created), "until": iso(stop),
                    "by": "DOH" if "DOH" in (x.get("contributor") or "") else "user"})
    out.sort(key=lambda i: (-i["level"], i["at"]), reverse=False)
    return out


def parse_traffy(raw, now):
    out = []
    for f in raw.get("features", []):
        p = f.get("properties") or {}
        types = p.get("problem_type_fondue") or []
        if "น้ำท่วม" not in types or p.get("state") == "เสร็จสิ้น":
            continue
        try:
            lon, lat = f["geometry"]["coordinates"][:2]
        except (KeyError, TypeError, ValueError):
            continue
        ts = to_dt(p.get("timestamp"))
        if ts is None or not in_bounds(lat, lon) or now - ts > timedelta(hours=TRAFFY_MAX_AGE_H):
            continue
        out.append({"id": "T" + str(p.get("message_id")), "lat": round(lat, 5), "lon": round(lon, 5), "at": iso(ts),
                    "state": p.get("state") or "", "district": p.get("district") or "",
                    "help": "ขอความช่วยเหลือ" in types})
    out.sort(key=lambda r: r["at"], reverse=True)
    return out


# ---------- จับจุดเหตุการณ์ให้ตรงกับเส้นถนนจริงจาก OpenStreetMap (Overpass) ----------
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
SNAP_BUDGET_S = 100   # เวลารวมสูงสุดของขั้นตอนจับคู่เส้นถนน เกินแล้วข้าม (ไม่ให้ทั้งงานค้าง)
_deadline = [0.0]
HW = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|motorway_link|trunk_link|primary_link|secondary_link"
HW_RANK = {"trunk": 0, "primary": 0, "secondary": 0, "tertiary": 1, "unclassified": 1, "residential": 2, "service": 3}
SNAP_M = 45        # ระยะสูงสุดจากจุดถึงเส้นถนน (เมตร)
SNAP_REF_M = 200   # ถ้าชื่อเป็นทางหลวงหมายเลข อนุญาตให้ไกลกว่านี้ถ้าเลขตรงกัน
CLIP_M = 350       # วาดเฉพาะช่วงถนนที่อยู่ใกล้จุดรายงานไม่เกินระยะนี้


def _xy(lat, lon, lat0):
    return (lon * 111320.0 * math.cos(math.radians(lat0)), lat * 110540.0)


def _dist_seg(p, a, b):
    ax, ay, bx, by = a[0], a[1], b[0], b[1]
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L))
    return math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy))


def snap_incident(inc, ways):
    """คืนรายการพิกัด [[lat,lon],...] ของถนนที่ใกล้จุดที่สุด (เลือกเลขทางหลวงที่ตรงก่อน) หรือ None"""
    lat0 = inc["lat"]
    p = _xy(inc["lat"], inc["lon"], lat0)
    m = re.search(r"ทางหลวง\s*(\d+)", inc["title"])
    want = m.group(1) if m else None
    best = None
    for w in ways:
        pts = [_xy(g["lat"], g["lon"], lat0) for g in w["geometry"]]
        if len(pts) < 2:
            continue
        d = min(_dist_seg(p, pts[k], pts[k + 1]) for k in range(len(pts) - 1))
        tags = w.get("tags", {})
        hw = tags.get("highway", "")
        ref_ok = want is not None and want in re.split(r"[;,\s]+", tags.get("ref", ""))
        if ref_ok:
            if d > SNAP_REF_M:
                continue
            score = (0, d)
        else:
            if d > SNAP_M or hw.endswith("_link") or hw == "motorway":   # ทางด่วน/ทางยกระดับมักไม่ใช่ถนนที่น้ำท่วม
                continue
            score = (1 + HW_RANK.get(hw, 3), d)
        if best is None or score < best[0]:
            best = (score, w, pts)
    if not best:
        return None
    w, pts = best[1], best[2]
    keep = [k for k, q in enumerate(pts) if math.hypot(q[0] - p[0], q[1] - p[1]) <= CLIP_M]
    if not keep:   # จุดอยู่กลางช่วงยาวที่ไม่มีจุดหักมุมใกล้ ให้ใช้ช่วงที่ใกล้ที่สุด
        k = min(range(len(pts) - 1), key=lambda k: _dist_seg(p, pts[k], pts[k + 1]))
        keep = [k, k + 1]
    lo, hi = max(0, min(keep) - 1), min(len(pts) - 1, max(keep) + 1)
    return [[round(g["lat"], 5), round(g["lon"], 5)] for g in w["geometry"][lo:hi + 1]]


def overpass_query(incs):
    body = "".join('way(around:%d,%s,%s)[highway~"^(%s)$"];' % (SNAP_REF_M, i["lat"], i["lon"], HW) for i in incs)
    data = "data=" + urllib.parse.quote("[out:json][timeout:60];(" + body + ");out tags geom;")
    last = None
    for url in OVERPASS:
        if time.time() > _deadline[0]:
            raise TimeoutError("หมดเวลาจับคู่เส้นถนน")
        try:
            req = urllib.request.Request(url, data=data.encode(), headers={"User-Agent": "flood-check/1.0", "Content-Type": "application/x-www-form-urlencoded", "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=25) as r:
                raw = r.read()
                if (r.headers.get("Content-Encoding") or "").lower() == "gzip":
                    raw = gzip.decompress(raw)
            return json.loads(raw.decode("utf-8"))["elements"]
        except Exception as e:
            last = e
            print(f"overpass {url} ล้มเหลว: {e}", file=sys.stderr)
    raise last


def attach_geometry(incidents):
    """เติมฟิลด์ g (เส้นถนน) ให้เหตุการณ์ที่จับคู่ได้ ถ้า Overpass ล้มเหลวจะข้าม ไม่กระทบข้อมูลอื่น"""
    if FIXTURE or not incidents:
        return 0
    n = 0
    _deadline[0] = time.time() + SNAP_BUDGET_S
    try:
        for k in range(0, len(incidents), 70):
            chunk = incidents[k:k + 70]
            ways = overpass_query(chunk)
            for inc in chunk:
                g = snap_incident(inc, ways)
                if g:
                    inc["g"] = g
                    n += 1
            time.sleep(1)
    except Exception as e:
        print(f"ข้ามการจับคู่เส้นถนน: {e}", file=sys.stderr)
    print(f"จับคู่เส้นถนนได้ {n}/{len(incidents)} จุด", flush=True)
    return n


def main():
    now = datetime.now(TZ)
    if FIXTURE:
        now = datetime(2026, 9, 26, 12, 10, tzinfo=TZ)
    status, incidents, reports = [], [], []
    ok = 0
    try:
        incidents = parse_longdo(get_json(LONGDO_URL + "?now=" + str(int(time.time())), "longdo", "incident.json"), now)
        ok += 1
        status.append({"id": "longdo", "name": "Longdo Traffic / iTIC / กรมทางหลวง", "url": "https://traffic.longdo.com/", "status": "ok" if incidents else "stale", "fetchedAt": iso(now)})
    except Exception as e:
        print(f"longdo ล้มเหลว: {e}", file=sys.stderr)
        status.append({"id": "longdo", "name": "Longdo Traffic / iTIC / กรมทางหลวง", "status": "error", "fetchedAt": iso(now)})
    try:
        d0, d1 = (now - timedelta(days=1)).strftime("%Y-%m-%d"), (now + timedelta(days=1)).strftime("%Y-%m-%d")
        url = TRAFFY_URL + "?" + urllib.parse.urlencode({"text": "ท่วม", "start": d0, "end": d1})
        reports = parse_traffy(get_json(url, "traffy", "traffy_geojson.json"), now)
        ok += 1
        status.append({"id": "traffy", "name": "Traffy Fondue (เรื่องแจ้งของประชาชน ยังไม่ตรวจสอบ)", "url": "https://bangkok.traffy.in.th/", "status": "ok", "fetchedAt": iso(now)})
    except Exception as e:
        print(f"traffy ล้มเหลว: {e}", file=sys.stderr)
        status.append({"id": "traffy", "name": "Traffy Fondue (เรื่องแจ้งของประชาชน ยังไม่ตรวจสอบ)", "status": "error", "fetchedAt": iso(now)})
    if ok == 0:   # ไม่ได้ข้อมูลเลย ห้ามเผยแพร่ไฟล์ว่าง ให้ล้มเหลวเพื่อให้เห็นปัญหา
        print("ไม่ได้ข้อมูลจากทั้งสองแหล่ง จึงไม่เขียนไฟล์", file=sys.stderr)
        return 1
    attach_geometry(incidents)
    count = lambda p: sum(1 for i in incidents if i["pass"] == p)
    doc = {"updatedAt": iso(now), "sources": status,
           "summary": {"blocked": count("no"), "avoid": count("hard"), "passable": count("yes"), "unknown": count("unk"), "reports": len(reports)},
           "incidents": incidents, "reports": reports}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"เขียน {OUT}: เหตุการณ์ {len(incidents)}, เรื่องแจ้ง {len(reports)}, {doc['summary']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
