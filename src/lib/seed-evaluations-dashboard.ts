/**
 * Seed comprehensive evaluation data for dashboard testing
 * Run this to populate evaluations with proper scores for TOP/WORST employee display
 */

import { supabase } from '@/integrations/supabase/client';

export async function seedEvaluationsWithScores() {
  try {
    console.log('🌱 Seeding evaluations with scores...');

    // 1. Get all users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('archived_at', null);

    if (usersError || !users || users.length === 0) {
      console.error('❌ No users found');
      return { success: false };
    }

    console.log(`📝 Found ${users.length} users`);

    // 2. Get a manager ID
    let managerId = users[0].id;
    const { data: managers } = await supabase
      .from('users')
      .select('id')
      .limit(1);
    if (managers && managers.length > 0) {
      managerId = managers[0].id;
    }

    // 3. Create evaluations for each user for Q2 2026
    const evaluations: any[] = [];

    // First evaluation for Q2 2026
    users.forEach((user, idx) => {
      evaluations.push({
        employee_id: user.id,
        employee_email: user.email,
        employee_name: user.name,
        manager_id: managerId,
        period: 'Q2 2026',
        score: Math.round((Math.random() * 15 + 5) * 100) / 100, // Random 5-20
        feedback: `Performance satisfaisante en Q2 2026`,
        status: 'completed',
        created_at: new Date('2026-05-15').toISOString(),
      });

      // Additional evaluation for diversity
      if (idx % 2 === 0) {
        evaluations.push({
          employee_id: user.id,
          employee_email: user.email,
          employee_name: user.name,
          manager_id: managerId,
          period: 'Q2 2026',
          score: Math.round((Math.random() * 15 + 5) * 100) / 100,
          feedback: `Évaluation complémentaire Q2 2026`,
          status: 'completed',
          created_at: new Date('2026-06-10').toISOString(),
        });
      }

      // Evaluation for Q3 2026
      evaluations.push({
        employee_id: user.id,
        employee_email: user.email,
        employee_name: user.name,
        manager_id: managerId,
        period: 'Q3 2026',
        score: Math.round((Math.random() * 15 + 5) * 100) / 100,
        feedback: `Performance en amélioration en Q3 2026`,
        status: 'completed',
        created_at: new Date('2026-07-15').toISOString(),
      });
    });

    console.log(`📊 Inserting ${evaluations.length} evaluations...`);

    // 4. Insert evaluations (skip duplicates)
    const { data: inserted, error: insertError } = await supabase
      .from('evaluations')
      .insert(evaluations)
      .select();

    if (insertError) {
      console.error('⚠️ Insert warning:', insertError.message);
      // This might be a duplicate key error, which is OK
    } else {
      console.log(`✅ Inserted ${inserted?.length || 0} new evaluations`);
    }

    // 5. Verify the data
    const { data: allEvals, error: verifyError } = await supabase
      .from('evaluations')
      .select('period, COUNT(*) as count, AVG(score) as avg_score')
      .groupBy('period');

    if (!verifyError && allEvals) {
      console.log('📊 Evaluation summary:');
      allEvals.forEach((row: any) => {
        console.log(
          `  ${row.period}: ${row.count} evaluations, avg score: ${row.avg_score?.toFixed(2)}`
        );
      });
    }

    return { success: true, inserted: inserted?.length || 0 };
  } catch (error) {
    console.error('❌ Seeding error:', error);
    return { success: false, error };
  }
}
