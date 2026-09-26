"""Federació Catalana de Ciclisme (ciclisme.cat): calendario completo, todas las especialidades.

La tabla /calendari/tot (paginada) da fecha y hora, prueba, población, provincia y modalidad; la ficha de
cada prueba añade coordenadas de la salida, km totales, track GPX y documentación técnica.
"""
import datetime as dt
import html
import re

from common import Ride, Polite, session, log

BASE = "https://www.ciclisme.cat"


def _txt(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def parse_list(page):
    out = []
    for tr in re.findall(r"<tr class=\"(?:odd|even)[^\"]*\">(.*?)</tr>", page, re.S):
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if len(tds) < 4:
            continue
        d = re.search(r'content="(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})', tds[0])
        a = re.search(r'<a href="([^"]+)">(.*?)</a>', tds[1], re.S)
        if not d or not a:
            continue
        place = [_txt(x) for x in re.split(r"<br\s*/?>", tds[2])]
        mod = [_txt(x) for x in re.split(r"<br\s*/?>", tds[3])]
        out.append({
            "date": d.group(1), "time": d.group(2) if d.group(2) != "00:00" else "", "url": BASE + html.unescape(a.group(1)),
            "name": _txt(a.group(2)), "cup": _txt(re.sub(r"<a .*?</a>", "", tds[1], flags=re.S)),
            "city": place[0] if place else "", "prov": place[1] if len(place) > 1 else "", "kind": " ".join(mod),
            "cats": mod[1] if len(mod) > 1 else "",
        })
    return out


def parse_detail(page):
    t = _txt(page)
    info = {}
    m = re.search(r"L\.marker\(\[\s*([-\d.]+),\s*([-\d.]+)\]", page)
    if m:
        info["lat"], info["lon"] = float(m.group(1)), float(m.group(2))
    m = re.search(r"Quil[òo]metres totals:\s*([\d.,]+)\s*Km", t, re.I)
    if m:
        try:
            info["km"] = float(m.group(1).replace(",", "."))
        except ValueError:
            pass
    m = re.search(r"Adre[çc]a sortida:\s*(.{2,80}?)\s+Poblaci", t)
    if m:
        info["addr"] = m.group(1)
    m = re.search(r"Web:\s*(https?://\S+)", t)
    if m and "ciclisme.cat" not in m.group(1):
        info["web"] = m.group(1)
    m = re.search(r"Observacions:\s*(.{3,300}?)\s+(?:Track de la cursa|Dades de l)", t)
    if m and not m.group(1).startswith("Track"):
        info["obs"] = m.group(1)
    gpx = re.search(r'href="([^"]+\.gpx)"', page, re.I)
    if gpx:
        info["gpx"] = html.unescape(gpx.group(1))
    docs = []
    for u in re.findall(r'href="((?:https?:)?//servers\.ciclisme\.cat/sites/default/files/extres/[^"]+)"', page):
        u = "https:" + u if u.startswith("//") else u
        docs.append({"n": "Información técnica", "u": html.unescape(u)})
    info["docs"] = docs[:4]
    m = re.search(r"Estat:\s*(\w+)", t)
    if m:
        info["state"] = m.group(1)
    return info


def fetch(cache, max_details=500, **_):
    s = session()
    pol = Polite(0.6)
    rows, seen = [], set()
    for page in range(0, 40):
        pol.wait()
        r = s.get(f"{BASE}/calendari/tot", params={"page": page} if page else None, timeout=60)
        r.raise_for_status()
        got = [x for x in parse_list(r.text) if x["url"] not in seen]
        if not got:
            break
        for x in got:
            seen.add(x["url"])
        rows += got
    log.info("ciclisme.cat: %d filas", len(rows))
    det = cache.setdefault("detail", {})
    today = dt.date.today().isoformat()
    budget = max_details
    out = []
    for x in rows:
        if x["url"] not in det and budget > 0 and x["date"] >= today:
            budget -= 1
            pol.wait()
            try:
                det[x["url"]] = parse_detail(s.get(x["url"], timeout=40).text)
            except Exception as e:  # noqa: BLE001
                log.warning("ciclisme.cat ficha %s: %s", x["url"], e)
        d = det.get(x["url"], {})
        prov = x["prov"] if x["prov"] not in ("ANDORRA", "FRANÇA", "Altres") else x["prov"]
        out.append(Ride(
            source="ciclisme.cat", source_url=x["url"], name=x["name"], date=x["date"], time=x["time"],
            city=x["city"], province=prov, region="Cataluña", lat=d.get("lat"), lon=d.get("lon"), exact=bool(d.get("lat")),
            distances=[d["km"]] if d.get("km") and d["km"] > 3 else [], kind=x["kind"], categories=x["cats"], gpx=d.get("gpx", ""),
            website=d.get("web", ""), docs=d.get("docs", []), registration=x["url"],
            description=" · ".join(v for v in [x["cup"], d.get("addr") and f"Salida: {d['addr']}", d.get("obs", "")] if v),
            cancelled=d.get("state", "").lower().startswith(("anul", "suspes")),
        ))
    return out
