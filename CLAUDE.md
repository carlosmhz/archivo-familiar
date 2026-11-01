# Archivo Familiar — Contexto y fuente de la verdad

> Documento de referencia para cualquier agente que trabaje en este proyecto. Vive en la raíz del repositorio como `CLAUDE.md`.
> Última actualización: 1 de noviembre de 2026 (fases 1 y 2 desplegadas; datos migrados a `archivo-datos/`; APK y Android Auto descartados).
> Si algo de este documento contradice al código de `main`, **manda el código**. Corrige el documento en el mismo cambio.

---

## 0. Cómo se trabaja

**Repositorio:** `github.com/carlosmhz/archivo-familiar`, privado. Es la única fuente del código: ya no se pasan archivos sueltos por el chat.

**Ramas:**

| Rama | Para qué | Se despliega en |
|---|---|---|
| `main` | Producción. Siempre estable | `app.mpi-sala.es/videos`, con hPanel → GIT (conectado el 1 nov 2026) |
| `develop` | Integración previa a `main` | No se despliega: **no hay entorno de pruebas** (decisión de Carlos, 1 nov 2026) |
| `feature/<tema>` | Cada cambio concreto | No se despliega |

**Cómo se mueve un cambio** (Carlos delega la fusión en el agente; no deja PR pendientes de revisar):
1. Sale una rama `feature/*` desde `develop`.
2. Se prueba en local (`php -S` + Playwright, ver apartado 11) y se abre el PR hacia `develop`.
3. El agente lo fusiona él mismo; después abre y fusiona el PR de `develop` a `main`.
4. Cuando hPanel → GIT esté conectado a `main`, **cada fusión a `main` es un despliegue a producción**: por eso la prueba local es obligatoria y no se fusiona nada sin pasarla. Si algo toca la autenticación, los datos o el servidor, el agente avisa antes a Carlos.

**Despliegue:** con la herramienta **GIT de hPanel** (hPanel → Avanzado → GIT), conectada a `main` y a la carpeta `public_html/videos`. Después de fusionar a `main`, Carlos debe pulsar **Implementar** en hPanel; no está comprobado que despliegue solo al hacer push, así que tras cada fusión relevante el agente le recuerda que implemente. **Sin paso de compilación:** HTML, CSS y JavaScript nativo en módulos ES, más PHP. Lo que está en la rama es lo que se sirve.

**Nunca entra en el repositorio** (regla fijada en `.gitignore`):
- `claves.php` y `secret.key`;
- los `datos/*.json`, porque contienen PIN, OTP y el catálogo;
- `intentos.json`;
- vídeos (`*.mp4`, `*.ts`, `*.m3u8`), carpetas `hls/` y `caseros/`, y miniaturas;
- el APK;
- copias de seguridad.

**Estado del repositorio y del servidor (1 de noviembre de 2026, tarde):**
- `main` es lo que sirve producción: hPanel → GIT despliega `main` en `public_html/videos/`. Carlos lo comprobó: acceso, vídeos, miniaturas, app del móvil y 403 en `datos/`, `lib/`, `docs/`, `scripts/` y `CLAUDE.md`.
- **Datos migrados** a `~/domains/app.mpi-sala.es/archivo-datos/` (fuera de la web): `datos/`, `hls/`, `caseros/` (MP4 originales y `caseros/miniaturas/`), `miniaturas/` (de escenas). El código los encuentra solo (`lib/config.php`); **no hay `privado/config.php`**.
- En `archivo-datos/` queda también `archivo-familiar.apk` (única copia; no se sirve por web, la app es la PWA). Carlos está borrando de ahí el código viejo (`index.html`, `api.php`, etc.).
- `videos-nuevo/` y `videos_antiguo/` ya no existen.

---

## 0.1 Reestructuración (en curso)

**Fase 1 — frontend (hecha, fusionada el 1 nov 2026):** el CSS y el JavaScript salen de `index.html` y `admin.html`. Se mantienen scripts clásicos, cargados en el mismo orden que antes, para no cambiar el comportamiento (los `onclick` del HTML siguen usando funciones globales). Layout resultante en la raíz del repositorio:

```
index.html, admin.html          solo maquetación
css/   app.css, sala.css (capa visual "sala", ver 0.2), tv.css, tv-actuaciones.css, admin.css
js/    estado.js, auth.js, inicio.js, navegacion.js, caseros.js, player.js, ui.js   (orden de carga en index.html)
       tv.js, tv-actuaciones.js (solo con ?tv=1), admin.js
vendor/hls.min.js               hls.js 1.5.17
vendor/fonts/                   Newsreader y Outfit (woff2, licencia OFL), sin Google Fonts
api.php, stream.php (entradas finas), lib/ (config, auth, datos, sesion, acciones/), sw.js (cache v5), manifest.json, icon-*.png, apple-touch-icon.png, scripts/, docs/
```

El script inline que aplica el tema claro antes de pintar se queda en `index.html` a propósito (evita el parpadeo).

**Fase 2 — PHP y datos (hecha, fusionada y desplegada el 1 nov 2026):** el PHP se parte en `lib/` y los datos se separan del código.
- `api.php` y `stream.php` siguen en la raíz como punto de entrada (**las URL no cambian**) y solo hacen `require` de `lib/api.php` y `lib/stream.php`.
- `lib/config.php`: rutas. Los datos (`datos/`, `hls/`, `caseros/`, `miniaturas/`) se buscan en `privado/config.php` (`'datos'`), si no en `../archivo-datos/` y, si no, junto al código (disposición antigua). Así el código funciona antes y después de migrar los datos.
- `lib/auth.php` (tokens, claves, freno), `lib/datos.php` (JSON, ids, miniaturas), `lib/sesion.php` (claves, roles, sesión) y `lib/acciones/*.php` (una por grupo: login, actuaciones, caseros, miniaturas, otp, compartir, video).
- Las miniaturas ya no se piden por URL directa: la API devuelve `stream.php?img=<ruta>` (solo `miniaturas/` y `caseros/miniaturas/`, sin `..`). Si la miniatura de un vídeo en `caseros.json` es una ruta relativa de esas carpetas, la API la convierte; las URL absolutas no se tocan.
- `.htaccess` en la raíz (bloquea `docs/`, `scripts/`, `lib/`, `.git` y `*.md`/`*.sh`) y `Require all denied` en `lib/` y `scripts/`. `CLAUDE.md` contiene datos del servidor: no debe poder leerse por web.
- `scripts/hls_convert.sh` busca la carpeta de datos (`ARCHIVO_DATOS`, `../archivo-datos`, o la carpeta antigua).
- Despliegue paso a paso: `docs/DESPLIEGUE.md`.

## 0.2 Interfaz "sala" (rama `feature/interfaz-sala`, propuesta del 1 nov 2026, pendiente de que Carlos la apruebe)

Rediseño visual inspirado en la maqueta de Grok (estética) y en la de Gemini (efecto de zoom al cerrar el vídeo). **Solo apariencia**: no cambia la API, la autenticación ni el HTML que genera el JavaScript.
- `css/sala.css`, cargada después de `app.css`, redefine la paleta (oscuro "sala" `#12110E` con acento terracota `#D4652F`; claro "papel" `#F4EFE6` con `#B54818`), las fuentes (Newsreader para títulos, Outfit para el texto, alojadas en `vendor/fonts/`), esquinas rectas y un grano de película muy suave. **Para volver al aspecto anterior basta con quitar su `<link>` de `index.html`.**
- Inicio: si hay recuerdo del día, el saludo, "¿Qué recordamos hoy?" y el recuerdo forman una portada a sangre (`<section class="home-hero">`, usa `:has()`), con el botón "Proyectar". "Continuar viendo" pasa a ser una fila con barra de progreso, y las colecciones, dos celdas con líneas (en el móvil, una debajo de otra).
- Tarjetas de década: la miniatura es el botón de reproducir (círculo en la esquina) y "Escenas" queda como enlace.
- Reproductor: al abrirse, la página retrocede (escala 0,94, más oscura) y el vídeo se acerca; al cerrarse, el vídeo se aleja y se desvanece y la página vuelve. Funciona con la misma clase `.open`, así que el historial y el botón Atrás no cambian. `abrirPlayer()` fija `--sala-origen-y` (el centro de lo que se ve) y `cerrarPlayer()` deja el último fotograma como póster (`congelarFotograma()`) para que no se aleje un recuadro negro. Se respeta `prefers-reduced-motion`.
- Modo TV (`?tv=1`): conserva su maquetación de `tv.css`; solo hereda colores y fuentes.
- Colores de la barra del sistema: `#12110E` / `#F4EFE6` (en `index.html`, `js/ui.js` y `manifest.json`).

**Fase 3 (opcional, por decidir):** pasar los scripts a módulos ES y quitar los `onclick`. Objetivo final de la estructura:

Hoy todo el CSS y el JavaScript de la app van dentro de `index.html`, que tiene unas 2 300 líneas y unos 118 KB, y `admin.html` está igual. El objetivo es separarlos por responsabilidades sin añadir compilación.

```
archivo-familiar/                 ← raíz del repositorio = carpeta que despliega hPanel
├── CLAUDE.md, README.md, .gitignore
├── .htaccess                     ← bloquea /docs, /scripts, /lib, /config, *.md por web
├── index.html                    ← solo maquetación
├── admin.html
├── css/        app.css, tv.css, tv-actuaciones.css, admin.css  [hecho]
├── js/         de momento scripts clásicos por secciones [hecho]; pasar a módulos ES en la fase 3
├── vendor/     hls.min.js (versión fija 1.5.17)  [hecho]
├── api.php, stream.php           entradas públicas finas (las URL no cambian)  [hecho]
├── lib/        config.php, auth.php, datos.php, sesion.php, api.php, stream.php, acciones/*.php  [hecho]
├── sw.js, manifest.json, icons/   (hoy icon-192.png e icon-512.png en la raíz)
├── scripts/    hls_convert.sh y otras utilidades de servidor  
└── docs/       documentación adicional
```

**Separar el código de los datos** era imprescindible para desplegar con GIT: **hecho y migrado** el 1 nov 2026. El despliegue no debe tocar los 25 GB de HLS ni los JSON vivos. La propuesta es esta:

```
~/domains/app.mpi-sala.es/
├── privado/        claves.php, secret.key                 (ya existe)
├── archivo-datos/  datos/, hls/, caseros/ (MP4 + miniaturas), miniaturas/  (hecho)
└── public_html/videos/   ← solo el código desplegado desde main
```

Rutas en `lib/config.php`, calculadas de forma relativa. Las miniaturas se sirven por `stream.php?img=` (hecho).

**Sin entorno de pruebas:** Carlos lo descartó. Se prueba en local con datos de prueba.

**Migración en producción:** se hace con copia de seguridad, por pasos y con plan para volver atrás. hPanel GIT suele exigir una carpeta de destino **vacía**, así que se despliega en una carpeta nueva y después se cambia, en lugar de desplegar encima de la actual.

**Compatibilidad que no se puede romper:**
- Las URL guardadas en `caseros.json` (`https://app.mpi-sala.es/videos/caseros/<nombre>.mp4[#t=…]`). Solo se usan para deducir el nombre del vídeo, así que no tiene que existir el archivo en esa ruta.
- Los enlaces `tinyurl.com/archivo-familiar` y los PIN de compartir.
- La app Android (un WebView sobre la URL) y el modo TV (`?tv=1`).

---

## 1. Qué es

Web privada de vídeos familiares de Carlos (MPI, Salamanca). Tiene dos secciones:

- **Vídeos caseros**: grabaciones familiares (VHS digitalizados, 576p) alojadas en el propio servidor y reproducidas por streaming HLS. Se organizan por décadas, años, eventos y cotidianos, con **escenas o capítulos** marcados por segundo.
- **Actuaciones (sevillanas)**: actuaciones enlazadas a vídeos de YouTube, con número de archivo y minuto de inicio.

- **URL:** `https://app.mpi-sala.es/videos/`
- **Panel de administración:** `https://app.mpi-sala.es/videos/admin.html`
- **Enlace corto para compartir:** `tinyurl.com/archivo-familiar`

Clientes:
- **Navegador**, en PC y móvil.
- **App Android** (`archivo-familiar.apk`): un envoltorio WebView de la web, con entrada por huella.
- **PWA**, con service worker.
- **Modo TV** (`?tv=1`, clase `body.modo-tv`): para la tele LG con webOS se abandonó la app nativa porque su Chromium era antiguo. Se usa la web con cursor.

---

## 2. Infraestructura

| Elemento | Valor |
|---|---|
| Hosting | Hostinger, compartido, servidor **LiteSpeed** (`uk-fast-web2113`) |
| SSH | `ssh -p 65002 u962444875@31.170.164.153` (la contraseña la tiene Carlos) |
| Raíz de la app (código, desplegado por GIT) | `~/domains/app.mpi-sala.es/public_html/videos/` |
| Datos (fuera de la web) | `~/domains/app.mpi-sala.es/archivo-datos/` |
| Carpeta privada (fuera de la web) | `~/domains/app.mpi-sala.es/privado/` |
| ffmpeg | `~/bin/ffmpeg`, build estático 7.0.2 de johnvansickle. El servidor no trae ffmpeg ni `xz`: se descomprimió con Python `tarfile` |
| PHP | 8.x. El código usa funciones flecha `fn` y desestructuración |
| Tareas programadas | **Solo desde hPanel → Avanzado → Cron Jobs**. `crontab` por SSH no funciona |

**Limitaciones conocidas del hosting:**
- **Procesos largos:** el hosting mata los procesos que llevan mucho tiempo. Un ffmpeg en lote murió tras unos 56 minutos. Para trabajos largos usa `nohup` más `flock` y una tarea programada que lo relance.
- **`<FilesMatch>` no funciona:** LiteSpeed **ignora** las reglas `<FilesMatch>` con `Require all denied` en `.htaccess`. Para bloquear por extensión usa `RewriteRule ... [F,L]`. `Require all denied` a secas en una carpeta sí funciona.
- **Acceso del agente:** el agente **no puede conectarse al servidor desde su entorno en la nube**, porque el SSH está bloqueado. Trabaja en el repositorio, y el código llega al servidor con hPanel → GIT. Las operaciones de servidor (mover datos, convertir vídeos, `.htaccess` fuera del repositorio) las ejecuta Carlos por SSH, con comandos que le prepara el agente. Si en una sesión hay acceso real al servidor o a su PC con terminal, úsalo.

---

## 3. Estructura de archivos en producción (antes de reestructurar)

> **Histórico:** así estaba el servidor antes del 1 de noviembre de 2026. Hoy `public_html/videos/` contiene solo el código del repositorio (apartado 0.1) y los datos están en `~/domains/app.mpi-sala.es/archivo-datos/` con la misma disposición interna (`datos/`, `hls/`, `caseros/`, `miniaturas/`). El árbol sigue valiendo para entender los datos.

```
~/domains/app.mpi-sala.es/
├── privado/                      ← NO accesible por web
│   ├── claves.php                ← contraseñas (las crea Carlos; el agente NUNCA las ve ni las escribe)
│   └── secret.key                ← clave HMAC para firmar tokens (se crea sola)
└── public_html/videos/
    ├── index.html                ← web principal (login, catálogo, reproductor)
    ├── admin.html                ← panel de administración
    ├── api.php                   ← API JSON (sin contraseñas dentro)
    ├── auth.php                  ← tokens firmados, claves, nombres válidos, freno anti fuerza bruta (en el repositorio vive en lib/auth.php)
    ├── stream.php                ← sirve HLS/MP4 solo con token firmado
    ├── sw.js                     ← service worker (cache archivo-familiar-v4 desde la fase 1)
    ├── hls.min.js                ← hls.js 1.5.17 alojado localmente (413 952 bytes)
    ├── manifest.json, icon-*.png, apple-touch-icon.png
    ├── archivo-familiar.apk      ← app Android (WebView)
    ├── datos/                    ← .htaccess: Require all denied
    │   ├── caseros.json, actuaciones.json, otp.json, compartir.json
    │   └── intentos.json         ← fallos de login por IP (se crea solo)
    ├── caseros/                  ← MP4 originales + miniaturas/
    │   ├── .htaccess             ← RewriteRule \.(mp4|m4v|mov|mkv|avi)$ - [F,L]
    │   └── miniaturas/           ← imágenes públicas (las usa la web)
    └── hls/                      ← .htaccess: Require all denied
        └── <nombre>/index.m3u8 + seg_0000.ts, seg_0001.ts…
```

Copia de seguridad de antes de la protección: `~/backup_videos/`, con `index.html`, `admin.html`, `api.php` y `sw.js` antiguos.

---

## 4. Modelo de datos (`datos/*.json`)

**caseros.json** (vídeos caseros):
```json
{ "id": 1, "tipo": "evento|cotidiano", "titulo": "Viaje al Sahara", "fecha": "2008",
  "categoria": "Boda|Cumpleaños|Comunión|Vacaciones|Navidad|Otros|null",
  "youtube": "https://app.mpi-sala.es/videos/caseros/sahara.mp4",
  "notas": null, "miniatura": "caseros/miniaturas/…", "duracion": 6205,
  "escenas": [ { "titulo": "…", "fecha": "…", "t": 1755 } ] }
```
- **El campo `youtube` es la clave del vídeo**, aunque se llame así. Puede contener:
  - una URL de YouTube o de una lista de YouTube, que se reproduce en un iframe;
  - la **URL del MP4 casero**. De su nombre de archivo se deduce la carpeta HLS: `…/caseros/sahara.mp4` da `hls/sahara/`.
- **Salto de tiempo en la URL:** un mismo MP4 puede aparecer en varias fichas con distinto inicio, por ejemplo `comunion-javier-carlos.mp4` y `comunion-javier-carlos.mp4#t=1755`. El reproductor lee `#t=` en segundos o en formato `h:mm:ss`.
- **No cambies estas URL aunque se borre el MP4**, porque siguen sirviendo para localizar el HLS.
- **Escenas:** `t` es el segundo de inicio. El final de cada escena es el `t` de la siguiente, o `duracion` si es la última.

**actuaciones.json**: `{ id, archivo, fecha, act, min, kw, youtube }`, donde `min` está en segundos.

**otp.json**: `[{ pass, rol, expira }]`. Contraseñas de 4 dígitos, de un solo uso, que caducan a las 24 horas.

**compartir.json**: `[{ pin, caseroId, escenaIdx, t, expira, permanente }]`. Con `escenaIdx = -1` se comparte el vídeo completo. Si es permanente, `expira` vale `PHP_INT_MAX`.

---

## 5. Roles y autenticación

| Rol | Cómo se entra | Ve |
|---|---|---|
| `admin` | contraseña de admin | se le redirige a `admin.html` |
| `todo` | contraseña fija | caseros y actuaciones |
| `caseros` | contraseña fija | solo caseros |
| `actuaciones` | contraseña fija | solo actuaciones |
| OTP | PIN de 4 dígitos generado en el admin, un solo uso, 24 h | según el rol de la OTP |
| `compartir` | PIN de 4 dígitos de un enlace compartido | **solo ese vídeo**; la restricción a una escena se aplica solo en la pantalla |

**Contraseñas:** viven en `privado/claves.php`, que devuelve un array con las claves `admin`, `todo`, `caseros` y `actuaciones`. Carlos las cambió el 30 de octubre de 2026.
- **Nunca** pongas contraseñas en `api.php`, en este documento ni en la conversación.
- `auth.php` busca `claves.php` primero en `privado/` y después junto a `api.php`.
- Si falta el archivo, la API responde con un error 500 claro.

**Tokens (en `auth.php`):** HMAC-SHA256 sobre el payload en base64url, con el formato `payload.firma`.
- **Token de sesión** (lo devuelve `login`): `{ r: rol, c: idCasero|null, f: entróConContraseñaFija, e: caducidad }`. Dura **24 h**.
- **Token de vídeo** (lo devuelve `video`): `{ v: nombre, e }`. Dura **12 h** y sirve solo para ese vídeo.

**Freno anti fuerza bruta:** 8 fallos en 15 minutos desde la misma IP bloquean esa IP durante 15 minutos. Afecta a toda la API y a `stream.php`, y responde con un 429. Cuentan como fallo los mensajes `No autorizado` y `Contrasena incorrecta`. `Sesion caducada` no cuenta.

**Sesión recordada (en `index.html`):** se guarda **solo el token**, nunca la contraseña.
- Se guarda en `localStorage['af_sesion']` y además en la cookie `af_sesion` (23 h, `path=/videos/`, `SameSite=Lax`, `Secure`). La cookie existe porque el WebView de la app Android puede tener el almacenamiento local desactivado.
- Al cargar la página, `restaurarSesion()` valida el token llamando a `caseros-listar`.
- El botón "Salir" (`logout()`) borra las dos copias.
- Los enlaces con PIN **no** se recuerdan.
- `admin.html` **no** recuerda la sesión.

---

## 6. API (`api.php`)

Todas las respuestas tienen la forma `{ ok, data, msg }`.

| Acción | Método | Autenticación | Notas |
|---|---|---|---|
| `login` | GET `?pass=` | — | Devuelve `{ rol, token }`. El rol `compartir:ID:escena:t` se usa con PIN |
| `listar` | GET | `token` o `pass` | Actuaciones. A los roles sin acceso les devuelve `[]` |
| `caseros-listar` | GET | `token` o `pass` | Al rol `compartir` solo le devuelve su vídeo. A `actuaciones` le devuelve `[]` |
| `video` | GET `?url=&token=` | token de sesión | Devuelve `{ hls, mp4 }` con URLs firmadas de `stream.php`, o `{ directo: true }` si no es un MP4 de este servidor |
| `anadir` / `editar` / `eliminar` / `youtube` | POST JSON | `pass` de admin | Actuaciones |
| `caseros-anadir` / `caseros-editar` / `caseros-eliminar` | POST JSON | `pass` de admin | Vídeos caseros |
| `otp-crear` / `otp-eliminar` | POST JSON | `pass` de admin | |
| `otp-listar` | GET `?pass=` | admin | |
| `compartir-generar` | POST JSON | `pass` de `todo`/`caseros`, **o** un `token` con `f = true` | Una OTP no puede generar enlaces |

**`stream.php?v=<nombre>&f=<archivo>&t=<tokenVideo>`**, donde `f` puede ser:
- `index.m3u8`: la lista, reescrita para que cada fragmento lleve el token.
- `seg_NNNN.ts`: un fragmento.
- `mp4`: el original, con soporte de rangos HTTP.

`stream.php?img=<ruta>`: miniaturas públicas (sin token), solo de `miniaturas/` y `caseros/miniaturas/`.

Valida el nombre con la expresión `^[\p{L}\p{N}._ \-]+$`, sin `..` y sin punto inicial. Sin token válido responde con un 403. Lee los archivos desde disco, así que los `.htaccess` no le afectan.

---

## 7. Reproductor (`index.html`)

`abrirPlayer(url, titulo, fecha, min)` reproduce de dos formas:
- **YouTube:** en un iframe.
- **Resto:** llama a `reproducirVideo()`, que:
  1. pide `api.php?action=video` con el token;
  2. si hay HLS, lo reproduce con **hls.js** (`startPosition = min`). Si hls.js no está disponible, usa el HLS nativo de Safari o iOS. Si el HLS falla, pasa al MP4;
  3. si no hay HLS, reproduce el MP4 a través de `stream.php`;
  4. `min` lo fija la escena. Si no hay escena, se usa el `#t=` de la URL.

Más detalles del reproductor:
- **Escenas:** `video.ontimeupdate` controla el fin de escena, que muestra un panel, y los enlaces compartidos que no deben ir antes del inicio. Funciona igual con HLS que con MP4, porque usa `currentTime`.
- **Compartir:** `_urlActual` guarda la URL original. No se usa `video.src`, que con hls.js es un `blob:`.
- **Cargas que se cruzan:** `_playToken` evita que una carga lenta pise a otra más nueva. `cerrarPlayer()` destruye hls.js.
- **Service worker** (`sw.js`, versión v5): estrategia de red primero, y nunca guarda en caché `api.php`, `stream.php`, `.mp4`, `.m3u8` ni `.ts`.

---

## 8. Vídeos HLS

**Estado:** los 17 MP4 de `caseros/` están convertidos (Carlos lo confirmó el 31 de octubre de 2026). Pesaban 76 GB en total y el HLS ocupa unos 25–30 GB.

Los nombres de los vídeos son:
- Boda
- comunion-javier-carlos
- crucero
- feria-2009
- feria-sevilla-2000-2004
- javier-carlos-1 a javier-carlos-8, y javier-carlos-10
- merienda-rio
- sahara
- san-blas

Los originales eran de 720x576, H.264 a unos 3,5 Mbps con AAC.

**Parámetros de codificación** (en `scripts/hls_convert.sh` del repositorio; en el servidor sigue también `~/hls_convert.sh`, el original):
```
-vf scale=-2:576 -c:v libx264 -preset veryfast -crf 25 -profile:v main -pix_fmt yuv420p
-g 50 -keyint_min 50 -sc_threshold 0 -c:a aac -b:a 128k
-f hls -hls_time 6 -hls_playlist_type vod  (+ -threads 2 para no superar el límite de CPU)
```

**Cómo funciona `hls_convert.sh`:**
- Trabaja en la carpeta de datos: `ARCHIVO_DATOS` si está definida, si no `~/domains/app.mpi-sala.es/archivo-datos`, y si no existe la carpeta antigua de la web. **El `~/hls_convert.sh` original del servidor hace `cd` a `public_html/videos`, que ya no tiene datos: no usarlo.** Usar `~/domains/app.mpi-sala.es/public_html/videos/scripts/hls_convert.sh` (necesita `chmod +x`, o lanzarlo con `bash`).
- Sin argumentos convierte todo `caseros/*.mp4`. Con argumentos, solo los indicados.
- Salta los vídeos que ya tienen `hls/<n>/index.m3u8`.
- Escribe en `hls/<n>.tmp/` y solo al acabar sin errores lo renombra a `hls/<n>/`.
- Registra cada paso en `~/hls.log` (`INICIO`, `OK tamaño`, `ERROR`, `SALTO`).
- La velocidad es de unas 8 veces el tiempo real con todos los hilos, y algo menos con 2 hilos. Un vídeo de 2 horas tarda unos 15–20 minutos.

**Tarea programada de hPanel** (para relanzar si el hosting mata el proceso). La que existe apunta al script original y debe borrarse o cambiarse a `bash /home/u962444875/domains/app.mpi-sala.es/public_html/videos/scripts/hls_convert.sh`:
```
*/10 * * * *  /usr/bin/flock -n /home/u962444875/hls.lock /home/u962444875/hls_convert.sh >> /home/u962444875/hls.log 2>&1
```

**Comprobar un vídeo:**
- Duración: `awk -F'[:,]' '/EXTINF/{s+=$2} END{print s}' hls/<n>/index.m3u8` debe coincidir con la del MP4. Por ejemplo, sahara dio 6205,04 s frente a 6205 del original.

### Añadir un vídeo nuevo
1. Sube el MP4 a `~/domains/app.mpi-sala.es/archivo-datos/caseros/` (Administrador de archivos de hPanel o SFTP). El nombre solo puede llevar letras, números, `.`, `_`, `-` y espacios.
2. En el admin, en la pestaña "Vídeos caseros", pon la URL `https://app.mpi-sala.es/videos/caseros/<nombre>.mp4`. Si quieres que empiece en un segundo concreto, añade `#t=SEGUNDOS`.
3. Por SSH: `nohup bash ~/domains/app.mpi-sala.es/public_html/videos/scripts/hls_convert.sh caseros/<nombre>.mp4 >> ~/hls.log 2>&1 &` (la ruta `caseros/…` es relativa a `archivo-datos`).
4. Hasta que termine la conversión, el vídeo se reproduce por MP4 a través de `stream.php`. Al terminar pasa a HLS automáticamente.

---

## 9. Seguridad desplegada

Desde el 1 nov 2026 los datos están fuera de la web, así que no hay URL directa a ellos. Las miniaturas se sirven por `stream.php?img=`. Comprobado por Carlos: 403 en `videos/CLAUDE.md`, `videos/lib/api.php`, `videos/docs/…`, `videos/scripts/…` y `videos/datos/caseros.json`.

Verificación anterior (30 de octubre de 2026, con los datos aún dentro de la web):

| URL directa | Resultado |
|---|---|
| `datos/*.json`, `datos/` | **403** |
| `caseros/*.mp4` | **403** (con `RewriteRule`) |
| `hls/...` | **403** |
| `caseros/miniaturas/*` | 200 (intencionado) |
| `api.php?action=caseros-listar` sin token | `Sesion caducada` |

Incidente: antes de la protección, `datos/compartir.json` y `datos/otp.json` estuvieron **legibles por URL**. Carlos cambió las contraseñas. Vaciar los PIN de compartir (`echo '[]' > datos/compartir.json`) quedó como decisión suya, sin confirmar si lo hizo.

---

## 10. Estado de despliegue y tareas pendientes

**Repositorio y despliegue:** hecho el 1 nov 2026. `main` desplegado con hPanel → GIT y datos en `archivo-datos/`.

**Desplegado y confirmado:**
- HLS con hls.js en local.
- Protección completa: `auth.php`, `stream.php`, `claves.php` en `privado/` y los tres `.htaccess`.
- Soporte de `#t=` en la URL.
- Los 17 vídeos convertidos.
- Fases 1 y 2 de la reestructuración y migración de datos (1 nov 2026).

- Sesión recordada (marca `f` en el token, `localStorage` y cookie): Carlos confirmó el 1 nov 2026 que funciona y que la sesión ya no se cierra al recargar.

**Decisiones de Carlos (1 nov 2026):**
- **APK:** no se sirve por web. La app es la PWA y no se hace nada más. El APK queda guardado en `archivo-datos/`.
- **Android Auto:** descartado, sin prisa. No se desarrolla nada.
- **Tarea programada de HLS:** sin prisa; no hay vídeos nuevos ni previsión de ellos.

**Pendiente:**
0b. **Script HLS** (baja prioridad, con ordenador; no hay vídeos nuevos): cambiar o borrar la tarea programada de hPanel que apunta a `~/hls_convert.sh` (ver apartado 8) y comparar ese original con `scripts/hls_convert.sh` del repositorio, que es una reconstrucción. Solo importa si algún día se añaden vídeos.
0c. Opcional: borrar `datos/.htaccess`, `hls/.htaccess` y `caseros/.htaccess` del repositorio (protegían la disposición antigua; ya no hay datos junto al código). `lib/config.php` sigue admitiendo la disposición antigua, sin coste.
1. `grep ERROR ~/hls.log` debe salir vacío, y debe haber 17 carpetas en `hls/` sin ninguna `.tmp`.
2. **Borrar la tarea programada** de hPanel cuando la conversión esté confirmada.
3. Probar varios vídeos desde la app, entre ellos `comunion-javier-carlos` con `#t=1755`.
4. **Borrar los MP4 de `caseros/`** después de copiarlos al PC como copia maestra. Ya se probó con sahara (renombrando su MP4) que la app funciona sin el MP4.
5. Opcionales, ofrecidos sin respuesta:
   - Login por POST: hoy la contraseña viaja en la URL y queda en los registros del servidor.
   - Que el panel de admin recuerde la sesión.
   - Restringir la escena compartida también en el servidor.
6. **Android Auto:** descartado por Carlos (1 nov 2026). No admite WebView; si algún día se retoma, lo viable sería una app nativa solo de audio.

---

## 11. Normas para agentes

- **Idioma:** habla en español con Carlos. Es técnico (PHP, JS, Android, SSH), pero agradece los comandos listos para copiar, en orden y con el resultado esperado.
- **Repositorio:** trabaja en el repositorio, no envíes archivos por el chat.
  - Parte siempre de lo último de `develop`, en una rama `feature/<tema>`.
  - Haz commits pequeños con mensajes claros en español.
  - Abre PR hacia `develop` explicando qué cambia y cómo probarlo, y fusiónalo tú tras probarlo (ver apartado 0). No hagas push directo a `main`: llega siempre por PR.
- **Antes de tocar un archivo:** pide la versión actual del servidor (con `cat` por SSH o descargándola de hPanel). Las versiones de la conversación pueden estar desfasadas.
- **Secretos:** revisa cada commit (`git diff --cached`) para que no entren secretos, JSON de datos ni vídeos.
- **Contraseñas:**
  - No incluyas nunca contraseñas en el código, la documentación ni el chat.
  - Si Carlos pega alguna, recomiéndale cambiarla.
  - **No subas un `api.php` con `define('PASS_…', '…')`**: pisaría `claves.php`.
- **Orden de despliegue** cuando cambie la autenticación: primero lo que el nuevo código necesita (por ejemplo `claves.php`), después los archivos PHP y HTML, y por último los `.htaccess` que cierran el acceso. Haz siempre copia antes (`~/backup_videos/`) y da los pasos para volver atrás.
- **Pruebas:** prueba en local antes de entregar. Monta la misma estructura (`privado/` más `public_html/videos/`) con `php -S`, genera un HLS de prueba con ffmpeg y usa Playwright con Chromium. Comprueba también `php -l` y `node --check`. Avisa de lo que no se pudo probar (por ejemplo Safari o iOS, o el comportamiento real de LiteSpeed).
- **Operaciones largas en el servidor:** usa `nohup`, `flock` y la tarea programada de hPanel. No asumas que un proceso sobrevive más de una hora.
- **Tras cada cambio relevante,** actualiza este documento en el mismo PR: estado de despliegue, pendientes y fechas.
- **Sin compilación:** nada de npm en producción ni herramientas de build. Las librerías de terceros van en `vendor/` con versión fija.
