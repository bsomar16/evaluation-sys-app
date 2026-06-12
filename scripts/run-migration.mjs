import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = 'https://vcotcfuodhcvmbgkivqx.supabase.co';
const supabaseKey = '***REDACTED-SUPABASE-KEY***';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('🔄 Running migration...');

  try {
    // Read the migration file
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260612_create_evaluation_periods.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Execute the SQL using Supabase RPC
    const { error } = await supabase.rpc('exec', { sql });
    
    if (error) {
      console.error('❌ Error executing SQL:', error);
      
      // Try alternative: run specific CREATE TABLE statement
      console.log('📝 Attempting direct table creation...');
      
      const { error: createError } = await supabase.from('evaluation_periods').insert({
        name: 'Q3 2026',
        start_date: '2026-07-01',
        end_date: '2026-09-30',
        is_active: true
      });
      
      if (createError && createError.code === 'PGRST205') {
        console.error('❌ Table still does not exist. Please create it manually in Supabase dashboard.');
        console.log('\n📋 SQL to run manually:');
        console.log(sql);
      } else if (createError) {
        console.error('❌ Error:', createError);
      } else {
        console.log('✅ Table created and default period inserted!');
      }
      return;
    }

    console.log('✅ Migration executed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

runMigration();
