<?php
// COMPARTIR — generar PIN de acceso a vídeo/escena
if ($method === 'POST' && $action === 'compartir-generar') {
    $s = exigirSesion();
    $rol = $s['r'] ?? '';
    if ($rol !== 'todo' && $rol !== 'caseros') {
        responder(false, null, 'No autorizado');
    }
    $body = json_decode(file_get_contents('php://input'), true) ?: [];
    $caseroId  = intval($body['caseroId'] ?? 0);
    $escenaIdx = isset($body['escenaIdx']) ? intval($body['escenaIdx']) : -1;
    $t         = intval($body['t'] ?? 0);
    if (!$caseroId) responder(false, null, 'ID de vídeo requerido');

    $pin = str_pad(random_int(1000, 9999), 4, '0', STR_PAD_LEFT);
    $compartidos = leerJSON(FILE_COMPARTIR);
    $now = time();
    $compartidos = array_values(array_filter($compartidos, fn($c) => $c['expira'] > $now));
    $permanente = !empty($body['permanente']);
    $compartidos[] = [
        'pin'        => $pin,
        'caseroId'   => $caseroId,
        'escenaIdx'  => $escenaIdx,
        't'          => $t,
        'expira'     => $permanente ? PHP_INT_MAX : $now + 86400,
        'permanente' => $permanente
    ];
    guardarJSON(FILE_COMPARTIR, $compartidos);
    responder(true, ['pin' => $pin]);
}
