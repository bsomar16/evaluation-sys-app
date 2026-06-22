/**
 * Service d'initialisation automatique de la base de données
 * Crée automatiquement les tables et seed les données (comme Firestore)
 */

import { initializeDatabaseTables, seedAllDefaults } from "@/services/database";
import { autoMigrateSchema } from "@/lib/db-auto-migrate";

let initPromise: Promise<boolean> | null = null;
const DB_INIT_CACHE_KEY = "db_init_success_v2";
const DB_INIT_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export async function initializeDatabase(): Promise<boolean> {
  // Évite les initialisations multiples
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const now = Date.now();
      const cachedAtRaw = localStorage.getItem(DB_INIT_CACHE_KEY);
      const cachedAt = cachedAtRaw ? Number(cachedAtRaw) : 0;
      if (cachedAt > 0 && now - cachedAt < DB_INIT_TTL_MS) {
        return true;
      }

      console.log("🚀 Initialisation de la base de données...");

      // Étape 0: Auto-migration du schéma (ajouter colonnes manquantes)
      await autoMigrateSchema();

      // Étape 1: Créer les tables automatiquement
      const tablesCreated = await initializeDatabaseTables();

      if (!tablesCreated) {
        console.warn("⚠️ Certaines tables n'ont pas pu être créées");
        return false;
      }

      // Étape 2: Seed les données par défaut (rôles, branches)
      const seedSuccess = await seedAllDefaults();

      if (!seedSuccess) {
        console.warn("⚠️ Le seeding des données par défaut peut ne pas être complet");
      }

      localStorage.setItem(DB_INIT_CACHE_KEY, String(now));
      console.log("✅ Base de données initialisée avec succès!");
      return true;
    } catch (error: any) {
      console.error("❌ Erreur lors de l'initialisation:", error);

      return false;
    }
  })();

  return initPromise;
}

// Export une fonction pour appeler manuellement
export async function reinitializeDatabase() {
  initPromise = null;
  localStorage.removeItem(DB_INIT_CACHE_KEY);
  return initializeDatabase();
}
