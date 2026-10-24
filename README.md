# MisFinanzas

Aplicación web instalable (PWA) para controlar ingresos y gastos personales. Cada usuario conecta **su propio correo** (Gmail u Outlook, vía OAuth, solo lectura) y **su propio proveedor de IA** (OpenAI, Anthropic o Google Gemini, con su clave de API). Una actualización nocturna, validada explícitamente por el usuario, analiza los avisos financieros, actualiza la planilla y recalcula presupuestos y alertas.

Español y pesos chilenos por defecto (`$1.650.000`), tema claro/oscuro/sistema, diseño pensado primero para celular.

---

## Arquitectura

**Next.js 16 (App Router) + PostgreSQL (Drizzle ORM) + worker en Node.js**: un solo repositorio TypeScript con tres procesos.

| Proceso | Qué hace |
|---|---|
| `next start` | Interfaz (React) y API (`app/api/**`). |
| `npm run worker` | Planificador y cola de tareas. Debe correr **siempre**: ejecuta las actualizaciones nocturnas y envía notificaciones push/correo. |
| PostgreSQL | Fuente de verdad: datos, cola de tareas (`jobs`), estado por mensaje, auditoría. |

Por qué esta elección: un solo lenguaje y despliegue simple. La cola vive en Postgres (`FOR UPDATE SKIP LOCKED`), así que no hace falta Redis. Las restricciones únicas de la BD garantizan la idempotencia: ningún reintento duplica corridas, movimientos ni alertas.

Módulos (`lib/`):

| Área | Ubicación |
|---|---|
| Autenticación, sesiones, passkeys, límites de intentos | `lib/auth/*`, `app/api/auth/**` |
| Usuarios y preferencias | `app/api/me`, `lib/period.ts` |
| Conectores de correo (Gmail, Microsoft Graph) | `lib/mail/*` |
| Adaptadores de IA (OpenAI Responses, Anthropic Messages, Gemini generateContent) | `lib/ai/*` |
| Instrucciones y aprobaciones | `lib/automation/config.ts`, `instruction.ts`, `service.ts` |
| Programación y cola | `lib/automation/schedule.ts`, `lib/jobs/queue.ts`, `worker/index.ts` |
| Ejecución nocturna | `lib/automation/runner.ts` |
| Extracción y validación | `lib/extraction/*` |
| Reglas y clasificación | `lib/movements/rules.ts`, `app/api/movements/bulk` |
| Movimientos e informes | `lib/movements/*`, `lib/export.ts` |
| Presupuestos y alertas | `lib/budgets/*` |
| Notificaciones | `lib/notifications/*`, `public/sw.js` |
| Auditoría y consumo | `lib/audit.ts`, tabla `ai_usage`, `app/api/usage` |

Modelo de datos: `lib/db/schema.ts`. Migraciones: `drizzle/`.

### Principios aplicados

- **La IA interpreta; el servidor decide.** Las respuestas usan salidas estructuradas (JSON Schema) y se validan en el servidor:
  - el monto debe aparecer literalmente en el correo;
  - las fechas deben ser coherentes;
  - la moneda debe estar soportada;
  - la categoría debe existir.
  
  Los casos dudosos van a «Por revisar» con su motivo.
- **Los correos son contenido no confiable.**
  - Se reducen antes de enviarse: sin enlaces, adjuntos ni imágenes, con tarjetas y RUT enmascarados y un máximo de 6.000 caracteres.
  - Van delimitados como dato, después de la instrucción aprobada.
  - Nunca se abren enlaces ni adjuntos.
- **Credenciales del propietario.**
  - Toda llamada a la IA pasa por `callUserAi(db, ownerUserId, …)`, que usa solo la clave de ese usuario. No existe una clave de respaldo del administrador.
  - Las claves y tokens se cifran con AES-256-GCM, con un AAD ligado a usuario y conexión: un blob copiado a otro usuario no se puede descifrar.
- **Montos exactos.** `bigint` en unidades mínimas; nunca se usa float. No se suman monedas distintas.
- **Prioridad de clasificación.** 1) corrección manual (campos bloqueados), 2) reglas del usuario, 3) IA. Una sincronización solo agrega movimientos nuevos. Los eliminados quedan como «lápida» y no se reimportan.

### Programación en el proveedor de IA

Se revisó la documentación oficial vigente (octubre de 2026):

- **OpenAI** (Responses API), **Anthropic** (Messages API) y **Google Gemini API**: ninguna ofrece, con una clave de API, un endpoint para **crear tareas programadas en la cuenta del usuario**.
- Las tareas de ChatGPT, las *scheduled actions* de Gemini y las *routines* de Claude se crean desde sus propias interfaces.

Por eso la modalidad siempre es **ejecución desde MisFinanzas**: el worker llama a la IA del usuario con la instrucción aprobada. La interfaz lo muestra antes de pedir la validación y nunca afirma haber creado una tarea en el proveedor. Como solo existe esta modalidad, la misma automatización no puede quedar activa a la vez en el proveedor y en MisFinanzas.

El adaptador declara `nativeScheduling: false`. La columna `automations.external_task_id` queda reservada por si algún proveedor publica esa capacidad.

### Instrucción nocturna y aprobación

1. Al conectar la IA, `generateInstructionVersion` le pide **solo** lo personalizable: resumen, pautas de clasificación, criterios de ambigüedad y pistas de comercios. La respuesta se valida y se filtra: se rechazan enlaces, credenciales y acciones como «reenvía» o «transfiere».
2. Esa respuesta se incrusta en una plantilla controlada por MisFinanzas con las 16 secciones requeridas, incluidas las restricciones de seguridad fijas.
3. Cada versión guarda una instantánea de la configuración y su `configHash`. La configuración incluye proveedor, modelo, cuenta, permisos, horario, alcance y destino de datos. No incluye reglas, categorías ni presupuestos.
4. «Validar y activar» exige una casilla explícita sin marcar previamente. Solo aprueba si el hash coincide con la configuración actual. Guarda el texto exacto, la fecha, el usuario y el agente de usuario.
5. Antes de cada corrida, `preflight` vuelve a comparar el hash. Si algo cambió, la automatización pasa a «pendiente de validación» y la ejecución automática se bloquea.

### Ejecución nocturna

Por defecto se ejecuta a las 03:00 en `America/Santiago`, con Luxon y la zona horaria del usuario:

- `slotKey` = fecha local, con índice único: como máximo una corrida programada por día y sin omisiones en los cambios de horario.
- Si el worker estuvo detenido, se hace una sola puesta al día y la ventana incremental cubre el período sin correos.
- Un índice único parcial impide dos corridas `running` por cuenta. «Ejecutar ahora» se rechaza si ya hay una en cola o en curso.

Cada corrida:

1. Lista los correos desde la última sincronización exitosa, menos 48 h de solapamiento.
2. Preselecciona los posibles avisos financieros sin usar IA (dominios bancarios y palabras clave).
3. Analiza con concurrencia 2, reintentos y un tiempo máximo de 15 min.
4. Guarda el estado por mensaje en `processed_messages`. Los fallidos **no** se marcan como procesados y se reintentan hasta 4 veces.
5. Ante falta de saldo, credencial inválida o límite alcanzado: pausa, conserva el progreso y avisa. Nunca cambia de cuenta ni de proveedor.
6. Recalcula presupuestos y alertas con código, sin IA.

Las alertas se avisan una vez por (presupuesto, período, umbral). Si se cruzan varios umbrales en una corrida, se envía un solo aviso. Solo se evalúa el período actual, así que importar meses históricos no genera avisos masivos. Los avisos externos respetan el horario de silencio (por defecto 22:00–08:00).

---

## Puesta en marcha local

Requisitos: Node.js 22 o superior.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Completa en `.env.local`:

- `ENCRYPTION_KEY` y `SESSION_SECRET`: genera cada una con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
- `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`: genéralas con `npx web-push generate-vapid-keys`.

En una terminal, levanta un Postgres local (en el puerto 5433, sin Docker):

```bash
npm run db:local
```

En otra terminal, aplica las migraciones:

```bash
npm run db:migrate
```

Luego inicia la app y el worker, cada uno en su propia terminal:

```bash
npm run dev
```

```bash
npm run worker
```

Sin `SMTP_URL`, los correos de verificación y recuperación **no se envían**: quedan en `/dev-outbox`, que solo existe fuera de producción, y la interfaz lo indica.

### Pruebas

```bash
npm test
```

Las pruebas (38) corren contra un Postgres real (`misfinanzas_test`, creado por `npm run db:local`). Simulan solo la frontera HTTP: adaptadores de IA y conectores de correo. Cubren:

- formato monetario y porcentajes;
- horario de Santiago al entrar y salir del horario de verano;
- horario de silencio;
- validación de la extracción (montos inventados, rechazadas, pendientes, fechas);
- minimización del contenido y delimitación frente a inyección de instrucciones;
- generación, aprobación y renovación de la instrucción ante cambios de alcance;
- pausa, reanudación y cancelación;
- ausencia de corridas duplicadas y reclamo único de tareas por varios workers;
- extremo a extremo con **dos usuarios** (Gmail + Anthropic y Outlook + OpenAI):
  - varias operaciones por correo, rechazadas y publicidad;
  - compra con tarjeta y pago de la tarjeta, devolución relacionada, transferencia propia;
  - duplicado por id de operación;
  - reimportación sin duplicados, correcciones manuales conservadas y eliminados no revividos;
  - uso exclusivo de las credenciales del propietario y aislamiento de contenido y consumo;
- fallo de IA: el mensaje no se marca como procesado, se pausa, se reintenta y se reanuda;
- límite de consumo;
- presupuestos y alertas sin duplicados;
- exportación CSV (inyección de fórmulas);
- cifrado ligado al propietario;
- contraseñas, enlaces de un solo uso y vencidos, bloqueo por intentos y desafíos WebAuthn de un solo uso.

---

## Configuración de integraciones externas (pendiente por operador)

### Gmail (Google Cloud)

1. Crea un proyecto en Google Cloud Console y habilita la **Gmail API**.
2. En la pantalla de consentimiento OAuth, agrega el scope `https://www.googleapis.com/auth/gmail.readonly`.
3. Crea un cliente OAuth de tipo «Aplicación web» con este URI de redirección: `https://TU_DOMINIO/api/connections/mail/callback`.
4. Define `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
5. `gmail.readonly` es un **scope restringido**. Para usuarios fuera de la lista de prueba, Google exige verificación de la app y una evaluación de seguridad (CASA). Mientras tanto, solo los usuarios de prueba que registres podrán conectar el correo.

### Microsoft Outlook (Entra ID)

1. Registra una aplicación en «App registrations». Para cuentas personales y de trabajo, usa los tipos de cuenta «Any Entra ID tenant + personal Microsoft accounts».
2. Agrega este URI de redirección de tipo Web: `https://TU_DOMINIO/api/connections/mail/callback`.
3. Agrega los permisos delegados `offline_access`, `User.Read` y `Mail.Read`.
4. Crea un *client secret* y define `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` y `MICROSOFT_TENANT` (`common`).
5. Microsoft no ofrece un endpoint para revocar el consentimiento de una sola app. Al desconectar, MisFinanzas borra los tokens y le indica al usuario dónde retirar el permiso.

### Proveedores de IA

No requieren configuración del operador: cada usuario ingresa su propia clave.

- **OpenAI:** platform.openai.com/api-keys.
- **Anthropic:** console.anthropic.com.
- **Gemini:** aistudio.google.com/apikey.

La app lista los modelos disponibles para cada clave. Los costos mostrados son **estimados** (`lib/ai/pricing.ts`, ajustable con `AI_PRICING_JSON`); la factura final la emite el proveedor.

### Correo transaccional y push

- **`SMTP_URL`:** usa cualquier proveedor SMTP (SES, Postmark, Resend, etc.). Es obligatorio en producción.
- **Push:** necesitas las claves VAPID. En iPhone, el push requiere instalar la PWA en la pantalla de inicio (iOS 16.4 o posterior).

### Passkeys

`APP_URL` debe usar HTTPS en producción. El RP ID es el dominio, o el valor de `WEBAUTHN_RP_ID`. Se registra con `attestation: none` y verificación de usuario obligatoria: el dispositivo usa huella, rostro o PIN y MisFinanzas solo guarda la clave pública.

---

## Despliegue

1. Usa un PostgreSQL administrado (Neon, Supabase, RDS, Cloud SQL, etc.) y define `DATABASE_URL`.
2. Ejecuta `npm run build` y `npm run db:migrate`, y luego `npm start` para la web.
3. Despliega `npm run worker` como **proceso siempre activo** (worker en Railway, Render, Fly.io, ECS, un systemd en una VM, etc.). Puedes correr más de una instancia sin riesgo: el reclamo de tareas y los cupos son únicos.
4. Define `TRUST_PROXY=1` si el servidor está detrás de un proxy de confianza.
5. Las cabeceras de seguridad se configuran en `next.config.ts`. Las cookies de sesión son `__Host-`, `HttpOnly`, `Secure` y `SameSite=Lax`. Las solicitudes que modifican datos se validan por `Origin`.

La automatización **no** depende del navegador: corre en el worker aunque el teléfono esté apagado. Si usas una plataforma *serverless* sin procesos persistentes, reemplaza el worker por un cron cada minuto que ejecute el ciclo `tick` y procese la cola. No uses temporizadores del navegador.

### Railway (recomendado)

Un proyecto con tres servicios, todos desde este repositorio salvo la base de datos:

| Servicio | Origen | Start command | Otros ajustes |
|---|---|---|---|
| **Postgres** | Plantilla de base de datos de Railway | — | — |
| **web** | Este repositorio | `npm start` | Pre-deploy command: `npm run db:migrate:prod`. Healthcheck path: `/api/health`. Dominio público: *Generate Domain*. |
| **worker** | Este repositorio | `npm run start:worker` | Sin dominio público. Restart policy: *Always*. |

En cada servicio, las variables se pegan en *Variables → Raw Editor*. La lista completa está en `.env.example`.

- `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
- `APP_URL`:
  - en web: `https://${{RAILWAY_PUBLIC_DOMAIN}}`;
  - en el worker: `https://${{web.RAILWAY_PUBLIC_DOMAIN}}`.
- `ENCRYPTION_KEY`, `SESSION_SECRET` y las claves VAPID deben ser **idénticas** en web y worker.

### Costos de operación (orientativos)

| Componente | Opción típica | Costo aproximado |
|---|---|---|
| Web (Next.js) | Contenedor pequeño (0,5 vCPU / 512 MB) | US$5–10 al mes |
| Worker | Otro contenedor pequeño siempre activo | US$5–10 al mes |
| PostgreSQL | Plan administrado básico con copias | US$0–25 al mes |
| SMTP | Plan de entrada | US$0–15 al mes |
| IA | Pagada por **cada usuario** a su proveedor | Con un modelo económico, unos 1.000 tokens de entrada y 150 de salida por aviso: centavos de dólar por cientos de avisos al mes |

---

## App Android (APK)

`android/` contiene una **Trusted Web Activity (TWA)**, el formato oficial de Google para empaquetar una PWA como app Android, con la librería `androidbrowserhelper` 2.7.4.

- La app abre MisFinanzas en Chrome (u otro navegador compatible) a pantalla completa. Mantiene passkeys, notificaciones push (delegadas a la app) y cookies seguras, que un WebView no garantiza.
- La lógica sigue en el servidor. Para actualizar la interfaz basta con desplegar la web; solo cambiar la URL, el icono o el nombre exige recompilar.
- Requiere Android 7.0 o superior (minSdk 24); targetSdk 36. Paquete: `cl.misfinanzas.app`.

### Compilar

Requisitos: JDK 17, Android SDK (`platforms;android-36` y `build-tools;36.0.0`) y Gradle 8.14 o superior. Para compilar, ejecuta:

```bash
./android/build-apk.sh https://misfinanzas.tudominio.cl 1.0.0 1
```

- Los argumentos son la URL, `versionName` y `versionCode`. En cada actualización, sube `versionCode`.
- La primera vez se crea la clave de firma en `android/keystore/` y `android/keystore.properties`. **Respáldalas en un lugar seguro:** sin esa clave no podrás publicar actualizaciones que se instalen sobre la app existente.
- El script deja la APK en `dist/MisFinanzas-<versión>.apk` e imprime los valores de `ANDROID_PACKAGE_NAME` y `ANDROID_CERT_SHA256`.

### Verificar el dominio (obligatorio para ocultar la barra de direcciones)

1. Define `ANDROID_PACKAGE_NAME` y `ANDROID_CERT_SHA256` en el servidor web. La app los publica en `https://TU_DOMINIO/.well-known/assetlinks.json`.
2. Compruébalo con la [herramienta de Google](https://developers.google.com/digital-asset-links/tools/generator).
3. Si publicas en Google Play con «Play App Signing», agrega también la huella SHA-256 de la clave de firma de Google Play, separada por coma.

Si el dominio no está verificado, la app igual funciona, pero muestra una barra con la URL arriba.

### Seguridad en el teléfono

**Permisos:** la app pide solo internet y notificaciones. No usa cámara, ubicación, contactos, SMS, almacenamiento ni accesibilidad, y no trae código nativo propio.

**Contenido web:**
- MisFinanzas corre en el navegador del sistema, aislado. No hay WebView ni puentes JavaScript↔Android que una página pueda abusar.
- La librería TWA solo abre URLs `https` del dominio verificado. Otra app no puede usar MisFinanzas para mostrar un sitio de phishing con su nombre.

**Componentes expuestos a otras apps:**
- Lanzador: solo abre el dominio propio.
- Servicio de delegación: solo responde al navegador verificado.
- Acceso directo: descarta URLs ajenas.

El resto de los componentes (proveedor de archivos, permisos de notificación) no son exportados.

**Red y datos locales:**
- Prohíbe HTTP sin cifrar y no confía en certificados instalados por el usuario, lo que dificulta interceptar el tráfico.
- Sin copias en la nube ni transferencia entre dispositivos (`allowBackup=false` y `dataExtractionRules`).
- El build de release no es depurable.
- El navegador guarda solo la cookie de sesión (HttpOnly) y la preferencia de tema. El service worker no guarda en caché datos financieros.

**Web (`proxy.ts`):**
- Content-Security-Policy con nonce por solicitud, sin scripts inline sin nonce y con `connect-src 'self'`. Si llegara a inyectarse HTML desde un correo, no podría ejecutar scripts ni enviar datos a otros dominios.
- HSTS y `X-Frame-Options: DENY`.
- La redirección tras iniciar sesión solo acepta rutas internas.
- El service worker solo abre rutas del propio sitio desde una notificación.

**Notificaciones:** por defecto muestran un texto genérico, sin montos, en la pantalla bloqueada.

### Instalar la APK directamente (sin Google Play)

1. Copia el archivo `.apk` al teléfono.
2. Ábrelo y autoriza «Instalar apps desconocidas» para el navegador o el gestor de archivos que estés usando.
3. Abre MisFinanzas desde el menú de apps.

Para Google Play se recomienda generar un `.aab` con `gradle bundleRelease`, con los mismos parámetros que usa `build-apk.sh`.

---

## Copias de seguridad y restauración

Requieren el cliente PostgreSQL (`pg_dump`/`pg_restore`, en la misma versión mayor que el servidor), disponible en el PATH o mediante `PG_DUMP_PATH` y `PG_RESTORE_PATH`.

Para crear una copia (queda en `backups/misfinanzas-AAAAMMDD-HHMMSS.dump`):

```bash
npm run backup
```

Para restaurar, primero detén la web y el worker y luego ejecuta:

```bash
npm run restore -- backups/archivo.dump --yes
```

- **Respalda `ENCRYPTION_KEY` por separado** (en un gestor de secretos). La copia contiene las credenciales cifradas; sin la misma clave no se pueden leer, y los usuarios tendrían que reconectar su correo y su IA. Sus movimientos no se pierden.
- **Rotación de clave:** mueve la clave actual a `ENCRYPTION_KEY_PREVIOUS=id:base64`, define una nueva `ENCRYPTION_KEY` y un nuevo `ENCRYPTION_KEY_ID`, y re-cifra.
- Programa `npm run backup` (por ejemplo, a diario) o usa las copias automáticas o PITR de tu Postgres administrado. Prueba la restauración en un entorno separado periódicamente.
- Cada usuario puede descargar su propia copia en JSON y exportar a Excel o CSV desde Perfil › Tus datos.

**Retención:**

- Los intentos de acceso se eliminan a los 2 días.
- Los desafíos WebAuthn y los estados OAuth se eliminan al vencer.
- Al eliminar una cuenta se borran en cascada todos sus datos. Antes se intenta revocar el acceso al correo.
- No se guarda el cuerpo de los correos: solo el id del mensaje y los datos extraídos.

---

## Limitaciones conocidas

- **No es una conciliación bancaria.** Solo se detectan los movimientos informados en los correos accesibles. Las alertas se generan al sincronizar y no son en tiempo real.
- **Conversión de monedas:** no hay una fuente configurada, así que los montos en otras monedas se muestran aparte y no se suman.
- **Restauración de copias JSON:** la copia por usuario en JSON es solo de descarga; restaurarla no está implementado. La restauración completa se hace a nivel de base de datos.
- **Bloqueo por inactividad en una PWA:** el servidor lo aplica según la actividad con la API. El sistema operativo puede mostrar una captura de la app en el selector de apps.
- **Pruebas no automatizadas contra servicios reales:**
  - la ceremonia completa de passkeys en un navegador;
  - OAuth real con Google y Microsoft;
  - llamadas reales a OpenAI, Anthropic y Gemini.
  
  Las pruebas simulan esas fronteras. Antes de producción, valida con credenciales reales.
- **Precios de IA:** los valores de `lib/ai/pricing.ts` son referenciales; ajústalos con `AI_PRICING_JSON`.
- **Textos legales:** las condiciones y la política de datos son una base. Revísalas con asesoría legal (Ley 19.628 y Ley 21.719).
