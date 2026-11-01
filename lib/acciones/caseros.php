<?php
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
