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
