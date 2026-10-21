/**
 * Types et interfaces pour les rôles et permissions
 */

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  EMPLOYEE = 'employee',
  HR = 'hr'
}

export interface UserWithRole {
  id: string;
  email: string;
  name: string;
  position?: string;
  branch?: string;
  role: UserRole;
  avatar_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserPayload {
  email: string;
  name: string;
  password: string;
  position: string;
  branch: string;
  role: UserRole;
}

// Permissions par rôle
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  [UserRole.ADMIN]: [
    'users:create',
    'users:read',
    'users:update',
    'users:delete',
    'evaluations:create',
    'evaluations:read',
    'evaluations:update',
    'evaluations:delete',
    'training:create',
    'training:read',
    'training:update',
    'training:delete',
    'reports:create',
    'reports:read',
    'reports:update',
    'reports:delete',
    'settings:manage'
  ],
  [UserRole.HR]: [
    'users:create',
    'users:read',
    'users:update',
    'evaluations:create',
    'evaluations:read',
    'training:read',
    'training:create',
    'reports:read',
    'reports:create'
  ],
  [UserRole.MANAGER]: [
    'users:read',
    'evaluations:create',
    'evaluations:read',
    'evaluations:update',
    'training:read',
    'reports:read'
  ],
  [UserRole.EMPLOYEE]: [
    'evaluations:read',
    'training:read',
    'reports:read'
  ]
};

/**
 * Role plateforme (administrateur technique).
 * Source de verite : la BASE (table roles) - jamais code en dur.
 *
 * L'ancien compte hors BDD (compte code en dur) a ete supprime : il
 * ouvrait une session SUPER_ADMIN sans aucune verification en base,
 * et ses identifiants etaient affiches sur la page de connexion.
 */
export const PLATFORM_ADMIN_ROLE_NAMES = [
  'admin',
  'super_admin',
  'administrateur',
  'super administrateur',
] as const;

/** Compte démo employé — doit correspondre au seed `seedDemoUser` */
export const DEFAULT_DEMO = {
  username: 'demo',
  password: 'demo123',
  name: 'DEMO Utilisateur',
  role: UserRole.EMPLOYEE,
} as const;
