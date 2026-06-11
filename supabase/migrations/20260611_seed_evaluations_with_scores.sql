-- Add comprehensive test evaluation data with scores for dashboard display
-- This adds evaluations for all employees with proper score values

-- First, get all users
DO $$
DECLARE
  v_users RECORD;
  v_manager_id uuid;
BEGIN
  -- Get a manager ID to use as evaluator
  SELECT id INTO v_manager_id FROM users 
  WHERE role = 'manager' OR role_id IN (SELECT id FROM roles WHERE code = 'manager')
  LIMIT 1;
  
  -- If no manager found, get the first user
  IF v_manager_id IS NULL THEN
    SELECT id INTO v_manager_id FROM users LIMIT 1;
  END IF;

  -- Insert evaluations for Q2 2026 period
  INSERT INTO evaluations (employee_id, employee_email, employee_name, manager_id, period, score, feedback, status)
  SELECT 
    u.id,
    u.email,
    u.name,
    COALESCE(v_manager_id, u.id),
    'Q2 2026',
    ROUND((RANDOM() * 15 + 5)::numeric, 2),  -- Random score between 5-20
    'Évaluation Q2 2026 - Performance satisfaisante',
    'completed'
  FROM users u
  WHERE u.email NOT IN (SELECT DISTINCT employee_email FROM evaluations WHERE period = 'Q2 2026')
  AND NOT u.archived_at;

  -- Insert evaluations for Q3 2026 period
  INSERT INTO evaluations (employee_id, employee_email, employee_name, manager_id, period, score, feedback, status)
  SELECT 
    u.id,
    u.email,
    u.name,
    COALESCE(v_manager_id, u.id),
    'Q3 2026',
    ROUND((RANDOM() * 15 + 5)::numeric, 2),  -- Random score between 5-20
    'Évaluation Q3 2026 - Performance en amélioration',
    'completed'
  FROM users u
  WHERE u.email NOT IN (SELECT DISTINCT employee_email FROM evaluations WHERE period = 'Q3 2026')
  AND NOT u.archived_at;

  -- Insert additional evaluations for diversity (multiple scores per employee per period)
  INSERT INTO evaluations (employee_id, employee_email, employee_name, manager_id, period, score, feedback, status)
  SELECT 
    u.id,
    u.email,
    u.name,
    COALESCE(v_manager_id, u.id),
    'Q2 2026',
    ROUND((RANDOM() * 15 + 5)::numeric, 2),
    'Évaluation complémentaire Q2 2026',
    'completed'
  FROM users u
  WHERE NOT u.archived_at
  LIMIT 20;  -- Add additional evaluations for first 20 employees

  -- Insert additional evaluations for Q3 2026
  INSERT INTO evaluations (employee_id, employee_email, employee_name, manager_id, period, score, feedback, status)
  SELECT 
    u.id,
    u.email,
    u.name,
    COALESCE(v_manager_id, u.id),
    'Q3 2026',
    ROUND((RANDOM() * 15 + 5)::numeric, 2),
    'Évaluation complémentaire Q3 2026',
    'completed'
  FROM users u
  WHERE NOT u.archived_at
  LIMIT 20;

  RAISE NOTICE 'Evaluation seeding completed';
END $$;
