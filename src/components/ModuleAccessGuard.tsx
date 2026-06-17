import { Navigate } from 'react-router-dom';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import type { SidebarModuleKey } from '@/lib/role-permissions';

export function ModuleAccessGuard({
  moduleKey,
  children,
}: {
  moduleKey: SidebarModuleKey;
  children: React.ReactNode;
}) {
  const { isDeveloper, canRead } = useRolePermissions();

  if (isDeveloper || canRead(moduleKey)) {
    return <>{children}</>;
  }

  return <Navigate to="/" replace />;
}

export default ModuleAccessGuard;
