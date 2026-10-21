# Security hardening applied to this copy

Applied on top of the upstream code. Every change below is a deliberate
divergence from `techbeinweb-sys/evaluation-sys-app` - do not merge those
files back from upstream without re-applying this document.

## 1. Hardcoded developer backdoor - REMOVED

Upstream shipped a super-admin account hardcoded in the frontend
(`src/types/roles.ts`):

```ts
export const SITE_DEVELOPER = { id: 'admin-default', username: 'admin', password: 'Admin@2026', role: 'developer', ... }
```

`src/pages/Login.tsx` accepted those credentials and granted a full
SUPER_ADMIN session **without any database check**, and the login page
*printed the credentials on screen*:

```ts
if (loginUsername === SITE_DEVELOPER.username) {
  if (password !== SITE_DEVELOPER.password) throw new Error('Identifiants invalides');
  saveSiteDeveloperSession(hierarchyRoleId);   // no DB lookup at all
}
```

Anyone who could reach the site got admin access, and anyone who read the
repository had the password.

**Now:** the account is gone. Elevation is derived from the database
(`src/lib/session-user.ts`):

```ts
export function isPlatformAdmin(user?: SessionUser | null): boolean {
  if (!user) return false;
  const slug = (user.role || '').trim().toLowerCase();
  if (slug === 'admin') return true;
  const name = (user.roleName || '').trim().toLowerCase();
  return (PLATFORM_ADMIN_ROLE_NAMES as readonly string[]).includes(name);
}
```

The slug comes from `users.role` and the name from `roles.name`, both read from
the database at login. The 11 call sites that used `isSiteDeveloper` now use
`isPlatformAdmin`. The on-screen credentials panel was removed.

Note: on the upstream database **every** user had `users.role = 'employee'`,
which is why the backdoor existed in the first place - there was no way to
reach an admin session. The roles table does contain an `Admin` role
(`level = 0`), and it is now the real platform administrator.

## 2. Browser-issued DDL - REMOVED

`supabase/migrations/20260525_create_execute_sql_rpc.sql` created a
`SECURITY DEFINER` function and granted it to `anon`:

```sql
GRANT EXECUTE ON FUNCTION execute_sql(TEXT) TO authenticated, anon;
```

Any visitor could then run arbitrary SQL through
`supabase.rpc('execute_sql', ...)`, including creating tables, functions and
backdoors.

**Now:**
- the migration file is deleted (it is never applied),
- `src/lib/db-auto-migrate.ts` no longer issues DDL,
- `src/pages/admin/SchemaPage.tsx` and `src/services/database/initialize.ts`
  refuse to execute SQL from the browser and point at server-side migrations.

## 3. Committed credentials - REMOVED

`.env` was committed, containing a live `SUPABASE_SERVICE_ROLE_KEY` (full
admin on the upstream Supabase project). `.gitignore` did not exclude it.

**Now:**
- `.env` is gone, `.gitignore` excludes `.env` / `.env.*` (with `!.env.example`),
- `.env.example` documents the required keys without values,
- 7 scripts had the service-role JWT hardcoded in source
  (`scripts/create-tables.mjs`, `execute-migration.mjs`, `run-migration.mjs`,
  `init-periods.js`, `init-periods.mjs`, `seed-test-evaluations.mjs`,
  `apply-migrations-direct.mjs`). They now read
  `process.env.SUPABASE_SERVICE_ROLE_KEY` and exit if it is missing.

**Action required:** the upstream service-role key must be rotated by whoever
owns the Supabase project - it is still valid and still exposed in the
upstream repository's history.

## 4. Row Level Security - NOW ON ALL 13 TABLES

Upstream enabled RLS on only 2 tables (`evaluation_periods`,
`evaluation_period_intervals`). The other 11 - including `users`, with email,
name, position and password hashes - were readable **and writable** by anyone
holding the public key.

`supabase/migrations/20260921_enable_rls_all_tables.sql` enables and forces
RLS on all 13 tables and binds them to a dedicated `app_api` role. No policy is
granted to `anon` / `authenticated` / `PUBLIC`, so a direct connection to
PostgreSQL with the public key is refused.

## 5. `BrowserRouter` basename - FIXED

`src/App.tsx` used `<BrowserRouter>` with no `basename`, so the app 404'd when
served from a sub-path. It now uses `basename={import.meta.env.BASE_URL}`,
driven by the same `APP_BASE` build variable as `vite.config.ts`.

## 6. Sidebar permission bug - FIXED

`src/pages/TeamPage.tsx` used `if (isSiteDeveloper(session) || !canRead('employees'))`,
which denied access to the platform administrator as well. It is now
`if (!isPlatformAdmin(session) && !canRead('employees'))`.
