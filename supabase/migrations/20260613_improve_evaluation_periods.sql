-- Migration: Improve evaluation_periods table structure
-- This migration adds support for multiple intervals per period
-- and better metadata tracking

-- Add new columns to evaluation_periods if they don't exist
ALTER TABLE IF EXISTS evaluation_periods
ADD COLUMN IF NOT EXISTS is_prolongation boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_prolongation_closed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS created_by varchar(255),
ADD COLUMN IF NOT EXISTS description text;

-- Create evaluation_period_intervals table for managing multiple intervals per period
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

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_evaluation_period_intervals_period_id ON evaluation_period_intervals(period_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_period_intervals_is_active ON evaluation_period_intervals(is_prolongation_closed) WHERE is_prolongation_closed = false;

-- Add RLS policies (Row Level Security) if needed
ALTER TABLE evaluation_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_period_intervals ENABLE ROW LEVEL SECURITY;

-- Allow all users to read periods (unauthenticated access for app)
CREATE POLICY "Allow public read on evaluation_periods" ON evaluation_periods
FOR SELECT USING (true);

CREATE POLICY "Allow public read on evaluation_period_intervals" ON evaluation_period_intervals
FOR SELECT USING (true);

-- Allow authenticated users to create/update periods
CREATE POLICY "Allow authenticated users to create periods" ON evaluation_periods
FOR INSERT WITH CHECK (auth.role() IS NOT NULL);

CREATE POLICY "Allow authenticated users to update periods" ON evaluation_periods
FOR UPDATE USING (auth.role() IS NOT NULL);

-- Allow authenticated users to manage intervals
CREATE POLICY "Allow authenticated users to create intervals" ON evaluation_period_intervals
FOR INSERT WITH CHECK (auth.role() IS NOT NULL);

CREATE POLICY "Allow authenticated users to update intervals" ON evaluation_period_intervals
FOR UPDATE USING (auth.role() IS NOT NULL);

CREATE POLICY "Allow authenticated users to delete intervals" ON evaluation_period_intervals
FOR DELETE USING (auth.role() IS NOT NULL);

-- Insert "juin 2026" period if not exists
INSERT INTO evaluation_periods (name, start_date, end_date, is_active, created_by, description)
VALUES ('Q2 2026', '2026-06-01', '2026-06-30', true, 'System', 'Période juin 2026')
ON CONFLICT (name) DO NOTHING;

-- Get the period ID and insert its interval
WITH period AS (
  SELECT id FROM evaluation_periods WHERE name = 'Q2 2026' LIMIT 1
)
INSERT INTO evaluation_period_intervals (period_id, start_at, end_at, is_prolongation, created_by)
SELECT id, '2026-06-01T00:00:00Z'::timestamp, '2026-06-30T23:59:59Z'::timestamp, false, 'System'
FROM period
ON CONFLICT DO NOTHING;
