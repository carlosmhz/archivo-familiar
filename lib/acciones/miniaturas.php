<?php
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
    $nombre = nombreMiniEscena($id, $t);
    file_put_contents(DIR_MINIS . '/' . $nombre, $bin);
    responder(true, ['miniatura' => urlImagen('miniaturas/' . $nombre, time())]);
}
