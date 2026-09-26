// Copia la web a www/ y activa el modo app (datos semanales remotos + enlaces a la web pública).
import { cpSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
const PUBLIC_URL = process.env.MDC_PUBLIC_URL || "https://dvgamelab.github.io/Montar-dormir-comer/";
rmSync("www", { recursive: true, force: true });
mkdirSync("www");
for (const f of ["index.html", "app.js", "app.css", "vendor-leaflet.css", "icon.svg", "logo-mark.svg", "icon-192.png", "data", "fonts"]) cpSync(`../web/${f}`, `www/${f}`, { recursive: true });
// librerías locales: la app funciona aunque no haya internet al abrirla
const libs = { "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js": "leaflet.min.js", "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js": "qrcode.js" };
let html = readFileSync("www/index.html", "utf8");
for (const [url, file] of Object.entries(libs)) {
  const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`);
  writeFileSync(`www/${file}`, await r.text()); html = html.replace(url, file);
}
html = html.replace(/<link rel="manifest"[^>]*>\n?/, "")
  .replace('<script src="app.js"></script>', `<script>window.MDC_APP=true;window.MDC_PUBLIC_URL=${JSON.stringify(PUBLIC_URL)};window.MDC_DATA_URL=${JSON.stringify(PUBLIC_URL + "data/rides.json")};</script>\n<script src="app.js"></script>`);
writeFileSync("www/index.html", html);
console.log("www/ lista →", PUBLIC_URL);
