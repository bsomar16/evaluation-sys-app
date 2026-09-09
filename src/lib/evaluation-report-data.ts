import { supabase } from '@/integrations/supabase/client';
import { fetchEvaluations, resolveEvaluationPercentage } from '@/lib/evaluation-storage';
import { fetchEvaluationCriteria, fetchCalculationRules } from '@/lib/evaluation-config-storage';
import { getAllEvaluationPeriods } from '@/lib/evaluation-period-db';
import {
  getCriterionDisplayName,
  type CalculationRuleRecord,
  type EvaluationCriterionRecord,
} from '@/lib/evaluation-calculator';
import type { EvaluationRecord } from '@/lib/evaluation-types';

export interface EvaluationReportRow {
  evaluation: EvaluationRecord;
  position: string | null;
  branchId: string | null;
  branchName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  roleId: string | null;
  roleName: string | null;
  percentage: number | null;
}

export interface EvaluationReportData {
  rows: EvaluationReportRow[];
  criteria: EvaluationCriterionRecord[];
  rules: CalculationRuleRecord[];
  branches: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  /** Date de début de campagne par nom de période — pour ordonner les évaluations dans le temps. */
  periodStartByName: Record<string, string>;
}

/**
 * Données consolidées pour le module Analyse / Rapport : toutes les évaluations
 * (hors brouillons vides) enrichies avec les informations de l'employé au moment
 * de la consultation (poste, filiale, service, rôle) et le pourcentage final.
 * Non filtré par périmètre hiérarchique — l'accès est contrôlé par la permission
 * "reports", comme la page Gestion des évaluations.
 */
export async function fetchEvaluationReportData(): Promise<EvaluationReportData> {
  const [evaluations, criteria, rules, usersRes, branchesRes, departmentsRes, rolesRes, periods] = await Promise.all([
    fetchEvaluations(),
    fetchEvaluationCriteria(),
    fetchCalculationRules(),
    supabase.from('users').select('id, position, branch_id, department_id, role_id'),
    supabase.from('branches').select('id, name'),
    supabase.from('departments').select('id, name'),
    supabase.from('roles').select('id, name'),
    getAllEvaluationPeriods(),
  ]);

  const periodStartByName: Record<string, string> = {};
  for (const p of periods) {
    if (p.name && !periodStartByName[p.name]) periodStartByName[p.name] = p.start_date;
  }

  type UserLite = { id: string; position: string | null; branch_id: string | null; department_id: string | null; role_id: string | null };
  const usersById = new Map<string, UserLite>(((usersRes.data ?? []) as UserLite[]).map((u) => [u.id, u]));
  const branches = (branchesRes.data ?? []) as { id: string; name: string }[];
  const departments = (departmentsRes.data ?? []) as { id: string; name: string }[];
  const roles = (rolesRes.data ?? []) as { id: string; name: string }[];
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
  const departmentNameById = new Map(departments.map((d) => [d.id, d.name]));
  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));

  const rows: EvaluationReportRow[] = evaluations
    .filter((evaluation) => evaluation.status !== 'draft')
    .map((evaluation) => {
      const user = evaluation.employee_id ? usersById.get(evaluation.employee_id) : undefined;
      const branchId = user?.branch_id ?? null;
      const departmentId = user?.department_id ?? null;
      const roleId = user?.role_id ?? null;
      const percentage = resolveEvaluationPercentage(
        evaluation,
        criteria,
        rules,
        user ? { role_id: roleId, branch_id: branchId, department_id: departmentId } : undefined
      );

      return {
        evaluation,
        position: user?.position ?? null,
        branchId,
        branchName: branchId ? branchNameById.get(branchId) ?? null : null,
        departmentId,
        departmentName: departmentId ? departmentNameById.get(departmentId) ?? null : null,
        roleId,
        roleName: roleId ? roleNameById.get(roleId) ?? null : null,
        percentage,
      };
    })
    .sort((a, b) => {
      const dateA = a.evaluation.created_at ? new Date(a.evaluation.created_at).getTime() : 0;
      const dateB = b.evaluation.created_at ? new Date(b.evaluation.created_at).getTime() : 0;
      return dateB - dateA;
    });

  return { rows, criteria, rules, branches, departments, roles, periodStartByName };
}

/**
 * Évaluation la plus récente précédant chronologiquement celle-ci pour le même
 * employé (comparaison "période sur période"), ou `null` si c'est la première
 * évaluation connue de cet employé. Se base sur la date de début de campagne
 * (période), pas sur la date d'enregistrement en base.
 */
export function findPreviousEvaluationRow(
  row: EvaluationReportRow,
  allRows: EvaluationReportRow[],
  periodStartByName: Record<string, string>
): EvaluationReportRow | null {
  const employeeId = row.evaluation.employee_id;
  const currentStart = row.evaluation.period ? periodStartByName[row.evaluation.period] : undefined;
  if (!employeeId || !currentStart) return null;
  const currentTime = new Date(currentStart).getTime();

  let best: EvaluationReportRow | null = null;
  let bestTime = -Infinity;
  for (const candidate of allRows) {
    if (candidate.evaluation.id === row.evaluation.id) continue;
    if (candidate.evaluation.employee_id !== employeeId) continue;
    if (candidate.percentage == null) continue;
    const candidateStart = candidate.evaluation.period
      ? periodStartByName[candidate.evaluation.period]
      : undefined;
    if (!candidateStart) continue;
    const candidateTime = new Date(candidateStart).getTime();
    if (candidateTime < currentTime && candidateTime > bestTime) {
      best = candidate;
      bestTime = candidateTime;
    }
  }
  return best;
}

/** Nom (FR ou AR) d'un critère à partir de son id, avec repli sur le nom figé dans la réponse
 * (le critère a pu être supprimé/archivé depuis, ou son nom modifié). */
export function resolveCriterionName(
  criterionId: string,
  fallbackName: string,
  criteria: EvaluationCriterionRecord[],
  lang: 'fr' | 'ar'
): string {
  const criterion = criteria.find((c) => c.id === criterionId);
  if (!criterion) return fallbackName;
  return getCriterionDisplayName(criterion, lang) || fallbackName;
}
