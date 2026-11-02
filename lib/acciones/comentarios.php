<?php
// COMENTARIOS Y "ME GUSTA" — ver lib/comentarios.php
// Todas piden token de sesión en la URL (&token=…). Las POST llevan el resto en JSON.
// El admin (admin.html) usa &pass= como en el resto de su panel.
if (strpos($action, 'comentarios-') !== 0) return;

require_once __DIR__ . '/../comentarios.php';

$body = $method === 'POST' ? (json_decode(file_get_contents('php://input'), true) ?: []) : [];

// Comentarios y "me gusta" de un vídeo, y el nombre de este dispositivo.
if ($method === 'GET' && $action === 'comentarios-listar') {
    $s = exigirSesion();
    $c = caseroAccesible($s, $_GET['caseroId'] ?? 0);
    $d = (string)($_GET['dispositivo'] ?? '');
    if (!dispositivoValido($d)) $d = '';
    // Comentarios principales (los 500 más recientes) y todas sus respuestas
    $st = db()->prepare('SELECT c.*, d.nombre FROM comentarios c JOIN dispositivos d ON d.id = c.dispositivo
                         WHERE c.casero_id = ? AND c.padre_id IS NULL ORDER BY c.creado DESC, c.id DESC LIMIT 500');
    $st->execute([intval($c['id'])]);
    $filas = $st->fetchAll();
    $st = db()->prepare('SELECT c.*, d.nombre FROM comentarios c JOIN dispositivos d ON d.id = c.dispositivo
                         WHERE c.casero_id = ? AND c.padre_id IS NOT NULL ORDER BY c.creado ASC, c.id ASC');
    $st->execute([intval($c['id'])]);
    $filas = array_merge($filas, $st->fetchAll());
    $reac = reaccionesDe(array_column($filas, 'id'), $d);
    responder(true, [
        'comentarios' => array_map(fn($f) => filaComentario($f, $d, $reac), $filas),
        'megusta'     => megustaDe(intval($c['id']), $d),
        'nombre'      => $d !== '' ? nombreDispositivo($d) : null,
    ]);
}

// Elegir o cambiar el nombre de este dispositivo.
if ($method === 'POST' && $action === 'comentarios-nombre') {
    exigirSesion();
    $d = (string)($body['dispositivo'] ?? '');
    if (!dispositivoValido($d)) responder(false, null, 'Dispositivo no valido');
    $n = limpiarTexto($body['nombre'] ?? '', COM_MAX_NOMBRE, false);
    if ($n === '') responder(false, null, 'Escribe un nombre (maximo ' . COM_MAX_NOMBRE . ' letras)');
    $t = time();
    db()->prepare('INSERT INTO dispositivos (id, nombre, creado, visto) VALUES (?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET nombre = excluded.nombre, visto = excluded.visto')
        ->execute([$d, $n, $t, $t]);
    responder(true, ['nombre' => $n]);
}

// Publicar un comentario (sale al momento).
if ($method === 'POST' && $action === 'comentarios-anadir') {
    $s = exigirSesion();
    $c = caseroAccesible($s, $body['caseroId'] ?? 0);
    $d = (string)($body['dispositivo'] ?? '');
    exigirDispositivoConNombre($d);
    $texto = limpiarTexto($body['texto'] ?? '', COM_MAX_TEXTO, true);
    if ($texto === '') responder(false, null, 'El comentario esta vacio o es demasiado largo');

    // Freno: 10 por dispositivo en 10 min y 30 por IP en una hora
    $pdo = db();
    $ip = huellaIp();
    $st = $pdo->prepare('SELECT COUNT(*) FROM comentarios WHERE dispositivo = ? AND creado > ?');
    $st->execute([$d, time() - 600]);
    $porDisp = intval($st->fetchColumn());
    $st = $pdo->prepare('SELECT COUNT(*) FROM comentarios WHERE ip = ? AND creado > ?');
    $st->execute([$ip, time() - 3600]);
    if ($porDisp >= 10 || intval($st->fetchColumn()) >= 30) responder(false, null, 'Demasiados comentarios seguidos. Espera un poco.');

    // Respuesta: el padre debe ser un comentario de este vídeo. Si se responde a una
    // respuesta, se cuelga del comentario principal (un solo nivel, como en YouTube).
    $padre = null;
    if (!empty($body['padreId'])) {
        $st = $pdo->prepare('SELECT id, padre_id FROM comentarios WHERE id = ? AND casero_id = ?');
        $st->execute([intval($body['padreId']), intval($c['id'])]);
        $p = $st->fetch();
        if (!$p) responder(false, null, 'El comentario al que respondes ya no existe');
        $padre = $p['padre_id'] !== null ? intval($p['padre_id']) : intval($p['id']);
    }

    // Escena: solo si existe en el vídeo; se guarda su título y su segundo de inicio
    $ei = null; $et = null; $etit = null;
    if ($padre === null && isset($body['escenaIdx']) && $body['escenaIdx'] !== null && intval($body['escenaIdx']) >= 0) {
        $i = intval($body['escenaIdx']);
        $esc = is_array($c['escenas'] ?? null) ? ($c['escenas'][$i] ?? null) : null;
        if (is_array($esc)) { $ei = $i; $et = intval($esc['t'] ?? 0); $etit = (string)($esc['titulo'] ?? ''); }
    }
    $pdo->prepare('INSERT INTO comentarios (casero_id, dispositivo, texto, escena_idx, escena_titulo, escena_t, rol, ip, creado, padre_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([intval($c['id']), $d, $texto, $ei, $etit, $et, $s['r'], $ip, time(), $padre]);
    $st = $pdo->prepare('SELECT c.*, d.nombre FROM comentarios c JOIN dispositivos d ON d.id = c.dispositivo WHERE c.id = ?');
    $st->execute([intval($pdo->lastInsertId())]);
    responder(true, filaComentario($st->fetch(), $d));
}

// Dar o quitar "me gusta" (uno por dispositivo y vídeo).
if ($method === 'POST' && $action === 'comentarios-megusta') {
    $s = exigirSesion();
    $c = caseroAccesible($s, $body['caseroId'] ?? 0);
    $d = (string)($body['dispositivo'] ?? '');
    exigirDispositivoConNombre($d);
    $id = intval($c['id']);
    $pdo = db();
    $st = $pdo->prepare('DELETE FROM megusta WHERE casero_id = ? AND dispositivo = ?');
    $st->execute([$id, $d]);
    if ($st->rowCount() === 0) {
        $pdo->prepare('INSERT OR IGNORE INTO megusta (casero_id, dispositivo, creado) VALUES (?, ?, ?)')->execute([$id, $d, time()]);
    }
    responder(true, megustaDe($id, $d));
}

// Reaccionar a un comentario con un emoji. El mismo emoji otra vez la quita; otro la cambia.
if ($method === 'POST' && $action === 'comentarios-reaccion') {
    $s = exigirSesion();
    $d = (string)($body['dispositivo'] ?? '');
    exigirDispositivoConNombre($d);
    $emoji = (string)($body['emoji'] ?? '');
    if (!in_array($emoji, COM_REACCIONES, true)) responder(false, null, 'Reaccion no valida');
    $pdo = db();
    $st = $pdo->prepare('SELECT id, casero_id FROM comentarios WHERE id = ?');
    $st->execute([intval($body['id'] ?? 0)]);
    $com = $st->fetch();
    if (!$com) responder(false, null, 'Comentario no encontrado');
    caseroAccesible($s, $com['casero_id']);
    $id = intval($com['id']);
    $st = $pdo->prepare('SELECT emoji FROM reacciones WHERE comentario_id = ? AND dispositivo = ?');
    $st->execute([$id, $d]);
    $antes = $st->fetchColumn();
    if ($antes === $emoji) {
        $pdo->prepare('DELETE FROM reacciones WHERE comentario_id = ? AND dispositivo = ?')->execute([$id, $d]);
    } else {
        $pdo->prepare('INSERT INTO reacciones (comentario_id, dispositivo, emoji, creado) VALUES (?, ?, ?, ?)
                       ON CONFLICT(comentario_id, dispositivo) DO UPDATE SET emoji = excluded.emoji, creado = excluded.creado')
            ->execute([$id, $d, $emoji, time()]);
    }
    responder(true, reaccionesDe([$id], $d)[$id] ?? []);
}

// Borrar un comentario (con sus respuestas): el propio dispositivo que lo escribió, o el admin.
if ($method === 'POST' && $action === 'comentarios-borrar') {
    $s = exigirSesion();
    $id = intval($body['id'] ?? 0);
    $pdo = db();
    if ($s['r'] === 'admin') {
        $st = $pdo->prepare('SELECT 1 FROM comentarios WHERE id = ?');
        $st->execute([$id]);
    } else {
        $d = (string)($body['dispositivo'] ?? '');
        if (!dispositivoValido($d)) responder(false, null, 'Dispositivo no valido');
        $st = $pdo->prepare('SELECT 1 FROM comentarios WHERE id = ? AND dispositivo = ?');
        $st->execute([$id, $d]);
    }
    if (!$st->fetchColumn()) responder(false, null, 'Comentario no encontrado');
    $pdo->beginTransaction();
    borrarComentarioYRespuestas($id);
    $pdo->commit();
    responder(true, null, 'Borrado');
}

// Admin: últimos comentarios de todos los vídeos y totales de "me gusta".
if ($method === 'GET' && $action === 'comentarios-recientes') {
    $s = exigirSesion();
    if ($s['r'] !== 'admin') responder(false, null, 'Solo para el admin');
    $titulos = [];
    foreach (leerJSON(FILE_CASEROS) as $c) $titulos[intval($c['id'] ?? 0)] = (string)($c['titulo'] ?? '');
    $pdo = db();
    $filas = $pdo->query('SELECT c.*, d.nombre FROM comentarios c JOIN dispositivos d ON d.id = c.dispositivo
                          ORDER BY c.creado DESC, c.id DESC LIMIT 300')->fetchAll();
    $reac = reaccionesDe(array_column($filas, 'id'), '');
    $lista = array_map(function ($f) use ($titulos, $reac) {
        $r = filaComentario($f, '', $reac);
        $r['caseroId'] = intval($f['casero_id']);
        $r['video'] = $titulos[intval($f['casero_id'])] ?? '(vídeo borrado)';
        $r['rol'] = $f['rol'];
        return $r;
    }, $filas);
    $megusta = [];
    foreach ($pdo->query('SELECT casero_id, COUNT(*) n FROM megusta GROUP BY casero_id ORDER BY n DESC') as $f) {
        $megusta[] = ['caseroId' => intval($f['casero_id']), 'video' => $titulos[intval($f['casero_id'])] ?? '(vídeo borrado)', 'total' => intval($f['n'])];
    }
    responder(true, ['comentarios' => $lista, 'megusta' => $megusta]);
}

responder(false, null, 'Accion no reconocida');
