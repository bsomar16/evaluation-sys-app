-- Create evaluation_period_intervals table if not exists
CREATE TABLE IF NOT EXISTS public.evaluation_period_intervals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.evaluation_periods(id) ON DELETE CASCADE,
  start_at timestamp NOT NULL,
  end_at timestamp NOT NULL,
  is_prolongation boolean DEFAULT false,
  is_prolongation_closed boolean DEFAULT false,
  created_by varchar(255),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_evaluation_period_intervals_period_id 
  ON public.evaluation_period_intervals(period_id);

CREATE INDEX IF NOT EXISTS idx_evaluation_period_intervals_is_prolongation_closed 
  ON public.evaluation_period_intervals(is_prolongation_closed) 
  WHERE is_prolongation_closed = false;

-- Enable RLS
ALTER TABLE public.evaluation_period_intervals ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow public read for evaluation_period_intervals"
  ON public.evaluation_period_intervals
  FOR SELECT
  USING (true);

CREATE POLICY "Allow authenticated write for evaluation_period_intervals"
  ON public.evaluation_period_intervals
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update for evaluation_period_intervals"
  ON public.evaluation_period_intervals
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated delete for evaluation_period_intervals"
  ON public.evaluation_period_intervals
  FOR DELETE
  USING (true);
