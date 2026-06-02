/**
 * Tableau de bord unifié (tous les rôles avec permission lecture dashboard)
 */

import Dashboard from '@/pages/Dashboard';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { ModuleAccessDenied } from '@/components/ModuleAccessDenied';

export default function AdminPanel() {
  const { canRead } = useRolePermissions();
  if (!canRead('dashboard')) {
    return <ModuleAccessDenied />;
  }
  return <Dashboard />;
}
