<?php
// LOGIN
if ($method === 'GET' && $action === 'login') {
    $pass = $_GET['pass'] ?? '';
    $rol = getRol($pass);
    if ($rol) {
        if (strpos($rol, 'compartir-lista:') === 0) {   // selección: varios fragmentos con un PIN
            $pin = substr($rol, strlen('compartir-lista:'));
            foreach (leerJSON(FILE_COMPARTIR) as $e) {
                if ((string)$e['pin'] !== $pin) continue;
                $items = itemsSeleccion($e['items'] ?? []);
                if (!$items) responder(false, null, 'Los vídeos de esta selección ya no existen');
                $ids = array_values(array_unique(array_column($items, 'caseroId')));
                responder(true, [
                    'rol'   => 'compartir-lista',
                    'lista' => ['titulo' => (string)($e['titulo'] ?? ''), 'items' => $items],
                    'token' => firmarToken(['r' => 'compartir', 'c' => null, 'l' => $ids], 86400),
                ]);
            }
            responder(false, null, 'Contrasena incorrecta');
        }
        $r = $rol; $c = null;
        if (strpos($rol, 'compartir:') === 0) { $r = 'compartir'; $c = intval(explode(':', $rol)[1]); }
        responder(true, ['rol' => $rol, 'token' => firmarToken(['r' => $r, 'c' => $c], 86400)]);
    }
    responder(false, null, 'Contrasena incorrecta');
}
