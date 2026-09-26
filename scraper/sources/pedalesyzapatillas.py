"""Pedales y Zapatillas (blog): calendario anual de BTT, gravel, cicloturistas y bikepacking.

Un párrafo por mes con líneas «20D <a href=web>Nombre</a> Pueblo (Provincia)»; aporta la web oficial.
"""
import datetime as dt
import html
import re

from common import Ride, session, log

URL = "https://www.pedalesyzapatillas.com/marchas-btt/calendario-ciclista-{y}-de-pruebas-btt-gravel-cicloturistas-y-lo-que-surja/"
MONTHS = {m: i + 1 for i, m in enumerate("enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split())}


def _txt(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def parse(page, year, url):
    out = []
    for m in re.finditer(r"<h3[^>]*>\s*([A-Za-zé]+)\s*</h3>\s*<p[^>]*>(.*?)</p>", page, re.S):
        month = MONTHS.get(m.group(1).strip().lower())
        if not month:
            continue
        for chunk in re.split(r"<br\s*/?>", m.group(2)):
            a = re.search(r'<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', chunk, re.S)
            dm = re.match(r"\s*(\d{1,2})[LMXJVSD](?:-(\d{1,2})[LMXJVSD])*", _txt(chunk))
            if not a or not dm:
                continue
            days = re.findall(r"(\d{1,2})[LMXJVSD]\b", _txt(chunk).split(_txt(a.group(2))[:6])[0])
            name = _txt(re.sub(r"^\s*(?:\d{1,2}[LMXJVSD][-\s]*)+", "", _txt(a.group(2)))) or _txt(a.group(2))
            name = re.sub(r"^I(?=V )", "", name)
            after = _txt(chunk[a.end():])
            pm = re.match(r"(.*?)\(([^()]+)\)", after)
            try:
                d0 = dt.date(year, month, int(days[0] if days else dm.group(1)))
                d1 = dt.date(year, month, int(days[-1])) if len(days) > 1 else None
            except ValueError:
                continue
            if len(name) < 4:
                continue
            out.append(Ride(
                source="pedalesyzapatillas", source_url=url, name=name, date=d0.isoformat(),
                end=d1.isoformat() if d1 and d1 > d0 else "", city=(pm.group(1) if pm else after).strip(" -,"),
                province=pm.group(2).strip() if pm else "", website=html.unescape(a.group(1)),
            ))
    return out


def fetch(cache, **_):
    s, out = session(), []
    y = dt.date.today().year
    for year in (y, y + 1):
        r = s.get(URL.format(y=year), timeout=40)
        if r.status_code != 200:
            continue
        rows = parse(r.text, year, URL.format(y=year))
        log.info("pedalesyzapatillas %d: %d", year, len(rows))
        out += rows
    return out
