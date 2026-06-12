import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vcotcfuodhcvmbgkivqx.supabase.co';
const supabaseKey = '***REDACTED-SUPABASE-KEY***';

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedTestData() {
  console.log('🌱 Seeding test evaluation data...');

  try {
    // First, get a branch to assign employees to
    const { data: branches, error: branchError } = await supabase
      .from('branches')
      .select('id, name')
      .limit(1);

    if (branchError || !branches || branches.length === 0) {
      console.error('❌ Error getting branches:', branchError);
      return;
    }

    const branchId = branches[0].id;
    console.log(`📍 Using branch: ${branches[0].name} (${branchId})`);

    // Create test users with branch_id assigned
    const testUsers = [
      { email: 'alice@example.com', name: 'Alice Martin', role_id: null, branch_id: branchId },
      { email: 'bob@example.com', name: 'Bob Johnson', role_id: null, branch_id: branchId },
      { email: 'charlie@example.com', name: 'Charlie Brown', role_id: null, branch_id: branchId },
      { email: 'david@example.com', name: 'David Lee', role_id: null, branch_id: branchId },
      { email: 'eve@example.com', name: 'Eve Wilson', role_id: null, branch_id: branchId },
    ];

    console.log('👥 Creating test users...');
    const { data: createdUsers, error: userError } = await supabase
      .from('users')
      .upsert(testUsers, { onConflict: 'email' })
      .select();

    if (userError) {
      console.error('❌ Error creating users:', userError);
      return;
    }

    console.log(`✅ Created ${createdUsers.length} test users`);

    // Create sample evaluations for "juin 2026" period
    const evaluations = createdUsers.map((user, index) => ({
      employee_email: user.email,
      employee_name: user.name,
      employee_id: user.id,
      period: 'juin 2026',
      status: index % 3 === 0 ? 'pending' : index % 3 === 1 ? 'submitted' : 'approved',
      score: Math.floor(Math.random() * 100),
      feedback: `Test evaluation for ${user.name}`,
      responses: {},
      activity_log: [],
    }));

    console.log(`📊 Creating ${evaluations.length} evaluations...`);

    const { error: insertError } = await supabase
      .from('evaluations')
      .insert(evaluations);

    if (insertError) {
      console.error('❌ Error inserting evaluations:', insertError);
      return;
    }

    console.log('✅ Successfully created evaluations!');
    console.log('📝 Evaluations created:');
    evaluations.forEach(e => {
      console.log(`   - ${e.employee_email}: ${e.status}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

seedTestData();
