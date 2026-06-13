/**
 * Schéma attendu de la BDD — source unique pour :
 * - auto-migration au démarrage (db-auto-migrate)
 * - page Admin « Schéma BD » (vérification dynamique)
 *
 * Ajoutez ici toute nouvelle colonne ; l’UI se met à jour automatiquement.
 */

export interface ExpectedColumn {
  name: string;
  type: string;
  default?: string;
  nullable?: boolean;
}

export type ExpectedDbSchema = Record<string, ExpectedColumn[]>;

export const EXPECTED_DB_SCHEMA: ExpectedDbSchema = {
  users: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', nullable: false },
    { name: 'email', type: 'varchar(255)', nullable: false },
    { name: 'code', type: 'varchar(100)', nullable: true },
    { name: 'name', type: 'varchar(255)', nullable: false },
    { name: 'position', type: 'varchar(255)', nullable: true },
    { name: 'password', type: 'varchar(255)', nullable: true },
    { name: 'branch_id', type: 'uuid', nullable: true },
    { name: 'department_id', type: 'uuid', nullable: true },
    { name: 'role_id', type: 'uuid', nullable: true },
    { name: 'role', type: 'varchar(50)', default: "'employee'", nullable: true },
    { name: 'is_agent_without_account', type: 'boolean', default: 'false', nullable: true },
    { name: 'appearance_mode', type: 'varchar(50)', default: "'standard'", nullable: true },
    { name: 'is_active', type: 'boolean', default: 'true', nullable: true },
    { name: 'archived_at', type: 'timestamp', nullable: true },
    { name: 'created_at', type: 'timestamp', default: 'now()', nullable: true },
    { name: 'updated_at', type: 'timestamp', default: 'now()', nullable: true },
  ],
  roles: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', nullable: false },
    { name: 'name', type: 'varchar(100)', nullable: false },
    { name: 'code', type: 'varchar(50)', nullable: true },
    { name: 'level', type: 'integer', default: '0', nullable: true },
    { name: 'parent_role_id', type: 'uuid', nullable: true },
    { name: 'color', type: 'varchar(7)', default: "'#3b82f6'", nullable: true },
    { name: 'child_roles', type: 'text[]', default: "'{}'", nullable: true },
    { name: 'permissions', type: 'jsonb', default: "'{}'::jsonb", nullable: true },
    { name: 'is_user', type: 'boolean', default: 'true', nullable: true },
    { name: 'is_active', type: 'boolean', default: 'true', nullable: true },
    { name: 'created_at', type: 'timestamp', default: 'now()', nullable: true },
    { name: 'updated_at', type: 'timestamp', default: 'now()', nullable: true },
  ],
  branches: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', nullable: false },
    { name: 'name', type: 'varchar(255)', nullable: false },
    { name: 'code', type: 'varchar(50)', nullable: true },
    { name: 'location', type: 'varchar(255)', nullable: true },
    { name: 'parent_branch_id', type: 'uuid', nullable: true },
    { name: 'child_branches', type: 'text[]', default: "'{}'", nullable: true },
    { name: 'is_active', type: 'boolean', default: 'true', nullable: true },
    { name: 'created_at', type: 'timestamp', default: 'now()', nullable: true },
    { name: 'updated_at', type: 'timestamp', default: 'now()', nullable: true },
  ],
  departments: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', nullable: false },
    { name: 'name', type: 'varchar(255)', nullable: false },
    { name: 'parent_department_id', type: 'uuid', nullable: true },
    { name: 'child_departments', type: 'text[]', default: "'{}'", nullable: true },
    { name: 'is_active', type: 'boolean', default: 'true', nullable: true },
    { name: 'created_at', type: 'timestamp', default: 'now()', nullable: true },
    { name: 'updated_at', type: 'timestamp', default: 'now()', nullable: true },
  ],
  evaluation_criteria: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', nullable: false },
    { name: 'name', type: 'varchar(255)', nullable: false },
    { name: 'type', type: 'varchar(50)', nullable: false },
    { name: 'calculation_rule_id', type: 'uuid', nullable: true },
    { name: 'choice_option_1_label', type: 'varchar(255)', nullable: true },
    { name: 'choice_option_2_label', type: 'varchar(255)', nullable: true },
    { name: 'choice_option_labels', type: 'text[]', default: "'{}'", nullable: true },
    { name: 'role_all', type: 'boolean', default: 'true', nullable: true },
    { name: 'branch_all', type: 'boolean', default: 'true', nullable: true },
    { name: 'department_all', type: 'boolean', default: 'true', nullable: true },
    { name: 'role_ids', type: 'text[]', default: "'{}'", nullable: true },
    { name: 'branch_ids', type: 'text[]', default: "'{}'", nullable: true },
    { name: 'department_ids', type: 'text[]', default: "'{}'", nullable: true },
    { name: 'weight', type: 'numeric(5,2)', default: '1', nullable: true },
    { name: 'sort_order', type: 'integer', default: '0', nullable: true },
    { name: 'is_active', type: 'boolean', default: 'true', nullable: true },
    { name: 'created_at', type: 'timestamp', default: 'now()', nullable: true },
    { name: 'updated_at', type: 'timestamp', default: 'now()', nullable: true },
  ],
  calculation_rules: [
    { name: 'type', type: 'varchar(50)', nullable: false },
    { name: 'label', type: 'varchar(100)', nullable: true },
    { name: 'max_points', type: 'numeric(5,2)', default: '10', nullable: true },
    { name: 'config', type: 'jsonb', default: "'{}'::jsonb", nullable: true },
    { name: 'updated_at', type: 'timestamp', default: 'now()', nullable: true },
  ],
  evaluation_periods: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', nullable: false },
    { name: 'name', type: 'varchar(100)', nullable: false },
    { name: 'start_date', type: 'date', nullable: false },
    { name: 'end_date', type: 'date', nullable: false },
    { name: 'is_active', type: 'boolean', default: 'true', nullable: true },
    { name: 'created_by', type: 'varchar(255)', nullable: true },
    { name: 'created_at', type: 'timestamp', default: 'now()', nullable: true },
    { name: 'updated_at', type: 'timestamp', default: 'now()', nullable: true },
  ],
  evaluation_period_intervals: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', nullable: false },
    { name: 'period_id', type: 'uuid', nullable: false },
    { name: 'start_at', type: 'timestamp', nullable: false },
    { name: 'end_at', type: 'timestamp', nullable: false },
    { name: 'is_prolongation', type: 'boolean', default: 'false', nullable: true },
    { name: 'is_prolongation_closed', type: 'boolean', default: 'false', nullable: true },
    { name: 'created_by', type: 'varchar(255)', nullable: true },
    { name: 'created_at', type: 'timestamp', default: 'now()', nullable: true },
    { name: 'updated_at', type: 'timestamp', default: 'now()', nullable: true },
  ],
  evaluations: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', nullable: false },
    { name: 'employee_id', type: 'uuid', nullable: true },
    { name: 'employee_email', type: 'varchar(255)', nullable: true },
    { name: 'employee_name', type: 'varchar(255)', nullable: true },
    { name: 'manager_id', type: 'uuid', nullable: true },
    { name: 'period', type: 'varchar(100)', nullable: true },
    { name: 'period_id', type: 'uuid', nullable: true },
    { name: 'score', type: 'numeric(3,1)', nullable: true },
    { name: 'feedback', type: 'text', nullable: true },
    { name: 'responses', type: 'jsonb', default: "'[]'::jsonb", nullable: true },
    { name: 'activity_log', type: 'jsonb', default: "'[]'::jsonb", nullable: true },
    { name: 'status', type: 'varchar(50)', default: "'pending'", nullable: true },
    { name: 'created_at', type: 'timestamp', default: 'now()', nullable: true },
    { name: 'updated_at', type: 'timestamp', default: 'now()', nullable: true },
  ],
  training_requests: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', nullable: false },
    { name: 'employee_id', type: 'uuid', nullable: true },
    { name: 'employee_email', type: 'varchar(255)', nullable: true },
    { name: 'employee_name', type: 'varchar(255)', nullable: true },
    { name: 'manager_id', type: 'uuid', nullable: true },
    { name: 'course_name', type: 'varchar(255)', nullable: false },
    { name: 'reason', type: 'text', nullable: true },
    { name: 'status', type: 'varchar(50)', default: "'pending'", nullable: true },
    { name: 'created_at', type: 'timestamp', default: 'now()', nullable: true },
    { name: 'updated_at', type: 'timestamp', default: 'now()', nullable: true },
  ],
  reports: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', nullable: false },
    { name: 'user_id', type: 'uuid', nullable: true },
    { name: 'title', type: 'varchar(255)', nullable: false },
    { name: 'content', type: 'text', nullable: true },
    { name: 'type', type: 'varchar(50)', default: "'employee_report'", nullable: true },
    { name: 'created_at', type: 'timestamp', default: 'now()', nullable: true },
    { name: 'updated_at', type: 'timestamp', default: 'now()', nullable: true },
  ],
};

/** Ordre de création (dépendances FK) */
export const TABLE_CREATION_ORDER: string[] = [
  'branches',
  'roles',
  'departments',
  'users',
  'evaluation_periods',
  'evaluation_period_intervals',
  'evaluation_criteria',
  'calculation_rules',
  'evaluations',
  'training_requests',
  'reports',
];

export const EXPECTED_TABLE_NAMES = TABLE_CREATION_ORDER.filter((t) => EXPECTED_DB_SCHEMA[t]);

/** Références FK par colonne (table.cible) */
const COLUMN_FOREIGN_KEYS: Record<string, Record<string, string>> = {
  users: {
    branch_id: 'branches(id) ON DELETE SET NULL',
    department_id: 'departments(id) ON DELETE SET NULL',
    role_id: 'roles(id) ON DELETE SET NULL',
  },
  roles: {
    parent_role_id: 'roles(id) ON DELETE SET NULL',
  },
  branches: {
    parent_branch_id: 'branches(id) ON DELETE SET NULL',
  },
  departments: {
    parent_department_id: 'departments(id) ON DELETE SET NULL',
  },
  evaluation_period_intervals: {
    period_id: 'evaluation_periods(id) ON DELETE CASCADE',
  },
  evaluations: {
    employee_id: 'users(id) ON DELETE CASCADE',
    manager_id: 'users(id) ON DELETE SET NULL',
    period_id: 'evaluation_periods(id) ON DELETE SET NULL',
  },
  training_requests: {
    employee_id: 'users(id) ON DELETE CASCADE',
    manager_id: 'users(id) ON DELETE SET NULL',
  },
  reports: {
    user_id: 'users(id) ON DELETE CASCADE',
  },
};

export function getExpectedColumn(table: string, columnName: string): ExpectedColumn | undefined {
  return EXPECTED_DB_SCHEMA[table]?.find((c) => c.name === columnName);
}

function isPrimaryKeyColumn(table: string, column: ExpectedColumn): boolean {
  return column.name === 'id' && column.type.toLowerCase().includes('uuid');
}

/** Une ligne de définition colonne pour CREATE TABLE */
export function formatColumnDefinition(table: string, column: ExpectedColumn): string {
  const parts: string[] = [column.name, column.type];

  if (isPrimaryKeyColumn(table, column)) {
    parts.push('PRIMARY KEY');
  }

  if (column.default) {
    parts.push(`DEFAULT ${column.default}`);
  }

  if (column.nullable === false && !isPrimaryKeyColumn(table, column)) {
    parts.push('NOT NULL');
  }

  const fk = COLUMN_FOREIGN_KEYS[table]?.[column.name];
  if (fk) {
    parts.push(`REFERENCES ${fk}`);
  }

  return parts.join(' ');
}

/** CREATE TABLE complet depuis le schéma attendu */
export function buildCreateTableSql(tableName: string): string {
  const columns = EXPECTED_DB_SCHEMA[tableName];
  if (!columns?.length) {
    return `-- Table inconnue: ${tableName}`;
  }

  const lines = columns.map((col) => `  ${formatColumnDefinition(tableName, col)}`);
  return `CREATE TABLE IF NOT EXISTS ${tableName} (\n${lines.join(',\n')}\n);`;
}

export function buildAddColumnSql(table: string, column: ExpectedColumn): string {
  let sql = `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}`;
  if (column.default) {
    sql += ` DEFAULT ${column.default}`;
  }
  return `${sql};`;
}

/** Migration complète : tables absentes + colonnes manquantes */
export function buildFullMigrationSql(
  missingTableNames: string[],
  missingColumns: { table: string; column: ExpectedColumn }[]
): string {
  const missingTablesSet = new Set(missingTableNames);
  const tablesToCreate = TABLE_CREATION_ORDER.filter((t) => missingTablesSet.has(t));

  if (tablesToCreate.length === 0 && missingColumns.length === 0) {
    return '-- Aucune migration requise (schéma à jour)';
  }

  const lines: string[] = [
    '-- SQL généré dynamiquement depuis src/lib/expected-db-schema.ts',
    `-- Tables à créer: ${tablesToCreate.length} · Colonnes à ajouter: ${missingColumns.length}`,
    '',
  ];

  if (tablesToCreate.length > 0) {
    lines.push('-- ─── Création des tables ───', '');
    for (const table of tablesToCreate) {
      lines.push(`-- Table: ${table}`);
      lines.push(buildCreateTableSql(table));
      lines.push('');
    }
  }

  if (missingColumns.length > 0) {
    lines.push('-- ─── Colonnes manquantes sur tables existantes ───', '');
    for (const { table, column } of missingColumns) {
      lines.push(buildAddColumnSql(table, column));
    }
  }

  return lines.join('\n');
}

/** @deprecated Utiliser buildFullMigrationSql */
export function buildMigrationSql(
  missing: { table: string; column: ExpectedColumn }[]
): string {
  return buildFullMigrationSql([], missing);
}
