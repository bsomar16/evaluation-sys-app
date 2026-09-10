import { useEffect, useState } from 'react';
import DashboardClassic from '@/pages/DashboardClassic';
import DashboardAnalytics from '@/pages/DashboardAnalytics';
import { DASHBOARD_TEMPLATE_EVENT, loadDashboardTemplate, type DashboardTemplate } from '@/lib/dashboard-template';

/**
 * Sélecteur de gabarit de tableau de bord — le choix se fait dans
 * Configuration (UI Studio) et est appliqué immédiatement ici.
 */
export default function Dashboard() {
  const [template, setTemplate] = useState<DashboardTemplate>(() => loadDashboardTemplate());

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<DashboardTemplate>).detail;
      setTemplate(detail ?? loadDashboardTemplate());
    };
    window.addEventListener(DASHBOARD_TEMPLATE_EVENT, onChange);
    return () => window.removeEventListener(DASHBOARD_TEMPLATE_EVENT, onChange);
  }, []);

  return template === 'analytics' ? <DashboardAnalytics /> : <DashboardClassic />;
}
