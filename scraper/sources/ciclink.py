"""Ciclink (ciclink.es): calendario de marchas cicloturistas, gran fondos y gravel de España y alrededores.

WordPress con Modern Events Calendar: la API /wp-json/wp/v2/mec-events da la lista (enlace, título, región)
y cada ficha trae la fecha exacta (enlace de Google Calendar), hora, localización y web de la prueba.
"""
import datetime as dt
import html
import re
from zoneinfo import ZoneInfo

from common import Ride, Polite, parse_distances, parse_elevation, session, log

API = "https://ciclink.es/wp-json/wp/v2"
ABROAD = {"andorra", "francia", "italia", "portugal", "suiza"}
MADRID = ZoneInfo("Europe/Madrid")


def _txt(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def _local(stamp):
    t = dt.datetime.strptime(stamp, "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.timezone.utc).astimezone(MADRID)
    return t


def parse_detail(page):
    info = {}
    m = re.search(r"calendar\.google\.com/calendar/render\?[^\"']*?dates=(\d{8}T\d{6}Z)/(\d{8}T\d{6}Z)", page)
    if m:
        a, b = _local(m.group(1)), _local(m.group(2))
        if b.hour == 0 and b.minute == 0:  # «todo el día»: el final es la medianoche siguiente
            b -= dt.timedelta(seconds=1)
        info["date"], info["end"] = a.date().isoformat(), b.date().isoformat()
    m = re.search(r'class="mec-single-event-time".*?<abbr class="mec-events-abbr">(.*?)</abbr>', page, re.S)
    if m:
        t = re.search(r"(\d{1,2}):(\d{2})", _txt(m.group(1)))
        if t:
            info["time"] = f"{int(t.group(1)):02d}:{t.group(2)}"
    m = re.search(r'class="mec-single-event-location".*?<h6>(.*?)</h6>', page, re.S)
    if m:
        info["place"] = _txt(m.group(1))
    m = re.search(r'class="mec-more-info-button[^"]*"[^>]*href="([^"]+)"', page)
    if m:
        info["web"] = html.unescape(m.group(1))
    body = re.search(r'<div class="mec-single-event-description[^"]*">(.*?)</div>', page, re.S)
    info["text"] = _txt(body.group(1))[:2500] if body else ""
    st = re.findall(r'mec-event-data-field-value">([^<]+)<', page)
    info["cancelled"] = any(re.search(r"cancel|suspend|aplaz", x, re.I) for x in st)
    img = re.search(r'"thumbnailUrl":"([^"]+)"', page)
    if img:
        info["image"] = img.group(1).replace("\\/", "/")
    return info


def fetch(cache, max_details=400, **_):
    s, pol = session(), Polite(0.5)
    cats = {c["id"]: c["name"] for c in s.get(f"{API}/mec_category", params={"per_page": 100, "_fields": "id,name"}, timeout=40).json()}
    events, page = [], 1
    while True:
        r = s.get(f"{API}/mec-events", params={"per_page": 100, "page": page, "_fields": "id,link,title,modified,mec_category"}, timeout=60)
        if r.status_code != 200:
            break
        got = r.json()
        if not got:
            break
        events += got
        if page >= int(r.headers.get("X-WP-TotalPages", 1)):
            break
        page += 1
    log.info("ciclink: %d fichas", len(events))
    det, budget, out = cache.setdefault("detail", {}), max_details, []
    today = dt.date.today().isoformat()
    for e in events:
        region = next((cats.get(c, "") for c in e.get("mec_category") or []), "")
        if region.lower() in ABROAD:
            continue
        key = f'{e["link"]}|{e.get("modified", "")}'  # si la ficha cambia, se vuelve a leer
        d = det.get(e["link"])
        if (not d or d.get("_k") != key) and budget > 0:
            budget -= 1
            pol.wait()
            try:
                d = {**parse_detail(s.get(e["link"], timeout=40).text), "_k": key}
                det[e["link"]] = d
            except Exception as ex:  # noqa: BLE001
                log.warning("ciclink %s: %s", e["link"], ex)
        if not d or not d.get("date") or (d.get("end") or d["date"]) < today:
            continue
        place = d.get("place", "")
        city, _, prov = place.partition(",")
        out.append(Ride(
            source="ciclink", source_url=e["link"], name=_txt(e["title"]["rendered"]), date=d["date"],
            end=d["end"] if d.get("end", "") > d["date"] else "", time=d.get("time", ""), city=city.strip(),
            province=prov.strip(), region=region, website=d.get("web", ""), image=d.get("image", ""),
            distances=parse_distances(d.get("text", "")), elevation=parse_elevation(d.get("text", "")),
            description=d.get("text", "")[:300], cancelled=d.get("cancelled", False),
        ))
    return out
