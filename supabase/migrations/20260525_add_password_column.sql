-- Migration: Add password column to users table
-- Date: 2026-05-25

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password varchar(255);

-- Create an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_password ON users(password);
