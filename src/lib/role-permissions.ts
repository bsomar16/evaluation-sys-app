/**
 * Permissions par section sidebar : lecture / écriture / suppression
 * Stockées dans roles.permissions.sidebar (jsonb)
 */

export type SidebarModuleKey =
  | 'dashboard'
  | 'employees'
  | 'roles'
  | 'branches'
  | 'departments'
  | 'evaluation_criteria'
  | 'calculation_system'
  | 'evaluations'
  | 'evaluations_management'
  | 'training'
  | 'training_management';

export interface ModulePermission {
  read: boolean;
  write: boolean;
  delete: boolean;
}

export type SidebarPermissionsMap = Record<SidebarModuleKey, ModulePermission>;

export interface EvaluationActionsPermission {
  submit: boolean;
  review: boolean;
}

export interface TrainingActionsPermission {
  request: boolean;
  review: boolean;
}

export interface RolePermissionsPayload {
  all?: boolean;
  sidebar?: Partial<SidebarPermissionsMap>;
  evaluations_actions?: Partial<EvaluationActionsPermission>;
  training_actions?: Partial<TrainingActionsPermission>;
}

export const SIDEBAR_MODULE_DEFS: { key: SidebarModuleKey; label: string; paths: string[] }[] = [
  { key: 'dashboard', label: 'Tdb (Tableau de bord)', paths: ['/'] },
  { key: 'employees', label: 'Employé', paths: ['/equipe'] },
  { key: 'roles', label: 'Rôles', paths: ['/admin/roles'] },
  { key: 'branches', label: 'Filiale', paths: ['/admin/branches'] },
  { key: 'departments', label: 'Services', paths: ['/admin/departments'] },
  { key: 'evaluation_criteria', label: "Critères d'évaluation", paths: ['/admin/evaluation-criteria'] },
  { key: 'calculation_system', label: 'Système de calcul', paths: ['/admin/calculation-system'] },
  { key: 'evaluations', label: 'Évaluation', paths: ['/evaluation'] },
  {
    key: 'evaluations_management',
    label: 'Gestion des évaluations',
    paths: ['/admin/evaluations'],
  },
  { key: 'training', label: 'Formation', paths: ['/training'] },
  {
    key: 'training_management',
    label: 'Planification des formations',
    paths: ['/admin/training-planning', '/admin/training-analytics'],
  },
];

const MODULE_KEYS: SidebarModuleKey[] = [
  'dashboard',
  'employees',
  'roles',
  'branches',
  'departments',
  'evaluation_criteria',
  'calculation_system',
  'evaluations',
  'evaluations_management',
  'training',
  'training_management',
];

export function createEmptySidebarPermissions(): SidebarPermissionsMap {
  return MODULE_KEYS.reduce((acc, key) => {
    acc[key] = { read: false, write: false, delete: false };
    return acc;
  }, {} as SidebarPermissionsMap);
}

export function createFullSidebarPermissions(): SidebarPermissionsMap {
  return MODULE_KEYS.reduce((acc, key) => {
    acc[key] = { read: true, write: true, delete: true };
    return acc;
  }, {} as SidebarPermissionsMap);
}

export function createEmptyEvaluationActionsPermissions(): EvaluationActionsPermission {
  return { submit: false, review: false };
}

export function createFullEvaluationActionsPermissions(): EvaluationActionsPermission {
  return { submit: true, review: true };
}

export function createEmptyTrainingActionsPermissions(): TrainingActionsPermission {
  return { request: false, review: false };
}

export function createFullTrainingActionsPermissions(): TrainingActionsPermission {
  return { request: true, review: true };
}

export function parseRolePermissions(raw: unknown): {
  all: boolean;
  sidebar: SidebarPermissionsMap;
  evaluations_actions: EvaluationActionsPermission;
  training_actions: TrainingActionsPermission;
} {
  const empty = createEmptySidebarPermissions();
  const emptyEvalActions = createEmptyEvaluationActionsPermissions();
  const emptyTrainingActions = createEmptyTrainingActionsPermissions();
  if (!raw || typeof raw !== 'object') {
    return {
      all: false,
      sidebar: empty,
      evaluations_actions: emptyEvalActions,
      training_actions: emptyTrainingActions,
    };
  }

  const payload = raw as RolePermissionsPayload;
  if (payload.all === true) {
    return {
      all: true,
      sidebar: createFullSidebarPermissions(),
      evaluations_actions: createFullEvaluationActionsPermissions(),
      training_actions: createFullTrainingActionsPermissions(),
    };
  }

  const sidebar = createEmptySidebarPermissions();
  if (payload.sidebar && typeof payload.sidebar === 'object') {
    for (const key of MODULE_KEYS) {
      const row = payload.sidebar[key];
      if (row && typeof row === 'object') {
        sidebar[key] = {
          read: Boolean(row.read),
          write: Boolean(row.write),
          delete: Boolean(row.delete),
        };
      }
    }
  }

  // Ancien modèle : « evaluations » regroupait saisie + gestion
  const ev = sidebar.evaluations;
  if (
    ev?.read &&
    payload.sidebar &&
    typeof payload.sidebar === 'object' &&
    !('evaluations_management' in payload.sidebar)
  ) {
    sidebar.evaluations_management = {
      read: ev.read,
      write: ev.write,
      delete: ev.delete,
    };
  }

  const tr = sidebar.training;
  if (
    tr?.read &&
    payload.sidebar &&
    typeof payload.sidebar === 'object' &&
    !('training_management' in payload.sidebar)
  ) {
    sidebar.training_management = {
      read: tr.read,
      write: tr.write,
      delete: tr.delete,
    };
  }

  const evaluationsActions: EvaluationActionsPermission = {
    submit: Boolean(payload.evaluations_actions?.submit),
    review: Boolean(payload.evaluations_actions?.review),
  };
  // Backward compatibility: if old payload had only evaluations.write,
  // grant submit/review implicitly to avoid removing existing capabilities.
  if (!payload.evaluations_actions && sidebar.evaluations?.write) {
    evaluationsActions.submit = true;
    evaluationsActions.review = true;
  }

  const trainingActions: TrainingActionsPermission = {
    request: Boolean(payload.training_actions?.request),
    review: Boolean(payload.training_actions?.review),
  };
  if (!payload.training_actions && sidebar.training?.write) {
    trainingActions.request = true;
    trainingActions.review = true;
  }

  return { all: false, sidebar, evaluations_actions: evaluationsActions, training_actions: trainingActions };
}

export function serializeRolePermissions(
  sidebar: SidebarPermissionsMap,
  evaluationsActions: EvaluationActionsPermission,
  trainingActions?: TrainingActionsPermission
): RolePermissionsPayload {
  return {
    sidebar,
    evaluations_actions: evaluationsActions,
    training_actions: trainingActions ?? createEmptyTrainingActionsPermissions(),
  };
}

export function getModuleKeyForPath(pathname: string): SidebarModuleKey | null {
  for (const def of SIDEBAR_MODULE_DEFS) {
    if (def.key === 'dashboard') {
      if (pathname === '/' || pathname === '/admin') return 'dashboard';
      continue;
    }
    if (def.key === 'employees') {
      if (pathname === '/equipe' || pathname.startsWith('/equipe/')) return 'employees';
      continue;
    }
    if (def.paths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return def.key;
    }
  }
  return null;
}

export function canReadModule(
  key: SidebarModuleKey,
  effective: { all: boolean; sidebar: SidebarPermissionsMap }
): boolean {
  if (effective.all) return true;
  return effective.sidebar[key]?.read === true;
}

export function canWriteModule(
  key: SidebarModuleKey,
  effective: { all: boolean; sidebar: SidebarPermissionsMap }
): boolean {
  if (effective.all) return true;
  const row = effective.sidebar[key];
  return row?.read === true && row?.write === true;
}

export function canDeleteModule(
  key: SidebarModuleKey,
  effective: { all: boolean; sidebar: SidebarPermissionsMap }
): boolean {
  if (effective.all) return true;
  const row = effective.sidebar[key];
  return row?.read === true && row?.delete === true;
}

/** Met à jour une permission en gardant read/write/delete cohérents */
export function patchModulePermission(
  current: SidebarPermissionsMap,
  moduleKey: SidebarModuleKey,
  field: keyof ModulePermission,
  value: boolean
): SidebarPermissionsMap {
  const row = { ...current[moduleKey] };
  row[field] = value;
  if ((field === 'write' || field === 'delete') && value) {
    row.read = true;
  }
  if (field === 'read' && !value) {
    row.write = false;
    row.delete = false;
  }
  return { ...current, [moduleKey]: row };
}
