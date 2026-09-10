export type DashboardTemplate = 'classic' | 'analytics';

const STORAGE_KEY = 'dashboardTemplate';
export const DASHBOARD_TEMPLATE_EVENT = 'dashboardTemplateChange';

export function loadDashboardTemplate(): DashboardTemplate {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'analytics' ? 'analytics' : 'classic';
  } catch {
    return 'classic';
  }
}

export function saveDashboardTemplate(template: DashboardTemplate): void {
  try {
    localStorage.setItem(STORAGE_KEY, template);
  } catch {
    // localStorage indisponible (mode privé, etc.) : on ignore silencieusement.
  }
  window.dispatchEvent(new CustomEvent(DASHBOARD_TEMPLATE_EVENT, { detail: template }));
}
