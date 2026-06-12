import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vcotcfuodhcvmbgkivqx.supabase.co';
const supabaseKey = '***REDACTED-SUPABASE-KEY***';

const supabase = createClient(supabaseUrl, supabaseKey);

async function reseedClean() {
  console.log('🌱 Reseeding evaluation data (clean)...');

  try {
    // Step 1: Get the branch to use
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

    // Step 2: Delete existing evaluations for test emails
    const testEmails = ['alice@example.com', 'bob@example.com', 'charlie@example.com', 'david@example.com', 'eve@example.com'];
    console.log('🗑️  Deleting old test evaluations...');
    for (const email of testEmails) {
      await supabase
        .from('evaluations')
        .delete()
        .eq('employee_email', email);
    }
    console.log('✅ Deleted old evaluations');

    // Step 3: Upsert users with correct branch_id
    const testUsers = [
      { email: 'alice@example.com', name: 'Alice Martin', role_id: null, branch_id: branchId, is_active: true },
      { email: 'bob@example.com', name: 'Bob Johnson', role_id: null, branch_id: branchId, is_active: true },
      { email: 'charlie@example.com', name: 'Charlie Brown', role_id: null, branch_id: branchId, is_active: true },
      { email: 'david@example.com', name: 'David Lee', role_id: null, branch_id: branchId, is_active: true },
      { email: 'eve@example.com', name: 'Eve Wilson', role_id: null, branch_id: branchId, is_active: true },
    ];

    console.log('👥 Upserting test users with branch_id...');
    const { data: createdUsers, error: userError } = await supabase
      .from('users')
      .upsert(testUsers, { onConflict: 'email' })
      .select();

    if (userError) {
      console.error('❌ Error upserting users:', userError);
      return;
    }

    console.log(`✅ Upserted ${createdUsers.length} test users`);

    // Step 4: Create fresh evaluations
    const evaluations = createdUsers.map((user, index) => ({
      employee_email: user.email,
      employee_name: user.name,
      employee_id: user.id,
      period: 'juin 2026',
      status: ['pending', 'submitted', 'approved', 'pending', 'submitted'][index],
      score: Math.floor(Math.random() * 100),
      feedback: `Test evaluation for ${user.name}`,
      responses: {},
      activity_log: [],
    }));

    console.log(`📊 Creating ${evaluations.length} fresh evaluations...`);

    const { error: insertError } = await supabase
      .from('evaluations')
      .insert(evaluations);

    if (insertError) {
      console.error('❌ Error creating evaluations:', insertError);
      return;
    }

    console.log('✅ Successfully created evaluations!');
    console.log('📝 Evaluations created:');
    evaluations.forEach(e => {
      console.log(`   - ${e.employee_email}: ${e.status}`);
    });
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

reseedClean();
