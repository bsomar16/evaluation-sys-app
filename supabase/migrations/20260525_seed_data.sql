-- Migration: Add sample data for testing
-- This adds test users, evaluations, and training requests

-- SEED DATA - Default Users (with roles and branches)
INSERT INTO users (email, name, position, branch_id, role_id, role, is_active) 
SELECT 
  'admin@company.com', 
  'Admin User', 
  'Administrator',
  (SELECT id FROM branches WHERE code = 'HEAD' LIMIT 1),
  (SELECT id FROM roles WHERE code = 'admin' LIMIT 1),
  'admin',
  true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@company.com')
UNION ALL
SELECT
  'john.doe@company.com',
  'John Doe',
  'Software Engineer',
  (SELECT id FROM branches WHERE code = 'NORTH' LIMIT 1),
  (SELECT id FROM roles WHERE code = 'employee' LIMIT 1),
  'employee',
  true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'john.doe@company.com')
UNION ALL
SELECT
  'jane.manager@company.com',
  'Jane Manager',
  'Project Manager',
  (SELECT id FROM branches WHERE code = 'HEAD' LIMIT 1),
  (SELECT id FROM roles WHERE code = 'manager' LIMIT 1),
  'manager',
  true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'jane.manager@company.com')
UNION ALL
SELECT
  'hr.officer@company.com',
  'HR Officer',
  'Human Resources',
  (SELECT id FROM branches WHERE code = 'HEAD' LIMIT 1),
  (SELECT id FROM roles WHERE code = 'hr' LIMIT 1),
  'hr',
  true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'hr.officer@company.com')
UNION ALL
SELECT
  'alice.south@company.com',
  'Alice South',
  'Analyst',
  (SELECT id FROM branches WHERE code = 'SOUTH' LIMIT 1),
  (SELECT id FROM roles WHERE code = 'employee' LIMIT 1),
  'employee',
  true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'alice.south@company.com');

-- SEED DATA - Sample Evaluations
INSERT INTO evaluations (employee_id, employee_email, employee_name, manager_id, period, score, feedback, status)
SELECT 
  u1.id,
  u1.email,
  u1.name,
  u2.id,
  '2026-Q1',
  4.5,
  'Excellent performance and teamwork',
  'completed'
FROM users u1, users u2
WHERE u1.email = 'john.doe@company.com' AND u2.email = 'jane.manager@company.com'
AND NOT EXISTS (SELECT 1 FROM evaluations WHERE employee_email = 'john.doe@company.com' AND period = '2026-Q1')
UNION ALL
SELECT
  u1.id,
  u1.email,
  u1.name,
  u2.id,
  '2026-Q1',
  3.8,
  'Good work, could improve communication',
  'completed'
FROM users u1, users u2
WHERE u1.email = 'alice.south@company.com' AND u2.email = 'jane.manager@company.com'
AND NOT EXISTS (SELECT 1 FROM evaluations WHERE employee_email = 'alice.south@company.com' AND period = '2026-Q1')
UNION ALL
SELECT
  u1.id,
  u1.email,
  u1.name,
  u2.id,
  '2026-Q2',
  4.2,
  'Progressing well on current project',
  'pending'
FROM users u1, users u2
WHERE u1.email = 'john.doe@company.com' AND u2.email = 'jane.manager@company.com'
AND NOT EXISTS (SELECT 1 FROM evaluations WHERE employee_email = 'john.doe@company.com' AND period = '2026-Q2');

-- SEED DATA - Sample Training Requests
INSERT INTO training_requests (employee_id, employee_email, employee_name, manager_id, course_name, reason, status)
SELECT
  u1.id,
  u1.email,
  u1.name,
  u2.id,
  'Advanced TypeScript',
  'Improve backend development skills',
  'completed'
FROM users u1, users u2
WHERE u1.email = 'john.doe@company.com' AND u2.email = 'jane.manager@company.com'
AND NOT EXISTS (SELECT 1 FROM training_requests WHERE employee_email = 'john.doe@company.com' AND course_name = 'Advanced TypeScript')
UNION ALL
SELECT
  u1.id,
  u1.email,
  u1.name,
  u2.id,
  'Leadership Fundamentals',
  'Prepare for team lead role',
  'completed'
FROM users u1, users u2
WHERE u1.email = 'alice.south@company.com' AND u2.email = 'jane.manager@company.com'
AND NOT EXISTS (SELECT 1 FROM training_requests WHERE employee_email = 'alice.south@company.com' AND course_name = 'Leadership Fundamentals')
UNION ALL
SELECT
  u1.id,
  u1.email,
  u1.name,
  u2.id,
  'Data Analysis Masterclass',
  'Enhance analytical skills',
  'pending'
FROM users u1, users u2
WHERE u1.email = 'john.doe@company.com' AND u2.email = 'jane.manager@company.com'
AND NOT EXISTS (SELECT 1 FROM training_requests WHERE employee_email = 'john.doe@company.com' AND course_name = 'Data Analysis Masterclass');
