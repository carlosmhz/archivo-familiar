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
            if (($c['id'] ?? 0) === ($s['c'] ?? -1) && nombreVideo($c['youtube'] ?? '') === $nombre) $ok = true;
        }
        if (!$ok) responder(false, null, 'Sin acceso');
    }
    $hayHls = is_file(DIR_HLS . '/' . $nombre . '/index.m3u8');
    $hayMp4 = is_file(DIR_CASEROS . '/' . $nombre . '.mp4');
    if (!$hayHls && !$hayMp4) responder(true, ['directo' => true]);
    $vt = firmarToken(['v' => $nombre], 43200);   // 12 h, solo para este vídeo
    $base = 'stream.php?v=' . rawurlencode($nombre) . '&t=' . $vt . '&f=';
    responder(true, ['hls' => $hayHls ? $base . 'index.m3u8' : null, 'mp4' => $hayMp4 ? $base . 'mp4' : null]);
}
