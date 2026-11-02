<?php
// Comentarios y "me gusta" de los vídeos caseros. Requiere config.php, auth.php y datos.php.
//
// Se guardan en una base de datos SQLite: <carpeta de datos>/datos/comentarios.sqlite
// (fuera de la web y fuera del repositorio). Se crea sola la primera vez.
//
// Quién es quién: cada navegador o móvil genera un identificador aleatorio de 32
// caracteres hexadecimales ("dispositivo") y elige un nombre. No es una identidad
// verificada: basta para una web familiar, y el admin puede borrar comentarios.

define('FILE_COMENTARIOS', DIR_DATOS . '/comentarios.sqlite');
define('COM_MAX_NOMBRE', 40);
define('COM_MAX_TEXTO', 1000);
// Reacciones permitidas a un comentario (una por dispositivo y comentario, como en WhatsApp)
define('COM_REACCIONES', ['👍', '❤️', '😂', '😮', '😢', '🙏']);

function db() {
    static $pdo = null;
    if ($pdo) return $pdo;
    if (!class_exists('PDO') || !in_array('sqlite', PDO::getAvailableDrivers(), true)) {
        responder(false, null, 'Comentarios no disponibles en este servidor');
    }
    if (!is_dir(DIR_DATOS)) @mkdir(DIR_DATOS, 0755, true);
    try {
        $pdo = new PDO('sqlite:' . FILE_COMENTARIOS, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec('PRAGMA busy_timeout = 5000');
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('
            CREATE TABLE IF NOT EXISTS dispositivos (
                id      TEXT PRIMARY KEY,
                nombre  TEXT NOT NULL,
                creado  INTEGER NOT NULL,
                visto   INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS comentarios (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                casero_id     INTEGER NOT NULL,
                dispositivo   TEXT NOT NULL REFERENCES dispositivos(id),
                texto         TEXT NOT NULL,
                escena_idx    INTEGER,
                escena_titulo TEXT,
                escena_t      INTEGER,
                rol           TEXT,
                ip            TEXT,
                creado        INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS comentarios_video ON comentarios (casero_id, creado);
            CREATE TABLE IF NOT EXISTS megusta (
                casero_id   INTEGER NOT NULL,
                dispositivo TEXT NOT NULL REFERENCES dispositivos(id),
                creado      INTEGER NOT NULL,
                PRIMARY KEY (casero_id, dispositivo)
            );
            CREATE TABLE IF NOT EXISTS reacciones (
                comentario_id INTEGER NOT NULL,
                dispositivo   TEXT NOT NULL REFERENCES dispositivos(id),
                emoji         TEXT NOT NULL,
                creado        INTEGER NOT NULL,
                PRIMARY KEY (comentario_id, dispositivo)
            );
        ');
        // Respuestas (2 nov 2026): padre_id = comentario al que responde (siempre uno principal).
        // Las bases creadas antes no tienen la columna: se añade sin tocar los comentarios.
        $cols = array_column($pdo->query('PRAGMA table_info(comentarios)')->fetchAll(), 'name');
        if (!in_array('padre_id', $cols, true)) $pdo->exec('ALTER TABLE comentarios ADD COLUMN padre_id INTEGER');
        $pdo->exec('CREATE INDEX IF NOT EXISTS comentarios_padre ON comentarios (padre_id)');
    } catch (Throwable $e) {
        responder(false, null, 'No se pudo abrir la base de datos de comentarios');
    }
    return $pdo;
}

function dispositivoValido($d) {
    return is_string($d) && preg_match('/^[a-f0-9]{32}$/', $d) === 1;
}

// Limpia un texto: sin caracteres de control (salvo saltos de línea si se permiten), recortado.
// Devuelve '' si está vacío o pasa de $max caracteres.
function limpiarTexto($s, $max, $saltos) {
    $s = (string)$s;
    if (!mb_check_encoding($s, 'UTF-8')) return '';
    $s = str_replace("\r\n", "\n", $s);
    // Solo se quitan los caracteres de control (no los de formato: el ZWJ une emojis como 👨‍👩‍👧)
    $s = preg_replace($saltos ? '/[^\P{Cc}\n]/u' : '/\p{Cc}/u', '', $s);
    if ($saltos) $s = preg_replace("/\n{3,}/", "\n\n", $s);
    $s = trim($s);
    return mb_strlen($s) > $max ? '' : $s;
}

// IP con huella (para frenar abusos sin guardar la IP en claro)
function huellaIp() {
    return substr(hash_hmac('sha256', ipCliente(), secretoHmac()), 0, 16);
}

// El vídeo casero si la sesión puede verlo; si no, responde con error.
function caseroAccesible(array $s, $caseroId) {
    $caseroId = intval($caseroId);
    if (!puedeVerCasero($s, $caseroId)) responder(false, null, 'Sin acceso a este video');
    foreach (leerJSON(FILE_CASEROS) as $c) {
        if (intval($c['id'] ?? 0) === $caseroId) return $c;
    }
    responder(false, null, 'Video no encontrado');
}

// Nombre del dispositivo, o null si aún no lo ha elegido.
function nombreDispositivo($d) {
    $st = db()->prepare('SELECT nombre FROM dispositivos WHERE id = ?');
    $st->execute([$d]);
    $n = $st->fetchColumn();
    return $n === false ? null : $n;
}

function exigirDispositivoConNombre($d) {
    if (!dispositivoValido($d)) responder(false, null, 'Dispositivo no valido');
    if (nombreDispositivo($d) === null) responder(false, null, 'Falta el nombre');
    db()->prepare('UPDATE dispositivos SET visto = ? WHERE id = ?')->execute([time(), $d]);
}

function megustaDe($caseroId, $d) {
    $pdo = db();
    $st = $pdo->prepare('SELECT COUNT(*) FROM megusta WHERE casero_id = ?');
    $st->execute([$caseroId]);
    $total = intval($st->fetchColumn());
    $st = $pdo->prepare('SELECT d.nombre FROM megusta m JOIN dispositivos d ON d.id = m.dispositivo
                         WHERE m.casero_id = ? ORDER BY m.creado DESC LIMIT 5');
    $st->execute([$caseroId]);
    $nombres = $st->fetchAll(PDO::FETCH_COLUMN);
    $mio = false;
    if (dispositivoValido($d)) {
        $st = $pdo->prepare('SELECT 1 FROM megusta WHERE casero_id = ? AND dispositivo = ?');
        $st->execute([$caseroId, $d]);
        $mio = (bool)$st->fetchColumn();
    }
    return ['total' => $total, 'mio' => $mio, 'nombres' => $nombres];
}

// Reacciones de una lista de comentarios: [idComentario => [{emoji, n, mio, nombres[≤5]}]]
function reaccionesDe(array $ids, $d) {
    $ids = array_values(array_unique(array_map('intval', $ids)));
    if (!$ids) return [];
    $res = [];
    foreach (array_chunk($ids, 400) as $trozo) {
        $st = db()->prepare('SELECT r.comentario_id, r.emoji, r.dispositivo, d.nombre FROM reacciones r
                             JOIN dispositivos d ON d.id = r.dispositivo
                             WHERE r.comentario_id IN (' . implode(',', array_fill(0, count($trozo), '?')) . ')
                             ORDER BY r.creado');
        $st->execute($trozo);
        foreach ($st->fetchAll() as $f) {
            $c = intval($f['comentario_id']); $e = $f['emoji'];
            if (!isset($res[$c][$e])) $res[$c][$e] = ['emoji' => $e, 'n' => 0, 'mio' => false, 'nombres' => []];
            $res[$c][$e]['n']++;
            if (count($res[$c][$e]['nombres']) < 5) $res[$c][$e]['nombres'][] = $f['nombre'];
            if ($d !== '' && hash_equals((string)$f['dispositivo'], (string)$d)) $res[$c][$e]['mio'] = true;
        }
    }
    // Orden fijo (el de COM_REACCIONES), para que los botones no bailen
    $orden = array_flip(COM_REACCIONES);
    foreach ($res as $c => $porEmoji) {
        uksort($porEmoji, fn($a, $b) => ($orden[$a] ?? 99) <=> ($orden[$b] ?? 99));
        $res[$c] = array_values($porEmoji);
    }
    return $res;
}

// Borra un comentario con sus respuestas y las reacciones de todos ellos.
function borrarComentarioYRespuestas($id) {
    $pdo = db();
    $st = $pdo->prepare('SELECT id FROM comentarios WHERE id = ? OR padre_id = ?');
    $st->execute([$id, $id]);
    $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    if (!$ids) return;
    $m = implode(',', array_fill(0, count($ids), '?'));
    $pdo->prepare("DELETE FROM reacciones WHERE comentario_id IN ($m)")->execute($ids);
    $pdo->prepare("DELETE FROM comentarios WHERE id IN ($m)")->execute($ids);
}

function filaComentario(array $f, $d, array $reac = []) {
    return [
        'id'     => intval($f['id']),
        'padre'  => isset($f['padre_id']) && $f['padre_id'] !== null ? intval($f['padre_id']) : null,
        'reacciones' => $reac[intval($f['id'])] ?? [],
        'nombre' => $f['nombre'],
        'texto'  => $f['texto'],
        'escena' => $f['escena_idx'] === null ? null
            : ['idx' => intval($f['escena_idx']), 'titulo' => $f['escena_titulo'], 't' => intval($f['escena_t'])],
        'creado' => intval($f['creado']),
        'mio'    => $d !== '' && hash_equals((string)$f['dispositivo'], (string)$d),
    ];
}
