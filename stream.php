<?php
// Sirve los vídeos (lista HLS, fragmentos y MP4) solo con un token firmado válido.
require __DIR__ . '/auth.php';

function fin($code, $msg = '') {
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    echo $msg;
    exit;
}

function enviarArchivo($ruta, $tipo, $cache) {
    $tam = filesize($ruta);
    $ini = 0; $fin = $tam - 1;
    header('Content-Type: ' . $tipo);
    header('Accept-Ranges: bytes');
    header('Cache-Control: ' . $cache);
    if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $m) && ($m[1] !== '' || $m[2] !== '')) {
        if ($m[1] === '') { $ini = max(0, $tam - (int)$m[2]); }
        else { $ini = (int)$m[1]; if ($m[2] !== '') $fin = min((int)$m[2], $tam - 1); }
        if ($ini > $fin || $ini >= $tam) { header("Content-Range: bytes */$tam"); fin(416); }
        http_response_code(206);
        header("Content-Range: bytes $ini-$fin/$tam");
    }
    header('Content-Length: ' . ($fin - $ini + 1));
    if ($_SERVER['REQUEST_METHOD'] === 'HEAD') exit;
    set_time_limit(0);
    while (ob_get_level()) ob_end_clean();
    $h = fopen($ruta, 'rb');
    fseek($h, $ini);
    $resto = $fin - $ini + 1;
    while ($resto > 0 && !feof($h)) {
        $n = min(1048576, $resto);
        echo fread($h, $n);
        $resto -= $n;
        flush();
        if (connection_aborted()) break;
    }
    fclose($h);
    exit;
}

$v = (string)($_GET['v'] ?? '');
$f = (string)($_GET['f'] ?? '');
$t = (string)($_GET['t'] ?? '');

if (bloqueado()) fin(429, 'Demasiados intentos');
$p = leerToken($t);
if (!$p || ($p['v'] ?? null) !== $v || !nombreValido($v)) fin(403, 'Acceso denegado');

if ($f === 'index.m3u8') {
    $ruta = __DIR__ . '/hls/' . $v . '/index.m3u8';
    if (!is_file($ruta)) fin(404, 'No existe');
    $out = [];
    foreach (preg_split('/\r?\n/', (string)file_get_contents($ruta)) as $l) {
        $l = trim($l);
        if ($l !== '' && $l[0] !== '#' && preg_match('/^seg_\d{4}\.ts$/', $l)) {
            $l = 'stream.php?v=' . rawurlencode($v) . '&f=' . $l . '&t=' . $t;
        }
        $out[] = $l;
    }
    header('Content-Type: application/vnd.apple.mpegurl');
    header('Cache-Control: no-store');
    echo implode("\n", $out) . "\n";
    exit;
}

if (preg_match('/^seg_\d{4}\.ts$/', $f)) {
    $ruta = __DIR__ . '/hls/' . $v . '/' . $f;
    if (!is_file($ruta)) fin(404, 'No existe');
    enviarArchivo($ruta, 'video/mp2t', 'private, max-age=43200');
}

if ($f === 'mp4') {
    $ruta = __DIR__ . '/caseros/' . $v . '.mp4';
    if (!is_file($ruta)) fin(404, 'No existe');
    enviarArchivo($ruta, 'video/mp4', 'private, max-age=3600');
}

fin(400, 'Peticion no valida');
