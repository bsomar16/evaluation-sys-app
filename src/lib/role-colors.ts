/** Styles de badge rôle — identiques au header (AppLayout) */

export const roleColors: Record<string, { bg: string; text: string; label: string }> = {
  admin: { bg: '#ef4444', text: 'white', label: 'Administrateur' },
  hr: { bg: '#10b981', text: 'white', label: 'RH' },
  manager: { bg: '#f59e0b', text: 'white', label: 'Manager' },
  employee: { bg: '#3b82f6', text: 'white', label: 'Employé' },
};

export const roleBadgeClassName =
  'px-1.5 py-0 rounded-full border-2 font-semibold text-xs transition-all duration-200 inline-block';

/** Mappe un code rôle BDD (SUPER_ADMIN, HR_MANAGER, employee…) vers la clé header */
export function normalizeRoleKey(codeOrSlug?: string | null): keyof typeof roleColors {
  const raw = (codeOrSlug || '').toLowerCase().replace(/-/g, '_');
  if (raw === 'super_admin' || raw === 'admin') return 'admin';
  if (raw.includes('hr')) return 'hr';
  if (raw === 'manager') return 'manager';
  if (raw.includes('manager')) return 'manager';
  return 'employee';
}

export function getRoleBadgeStyle(roleKey: keyof typeof roleColors) {
  const colors = roleColors[roleKey] ?? roleColors.employee;
  return getRoleBadgeStyleFromColor(colors.bg);
}

/** Même rendu badge, avec la couleur enregistrée sur le rôle en BDD */
export function getRoleBadgeStyleFromColor(hexColor?: string | null) {
  const bg = hexColor?.trim() || '#3b82f6';
  return {
    borderColor: bg,
    backgroundColor: `${bg}15`,
    color: bg,
  };
}
