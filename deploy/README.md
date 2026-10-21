# Deploying on cPanel (`cph-agro.com`)

Target: Apache + PHP 8.3 + PostgreSQL 13.23, all on the same shared hosting
account. Nothing in this stack needs Node, Docker or an external service at
runtime - GitHub and Supabase are only used to build the frontend.

```
https://eval.cph-agro.com/            -> the SPA (static files in dist/)
https://eval.cph-agro.com/rest/v1/    -> the API (public/rest/v1/api.php)
https://eval.cph-agro.com/rest/v1/health
```

## What is already in place

| | |
|---|---|
| `/home/cphagro/eval.cph-agro.com/` | document root, the built SPA and the API are deployed |
| `/home/cphagro/.eval-api/config.php` | API configuration (database credentials, HMAC secret) - outside the document root, mode 600 |
| `deploy/sql/install.sh` | installs the schema and the Row Level Security policies |
| `deploy/install-api.sh` | rebuilds and redeploys the SPA + API |

## Step 1 - create the subdomain (cPanel, 2 minutes)

1. cPanel -> **Domains** -> **Subdomains** -> **Create a New Subdomain**
2. Domain: `cph-agro.com`, Subdomain: `eval`
3. Document Root: `/home/cphagro/eval.cph-agro.com` (the folder already exists)
4. **Create**

1. Cloudflare -> **DNS** -> **Records** -> **Add record**
2. Type `A`, Name `eval`, IPv4 address `65.181.113.41`
3. Proxy status **Proxied** (orange cloud) - Cloudflare's Universal SSL then
   covers `eval.cph-agro.com` (`*.cph-agro.com`) and the site is served over
   HTTPS without having to run AutoSSL.
4. **Save**

1. cPanel -> **PostgreSQL Databases** -> **Create New Database**
2. Name: `evalsys` -> the database is called `cphagro_evalsys`
3. **Add User to Database**: user `evalsys`, a strong generated password,
   **ALL PRIVILEGES** -> **Add**
4. Keep the password: it goes into `/home/cphagro/.eval-api/config.php`.

## Step 4 - install the schema and the policies

From the repository, with the database password in the environment:

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=evalsys PGDATABASE=cphagro_evalsys \
PGPASSWORD='<the password from step 3>' ./deploy/sql/install.sh
```

The script applies the upstream migrations (skipping
`20260525_create_execute_sql_rpc.sql`, which grants DDL to `anon`) and then
`deploy/sql/10_rls_policies.sql`, which replaces every policy with the
session based ones:

- `admin` (role level 0) and `RH` (level 1) see everything,
- a `Manager` (level 2) sees their own branch only,
- an employee sees only their own evaluations and requests,
- nobody can grant themselves a role (a trigger rejects it).

## Step 5 - point the frontend at the API

`.env.local` (never committed):

```
VITE_SUPABASE_URL=https://eval.cph-agro.com
VITE_SUPABASE_PUBLISHABLE_KEY=local-publishable-key
```

The `publishable key` is not a credential: the API ignores it. The real
credential is the session token that `app_login` returns and that the
database uses to apply the RLS policies.

Rebuild and redeploy:

```bash
APP_BASE=/ npm run build
EVAL_DOCROOT=/home/cphagro/eval.cph-agro.com \
DB_NAME=cphagro_evalsys DB_USER=evalsys DB_PASSWORD='...' \
./deploy/install-api.sh
```

`APP_BASE=/` for the subdomain. Use `APP_BASE=/eval/` for a sub-directory
installation under the WordPress root - the `.htaccess` is base agnostic.

## Verifying

```bash
curl https://eval.cph-agro.com/rest/v1/health
# {"status":"ok","service":"cph-eval-api","version":"1.0.0"}
```

Without a session, the tables are empty and the API returns an empty array -
that is Row Level Security working, not a bug:

```bash
curl -i 'https://eval.cph-agro.com/rest/v1/users?select=id,email'
```

## How the Supabase client talks to PostgreSQL

`@supabase/supabase-js` is kept as-is; only `VITE_SUPABASE_URL` changes. The
API implements the part of the PostgREST contract the application uses:

| Used by the app | Implemented |
|---|---|
| `supabase.from(table)` - 97 calls over 13 tables | `GET/POST/PATCH/DELETE /rest/v1/<table>` |
| `.eq()` `.is()` `.in()` `.match()` `.ilike()` | `eq neq gt gte lt lte like ilike is in match not`, `eq.null` -> `IS NULL` |
| `.order()` `.limit()` | `order=col.asc`, `limit` |
| `.single()` `.maybeSingle()` | `Accept: application/vnd.pgrst.object+json`, 406 `PGRST116` when not exactly one row |
| `.upsert()` | `Prefer: resolution=merge-duplicates` -> `ON CONFLICT ... DO UPDATE` |
| `supabase.rpc('hash_password' \| 'verify_password' \| 'create_user_with_password' \| 'update_user_password')` | same names, implemented in PHP with `password_hash()` (bcrypt) |
| embedded resources `branches(name)`, `roles(name, code)`, `parent:parent_role_id(name, code)` | resolved from the foreign keys of the schema |
| `supabase.rpc('app_login')` | new: authenticates and returns the signed session token |

Not needed and not implemented:

- **GoTrue / `supabase.auth`** - `src/hooks/useSupabase.ts` is dead code, the
  application authenticates against the database itself.
- **Storage** - not used anywhere in the app.
- **Edge Functions** - not used anywhere in the app.
- **Realtime** - five `postgres_changes` channels are used for the sidebar
  badges, but every one of them already polls every 30 seconds, so removing
  realtime costs nothing.
