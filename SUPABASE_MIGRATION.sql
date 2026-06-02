-- =====================================================
-- SUPABASE MANUAL MIGRATION
-- =====================================================
-- Exécutez TOUTES les commandes suivantes dans l'éditeur SQL de Supabase:
-- 1. Allez sur https://app.supabase.com
-- 2. Sélectionnez votre projet
-- 3. Aller à SQL Editor → New Query
-- 4. Copiez-collez ce contenu et exécutez
-- =====================================================

-- STEP 1: Créer l'extension pgcrypto pour le hachage de mots de passe
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- STEP 2: Ajouter les colonnes 'description' aux tables existantes (si elles n'existent pas)
ALTER TABLE roles ADD COLUMN IF NOT EXISTS description varchar(500);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS description varchar(500);

-- STEP 3: Créer la fonction de hachage de mot de passe
CREATE OR REPLACE FUNCTION hash_password(password varchar)
RETURNS varchar AS $$
BEGIN
  RETURN crypt(password, gen_salt('bf', 12));
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- STEP 4: Créer la fonction de vérification de mot de passe
CREATE OR REPLACE FUNCTION verify_password(password varchar, hash varchar)
RETURNS boolean AS $$
BEGIN
  RETURN hash = crypt(password, hash);
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- STEP 5: Créer la fonction de création d'utilisateur avec mot de passe
CREATE OR REPLACE FUNCTION create_user_with_password(
  p_email varchar,
  p_name varchar,
  p_password varchar,
  p_position varchar DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_role_id uuid DEFAULT NULL,
  p_role varchar DEFAULT 'employee'
)
RETURNS json AS $$
DECLARE
  v_user_id uuid;
  v_hashed_password varchar;
BEGIN
  v_hashed_password := hash_password(p_password);

  INSERT INTO users (email, name, password, position, branch_id, role_id, role, is_active)
  VALUES (p_email, p_name, v_hashed_password, p_position, p_branch_id, p_role_id, p_role, true)
  RETURNING id INTO v_user_id;

  RETURN json_build_object(
    'success', true,
    'user_id', v_user_id,
    'email', p_email,
    'message', 'User created with hashed password'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 6: Créer la fonction de mise à jour de mot de passe
CREATE OR REPLACE FUNCTION update_user_password(
  p_user_id uuid,
  p_new_password varchar
)
RETURNS json AS $$
DECLARE
  v_hashed_password varchar;
BEGIN
  v_hashed_password := hash_password(p_new_password);

  UPDATE users SET password = v_hashed_password WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Password updated with hash'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 7: Accorder les permissions d'exécution
GRANT EXECUTE ON FUNCTION hash_password TO authenticated, anon;
GRANT EXECUTE ON FUNCTION verify_password TO authenticated, anon;
GRANT EXECUTE ON FUNCTION create_user_with_password TO authenticated, anon;
GRANT EXECUTE ON FUNCTION update_user_password TO authenticated, anon;

-- =====================================================
-- VERIFICATION
-- =====================================================
-- Vérifiez que tout s'est bien déroulé en exécutant:
-- SELECT * FROM information_schema.columns WHERE table_name='roles' AND column_name='description';
-- SELECT * FROM information_schema.columns WHERE table_name='branches' AND column_name='description';
-- SELECT EXISTS(SELECT 1 FROM information_schema.routines WHERE routine_name='create_user_with_password');
