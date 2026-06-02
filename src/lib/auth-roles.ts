/**
 * Slugs de session, redirection post-login et accès admin (alignés sur les codes rôles BDD).
 */

export type SessionRoleSlug = 'developer' | 'admin' | 'hr' | 'manager' | 'employee';

export const DEVELOPER_ROLE_SLUG = 'developer' as const;

export function isDeveloperRole(roleSlug?: string | null): boolean {
  return (roleSlug || '').toLowerCase() === DEVELOPER_ROLE_SLUG;
}

/** Slug stocké dans users.role / localStorage — indépendant de la casse du code BDD */
export function roleSlugFromRoleCode(code?: string | null): SessionRoleSlug {
  const raw = (code || '').toLowerCase().replace(/-/g, '_');
  if (raw === 'super_admin' || raw === 'admin') return 'admin';
  if (raw === 'hr' || raw.includes('hr')) return 'hr';
  if (raw === 'manager') return 'manager';
  return 'employee';
}

/** Accès zone admin (créateur du site + administrateurs BDD) */
export function isAdminRole(roleSlug?: string | null): boolean {
  return isDeveloperRole(roleSlug) || roleSlugFromRoleCode(roleSlug) === 'admin';
}

export function getHomePathForRole(_roleSlug?: string | null): string {
  return '/';
}
