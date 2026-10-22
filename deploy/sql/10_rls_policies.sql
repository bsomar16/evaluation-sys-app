-- Row Level Security for the self-hosted stack.
--
-- The API exposes the session identity to PostgreSQL through four
-- transaction-scoped GUCs, set after it has verified the HMAC-signed session
-- token:
--
--   app.user_id    uuid    the authenticated user
--   app.role_id    uuid    the role of that user
--   app.branch_id  uuid    the branch of that user
--   app.is_admin   boolean true when the role level is 0
--
-- Role levels (roles table): 0 = Administrateur, 1 = RH, 2 = Manager,
-- 3 = Employe. A lower level means more privileges.
--
-- The policies are granted TO PUBLIC because the database user of the shared
-- hosting has no CREATEROLE and cannot create a dedicated role. The outer
-- boundary is pg_hba.conf: only the API's database user can connect at all.
-- FORCE ROW LEVEL SECURITY makes the rules apply to the owner of the tables
-- as well, so the API cannot bypass them.

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
        IF to_regclass('public.' || t) IS NULL THEN
            CONTINUE;
        END IF;
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
-- Every authenticated session needs to read these to render the interface.

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
        IF to_regclass('public.' || t) IS NULL THEN
            CONTINUE;
        END IF;
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO PUBLIC USING (true)', t || '_select', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO PUBLIC USING (public.app_is_hr()) WITH CHECK (public.app_is_hr())',
            t || '_write', t);
    END LOOP;
END
$$;

-- ---------------------------------------------------------------- users ---

CREATE POLICY users_select ON public.users FOR SELECT TO PUBLIC USING (
    public.app_is_hr()
    OR id = public.app_user_id()
    OR (public.app_is_privileged() AND public.app_same_branch(branch_id))
);

CREATE POLICY users_insert ON public.users FOR INSERT TO PUBLIC WITH CHECK (
    public.app_is_privileged()
    AND (public.app_is_hr() OR public.app_same_branch(branch_id) OR branch_id IS NULL)
);

CREATE POLICY users_update ON public.users FOR UPDATE TO PUBLIC USING (
    public.app_is_hr()
    OR id = public.app_user_id()
    OR (public.app_is_privileged() AND public.app_same_branch(branch_id))
) WITH CHECK (
    public.app_is_privileged()
    AND (public.app_is_hr() OR public.app_same_branch(branch_id) OR id = public.app_user_id())
);

CREATE POLICY users_delete ON public.users FOR DELETE TO PUBLIC
    USING (public.app_is_admin());

-- The login lookup, which happens before any session exists. The API sets
-- app.login_email for the duration of that single statement, so an
-- anonymous request can read one row, the one of the address it announces,
-- and only while it verifies the password of that address.
CREATE POLICY users_login ON public.users FOR SELECT TO PUBLIC USING (
    lower(email) = lower(current_setting('app.login_email', true))
);

-- An employee may edit their own row (display mode, profile) but must never
-- change their own privileges. A trigger enforces this, because a row level
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

CREATE POLICY evaluations_select ON public.evaluations FOR SELECT TO PUBLIC USING (
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

CREATE POLICY evaluations_insert ON public.evaluations FOR INSERT TO PUBLIC WITH CHECK (
    public.app_is_privileged()
    AND (
        public.app_is_hr()
        OR EXISTS (
            SELECT 1 FROM public.users u
        )
    )
);

CREATE POLICY evaluations_update ON public.evaluations FOR UPDATE TO PUBLIC USING (
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

CREATE POLICY evaluations_delete ON public.evaluations FOR DELETE TO PUBLIC
    USING (public.app_is_admin());

-- ----------------------------------------------------- training_requests ---

CREATE POLICY training_requests_select ON public.training_requests FOR SELECT TO PUBLIC USING (
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

CREATE POLICY training_requests_insert ON public.training_requests FOR INSERT TO PUBLIC WITH CHECK (
    employee_id = public.app_user_id()
    OR (
        public.app_is_privileged()
        AND EXISTS (
            SELECT 1 FROM public.users u
        )
    )
);

CREATE POLICY training_requests_update ON public.training_requests FOR UPDATE TO PUBLIC USING (
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

CREATE POLICY training_requests_delete ON public.training_requests FOR DELETE TO PUBLIC
    USING (public.app_is_hr());

-- --------------------------------------------------------------- reports ---

CREATE POLICY reports_select ON public.reports FOR SELECT TO PUBLIC USING (
    public.app_is_hr() OR user_id = public.app_user_id()
);

CREATE POLICY reports_insert ON public.reports FOR INSERT TO PUBLIC WITH CHECK (
    public.app_is_hr() OR user_id = public.app_user_id()
);

CREATE POLICY reports_update ON public.reports FOR UPDATE TO PUBLIC USING (
    public.app_is_hr() OR user_id = public.app_user_id()
) WITH CHECK (
    public.app_is_hr() OR user_id = public.app_user_id()
);

CREATE POLICY reports_delete ON public.reports FOR DELETE TO PUBLIC
    USING (public.app_is_hr() OR user_id = public.app_user_id());

-- ------------------------------------------------------------- cleanup ----

-- No default privilege for anybody else: the only role that can connect is
-- the owner of the database, and the policies above decide what it may do.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_login_user(text) TO PUBLIC;
