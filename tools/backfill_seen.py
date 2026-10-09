"""Reconstruye data/seen.json (fecha de alta de cada ficha) a partir del historial de git de data/raw/.

    python tools/backfill_seen.py

La primera recogida guardada cuenta como «base» (no es novedad); cada ficha que aparece después toma la
fecha del commit en que apareció por primera vez.
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scraper"))
import run  # noqa: E402

git = lambda *a: subprocess.check_output(["git", "-C", ROOT, *a], text=True)  # noqa: E731
commits = git("log", "--reverse", "--format=%H %cI", "--", "data/raw").split("\n")
seen = {}
for i, line in enumerate(c for c in commits if c.strip()):
    sha, when = line.split(" ", 1)
    stamp = "base" if i == 0 else run.dt.datetime.fromisoformat(when).astimezone(run.dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    new = 0
    for src in run.SOURCES:
        try:
            rows = json.loads(git("show", f"{sha}:data/raw/{src}.json"))
        except subprocess.CalledProcessError:
            continue
        for r in rows:
            k = run.seen_key(r)
            if k not in seen:
                seen[k] = stamp
                new += 1
    print(sha[:7], stamp, "fichas nuevas:", new)
run.dump(run.SEEN, seen)
print("seen.json:", len(seen), "fichas")
