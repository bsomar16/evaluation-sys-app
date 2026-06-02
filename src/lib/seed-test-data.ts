/**
 * Seed data loader for development/testing
 * Populates the database with sample data for AdminDashboard display
 */

import { supabase } from '@/integrations/supabase/client';

export async function seedTestData() {
  try {
    console.log('🌱 Starting test data seeding...');

    // 1. Get existing IDs for references
    const { data: branches } = await supabase.from('branches').select('id, code');
    const { data: roles } = await supabase.from('roles').select('id, code');

    const headBranchId = branches?.find(b => b.code === 'HEAD')?.id;
    const northBranchId = branches?.find(b => b.code === 'NORTH')?.id;
    const southBranchId = branches?.find(b => b.code === 'SOUTH')?.id;

    const adminRoleId = roles?.find(r => r.code === 'admin')?.id;
    const employeeRoleId = roles?.find(r => r.code === 'employee')?.id;
    const managerRoleId = roles?.find(r => r.code === 'manager')?.id;
    const hrRoleId = roles?.find(r => r.code === 'hr')?.id;

    // 2. Insert sample users
    console.log('📝 Adding sample users...');
    const usersToInsert = [
      { email: 'admin@company.com', name: 'Admin User', position: 'Administrator', branch_id: headBranchId, role_id: adminRoleId, role: 'admin', is_active: true },
      { email: 'john.doe@company.com', name: 'John Doe', position: 'Software Engineer', branch_id: northBranchId, role_id: employeeRoleId, role: 'employee', is_active: true },
      { email: 'jane.manager@company.com', name: 'Jane Manager', position: 'Project Manager', branch_id: headBranchId, role_id: managerRoleId, role: 'manager', is_active: true },
      { email: 'hr.officer@company.com', name: 'HR Officer', position: 'Human Resources', branch_id: headBranchId, role_id: hrRoleId, role: 'hr', is_active: true },
      { email: 'alice.south@company.com', name: 'Alice South', position: 'Analyst', branch_id: southBranchId, role_id: employeeRoleId, role: 'employee', is_active: true },
    ];

    const { data: insertedUsers, error: userError } = await supabase.from('users').upsert(usersToInsert, { onConflict: 'email' });
    if (userError) console.error('❌ User insert error:', userError);
    else console.log('✅ Users inserted:', insertedUsers?.length);

    // Get user IDs for references
    const { data: allUsers } = await supabase.from('users').select('id, email');
    const johnId = allUsers?.find(u => u.email === 'john.doe@company.com')?.id;
    const janeId = allUsers?.find(u => u.email === 'jane.manager@company.com')?.id;
    const aliceId = allUsers?.find(u => u.email === 'alice.south@company.com')?.id;

    // 3. Insert sample evaluations
    console.log('📊 Adding sample evaluations...');
    const evaluationsToInsert = [
      { employee_id: johnId, employee_email: 'john.doe@company.com', employee_name: 'John Doe', manager_id: janeId, period: '2026-Q1', score: 4.5, feedback: 'Excellent performance and teamwork', status: 'completed' },
      { employee_id: aliceId, employee_email: 'alice.south@company.com', employee_name: 'Alice South', manager_id: janeId, period: '2026-Q1', score: 3.8, feedback: 'Good work, could improve communication', status: 'completed' },
      { employee_id: johnId, employee_email: 'john.doe@company.com', employee_name: 'John Doe', manager_id: janeId, period: '2026-Q2', score: 4.2, feedback: 'Progressing well on current project', status: 'pending' },
    ];

    const { data: insertedEvals, error: evalError } = await supabase.from('evaluations').insert(evaluationsToInsert);
    if (evalError) console.error('❌ Evaluation insert error:', evalError);
    else console.log('✅ Evaluations inserted:', insertedEvals?.length);

    // 4. Insert sample training requests
    console.log('🎓 Adding sample training requests...');
    const trainingsToInsert = [
      { employee_id: johnId, employee_email: 'john.doe@company.com', employee_name: 'John Doe', manager_id: janeId, course_name: 'Advanced TypeScript', reason: 'Improve backend development skills', status: 'completed' },
      { employee_id: aliceId, employee_email: 'alice.south@company.com', employee_name: 'Alice South', manager_id: janeId, course_name: 'Leadership Fundamentals', reason: 'Prepare for team lead role', status: 'completed' },
      { employee_id: johnId, employee_email: 'john.doe@company.com', employee_name: 'John Doe', manager_id: janeId, course_name: 'Data Analysis Masterclass', reason: 'Enhance analytical skills', status: 'pending' },
    ];

    const { data: insertedTrainings, error: trainingError } = await supabase.from('training_requests').insert(trainingsToInsert);
    if (trainingError) console.error('❌ Training insert error:', trainingError);
    else console.log('✅ Training requests inserted:', insertedTrainings?.length);

    console.log('✅ Test data seeding completed!');
    return { success: true, message: 'Test data loaded successfully' };
  } catch (error) {
    console.error('❌ Seeding error:', error);
    return { success: false, message: 'Error seeding test data', error };
  }
}
