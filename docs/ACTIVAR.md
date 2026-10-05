# Activar la web y la actualización diaria (desde el navegador del móvil)

Hazlo en el **navegador** (Chrome o Safari), no en la app de GitHub: la app no tiene estos ajustes. Si ves la versión móvil de la web y no encuentras algo, abre el menú del navegador y marca **«Sitio de escritorio»**.

1. **Publicar con GitHub Actions**
   - Abre https://github.com/dvgamelab/Montar-dormir-comer/settings/pages
   - En **Build and deployment → Source**, elige **GitHub Actions**. No hay que pulsar nada más: se guarda solo.

2. **Primera publicación**
   - Abre https://github.com/dvgamelab/Montar-dormir-comer/actions/workflows/weekly.yml
   - Pulsa **Run workflow** y después el botón verde **Run workflow**.
   - Tarda unos 15 minutos: recolecta las pruebas, guarda los datos en el repo y publica la web.
   - Cuando salga el check verde, la web está en **https://dvgamelab.github.io/Montar-dormir-comer/**

3. **Listo.** A partir de ahí se ejecuta sola **cada día hacia las 05:43** (hora de España en verano; GitHub suele retrasarlo unas horas). Si algún día falla, GitHub te manda un correo. Se puede relanzar con el mismo botón del paso 2.

(Opcional) Si prefieres que la rama principal se llame `main`, cámbiale el nombre en https://github.com/dvgamelab/Montar-dormir-comer/branches: toca el lápiz de la rama por defecto y escribe `main`. La actualización diaria funciona con cualquier nombre.
