<?php
// Rutas del proyecto. No contiene secretos.
//
// Disposición del servidor:
//   <RAIZ_APP>/privado/        claves.php, secret.key (y config.php opcional)
//   <RAIZ_APP>/archivo-datos/  datos/, hls/, caseros/, miniaturas/   (opcional: fuera de la web)
//   <RAIZ_CODIGO>              el código que despliega hPanel → GIT
//
// Dónde están los datos (la primera que exista):
//   1. 'datos' en privado/config.php  (ruta absoluta)
//   2. <RAIZ_APP>/archivo-datos
//   3. la propia carpeta del código (disposición antigua: datos/, hls/, caseros/ junto al código)

define('RAIZ_CODIGO', dirname(__DIR__));
define('RAIZ_APP', dirname(RAIZ_CODIGO, 2));
define('DIR_PRIVADO', RAIZ_APP . '/privado');

function configLocal() {
    static $c = null;
    if ($c !== null) return $c;
    $c = [];
    $f = DIR_PRIVADO . '/config.php';
    if (is_file($f)) { $r = require $f; if (is_array($r)) $c = $r; }
    return $c;
}

function resolverRaizDatos() {
    $cfg = configLocal();
    if (!empty($cfg['datos']) && is_string($cfg['datos']) && is_dir($cfg['datos'])) return rtrim($cfg['datos'], '/');
    if (is_dir(RAIZ_APP . '/archivo-datos')) return RAIZ_APP . '/archivo-datos';
    return RAIZ_CODIGO;
}

define('RAIZ_DATOS', resolverRaizDatos());
define('DIR_DATOS',    RAIZ_DATOS . '/datos');       // *.json con el catálogo, PIN y OTP
define('DIR_HLS',      RAIZ_DATOS . '/hls');         // <nombre>/index.m3u8 + seg_NNNN.ts
define('DIR_CASEROS',  RAIZ_DATOS . '/caseros');     // <nombre>.mp4 originales
define('DIR_MINIS',    RAIZ_DATOS . '/miniaturas');  // miniaturas de escenas
