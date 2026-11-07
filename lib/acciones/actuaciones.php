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
// $peticiones: [clave => url] o [clave => [url, cuerpoPOST, ua, cabeceras[]]]. Devuelve [clave => [código, cuerpo]].
function ytDescargar(array $peticiones, $timeout) {
    $res = [];
    if (!$peticiones) return $res;
    if (!function_exists('curl_multi_init')) { foreach ($peticiones as $k => $p) $res[$k] = [0, 'sin curl']; return $res; }
    $uaWeb = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
    $mh = curl_multi_init(); $hs = [];
    foreach ($peticiones as $k => $p) {
        [$u, $post, $ua, $cab] = is_array($p) ? $p + [null, null, null, []] : [$p, null, null, []];
        $h = curl_init($u);
        curl_setopt_array($h, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_FOLLOWLOCATION => true, CURLOPT_ENCODING => '',
            CURLOPT_USERAGENT => $ua ?: $uaWeb,
            CURLOPT_HTTPHEADER => array_merge(['Accept-Language: es-ES,es;q=0.9', 'Cookie: CONSENT=YES+cb; SOCS=CAI'], $cab ?: []),
        ]);
        if ($post !== null) { curl_setopt($h, CURLOPT_POST, true); curl_setopt($h, CURLOPT_POSTFIELDS, $post); }
        curl_multi_add_handle($mh, $h); $hs[$k] = $h;
    }
    do { $st = curl_multi_exec($mh, $activos); if ($activos) curl_multi_select($mh, 1); } while ($activos && $st === CURLM_OK);
    $errores = [];
    while ($info = curl_multi_info_read($mh)) if ($info['result'] !== CURLE_OK) $errores[(int)$info['handle']] = curl_strerror($info['result']);
    foreach ($hs as $k => $h) {
        $res[$k] = [intval(curl_getinfo($h, CURLINFO_HTTP_CODE)), $errores[(int)$h] ?? (string)curl_multi_getcontent($h)];
        curl_multi_remove_handle($mh, $h); curl_close($h);
    }
    curl_multi_close($mh);
    return $res;
}

// Pide el reproductor de YouTube haciéndose pasar por uno de sus clientes (tele, incrustado, gafas VR, iPhone, web móvil).
function ytPeticionPlayer($v, $cliente) {
    $clientes = [
        'TV'      => [['clientName' => 'TVHTML5', 'clientVersion' => '7.20250312.16.00'], 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version', 7, false],
        'EMBED'   => [['clientName' => 'WEB_EMBEDDED_PLAYER', 'clientVersion' => '1.20250310.01.00'], null, 56, true],
        'TV_EMBED'=> [['clientName' => 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', 'clientVersion' => '2.0'], 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version', 85, true],
        'VR'      => [['clientName' => 'ANDROID_VR', 'clientVersion' => '1.62.27', 'deviceMake' => 'Oculus', 'deviceModel' => 'Quest 3', 'androidSdkVersion' => 32, 'osName' => 'Android', 'osVersion' => '12L'],
                      'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip', 28, false],
        'IOS'     => [['clientName' => 'IOS', 'clientVersion' => '20.10.4', 'deviceMake' => 'Apple', 'deviceModel' => 'iPhone16,2', 'osName' => 'iPhone', 'osVersion' => '18.3.2.22D82'],
                      'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)', 5, false],
        'MWEB'    => [['clientName' => 'MWEB', 'clientVersion' => '2.20250311.03.00'],
                      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 2, false],
    ];
    [$c, $ua, $num, $incrustado] = $clientes[$cliente];
    $c += ['hl' => 'es', 'gl' => 'ES'];
    $ctx = ['client' => $c];
    if ($incrustado) $ctx['thirdParty'] = ['embedUrl' => 'https://www.youtube.com/'];
    $cuerpo = json_encode(['context' => $ctx, 'videoId' => $v, 'contentCheckOk' => true, 'racyCheckOk' => true]);
    return ['https://www.youtube.com/youtubei/v1/player?prettyPrint=false', $cuerpo, $ua,
            ['Content-Type: application/json', 'Origin: https://www.youtube.com', 'X-Youtube-Client-Name: ' . $num, 'X-Youtube-Client-Version: ' . $c['clientVersion']]];
}

// Motivo legible de un fallo, para el diagnóstico.
function ytMotivo($codigo, $cuerpo) {
    if ($codigo === 0) return 'sin conexión (' . substr($cuerpo, 0, 80) . ')';
    if ($codigo !== 200) return 'HTTP ' . $codigo . (preg_match('/"message":\s*"([^"]{0,60})/', $cuerpo, $m) ? ' ' . $m[1] : '');
    if (preg_match('/"playabilityStatus":\{"status":"([A-Z_]+)"(?:,"reason":"([^"]{0,80}))?/', $cuerpo, $m)) return $m[1] . (isset($m[2]) ? ': ' . $m[2] : '');
    if (stripos($cuerpo, 'consent.youtube.com') !== false) return 'página de cookies';
    return 'sin storyboard (' . strlen($cuerpo) . ' bytes)';
}

// Del HTML de la página del vídeo saca el storyboard de más calidad (preferiblemente >= 160 px de ancho).
function ytStoryboard($html) {
    if (!preg_match('/"playerStoryboardSpecRenderer":\s*\{\s*"spec":\s*"((?:[^"\\\\]|\\\\.)*)"/', $html, $m)) return null;
    $spec = json_decode('"' . $m[1] . '"');
    if (!is_string($spec)) return null;
    $dur = preg_match('/"lengthSeconds":\s*"(\d+)"/', $html, $d) ? intval($d[1]) : 0;
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
    $diag = !empty($_GET['diag']);
    if ($diag) @set_time_limit(90);
    $pendientes = [];
    foreach (array_keys($videos) as $v) {
        $c = $cache['s'][$v] ?? null;
        $edad = $ahora - ($c['t'] ?? 0);
        // Fallo: se reintenta a las 6 h (o ya, en diagnóstico). Bueno: se renueva a los 30 días.
        if (!$c || (empty($c['sb']) && ($diag || !array_key_exists('e', $c) || $edad > 6 * 3600)) || $edad > 30 * 86400) $pendientes[] = $v;
    }
    $urls = array_slice($urls, 0, 20, true);
    $pendientes = array_slice($pendientes, 0, 40);
    if ($urls) {
        foreach (ytDescargar($urls, 10) as $k => [$codigo, $cuerpo]) {
            $id = substr($k, 2);
            $j = $codigo === 200 ? json_decode($cuerpo, true) : null;
            $v = (is_array($j) && preg_match('~/vi(?:_webp)?/([\w-]{11})/~', (string)($j['thumbnail_url'] ?? ''), $m)) ? $m[1] : null;
            $cache['l'][$id] = ['v' => $v, 't' => $ahora, 'e' => $v ? null : ytMotivo($codigo, $cuerpo)];
        }
    }
    // Etapas: página del vídeo, página incrustada y el reproductor como varios clientes de YouTube
    $motivos = [];
    @set_time_limit(120);
    foreach (['watch', 'embed', 'TV', 'EMBED', 'TV_EMBED', 'VR', 'IOS', 'MWEB'] as $etapa) {
        if (!$pendientes) break;
        $pet = [];
        foreach ($pendientes as $v) $pet[$v] = $etapa === 'watch' ? 'https://www.youtube.com/watch?v=' . $v . '&hl=es&bpctr=9999999999&has_verified=1'
                                           : ($etapa === 'embed' ? 'https://www.youtube.com/embed/' . $v . '?hl=es' : ytPeticionPlayer($v, $etapa));
        $siguen = [];
        foreach (ytDescargar($pet, 10) as $v => [$codigo, $cuerpo]) {
            $sb = $codigo === 200 ? ytStoryboard($cuerpo) : null;
            if ($sb) { $cache['s'][$v] = ['sb' => $sb, 't' => $ahora, 'e' => null, 'via' => $etapa]; continue; }
            $motivos[$v][] = $etapa . ': ' . ytMotivo($codigo, $cuerpo);
            $siguen[] = $v;
        }
        $pendientes = $siguen;
    }
    foreach ($pendientes as $v) {
        // Si ya había uno bueno, se conserva; si no, se apunta el fallo
        if (!empty($cache['s'][$v]['sb'])) $cache['s'][$v]['t'] = $ahora - 29 * 86400;
        else $cache['s'][$v] = ['sb' => null, 't' => $ahora, 'e' => implode(' | ', $motivos[$v] ?? [])];
    }
    if ($urls || $motivos || $videos) @file_put_contents($fCache, json_encode($cache, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    $out = ['l' => [], 's' => []];
    foreach (array_keys($listas) as $l) if (!empty($cache['l'][$l]['v'])) $out['l'][$l] = $cache['l'][$l]['v'];
    foreach (array_keys($videos) as $v) if (!empty($cache['s'][$v]['sb'])) $out['s'][$v] = $cache['s'][$v]['sb'];
    $resp = ['l' => (object)$out['l'], 's' => (object)$out['s']];
    if ($diag) {
        $d = ['curl' => function_exists('curl_multi_init'), 'videos' => count($videos), 'listas' => count($listas),
              'con_foto' => count($out['s']), 'listas_con_foto' => count($out['l']), 'fallos' => []];
        foreach (array_keys($videos) as $v) if (!empty($cache['s'][$v]['e'])) $d['fallos'][$v] = $cache['s'][$v]['e'];
        foreach (array_keys($listas) as $l) if (!empty($cache['l'][$l]['e'])) $d['fallos']['lista ' . $l] = $cache['l'][$l]['e'];
        $resp['diag'] = $d;
    }
    responder(true, $resp);
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
