-- =====================================================
-- SCHEMA INITIALIZATION - Exécuter dans Supabase SQL Editor
-- =====================================================

-- TABLE: BRANCHES (Filiales)
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) UNIQUE NOT NULL,
  code varchar(50) UNIQUE,
  location varchar(255),
  description varchar(500),
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- TABLE: ROLES (Avec hiérarchie et couleurs)
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) UNIQUE NOT NULL,
  code varchar(50) UNIQUE,
  description varchar(500),
  level integer DEFAULT 0,
  parent_role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
  color varchar(7) DEFAULT '#3b82f6',
  child_roles text[] DEFAULT '{}',
  permissions jsonb DEFAULT '{}'::jsonb,
  is_user boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- TABLE: USERS (Utilisateurs)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) UNIQUE NOT NULL,
  name varchar(255) NOT NULL,
  position varchar(255),
  password varchar(255),
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
  role varchar(50) DEFAULT 'employee',
  is_agent_without_account boolean DEFAULT false,
  appearance_mode varchar(50) DEFAULT 'standard',
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- TABLE: DEPARTMENTS (Départements/Services)
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- TABLE: EVALUATIONS (Évaluations)
CREATE TABLE IF NOT EXISTS evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES users(id) ON DELETE CASCADE,
  employee_email varchar(255),
  employee_name varchar(255),
  manager_id uuid REFERENCES users(id) ON DELETE SET NULL,
  period varchar(100),
  score numeric(3,1),
  feedback text,
  status varchar(50) DEFAULT 'pending',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- TABLE: TRAINING_REQUESTS (Demandes de Formation)
CREATE TABLE IF NOT EXISTS training_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES users(id) ON DELETE CASCADE,
  employee_email varchar(255),
  employee_name varchar(255),
  manager_id uuid REFERENCES users(id) ON DELETE SET NULL,
  course_name varchar(255) NOT NULL,
  reason text,
  status varchar(50) DEFAULT 'pending',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- TABLE: REPORTS (Rapports)
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  content text,
  type varchar(50) DEFAULT 'employee_report',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- =====================================================
-- INDEXES (Optimisation)
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_branches_name ON branches(name);
CREATE INDEX IF NOT EXISTS idx_branches_code ON branches(code);
CREATE INDEX IF NOT EXISTS idx_roles_code ON roles(code);
CREATE INDEX IF NOT EXISTS idx_roles_parent ON roles(parent_role_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_appearance_mode ON users(appearance_mode);
CREATE INDEX IF NOT EXISTS idx_evaluations_employee ON evaluations(employee_email);
CREATE INDEX IF NOT EXISTS idx_training_employee ON training_requests(employee_email);
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);

-- =====================================================
-- PASSWORD HASHING / AUTH HELPERS
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION hash_password(password varchar)
RETURNS varchar AS $$
BEGIN
  RETURN crypt(password, gen_salt('bf', 12));
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

CREATE OR REPLACE FUNCTION verify_password(password varchar, hash varchar)
RETURNS boolean AS $$
BEGIN
  RETURN hash = crypt(password, hash);
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

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

GRANT EXECUTE ON FUNCTION hash_password TO authenticated, anon;
GRANT EXECUTE ON FUNCTION verify_password TO authenticated, anon;
GRANT EXECUTE ON FUNCTION create_user_with_password TO authenticated, anon;
GRANT EXECUTE ON FUNCTION update_user_password TO authenticated, anon;

CREATE OR REPLACE FUNCTION trigger_hash_password()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.password IS NOT NULL AND (OLD.password IS NULL OR NEW.password != OLD.password) THEN
    IF NOT (NEW.password LIKE '$2%$%$%') THEN
      NEW.password := hash_password(NEW.password);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_hash_password_users ON users;

CREATE TRIGGER trigger_hash_password_users
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION trigger_hash_password();

-- =====================================================
-- DATA SEEDING (Données par défaut)
-- =====================================================

-- Insert Default Roles
INSERT INTO roles (name, code, level, color, is_active) VALUES
  ('Administrateur', 'admin', 0, '#ef4444', true),
  ('RH', 'hr', 1, '#10b981', true),
  ('Manager', 'manager', 2, '#f59e0b', true),
  ('Employé', 'employee', 3, '#3b82f6', true)
ON CONFLICT (name) DO NOTHING;

-- Insert Default Branches
INSERT INTO branches (name, code, location, is_active) VALUES
  ('Siège Principal', 'HEAD', 'Principale', true),
  ('Agence Nord', 'NORTH', 'Nord', true),
  ('Agence Sud', 'SOUTH', 'Sud', true)
ON CONFLICT (name) DO NOTHING;

-- Insert Default Departments
INSERT INTO departments (name, is_active) VALUES
  ('Ressources Humaines', true),
  ('Finance', true),
  ('Informatique', true),
  ('Ventes', true),
  ('Marketing', true)
ON CONFLICT (name) DO NOTHING;
