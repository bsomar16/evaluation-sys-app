# Guide: Connexion HR Pulse à Supabase (Gratuit)

## 📋 Table des matières
1. Créer un compte Supabase
2. Configurer la base de données
3. Créer les tables SQL
4. Configurer l'authentification
5. Connecter l'app React
6. Tester la connexion

---

## 1️⃣ Créer un compte Supabase (GRATUIT)

### Étapes:
1. Va sur: **https://supabase.com**
2. Clique sur **"Start your project"** ou **"Sign Up"**
3. Connecte-toi avec:
   - GitHub (recommandé)
   - Google
   - Email + Mot de passe

✅ **Plan Gratuit inclut:**
- 500 MB stockage DB
- Authentification illimitée
- 2 Go transfert data/mois
- Support communauté

---

## 2️⃣ Créer un nouveau projet

1. Après connexion, clique **"New Project"**
2. Remplis:
   - **Name:** `hr-pulse` (ou ton choix)
   - **Database Password:** Crée un mot de passe fort
   - **Region:** Choisis ta région (ex: `eu-west-1` pour Europe)
3. Clique **"Create new project"**

⏳ *Attends 2-3 minutes que le projet se crée*

---

## 3️⃣ Récupère les clés API

Une fois le projet créé:

1. Va dans l'onglet **Settings** → **API**
2. Copie:
   - **Project URL** (ex: `https://lwyquxdvffuupuzjdgtq.supabase.co`)
   - **anon key** (clé publique pour React)
   - **service_role key** (pour serveur - garder secret!)

3. Crée un fichier `.env.local` à la racine du projet:

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

---

## 4️⃣ Crée les tables SQL dans Supabase

### Dans Supabase:
1. Va à **SQL Editor** (à gauche)
2. Clique **"New Query"**
3. Copie/Colle le code SQL ci-dessous:

```sql
-- Table Utilisateurs
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  position VARCHAR(100),
  branch VARCHAR(100),
  avatar_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table Évaluations
CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  evaluated_by UUID NOT NULL REFERENCES users(id),
  score DECIMAL(5,2),
  attendance_compliance BOOLEAN,
  target_achievement DECIMAL(5,2),
  quality_of_work DECIMAL(5,2),
  certification_status VARCHAR(50),
  teamwork_collaboration DECIMAL(5,2),
  comments TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table Demandes de Formation
CREATE TABLE training_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_title VARCHAR(255) NOT NULL,
  domain VARCHAR(100),
  problem_description TEXT,
  justification TEXT,
  learning_objective TEXT,
  skill_type VARCHAR(50),
  priority VARCHAR(20),
  target_semester VARCHAR(50),
  language VARCHAR(10),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table Rapports
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  report_type VARCHAR(50),
  branch VARCHAR(100),
  uploaded_by VARCHAR(255),
  file_url VARCHAR(500),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX idx_evaluations_employee ON evaluations(employee_id);
CREATE INDEX idx_evaluations_evaluated_by ON evaluations(evaluated_by);
CREATE INDEX idx_training_employee ON training_requests(employee_id);
CREATE INDEX idx_reports_type ON reports(report_type);
CREATE INDEX idx_users_email ON users(email);
```

4. Clique **"Run"** (ou Ctrl+Entrée)

✅ Les tables sont créées!

---

## 5️⃣ Configure l'authentification Supabase

### Dans Supabase - Settings:

1. Va à **Authentication** → **Settings** → **Auth Providers**
2. Active **Email/Password** (déjà activé par défaut)
3. Descends à **Email Templates** et personnalise si besoin

### Ajoute des utilisateurs de test:

1. Va à **Authentication** → **Users**
2. Clique **"Invite user"**
3. Ajoute:
   - Email: `demo@example.com`
   - Mot de passe: `demo123456`

---

## 6️⃣ Connecte l'app React à Supabase

### Installe le client Supabase (déjà fait):

```bash
npm install @supabase/supabase-js
```

### Crée/Mets à jour `src/integrations/supabase/client.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
```

### Mets à jour `src/integrations/supabase/types.ts`:

```typescript
export interface User {
  id: string;
  email: string;
  name: string;
  position?: string;
  branch?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Evaluation {
  id: string;
  employee_id: string;
  evaluated_by: string;
  score?: number;
  attendance_compliance?: boolean;
  target_achievement?: number;
  quality_of_work?: number;
  certification_status?: string;
  teamwork_collaboration?: number;
  comments?: string;
  created_at: string;
  updated_at: string;
}

export interface TrainingRequest {
  id: string;
  employee_id: string;
  course_title: string;
  domain?: string;
  problem_description?: string;
  justification?: string;
  learning_objective?: string;
  skill_type?: string;
  priority?: string;
  target_semester?: string;
  language?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: string;
  title: string;
  report_type?: string;
  branch?: string;
  uploaded_by?: string;
  file_url?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}
```

---

## 7️⃣ Mets à jour le Login avec Supabase

Modifie `src/pages/Login.tsx` pour utiliser Supabase Auth:

```typescript
import { supabase } from '@/integrations/supabase/client';

const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!email || !password) {
    toast({ title: "Erreur", description: "Remplir tous les champs", variant: "destructive" });
    return;
  }

  setIsLoading(true);
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    if (data.user) {
      localStorage.setItem("user", JSON.stringify({ 
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name || email.split("@")[0]
      }));
      
      toast({ title: "Succès", description: "Connexion réussie!" });
      navigate("/");
    }
  } catch (err: any) {
    toast({ 
      title: "Erreur", 
      description: err.message || "Identifiants invalides",
      variant: "destructive" 
    });
  } finally {
    setIsLoading(false);
  }
};
```

---

## 8️⃣ Teste la connexion

1. Relance ton app:
```bash
npm run dev
```

2. Va à `http://localhost:9000/login`

3. Essaie de te connecter avec:
   - **Email:** `demo@example.com`
   - **Mot de passe:** `demo123456`

✅ Si ça fonctionne → **Tu es connecté à Supabase!**

---

## 9️⃣ Exemple: Charger les employés depuis Supabase

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@/integrations/supabase/types';

export default function Employees() {
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*');

        if (error) throw error;
        setEmployees(data || []);
      } catch (err) {
        console.error('Erreur:', err);
      } finally {
        setLoading(false);
      }
    };

    loadEmployees();
  }, []);

  if (loading) return <div>Chargement...</div>;

  return (
    <div>
      {employees.map(emp => (
        <div key={emp.id}>{emp.name}</div>
      ))}
    </div>
  );
}
```

---

## 🔒 Sécurité: Configurer les Row Level Security (RLS)

Dans Supabase - SQL Editor, ajoute:

```sql
-- Activer RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Policy: Utilisateurs peuvent voir leurs données
CREATE POLICY "Users can view own data" 
  ON users FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data" 
  ON users FOR UPDATE 
  USING (auth.uid() = id);
```

---

## ❓ Dépannage

### "VITE_SUPABASE_URL not defined"
- Vérifier que le `.env.local` existe à la racine
- Relancer l'app: `npm run dev`

### "Invalid credentials"
- Vérifier que l'utilisateur existe dans Supabase
- Vérifier le mot de passe (case sensitive)

### "anon key not found"
- Aller dans Settings → API et copier la bonne clé

---

## 📚 Ressources utiles

- Docs Supabase: https://supabase.com/docs
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase React: https://supabase.com/docs/guides/getting-started/quickstarts/reactjs

---

**C'est prêt! Tu as maintenant Supabase connecté à ton app! 🎉**
