# Montar · Dormir · Comer

Calendario de **todas las pruebas de bici de España que se pueden encontrar**: marchas cicloturistas y gran fondos de carretera, BTT/MTB (rally XCO, maratón XCM, enduro, descenso, raids y pruebas por etapas), gravel, ciclocross, pruebas con e-bike y ultradistancia o bikepacking (brevets incluidos). Se vuelve a recolectar cada semana y cualquier prueba se convierte en un **plan de fin de semana**: pedalear, dormir y comer. El plan se comparte como ficha en imagen con QR y enlace.

Proyecto personal, sin monetización. **No es una red social** (nada de perfiles, seguidores, actividades ni cuentas): el objetivo es tener todas las pruebas en un sitio y encontrarlas rápido. Hermana de [Correr · Dormir · Comer](https://github.com/dvgamelab/correr-dormir-comer), con identidad propia.

Web: **https://dvgamelab.github.io/Montar-dormir-comer/** · APK Android: ver más abajo.

## Qué hace

**App móvil en vertical.** Se instala desde el navegador («Añadir a pantalla de inicio») o con la APK. Está bloqueada en vertical y el botón *atrás* del móvil cierra pantallas en orden. Solo sale de la app si lo pulsas dos veces. En ordenador se ve como una columna de teléfono.

- Barra inferior: **Pruebas · Mapa · Favoritas · Planes**.
- Chips deslizables: este finde, Carretera, BTT, Gravel, Ciclocross, Ultra, E-bike, Marchas y Competición.
- **Filtros** (hoja inferior):
  - modalidad y tipo de prueba (marchas y abiertas o competición);
  - fechas;
  - **distancia en km** (desde / hasta) y **desnivel positivo** (desde / hasta);
  - comunidad y provincia;
  - cerca de un municipio o de **tu ubicación** (con radio);
  - solo las que tienen track GPX y mostrar las suspendidas.
- **Buscar por municipio** (cualquiera de los 8.155 de España): primero las pruebas **en** ese municipio y después las **cercanas, ordenadas por distancia**, con radio de 10 a 100 km.
- Lista agrupada por fin de semana. La fecha va en una **placa de manillar** del color de la modalidad. Debajo, los km de cada recorrido y el desnivel.
- **Mapa** con un color por modalidad. Al tocar un punto se abre un panel con las pruebas de ese sitio.
- **Ficha de la prueba**:
  - cifras clave (distancia, desnivel, hora y precio);
  - **mapa con el recorrido** y **perfil de desnivel** cuando la organización publica el track;
  - categorías y organizador;
  - aviso si es **solo para federados** o si necesitas **licencia de día**;
  - reglamento y rutómetro, enlace al GPX, web oficial e inscripción.

**Plan de fin de semana (pedalear → dormir → comer)**
- «Planificar finde» abre un **borrador**. No entra en «Mis planes» hasta pulsar **Guardar plan**. Si sales con cambios sin guardar, la app pregunta: *Guardar y salir / Salir sin guardar / Seguir editando*.
- **Pedalear**:
  - recorrido que haces, personas, tipo de bici, licencia (federado o de día) y transporte (portabicis, furgoneta, tren…);
  - desde dónde sales, con km, tiempo y ruta;
  - perfil del recorrido.
- **Dormir**:
  - hoteles, hostales, casas rurales, apartamentos y campings cerca de la salida (OpenStreetMap);
  - **primero los que admiten bicis o tienen parking/garaje**, más un aviso si hay aparcabicis al lado;
  - enlaces a Booking, Airbnb, Google Hoteles y búsqueda *bike friendly*.
- **Comer**: cena de la víspera (pasta), desayuno temprano y comida después de la prueba, con sugerencias cercanas según lo que te apetezca.
- **Itinerario** por días (montar la bici, recogida de dorsal o placa, salida…), editable.
- **Mochila ciclista** según la modalidad:
  - para todas: casco, licencia o seguro de día, cámaras o kit tubeless, bomba o CO2, multiherramienta con tronchacadenas, eslabón rápido, patilla de cambio, luces, GPS con el track, portabicis…;
  - extras de BTT, gravel, ciclocross, ultradistancia y e-bike.
- **Presupuesto** (con la licencia de día) y notas.
- **Compartir**:
  - **ficha en imagen** (PNG de 1080 px) con la placa, la modalidad, los km, el desnivel, el alojamiento, los restaurantes y un **QR**;
  - un **enlace** que lleva el plan entero dentro y en Android se abre con la app (`montardormircomer://plan?c=…`);
  - texto para WhatsApp, calendario `.ics` y exportar o importar en JSON.

## De dónde salen los datos

`scraper/run.py` recoge las pruebas de todas las fuentes, las clasifica por modalidad, las sitúa en el mapa, lee los tracks y **une las repetidas**:

| Fuente | Qué aporta |
|---|---|
| **[RFEC](https://rfec.com/index.php/es/smartweb/seccion/calendario/rfec/2026) + 17 federaciones autonómicas** | Andalucía, Aragón, Asturias, Baleares, Canarias, Cantabria, Castilla-La Mancha, Castilla y León, Extremadura, Galicia, Madrid, Murcia, Navarra, País Vasco, La Rioja, C. Valenciana y Melilla. Comparten plataforma, así que un solo lector sirve para todas. De cada prueba: modalidad, categorías, club, track GPX/KMZ, rutómetro y reglamento. De su página de inscripción: hora, precio, plazas y si es solo para federados |
| **[Federació Catalana](https://www.ciclisme.cat/calendari/tot)** | Todo el calendario catalán, con coordenadas de la salida, km, track y documentación |
| **[Sportmaniacs](https://sportmaniacs.com/es/races)** | Pruebas con inscripción en la plataforma. Solo se quedan las que son claramente de bici. Aporta provincia, precios y modalidades de inscripción |
| **[Global-Tempo](https://www.global-tempo.com/)** | Marchas de BTT y cicloturistas de Andalucía oriental, con distancia, desnivel y precio |
| **[Pedales y Zapatillas](https://www.pedalesyzapatillas.com/)** | Calendario anual de BTT, gravel, cicloturistas y bikepacking, con la web oficial |
| **[Alltricks](https://www.alltricks.es/blog/article/calendario-de-marchas-cicloturistas)** | Grandes marchas, gran fondos y gravel, con su distancia |

- **Se descarta** lo que no es bici (running, trail, triatlón, duatlón, natación, marcha nórdica…). También lo que no es para ir a participar: escuelas, categorías solo infantiles, BMX, pista, trial, pump track y cursos.
- **Recorrido**: si la prueba publica el track (GPX, KML o KMZ), se calculan los km, el **desnivel positivo** y el **punto de salida** exacto. Se guarda una versión ligera en `web/data/tracks/`, porque los servidores de los GPX no dejan leerlos desde el navegador.
- **Ubicación**, en este orden:
  1. punto de salida (track o ficha);
  2. centro del municipio (8.155 municipios del IGN, sin depender de servicios externos);
  3. Photon (OSM);
  4. como último recurso, el centro de la provincia, marcado como aproximado.

  La provincia entre paréntesis del lugar manda sobre la de la federación: la aragonesa pone «(Zaragoza)» a pruebas de Soria.
- **Duplicados**: la misma prueba sale en la RFEC y en su federación (se unen por su identificador), en varias webs con nombres distintos o dada de alta dos veces.
  - Se unen si coinciden la fecha (o se solapan si dura varios días), el sitio (el mismo municipio o a menos de 12 km) y alguna palabra propia del nombre.
  - Las palabras de ciclismo («marcha», «BTT», «gran fondo», «trofeo»…) y las que aparecen en muchas pruebas no cuentan.
  - Nunca se unen dos sitios fiables a más de 30 km, recorridos con distancias incompatibles (Máster 30 y Máster 60 del mismo día), ni una prueba de BTT y otra de gravel en días distintos.
  - Cada ejecución deja `data/dedupe_report.json` con qué se ha unido y por qué. `python tools/check_dupes.py` lista posibles duplicados sin unir y fusiones dudosas.
- Si una fuente falla, se reutiliza su último volcado (`data/raw/*.json`) y el pie de la lista lo indica.
- Los calendarios federativos publican la temporada en curso. Los del año siguiente se leen solos en cuanto aparecen (suele ser entre diciembre y febrero), así que en otoño la lista es más corta.

**Fuentes probadas que no se usan:**
- Battistrada: es el calendario más grande, pero pide captcha a cualquier lectura automática.
- Bicimarket, Sanferbike y Deporticket: responden 403.
- RockTheSport: solo funciona con JavaScript o con clave privada.
- Bikezona: casi vacía.
- MTBYMAS: no da el lugar y mezcla pruebas internacionales.
- dotwatcher: responde 429.

Cualquiera se puede añadir como un módulo más en `scraper/sources/`.

## Poner en marcha

### En local
```bash
pip install -r scraper/requirements.txt
python scraper/run.py                  # ~15 min la primera vez (fichas y tracks); luego mucho menos gracias a la caché
python scraper/run.py --only federaciones
python scraper/run.py --build-only     # rehace web/data/rides.json sin descargar
cd web && python -m http.server 8000   # http://localhost:8000
```

### Publicado y actualizado cada semana (GitHub Pages)
`.github/workflows/weekly.yml` se ejecuta **cada lunes a las 04:17 UTC**. Recolecta, guarda los datos en el repo y publica `web/` en GitHub Pages. También se puede lanzar a mano con *Run workflow*. Los pasos para activarlo desde el móvil están en `docs/ACTIVAR.md`.

## App Android (APK)

`mobile/` es un proyecto [Capacitor 7](https://capacitorjs.com) con la web dentro: id `es.montardormircomer.app`, vertical, con icono y pantalla de inicio propios.

- Lleva dentro las pruebas, los tracks, Leaflet y el generador de QR, así que funciona sin conexión.
- Con internet, al abrirse descarga `rides.json` de GitHub Pages: los datos semanales llegan sin reinstalar.
- Compartir usa el menú nativo. Los enlaces se abren en el navegador. «Usar mi ubicación» pide permiso de GPS.

```bash
cd mobile && npm install
npm run apk     # → android/app/build/outputs/apk/release/app-release.apk (necesita JDK 21 y SDK 35)
```
La firma es **propia de esta app**: `mobile/mdc-release.keystore` + `mobile/keystore.properties`, fuera del repo. Guárdalos. Sin ellos, una APK nueva no se instala encima de la anterior. En cada versión sube `versionCode` en `mobile/android/app/build.gradle`.

## Estructura
```
scraper/
  run.py          fuentes → clasificar → situar → tracks → unir duplicados → web/data/rides.json
  common.py       modelo Ride, clasificación por modalidad, distancias, desnivel, lectura de GPX/KML/KMZ
  geo.py          provincias, comunidades y polígonos
  sources/*.py    un módulo por fuente: fetch(cache) -> [Ride]
web/              app estática sin build (HTML + CSS + JS + Leaflet)
  data/rides.json, data/tracks/*.json, data/municipios.json, data/spain.geo.json
  keygen/index.html  minijuego «CRANKZ Keygen» (estilo crackintro, chiptune en WebAudio)
mobile/           app Android (Capacitor): prepare-web.mjs copia web/ en modo app
tools/check_dupes.py   auditoría de duplicados
.github/workflows/weekly.yml   recolección semanal + GitHub Pages
```

## Inspiración (qué hay en el mercado)
- **Battistrada**: calendario europeo de marchas, con filtros por tipo de bici y categoría (maratón, ultraciclismo, bikepacking, e-bike). De ahí los chips de modalidad y el filtro de formato (marcha o competición).
- **Komoot y Strava**: solo la forma de presentar un recorrido (perfil de desnivel bajo el mapa y cifras grandes de km y desnivel). Nada de su parte social.
- **Calendarios de la RFEC y las federaciones**: modalidad y categorías como etiquetas, documentos de la prueba y aviso de «solo federados».
- **Sportmaniacs y RockTheSport**: tarjeta de prueba con precio e inscripción directa.
- **Airbnb y Booking**: lista y mapa sincronizados, filtrar por la zona visible y buscar alojamiento *bike friendly* primero.
- **Wanderlog y TripIt**: el plan como itinerario por días con mapa y compartir con un enlace.

## Límites conocidos
- Alojamientos y restaurantes vienen de OpenStreetMap. En España casi ningún hotel marca en OSM si admite bicis, así que la prioridad es orientativa: pregunta al reservar.
- Algunas pruebas no traen distancia ni track hasta que la organización los publica.
- Revisa siempre fecha, hora, requisitos (licencia, material obligatorio) y recorrido en la web oficial.
