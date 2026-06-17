import type { CalculationRuleRecord, EvaluationCriterionRecord } from '@/lib/evaluation-calculator';
import {
  fetchCalculationRules,
  fetchEvaluationCriteria,
} from '@/lib/evaluation-config-storage';
import { dateToPeriodCode } from '@/lib/evaluation-period-label';
import {
  getAllEvaluationPeriods,
  getCurrentOpenPeriod,
  getDashboardPeriods,
} from '@/lib/evaluation-period-db';
import {
  fetchEmployeesForEvaluation,
  fetchEvaluations,
  findEvaluationForOpenPeriod,
  resolveEvaluationPercentage,
} from '@/lib/evaluation-storage';
import type { EmployeeForEvaluation, EvaluationRecord, EvaluationStatus } from '@/lib/evaluation-types';
import { supabase } from '@/integrations/supabase/client';

export interface EvaluationPeriodOption {
  name: string;
  code: string;
  id: string;
  start_date: string;
}

export interface EvaluationPageData {
  employees: EmployeeForEvaluation[];
  criteria: EvaluationCriterionRecord[];
  rules: CalculationRuleRecord[];
  roles: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  availablePeriods: EvaluationPeriodOption[];
  evaluations: EvaluationRecord[];
  period: string;
  scoresByEmployee: Record<string, number | null>;
  statusByEmployee: Record<string, EvaluationStatus | null>;
  fetchedAt: number;
}

const SNAPSHOT_MAX_AGE_MS = 30_000;

let snapshot: EvaluationPageData | null = null;

export function getEvaluationPageSnapshot(): EvaluationPageData | null {
  return snapshot;
}

export function isEvaluationPageSnapshotFresh(maxAgeMs = SNAPSHOT_MAX_AGE_MS): boolean {
  return snapshot !== null && Date.now() - snapshot.fetchedAt < maxAgeMs;
}

export function invalidateEvaluationPageSnapshot(): void {
  snapshot = null;
}

export function computePeriodEmployeeMaps(
  employees: EmployeeForEvaluation[],
  campaign: EvaluationPeriodOption | undefined,
  evaluations: EvaluationRecord[],
  criteria: EvaluationCriterionRecord[],
  rules: CalculationRuleRecord[]
): {
  scoresByEmployee: Record<string, number | null>;
  statusByEmployee: Record<string, EvaluationStatus | null>;
} {
  const scoresByEmployee: Record<string, number | null> = {};
  const statusByEmployee: Record<string, EvaluationStatus | null> = {};

  if (!campaign) {
    for (const emp of employees) {
      scoresByEmployee[emp.id] = null;
      statusByEmployee[emp.id] = null;
    }
    return { scoresByEmployee, statusByEmployee };
  }

  const campaignRef = {
    id: campaign.id,
    name: campaign.name,
    start_date: campaign.start_date,
  };

  for (const emp of employees) {
    const record = findEvaluationForOpenPeriod(emp.id, campaignRef, evaluations);
    statusByEmployee[emp.id] = record?.status ?? null;
    scoresByEmployee[emp.id] = record
      ? resolveEvaluationPercentage(record, criteria, rules, emp)
      : null;
  }

  return { scoresByEmployee, statusByEmployee };
}

function resolveDefaultPeriodName(
  availablePeriods: EvaluationPeriodOption[],
  preferredPeriodName?: string | null,
  openPeriodName?: string | null
): string {
  if (preferredPeriodName && availablePeriods.some((p) => p.name === preferredPeriodName)) {
    return preferredPeriodName;
  }
  if (openPeriodName && availablePeriods.some((p) => p.name === openPeriodName)) {
    return openPeriodName;
  }
  return availablePeriods[availablePeriods.length - 1]?.name ?? '';
}

export async function fetchEvaluationPageData(
  preferredPeriodName?: string | null,
  options?: { reuseEvaluations?: EvaluationRecord[] }
): Promise<EvaluationPageData> {
  const evaluationsPromise = options?.reuseEvaluations
    ? Promise.resolve(options.reuseEvaluations)
    : fetchEvaluations();

  const [employees, criteria, rules, rolesRes, deptsRes, dbPeriods, evaluations, openPeriod] =
    await Promise.all([
      fetchEmployeesForEvaluation(),
      fetchEvaluationCriteria(),
      fetchCalculationRules(),
      supabase.from('roles').select('id, name'),
      supabase.from('departments').select('id, name'),
      getAllEvaluationPeriods(),
      evaluationsPromise,
      getCurrentOpenPeriod(),
    ]);

  const availablePeriods = getDashboardPeriods(dbPeriods).map((p) => ({
    name: p.name,
    code: dateToPeriodCode(new Date(p.start_date)),
    id: p.id,
    start_date: p.start_date,
  }));

  const period = resolveDefaultPeriodName(
    availablePeriods,
    preferredPeriodName,
    openPeriod?.name ?? null
  );
  const campaign = availablePeriods.find((p) => p.name === period);
  const maps = computePeriodEmployeeMaps(employees, campaign, evaluations, criteria, rules);

  const data: EvaluationPageData = {
    employees,
    criteria,
    rules,
    roles: rolesRes.data ?? [],
    departments: deptsRes.data ?? [],
    availablePeriods,
    evaluations,
    period,
    scoresByEmployee: maps.scoresByEmployee,
    statusByEmployee: maps.statusByEmployee,
    fetchedAt: Date.now(),
  };

  snapshot = data;
  return data;
}

export function applyPeriodToSnapshot(periodName: string): {
  scoresByEmployee: Record<string, number | null>;
  statusByEmployee: Record<string, EvaluationStatus | null>;
} | null {
  if (!snapshot) return null;

  const campaign = snapshot.availablePeriods.find((p) => p.name === periodName);
  if (!campaign) return null;

  const maps = computePeriodEmployeeMaps(
    snapshot.employees,
    campaign,
    snapshot.evaluations,
    snapshot.criteria,
    snapshot.rules
  );

  snapshot = {
    ...snapshot,
    period: periodName,
    scoresByEmployee: maps.scoresByEmployee,
    statusByEmployee: maps.statusByEmployee,
    fetchedAt: Date.now(),
  };

  return maps;
}

export async function refreshEvaluationPageEvaluations(
  periodName: string
): Promise<{
  scoresByEmployee: Record<string, number | null>;
  statusByEmployee: Record<string, EvaluationStatus | null>;
} | null> {
  if (!snapshot) return null;

  const evaluations = await fetchEvaluations();
  snapshot = { ...snapshot, evaluations, fetchedAt: Date.now() };

  const maps = applyPeriodToSnapshot(periodName);
  return maps;
}
