"""Modelo de prueba ciclista, clasificación por modalidad y utilidades compartidas."""
import json
import logging
import math
import re
import time
from dataclasses import dataclass, field, asdict

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

log = logging.getLogger("scraper")

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9,en;q=0.7"})
    retry = Retry(total=3, backoff_factor=1.5, status_forcelist=(429, 500, 502, 503, 504), allowed_methods=None)
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.mount("http://", HTTPAdapter(max_retries=retry))
    return s


class Polite:
    """Espera mínima entre peticiones al mismo host."""

    def __init__(self, delay=0.4):
        self.delay, self.last = delay, 0.0

    def wait(self):
        dt = time.time() - self.last
        if dt < self.delay:
            time.sleep(self.delay - dt)
        self.last = time.time()


@dataclass
class Ride:
    source: str
    source_url: str
    name: str
    date: str  # YYYY-MM-DD
    end: str = ""  # último día si dura varios
    city: str = ""
    province: str = ""  # tal cual la da la fuente; se normaliza luego
    region: str = ""
    lat: float | None = None
    lon: float | None = None
    exact: bool = False  # coordenadas de la salida (GPX, ficha), no del pueblo
    distances: list[float] = field(default_factory=list)  # km
    elevation: int | None = None  # D+ en metros
    kind: str = ""  # texto de la fuente (BTT Maratón, Ciclismo para todos…)
    categories: str = ""  # categorías federativas
    time: str = ""  # HH:MM
    website: str = ""
    registration: str = ""
    gpx: str = ""
    docs: list[dict] = field(default_factory=list)  # [{n, u}] reglamento, rutómetro…
    price: str = ""
    fed_only: bool = False
    cancelled: bool = False
    club: str = ""
    image: str = ""
    description: str = ""

    def to_dict(self):
        return asdict(self)


def fold(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9+]+", " ", s).strip()


# ---------------------------------------------------------------- distancias

_NUM = r"(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)"


def _num(s: str) -> float:
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+", s):
        return float(s.replace(".", ""))
    return float(s.replace(",", "."))


def parse_distances(text: str) -> list[float]:
    """Km de textos tipo '120 y 85 km', '300K', 'Quilòmetres totals: 300 Km', '60/90/120 km'."""
    if not text:
        return []
    t = text.lower().replace("\xa0", " ")
    t = re.sub(r"(desnivel|d\+|d-|\+)\s*[+]?\s*\d[\d.,]*\s*m\b", " ", t)
    out = []
    for m in re.finditer(rf"((?:{_NUM}\s*(?:,|y|i|and|-|/|o)\s*)+{_NUM})\s*(km|kms|kilómetros|kilometros|quilòmetres|k)\b", t):
        out += [_num(n) for n in re.findall(_NUM, m.group(1))]
    for m in re.finditer(rf"{_NUM}\s*(km|kms|kilómetros|kilometros|quilòmetres|k)\b", t):
        out.append(_num(m.group(1)))
    res = []
    for v in out:
        if 5 <= v <= 2500:
            v = round(v, 1)
            if all(abs(v - r) > 0.5 for r in res):
                res.append(v)
    return sorted(res)


def parse_elevation(text: str):
    if not text:
        return None
    m = re.search(r"(?:desnivel(?: positivo| acumulado)?|d\+|\+)\s*(?:de\s*)?\+?\s*(\d[\d.]*)\s*m", text.lower())
    if not m:
        m = re.search(r"(\d[\d.]{2,})\s*m\.?\s*(?:de\s*)?(?:desnivel|d\+|positivos)", text.lower())
    if m:
        try:
            v = int(m.group(1).replace(".", ""))
            return v if 50 <= v <= 60000 else None
        except ValueError:
            return None
    return None


# ------------------------------------------------------------ clasificación

# Lo que no es bici (o no es para ir a participar): se descarta.
NOT_BIKE = re.compile(
    r"a peu\b|a pie\b|triatl|triathl|duatl|duathl|acuatl|aquathl|nataci|a nado|travesia|swim|running|\btrail\b|"
    r"carrera popular|cursa popular|marcha nordica|nordic|senderis|caminata|montanismo|canicross|\bcxm\b|\b10 ?k\b|"
    r"\bbmx\b|\bpista\b|velodromo|pistard|\btrial\b|trialbici|pump ?track|freestyle|free style|escuela|escoles|escolar|kids|mini ?dh|mini ?btt|"
    r"formacion|curso|judex|jornada tecnica|campus|feria|exposicion|colectivos|paraciclismo|paralimpico|adaptado|promocio",
)
BIKE = re.compile(
    r"\bbtt\b|\bmtb\b|bike|bici|cicl|gravel|\bxc|\bxco\b|\bxcm\b|enduro|descenso|\bdh\b|ciclo ?cross|ciclocros|\bcx\b|"
    r"gran ?fondo|granfondo|ciclodeportiv|cicloturis|bikepacking|brevet|randonn|audax|pedalada|marxa|pedal|rueda|ruta|"
    r"carretera|contrarreloj|cronoescalada|critérium|criterium|\bgp\b|gran premio|trofeo|clasica|volta|vuelta|e ?bike|maraton btt|rally",
)
STRONG = re.compile(r"\bbtt\b|\bmtb\b|bike|bici|ciclis|ciclo|cicloturis|ciclodeport|gravel|pedal|granfondo|gran fondo|brevet|"
                    r"bikepacking|\bxco\b|\bxcm\b|enduro btt|descenso btt|e ?bike|ruta btt|\bcx\b|ciclocros")
YOUTH = re.compile(r"escuel|escol|alevin|infantil|cadet|junior|juvenil|principiante|benjamin|prebenjamin|promesa|kids|sub ?1[0-9]|menores|mini")
ADULT = re.compile(r"elite|elit\b|master|sub ?23|senior|cicloturist|a partir de|open|absolut|veterano|todas|popular|aficionad|federad|mayores|e ?bike|femenin.*elite|\b1[5-9] anos")


def classify(name: str, kind: str = "", extra: str = "", strict: bool = False):
    """(modalidad, disciplina, formato) o None si no es una prueba de bici para adultos.

    modalidad: road | mtb | gravel | cx | ultra | ebike | other
    formato: marcha (abierta a todos, cicloturista/ciclodeportiva) | comp (competición federada)
    """
    n, k, x = fold(name), fold(kind), fold(extra)
    t = f"{n} {k}"
    if NOT_BIKE.search(t) and not re.search(r"\b(btt|mtb|gravel|bike|bici|cicl)", t):
        return None
    if re.search(r"\bbmx\b|\bpista\b|\btrial|pump ?track|escuela|escoles|escolar|kids|promocio|formacion|judex|paracicl|paralimp", k):
        return None
    if not BIKE.search(f"{t} {x}"):
        return None
    if strict and not STRONG.search(t):
        return None  # fuentes de todos los deportes: hace falta una palabra inequívoca de bici
    cats = fold(extra)
    if cats and YOUTH.search(cats) and not ADULT.search(cats):
        return None  # solo categorías de escuelas/cadetes/juniors

    if re.search(r"ciclo ?cross|ciclocros|ciclo cross|\bcx\b", t):
        mod, disc = "cx", "Ciclocross"
    elif re.search(r"bikepacking|brevet|randonn|audax|ultraciclismo|ultracycling|ultra distancia|ultradistancia|non ?stop|\b[3-9]\d\d ?k\b|\b1\d{3} ?k", t):
        mod = "ultra"
        disc = "Brevet" if re.search(r"brevet|randonn|audax", t) else "Bikepacking" if "bikepacking" in t else "Ultradistancia"
    elif "gravel" in t:
        mod, disc = "gravel", "Gravel"
    elif re.search(r"\bbtt\b|\bmtb\b|mountain|\bxc|enduro|descenso|\bdh\b|\bdhi\b|rally|\braid\b|maraton|marato\b|ultramarat|bike race|bikerace|\be ?mtb", t):
        mod = "mtb"
        if re.search(r"enduro", t):
            disc = "Enduro"
        elif re.search(r"descenso|\bdh\b|\bdhi\b", t):
            disc = "Descenso"
        elif re.search(r"ultramara|xcum", t):
            disc = "Ultramaratón XCUM"
        elif re.search(r"media marat|mitja|xcmm|\bmmr\b", t):
            disc = "Media maratón"
        elif re.search(r"maraton|marato\b|xcm\b", t):
            disc = "Maratón XCM"
        elif re.search(r"rally|\bxco\b|xcoi|\bxcc\b|short track|\braid\b|\bxc\b|open|copa|campeonato", t):
            disc = "Rally XCO" if not re.search(r"\braid\b", t) else "Raid"
        elif re.search(r"etapas|stage|bike race", t):
            disc = "Por etapas"
        else:
            disc = "Marcha BTT"
    elif re.search(r"e ?bike|electric", t):
        mod, disc = "ebike", "E-bike"
    elif re.search(r"carretera|ruta\b|estrada|ciclodeportiv|cicloturis|gran ?fondo|granfondo|contrarreloj|crono|critérium|criterium|"
                   r"gran premio|\bgp\b|trofeo|trofeu|clasica|classica|volta|vuelta|puertos|picos|cimas|colls|ports|desafio|marxa|marcha|"
                   r"sportive|circuito", t):
        mod = "road"
        if re.search(r"cronoescalada|contrarreloj|\bcri\b|crono", t):
            disc = "Contrarreloj"
        elif re.search(r"gran ?fondo|granfondo", t):
            disc = "Gran fondo"
        elif re.search(r"ciclodeportiv", t):
            disc = "Ciclodeportiva"
        elif re.search(r"cicloturis|marcha|marxa|pedalada|trobada|quedada|desafio|puertos|picos|cimas", t):
            disc = "Marcha cicloturista"
        else:
            disc = "Carrera en ruta"
    elif re.search(r"pedalada|trobada|quedada|dia de la bici|fiesta de la bici", t):
        mod, disc = "other", "Pedalada / quedada"
    else:
        mod, disc = "other", "Prueba ciclista"

    marcha = re.search(r"marcha|marxa|cicloturis|ciclodeportiv|para todos|gran ?fondo|granfondo|pedalada|trobada|quedada|brevet|"
                       r"bikepacking|randonn|audax|no competitiv|\boci\b|non ?stop|\bruta\b|sportive|experience|kdd|social", t)
    comp = re.search(r"copa|campeonato|open\b|\bc1\b|\bhc\b|\bce\b|trofeo|trofeu|gran premio|\bgp\b|clasica|critérium|criterium|"
                     r"contrarreloj|rally|\bxco\b|ciclocross|ciclocros|\bcx\b|liga|lliga|xcm|competici|carrera|cursa|race\b|serie", t)
    if marcha:
        fmt = "marcha"
    elif comp or mod == "cx" or disc in ("Rally XCO", "Descenso", "Enduro", "Carrera en ruta", "Contrarreloj", "Maratón XCM",
                                             "Media maratón", "Ultramaratón XCUM", "Por etapas", "Raid"):
        fmt = "comp"
    else:
        fmt = "marcha"
    return mod, disc, fmt


# ------------------------------------------------------------------ GPX

def haversine(a, b, c, d):
    r = math.pi / 180
    x = math.sin((c - a) * r / 2) ** 2 + math.cos(a * r) * math.cos(c * r) * math.sin((d - b) * r / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


def track_stats(data: bytes):
    """GPX, KML o KMZ (KML comprimido) → estadísticas del recorrido."""
    if data[:2] == b"PK":
        import io
        import zipfile
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                name = next((n for n in z.namelist() if n.lower().endswith(".kml")), None)
                data = z.read(name) if name else b""
        except zipfile.BadZipFile:
            return None
    text = data.decode("utf-8", "ignore")
    if "<coordinates" in text and "<trkpt" not in text:
        best = []
        for block in re.findall(r"<coordinates>(.*?)</coordinates>", text, re.S):  # un recorrido por LineString: el más largo
            coords = []
            for tup in block.split():
                parts = tup.split(",")
                if len(parts) >= 2:
                    try:
                        coords.append((float(parts[1]), float(parts[0]), float(parts[2]) if len(parts) > 2 and parts[2] else None))
                    except ValueError:
                        pass
            if len(coords) > len(best):
                best = coords
        coords = best
        return _stats(coords)
    return gpx_stats(text)


def gpx_stats(xml: str):
    """Distancia (km), desnivel positivo (m) y punto de salida de un GPX."""
    pts = re.findall(r'<(?:\w+:)?(?:trkpt|rtept)\s+([^>]*?)/?>(.*?)(?=<(?:\w+:)?(?:trkpt|rtept)\s|</(?:\w+:)?(?:trkseg|rte|trk)>)', xml, re.S)
    coords = []
    for attrs, body in pts:
        la = re.search(r'lat="([-\d.]+)"', attrs)
        lo = re.search(r'lon="([-\d.]+)"', attrs)
        if not (la and lo):
            continue
        el = re.search(r"<(?:\w+:)?ele>([-\d.]+)<", body)
        coords.append((float(la.group(1)), float(lo.group(1)), float(el.group(1)) if el else None))
    return _stats(coords)


def _stats(coords):
    if len(coords) < 2:
        return None
    km = sum(haversine(a[0], a[1], b[0], b[1]) for a, b in zip(coords, coords[1:]))
    eles = [c[2] for c in coords if c[2] is not None]
    if eles and max(eles) - min(eles) < 1:  # KML sin altitudes (todo a 0)
        eles, coords = [], [(a, b, None) for a, b, _ in coords]
    dplus = None
    if len(eles) > 10:
        # suavizado (media móvil) + umbral de histéresis para no sumar ruido del GPS
        w = 5
        sm = [sum(eles[max(0, i - w):i + w + 1]) / len(eles[max(0, i - w):i + w + 1]) for i in range(len(eles))]
        dplus, ref = 0.0, sm[0]
        for e in sm[1:]:
            if e - ref >= 4:
                dplus += e - ref
                ref = e
            elif e < ref:
                ref = e
        dplus = int(round(dplus / 10) * 10)
    # recorrido simplificado (≈300 puntos) para dibujar la ruta y el perfil en la app
    step = max(km / 300, 0.05)
    pts, acc, last = [], 0.0, -1e9
    for i, c in enumerate(coords):
        if i:
            acc += haversine(coords[i - 1][0], coords[i - 1][1], c[0], c[1])
        if acc - last >= step or i == len(coords) - 1:
            pts.append([round(c[0], 5), round(c[1], 5), round(c[2]) if c[2] is not None else None, round(acc, 2)])
            last = acc
    return {"km": round(km, 1), "dplus": dplus, "lat": round(coords[0][0], 5), "lon": round(coords[0][1], 5), "pts": pts}


def dump(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default
