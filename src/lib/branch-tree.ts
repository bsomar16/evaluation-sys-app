/** Hiérarchie des filiales (child_branches + parent_branch_id) */

export interface BranchRecord {
  id: string;
  name: string;
  code?: string;
  location?: string;
  is_active?: boolean;
  child_branches?: string[] | null;
  parent_branch_id?: string | null;
}

function normalizeChildIds(child_branches?: string[] | null): string[] {
  if (!child_branches) return [];
  return Array.isArray(child_branches) ? child_branches.filter(Boolean) : [];
}

/** Filiales filles directes */
export function getDirectChildBranches(branchId: string, allBranches: BranchRecord[]): BranchRecord[] {
  const branch = allBranches.find((b) => b.id === branchId);
  if (!branch) return [];

  const childIds = new Set<string>(normalizeChildIds(branch.child_branches));
  allBranches.forEach((b) => {
    if (b.parent_branch_id === branchId) childIds.add(b.id);
  });

  return [...childIds]
    .map((id) => allBranches.find((b) => b.id === id))
    .filter((b): b is BranchRecord => Boolean(b))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
}

/** Toutes les filiales descendantes (récursif) */
export function collectDescendantBranchIds(branchId: string, allBranches: BranchRecord[]): string[] {
  const result = new Set<string>();

  const visit = (id: string) => {
    for (const child of getDirectChildBranches(id, allBranches)) {
      if (!result.has(child.id)) {
        result.add(child.id);
        visit(child.id);
      }
    }
  };

  visit(branchId);
  return [...result];
}

/** Ancêtres d'une filiale (évite les cycles à l'édition) */
export function collectAncestorBranchIds(branchId: string, allBranches: BranchRecord[]): string[] {
  const result: string[] = [];
  let current = allBranches.find((b) => b.id === branchId);

  while (current?.parent_branch_id) {
    const parentId = current.parent_branch_id;
    if (result.includes(parentId)) break;
    result.push(parentId);
    current = allBranches.find((b) => b.id === parentId);
  }

  return result;
}

/** Filiale + toutes ses filles (pour filtrer les utilisateurs visibles) */
export function collectBranchScopeIds(branchId: string, allBranches: BranchRecord[]): string[] {
  return [branchId, ...collectDescendantBranchIds(branchId, allBranches)];
}
