# Mi saldo

> El repositorio y la dirección siguen llamándose `MisFinanzas`; el nombre visible de la app es «Mi saldo».

App gratuita para controlar ingresos y gastos personales. Es una PWA instalable, pensada primero para el celular, en español y con pesos chilenos (`$1.650.000`) por defecto.

**Mi saldo no tiene servidor.** La app es una página estática en GitHub Pages:

- Cada usuario guarda sus datos en **su propia planilla de Google Sheets**, con una copia en su dispositivo.
- La **actualización nocturna** corre en la cuenta de cada usuario, en su cuenta de Google o en su cuenta de Claude, nunca en un servidor de Mi saldo.

Publicada en: **https://jagsantander.github.io/MisFinanzas/**

---

## Cómo funciona

```
┌──────────────────────┐   token de la app    ┌───────────────────────────────┐
│  App (GitHub Pages)  │ ───────────────────▶ │  Planilla de Google del       │
│  PWA · datos locales │ ◀─────────────────── │  usuario + script (Apps Script)│
│  (IndexedDB)         │   sincronización     │  hojas: Movimientos, Reglas…  │
└──────────────────────┘                      └───────────────▲───────────────┘
                                                              │
                  Modalidad Google                            │ Modalidad Claude
   disparador diario del script: lee Gmail ─────────┘   tarea programada en claude.ai:
   y llama a la IA del usuario (su clave)                lee Gmail con su conector y envía
                                                         los movimientos (token de importación)
```

| Pieza | Dónde vive | Costo |
|---|---|---|
| App web / PWA | GitHub Pages (`out/`, exportación estática de Next.js) | Gratis |
| Datos | Planilla de Google Sheets del usuario + copia en IndexedDB | Gratis |
| API de la planilla | `apps-script/Code.gs`, implementado por el usuario como «Aplicación web» | Gratis |
| Nocturna, modalidad Google | Disparador diario del mismo script; lee Gmail con permiso de solo lectura | Gratis con el nivel gratuito de la API de Gemini, o lo que cobre OpenAI o Anthropic |
| Nocturna, modalidad Claude | Tarea programada en claude.ai/code/routines | Incluida en Claude Pro o superior |

### Por qué así

- **Sin servidor que pagar ni mantener.** La única «infraestructura» es la cuenta de Google de cada usuario.
- **La ejecución nocturna depende de la cuenta del usuario**, como se pidió:
  - con la modalidad Claude, la tarea corre en la nube de Anthropic;
  - con la modalidad Google, corre en Google, con la IA que el usuario elija.
- **Las APIs de OpenAI, Anthropic y Gemini no permiten crear tareas programadas.** Esto se revisó en la documentación de octubre de 2026. Por eso, en la modalidad Claude el usuario crea la tarea en claude.ai con la instrucción aprobada; Mi saldo no puede crearla ni verla.

### Seguridad

- **El token de la app** da acceso completo a la planilla.
  - Se guarda solo en el dispositivo del usuario.
  - Viaja en el cuerpo de un POST, nunca en la URL.
  - La app solo lo envía a direcciones `https://script.google.com/macros/s/…/exec`. Lo exigen tanto la validación del código como la CSP.
- **El token de importación** (el que usa la tarea de Claude) solo permite agregar movimientos y consultar qué correos ya se procesaron. No sirve para leer datos ni para cambiar la configuración.
- **La clave de IA** se guarda en las *propiedades privadas* del script. No queda en la planilla, en el dispositivo ni en la instrucción.
- **Los correos son contenido no confiable.**
  - Se reducen antes de enviarse a la IA: sin enlaces ni adjuntos, con tarjetas y RUT enmascarados y un máximo de 6.000 caracteres.
  - Van delimitados como dato, nunca como instrucción.
  - El script valida cada operación: el monto debe aparecer en el correo, la fecha debe ser coherente y la categoría debe existir. Lo dudoso queda «Por revisar».
- **La aprobación es explícita.**
  - La instrucción se genera desde una plantilla con restricciones fijas.
  - Se aprueba con una casilla sin marcar de antemano.
  - Se guarda con su versión, hash, fecha y usuario en la hoja «Instrucciones».
  - Si cambian la modalidad, el modelo, la cuenta, el horario o el alcance, el hash cambia, el disparador se elimina y se exige una nueva aprobación.
- **Sin duplicados.**
  - Hay una sola corrida programada por fecha local.
  - Los correos procesados se registran en la hoja «Correos».
  - Las devoluciones se vinculan al gasto original y los posibles duplicados quedan para revisión.
  - Los ids de las alertas son deterministas, así que la app y el script no repiten avisos.
- **Las correcciones manuales nunca se sobrescriben**, y los movimientos eliminados no se reimportan.
- **La CSP** se inserta en cada página con hashes SHA-256 de los scripts en línea (`scripts/postbuild-csp.mjs`) y `connect-src` limitado a Google Apps Script.
- **El bloqueo opcional** usa la huella, el rostro o el PIN del dispositivo (WebAuthn de plataforma) y no recibe datos biométricos. Es una barrera de uso, no cifrado.

---

## Uso (para cada persona)

1. Abre la app y sigue la bienvenida.
2. **Crea tu planilla.** La app te guía y tiene botones para copiar el código:
   1. Crea una planilla en sheets.new y abre Extensiones → Apps Script.
   2. Pega `Code.gs` y el manifiesto `appsscript.json`.
   3. Ejecuta `instalar` y autoriza los permisos. Verás «Google no verificó esta app» porque el script es tuyo y no está publicado.
   4. Implementa la «Aplicación web» con «Ejecutar como: Yo» y «Quién tiene acceso: Cualquier usuario».
   5. Copia la URL y el token (menú Mi saldo → Mostrar datos de conexión).
3. Elige la modalidad nocturna y autoriza Gmail:
   - **Google (gratis):** el permiso de Gmail (solo lectura) se otorga al ejecutar `instalar`; la app lo comprueba con «Probar acceso a Gmail». La IA puede ser una clave gratuita de Gemini.
   - **Claude:** requiere Claude Pro o superior (la cuenta gratuita no permite tareas programadas). Gmail se autoriza en el conector de claude.ai.
4. En «Qué correos leer y cuándo» elige los bancos, agrega remitentes propios, decide si leer solo esos remitentes y, opcionalmente, limita a una etiqueta de Gmail.
5. Revisa la instrucción y pulsa **Validar y activar**.
6. En la modalidad Claude, crea la tarea en claude.ai con la instrucción aprobada:
   - Gmail como único conector.
   - Las variables de entorno `MISFINANZAS_URL` y `MISFINANZAS_IMPORT_TOKEN`.
   - Acceso de red a `script.google.com` y `script.googleusercontent.com`.

**Foto de boleta:** en «Agregar movimiento», «Fotografiar boleta» envía la foto (reducida) al script de la planilla, que la analiza con la clave de IA del usuario y devuelve total, fecha, comercio y categoría para revisar antes de guardar. La foto no se guarda.

**Actualizar el script:** cuando cambia `Code.gs`, la app avisa en «Tu planilla». Hay que pegar el código nuevo y crear una nueva versión de la implementación (la URL no cambia).

Si prefieres, puedes usar la app sin planilla: los datos quedan solo en ese dispositivo.

---

## Desarrollo

Requisito: Node.js 22 o superior.

Instala las dependencias:

```bash
npm install
```

Levanta el entorno de desarrollo:

```bash
npm run dev
```

Corre las pruebas:

```bash
npm test
```

Compila la versión para GitHub Pages (queda en `out/`):

```bash
npm run build:pages
```

Para probar `out/` localmente en http://localhost:4000/MisFinanzas/:

```bash
node scripts/serve-pages.mjs
```

**Pruebas (34)**

- **Del script** (`tests/apps-script/`): ejecutan el `Code.gs` real sobre un simulador de los servicios de Google (hojas, propiedades, disparadores, Gmail, UrlFetch y correo). Cubren:
  - instalación y tokens;
  - límite de intentos;
  - el token de importación, que no da acceso a los datos;
  - sincronización con last-write-wins;
  - aprobación explícita y creación del disparador real;
  - que un cambio de horario invalida la aprobación;
  - importación desde Gmail, con rechazadas, duplicados por id de operación y montos inventados que quedan «Por revisar»;
  - que no se reanaliza lo ya procesado;
  - que se conservan correcciones y eliminaciones;
  - cuota agotada: pausa sin cambiar de proveedor y reanuda;
  - el límite de tokens;
  - una sola corrida por día;
  - la modalidad Claude (bloqueo antes de aprobar, validación por fragmento citado, pausa);
  - alertas sin duplicar;
  - el horario de Santiago con cambio de horario;
  - qué correos se leen: bancos desmarcados, remitentes propios, «solo estos remitentes» y etiqueta de Gmail;
  - la foto de boleta: la imagen va a la IA del usuario, el total se valida y lo dudoso se marca para revisar.
- **De la app** (`tests/`): dinero exacto, reglas, totales, período mensual, CSV, validación de la URL del script, panel, alertas, correcciones bloqueadas, reclasificación masiva con vista previa y deshacer.

### Publicar

GitHub Pages sirve la rama `gh-pages`, que contiene lo compilado en `out/` (incluido `.nojekyll`).

La publicación es automática: al subir cambios a `main`, el workflow `.github/workflows/publicar.yml` revisa los tipos, corre las pruebas, compila y reemplaza el contenido de `gh-pages`. Si algo falla, no se publica nada. Puedes ver cada corrida en la pestaña **Actions** del repositorio, y también lanzarla a mano desde ahí («Run workflow»).

---

## App Android (APK)

`android/` contiene una Trusted Web Activity que abre la app publicada. Para compilarla:

```bash
./android/build-apk.sh https://jagsantander.github.io/MisFinanzas/ 1.2.0 4
```

Para ocultar la barra de direcciones, Android exige un archivo `assetlinks.json` en `https://jagsantander.github.io/.well-known/assetlinks.json`, es decir, en la raíz del dominio. En GitHub Pages eso requiere un repositorio llamado `jagsantander.github.io`. Sin ese archivo, la app funciona igual, pero muestra la barra con la URL.

---

## Limitaciones

- **Solo Gmail.** Ninguna de las dos modalidades lee Outlook.
- **No es conciliación bancaria.** Solo se detecta lo que llega por correo.
- **Sin notificaciones push**, porque necesitan un servidor que las envíe. Hay avisos dentro de la app y por correo, enviados por el script respetando el horario de silencio.
- **Hora aproximada en la modalidad Google:** Apps Script ejecuta los disparadores dentro de una ventana de unos 15 minutos.
- **Límites diarios de Google:** Apps Script tiene cuotas (tiempo de ejecución, UrlFetch, correos). Para uso personal sobran, pero se pueden alcanzar con más de unos cientos de correos por noche.
- **La tarea de Claude no se puede verificar ni administrar desde Mi saldo.** Pausar o cancelar en la app bloquea las importaciones, pero la tarea hay que pausarla o eliminarla en claude.ai.
- **Sin conversión de monedas.** Las otras monedas se muestran aparte y no se suman.
- **Textos legales:** son una base. Revísalos con asesoría legal antes de ofrecer la app a terceros.
