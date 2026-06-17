/** Hiérarchie des rôles (child_roles + parent_role_id) */

export interface RoleRecord {
  id: string;
  name: string;
  code?: string;
  level?: number;
  color?: string;
  child_roles?: string[] | null;
  parent_role_id?: string | null;
  is_user?: boolean;
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

/**
 * Rôles exactement un niveau en dessous (evaluator.level + 1).
 * Priorité : enfants directs → parent_role_id → descendants → tous les rôles au niveau + 1.
 */
export function collectImmediateSubordinateRoleIdsByLevel(
  evaluatorRoleId: string,
  allRoles: RoleRecord[]
): string[] {
  const evaluatorRole = allRoles.find((r) => r.id === evaluatorRoleId);
  if (!evaluatorRole) return [];

  const targetLevel = (evaluatorRole.level ?? 0) + 1;

  const directChildren = getDirectChildRoles(evaluatorRoleId, allRoles).filter(
    (role) => (role.level ?? 0) === targetLevel
  );
  if (directChildren.length > 0) {
    return directChildren.map((role) => role.id);
  }

  const linkedByParent = allRoles.filter(
    (role) => role.parent_role_id === evaluatorRoleId && (role.level ?? 0) === targetLevel
  );
  if (linkedByParent.length > 0) {
    return linkedByParent.map((role) => role.id);
  }

  const descendantIds = new Set(collectDescendantRoleIds(evaluatorRoleId, allRoles));
  const fromDescendants = allRoles.filter(
    (role) => (role.level ?? 0) === targetLevel && descendantIds.has(role.id)
  );
  if (fromDescendants.length > 0) {
    return fromDescendants.map((role) => role.id);
  }

  return allRoles
    .filter((role) => (role.level ?? 0) === targetLevel)
    .map((role) => role.id);
}
