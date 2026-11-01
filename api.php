<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

require __DIR__ . '/auth.php';
$claves = cargarClaves();   // las contraseñas viven en claves.php, fuera del código
define('PASS_ADMIN',       $claves['admin']);
define('PASS_TODO',        $claves['todo']);
define('PASS_CASEROS',     $claves['caseros']);
define('PASS_ACTUACIONES', $claves['actuaciones']);
define('FILE_ACTUACIONES', __DIR__ . '/datos/actuaciones.json');
define('FILE_CASEROS',     __DIR__ . '/datos/caseros.json');
define('FILE_OTP',         __DIR__ . '/datos/otp.json');
define('FILE_COMPARTIR',   __DIR__ . '/datos/compartir.json');
define('DIR_MINIS',        __DIR__ . '/miniaturas');

function leerJSON($file) {
    if (!file_exists($file)) return [];
    return json_decode(file_get_contents($file), true) ?? [];
}
function guardarJSON($file, $datos) {
    if (!is_dir(__DIR__ . '/datos')) mkdir(__DIR__ . '/datos', 0755, true);
    file_put_contents($file, json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}
function responder($ok, $data = null, $msg = '') {
    if (!$ok && in_array($msg, ['No autorizado', 'Contrasena incorrecta'], true)) registrarFallo();
    echo json_encode(['ok' => $ok, 'data' => $data, 'msg' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}
// Miniaturas de escenas: miniaturas/c<id>_t<segundo>_<huella>.jpg
// La huella hace que el nombre no se pueda adivinar desde fuera.
function rutaMiniEscena($id, $t) {
    $huella = substr(hash_hmac('sha256', intval($id) . ':' . intval($t), (string)PASS_ADMIN), 0, 16);
    return 'miniaturas/c' . intval($id) . '_t' . intval($t) . '_' . $huella . '.jpg';
}
// Añade a cada escena su 'miniatura' si ya está generada
function anotarMinis($lista) {
    foreach ($lista as &$c) {
        if (empty($c['escenas']) || !is_array($c['escenas'])) continue;
        foreach ($c['escenas'] as &$e) {
            $ruta = rutaMiniEscena($c['id'] ?? 0, $e['t'] ?? 0);
            $fich = __DIR__ . '/' . $ruta;
            if (is_file($fich)) $e['miniatura'] = $ruta . '?v=' . filemtime($fich);
            else unset($e['miniatura']);
        }
        unset($e);
    }
    unset($c);
    return $lista;
}

function maxId($datos) {
    $max = 0;
    foreach ($datos as $a) { if (($a['id'] ?? 0) > $max) $max = $a['id']; }
    return $max;
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
        if ($c['pin'] === $pass && $c['expira'] > $now) {
            return 'compartir:' . $c['caseroId'] . ':' . $c['escenaIdx'] . ':' . $c['t'];
        }
    }
    return null;
}

// Sesion: token firmado (login) o contraseña fija (admin.html).
// Devuelve ['r'=>rol,'c'=>idCasero|null], null si no hay, false si la contraseña es mala.
function sesion() {
    $p = leerToken($_GET['token'] ?? '');
    if ($p && empty($p['v'])) return ['r' => $p['r'] ?? '', 'c' => $p['c'] ?? null];
    $pass = (string)($_GET['pass'] ?? '');
    if ($pass !== '') {
        foreach ([[PASS_ADMIN, 'admin'], [PASS_TODO, 'todo'], [PASS_CASEROS, 'caseros'], [PASS_ACTUACIONES, 'actuaciones']] as [$k, $r]) {
            if (hash_equals((string)$k, $pass)) return ['r' => $r, 'c' => null];
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

if (bloqueado()) {
    http_response_code(429);
    responder(false, null, 'Demasiados intentos. Espera unos minutos.');
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// LOGIN
if ($method === 'GET' && $action === 'login') {
    $pass = $_GET['pass'] ?? '';
    $rol = getRol($pass);
    if ($rol) {
        $r = $rol; $c = null;
        if (strpos($rol, 'compartir:') === 0) { $r = 'compartir'; $c = intval(explode(':', $rol)[1]); }
        responder(true, ['rol' => $rol, 'token' => firmarToken(['r' => $r, 'c' => $c], 86400)]);
    }
    responder(false, null, 'Contrasena incorrecta');
}

// ACTUACIONES
if ($method === 'GET' && $action === 'listar') {
    $s = exigirSesion();
    if (in_array($s['r'], ['admin', 'todo', 'actuaciones'], true)) responder(true, leerJSON(FILE_ACTUACIONES));
    responder(true, []);
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

// CASEROS
if ($method === 'GET' && $action === 'caseros-listar') {
    $s = exigirSesion();
    if (in_array($s['r'], ['admin', 'todo', 'caseros'], true)) responder(true, anotarMinis(leerJSON(FILE_CASEROS)));
    if ($s['r'] === 'compartir') {   // quien recibe un PIN solo ve el vídeo compartido
        responder(true, anotarMinis(array_values(array_filter(leerJSON(FILE_CASEROS), fn($c) => ($c['id'] ?? 0) === ($s['c'] ?? -1)))));
    }
    responder(true, []);
}

if ($method === 'POST' && $action === 'caseros-anadir') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (($body['pass'] ?? '') !== PASS_ADMIN) responder(false, null, 'No autorizado');
    $datos = leerJSON(FILE_CASEROS);
    $nuevo = [
        'id'        => maxId($datos) + 1,
        'tipo'      => trim($body['tipo'] ?? 'evento'),
        'titulo'    => trim($body['titulo'] ?? ''),
        'fecha'     => trim($body['fecha'] ?? ''),
        'categoria' => (trim($body['tipo'] ?? '') === 'cotidiano') ? null : (trim($body['categoria'] ?? '') ?: null),
        'youtube'   => trim($body['youtube'] ?? '') ?: null,
        'notas'     => trim($body['notas'] ?? '') ?: null,
        'miniatura'  => null,
        'subido'     => date('c'),   // fecha de subida: la app la usa para "Añadidos recientemente"
    ];
    if (!$nuevo['titulo']) responder(false, null, 'El titulo es obligatorio');
    $datos[] = $nuevo;
    guardarJSON(FILE_CASEROS, $datos);
    responder(true, $nuevo, 'Video anadido');
}

if ($method === 'POST' && $action === 'caseros-editar') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (($body['pass'] ?? '') !== PASS_ADMIN) responder(false, null, 'No autorizado');
    $id = intval($body['id'] ?? 0);
    $datos = leerJSON(FILE_CASEROS);
    foreach ($datos as &$c) {
        if ($c['id'] === $id) {
            $c['tipo']      = trim($body['tipo'] ?? $c['tipo']);
            $c['titulo']    = trim($body['titulo'] ?? $c['titulo']);
            $c['fecha']     = trim($body['fecha'] ?? $c['fecha']);
            $c['categoria'] = ($c['tipo'] === 'cotidiano') ? null : (trim($body['categoria'] ?? '') ?: null);
            $c['youtube']   = trim($body['youtube'] ?? '') ?: null;
            $c['notas']     = trim($body['notas'] ?? '') ?: null;
            $c['duracion']  = isset($body['duracion']) ? intval($body['duracion']) : ($c['duracion'] ?? null);
            $c['escenas']   = isset($body['escenas']) ? $body['escenas'] : ($c['escenas'] ?? null);
            $c['miniatura']  = array_key_exists('miniatura', $body) ? (trim($body['miniatura'] ?? '') ?: null) : ($c['miniatura'] ?? null);
            break;
        }
    }
    guardarJSON(FILE_CASEROS, $datos);
    responder(true, null, 'Actualizado');
}

if ($method === 'POST' && $action === 'caseros-eliminar') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (($body['pass'] ?? '') !== PASS_ADMIN) responder(false, null, 'No autorizado');
    $id = intval($body['id'] ?? 0);
    $datos = leerJSON(FILE_CASEROS);
    $datos = array_values(array_filter($datos, fn($c) => $c['id'] !== $id));
    guardarJSON(FILE_CASEROS, $datos);
    responder(true, null, 'Eliminado');
}

// MINIATURA DE ESCENA — la genera admin.html (captura un fotograma) y la sube aquí
if ($method === 'POST' && $action === 'miniatura-escena') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!hash_equals((string)PASS_ADMIN, (string)($body['pass'] ?? ''))) responder(false, null, 'No autorizado');
    $id = intval($body['caseroId'] ?? 0);
    $t  = intval($body['t'] ?? -1);
    $existe = false;
    foreach (leerJSON(FILE_CASEROS) as $c) {
        if (($c['id'] ?? 0) !== $id) continue;
        foreach (($c['escenas'] ?? []) ?: [] as $e) { if (intval($e['t'] ?? -1) === $t) $existe = true; }
    }
    if (!$existe) responder(false, null, 'Escena no encontrada');
    $img = (string)($body['imagen'] ?? '');
    if (!preg_match('#^data:image/jpeg;base64,#', $img)) responder(false, null, 'Imagen no valida');
    $bin = base64_decode(substr($img, strpos($img, ',') + 1), true);
    if ($bin === false || strlen($bin) > 1500000) responder(false, null, 'Imagen no valida');
    $info = @getimagesizefromstring($bin);
    if (!$info || $info[2] !== IMAGETYPE_JPEG) responder(false, null, 'Imagen no valida');
    if (!is_dir(DIR_MINIS)) mkdir(DIR_MINIS, 0755, true);
    $ruta = rutaMiniEscena($id, $t);
    file_put_contents(__DIR__ . '/' . $ruta, $bin);
    responder(true, ['miniatura' => $ruta . '?v=' . time()]);
}

// OTP — Contraseñas de un solo uso
if ($method === 'POST' && $action === 'otp-crear') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (($body['pass'] ?? '') !== PASS_ADMIN) responder(false, null, 'No autorizado');
    $rol = $body['rol'] ?? 'caseros';
    if (!in_array($rol, ['caseros', 'actuaciones', 'todo'])) responder(false, null, 'Rol no valido');
    // Generar PIN de 4 dígitos
    $otp_pass = str_pad(random_int(1000, 9999), 4, '0', STR_PAD_LEFT);
    $otps = leerJSON(FILE_OTP);
    // Limpiar OTPs expirados
    $now = time();
    $otps = array_values(array_filter($otps, fn($o) => $o['expira'] > $now));
    $otps[] = ['pass' => $otp_pass, 'rol' => $rol, 'expira' => $now + 86400]; // 24h
    guardarJSON(FILE_OTP, $otps);
    responder(true, ['otp' => $otp_pass, 'rol' => $rol], 'OTP creada');
}

if ($method === 'GET' && $action === 'otp-listar') {
    $pass = $_GET['pass'] ?? '';
    if ($pass !== PASS_ADMIN) responder(false, null, 'No autorizado');
    $otps = leerJSON(FILE_OTP);
    $now = time();
    $otps = array_values(array_filter($otps, fn($o) => $o['expira'] > $now));
    guardarJSON(FILE_OTP, $otps);
    responder(true, $otps);
}

if ($method === 'POST' && $action === 'otp-eliminar') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (($body['pass'] ?? '') !== PASS_ADMIN) responder(false, null, 'No autorizado');
    $otp_pass = $body['otp'] ?? '';
    $otps = leerJSON(FILE_OTP);
    $otps = array_values(array_filter($otps, fn($o) => $o['pass'] !== $otp_pass));
    guardarJSON(FILE_OTP, $otps);
    responder(true, null, 'OTP eliminada');
}

// COMPARTIR — generar PIN de acceso a vídeo/escena
if ($method === 'POST' && $action === 'compartir-generar') {
    $body = json_decode(file_get_contents('php://input'), true);
    $pass = $body['pass'] ?? '';
    $rol = getRol($pass);
    // Restaurar compartidos que se hayan consumido — recargar sin consumir
    $rolCheck = null;
    if ($pass === PASS_TODO)    $rolCheck = 'todo';
    if ($pass === PASS_CASEROS) $rolCheck = 'caseros';
    if (!$rolCheck) responder(false, null, 'No autorizado');
    $caseroId = intval($body['caseroId'] ?? 0);
    $escenaIdx = isset($body['escenaIdx']) ? intval($body['escenaIdx']) : -1; // -1 = vídeo completo
    $t = intval($body['t'] ?? 0);
    if (!$caseroId) responder(false, null, 'ID de vídeo requerido');
    // Generar PIN de 4 dígitos
    $pin = str_pad(random_int(1000, 9999), 4, '0', STR_PAD_LEFT);
    $compartidos = leerJSON(FILE_COMPARTIR);
    // Limpiar expirados
    $now = time();
    $compartidos = array_values(array_filter($compartidos, fn($c) => $c['expira'] > $now));
    $permanente = !empty($body['permanente']) ? true : false;
    $compartidos[] = [
        'pin' => $pin,
        'caseroId' => $caseroId,
        'escenaIdx' => $escenaIdx,
        't' => $t,
        'expira' => $permanente ? PHP_INT_MAX : $now + 86400,
        'permanente' => $permanente
    ];
    guardarJSON(FILE_COMPARTIR, $compartidos);
    responder(true, ['pin' => $pin]);
}

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
    $hayHls = is_file(__DIR__ . '/hls/' . $nombre . '/index.m3u8');
    $hayMp4 = is_file(__DIR__ . '/caseros/' . $nombre . '.mp4');
    if (!$hayHls && !$hayMp4) responder(true, ['directo' => true]);
    $vt = firmarToken(['v' => $nombre], 43200);   // 12 h, solo para este vídeo
    $base = 'stream.php?v=' . rawurlencode($nombre) . '&t=' . $vt . '&f=';
    responder(true, ['hls' => $hayHls ? $base . 'index.m3u8' : null, 'mp4' => $hayMp4 ? $base . 'mp4' : null]);
}

responder(false, null, 'Accion no reconocida');
