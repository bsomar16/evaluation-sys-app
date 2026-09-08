/**
 * Service d'initialisation automatique des tables Supabase
 * Exécute les requêtes SQL directement via fetch
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Les requêtes SQL pour créer les tables
const SQL_STATEMENTS = [
  // TABLE: BRANCHES
  `CREATE TABLE IF NOT EXISTS branches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) UNIQUE NOT NULL,
    code varchar(50) UNIQUE,
    location varchar(255),
    parent_branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
    child_branches text[] DEFAULT '{}',
    is_active boolean DEFAULT true,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  )`,

  // TABLE: ROLES
  `CREATE TABLE IF NOT EXISTS roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(100) UNIQUE NOT NULL,
    code varchar(50) UNIQUE,
    level integer DEFAULT 0,
    parent_role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
    color varchar(7) DEFAULT '#3b82f6',
    child_roles text[] DEFAULT '{}',
    permissions jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  )`,

  // TABLE: USERS
  `CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(255) UNIQUE NOT NULL,
    code varchar(100),
    name varchar(255) NOT NULL,
    position varchar(255),
    branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
    department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
    role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
    role varchar(50) DEFAULT 'employee',
    is_active boolean DEFAULT true,
    archived_at timestamp,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  )`,

  // TABLE: DEPARTMENTS
  `CREATE TABLE IF NOT EXISTS departments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) UNIQUE NOT NULL,
    parent_department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
    child_departments text[] DEFAULT '{}',
    is_active boolean DEFAULT true,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  )`,

  // TABLE: EVALUATION_CRITERIA
  `CREATE TABLE IF NOT EXISTS evaluation_criteria (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) NOT NULL,
    type varchar(50) NOT NULL,
    role_ids text[] DEFAULT '{}',
    branch_ids text[] DEFAULT '{}',
    department_ids text[] DEFAULT '{}',
    weight numeric(5,2) DEFAULT 1,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  )`,
  `ALTER TABLE evaluation_criteria ADD COLUMN IF NOT EXISTS name_ar varchar(255)`,
  `ALTER TABLE evaluation_criteria ADD COLUMN IF NOT EXISTS description text`,
  `ALTER TABLE evaluation_criteria ADD COLUMN IF NOT EXISTS archived_at timestamp`,
  `ALTER TABLE evaluation_criteria ADD COLUMN IF NOT EXISTS weight numeric(5,2) DEFAULT 1`,
  `ALTER TABLE evaluation_criteria ADD COLUMN IF NOT EXISTS frequency integer DEFAULT 1`,
  `ALTER TABLE evaluation_criteria ADD COLUMN IF NOT EXISTS frequency_anchor_date date`,

  // TABLE: CALCULATION_RULES
  `CREATE TABLE IF NOT EXISTS calculation_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type varchar(50) NOT NULL,
    label varchar(100),
    max_points numeric(5,2) DEFAULT 10,
    config jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp DEFAULT now()
  )`,
  // Migration legacy : tables anciennes sans colonne id / avec UNIQUE(type)
  `ALTER TABLE calculation_rules ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid()`,
  `UPDATE calculation_rules SET id = gen_random_uuid() WHERE id IS NULL`,
  `ALTER TABLE calculation_rules ALTER COLUMN id SET NOT NULL`,
  `ALTER TABLE calculation_rules ALTER COLUMN id SET DEFAULT gen_random_uuid()`,
  `ALTER TABLE calculation_rules ADD COLUMN IF NOT EXISTS label varchar(100)`,
  `ALTER TABLE calculation_rules ADD COLUMN IF NOT EXISTS max_points numeric(5,2) DEFAULT 10`,
  `ALTER TABLE calculation_rules ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb`,
  `ALTER TABLE calculation_rules ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`,
  // Supprime l'unicité historique sur 'type' pour permettre plusieurs règles du même type
  `ALTER TABLE calculation_rules DROP CONSTRAINT IF EXISTS calculation_rules_type_key`,
  // Garantit la PK sur id (si l'ancienne PK était sur 'type')
  `DO $migrate_calc_pk$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'calculation_rules'::regclass
         AND contype = 'p'
         AND (SELECT array_agg(attname) FROM pg_attribute
              WHERE attrelid = 'calculation_rules'::regclass
                AND attnum = ANY(conkey)) = ARRAY['id']::name[]
     ) THEN
       BEGIN
         ALTER TABLE calculation_rules DROP CONSTRAINT IF EXISTS calculation_rules_pkey;
       EXCEPTION WHEN OTHERS THEN NULL;
       END;
       ALTER TABLE calculation_rules ADD PRIMARY KEY (id);
     END IF;
   END
   $migrate_calc_pk$`,
  // Recharge le cache du schéma PostgREST pour exposer la nouvelle colonne id
  `NOTIFY pgrst, 'reload schema'`,

  // TABLE: EVALUATIONS
  `CREATE TABLE IF NOT EXISTS evaluations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid REFERENCES users(id) ON DELETE CASCADE,
    employee_email varchar(255),
    employee_name varchar(255),
    manager_id uuid REFERENCES users(id) ON DELETE SET NULL,
    period varchar(100),
    score numeric(3,1),
    feedback text,
    responses jsonb DEFAULT '[]'::jsonb,
    status varchar(50) DEFAULT 'pending',
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  )`,

  // TABLE: TRAINING_REQUESTS
  `CREATE TABLE IF NOT EXISTS training_requests (
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
  )`,
  `ALTER TABLE training_requests ADD COLUMN IF NOT EXISTS request_details jsonb DEFAULT '{}'::jsonb`,
  `ALTER TABLE training_requests ADD COLUMN IF NOT EXISTS planning_details jsonb DEFAULT '{}'::jsonb`,

  // TABLE: REPORTS
  `CREATE TABLE IF NOT EXISTS reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    title varchar(255) NOT NULL,
    content text,
    type varchar(50) DEFAULT 'employee_report',
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  )`,

  // INDEXES
  `CREATE INDEX IF NOT EXISTS idx_branches_name ON branches(name)`,
  `CREATE INDEX IF NOT EXISTS idx_branches_code ON branches(code)`,
  `CREATE INDEX IF NOT EXISTS idx_roles_code ON roles(code)`,
  `CREATE INDEX IF NOT EXISTS idx_roles_parent ON roles(parent_role_id)`,
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
  `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`,
  `CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id)`,
  `CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id)`,
  `CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name)`,

  // SEED DATA - Rôles
  `INSERT INTO roles (name, code, level, color, is_active) 
   SELECT 'Administrateur', 'admin', 0, '#ef4444', true
   WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'admin')`,

  `INSERT INTO roles (name, code, level, color, is_active) 
   SELECT 'RH', 'hr', 1, '#10b981', true
   WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'hr')`,

  `INSERT INTO roles (name, code, level, color, is_active) 
   SELECT 'Manager', 'manager', 2, '#f59e0b', true
   WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'manager')`,

  `INSERT INTO roles (name, code, level, color, is_active) 
   SELECT 'Employé', 'employee', 3, '#3b82f6', true
   WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'employee')`,

  // SEED DATA - Branches
  `INSERT INTO branches (name, code, location, is_active) 
   SELECT 'Siège Principal', 'HEAD', 'Principale', true
   WHERE NOT EXISTS (SELECT 1 FROM branches WHERE code = 'HEAD')`,

  `INSERT INTO branches (name, code, location, is_active) 
   SELECT 'Agence Nord', 'NORTH', 'Nord', true
   WHERE NOT EXISTS (SELECT 1 FROM branches WHERE code = 'NORTH')`,

  `INSERT INTO branches (name, code, location, is_active) 
   SELECT 'Agence Sud', 'SOUTH', 'Sud', true
   WHERE NOT EXISTS (SELECT 1 FROM branches WHERE code = 'SOUTH')`,

  // SEED DATA - Departments
  `INSERT INTO departments (name, is_active) 
   SELECT 'Ressources Humaines', true
   WHERE NOT EXISTS (SELECT 1 FROM departments WHERE name = 'Ressources Humaines')`,

  `INSERT INTO departments (name, is_active) 
   SELECT 'Finance', true
   WHERE NOT EXISTS (SELECT 1 FROM departments WHERE name = 'Finance')`,

  `INSERT INTO departments (name, is_active) 
   SELECT 'Informatique', true
   WHERE NOT EXISTS (SELECT 1 FROM departments WHERE name = 'Informatique')`,
];

export async function autoInitializeDatabase(): Promise<boolean> {
  try {
    console.log("🚀 Initialisation automatique de la base de données...");

    // Combine tous les statements en un seul SQL
    const allSQL = SQL_STATEMENTS.join(";\n") + ";";

    console.log("📤 Envoi des requêtes SQL à Supabase...");

    // Essaie via l'API Supabase GraphQL ou une fonction RPC
    // Si ça ne marche pas, affiche un message à l'utilisateur
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ sql: allSQL }),
    });

    if (response.ok) {
      console.log("✅ Tables créées avec succès!");
      return true;
    } else if (response.status === 404) {
      console.warn("⚠️ RPC 'exec_sql' non trouvée - besoin de création manuelle");
      return false;
    } else {
      console.error("❌ Erreur lors de l'exécution SQL:", response.statusText);
      return false;
    }
  } catch (error) {
    console.error("❌ Erreur lors de l'initialisation automatique:", error);
    return false;
  }
}

// Fonction pour vérifier si les tables existent
export async function checkTablesExist(): Promise<string[]> {
  const tables = ["branches", "roles", "users", "departments", "evaluations", "training_requests", "reports"];
  const existingTables: string[] = [];
  
  // Import supabase client to check tables
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    for (const table of tables) {
      try {
        // Try to fetch one row from each table
        const { error } = await supabase.from(table).select('id').limit(1);
        
        if (!error) {
          existingTables.push(table);
          console.log(`✓ Table ${table} existe`);
        } else {
          console.log(`✗ Table ${table} n'existe pas: ${error.message}`);
        }
      } catch (error: any) {
        console.log(`✗ Erreur lors de la vérification de ${table}:`, error?.message);
      }
    }
  } catch (error) {
    console.error('Erreur lors de l\'import du client:', error);
  }

  return existingTables;
}
