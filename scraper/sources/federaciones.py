"""RFEC y federaciones autonómicas (plataforma común «smartweb» de yosoyciclista).

Cada federación publica su calendario en /es/smartweb/seccion/calendario/<fed>/<año>. La tabla trae
fecha, modalidad, categorías, prueba, lugar (provincia) y club; la ventana de cada prueba, sus
ficheros (track GPX, rutómetro, reglamento) y la página de inscripción trae hora, precio y límite.
Una misma prueba aparece en la RFEC y en su federación: se une por su identificador.
"""
import datetime as dt
import html
import re

from common import Ride, Polite, session, log

# federación → dominio propio (rfec.com redirige a cada uno)
FEDS = {
    "rfec": "rfec.com", "andalucia": "andaluciaciclismo.com", "aragon": "aragonciclismo.com",
    "asturias": "ciclismoasturiano.es", "baleares": "webfcib.es", "canarias": "ciclismocanario.es",
    "cantabria": "fcciclismo.com", "castillalamancha": "rfec.com", "castillaleon": "fedciclismocyl.com",
    "extremadura": "ciclismoextremadura.es", "galicia": "fgalegaciclismo.es", "madrid": "fmciclismo.com",
    "murcia": "rfec.com", "navarra": "fnciclismo.es", "euskadi": "fvascicli.eus", "larioja": "yosoyciclista.com",
    "valenciana": "fccv.es", "melilla": "melillaciclismo.com", "ceuta": "yosoyciclista.com",
}
LABEL = {"rfec": "RFEC", "andalucia": "F. Andaluza", "aragon": "F. Aragonesa", "asturias": "F. Asturiana", "baleares": "F. Balear",
         "canarias": "F. Canaria", "cantabria": "F. Cántabra", "castillalamancha": "F. Castilla-La Mancha",
         "castillaleon": "F. Castilla y León", "extremadura": "F. Extremeña", "galicia": "F. Galega", "madrid": "F. Madrileña",
         "murcia": "F. Murciana", "navarra": "F. Navarra", "euskadi": "F. Vasca", "larioja": "F. Riojana",
         "valenciana": "F. C. Valenciana", "melilla": "F. Melillense", "ceuta": "F. Ceutí"}
MONTHS = {"ENE": 1, "FEB": 2, "MAR": 3, "ABR": 4, "MAY": 5, "JUN": 6, "JUL": 7, "AGO": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DIC": 12}


def _txt(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def parse_calendar(page: str, fed: str, host: str):
    """Filas de la tabla + datos de su ventana (modal)."""
    out = []
    modals = {m.group(1): m.group(2) for m in re.finditer(r'<div class="modal fade" id="prueba(\d+)"(.*?)(?=<div class="modal fade" id="prueba|<tr style=|$)', page, re.S)}
    for row in re.findall(r'<tr style="background-color:[^"]*">(.*?)</tr>', page, re.S):
        pid = re.search(r'data-target="#prueba(\d+)"', row)
        tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if not pid or len(tds) < 7:
            continue
        pid = pid.group(1)
        ts = re.search(r"\b(1\d{9})\b", tds[0])
        days = re.findall(r"(\d{1,2})\s*<br>\s*([A-Z]{3})", tds[0]) or re.findall(r"(\d{1,2})\s+([A-Z]{3})", _txt(tds[0]))
        if not ts or not days:
            continue
        start = dt.datetime.utcfromtimestamp(int(ts.group(1)) + 7200).date()  # medianoche en Madrid
        end = ""
        if len(days) > 1 and days[-1][1] in MONTHS:
            d, mname = days[-1]
            y = start.year + (1 if MONTHS[mname] < start.month else 0)
            try:
                end = dt.date(y, MONTHS[mname], int(d)).isoformat()
            except ValueError:
                end = ""
        m = modals.get(pid, "")
        cats = re.search(r"CATEGOR[ÍI]AS:\s*</b></span>(.*?)</p>", m, re.S)
        tipo = re.search(r"TIPO:\s*</b></span>(.*?)</p>", m, re.S)
        docs = []
        for u, lab in re.findall(r'<a href ?="([^"]+)"[^>]*>.*?<span[^>]*>([^<]+)</span></a>', m, re.S):
            docs.append({"n": _txt(lab).capitalize(), "u": html.unescape(u.strip())})
        reg = re.search(r'href="(https?://[^"]*/smartweb/inscripciones/prueba/[^"]+)"', row)
        place = _txt(tds[5])
        pm = re.match(r"(.*)\(([^()]*)\)\s*$", place)
        out.append({
            "id": pid, "fed": fed, "date": start.isoformat(), "end": end if end and end > start.isoformat() else "",
            "kind": _txt(tds[1]), "cats": _txt(cats.group(1)) if cats else _txt(tds[2]), "tipo": _txt(tipo.group(1)) if tipo else _txt(tds[3]),
            "name": _txt(tds[4]), "place": (pm.group(1) if pm else place).strip(" -,"), "prov": pm.group(2).strip() if pm else "",
            "club": _txt(tds[6]), "obs": _txt(tds[7]) if len(tds) > 7 else "", "docs": docs,
            "reg": html.unescape(reg.group(1)) if reg else "",
            "url": f"https://{host}/index.php/es/smartweb/seccion/calendario/{fed}/{start.year}",
        })
    return out


def parse_inscription(page: str):
    """Hora de salida, precio, límite y si es solo para federados (página de inscripción)."""
    t = _txt(page)
    info = {}
    m = re.search(r"Hora Salida:\s*(\d{1,2}):(\d{2})", t)
    if m:
        info["time"] = f"{int(m.group(1)):02d}:{m.group(2)}"
    m = re.search(r"Importe de la inscripci[oó]n\s*(.{0,160}?)(?:L[ií]mite|Proceso|Fecha L[ií]mite)", t)
    if m:
        info["price"] = m.group(1).strip()[:120]
        info["fed_only"] = bool(re.search(r"s[oó]lo federados", m.group(1), re.I))
    m = re.search(r"L[ií]mite de participantes:\s*(\d+)", t)
    if m:
        info["limit"] = int(m.group(1))
    m = re.search(r"Lugar:\s*(.{2,80}?)\s+Fecha Celebraci", t)
    if m:
        info["place"] = m.group(1).strip()
    return info


def fetch(cache, max_details=400, **_):
    s = session()
    pol = Polite(0.5)
    year = dt.date.today().year
    seen = {}
    for fed, host in FEDS.items():
        for y in (year, year + 1):
            url = f"https://{host}/index.php/es/smartweb/seccion/calendario/{fed}/{y}"
            pol.wait()
            try:
                r = s.get(url, timeout=60)
            except Exception as e:  # noqa: BLE001
                log.warning("federación %s %s: %s", fed, y, e)
                continue
            if r.status_code != 200 or f"/calendario/{fed}/{y}" not in r.url.lower():
                continue  # el año siguiente aún no está publicado (redirige al actual)
            rows = parse_calendar(r.text, fed, host)
            log.info("federación %s %s: %d filas", fed, y, len(rows))
            for row in rows:
                prev = seen.get(row["id"])
                if prev:  # misma prueba en la RFEC y en su federación
                    prev["feds"].add(fed)
                    for k in ("reg", "docs"):
                        prev[k] = prev[k] or row[k]
                    continue
                row["feds"] = {fed}
                seen[row["id"]] = row

    details = cache.setdefault("insc", {})
    today = dt.date.today().isoformat()
    budget = max_details
    out = []
    for row in seen.values():
        if row["reg"] and row["id"] not in details and budget > 0 and row["date"] >= today:
            budget -= 1
            pol.wait()
            try:
                details[row["id"]] = parse_inscription(s.get(row["reg"], timeout=40).text)
            except Exception as e:  # noqa: BLE001
                log.warning("inscripción %s: %s", row["id"], e)
        d = details.get(row["id"], {})
        gpx = next((x["u"] for x in row["docs"] if re.search(r"\.(gpx|kmz|kml)$", x["u"].lower()) or "track" in x["n"].lower()), "")
        feds = sorted(row["feds"], key=lambda f: (f != "rfec", f))
        out.append(Ride(
            source="federaciones", source_url=row["url"].replace(f"/{row['fed']}/", f"/{feds[-1]}/") + f"#prueba{row['id']}", name=row["name"],
            date=row["date"], end=row["end"], city=row["place"], province=row["prov"],
            kind=f"{row['kind']} {row['tipo']}".strip(), categories=row["cats"], time=d.get("time", ""),
            registration=row["reg"], gpx=gpx, docs=[x for x in row["docs"] if x["u"] != gpx],
            price=d.get("price", ""), fed_only=d.get("fed_only", False), club=row["club"],
            description=" · ".join(x for x in [row["obs"] if "SUSPENDID" not in row["obs"].upper() else "",
                                                  "Calendario " + ", ".join(LABEL[f] for f in feds)] if x),
            cancelled="SUSPENDID" in (row["obs"] + row["name"]).upper() or "APLAZAD" in row["obs"].upper(),
        ))
    return out
