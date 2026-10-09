"""Recolector diario de pruebas de bici de España.

    python scraper/run.py                        # todas las fuentes
    python scraper/run.py --only federaciones    # una fuente (el resto usa su último volcado)
    python scraper/run.py --build-only           # no descarga; rehace web/data/rides.json

Escribe web/data/rides.json (lo lee la app), data/raw/<fuente>.json, data/status.json y
data/dedupe_report.json (qué fichas se han unido y por qué).
"""
import argparse
import datetime as dt
import hashlib
import html
import logging
import os
import re
import sys
import time
import traceback
from collections import Counter
from difflib import SequenceMatcher

sys.path.insert(0, os.path.dirname(__file__))

from common import classify, dump, fold, track_stats, haversine, load, log, parse_distances, session  # noqa: E402
import geo  # noqa: E402
from sources import federaciones, ciclisme_cat, ciclink, ciclo21, pedalesyzapatillas, alltricks  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
RAW = os.path.join(DATA, "raw")
CACHE = os.path.join(DATA, "cache")
OUT = os.path.join(ROOT, "web", "data", "rides.json")

SOURCES = {
    "federaciones": federaciones,
    "ciclisme.cat": ciclisme_cat,
    "ciclink": ciclink,
    "ciclo21": ciclo21,
    "pedalesyzapatillas": pedalesyzapatillas,
    "alltricks": alltricks,
}
# prioridad para nombre, fecha y datos cuando una prueba sale en varias fuentes
PRIORITY = list(SOURCES)
LABEL = {
    "federaciones": "RFEC y federaciones", "ciclisme.cat": "Federació Catalana", "ciclink": "Ciclink", "ciclo21": "Ciclo21", "pedalesyzapatillas": "Pedales y Zapatillas", "alltricks": "Alltricks",
}


# ------------------------------------------------------------------ municipios

class Towns:
    """8.155 municipios (IGN) con su centro: sitúa las pruebas sin geocodificar y corrige nombres gritados."""

    def __init__(self):
        self.idx = {}
        for name, lat, lon, prov in load(os.path.join(ROOT, "web", "data", "municipios.json"), []):
            variants = {name, *name.split("/")}
            for v in list(variants):
                m = re.match(r"^(.*), (el|la|los|las|l'|lo|o|a|os|as|es|sa|ses)$", v.strip(), re.I)
                if m:
                    variants.add(f"{m.group(2)} {m.group(1)}")
            for v in variants:
                self.idx.setdefault(fold(v), []).append((name.split("/")[0], lat, lon, prov))

    def find(self, text, prov=None):
        """Busca el municipio en «Aiacor - Canals», «Centro cívico, Torre Pacheco», «Vigo- Skatepark»…"""
        if not text:
            return None
        t = re.sub(r"\([^)]*\)", " ", text)
        parts = [t] + [p for p in re.split(r"\s*[-,/·|]\s*|\s+y\s+", t) if p.strip()]
        for p in parts:
            cands = self.idx.get(fold(p).replace("  ", " "), [])
            if prov:
                # la federación a veces pone la provincia de su sede («Ólvega (Zaragoza)»): si el nombre es único en España, vale
                cands = [c for c in cands if c[3] == prov] or cands[:1] if len(cands) == 1 else [c for c in cands if c[3] == prov]
            if len(cands) == 1 or (cands and not prov):
                return cands[0]
        return None


# ------------------------------------------------------------------ geocoding

class Geocoder:
    """Photon (Komoot, datos OSM) con caché persistente, para lugares que no son un municipio."""

    def __init__(self, path, budget=300):
        self.path, self.budget = path, budget
        self.cache = load(path, {})
        self.s = session()
        self.s.headers["User-Agent"] = "montar-dormir-comer/1.0 (uso personal; calendario de pruebas ciclistas)"
        self.last = 0.0

    def save(self):
        dump(self.path, self.cache)

    def lookup(self, place, province=None):
        if not place:
            return None
        key = fold(f"{place}|{province or ''}")
        if key in self.cache:
            return self.cache[key] or None
        if self.budget <= 0:
            return None
        self.budget -= 1
        w = 0.4 - (time.time() - self.last)
        if w > 0:
            time.sleep(w)
        self.last = time.time()
        hit = None
        try:
            r = self.s.get("https://photon.komoot.io/api/", timeout=20, params={
                "q": ", ".join(x for x in [place, province] if x), "limit": 1, "bbox": "-18.5,27.5,4.6,44.0"})
            for f in r.json().get("features", []):
                if f["properties"].get("countrycode") == "ES":
                    lon, lat = f["geometry"]["coordinates"]
                    hit = (lat, lon)
        except Exception as e:  # noqa: BLE001
            log.warning("geocode %s: %s", place, e)
            return None
        val = {}
        if hit and geo.in_spain(*hit):
            prov = geo.province_at(*hit)
            if not province or prov == province:
                val = {"lat": round(hit[0], 5), "lon": round(hit[1], 5), "province": prov}
        self.cache[key] = val
        return val or None


class Tracks:
    """Km, desnivel y punto de salida de los GPX publicados (caché por URL). El recorrido simplificado se
    guarda en web/data/tracks/<id>.json: los GPX no se pueden leer desde el navegador (sin CORS)."""

    def __init__(self, path, budget=300):
        self.path, self.budget, self.cache = path, budget, load(path, {})
        self.s = session()
        self.dir = os.path.join(ROOT, "web", "data", "tracks")
        os.makedirs(self.dir, exist_ok=True)
        self.used = set()

    def get(self, url):
        if not url:
            return None
        tid = hashlib.md5(url.encode()).hexdigest()[:12]
        fpath = os.path.join(self.dir, f"{tid}.json")
        hit = self.cache.get(url)
        if hit is not None and (not hit or os.path.exists(fpath)):
            if hit:
                self.used.add(tid)
            return {**hit, "trk": tid} if hit else None
        if self.budget <= 0:
            return None
        self.budget -= 1
        val = {}
        try:
            r = self.s.get(url, timeout=40)
            if r.ok and len(r.content) < 25_000_000:
                val = track_stats(r.content) or {}
        except Exception as e:  # noqa: BLE001
            log.warning("gpx %s: %s", url, e)
            return None
        if val.get("pts"):
            dump(fpath, {"pts": val.pop("pts"), "km": val["km"], "dplus": val.get("dplus")})
            self.used.add(tid)
        val.pop("pts", None)
        self.cache[url] = val
        return {**val, "trk": tid} if val else None

    def clean(self):
        for f in os.listdir(self.dir):
            if f.endswith(".json") and f[:-5] not in self.used:
                os.remove(os.path.join(self.dir, f))


# --------------------------------------------------------------- deduplicado

STOP = set("""de del la las el los y i e a en al por para the of da do das dos d l 2025 2026 2027 2028 edicion ed edicio""".split())
# palabras de ciclismo que no identifican una prueba concreta
WEAK = set("""marcha marxa btt mtb bike bici bicicleta cicloturista cicloturistica ciclodeportiva ciclista ciclismo gran fondo granfondo
gravel ruta rutas trofeo trofeu memorial copa open rally xco xcm xc maraton marato media mitja carrera cursa race challenge desafio
ciclocross cx cross gp premio ayuntamiento ayto ajuntament concello villa vila ciudad ciutat club cc cd team extreme extrem xtrem
experience classic clasica classica tour volta vuelta circuito circuit liga lliga serie series campeonato campionat espana espanya
cycling cyclocross e ebike puertos puerto picos cimas etapa etapas prueba open trofeo solidaria solidario popular internacional
nacional provincial comunidad valenciana andalucia catalunya galicia madrid by fondo enduro descenso dh xcum xcmm km k""".split())
ALIAS = {"castello": "castellon", "alacant": "alicante", "lerida": "lleida", "gerona": "girona", "eivissa": "ibiza", "sant": "san",
         "donostia": "sebastian", "gasteiz": "vitoria", "iruna": "pamplona", "bizkaia": "vizcaya", "gipuzkoa": "guipuzcoa",
         "araba": "alava", "ourense": "orense", "marxa": "marcha", "cicloturistica": "cicloturista", "mitja": "media",
         "marato": "maraton", "cursa": "carrera", "volta": "vuelta", "trofeu": "trofeo", "classica": "clasica", "muntanya": "montana"}
ROMAN = re.compile(r"^(?=[mdclxvi]+$)m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$")
GENERIC = set()


def name_key(name):
    t = " ".join(ALIAS.get(w, w) for w in fold(name).split())
    t = re.sub(r"\b(19|20)\d\d\b", " ", t)
    t = re.sub(r"\b\d+\s*(a|o|e|th|st|nd|rd|era|er|na|ena|ª|º)?\b(?!\s*k)", " ", t)
    return " ".join(w for w in t.split() if not ROMAN.match(w) and w not in STOP)


def tokens(name):
    return {w for w in name_key(name).split() if len(w) >= 2 and not w.isdigit()}


def overlap(a, b, slack=1):
    """Fechas compatibles: mismo día, ±1 día o rangos de varios días que se solapan."""
    a0, a1 = a["date"], a.get("end") or a["date"]
    b0, b1 = b["date"], b.get("end") or b["date"]
    d = lambda x, n: (dt.date.fromisoformat(x) + dt.timedelta(days=n)).isoformat()  # noqa: E731
    return a0 <= d(b1, slack) and b0 <= d(a1, slack)


def pair_score(r, o):
    d = haversine(r["lat"], r["lon"], o["lat"], o["lon"]) if r.get("lat") and o.get("lat") else None
    exact = not (r.get("approx") or o.get("approx"))
    if d is not None and exact and d > 30:
        return 0  # dos sitios fiables a más de 30 km: pruebas distintas
    same_town = bool(r.get("town")) and r.get("town") == o.get("town")
    near = same_town or (d is not None and d < 12 and exact)
    same_prov = r.get("province") and r.get("province") == o.get("province")
    town_words = set(fold(r.get("town", "")).split()) | set(fold(o.get("town", "")).split())
    a, b = r["_tok"] - WEAK - GENERIC - town_words, o["_tok"] - WEAK - GENERIC - town_words
    ka, kb = " ".join(sorted(a)), " ".join(sorted(b))
    ratio = SequenceMatcher(None, ka, kb).ratio() if ka and kb else 0
    shared = {w for w in a & b if len(w) >= 3}
    da, db = r.get("distances") or [], o.get("distances") or []
    dist_ok = not (da and db) or any(abs(x - y) <= max(3, 0.15 * max(x, y)) for x in da for y in db)
    same_day = r["date"] == o["date"]
    diff_mod = r["mod"] != o["mod"] and "other" not in (r["mod"], o["mod"]) and {r["mod"], o["mod"]} != {"mtb", "ebike"}
    if diff_mod and not same_day:
        return 0  # «Maratón BTT» el sábado y «Gravel» el domingo en el mismo pueblo: dos pruebas
    if a and b and not shared and (ratio < 0.88 or min(len(ka), len(kb)) < 10):
        return 0
    if not (a and b):  # nombre solo genérico ("Marcha BTT", "Trofeo Ayuntamiento de X"): manda el sitio
        if not same_day or not near:
            return 0
        full = SequenceMatcher(None, r["_key"], o["_key"]).ratio()
        return 0.7 if (full >= 0.75 or r["mod"] == o["mod"]) and dist_ok else 0
    sim = len(a & b) / len(a | b)
    if len(a & b) >= 2 and (a <= b or b <= a):
        sim = max(sim, 0.75)
    score = max(sim, ratio - 0.1 if min(len(ka), len(kb)) >= 10 else 0) + (0.25 if near else 0)
    if shared and (near or (same_prov and (d is None or d < 30 or not exact))):
        score = max(score, 0.62)
    if shared and not same_prov and not near and r.get("province") and o.get("province"):
        score -= 0.3
    if not dist_ok:
        score -= 0.15
    if diff_mod:
        score -= 0.2
    if not same_day and not (r.get("end") or o.get("end")):
        score = score - 0.2 if (ratio >= 0.85 or sim >= 0.75) else 0
    return score


def same_listing(r, o):
    """La misma prueba dada de alta dos veces en el calendario federativo: mismo día y pueblo, nombre casi igual."""
    if r["date"] != o["date"] or not r.get("town") or r.get("town") != o.get("town"):
        return False
    a, b = set(r["_key"].split()), set(o["_key"].split())
    da, db = r.get("distances") or [], o.get("distances") or []
    if da and db and not any(abs(x - y) <= max(3, 0.12 * max(x, y)) for x in da for y in db):
        return False  # Máster 30 y Máster 60: carreras distintas el mismo día
    return SequenceMatcher(None, r["_key"], o["_key"]).ratio() >= 0.85 or (a and b and (a <= b or b <= a))


def dedupe(rows):
    df = Counter(w for k in {name_key(r["name"]) for r in rows} for w in set(k.split()))
    GENERIC.clear()
    GENERIC.update(w for w, n in df.items() if n >= 8)
    log.info("palabras genéricas: %d (p. ej. %s)", len(GENERIC), ", ".join(sorted(GENERIC)[:15]))
    rows = sorted(rows, key=lambda x: (x["date"], PRIORITY.index(x["source"])))
    clusters, by_day = [], {}
    for r in rows:
        r["_key"] = name_key(r["name"])
        cands = []
        for dd in range(-3, 2):
            day = (dt.date.fromisoformat(r["date"]) + dt.timedelta(days=dd)).isoformat()
            cands += by_day.get(day, [])
        best, bs, via = None, 0.0, None
        for c in cands:
            for o in c:
                if o["source"] == r["source"] and r["source"] in ("federaciones", "ciclisme.cat") and not same_listing(r, o):
                    continue  # dentro de una federación cada id suele ser una prueba distinta (salvo altas repetidas)
                if not overlap(r, o):
                    continue
                sc = pair_score(r, o)
                if sc > bs:
                    best, bs, via = c, sc, o
        if best is not None and bs >= 0.6:
            r["_why"] = f'{bs:.2f} ~ {via["source"]}: {via["name"]}'
            best.append(r)
        else:
            c = [r]
            clusters.append(c)
            by_day.setdefault(r["date"], []).append(c)
    for c in clusters:
        c.sort(key=lambda x: PRIORITY.index(x["source"]))
    return clusters


# ------------------------------------------------------------------ salida

SMALL = {"de", "del", "la", "las", "el", "los", "y", "i", "e", "a", "en", "al", "per", "por", "d", "l", "o", "da", "do", "das", "dos"}
KEEP_UP = {"btt", "mtb", "xco", "xcm", "xcc", "xcum", "cx", "gp", "cc", "cd", "ud", "uc", "dh", "bmx", "rfec", "uci", "ebike", "e-bike", "kdd", "fcc"}


def tidy(s):
    """Pasa a formato título los nombres en MAYÚSCULAS («XXVIII MARCHA BTT MONTES DE REQUENA»)."""
    s = re.sub(r"\s+", " ", html.unescape(s or "")).strip(" -·")
    letters = [ch for ch in s if ch.isalpha()]
    if not letters or sum(ch.isupper() for ch in letters) / len(letters) < 0.7:
        return s
    out = []
    for i, w in enumerate(s.lower().split(" ")):
        bare = w.strip("().,\"'“”")
        if re.fullmatch(r"[ivxlcdm]+", bare) and len(bare) <= 6 and bare not in ("di", "mil", "dim", "mix", "vi" * 0 + "lid"):
            out.append(w.upper())
        elif bare in KEEP_UP:
            out.append(w.upper())
        elif i and w in SMALL:
            out.append(w)
        elif re.fullmatch(r"\d+k", bare):
            out.append(w.upper())
        else:
            out.append(re.sub(r"(^|[-'’(/“\"])(\w)", lambda m: m.group(1) + m.group(2).upper(), w))
    return " ".join(out)


def merge(c):
    first = lambda k: next((x[k] for x in c if x.get(k)), "")  # noqa: E731
    exact = [x for x in c if x.get("lat") and x.get("exact")]
    loc = exact[0] if exact else next((x for x in c if x.get("lat") and not x.get("approx")), None) or next((x for x in c if x.get("lat")), {})
    dists = []
    for x in sorted(c, key=lambda x: (not x.get("gpx_km"), PRIORITY.index(x["source"]))):
        for d in x.get("distances", []):
            if all(abs(d - e) > max(2, 0.06 * d) for e in dists):
                dists.append(d)
    dists.sort()
    mods = [x for x in c if x["mod"] != "other"]
    main = mods[0] if mods else c[0]
    name = tidy(c[0]["name"])
    rid = hashlib.md5(f"{c[0]['date']}|{c[0]['source']}|{c[0]['source_url']}|{name_key(c[0]['name'])}".encode()).hexdigest()[:10]
    srcs, seen = [], set()
    for x in c:
        key = (x["source"], x["source_url"])
        if key not in seen:
            seen.add(key)
            srcs.append({"n": LABEL[x["source"]], "u": x["source_url"]})
    web = next((x["website"] for x in c if x.get("website") and not re.search(r"facebook|instagram|youtube", x["website"])), "") or first("website")
    docs = []
    for x in c:
        for dd in x.get("docs") or []:
            if dd["u"] not in {y["u"] for y in docs}:
                docs.append(dd)
    end = max((x.get("end") or "") for x in c)
    out = {
        "id": rid, "name": name, "date": c[0]["date"], "end": end if end > c[0]["date"] else "", "time": first("time"),
        "city": tidy(loc.get("town") or first("town") or first("city")), "province": loc.get("province") or first("province"),
        "ccaa": loc.get("ccaa") or first("ccaa"),
        "lat": round(loc["lat"], 5) if loc.get("lat") else None, "lon": round(loc["lon"], 5) if loc.get("lon") else None,
        "approx": bool(loc.get("approx")) if loc else True, "start": bool(loc.get("exact")),
        "mod": main["mod"], "disc": main["disc"], "fmt": main["fmt"],
        "dist": [round(d, 1) for d in dists][:8], "elev": next((x["elevation"] for x in c if x.get("elevation")), None),
        "kind": first("kind"), "cats": first("categories")[:220], "web": html.unescape(web),
        "reg": html.unescape(first("registration")), "gpx": first("gpx"), "trk": first("trk"), "docs": docs[:5], "price": first("price"),
        "fed": any(x.get("fed_only") for x in c), "club": tidy(first("club")), "img": html.unescape(first("image")),
        "desc": first("description")[:300], "ebike": any(re.search(r"e ?bike|electric", fold(f'{x["name"]} {x.get("categories", "")} {x.get("kind", "")}')) for x in c),
        "x": all(x.get("cancelled") for x in c), "src": srcs, "_keys": [seen_key(x) for x in c],
    }
    return {k: v for k, v in out.items() if v not in ("", None, [], False)}


# Fuentes cuyo enlace es una página común a muchas pruebas (blogs): la ficha se identifica por nombre y fecha.
SHARED_URL = {"pedalesyzapatillas", "alltricks", "ciclo21"}


def seen_key(x):
    if x["source"] in SHARED_URL:
        return f'{x["source"]}|{name_key(x["name"])}|{x["date"][:7]}'
    return x["source_url"]


NEWS = os.path.join(ROOT, "web", "data", "news.json")
SEEN = os.path.join(DATA, "seen.json")


def mark_new(merged, now=None):
    """Fecha en que cada prueba apareció por primera vez (por sus fichas en las fuentes).

    Una prueba es nueva solo si TODAS sus fichas son nuevas: si ya estaba en otra web, no cuenta.
    Escribe web/data/news.json (lo añadido en los últimos 30 días), que leen la app y los avisos de la APK."""
    now = now or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    seen = load(SEEN, None)
    first_run = seen is None
    seen = seen or {}
    for m in merged:
        keys = m.pop("_keys", [])
        for k in keys:
            seen.setdefault(k, "base" if first_run else now)
        vals = [seen[k] for k in keys]
        if vals and "base" not in vals:
            m["added"] = min(vals)
    dump(SEEN, seen)
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30)).strftime("%Y-%m-%dT%H:%MZ")
    keep = ("id", "name", "date", "end", "time", "city", "province", "ccaa", "mod", "disc", "fmt", "dist", "elev", "ebike", "lat", "lon", "added")
    news = sorted((m for m in merged if m.get("added", "") >= cutoff), key=lambda m: m["added"], reverse=True)
    dump(NEWS, {"generated": now, "rides": [{k: m[k] for k in keep if k in m} for m in news]})
    log.info("novedades: %d pruebas nuevas en los últimos 30 días", len(news))


# ------------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="fuentes a refrescar")
    ap.add_argument("--build-only", action="store_true", help="no descargar; reconstruir desde data/raw")
    ap.add_argument("--details", type=int, default=int(os.environ.get("DETAIL_BUDGET", 600)))
    ap.add_argument("--geocode-budget", type=int, default=int(os.environ.get("GEOCODE_BUDGET", 400)))
    ap.add_argument("--gpx-budget", type=int, default=int(os.environ.get("GPX_BUDGET", 400)))
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    for d in (RAW, CACHE, os.path.dirname(OUT)):
        os.makedirs(d, exist_ok=True)

    status = load(os.path.join(DATA, "status.json"), {})
    for name, mod in SOURCES.items():
        if args.build_only or (args.only and name not in args.only):
            continue
        cpath = os.path.join(CACHE, f"{name}.json")
        cache = load(cpath, {})
        t0 = time.time()
        try:
            rows = [r.to_dict() for r in mod.fetch(cache, max_details=args.details)]
            if not rows:
                raise RuntimeError("0 pruebas: ¿ha cambiado la web?")
            prev = len(load(os.path.join(RAW, f"{name}.json"), []))
            if prev >= 50 and len(rows) < prev * 0.7:  # caída brusca = bloqueo o web cambiada: no perder datos buenos
                raise RuntimeError(f"solo {len(rows)} pruebas frente a {prev} la vez anterior; se conservan los datos previos")
            dump(os.path.join(RAW, f"{name}.json"), rows)
            status[name] = {"ok": True, "count": len(rows), "at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "secs": round(time.time() - t0)}
        except Exception as e:  # noqa: BLE001 — una fuente caída no tumba el resto
            traceback.print_exc()
            status[name] = {**status.get(name, {}), "ok": False, "error": str(e)[:300],
                            "failed_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
        dump(cpath, cache)
    status = {k: v for k, v in status.items() if k in SOURCES}  # fuentes retiradas fuera del estado
    dump(os.path.join(DATA, "status.json"), status)
    build(status, args.geocode_budget, args.gpx_budget)


# provincias/regiones que algunas webs ponen a pruebas del extranjero
FOREIGN = re.compile(r"\b(alemania|francia|fran[cç]a|portugal|italia|andorra|marruecos|reino unido|inglaterra|irlanda|suiza|austria|holanda|"
                     r"pa[ií]ses bajos|b[eé]lgica|bèlgica|eslov[eè]nia|grecia|jap[oó]n|china|cuba|m[eé]xico|argentina|chile|"
                     r"colombia|per[uú]|estados unidos|eeuu|usa)\b|^ue-", re.I)


def build(status, geocode_budget=400, gpx_budget=400):
    today = dt.date.today().isoformat()
    towns = Towns()
    gc = Geocoder(os.path.join(CACHE, "geocode.json"), budget=geocode_budget)
    tracks = Tracks(os.path.join(CACHE, "gpx.json"), budget=gpx_budget)
    rows, dropped = [], Counter()
    for name in SOURCES:
        for r in load(os.path.join(RAW, f"{name}.json"), []):
            if not r.get("date") or (r.get("end") or r["date"]) < today:
                continue
            cl = classify(r["name"], r.get("kind", ""), r.get("categories", ""), strict=False)
            if not cl:
                dropped[name] += 1
                continue
            r["mod"], r["disc"], r["fmt"] = cl
            off = re.search(r"[\s(*-]*\b(anul[·.l]?lad[ao]|anulad[ao]|suspendid[ao]|suspes[ao]?|aplazad[ao]|cancelad[ao]|ajornad[ao])\b[\s)*]*", r["name"], re.I)
            if off:
                r["cancelled"] = True
                r["name"] = (r["name"][:off.start()] + " " + r["name"][off.end():]).strip(" -·*")
            if r["mod"] == "other":  # «Berrea Bike Experience»: la descripción o las inscripciones dicen si es BTT, gravel…
                cl2 = classify(f'{r["name"]} {r.get("kind", "")}', r.get("description", ""), r.get("categories", ""))
                if cl2 and cl2[0] != "other":
                    r["mod"], r["disc"], r["fmt"] = cl2
            ds = list(r.get("distances") or [])
            for x in parse_distances(r["name"]):
                if all(abs(x - y) > 1 for y in ds):
                    ds.append(x)
            r["distances"] = sorted(ds)
            rows.append(r)
    log.info("filas válidas: %d · descartadas (no son bici o son de escuelas): %s", len(rows), dict(dropped))

    rows = [r for r in rows if not (FOREIGN.search(r.get("province") or "") or FOREIGN.search(r.get("region") or "")
                                    or fold(r.get("province", "")) in ("franca", "altres"))]
    for r in rows:
        paren = re.search(r"\(([^()]+)\)", r.get("city", ""))
        prov = (geo.norm_province(paren.group(1)) if paren else None) or geo.norm_province(r.get("province", "")) or \
            geo.norm_province(r.get("city", "")) or (geo.norm_province(r.get("region", "")) if r.get("region") else None)
        t = tracks.get(r.get("gpx"))
        if t:
            if t.get("km") and 3 < t["km"] < 2500 and all(abs(t["km"] - d) > max(2, 0.08 * d) for d in r["distances"]):
                r["distances"] = sorted(r["distances"] + [t["km"]])
            r["gpx_km"] = t.get("km")
            r["trk"] = t["trk"]
            r["elevation"] = r.get("elevation") or t.get("dplus")
            if t.get("lat") and geo.in_spain(t["lat"], t["lon"]) and (not prov or geo.province_at(t["lat"], t["lon"]) in (prov, None)):
                r["lat"], r["lon"], r["exact"] = t["lat"], t["lon"], True
        town = towns.find(r.get("city", ""), prov) or (towns.find(r["name"], prov) if prov else None)
        approx = False
        if r.get("lat") and geo.in_spain(r["lat"], r["lon"]):
            prov = geo.province_at(r["lat"], r["lon"]) or prov
            if not town:
                town = towns.find(r.get("city", ""), prov)
        elif town:
            r["lat"], r["lon"] = town[1], town[2]
            prov = prov or town[3]
        elif (hit := gc.lookup(re.sub(r"\([^)]*\)", "", r.get("city", "")).strip(" -,"), prov)):
            r["lat"], r["lon"] = hit["lat"], hit["lon"]
            prov = prov or hit.get("province")
        elif prov:
            r["lat"], r["lon"] = geo.centroid(prov)
            approx = True
        else:
            r["lat"] = r["lon"] = None
        r["town"] = town[0] if town else ""
        r["province"] = prov or ""
        r["ccaa"] = geo.ccaa_of(prov) or geo.norm_ccaa(r.get("region", "")) or ""
        r["approx"] = approx
        r["_tok"] = tokens(r["name"])
    gc.save()
    dump(tracks.path, tracks.cache)
    before = len(rows)
    in_es = lambda r: r.get("lat") is not None and 27.4 < r["lat"] < 44.0 and -18.5 < r["lon"] < 4.6  # península, Baleares y Canarias
    rows = [r for r in rows if r["province"] or in_es(r)]  # sin provincia española ni GPS en España: extranjera o sin ubicar
    log.info("descartadas %d fichas fuera de España o sin ubicación", before - len(rows))
    tracks.clean()

    clusters = dedupe(rows)
    merged = [merge(c) for c in clusters]
    report = [{"name": m["name"], "date": m["date"], "merged": [
        f'{x["source"]}: {x["name"]} ({x["date"]}, {x.get("town") or x.get("city", "")})' + (f' [{x["_why"]}]' if x.get("_why") else "") for x in c]}
        for m, c in zip(merged, clusters) if len(c) > 1]
    dump(os.path.join(DATA, "dedupe_report.json"), report)
    merged.sort(key=lambda x: (x["date"], x["name"]))
    log.info("fusiones: %d grupos · pruebas únicas: %d · %s", len(report), len(merged), dict(Counter(m["mod"] for m in merged)))
    mark_new(merged)
    meta = {
        "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "count": len(merged),
        "sources": {k: {"label": LABEL[k], **v} for k, v in status.items() if k in LABEL},
    }
    dump(OUT, {"meta": meta, "rides": merged})


if __name__ == "__main__":
    main()
