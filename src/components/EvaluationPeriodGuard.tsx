import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import {
  canAccessEvaluationManagement,
  canAccessEvaluationPage,
  hasEvaluationModuleAccess,
} from '@/lib/evaluation-access';
import {
  isEvaluationPeriodOpen,
  subscribeEvaluationPeriodChange,
} from '@/lib/evaluation-period-storage';

export function EvaluationPeriodGuard({ children }: { children: React.ReactNode }) {
  const { isDeveloper, canRead, canWrite } = useRolePermissions();
  const canReadEvaluations = canRead('evaluations');
  const canWriteEvaluations = canWrite('evaluations');
  const canReadEvaluationsManagement = canRead('evaluations_management');
  const [periodOpen, setPeriodOpen] = useState(() => isEvaluationPeriodOpen());

  useEffect(() => {
    setPeriodOpen(isEvaluationPeriodOpen());
    return subscribeEvaluationPeriodChange(setPeriodOpen);
  }, []);

  if (!hasEvaluationModuleAccess(isDeveloper, canReadEvaluations, canWriteEvaluations)) {
    return <Navigate to="/" replace />;
  }

  if (
    !canAccessEvaluationPage(
      isDeveloper,
      canReadEvaluations,
      canWriteEvaluations,
      periodOpen
    )
  ) {
    const canManage = canAccessEvaluationManagement(
      isDeveloper,
      canReadEvaluationsManagement
    );

    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4 max-w-lg mx-auto">
        <Lock className="h-12 w-12 text-muted-foreground" />
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Évaluation verrouillée</h2>
          <p className="text-sm text-muted-foreground">
            Aucune période d&apos;évaluation active. Cette page est inaccessible jusqu&apos;à
            ouverture ou programmation d&apos;une période.
          </p>
        </div>
        {canManage && (
          <Button variant="outline" asChild>
            <Link to="/admin/evaluations">Gestion des évaluations</Link>
          </Button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}

export default EvaluationPeriodGuard;
