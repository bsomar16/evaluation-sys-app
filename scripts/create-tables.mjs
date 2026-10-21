import axios from 'axios';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY manquant (variable d\'environnement requise).');
  process.exit(1);
}


async function createTables() {
  console.log('🔄 Creating evaluation_periods table via SQL...\n');
  
  try {
    // Create evaluation_periods table
    const createTableSQL = `
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

      CREATE INDEX IF NOT EXISTS idx_evaluation_periods_name ON evaluation_periods(name);
      CREATE INDEX IF NOT EXISTS idx_evaluation_periods_is_active ON evaluation_periods(is_active);

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
      CREATE INDEX IF NOT EXISTS idx_evaluation_period_intervals_is_active ON evaluation_period_intervals(is_prolongation_closed) WHERE is_prolongation_closed = false;
    `;

    // Execute via Supabase SQL API (if available)
    // For now, let's test with a simple table creation
    console.log('✅ Table schema prepared');
    console.log('⚠️  Note: Execute this SQL in Supabase dashboard SQL Editor:\n');
    console.log(createTableSQL);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createTables();
