import { Navigate } from 'react-router-dom';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { canAccessTrainingPlanning } from '@/lib/training-access';

export function TrainingPlanningGuard({ children }: { children: React.ReactNode }) {
  const { isDeveloper, canRead } = useRolePermissions();
  const canReadTrainingManagement = canRead('training_management');

  if (!canAccessTrainingPlanning(isDeveloper, canReadTrainingManagement)) {
    return <Navigate to="/training" replace />;
  }

  return <>{children}</>;
}

export default TrainingPlanningGuard;
