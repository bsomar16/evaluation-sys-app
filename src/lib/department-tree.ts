/** Hiérarchie des services (child_departments + parent_department_id) */

export interface DepartmentRecord {
  id: string;
  name: string;
  is_active?: boolean;
  child_departments?: string[] | null;
  parent_department_id?: string | null;
}

function normalizeChildIds(child_departments?: string[] | null): string[] {
  if (!child_departments) return [];
  return Array.isArray(child_departments) ? child_departments.filter(Boolean) : [];
}

export function getDirectChildDepartments(
  departmentId: string,
  allDepartments: DepartmentRecord[]
): DepartmentRecord[] {
  const dept = allDepartments.find((d) => d.id === departmentId);
  if (!dept) return [];

  const childIds = new Set<string>(normalizeChildIds(dept.child_departments));
  allDepartments.forEach((d) => {
    if (d.parent_department_id === departmentId) childIds.add(d.id);
  });

  return [...childIds]
    .map((id) => allDepartments.find((d) => d.id === id))
    .filter((d): d is DepartmentRecord => Boolean(d))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
}

export function collectDescendantDepartmentIds(
  departmentId: string,
  allDepartments: DepartmentRecord[]
): string[] {
  const result = new Set<string>();

  const visit = (id: string) => {
    for (const child of getDirectChildDepartments(id, allDepartments)) {
      if (!result.has(child.id)) {
        result.add(child.id);
        visit(child.id);
      }
    }
  };

  visit(departmentId);
  return [...result];
}

export function collectAncestorDepartmentIds(
  departmentId: string,
  allDepartments: DepartmentRecord[]
): string[] {
  const result: string[] = [];
  let current = allDepartments.find((d) => d.id === departmentId);

  while (current?.parent_department_id) {
    const parentId = current.parent_department_id;
    if (result.includes(parentId)) break;
    result.push(parentId);
    current = allDepartments.find((d) => d.id === parentId);
  }

  return result;
}

export function collectDepartmentScopeIds(
  departmentId: string,
  allDepartments: DepartmentRecord[]
): string[] {
  return [departmentId, ...collectDescendantDepartmentIds(departmentId, allDepartments)];
}

