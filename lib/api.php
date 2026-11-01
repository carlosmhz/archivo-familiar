<?php
// API JSON. Punto de entrada público: /api.php (que solo incluye este archivo).
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

require __DIR__ . '/config.php';
require __DIR__ . '/auth.php';
require __DIR__ . '/datos.php';
require __DIR__ . '/sesion.php';

if (bloqueado()) {
    http_response_code(429);
    responder(false, null, 'Demasiados intentos. Espera unos minutos.');
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// Cada archivo trata sus acciones y termina con responder() (que hace exit).
foreach (['login', 'actuaciones', 'caseros', 'miniaturas', 'otp', 'compartir', 'video', 'comentarios'] as $grupo) {
    require __DIR__ . '/acciones/' . $grupo . '.php';
}

responder(false, null, 'Accion no reconocida');
