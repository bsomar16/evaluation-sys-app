import { SITE_DEVELOPER } from '@/types/roles';
import { getRoleBadgeStyleFromColor } from '@/lib/role-colors';
import {
  createFullEvaluationActionsPermissions,
  createFullSidebarPermissions,
  createFullTrainingActionsPermissions,
  serializeRolePermissions,
} from '@/lib/role-permissions';

/** Données utilisateur en session (localStorage) */

export interface SessionUser {
  id: string;
  username?: string;
  name: string;
  email?: string;
  role?: string;
  role_id?: string | null;
  roleName?: string;
  roleColor?: string;
  branch_id?: string | null;
  branchName?: string;
  department_id?: string | null;
  departmentName?: string;
  permissions?: Record<string, unknown>;
}

export function getSessionUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function getSessionRole(): string | null {
  return localStorage.getItem('userRole');
}

/** Compte créateur codé en dur (admin / Admin@2026) — jamais l'admin métier BDD */
export function isSiteDeveloper(user?: SessionUser | null): boolean {
  if (!user) return false;
  return user.id === SITE_DEVELOPER.id || user.role === SITE_DEVELOPER.role;
}

/** Corrige une ancienne session qui affichait encore « admin » / Administrateur */
export function repairSiteDeveloperSession(): SessionUser | null {
  const user = getSessionUser();
  if (!user) return null;

  const isDevAccount =
    user.id === SITE_DEVELOPER.id ||
    user.username?.toLowerCase() === SITE_DEVELOPER.username ||
    user.email?.toLowerCase() === SITE_DEVELOPER.username;

  if (!isDevAccount) return user;

  const fixed: SessionUser = {
    ...user,
    id: SITE_DEVELOPER.id,
    username: SITE_DEVELOPER.username,
    name: SITE_DEVELOPER.name,
    role: SITE_DEVELOPER.role,
    roleName: SITE_DEVELOPER.roleName,
    roleColor: SITE_DEVELOPER.roleColor,
    branch_id: null,
    branchName: undefined,
    department_id: null,
    departmentName: undefined,
  };

  localStorage.setItem('user', JSON.stringify(fixed));
  localStorage.setItem('userRole', SITE_DEVELOPER.role);
  return fixed;
}

/** Sous-titre header : filiale pour les utilisateurs BDD, panneau de contrôle pour le développeur */
export function getSessionHeaderSubtitle(user: SessionUser | null): string {
  if (isSiteDeveloper(user)) {
    return SITE_DEVELOPER.controlPanelLabel;
  }
  return user?.branchName?.trim() || '—';
}

export function getSessionRoleBadge(user: SessionUser | null): {
  label: string;
  style: ReturnType<typeof getRoleBadgeStyleFromColor>;
} {
  if (isSiteDeveloper(user)) {
    return {
      label: SITE_DEVELOPER.roleName,
      style: getRoleBadgeStyleFromColor(SITE_DEVELOPER.roleColor),
    };
  }
  const roleName = user?.roleName || user?.role || 'User';
  const departmentName = user?.departmentName ? ` ${user.departmentName}` : '';
  return {
    label: `${roleName}${departmentName}`,
    style: getRoleBadgeStyleFromColor(user?.roleColor),
  };
}

export function saveSiteDeveloperSession(hierarchyRoleId: string | null): SessionUser {
  const session: SessionUser = {
    id: SITE_DEVELOPER.id,
    username: SITE_DEVELOPER.username,
    name: SITE_DEVELOPER.name,
    email: SITE_DEVELOPER.username,
    role: SITE_DEVELOPER.role,
    role_id: hierarchyRoleId,
    roleName: SITE_DEVELOPER.roleName,
    roleColor: SITE_DEVELOPER.roleColor,
    branch_id: null,
    department_id: null,
    permissions: serializeRolePermissions(
      createFullSidebarPermissions(),
      createFullEvaluationActionsPermissions(),
      createFullTrainingActionsPermissions()
    ),
  };
  localStorage.setItem('user', JSON.stringify(session));
  localStorage.setItem('userRole', SITE_DEVELOPER.role);
  return session;
}
