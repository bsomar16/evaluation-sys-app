import { supabase } from '@/integrations/supabase/client';
import { seedDemoUser } from '@/services/database';

/**
 * Initialise la base de données avec les tables requises
 * Utilise l'approche directe sans RPC pour éviter les problèmes de permissions
 */

export async function initializeTablesDirectly() {
  try {
    console.log('🚀 Vérification/création des tables Supabase...');

    // Essaie de lire de la table users
    const { error: usersCheckError } = await supabase
      .from('users')
      .select('id', { count: 'exact' })
      .limit(1);

    // Si pas d'erreur, les tables existent
    if (!usersCheckError || usersCheckError.code === 'PGRST116') {
      console.log('✅ Les tables existent déjà');
      return true;
    }

    // Les tables n'existent pas - affiche message pour création manuelle
    console.warn('⚠️ Tables manquantes. Veuillez les créer manuellement via Supabase SQL Editor');
    return false;
  } catch (error) {
    console.error('❌ Erreur vérification BD:', error);
    return false;
  }
}

/**
 * Ajoute les données de test
 */
/** Crée le compte démo (username `demo`) s'il n'existe pas */
export async function seedTestData() {
  try {
    await seedDemoUser();
  } catch (error) {
    console.warn('⚠️ Erreur ajout compte démo:', error);
  }
}
