import { getRoleBadgeStyleFromColor } from '@/lib/role-colors';
import { PLATFORM_ADMIN_ROLE_NAMES } from '@/types/roles';

/** Donnees utilisateur en session (localStorage) */

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

/**
 * Administrateur plateforme - derive de la BASE (table roles), jamais code en dur.
 *
 * Remplace l'ancien compte code en dur (compte code en dur) qui ouvrait une
 * session SUPER_ADMIN sans aucune verification en base, et dont les identifiants
 * etaient affiches sur la page de connexion.
 *
 * Source de verite : le slug de session (users.role) ou le nom du role lu en base.
 */
export function isPlatformAdmin(user?: SessionUser | null): boolean {
  if (!user) return false;
  const slug = (user.role || '').trim().toLowerCase();
  if (slug === 'admin') return true;
  const name = (user.roleName || '').trim().toLowerCase();
  return (PLATFORM_ADMIN_ROLE_NAMES as readonly string[]).includes(name);
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

/** Sous-titre header : la filiale de l'utilisateur */
export function getSessionHeaderSubtitle(user: SessionUser | null): string {
  return user?.branchName?.trim() || '\u2014';
}

/** Libelle poste header / listes : role + service (ex. « Gerant RH ») */
export function formatRoleServiceLabel(
  roleName?: string | null,
  departmentName?: string | null
): string {
  const role = roleName?.trim() || '';
  const department = departmentName?.trim() ? ` ${departmentName.trim()}` : '';
  return `${role}${department}`.trim();
}

export function getSessionRoleBadge(user: SessionUser | null): {
  label: string;
  style: ReturnType<typeof getRoleBadgeStyleFromColor>;
} {
  const roleName = user?.roleName || user?.role || 'User';
  const label = formatRoleServiceLabel(roleName, user?.departmentName) || 'User';
  return {
    label,
    style: getRoleBadgeStyleFromColor(user?.roleColor),
  };
}
