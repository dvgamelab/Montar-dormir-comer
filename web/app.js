/* Montar · Dormir · Comer — app estática, sin build.
   Datos: data/rides.json (lo genera cada semana scraper/run.py) y data/tracks/<id>.json (recorridos). */
(() => {
"use strict";

// ------------------------------------------------------------------ utilidades
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fold = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fkey = s => fold(s).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const store = {
  get(k, d) { try { const v = localStorage.getItem("mdc:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("mdc:" + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};
const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DAYS_L = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const pd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
const fmtDate = s => { const d = pd(s); return `${DAYS_L[d.getDay()]} ${d.getDate()} de ${MONTHS_L[d.getMonth()]} ${d.getFullYear()}`; };
const fmtShort = s => { const d = pd(s); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const fmtRange = r => r.end ? `del ${fmtShort(r.date)} al ${fmtShort(r.end)} ${pd(r.end).getFullYear()}` : fmtDate(r.date);
const today = iso(new Date());
function haversine(a, b, c, d) {
  const R = 6371, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const fmtKm = d => d == null ? "" : d < 1 ? `${Math.round(d * 1000)} m` : `${d < 10 ? d.toFixed(1).replace(".", ",") : Math.round(d)} km`;
const fmtDist = d => `${Number.isInteger(d) || d >= 20 ? Math.round(d) : String(+d.toFixed(1)).replace(".", ",")} km`;
const fmtUp = m => `${Math.round(m).toLocaleString("es-ES")} m`;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
}
async function copy(text, okMsg = "Copiado") {
  try { await navigator.clipboard.writeText(text); toast(okMsg); return true; }
  catch { toast("No se pudo copiar: selecciona el texto y cópialo a mano"); return false; }
}
const getCss = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// modalidades
const MODS = {
  road: { label: "Carretera", long: "Carretera" },
  mtb: { label: "BTT", long: "BTT / MTB" },
  gravel: { label: "Gravel", long: "Gravel" },
  cx: { label: "Ciclocross", long: "Ciclocross" },
  ultra: { label: "Ultra", long: "Ultradistancia / bikepacking" },
  ebike: { label: "E-bike", long: "E-bike" },
  other: { label: "Otras", long: "Otras pruebas" },
};
const modOf = r => MODS[r.mod] ? r.mod : "other";
const modDisc = r => { const m = MODS[modOf(r)]; return r.disc && r.disc !== m.long && r.disc !== m.label ? `${m.label} · ${r.disc}` : m.long; };
const KM_OPTS = [0, 20, 40, 60, 80, 100, 130, 160, 200, 300];
const UP_OPTS = [0, 300, 500, 1000, 1500, 2000, 3000, 4000, 6000];

// iconos
const ICON_BIKE = `<svg viewBox="0 0 24 24"><circle cx="5.5" cy="16" r="3.5"/><circle cx="18.5" cy="16" r="3.5"/><path d="M5.5 16 9 9h7l2.5 7M9 9l3.5 7H5.5M12.5 16 16 9M8 6.5h3M15 6h2.5"/></svg>`;
const ICON_BED = `<svg viewBox="0 0 24 24"><path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-.01"/></svg>`;
const ICON_FORK = `<svg viewBox="0 0 24 24"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-2 6 0 8v10"/></svg>`;
const ICON_UP = `<svg viewBox="0 0 24 24"><path d="M3 19 10 9l4 5 3-4 4 9z"/></svg>`;
const ICON_BOLT = `<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>`;
const ICON_INFO = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>`;

// ------------------------------------------------------------------ estado
let RIDES = [], META = {}, BYID = new Map();
const F = { q: "", mods: new Set(), ebike: false, fmt: "", when: "all", from: "", to: "", kmMin: 0, kmMax: 0, upMin: 0, upMax: 0,
  ccaa: "", prov: "", near: null, nearKm: 50, fav: false, mapOnly: false, onlyTrack: false, showOff: false, searchKm: 30, ...store.get("filters", {}) };
F.mods = new Set(F.mods || []);
let favs = new Set(store.get("favs", []));
let plans = store.get("plans", {});
let filtered = [], shown = 0, selId = null, SEARCH = null, SEARCH_PROV = "";
const PAGE = 120;
const PLACES = new Map(); // nombre plegado → [{name, lat, lon, prov, muni}]
const MUNI = new Set();
function addPlace(name, lat, lon, prov, muni = false) {
  const k = fkey(name);
  if (!k || lat == null) return;
  const arr = PLACES.get(k) || [];
  const i = arr.findIndex(x => haversine(x.lat, x.lon, lat, lon) < 8);
  const it = { name, lat, lon, prov, key: k, muni };
  if (i < 0) arr.push(it); else if (muni && !arr[i].muni) arr[i] = it;
  PLACES.set(k, arr);
}
async function loadPlaces() {
  try {
    const m = await (await fetch("data/municipios.json")).json();
    for (const [n, la, lo, pr] of m) {
      const variants = new Set([n, ...n.split("/")]);
      for (const v of [...variants]) { const mm = v.match(/^(.*), (el|la|los|las|l'|lo|o|a|os|as|es|sa|ses)$/i); if (mm) variants.add(`${mm[2]} ${mm[1]}`); }
      for (const v of variants) { addPlace(v.trim(), la, lo, pr, true); MUNI.add(fkey(v)); }
    }
    $("#towns").innerHTML = m.map(x => `<option value="${esc(x[0].split("/")[0])}">`).join("");
    apply();
  } catch { /* sin municipios: se usan los pueblos de las pruebas */ }
}
function findPlace(q) {
  const k = fkey(q);
  if (k.length < 3) return null;
  const c = PLACES.get(k);
  if (!c?.length) return null;
  if (c.length === 1) return { ...c[0], alts: [] };
  const score = x => (F.prov && x.prov === F.prov ? 1e6 : 0) + RIDES.filter(r => r.lat && haversine(x.lat, x.lon, r.lat, r.lon) < 20).length;
  const sorted = [...c].sort((a, b) => score(b) - score(a));
  const pick = sorted.find(x => x.prov === SEARCH_PROV) || sorted[0];
  return { ...pick, alts: sorted.filter(x => x !== pick) };
}
function saveFilters() { store.set("filters", { ...F, mods: [...F.mods], near: null }); }

// ------------------------------------------------------------------ carga
const EMBED = !!window.MDC_EMBED, PUBLIC_URL = window.MDC_PUBLIC_URL || "";
const APP = !!window.MDC_APP, CAP = window.Capacitor?.Plugins || {};
async function fetchRides() {
  const remote = window.MDC_DATA_URL; // en la APK: datos semanales publicados, con los incluidos de respaldo
  if (remote) {
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(remote, { cache: "no-cache", signal: ctl.signal }).finally(() => clearTimeout(to));
      if (r.ok) { const d = await r.json(); if (d.rides?.length) return d; }
    } catch { /* sin conexión: datos incluidos */ }
  }
  return (await fetch("data/rides.json", { cache: "no-cache" })).json();
}
async function load() {
  try {
    const d = await fetchRides();
    META = d.meta || {}; RIDES = (d.rides || []).filter(x => (x.end || x.date) >= today);
  } catch (e) { $("#count").textContent = "No se pudieron cargar las pruebas."; console.error(e); return; }
  for (const r of RIDES) {
    BYID.set(r.id, r);
    r._s = fold(`${r.name} ${r.city || ""} ${r.province || ""} ${r.ccaa || ""} ${r.disc || ""} ${r.club || ""}`);
    r._nc = fkey(`${r.name} ${r.city || ""}`);
    r._max = Math.max(0, ...(r.dist || []));
    if (r.city && r.lat && !r.approx) addPlace(r.city, r.lat, r.lon, r.province || "");
  }
  for (const [n, la, lo] of CAPITALS) addPlace(n, la, lo, "");
  const cc = [...new Set(RIDES.map(r => r.ccaa).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  $("#ccaa").insertAdjacentHTML("beforeend", cc.map(c => `<option>${esc(c)}</option>`).join(""));
  fillProvinces(); renderFoot(); syncFilterUI(); initMap(); apply(); handleIncomingPlan(); loadPlaces();
}
const CAPITALS = [["Madrid", 40.4168, -3.7038], ["Barcelona", 41.3874, 2.1686], ["Valencia", 39.4699, -0.3763], ["Sevilla", 37.3891, -5.9845], ["Zaragoza", 41.6488, -0.8891], ["Málaga", 36.7213, -4.4214], ["Murcia", 37.9922, -1.1307], ["Palma", 39.5696, 2.6502], ["Bilbao", 43.263, -2.935], ["Alicante", 38.3452, -0.481], ["Córdoba", 37.8882, -4.7794], ["Valladolid", 41.6523, -4.7245], ["Vigo", 42.2406, -8.7207], ["Gijón", 43.5322, -5.6611], ["A Coruña", 43.3623, -8.4115], ["Granada", 37.1773, -3.5986], ["Vitoria-Gasteiz", 42.8467, -2.6716], ["Oviedo", 43.3614, -5.8593], ["Pamplona", 42.8125, -1.6458], ["Santander", 43.4623, -3.81], ["San Sebastián", 43.3183, -1.9812], ["Logroño", 42.4627, -2.445], ["Girona", 41.9794, 2.8214], ["Lleida", 41.6176, 0.62], ["Tarragona", 41.1189, 1.2445], ["Castellón de la Plana", 39.9864, -0.0513], ["Santa Cruz de Tenerife", 28.4636, -16.2518], ["Las Palmas de Gran Canaria", 28.1235, -15.4363]];

function fillProvinces() {
  const ps = [...new Set(RIDES.filter(r => !F.ccaa || r.ccaa === F.ccaa).map(r => r.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  if (F.prov && !ps.includes(F.prov)) F.prov = "";
  $("#prov").innerHTML = `<option value="">Todas</option>` + ps.map(p => `<option ${p === F.prov ? "selected" : ""}>${esc(p)}</option>`).join("");
}

// ------------------------------------------------------------------ filtros
function weekendRange(offset) {
  const d = new Date(); const dow = d.getDay();
  const toSat = dow === 0 ? -1 : 6 - dow;
  const sat = new Date(d); sat.setDate(d.getDate() + toSat + offset * 7);
  const fri = new Date(sat); fri.setDate(sat.getDate() - 1);
  const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
  return [iso(fri) < today ? today : iso(fri), iso(sun)];
}
function dateWindow() {
  switch (F.when) {
    case "thisw": return weekendRange(0);
    case "nextw": return weekendRange(1);
    case "30": return [today, addDays(today, 30)];
    case "90": return [today, addDays(today, 90)];
    case "custom": return [F.from || today, F.to || "9999"];
    default: return [today, "9999"];
  }
}
const kmOk = r => {
  if (!F.kmMin && !F.kmMax) return true;
  const ds = r.dist || []; if (!ds.length) return false;
  return ds.some(d => d >= (F.kmMin || 0) && d <= (F.kmMax || 1e9));
};
const upOk = r => {
  if (!F.upMin && !F.upMax) return true;
  if (!r.elev) return false;
  return r.elev >= (F.upMin || 0) && r.elev <= (F.upMax || 1e9);
};
function apply() {
  const [a, b] = dateWindow();
  let q = fold(F.q).trim().split(/\s+/).filter(Boolean);
  const bounds = F.mapOnly && map ? map.getBounds() : null;
  const place = F.q ? findPlace(F.q) : null;
  SEARCH = place ? { place, R: F.searchKm || 30 } : null;
  if (SEARCH) q = [];
  filtered = RIDES.filter(r => {
    if ((r.end || r.date) < a || r.date > b) return false;
    if (r.x && !F.showOff) return false;
    if (F.mods.size || F.ebike) {
      const okMod = F.mods.has(modOf(r)) || (F.ebike && (r.ebike || r.mod === "ebike"));
      if (!okMod) return false;
    }
    if (F.fmt && r.fmt !== F.fmt) return false;
    if (!kmOk(r) || !upOk(r)) return false;
    if (F.onlyTrack && !r.trk) return false;
    if (F.ccaa && r.ccaa !== F.ccaa) return false;
    if (F.prov && r.province !== F.prov) return false;
    if (F.fav && !favs.has(r.id)) return false;
    if (q.length && !q.every(w => r._s.includes(w))) return false;
    if (SEARCH) {
      const pl = SEARCH.place;
      r._d = r.lat ? haversine(pl.lat, pl.lon, r.lat, r.lon) : null;
      const ck = fkey(r.city || "");
      const otherMuni = ck && ck !== pl.key && MUNI.has(ck);
      const inTown = ck === pl.key || new RegExp(`\\b${pl.key}\\b`).test(r._nc) || (!otherMuni && r._d != null && r._d <= 5 && !r.approx);
      if (inTown) r._grp = "in";
      else if (r._d != null && r._d <= SEARCH.R && !r.approx) r._grp = "near";
      else return false;
    } else if (F.near) {
      r._grp = null;
      if (!r.lat) return false;
      r._d = haversine(F.near.lat, F.near.lon, r.lat, r.lon);
      if (r._d > F.nearKm) return false;
    } else { r._d = null; r._grp = null; }
    if (bounds && (!r.lat || !bounds.contains([r.lat, r.lon]))) return false;
    return true;
  });
  if (SEARCH) filtered.sort((x, y) => (x._grp === y._grp ? 0 : x._grp === "in" ? -1 : 1) || (x._grp === "near" ? x._d - y._d : 0) || x.date.localeCompare(y.date));
  shown = 0;
  $("#list").innerHTML = SEARCH ? searchBanner() : "";
  renderMore();
  const n = filtered.length;
  $("#count").innerHTML = `<span class="num">${n.toLocaleString("es-ES")}</span><span class="lbl">${n === 1 ? "prueba" : "pruebas"}${F.fav ? " favoritas" : ""}</span>`;
  $("#applyFilters").textContent = `Ver ${n.toLocaleString("es-ES")} ${n === 1 ? "prueba" : "pruebas"}`;
  $("#filtersBadge").hidden = !(F.when !== "all" || F.ccaa || F.prov || F.near || F.mapOnly || F.kmMin || F.kmMax || F.upMin || F.upMax || F.onlyTrack || F.showOff);
  $$(".chip[data-when]").forEach(x => x.classList.toggle("on", F.when === x.dataset.when));
  $$(".chip[data-fmt]").forEach(x => x.classList.toggle("on", F.fmt === x.dataset.fmt));
  drawMarkers();
  if (map && !$("#viewMap").hidden && !F.mapOnly) { mapTouched = false; fitToResults(); }
  saveFilters();
}
function optList(opts, unit, first) {
  return opts.map(v => `<option value="${v}">${v ? v.toLocaleString("es-ES") + " " + unit : first}</option>`).join("");
}
function syncFilterUI() {
  $("#q").value = F.q;
  $$(".chip[data-mod]").forEach(b => b.classList.toggle("on", F.mods.has(b.dataset.mod)));
  $(".chip[data-ebike]").classList.toggle("on", F.ebike);
  $$("#modBoxes input").forEach(i => { i.checked = i.value === "ebike" ? F.ebike : F.mods.has(i.value); });
  $$("#fmtSeg button").forEach(b => b.classList.toggle("on", b.dataset.fmtv === F.fmt));
  $("#when").value = F.when; $("#dateRange").hidden = F.when !== "custom";
  $("#dFrom").value = F.from; $("#dTo").value = F.to;
  $("#kmMin").value = String(F.kmMin || 0); $("#kmMax").value = String(F.kmMax || 0);
  $("#upMin").value = String(F.upMin || 0); $("#upMax").value = String(F.upMax || 0);
  $("#ccaa").value = F.ccaa; $("#nearKm").value = String(F.nearKm);
  $("#onlyTrack").checked = F.onlyTrack; $("#showOff").checked = F.showOff;
  fillProvinces();
  $("#mapFilter").checked = F.mapOnly;
}
const toggleSet = (s, v) => (s.has(v) ? s.delete(v) : s.add(v));
function bindFilters() {
  $("#modBoxes").innerHTML = Object.entries(MODS).map(([k, m]) => `<label><input type="checkbox" value="${k}"><i class="dot m-${k}"></i>${esc(m.long)}</label>`).join("");
  $("#kmMin").innerHTML = optList(KM_OPTS, "km", "Cualquiera"); $("#kmMax").innerHTML = optList(KM_OPTS.slice(1).concat([500]), "km", "").replace('value="20"', 'value="20"') + `<option value="0">Sin límite</option>`;
  $("#upMin").innerHTML = optList(UP_OPTS, "m", "Cualquiera"); $("#upMax").innerHTML = optList(UP_OPTS.slice(1), "m", "") + `<option value="0">Sin límite</option>`;
  let t;
  $("#q").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => { F.q = e.target.value; apply(); }, 180); });
  $$(".chip[data-mod]").forEach(b => b.addEventListener("click", () => { toggleSet(F.mods, b.dataset.mod); syncFilterUI(); apply(); }));
  $(".chip[data-ebike]").addEventListener("click", () => { F.ebike = !F.ebike; syncFilterUI(); apply(); });
  $$(".chip[data-fmt]").forEach(b => b.addEventListener("click", () => { F.fmt = F.fmt === b.dataset.fmt ? "" : b.dataset.fmt; syncFilterUI(); apply(); }));
  $("#modBoxes").addEventListener("change", e => { const i = e.target; if (i.value === "ebike") F.ebike = i.checked; else if (i.checked) F.mods.add(i.value); else F.mods.delete(i.value); syncFilterUI(); apply(); });
  $("#fmtSeg").addEventListener("click", e => { const b = e.target.closest("[data-fmtv]"); if (b) { F.fmt = b.dataset.fmtv; syncFilterUI(); apply(); } });
  $("#when").addEventListener("change", e => { F.when = e.target.value; $("#dateRange").hidden = F.when !== "custom"; apply(); });
  $("#dFrom").addEventListener("change", e => { F.from = e.target.value; apply(); });
  $("#dTo").addEventListener("change", e => { F.to = e.target.value; apply(); });
  for (const k of ["kmMin", "kmMax", "upMin", "upMax"]) $("#" + k).addEventListener("change", e => { F[k] = +e.target.value; apply(); });
  $("#onlyTrack").addEventListener("change", e => { F.onlyTrack = e.target.checked; apply(); });
  $("#showOff").addEventListener("change", e => { F.showOff = e.target.checked; apply(); });
  $("#ccaa").addEventListener("change", e => { F.ccaa = e.target.value; fillProvinces(); apply(); });
  $("#prov").addEventListener("change", e => { F.prov = e.target.value; apply(); });
  $$(".chip[data-when]").forEach(b => b.addEventListener("click", () => { F.when = F.when === b.dataset.when ? "all" : b.dataset.when; syncFilterUI(); apply(); }));
  $("#openFilters").addEventListener("click", () => openFilterSheet(true));
  $("#scrim").addEventListener("click", () => openFilterSheet(false));
  $("#applyFilters").addEventListener("click", () => { openFilterSheet(false); $("#viewList").scrollTop = 0; });
  $("#useGps").addEventListener("click", useGps);
  $("#nearTown").addEventListener("change", e => {
    const v = e.target.value.trim();
    const pl = v ? findPlace(v) : null;
    F.near = pl ? { name: pl.name, lat: pl.lat, lon: pl.lon } : null;
    if (v && !F.near) toast("No encuentro ese municipio");
    if (F.near) { e.target.value = F.near.name; map && map.setView([F.near.lat, F.near.lon], F.nearKm > 100 ? 7 : 9); }
    apply();
  });
  $("#nearKm").addEventListener("change", e => { F.nearKm = +e.target.value; apply(); });
  $("#mapFilter").addEventListener("change", e => { F.mapOnly = e.target.checked; apply(); });
  $("#clearFilters").addEventListener("click", () => {
    Object.assign(F, { q: "", fmt: "", ebike: false, when: "all", from: "", to: "", kmMin: 0, kmMax: 0, upMin: 0, upMax: 0, ccaa: "", prov: "", near: null, mapOnly: false, onlyTrack: false, showOff: false });
    F.mods.clear(); $("#nearTown").value = ""; syncFilterUI(); apply();
  });
  $("#more").addEventListener("click", renderMore);
  new IntersectionObserver(es => { if (es[0].isIntersecting && shown < filtered.length) renderMore(); }, { root: $("#viewList"), rootMargin: "600px" }).observe($("#more"));
}
async function useGps() {
  const done = (lat, lon) => { F.near = { name: "Mi ubicación", lat, lon }; $("#nearTown").value = "Mi ubicación"; $("#useGps").lastChild.textContent = "Usar mi ubicación"; apply(); };
  const fail = () => { $("#useGps").lastChild.textContent = "Usar mi ubicación"; toast("No se pudo obtener la ubicación; escribe tu pueblo"); };
  $("#useGps").lastChild.textContent = "Buscando tu ubicación…";
  if (APP && CAP.Geolocation) {
    try { const p = await CAP.Geolocation.getCurrentPosition({ timeout: 10000, maximumAge: 600000 }); return done(p.coords.latitude, p.coords.longitude); } catch { /* sin permiso: navegador */ }
  }
  if (!navigator.geolocation) return fail();
  navigator.geolocation.getCurrentPosition(p => done(p.coords.latitude, p.coords.longitude), fail, { timeout: 10000, maximumAge: 600000 });
}
function openFilterSheet(on) { $("#filterSheet").hidden = !on; $("#scrim").hidden = !on; }

// ------------------------------------------------------------------ lista
function weekKey(s) { const d = pd(s); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return iso(d); }
function weekLabel(mon) {
  const sat = pd(addDays(mon, 5)), sun = pd(addDays(mon, 6));
  const tw = weekendRange(0)[1], nw = weekendRange(1)[1];
  const tag = iso(sun) === tw ? "Este finde" : iso(sun) === nw ? "Próximo finde" : "Finde";
  const rng = sat.getMonth() === sun.getMonth() ? `${sat.getDate()}–${sun.getDate()} ${MONTHS[sun.getMonth()]}` : `${sat.getDate()} ${MONTHS[sat.getMonth()]} – ${sun.getDate()} ${MONTHS[sun.getMonth()]}`;
  return `${tag} <b>${rng}</b>${sun.getFullYear() !== new Date().getFullYear() ? " " + sun.getFullYear() : ""}`;
}
function distHL(d) { return (F.kmMin || F.kmMax) && d >= (F.kmMin || 0) && d <= (F.kmMax || 1e9); }
function statsHTML(r, max = 4) {
  const ds = r.dist || [];
  let h = ds.slice(-max).map(d => `<span class="stat${distHL(d) ? " hl" : ""}">${fmtDist(d)}</span>`).join("");
  if (ds.length > max) h = `<span class="stat">+${ds.length - max}</span>` + h;
  if (r.elev) h += `<span class="stat up">${ICON_UP}${fmtUp(r.elev)}</span>`;
  if (r.ebike && r.mod !== "ebike") h += `<span class="stat" title="Admite e-bike">${ICON_BOLT}e-bike</span>`;
  return h;
}
function cardHTML(r) {
  const d = pd(r.date), m = modOf(r);
  const where = [r.city, r.province && r.province !== r.city ? r.province : ""].filter(Boolean).join(", ");
  const grp = r._grp ? " " + r._grp : "";
  const stats = statsHTML(r);
  return `<article class="card${grp}${r.id === selId ? " sel" : ""}${r.x ? " cancel" : ""}" data-id="${r.id}" tabindex="0">
    <div class="bib mc-${m}"><span class="d">${d.getDate()}</span><span class="m">${DAYS[d.getDay()]}<br>${MONTHS[d.getMonth()]}</span></div>
    <div>
      <h3>${esc(r.name)}</h3>
      <div class="where"><span class="pill m-${m}">${esc(r.disc || MODS[m].label)}</span>${r.x ? `<span class="off-tag">Suspendida</span>` : ""}<span>${esc(where || "Lugar por confirmar")}</span>${r._d != null && r._grp !== "in" ? `<span class="away">a ${fmtKm(r._d)}</span>` : ""}</div>
      ${stats ? `<div class="stats">${stats}</div>` : ""}
    </div>
    <button class="fav${favs.has(r.id) ? " on" : ""}" data-fav="${r.id}" type="button" aria-label="Favorita" aria-pressed="${favs.has(r.id)}">${favs.has(r.id) ? "♥" : "♡"}</button>
  </article>`;
}
function searchBanner() {
  const { place, R } = SEARCH;
  const nIn = filtered.filter(r => r._grp === "in").length;
  return `<div class="search-banner">
    <div><b>${esc(place.name)}</b>${place.prov ? ` <span class="muted">· ${esc(place.prov)}</span>` : ""}</div>
    ${place.alts.length ? `<div class="alts">¿Otro ${esc(place.name)}? ${place.alts.slice(0, 4).map(a => `<button class="chip small" type="button" data-alt-prov="${esc(a.prov)}">${esc(a.prov || "otro")}</button>`).join("")}</div>` : ""}
    <div class="radius">Cercanas hasta ${[10, 20, 30, 50, 100].map(k => `<button class="chip small${k === R ? " on" : ""}" type="button" data-radius="${k}">${k} km</button>`).join("")}</div>
    ${nIn ? "" : `<p class="small muted" style="margin:6px 0 0">No hay pruebas en ${esc(place.name)} con estos filtros; te enseño las cercanas.</p>`}
  </div>`;
}
function groupOf(r) { return SEARCH ? r._grp : weekKey(r.date); }
function groupHeader(g) {
  const n = filtered.filter(x => groupOf(x) === g).length;
  if (!SEARCH) return `<h2 class="wk-h">${weekLabel(g)}<span class="n">${n}</span></h2>`;
  const pl = SEARCH.place.name;
  return g === "in"
    ? `<h2 class="sec-h in"><span class="sec-dot"></span>En ${esc(pl)}<span class="n">${n}</span></h2>`
    : `<h2 class="sec-h near"><span class="sec-dot"></span>Cerca de ${esc(pl)} · por distancia<span class="n">${n}</span></h2>`;
}
function renderMore() {
  const list = $("#list");
  if (!filtered.length) { list.insertAdjacentHTML("beforeend", `<p class="empty">Ninguna prueba con esos filtros. Prueba a ampliar fechas, distancia o radio.</p>`); $("#more").hidden = true; return; }
  const slice = filtered.slice(shown, shown + PAGE);
  const lastEl = [...list.children].reverse().find(x => x.classList.contains("wk"));
  let html = "", lastG = lastEl?.dataset.wk, group = null;
  for (const r of slice) {
    const g = groupOf(r);
    if (g !== lastG) {
      if (group) html += "</div>";
      html += `<div class="wk${SEARCH ? " sec " + g : ""}" data-wk="${g}">${groupHeader(g)}`;
      group = g; lastG = g;
    } else if (!group) { lastEl.insertAdjacentHTML("beforeend", cardHTML(r)); continue; }
    html += cardHTML(r);
  }
  if (group) html += "</div>";
  list.insertAdjacentHTML("beforeend", html);
  shown += slice.length;
  $("#more").hidden = shown >= filtered.length;
}
function bindList() {
  $("#list").addEventListener("click", e => {
    const rad = e.target.closest("[data-radius]"); if (rad) { F.searchKm = +rad.dataset.radius; apply(); return; }
    const alt = e.target.closest("[data-alt-prov]"); if (alt) { SEARCH_PROV = alt.dataset.altProv; apply(); return; }
    const f = e.target.closest("[data-fav]"); if (f) { e.stopPropagation(); toggleFav(f.dataset.fav); return; }
    const c = e.target.closest(".card"); if (c) openRide(c.dataset.id);
  });
  $("#list").addEventListener("keydown", e => { if (e.key === "Enter") { const c = e.target.closest(".card"); if (c) openRide(c.dataset.id); } });
}
function toggleFav(id) {
  toggleSet(favs, id); store.set("favs", [...favs]);
  $$(`[data-fav="${id}"]`).forEach(b => { const on = favs.has(id); b.classList.toggle("on", on); b.textContent = on ? "♥" : "♡"; b.setAttribute("aria-pressed", on); });
  if (F.fav) apply();
}
function renderFoot() {
  const g = META.generated ? new Date(META.generated) : null;
  const src = Object.values(META.sources || {}).map(v => `${esc(v.label)} (${v.count ?? "?"}${v.ok === false ? ", fallo en la última lectura" : ""})`).join(" · ");
  $("#dataFoot").innerHTML = `Datos actualizados ${g ? g.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "—"}. ${(META.count || RIDES.length).toLocaleString("es-ES")} pruebas únicas tras unir fuentes: ${src}. Revisa siempre fecha, horario y requisitos en la web oficial.`;
}

// ------------------------------------------------------------------ mapa
let map, markerLayer, canvasR, tilesOK = true, mapTouched = false;
function baseLayers(m) {
  // silueta de provincias debajo de todo: si no cargan las teselas (sin red), el mapa sigue siendo legible
  m.createPane("land"); m.getPane("land").style.zIndex = 150; m.getPane("land").style.pointerEvents = "none";
  let geoLayer = null, failed = false;
  const paint = () => geoLayer && geoLayer.setStyle({ fillOpacity: failed ? 1 : 0, opacity: failed ? 1 : 0.5 });
  fetch("data/spain.geo.json").then(r => r.json()).then(g => {
    geoLayer = L.geoJSON(g, { pane: "land", interactive: false, style: () => ({ color: getCss("--line"), weight: 1, fillColor: getCss("--map-land"), fillOpacity: 0 }) }).addTo(m);
    paint();
  }).catch(() => {});
  const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" });
  let errs = 0, oks = 0;
  tiles.on("tileload", () => oks++);
  tiles.on("tileerror", () => { if (++errs >= 3 && oks === 0 && !failed) { failed = true; tilesOK = false; m.removeLayer(tiles); paint(); } });
  if (tilesOK && !EMBED) tiles.addTo(m); else failed = true;
  return tiles;
}
function initMap() {
  if (!window.L) { $("#map").innerHTML = `<p class="empty">No se pudo cargar el mapa.</p>`; return; }
  canvasR = L.canvas({ padding: 0.3 });
  map = L.map("map", { preferCanvas: true, zoomControl: true }).setView([40.2, -3.6], 6);
  baseLayers(map);
  markerLayer = L.layerGroup().addTo(map);
  map.on("moveend", () => { if (F.mapOnly) apply(); });
  map.on("click", e => pickAt(e.containerPoint));
  if (matchMedia("(hover: hover)").matches) map.on("mousemove", e => { map.getContainer().style.cursor = hitsAt(e.containerPoint, 10).length ? "pointer" : ""; });
  map.getContainer().addEventListener("pointerdown", () => { mapTouched = true; });
  $("#legend").innerHTML = Object.entries(MODS).filter(([k]) => k !== "other").map(([k, m]) => `<span><i class="dot m-${k}"></i>${esc(m.label)}</span>`).join("") + `<span><i class="dot approx"></i>Aprox.</span>`;
}
function fitToResults() {
  let pts = filtered.filter(r => r.lat).map(r => [r.lat, r.lon]);
  const pen = pts.filter(p => p[0] > 34); // Canarias aparte: si hay pruebas en la península, se encuadra la península
  if (pen.length) pts = pen;
  if (F.near) map.setView([F.near.lat, F.near.lon], F.nearKm > 100 ? 7 : F.nearKm > 40 ? 8 : 9);
  else if (pts.length && pts.length < 400) map.fitBounds(pts, { padding: [30, 30], maxZoom: 11 });
  else map.fitBounds([[36.0, -9.3], [43.8, 3.3]]);
}
function drawMarkers() {
  if (!map) return;
  markerLayer.clearLayers();
  const col = Object.fromEntries(Object.keys(MODS).map(k => [k, getCss("--m-" + k)])), approx = getCss("--approx");
  for (const r of filtered) {
    if (!r.lat) continue;
    L.circleMarker([r.lat, r.lon], {
      renderer: canvasR, radius: r.id === selId ? 9 : 5.5, weight: r.id === selId ? 3 : 1.2,
      color: r.approx ? approx : "#fff", fillColor: r.approx ? approx : col[modOf(r)], fillOpacity: r.approx ? 0.55 : 0.9, dashArray: r.approx ? "2 2" : null,
    }).addTo(markerLayer);
  }
  if (SEARCH) {
    const pl = SEARCH.place, acc = getCss("--accent");
    L.circle([pl.lat, pl.lon], { radius: SEARCH.R * 1000, color: acc, weight: 1.5, dashArray: "6 6", fillOpacity: 0.04, interactive: false }).addTo(markerLayer);
    L.marker([pl.lat, pl.lon], { interactive: false, icon: pinIcon("ride", ICON_BIKE) }).addTo(markerLayer);
  }
}
const pinIcon = (cls, svg, size = 30) => L.divIcon({ className: "", html: `<div class="pin ${cls}">${svg}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size] });
function hitsAt(pt, px) {
  const out = [];
  for (const r of filtered) {
    if (!r.lat) continue;
    const q = map.latLngToContainerPoint([r.lat, r.lon]);
    const d = Math.hypot(q.x - pt.x, q.y - pt.y);
    if (d <= px) out.push([d, r]);
  }
  return out.sort((a, b) => a[0] - b[0] || a[1].date.localeCompare(b[1].date)).map(x => x[1]);
}
function pickAt(pt) {
  let hits = hitsAt(pt, 22);
  if (!hits.length) { if ($("#mapCard")) $("#mapCard").hidden = true; selId = null; drawMarkers(); return; }
  const f = hits[0];
  hits = [...new Set([...hits, ...filtered.filter(r => r.lat === f.lat && r.lon === f.lon)])].sort((a, b) => a.date.localeCompare(b.date));
  showMapCard(hits);
}
function showMapCard(list) {
  selId = list[0].id; drawMarkers();
  let box = $("#mapCard");
  if (!box) {
    box = document.createElement("div"); box.id = "mapCard"; box.className = "map-card"; $("#viewMap").appendChild(box);
    box.addEventListener("click", e => {
      if (e.target.closest("[data-close]")) { box.hidden = true; selId = null; drawMarkers(); return; }
      const fv = e.target.closest("[data-fav]"); if (fv) { e.stopPropagation(); toggleFav(fv.dataset.fav); return; }
      const c = e.target.closest(".card"); if (c) openRide(c.dataset.id);
    });
  }
  const place = list[0].city || list[0].province || "";
  box.innerHTML = `<div class="map-card-h"><b>${list.length === 1 ? "1 prueba" : `${list.length} pruebas`}${place ? ` · ${esc(place)}` : ""}</b><button class="x small-x" type="button" data-close aria-label="Cerrar">✕</button></div>
    <div class="map-card-list">${list.map(cardHTML).join("")}</div>`;
  box.hidden = false;
}

// ------------------------------------------------------------------ pantallas y botón «atrás»
// Pantallas apiladas (ficha, plan, visor). «Atrás» cierra lo último abierto; después vuelve a la pestaña
// Pruebas, limpia la búsqueda y solo sale de la app con una segunda pulsación.
const STACK = [];
function pushScreen(name, close) { STACK.push({ name, close }); }
function popScreen(name) { const i = STACK.map(x => x.name).lastIndexOf(name); if (i >= 0) STACK.splice(i, 1)[0].close(); }
let lastBack = 0;
function handleBack() {
  if ($("#viewer") && !$("#viewer").hidden) { closeViewer(); return true; }
  if (!$("#filterSheet").hidden) { openFilterSheet(false); return true; }
  if ($("#dialog") && !$("#dialog").hidden) { $("#dialog").hidden = true; return true; }
  if (STACK.length) { if (STACK[STACK.length - 1].name === "plan" && planGuard()) return true; STACK.pop().close(); return true; }
  if ($("#mapCard") && !$("#mapCard").hidden) { $("#mapCard").hidden = true; selId = null; drawMarkers(); return true; }
  const tab = $(".tabbar button.on")?.dataset.view;
  if (tab && tab !== "list") { setTab("list"); return true; }
  if (F.q) { F.q = ""; $("#q").value = ""; apply(); return true; }
  if (Date.now() - lastBack < 2000) return false;
  lastBack = Date.now(); toast("Pulsa atrás otra vez para salir"); return true;
}
async function initDeepLinks() {
  const cap = CAP.App;
  if (!APP || !cap) return;
  const open = async u => { if (!u || !/[?&](c|plan)=/.test(u)) return; try { openSharedPlan(await decodePlan(u)); } catch { toast("El enlace del plan está incompleto o dañado"); } };
  cap.addListener("appUrlOpen", e => open(e.url));
  try { const l = await cap.getLaunchUrl(); if (l?.url) setTimeout(() => open(l.url), 800); } catch { /* sin enlace */ }
}
function initBack() {
  if (APP && CAP.App) { CAP.App.addListener("backButton", () => { if (!handleBack()) CAP.App.exitApp(); }); return; }
  // navegador / PWA: una entrada «guardia» en el historial que se repone mientras haya algo que cerrar
  history.pushState({ mdc: 1 }, "");
  addEventListener("popstate", () => { if (handleBack()) history.pushState({ mdc: 1 }, ""); else history.back(); });
}

// ------------------------------------------------------------------ recorridos (track + perfil)
const TRACKS = new Map();
async function loadTrack(id) {
  if (!id) return null;
  if (TRACKS.has(id)) return TRACKS.get(id);
  const urls = [`data/tracks/${id}.json`]; if (APP && PUBLIC_URL) urls.push(`${PUBLIC_URL}data/tracks/${id}.json`);
  for (const u of urls) {
    try { const r = await fetch(u); if (r.ok) { const t = await r.json(); TRACKS.set(id, t); return t; } } catch { /* siguiente */ }
  }
  return null;
}
function profileSVG(t, color) {
  const pts = (t.pts || []).filter(p => p[2] != null);
  if (pts.length < 5) return "";
  const W = 600, H = 110, km = pts[pts.length - 1][3] || 1;
  const eles = pts.map(p => p[2]), lo = Math.min(...eles), hi = Math.max(...eles), span = Math.max(50, hi - lo);
  const x = k => (k / km) * W, y = e => H - 8 - ((e - lo) / span) * (H - 22);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p[3]).toFixed(1)},${y(p[2]).toFixed(1)}`).join("");
  const step = km > 150 ? 50 : km > 60 ? 20 : km > 25 ? 10 : 5;
  let ticks = "";
  for (let k = step; k < km; k += step) ticks += `<line x1="${x(k)}" y1="0" x2="${x(k)}" y2="${H}" stroke="currentColor" stroke-opacity=".12"/><text x="${x(k) + 3}" y="${H - 2}" font-size="11" fill="currentColor" fill-opacity=".55">${k}</text>`;
  return `<div class="profile"><div class="profile-h"><span>Perfil · ${fmtDist(t.km)}</span><span>${lo} – ${hi} m${t.dplus ? ` · +${fmtUp(t.dplus)}` : ""}</span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Perfil de desnivel">${ticks}<path d="${line}L${W},${H}L0,${H}Z" fill="${color}" fill-opacity=".22"/><path d="${line}" stroke="${color}" stroke-width="2.2" fill="none" vector-effect="non-scaling-stroke"/></svg></div>`;
}

// ------------------------------------------------------------------ ficha de la prueba
let rmap = null;
function openRide(id) {
  const r = BYID.get(id); if (!r) return;
  selId = id;
  $$(".card.sel").forEach(c => c.classList.remove("sel"));
  $(`.card[data-id="${id}"]`)?.classList.add("sel");
  const m = modOf(r);
  const where = [r.city, r.province, r.ccaa].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", ");
  const off = r.web || r.reg;
  const gmaps = r.lat ? `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`;
  const kpi = (v, l) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`;
  const sheet = $("#sheet");
  sheet.innerHTML = `
    <div class="bar"><button class="x" id="closeSheet" type="button" aria-label="Volver">←</button><h2>${fmtShort(r.date)}${r.end ? " – " + fmtShort(r.end) : ""}</h2>
      <button class="fav${favs.has(r.id) ? " on" : ""}" data-fav="${r.id}" type="button" aria-label="Favorita">${favs.has(r.id) ? "♥" : "♡"}</button></div>
    <div class="screen-body">
      ${r.img ? `<button class="poster" id="posterBtn" type="button" aria-label="Ver la imagen a pantalla completa"><img class="hero-img" src="${esc(r.img)}" alt="" onerror="this.closest('.poster').remove()"><span class="zoom-hint">Ampliar</span></button>` : ""}
      <span class="pill m-${m}">${esc(modDisc(r))}</span>
      <span class="fmt ${r.fmt === "comp" ? "comp" : ""}">${r.fmt === "comp" ? "Competición" : "Marcha / abierta"}</span>
      ${r.ebike ? `<span class="fmt">Admite e-bike</span>` : ""}
      <h1 class="race-title">${esc(r.name)}</h1>
      ${r.x ? `<p class="warn"><b>Aparece como suspendida o aplazada</b> en el calendario de la federación. Compruébalo en la web oficial.</p>` : ""}
      ${(() => { const ks = [
        r.dist?.length ? kpi(r.dist.length > 1 ? `${Math.round(r.dist[0])}–${fmtDist(r._max)}` : fmtDist(r._max), "Distancia") : "",
        r.elev ? kpi("+" + fmtUp(r.elev), "Desnivel") : "", r.time ? kpi(esc(r.time), "Salida") : "",
        r.price ? kpi(esc(r.price.replace(/\s*-\s*S[oó]lo Federados/i, "").slice(0, 12)), "Precio") : ""].filter(Boolean);
        return ks.length ? `<div class="kpis" style="grid-template-columns:repeat(${ks.length},minmax(0,1fr))">${ks.join("")}</div>` : ""; })()}
      <dl class="facts">
        <dt>Fecha</dt><dd>${fmtRange(r)}${r.time ? ` · ${esc(r.time)} h` : ""}</dd>
        <dt>Lugar</dt><dd>${esc(where || "Por confirmar")}${r.approx ? ' <span class="muted small">(aprox.)</span>' : r.start ? ' <span class="muted small">(punto de salida)</span>' : ""}</dd>
        ${(r.dist || []).length > 1 ? `<dt>Recorridos</dt><dd>${r.dist.map(d => `<span class="stat">${fmtDist(d)}</span>`).join(" ")}</dd>` : ""}
        ${r.club ? `<dt>Organiza</dt><dd>${esc(r.club)}</dd>` : ""}
        ${r.price ? `<dt>Inscripción</dt><dd>${esc(r.price)}</dd>` : ""}
        ${r.cats ? `<dt>Categorías</dt><dd class="cats">${esc(r.cats)}</dd>` : ""}
      </dl>
      ${r.fed ? `<p class="license">${ICON_INFO}<span>Solo para ciclistas <b>federados</b> (licencia anual).</span></p>` :
        r.fmt === "comp" ? `<p class="license">${ICON_INFO}<span>Competición federada: necesitas licencia, o licencia de un día si la organización la ofrece.</span></p>` :
        `<p class="license">${ICON_INFO}<span>Si no estás federado suele pedirse <b>licencia o seguro de un día</b> (10–18 €) al inscribirte.</span></p>`}
      <button class="btn primary block" id="planIt" type="button">Planificar finde: pedalear · dormir · comer</button>
      ${r.lat ? `<div id="raceMap"></div>` : ""}
      <div id="profileBox"></div>
      ${r.desc ? `<p class="note">${esc(r.desc)}</p>` : ""}
      <div class="actions">
        ${off ? `<a class="btn ghost small" href="${esc(off)}" target="_blank" rel="noopener">Web oficial ↗</a>` : ""}
        ${r.reg && r.reg !== off ? `<a class="btn ghost small" href="${esc(r.reg)}" target="_blank" rel="noopener">Inscripción ↗</a>` : ""}
        ${r.gpx ? `<a class="btn ghost small" href="${esc(r.gpx)}" target="_blank" rel="noopener">Track GPX ↗</a>` : ""}
        <a class="btn ghost small" href="${gmaps}" target="_blank" rel="noopener">Cómo llegar ↗</a>
        <a class="btn ghost small" href="https://www.google.com/search?q=${encodeURIComponent(r.name + " " + pd(r.date).getFullYear())}" target="_blank" rel="noopener">Buscar en Google ↗</a>
      </div>
      ${(r.docs || []).length ? `<div class="doclist">${r.docs.map(d => `<a class="btn ghost small" href="${esc(d.u)}" target="_blank" rel="noopener">${esc(d.n)} ↗</a>`).join("")}</div>` : ""}
      <p class="src-list">Aparece en: ${(r.src || []).map(s => `<a href="${esc(s.u)}" target="_blank" rel="noopener">${esc(s.n)}</a>`).join(" · ")}</p>
    </div>`;
  sheet.hidden = false; sheet.scrollTop = 0;
  if (!STACK.some(x => x.name === "ride")) pushScreen("ride", hideRide);
  $("#closeSheet").onclick = () => popScreen("ride");
  if ($("#posterBtn")) $("#posterBtn").onclick = () => openViewer(r.img, r.name);
  $("#planIt").onclick = () => openPlan(newPlan(r));
  sheet.querySelector("[data-fav]").onclick = () => toggleFav(r.id);
  if (r.lat && window.L) {
    if (rmap) { rmap.remove(); rmap = null; }
    rmap = L.map("raceMap", { preferCanvas: true, zoomControl: false, attributionControl: false, dragging: !L.Browser.mobile, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: true }).setView([r.lat, r.lon], r.approx ? 8 : 12);
    baseLayers(rmap);
    L.marker([r.lat, r.lon], { icon: pinIcon("ride", ICON_BIKE) }).addTo(rmap);
  }
  if (r.trk) loadTrack(r.trk).then(t => {
    if (!t || selId !== r.id) return;
    $("#profileBox").innerHTML = profileSVG(t, getCss("--m-" + m));
    if (rmap && t.pts?.length) { const line = L.polyline(t.pts.map(p => [p[0], p[1]]), { color: getCss("--m-" + m), weight: 4, opacity: .9 }).addTo(rmap); rmap.fitBounds(line.getBounds(), { padding: [16, 16] }); }
  });
}
function hideRide() { $("#sheet").hidden = true; if (rmap) { rmap.remove(); rmap = null; } }

// visor de imagen (pellizcar, doble toque, arrastrar)
function openViewer(src, title) {
  let v = $("#viewer");
  if (!v) {
    v = document.createElement("div"); v.id = "viewer"; v.className = "viewer";
    v.innerHTML = `<div class="viewer-bar"><span id="viewerTitle"></span><button class="x" type="button" id="viewerClose" aria-label="Cerrar">✕</button></div><div class="viewer-stage"><img id="viewerImg" alt=""></div><p class="viewer-hint">Pellizca para ampliar · doble toque para zoom</p>`;
    $("#app").appendChild(v);
    $("#viewerClose").onclick = closeViewer;
    bindPinch(v.querySelector(".viewer-stage"), $("#viewerImg"));
  }
  const img = $("#viewerImg"); img.src = src; $("#viewerTitle").textContent = title || ""; img._reset?.();
  v.hidden = false;
}
function closeViewer() { const v = $("#viewer"); if (v) v.hidden = true; }
function bindPinch(stage, img) {
  let sc = 1, tx = 0, ty = 0, pts = new Map(), start = null, lastTap = 0;
  const set = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${sc})`; };
  const clamp = () => { if (sc <= 1) { sc = 1; tx = 0; ty = 0; } set(); };
  img._reset = () => { sc = 1; tx = 0; ty = 0; set(); };
  stage.addEventListener("pointerdown", e => {
    stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      const now = Date.now();
      if (now - lastTap < 300) {
        if (sc > 1) { sc = 1; tx = 0; ty = 0; } else { const rc = stage.getBoundingClientRect(); sc = 2.6; tx = (rc.width / 2 - (e.clientX - rc.left)) * 1.6; ty = (rc.height / 2 - (e.clientY - rc.top)) * 1.6; }
        set(); lastTap = 0; return;
      }
      lastTap = now;
    }
    const [a, b] = [...pts.values()];
    start = { sc, tx, ty, a: { ...a }, d: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0, m: b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a };
  });
  stage.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId) || !start) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...pts.values()];
    if (b && start.d) {
      const mm = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      sc = Math.min(6, Math.max(1, start.sc * Math.hypot(a.x - b.x, a.y - b.y) / start.d));
      tx = start.tx + (mm.x - start.m.x); ty = start.ty + (mm.y - start.m.y);
    } else if (sc > 1) { tx = start.tx + (a.x - start.a.x); ty = start.ty + (a.y - start.a.y); }
    set();
  });
  const up = e => { pts.delete(e.pointerId); clamp(); const [a] = [...pts.values()]; start = a ? { sc, tx, ty, a: { ...a }, d: 0, m: a } : null; };
  stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
  stage.addEventListener("wheel", e => { e.preventDefault(); sc = Math.min(6, Math.max(1, sc * (e.deltaY < 0 ? 1.15 : 0.87))); clamp(); }, { passive: false });
}

// ------------------------------------------------------------------ planes
const uid = () => Math.random().toString(36).slice(2, 10);
const BIKES = { road: "Carretera", mtb: "BTT / MTB", gravel: "Gravel", cx: "Ciclocross", ebike: "E-bike", tt: "Contrarreloj" };
const CHECK_BASE = [
  "Casco", "Licencia federativa o seguro/licencia de día", "DNI y confirmación de la inscripción", "Dorsal / placa de manillar y bridas", "Chip (si no va en la placa)",
  "Bici revisada: frenos, cambios y cadena engrasada", "Presión de ruedas ajustada", "2 cámaras o kit tubeless (mechas y líquido)", "Bomba o CO2 + desmontables",
  "Multiherramienta con tronchacadenas y eslabón rápido", "Patilla de cambio de repuesto", "2 bidones", "Geles, barritas y sales", "Culotte y maillot",
  "Chaleco o cortavientos", "Manguitos / perneras (según el tiempo)", "Guantes", "Gafas", "Zapatillas y calas", "GPS / ciclocomputador con el track cargado",
  "Luces delantera y trasera", "Cargadores y batería externa", "Crema solar y crema antirrozaduras", "Ropa de cambio, toalla y chanclas", "Portabicis y llave del candado",
];
const CHECK_MOD = {
  mtb: ["Mochila o chaleco de hidratación", "Rodilleras / protecciones (enduro y descenso)", "Líquido tubeless de repuesto"],
  gravel: ["Bolsas: cuadro o sillín", "Cubiertas mixtas revisadas", "Comida extra para tramos sin avituallamiento"],
  cx: ["Ropa y calcetines de repuesto (barro)", "Cepillo y agua para limpiar la bici", "Presión baja y cubiertas de barro"],
  ultra: ["Luces potentes y baterías para la noche", "Chaleco reflectante", "Bolsas de bikepacking", "Saco / vivac y manta térmica", "Comida de reserva y dinero en efectivo", "Tarjeta de control (brevets)"],
  road: ["Cámaras extra (carretera)", "Chubasquero ligero"],
  ebike: ["Batería cargada al 100 %", "Cargador de la batería"],
};
function checkFor(mod, ebike) { return [...CHECK_BASE, ...(CHECK_MOD[mod] || []), ...(ebike && mod !== "ebike" ? CHECK_MOD.ebike : [])]; }

function newPlan(r) {
  const ride = { id: r.id, name: r.name, date: r.date, end: r.end || "", time: r.time || "", city: r.city || "", province: r.province || "", lat: r.lat, lon: r.lon,
    mod: modOf(r), disc: r.disc || "", dist: r.dist || [], elev: r.elev || null, web: r.web || r.reg || (r.src?.[0]?.u || ""), trk: r.trk || "", fmt: r.fmt || "", fed: !!r.fed };
  const early = r.time && r.time < "09:30";
  const long = (r._max || 0) >= 100 || r.mod === "ultra" || !!r.end;
  const arrive = addDays(r.date, long || early ? -1 : 0);
  const leave = r.end || r.date;
  const p = {
    v: 1, id: uid(), title: `Finde en ${r.city || r.province || "bici"}`, ride, chosen: r._max || null, people: 2,
    bike: { road: "road", mtb: "mtb", gravel: "gravel", cx: "cx", ebike: "ebike" }[modOf(r)] || (r.mod === "ultra" ? "gravel" : "road"),
    origin: store.get("origin", ""), transport: "car", license: r.fed ? "fed" : store.get("license", "day"), arrive, leave,
    stay: null, meals: [
      { slot: "Cena víspera", day: addDays(r.date, -1), time: "21:00", pref: "pasta", place: null },
      { slot: "Desayuno", day: r.date, time: early ? "06:45" : "07:30", pref: "desayuno", place: null },
      { slot: "Comida post-prueba", day: leave, time: "15:00", pref: "local", place: null },
    ],
    events: [], check: checkFor(modOf(r), r.ebike).map(t => ({ t, d: false })),
    notes: "", cost: { fee: "", license: "", travel: "", stay: "", food: "" }, created: Date.now(),
  };
  if (arrive === r.date) p.meals.shift();
  const sameDay = arrive === r.date;
  p.events = [
    { day: arrive, time: sameDay ? "06:00" : "18:00", text: sameDay ? "Salida de casa con la bici" : "Llegada con la bici", k: "go", role: "arrive" },
    { day: sameDay ? r.date : arrive, time: sameDay ? "07:45" : "19:00", text: "Recogida de dorsal / placa", k: "ride" },
    { day: r.date, time: r.time ? addMin(r.time, -40) : "08:15", text: "Montar la bici, presión de ruedas y calentar", k: "ride" },
    { day: r.date, time: r.time || "09:00", text: "¡Salida de la prueba!", k: "ride" },
    { day: leave, time: "18:30", text: "Vuelta a casa", k: "go", role: "leave" },
  ];
  return p;
}
function addMin(t, n) { const [h, m] = t.split(":").map(Number); const x = Math.max(0, h * 60 + m + n); return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; }
function savePlan(p) { plans[p.id] = p; store.set("plans", plans); $("#plansCount").textContent = Object.keys(plans).length; }
function deletePlan(id) { delete plans[id]; store.set("plans", plans); $("#plansCount").textContent = Object.keys(plans).length; }

let P = null, pmap = null, pLayers = {}, DIRTY = false;
const isSaved = p => !!plans[p.id];
function openPlan(p) {
  P = JSON.parse(JSON.stringify(p)); // se edita una copia: nada se guarda hasta pulsar «Guardar plan»
  DIRTY = false;
  const v = $("#planView"); v.hidden = false; v.scrollTop = 0;
  if (!STACK.some(x => x.name === "plan")) pushScreen("plan", hidePlan);
  renderPlan();
}
function closePlan() { if (!planGuard()) popScreen("plan"); }
function planGuard(after) {
  if (!P || !DIRTY) return false;
  confirmDialog({
    title: isSaved(P) ? "¿Salir sin guardar los cambios?" : "¿Salir sin guardar el plan?",
    text: isSaved(P) ? "Los cambios que has hecho en este plan se perderán." : "Todavía no está en «Mis planes». Si sales ahora perderás todo lo que has configurado.",
    buttons: [
      { label: "Guardar y salir", cls: "primary", fn: () => { commitSave(); popScreen("plan"); after?.(); } },
      { label: "Salir sin guardar", cls: "ghost danger", fn: () => { DIRTY = false; popScreen("plan"); after?.(); } },
      { label: "Seguir editando", cls: "ghost", fn: () => {} },
    ],
  });
  return true;
}
function commitSave() { if (!P) return; savePlan(JSON.parse(JSON.stringify(P))); DIRTY = false; updateSaveBar(); }
function updateSaveBar() {
  const b = $("#pSave"); if (!b || !P) return;
  const saved = isSaved(P);
  b.disabled = saved && !DIRTY;
  b.textContent = !saved ? "Guardar plan" : DIRTY ? "Guardar cambios" : "✓ Guardado en Mis planes";
  b.classList.toggle("done", saved && !DIRTY);
  $("#saveHint").textContent = !saved ? "Aún no está en Mis planes" : DIRTY ? "Tienes cambios sin guardar" : "";
}
function confirmDialog({ title, text, buttons }) {
  let d = $("#dialog");
  if (!d) { d = document.createElement("div"); d.id = "dialog"; d.className = "dialog-wrap"; $("#app").appendChild(d); }
  d.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlgT"><h2 id="dlgT">${esc(title)}</h2><p>${esc(text)}</p>
    <div class="dialog-actions">${buttons.map((b, i) => `<button class="btn ${b.cls}" type="button" data-i="${i}">${esc(b.label)}</button>`).join("")}</div></div>`;
  d.hidden = false;
  d.onclick = e => { const b = e.target.closest("[data-i]"); if (b) { d.hidden = true; buttons[+b.dataset.i].fn(); } else if (e.target === d) d.hidden = true; };
  d.querySelector(".btn").focus();
}
function hidePlan() { $("#planView").hidden = true; if (pmap) { pmap.remove(); pmap = null; } P = null; DIRTY = false; if (!$("#plansView").hidden) openPlans(); }
function nightsOf(p) { return Math.max(0, Math.round((pd(p.leave) - pd(p.arrive)) / 864e5)); }
const fmtHours = h => { const m = Math.round(h * 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`; };
function daysOf(p) {
  const out = []; let d = p.arrive < p.ride.date ? p.arrive : p.ride.date;
  const end = p.leave > (p.ride.end || p.ride.date) ? p.leave : (p.ride.end || p.ride.date);
  while (d <= end && out.length < 12) { out.push(d); d = addDays(d, 1); }
  return out;
}
function originPlace(p) { const pl = p.origin ? findPlace(p.origin) : null; return pl ? { lat: pl.lat, lon: pl.lon, name: pl.name } : null; }

function renderPlan() {
  const p = P, r = p.ride, m = MODS[r.mod] ? r.mod : "other";
  const v = $("#planView");
  const nights = nightsOf(p);
  const o = originPlace(p);
  const travelKm = o && r.lat ? haversine(o.lat, o.lon, r.lat, r.lon) * 1.25 : null;
  v.innerHTML = `
  <div class="bar">
    <button class="x" id="pvClose" type="button" aria-label="Volver">←</button>
    <input class="title-in" id="pTitle" value="${esc(p.title)}" aria-label="Nombre del plan">
    <button class="icon-btn" id="pvShare" type="button" aria-label="Compartir"><svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg></button>
  </div>
  <nav class="seg" id="seg">
    <a href="#secRide" class="on"><i style="background:var(--ride)"></i>Pedalear</a>
    <a href="#secSleep"><i style="background:var(--stay)"></i>Dormir</a>
    <a href="#secEat"><i style="background:var(--eat)"></i>Comer</a>
    <a href="#secPlan"><i style="background:var(--muted)"></i>Itinerario</a>
    <a href="#secBag"><i style="background:var(--muted)"></i>Mochila</a>
    <a href="#secMoney"><i style="background:var(--muted)"></i>Gastos</a>
    <a href="#shareBox"><i style="background:var(--accent)"></i>Compartir</a>
  </nav>
  <div class="screen-body">
    <div id="planMap"></div>
    <section class="panel" id="secRide">
      <div class="panel-h"><span class="tag run"></span><h2>Pedalear</h2><span class="sub">${fmtRange(r)}</span></div>
      <div class="pick set"><span class="ico run">${ICON_BIKE}</span>
        <span class="t"><b>${esc(r.name)}</b><small>${esc([modDisc(r), [r.city, r.province].filter(Boolean).join(", "), r.time ? "salida " + r.time : ""].filter(Boolean).join(" · "))}</small></span>
        ${r.web ? `<a class="btn ghost small" href="${esc(r.web)}" target="_blank" rel="noopener">Web ↗</a>` : ""}</div>
      <div id="planProfile"></div>
      <div class="grid2" style="margin-top:12px">
        <label class="field">Recorrido que hago
          <select id="pDist">${(r.dist.length ? r.dist : [null]).map(d => `<option value="${d ?? ""}" ${d === p.chosen ? "selected" : ""}>${d ? fmtDist(d) : "Por decidir"}</option>`).join("")}</select></label>
        <label class="field">Personas<input id="pPeople" type="number" min="1" max="30" value="${p.people}"></label>
        <label class="field">Bici<select id="pBike">${Object.entries(BIKES).map(([k, l]) => `<option value="${k}" ${k === p.bike ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="field">Licencia<select id="pLic"><option value="fed" ${p.license === "fed" ? "selected" : ""}>Federado/a</option><option value="day" ${p.license === "day" ? "selected" : ""}>Licencia de día</option></select></label>
        <label class="field">Salgo desde<input id="pOrigin" list="towns" value="${esc(p.origin)}" placeholder="Tu municipio"></label>
        <label class="field">Transporte<select id="pTrans">${[["car", "Coche con portabicis"], ["van", "Furgoneta"], ["train", "Tren (bici en funda)"], ["bike", "En bici"], ["other", "Otro"]].map(([k, l]) => `<option value="${k}" ${k === p.transport ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="field">Llegada<input id="pArrive" type="date" value="${p.arrive}"></label>
        <label class="field">Vuelta<input id="pLeave" type="date" value="${p.leave}"></label>
      </div>
      <p class="small muted" style="margin:10px 0 0">${nights ? `${nights} noche${nights > 1 ? "s" : ""} fuera` : "Ida y vuelta en el día"}${travelKm ? ` · ≈${Math.round(travelKm)} km por carretera (≈${fmtHours(travelKm / 85)})` : ""}
        ${o && r.lat ? ` · <a href="https://www.google.com/maps/dir/?api=1&origin=${o.lat},${o.lon}&destination=${r.lat},${r.lon}" target="_blank" rel="noopener">Ruta en Google Maps ↗</a>` : ""}</p>
      ${p.license === "day" && !r.fed ? `<p class="license">${ICON_INFO}<span>Sin licencia anual: al inscribirte añade la <b>licencia o seguro de día</b> (suele costar 10–18 €). Lo sumo en Gastos.</span></p>` : ""}
      ${r.fed && p.license === "day" ? `<p class="warn">Esta prueba es solo para federados: la licencia de día no sirve.</p>` : ""}
    </section>

    <section class="panel" id="secSleep">
      <div class="panel-h"><span class="tag sleep"></span><h2>Dormir</h2><span class="sub">${nights ? `${fmtShort(p.arrive)} → ${fmtShort(p.leave)}` : "No hace falta: vuelta en el día"}</span></div>
      ${placeCard(p.stay, "sleep", "Sin alojamiento elegido todavía")}
      <div class="toolbar">
        <select id="stayType" aria-label="Tipo de alojamiento">
          <option value="hotel|motel">Hoteles</option><option value="hostel|guest_house">Hostales y albergues</option>
          <option value="apartment|chalet">Apartamentos y casas rurales</option><option value="camp_site|caravan_site">Campings y áreas autocaravana</option>
          <option value="hotel|motel|hostel|guest_house|apartment|chalet|camp_site|caravan_site" selected>Todo</option>
        </select>
        <select id="stayR" aria-label="Radio"><option value="3000">3 km</option><option value="8000" selected>8 km</option><option value="20000">20 km</option></select>
        <button class="btn ghost small" id="staySearch" type="button">Buscar cerca de la salida</button>
      </div>
      <label class="checkrow"><input type="checkbox" id="stayBike" checked> Primero los que admiten bicis o tienen garaje</label>
      <div class="results" id="stayRes"></div>
      <div class="toolbar">${stayLinks(p)}</div>
      <details style="margin-top:10px"><summary class="small muted">Añadir a mano (Airbnb, casa de un amigo…)</summary>${manualForm("stay")}</details>
    </section>

    <section class="panel" id="secEat">
      <div class="panel-h"><span class="tag eat"></span><h2>Comer</h2><span class="sub">cerca de ${p.stay ? "tu alojamiento" : "la salida"}</span></div>
      ${p.meals.map((mm, i) => `
        <div class="slot" data-i="${i}">
          <div class="slot-h"><h3>${esc(mm.slot)}</h3><span class="muted small">${fmtShort(mm.day)}</span><input type="time" value="${mm.time}" data-mt="${i}" aria-label="Hora">
            <button class="link-btn small" data-mdel="${i}" type="button">quitar</button></div>
          ${placeCard(mm.place, "eat", prefHint(mm.pref), i)}
          <div class="toolbar">
            <select data-mpref="${i}" aria-label="Qué te apetece">${Object.entries(PREFS).map(([k, x]) => `<option value="${k}" ${k === mm.pref ? "selected" : ""}>${x.label}</option>`).join("")}</select>
            <button class="btn ghost small" data-msearch="${i}" type="button">Sugerencias</button>
            <a class="btn ghost small" target="_blank" rel="noopener" href="${eatLink(p, mm)}">Google Maps ↗</a>
          </div>
          <div class="results" data-mres="${i}"></div>
        </div>`).join("")}
      <div class="toolbar" style="margin-top:12px">
        <input id="newMeal" placeholder="Otra comida (p. ej. Almuerzo en ruta)" style="flex:1">
        <button class="btn ghost small" id="addMeal" type="button">Añadir</button>
      </div>
    </section>

    <section class="panel" id="secPlan">
      <div class="panel-h"><span class="tag todo"></span><h2>Itinerario</h2></div>
      ${timelineHTML(p)}
      <div class="tl-add">
        <input type="time" id="evTime" value="10:00" aria-label="Hora">
        <input id="evText" placeholder="Añadir: visitar el pueblo, lavar la bici…" aria-label="Qué">
        <select id="evDay" aria-label="Día">${daysOf(p).map(d => `<option value="${d}">${fmtShort(d)}</option>`).join("")}</select>
        <button class="btn ghost small" id="evAdd" type="button">Añadir</button>
      </div>
    </section>

    <section class="panel" id="secBag">
      <div class="panel-h"><span class="tag todo"></span><h2>Mochila</h2><span class="sub">${p.check.filter(c => c.d).length}/${p.check.length}</span></div>
      <ul class="check">${p.check.map((c, i) => `<li class="${c.d ? "done" : ""}"><label><input type="checkbox" data-ck="${i}" ${c.d ? "checked" : ""}><span>${esc(c.t)}</span></label></li>`).join("")}</ul>
      <div class="toolbar"><input id="newCk" placeholder="Añadir a la lista" style="flex:1"><button class="btn ghost small" id="addCk" type="button">Añadir</button></div>
    </section>

    <section class="panel" id="secMoney">
      <div class="panel-h"><span class="tag todo"></span><h2>Presupuesto y notas</h2></div>
      <div class="grid2">
        ${[["fee", "Inscripción (total €)"], ["license", "Licencia de día (€)"], ["travel", "Viaje (€)"], ["stay", "Alojamiento (€)"], ["food", "Comidas (€)"]].map(([k, l]) => `<label class="field">${l}<input type="number" min="0" step="1" data-cost="${k}" value="${esc(p.cost[k] ?? "")}"></label>`).join("")}
      </div>
      ${budgetHTML(p)}
      <label class="field" style="margin-top:12px">Notas<textarea id="pNotes" placeholder="Parking, recogida de dorsal, quién lleva el portabicis…">${esc(p.notes)}</textarea></label>
    </section>
    <section class="panel share-box" id="shareBox">
      <div class="panel-h"><span class="tag run"></span><h2>Compartir</h2></div>
      <p class="small muted" style="margin:0 0 10px">Se comparte una ficha en imagen con lo importante y un enlace (y QR) que lleva el plan entero para guardarlo en la app.</p>
      <button class="card-preview-btn" id="cardPreviewBtn" type="button" aria-label="Ver ficha a pantalla completa"><img id="cardPreview" class="card-preview" alt="Ficha resumen del plan"></button>
      <div class="share-row" style="margin-top:10px">
        <button class="btn primary wide" id="shCard" type="button">Compartir ficha (imagen + enlace)</button>
        <button class="btn ghost small" id="shSend" type="button">Enviar solo texto</button>
        <button class="btn ghost small" id="shSaveImg" type="button">Guardar imagen</button>
        <button class="btn ghost small" id="shLink" type="button">Copiar enlace</button>
        <button class="btn ghost small" id="shText" type="button">Copiar resumen</button>
        <button class="btn ghost small" id="shIcs" type="button">Calendario (.ics)</button>
        <button class="btn ghost small" id="shJson" type="button">Exportar archivo</button>
      </div>
      <div class="qr" id="qr"></div>
      <details><summary class="small muted">Código del plan (para pegar en «Importar»)</summary><div class="code" id="planCode">…</div></details>
      ${isSaved(p) ? `<button class="link-btn small" id="pDelete" type="button">Borrar este plan</button>` : ""}
    </section>
  </div>
  <div class="save-bar"><span class="small muted" id="saveHint"></span><button class="btn primary block" id="pSave" type="button">Guardar plan</button></div>`;
  bindPlan();
  updateSaveBar();
  drawPlanMap();
  refreshShare();
  if (r.trk) loadTrack(r.trk).then(t => { if (t && P === p && $("#planProfile")) { $("#planProfile").innerHTML = profileSVG(t, getCss("--m-" + m)); drawPlanTrack(t); } });
}
function placeCard(pl, kind, empty, i) {
  if (!pl) return `<div class="pick"><span class="ico ${kind}">${kind === "sleep" ? ICON_BED : ICON_FORK}</span><span class="t"><b class="muted" style="font-weight:600">${esc(empty)}</b></span></div>`;
  const dd = P.ride.lat && pl.lat ? haversine(P.ride.lat, P.ride.lon, pl.lat, pl.lon) : null;
  return `<div class="pick set"><span class="ico ${kind}">${kind === "sleep" ? ICON_BED : ICON_FORK}</span>
    <span class="t"><b>${esc(pl.name)}</b><small>${esc([pl.type, pl.bike ? "admite bicis" : "", pl.park ? "parking/garaje" : "", pl.addr, dd != null ? `a ${fmtKm(dd)} de la salida` : "", pl.price ? pl.price + " €" : ""].filter(Boolean).join(" · "))}</small></span>
    ${pl.url ? `<a class="btn ghost small" href="${esc(pl.url)}" target="_blank" rel="noopener">Ver ↗</a>` : ""}
    <button class="link-btn small" data-unset="${kind}" ${i != null ? `data-i="${i}"` : ""} type="button">cambiar</button></div>`;
}
const PREFS = {
  pasta: { label: "Pasta / italiano (carga de hidratos)", re: /italian|pizza|pasta/i },
  local: { label: "Cocina local / tapas", re: /regional|spanish|tapas|local|mediterranean|basque|catalan|galician|asturian|andalusian/i },
  desayuno: { label: "Desayuno / cafetería (temprano)", amen: "cafe|bakery", re: /coffee|cafe|breakfast|bakery|pastry/i },
  burger: { label: "Hamburguesa / rápido", amen: "fast_food|restaurant", re: /burger|sandwich|kebab/i },
  veg: { label: "Vegetariano / vegano", re: /vegetarian|vegan/i, diet: true },
  asian: { label: "Asiático / sushi", re: /asian|japanese|sushi|chinese|thai|vietnamese|indian|ramen/i },
  any: { label: "Cualquier sitio", re: /./ },
};
const prefHint = k => `Sin sitio elegido · ${PREFS[k]?.label || ""}`;
function stayLinks(p) {
  const r = p.ride, ci = p.arrive, co = p.leave > p.arrive ? p.leave : addDays(p.arrive, 1);
  const where = encodeURIComponent([r.city, r.province].filter(Boolean).join(", ") || r.name);
  const ll = r.lat ? `&latitude=${r.lat}&longitude=${r.lon}` : "";
  return [
    ["Booking", `https://www.booking.com/searchresults.es.html?ss=${where}${ll}&checkin=${ci}&checkout=${co}&group_adults=${p.people}&no_rooms=1&order=distance_from_search`],
    ["Airbnb", `https://www.airbnb.es/s/${where}/homes?checkin=${ci}&checkout=${co}&adults=${p.people}`],
    ["Google Hoteles", `https://www.google.com/travel/hotels/${where}?q=hoteles%20cerca%20de%20${where}&dates=${ci}_${co}`],
    ["Bike friendly", `https://www.google.com/maps/search/${encodeURIComponent("hotel bike friendly garaje bicicletas")}/@${r.lat || 40},${r.lon || -3},12z`],
  ].map(([n, u]) => `<a class="btn ghost small" href="${u}" target="_blank" rel="noopener">${n} ↗</a>`).join("");
}
function eatLink(p, m) {
  const c = p.stay?.lat ? p.stay : p.ride;
  const q = { pasta: "restaurante italiano", local: "restaurante tapas", desayuno: "cafetería desayunos", burger: "hamburguesería", veg: "restaurante vegetariano", asian: "restaurante asiático", any: "restaurantes" }[m.pref] || "restaurantes";
  return `https://www.google.com/maps/search/${encodeURIComponent(q)}/@${c.lat || 40},${c.lon || -3},15z`;
}
function manualForm(kind, i) {
  return `<div class="grid2" style="margin-top:8px" data-manual="${kind}" ${i != null ? `data-i="${i}"` : ""}>
    <label class="field">Nombre<input data-mf="name" placeholder="Hotel / casa / restaurante"></label>
    <label class="field">Enlace<input data-mf="url" placeholder="https://…"></label>
    <label class="field">Precio (€)<input data-mf="price" type="number" min="0"></label>
    <div style="display:flex;align-items:end"><button class="btn ghost small" data-mfsave="${kind}" type="button">Guardar</button></div></div>`;
}
function timelineHTML(p) {
  const items = [...p.events.map((e, i) => ({ ...e, i })),
    ...(p.stay && nightsOf(p) ? [{ day: p.arrive, time: "15:00", text: `Check-in · ${p.stay.name}${p.stay.bike || p.stay.park ? " (guardar la bici)" : ""}`, k: "sleep", auto: 1 }, { day: p.leave, time: "11:00", text: `Check-out · ${p.stay.name}`, k: "sleep", auto: 1 }] : []),
    ...p.meals.filter(m => m.place).map(m => ({ day: m.day, time: m.time, text: `${m.slot} · ${m.place.name}`, k: "eat", auto: 1 }))]
    .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
  let html = "", last = "";
  for (const e of items) {
    if (e.day !== last) { html += `${last ? "</ul>" : ""}<p class="tl-day">${fmtDate(e.day)}</p><ul class="tl">`; last = e.day; }
    html += `<li class="ev"><span class="tm">${esc(e.time)}</span><span class="mk ${e.k === "ride" ? "run" : e.k || ""}"></span><span class="tx">${esc(e.text)}</span>${e.auto ? "<span></span>" : `<button class="rm" data-evdel="${e.i}" type="button" aria-label="Quitar">✕</button>`}</li>`;
  }
  return html + (last ? "</ul>" : `<p class="muted">Sin momentos todavía.</p>`);
}
function budgetHTML(p) {
  const c = p.cost, n = Math.max(1, +p.people || 1);
  const tot = ["fee", "license", "travel", "stay", "food"].reduce((s, k) => s + (+c[k] || 0), 0);
  if (!tot) return "";
  return `<div class="budget"><span>Total</span><b class="num">${tot.toLocaleString("es-ES")} €</b><span class="muted">Por persona (${n})</span><span class="num">${(tot / n).toLocaleString("es-ES", { maximumFractionDigits: 0 })} €</span></div>`;
}
function bindPlan() {
  const p = P, v = $("#planView");
  const commit = (rerender = true) => { DIRTY = true; if (rerender) { const y = v.scrollTop; renderPlan(); v.scrollTop = y; } else { refreshShare(); updateSaveBar(); } };
  $("#pSave").onclick = () => {
    const wasNew = !isSaved(p); commitSave();
    if (wasNew) { toast("Plan guardado en «Mis planes»"); const y = v.scrollTop; renderPlan(); v.scrollTop = y; } else toast("Cambios guardados");
  };
  $("#pvClose").onclick = closePlan;
  $("#pvShare").onclick = () => $("#shareBox").scrollIntoView({ behavior: "smooth" });
  $$("#seg a").forEach(a => a.onclick = e => { e.preventDefault(); $(a.getAttribute("href")).scrollIntoView({ behavior: "smooth", block: "start" }); });
  const secs = $$("#seg a").map(a => $(a.getAttribute("href")));
  v.onscroll = () => {
    const y = v.scrollTop + 140; let cur = secs[0];
    for (const s of secs) if (s.offsetTop <= y) cur = s;
    $$("#seg a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + cur.id));
  };
  $("#shSend").onclick = async () => {
    const url = await planURL(p);
    if (APP && CAP.Share) { try { await CAP.Share.share({ title: p.title, text: `${planText(p)}\n\n${url}`, dialogTitle: "Enviar plan" }); } catch { /* cancelado */ } return; }
    if (navigator.share && !EMBED) { try { await navigator.share({ title: p.title, text: planText(p), url: url.startsWith("http") ? url : undefined }); return; } catch { /* cancelado */ } }
    copy(`${planText(p)}\n\n${url}`, "Plan copiado: pégalo en WhatsApp o Telegram");
  };
  $("#pTitle").oninput = e => { p.title = e.target.value; commit(false); };
  $("#pDist").onchange = e => { p.chosen = e.target.value ? +e.target.value : null; commit(false); };
  $("#pPeople").onchange = e => { p.people = Math.max(1, +e.target.value || 1); commit(); };
  $("#pBike").onchange = e => { p.bike = e.target.value; commit(false); };
  $("#pLic").onchange = e => { p.license = e.target.value; store.set("license", p.license); if (p.license === "day" && !p.cost.license) p.cost.license = String(15 * p.people); if (p.license === "fed") p.cost.license = ""; commit(); };
  $("#pTrans").onchange = e => { p.transport = e.target.value; commit(false); };
  $("#pOrigin").onchange = e => { p.origin = e.target.value; store.set("origin", p.origin); commit(); };
  $("#pArrive").onchange = e => { p.arrive = e.target.value || p.arrive; if (p.leave < p.arrive) p.leave = p.arrive; syncMealDays(p); syncRoles(p); commit(); };
  $("#pLeave").onchange = e => { p.leave = e.target.value || p.leave; if (p.leave < p.arrive) p.arrive = p.leave; syncRoles(p); commit(); };
  $("#pNotes").oninput = e => { p.notes = e.target.value; commit(false); };
  $$("[data-cost]", v).forEach(i => i.onchange = () => { p.cost[i.dataset.cost] = i.value; commit(); });
  $$("[data-ck]", v).forEach(i => i.onchange = () => { p.check[+i.dataset.ck].d = i.checked; i.closest("li").classList.toggle("done", i.checked); commit(false); });
  $("#addCk").onclick = () => { const t = $("#newCk").value.trim(); if (t) { p.check.push({ t, d: false }); commit(); } };
  $("#addMeal").onclick = () => { const t = $("#newMeal").value.trim(); if (t) { p.meals.push({ slot: t, day: p.ride.date, time: "13:00", pref: "any", place: null }); commit(); } };
  $$("[data-mdel]", v).forEach(b => b.onclick = () => { p.meals.splice(+b.dataset.mdel, 1); commit(); });
  $$("[data-mt]", v).forEach(i => i.onchange = () => { p.meals[+i.dataset.mt].time = i.value; commit(); });
  $$("[data-mpref]", v).forEach(s => s.onchange = () => { p.meals[+s.dataset.mpref].pref = s.value; commit(); });
  $$("[data-msearch]", v).forEach(b => b.onclick = () => searchEat(+b.dataset.msearch));
  $$("[data-unset]", v).forEach(b => b.onclick = () => { if (b.dataset.unset === "sleep") p.stay = null; else p.meals[+b.dataset.i].place = null; commit(); });
  $("#staySearch").onclick = searchStay;
  $$("[data-mfsave]", v).forEach(b => b.onclick = () => {
    const box = b.closest("[data-manual]"); const g = k => $(`[data-mf="${k}"]`, box).value.trim();
    if (!g("name")) return toast("Ponle al menos un nombre");
    const pl = { name: g("name"), url: g("url"), price: g("price"), type: "Manual" };
    if (box.dataset.manual === "stay") { p.stay = pl; if (pl.price) p.cost.stay = pl.price; } else p.meals[+box.dataset.i].place = pl;
    commit();
  });
  $("#evAdd").onclick = () => { const t = $("#evText").value.trim(); if (!t) return; p.events.push({ day: $("#evDay").value, time: $("#evTime").value || "10:00", text: t, k: "" }); commit(); };
  $$("[data-evdel]", v).forEach(b => b.onclick = () => { p.events.splice(+b.dataset.evdel, 1); commit(); });
  $("#shLink").onclick = async () => copy(await planURL(p), "Enlace copiado: pégalo en WhatsApp, Telegram o email");
  $("#shText").onclick = () => copy(planText(p), "Resumen copiado");
  $("#shCard").onclick = () => shareCard(p);
  $("#shSaveImg").onclick = async () => saveBlob(await cardBlob(p), `${slug(p.title)}.png`);
  $("#cardPreviewBtn").onclick = () => { const u = $("#cardPreview").src; if (u) openViewer(u, p.title); };
  $("#shIcs").onclick = () => downloadOrCopy(planICS(p), `${slug(p.title)}.ics`, "text/calendar");
  $("#shJson").onclick = () => downloadOrCopy(JSON.stringify(p, null, 2), `${slug(p.title)}.json`, "application/json");
  if ($("#pDelete")) $("#pDelete").onclick = e => {
    if (e.target.dataset.sure) { const bk = plans[p.id]; deletePlan(p.id); DIRTY = false; popScreen("plan"); if (!$("#plansView").hidden) openPlans(); if (bk) undoToast("Plan borrado", () => { savePlan(bk); if (!$("#plansView").hidden) openPlans(); }); }
    else { e.target.dataset.sure = 1; e.target.textContent = "Pulsa otra vez para borrarlo"; }
  };
  v.onclick = e => {
    const b = e.target.closest("[data-choose]"); if (!b) return;
    const pl = JSON.parse(b.dataset.choose);
    if (b.dataset.kind === "sleep") p.stay = pl; else p.meals[+b.dataset.i].place = pl;
    commit();
  };
}
function syncRoles(p) { p.events.forEach(e => { if (e.role === "arrive") e.day = p.arrive; if (e.role === "leave") e.day = p.leave; }); }
function syncMealDays(p) { const m = p.meals.find(x => x.slot === "Cena víspera"); if (m) m.day = addDays(p.ride.date, -1); }
const slug = s => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plan";

function drawPlanMap() {
  if (!window.L) return;
  if (pmap) { pmap.remove(); pmap = null; }
  const r = P.ride;
  pmap = L.map("planMap", { preferCanvas: true, zoomControl: true }).setView([r.lat || 40.2, r.lon || -3.6], r.lat ? 13 : 6);
  baseLayers(pmap);
  pLayers.cand = L.layerGroup().addTo(pmap);
  const pts = [];
  const pin = (lat, lon, cls, svg, tip) => { L.marker([lat, lon], { icon: pinIcon(cls, svg) }).bindTooltip(tip).addTo(pmap); pts.push([lat, lon]); };
  if (r.lat) pin(r.lat, r.lon, "ride", ICON_BIKE, `Salida: ${esc(r.name)}`);
  if (P.stay?.lat) pin(P.stay.lat, P.stay.lon, "sleep", ICON_BED, esc(P.stay.name));
  P.meals.forEach(m => { if (m.place?.lat) pin(m.place.lat, m.place.lon, "eat", ICON_FORK, `${esc(m.slot)}: ${esc(m.place.name)}`); });
  if (pts.length > 1) pmap.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
  setTimeout(() => pmap && pmap.invalidateSize(), 50);
}
function drawPlanTrack(t) {
  if (!pmap || !t.pts?.length) return;
  L.polyline(t.pts.map(p => [p[0], p[1]]), { color: getCss("--m-" + (MODS[P.ride.mod] ? P.ride.mod : "other")), weight: 3, opacity: .7 }).addTo(pmap);
}

// -------- Overpass (OpenStreetMap): alojamientos y restaurantes cercanos
// Los servidores públicos a veces van saturados: se pregunta a todos a la vez y gana el primero;
// si ninguno responde, se usa Nominatim.
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
function overpassOnce(u, q, signal) {
  return fetch(`${u}?data=${encodeURIComponent(q)}`, { signal }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(j => { if (!j.elements) throw new Error("vacío"); return j.elements; });
}
async function overpass(q, ms = 9000) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms);
  try { return await Promise.any(OVERPASS.map(u => overpassOnce(u, q, ctl.signal))); }
  finally { clearTimeout(to); ctl.abort(); }
}
const NOMI_PHRASE = { hotel: "hotel", motel: "motel", hostel: "hostel", guest_house: "guest house", apartment: "apartment", chalet: "chalet",
  camp_site: "camp site", caravan_site: "caravan site", restaurant: "restaurant", cafe: "cafe", bakery: "bakery", fast_food: "fast food" };
let nomiLast = 0;
async function nominatim(types, lat, lon, radiusM) {
  const dLat = radiusM / 111000, dLon = radiusM / (111000 * Math.cos(lat * Math.PI / 180));
  const vb = [lon - dLon, lat + dLat, lon + dLon, lat - dLat].map(x => x.toFixed(5)).join(",");
  const out = [], seen = new Set();
  for (const t of types.slice(0, 5)) {
    const ph = NOMI_PHRASE[t]; if (!ph) continue;
    const wait = 1100 - (Date.now() - nomiLast); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    nomiLast = Date.now();
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&extratags=1&limit=40&bounded=1&viewbox=${vb}&q=${encodeURIComponent(ph)}`);
      if (!r.ok) continue;
      for (const x of await r.json()) {
        if (seen.has(x.osm_id) || !types.includes(x.type)) continue;
        seen.add(x.osm_id);
        const a = x.address || {}, ex = x.extratags || {};
        out.push({ lat: +x.lat, lon: +x.lon, tags: { ...ex, name: x.name, [x.category]: x.type, "addr:street": a.road, "addr:housenumber": a.house_number, "addr:city": a.city || a.town || a.village } });
      }
    } catch { /* siguiente tipo */ }
  }
  return out;
}
async function nearby(key, types, c, radiusM, max, extra = "") {
  const q = `[out:json][timeout:15];(nwr["${key}"~"^(${types.join("|")})$"](around:${radiusM},${c.lat},${c.lon});${extra});out center tags ${max};`;
  try { return { els: await overpass(q), src: "OpenStreetMap" }; }
  catch { return { els: await nominatim(types, c.lat, c.lon, radiusM), src: "OpenStreetMap (Nominatim)" }; }
}
const TYPE_ES = { hotel: "Hotel", motel: "Motel", hostel: "Albergue", guest_house: "Hostal / pensión", apartment: "Apartamento", chalet: "Casa rural", camp_site: "Camping", caravan_site: "Área autocaravanas", restaurant: "Restaurante", cafe: "Cafetería", fast_food: "Comida rápida", bar: "Bar", bakery: "Panadería" };
// ¿admite bicis? etiquetas de OSM que lo indican (o el propio nombre)
const bikeFriendly = t => /^(yes|designated|permissive)$/.test(t.bicycle || "") || /yes/.test(t.bicycle_parking || t["bicycle_parking:covered"] || t.cyclists || t["bett_und_bike"] || t["service:bicycle:repair"] || t["service:bicycle:rental"] || "") || /\b(bike|bici|cycl|ciclis)/i.test(t.name || "");
const hasParking = t => /^(yes|underground|surface|garage|multi-storey|private|customers)/.test(t.parking || t["parking:fee"] && "yes" || "") || /yes/.test(t.garage || t["amenity:parking"] || "");
function osmPlace(e, center) {
  const t = e.tags || {}, lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  const addr = [t["addr:street"] && `${t["addr:street"]} ${t["addr:housenumber"] || ""}`.trim(), t["addr:city"]].filter(Boolean).join(", ");
  return {
    name: t.name || TYPE_ES[t.tourism || t.amenity || t.shop] || "Sin nombre", lat, lon,
    type: [TYPE_ES[t.tourism || t.amenity || t.shop] || "", t.stars ? "★".repeat(Math.min(5, +t.stars || 0)) : "", t.cuisine ? t.cuisine.replace(/_/g, " ").split(";").slice(0, 2).join(", ") : ""].filter(Boolean).join(" · "),
    addr, url: t.website || t["contact:website"] || t.url || (t.name ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.name + " " + (t["addr:city"] || P.ride.city || ""))}` : ""),
    phone: t.phone || t["contact:phone"] || "", _d: center && lat ? haversine(center.lat, center.lon, lat, lon) : null, _t: t,
  };
}
function resultsHTML(list, kind, i) {
  if (!list.length) return `<p class="small muted">Nada en OpenStreetMap con ese filtro. Amplía el radio o usa los enlaces.</p>`;
  return list.map(pl => {
    const { _t, _d, ...keep } = pl;
    const badges = kind === "sleep" ? [pl.bike ? `<span class="badge-bike">Admite bicis</span>` : "", pl.park ? `<span class="badge-park">Parking/garaje</span>` : "", pl.rack ? `<span class="badge-park">Aparcabicis al lado</span>` : ""].join("") : "";
    return `<div class="res"><span class="t"><b>${esc(pl.name)}</b><small>${esc([pl.type, pl.addr].filter(Boolean).join(" · "))}</small>${badges ? `<span class="badges">${badges}</span>` : ""}</span><span class="d">${fmtKm(_d)}</span><button class="btn ghost small" type="button" data-kind="${kind}" ${i != null ? `data-i="${i}"` : ""} data-choose='${esc(JSON.stringify(keep))}'>Elegir</button></div>`;
  }).join("");
}
function showCandidates(list) {
  if (!pmap) return;
  pLayers.cand.clearLayers();
  list.forEach(pl => pl.lat && L.marker([pl.lat, pl.lon], { icon: L.divIcon({ className: "", html: `<div class="pin cand"></div>`, iconSize: [22, 22], iconAnchor: [11, 22] }) }).bindTooltip(esc(pl.name)).addTo(pLayers.cand));
  const pts = list.filter(x => x.lat).map(x => [x.lat, x.lon]); if (P.ride.lat) pts.push([P.ride.lat, P.ride.lon]);
  if (pts.length > 1) pmap.fitBounds(pts, { padding: [20, 20], maxZoom: 15 });
}
const coordsNote = c => c.approx ? `<p class="small muted">Ojo: la ubicación de esta prueba es aproximada (centro de ${esc(c.city || c.province || "la zona")}).</p>` : "";
async function searchStay() {
  const r = P.ride, box = $("#stayRes");
  if (!r.lat) { box.innerHTML = `<p class="small muted">Esta prueba no tiene coordenadas; usa los enlaces de Booking/Airbnb.</p>`; return; }
  box.innerHTML = `<p class="small muted">Buscando alojamiento cerca de la salida…</p>`;
  const types = $("#stayType").value.split("|"), R = +$("#stayR").value, prio = $("#stayBike").checked;
  const { els, src } = await nearby("tourism", types, r, R, 250, `node["amenity"="bicycle_parking"](around:${R},${r.lat},${r.lon});`);
  const racks = els.filter(e => e.tags?.amenity === "bicycle_parking").map(e => [e.lat ?? e.center?.lat, e.lon ?? e.center?.lon]);
  const list = els.filter(e => e.tags?.tourism).map(e => osmPlace(e, r)).filter(x => x.lat).map(x => {
    x.bike = bikeFriendly(x._t); x.park = hasParking(x._t);
    x.rack = !x.bike && racks.some(([a, b]) => a && haversine(a, b, x.lat, x.lon) < 0.06);
    x._score = (x.bike ? 3 : 0) + (x.park ? 2 : 0) + (x.rack ? 1 : 0);
    return x;
  }).sort((a, b) => (prio ? b._score - a._score : 0) || (!a._t.name - !b._t.name) || a._d - b._d).slice(0, 40).map(({ _score, ...x }) => x);
  const nb = list.filter(x => x.bike || x.park).length;
  box.innerHTML = coordsNote(r) + (list.length ? `<p class="small muted">${list.length} resultados · ${nb ? `${nb} con bici o garaje señalados` : "ninguno marca bicis/garaje en OSM: pregunta al reservar"} · ${src}</p>` + resultsHTML(list, "sleep")
    : `<p class="small muted">No encuentro alojamientos a ${R / 1000} km en OpenStreetMap. Prueba con 20 km o usa Booking, Airbnb o Google.</p>`);
  showCandidates(list);
}
async function searchEat(i) {
  const m = P.meals[i], c = P.stay?.lat ? P.stay : P.ride, box = $(`[data-mres="${i}"]`);
  if (!c.lat) { box.innerHTML = `<p class="small muted">Sin coordenadas: usa el enlace de Google Maps.</p>`; return; }
  box.innerHTML = `<p class="small muted">Buscando sitios para comer cerca de ${P.stay?.lat ? "tu alojamiento" : "la salida"}…</p>`;
  const pref = PREFS[m.pref] || PREFS.any, types = (pref.amen || "restaurant").split("|");
  let { els, src } = await nearby("amenity", types, c, 2500, 150);
  if (els.filter(e => e.tags?.name).length < 4) ({ els, src } = await nearby("amenity", types, c, 8000, 150));
  let list = els.map(e => osmPlace(e, c)).filter(x => x.lat && x._t.name);
  const match = list.filter(x => pref.diet ? /yes|only/.test(x._t["diet:vegetarian"] || x._t["diet:vegan"] || "") || pref.re.test(x._t.cuisine || "") : pref.re.test(`${x._t.cuisine || ""} ${x._t.amenity} ${x._t.name}`));
  list = (match.length >= 3 ? match : [...match, ...list.filter(x => !match.includes(x))]).sort((a, b) => a._d - b._d).slice(0, 30);
  box.innerHTML = coordsNote(c) + (list.length ? `<p class="small muted">${match.length < 3 ? "Pocos sitios etiquetados así; te enseño también otros cercanos. · " : ""}${src}</p>` + resultsHTML(list, "eat", i)
    : `<p class="small muted">No encuentro sitios en OpenStreetMap aquí. Usa el enlace de Google Maps.</p>`);
  showCandidates(list);
}

// ------------------------------------------------------------------ compartir
const b64u = buf => { let s = ""; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function encodePlan(p) {
  const { created, ...rest } = p;
  const dc = checkFor(p.ride?.mod, false);
  if (rest.check?.length === dc.length && rest.check.every((c, i) => c.t === dc[i] && !c.d)) delete rest.check; // mochila por defecto: no viaja
  rest.meals = rest.meals?.map(m => m.place?.url?.startsWith("https://www.google.com/maps/search/") ? { ...m, place: { ...m.place, url: "" } } : m);
  if (rest.stay?.url?.startsWith("https://www.google.com/maps/search/")) rest.stay = { ...rest.stay, url: "" };
  const json = JSON.stringify(rest);
  if (window.CompressionStream) {
    const s = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return "z" + b64u(await new Response(s).arrayBuffer());
  }
  return "j" + b64u(new TextEncoder().encode(json));
}
async function decodePlan(code) {
  code = decodeURIComponent(code.trim()).replace(/^.*[?&#](plan|c)=/, "").replace(/&.*$/, "");
  const kind = code[0], bytes = unb64u(code.slice(1));
  let json;
  if (kind === "z") { const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")); json = await new Response(s).text(); }
  else json = new TextDecoder().decode(bytes);
  const p = JSON.parse(json);
  if (!p.ride || !p.v) throw new Error("no es un plan");
  if (!p.check) p.check = checkFor(p.ride.mod, false).map(t => ({ t, d: false }));
  return p;
}
function baseURL() {
  if (EMBED || APP) return PUBLIC_URL;
  const u = new URL(location.href); u.search = ""; u.hash = ""; return u.toString();
}
async function planURL(p) {
  const code = await encodePlan(p);
  if ((EMBED || APP) && !PUBLIC_URL) return `Plan «${p.title}» de Montar·Dormir·Comer.\nÁbrelo en Mis planes → Importar y pega este código:\n${code}`;
  return `${baseURL()}?plan=${code}`;
}
let cardTimer;
async function refreshShare() {
  if (!P) return;
  clearTimeout(cardTimer);
  cardTimer = setTimeout(async () => {
    if (!P || !$("#cardPreview")) return;
    const blob = await cardBlob(P); const old = $("#cardPreview").src;
    $("#cardPreview").src = URL.createObjectURL(blob); if (old.startsWith("blob:")) URL.revokeObjectURL(old);
  }, 250);
  const code = await encodePlan(P), url = (EMBED || APP) && !PUBLIC_URL ? code : `${baseURL()}?plan=${code}`;
  const c = $("#planCode"); if (c) c.textContent = code;
  const q = $("#qr");
  if (q && window.qrcode) {
    try { const qr = qrcode(0, "L"); qr.addData(url); qr.make(); q.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true }); }
    catch { q.innerHTML = `<p class="small" style="color:#333">Plan demasiado grande para QR; usa el enlace.</p>`; }
  }
}

// ------------------------------------------------------------------ ficha resumen en imagen
const CARD = { bg: "#EEF2F6", ink: "#12232E", muted: "#5A6B78", line: "#D5DEE3", white: "#FFFFFF", ride: "#12A37F", sleep: "#6A4BD8", eat: "#E39A00", blue: "#1F5BD6",
  mod: { road: "#1F5BD6", mtb: "#2F8F46", gravel: "#B7791F", cx: "#D1495B", ultra: "#2B3A67", ebike: "#0B9CC2", other: "#7B8A96" } };
function wrap(ctx, text, maxW, maxLines = 3) {
  const words = String(text || "").split(/\s+/), lines = [];
  let cur = "";
  for (const w of words) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; let l = lines[maxLines - 1]; while (ctx.measureText(l + "…").width > maxW && l.length) l = l.slice(0, -1); lines[maxLines - 1] = l + "…"; }
  return lines;
}
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
let LOGO_IMG = null;
async function logoImg() { // el mismo logo de la cabecera (rueda, pizza y cielo) para la ficha en imagen
  if (LOGO_IMG) return LOGO_IMG;
  const img = new Image(); img.src = "logo-mark.svg";
  try { await img.decode(); LOGO_IMG = img; } catch { /* sin logo */ }
  return LOGO_IMG;
}
function drawLogo(ctx, x, y, size) { if (LOGO_IMG) ctx.drawImage(LOGO_IMG, x, y, size, size); }
async function cardBlob(p) {
  await logoImg();
  try { await Promise.all(["800 76px 'Saira Condensed'", "700 40px Manrope", "400 28px Manrope", "800 26px Manrope"].map(f => document.fonts.load(f))); } catch { /* fuentes del sistema */ }
  const r = p.ride, W = 1080, PAD = 64, D = pd(r.date), C = CARD, mc = C.mod[MODS[r.mod] ? r.mod : "other"];
  const url = await planURL(p);
  const rows = [];
  rows.push({ c: C.ride, k: "SALIDA", v: r.time ? `${r.time} h` : "Hora por confirmar", s: fmtRange(r) });
  rows.push({ c: C.ride, k: "LUGAR", v: [r.city, r.province].filter(Boolean).join(", ") || "Por confirmar", s: [p.chosen ? `Hago ${fmtDist(p.chosen)}` : r.dist.map(fmtDist).join(" · "), r.elev ? `+${fmtUp(r.elev)} de desnivel` : "", BIKES[p.bike] ? `bici de ${BIKES[p.bike].toLowerCase()}` : ""].filter(Boolean).join(" · ") });
  const n = nightsOf(p);
  rows.push({ c: C.sleep, k: "DORMIR", v: p.stay ? p.stay.name : n ? "Alojamiento por elegir" : "Ida y vuelta en el día", s: p.stay ? [n ? `${n} noche${n > 1 ? "s" : ""}: ${fmtShort(p.arrive)} → ${fmtShort(p.leave)}` : "", p.stay.bike ? "admite bicis" : p.stay.park ? "parking/garaje" : "", p.stay.addr].filter(Boolean).join(" · ") : n ? `${fmtShort(p.arrive)} → ${fmtShort(p.leave)}` : "" });
  const meals = p.meals.filter(m => m.place);
  if (meals.length) meals.forEach((m, i) => rows.push({ c: C.eat, k: i ? "" : "COMER", v: m.place.name, s: `${m.slot} · ${fmtShort(m.day)} ${m.time}${m.place.addr ? " · " + m.place.addr : ""}` }));
  else rows.push({ c: C.eat, k: "COMER", v: "Restaurantes por elegir", s: p.meals.map(m => m.slot).join(" · ") });
  if (p.people > 1) rows.push({ c: C.muted, k: "GRUPO", v: `${p.people} personas`, s: p.origin ? `Salimos desde ${p.origin}` : "" });

  const cv = document.createElement("canvas"), ctx = cv.getContext("2d");
  ctx.font = "800 76px 'Saira Condensed', 'Arial Narrow', sans-serif";
  const titleLines = wrap(ctx, r.name, W - PAD * 2 - 250, 3);
  const ROW_H = 150, QR_H = 540, blockH = Math.max(300, 40 + titleLines.length * 78 + 70);
  const H = 150 + 90 + blockH + 40 + rows.length * ROW_H + 40 + QR_H + 90;
  cv.width = W; cv.height = H;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.white; ctx.fillRect(0, 0, W, 150);
  ctx.fillStyle = C.line; ctx.fillRect(0, 148, W, 2);
  drawLogo(ctx, PAD, 35, 80);
  ctx.textBaseline = "middle"; ctx.font = "800 52px 'Saira Condensed', 'Arial Narrow', sans-serif";
  let wx = PAD + 112;
  [["MONTAR", C.ink], [" · ", C.ride], ["DORMIR", C.ink], [" · ", C.sleep], ["COMER", C.ink]].forEach(([t, c]) => { ctx.fillStyle = c; ctx.fillText(t, wx, 78); wx += ctx.measureText(t).width; });
  ctx.fillStyle = C.muted; ctx.font = "700 30px Manrope, sans-serif"; ctx.fillText(wrap(ctx, p.title.toUpperCase(), W - PAD * 2, 1)[0], PAD, 150 + 48);
  let y = 150 + 90;
  ctx.fillStyle = C.white; rrect(ctx, PAD, y, W - PAD * 2, blockH, 28); ctx.fill();
  // fecha como placa de manillar
  const bx = PAD + 30, by = y + 30, bw = 190, bh = blockH - 60;
  ctx.fillStyle = C.white; ctx.strokeStyle = mc; ctx.lineWidth = 6; rrect(ctx, bx, by, bw, bh, [28, 28, 18, 18]); ctx.fill(); ctx.stroke();
  ctx.fillStyle = mc; rrect(ctx, bx, by, bw, 26, [28, 28, 0, 0]); ctx.fill();
  ctx.fillStyle = C.bg; rrect(ctx, bx + bw / 2 - 22, by + 36, 44, 10, 5); ctx.fill();
  const mid = by + 30 + (bh - 30) / 2;
  ctx.fillStyle = C.ink; ctx.textAlign = "center"; ctx.font = "800 120px 'Saira Condensed', sans-serif"; ctx.fillText(String(D.getDate()), bx + bw / 2, mid - 24);
  ctx.font = "700 30px Manrope, sans-serif"; ctx.fillStyle = C.muted;
  ctx.fillText(`${DAYS[D.getDay()].toUpperCase()} · ${MONTHS[D.getMonth()].toUpperCase()}`, bx + bw / 2, mid + 52);
  ctx.fillText(String(D.getFullYear()), bx + bw / 2, mid + 92); ctx.textAlign = "left";
  const tx = bx + bw + 36;
  ctx.fillStyle = mc; ctx.font = "800 26px Manrope, sans-serif";
  ctx.fillText(modDisc(r).toUpperCase().slice(0, 34), tx, y + 54);
  ctx.fillStyle = C.ink; ctx.font = "800 76px 'Saira Condensed', 'Arial Narrow', sans-serif";
  titleLines.forEach((l, i) => ctx.fillText(l, tx, y + 110 + i * 78));
  y += blockH + 40;
  for (const row of rows) {
    ctx.fillStyle = C.white; rrect(ctx, PAD, y, W - PAD * 2, ROW_H - 16, 22); ctx.fill();
    ctx.fillStyle = row.c; rrect(ctx, PAD, y, 14, ROW_H - 16, [22, 0, 0, 22]); ctx.fill();
    const top = row.k ? 0 : -16;
    if (row.k) { ctx.fillStyle = row.c; ctx.font = "800 26px Manrope, sans-serif"; ctx.fillText(row.k, PAD + 40, y + 36); }
    ctx.fillStyle = C.ink; ctx.font = "700 40px Manrope, sans-serif";
    ctx.fillText(wrap(ctx, row.v, W - PAD * 2 - 80, 1)[0] || "", PAD + 40, y + 80 + top);
    if (row.s) { ctx.fillStyle = C.muted; ctx.font = "400 28px Manrope, sans-serif"; ctx.fillText(wrap(ctx, row.s, W - PAD * 2 - 80, 1)[0], PAD + 40, y + 118 + top); }
    y += ROW_H;
  }
  y += 24;
  ctx.fillStyle = C.white; rrect(ctx, PAD, y, W - PAD * 2, QR_H, 28); ctx.fill();
  ctx.fillStyle = C.blue; rrect(ctx, PAD, y, 14, QR_H, [28, 0, 0, 28]); ctx.fill();
  const qs = QR_H - 70, qx = W - PAD - 35 - qs, qy = y + 35;
  ctx.strokeStyle = C.line; ctx.lineWidth = 3; rrect(ctx, qx, qy, qs, qs, 14); ctx.stroke();
  if (window.qrcode && url.startsWith("http")) {
    try {
      const qr = qrcode(0, "L"); qr.addData(url); qr.make();
      const nn = qr.getModuleCount(), cell = Math.floor((qs - 24) / nn), off = Math.floor((qs - cell * nn) / 2); // módulos enteros: nítido al escanear
      ctx.fillStyle = "#000";
      for (let a = 0; a < nn; a++) for (let b = 0; b < nn; b++) if (qr.isDark(a, b)) ctx.fillRect(qx + off + b * cell, qy + off + a * cell, cell, cell);
    } catch { /* plan demasiado grande para QR */ }
  }
  ctx.fillStyle = C.ink; ctx.font = "800 44px 'Saira Condensed', sans-serif";
  wrap(ctx, "GUARDA ESTE PLAN EN TU APP", qx - PAD - 60, 3).forEach((l, i) => ctx.fillText(l, PAD + 36, y + 80 + i * 48));
  ctx.fillStyle = C.muted; ctx.font = "400 28px Manrope, sans-serif";
  wrap(ctx, "Escanea el código o abre el enlace del mensaje: se abre el plan completo y puedes guardarlo en Montar·Dormir·Comer.", qx - PAD - 70, 7).forEach((l, i) => ctx.fillText(l, PAD + 36, y + 250 + i * 36));
  ctx.fillStyle = C.muted; ctx.font = "400 24px Manrope, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(r.web ? `Web oficial: ${r.web.replace(/^https?:\/\//, "").slice(0, 60)}` : "Comprueba horarios y requisitos en la web oficial", W / 2, H - 44);
  return new Promise(res => cv.toBlob(res, "image/png"));
}
function saveBlob(blob, name) {
  if (APP && CAP.Filesystem && CAP.Share) return shareFileBlob(blob, name, "Guardar o enviar la ficha");
  if (EMBED) { toast("Mantén pulsada la ficha para guardarla"); openViewer(URL.createObjectURL(blob), name); return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  toast("Imagen guardada");
}
async function shareFileBlob(blob, name, title, text) {
  const b64 = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
  const f = await CAP.Filesystem.writeFile({ path: name, data: b64, directory: "CACHE" });
  try { await CAP.Share.share({ title, text, files: [f.uri], dialogTitle: title }); } catch { /* cancelado */ }
}
async function shareCard(p) {
  toast("Preparando la ficha…");
  const blob = await cardBlob(p), url = await planURL(p), name = `${slug(p.title)}.png`;
  const text = `${planText(p)}\n\n👉 Guarda el plan en tu app: ${url}`;
  if (APP && CAP.Filesystem && CAP.Share) return shareFileBlob(blob, name, "Compartir plan", text);
  const file = new File([blob], name, { type: "image/png" });
  if (!EMBED && navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], text, title: p.title }); return; } catch { return; } }
  saveBlob(blob, name); copy(text, "Ficha lista y texto con enlace copiado");
}
function planText(p) {
  const r = p.ride, out = [];
  out.push(`🚴 ${p.title}`, `${r.name} — ${fmtRange(r)}${r.time ? " a las " + r.time : ""}`,
    `📍 ${[r.city, r.province].filter(Boolean).join(", ")}${p.chosen ? ` · hago ${fmtDist(p.chosen)}` : ""}${r.elev ? ` · +${fmtUp(r.elev)}` : ""}`);
  if (r.web) out.push(r.web);
  if (p.stay) out.push("", `🛏 Dormir: ${p.stay.name}${nightsOf(p) ? ` (${fmtShort(p.arrive)} → ${fmtShort(p.leave)})` : ""}${p.stay.url ? "\n" + p.stay.url : ""}`);
  const meals = p.meals.filter(m => m.place);
  if (meals.length) { out.push("", "🍝 Comer:"); meals.forEach(m => out.push(`• ${m.slot} (${fmtShort(m.day)} ${m.time}): ${m.place.name}`)); }
  if (p.notes) out.push("", `📝 ${p.notes}`);
  out.push("", "Hecho con Montar·Dormir·Comer");
  return out.join("\n");
}
function planICS(p) {
  const r = p.ride, stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const dt = (d, t) => d.replace(/-/g, "") + (t ? "T" + t.replace(":", "") + "00" : "");
  const escI = s => String(s || "").replace(/[\\,;]/g, m => "\\" + m).replace(/\n/g, "\\n");
  const ev = (id, start, end, sum, loc, desc, allDay) => ["BEGIN:VEVENT", `UID:${p.id}-${id}@montar-dormir-comer`, `DTSTAMP:${stamp}`,
    allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART;TZID=Europe/Madrid:${start}`, allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND;TZID=Europe/Madrid:${end}`,
    `SUMMARY:${escI(sum)}`, loc ? `LOCATION:${escI(loc)}` : "", desc ? `DESCRIPTION:${escI(desc)}` : "", "END:VEVENT"].filter(Boolean);
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//montar-dormir-comer//ES", "CALSCALE:GREGORIAN"];
  const t = r.time || "09:00", [h, mi] = t.split(":").map(Number), endT = `${String(Math.min(23, h + 5)).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  out.push(...ev("ride", dt(r.date, t), dt(r.date, endT), `🚴 ${r.name}${p.chosen ? " (" + fmtDist(p.chosen) + ")" : ""}`, [r.city, r.province].filter(Boolean).join(", "), r.web));
  if (p.stay && nightsOf(p)) out.push(...ev("stay", dt(p.arrive), dt(p.leave), `🛏 ${p.stay.name}`, p.stay.addr || "", p.stay.url, true));
  p.meals.forEach((m, i) => { if (m.place) { const [a, b] = m.time.split(":").map(Number); out.push(...ev("meal" + i, dt(m.day, m.time), dt(m.day, `${String(Math.min(23, a + 1)).padStart(2, "0")}:${String(b).padStart(2, "0")}`), `🍽 ${m.slot}: ${m.place.name}`, m.place.addr || "", m.place.url)); } });
  p.events.forEach((e, i) => out.push(...ev("ev" + i, dt(e.day, e.time), dt(e.day, e.time), e.text, "", "")));
  out.push("END:VCALENDAR");
  return out.join("\r\n");
}
async function downloadOrCopy(text, name, type) {
  if (EMBED) return copy(text, `${name} copiado al portapapeles`);
  if (APP && CAP.Filesystem && CAP.Share) {
    try { const f = await CAP.Filesystem.writeFile({ path: name, data: text, directory: "CACHE", encoding: "utf8" }); await CAP.Share.share({ title: name, files: [f.uri], dialogTitle: "Abrir o enviar" }); }
    catch (e) { if (!/cancel/i.test(e?.message || "")) console.warn(e); }
    return;
  }
  try {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`Descargando ${name}`);
  } catch { copy(text, `${name} copiado al portapapeles`); }
}
async function handleIncomingPlan() {
  const code = new URLSearchParams(location.search).get("plan");
  if (!code) return;
  try { const p = await decodePlan(code); history.replaceState(null, "", baseURL()); openSharedPlan(p); }
  catch { toast("El enlace del plan está incompleto o dañado"); }
}
function openSharedPlan(p) {
  openPlan(p);
  if (!isSaved(p)) toast("Plan recibido: pulsa «Guardar plan» para quedártelo");
  if (!APP && /Android/i.test(navigator.userAgent)) { // web en Android: pasar el plan a la app instalada
    encodePlan(p).then(code => {
      const a = document.createElement("a"); a.className = "btn ghost small"; a.textContent = "Abrir en la app";
      a.href = `intent://plan?c=${code}#Intent;scheme=montardormircomer;package=es.montardormircomer.app;S.browser_fallback_url=${encodeURIComponent(location.href)};end`;
      $("#planView .bar").insertBefore(a, $("#pvShare"));
    });
  }
}

// ------------------------------------------------------------------ mis planes
function planCardHTML(p) {
  const past = (p.ride.end || p.ride.date) < today, eat = p.meals.filter(m => m.place).length;
  return `<article class="plan-card${past ? " past" : ""}" data-open="${p.id}" tabindex="0" role="button" aria-label="Abrir ${esc(p.title)}">
    <div class="plan-top"><span class="muted small">${fmtRange(p.ride)}${past ? " · pasado" : ""}</span><span class="chev" aria-hidden="true">›</span></div>
    <h3>${esc(p.title)}</h3><span class="small">${esc(p.ride.name)}</span>
    <div class="trio"><span class="r">Pedalear${p.chosen ? " " + fmtDist(p.chosen) : ""}</span><span class="${p.stay ? "s" : "off"}">Dormir</span><span class="${eat ? "e" : "off"}">Comer ${eat}/${p.meals.length}</span></div>
    <div class="plan-actions">
      <button class="btn ghost small" data-share="${p.id}" type="button">Compartir</button>
      <button class="btn ghost small danger" data-del="${p.id}" type="button">Borrar</button>
    </div></article>`;
}
function openPlans() {
  const v = $("#plansView");
  const all = Object.values(plans).sort((a, b) => a.ride.date.localeCompare(b.ride.date));
  const next = all.filter(p => (p.ride.end || p.ride.date) >= today), past = all.filter(p => (p.ride.end || p.ride.date) < today).reverse();
  v.innerHTML = `<div class="bar"><h2>Mis planes</h2><span class="muted small">${all.length || ""}</span></div>
    <div class="screen-body"><div class="plans-list">
      ${all.length ? next.map(planCardHTML).join("") + (past.length ? `<h3 class="plans-sub">Pasados</h3>` + past.map(planCardHTML).join("") : "")
        : `<p class="empty">Aún no tienes planes. Abre una prueba y pulsa «Planificar finde».</p>`}</div>
    <div class="panel" style="margin-top:14px"><div class="panel-h"><span class="tag todo"></span><h2>Importar un plan</h2></div>
      <p class="small muted" style="margin-top:0">Pega aquí un enlace o código de plan que te hayan pasado, o carga un archivo exportado.</p>
      <div class="toolbar"><input id="impCode" placeholder="https://…?plan=z…  o  z…" style="flex:1;min-width:0">
      <button class="btn primary small" id="impGo" type="button">Abrir plan</button>
      <label class="btn ghost small" for="impFile">Cargar archivo</label><input id="impFile" type="file" accept=".json,application/json" hidden></div></div></div>`;
  v.hidden = false;
  v.onclick = e => {
    const del = e.target.closest("[data-del]");
    if (del) {
      e.stopPropagation();
      if (!del.classList.contains("confirm")) {
        $$(".confirm", v).forEach(x => { x.classList.remove("confirm"); x.textContent = "Borrar"; });
        del.classList.add("confirm"); del.textContent = "¿Seguro? Toca para borrar"; return;
      }
      const bk = plans[del.dataset.del]; deletePlan(del.dataset.del); openPlans();
      undoToast(`Plan «${bk.title}» borrado`, () => { savePlan(bk); openPlans(); });
      return;
    }
    const sh = e.target.closest("[data-share]");
    if (sh) { e.stopPropagation(); shareCard(plans[sh.dataset.share]); return; }
    const card = e.target.closest("[data-open]");
    if (card && !e.target.closest("button,input,label")) openPlan(plans[card.dataset.open]);
    else if (!e.target.closest(".confirm")) $$(".confirm", v).forEach(x => { x.classList.remove("confirm"); x.textContent = "Borrar"; });
  };
  v.onkeydown = e => { if (e.key === "Enter") { const c = e.target.closest("[data-open]"); if (c) openPlan(plans[c.dataset.open]); } };
  $("#impGo").onclick = async () => { try { openSharedPlan(await decodePlan($("#impCode").value)); } catch { toast("No reconozco ese código de plan"); } };
  $("#impFile").onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { const p = JSON.parse(t); if (!p.ride) throw 0; openSharedPlan(p); }).catch(() => toast("Ese archivo no es un plan válido")); };
}
function undoToast(msg, undo) {
  const t = $("#toast");
  t.innerHTML = `${esc(msg)} <button type="button" class="undo">Deshacer</button>`; t.hidden = false;
  t.querySelector(".undo").onclick = () => { undo(); t.hidden = true; };
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 5000);
}

// ------------------------------------------------------------------ pestañas
function setTab(view) {
  if (P && planGuard(() => setTab(view))) return;
  $$(".tabbar button").forEach(b => b.classList.toggle("on", b.dataset.view === view));
  while (STACK.length) STACK.pop().close();
  $("#viewMap").hidden = view !== "map";
  $("#viewList").hidden = view === "map";
  $("#plansView").hidden = view !== "plans";
  if (view === "plans") openPlans();
  const fav = view === "fav";
  if (fav !== F.fav) { F.fav = fav; apply(); }
  if (view === "map" && map) setTimeout(() => { map.invalidateSize(); if (!mapTouched) fitToResults(); }, 30);
  if (view !== "map" && $("#mapCard")) $("#mapCard").hidden = true;
}
window.__mdc = { get map() { return map; }, get filtered() { return filtered; }, get plan() { return P; } }; // para pruebas automáticas

function init() {
  $("#plansCount").textContent = Object.keys(plans).length;
  bindFilters(); bindList();
  $("#brandLink").onclick = e => { e.preventDefault(); setTab("list"); $("#viewList").scrollTop = 0; };
  F.fav = false;
  $$(".tabbar button").forEach(b => b.onclick = () => setTab(b.dataset.view));
  document.addEventListener("keydown", e => { if (e.key === "Escape") handleBack(); });
  initBack(); initDeepLinks();
  addEventListener("beforeunload", e => { if (DIRTY) { e.preventDefault(); e.returnValue = ""; } });
  if (APP) document.addEventListener("click", e => { // Android: enlaces externos en el navegador del sistema
    const a = e.target.closest("a[href^='http']"); if (!a) return;
    e.preventDefault();
    if (CAP.Browser) CAP.Browser.open({ url: a.href }); else window.open(a.href, "_system");
  });
  if ("serviceWorker" in navigator && !APP && location.protocol === "https:" && !/claude|artifact/.test(location.host)) navigator.serviceWorker.register("sw.js").catch(() => {});
  load();
}
init();
})();
