-- Convergence between two upstream migrations that describe the same table
-- with a different shape.
--
-- 20260612_create_evaluation_periods.sql creates evaluation_periods without
-- `created_by`; 20260613_create_evaluation_periods.sql creates it with
-- `created_by` but uses CREATE TABLE IF NOT EXISTS, so the table created by
-- the first migration is kept and the second one then fails on the missing
-- column. The column is therefore added explicitly here.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'evaluation_periods') THEN
        EXECUTE 'ALTER TABLE public.evaluation_periods ADD COLUMN IF NOT EXISTS created_by varchar(255)';
        EXECUTE 'ALTER TABLE public.evaluation_periods ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true';
        EXECUTE 'ALTER TABLE public.evaluation_periods ADD COLUMN IF NOT EXISTS start_date date';
        EXECUTE 'ALTER TABLE public.evaluation_periods ADD COLUMN IF NOT EXISTS end_date date';
    END IF;
END
$$;
