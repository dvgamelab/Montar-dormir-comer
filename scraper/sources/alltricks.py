"""Alltricks (blog): calendarios anuales de marchas cicloturistas / gran fondo y de gravel.

Son tablas «Prueba | Lugar | Fecha | (Precio) | Distancia» con filas de mes intercaladas. Pocas pruebas,
pero son las grandes marchas y su distancia de referencia.
"""
import datetime as dt
import html
import re

from common import Ride, parse_distances, parse_elevation, session, log

PAGES = {
    "https://www.alltricks.es/blog/article/calendario-de-marchas-cicloturistas": "Marcha cicloturista",
    "https://www.alltricks.es/blog/article/calendario-gravel-espana": "Gravel",
}
MONTHS = {m: i + 1 for i, m in enumerate("enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split())}


def _txt(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<br\s*/?>", " / ", re.sub(r"<(?!br)[^>]+>", " ", s or "")))).strip(" /")


def parse(page, kind, url):
    out, year = [], dt.date.today().year
    for table in re.findall(r"<table.*?</table>", page, re.S):
        cols = None
        for tr in re.findall(r"<tr.*?</tr>", table, re.S):
            cells = [_txt(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)]
            low = [c.lower() for c in cells]
            if "fecha" in low:
                cols = {k: low.index(k) for k in ("lugar", "fecha", "distancia", "precio") if k in low}
                continue
            if not cells or not cols:
                continue
            my = re.match(r"([a-záéíóú]+)\s+(\d{4})$", low[0])
            if my and not any(cells[1:]):
                year = int(my.group(2))
                continue
            date = cells[cols["fecha"]] if len(cells) > cols["fecha"] else ""
            m = re.search(r"(\d{1,2})\s*(?:[-–al y]+\s*(\d{1,2}))?\s+de\s+([a-záéíóú]+)", date.lower())
            if not m or m.group(3) not in MONTHS:
                continue
            try:
                d0 = dt.date(year, MONTHS[m.group(3)], int(m.group(1)))
                d1 = dt.date(year, MONTHS[m.group(3)], int(m.group(2))) if m.group(2) else None
            except ValueError:
                continue
            dist = cells[cols["distancia"]] if "distancia" in cols and len(cells) > cols["distancia"] else ""
            place = cells[cols["lugar"]] if len(cells) > cols["lugar"] else ""
            price = cells[cols["precio"]] if "precio" in cols and len(cells) > cols["precio"] else ""
            out.append(Ride(
                source="alltricks", source_url=url, name=cells[0], date=d0.isoformat(),
                end=d1.isoformat() if d1 and d1 > d0 else "", city=place.split(",")[0].strip(), region=", ".join(place.split(",")[1:]).strip(" ."),
                distances=parse_distances(dist.replace("K", " km")), elevation=parse_elevation(dist.replace("m", " m desnivel")),
                kind=kind, price=price if "€" in price else "",
            ))
    return out


def fetch(cache, **_):
    s, out = session(), []
    for url, kind in PAGES.items():
        r = s.get(url, timeout=40)
        r.raise_for_status()
        rows = parse(r.text, kind, url)
        log.info("alltricks %s: %d", kind, len(rows))
        out += rows
    return out
