import * as XLSX from 'xlsx';
import { formatEvaluationPercentage, type CalculationRuleRecord, type EvaluationCriterionRecord } from '@/lib/evaluation-calculator';
import { criterionIsApplicableForEvaluation } from '@/lib/criterion-frequency';
import { criterionAppliesToEmployee } from '@/lib/evaluation-storage';
import { formatDecimal } from '@/lib/utils';
import {
  EVALUATION_STATUS_LABELS,
  type EmployeeForEvaluation,
  type EvaluationRecord,
  type EvaluationResponseItem,
  type EvaluationStatus,
} from '@/lib/evaluation-types';

/** Clé feuille exportable (chemin pointé). */
export type EvaluationExportFieldKey = string;

export interface EvaluationExportFieldNode {
  key: string;
  label: string;
  children?: EvaluationExportFieldNode[];
}

/** Arborescence alignée sur le tableau Évaluation + critères détaillés. */
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
  {
    key: 'criterion',
    label: 'Critère',
    children: [
      { key: 'criterion.name', label: 'Nom du critère' },
      { key: 'criterion.note', label: 'Note (points)' },
      { key: 'criterion.value', label: 'Valeur saisie' },
    ],
  },
];

/** Colonnes par défaut = tableau + critère et note. */
export const EVALUATION_TABLE_EXPORT_DEFAULT_FIELDS: EvaluationExportFieldKey[] = [
  'employee.name',
  'position',
  'branch.name',
  'department.name',
  'score.display',
  'status.label',
  'criterion.name',
  'criterion.note',
];

const TABLE_COLUMN_HEADER_BY_FIELD: Record<string, string> = {
  'employee.name': 'Employé',
  position: 'Poste',
  'branch.name': 'Filiale',
  'department.name': 'Service',
  'score.display': 'Dernier score',
  'status.label': 'Statut',
  'criterion.name': 'Critère',
  'criterion.note': 'Note',
};

function isLeafNode(node: EvaluationExportFieldNode): boolean {
  return !node.children || node.children.length === 0;
}

function isCriterionField(key: EvaluationExportFieldKey): boolean {
  return key.startsWith('criterion.');
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

function formatCriterionResponseValue(response: EvaluationResponseItem): string {
  if (typeof response.value === 'boolean') {
    return response.value ? 'Oui' : 'Non';
  }
  return String(response.value);
}

function resolveCriterionExportFieldValue(
  key: EvaluationExportFieldKey,
  criterion: EvaluationCriterionRecord,
  response: EvaluationResponseItem | undefined
): string {
  switch (key) {
    case 'criterion.name':
      return criterion.name;
    case 'criterion.note':
      return response != null ? formatDecimal(response.points) : '—';
    case 'criterion.value':
      return response != null ? formatCriterionResponseValue(response) : '—';
    default:
      return '—';
  }
}

function getApplicableCriteriaForEmployee(
  employee: EmployeeForEvaluation,
  context: EvaluationExportBuildContext
): EvaluationCriterionRecord[] {
  const evaluation = context.evaluationsByEmployeeId[employee.id];
  const savedCriterionIds = new Set((evaluation?.responses ?? []).map((response) => response.criterion_id));

  return context.criteria
    .filter((criterion) => criterionAppliesToEmployee(criterion, employee))
    .filter((criterion) =>
      criterionIsApplicableForEvaluation(criterion, {
        savedCriterionIds,
        periodStartDate: context.evaluationPeriodStartDate,
        orderedPeriods: context.orderedEvaluationPeriods,
      })
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'fr'));
}

export interface EvaluationExportBuildContext {
  departmentName: (id?: string | null) => string | null;
  roleName: (id?: string | null) => string | null;
  scoresByEmployee: Record<string, number | null>;
  statusByEmployee: Record<string, EvaluationStatus | null>;
  criteria: EvaluationCriterionRecord[];
  rules: CalculationRuleRecord[];
  evaluationsByEmployeeId: Record<string, EvaluationRecord | null>;
  evaluationPeriodStartDate?: string;
  orderedEvaluationPeriods: { start_date: string }[];
}

function buildEvaluationExportRows(
  employees: EmployeeForEvaluation[],
  fields: EvaluationExportFieldKey[],
  context: EvaluationExportBuildContext
): { header: string[]; rows: string[][]; merges: XLSX.Range[] } {
  const header = fields.map((field) => getEvaluationExportColumnHeader(field));
  const rows: string[][] = [];
  const merges: XLSX.Range[] = [];
  const includesCriterionColumns = fields.some(isCriterionField);
  const employeeFieldIndexes = fields
    .map((field, index) => (!isCriterionField(field) ? index : -1))
    .filter((index) => index >= 0);

  let excelRowIndex = 1;

  for (const employee of employees) {
    const employeeContext = {
      departmentName: context.departmentName,
      roleName: context.roleName,
      score: context.scoresByEmployee[employee.id],
      status: context.statusByEmployee[employee.id],
    };

    const evaluation = context.evaluationsByEmployeeId[employee.id];
    const applicableCriteria = includesCriterionColumns
      ? getApplicableCriteriaForEmployee(employee, context)
      : [];

    const criterionRows =
      applicableCriteria.length > 0
        ? applicableCriteria
        : includesCriterionColumns
          ? [null]
          : [];

    const groupStartRow = excelRowIndex;

    if (criterionRows.length === 0) {
      rows.push(
        fields.map((field) =>
          isCriterionField(field) ? '—' : resolveEvaluationExportFieldValue(field, employee, employeeContext)
        )
      );
      excelRowIndex += 1;
      continue;
    }

    criterionRows.forEach((criterion, criterionIndex) => {
      const response =
        criterion != null
          ? evaluation?.responses?.find((item) => item.criterion_id === criterion.id)
          : undefined;

      rows.push(
        fields.map((field) => {
          if (isCriterionField(field)) {
            return criterion != null
              ? resolveCriterionExportFieldValue(field, criterion, response)
              : '—';
          }
          if (criterionIndex === 0) {
            return resolveEvaluationExportFieldValue(field, employee, employeeContext);
          }
          return '';
        })
      );
      excelRowIndex += 1;
    });

    const groupEndRow = excelRowIndex - 1;
    if (groupEndRow > groupStartRow) {
      for (const columnIndex of employeeFieldIndexes) {
        merges.push({
          s: { r: groupStartRow, c: columnIndex },
          e: { r: groupEndRow, c: columnIndex },
        });
      }
    }
  }

  return { header, rows, merges };
}

function buildExportFilename(periodLabel?: string, extension: 'xlsx' | 'csv' = 'xlsx'): string {
  const periodPart = periodLabel?.trim().replace(/\s+/g, '-') ?? 'export';
  return `evaluations-${periodPart}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

export function exportEvaluationListToExcel(
  employees: EmployeeForEvaluation[],
  fields: EvaluationExportFieldKey[],
  context: EvaluationExportBuildContext & { periodLabel?: string }
): void {
  if (fields.length === 0 || employees.length === 0) return;

  const { header, rows, merges } = buildEvaluationExportRows(employees, fields, context);
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);

  if (merges.length > 0) {
    worksheet['!merges'] = merges;
  }

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

export function exportEvaluationListToCsv(
  employees: EmployeeForEvaluation[],
  fields: EvaluationExportFieldKey[],
  context: EvaluationExportBuildContext & { periodLabel?: string }
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
