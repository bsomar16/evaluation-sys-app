import * as XLSX from 'xlsx';
import {
  formatEvaluationPercentage,
  type EvaluationCriterionRecord,
} from '@/lib/evaluation-calculator';
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

const CRITERION_FIELD_RE = /^criterion\.([^.]+)\.(value|points)$/;

const STATIC_EVALUATION_EXPORT_FIELD_TREE: EvaluationExportFieldNode[] = [
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
    key: 'evaluation-meta',
    label: 'Évaluation',
    children: [{ key: 'evaluation.feedback', label: 'Commentaire' }],
  },
];

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
  'evaluation.feedback': 'Commentaire',
};

export function getExportableCriteria(
  criteria: EvaluationCriterionRecord[]
): EvaluationCriterionRecord[] {
  return criteria
    .filter((criterion) => criterion.is_active !== false && !criterion.archived_at)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'fr'));
}

export function buildEvaluationExportFieldTree(
  criteria: EvaluationCriterionRecord[]
): EvaluationExportFieldNode[] {
  const activeCriteria = getExportableCriteria(criteria);

  return [
    ...STATIC_EVALUATION_EXPORT_FIELD_TREE,
    {
      key: 'criteria',
      label: "Critères d'évaluation",
      children: activeCriteria.map((criterion) => ({
        key: `criterion-group-${criterion.id}`,
        label: criterion.name,
        children: [
          { key: `criterion.${criterion.id}.value`, label: 'Valeur' },
          { key: `criterion.${criterion.id}.points`, label: 'Points' },
        ],
      })),
    },
  ];
}

/** Colonnes tableau + valeur et points de chaque critère. */
export function buildDefaultEvaluationExportFields(
  criteria: EvaluationCriterionRecord[]
): EvaluationExportFieldKey[] {
  const activeCriteria = getExportableCriteria(criteria);
  return [
    ...EVALUATION_TABLE_EXPORT_DEFAULT_FIELDS,
    ...activeCriteria.flatMap((criterion) => [
      `criterion.${criterion.id}.value`,
      `criterion.${criterion.id}.points`,
    ]),
  ];
}

export function collectEvaluationExportLeafNodes(
  nodes: EvaluationExportFieldNode[]
): EvaluationExportFieldNode[] {
  const leaves: EvaluationExportFieldNode[] = [];

  const walk = (list: EvaluationExportFieldNode[]) => {
    for (const node of list) {
      if (!node.children?.length) {
        leaves.push(node);
        continue;
      }
      walk(node.children);
    }
  };

  walk(nodes);
  return leaves;
}

function findFieldLabelPath(
  nodes: EvaluationExportFieldNode[],
  targetKey: string,
  trail: string[] = []
): string[] | null {
  for (const node of nodes) {
    const nextTrail = [...trail, node.label];
    if (node.key === targetKey && !node.children?.length) {
      return nextTrail;
    }
    if (node.children?.length) {
      const nested = findFieldLabelPath(node.children, targetKey, nextTrail);
      if (nested) return nested;
    }
  }
  return null;
}

export function getEvaluationExportFieldLabel(
  key: EvaluationExportFieldKey,
  fieldTree: EvaluationExportFieldNode[]
): string {
  const path = findFieldLabelPath(fieldTree, key);
  if (path?.length) return path.join(' — ');
  return key;
}

export function getEvaluationExportColumnHeader(
  key: EvaluationExportFieldKey,
  criteriaById: Map<string, EvaluationCriterionRecord>,
  fieldTree: EvaluationExportFieldNode[]
): string {
  if (TABLE_COLUMN_HEADER_BY_FIELD[key]) {
    return TABLE_COLUMN_HEADER_BY_FIELD[key];
  }

  const criterionMatch = key.match(CRITERION_FIELD_RE);
  if (criterionMatch) {
    const [, criterionId, part] = criterionMatch;
    const name = criteriaById.get(criterionId)?.name ?? 'Critère';
    return part === 'points' ? `${name} (points)` : `${name} (valeur)`;
  }

  return getEvaluationExportFieldLabel(key, fieldTree);
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatCriterionResponseValue(response: EvaluationResponseItem): string {
  if (response.type === 'binary') {
    return response.value === true || response.value === 1 ? 'Oui' : 'Non';
  }
  if (typeof response.value === 'boolean') {
    return response.value ? 'Oui' : 'Non';
  }
  return String(response.value);
}

function getCriterionResponse(
  employeeId: string,
  criterionId: string,
  evaluationsByEmployeeId: Map<string, EvaluationRecord>
): EvaluationResponseItem | null {
  const evaluation = evaluationsByEmployeeId.get(employeeId);
  if (!evaluation?.responses?.length) return null;
  return evaluation.responses.find((response) => response.criterion_id === criterionId) ?? null;
}

export interface EvaluationExportContext {
  departmentName: (id?: string | null) => string | null;
  roleName: (id?: string | null) => string | null;
  scoresByEmployee: Record<string, number | null>;
  statusByEmployee: Record<string, EvaluationStatus | null>;
  evaluationsByEmployeeId: Map<string, EvaluationRecord>;
  criteriaById: Map<string, EvaluationCriterionRecord>;
  fieldTree: EvaluationExportFieldNode[];
  periodLabel?: string;
}

export function resolveEvaluationExportFieldValue(
  key: EvaluationExportFieldKey,
  employee: EmployeeForEvaluation,
  context: EvaluationExportContext
): string {
  const criterionMatch = key.match(CRITERION_FIELD_RE);
  if (criterionMatch) {
    const [, criterionId, part] = criterionMatch;
    const response = getCriterionResponse(employee.id, criterionId, context.evaluationsByEmployeeId);
    if (!response) return '—';
    if (part === 'points') return response.points.toFixed(1);
    return formatCriterionResponseValue(response);
  }

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
      return context.scoresByEmployee[employee.id] != null
        ? formatEvaluationPercentage(context.scoresByEmployee[employee.id])
        : '—';
    case 'score.value':
      return context.scoresByEmployee[employee.id] != null
        ? String(context.scoresByEmployee[employee.id])
        : '—';
    case 'status.label': {
      const status = context.statusByEmployee[employee.id];
      return status ? (EVALUATION_STATUS_LABELS[status] ?? status) : '—';
    }
    case 'status.code':
      return context.statusByEmployee[employee.id] ?? '—';
    case 'evaluation.feedback':
      return context.evaluationsByEmployeeId.get(employee.id)?.feedback?.trim() || '—';
    default:
      return '—';
  }
}

function buildEvaluationExportRows(
  employees: EmployeeForEvaluation[],
  fields: EvaluationExportFieldKey[],
  context: EvaluationExportContext
): { header: string[]; rows: string[][] } {
  const header = fields.map((field) =>
    getEvaluationExportColumnHeader(field, context.criteriaById, context.fieldTree)
  );
  const rows = employees.map((employee) =>
    fields.map((field) => resolveEvaluationExportFieldValue(field, employee, context))
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
  context: EvaluationExportContext
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
  context: EvaluationExportContext
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
