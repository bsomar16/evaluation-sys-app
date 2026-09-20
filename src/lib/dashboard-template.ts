import { supabase } from '@/integrations/supabase/client';

export type DashboardTemplate = 'classic' | 'analytics';

const SETTING_KEY = 'dashboard_template';
const LOCAL_CACHE_KEY = 'dashboardTemplate';
export const DASHBOARD_TEMPLATE_EVENT = 'dashboardTemplateChange';

/** Défaut si rien n'a jamais été choisi (par personne) : le gabarit analytique. */
const DEFAULT_TEMPLATE: DashboardTemplate = 'analytics';

function readLocalCache(): DashboardTemplate {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    return raw === 'classic' || raw === 'analytics' ? raw : DEFAULT_TEMPLATE;
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

function writeLocalCache(template: DashboardTemplate): void {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, template);
  } catch {
    // localStorage indisponible : le cache local est un confort, pas la source de vérité.
  }
}

/**
 * Lecture instantanée (cache local du navigateur) pour un premier rendu sans attendre
 * la base de données. À utiliser uniquement pour l'état initial ; loadDashboardTemplate()
 * confirme/corrige ensuite depuis la valeur partagée par tous les utilisateurs.
 */
export function loadDashboardTemplateCached(): DashboardTemplate {
  return readLocalCache();
}

/** Valeur partagée par TOUS les utilisateurs, lue en base (table app_settings). */
export async function loadDashboardTemplate(): Promise<DashboardTemplate> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', SETTING_KEY)
      .limit(1);
    if (error || !data || data.length === 0) return readLocalCache();
    const raw = (data[0].value as { template?: string } | null)?.template;
    const resolved: DashboardTemplate = raw === 'classic' ? 'classic' : DEFAULT_TEMPLATE;
    writeLocalCache(resolved);
    return resolved;
  } catch {
    return readLocalCache();
  }
}

/** Change le modèle de tableau de bord pour TOUS les utilisateurs (écrit en base). */
export async function saveDashboardTemplate(template: DashboardTemplate): Promise<void> {
  writeLocalCache(template);
  window.dispatchEvent(new CustomEvent(DASHBOARD_TEMPLATE_EVENT, { detail: template }));
  try {
    await supabase
      .from('app_settings')
      .upsert({ key: SETTING_KEY, value: { template } }, { onConflict: 'key' });
  } catch {
    // Le cache local reste à jour pour cette session ; la base sera réessayée au
    // prochain changement. Ne bloque jamais l'UI sur une écriture réseau.
  }
}
