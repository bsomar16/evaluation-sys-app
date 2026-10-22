-- Session helpers: the bridge between the API and the RLS policies.
--
-- The API exposes the session identity to PostgreSQL through four
-- transaction-scoped GUCs, set after it has verified the HMAC-signed
-- session token:
--
--   app.user_id    uuid    the authenticated user
--   app.role_id    uuid    the role of that user
--   app.branch_id  uuid    the branch of that user
--   app.is_admin   boolean true when the role level is 0
--
-- Role levels (roles table): 0 = Administrateur, 1 = RH, 2 = Manager,
-- 3 = Employe. A lower level means more privileges.

CREATE OR REPLACE FUNCTION public.app_user_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION public.app_branch_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.branch_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION public.app_is_admin() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ SELECT COALESCE(NULLIF(current_setting('app.is_admin', true), '')::boolean, false) $$;

CREATE OR REPLACE FUNCTION public.app_role_level() RETURNS integer
    LANGUAGE sql STABLE
    AS $$
        SELECT COALESCE(
            (SELECT r.level FROM public.roles r
              WHERE r.id = NULLIF(current_setting('app.role_id', true), '')::uuid),
            99)
    $$;

CREATE OR REPLACE FUNCTION public.app_is_privileged() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ SELECT public.app_role_level() <= 2 $$;

CREATE OR REPLACE FUNCTION public.app_is_hr() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ SELECT public.app_role_level() <= 1 $$;

CREATE OR REPLACE FUNCTION public.app_same_branch(p_branch uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ SELECT p_branch IS NOT NULL AND p_branch = public.app_branch_id() $$;

-- There is deliberately no SECURITY DEFINER bypass for the login lookup:
-- FORCE ROW LEVEL SECURITY applies to the owner of the tables too, so such a
-- function would still be filtered. The users_login policy opens exactly one
-- row instead, and only while app.login_email is set.
