import { supabase } from '@/integrations/supabase/client';
import { EXPECTED_DB_SCHEMA, buildAddColumnSql } from '@/lib/expected-db-schema';

const EXECUTE_SQL_UNAVAILABLE_KEY = 'execute_sql_unavailable_v1';

/**
 * Vérifie les colonnes et les ajoute automatiquement si elles manquent
 */
export async function autoMigrateSchema() {
  console.log('🔄 Auto-migration du schéma de base de données...');

  if (localStorage.getItem(EXECUTE_SQL_UNAVAILABLE_KEY) === '1') {
    return;
  }

  const probe = await supabase.rpc('execute_sql', { sql: 'select 1' });
  if (probe.error) {
    // Évite de réessayer à chaque chargement quand la RPC n'existe pas.
    localStorage.setItem(EXECUTE_SQL_UNAVAILABLE_KEY, '1');
    console.warn(`⚠️  Auto-migration désactivée: ${probe.error.message}`);
    return;
  }

  for (const [tableName, columns] of Object.entries(EXPECTED_DB_SCHEMA)) {
    try {
      const { error: tableCheckError } = await supabase.from(tableName).select('*').limit(1);

      if (tableCheckError && tableCheckError.code === 'PGRST116') {
        console.warn(`⚠️  Table ${tableName} n'existe pas encore`);
        continue;
      }

      for (const column of columns) {
        try {
          const { error: columnCheckError } = await supabase
            .from(tableName)
            .select(column.name)
            .limit(1);

          if (columnCheckError?.message?.includes(column.name)) {
            console.log(`📝 Ajout de la colonne ${tableName}.${column.name}...`);

            const sql = buildAddColumnSql(tableName, column).replace(/;$/, '');
            const { error: alterError } = await supabase.rpc('execute_sql', { sql });

            if (alterError) {
              console.warn(`⚠️  Impossible d'ajouter ${column.name}: ${alterError.message}`);
            } else {
              console.log(`✅ Colonne ${column.name} ajoutée à ${tableName}`);
            }
          }
        } catch {
          // colonne probablement présente
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️  Erreur vérification table ${tableName}: ${message}`);
    }
  }

  console.log('✅ Auto-migration complétée');
}

export async function executeSQLMigration(sql: string) {
  try {
    const { error } = await supabase.rpc('execute_sql', { sql });
    if (error) throw error;
    localStorage.removeItem(EXECUTE_SQL_UNAVAILABLE_KEY);
    return { success: true };
  } catch (error) {
    console.error("❌ Impossible d'exécuter migration SQL:", error);
    return { success: false, error };
  }
}
