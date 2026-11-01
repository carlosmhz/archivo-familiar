<?php
// Lectura y escritura de los JSON de datos, ids y miniaturas. Requiere config.php.

define('FILE_ACTUACIONES', DIR_DATOS . '/actuaciones.json');
define('FILE_CASEROS',     DIR_DATOS . '/caseros.json');
define('FILE_OTP',         DIR_DATOS . '/otp.json');
define('FILE_COMPARTIR',   DIR_DATOS . '/compartir.json');

function leerJSON($file) {
    if (!file_exists($file)) return [];
    return json_decode(file_get_contents($file), true) ?? [];
}
function guardarJSON($file, $datos) {
    if (!is_dir(DIR_DATOS)) mkdir(DIR_DATOS, 0755, true);
    file_put_contents($file, json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}
function maxId($datos) {
    $max = 0;
    foreach ($datos as $a) { if (($a['id'] ?? 0) > $max) $max = $a['id']; }
    return $max;
}

// ── Miniaturas ───────────────────────────────────────────────────────────────
// Las de escena se guardan como miniaturas/c<id>_t<segundo>_<huella>.jpg.
// La huella hace que el nombre no se pueda adivinar desde fuera.
// Se sirven por stream.php?img=…, así pueden estar fuera de la carpeta web.
function nombreMiniEscena($id, $t) {
    $huella = substr(hash_hmac('sha256', intval($id) . ':' . intval($t), (string)PASS_ADMIN), 0, 16);
    return 'c' . intval($id) . '_t' . intval($t) . '_' . $huella . '.jpg';
}
function urlImagen($rutaRelativa, $version) {
    return 'stream.php?img=' . rawurlencode($rutaRelativa) . '&v=' . intval($version);
}
// Añade a cada escena su 'miniatura' si ya está generada, y convierte la miniatura
// del vídeo (ruta relativa guardada en caseros.json) en una URL servida por stream.php.
function anotarMinis($lista) {
    foreach ($lista as &$c) {
        if (!empty($c['miniatura']) && is_string($c['miniatura']) && esRutaImagenValida(preg_replace('/\?.*$/', '', $c['miniatura']))) {
            $ruta = preg_replace('/\?.*$/', '', $c['miniatura']);
            $fich = RAIZ_DATOS . '/' . $ruta;
            $c['miniatura'] = is_file($fich) ? urlImagen($ruta, filemtime($fich)) : $c['miniatura'];
        }
        if (empty($c['escenas']) || !is_array($c['escenas'])) continue;
        foreach ($c['escenas'] as &$e) {
            $nombre = nombreMiniEscena($c['id'] ?? 0, $e['t'] ?? 0);
            $fich = DIR_MINIS . '/' . $nombre;
            if (is_file($fich)) $e['miniatura'] = urlImagen('miniaturas/' . $nombre, filemtime($fich));
            else unset($e['miniatura']);
        }
        unset($e);
    }
    unset($c);
    return $lista;
}
// Solo se sirven imágenes de miniaturas/ o caseros/miniaturas/, sin subcarpetas ni "..".
function esRutaImagenValida($ruta) {
    return is_string($ruta)
        && preg_match('#^(caseros/)?miniaturas/[\p{L}\p{N}._ \-]+\.(jpe?g|png|webp)$#iu', $ruta) === 1
        && strpos($ruta, '..') === false;
}
