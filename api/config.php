<?php

declare(strict_types=1);

/*
 * Resrva is designed for an XAMPP classroom/demo environment.
 * Copy config.local.php beside this file if a machine needs different DB details.
 */
$localConfig = __DIR__ . '/config.local.php';

if (file_exists($localConfig)) {
    return require $localConfig;
}

return [
    'app_name' => 'Resrva',
    'timezone' => 'Australia/Sydney',
    'session_name' => 'RESRVA_MANAGER',
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'database' => 'resrva',
        'username' => 'root',
        'password' => '',
        'charset' => 'utf8mb4',
    ],
    'cors_allowed_origins' => [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost',
        'http://127.0.0.1',
    ],
];
