#!/usr/bin/env python3
"""อัปเดต data/flood.json จากแหล่งข้อมูลจริง

ทำงานอย่างไร
  1. อ่านโครงข่ายถนน (tools/network.json) ซึ่งมีจุดเชื่อมและช่วงถนน
  2. อ่านค่าที่วัดได้จากแหล่งข้อมูล (ดู SOURCES ด้านล่าง) แต่ละค่าผูกกับ segment_id
  3. รวมกับประวัติเดิมใน data/flood.json (เก็บย้อนหลัง 24 ชม.) แล้วเขียนไฟล์ใหม่
  รันซ้ำทุก 30 นาทีด้วย cron หรือ GitHub Actions (.github/workflows/update-data.yml)

แหล่งข้อมูลที่ใช้ได้ทันที
  - ตารางบันทึกจากทีมงาน (CSV): ตั้งตัวแปร OBS_CSV_URL เป็นลิงก์ "เผยแพร่เป็น CSV" ของ Google Sheets
    หรือใส่ไฟล์ tools/observations.csv คอลัมน์: segment_id, depth_cm, observed_at (ไม่บังคับ), note (ไม่บังคับ)
    ตัวอย่างการทดลองอยู่ที่ tools/observations.example.csv

แหล่งข้อมูลทางการ (สำนักการระบายน้ำ กทม., ThaiWater, GISTDA)
  ฟังก์ชัน fetch_official() เป็นจุดต่อให้เขียนเพิ่ม ผมยังไม่ได้ยืนยันว่าแหล่งเหล่านี้เปิด API
  ให้เรียกจากโปรแกรมหรือไม่ จึงไม่ได้เขียนตัวเชื่อมสำเร็จรูปไว้ ฟังก์ชันต้องคืนรายการ
  {"segment_id","depth_cm","observed_at"} และคุณต้องกำหนดเองว่าสถานีวัดแต่ละแห่งตรงกับช่วงถนนใด
"""
import csv
import io
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NETWORK = ROOT / "tools" / "network.json"
OUT = ROOT / "data" / "flood.json"
LOCAL_CSV = ROOT / "tools" / "observations.csv"

STEP_MIN = int(os.getenv("STEP_MIN", "30"))          # ต้องตรงกับความถี่ที่รันสคริปต์
KEEP = int(os.getenv("HISTORY_POINTS", "49"))        # 49 จุด x 30 นาที = 24 ชม.
STALE_HOURS = float(os.getenv("STALE_HOURS", "6"))   # ค่าที่เก่ากว่านี้ถือว่าไม่ทันสมัย และจะคงค่าเดิมพร้อมป้ายเตือน
OBS_CSV_URL = os.getenv("OBS_CSV_URL", "").strip()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_time(s: str):
    if not s:
        return None
    s = s.strip().replace("Z", "+00:00")
    for fmt in (None, "%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M"):
        try:
            d = datetime.fromisoformat(s) if fmt is None else datetime.strptime(s, fmt)
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def read_csv_text(text: str, source_id: str) -> list:
    out = []
    for row in csv.DictReader(io.StringIO(text)):
        sid = (row.get("segment_id") or "").strip()
        try:
            depth = float(row.get("depth_cm") or "")
        except ValueError:
            continue
        if not sid or depth < 0 or depth > 300:
            continue
        t = parse_time(row.get("observed_at") or "")
        out.append({"segment_id": sid, "depth_cm": round(depth), "observed_at": t, "source": source_id})
    return out


def fetch_team_csv():
    """ตารางบันทึกจากทีมงาน"""
    if OBS_CSV_URL:
        with urllib.request.urlopen(OBS_CSV_URL, timeout=30) as r:
            text = r.read().decode("utf-8-sig")
        return read_csv_text(text, "team"), "ตารางบันทึกจากทีมงาน", OBS_CSV_URL
    if LOCAL_CSV.exists():
        return read_csv_text(LOCAL_CSV.read_text(encoding="utf-8-sig"), "team"), "ตารางบันทึกจากทีมงาน", ""
    return [], "ตารางบันทึกจากทีมงาน", ""


def fetch_official():
    """จุดต่อสำหรับข้อมูลทางการ เขียนเพิ่มตามที่ต้องการ แล้วคืนรายการค่าที่วัดได้

    ตัวอย่างโครงที่ต้องคืน:
        [{"segment_id": "e10", "depth_cm": 12, "observed_at": datetime(...), "source": "bma"}]
    """
    return [], "สำนักการระบายน้ำ กทม.", "https://weather.bangkok.go.th/"


SOURCES = [fetch_team_csv]  # เพิ่ม fetch_official เมื่อเขียนเสร็จ


def trend_of(hist):
    if len(hist) < 4:
        return "flat"
    d = hist[-1] - hist[-4]
    return "up" if d >= 3 else "down" if d <= -3 else "flat"


def main() -> int:
    net = json.loads(NETWORK.read_text(encoding="utf-8"))
    prev = {}
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding="utf-8"))
            if old.get("meta", {}).get("mode") != "sample":  # ข้อมูลตัวอย่างไม่ใช่ประวัติจริง
                prev = {s["id"]: s for s in old.get("segments", [])}
        except Exception:
            prev = {}

    now = datetime.now(timezone.utc)
    latest = {}          # segment_id -> ค่าล่าสุด
    source_status = []
    for fn in SOURCES:
        try:
            obs, name, url = fn()
            for o in obs:
                t = o["observed_at"] or now
                cur = latest.get(o["segment_id"])
                if cur is None or t > cur["t"]:
                    latest[o["segment_id"]] = {"d": o["depth_cm"], "t": t, "src": o["source"]}
            source_status.append({"id": obs[0]["source"] if obs else fn.__name__, "name": name, "url": url, "status": "ok" if obs else "stale", "fetchedAt": now_iso()})
        except Exception as e:  # แหล่งเดียวล้มเหลวไม่ทำให้ทั้งไฟล์ล้ม
            print(f"แหล่งข้อมูล {fn.__name__} ล้มเหลว: {e}", file=sys.stderr)
            source_status.append({"id": fn.__name__, "name": fn.__name__, "status": "error", "fetchedAt": now_iso()})

    segments = []
    stale_count = 0
    for s in net["segments"]:
        p = prev.get(s["id"], {})
        obs = latest.get(s["id"])
        if obs:
            depth, updated, src = obs["d"], obs["t"].astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"), obs["src"]
        else:  # ไม่มีค่าใหม่ คงค่าเดิมและเวลาเดิม เพื่อให้แอปแสดงอายุข้อมูลตามจริง
            depth = p.get("depth", 0)
            updated = p.get("updatedAt", now_iso())
            src = p.get("source", "")
            t = parse_time(updated)
            if t and (now - t).total_seconds() > STALE_HOURS * 3600:
                stale_count += 1
        hist = list(p.get("history", []))
        hist.append(depth)
        hist = hist[-KEEP:]
        seg = {**s, "depth": depth, "trend": trend_of(hist), "updatedAt": updated, "source": src, "history": hist}
        segments.append(seg)

    if stale_count:
        source_status.append({"id": "stale", "name": f"ช่วงถนน {stale_count} ช่วงไม่มีค่าใหม่เกิน {STALE_HOURS:g} ชม.", "status": "stale", "fetchedAt": now_iso()})

    flood = {
        "meta": {"mode": "live", "updatedAt": now_iso(), "historyStepMin": STEP_MIN, "sources": source_status},
        "nodes": net["nodes"],
        "segments": segments,
    }
    OUT.parent.mkdir(exist_ok=True)
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(flood, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(OUT)
    print(f"เขียน {OUT} แล้ว: {len(segments)} ช่วงถนน, ค่าใหม่ {len(latest)} ช่วง")
    return 0


if __name__ == "__main__":
    sys.exit(main())
