<?php
// ACTUACIONES
if ($method === 'GET' && $action === 'listar') {
    $s = exigirSesion();
    if (in_array($s['r'], ['admin', 'todo', 'actuaciones'], true)) responder(true, leerJSON(FILE_ACTUACIONES));
    responder(true, []);
}

// Miniaturas de las actuaciones (7 nov 2026). Devuelve:
//  l: { idLista: idVideo }  portada de las actuaciones enlazadas a una lista de YouTube (oEmbed).
//  p: { idLista: [{v, t, s}, …] } partes de cada lista en orden (vídeo, título, segundos), leídas de la
//     página de la lista; las usa la ventana «Partes» al abrir una actuación de lista.
//  d: { idVideo: segundos } duración de los vídeos con actuaciones que empiezan a mitad, leída de la
//     página incrustada (/embed/) si la trae. El navegador elige con ella la foto automática de YouTube
//     más cercana al minuto (1/4, 1/2, 3/4); si no hay duración, la estima con los minutos de inicio.
// La foto exacta del minuto (storyboard) no se puede: YouTube pide "confirmar que no eres un bot" a
// Hostinger (comprobado el 7 nov 2026 con la página y con los clientes web, tele, VR, iPhone y Android).
// Caché en datos/yt-minis.json (listas y duraciones para siempre; fallos: se reintenta a la semana).
function ytDescargar(array $urls, $timeout) {
    $res = [];
    if (!$urls) return $res;
    if (!function_exists('curl_multi_init')) { foreach ($urls as $k => $u) $res[$k] = [0, 'sin curl']; return $res; }
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
    $errores = [];
    while ($info = curl_multi_info_read($mh)) if ($info['result'] !== CURLE_OK) $errores[(int)$info['handle']] = curl_strerror($info['result']);
    foreach ($hs as $k => $h) {
        $res[$k] = [intval(curl_getinfo($h, CURLINFO_HTTP_CODE)), $errores[(int)$h] ?? (string)curl_multi_getcontent($h)];
        curl_multi_remove_handle($mh, $h); curl_close($h);
    }
    curl_multi_close($mh);
    return $res;
}

// Duración en segundos dentro de una página de YouTube (también si va dentro de un JSON escapado).
function ytDuracion($html) {
    if (preg_match('/\\\\?"lengthSeconds\\\\?"\s*:\s*\\\\?"?(\d+)/', $html, $m)) return intval($m[1]);
    if (preg_match('/\\\\?"approxDurationMs\\\\?"\s*:\s*\\\\?"?(\d+)/', $html, $m)) return intval(intval($m[1]) / 1000);
    return 0;
}

// Partes de una lista de YouTube, en orden, desde la página de la lista (ytInitialData).
// Devuelve [['v' => id, 't' => título, 's' => segundos], …] o null si la página no las trae.
function ytPartesLista($html) {
    if (!preg_match('/ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s', $html, $m)) return null;
    $data = json_decode($m[1], true);
    if (!is_array($data)) return null;
    $partes = []; $vistos = [];
    $recorrer = function ($n) use (&$recorrer, &$partes, &$vistos) {
        if (!is_array($n)) return;
        if (isset($n['playlistVideoRenderer']['videoId'])) {
            $r = $n['playlistVideoRenderer'];
            $v = $r['videoId'];
            if (!isset($vistos[$v]) && preg_match('/^[\w-]{11}$/', $v)) {
                $vistos[$v] = true;
                $t = $r['title']['runs'][0]['text'] ?? ($r['title']['simpleText'] ?? '');
                $partes[] = ['v' => $v, 't' => mb_substr((string)$t, 0, 120), 's' => intval($r['lengthSeconds'] ?? 0)];
            }
            return;
        }
        foreach ($n as $h) $recorrer($h);
    };
    $recorrer($data);
    return $partes ?: null;
}

// ── API de datos de YouTube (opcional) ──
// Si existe la clave en privado/config.php ('youtube_api_key' => 'AIza…'), las partes de las listas y
// las duraciones se piden a la API oficial (gratis, cuota de 10 000 unidades al día; aquí se gastan
// unas pocas por semana gracias a la caché). Sin clave, se intenta leer las páginas de YouTube.
function ytClaveApi() {
    $k = configLocal()['youtube_api_key'] ?? '';
    return (is_string($k) && preg_match('/^[\w-]{20,60}$/', $k)) ? $k : null;
}
function ytIsoSegundos($iso) {   // PT1H2M3S → 3723
    if (!preg_match('/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/', (string)$iso, $m)) return 0;
    return intval($m[1] ?? 0) * 86400 + intval($m[2] ?? 0) * 3600 + intval($m[3] ?? 0) * 60 + intval($m[4] ?? 0);
}
// Duración de varios vídeos: [id => segundos]. $errores recibe el motivo si la API falla.
function ytApiDuraciones(array $ids, $clave, &$error = null) {
    $out = [];
    foreach (array_chunk(array_values(array_unique($ids)), 50) as $grupo) {
        $r = ytDescargar(['x' => 'https://www.googleapis.com/youtube/v3/videos?part=contentDetails&maxResults=50&id=' . implode(',', $grupo) . '&key=' . $clave], 10)['x'];
        $j = json_decode($r[1], true);
        if ($r[0] !== 200 || !is_array($j)) { $error = 'API: HTTP ' . $r[0] . ' ' . substr((string)($j['error']['message'] ?? $r[1]), 0, 80); continue; }
        foreach ($j['items'] ?? [] as $it) $out[$it['id']] = ytIsoSegundos($it['contentDetails']['duration'] ?? '');
    }
    return $out;
}
// Partes de varias listas en orden: [lista => [{v, t, s}] ] (sin vídeos privados o borrados).
function ytApiPartes(array $listas, $clave, &$errores = []) {
    $pet = [];
    foreach ($listas as $l) $pet[$l] = 'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,status&maxResults=50&playlistId=' . rawurlencode($l) . '&key=' . $clave;
    $partes = []; $ids = [];
    foreach (ytDescargar($pet, 10) as $l => [$codigo, $cuerpo]) {
        $j = json_decode($cuerpo, true);
        if ($codigo !== 200 || !is_array($j)) { $errores[$l] = 'API: HTTP ' . $codigo . ' ' . substr((string)($j['error']['message'] ?? ''), 0, 80); continue; }
        $items = $j['items'] ?? [];
        usort($items, fn($a, $b) => ($a['snippet']['position'] ?? 0) <=> ($b['snippet']['position'] ?? 0));
        foreach ($items as $it) {
            $v = $it['snippet']['resourceId']['videoId'] ?? '';
            $priv = $it['status']['privacyStatus'] ?? 'public';
            if (!preg_match('/^[\w-]{11}$/', $v) || $priv === 'private' || $priv === 'privacyStatusUnspecified') continue;
            $partes[$l][] = ['v' => $v, 't' => mb_substr((string)($it['snippet']['title'] ?? ''), 0, 120), 's' => 0];
            $ids[] = $v;
        }
        if (empty($partes[$l])) $errores[$l] = 'API: lista vacía o privada';
    }
    if ($ids) {
        $dur = ytApiDuraciones($ids, $clave);
        foreach ($partes as $l => &$ps) foreach ($ps as &$p) $p['s'] = $dur[$p['v']] ?? 0;
        unset($ps, $p);
    }
    return $partes;
}

if ($method === 'GET' && $action === 'actuaciones-minis') {
    $s = exigirSesion();
    if (!in_array($s['r'], ['admin', 'todo', 'actuaciones'], true)) responder(true, ['l' => (object)[], 'd' => (object)[], 'p' => (object)[]]);
    $listas = []; $videos = [];
    foreach (leerJSON(FILE_ACTUACIONES) as $a) {
        $u = (string)($a['youtube'] ?? '');
        if (preg_match('/(?:[?&]v=|youtu\.be\/|\/live\/|\/shorts\/|\/embed\/)([\w-]{11})/', $u, $m)) {
            if (intval($a['min'] ?? 0) > 0) $videos[$m[1]] = true;
        } elseif (preg_match('/[?&]list=([\w-]+)/', $u, $m)) $listas[$m[1]] = true;
    }
    $diag = !empty($_GET['diag']);
    $fCache = DIR_DATOS . '/yt-minis.json';
    $cache = is_file($fCache) ? (json_decode(file_get_contents($fCache), true) ?: []) : [];
    $cache = ['l' => $cache['l'] ?? [], 'd' => $cache['d'] ?? [], 'p' => $cache['p'] ?? []];   // (lo antiguo de storyboards se descarta)
    $ahora = time(); $semana = 7 * 86400;
    $urls = [];
    foreach (array_keys($listas) as $l) {
        $c = $cache['l'][$l] ?? null;
        if (!$c || (empty($c['v']) && ($diag || $ahora - ($c['t'] ?? 0) > $semana)))
            $urls['l:' . $l] = 'https://www.youtube.com/oembed?format=json&url=' . rawurlencode('https://www.youtube.com/playlist?list=' . $l);
    }
    foreach (array_keys($listas) as $l) {
        $c = $cache['p'][$l] ?? null;
        $edad = $ahora - ($c['t'] ?? 0);
        $sinApi = ytClaveApi() && empty($c['i']) && ($c['via'] ?? '') !== 'api' && strpos((string)($c['e'] ?? ''), 'API') !== 0;
        if (!$c || $sinApi || (empty($c['i']) && ($diag || $edad > 86400)) || $edad > $semana)
            $urls['p:' . $l] = 'https://www.youtube.com/playlist?list=' . $l . '&hl=es';
    }
    foreach (array_keys($videos) as $v) {
        $c = $cache['d'][$v] ?? null;
        $sinApi = ytClaveApi() && empty($c['s']) && strpos((string)($c['e'] ?? ''), 'API') !== 0;
        if (!$c || $sinApi || (empty($c['s']) && ($diag || $ahora - ($c['t'] ?? 0) > $semana)))
            $urls['d:' . $v] = 'https://www.youtube.com/embed/' . $v . '?hl=es';
    }
    $clave = ytClaveApi();
    if ($clave) {
        // Con clave: partes y duraciones por la API oficial; se quitan esas páginas de la descarga
        $lp = []; $vd = [];
        foreach (array_keys($urls) as $k) {
            if (strpos($k, 'p:') === 0) { $lp[] = substr($k, 2); unset($urls[$k]); }
            elseif (strpos($k, 'd:') === 0) { $vd[] = substr($k, 2); unset($urls[$k]); }
        }
        if ($lp) {
            $errores = [];
            $res = ytApiPartes($lp, $clave, $errores);
            foreach ($lp as $l) {
                if (!empty($res[$l])) $cache['p'][$l] = ['i' => $res[$l], 't' => $ahora, 'e' => null, 'via' => 'api'];
                elseif (empty($cache['p'][$l]['i'])) $cache['p'][$l] = ['i' => null, 't' => $ahora, 'e' => $errores[$l] ?? 'API: sin partes'];
            }
        }
        if ($vd) {
            $error = null;
            $res = ytApiDuraciones($vd, $clave, $error);
            foreach ($vd as $v) $cache['d'][$v] = ['s' => ($res[$v] ?? 0) ?: null, 't' => $ahora, 'e' => !empty($res[$v]) ? null : ($error ?: 'API: vídeo no encontrado')];
        }
        if ($lp || $vd) @file_put_contents($fCache, json_encode($cache, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    }
    if ($urls) {
        foreach (ytDescargar(array_slice($urls, 0, 60, true), 10) as $k => [$codigo, $cuerpo]) {
            [$tipo, $id] = explode(':', $k, 2);
            $motivo = $codigo === 0 ? 'sin conexión (' . substr($cuerpo, 0, 60) . ')' : ($codigo !== 200 ? 'HTTP ' . $codigo : null);
            if ($tipo === 'l') {
                $j = $codigo === 200 ? json_decode($cuerpo, true) : null;
                $v = (is_array($j) && preg_match('~/vi(?:_webp)?/([\w-]{11})/~', (string)($j['thumbnail_url'] ?? ''), $m)) ? $m[1] : null;
                $cache['l'][$id] = ['v' => $v, 't' => $ahora, 'e' => $v ? null : ($motivo ?: 'sin portada')];
            } elseif ($tipo === 'p') {
                $partes = $codigo === 200 ? ytPartesLista($cuerpo) : null;
                if ($partes || empty($cache['p'][$id]['i']))
                    $cache['p'][$id] = ['i' => $partes, 't' => $ahora, 'e' => $partes ? null : ($motivo ?: (stripos($cuerpo, 'consent.') !== false ? 'página de cookies' : 'sin partes (' . strlen($cuerpo) . ' bytes)'))];
                else $cache['p'][$id]['t'] = $ahora - $semana + 86400;   // se conserva la anterior; reintento mañana
            } else {
                $seg = $codigo === 200 ? ytDuracion($cuerpo) : 0;
                $cache['d'][$id] = ['s' => $seg ?: null, 't' => $ahora, 'e' => $seg ? null : ($motivo ?: 'sin duración (' . strlen($cuerpo) . ' bytes)')];
            }
        }
        @file_put_contents($fCache, json_encode($cache, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    }
    $out = ['l' => [], 'd' => [], 'p' => []];
    foreach (array_keys($listas) as $l) {
        if (!empty($cache['p'][$l]['i'])) $out['p'][$l] = $cache['p'][$l]['i'];
        $portada = $cache['l'][$l]['v'] ?? ($cache['p'][$l]['i'][0]['v'] ?? null);
        if ($portada) $out['l'][$l] = $portada;
    }
    foreach (array_keys($videos) as $v) if (!empty($cache['d'][$v]['s'])) $out['d'][$v] = $cache['d'][$v]['s'];
    $resp = ['l' => (object)$out['l'], 'd' => (object)$out['d'], 'p' => (object)$out['p']];
    if ($diag) {
        $f = [];
        foreach (array_keys($listas) as $l) if (!empty($cache['p'][$l]['e'])) { $f['partes ' . $l] = $cache['p'][$l]['e']; break; }
        foreach (array_keys($videos) as $v) if (!empty($cache['d'][$v]['e'])) { $f[$v] = $cache['d'][$v]['e']; break; }
        foreach (array_keys($listas) as $l) {
            if (!empty($cache['l'][$l]['e'])) $f['lista ' . $l] = $cache['l'][$l]['e'];
        }
        $resp['diag'] = ['clave_api' => (bool)$clave, 'curl' => function_exists('curl_multi_init'), 'videos' => count($videos), 'con_duracion' => count($out['d']),
                         'listas' => count($listas), 'listas_con_foto' => count($out['l']), 'listas_con_partes' => count($out['p']), 'fallos' => $f];
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
