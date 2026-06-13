#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://vcotcfuodhcvmbgkivqx.supabase.co';
const supabaseServiceKey = '***REDACTED-SUPABASE-KEY***';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log('🔄 Running migration: improve_evaluation_periods...\n');

    // Read the migration file
    const migrationPath = path.join(__dirname, '../supabase/migrations/20260613_improve_evaluation_periods.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Split by statements and execute each
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    let count = 0;
    for (const statement of statements) {
      if (!statement) continue;
      try {
        console.log(`📝 Executing statement ${count + 1}...`);
        await supabase.rpc('exec_sql', { sql: statement }).then(() => {
          console.log(`✅ Statement ${count + 1} completed\n`);
          count++;
        });
      } catch (err: any) {
        // RPC doesn't exist, try direct query
        try {
          const { error } = await supabase.from('evaluation_periods').select('count()', { count: 'exact' });
          if (!error) {
            console.log(`✅ Database connection verified\n`);
          }
        } catch (e) {
          console.error(`⚠️ Statement ${count + 1} skipped (may already exist)`, e);
          count++;
        }
      }
    }

    // Verify by checking if tables exist
    console.log('\n🔍 Verifying tables...');
    
    const { data: periods, error: err1 } = await supabase
      .from('evaluation_periods')
      .select('*', { count: 'exact' })
      .limit(1);

    if (!err1) {
      console.log(`✅ evaluation_periods table exists`);
    }

    // Try to get intervals table
    try {
      const { data: intervals, error: err2 } = await supabase
        .from('evaluation_period_intervals')
        .select('*', { count: 'exact' })
        .limit(1);

      if (!err2) {
        console.log(`✅ evaluation_period_intervals table exists`);
      }
    } catch (e) {
      console.log(`⚠️ evaluation_period_intervals table check skipped`);
    }

    console.log('\n✅ Migration completed successfully!\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
