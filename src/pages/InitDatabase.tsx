import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { checkTablesExist } from '@/services/database/auto-init';
import { seedTestData } from '@/lib/seed-test-data';
import { Loader2, CheckCircle2, AlertCircle, Copy } from 'lucide-react';

const SQL_INIT_SCRIPT = `-- Migration: Create all tables and seed data
-- Copy-paste this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) UNIQUE NOT NULL,
  code varchar(50) UNIQUE,
  location varchar(255),
  parent_branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  child_branches text[] DEFAULT '{}',
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
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
  role varchar(50) DEFAULT 'employee',
  is_active boolean DEFAULT true,
  archived_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) UNIQUE NOT NULL,
  parent_department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  child_departments text[] DEFAULT '{}',
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

CREATE INDEX IF NOT EXISTS idx_branches_name ON branches(name);
CREATE INDEX IF NOT EXISTS idx_branches_code ON branches(code);
CREATE INDEX IF NOT EXISTS idx_roles_code ON roles(code);
CREATE INDEX IF NOT EXISTS idx_roles_parent ON roles(parent_role_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);

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
ON CONFLICT (name) DO NOTHING;`;

export default function InitDatabase() {
  const [existingTables, setExistingTables] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'checking' | 'seeding'>('idle');
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const checkTables = async () => {
    setStatus('checking');
    const tables = await checkTablesExist();
    setExistingTables(tables);
    setStatus('idle');
  };

  const handleSeedTestData = async () => {
    setStatus('seeding');
    const result = await seedTestData();
    setStatus('idle');
    if (result.success) {
      toast({
        title: '✅ Succès!',
        description: 'Les données de test ont été chargées',
      });
    } else {
      toast({
        title: '❌ Erreur',
        description: result.message,
        variant: 'destructive',
      });
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(SQL_INIT_SCRIPT);
    setCopied(true);
    toast({
      title: '✅ Copié!',
      description: 'Le SQL est copié dans le presse-papier',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const allTablesExist = ['branches', 'roles', 'users', 'departments', 'evaluations', 'training_requests', 'reports'].every(t => 
    existingTables.includes(t)
  );

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {allTablesExist ? <CheckCircle2 className="text-green-600" /> : <AlertCircle className="text-orange-600" />}
            Initialisation de la Base de Données
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status des tables */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {['branches', 'roles', 'users', 'departments', 'evaluations', 'training_requests', 'reports'].map(table => (
              <div key={table} className={`p-3 rounded-lg border flex items-center gap-2 ${
                existingTables.includes(table) 
                  ? 'bg-green-50 border-green-300' 
                  : 'bg-red-50 border-red-300'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  existingTables.includes(table) ? 'bg-green-600' : 'bg-red-600'
                }`} />
                <span className={`text-sm font-medium ${
                  existingTables.includes(table) ? 'text-green-900' : 'text-red-900'
                }`}>
                  {table}
                </span>
              </div>
            ))}
          </div>

          {/* Bouton Vérifier */}
          <Button
            onClick={checkTables}
            variant="outline"
            className="w-full"
            disabled={status === 'checking'}
          >
            {status === 'checking' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            🔄 Vérifier les tables
          </Button>

          {!allTablesExist && (
            <>
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 space-y-3">
                <p className="font-semibold text-blue-900">📋 Étapes pour créer les tables:</p>
                <ol className="list-decimal list-inside space-y-2 text-blue-800 text-sm">
                  <li>Va sur <a href="https://app.supabase.com" target="_blank" rel="noopener noreferrer" className="underline font-semibold">https://app.supabase.com</a></li>
                  <li>Ouvre ton projet → clique sur <strong>SQL Editor</strong> dans le menu gauche</li>
                  <li>Clique sur <strong>New Query</strong></li>
                  <li>Clique sur le bouton <strong>"Copier SQL"</strong> ci-dessous</li>
                  <li>Colle le SQL dans l'éditeur Supabase</li>
                  <li>Clique sur <strong>Run</strong> (ou Ctrl+Enter)</li>
                  <li>Reviens ici et clique <strong>"Vérifier les tables"</strong></li>
                </ol>
              </div>

              {/* SQL Script */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">Script SQL à exécuter:</p>
                  <Button
                    onClick={copyToClipboard}
                    size="sm"
                    variant="outline"
                    className="gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    {copied ? 'Copié!' : 'Copier SQL'}
                  </Button>
                </div>
                <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto max-h-96 overflow-y-auto font-mono text-xs">
                  <pre>{SQL_INIT_SCRIPT}</pre>
                </div>
              </div>
            </>
          )}

          {allTablesExist && (
            <div className="bg-green-50 border border-green-300 rounded-lg p-4 space-y-3">
              <div>
                <p className="text-green-900 font-semibold">✅ Succès! Toutes les tables existent.</p>
                <p className="text-green-800 text-sm mt-1">Tu peux maintenant utiliser l'application normalement!</p>
              </div>
              <Button
                onClick={handleSeedTestData}
                className="w-full"
                variant="default"
                disabled={status === 'seeding'}
              >
                {status === 'seeding' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                🌱 Charger les données de test
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
