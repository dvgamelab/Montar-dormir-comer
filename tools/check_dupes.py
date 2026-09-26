"""Auditoría de duplicados: posibles duplicados que NO se han unido y fusiones con pueblos distintos.

    python tools/check_dupes.py
"""
import json
import os
import re
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GENERIC = set("de del la las el los y i marcha marxa btt mtb bike cicloturista ciclodeportiva gran fondo gravel ruta trofeo trofeu "
              "copa open rally xco xcm maraton media carrera cursa race gp premio ciclocross cx ciudad villa memorial".split())


def fold(s):
    return re.sub(r"[^a-z0-9 ]", " ", unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower())


def key(s):
    return " ".join(w for w in fold(s).split() if w not in GENERIC and not w.isdigit() and not re.fullmatch(r"[ivxlc]+", w))


rides = json.load(open(os.path.join(ROOT, "web", "data", "rides.json")))["rides"]
by_date = defaultdict(list)
for r in rides:
    by_date[r["date"]].append(r)
print("== Posibles duplicados sin unir (mismo día, nombre muy parecido, misma provincia)")
n = 0
for d, rs in sorted(by_date.items()):
    for i in range(len(rs)):
        for j in range(i + 1, len(rs)):
            a, b = rs[i], rs[j]
            ka, kb = key(a["name"]), key(b["name"])
            if not ka or not kb or a.get("province") != b.get("province"):
                continue
            if SequenceMatcher(None, ka, kb).ratio() > 0.85 or (len(ka) > 5 and (ka in kb or kb in ka)):
                n += 1
                print(f"  {d} | {a['name']} ({a.get('city')}) {a.get('dist')}  ||  {b['name']} ({b.get('city')}) {b.get('dist')}")
print(f"  total: {n}")

print("\n== Fusiones con pueblos distintos (revisar a mano)")
rep = json.load(open(os.path.join(ROOT, "data", "dedupe_report.json")))
m = 0
for g in rep:
    towns = {fold(re.search(r"\(\d{4}-\d\d-\d\d, ([^)]*)\)", x).group(1))[:6] for x in g["merged"] if re.search(r"\(\d{4}-\d\d-\d\d, ([^)]+)\)", x)}
    if len(towns) > 1:
        m += 1
        print("  " + "\n    ".join(g["merged"]))
print(f"  total: {m} de {len(rep)} grupos fusionados")
