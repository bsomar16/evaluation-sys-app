-- Add appearance_mode column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS appearance_mode varchar(50) DEFAULT 'standard';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_appearance_mode ON users(appearance_mode);
