import {
  LayoutDashboard,
  Users,
  Shield,
  Building2,
  Briefcase,
  Database,
  Settings,
  Cog,
  ClipboardList,
  Calculator,
  ClipboardCheck,
  GraduationCap,
} from 'lucide-react';
import { isSiteDeveloper } from '@/lib/session-user';
import { collectDescendantRoleIds, type RoleRecord } from '@/lib/role-tree';
import type { SessionUser } from '@/lib/session-user';
import {
  canReadModule,
  parseRolePermissions,
  type SidebarModuleKey,
} from '@/lib/role-permissions';

export interface AppNavItem {
  path: string;
  label: string;
  /** Clé i18n (nav.*) pour traduire le libellé à l'affichage */
  labelKey?: string;
  icon: typeof LayoutDashboard;
  moduleKey?: SidebarModuleKey;
}

const developerOnlyItems: AppNavItem[] = [
  { path: '/admin/users', label: 'Utilisateurs', labelKey: 'nav.users', icon: Users },
  { path: '/admin/schema', label: 'Schéma BD', labelKey: 'nav.schema', icon: Database },
  { path: '/admin/config', label: 'Configuration', labelKey: 'nav.config', icon: Settings },
];

/** Menu sidebar selon rôle, hiérarchie et permissions lecture */
export function buildNavItems(
  session: SessionUser | null,
  allRoles: RoleRecord[]
): AppNavItem[] {
  const isDeveloper = isSiteDeveloper(session);
  const parsed = isDeveloper
    ? parseRolePermissions({ all: true })
    : parseRolePermissions(session?.permissions);
  const effective = parsed;

  const items: AppNavItem[] = [];

  if (canReadModule('dashboard', effective)) {
    items.push({
      path: '/',
      label: 'Tableau de bord',
      labelKey: 'nav.dashboard',
      icon: LayoutDashboard,
      moduleKey: 'dashboard',
    });
  }

  // Liste « Employés » = utilisateurs des rôles fils — uniquement hors espace Développeur
  if (
    !isDeveloper &&
    canReadModule('employees', effective) &&
    session?.role_id &&
    allRoles.length > 0
  ) {
    const descendantIds = collectDescendantRoleIds(session.role_id, allRoles);
    if (descendantIds.length > 0) {
      items.push({ path: '/equipe', label: 'Employés', labelKey: 'nav.employees', icon: Users, moduleKey: 'employees' });
    }
  }

  if (canReadModule('roles', effective)) {
    items.push({ path: '/admin/roles', label: 'Rôles', labelKey: 'nav.roles', icon: Shield, moduleKey: 'roles' });
  }
  if (canReadModule('branches', effective)) {
    items.push({ path: '/admin/branches', label: 'Filiale', labelKey: 'nav.branches', icon: Building2, moduleKey: 'branches' });
  }
  if (canReadModule('departments', effective)) {
    items.push({
      path: '/admin/departments',
      label: 'Services',
      labelKey: 'nav.departments',
      icon: Briefcase,
      moduleKey: 'departments',
    });
  }
  if (canReadModule('evaluation_criteria', effective)) {
    items.push({
      path: '/admin/evaluation-criteria',
      label: "Critères d'évaluation",
      labelKey: 'nav.evaluation_criteria',
      icon: ClipboardList,
      moduleKey: 'evaluation_criteria',
    });
  }
  if (canReadModule('calculation_system', effective)) {
    items.push({
      path: '/admin/calculation-system',
      label: 'Système de calcul',
      labelKey: 'nav.calculation_system',
      icon: Calculator,
      moduleKey: 'calculation_system',
    });
  }
  if (canReadModule('evaluations', effective)) {
    items.push({
      path: '/evaluation',
      label: 'Évaluation',
      labelKey: 'nav.evaluations',
      icon: ClipboardCheck,
      moduleKey: 'evaluations',
    });
  }
  if (canReadModule('training', effective)) {
    items.push({
      path: '/training',
      label: 'Formation',
      labelKey: 'nav.training',
      icon: GraduationCap,
      moduleKey: 'training',
    });
  }

  if (isDeveloper) {
    items.push(...developerOnlyItems);
  }

  return items;
}

export function isNavItemActive(pathname: string, itemPath: string): boolean {
  if (itemPath === '/') {
    return pathname === '/' || pathname === '/admin';
  }
  if (itemPath === '/equipe') {
    return pathname === '/equipe' || pathname.startsWith('/equipe/');
  }
  if (itemPath === '/evaluation') {
    return pathname === '/evaluation';
  }
  if (itemPath === '/training') {
    return pathname === '/training';
  }
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}
