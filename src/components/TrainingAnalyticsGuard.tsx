import { Navigate } from 'react-router-dom';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { canAccessTrainingAnalytics } from '@/lib/training-access';

export function TrainingAnalyticsGuard({ children }: { children: React.ReactNode }) {
  const { isDeveloper, canRead } = useRolePermissions();

  if (!canAccessTrainingAnalytics(isDeveloper, canRead('training_management'), canRead('training'))) {
    return <Navigate to="/training" replace />;
  }

  return <>{children}</>;
}
