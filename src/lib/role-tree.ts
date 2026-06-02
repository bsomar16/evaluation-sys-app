/** Hiérarchie des rôles (child_roles + parent_role_id) */

export interface RoleRecord {
  id: string;
  name: string;
  code?: string;
  level?: number;
  color?: string;
  child_roles?: string[] | null;
  parent_role_id?: string | null;
}

function normalizeChildIds(child_roles?: string[] | null): string[] {
  if (!child_roles) return [];
  return Array.isArray(child_roles) ? child_roles.filter(Boolean) : [];
}

/** Rôles fils directs d'un rôle (par id) */
export function getDirectChildRoles(roleId: string, allRoles: RoleRecord[]): RoleRecord[] {
  const role = allRoles.find((r) => r.id === roleId);
  if (!role) return [];

  const childIds = new Set<string>(normalizeChildIds(role.child_roles));
  allRoles.forEach((r) => {
    if (r.parent_role_id === roleId) childIds.add(r.id);
  });

  return [...childIds]
    .map((id) => allRoles.find((r) => r.id === id))
    .filter((r): r is RoleRecord => Boolean(r))
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || (a.name || '').localeCompare(b.name || '', 'fr'));
}

/** Tous les rôles descendants (récursif) — pour filtrer les utilisateurs visibles */
export function collectDescendantRoleIds(roleId: string, allRoles: RoleRecord[]): string[] {
  const result = new Set<string>();

  const visit = (id: string) => {
    for (const child of getDirectChildRoles(id, allRoles)) {
      if (!result.has(child.id)) {
        result.add(child.id);
        visit(child.id);
      }
    }
  };

  visit(roleId);
  return [...result];
}
