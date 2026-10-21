-- Row Level Security for the self-hosted stack.
--
-- The PHP API exposes the session identity to PostgreSQL through four
-- transaction-scoped GUCs, set after verifying the HMAC-signed session token:
--
--   app.user_id    uuid    the authenticated user
--   app.role_id    uuid    the role of that user
--   app.branch_id  uuid    the branch of that user
--   app.is_admin   boolean true when the role level is 0
--
-- Role levels (from the roles table): 0 = Administrateur, 1 = RH,
-- 2 = Manager, 3 = Employe. Lower level = more privileges.

-- ------------------------------------------------------------- helpers ----

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

-- Level 0 = admin, level <= 1 = admin or RH, level <= 2 = admin, RH or manager.
CREATE OR REPLACE FUNCTION public.app_is_privileged() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ SELECT public.app_role_level() <= 2 $$;

CREATE OR REPLACE FUNCTION public.app_is_hr() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ SELECT public.app_role_level() <= 1 $$;

-- True when the user is in the same branch as the given branch id.
CREATE OR REPLACE FUNCTION public.app_same_branch(p_branch uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ SELECT p_branch IS NOT NULL AND p_branch = public.app_branch_id() $$;

-- ------------------------------------------------------------- login ----

-- The login lookup has to happen before any session exists, so it runs with
-- the privileges of the table owner. It is the only SECURITY DEFINER
-- function in the schema and it is not callable directly by the browser.
CREATE OR REPLACE FUNCTION public.app_login_user(p_email text)
    RETURNS SETOF public.users
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$ SELECT * FROM public.users WHERE lower(email) = lower(p_email) LIMIT 1 $$;

REVOKE ALL ON FUNCTION public.app_login_user(text) FROM PUBLIC;

-- ------------------------------------------------- drop the old policies ---

DO $$
DECLARE
    t text;
    p record;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'branches','roles','users','departments','evaluation_criteria',
        'calculation_rules','evaluation_periods','evaluation_period_intervals',
        'evaluations','training_requests','reports','rejection_reasons','app_settings'
    ]
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        FOR p IN
            SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = t
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
        END LOOP;
    END LOOP;
END
$$;

-- --------------------------------------------- reference data (read all) ---
-- Every authenticated session needs to read these to render the UI.

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'branches','roles','departments','evaluation_criteria',
        'calculation_rules','rejection_reasons','app_settings',
        'evaluation_periods','evaluation_period_intervals'
    ]
    LOOP
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO app_api USING (true)', t || '_select', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO app_api USING (public.app_is_hr()) WITH CHECK (public.app_is_hr())',
            t || '_write', t);
    END LOOP;
END
$$;

-- ---------------------------------------------------------------- users ---

CREATE POLICY users_select ON public.users FOR SELECT TO app_api USING (
    public.app_is_hr()
    OR id = public.app_user_id()
    OR (public.app_is_privileged() AND public.app_same_branch(branch_id))

CREATE POLICY users_insert ON public.users FOR INSERT TO app_api WITH CHECK (
    public.app_is_privileged()
    AND (public.app_is_hr() OR public.app_same_branch(branch_id) OR branch_id IS NULL)

CREATE POLICY users_update ON public.users FOR UPDATE TO app_api USING (
    public.app_is_hr()
    OR id = public.app_user_id()
    OR (public.app_is_privileged() AND public.app_same_branch(branch_id))
    public.app_is_privileged()
    AND (public.app_is_hr() OR public.app_same_branch(branch_id) OR id = public.app_user_id())

CREATE POLICY users_delete ON public.users FOR DELETE TO app_api
    USING (public.app_is_admin());

-- An employee may edit their own row (display mode, profile) but must never
-- change their own privileges. Enforced by trigger, because a row level
-- policy cannot tell which column changed.
CREATE OR REPLACE FUNCTION public.guard_user_privileges() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF public.app_role_level() <= 2 THEN
        RETURN NEW;
    END IF;
    IF NEW.role_id IS DISTINCT FROM OLD.role_id
        OR NEW.role IS DISTINCT FROM OLD.role
        OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
        OR NEW.department_id IS DISTINCT FROM OLD.department_id
        OR NEW.is_active IS DISTINCT FROM OLD.is_active
        OR NEW.email IS DISTINCT FROM OLD.email
        OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
        OR NEW.code IS DISTINCT FROM OLD.code
        OR NEW.position IS DISTINCT FROM OLD.position
    THEN
        RAISE EXCEPTION 'insufficient privileges to modify user privileges'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS guard_user_privileges_trg ON public.users;
CREATE TRIGGER guard_user_privileges_trg
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.guard_user_privileges();

-- ----------------------------------------------------------- evaluations ---

CREATE POLICY evaluations_select ON public.evaluations FOR SELECT TO app_api USING (
    public.app_is_hr()
    OR employee_id = public.app_user_id()
    OR manager_id = public.app_user_id()
    OR (
        public.app_is_privileged()
        AND EXISTS (
            SELECT 1 FROM public.users u
        )
    )
);

CREATE POLICY evaluations_insert ON public.evaluations FOR INSERT TO app_api WITH CHECK (
    public.app_is_privileged()
    AND (
        public.app_is_hr()
        OR EXISTS (
            SELECT 1 FROM public.users u
        )
    )
);

CREATE POLICY evaluations_update ON public.evaluations FOR UPDATE TO app_api USING (
    public.app_is_hr()
    OR employee_id = public.app_user_id()
    OR manager_id = public.app_user_id()
    OR (
        public.app_is_privileged()
        AND EXISTS (
            SELECT 1 FROM public.users u
        )
    )
) WITH CHECK (
    public.app_is_hr()
    OR employee_id = public.app_user_id()
    OR manager_id = public.app_user_id()
    OR public.app_is_privileged()
);

CREATE POLICY evaluations_delete ON public.evaluations FOR DELETE TO app_api
    USING (public.app_is_admin());

-- ----------------------------------------------------- training_requests ---

CREATE POLICY training_requests_select ON public.training_requests FOR SELECT TO app_api USING (
    public.app_is_hr()
    OR employee_id = public.app_user_id()
    OR manager_id = public.app_user_id()
    OR (
        public.app_is_privileged()
        AND EXISTS (
            SELECT 1 FROM public.users u
        )
    )
);

CREATE POLICY training_requests_insert ON public.training_requests FOR INSERT TO app_api WITH CHECK (
    employee_id = public.app_user_id()
    OR (
        public.app_is_privileged()
        AND EXISTS (
            SELECT 1 FROM public.users u
        )
    )
);

CREATE POLICY training_requests_update ON public.training_requests FOR UPDATE TO app_api USING (
    public.app_is_hr()
    OR employee_id = public.app_user_id()
    OR manager_id = public.app_user_id()
    OR public.app_is_privileged()
) WITH CHECK (
    public.app_is_hr()
    OR employee_id = public.app_user_id()
    OR manager_id = public.app_user_id()
    OR public.app_is_privileged()
);

CREATE POLICY training_requests_delete ON public.training_requests FOR DELETE TO app_api
    USING (public.app_is_hr());

-- --------------------------------------------------------------- reports ---

CREATE POLICY reports_select ON public.reports FOR SELECT TO app_api USING (
    public.app_is_hr() OR user_id = public.app_user_id()
);

CREATE POLICY reports_insert ON public.reports FOR INSERT TO app_api WITH CHECK (
    public.app_is_hr() OR user_id = public.app_user_id()
);

CREATE POLICY reports_update ON public.reports FOR UPDATE TO app_api USING (
    public.app_is_hr() OR user_id = public.app_user_id()
) WITH CHECK (
    public.app_is_hr() OR user_id = public.app_user_id()
);

CREATE POLICY reports_delete ON public.reports FOR DELETE TO app_api
    USING (public.app_is_hr() OR user_id = public.app_user_id());

-- ------------------------------------------------------------- grants ----

GRANT USAGE ON SCHEMA public TO app_api;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'branches','roles','users','departments','evaluation_criteria',
        'calculation_rules','evaluation_periods','evaluation_period_intervals',
        'evaluations','training_requests','reports','rejection_reasons','app_settings'
    ]
    LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO app_api', t);
    END LOOP;
END
$$;

GRANT EXECUTE ON FUNCTION public.app_login_user(text) TO app_api;
GRANT EXECUTE ON FUNCTION public.app_user_id() TO app_api;
GRANT EXECUTE ON FUNCTION public.app_branch_id() TO app_api;
GRANT EXECUTE ON FUNCTION public.app_is_admin() TO app_api;
GRANT EXECUTE ON FUNCTION public.app_role_level() TO app_api;
GRANT EXECUTE ON FUNCTION public.app_is_privileged() TO app_api;
GRANT EXECUTE ON FUNCTION public.app_is_hr() TO app_api;
GRANT EXECUTE ON FUNCTION public.app_same_branch(uuid) TO app_api;

-- The API connects as the database owner, which is a member of app_api.
DO $$
BEGIN
    EXECUTE format('GRANT app_api TO %I', current_user);
END
$$;

-- No privilege is ever granted to anon / authenticated / PUBLIC.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, PUBLIC;
