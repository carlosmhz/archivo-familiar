<?php
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
