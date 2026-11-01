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
    $st = db()->prepare('SELECT c.*, d.nombre FROM comentarios c JOIN dispositivos d ON d.id = c.dispositivo
                         WHERE c.casero_id = ? ORDER BY c.creado DESC, c.id DESC LIMIT 500');
    $st->execute([intval($c['id'])]);
    responder(true, [
        'comentarios' => array_map(fn($f) => filaComentario($f, $d), $st->fetchAll()),
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

    // Escena: solo si existe en el vídeo; se guarda su título y su segundo de inicio
    $ei = null; $et = null; $etit = null;
    if (isset($body['escenaIdx']) && $body['escenaIdx'] !== null && intval($body['escenaIdx']) >= 0) {
        $i = intval($body['escenaIdx']);
        $esc = is_array($c['escenas'] ?? null) ? ($c['escenas'][$i] ?? null) : null;
        if (is_array($esc)) { $ei = $i; $et = intval($esc['t'] ?? 0); $etit = (string)($esc['titulo'] ?? ''); }
    }
    $pdo->prepare('INSERT INTO comentarios (casero_id, dispositivo, texto, escena_idx, escena_titulo, escena_t, rol, ip, creado)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([intval($c['id']), $d, $texto, $ei, $etit, $et, $s['r'], $ip, time()]);
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

// Borrar un comentario: el propio dispositivo que lo escribió, o el admin.
if ($method === 'POST' && $action === 'comentarios-borrar') {
    $s = exigirSesion();
    $id = intval($body['id'] ?? 0);
    $pdo = db();
    if ($s['r'] === 'admin') {
        $st = $pdo->prepare('DELETE FROM comentarios WHERE id = ?');
        $st->execute([$id]);
    } else {
        $d = (string)($body['dispositivo'] ?? '');
        if (!dispositivoValido($d)) responder(false, null, 'Dispositivo no valido');
        $st = $pdo->prepare('DELETE FROM comentarios WHERE id = ? AND dispositivo = ?');
        $st->execute([$id, $d]);
    }
    if ($st->rowCount() === 0) responder(false, null, 'Comentario no encontrado');
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
    $lista = array_map(function ($f) use ($titulos) {
        $r = filaComentario($f, '');
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
