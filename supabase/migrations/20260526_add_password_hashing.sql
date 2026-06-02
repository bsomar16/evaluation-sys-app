-- Migration: Add password hashing with pgcrypto
-- Date: 2026-05-26
-- Security: Use bcrypt with cost 12 for password hashing

-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Modify users table password column to store hashed passwords (longer for bcrypt)
ALTER TABLE users ALTER COLUMN password SET DATA TYPE varchar(255);

-- Create RPC function to hash password with bcrypt (pgcrypto)
CREATE OR REPLACE FUNCTION hash_password(password varchar)
RETURNS varchar AS $$
BEGIN
  RETURN crypt(password, gen_salt('bf', 12));
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- Create RPC function to verify password against hash
CREATE OR REPLACE FUNCTION verify_password(password varchar, hash varchar)
RETURNS boolean AS $$
BEGIN
  RETURN hash = crypt(password, hash);
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- Create RPC function to create user with hashed password
CREATE OR REPLACE FUNCTION create_user_with_password(
  p_email varchar,
  p_name varchar,
  p_password varchar,
  p_position varchar DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_role_id uuid DEFAULT NULL,
  p_role varchar DEFAULT 'employee'
)
RETURNS json AS $$
DECLARE
  v_user_id uuid;
  v_hashed_password varchar;
BEGIN
  -- Hash the password using bcrypt
  v_hashed_password := hash_password(p_password);
  
  -- Insert the user with hashed password
  INSERT INTO users (email, name, password, position, branch_id, role_id, role, is_active)
  VALUES (p_email, p_name, v_hashed_password, p_position, p_branch_id, p_role_id, p_role, true)
  RETURNING id INTO v_user_id;
  
  RETURN json_build_object(
    'success', true,
    'user_id', v_user_id,
    'email', p_email,
    'message', 'User created with hashed password'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create RPC function to update user password (hash it)
CREATE OR REPLACE FUNCTION update_user_password(
  p_user_id uuid,
  p_new_password varchar
)
RETURNS json AS $$
DECLARE
  v_hashed_password varchar;
BEGIN
  -- Hash the new password
  v_hashed_password := hash_password(p_new_password);
  
  -- Update the user's password
  UPDATE users SET password = v_hashed_password WHERE id = p_user_id;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Password updated with hash'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions to authenticated users
GRANT EXECUTE ON FUNCTION hash_password TO authenticated, anon;
GRANT EXECUTE ON FUNCTION verify_password TO authenticated, anon;
GRANT EXECUTE ON FUNCTION create_user_with_password TO authenticated, anon;
GRANT EXECUTE ON FUNCTION update_user_password TO authenticated, anon;

-- Create trigger to automatically hash passwords on user creation (if password column updated directly)
CREATE OR REPLACE FUNCTION trigger_hash_password()
RETURNS TRIGGER AS $$
BEGIN
  -- Only hash if password is provided and different from existing
  IF NEW.password IS NOT NULL AND (OLD.password IS NULL OR NEW.password != OLD.password) THEN
    -- Check if password is already hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
    IF NOT (NEW.password LIKE '$2%$%$%') THEN
      NEW.password := hash_password(NEW.password);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trigger_hash_password_users ON users;

-- Create trigger on users table
CREATE TRIGGER trigger_hash_password_users
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION trigger_hash_password();

-- Create index on password for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_password ON users(password);

-- Add comment for documentation
COMMENT ON FUNCTION hash_password(varchar) IS 'Hash a password using bcrypt (cost 12)';
COMMENT ON FUNCTION verify_password(varchar, varchar) IS 'Verify a password against its bcrypt hash';
COMMENT ON FUNCTION create_user_with_password(varchar, varchar, varchar, varchar, uuid, uuid, varchar) IS 'Create a user with automatically hashed password';
COMMENT ON FUNCTION update_user_password(uuid, varchar) IS 'Update a user password with automatic hashing';
COMMENT ON TABLE users IS 'Users table with bcrypt password hashing via trigger';
