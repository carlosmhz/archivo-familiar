# Despliegue con hPanel → GIT (migración desde el servidor actual)

> **Estado:** ejecutado el 1 de noviembre de 2026 con una variante sin mover los datos: la carpeta `videos` se renombró a `videos_antiguo` (con los datos dentro), `privado/config.php` apunta a ella y hPanel → GIT despliega `main` en `public_html/videos`. El paso 4 de abajo (mover a `archivo-datos`) queda para cuando haya terminal.
>
> Guion para pasar de "subir archivos a mano" a "desplegar `main` con hPanel → GIT". Lo ejecuta Carlos en el servidor; el agente no tiene acceso. Cada paso trae su vuelta atrás.
> Lo que ofrece exactamente hPanel → GIT (clave de despliegue, carpeta de destino, despliegue automático) no está verificado: ajusta el paso 3 a lo que veas en pantalla.

## Cómo encaja el código nuevo

La carpeta desplegada contiene solo código. Los datos viven fuera, y el código los busca así (`lib/config.php`), por este orden:

1. `'datos'` en `privado/config.php` (ruta absoluta);
2. `~/domains/app.mpi-sala.es/archivo-datos/`;
3. la propia carpeta del código (disposición antigua, con `datos/`, `hls/` y `caseros/` al lado).

Por eso el código nuevo funciona **sin mover nada** y también con los datos ya migrados. Probado en local con las tres disposiciones.

Dentro de la carpeta de datos: `datos/` (JSON), `hls/`, `caseros/` (MP4 y `caseros/miniaturas/` si existe) y `miniaturas/` (de escenas). Las miniaturas se sirven por `stream.php?img=…`, así que pueden estar fuera de la web.

Los archivos que **no** se tocan nunca: `~/domains/app.mpi-sala.es/privado/claves.php` y `secret.key`.

## Pasos

Ruta base en los comandos: `APP=~/domains/app.mpi-sala.es`.

### 1. Copia de seguridad del código (pesa poco)
```
APP=~/domains/app.mpi-sala.es
mkdir -p ~/backup_codigo_$(date +%Y%m%d) && cd $APP/public_html/videos
cp -a index.html admin.html api.php auth.php stream.php sw.js hls.min.js manifest.json *.png .htaccess ~/backup_codigo_$(date +%Y%m%d)/ 2>/dev/null
cp -a $APP/privado ~/backup_codigo_$(date +%Y%m%d)/privado
ls ~/backup_codigo_*
```
Si en `public_html/videos/` hay un `.htaccess` propio (no uno de `datos/`, `hls/` o `caseros/`), pásamelo antes de seguir: el código nuevo trae el suyo en la raíz y lo pisaría.

Vuelta atrás de todo lo que sigue: copiar esos archivos de nuevo a `public_html/videos/`.

### 2. Conectar el repositorio (hPanel → Avanzado → GIT)
- Repositorio: `git@github.com:carlosmhz/archivo-familiar.git` (privado: hPanel te da una clave pública; añádela en GitHub → repositorio → Settings → Deploy keys, solo lectura).
- Rama: `main`.
- Carpeta de instalación: una carpeta **nueva y vacía**, por ejemplo `public_html/videos-nuevo`.

### 3. Probar en paralelo, sin cortar el servicio
El código desplegado en `videos-nuevo` usará los datos de la carpeta antigua si se lo indicas. Crea `privado/config.php`:
```
cat > $APP/privado/config.php <<'PHP'
<?php return ['datos' => '/home/u962444875/domains/app.mpi-sala.es/public_html/videos'];
PHP
```
Abre `https://app.mpi-sala.es/videos-nuevo/` y comprueba: entrar, ver vídeos, reproducir uno, saltar con `#t=`, panel `admin.html`, miniaturas.
Mientras `config.php` exista, **todas** las copias del código (la antigua también la ignora) leerán los datos de `public_html/videos`.

### 4. Cambio definitivo (unos minutos sin servicio: avisa antes)
Hacerlo a una hora tranquila.
```
APP=~/domains/app.mpi-sala.es
cd $APP/public_html
mkdir -p $APP/archivo-datos
mv videos/datos videos/hls videos/caseros $APP/archivo-datos/
[ -d videos/miniaturas ] && mv videos/miniaturas $APP/archivo-datos/
mv videos videos_antiguo          # el código antiguo, apartado (en la copia queda también el resto)
rm -f $APP/privado/config.php     # ya no hace falta: se usará archivo-datos
```
Después, en hPanel → GIT, cambia la carpeta de instalación a `public_html/videos` (o crea el despliegue nuevo allí; debe estar vacía: no existe porque la apartaste) y despliega `main`.

Comprobaciones:
- `https://app.mpi-sala.es/videos/` carga, se puede entrar y reproducir.
- `https://app.mpi-sala.es/videos/datos/caseros.json` → 403 o 404.
- `https://app.mpi-sala.es/videos/lib/api.php` → 403.
- `curl -I https://app.mpi-sala.es/videos/caseros/sahara.mp4` → 403 o 404.

**Vuelta atrás del paso 4:**
```
cd $APP/public_html && mv videos videos_git_fallido
mv videos_antiguo videos
mv $APP/archivo-datos/{datos,hls,caseros} videos/ ; [ -d $APP/archivo-datos/miniaturas ] && mv $APP/archivo-datos/miniaturas videos/
```

### 5. Después
- Actualiza la tarea programada del script de HLS para usar el del repositorio: `$APP/public_html/videos/scripts/hls_convert.sh` (busca solo la carpeta de datos). Hazlo ejecutable: `chmod +x`.
- Borra `videos_antiguo` y `videos-nuevo` cuando todo vaya bien.
- A partir de aquí, cada cambio llega al servidor con un PR fusionado en `main` (y el despliegue de hPanel).
- Si algún día cambias de sitio los datos: mover la carpeta y crear `privado/config.php` con `'datos'`.

## Qué no cubre este guion
- Los datos de `datos/*.json` y los vídeos no están en el repositorio: la copia de seguridad de esos es aparte (los MP4 originales los tienes en el PC; `datos/*.json` conviene copiarlos de vez en cuando).
- `archivo-familiar.apk` si estaba en la carpeta web: no está en el repositorio. Si debe seguir descargándose desde la web, muévelo a `archivo-datos/` y dime cómo quieres servirlo.
