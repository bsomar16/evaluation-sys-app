<?php
declare(strict_types=1);

/**
 * PostgREST-compatible API for the CPH Evaluation System.
 *
 * The frontend keeps using @supabase/supabase-js unchanged; only
 * VITE_SUPABASE_URL points at this endpoint instead of *.supabase.co.
 * Implemented subset (derived from the real usage of the app):
 *
 *   GET    /rest/v1/<table>    select, filters, order, limit, offset, embeds
 *   POST   /rest/v1/<table>    insert (single or bulk), upsert
 *   PATCH  /rest/v1/<table>    update
 *   DELETE /rest/v1/<table>    delete
 *   POST   /rest/v1/rpc/<fn>   hash_password, verify_password,
 *                              create_user_with_password, update_user_password,
 *                              app_login
 *
 * Filters: eq neq gt gte lt lte like ilike is in match not
 * Row Level Security is enforced by PostgreSQL: the session token is
 * verified here and exposed to the policies through the app.* GUCs.
 */

mb_internal_encoding('UTF-8');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// ---------------------------------------------------------------- helpers ---

function fail(int $status, string $code, string $message, ?string $details = null, ?string $hint = null): never
{
    http_response_code($status);
    echo json_encode([
        'code'    => $code,
        'details' => $details ?? '',
        'hint'    => $hint ?? '',
        'message' => $message,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function api_config(): array
{
    $candidates = [
        getenv('EVAL_API_CONFIG') ?: null,
        dirname(__DIR__, 3) . '/.eval-api/config.php',
        __DIR__ . '/config.php',
    ];
    foreach ($candidates as $file) {
        if ($file && is_file($file)) {
            $cfg = require $file;
            if (is_array($cfg) && !empty($cfg['dsn'])) {
                return $cfg;
            }
        }
    }
    fail(500, 'config_missing', 'API configuration file not found.');
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $cfg = api_config();
    try {
        $pdo = new PDO($cfg['dsn'], $cfg['user'] ?? null, $cfg['password'] ?? null, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
        if (!empty($cfg['app_role'])) {
            $pdo->exec('SET ROLE ' . quote_ident($cfg['app_role']));
        }
    } catch (Throwable $e) {
        fail(503, 'db_unavailable', 'Database connection failed.', $e->getMessage());
    }
    return $pdo;
}

function quote_ident(string $name): string
{
    return '"' . str_replace('"', '""', $name) . '"';
}

/** Split a comma separated list, ignoring commas inside parentheses. */
function split_top(string $s): array
{
    $parts = [];
    $buf = '';
    $depth = 0;
    $len = strlen($s);
    for ($i = 0; $i < $len; $i++) {
        $ch = $s[$i];
        if ($ch === '(') { $depth++; $buf .= $ch; continue; }
        if ($ch === ')') { $depth--; $buf .= $ch; continue; }
        if ($ch === ',' && $depth === 0) { $parts[] = trim($buf); $buf = ''; continue; }
        $buf .= $ch;
    }
    $parts[] = trim($buf);
    return $parts;
}

// ------------------------------------------------------- schema discovery ---

function table_columns(string $table): array
{
    static $cache = [];
    if (isset($cache[$table])) {
        return $cache[$table];
    }
    $st = db()->prepare(
        "SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = :t
          ORDER BY ordinal_position"
    );
    $st->execute([':t' => $table]);
    $cols = array_column($st->fetchAll(), 'column_name');
    if (!$cols) {
        fail(404, 'PGRST205', "Table not found in the schema cache: public.$table");
    }
    $cache[$table] = $cols;
    return $cols;
}

/** Column name => underlying type name (jsonb, _text, bool, numeric, ...). */
function column_types(string $table): array
{
    static $cache = [];
    if (isset($cache[$table])) {
        return $cache[$table];
    }
    $st = db()->prepare(
        "SELECT column_name, udt_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = :t"
    );
    $st->execute([':t' => $table]);
    $map = [];
    foreach ($st->fetchAll() as $r) {
        $map[$r['column_name']] = $r['udt_name'];
    }
    $cache[$table] = $map;
    return $map;
}

/** Parses a PostgreSQL array literal ({a,b} / {"a b",c} / {}) into a PHP array. */
function pg_array_parse(string $literal): array
{
    $s = trim($literal);
    if ($s === '' || $s === '{}') {
        return [];
    }
    if ($s[0] !== '{') {
        return [];
    }
    $out = [];
    $cur = '';
    $quoted = false;
    $inQuotes = false;
    $len = strlen($s);
    for ($i = 1; $i < $len; $i++) {
        $ch = $s[$i];
        if ($inQuotes) {
            if ($ch === '\\' && $i + 1 < $len) {
                $cur .= $s[++$i];
            } elseif ($ch === '"') {
                $inQuotes = false;
            } else {
                $cur .= $ch;
            }
            continue;
        }
        if ($ch === '"') {
            $inQuotes = true;
            $quoted = true;
            continue;
        }
        if ($ch === ',' || $ch === '}') {
            $out[] = (!$quoted && strtoupper($cur) === 'NULL') ? null : $cur;
            $cur = '';
            $quoted = false;
            if ($ch === '}') {
                break;
            }
            continue;
        }
        $cur .= $ch;
    }
    return $out;
}

/**
 * PostgREST returns jsonb, arrays, booleans and numbers as JSON values. PDO
 * hands all of them over as strings, which breaks the client: an empty jsonb
 * array would arrive as the string "[]" and .forEach would not exist.
 */
function cast_value($v, string $udt)
{
    if ($v === null || !is_string($v)) {
        return $v;
    }
    switch ($udt) {
        case 'json':
        case 'jsonb':
            $decoded = json_decode($v, true);
            if ($decoded === null && strtolower(trim($v)) !== 'null') {
                return $v;
            }
            return $decoded;
        case 'bool':
            return $v === 't' || $v === 'true' || $v === '1';
        case 'int2':
        case 'int4':
        case 'int8':
            return (int) $v;
        case 'float4':
        case 'float8':
        case 'numeric':
            return (float) $v;
    }
    if (str_starts_with($udt, '_')) {
        return pg_array_parse($v);
    }
    return $v;
}

function cast_row(array $row, string $table): array
{
    $types = column_types($table);
    foreach ($row as $k => $v) {
        if (isset($types[$k])) {
            $row[$k] = cast_value($v, $types[$k]);
        }
    }
    return $row;
}

function cast_rows(array $rows, string $table): array
{
    foreach ($rows as $i => $r) {
        if (is_array($r)) {
            $rows[$i] = cast_row($r, $table);
        }
    }
    return $rows;
}

/** Foreign keys of the public schema: [table][column] => [foreign_table, foreign_column] */
function foreign_keys(): array
{
    static $map = null;
    if ($map !== null) {
        return $map;
    }
    $map = [];
    $rows = db()->query(
        "SELECT tc.table_name, kcu.column_name,
                ccu.table_name AS ftable, ccu.column_name AS fcolumn
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON kcu.constraint_name = tc.constraint_name
            AND kcu.constraint_schema = tc.constraint_schema
           JOIN information_schema.constraint_column_usage ccu
             ON ccu.constraint_name = tc.constraint_name
            AND ccu.constraint_schema = tc.constraint_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = 'public'"
    )->fetchAll();
    foreach ($rows as $r) {
        $map[$r['table_name']][$r['column_name']] = [$r['ftable'], $r['fcolumn']];
    }
    return $map;
}

/** Inverse side: [referenced_table][referencing_table] => [fk_column, referenced_column] */
function reverse_foreign_keys(): array
{
    $rev = [];
    foreach (foreign_keys() as $table => $cols) {
        foreach ($cols as $col => $ft) {
            $rev[$ft[0]][$table] = [$col, $ft[1]];
        }
    }
    return $rev;
}

// -------------------------------------------------------------- session ----

function b64url_decode(string $s): string
{
    $s = strtr($s, '-_', '+/');
    return base64_decode($s . str_repeat('=', (4 - strlen($s) % 4) % 4));
}

function b64url_encode(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function sign_token(array $payload, string $secret): string
{
    $body = b64url_encode(json_encode($payload, JSON_UNESCAPED_UNICODE));
    return $body . '.' . hash_hmac('sha256', $body, $secret);
}

function verify_token(string $token, string $secret): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 2) {
        return null;
    }
    [$body, $sig] = $parts;
    if (!hash_equals(hash_hmac('sha256', $body, $secret), $sig)) {
        return null;
    }
    $payload = json_decode(b64url_decode($body), true);
    if (!is_array($payload)) {
        return null;
    }
    if (isset($payload['exp']) && (int) $payload['exp'] < time()) {
        return null;
    }
    return $payload;
}

/**
 * Reads the session token and exposes the identity to PostgreSQL so that the
 * Row Level Security policies can filter on it.
 */
function apply_session(): void
{
    $cfg = api_config();
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    $token = '';
    if (preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
        $token = trim($m[1]);
    }
    $payload = $token !== '' ? verify_token($token, (string) $cfg['secret']) : null;

    $pdo = db();
    $pdo->exec('SET LOCAL app.user_id = ' . $pdo->quote($payload['uid'] ?? ''));
    $pdo->exec('SET LOCAL app.role_id = ' . $pdo->quote($payload['rid'] ?? ''));
    $pdo->exec('SET LOCAL app.branch_id = ' . $pdo->quote($payload['bid'] ?? ''));
    $pdo->exec('SET LOCAL app.is_admin = ' . ($payload && !empty($payload['adm']) ? "'1'" : "'0'"));
    $pdo->exec('SET LOCAL app.email = ' . $pdo->quote($payload['eml'] ?? ''));
}

// --------------------------------------------------------------- filters ---

function build_where(array $query, array $columns): array
{
    $reserved = ['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'apikey', 'apikey_'];
    $where = [];
    $params = [];
    $i = 0;

    foreach ($query as $col => $raw) {
        if (in_array($col, $reserved, true)) {
            continue;
        }
        if (!in_array($col, $columns, true)) {
            fail(400, 'PGRST100', "Unknown column: $col");
        }
        $raw = (string) $raw;
        $negate = false;
        $op = 'eq';
        $value = $raw;

        if (str_starts_with($raw, 'not.')) {
            $negate = true;
            $raw = substr($raw, 4);
        }
        if (preg_match('/^([a-z]+)\.(.*)$/s', $raw, $m)) {
            $candidate = strtolower($m[1]);
            if (in_array($candidate, ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'match'], true)) {
                $op = $candidate;
                $value = $m[2];
            }
        }

        $i++;
        $ph = ":f$i";
        $ident = quote_ident($col);

        switch ($op) {
            case 'eq':
                if (strtolower($value) === 'null') {
                    $where[] = ($negate ? "$ident IS NOT NULL" : "$ident IS NULL");
                    break;
                }
                $where[] = ($negate ? "$ident <> $ph" : "$ident = $ph");
                $params[ltrim($ph, ':')] = $value;
                break;

            case 'neq':
                $where[] = ($negate ? "$ident = $ph" : "$ident <> $ph");
                $params[ltrim($ph, ':')] = $value;
                break;

            case 'gt':  $where[] = ($negate ? "$ident <= $ph" : "$ident > $ph");  $params[ltrim($ph, ':')] = $value; break;
            case 'gte': $where[] = ($negate ? "$ident < $ph"  : "$ident >= $ph"); $params[ltrim($ph, ':')] = $value; break;
            case 'lt':  $where[] = ($negate ? "$ident >= $ph" : "$ident < $ph");  $params[ltrim($ph, ':')] = $value; break;
            case 'lte': $where[] = ($negate ? "$ident > $ph"  : "$ident <= $ph"); $params[ltrim($ph, ':')] = $value; break;

            case 'like':
                $where[] = ($negate ? "$ident NOT LIKE $ph" : "$ident LIKE $ph");
                $params[ltrim($ph, ':')] = str_replace('*', '%', $value);
                break;

            case 'ilike':
                $where[] = ($negate ? "$ident NOT ILIKE $ph" : "$ident ILIKE $ph");
                $params[ltrim($ph, ':')] = str_replace('*', '%', $value);
                break;

            case 'is':
                $upper = strtoupper($value);
                if ($upper === 'NULL') {
                    $where[] = ($negate ? "$ident IS NOT NULL" : "$ident IS NULL");
                } elseif ($upper === 'TRUE' || $upper === 'FALSE') {
                    $where[] = ($negate ? "$ident IS NOT " : "$ident IS ") . ($upper === 'TRUE' ? 'TRUE' : 'FALSE');
                } else {
                    fail(400, 'PGRST100', "Unsupported is operator: $value");
                }
                break;

            case 'in':
                $list = trim($value, '()');
                $items = $list === '' ? [] : array_map('trim', explode(',', $list));
                if (!$items) {
                    $where[] = '1 = 0';
                    break;
                }
                $phs = [];
                foreach ($items as $n => $item) {
                    $p = "{$ph}_$n";
                    $phs[] = $p;
                    $params[ltrim($p, ':')] = $item;
                }
                $where[] = ($negate ? "$ident NOT IN (" : "$ident IN (") . implode(', ', $phs) . ')';
                break;

            case 'match':
                $where[] = ($negate ? "NOT (" : '(') . "$ident @@ websearch_to_tsquery('simple', $ph))";
                $params[ltrim($ph, ':')] = $value;
                break;
        }
    }

    return [$where, $params];
}

// ---------------------------------------------------------------- select ---

/**
 * Turns a PostgREST select string into [select_sql, group_by_sql, embeds].
 * $embeds is a list of ['alias' => ?string, 'table' => string, 'columns' => string].
 */
function parse_select(string $select, string $table, array $columns): array
{
    $select = trim($select);
    if ($select === '' || $select === '*') {
        return ['*', '', []];
    }

    $items = split_top($select);
    $sqlParts = [];
    $groupCols = [];
    $embeds = [];
    $hasAggregate = false;

    foreach ($items as $item) {
        if ($item === '') {
            continue;
        }

        // Aggregate: COUNT(*) as count, AVG(score) as avg_score
        if (preg_match('/^(count|sum|avg|min|max)\s*\(\s*(\*|[A-Za-z0-9_]+)\s*\)(?:\s+as\s+([A-Za-z0-9_]+))?$/i', $item, $m)) {
            $fn = strtolower($m[1]);
            $arg = $m[2] === '*' ? '*' : (in_array($m[2], $columns, true) ? quote_ident($m[2]) : null);
            if ($arg === null) {
                fail(400, 'PGRST100', "Unknown column in aggregate: {$m[2]}");
            }
            $hasAggregate = true;
            $alias = $m[3] ?? ($fn . '_' . ($m[2] === '*' ? 'all' : $m[2]));
            $sqlParts[] = "$fn($arg) AS " . quote_ident($alias);
            continue;
        }

        // Embedded resource:  branches(name)  or  parent:parent_role_id(name, code)
        if (preg_match('/^([A-Za-z0-9_]+(?::[A-Za-z0-9_]+)?)\s*\((.*)\)$/s', $item, $m)) {
            $rel = $m[1];
            $inner = trim($m[2]);
            $alias = null;
            $fkCol = $rel;
            if (str_contains($rel, ':')) {
                [$alias, $fkCol] = explode(':', $rel, 2);
            }

            $fks = foreign_keys();
            $rev = reverse_foreign_keys();
            $target = null;
            $mode = 'many_to_one';
            $localCol = null;
            $remoteCol = null;

            if (isset($fks[$table][$fkCol])) {
                // FK lives on the queried table -> many-to-one
                [$target, $remoteCol] = $fks[$table][$fkCol];
                $localCol = $fkCol;
                $mode = 'many_to_one';
            } elseif (isset($rev[$table][$fkCol])) {
                // FK lives on the other table -> one-to-many
                [$localCol, $remoteCol] = $rev[$table][$fkCol];
                $target = $fkCol;
                $mode = 'one_to_many';
            } else {
                // The embed may name the table the foreign key points to:
                // branches(name) on the users table is the branch of that user.
                $found = false;
                foreach (($fks[$table] ?? []) as $col => $ft) {
                    if ($ft[0] === $fkCol) {
                        $localCol = $col;
                        $target = $fkCol;
                        $remoteCol = $ft[1];
                        $mode = 'many_to_one';
                        $found = true;
                        break;
                    }
                }
                if (!$found) {
                    fail(400, 'PGRST200', "Could not find a relationship between '$table' and '$fkCol'.");
                }
            }

            $embeds[] = [
                'alias'   => $alias,
                'table'   => $target,
                'columns' => $inner === '*' ? '*' : $inner,
                'mode'    => $mode,
                'local'   => $localCol,
                'remote'  => $remoteCol,
            ];
            continue;
        }

        // Plain column, optionally aliased
        if (preg_match('/^([A-Za-z0-9_]+)(?:\s+as\s+([A-Za-z0-9_]+))?$/i', $item, $m)) {
            $col = $m[1];
            if (!in_array($col, $columns, true)) {
                fail(400, 'PGRST100', "Unknown column: $col");
            }
            $alias = $m[2] ?? null;
            $sqlParts[] = quote_ident($col) . ($alias ? ' AS ' . quote_ident($alias) : '');
            $groupCols[] = quote_ident($col);
            continue;
        }

        fail(400, 'PGRST100', "Unsupported select expression: $item");
    }

    $groupBy = ($hasAggregate && $groupCols) ? ' GROUP BY ' . implode(', ', $groupCols) : '';
    return [implode(', ', $sqlParts), $groupBy, $embeds];
}

function parse_order(string $order, array $columns): string
{
    if (trim($order) === '') {
        return '';
    }
    $parts = [];
    foreach (explode(',', $order) as $chunk) {
        $chunk = trim($chunk);
        if ($chunk === '') {
            continue;
        }
        $bits = explode('.', $chunk);
        $col = $bits[0];
        if (!in_array($col, $columns, true)) {
            fail(400, 'PGRST100', "Unknown order column: $col");
        }
        $dir = 'ASC';
        $nulls = '';
        foreach (array_slice($bits, 1) as $opt) {
            $opt = strtolower($opt);
            if ($opt === 'asc' || $opt === 'desc') {
                $dir = strtoupper($opt);
            } elseif ($opt === 'nullsfirst' || $opt === 'nullslast') {
                $nulls = ' NULLS ' . ($opt === 'nullsfirst' ? 'FIRST' : 'LAST');
            }
        }
        $parts[] = quote_ident($col) . ' ' . $dir . $nulls;
    }
    return $parts ? ' ORDER BY ' . implode(', ', $parts) : '';
}

// ---------------------------------------------------------------- embeds ---

function apply_embeds(array $rows, array $embeds): array
{
    foreach ($embeds as $embed) {
        if (!$rows) {
            break;
        }
        $targetCols = table_columns($embed['table']);
        [$selSql, ,] = parse_select($embed['columns'], $embed['table'], $targetCols);
        if ($embed['mode'] === 'many_to_one') {
            $values = [];
            foreach ($rows as $r) {
                $v = $r[$embed['local']] ?? null;
                if ($v !== null) {
                    $values[(string) $v] = $v;
                }
            }
            if (!$values) {
                foreach ($rows as &$r) {
                    $r[$embed['alias'] ?? $embed['table']] = null;
                }
                continue;
            }
            $phs = [];
            $params = [];
            foreach (array_values($values) as $n => $v) {
                $phs[] = ':e' . $n;
                $params['e' . $n] = $v;
            }
            $sql = 'SELECT ' . $selSql . ' FROM public.' . quote_ident($embed['table'])
                 . ' WHERE ' . quote_ident($embed['remote']) . ' IN (' . implode(', ', $phs) . ')';
            $st = db()->prepare($sql);
            $st->execute($params);
            $lookup = [];
            foreach ($st->fetchAll() as $fr) {
                $lookup[(string) $fr[$embed['remote']]] = cast_row($fr, $embed['table']);
            }
            $key = $embed['alias'] ?? $embed['table'];
            foreach ($rows as &$r) {
                $v = $r[$embed['local']] ?? null;
                $r[$key] = ($v !== null && isset($lookup[(string) $v])) ? $lookup[(string) $v] : null;
            }
            unset($r);
        } else {
            // one_to_many: children point back at the parent
            $parentIds = [];
            foreach ($rows as $r) {
                $v = $r[$embed['remote']] ?? null;
                if ($v !== null) {
                    $parentIds[(string) $v] = $v;
                }
            }
            $key = $embed['alias'] ?? $embed['table'];
            if (!$parentIds) {
                foreach ($rows as &$r) {
                    $r[$key] = [];
                }
                unset($r);
                continue;
            }
            $phs = [];
            $params = [];
            foreach (array_values($parentIds) as $n => $v) {
                $phs[] = ':c' . $n;
                $params['c' . $n] = $v;
            }
            $sql = 'SELECT ' . $selSql . ' FROM public.' . quote_ident($embed['table'])
                 . ' WHERE ' . quote_ident($embed['local']) . ' IN (' . implode(', ', $phs) . ')';
            $st = db()->prepare($sql);
            $st->execute($params);
            $group = [];
            foreach ($st->fetchAll() as $cr) {
                $group[(string) $cr[$embed['local']]][] = cast_row($cr, $embed['table']);
            }
            foreach ($rows as &$r) {
                $v = $r[$embed['remote']] ?? null;
                $r[$key] = ($v !== null && isset($group[(string) $v])) ? $group[(string) $v] : [];
            }
            unset($r);
        }
    }
    return $rows;
}

// ------------------------------------------------------------------ CRUD ---

function read_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        fail(400, 'PGRST102', 'Request body is not valid JSON.');
    }
    return $data;
}

function prefers(string $name): bool
{
    $h = $_SERVER['HTTP_PREFER'] ?? '';
    return stripos($h, $name) !== false;
}

function wants_single(): bool
{
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    return stripos($accept, 'application/vnd.pgrst.object+json') !== false;
}

function respond(array $rows, ?int $total = null): void
{
    // The password hash never leaves the server, whatever the query is.
    foreach ($rows as &$row) {
        if (is_array($row) && array_key_exists('password', $row)) {
            unset($row['password']);
        }
    }
    unset($row);
    if (wants_single()) {
        if (count($rows) === 0) {
            fail(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned.');
        }
        if (count($rows) > 1) {
            fail(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned.');
        }
        echo json_encode($rows[0], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return;
    }
    if ($total !== null) {
        $n = count($rows);
        header('Content-Range: 0-' . max($n - 1, 0) . '/' . $total);
    }
    echo json_encode(array_values($rows), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function handle_select(string $table, array $query): void
{
    $columns = table_columns($table);
    [$where, $params] = build_where($query, $columns);
    [$selSql, $groupBy, $embeds] = parse_select((string) ($query['select'] ?? '*'), $table, $columns);
    $order = parse_order((string) ($query['order'] ?? ''), $columns);

    $sql = 'SELECT ' . $selSql . ' FROM public.' . quote_ident($table);
    if ($where) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $sql .= $groupBy . $order;

    $count = (int) ($query['limit'] ?? 0);
    if ($count > 0) {
        $sql .= ' LIMIT ' . $count;
    }
    if (isset($query['offset'])) {
        $sql .= ' OFFSET ' . max(0, (int) $query['offset']);
    }

    $st = db()->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll();
    $rows = apply_embeds($rows, $embeds);
    $rows = cast_rows($rows, $table);

    $total = null;
    if (prefers('count=exact')) {
        $total = count_rows($table, $where, $params, $groupBy);
    }
    respond($rows, $total);
}

function count_rows(string $table, array $where, array $params, string $groupBy): int
{
    $sql = 'SELECT count(*) AS c FROM public.' . quote_ident($table);
    if ($where) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $st = db()->prepare($sql);
    $st->execute($params);
    return (int) $st->fetch()['c'];
}

function handle_insert(string $table, array $query, array $body): void
{
    $columns = table_columns($table);
    $rows = array_is_list($body) ? $body : [$body];
    if (!$rows) {
        fail(400, 'PGRST102', 'No rows to insert.');
    }

    $returning = prefers('return=representation');
    $merge = prefers('resolution=merge-duplicates');
    $onConflict = (string) ($query['on_conflict'] ?? 'id');
    $conflictCols = [];
    foreach (explode(',', $onConflict) as $c) {
        $c = trim($c);
        if (in_array($c, $columns, true)) {
            $conflictCols[] = $c;
        }
    }

    $values = [];
    $params = [];
    $tupleIdx = 0;
    $allCols = [];
    foreach ($rows as $row) {
        foreach (array_keys($row) as $c) {
            if (!in_array($c, $columns, true)) {
                fail(400, 'PGRST204', "Unknown column for table $table: $c");
            }
            $allCols[$c] = true;
        }
        $tupleIdx++;
    }
    $allCols = array_keys($allCols);
    $colList = implode(', ', array_map('quote_ident', $allCols));
    $phs = [];
    foreach ($rows as $i => $row) {
        $rowPhs = [];
        foreach ($allCols as $c) {
            $ph = 'v' . $i . '_' . preg_replace('/[^A-Za-z0-9_]/', '_', $c);
            $rowPhs[] = ':' . $ph;
            $params[$ph] = $row[$c] ?? null;
        }
        $phs[] = '(' . implode(', ', $rowPhs) . ')';
    }

    $sql = 'INSERT INTO public.' . quote_ident($table) . " ($colList) VALUES " . implode(', ', $phs);
    if ($merge && $conflictCols) {
        $updates = [];
        foreach ($allCols as $c) {
            if (in_array($c, $conflictCols, true)) {
                continue;
            }
            $updates[] = quote_ident($c) . ' = EXCLUDED.' . quote_ident($c);
        }
        if ($updates) {
            $sql .= ' ON CONFLICT (' . implode(', ', array_map('quote_ident', $conflictCols)) . ') DO UPDATE SET ' . implode(', ', $updates);
        }
    }
    if ($returning) {
        $sql .= ' RETURNING *';
    }

    $st = db()->prepare($sql);
    try {
        $st->execute($params);
    } catch (PDOException $e) {
        fail(409, '23505', 'Duplicate or conflicting row: ' . $e->getMessage());
    }

    if ($returning) {
        respond(cast_rows($st->fetchAll(), $table));
    } else {
        respond([]);
    }
}

function handle_update(string $table, array $query, array $body): void
{
    $columns = table_columns($table);
    if (!$body) {
        fail(400, 'PGRST102', 'No data to update.');
    }
    $sets = [];
    $params = [];
    foreach ($body as $c => $v) {
        if (!in_array($c, $columns, true)) {
            fail(400, 'PGRST204', "Unknown column for table $table: $c");
        }
        $ph = 's_' . preg_replace('/[^A-Za-z0-9_]/', '_', (string) $c);
        $sets[] = quote_ident((string) $c) . ' = :' . $ph;
        $params[$ph] = $v;
    }
    [$where, $wparams] = build_where($query, $columns);
    $params += $wparams;
    $sql = 'UPDATE public.' . quote_ident($table) . ' SET ' . implode(', ', $sets);
    if ($where) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    if (prefers('return=representation')) {
        $sql .= ' RETURNING *';
    }
    $st = db()->prepare($sql);
    try {
        $st->execute($params);
    } catch (PDOException $e) {
        fail(409, '23505', 'Update failed: ' . $e->getMessage());
    }
    respond(prefers('return=representation') ? cast_rows($st->fetchAll(), $table) : []);
}

function handle_delete(string $table, array $query): void
{
    $columns = table_columns($table);
    [$where, $params] = build_where($query, $columns);
    if (!$where) {
        fail(400, 'PGRST101', 'Delete requires at least one filter.');
    }
    $sql = 'DELETE FROM public.' . quote_ident($table) . ' WHERE ' . implode(' AND ', $where);
    if (prefers('return=representation')) {
        $sql .= ' RETURNING *';
    }
    $st = db()->prepare($sql);
    $st->execute($params);
    respond(prefers('return=representation') ? cast_rows($st->fetchAll(), $table) : []);
}

// ------------------------------------------------------------------- RPC ---

function bcrypt_verify(string $password, string $hash): bool
{
    return password_verify($password, $hash);
}

function pbkdf2_verify(string $password, string $hash): bool
{
    $prefix = '$pbkdf2-sha256$100000$';
    if (!str_starts_with($hash, $prefix)) {
        return false;
    }
    $rest = substr($hash, strlen($prefix));
    $sep = strpos($rest, '$');
    if ($sep === false) {
        return false;
    }
    $salt = base64_decode(strtr(substr($rest, 0, $sep), '-_', '+/'), true);
    $expected = base64_decode(strtr(substr($rest, $sep + 1), '-_', '+/'), true);
    if ($salt === false || $expected === false) {
        return false;
    }
    $derived = hash_pbkdf2('sha256', $password, $salt, 100000, strlen($expected), true);
    return hash_equals($expected, $derived);
}

function verify_password_any(string $password, string $hash): bool
{
    if ($hash === '') {
        return false;
    }
    if (preg_match('/^\$2[aby]\$\d{2}\$/', $hash)) {
        return bcrypt_verify($password, $hash);
    }
    if (str_starts_with($hash, '$pbkdf2-sha256$')) {
        return pbkdf2_verify($password, $hash);
    }
    return hash_equals($hash, $password);
}

function rpc(string $name, array $args): void
{
    $cfg = api_config();

    switch ($name) {
        case 'hash_password':
            $plain = (string) ($args['password'] ?? '');
            if ($plain === '') {
                fail(400, 'PGRST202', 'password is required');
            }
            echo json_encode(password_hash($plain, PASSWORD_BCRYPT, ['cost' => 12]), JSON_UNESCAPED_UNICODE);
            return;

        case 'verify_password':
            $plain = (string) ($args['password'] ?? '');
            $hash = (string) ($args['hash'] ?? '');
            echo json_encode(verify_password_any($plain, $hash), JSON_UNESCAPED_UNICODE);
            return;

        case 'create_user_with_password':
            $email = trim((string) ($args['p_email'] ?? ''));
            $pass = (string) ($args['p_password'] ?? '');
            if ($email === '' || $pass === '') {
                fail(400, 'PGRST202', 'p_email and p_password are required');
            }
            $payload = [
                'email'         => $email,
                'name'          => (string) ($args['p_name'] ?? ''),
                'password'      => password_hash($pass, PASSWORD_BCRYPT, ['cost' => 12]),
                'position'      => $args['p_position'] ?? null,
                'branch_id'     => $args['p_branch_id'] ?? null,
                'department_id' => $args['p_department_id'] ?? null,
                'role_id'       => $args['p_role_id'] ?? null,
                'role'          => $args['p_role'] ?? 'employee',
                'is_active'     => true,
                'archived_at'   => null,
            ];
            $cols = array_keys($payload);
            $phs = [];
            $params = [];
            foreach ($cols as $i => $c) {
                $ph = 'c' . $i;
                $phs[] = ':' . $ph;
                $params[$ph] = $payload[$c];
            }
            $sql = 'INSERT INTO public.users (' . implode(', ', array_map('quote_ident', $cols)) . ')'
                 . ' VALUES (' . implode(', ', $phs) . ') RETURNING *';
            try {
                $st = db()->prepare($sql);
                $st->execute($params);
            } catch (PDOException $e) {
                echo json_encode(['success' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
                return;
            }
            $row = $st->fetch();
            echo json_encode(['success' => true, 'data' => $row ? cast_row($row, 'users') : null], JSON_UNESCAPED_UNICODE);
            return;

        case 'update_user_password':
            $uid = (string) ($args['p_user_id'] ?? '');
            $pass = (string) ($args['p_new_password'] ?? '');
            if ($uid === '' || strlen($pass) < 8) {
                fail(400, 'PGRST202', 'p_user_id and a password of at least 8 characters are required');
            }
            $st = db()->prepare('UPDATE public.users SET password = :h, updated_at = now() WHERE id = :id RETURNING *');
            try {
                $st->execute(['h' => password_hash($pass, PASSWORD_BCRYPT, ['cost' => 12]), 'id' => $uid]);
            } catch (PDOException $e) {
                echo json_encode(['success' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
                return;
            }
            $row = $st->fetch();
            $row = $row ? cast_row($row, 'users') : null;
            echo json_encode($row ? ['success' => true, 'data' => $row] : ['success' => false, 'error' => 'User not found'], JSON_UNESCAPED_UNICODE);
            return;

        case 'app_login':
            // Issues the signed session token used by the RLS policies.
            $email = trim((string) ($args['p_email'] ?? ''));
            $pass = (string) ($args['p_password'] ?? '');
            // The lookup happens before any session exists. The users_login
            // policy accepts the single row whose address matches
            // app.login_email, a transaction scoped value that only this
            // request sets, and only while it sets it.
            db()->exec('SET LOCAL app.login_email = ' . db()->quote($email));
            $st = db()->prepare('SELECT * FROM public.users WHERE lower(email) = lower(:e) LIMIT 1');
            $st->execute([':e' => $email]);
            $user = $st->fetch();
            if (!$user || !verify_password_any($pass, (string) ($user['password'] ?? ''))) {
                echo json_encode(['success' => false, 'error' => 'Identifiants invalides'], JSON_UNESCAPED_UNICODE);
                return;
            }
            // From here on the request is identified as that user.
            db()->exec('SET LOCAL app.login_email = ' . db()->quote(''));
            $isAdmin = false;
            $roleLevel = 99;
            if (!empty($user['role_id'])) {
                $rs = db()->prepare('SELECT level FROM public.roles WHERE id = :r');
                $rs->execute([':r' => $user['role_id']]);
                $role = $rs->fetch();
                if ($role) {
                    $roleLevel = (int) $role['level'];
                    $isAdmin = $roleLevel === 0;
                }
            }
            // The rest of the request runs with the identity of the user.
            db()->exec('SET LOCAL app.user_id = ' . db()->quote((string) $user['id']));
            db()->exec('SET LOCAL app.role_id = ' . db()->quote((string) ($user['role_id'] ?? '')));
            db()->exec('SET LOCAL app.branch_id = ' . db()->quote((string) ($user['branch_id'] ?? '')));
            db()->exec('SET LOCAL app.is_admin = ' . ($isAdmin ? "'1'" : "'0'"));
            db()->exec('SET LOCAL app.email = ' . db()->quote((string) $user['email']));
            $token = sign_token([
                'uid'  => (string) $user['id'],
                'rid'  => (string) ($user['role_id'] ?? ''),
                'bid'  => (string) ($user['branch_id'] ?? ''),
                'eml'  => (string) $user['email'],
                'adm'  => $isAdmin ? 1 : 0,
                'exp'  => time() + 60 * 60 * 12,
            ], (string) $cfg['secret']);
            unset($user['password']);
            $user = cast_row($user, 'users');
            echo json_encode(['success' => true, 'token' => $token, 'user' => $user], JSON_UNESCAPED_UNICODE);
            return;

        default:
            fail(404, 'PGRST202', 'Could not find the function public.' . $name);
    }
}

// ----------------------------------------------------------------- router --

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = preg_replace('#^/rest/v1#', '', $path);
$path = trim($path, '/');

// The base path may be prefixed (e.g. /eval/rest/v1/...) when deployed in a
// sub-directory: strip anything that is not the table/rpc part.
if (preg_match('#(?:^|/)rest/v1/(.+)$#', parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '', $m)) {
    $path = trim($m[1], '/');
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    // One transaction per request: the session GUCs set by apply_session() are
    // transaction-scoped (SET LOCAL) and must survive until the end.
    db()->beginTransaction();
    apply_session();

    if ($path === '' || $path === 'health') {
        $cfg = api_config();
        $ok = true;
        try {
            db()->query('SELECT 1');
        } catch (Throwable $e) {
            $ok = false;
        }
        echo json_encode([
            'status'  => $ok ? 'ok' : 'database_unreachable',
            'service' => 'cph-eval-api',
            'version' => '1.0.0',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (str_starts_with($path, 'rpc/')) {
        if ($method !== 'POST') {
            fail(405, 'PGRST117', 'RPC calls must use POST.');
        }
        rpc(substr($path, 4), read_body());
        exit;
    }

    $table = $path;
    if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $table)) {
        fail(404, 'PGRST205', 'Unknown resource: ' . $table);
    }
    table_columns($table);

    $query = [];
    parse_str($_SERVER['QUERY_STRING'] ?? '', $query);

    switch ($method) {
        case 'GET':
            handle_select($table, $query);
            break;
        case 'POST':
            handle_insert($table, $query, read_body());
            break;
        case 'PATCH':
            handle_update($table, $query, read_body());
            break;
        case 'DELETE':
            handle_delete($table, $query);
            break;
        default:
            fail(405, 'PGRST117', "Method $method not allowed.");
    }
} catch (PDOException $e) {
    fail(500, 'PGRST100', 'Database error: ' . $e->getMessage());
} catch (Throwable $e) {
    fail(500, 'PGRST100', 'Unexpected error: ' . $e->getMessage());
}
