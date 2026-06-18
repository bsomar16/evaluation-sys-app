import { formatEvaluationPercentage } from '@/lib/evaluation-calculator';
import { EVALUATION_STATUS_LABELS, type EmployeeForEvaluation, type EvaluationStatus } from '@/lib/evaluation-types';

export type EvaluationListExportFieldKey =
  | 'name'
  | 'position'
  | 'branch_name'
  | 'department'
  | 'score'
  | 'status'
  | 'email'
  | 'role';

export interface EvaluationListExportFieldDef {
  key: EvaluationListExportFieldKey;
  label: string;
}

export const EVALUATION_LIST_TABLE_FIELDS: EvaluationListExportFieldKey[] = [
  'name',
  'position',
  'branch_name',
  'department',
  'score',
  'status',
];

export const EVALUATION_LIST_EXPORT_FIELD_DEFS: EvaluationListExportFieldDef[] = [
  { key: 'name', label: 'Employé' },
  { key: 'position', label: 'Poste' },
  { key: 'branch_name', label: 'Filiale' },
  { key: 'department', label: 'Service' },
  { key: 'score', label: 'Dernier score' },
  { key: 'status', label: 'Statut' },
  { key: 'email', label: 'E-mail' },
  { key: 'role', label: 'Rôle' },
];

export function getEvaluationListExportLabel(key: EvaluationListExportFieldKey): string {
  return EVALUATION_LIST_EXPORT_FIELD_DEFS.find((field) => field.key === key)?.label ?? key;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildEvaluationListExportRow(
  employee: EmployeeForEvaluation,
  fields: EvaluationListExportFieldKey[],
  context: {
    departmentName: (id?: string | null) => string | null;
    roleName: (id?: string | null) => string | null;
    score: number | null | undefined;
    status: EvaluationStatus | null | undefined;
  }
): string[] {
  return fields.map((field) => {
    switch (field) {
      case 'name':
        return employee.name;
      case 'position':
        return employee.position?.trim() || '—';
      case 'branch_name':
        return employee.branch_name?.trim() || '—';
      case 'department':
        return context.departmentName(employee.department_id) ?? '—';
      case 'score':
        return context.score != null ? formatEvaluationPercentage(context.score) : '—';
      case 'status':
        return context.status ? EVALUATION_STATUS_LABELS[context.status] ?? context.status : '—';
      case 'email':
        return employee.email?.trim() || '—';
      case 'role':
        return context.roleName(employee.role_id) ?? '—';
      default:
        return '—';
    }
  });
}

export function exportEvaluationListToCsv(
  employees: EmployeeForEvaluation[],
  fields: EvaluationListExportFieldKey[],
  context: {
    departmentName: (id?: string | null) => string | null;
    roleName: (id?: string | null) => string | null;
    scoresByEmployee: Record<string, number | null>;
    statusByEmployee: Record<string, EvaluationStatus | null>;
    periodLabel?: string;
  }
): void {
  if (fields.length === 0 || employees.length === 0) return;

  const header = fields.map((field) => escapeCsvCell(getEvaluationListExportLabel(field)));
  const rows = employees.map((employee) =>
    buildEvaluationListExportRow(employee, fields, {
      departmentName: context.departmentName,
      roleName: context.roleName,
      score: context.scoresByEmployee[employee.id],
      status: context.statusByEmployee[employee.id],
    }).map(escapeCsvCell)
  );

  const csv = [header, ...rows].map((row) => row.join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const periodPart = context.periodLabel?.trim().replace(/\s+/g, '-') ?? 'export';
  link.href = url;
  link.download = `evaluations-${periodPart}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
