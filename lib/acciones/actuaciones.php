<?php
// ACTUACIONES
if ($method === 'GET' && $action === 'listar') {
    $s = exigirSesion();
    if (in_array($s['r'], ['admin', 'todo', 'actuaciones'], true)) responder(true, leerJSON(FILE_ACTUACIONES));
    responder(true, []);
}

// Miniaturas de las actuaciones (7 nov 2026). Devuelve:
//  l: { idLista: idVideo }  portada de las actuaciones enlazadas a una lista de YouTube (oEmbed).
//  s: { idVideo: {u, w, h, n, c, r, i} }  "storyboard" de YouTube (las fotos de la barra de
//     progreso) de los vídeos con actuaciones que empiezan a mitad: con él el navegador recorta
//     la foto del minuto exacto. u lleva {p} en lugar del número de hoja.
// Se pregunta a YouTube una vez y se guarda en datos/yt-minis.json (listas: para siempre;
// storyboards: 30 días; fallos: se reintenta al día siguiente). Como mucho 40 consultas por llamada.
function ytDescargar(array $urls, $timeout) {
    $res = [];
    if (!$urls || !function_exists('curl_multi_init')) return $res;
    $mh = curl_multi_init(); $hs = [];
    foreach ($urls as $k => $u) {
        $h = curl_init($u);
        curl_setopt_array($h, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_FOLLOWLOCATION => true, CURLOPT_ENCODING => '',
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            CURLOPT_HTTPHEADER => ['Accept-Language: es-ES,es;q=0.9', 'Cookie: CONSENT=YES+cb; SOCS=CAI'],
        ]);
        curl_multi_add_handle($mh, $h); $hs[$k] = $h;
    }
    do { $st = curl_multi_exec($mh, $activos); if ($activos) curl_multi_select($mh, 1); } while ($activos && $st === CURLM_OK);
    foreach ($hs as $k => $h) {
        $res[$k] = curl_getinfo($h, CURLINFO_HTTP_CODE) == 200 ? (string)curl_multi_getcontent($h) : '';
        curl_multi_remove_handle($mh, $h); curl_close($h);
    }
    curl_multi_close($mh);
    return $res;
}

// Del HTML de la página del vídeo saca el storyboard de más calidad (preferiblemente >= 160 px de ancho).
function ytStoryboard($html) {
    if (!preg_match('/"playerStoryboardSpecRenderer":\{"spec":"((?:[^"\\\\]|\\\\.)*)"/', $html, $m)) return null;
    $spec = json_decode('"' . $m[1] . '"');
    if (!is_string($spec)) return null;
    $dur = preg_match('/"lengthSeconds":"(\d+)"/', $html, $d) ? intval($d[1]) : 0;
    $partes = explode('|', $spec);
    $base = array_shift($partes);
    if (strpos($base, 'https://i.ytimg.com/') !== 0) return null;
    $mejor = null;
    foreach ($partes as $nivel => $p) {
        $f = explode('#', $p);
        if (count($f) < 8) continue;
        [$w, $h, $n, $c, $r, $i] = array_map('intval', array_slice($f, 0, 6));
        if ($w <= 0 || $n <= 0 || $c <= 0 || $r <= 0) continue;
        if ($i <= 0) { if ($dur <= 0) continue; $i = intval(round($dur * 1000 / $n)); }
        $nombre = str_replace('$M', '{p}', $f[6]);
        $u = str_replace(['$L', '$N'], [$nivel, $nombre], $base) . '&sigh=' . rawurlencode($f[7]);
        $cand = ['u' => $u, 'w' => $w, 'h' => $h, 'n' => $n, 'c' => $c, 'r' => $r, 'i' => $i];
        if (!$mejor || ($mejor['w'] < 160 && $w > $mejor['w']) || ($w >= 160 && $w <= 320 && $w > $mejor['w'])) $mejor = $cand;
    }
    return $mejor;
}

if ($method === 'GET' && $action === 'actuaciones-minis') {
    $s = exigirSesion();
    if (!in_array($s['r'], ['admin', 'todo', 'actuaciones'], true)) responder(true, ['l' => (object)[], 's' => (object)[]]);
    $listas = []; $videos = [];
    foreach (leerJSON(FILE_ACTUACIONES) as $a) {
        $u = (string)($a['youtube'] ?? '');
        if (preg_match('/(?:[?&]v=|youtu\.be\/|\/live\/|\/shorts\/|\/embed\/)([\w-]{11})/', $u, $m)) {
            if (intval($a['min'] ?? 0) > 0) $videos[$m[1]] = true;
        } elseif (preg_match('/[?&]list=([\w-]+)/', $u, $m)) $listas[$m[1]] = true;
    }
    $fCache = DIR_DATOS . '/yt-minis.json';
    $cache = is_file($fCache) ? (json_decode(file_get_contents($fCache), true) ?: []) : [];
    $cache += ['l' => [], 's' => []];
    $ahora = time();
    $urls = [];
    foreach (array_keys($listas) as $l) {
        $c = $cache['l'][$l] ?? null;
        if (!$c || (empty($c['v']) && $ahora - ($c['t'] ?? 0) > 86400))
            $urls['l:' . $l] = 'https://www.youtube.com/oembed?format=json&url=' . rawurlencode('https://www.youtube.com/playlist?list=' . $l);
    }
    foreach (array_keys($videos) as $v) {
        $c = $cache['s'][$v] ?? null;
        $edad = $ahora - ($c['t'] ?? 0);
        if (!$c || (empty($c['sb']) && $edad > 86400) || $edad > 30 * 86400)
            $urls['s:' . $v] = 'https://www.youtube.com/watch?v=' . $v . '&hl=es';
    }
    if ($urls) {
        $urls = array_slice($urls, 0, 40, true);
        foreach (ytDescargar($urls, 12) as $k => $cuerpo) {
            [$tipo, $id] = explode(':', $k, 2);
            if ($tipo === 'l') {
                $j = json_decode($cuerpo, true);
                $v = (is_array($j) && preg_match('~/vi(?:_webp)?/([\w-]{11})/~', (string)($j['thumbnail_url'] ?? ''), $m)) ? $m[1] : null;
                $cache['l'][$id] = ['v' => $v, 't' => $ahora];
            } else {
                $sb = $cuerpo !== '' ? ytStoryboard($cuerpo) : null;
                // Si falla, se conserva el anterior (si lo había) hasta el próximo intento
                if ($sb || empty($cache['s'][$id]['sb'])) $cache['s'][$id] = ['sb' => $sb, 't' => $ahora];
                else $cache['s'][$id]['t'] = $ahora - 29 * 86400;
            }
        }
        @file_put_contents($fCache, json_encode($cache, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    }
    $out = ['l' => [], 's' => []];
    foreach (array_keys($listas) as $l) if (!empty($cache['l'][$l]['v'])) $out['l'][$l] = $cache['l'][$l]['v'];
    foreach (array_keys($videos) as $v) if (!empty($cache['s'][$v]['sb'])) $out['s'][$v] = $cache['s'][$v]['sb'];
    responder(true, ['l' => (object)$out['l'], 's' => (object)$out['s']]);
}

if ($method === 'POST' && $action === 'anadir') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (($body['pass'] ?? '') !== PASS_ADMIN) responder(false, null, 'No autorizado');
    $datos = leerJSON(FILE_ACTUACIONES);
    $nueva = [
        'id' => maxId($datos) + 1,
        'archivo' => intval($body['archivo'] ?? 0),
        'fecha'   => trim($body['fecha'] ?? ''),
        'act'     => trim($body['act'] ?? ''),
        'min'     => ($body['min'] === '' || $body['min'] === null) ? null : intval($body['min']),
        'kw'      => trim($body['kw'] ?? '') ?: null,
        'youtube' => trim($body['youtube'] ?? '') ?: null,
    ];
    if (!$nueva['act']) responder(false, null, 'El nombre es obligatorio');
    $datos[] = $nueva;
    guardarJSON(FILE_ACTUACIONES, $datos);
    responder(true, $nueva, 'Actuacion anadida');
}

if ($method === 'POST' && $action === 'editar') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (($body['pass'] ?? '') !== PASS_ADMIN) responder(false, null, 'No autorizado');
    $id = intval($body['id'] ?? 0);
    $datos = leerJSON(FILE_ACTUACIONES);
    foreach ($datos as &$a) {
        if ($a['id'] === $id) {
            $a['archivo'] = intval($body['archivo'] ?? $a['archivo']);
            $a['fecha']   = trim($body['fecha'] ?? $a['fecha']);
            $a['act']     = trim($body['act'] ?? $a['act']);
            $a['min']     = ($body['min'] === '' || $body['min'] === null) ? null : intval($body['min']);
            $a['kw']      = trim($body['kw'] ?? '') ?: null;
            $a['youtube'] = trim($body['youtube'] ?? '') ?: null;
            break;
        }
    }
    guardarJSON(FILE_ACTUACIONES, $datos);
    responder(true, null, 'Actualizado');
}

if ($method === 'POST' && $action === 'eliminar') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (($body['pass'] ?? '') !== PASS_ADMIN) responder(false, null, 'No autorizado');
    $id = intval($body['id'] ?? 0);
    $datos = leerJSON(FILE_ACTUACIONES);
    $datos = array_values(array_filter($datos, fn($a) => $a['id'] !== $id));
    guardarJSON(FILE_ACTUACIONES, $datos);
    responder(true, null, 'Eliminado');
}

if ($method === 'POST' && $action === 'youtube') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (($body['pass'] ?? '') !== PASS_ADMIN) responder(false, null, 'No autorizado');
    $archivo = intval($body['archivo'] ?? 0);
    $url = trim($body['url'] ?? '');
    $datos = leerJSON(FILE_ACTUACIONES);
    $n = 0;
    foreach ($datos as &$a) {
        if ($a['archivo'] === $archivo) { $a['youtube'] = $url ?: null; $n++; }
    }
    guardarJSON(FILE_ACTUACIONES, $datos);
    responder(true, ['actualizadas' => $n], "URL actualizada en $n actuaciones");
}
