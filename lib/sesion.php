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
