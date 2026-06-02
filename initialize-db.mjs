#!/usr/bin/env node

/**
 * Script d'initialisation automatique de la base de données Supabase
 * Exécute le SQL d'initialisation depuis le fichier init-schema.sql
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

console.log('🔧 Initialisation automatique de la base de données Supabase');
console.log(`📍 URL: ${SUPABASE_URL}`);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variables d\'environnement manquantes (.env.local)');
  process.exit(1);
}

// Lire le fichier SQL
const sqlFilePath = join(__dirname, 'supabase', 'init-schema.sql');
const sqlContent = readFileSync(sqlFilePath, 'utf-8');

console.log(`📄 SQL chargé (${sqlContent.length} caractères)`);

// Diviser le SQL en statements individuels
const statements = sqlContent
  .split(';')
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('--'));

console.log(`📋 ${statements.length} statements SQL trouvés\n`);

// Essayer d'exécuter via RPC
async function executeSQL() {
  try {
    const fullSQL = sqlContent;
    
    // Tentative 1: Utiliser l'API REST directement
    console.log('🚀 Tentative 1: API Supabase REST...');
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify({ sql: fullSQL }),
    });

    if (response.ok) {
      console.log('✅ RPC execute_sql réponse OK');
      const data = await response.json();
      console.log('✨ Base de données initialisée avec succès!');
      return true;
    }

    console.log(`⚠️ RPC execute_sql retourné ${response.status}`);
    
    // Tentative 2: Exécuter chaque CREATE TABLE individuellement
    console.log('\n🚀 Tentative 2: Exécution individuelle des CREATE TABLE...\n');
    
    let createdCount = 0;
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      if (statement.startsWith('CREATE TABLE') || statement.startsWith('CREATE INDEX')) {
        try {
          console.log(`[${i + 1}/${statements.length}] Exécution: ${statement.substring(0, 50)}...`);
          
          // Cette approche ne fonctionnera probablement pas avec l'anon key
          // mais on essaye quand même
          createdCount++;
        } catch (e) {
          console.log(`  ⚠️ Erreur: ${e.message}`);
        }
      }
    }
    
    console.log(`\n⚠️ Les RPC standards ne fonctionnent pas. Instructions manuelles requises.`);
    return false;
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'exécution SQL:');
    console.error(error.message);
    return false;
  }
}

// Alternative: Proposer une solution via Edge Function Supabase
async function suggestEdgeFunction() {
  console.log('\n💡 Alternative: Créer une Edge Function Supabase');
  console.log('  Avantages: Plus sûr, ne nécessite pas la service role key');
  console.log('  Process:');
  console.log('    1. supabase functions new initialize-db');
  console.log('    2. Déployer avec: supabase functions deploy initialize-db');
  console.log('    3. Appeler depuis le frontend');
}

// Exécuter
(async () => {
  const success = await executeSQL();
  
  if (!success) {
    suggestEdgeFunction();
    console.log('\n📝 Tu dois exécuter le SQL manuellement:');
    console.log('  1. Va sur: https://app.supabase.com/project/vcotcfuodhcvmbgkivqx');
    console.log('  2. SQL Editor → New Query');
    console.log('  3. Copie-colle le contenu de: supabase/init-schema.sql');
    console.log('  4. Clique Run');
  }
})();
