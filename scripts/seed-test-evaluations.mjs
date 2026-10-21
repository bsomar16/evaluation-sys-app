import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY manquant (variable d\'environnement requise).');
  process.exit(1);
}


const supabase = createClient(supabaseUrl, supabaseKey);

async function seedTestEvaluations() {
  console.log('🌱 Seeding test evaluations...');

  try {
    // 1. Create an evaluation period
    const { data: periodData, error: periodError } = await supabase
      .from('evaluation_periods')
      .insert([
        {
          name: 'Q2 2026',
          start_date: '2026-04-01',
          end_date: '2026-06-30',
          is_active: true,
        },
        {
          name: 'Q3 2026',
          start_date: '2026-07-01',
          end_date: '2026-09-30',
          is_active: false,
        },
      ])
      .select();

    if (periodError) {
      console.error('❌ Error creating periods:', periodError);
      return;
    }

    console.log('✅ Created evaluation periods:', periodData);

    // 2. Get some users to evaluate
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, name')
      .limit(5);

    if (usersError || !users || users.length === 0) {
      console.error('❌ No users found');
      return;
    }

    console.log(`✅ Found ${users.length} users to evaluate`);

    // 3. Create evaluations for each user in each period
    const evaluations = [];

    for (const user of users) {
      // Q2 2026 evaluations (3 scores)
      evaluations.push(
        {
          employee_email: user.email,
          period: 'Q2 2026',
          score: Math.floor(Math.random() * 20) + 1,
          evaluator_email: 'admin@example.com',
          comments: 'Bonne performance en Q2',
          created_at: new Date('2026-05-15').toISOString(),
        },
        {
          employee_email: user.email,
          period: 'Q2 2026',
          score: Math.floor(Math.random() * 20) + 1,
          evaluator_email: 'admin@example.com',
          comments: 'Résultats satisfaisants',
          created_at: new Date('2026-05-20').toISOString(),
        },
        {
          employee_email: user.email,
          period: 'Q2 2026',
          score: Math.floor(Math.random() * 20) + 1,
          evaluator_email: 'admin@example.com',
          comments: 'Progression notable',
          created_at: new Date('2026-06-10').toISOString(),
        }
      );

      // Q3 2026 evaluations (2 scores)
      evaluations.push(
        {
          employee_email: user.email,
          period: 'Q3 2026',
          score: Math.floor(Math.random() * 20) + 1,
          evaluator_email: 'admin@example.com',
          comments: 'Démarrage Q3 positif',
          created_at: new Date('2026-07-15').toISOString(),
        },
        {
          employee_email: user.email,
          period: 'Q3 2026',
          score: Math.floor(Math.random() * 20) + 1,
          evaluator_email: 'admin@example.com',
          comments: 'Bon engagement',
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
    console.log('\n📊 Now:');
    console.log('1. Go to Dashboard');
    console.log('2. Select period "Q2 2026" from the dropdown');
    console.log('3. You should see TOP/WORST employees');
    console.log('4. Click on an employee to see the evaluation curve!');

  } catch (error) {
    console.error('❌ Fatal error:', error);
  }
}

seedTestEvaluations();
