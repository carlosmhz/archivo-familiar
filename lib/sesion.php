<?php
// Contraseñas (de claves.php), roles y sesión. Requiere config.php, auth.php y datos.php.

$claves = cargarClaves();   // las contraseñas viven en claves.php, fuera del código
define('PASS_ADMIN',       $claves['admin']);
define('PASS_TODO',        $claves['todo']);
define('PASS_CASEROS',     $claves['caseros']);
define('PASS_ACTUACIONES', $claves['actuaciones']);

function responder($ok, $data = null, $msg = '') {
    if (!$ok && in_array($msg, ['No autorizado', 'Contrasena incorrecta'], true)) registrarFallo();
    echo json_encode(['ok' => $ok, 'data' => $data, 'msg' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function getRol($pass) {
    if ($pass === PASS_ADMIN)       return 'admin';
    if ($pass === PASS_TODO)        return 'todo';
    if ($pass === PASS_CASEROS)     return 'caseros';
    if ($pass === PASS_ACTUACIONES) return 'actuaciones';
    // Comprobar OTPs
    $otps = leerJSON(FILE_OTP);
    $now = time();
    foreach ($otps as $i => $otp) {
        if ($otp['pass'] === $pass && $otp['expira'] > $now) {
            array_splice($otps, $i, 1);
            guardarJSON(FILE_OTP, $otps);
            return $otp['rol'];
        }
    }
    // Comprobar PINs de compartir
    $compartidos = leerJSON(FILE_COMPARTIR);
    foreach ($compartidos as $i => $c) {
        if ((string)$c['pin'] === (string)$pass && $c['expira'] > $now) {
            // Selección: varios fragmentos (de uno o varios vídeos) con un mismo PIN
            if (isset($c['items']) && is_array($c['items'])) return 'compartir-lista:' . $c['pin'];
            return 'compartir:' . $c['caseroId'] . ':' . $c['escenaIdx'] . ':' . $c['t'];
        }
    }
    return null;
}

// Sesion: token firmado (login) o contraseña fija (admin.html).
// Devuelve ['r'=>rol,'c'=>idCasero|null,'l'=>[ids]|null], null si no hay, false si la contraseña es mala.
// 'l' solo existe en las selecciones compartidas: los vídeos que puede ver quien recibió el PIN.
function sesion() {
    $p = leerToken($_GET['token'] ?? '');
    if ($p && empty($p['v'])) return ['r' => $p['r'] ?? '', 'c' => $p['c'] ?? null,
        'l' => (isset($p['l']) && is_array($p['l'])) ? $p['l'] : null,
        'w' => (isset($p['w']) && is_array($p['w'])) ? $p['w'] : null];
    $pass = (string)($_GET['pass'] ?? '');
    if ($pass !== '') {
        foreach ([[PASS_ADMIN, 'admin'], [PASS_TODO, 'todo'], [PASS_CASEROS, 'caseros'], [PASS_ACTUACIONES, 'actuaciones']] as [$k, $r]) {
            if (hash_equals((string)$k, $pass)) return ['r' => $r, 'c' => null, 'l' => null, 'w' => null];
        }
        return false;
    }
    return null;
}
function exigirSesion() {
    $s = sesion();
    if ($s === false) responder(false, null, 'No autorizado');
    if (!$s) responder(false, null, 'Sesion caducada');
    return $s;
}

// Rol 'compartir': ids de los vídeos que puede ver (uno con un PIN normal, varios con una selección).
function idsCompartidos(array $s) {
    if (is_array($s['l'] ?? null)) return array_map('intval', $s['l']);
    return isset($s['c']) ? [intval($s['c'])] : [];
}
function puedeVerCasero(array $s, $id) {
    if (in_array($s['r'], ['admin', 'todo', 'caseros'], true)) return true;
    return $s['r'] === 'compartir' && in_array(intval($id), idsCompartidos($s), true);
}

// Fragmentos válidos de una selección: [{caseroId, escenaIdx, t}], solo de vídeos que existen
// y escenas que existen (si una escena se borró, ese fragmento pasa a ser el vídeo completo).
function itemsSeleccion($items) {
    if (!is_array($items)) return [];
    $videos = [];
    foreach (leerJSON(FILE_CASEROS) as $v) $videos[intval($v['id'] ?? 0)] = $v;
    $out = []; $vistos = [];
    foreach ($items as $it) {
        if (!is_array($it)) continue;
        $id = intval($it['caseroId'] ?? 0);
        if (!isset($videos[$id])) continue;
        $idx = intval($it['escenaIdx'] ?? -1);
        $esc = $videos[$id]['escenas'] ?? null;
        if ($idx < 0 || !is_array($esc) || !isset($esc[$idx])) $idx = -1;
        $clave = $id . ':' . $idx;
        if (isset($vistos[$clave])) continue;     // sin repetidos
        $vistos[$clave] = true;
        $out[] = ['caseroId' => $id, 'escenaIdx' => $idx, 't' => $idx >= 0 ? intval($esc[$idx]['t'] ?? 0) : 0];
    }
    return $out;
}

// Tramos que puede ver quien entra con PIN: [[caseroId, ini, fin], …]. ini null = vídeo completo;
// fin null = hasta el final. Van en el token de sesión ('w') y los aplican api.php?action=video y
// stream.php, que solo sirve los trozos HLS de ese tramo (restricción en el servidor, 2 nov 2026).
function ventanasDeItems(array $items) {
    $videos = [];
    foreach (leerJSON(FILE_CASEROS) as $v) $videos[intval($v['id'] ?? 0)] = $v;
    $w = [];
    foreach ($items as $it) {
        $v = $videos[$it['caseroId']] ?? null;
        $idx = intval($it['escenaIdx'] ?? -1);
        if (!$v || $idx < 0 || !isset($v['escenas'][$idx])) { $w[] = [$it['caseroId'], null, null]; continue; }
        $esc = $v['escenas'];
        $ini = (float)($esc[$idx]['t'] ?? 0);
        $fin = isset($esc[$idx + 1]) ? (float)($esc[$idx + 1]['t'] ?? 0) : (!empty($v['duracion']) ? (float)$v['duracion'] : null);
        $w[] = [$it['caseroId'], $ini, $fin];
    }
    return $w;
}
