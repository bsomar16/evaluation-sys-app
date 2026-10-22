# Deploying on cPanel (`cph-agro.com`)

Production instance: **https://eval.cph-agro.com**

## What is in place

| | |
|---|---|
| Hosting | cPanel account `cphagro`, origin `65.181.113.41`, behind Cloudflare |
| Document root | `/home/cphagro/eval.cph-agro.com` |
| API | `public/rest/v1/api.php` (PHP 8.3, `pdo_pgsql`) |
| Database | PostgreSQL 13.23, `cphagro_evalsys`, role `cphagro_evalcph` |
| API credentials | `/home/cphagro/.eval-api/config.php` (mode 600, outside the docroot) |
| Certificate | Let's Encrypt (acme.sh), installed through `uapi SSL install_ssl` |
| Old `/eval/` deployment | retired, backed up under `/home/cphagro/backups/` |

## Files of this directory

| File | Role |
|---|---|
| `sql/00_bootstrap.sql` | `auth` schema stand-in, `auth.role()` for the upstream migrations |
| `sql/01_disable_rls.sql` | lifts the policies so the installer can be re-run |
| `sql/05_missing_tables.sql` | the three tables and the columns that no upstream migration creates |
| `sql/07_convergence.sql` | reconciles the two conflicting `evaluation_periods` migrations |
| `sql/12_session_helpers.sql` | `app_*()` helpers used by the policies |
| `sql/10_rls_policies.sql` | authoritative Row Level Security |
| `sql/install.sh` | applies everything, in order, idempotently |

## Rebuilding the stack

### 1. Database

cPanel > PostgreSQL Databases: create `evalsys` (which becomes `cphagro_evalsys`),
add a user with ALL PRIVILEGES.

### 2. API configuration

```php
<?php
return [
    'dsn'      => 'pgsql:host=127.0.0.1;port=5432;dbname=cphagro_evalsys',
    'user'     => 'cphagro_evalcph',
    'password' => '...',
    'app_role' => '',
    'secret'   => '<64 hex chars>',
];
```

Store it at `/home/cphagro/.eval-api/config.php`, `chmod 600`.

### 3. Schema and policies

```sh
PGHOST=127.0.0.1 PGUSER=cphagro_evalcph PGDATABASE=cphagro_evalsys PGPASSWORD=... \
  ./deploy/sql/install.sh
```

The installer is idempotent. It applies, in order: `00_bootstrap`, `01_disable_rls`,
`supabase/init-schema.sql` (with the pgcrypto helpers cut out), `05_missing_tables`,
the migrations, `07_convergence`, `12_session_helpers`, `10_rls_policies`.

Four upstream files are deliberately never applied:

- `20260525_create_execute_sql_rpc.sql` - grants DDL to `anon`
- `20260526_add_password_hashing.sql` - needs `pgcrypto`, absent on this server
- `20260611_seed_evaluations_with_scores.sql` - invalid SQL, demo data only
- `20260921_enable_rls_all_tables.sql` - needs `pgcrypto` and `CREATE ROLE`

### 4. Frontend

```sh
VITE_SUPABASE_URL=https://eval.cph-agro.com APP_BASE=/ npm run build
```

Upload `dist/` except `dist/.htaccess` and `dist/rest/v1/api.php`: the copy on the
server already carries the cPanel PHP block and the routing rules.

### 5. TLS

The certificate is a Let's Encrypt one obtained with acme.sh over HTTP-01
(the `/.well-known/acme-challenge/` path is exempt from Cloudflare's HTTPS
redirect, so validation succeeds through the proxy):

```sh
./acme.sh --issue --server letsencrypt --webroot /home/cphagro/eval.cph-agro.com -d eval.cph-agro.com
./acme.sh --install-cert -d eval.cph-agro.com \
  --key-file /home/cphagro/ssl/keys/eval.cph-agro.com.key \
  --fullchain-file /home/cphagro/ssl/certs/eval.cph-agro.com.crt \
  --ca-file /home/cphagro/ssl/certs/eval.cph-agro.com.ca-bundle \
  --reloadcmd /home/cphagro/reinstall-cert.sh
```

`reinstall-cert.sh` calls `uapi SSL install_ssl` with `@file` arguments (a value
starting with `@` is read from disk by uapi; passing the PEM inline truncates it).
A cron entry runs `acme.sh --cron` every day at 03:17 and renews automatically.

## Verifying

```sh
curl -s https://eval.cph-agro.com/rest/v1/health
# {"status":"ok","service":"cph-eval-api","version":"1.0.0"}

curl -s -X POST https://eval.cph-agro.com/rest/v1/rpc/app_login \
  -H 'Content-Type: application/json' \
  -d '{"p_email":"admin@company.com","p_password":"..."}'
# {"success":true,"token":"...","user":{...}}
```

The functional suite lives at `deploy/test/api_suite.sh` (run it on the host,
it exercises filters, embeds, aggregates, writes, RLS and the SPA routes).

## How the Supabase client talks to PostgreSQL

`@supabase/supabase-js` writes PostgREST queries. `public/rest/v1/api.php`
implements that surface on top of `pdo_pgsql`: filters (`eq`, `neq`, `gt`,
`gte`, `lt`, `lte`, `like`, `ilike`, `in`, `is`, `match`), `order`, `limit`,
`offset`, `select` with aliases, embedded resources, aggregates, `single` /
`maybeSingle`, upserts, and the RPCs (`hash_password`, `verify_password`,
`create_user_with_password`, `update_user_password`, `app_login`).

Authentication is handled by `app_login`: the password never leaves the
server, and the RPC returns an HMAC-signed session token that the browser
sends as `Authorization: Bearer`. The API turns that token into
transaction-scoped `app.*` GUCs, which the RLS policies read.

## Constraints worth remembering

- `pgcrypto` is not installed: the password functions are implemented in PHP.
- The database role has no `CREATEROLE`: policies are `TO PUBLIC`, and the
  outer boundary is `pg_hba.conf` (only the API user can connect).
  `FORCE ROW LEVEL SECURITY` keeps the owner subject to the policies.
- Browser-side DDL is disabled; schema changes go through `deploy/sql/`.
- The `users.password` column is stripped from every API response.

## The production data

The database holds the data of the hosted Supabase project, imported row by
row on 22 October 2026 (the demo content was replaced, not merged):

| table | rows | table | rows |
| --- | --- | --- | --- |
| users | 57 | evaluation_criteria | 20 |
| roles | 8 | calculation_rules | 29 |
| branches | 8 | evaluation_periods | 7 |
| departments | 27 | evaluation_period_intervals | 7 |
| evaluations | 12 | rejection_reasons | 1 |
| training_requests | 0 | reports / app_settings | 0 |

The import preserved the identifiers, the timestamps and the password
hashes, so every account keeps its password. Two formats are in use and both
are verified by the API: `bcrypt` (`$2y$`, created by the app) and
`$pbkdf2-sha256$100000$` (Supabase). A user whose hash is empty cannot log
in - those are the accounts flagged `is_agent_without_account`.

Two schema details came out of the production data and are worth keeping in
mind:

- `users.role` holds `'employee'` for every account, the real role being
  `users.role_id`. The application reads the role from `roles.name` and
  `roles.permissions`, which is why the session is built that way.
- The role hierarchy uses the levels 0 (Directeur General / Admin), 1
  (Directeur Executif), 2 (Directeur / Gerant / Assistant), 3 (Responsable)
  and 4 (Agent). `app_is_privileged()` therefore means level <= 3 and
  `app_is_hr()` level <= 1.
- `evaluations.score`, `evaluation_criteria.weight` and
  `calculation_rules.max_points` are `numeric(5,2)`: a score of 100 does not
  fit in `numeric(3,1)`.

### Re-importing from Supabase

The hosted project still answers the PostgREST API with the `anon` key for
the tables that had no RLS upstream, which is enough to export the data.
The `service_role` key has been rotated and is no longer usable.

```
GET https://<project>.supabase.co/rest/v1/<table>?select=*&limit=1000&offset=N
```

The rows are then inserted in foreign key order (branches, departments,
roles, users, calculation_rules, evaluation_criteria, evaluation_periods,
evaluation_period_intervals, evaluations, ...) with row level security
lifted for the transaction. Keep the column intersection with
`src/lib/expected-db-schema.ts`: the hosted table `evaluation_criteria` still
carries three legacy columns (`role_id`, `branch_id`, `department_id`) that
the current schema does not have.
