-- Roles used by the self-hosted stack.
--
-- `anon`, `authenticated` and `service_role` only exist so that the upstream
-- Supabase migrations (which GRANT to them) apply unmodified. They are
-- NOLOGIN: nobody can connect as them, and the API never runs as them.
--
-- `app_api` is the role the PHP API runs as (SET ROLE app_api). It owns the
-- Row Level Security policies, so PostgreSQL - not the application code -
-- enforces who may read and write what.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
        CREATE ROLE app_api NOLOGIN;
    END IF;
END
$$;

-- The upstream migrations reference `auth.role()`, which only exists inside
-- Supabase. A minimal stand-in lets them apply unmodified; the policies that
-- use it are replaced by deploy/sql/10_rls_policies.sql, which enforces the
-- real session identity.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.role_name', true), '') $$;

REVOKE ALL ON SCHEMA auth FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO app_api;
