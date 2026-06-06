import { collectDescendantBranchIds, type BranchRecord } from '@/lib/branch-tree';
import { collectDescendantDepartmentIds, type DepartmentRecord } from '@/lib/department-tree';
import { collectDescendantRoleIds, type RoleRecord } from '@/lib/role-tree';
import type { SessionUser } from '@/lib/session-user';
import { isSiteDeveloper } from '@/lib/session-user';

export interface UserCreationScope {
  unrestricted: boolean;
  roleIds: string[];
  branchIds: string[];
  departmentIds: string[];
}

/** Périmètre assignable à la création / édition d'utilisateurs (rôles / filiales / départements fils uniquement). */
export function getUserCreationScope(
  session: SessionUser | null,
  allRoles: RoleRecord[],
  allBranches: BranchRecord[],
  allDepartments: DepartmentRecord[]
): UserCreationScope {
  if (isSiteDeveloper(session)) {
    return {
      unrestricted: true,
      roleIds: allRoles.map((r) => r.id),
      branchIds: allBranches.map((b) => b.id),
      departmentIds: allDepartments.map((d) => d.id),
    };
  }

  const roleIds =
    session?.role_id && allRoles.length > 0
      ? collectDescendantRoleIds(session.role_id, allRoles)
      : [];

  // Pour les filiales : si l'utilisateur a une filiale, lui + ses descendants ; sinon toutes les filiales
  const branchIds = session?.branch_id && allBranches.length > 0
    ? [session.branch_id, ...collectDescendantBranchIds(session.branch_id, allBranches)]
    : allBranches.map((b) => b.id);

  // Pour les départements : si l'utilisateur a un département, lui + ses descendants ; sinon TOUS les départements
  const departmentIds = session?.department_id && allDepartments.length > 0
    ? [session.department_id, ...collectDescendantDepartmentIds(session.department_id, allDepartments)]
    : allDepartments.map((d) => d.id);

  return {
    unrestricted: false,
    roleIds,
    branchIds,
    departmentIds,
  };
}

export function isRoleAssignable(roleId: string, scope: UserCreationScope, keepIds: string[] = []): boolean {
  if (scope.unrestricted) return true;
  return scope.roleIds.includes(roleId) || keepIds.includes(roleId);
}

export function isBranchAssignable(branchId: string, scope: UserCreationScope, keepIds: string[] = []): boolean {
  if (scope.unrestricted) return true;
  return scope.branchIds.includes(branchId) || keepIds.includes(branchId);
}

export function isDepartmentAssignable(
  departmentId: string,
  scope: UserCreationScope,
  keepIds: string[] = []
): boolean {
  if (scope.unrestricted) return true;
  return scope.departmentIds.includes(departmentId) || keepIds.includes(departmentId);
}

export function filterByScope<T extends { id: string }>(
  items: T[],
  allowedIds: string[],
  unrestricted: boolean,
  keepIds: string[] = []
): T[] {
  if (unrestricted) return items;
  const allowed = new Set([...allowedIds, ...keepIds.filter(Boolean)]);
  return items.filter((item) => allowed.has(item.id));
}
