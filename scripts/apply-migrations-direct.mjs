import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY manquant (variable d\'environnement requise).');
  process.exit(1);
}


const supabase = createClient(supabaseUrl, supabaseKey);

async function createMissingTables() {
  console.log('🔄 Creating missing tables...\n');

  // First, create evaluation_periods table
  try {
    console.log('📝 Creating evaluation_periods table...');
    const createPeriodsSQL = `
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
    `;

    const { error: periodsError } = await supabase.rpc('execute_sql', { sql: createPeriodsSQL });
    if (periodsError) {
      console.warn(`⚠️  evaluation_periods error: ${periodsError.message}`);
    } else {
      console.log(`✅ evaluation_periods table created/verified`);
    }
  } catch (err) {
    console.warn(`⚠️  Error creating evaluation_periods:`, err);
  }

  // Then, create evaluation_period_intervals table
  try {
    console.log('📝 Creating evaluation_period_intervals table...');
    const createIntervalsSQL = `
      CREATE TABLE IF NOT EXISTS evaluation_period_intervals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        period_id uuid NOT NULL REFERENCES evaluation_periods(id) ON DELETE CASCADE,
        start_at timestamp NOT NULL,
        end_at timestamp NOT NULL,
        is_prolongation boolean DEFAULT false,
        is_prolongation_closed boolean DEFAULT false,
        created_by varchar(255),
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_evaluation_period_intervals_period_id ON evaluation_period_intervals(period_id);
      CREATE INDEX IF NOT EXISTS idx_evaluation_period_intervals_is_active ON evaluation_period_intervals(is_prolongation_closed) WHERE is_prolongation_closed = false;

      ALTER TABLE evaluation_period_intervals ENABLE ROW LEVEL SECURITY;

      CREATE POLICY IF NOT EXISTS "Allow public read" ON evaluation_period_intervals FOR SELECT USING (true);
      CREATE POLICY IF NOT EXISTS "Allow auth write" ON evaluation_period_intervals FOR INSERT WITH CHECK (auth.role() IS NOT NULL);
    `;

    const { error: intervalsError } = await supabase.rpc('execute_sql', { sql: createIntervalsSQL });
    if (intervalsError) {
      console.warn(`⚠️  evaluation_period_intervals error: ${intervalsError.message}`);
    } else {
      console.log(`✅ evaluation_period_intervals table created/verified`);
    }
  } catch (err) {
    console.warn(`⚠️  Error creating evaluation_period_intervals:`, err);
  }

  // Add period_id column to evaluations table
  try {
    console.log('📝 Adding period_id to evaluations table...');
    const addColumnSQL = `
      ALTER TABLE IF EXISTS evaluations
      ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES evaluation_periods(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_evaluations_period_id ON evaluations(period_id);

      UPDATE evaluations
      SET period_id = (
        SELECT id FROM evaluation_periods 
        WHERE evaluation_periods.name = evaluations.period 
        LIMIT 1
      )
      WHERE period_id IS NULL AND period IS NOT NULL AND period != '';
    `;

    const { error: columnError } = await supabase.rpc('execute_sql', { sql: addColumnSQL });
    if (columnError) {
      console.warn(`⚠️  period_id column error: ${columnError.message}`);
    } else {
      console.log(`✅ period_id column added to evaluations`);
    }
  } catch (err) {
    console.warn(`⚠️  Error adding period_id:`, err);
  }

  console.log('\n✅ All migrations completed!');
}

createMissingTables().catch(console.error);
