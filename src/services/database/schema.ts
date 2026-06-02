/**
 * Définition des schémas de base de données
 * Utilisé pour l'initialisation automatique des tables
 */

export interface TableSchema {
  name: string;
  columns: ColumnDef[];
  indexes?: IndexDef[];
}

export interface ColumnDef {
  name: string;
  type: string;
  constraints?: string[];
  default?: string;
}

export interface IndexDef {
  name: string;
  columns: string[];
}

export const DATABASE_SCHEMAS: TableSchema[] = [
  // =====================
  // TABLE: BRANCHES (Filiales)
  // =====================
  {
    name: "branches",
    columns: [
      {
        name: "id",
        type: "uuid",
        constraints: ["PRIMARY KEY", "DEFAULT gen_random_uuid()"],
      },
      {
        name: "name",
        type: "varchar(255)",
        constraints: ["UNIQUE", "NOT NULL"],
      },
      {
        name: "code",
        type: "varchar(50)",
        constraints: ["UNIQUE"],
      },
      {
        name: "location",
        type: "varchar(255)",
      },
      {
        name: "parent_branch_id",
        type: "uuid",
        constraints: ["REFERENCES branches(id) ON DELETE SET NULL"],
      },
      {
        name: "child_branches",
        type: "text[]",
        default: "'{}'",
      },
      {
        name: "is_active",
        type: "boolean",
        default: "true",
      },
      {
        name: "created_at",
        type: "timestamp",
        default: "now()",
      },
      {
        name: "updated_at",
        type: "timestamp",
        default: "now()",
      },
    ],
    indexes: [
      {
        name: "idx_branches_name",
        columns: ["name"],
      },
      {
        name: "idx_branches_code",
        columns: ["code"],
      },
    ],
  },

  // =====================
  // TABLE: ROLES (Hiérarchie des rôles)
  // =====================
  {
    name: "roles",
    columns: [
      {
        name: "id",
        type: "uuid",
        constraints: ["PRIMARY KEY", "DEFAULT gen_random_uuid()"],
      },
      {
        name: "name",
        type: "varchar(100)",
        constraints: ["UNIQUE", "NOT NULL"],
      },
      {
        name: "code",
        type: "varchar(50)",
        constraints: ["UNIQUE"],
      },
      {
        name: "parent_role_id",
        type: "uuid",
        constraints: ["REFERENCES roles(id) ON DELETE SET NULL"],
      },
      {
        name: "level",
        type: "integer",
        default: "0",
      },
      {
        name: "color",
        type: "varchar(7)",
        default: "'#3b82f6'",
      },
      {
        name: "child_roles",
        type: "text[]",
        default: "'{}'",
      },
      {
        name: "permissions",
        type: "jsonb",
        default: "'{}'::jsonb",
      },
      {
        name: "is_active",
        type: "boolean",
        default: "true",
      },
      {
        name: "created_at",
        type: "timestamp",
        default: "now()",
      },
      {
        name: "updated_at",
        type: "timestamp",
        default: "now()",
      },
    ],
    indexes: [
      {
        name: "idx_roles_code",
        columns: ["code"],
      },
      {
        name: "idx_roles_parent",
        columns: ["parent_role_id"],
      },
    ],
  },

  // =====================
  // TABLE: USERS (Utilisateurs)
  // =====================
  {
    name: "users",
    columns: [
      {
        name: "id",
        type: "uuid",
        constraints: ["PRIMARY KEY", "DEFAULT gen_random_uuid()"],
      },
      {
        name: "email",
        type: "varchar(255)",
        constraints: ["UNIQUE", "NOT NULL"],
      },
      {
        name: "code",
        type: "varchar(100)",
      },
      {
        name: "name",
        type: "varchar(255)",
        constraints: ["NOT NULL"],
      },
      {
        name: "position",
        type: "varchar(255)",
      },
      {
        name: "branch_id",
        type: "uuid",
        constraints: ["REFERENCES branches(id) ON DELETE SET NULL"],
      },
      {
        name: "department_id",
        type: "uuid",
        constraints: ["REFERENCES departments(id) ON DELETE SET NULL"],
      },
      {
        name: "role_id",
        type: "uuid",
        constraints: ["REFERENCES roles(id) ON DELETE SET NULL"],
      },
      {
        name: "role",
        type: "varchar(50)",
        default: "'employee'",
      },
      {
        name: "is_active",
        type: "boolean",
        default: "true",
      },
      {
        name: "archived_at",
        type: "timestamp",
      },
      {
        name: "created_at",
        type: "timestamp",
        default: "now()",
      },
      {
        name: "updated_at",
        type: "timestamp",
        default: "now()",
      },
    ],
    indexes: [
      {
        name: "idx_users_email",
        columns: ["email"],
      },
      {
        name: "idx_users_role",
        columns: ["role"],
      },
      {
        name: "idx_users_branch",
        columns: ["branch_id"],
      },
      {
        name: "idx_users_role_id",
        columns: ["role_id"],
      },
    ],
  },

  // =====================
  // TABLE: EVALUATIONS
  // =====================
  {
    name: "evaluations",
    columns: [
      {
        name: "id",
        type: "uuid",
        constraints: ["PRIMARY KEY", "DEFAULT gen_random_uuid()"],
      },
      {
        name: "employee_id",
        type: "uuid",
        constraints: ["REFERENCES users(id) ON DELETE CASCADE"],
      },
      {
        name: "employee_email",
        type: "varchar(255)",
      },
      {
        name: "employee_name",
        type: "varchar(255)",
      },
      {
        name: "manager_id",
        type: "uuid",
        constraints: ["REFERENCES users(id) ON DELETE SET NULL"],
      },
      {
        name: "period",
        type: "varchar(100)",
      },
      {
        name: "score",
        type: "numeric(3,1)",
      },
      {
        name: "feedback",
        type: "text",
      },
      {
        name: "status",
        type: "varchar(50)",
        default: "'pending'",
      },
      {
        name: "created_at",
        type: "timestamp",
        default: "now()",
      },
      {
        name: "updated_at",
        type: "timestamp",
        default: "now()",
      },
    ],
    indexes: [
      {
        name: "idx_evaluations_employee",
        columns: ["employee_email"],
      },
    ],
  },

  // =====================
  // TABLE: TRAINING_REQUESTS
  // =====================
  {
    name: "training_requests",
    columns: [
      {
        name: "id",
        type: "uuid",
        constraints: ["PRIMARY KEY", "DEFAULT gen_random_uuid()"],
      },
      {
        name: "employee_id",
        type: "uuid",
        constraints: ["REFERENCES users(id) ON DELETE CASCADE"],
      },
      {
        name: "employee_email",
        type: "varchar(255)",
      },
      {
        name: "employee_name",
        type: "varchar(255)",
      },
      {
        name: "manager_id",
        type: "uuid",
        constraints: ["REFERENCES users(id) ON DELETE SET NULL"],
      },
      {
        name: "course_name",
        type: "varchar(255)",
        constraints: ["NOT NULL"],
      },
      {
        name: "reason",
        type: "text",
      },
      {
        name: "status",
        type: "varchar(50)",
        default: "'pending'",
      },
      {
        name: "created_at",
        type: "timestamp",
        default: "now()",
      },
      {
        name: "updated_at",
        type: "timestamp",
        default: "now()",
      },
    ],
    indexes: [
      {
        name: "idx_training_employee",
        columns: ["employee_email"],
      },
    ],
  },

  // =====================
  // TABLE: REPORTS
  // =====================
  {
    name: "reports",
    columns: [
      {
        name: "id",
        type: "uuid",
        constraints: ["PRIMARY KEY", "DEFAULT gen_random_uuid()"],
      },
      {
        name: "user_id",
        type: "uuid",
        constraints: ["REFERENCES users(id) ON DELETE CASCADE"],
      },
      {
        name: "title",
        type: "varchar(255)",
        constraints: ["NOT NULL"],
      },
      {
        name: "content",
        type: "text",
      },
      {
        name: "type",
        type: "varchar(50)",
        default: "'employee_report'",
      },
      {
        name: "created_at",
        type: "timestamp",
        default: "now()",
      },
      {
        name: "updated_at",
        type: "timestamp",
        default: "now()",
      },
    ],
    indexes: [
      {
        name: "idx_reports_user",
        columns: ["user_id"],
      },
    ],
  },

  // =====================
  // TABLE: DEPARTMENTS
  // =====================
  {
    name: "departments",
    columns: [
      {
        name: "id",
        type: "uuid",
        constraints: ["PRIMARY KEY", "DEFAULT gen_random_uuid()"],
      },
      {
        name: "name",
        type: "varchar(255)",
        constraints: ["UNIQUE", "NOT NULL"],
      },
      {
        name: "parent_department_id",
        type: "uuid",
        constraints: ["REFERENCES departments(id) ON DELETE SET NULL"],
      },
      {
        name: "child_departments",
        type: "text[]",
        default: "'{}'",
      },
      {
        name: "is_active",
        type: "boolean",
        default: "true",
      },
      {
        name: "created_at",
        type: "timestamp",
        default: "now()",
      },
      {
        name: "updated_at",
        type: "timestamp",
        default: "now()",
      },
    ],
    indexes: [
      {
        name: "idx_departments_name",
        columns: ["name"],
      },
    ],
  },
];
