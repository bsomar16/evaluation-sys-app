import { migratePeriodScheduleToDatabase } from '@/lib/evaluation-period-db';

/**
 * Auto-migration du schema - DESACTIVEE (les DDL ne partent plus du navigateur).
 *
 * Historique : ce module executait du DDL depuis le client via la RPC
 * `execute_sql`, accordee au role `anon`. C'etait une faille directe : le
 * navigateur pouvait creer / modifier des tables, poser des portes derobees et
 * des fonctions SQL arbitraires sur la base de production.
 *
 * Les migrations sont desormais appliquees COTE SERVEUR, depuis les fichiers
 * `supabase/migrations/*.sql` (cPanel / API PHP). Aucun DDL ne part du client.
 */

/** Migration de donnees (planification des periodes) - sans DDL. */
export async function autoMigrateSchema(): Promise<void> {
  console.info('[db] Auto-migration desactivee : les migrations sont appliquees cote serveur.');
  await migratePeriodScheduleToDatabase();
}

/** Refuse d'executer du SQL arbitraire depuis le navigateur. */
export async function executeSQLMigration(_sql: string): Promise<{ success: boolean; error?: string }> {
  const error =
    "Les migrations SQL ne sont plus autorisees depuis le navigateur. Appliquez les fichiers de supabase/migrations cote serveur.";
  console.error('[db] ' + error);
  return { success: false, error };
}
