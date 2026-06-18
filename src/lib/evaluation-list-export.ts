import * as XLSX from 'xlsx';
import { formatEvaluationPercentage } from '@/lib/evaluation-calculator';
import {
  EVALUATION_STATUS_LABELS,
  type EmployeeForEvaluation,
  type EvaluationStatus,
} from '@/lib/evaluation-types';

/** Clé feuille exportable (chemin pointé). */
export type EvaluationExportFieldKey = string;

export interface EvaluationExportFieldNode {
  key: string;
  label: string;
  children?: EvaluationExportFieldNode[];
}

/** Arborescence alignée sur les colonnes du tableau Évaluation. */
export const EVALUATION_EXPORT_FIELD_TREE: EvaluationExportFieldNode[] = [
  {
    key: 'employee',
    label: 'Employé',
    children: [
      { key: 'employee.name', label: 'Nom' },
      { key: 'employee.email', label: 'E-mail' },
      { key: 'employee.id', label: 'Identifiant' },
    ],
  },
  { key: 'position', label: 'Poste' },
  {
    key: 'branch',
    label: 'Filiale',
    children: [
      { key: 'branch.name', label: 'Nom' },
      { key: 'branch.id', label: 'Identifiant' },
    ],
  },
  {
    key: 'department',
    label: 'Service',
    children: [
      { key: 'department.name', label: 'Nom' },
      { key: 'department.id', label: 'Identifiant' },
    ],
  },
  {
    key: 'score',
    label: 'Dernier score',
    children: [
      { key: 'score.display', label: 'Affichage (tableau)' },
      { key: 'score.value', label: 'Valeur numérique (%)' },
    ],
  },
  {
    key: 'status',
    label: 'Statut',
    children: [
      { key: 'status.label', label: 'Libellé' },
      { key: 'status.code', label: 'Code' },
    ],
  },
];

/** Valeurs par défaut = exactement ce qui est affiché dans le tableau. */
export const EVALUATION_TABLE_EXPORT_DEFAULT_FIELDS: EvaluationExportFieldKey[] = [
  'employee.name',
  'position',
  'branch.name',
  'department.name',
  'score.display',
  'status.label',
];

const TABLE_COLUMN_HEADER_BY_FIELD: Record<string, string> = {
  'employee.name': 'Employé',
  position: 'Poste',
  'branch.name': 'Filiale',
  'department.name': 'Service',
  'score.display': 'Dernier score',
  'status.label': 'Statut',
};

function isLeafNode(node: EvaluationExportFieldNode): boolean {
  return !node.children || node.children.length === 0;
}

export function collectEvaluationExportLeafNodes(
  nodes: EvaluationExportFieldNode[] = EVALUATION_EXPORT_FIELD_TREE
): EvaluationExportFieldNode[] {
  const leaves: EvaluationExportFieldNode[] = [];
  for (const node of nodes) {
    if (isLeafNode(node)) {
      leaves.push(node);
      continue;
    }
    for (const child of node.children ?? []) {
      leaves.push(child);
    }
  }
  return leaves;
}

export function getEvaluationExportFieldLabel(key: EvaluationExportFieldKey): string {
  const leaf = collectEvaluationExportLeafNodes().find((node) => node.key === key);
  if (!leaf) return key;

  for (const group of EVALUATION_EXPORT_FIELD_TREE) {
    if (group.key === key) return group.label;
    if (group.children?.some((child) => child.key === key)) {
      return `${group.label} — ${leaf.label}`;
    }
  }

  return leaf.label;
}

/** En-tête CSV : libellé exact de la colonne tableau si champ par défaut, sinon groupe — sous-champ. */
export function getEvaluationExportColumnHeader(key: EvaluationExportFieldKey): string {
  return TABLE_COLUMN_HEADER_BY_FIELD[key] ?? getEvaluationExportFieldLabel(key);
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function resolveEvaluationExportFieldValue(
  key: EvaluationExportFieldKey,
  employee: EmployeeForEvaluation,
  context: {
    departmentName: (id?: string | null) => string | null;
    roleName: (id?: string | null) => string | null;
    score: number | null | undefined;
    status: EvaluationStatus | null | undefined;
  }
): string {
  switch (key) {
    case 'employee.name':
      return employee.name?.trim() || '—';
    case 'employee.email':
      return employee.email?.trim() || '—';
    case 'employee.id':
      return employee.id?.trim() || '—';
    case 'position':
      return employee.position?.trim() || '—';
    case 'branch.name':
      return employee.branch_name?.trim() || '—';
    case 'branch.id':
      return employee.branch_id?.trim() || '—';
    case 'department.name':
      return context.departmentName(employee.department_id) ?? '—';
    case 'department.id':
      return employee.department_id?.trim() || '—';
    case 'score.display':
      return context.score != null ? formatEvaluationPercentage(context.score) : '—';
    case 'score.value':
      return context.score != null ? String(context.score) : '—';
    case 'status.label':
      return context.status ? (EVALUATION_STATUS_LABELS[context.status] ?? context.status) : '—';
    case 'status.code':
      return context.status ?? '—';
    default:
      return '—';
  }
}

function buildEvaluationExportRows(
  employees: EmployeeForEvaluation[],
  fields: EvaluationExportFieldKey[],
  context: {
    departmentName: (id?: string | null) => string | null;
    roleName: (id?: string | null) => string | null;
    scoresByEmployee: Record<string, number | null>;
    statusByEmployee: Record<string, EvaluationStatus | null>;
  }
): { header: string[]; rows: string[][] } {
  const header = fields.map((field) => getEvaluationExportColumnHeader(field));
  const rows = employees.map((employee) =>
    fields.map((field) =>
      resolveEvaluationExportFieldValue(field, employee, {
        departmentName: context.departmentName,
        roleName: context.roleName,
        score: context.scoresByEmployee[employee.id],
        status: context.statusByEmployee[employee.id],
      })
    )
  );
  return { header, rows };
}

function buildExportFilename(periodLabel?: string, extension: 'xlsx' | 'csv' = 'xlsx'): string {
  const periodPart = periodLabel?.trim().replace(/\s+/g, '-') ?? 'export';
  return `evaluations-${periodPart}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

/** Export Excel (.xlsx) — colonnes structurées. */
export function exportEvaluationListToExcel(
  employees: EmployeeForEvaluation[],
  fields: EvaluationExportFieldKey[],
  context: {
    departmentName: (id?: string | null) => string | null;
    roleName: (id?: string | null) => string | null;
    scoresByEmployee: Record<string, number | null>;
    statusByEmployee: Record<string, EvaluationStatus | null>;
    periodLabel?: string;
  }
): void {
  if (fields.length === 0 || employees.length === 0) return;

  const { header, rows } = buildEvaluationExportRows(employees, fields, context);
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);

  worksheet['!cols'] = header.map((title, columnIndex) => {
    const maxCellLength = Math.max(
      title.length,
      ...rows.map((row) => String(row[columnIndex] ?? '').length)
    );
    return { wch: Math.min(Math.max(maxCellLength + 2, 10), 48) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Évaluations');
  XLSX.writeFile(workbook, buildExportFilename(context.periodLabel, 'xlsx'));
}

/** Export CSV (séparateur virgule). */
export function exportEvaluationListToCsv(
  employees: EmployeeForEvaluation[],
  fields: EvaluationExportFieldKey[],
  context: {
    departmentName: (id?: string | null) => string | null;
    roleName: (id?: string | null) => string | null;
    scoresByEmployee: Record<string, number | null>;
    statusByEmployee: Record<string, EvaluationStatus | null>;
    periodLabel?: string;
  }
): void {
  if (fields.length === 0 || employees.length === 0) return;

  const { header, rows } = buildEvaluationExportRows(employees, fields, context);
  const csv = [header, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildExportFilename(context.periodLabel, 'csv');
  link.click();
  URL.revokeObjectURL(url);
}
