-- Update the evaluation period name to match the display label  
UPDATE evaluation_periods 
SET name = 'juin 2026'
WHERE start_date = '2026-06-01' AND end_date = '2026-06-30';

-- Verify the update
SELECT id, name, start_date, end_date, is_active FROM evaluation_periods;
