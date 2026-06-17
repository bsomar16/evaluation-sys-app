import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  type SidebarModuleKey,
  parseRolePermissions,
  canReadModule,
  canWriteModule,
  canDeleteModule,
} from '@/lib/role-permissions';
import {
  notifySessionPermissionsUpdated,
  refreshSessionPermissionsFromRole,
  SESSION_PERMISSIONS_UPDATED_EVENT,
} from '@/lib/session-permissions';
import { getSessionUser, isSiteDeveloper } from '@/lib/session-user';

export function useRolePermissions() {
  const [permissionVersion, setPermissionVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const bump = () => {
      if (!cancelled) setPermissionVersion((value) => value + 1);
    };

    const refresh = async () => {
      await refreshSessionPermissionsFromRole();
      bump();
      notifySessionPermissionsUpdated();
    };

    void refresh();

    const onUpdated = () => bump();
    window.addEventListener(SESSION_PERMISSIONS_UPDATED_EVENT, onUpdated);

    const session = getSessionUser();
    const channel =
      session?.role_id && !isSiteDeveloper(session)
        ? supabase
            .channel(`role-permissions-${session.role_id}`)
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'roles',
                filter: `id=eq.${session.role_id}`,
              },
              () => {
                void refresh();
              }
            )
            .subscribe()
        : null;

    return () => {
      cancelled = true;
      window.removeEventListener(SESSION_PERMISSIONS_UPDATED_EVENT, onUpdated);
      if (channel) void supabase.removeChannel(channel);
    };
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
