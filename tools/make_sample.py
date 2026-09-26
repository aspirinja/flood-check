#!/usr/bin/env python3
"""สร้างข้อมูลตัวอย่างสำหรับทดสอบแอป

ผลลัพธ์:
  tools/network.json   โครงข่ายถนน (จุดเชื่อมและช่วงถนน) ใช้เป็นฐานของตัวดึงข้อมูลจริง
  data/flood.json      ข้อมูลตัวอย่างพร้อมประวัติ 24 ชม. (mode = "sample")

ข้อมูลระดับน้ำเป็นตัวเลขสมมติทั้งหมด ไม่ใช่สถานการณ์จริง
พิกัดของจุดเชื่อมเป็นค่าโดยประมาณ และช่วงถนนเป็นเส้นตรงระหว่างจุดเชื่อม
ถ้าต้องการแนวถนนจริง ให้ใส่ "geometry": [[lat, lon], ...] ในแต่ละช่วงของ network.json
"""
import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# id: (ชื่อ, lon, lat, จังหวัด, จุดหลัก)
NODES = {
    "pathum": ("ปทุมธานี", 100.53, 14.02, "ปทุมธานี", 1),
    "rangsit": ("รังสิต", 100.62, 13.99, "ปทุมธานี", 1),
    "donmueang": ("ดอนเมือง", 100.60, 13.91, "กทม.", 1),
    "laksi": ("หลักสี่", 100.57, 13.88, "กทม.", 0),
    "nonth": ("นนทบุรี", 100.52, 13.86, "นนทบุรี", 1),
    "bbt": ("บางบัวทอง", 100.42, 13.93, "นนทบุรี", 0),
    "bangyai": ("บางใหญ่", 100.41, 13.87, "นนทบุรี", 0),
    "chatuchak": ("จตุจักร", 100.56, 13.83, "กทม.", 0),
    "bangsue": ("บางซื่อ", 100.52, 13.81, "กทม.", 0),
    "ladprao": ("ลาดพร้าว", 100.60, 13.80, "กทม.", 0),
    "ratchada": ("ห้วยขวาง", 100.575, 13.77, "กทม.", 0),
    "victory": ("อนุสาวรีย์ชัยฯ", 100.537, 13.765, "กทม.", 0),
    "siam": ("สยาม", 100.53, 13.745, "กทม.", 1),
    "hua": ("หัวลำโพง", 100.515, 13.73, "กทม.", 0),
    "rama9": ("พระราม 9", 100.575, 13.757, "กทม.", 0),
    "asok": ("อโศก", 100.565, 13.735, "กทม.", 0),
    "klongtoei": ("คลองเตย", 100.56, 13.71, "กทม.", 0),
    "onnut": ("อ่อนนุช", 100.60, 13.70, "กทม.", 0),
    "bangkapi": ("บางกะปิ", 100.65, 13.77, "กทม.", 1),
    "minburi": ("มีนบุรี", 100.73, 13.81, "กทม.", 1),
    "latkrabang": ("ลาดกระบัง", 100.77, 13.72, "กทม.", 1),
    "suvarn": ("สุวรรณภูมิ", 100.75, 13.69, "สมุทรปราการ", 0),
    "bangna": ("บางนา", 100.63, 13.67, "กทม.", 1),
    "samutp": ("สมุทรปราการ", 100.60, 13.60, "สมุทรปราการ", 1),
    "phrap": ("พระประแดง", 100.53, 13.66, "สมุทรปราการ", 0),
    "thon": ("ธนบุรี", 100.47, 13.71, "กทม.", 1),
    "taling": ("ตลิ่งชัน", 100.45, 13.78, "กทม.", 1),
    "bangkhae": ("บางแค", 100.40, 13.71, "กทม.", 1),
    "putta": ("พุทธมณฑล", 100.32, 13.79, "นครปฐม", 1),
    "samutsakhon": ("สมุทรสาคร", 100.27, 13.55, "สมุทรสาคร", 1),
}

# id, จาก, ถึง, ถนน, ระดับน้ำ (ซม.), แนวโน้ม, อายุข้อมูล (นาที)
RAW = [
    ("e1", "pathum", "rangsit", "ถ.ปทุมธานี–รังสิต", 24, "up", 9),
    ("e2", "rangsit", "donmueang", "ถ.พหลโยธิน", 8, "flat", 14),
    ("e3", "donmueang", "laksi", "ถ.วิภาวดีรังสิต", 3, "flat", 14),
    ("e4", "laksi", "chatuchak", "ถ.พหลโยธิน", 0, "flat", 20),
    ("e5", "chatuchak", "victory", "ถ.พหลโยธิน", 0, "flat", 20),
    ("e6", "victory", "siam", "ถ.พญาไท", 0, "flat", 22),
    ("e7", "siam", "asok", "ถ.เพลินจิต–สุขุมวิท", 2, "flat", 22),
    ("e8", "asok", "onnut", "ถ.สุขุมวิท", 6, "down", 11),
    ("e9", "onnut", "bangna", "ถ.สุขุมวิท", 18, "up", 8),
    ("e10", "bangna", "samutp", "ถ.สุขุมวิท", 35, "up", 6),
    ("e11", "laksi", "bangkapi", "ถ.รามอินทรา", 20, "flat", 12),
    ("e12", "ladprao", "chatuchak", "ถ.ลาดพร้าว", 0, "flat", 25),
    ("e13", "ladprao", "ratchada", "ถ.ลาดพร้าว", 6, "down", 15),
    ("e14", "ratchada", "rama9", "ถ.รัชดาภิเษก", 0, "flat", 25),
    ("e15", "rama9", "asok", "ถ.พระราม 9", 0, "flat", 25),
    ("e16", "bangkapi", "ladprao", "ถ.ลาดพร้าว", 9, "flat", 10),
    ("e17", "bangkapi", "minburi", "ถ.สีหบุรานุกิจ", 38, "up", 5),
    ("e18", "bangkapi", "latkrabang", "ถ.รามคำแหง", 12, "flat", 18),
    ("e19", "latkrabang", "suvarn", "ถ.ลาดกระบัง", 15, "up", 7),
    ("e20", "suvarn", "bangna", "ถ.บางนา–ตราด", 7, "down", 13),
    ("e21", "rama9", "bangkapi", "ถ.ศรีบูรพา", 4, "flat", 18),
    ("e22", "asok", "klongtoei", "ถ.พระราม 4", 10, "flat", 16),
    ("e23", "hua", "siam", "ถ.พระราม 4", 1, "flat", 22),
    ("e24", "hua", "klongtoei", "ถ.พระราม 4", 5, "flat", 25),
    ("e25", "klongtoei", "onnut", "ถ.สุขุมวิท 71", 0, "flat", 25),
    ("e26", "hua", "thon", "ถ.เจริญกรุง", 0, "flat", 24),
    ("e27", "thon", "taling", "ถ.จรัญสนิทวงศ์", 22, "up", 7),
    ("e28", "thon", "bangkhae", "ถ.เพชรเกษม", 12, "flat", 16),
    ("e29", "taling", "bangkhae", "ถ.กาญจนาภิเษก", 45, "up", 4),
    ("e30", "taling", "putta", "ถ.พุทธมณฑลสาย 2", 20, "flat", 11),
    ("e31", "bangkhae", "samutsakhon", "ถ.พระราม 2", 14, "down", 19),
    ("e32", "taling", "bangyai", "ถ.ราชพฤกษ์", 18, "up", 8),
    ("e33", "bangyai", "bbt", "ถ.กาญจนาภิเษก", 32, "up", 5),
    ("e34", "bbt", "nonth", "ถ.รัตนาธิเบศร์", 11, "flat", 17),
    ("e35", "nonth", "bangsue", "ถ.ประชาราษฎร์", 3, "flat", 21),
    ("e36", "bangsue", "chatuchak", "ถ.กำแพงเพชร 2", 0, "flat", 21),
    ("e37", "bangsue", "victory", "ถ.ประชาราษฎร์สาย 1", 0, "flat", 21),
    ("e38", "pathum", "nonth", "ถ.ติวานนท์–ปทุมธานี", 28, "up", 6),
    ("e39", "samutp", "phrap", "ถ.สุขสวัสดิ์", 20, "flat", 13),
    ("e40", "phrap", "thon", "ถ.สุขสวัสดิ์", 9, "down", 14),
    ("e41", "donmueang", "minburi", "ถ.รามอินทรา–มิตรไมตรี", 26, "up", 7),
    ("e42", "rangsit", "minburi", "ถ.รังสิต–นครนายก", 52, "up", 4),
    ("e43", "laksi", "nonth", "ถ.แจ้งวัฒนะ", 8, "flat", 12),
    ("e44", "ladprao", "laksi", "ถ.เกษตร–นวมินทร์", 0, "flat", 22),
]

POINTS = 49  # 24 ชม. ทุก 30 นาที
STEP = 30


def history(target: int, trend: str, rng: random.Random) -> list:
    """สร้างประวัติที่ลงท้ายด้วยค่าปัจจุบัน ตามแนวโน้ม"""
    if target == 0 and trend == "flat":
        return [0] * POINTS
    out = []
    for i in range(POINTS):
        u = i / (POINTS - 1)
        if trend == "up":
            base = target * (0.25 + 0.75 * u ** 1.6)
        elif trend == "down":
            base = target * (1.7 - 0.7 * u ** 0.8)
        else:
            base = target * (0.9 + 0.1 * math.sin(u * 5))
        out.append(max(0, round(base + rng.uniform(-1.5, 1.5) * (1 if target > 3 else 0.4))))
    out[-1] = target
    return out


def main() -> None:
    rng = random.Random(2026)
    nodes = [
        {"id": k, "name": v[0], "lon": v[1], "lat": v[2], "province": v[3], "major": bool(v[4])}
        for k, v in NODES.items()
    ]
    network = {
        "nodes": nodes,
        "segments": [{"id": r[0], "road": r[3], "from": r[1], "to": r[2]} for r in RAW],
    }
    (ROOT / "tools" / "network.json").write_text(
        json.dumps(network, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    segments = []
    for r in RAW:
        segments.append(
            {
                "id": r[0],
                "road": r[3],
                "from": r[1],
                "to": r[2],
                "depth": r[4],
                "trend": r[5],
                "ageMin": r[6],
                "source": "sample",
                "history": history(r[4], r[5], rng),
            }
        )
    flood = {
        "meta": {
            "mode": "sample",
            "ageMin": 4,
            "historyStepMin": STEP,
            "sources": [{"id": "sample", "name": "ข้อมูลตัวอย่าง (สมมติ)", "status": "sample", "ageMin": 4}],
        },
        "nodes": nodes,
        "segments": segments,
    }
    (ROOT / "data" / "flood.json").write_text(
        json.dumps(flood, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print("wrote tools/network.json and data/flood.json")


if __name__ == "__main__":
    main()
