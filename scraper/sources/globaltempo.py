"""Global-Tempo (cronometraje e inscripciones, Andalucía oriental): marchas y carreras de BTT/carretera.

La portada lista las próximas pruebas de todos los deportes; se leen las fichas de las que son de bici
(provincia, localidad, hora, distancia, desnivel y precio van en el texto de la ficha).
"""
import html
import re

from common import Ride, Polite, classify, parse_distances, parse_elevation, session, log

BASE = "https://www.global-tempo.com/"


def _txt(s):
    return re.sub(r"[ \t]+", " ", html.unescape(re.sub(r"<[^>]+>", "\n", s or ""))).strip()


def parse_list(page):
    out = []
    for m in re.finditer(r"<a href='carreras\.php\?id=(\d+)'><div class='cuadro_inscripcion'><h1>(.*?)</h1>.*?<h2>(\d{2})-(\d{2})-(\d{4})\s*(\d{2}:\d{2})?", page, re.S):
        out.append({"id": m.group(1), "name": _txt(m.group(2)), "date": f"{m.group(5)}-{m.group(4)}-{m.group(3)}",
                    "time": m.group(6) if m.group(6) and m.group(6) != "00:00" else ""})
    return out


def parse_detail(page):
    t = _txt(page)
    g = lambda rx: (re.search(rx, t, re.I) or [None, ""])[1].strip()  # noqa: E731
    body = t.split("Localidad", 1)[-1][:3000]
    price = re.search(r"PRECIO:?\s*(.{0,120}?\d+\s*€)", body, re.I)
    return {"prov": g(r"Provincia\s*:\s*([^\n]+)"), "city": g(r"Localidad\s*:\s*([^\n]+)"), "text": body,
            "price": price.group(1).replace("\n", " ") if price else ""}


def fetch(cache, max_details=120, **_):
    s, pol = session(), Polite(0.6)
    r = s.get(BASE, timeout=40)
    r.raise_for_status()
    r.encoding = "latin-1"
    items = [x for x in parse_list(r.text) if classify(x["name"], strict=True)]
    log.info("global-tempo: %d pruebas de bici", len(items))
    det, out, budget = cache.setdefault("detail", {}), [], max_details
    for x in items:
        if x["id"] not in det and budget > 0:
            budget -= 1
            pol.wait()
            try:
                rr = s.get(f"{BASE}carreras.php", params={"id": x["id"]}, timeout=40)
                rr.encoding = "latin-1"
                det[x["id"]] = parse_detail(rr.text)
            except Exception as e:  # noqa: BLE001
                log.warning("global-tempo %s: %s", x["id"], e)
        d = det.get(x["id"], {})
        out.append(Ride(
            source="global-tempo", source_url=f"{BASE}carreras.php?id={x['id']}", name=x["name"], date=x["date"], time=x["time"],
            city=d.get("city", "").title(), province=d.get("prov", "").title(), distances=parse_distances(d.get("text", "")[:1500]),
            elevation=parse_elevation(d.get("text", "")), registration=f"{BASE}carreras.php?id={x['id']}", price=d.get("price", ""),
            description=re.sub(r"\s+", " ", d.get("text", ""))[:300],
        ))
    return out
