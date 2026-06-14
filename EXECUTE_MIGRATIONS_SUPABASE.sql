-- ============================================================================
-- MIGRATION 1: Create evaluation_periods table
-- ============================================================================
-- Migration: Create evaluation_periods table
-- This table stores the evaluation periods configured in the system

CREATE TABLE IF NOT EXISTS evaluation_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) UNIQUE NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- INDEX for efficient lookups
CREATE INDEX IF NOT EXISTS idx_evaluation_periods_name ON evaluation_periods(name);
CREATE INDEX IF NOT EXISTS idx_evaluation_periods_is_active ON evaluation_periods(is_active);

-- Insert default periods if table is empty
INSERT INTO evaluation_periods (name, start_date, end_date, is_active)
VALUES 
  ('Q3 2026', '2026-07-01', '2026-09-30', true),
  ('Q4 2026', '2026-10-01', '2026-12-31', false)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- MIGRATION 2: Improve evaluation_periods table structure
-- ============================================================================
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

CREATE INDEX IF NOT EXISTS idx_evaluation_period_intervals_period_id ON evaluation_period_intervals(period_id);

-- Enable Row Level Security
ALTER TABLE evaluation_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_period_intervals ENABLE ROW LEVEL SECURITY;

-- Create policies for evaluation_periods
CREATE POLICY "Allow public read on evaluation_periods" ON evaluation_periods
FOR SELECT USING (true);

CREATE POLICY "Allow authenticated users to create periods" ON evaluation_periods
FOR INSERT WITH CHECK (auth.role() IS NOT NULL);

CREATE POLICY "Allow authenticated users to update periods" ON evaluation_periods
FOR UPDATE USING (auth.role() IS NOT NULL);

-- Create policies for evaluation_period_intervals
CREATE POLICY "Allow public read on intervals" ON evaluation_period_intervals
FOR SELECT USING (true);

CREATE POLICY "Allow authenticated users to create intervals" ON evaluation_period_intervals
FOR INSERT WITH CHECK (auth.role() IS NOT NULL);

CREATE POLICY "Allow authenticated users to update intervals" ON evaluation_period_intervals
FOR UPDATE USING (auth.role() IS NOT NULL);

CREATE POLICY "Allow authenticated users to delete intervals" ON evaluation_period_intervals
FOR DELETE USING (auth.role() IS NOT NULL);

-- Insert "juin 2026" period if not exists
INSERT INTO evaluation_periods (name, start_date, end_date, is_active, created_by, description)
VALUES ('juin 2026', '2026-06-01', '2026-06-30', true, 'System', 'Période juin 2026')
ON CONFLICT (name) DO NOTHING;

-- Get the period ID and insert its interval
WITH period AS (
  SELECT id FROM evaluation_periods WHERE name = 'juin 2026' LIMIT 1
)
INSERT INTO evaluation_period_intervals (period_id, start_at, end_at, is_prolongation, created_by)
SELECT id, '2026-06-01T00:00:00Z'::timestamp, '2026-06-30T23:59:59Z'::timestamp, false, 'System'
FROM period
ON CONFLICT DO NOTHING;

-- ============================================================================
-- MIGRATION 3: Add period_id to evaluations table
-- ============================================================================
-- Migration: Add period_id to evaluations table
-- Links evaluations to the new evaluation_periods table

ALTER TABLE IF EXISTS evaluations
ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES public.evaluation_periods(id) ON DELETE SET NULL;

-- Migrate existing period names to period_id if evaluation_periods was populated
UPDATE evaluations
SET period_id = (
  SELECT id FROM public.evaluation_periods 
  WHERE evaluation_periods.name = evaluations.period 
  LIMIT 1
)
WHERE period IS NOT NULL AND period_id IS NULL;
