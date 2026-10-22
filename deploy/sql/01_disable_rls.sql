-- The policies of a previous run have to be lifted before the schema is
-- (re)applied: the seed data of the base schema inserts into roles,
-- branches and departments, which the policies of deploy/sql/10_rls_policies.sql
-- restrict to the privileged roles.
--
-- FORCE is removed as well, so the owner of the tables is not filtered while
-- the schema is being built. The last step of the installer puts both back.

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    END LOOP;
END
$$;
