import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
const env = {};

// Load .env file
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
    }
  });
}

const supabaseUrl = env.VITE_SUPABASE_URL || 'https://vcotcfuodhcvmbgkivqx.supabase.co';
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

if (!supabaseKey) {
  console.error('❌ VITE_SUPABASE_PUBLISHABLE_KEY not found in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedTestEvaluations() {
  console.log('🌱 Seeding test evaluations...');

  try {
    // Get some users to evaluate
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, name')
      .limit(5);

    if (usersError || !users || users.length === 0) {
      console.error('❌ No users found');
      return;
    }

    console.log(`✅ Found ${users.length} users to evaluate`);

    // Create evaluations for each user in each period
    // Periods are extracted from the "period" column in evaluations table
    const evaluations = [];

    for (const user of users) {
      // Q2 2026 evaluations (3 scores)
      evaluations.push(
        {
          employee_email: user.email,
          employee_name: user.name,
          period: 'Q2 2026',
          score: Math.floor(Math.random() * 8) + 12, // 12-20
          feedback: 'Bonne performance en Q2',
          status: 'completed',
          created_at: new Date('2026-05-15').toISOString(),
        },
        {
          employee_email: user.email,
          employee_name: user.name,
          period: 'Q2 2026',
          score: Math.floor(Math.random() * 8) + 12, // 12-20
          feedback: 'Résultats satisfaisants',
          status: 'completed',
          created_at: new Date('2026-05-20').toISOString(),
        },
        {
          employee_email: user.email,
          employee_name: user.name,
          period: 'Q2 2026',
          score: Math.floor(Math.random() * 8) + 12, // 12-20
          feedback: 'Progression notable',
          status: 'completed',
          created_at: new Date('2026-06-10').toISOString(),
        }
      );

      // Q3 2026 evaluations (2 scores)
      evaluations.push(
        {
          employee_email: user.email,
          employee_name: user.name,
          period: 'Q3 2026',
          score: Math.floor(Math.random() * 8) + 10, // 10-18
          feedback: 'Démarrage Q3 positif',
          status: 'completed',
          created_at: new Date('2026-07-15').toISOString(),
        },
        {
          employee_email: user.email,
          employee_name: user.name,
          period: 'Q3 2026',
          score: Math.floor(Math.random() * 8) + 10, // 10-18
          feedback: 'Bon engagement',
          status: 'completed',
          created_at: new Date('2026-08-20').toISOString(),
        }
      );
    }

    const { data: evalData, error: evalError } = await supabase
      .from('evaluations')
      .insert(evaluations)
      .select();

    if (evalError) {
      console.error('❌ Error creating evaluations:', evalError);
      return;
    }

    console.log(`✅ Created ${evalData.length} evaluations`);
    console.log('✨ Test data seeded successfully!');
    console.log('\n📊 Dashboard:');
    console.log('1. Go to Dashboard');
    console.log('2. Select period "Q2 2026" from the dropdown');
    console.log('3. You should see TOP/WORST employees');
    console.log('4. Click on an employee to see the evaluation CURVE! 📈');
    console.log('5. Try expanding branches/services to see filtered results');

  } catch (error) {
    console.error('❌ Fatal error:', error);
  }
}

seedTestEvaluations();
