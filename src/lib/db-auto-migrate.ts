import { supabase } from '@/integrations/supabase/client';
import { EXPECTED_DB_SCHEMA, buildAddColumnSql, buildCreateTableSql, TABLE_CREATION_ORDER } from '@/lib/expected-db-schema';
import { migratePeriodScheduleToDatabase } from '@/lib/evaluation-period-db';

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

  const missingTables: string[] = [];

  // First, create any missing tables
  for (const tableName of TABLE_CREATION_ORDER) {
    try {
      const { error: tableCheckError } = await supabase.from(tableName).select('*').limit(1);

      if (tableCheckError && tableCheckError.code === 'PGRST116') {
        console.log(`📝 Table ${tableName} n'existe pas, en train de la créer...`);
        missingTables.push(tableName);

        // Create the missing table
        const createSql = buildCreateTableSql(tableName);
        console.log(`📝 Exécution: ${createSql.substring(0, 50)}...`);

        const { error: createError } = await supabase.rpc('execute_sql', { sql: createSql });

        if (createError) {
          console.warn(`⚠️  Impossible de créer la table ${tableName}: ${createError.message}`);
        } else {
          console.log(`✅ Table ${tableName} créée avec succès`);
        }
        continue;
      }

      // Then check columns for existing tables
      for (const column of EXPECTED_DB_SCHEMA[tableName] || []) {
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

  // Migrations ciblées de contraintes (legacy → schéma actuel)
  await migrateCalculationRulesConstraints();

  // Migrate evaluation period schedule from localStorage to database
  await migratePeriodScheduleToDatabase();

  console.log('✅ Auto-migration complétée');
}

/**
 * Migre la table `calculation_rules` héritée (PK sur `type`, sans `id`) vers
 * le nouveau schéma (PK sur `id` uuid, plusieurs règles par type autorisées).
 * Idempotent : ne fait rien si déjà migrée.
 */
async function migrateCalculationRulesConstraints() {
  const statements: { label: string; sql: string }[] = [
    {
      label: 'backfill id',
      sql: `UPDATE calculation_rules SET id = gen_random_uuid() WHERE id IS NULL`,
    },
    {
      label: 'id NOT NULL',
      sql: `ALTER TABLE calculation_rules ALTER COLUMN id SET NOT NULL`,
    },
    {
      label: 'id DEFAULT gen_random_uuid()',
      sql: `ALTER TABLE calculation_rules ALTER COLUMN id SET DEFAULT gen_random_uuid()`,
    },
    {
      label: 'drop UNIQUE(type) legacy',
      sql: `ALTER TABLE calculation_rules DROP CONSTRAINT IF EXISTS calculation_rules_type_key`,
    },
    {
      label: 'PK sur id (si manquante)',
      sql: `DO $migrate_calc_pk$
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conrelid = 'calculation_rules'::regclass
                  AND contype = 'p'
                  AND (SELECT array_agg(attname ORDER BY attname)
                       FROM pg_attribute
                       WHERE attrelid = 'calculation_rules'::regclass
                         AND attnum = ANY(conkey)) = ARRAY['id']::name[]
              ) THEN
                BEGIN
                  ALTER TABLE calculation_rules DROP CONSTRAINT IF EXISTS calculation_rules_pkey;
                EXCEPTION WHEN OTHERS THEN NULL;
                END;
                ALTER TABLE calculation_rules ADD PRIMARY KEY (id);
              END IF;
            END
            $migrate_calc_pk$`,
    },
    {
      label: 'reload schema cache PostgREST',
      sql: `NOTIFY pgrst, 'reload schema'`,
    },
  ];

  for (const { label, sql } of statements) {
    const { error } = await supabase.rpc('execute_sql', { sql });
    if (error) {
      console.warn(`⚠️  Migration calculation_rules [${label}] ignorée: ${error.message}`);
    } else {
      console.log(`✅ Migration calculation_rules [${label}]`);
    }
  }
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
