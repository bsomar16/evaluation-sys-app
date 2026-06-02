import { createClient } from '@supabase/supabase-js';

// ⚠️ ATTENTION: Utilise uniquement pour l'initialisation locale!
// La service_role_key ne doit JAMAIS être exposée en prod

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Manquent: VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function initializeDatabase() {
  console.log('🚀 Initialisation de la base de données...\n');

  try {
    // Crée les tables
    await createTables();
    console.log('✅ Tables créées\n');

    // Ajoute les données de test
    await seedData();
    console.log('✅ Données de test ajoutées\n');

    console.log('✅ Initialisation complète!');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

async function createTables() {
  const sql = `
    -- Table Utilisateurs
    CREATE TABLE IF NOT EXISTS users (
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
    CREATE TABLE IF NOT EXISTS evaluations (
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
    CREATE TABLE IF NOT EXISTS training_requests (
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
    CREATE TABLE IF NOT EXISTS reports (
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
    CREATE INDEX IF NOT EXISTS idx_evaluations_employee ON evaluations(employee_id);
    CREATE INDEX IF NOT EXISTS idx_evaluations_evaluated_by ON evaluations(evaluated_by);
    CREATE INDEX IF NOT EXISTS idx_training_employee ON training_requests(employee_id);
    CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `;

  const { error } = await supabase.rpc('exec_sql', { sql });
  
  if (error) {
    // Si la fonction n'existe pas, utilise l'approche directe
    console.log('📝 Création des tables via API...');
    
    // Vérifie si les tables existent déjà
    const { error: checkError } = await supabase.from('users').select('count').limit(1);
    
    if (checkError && checkError.code !== 'PGRST116') {
      throw error;
    }
  }
}

async function seedData() {
  // Ajoute les utilisateurs de test
  const { data: existingUsers, error: checkError } = await supabase
    .from('users')
    .select('email')
    .limit(1);

  if (existingUsers && existingUsers.length > 0) {
    console.log('📝 Les données existent déjà, skip seed');
    return;
  }

  const testUsers = [
    {
      email: 'demo@example.com',
      name: 'Démo Utilisateur',
      position: 'Manager',
      branch: 'Siège'
    },
    {
      email: 'employee1@example.com',
      name: 'Jean Dupont',
      position: 'Employé',
      branch: 'Branche Nord'
    },
    {
      email: 'employee2@example.com',
      name: 'Marie Martin',
      position: 'Senior',
      branch: 'Branche Sud'
    }
  ];

  for (const user of testUsers) {
    // Crée l'utilisateur dans Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: 'demo123456',
      email_confirm: true
    });

    if (authError && !authError.message.includes('already exists')) {
      console.warn(`⚠️ Erreur création user ${user.email}:`, authError.message);
      continue;
    }

    // Ajoute dans la table users
    const userId = authData?.user?.id;
    if (userId) {
      await supabase.from('users').insert({
        id: userId,
        ...user
      });

      console.log(`✅ Utilisateur créé: ${user.email}`);
    }
  }

  // Ajoute des évaluations de test
  const { data: users } = await supabase.from('users').select('id');
  
  if (users && users.length >= 2) {
    const [manager, employee] = users;

    await supabase.from('evaluations').insert({
      employee_id: employee.id,
      evaluated_by: manager.id,
      score: 85,
      attendance_compliance: true,
      target_achievement: 90,
      quality_of_work: 88,
      teamwork_collaboration: 9,
      comments: 'Excellente performance'
    });

    console.log('✅ Évaluation de test créée');
  }

  // Ajoute des demandes de formation
  if (users && users.length > 0) {
    await supabase.from('training_requests').insert({
      employee_id: users[0].id,
      course_title: 'Formation TypeScript Avancé',
      domain: 'Développement',
      priority: 'haute',
      status: 'pending'
    });

    console.log('✅ Demande de formation créée');
  }

  // Ajoute des rapports
  await supabase.from('reports').insert({
    title: 'Rapport Mensuel Mai 2026',
    report_type: 'performance',
    branch: 'Siège',
    uploaded_by: 'Admin',
    description: 'Rapport de performance du mois'
  });

  console.log('✅ Rapport créé');
}

// Lance l'initialisation
initializeDatabase().catch(console.error);
