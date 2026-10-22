-- Bootstrap of the self-hosted database.
--
-- Constraints of the shared hosting (they shape this file):
--   * the database user is NOT a superuser and has no CREATEROLE, so no
--     role can be created here - the API connects as the owner of the
--     tables, and the policies are therefore granted TO PUBLIC while
--     pg_hba.conf keeps every other connection out;
--   * the pgcrypto extension is NOT installed on this server, so every
--     function that used crypt()/gen_salt() is implemented in PHP instead
--     (public/rest/v1/api.php) and is skipped here.
--
-- Only the pieces that do not depend on the tables are created here. The
-- session helpers live in deploy/sql/12_session_helpers.sql because they
-- reference public.roles and public.users, which do not exist yet.

-- The upstream migrations reference `auth.role()`, which only exists inside
-- Supabase. This minimal stand-in lets them apply unmodified; the policies
-- that use it are replaced by deploy/sql/10_rls_policies.sql.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.role_name', true), '') $$;

REVOKE ALL ON SCHEMA auth FROM PUBLIC;
