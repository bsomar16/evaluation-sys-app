import * as XLSX from 'xlsx';
import { getCriterionMaxPoints, type CalculationRuleRecord, type EvaluationCriterionRecord } from '@/lib/evaluation-calculator';
import { EVALUATION_STATUS_LABELS, type EvaluationRecord } from '@/lib/evaluation-types';
import { resolveCriterionName, type EvaluationReportRow } from '@/lib/evaluation-report-data';

export interface EvaluationReportExcelInput {
  evaluation: EvaluationRecord;
  employeeName: string;
  position: string | null;
  branchName: string | null;
  departmentName: string | null;
  roleName: string | null;
  percentage: number | null;
  criteria: EvaluationCriterionRecord[];
  rules: CalculationRuleRecord[];
}

function sanitizeFilenamePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** Export Excel détaillé d'une seule évaluation — nom du critère en français ET en arabe. */
export function exportEvaluationReportToExcel(input: EvaluationReportExcelInput): void {
  const { evaluation, employeeName, position, branchName, departmentName, roleName, percentage, criteria, rules } = input;

  const summaryRows: (string | number)[][] = [
    ['Employé', employeeName],
    ['Poste', position ?? '—'],
    ['Filiale', branchName ?? '—'],
    ['Service', departmentName ?? '—'],
    ['Rôle', roleName ?? '—'],
    ['Période', evaluation.period ?? '—'],
    ['Statut', EVALUATION_STATUS_LABELS[evaluation.status] ?? evaluation.status],
    ['Score global (%)', percentage != null ? Number(percentage.toFixed(1)) : '—'],
    ["Commentaire de l'évaluateur", evaluation.feedback?.trim() || '—'],
  ];

  const criteriaHeader = ['Critère (Français)', 'Critère (Arabe)', 'Coefficient', 'Valeur saisie', 'Points obtenus', 'Points max'];
  const responses = evaluation.responses ?? [];
  const criteriaRows = responses.map((response) => {
    const criterion = criteria.find((c) => c.id === response.criterion_id);
    const nameFr = resolveCriterionName(response.criterion_id, response.criterion_name, criteria, 'fr');
    const nameAr = criterion?.name_ar?.trim() || '';
    const maxPoints = criterion ? getCriterionMaxPoints(criterion, rules) * (criterion.weight ?? 1) : response.points;
    const value = typeof response.value === 'boolean' ? (response.value ? 'Oui' : 'Non') : String(response.value);
    return [nameFr, nameAr, criterion?.weight ?? 1, value, Number(response.points.toFixed(1)), Number(maxPoints.toFixed(1))];
  });

  const worksheet = XLSX.utils.aoa_to_sheet([
    ...summaryRows,
    [],
    criteriaHeader,
    ...criteriaRows,
  ]);

  worksheet['!cols'] = [
    { wch: 26 },
    { wch: 26 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 12 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Évaluation');
  const filename = `evaluation-${sanitizeFilenamePart(employeeName)}-${sanitizeFilenamePart(evaluation.period || 'periode')}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

/** Export Excel groupé (une ligne par évaluation) — pour la sélection multiple du module Analyse / Rapport. */
export function exportEvaluationReportListToExcel(rows: EvaluationReportRow[]): void {
  if (rows.length === 0) return;

  const header = ['Employé', 'Poste', 'Filiale', 'Service', 'Rôle', 'Période', 'Statut', 'Score (%)'];
  const body = rows.map(({ evaluation, position, branchName, departmentName, roleName, percentage }) => [
    evaluation.employee_name ?? '—',
    position ?? '—',
    branchName ?? '—',
    departmentName ?? '—',
    roleName ?? '—',
    evaluation.period ?? '—',
    EVALUATION_STATUS_LABELS[evaluation.status] ?? evaluation.status,
    percentage != null ? Number(percentage.toFixed(1)) : '—',
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  worksheet['!cols'] = header.map((title, columnIndex) => {
    const maxCellLength = Math.max(title.length, ...body.map((row) => String(row[columnIndex] ?? '').length));
    return { wch: Math.min(Math.max(maxCellLength + 2, 10), 40) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Évaluations');
  XLSX.writeFile(workbook, `evaluations-analyse-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
