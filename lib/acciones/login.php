<?php
// LOGIN
if ($method === 'GET' && $action === 'login') {
    $pass = $_GET['pass'] ?? '';
    $rol = getRol($pass);
    if ($rol) {
        $r = $rol; $c = null;
        if (strpos($rol, 'compartir:') === 0) { $r = 'compartir'; $c = intval(explode(':', $rol)[1]); }
        responder(true, ['rol' => $rol, 'token' => firmarToken(['r' => $r, 'c' => $c], 86400)]);
    }
    responder(false, null, 'Contrasena incorrecta');
}
