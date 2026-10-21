<?php
/**
 * Configuration of the self-hosted API.
 *
 * Copy this file OUTSIDE the document root (the install script puts it in
 * /home/cphagro/.eval-api/config.php) and fill in the values. The API looks
 * for it there first, then next to api.php.
 *
 * Never commit the real file.
 */
return [
    'dsn'      => 'pgsql:host=127.0.0.1;port=5432;dbname=cphagro_evalsys',
    'user'     => 'evalsys',
    'password' => 'CHANGE-ME',

    // The API runs as this role so that PostgreSQL enforces Row Level
    // Security. The role must be a member of it (the install script grants it).
    'app_role' => 'app_api',

    // HMAC key used to sign the session tokens. Generate with:
    //   php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
    'secret'   => 'CHANGE-ME-32-BYTES-HEX',
];
