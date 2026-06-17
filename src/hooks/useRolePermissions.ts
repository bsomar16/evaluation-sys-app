import { useMemo } from 'react';
import {
  type SidebarModuleKey,
  parseRolePermissions,
  canReadModule,
  canWriteModule,
  canDeleteModule,
} from '@/lib/role-permissions';
import { getSessionUser, isSiteDeveloper } from '@/lib/session-user';

export function useRolePermissions() {
  const session = getSessionUser();
  const isDeveloper = isSiteDeveloper(session);

  const parsed = useMemo(() => {
    if (isDeveloper) return parseRolePermissions({ all: true });
    return parseRolePermissions(session?.permissions);
  }, [isDeveloper, session?.permissions]);

  const effective = parsed;

  return {
    isDeveloper,
    effective,
    canRead: (key: SidebarModuleKey) => canReadModule(key, effective),
    canWrite: (key: SidebarModuleKey) => canWriteModule(key, effective),
    canDelete: (key: SidebarModuleKey) => canDeleteModule(key, effective),
    canSubmitEvaluation: () => effective.all || effective.evaluations_actions.submit,
    canReviewEvaluation: () => effective.all || effective.evaluations_actions.review,
    canViewEvaluationValues: () => effective.all || effective.evaluations_actions.values,
    canRequestTraining: () => effective.all || effective.training_actions.request,
    canReviewTraining: () => effective.all || effective.training_actions.review,
  };
}
