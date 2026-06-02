#!/usr/bin/env node

/**
 * Script pour appliquer la migration de hachage de mot de passe
 * Crée les fonctions RPC pour le hachage bcrypt
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Charger les variables d'environnement
const envPath = join(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim().replace(/['"]/g, '');
});

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variables d\'environnement manquantes (.env.local)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// SQL pour créer les fonctions de hachage
const HASHING_MIGRATION_SQL = `
-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
`;

async function applyHashingMigration() {
  try {
    console.log('🚀 Application de la migration de hachage de mots de passe...');
    console.log(`📍 URL: ${SUPABASE_URL}\n`);

    // Diviser le SQL en statements individuels
    const statements = HASHING_MIGRATION_SQL.split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    console.log(`📋 ${statements.length} fonctions RPC et triggers à créer\n`);

    let successCount = 0;
    const errors = [];

    for (const statement of statements) {
      try {
        // Essayer via RPC execute_sql si elle existe
        const { data, error } = await supabase.rpc('execute_sql', { sql: statement });

        if (error) {
          if (error.message.includes('execute_sql')) {
            console.log(`⚠️  RPC execute_sql n'existe pas - utilisation alternative`);
            errors.push(`${statement.substring(0, 40)}: RPC non disponible`);
          } else {
            console.log(`⚠️  ${statement.substring(0, 50)}...`);
            console.log(`   Erreur: ${error.message}`);
            errors.push(`${statement.substring(0, 40)}: ${error.message}`);
          }
        } else {
          console.log(`✅ ${statement.substring(0, 60)}...`);
          successCount++;
        }
      } catch (err) {
        console.log(`❌ Exception: ${err.message}`);
        errors.push(`${statement.substring(0, 40)}: ${err.message}`);
      }
    }

    console.log(`\n📊 Résumé: ${successCount}/${statements.length} fonctions créées\n`);

    if (errors.length > 0) {
      console.error(`\n⚠️  Erreurs rencontrées:`);
      errors.forEach(err => console.error(`   - ${err}`));
      console.log(`\n💡 Solution: Exécutez manuellement le SQL dans Supabase SQL Editor:\n`);
      console.log(HASHING_MIGRATION_SQL);
      process.exit(1);
    } else {
      console.log('✅ Toutes les fonctions de hachage ont été créées avec succès!');
      console.log('🔐 Les mots de passe seront maintenant hachés avec bcrypt (coût 12)');
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

applyHashingMigration();
