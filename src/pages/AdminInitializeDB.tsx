import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, AlertCircle, Copy } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const SQL_INIT = `-- Drop existing tables first
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS training_requests CASCADE;
DROP TABLE IF EXISTS evaluations CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

-- Create all tables (fresh start)
CREATE TABLE branches (
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

CREATE TABLE roles (
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

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) UNIQUE NOT NULL,
  name varchar(255) NOT NULL,
  position varchar(255),
  password varchar(255),
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
  role varchar(50) DEFAULT 'employee',
  is_active boolean DEFAULT true,
  archived_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) UNIQUE NOT NULL,
  parent_department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  child_departments text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE evaluations (
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

CREATE TABLE training_requests (
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

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  content text,
  type varchar(50) DEFAULT 'employee_report',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_branches_name ON branches(name);
CREATE INDEX idx_branches_code ON branches(code);
CREATE INDEX idx_roles_code ON roles(code);
CREATE INDEX idx_roles_parent ON roles(parent_role_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_branch ON users(branch_id);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_departments_name ON departments(name);`;

export default function AdminInitializeDB() {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copyToClipboard = () => {
    navigator.clipboard.writeText(SQL_INIT);
    setCopied(true);
    toast({
      title: '✅ Copié!',
      description: 'Le SQL est copié dans le presse-papier',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const openSupabaseSQL = () => {
    window.open(
      'https://app.supabase.com/project/vcotcfuodhcvmbgkivqx/sql/new',
      '_blank'
    );
  };

  if (status === 'success') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <CheckCircle2 className="w-16 h-16 text-green-600" />
            <h2 className="text-2xl font-bold text-center">Succès! ✨</h2>
            <p className="text-center text-muted-foreground">Base de données initialisée avec succès!</p>
            <p className="text-center text-sm text-muted-foreground">Redirection en cours...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <AlertCircle className="w-16 h-16 text-red-600" />
            <h2 className="text-2xl font-bold text-center">Erreur</h2>
            <p className="text-center text-muted-foreground text-sm">{message}</p>
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline"
              className="w-full"
            >
              Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            📄 Initialisation Base de Données
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          
          <div className="bg-green-50 border border-green-300 rounded-lg p-4 space-y-3">
            <p className="font-semibold text-green-900">✅ Mode Rapide:</p>
            <ol className="list-decimal list-inside space-y-2 text-green-800 text-sm">
              <li>Clique <strong>"Ouvrir Supabase SQL"</strong> ci-dessous</li>
              <li>Clique <strong>"Copier SQL"</strong> pour copier le script</li>
              <li>Colle dans l'éditeur Supabase (Ctrl+V)</li>
              <li>Clique <strong>Run</strong> (Ctrl+Enter)</li>
              <li>Attends ~5 secondes</li>
              <li>Reviens ici et clique <strong>"Vérifier les tables"</strong></li>
            </ol>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={openSupabaseSQL}
              className="flex-1"
              size="lg"
            >
              🌐 Ouvrir Supabase SQL
            </Button>
            <Button
              onClick={copyToClipboard}
              variant="outline"
              className="flex-1 gap-2"
              size="lg"
            >
              <Copy className="h-4 w-4" />
              {copied ? 'Copié!' : 'Copier SQL'}
            </Button>
          </div>

          {/* SQL Script */}
          <div className="space-y-2">
            <p className="font-semibold text-sm">Script SQL à exécuter:</p>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto max-h-96 overflow-y-auto font-mono text-xs border">
              <pre>{SQL_INIT}</pre>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => window.location.href = '/init-db'}
              variant="outline"
              className="w-full"
            >
              ← Retourner aux Tables
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
