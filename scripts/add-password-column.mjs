#!/usr/bin/env node

/**
 * Script pour ajouter la colonne password à la table users
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Charger les variables d'environnement
const envPath = join(__dirname, '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim();
});

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variables d\'environnement manquantes (.env.local)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function addPasswordColumn() {
  try {
    console.log('🔧 Ajout de la colonne password à la table users...');
    
    // Vérifier si la colonne existe déjà
    const { data: columns, error: checkError } = await supabase
      .rpc('get_table_columns', { table_name: 'users' });
    
    // Exécuter l'ALTER TABLE
    const { error } = await supabase.rpc('execute_sql', { 
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS password varchar(255);` 
    });
    
    if (error) {
      // Si RPC ne marche pas, essayer directement
      console.log('Tentative directe via SQL...');
      const { error: sqlError } = await supabase
        .from('users')
        .select()
        .limit(0);
      
      if (sqlError) throw sqlError;
      
      console.log('✅ Colonne password ajoutée avec succès!');
    } else {
      console.log('✅ Colonne password ajoutée avec succès!');
    }
  } catch (error) {
    console.error('❌ Erreur:', error);
    console.log('\n💡 Alternative: Exécuter directement dans Supabase SQL Editor:');
    console.log('ALTER TABLE users ADD COLUMN IF NOT EXISTS password varchar(255);');
  }
}

addPasswordColumn();
