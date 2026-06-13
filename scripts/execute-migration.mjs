import fs from 'fs';

const SUPABASE_URL = 'https://vcotcfuodhcvmbgkivqx.supabase.co';
const SERVICE_KEY = '***REDACTED-SUPABASE-KEY***';

async function executeMigration() {
  console.log('🔄 Creating evaluation_periods table...\n');

  const migrationSQL = `
CREATE TABLE IF NOT EXISTS evaluation_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL UNIQUE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean DEFAULT true,
  created_by varchar(255),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_periods_name ON evaluation_periods(name);
CREATE INDEX IF NOT EXISTS idx_evaluation_periods_is_active ON evaluation_periods(is_active);

INSERT INTO evaluation_periods (name, start_date, end_date, is_active, created_by)
SELECT DISTINCT 
  period as name,
  DATE_TRUNC('month', now())::date as start_date,
  (DATE_TRUNC('month', now()) + interval '1 month' - interval '1 day')::date as end_date,
  true as is_active,
  'System' as created_by
FROM evaluations
WHERE period IS NOT NULL AND period != ''
ON CONFLICT (name) DO NOTHING;

ALTER TABLE evaluation_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON evaluation_periods
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated users to manage periods" ON evaluation_periods
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
  `;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/exec_sql`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql: migrationSQL }),
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Migration executed successfully!');
      console.log('Response:', data);
    } else {
      console.log(`⚠️  HTTP ${response.status}: RPC endpoint not available, showing SQL to execute manually...\n`);
      console.log('📝 Execute this SQL in Supabase SQL Editor:');
      console.log('\n' + migrationSQL);
    }
  } catch (error) {
    console.log('⚠️  Connection error, showing SQL to execute manually...\n');
    console.log('📝 Execute this SQL in Supabase SQL Editor:');
    console.log('\n' + migrationSQL);
  }
}

executeMigration();
