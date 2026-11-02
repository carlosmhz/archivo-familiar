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
        $ruta = is_string($c['miniatura'] ?? null) ? rutaMiniaturaPropia($c['miniatura']) : null;
        if ($ruta !== null) {
            $fich = RAIZ_DATOS . '/' . $ruta;
            if (is_file($fich)) $c['miniatura'] = urlImagen($ruta, filemtime($fich));
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
// Ruta relativa (caseros/miniaturas/x.jpg) de una miniatura nuestra, o null.
// Acepta la ruta relativa y también la URL antigua de la web, absoluta o no
// (https://app.mpi-sala.es/videos/caseros/miniaturas/x.jpg, /videos/caseros/miniaturas/x.jpg):
// esas imágenes ya no están en la carpeta web desde que los datos se movieron a archivo-datos/.
function rutaMiniaturaPropia($url) {
    $r = preg_replace('/[?#].*$/', '', trim((string)$url));
    $r = preg_replace('#^(?:https?://[^/]+)?/?(?:videos/)?#i', '', $r);
    $r = rawurldecode($r);
    return esRutaImagenValida($r) ? $r : null;
}
// Solo se sirven imágenes de miniaturas/ o caseros/miniaturas/, sin subcarpetas ni "..".
function esRutaImagenValida($ruta) {
    return is_string($ruta)
        && preg_match('#^(caseros/)?miniaturas/[\p{L}\p{N}._ \-]+\.(jpe?g|png|webp)$#iu', $ruta) === 1
        && strpos($ruta, '..') === false;
}

// ── HLS con tramo (PIN de escena) ────────────────────────────────────────────
// Un trozo se sirve si se solapa con el tramo [a, b] (b null = hasta el final). Al final hay una
// holgura de 0,5 s: un trozo que empieza justo donde acaba la escena no hace falta.
function trozoPermitido($ini, $dur, $tramo) {
    if (!$tramo) return true;
    return $ini + $dur > $tramo[0] && ($tramo[1] === null || $ini < $tramo[1] - 0.5);
}
// Inicio y duración de cada trozo según la lista: ['seg_0000.ts' => [ini, dur], …]
function trozosHls($ruta) {
    $r = []; $t = 0.0; $dur = 0.0;
    foreach (preg_split('/\r?\n/', (string)file_get_contents($ruta)) as $l) {
        $l = trim($l);
        if (preg_match('/^#EXTINF:([\d.]+)/', $l, $m)) $dur = (float)$m[1];
        elseif ($l !== '' && $l[0] !== '#') { $r[$l] = [$t, $dur]; $t += $dur; $dur = 0.0; }
    }
    return $r;
}
// Segundo (del vídeo original) en que empieza el primer trozo permitido: el vídeo recortado empieza ahí.
function inicioTramoHls($ruta, $tramo) {
    foreach (trozosHls($ruta) as $tr) if (trozoPermitido($tr[0], $tr[1], $tramo)) return $tr[0];
    return 0.0;
}
