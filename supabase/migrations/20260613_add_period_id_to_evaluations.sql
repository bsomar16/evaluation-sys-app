-- Migration: Add period_id column to evaluations table
-- Links evaluations to the new evaluation_periods table

ALTER TABLE IF EXISTS public.evaluations
ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES public.evaluation_periods(id) ON DELETE SET NULL;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_evaluations_period_id 
  ON public.evaluations(period_id);

-- Migrate existing period names to period_id if evaluation_periods was populated
UPDATE public.evaluations
SET period_id = (
  SELECT id FROM public.evaluation_periods 
  WHERE evaluation_periods.name = evaluations.period 
  LIMIT 1
)
WHERE period_id IS NULL AND period IS NOT NULL AND period != '';
