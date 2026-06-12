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
