import { supabase } from '@/integrations/supabase/client';
import { getSessionUser, isSiteDeveloper, type SessionUser } from '@/lib/session-user';

export const SESSION_PERMISSIONS_UPDATED_EVENT = 'session-permissions-updated';

let refreshInFlight: Promise<SessionUser | null> | null = null;
let watcherRoleId: string | null = null;
let watcherCleanup: (() => void) | null = null;

/** Recharge les permissions du rôle courant depuis la BDD et met à jour la session locale. */
export async function refreshSessionPermissionsFromRole(): Promise<SessionUser | null> {
  const user = getSessionUser();
  if (!user || isSiteDeveloper(user) || !user.role_id) {
    return user;
  }

  try {
    const { data: roleRow, error } = await supabase
      .from('roles')
      .select('permissions, name, color')
      .eq('id', user.role_id)
      .maybeSingle();

    if (error || !roleRow) return user;

    const updated: SessionUser = {
      ...user,
      roleName: roleRow.name ?? user.roleName,
      roleColor: roleRow.color ?? user.roleColor,
      permissions: (roleRow.permissions as Record<string, unknown>) ?? {},
    };

    localStorage.setItem('user', JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error('Failed to refresh session permissions:', error);
    return user;
  }
}

export function notifySessionPermissionsUpdated(): void {
  window.dispatchEvent(new CustomEvent(SESSION_PERMISSIONS_UPDATED_EVENT));
}

/** Rafraîchit les permissions une seule fois (appels concurrents partagés). */
export async function refreshSessionPermissionsOnce(): Promise<SessionUser | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshSessionPermissionsFromRole()
      .then((user) => {
        notifySessionPermissionsUpdated();
        return user;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** Un seul abonnement Realtime par rôle (évite le crash Supabase multi-instances). */
export function ensureRolePermissionsWatcher(roleId: string | null | undefined): void {
  if (!roleId || watcherRoleId === roleId) return;

  if (watcherCleanup) {
    watcherCleanup();
    watcherCleanup = null;
  }

  watcherRoleId = roleId;

  const channel = supabase
    .channel(`role-permissions-${roleId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'roles',
        filter: `id=eq.${roleId}`,
      },
      () => {
        void refreshSessionPermissionsOnce();
      }
    )
    .subscribe();

  watcherCleanup = () => {
    void supabase.removeChannel(channel);
    if (watcherRoleId === roleId) watcherRoleId = null;
  };
}

export function stopRolePermissionsWatcher(): void {
  watcherCleanup?.();
  watcherCleanup = null;
  watcherRoleId = null;
}
