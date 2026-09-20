import { useEffect, useState } from 'react';
import DashboardClassic from '@/pages/DashboardClassic';
import DashboardAnalytics from '@/pages/DashboardAnalytics';
import {
  DASHBOARD_TEMPLATE_EVENT,
  loadDashboardTemplate,
  loadDashboardTemplateCached,
  type DashboardTemplate,
} from '@/lib/dashboard-template';

/**
 * Sélecteur de gabarit de tableau de bord — le choix se fait dans Configuration
 * (UI Studio) et s'applique à tous les utilisateurs (réglage partagé en base).
 * Le cache local sert uniquement à peindre instantanément le premier rendu ;
 * la valeur de la base (partagée) est ensuite confirmée/corrigée juste après.
 */
export default function Dashboard() {
  const [template, setTemplate] = useState<DashboardTemplate>(() => loadDashboardTemplateCached());

  useEffect(() => {
    let cancelled = false;
    void loadDashboardTemplate().then((resolved) => {
      if (!cancelled) setTemplate(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<DashboardTemplate>).detail;
      setTemplate(detail ?? loadDashboardTemplateCached());
    };
    window.addEventListener(DASHBOARD_TEMPLATE_EVENT, onChange);
    return () => window.removeEventListener(DASHBOARD_TEMPLATE_EVENT, onChange);
  }, []);

  return template === 'analytics' ? <DashboardAnalytics /> : <DashboardClassic />;
}
