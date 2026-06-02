import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SQL_INIT = `
-- Create tables
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) UNIQUE NOT NULL,
  code varchar(50) UNIQUE,
  location varchar(255),
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
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
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) UNIQUE NOT NULL,
  name varchar(255) NOT NULL,
  position varchar(255),
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
  role varchar(50) DEFAULT 'employee',
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  content text,
  type varchar(50) DEFAULT 'employee_report',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_branches_name ON branches(name);
CREATE INDEX IF NOT EXISTS idx_branches_code ON branches(code);
CREATE INDEX IF NOT EXISTS idx_roles_code ON roles(code);
CREATE INDEX IF NOT EXISTS idx_roles_parent ON roles(parent_role_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);

-- Seed data
INSERT INTO roles (name, code, level, color, is_active) 
VALUES 
  ('Administrateur', 'admin', 0, '#ef4444', true),
  ('RH', 'hr', 1, '#10b981', true),
  ('Manager', 'manager', 2, '#f59e0b', true),
  ('Employé', 'employee', 3, '#3b82f6', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO branches (name, code, location, is_active) 
VALUES 
  ('Siège Principal', 'HEAD', 'Principale', true),
  ('Agence Nord', 'NORTH', 'Nord', true),
  ('Agence Sud', 'SOUTH', 'Sud', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO departments (name, is_active) 
VALUES 
  ('Ressources Humaines', true),
  ('Finance', true),
  ('Informatique', true),
  ('Ventes', true),
  ('Marketing', true)
ON CONFLICT (name) DO NOTHING;
`

Deno.serve(async (req) => {
  // Cors
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Exécuter le SQL via une requête RPC custom
    // Note: Ceci nécessite que la function 'init_db' existe
    // Ou exécuter directement en tant que fonction
    
    // Approche alternative: utiliser exec SQL si disponible
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql: SQL_INIT 
    })

    if (error) {
      console.error('RPC Error:', error)
      // Fallback: essayer de créer les tables individuellement
      return new Response(
        JSON.stringify({
          success: false,
          error: 'RPC exec_sql not available. Please run manually in Supabase SQL Editor.',
          sql: SQL_INIT
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Database initialized successfully!',
        data
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
