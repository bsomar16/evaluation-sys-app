#!/usr/bin/env node

/**
 * Script pour appliquer les migrations de schéma
 * Exécute directement le SQL via une requête POST à Supabase
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Charger les variables d'environnement
const envPath = join(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
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

// Définir les colonnes attendues avec leurs types
const COLUMNS_TO_CHECK = [
  { table: 'users', column: 'id', type: 'uuid' },
  { table: 'users', column: 'email', type: 'varchar(255)' },
  { table: 'users', column: 'name', type: 'varchar(255)' },
  { table: 'users', column: 'password', type: 'varchar(255)' },
  { table: 'users', column: 'branch_id', type: 'uuid' },
  { table: 'users', column: 'role_id', type: 'uuid' },
  { table: 'users', column: 'is_active', type: 'boolean' },
  { table: 'users', column: 'created_at', type: 'timestamp' },
  { table: 'roles', column: 'id', type: 'uuid' },
  { table: 'roles', column: 'name', type: 'varchar(100)' },
  { table: 'roles', column: 'code', type: 'varchar(50)' },
  { table: 'roles', column: 'is_active', type: 'boolean' },
  { table: 'branches', column: 'id', type: 'uuid' },
  { table: 'branches', column: 'name', type: 'varchar(255)' },
  { table: 'branches', column: 'code', type: 'varchar(50)' },
  { table: 'branches', column: 'is_active', type: 'boolean' },
  { table: 'evaluations', column: 'id', type: 'uuid' },
  { table: 'evaluations', column: 'employee_id', type: 'uuid' },
  { table: 'evaluations', column: 'status', type: 'varchar(50)' },
  { table: 'training_requests', column: 'id', type: 'uuid' },
  { table: 'training_requests', column: 'employee_id', type: 'uuid' },
  { table: 'training_requests', column: 'status', type: 'varchar(50)' },
];

async function checkColumnExists(tableName, columnName) {
  try {
    const { error } = await supabase
      .from(tableName)
      .select(columnName)
      .limit(1);

    if (!error || !error.message.includes(columnName)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function generateSQLFromMissing(missing) {
  if (missing.length === 0) return '-- Aucune migration requise';

  const lines = [];
  lines.push('-- SQL généré dynamiquement selon les colonnes manquantes');
  lines.push('');

  // Grouper par table
  const byTable = missing.reduce((acc, m) => {
    if (!acc[m.table]) acc[m.table] = [];
    acc[m.table].push(m);
    return acc;
  }, {});

  // Générer ALTER TABLE pour chaque table
  for (const [tableName, missingCols] of Object.entries(byTable)) {
    for (const col of missingCols) {
      const typeInfo = COLUMNS_TO_CHECK.find(c => c.table === tableName && c.column === col.column);
      if (typeInfo) {
        lines.push(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${col.column} ${typeInfo.type};`);
      }
    }
  }

  return lines.join('\n');
}

async function applyMigrations() {
  try {
    console.log('🚀 Application des migrations de schéma...');
    console.log(`📍 URL: ${SUPABASE_URL}\n`);

    // Vérifier chaque colonne
    console.log('🔍 Détection des colonnes manquantes...\n');
    const missingColumns = [];

    for (const { table, column } of COLUMNS_TO_CHECK) {
      const exists = await checkColumnExists(table, column);
      if (!exists) {
        missingColumns.push({ table, column });
        console.log(`❌ ${table}.${column} - MANQUANTE`);
      } else {
        console.log(`✅ ${table}.${column} - OK`);
      }
    }

    console.log(`\n📊 Résumé: ${missingColumns.length} colonnes manquantes sur ${COLUMNS_TO_CHECK.length}\n`);

    if (missingColumns.length === 0) {
      console.log('✅ Le schéma est complet! Aucune migration requise.');
      process.exit(0);
    }

    // Générer le SQL dynamique
    const dynamicSQL = await generateSQLFromMissing(missingColumns);
    console.log('📝 SQL à exécuter:\n');
    console.log(dynamicSQL);
    console.log('\n');

    const statements = dynamicSQL.split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    console.log(`📋 ${statements.length} migrations à appliquer\n`);

    let successCount = 0;
    const errors = [];

    for (const statement of statements) {
      try {
        // Essayer via RPC si la fonction existe
        const { data, error } = await supabase
          .rpc('execute_sql', { sql: statement });

        if (error) {
          if (error.message.includes('execute_sql')) {
            console.log(`⚠️  RPC execute_sql n'existe pas - migration manuelle requise`);
            console.log(`   SQL: ${statement.substring(0, 60)}...`);
            errors.push(`${statement.split(' ')[2] || 'unknown'}: RPC non disponible`);
          } else {
            console.log(`❌ Erreur: ${error.message}`);
            errors.push(`${statement.split(' ')[2] || 'unknown'}: ${error.message}`);
          }
        } else {
          console.log(`✅ ${statement.substring(0, 50)}...`);
          successCount++;
        }
      } catch (err) {
        console.log(`❌ Exception: ${err.message}`);
        errors.push(`${statement.split(' ')[2] || 'unknown'}: ${err.message}`);
      }
    }

    console.log(`\n📊 Résumé: ${successCount}/${statements.length} migrations appliquées\n`);

    if (errors.length > 0) {
      console.error(`\n⚠️  Erreurs rencontrées:`);
      errors.forEach(err => console.error(`   - ${err}`));
      console.log(`\n💡 Solution: Exécutez manuellement le SQL dans Supabase SQL Editor:\n`);
      console.log(dynamicSQL);
      process.exit(1);
    } else {
      console.log('✅ Toutes les migrations ont été appliquées avec succès!');
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

applyMigrations();
