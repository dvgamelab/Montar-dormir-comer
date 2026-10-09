"""Ciclo21 (ciclo21.com): calendario de ciclocross de la temporada (pruebas UCI y Copa de España).

Una tabla por mes con fecha, prueba, lugar, país y categoría; se quedan las de España (ESP).
"""
import datetime as dt
import html
import re

from common import Ride, session, log

URL = "https://www.ciclo21.com/calendario-cx-{a}-{b}/"


def _txt(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def parse(page, url):
    out = []
    for tr in re.findall(r"<tr.*?</tr>", page, re.S):
        c = [_txt(x) for x in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)]
        if len(c) < 4 or c[3].upper() not in ("ESP", "ESPAÑA", "SPAIN"):
            continue
        m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", c[0])
        if not m:
            continue
        cat = c[4] if len(c) > 4 else ""
        out.append(Ride(
            source="ciclo21", source_url=url, name=c[1], date=f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}",
            city=re.sub(r"\s*\(.*?\)", "", c[2]).strip(), kind=f"Ciclocross {cat}".strip(),
            categories="Elite, Sub23, Junior, Master" if cat else "",
        ))
    return out


def fetch(cache, **_):
    s, out = session(), []
    y = dt.date.today().year
    for a in (y - 1, y):  # temporada de invierno: «2025-2026» y «2026-2027»
        url = URL.format(a=a, b=a + 1)
        r = s.get(url, timeout=40)
        if r.status_code != 200:
            continue
        if r.url.rstrip("/") != url.rstrip("/") and any(x.source_url == r.url for x in out):
            continue  # la temporada pasada redirige a la actual
        rows = [x for x in parse(r.text, r.url) if (x.name, x.date) not in {(o.name, o.date) for o in out}]
        log.info("ciclo21 %d-%d: %d pruebas en España", a, a + 1, len(rows))
        out += rows
    return out
