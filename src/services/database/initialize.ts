/**
 * Service d'initialisation automatique de la base de données
 * Crée les tables automatiquement si elles n'existent pas
 */

import { supabase } from "@/integrations/supabase/client";
import { DATABASE_SCHEMAS } from "./schema";

export async function initializeDatabaseTables() {
  try {
    console.log("🔄 Vérification des tables de la base de données...");

    for (const schema of DATABASE_SCHEMAS) {
      const tableExists = await checkTableExists(schema.name);

      if (!tableExists) {
        console.log(`📝 Création de la table: ${schema.name}`);
        await createTable(schema);
        console.log(`✅ Table créée: ${schema.name}`);
      } else {
        console.log(`✓ Table existante: ${schema.name}`);
      }
    }

    console.log("✅ Initialisation de la base de données terminée!");
    return true;
  } catch (error) {
    console.error("❌ Erreur lors de l'initialisation:", error);
    return false;
  }
}

/**
 * Vérifie si une table existe
 */
async function checkTableExists(tableName: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(tableName)
      .select("*")
      .limit(1);

    // Si erreur 404 ou "relation does not exist", la table n'existe pas
    if (error?.code === "404" || error?.message?.includes("relation does not exist")) {
      return false;
    }

    // Si pas d'erreur ou autre erreur, la table existe
    return !error || error.code !== "404";
  } catch (error) {
    return false;
  }
}

/**
 * Crée une table depuis sa définition de schéma
 */
async function createTable(schema: any) {
  try {
    let sql = `CREATE TABLE IF NOT EXISTS ${schema.name} (\n`;

    // Construire les colonnes
    const columnsSQL = schema.columns
      .map((col: any) => {
        let colDef = `  ${col.name} ${col.type}`;

        if (col.constraints && col.constraints.length > 0) {
          colDef += ` ${col.constraints.join(" ")}`;
        }

        if (col.default) {
          colDef += ` DEFAULT ${col.default}`;
        }

        return colDef;
      })
      .join(",\n");

    sql += columnsSQL + "\n);\n";

    // Créer les indexes
    if (schema.indexes && schema.indexes.length > 0) {
      for (const index of schema.indexes) {
        const indexColumns = index.columns.join(", ");
        sql += `CREATE INDEX IF NOT EXISTS ${index.name} ON ${schema.name}(${indexColumns});\n`;
      }
    }

    // Exécuter le SQL via RPC (si disponible) ou via fetch direct
    console.log(`Exécution SQL pour ${schema.name}:`, sql);

    // Utiliser la fonction RPC pour exécuter du SQL personnalisé
    // Note: Cela nécessite une fonction Supabase - sinon, utiliser fetch direct
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/sql_query`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    if (!response.ok && response.status !== 404) {
      console.warn(`⚠️ Impossible de créer la table ${schema.name} via API`);
      // La table peut exister ou une autre erreur - on continue
    }
  } catch (error) {
    console.warn(`⚠️ Erreur lors de la création de ${schema.name}:`, error);
    // On continue même en cas d'erreur
  }
}

/**
 * Alternative: Utiliser une RPC Supabase pour exécuter du SQL
 * Cette fonction doit être créée dans Supabase:
 *
 * CREATE OR REPLACE FUNCTION public.execute_sql(sql_query text)
 * RETURNS json
 * LANGUAGE plpgsql
 * SECURITY DEFINER
 * AS $$
 * BEGIN
 *   EXECUTE sql_query;
 *   RETURN json_build_object('success', true);
 * EXCEPTION WHEN OTHERS THEN
 *   RETURN json_build_object('success', false, 'error', SQLERRM);
 * END;
 * $$;
 */
export async function executeSQL(sqlQuery: string) {
  try {
    const { data, error } = await supabase.rpc("execute_sql", {
      sql_query: sqlQuery,
    });

    if (error) {
      console.error("Erreur SQL:", error);
      return false;
    }

    return data?.success;
  } catch (error) {
    console.warn("RPC non disponible, les tables doivent être créées manuellement");
    return false;
  }
}
