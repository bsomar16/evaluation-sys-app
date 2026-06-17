import { useEffect, useMemo, useState } from 'react';
import {
  type SidebarModuleKey,
  parseRolePermissions,
  canReadModule,
  canWriteModule,
  canDeleteModule,
} from '@/lib/role-permissions';
import { SESSION_PERMISSIONS_UPDATED_EVENT } from '@/lib/session-permissions';
import { getSessionUser, isSiteDeveloper } from '@/lib/session-user';

export function useRolePermissions() {
  const [permissionVersion, setPermissionVersion] = useState(0);

  useEffect(() => {
    const onUpdated = () => setPermissionVersion((value) => value + 1);
    window.addEventListener(SESSION_PERMISSIONS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(SESSION_PERMISSIONS_UPDATED_EVENT, onUpdated);
  }, []);

  const session = useMemo(() => getSessionUser(), [permissionVersion]);
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
