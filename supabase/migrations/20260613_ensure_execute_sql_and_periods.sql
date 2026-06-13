-- Ensure execute_sql RPC exists
CREATE OR REPLACE FUNCTION execute_sql(sql TEXT)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
BEGIN
  EXECUTE sql;
  RETURN QUERY SELECT true, 'SQL executed successfully'::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION execute_sql(TEXT) TO authenticated, anon;

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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_evaluation_periods_name ON evaluation_periods(name);
CREATE INDEX IF NOT EXISTS idx_evaluation_periods_is_active ON evaluation_periods(is_active);

-- Populate from existing evaluations
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

-- RLS Policies
DROP POLICY IF EXISTS "Allow public read" ON evaluation_periods;
CREATE POLICY "Allow public read" ON evaluation_periods
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to manage periods" ON evaluation_periods;
CREATE POLICY "Allow authenticated users to manage periods" ON evaluation_periods
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
