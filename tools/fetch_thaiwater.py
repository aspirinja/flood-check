#!/usr/bin/env python3
"""ดึงข้อมูลฝน 24 ชม. และระดับน้ำจากสถานีวัดทางการ (ThaiWater/สสน.) เฉพาะกรุงเทพฯ และปริมณฑล
แล้วเขียน data/official.json  (endpoint สาธารณะ ไม่ต้องใช้คีย์ ยืนยันด้วยการเรียกจริงเมื่อ 26 ก.ย. 2569)

ข้อควรรู้: เป็นข้อมูลจากสถานีวัดฝนและระดับน้ำในคลอง/แม่น้ำ ไม่ใช่ความลึกน้ำท่วมบนถนน
ตัวแปรสภาพแวดล้อม  THAIWATER_FIXTURE_DIR = โฟลเดอร์ไฟล์ตัวอย่าง (ใช้ทดสอบโดยไม่ต่อเน็ต)
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "official.json"
BASE = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/"
FIXTURE = os.getenv("THAIWATER_FIXTURE_DIR", "")
PROVINCES = {"กรุงเทพมหานคร", "นนทบุรี", "ปทุมธานี", "สมุทรปราการ", "สมุทรสาคร", "นครปฐม"}
BKK = "กรุงเทพมหานคร"
TZ = timezone(timedelta(hours=7))  # เวลาในข้อมูลเป็นเวลาไทย
KEEP_HOURS = 12                     # สถานีที่ไม่ส่งค่าเกินนี้ถือว่าเก่า จะไม่แสดง


def load(name):
    if FIXTURE:
        return json.loads((Path(FIXTURE) / f"{name}.json").read_text(encoding="utf-8"))
    last = None
    for attempt in (1, 2):   # ลองสูงสุด 2 ครั้ง และจำกัดเวลาทุกขั้นตอน เพื่อไม่ให้ค้าง
        t0 = time.time()
        try:
            req = urllib.request.Request(BASE + name, headers={"User-Agent": "flood-check/1.0"})
            with urllib.request.urlopen(req, timeout=20) as r:
                print(f"{name}: เชื่อมต่อได้ HTTP {r.status} ใน {time.time() - t0:.1f} วินาที", flush=True)
                buf = bytearray()
                while True:
                    chunk = r.read(65536)
                    if not chunk:
                        break
                    buf += chunk
                    if time.time() - t0 > 90:
                        raise TimeoutError("อ่านข้อมูลนานเกิน 90 วินาที")
            print(f"{name}: ได้ {len(buf) / 1e6:.1f} MB ใน {time.time() - t0:.1f} วินาที", flush=True)
            return json.loads(buf.decode("utf-8"))
        except Exception as e:
            last = e
            print(f"{name}: ครั้งที่ {attempt} ล้มเหลวหลัง {time.time() - t0:.1f} วินาที: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
    raise last


def th(d):
    return (d or {}).get("th") or (d or {}).get("en") or ""


def to_iso(s):
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=TZ).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except (TypeError, ValueError):
        return None


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def parse_rain(raw, now):
    out = []
    for x in raw.get("data", []):
        g, st = x.get("geocode", {}), x.get("station", {})
        if th(g.get("province_name")) not in PROVINCES:
            continue
        at, r24 = to_iso(x.get("rainfall_datetime")), num(x.get("rain_24h"))
        lat, lon = num(st.get("tele_station_lat")), num(st.get("tele_station_long"))
        if at is None or r24 is None or lat is None or lon is None:
            continue
        if (now - datetime.fromisoformat(at.replace("Z", "+00:00"))).total_seconds() > KEEP_HOURS * 3600:
            continue
        out.append({"id": f"r{st.get('id')}", "name": th(st.get("tele_station_name")), "amphoe": th(g.get("amphoe_name")),
                    "province": th(g.get("province_name")), "lat": lat, "lon": lon, "rain24h": r24,
                    "rain1h": num(x.get("rain_1h")), "at": at, "agency": th(x.get("agency", {}).get("agency_shortname"))})
    return out


def parse_water(raw, now):
    out = []
    for x in raw.get("waterlevel_data", {}).get("data", []):
        g, st = x.get("geocode", {}), x.get("station", {})
        if th(g.get("province_name")) not in PROVINCES:
            continue
        at, lvl = to_iso(x.get("waterlevel_datetime")), num(x.get("waterlevel_msl"))
        lat, lon = num(st.get("tele_station_lat")), num(st.get("tele_station_long"))
        if at is None or lvl is None or lat is None or lon is None:
            continue
        if (now - datetime.fromisoformat(at.replace("Z", "+00:00"))).total_seconds() > KEEP_HOURS * 3600:
            continue
        gap = num(x.get("diff_wl_bank"))
        if gap is not None and "ต่ำกว่า" in (x.get("diff_wl_bank_text") or ""):
            gap = -gap   # บวก = ล้นตลิ่ง, ลบ = ต่ำกว่าตลิ่ง (เมตร)
        prev = num(x.get("waterlevel_msl_previous"))
        out.append({"id": f"w{st.get('id')}", "name": th(st.get("tele_station_name")), "amphoe": th(g.get("amphoe_name")),
                    "province": th(g.get("province_name")), "lat": lat, "lon": lon, "levelMsl": lvl,
                    "change": None if prev is None else round(lvl - prev, 2), "overBank": gap,
                    "situation": x.get("situation_level"), "at": at, "agency": th(x.get("agency", {}).get("agency_shortname"))})
    return out


def main():
    now = datetime.now(timezone.utc)
    if FIXTURE:  # โหมดทดสอบ: ใช้เวลาอ้างอิงตามไฟล์ตัวอย่าง
        now = datetime(2026, 9, 26, 5, 0, tzinfo=timezone.utc)
    status, rain, water = [], [], []
    for name, fn, dst, label in (("rain_24h", parse_rain, rain, "ฝนสะสม 24 ชม."), ("waterlevel_load", parse_water, water, "ระดับน้ำ")):
        try:
            dst.extend(fn(load(name), now))
            status.append({"id": name, "name": f"ThaiWater/สสน. {label}", "url": "https://www.thaiwater.net/", "status": "ok" if dst else "stale", "fetchedAt": now.isoformat().replace("+00:00", "Z")})
        except Exception as e:
            print(f"{name} ล้มเหลว: {e}", file=sys.stderr)
            status.append({"id": name, "name": f"ThaiWater/สสน. {label}", "status": "error", "fetchedAt": now.isoformat().replace("+00:00", "Z")})
    if not rain and not water:   # ไม่ได้ข้อมูลเลย ห้ามเผยแพร่ไฟล์ว่าง ให้ workflow ล้มเหลวเพื่อให้เห็นปัญหา
        print("ไม่ได้ข้อมูลจากทั้งสองแหล่ง จึงไม่เขียนไฟล์", file=sys.stderr)
        return 1
    bk = [r["rain24h"] for r in rain if r["province"] == BKK]
    summary = {
        "bkkRainAvg": round(sum(bk) / len(bk), 1) if bk else None,
        "bkkRainMax": max(bk) if bk else None,
        "rainStations": len(rain), "waterStations": len(water),
        "overBank": sum(1 for w in water if (w["overBank"] or -1) > 0),
    }
    doc = {"updatedAt": now.isoformat().replace("+00:00", "Z"), "sources": status, "summary": summary, "rain": rain, "water": water}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"เขียน {OUT}: ฝน {len(rain)} สถานี, น้ำ {len(water)} สถานี, {summary}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
