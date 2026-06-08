-- Migration: Add is_agent_without_account and is_user flags
-- 2026-06-08

-- Add is_agent_without_account column to users table
ALTER TABLE IF EXISTS users
ADD COLUMN IF NOT EXISTS is_agent_without_account boolean DEFAULT false;

-- Add is_user column to roles table
ALTER TABLE IF EXISTS roles
ADD COLUMN IF NOT EXISTS is_user boolean DEFAULT true;

-- Create index for is_agent_without_account for efficient filtering
CREATE INDEX IF NOT EXISTS idx_users_is_agent_without_account ON users(is_agent_without_account);

-- Create index for is_user for role filtering
CREATE INDEX IF NOT EXISTS idx_roles_is_user ON roles(is_user);
