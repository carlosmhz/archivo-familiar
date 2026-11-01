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

    $compartidos = leerJSON(FILE_COMPARTIR);
    $now = time();
    $compartidos = array_values(array_filter($compartidos, fn($c) => $c['expira'] > $now));
    // PIN de 6 cifras (desde el 2 nov 2026; los de 4 ya repartidos siguen valiendo).
    // No puede coincidir con una contraseña fija, una OTP ni otro PIN vigente.
    $usados = array_map('strval', array_merge(
        [PASS_ADMIN, PASS_TODO, PASS_CASEROS, PASS_ACTUACIONES],
        array_column(leerJSON(FILE_OTP), 'pass'),
        array_column($compartidos, 'pin')
    ));
    do {
        $pin = (string)random_int(100000, 999999);
    } while (in_array($pin, $usados, true));
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
