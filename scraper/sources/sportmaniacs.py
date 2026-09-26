"""Sportmaniacs (plataforma de inscripciones): próximas pruebas de todos los deportes.

El listado /es/races?page=N solo trae nombre, fecha y pueblo; se quedan las que parecen de bici y de
cada una se lee su ficha (JSON-LD SportsEvent: provincia, fechas, precios y modalidades de inscripción).
"""
import html
import json
import re

from common import Ride, Polite, classify, parse_distances, parse_elevation, session, log

BASE = "https://sportmaniacs.com"


def parse_list(page):
    out = []
    for m in re.finditer(r'<a data-event="Ver carrera"[^>]*href="(/es/races/[^"]+)"(.*?)</article>', page, re.S):
        body = m.group(2)
        name = re.search(r'alt="([^"]+)"', body)
        if name:
            out.append({"url": BASE + m.group(1), "name": html.unescape(name.group(1)).strip()})
    return out


def parse_detail(page):
    for raw in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S):
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        for ev in data if isinstance(data, list) else [data]:
            if ev.get("@type") != "SportsEvent":
                continue
            addr = (ev.get("location") or {}).get("address") or {}
            offers = ev.get("offers") or []
            text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>", " ", page, flags=re.S)))
            desc = ""
            m = re.search(r'<meta name="description" content="([^"]*)"', page)
            if m:
                desc = html.unescape(m.group(1))
            return {
                "name": ev.get("name", ""), "date": (ev.get("startDate") or "")[:10], "end": (ev.get("endDate") or "")[:10],
                "city": addr.get("addressLocality") or (ev.get("location") or {}).get("name", ""), "prov": addr.get("addressRegion", ""),
                "country": addr.get("addressCountry", ""), "image": ev.get("image", ""),
                "offers": [f'{o.get("name", "")} {o.get("price", "")}€' for o in offers][:8],
                "prices": sorted({float(o["price"]) for o in offers if re.fullmatch(r"[\d.]+", str(o.get("price", "")))}),
                "text": f'{" ".join(o.get("name", "") for o in offers)} {desc} {text[:6000]}', "desc": desc,
            }
    return None


def fetch(cache, max_details=300, **_):
    s = session()
    pol = Polite(0.5)
    items, seen = [], set()
    for page in range(1, 60):
        pol.wait()
        r = s.get(f"{BASE}/es/races", params={"page": page}, timeout=40)
        if r.status_code != 200:
            break
        got = [x for x in parse_list(r.text) if x["url"] not in seen]
        if not got:
            break
        seen.update(x["url"] for x in got)
        items += got
    bike = [x for x in items if classify(x["name"], strict=True)]
    log.info("sportmaniacs: %d pruebas próximas, %d parecen de bici", len(items), len(bike))
    det = cache.setdefault("detail", {})
    budget, out = max_details, []
    for x in bike:
        if x["url"] not in det and budget > 0:
            budget -= 1
            pol.wait()
            try:
                det[x["url"]] = parse_detail(s.get(x["url"], timeout=40).text)
            except Exception as e:  # noqa: BLE001
                log.warning("sportmaniacs %s: %s", x["url"], e)
        d = det.get(x["url"])
        if not d or not d["date"] or (d["country"] and d["country"] not in ("España", "Spain", "ES")):
            continue
        pr = d["prices"]
        out.append(Ride(
            source="sportmaniacs", source_url=x["url"], name=d["name"] or x["name"], date=d["date"],
            end=d["end"] if d["end"] > d["date"] else "", city=d["city"], province=d["prov"],
            distances=parse_distances(d["text"][:3000]), elevation=parse_elevation(d["text"]),
            kind=" · ".join(d["offers"])[:200], registration=x["url"], image=d["image"],
            price=(f"{pr[0]:g} €" if len(pr) == 1 else f"{pr[0]:g}–{pr[-1]:g} €") if pr else "",
            description=d["desc"][:300],
        ))
    return out
