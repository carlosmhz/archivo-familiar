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

// Admin: lista de PIN de compartir, con el título del vídeo y de la escena
if ($method === 'GET' && $action === 'compartir-listar') {
    if (($_GET['pass'] ?? '') !== PASS_ADMIN) responder(false, null, 'No autorizado');
    $videos = [];
    foreach (leerJSON(FILE_CASEROS) as $v) $videos[$v['id'] ?? 0] = $v;
    $now = time();
    $lista = [];
    foreach (leerJSON(FILE_COMPARTIR) as $c) {
        $v = $videos[$c['caseroId'] ?? 0] ?? null;
        $idx = intval($c['escenaIdx'] ?? -1);
        $escena = ($v && $idx >= 0) ? ($v['escenas'][$idx] ?? null) : null;
        $lista[] = [
            'pin'         => (string)$c['pin'],
            'caseroId'    => $c['caseroId'] ?? 0,
            'video'       => $v ? ($v['titulo'] ?? '') : null,   // null = el vídeo ya no existe
            'escenaIdx'   => $idx,
            'escena'      => $escena ? ($escena['titulo'] ?? '') : null,
            't'           => intval($c['t'] ?? 0),
            'permanente'  => !empty($c['permanente']),
            'expira'      => !empty($c['permanente']) ? null : ($c['expira'] ?? 0),
            'caducado'    => empty($c['permanente']) && ($c['expira'] ?? 0) <= $now,
        ];
    }
    responder(true, $lista);
}

// Admin: borrar un PIN de compartir (deja de funcionar al instante)
if ($method === 'POST' && $action === 'compartir-eliminar') {
    $body = json_decode(file_get_contents('php://input'), true) ?: [];
    if (($body['pass'] ?? '') !== PASS_ADMIN) responder(false, null, 'No autorizado');
    $pin = (string)($body['pin'] ?? '');
    if ($pin === '') responder(false, null, 'PIN requerido');
    $antes = leerJSON(FILE_COMPARTIR);
    $despues = array_values(array_filter($antes, fn($c) => (string)$c['pin'] !== $pin));
    guardarJSON(FILE_COMPARTIR, $despues);
    responder(true, null, count($antes) - count($despues) ? 'PIN eliminado' : 'Ese PIN ya no existía');
}
