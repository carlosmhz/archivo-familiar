<?php
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
