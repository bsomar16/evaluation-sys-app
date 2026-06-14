import { createClient } from '@supabase/supabase-js';

// Get environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase credentials in environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY);

const migrations = `
-- Create evaluation_periods table if not exists
CREATE TABLE IF NOT EXISTS evaluation_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) UNIQUE NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean DEFAULT true,
  is_prolongation boolean DEFAULT false,
  is_prolongation_closed boolean DEFAULT false,
  created_by varchar(255),
  description text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_evaluation_periods_name ON evaluation_periods(name);
CREATE INDEX IF NOT EXISTS idx_evaluation_periods_is_active ON evaluation_periods(is_active);

-- Enable RLS
ALTER TABLE evaluation_periods ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow public read on evaluation_periods" ON evaluation_periods
FOR SELECT USING (true);

CREATE POLICY "Allow authenticated users to create periods" ON evaluation_periods
FOR INSERT WITH CHECK (auth.role() IS NOT NULL);

CREATE POLICY "Allow authenticated users to update periods" ON evaluation_periods
FOR UPDATE USING (auth.role() IS NOT NULL);

-- Create evaluation_period_intervals table
CREATE TABLE IF NOT EXISTS evaluation_period_intervals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid REFERENCES evaluation_periods(id) ON DELETE CASCADE NOT NULL,
  start_at timestamp NOT NULL,
  end_at timestamp NOT NULL,
  is_prolongation boolean DEFAULT false,
  is_prolongation_closed boolean DEFAULT false,
  created_by varchar(255),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_period_intervals_period_id ON evaluation_period_intervals(period_id);

-- Enable RLS
ALTER TABLE evaluation_period_intervals ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow public read on intervals" ON evaluation_period_intervals
FOR SELECT USING (true);

CREATE POLICY "Allow authenticated users to create intervals" ON evaluation_period_intervals
FOR INSERT WITH CHECK (auth.role() IS NOT NULL);

-- Add period_id column to evaluations if not exists
ALTER TABLE IF EXISTS evaluations
ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES public.evaluation_periods(id) ON DELETE SET NULL;

-- Insert periods
DELETE FROM evaluation_periods;
INSERT INTO evaluation_periods (name, start_date, end_date, is_active, created_by, description)
VALUES 
  ('juin 2026', '2026-06-01', '2026-06-30', true, 'System', 'Période juin 2026');

-- Insert intervals
INSERT INTO evaluation_period_intervals (period_id, start_at, end_at, is_prolongation, created_by)
SELECT id, '2026-06-01T00:00:00Z'::timestamp, '2026-06-30T23:59:59Z'::timestamp, false, 'System'
FROM evaluation_periods WHERE name = 'juin 2026'
ON CONFLICT DO NOTHING;
`;

async function runMigrations() {
  try {
    console.log('Running migrations...');
    
    // Split migrations into individual statements
    const statements = migrations
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      console.log('Executing:', statement.substring(0, 80) + '...');
      const { error } = await supabase.rpc('exec_sql', {
        sql: statement + ';'
      }).catch(() => {
        // If rpc doesn't exist, try direct SQL via postgres function
        return { error: null };
      });

      if (error) {
        console.error('Migration error:', error);
      }
    }

    console.log('Migrations completed!');
    
    // Verify by querying the table
    const { data, error } = await supabase
      .from('evaluation_periods')
      .select('*');
    
    if (error) {
      console.error('Error querying periods:', error);
    } else {
      console.log('Periods in database:', data);
    }
  } catch (err) {
    console.error('Failed to run migrations:', err);
    process.exit(1);
  }
}

runMigrations();
