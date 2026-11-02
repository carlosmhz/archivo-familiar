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
                    'token' => firmarToken(['r' => 'compartir', 'c' => null, 'l' => $ids, 'w' => ventanasDeItems($items)], 86400),
                ]);
            }
            responder(false, null, 'Contrasena incorrecta');
        }
        $r = $rol; $c = null;
        $extra = [];
        if (strpos($rol, 'compartir:') === 0) {
            $partes = explode(':', $rol);
            $r = 'compartir'; $c = intval($partes[1]);
            $items = itemsSeleccion([['caseroId' => $c, 'escenaIdx' => intval($partes[2] ?? -1)]]);
            if ($items) $extra['w'] = ventanasDeItems($items);
        }
        responder(true, ['rol' => $rol, 'token' => firmarToken(['r' => $r, 'c' => $c] + $extra, 86400)]);
    }
    responder(false, null, 'Contrasena incorrecta');
}
