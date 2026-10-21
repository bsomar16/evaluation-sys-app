-- 20260921_enable_rls_all_tables.sql
--
-- Row Level Security sur TOUTES les tables metier.
--
-- CONTEXTE
-- Sur le projet Supabase d'origine, seules 2 tables avaient RLS
-- (evaluation_periods et evaluation_period_intervals, via
-- 20260615_fix_evaluation_periods_rls.sql). Les 11 autres restaient
-- accessibles en lecture ET en ecriture avec la seule cle publique "anon" :
-- n'importe qui pouvait lire la table users (nom, e-mail, hachage de mot de
-- passe inclus), vider les evaluations, ou injecter des lignes arbitraires.
--
-- MODELE
-- L'API applicative se connecte avec un role Postgres dedie ("app_api") et
-- pose, avant chaque requete, des variables de session :
--
--   SET LOCAL app.user_id          = '<uuid>';
--   SET LOCAL app.role_slug        = 'employee' | 'admin' | ...;
--   SET LOCAL app.is_platform_admin = 'true' | 'false';
--   SET LOCAL app.branch_ids        = '<uuid>,<uuid>';  -- portee hierarchique
--   SET LOCAL app.department_ids    = '<uuid>,<uuid>';
--   SET LOCAL app.role_ids          = '<uuid>,<uuid>';
--
-- L'API est la frontiere de securite : elle verifie la session et applique
-- le perimetre (filiale / service / hierarchie de roles). Les policies ci-dessous
-- garantissent qu'aucun AUTRE role SQL ne peut lire ni ecrire les donnees, et
-- qu'une connexion directe a Postgres avec la cle publique est refusee
-- (absence de policy = refus).
--
-- A COMPLETER (apres lecture du DDL reel et cote API) : policies de perimetre
-- par utilisateur sur users / evaluations / training_requests / reports.

BEGIN;

-- ------------------------------------------------------------------ helpers
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
    CREATE ROLE app_api NOLOGIN;
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.app_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $fn$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid;
$fn$;

CREATE OR REPLACE FUNCTION public.app_is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE
AS $fn$
  SELECT coalesce(current_setting('app.is_platform_admin', true), 'false') = 'true';
$fn$;

CREATE OR REPLACE FUNCTION public.app_uuid_array(setting_name text) RETURNS uuid[]
LANGUAGE sql STABLE
AS $fn$
  SELECT CASE
    WHEN coalesce(current_setting(setting_name, true), '') = '' THEN ARRAY[]::uuid[]
    ELSE string_to_array(current_setting(setting_name, true), ',')::uuid[]
  END;
$fn$;

-- --------------------------------------------------------------- RLS on all
DO $do$
DECLARE
  t text;
  tables_list text[] := ARRAY[
    'app_settings',
    'branches',
    'calculation_rules',
    'departments',
    'evaluation_criteria',
    'evaluation_period_intervals',
    'evaluation_periods',
    'evaluations',
    'rejection_reasons',
    'reports',
    'roles',
    'training_requests',
    'users'
  ];
BEGIN
  FOREACH t IN ARRAY tables_list LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_api_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO app_api USING (true) WITH CHECK (true)',
      t || '_api_all',
      t
    );
  END LOOP;
END
$do$;

-- Le role de l'API herite de app_api. Tout autre role SQL (anon, authenticated,
-- public) ne dispose d'aucune policy et se voit donc refuser l'acces.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_auth_members m
    JOIN pg_roles r ON r.oid = m.roleid
    JOIN pg_roles u ON u.oid = m.member
    WHERE r.rolname = 'app_api' AND u.rolname = current_user
  ) THEN
    EXECUTE format('GRANT app_api TO %I', current_user);
  END IF;
END
$do$;

-- Retrait explicite de tout acces public residuel.
DO $do$
DECLARE
  t text;
  tables_list text[] := ARRAY[
    'app_settings', 'branches', 'calculation_rules', 'departments',
    'evaluation_criteria', 'evaluation_period_intervals', 'evaluation_periods',
    'evaluations', 'rejection_reasons', 'reports', 'roles', 'training_requests',
    'users'
  ];
BEGIN
  FOREACH t IN ARRAY tables_list LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO app_api', t);
  END LOOP;
END
$do$;

COMMIT;
