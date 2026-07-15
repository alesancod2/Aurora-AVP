<?php
/**
 * Proxy PHP para contornar CORS
 * 
 * DEPLOY: Colocar este arquivo em uma hospedagem PHP qualquer
 * (ex: mesmo servidor do aEasy, ou InfinityFree, 000webhost, etc)
 * 
 * Uso: POST para este arquivo com JSON:
 *   { "action": "login", "login": "CPF", "senha": "SENHA" }
 *   { "action": "request", "method": "POST", "endpoint": "/vendas/listagem", "body": "..." }
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

// Preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$BASE_URL = 'https://aeasy.autovaleprevencoes.org';
$COOKIE_FILE = sys_get_temp_dir() . '/aeasy_session_' . md5(__FILE__) . '.txt';

$input = json_decode(file_get_contents('php://input'), true);
if (!$input || !isset($input['action'])) {
    echo json_encode(['error' => 'Body JSON com "action" obrigatorio']);
    exit;
}

$action = $input['action'];

switch ($action) {
    case 'login':
        echo json_encode(doLogin($input));
        break;
    case 'request':
        echo json_encode(doRequest($input));
        break;
    case 'status':
        echo json_encode(['authenticated' => file_exists($COOKIE_FILE), 'cookieFile' => basename($COOKIE_FILE)]);
        break;
    default:
        echo json_encode(['error' => 'action invalida']);
}

function doLogin($input) {
    global $BASE_URL, $COOKIE_FILE;
    
    $login = $input['login'] ?? '03268401503';
    $senha = $input['senha'] ?? 'Ale@2026';

    // 1. GET para obter sessao
    $ch = curl_init("$BASE_URL/conta/login");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIEJAR => $COOKIE_FILE,
        CURLOPT_COOKIEFILE => $COOKIE_FILE,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    curl_exec($ch);
    curl_close($ch);

    // 2. POST login
    $ch = curl_init("$BASE_URL/conta/login");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query([
            'UsuariosLogin' => $login,
            'UsuariosSenha' => $senha,
        ]),
        CURLOPT_COOKIEJAR => $COOKIE_FILE,
        CURLOPT_COOKIEFILE => $COOKIE_FILE,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/x-www-form-urlencoded',
            'X-Requested-With: XMLHttpRequest',
        ],
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $data = json_decode($response, true);
    
    if ($data && isset($data['mensagem']) && strpos($data['mensagem'], 'sucesso') !== false) {
        return ['success' => true, 'mensagem' => $data['mensagem']];
    }

    return ['success' => false, 'error' => $data['mensagem'] ?? 'Login falhou', 'httpCode' => $httpCode];
}

function doRequest($input) {
    global $BASE_URL, $COOKIE_FILE;

    // Se nao tem cookie, fazer login
    if (!file_exists($COOKIE_FILE) || filesize($COOKIE_FILE) < 50) {
        $loginResult = doLogin([]);
        if (!$loginResult['success']) {
            return ['error' => 'SESSION_EXPIRED', 'loginResult' => $loginResult];
        }
    }

    $method = strtoupper($input['method'] ?? 'GET');
    $endpoint = $input['endpoint'] ?? '/';
    $body = $input['body'] ?? '';
    $url = $BASE_URL . $endpoint;

    $ch = curl_init($url);
    $headers = [
        'X-Requested-With: XMLHttpRequest',
    ];

    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIEJAR => $COOKIE_FILE,
        CURLOPT_COOKIEFILE => $COOKIE_FILE,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT => 120,
    ];

    if ($method === 'POST') {
        $opts[CURLOPT_POST] = true;
        $opts[CURLOPT_POSTFIELDS] = $body;
        $headers[] = 'Content-Type: application/x-www-form-urlencoded';
    }

    $opts[CURLOPT_HTTPHEADER] = $headers;
    curl_setopt_array($ch, $opts);

    $start = microtime(true);
    $response = curl_exec($ch);
    $elapsed = round((microtime(true) - $start) * 1000);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    // Redirect = sessao expirada
    if ($httpCode === 302 || $httpCode === 301) {
        @unlink($COOKIE_FILE);
        // Re-login e retry
        $loginResult = doLogin([]);
        if ($loginResult['success']) {
            return doRequest($input); // Retry
        }
        return ['error' => 'SESSION_EXPIRED'];
    }

    // Parsear JSON
    $data = null;
    $jsonStart = strpos($response, '{');
    if ($jsonStart !== false) {
        $data = json_decode(substr($response, $jsonStart), true);
    }
    if (!$data) {
        $data = ['raw' => substr($response, 0, 2000)];
    }

    return [
        'status' => $httpCode,
        'data' => $data,
        'elapsed' => $elapsed,
        'endpoint' => $endpoint,
    ];
}
