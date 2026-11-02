<?php
// VIDEO — direcciones firmadas (HLS y/o MP4) para reproducir un vídeo
if ($method === 'GET' && $action === 'video') {
    $s = exigirSesion();
    if (!in_array($s['r'], ['admin', 'todo', 'caseros', 'compartir'], true)) responder(false, null, 'Sin acceso');
    $url = (string)($_GET['url'] ?? '');
    $nombre = nombreVideo($url);
    if (!$nombre) responder(true, ['directo' => true]);   // no es un .mp4 nuestro: se reproduce tal cual
    if ($s['r'] === 'compartir') {
        $ok = false;
        foreach (leerJSON(FILE_CASEROS) as $c) {
            if (puedeVerCasero($s, $c['id'] ?? 0) && nombreVideo($c['youtube'] ?? '') === $nombre) $ok = true;
        }
        if (!$ok) responder(false, null, 'Sin acceso');
    }
    $hayHls = is_file(DIR_HLS . '/' . $nombre . '/index.m3u8');
    $hayMp4 = is_file(DIR_CASEROS . '/' . $nombre . '.mp4');
    // PIN de escena: el permiso del vídeo lleva el tramo (a, b) y solo vale el HLS (stream.php
    // sirve solo los trozos de ese tramo; el MP4 permitiría saltar a cualquier punto).
    if ($s['r'] === 'compartir' && is_array($s['w'] ?? null)) {
        $tramos = []; $completo = false;
        foreach (leerJSON(FILE_CASEROS) as $c) {
            if (nombreVideo($c['youtube'] ?? '') !== $nombre) continue;
            foreach ($s['w'] as $x) {
                if (!is_array($x) || intval($x[0] ?? 0) !== intval($c['id'] ?? -1)) continue;
                if (($x[1] ?? null) === null) $completo = true; else $tramos[] = $x;
            }
        }
        if (!$completo) {
            $tq = isset($_GET['t']) ? (float)$_GET['t'] : -1;
            $elegido = null;
            foreach ($tramos as $x) {
                if ($tq >= (float)$x[1] - 2 && ($x[2] === null || $tq < (float)$x[2])) { $elegido = $x; break; }
            }
            if (!$elegido) responder(false, null, 'Sin acceso');
            if (!$hayHls) responder(false, null, 'Este video aun no esta preparado');
            $vt = firmarToken(['v' => $nombre, 'a' => (float)$elegido[1], 'b' => $elegido[2] === null ? null : (float)$elegido[2]], 43200);
            responder(true, ['hls' => 'stream.php?v=' . rawurlencode($nombre) . '&t=' . $vt . '&f=index.m3u8', 'mp4' => null, 'tramo' => [$elegido[1], $elegido[2]]]);
        }
    }
    if (!$hayHls && !$hayMp4) responder(true, ['directo' => true]);
    $vt = firmarToken(['v' => $nombre], 43200);   // 12 h, solo para este vídeo
    $base = 'stream.php?v=' . rawurlencode($nombre) . '&t=' . $vt . '&f=';
    responder(true, ['hls' => $hayHls ? $base . 'index.m3u8' : null, 'mp4' => $hayMp4 ? $base . 'mp4' : null]);
}
