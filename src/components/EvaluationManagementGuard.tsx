import { Navigate } from 'react-router-dom';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { canAccessEvaluationManagement } from '@/lib/evaluation-access';

export function EvaluationManagementGuard({ children }: { children: React.ReactNode }) {
  const { isDeveloper, canRead } = useRolePermissions();
  const canReadEvaluationsManagement = canRead('evaluations_management');

  if (!canAccessEvaluationManagement(isDeveloper, canReadEvaluationsManagement)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default EvaluationManagementGuard;
