<?php
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
