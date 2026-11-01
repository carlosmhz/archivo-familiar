<?php
// Utilidades de seguridad compartidas por la API y el streaming.
// No imprime nada: solo define funciones. Requiere config.php.

function falloConfig($msg) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'data' => null, 'msg' => $msg]);
    exit;
}

// ── Contraseñas: viven en claves.php, fuera del código ───────────────────────
function cargarClaves() {
    static $c = null;
    if ($c !== null) return $c;
    foreach ([DIR_PRIVADO . '/claves.php', RAIZ_CODIGO . '/claves.php'] as $f) {
        if (!is_file($f)) continue;
        $r = require $f;
        if (!is_array($r)) falloConfig('claves.php no es valido');
        foreach (['admin', 'todo', 'caseros', 'actuaciones'] as $k) {
            if (!isset($r[$k]) || !is_string($r[$k]) || $r[$k] === '') falloConfig("Falta la clave '$k' en claves.php");
        }
        return $c = $r;
    }
    falloConfig('Falta el archivo claves.php');
}

// ── Clave secreta para firmar tokens (se crea sola la primera vez) ───────────
function secretoHmac() {
    static $s = null;
    if ($s) return $s;
    $dirs = [DIR_PRIVADO, DIR_DATOS];
    foreach ($dirs as $d) {
        $f = $d . '/secret.key';
        if (is_file($f)) { $x = trim((string)file_get_contents($f)); if ($x !== '') return $s = $x; }
    }
    foreach ($dirs as $d) {
        if (!is_dir($d)) @mkdir($d, 0700, true);
        $x = bin2hex(random_bytes(32));
        if (@file_put_contents($d . '/secret.key', $x, LOCK_EX) !== false) {
            $y = trim((string)file_get_contents($d . '/secret.key'));   // por si otra peticion lo creo a la vez
            return $s = ($y !== '' ? $y : $x);
        }
    }
    falloConfig('No se pudo crear la clave de firma');
}

// ── Tokens firmados (HMAC-SHA256) ────────────────────────────────────────────
function b64u($s)  { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64ud($s) { return base64_decode(strtr($s, '-_', '+/')); }

function firmarToken(array $payload, int $vidaSeg) {
    $payload['e'] = time() + $vidaSeg;
    $b = b64u(json_encode($payload));
    return $b . '.' . b64u(hash_hmac('sha256', $b, secretoHmac(), true));
}

function leerToken($t) {
    if (!is_string($t) || substr_count($t, '.') !== 1) return null;
    [$b, $sig] = explode('.', $t);
    if (!hash_equals(b64u(hash_hmac('sha256', $b, secretoHmac(), true)), $sig)) return null;
    $p = json_decode((string)b64ud($b), true);
    if (!is_array($p) || ($p['e'] ?? 0) < time()) return null;
    return $p;
}

// ── Nombres de vídeo: solo letras, números, punto, guion y espacio ───────────
function nombreValido($n) {
    return is_string($n) && $n !== '' && $n[0] !== '.' && strpos($n, '..') === false
        && preg_match('/^[\p{L}\p{N}._ \-]+$/u', $n) === 1;
}

// "https://.../caseros/sahara.mp4#t=3" -> "sahara"  (null si no es un .mp4)
function nombreVideo($url) {
    $u = preg_replace('/[#?].*$/', '', (string)$url);
    if (!preg_match('/\.mp4$/i', $u)) return null;
    $n = preg_replace('/\.mp4$/i', '', rawurldecode(basename($u)));
    return nombreValido($n) ? $n : null;
}

// ── Freno a la fuerza bruta: 8 fallos en 15 min -> bloqueo temporal por IP ───
define('FILE_INTENTOS', DIR_DATOS . '/intentos.json');

function ipCliente() { return $_SERVER['REMOTE_ADDR'] ?? '0'; }

function intentosLeer() {
    $d = is_file(FILE_INTENTOS) ? json_decode((string)file_get_contents(FILE_INTENTOS), true) : [];
    return is_array($d) ? $d : [];
}

function bloqueado() {
    $lim = time() - 900;
    $n = count(array_filter(intentosLeer()[ipCliente()] ?? [], fn($t) => $t > $lim));
    return $n >= 8;
}

function registrarFallo() {
    $lim = time() - 900;
    $d = intentosLeer();
    foreach ($d as $k => $v) {
        $d[$k] = array_values(array_filter($v, fn($t) => $t > $lim));
        if (!$d[$k]) unset($d[$k]);
    }
    $d[ipCliente()][] = time();
    if (!is_dir(dirname(FILE_INTENTOS))) @mkdir(dirname(FILE_INTENTOS), 0755, true);
    @file_put_contents(FILE_INTENTOS, json_encode($d), LOCK_EX);
}
