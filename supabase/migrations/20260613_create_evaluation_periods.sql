-- Create evaluation_periods table
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

-- Create index on name for faster lookups
CREATE INDEX IF NOT EXISTS idx_evaluation_periods_name ON evaluation_periods(name);
CREATE INDEX IF NOT EXISTS idx_evaluation_periods_is_active ON evaluation_periods(is_active);

-- Add period_id FK to evaluations table (optional - for future FK constraint)
-- ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES evaluation_periods(id) ON DELETE SET NULL;

-- Insert existing periods from evaluations into evaluation_periods
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

-- Enable RLS
ALTER TABLE evaluation_periods ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Public read
CREATE POLICY "Allow public read" ON evaluation_periods
  FOR SELECT USING (true);

-- RLS Policy: Authenticated users can insert/update/delete
CREATE POLICY "Allow authenticated users to manage periods" ON evaluation_periods
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
