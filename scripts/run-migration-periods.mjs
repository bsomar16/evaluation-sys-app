import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
const envPath = join(__dirname, '..', '.env.local');
let SUPABASE_URL = '';
let SUPABASE_KEY = '';

try {
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      const trimmedKey = key.trim();
      const trimmedValue = value.trim();
      if (trimmedKey === 'VITE_SUPABASE_URL') SUPABASE_URL = trimmedValue;
      if (trimmedKey === 'VITE_SUPABASE_PUBLISHABLE_KEY') SUPABASE_KEY = trimmedValue;
    }
  });
} catch (error) {
  console.error('❌ Failed to load .env.local:', error.message);
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runMigration() {
  console.log('🔧 Setting up evaluation_periods table...');

  try {
    // Insert default periods (table should exist or will be created)
    const { data, error } = await supabase
      .from('evaluation_periods')
      .insert([
        { name: 'Q3 2026', start_date: '2026-07-01', end_date: '2026-09-30', is_active: true },
        { name: 'Q4 2026', start_date: '2026-10-01', end_date: '2026-12-31', is_active: false }
      ])
      .select();

    if (error) {
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        console.log('⚠️  Table evaluation_periods does not exist yet.');
        console.log('📋 This is expected on first deployment.');
        console.log('💡 Tip: Create the table manually via Supabase SQL Editor using:');
        console.log(`
        CREATE TABLE IF NOT EXISTS evaluation_periods (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          name varchar(100) UNIQUE NOT NULL,
          start_date date NOT NULL,
          end_date date NOT NULL,
          is_active boolean DEFAULT true,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now()
        );
        
        CREATE INDEX IF NOT EXISTS idx_evaluation_periods_name ON evaluation_periods(name);
        CREATE INDEX IF NOT EXISTS idx_evaluation_periods_is_active ON evaluation_periods(is_active);
        `);
        return;
      }
      throw error;
    }

    console.log('✅ Evaluation periods configured successfully!');
    console.log(`✅ Inserted ${data?.length || 0} periods`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

runMigration();
