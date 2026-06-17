import { supabase } from '@/integrations/supabase/client';
import type { EvaluationCriterionRecord } from '@/lib/evaluation-calculator';
import {
  computeEvaluationPercentageFromResponses,
  getCriterionMaxPoints,
  type CalculationRuleRecord,
} from '@/lib/evaluation-calculator';
import { isCriterionAvailableForEvaluation } from '@/lib/criterion-archive';
import { dateToPeriodCode } from '@/lib/evaluation-period-label';
import type { EvaluationPeriod } from '@/lib/evaluation-period-db';
import {
  appendAuditEntry,
  createAuditEntry,
  type EvaluationAuditEntry,
} from '@/lib/evaluation-audit';
import { collectBranchScopeIds, type BranchRecord } from '@/lib/branch-tree';
import { collectDepartmentScopeIds, type DepartmentRecord } from '@/lib/department-tree';
import { collectDescendantRoleIds, type RoleRecord } from '@/lib/role-tree';
import { getSessionUser, isSiteDeveloper, type SessionUser } from '@/lib/session-user';
import type {
  EmployeeForEvaluation,
  EvaluationRecord,
  EvaluationResponseItem,
  EvaluationStatus,
} from '@/lib/evaluation-types';

const STORAGE_KEY = 'hr_pulse_evaluations';

const SELECT_FULL =
  'id, employee_id, employee_email, employee_name, manager_id, period, score, feedback, status, responses, activity_log, created_at, updated_at';
const SELECT_LEGACY =
  'id, employee_id, employee_email, employee_name, manager_id, period, score, feedback, status, created_at, updated_at';

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST116' || error.code === '42P01' || /does not exist/i.test(error.message ?? '');
}

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = error.message ?? '';
  return error.code === '42703' || /column.*does not exist/i.test(msg);
}

function sanitizeUuid(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function isLegacyDataError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '22P02' ||
    /invalid input syntax for type uuid|uuid/i.test(error.message ?? '')
  );
}

function parseActivityLog(raw: unknown): EvaluationAuditEntry[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      return parseActivityLog(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) => e && typeof e === 'object') as EvaluationAuditEntry[];
}

function parseResponses(raw: unknown): EvaluationResponseItem[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      return parseResponses(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((r) => r && typeof r === 'object') as EvaluationResponseItem[];
}

function normalizeStatus(raw: string | null | undefined): EvaluationStatus {
  const s = (raw ?? 'pending').toLowerCase();
  if (s === 'draft' || s === 'submitted' || s === 'approved' || s === 'rejected' || s === 'pending') {
    return s;
  }
  if (s === 'completed') return 'approved';
  return 'pending';
}

function normalizeEvaluation(row: Record<string, unknown>): EvaluationRecord {
  return {
    id: String(row.id),
    employee_id: (row.employee_id as string) ?? null,
    employee_email: (row.employee_email as string) ?? null,
    employee_name: (row.employee_name as string) ?? null,
    manager_id: (row.manager_id as string) ?? null,
    period: String(row.period ?? ''),
    score: row.score != null ? Number(row.score) : null,
    feedback: (row.feedback as string) ?? null,
    status: normalizeStatus(row.status as string),
    responses: parseResponses(row.responses),
    activity_log: parseActivityLog(row.activity_log),
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

function loadFromLocal(): EvaluationRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EvaluationRecord[];
    return Array.isArray(parsed) ? parsed.map((e) => normalizeEvaluation(e as unknown as Record<string, unknown>)) : [];
  } catch {
    return [];
  }
}

function saveToLocal(list: EvaluationRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/**
 * Critère applicable si l'employé correspond à chaque dimension renseignée
 * (même rôle, filiale et service que ceux portés par le critère).
 */
export function criterionAppliesToEmployee(
  criterion: EvaluationCriterionRecord,
  employee: Pick<EmployeeForEvaluation, 'role_id' | 'branch_id' | 'department_id'>
): boolean {
  if (criterion.is_active === false) return false;

  const roleIds = criterion.role_ids ?? [];
  const branchIds = criterion.branch_ids ?? [];
  const departmentIds = criterion.department_ids ?? [];
  const roleAll = criterion.role_all ?? roleIds.length === 0;
  const branchAll = criterion.branch_all ?? branchIds.length === 0;
  const departmentAll = criterion.department_all ?? departmentIds.length === 0;

  if ((!roleAll && roleIds.length === 0) || (!branchAll && branchIds.length === 0) || (!departmentAll && departmentIds.length === 0)) {
    return false;
  }

  if (!roleAll && roleIds.length > 0) {
    if (!employee.role_id || !roleIds.includes(employee.role_id)) return false;
  }
  if (!branchAll && branchIds.length > 0) {
    if (!employee.branch_id || !branchIds.includes(employee.branch_id)) return false;
  }
  if (!departmentAll && departmentIds.length > 0) {
    if (!employee.department_id || !departmentIds.includes(employee.department_id)) {
      return false;
    }
  }

  return true;
}

/** Score maximum pondéré (points × coefficient) pour un employé. */
export function getMaxEvaluationScoreForEmployee(
  employee: Pick<EmployeeForEvaluation, 'role_id' | 'branch_id' | 'department_id'>,
  criteria: EvaluationCriterionRecord[],
  rules: CalculationRuleRecord[] = []
): number {
  return criteria
    .filter((c) => isCriterionAvailableForEvaluation(c) && criterionAppliesToEmployee(c, employee))
    .reduce((sum, c) => sum + getCriterionMaxPoints(c, rules) * (c.weight ?? 1), 0);
}

export function resolveEvaluationPercentage(
  evaluation: {
    score: number | null;
    responses?: EvaluationResponseItem[] | null;
  },
  criteria: EvaluationCriterionRecord[],
  rules: CalculationRuleRecord[],
  employee?: Pick<EmployeeForEvaluation, 'role_id' | 'branch_id' | 'department_id'>
): number | null {
  if (evaluation.responses?.length) {
    const fromResponses = computeEvaluationPercentageFromResponses(
      evaluation.responses,
      criteria,
      rules
    );
    if (fromResponses != null) return fromResponses;
  }

  if (evaluation.score == null || Number.isNaN(evaluation.score)) return null;

  if (employee) {
    const maxPoints = getMaxEvaluationScoreForEmployee(employee, criteria, rules);
    if (maxPoints > 0 && evaluation.score <= maxPoints + 0.01) {
      return (evaluation.score / maxPoints) * 100;
    }
  }

  return evaluation.score;
}

export function formatEvaluationScore(score: number | null | undefined, _maxScore?: number | null): string {
  if (score == null || Number.isNaN(score)) return '—';
  return `${score.toFixed(1)} %`;
}

export class CriterionInUseError extends Error {
  readonly usageCount: number;

  constructor(usageCount: number) {
    super(
      usageCount === 1
        ? 'Ce critère est utilisé dans 1 évaluation et ne peut pas être supprimé. Archivez-le à la place.'
        : `Ce critère est utilisé dans ${usageCount} évaluations et ne peut pas être supprimé. Archivez-le à la place.`
    );
    this.name = 'CriterionInUseError';
    this.usageCount = usageCount;
  }
}

export async function countEvaluationsUsingCriterion(criterionId: string): Promise<number> {
  const { data, error } = await supabase.from('evaluations').select('responses');
  if (error) {
    if (isMissingTableError(error)) {
      const local = loadFromLocal();
      return local.filter((evaluation) =>
        (evaluation.responses ?? []).some((response) => response.criterion_id === criterionId)
      ).length;
    }
    throw error;
  }

  let count = 0;
  for (const row of data ?? []) {
    const responses = Array.isArray(row.responses) ? (row.responses as EvaluationResponseItem[]) : [];
    if (responses.some((response) => response.criterion_id === criterionId)) {
      count += 1;
    }
  }
  return count;
}

export async function getEvaluationPercentageForEmployeePeriod(
  employeeId: string,
  period: string,
  criteria: EvaluationCriterionRecord[],
  rules: CalculationRuleRecord[],
  employee: Pick<EmployeeForEvaluation, 'role_id' | 'branch_id' | 'department_id'>
): Promise<number | null> {
  const evaluation = await findEvaluationForEmployeePeriod(employeeId, period);
  if (!evaluation) return null;
  return resolveEvaluationPercentage(evaluation, criteria, rules, employee);
}

function evaluationMatchesOpenPeriod(
  evaluation: EvaluationRecord,
  openPeriod: Pick<EvaluationPeriod, 'id' | 'name' | 'start_date'>
): boolean {
  const periodCode = dateToPeriodCode(new Date(openPeriod.start_date));
  const stored = evaluation.period?.trim();
  return stored === openPeriod.name || stored === periodCode || stored === openPeriod.id;
}

function needsEvaluatorAction(
  status: EvaluationStatus | null | undefined,
  canSubmit: boolean,
  canReview: boolean
): boolean {
  if (!status) return canSubmit;
  if (status === 'submitted') return canReview;
  if (status === 'approved') return false;
  if (status === 'draft' || status === 'pending' || status === 'rejected') return canSubmit;
  return false;
}

/** Nombre d'employés du périmètre nécessitant une action (saisie ou revue) sur la période ouverte. */
export async function countEvaluatorPendingWork(
  canSubmit: boolean,
  canReview: boolean,
  openPeriod: Pick<EvaluationPeriod, 'id' | 'name' | 'start_date'> | null
): Promise<number> {
  if (!openPeriod || (!canSubmit && !canReview)) return 0;

  const [employees, evaluations] = await Promise.all([
    fetchEmployeesForEvaluation(),
    fetchEvaluations(),
  ]);

  let count = 0;
  for (const employee of employees) {
    const evaluation = evaluations.find(
      (row) => row.employee_id === employee.id && evaluationMatchesOpenPeriod(row, openPeriod)
    );
    if (needsEvaluatorAction(evaluation?.status ?? null, canSubmit, canReview)) {
      count += 1;
    }
  }
  return count;
}

export function filterEmployeesInEvaluatorScope(
  session: SessionUser | null,
  employees: EmployeeForEvaluation[],
  roles: RoleRecord[],
  branches: BranchRecord[],
  departments: DepartmentRecord[]
): EmployeeForEvaluation[] {
  if (isSiteDeveloper(session)) {
    return employees.filter((e) => e.id !== session?.id);
  }
  if (!session?.role_id || roles.length === 0) return [];

  const allowedRoleIds = collectDescendantRoleIds(session.role_id, roles);
  const allowedBranchIds =
    session.branch_id && branches.length > 0
      ? collectBranchScopeIds(session.branch_id, branches)
      : null;
  const allowedDepartmentIds =
    session.department_id && departments.length > 0
      ? collectDepartmentScopeIds(session.department_id, departments)
      : null;

  return employees.filter((emp) => {
    if (emp.id === session.id) return false;
    if (!emp.role_id || !allowedRoleIds.includes(emp.role_id)) return false;
    if (allowedBranchIds !== null) {
      if (!emp.branch_id || !allowedBranchIds.includes(emp.branch_id)) return false;
    }
    if (allowedDepartmentIds !== null) {
      if (!emp.department_id || !allowedDepartmentIds.includes(emp.department_id)) {
        return false;
      }
    }
    return true;
  });
}

export async function fetchEmployeesForEvaluation(): Promise<EmployeeForEvaluation[]> {
  const session = getSessionUser();
  const [usersRes, branchesRes, rolesRes, deptsRes] = await Promise.all([
    supabase
      .from('users')
      .select('id, name, email, position, branch_id, department_id, role_id')
      .is('archived_at', null)
      .eq('is_active', true)
      .order('name'),
    supabase.from('branches').select('id, name, child_branches, parent_branch_id'),
    supabase.from('roles').select('id, name, child_roles, parent_role_id'),
    supabase.from('departments').select('id, name, child_departments, parent_department_id'),
  ]);

  if (usersRes.error) {
    if (isMissingTableError(usersRes.error)) return [];
    throw usersRes.error;
  }

  const branchMap = new Map(
    (branchesRes.data ?? []).map((b) => [b.id as string, b.name as string])
  );

  const all: EmployeeForEvaluation[] = (usersRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    position: row.position,
    branch_id: row.branch_id,
    department_id: row.department_id,
    role_id: row.role_id,
    branch_name: row.branch_id ? branchMap.get(row.branch_id) : undefined,
  }));

  return filterEmployeesInEvaluatorScope(
    session,
    all,
    rolesRes.data ?? [],
    branchesRes.data ?? [],
    deptsRes.data ?? []
  );
}

export async function fetchEvaluations(): Promise<EvaluationRecord[]> {
  let { data, error } = await supabase.from('evaluations').select(SELECT_FULL).order('created_at', {
    ascending: false,
  });

  if (error && isMissingColumnError(error)) {
    const legacy = await supabase.from('evaluations').select(SELECT_LEGACY).order('created_at', {
      ascending: false,
    });
    data = legacy.data as typeof data;
    error = legacy.error;
  }

  if (error && isMissingTableError(error)) return loadFromLocal();
  if (error) throw error;
  if (!data?.length) return loadFromLocal();
  return data.map((row) => normalizeEvaluation(row as Record<string, unknown>));
}

export async function upsertEvaluation(
  evaluation: Omit<EvaluationRecord, 'id' | 'created_at' | 'updated_at'> & { id?: string }
): Promise<EvaluationRecord> {
  const remoteId = sanitizeUuid(evaluation.id);
  const payload: Record<string, unknown> = {
    employee_id: sanitizeUuid(evaluation.employee_id),
    employee_email: evaluation.employee_email,
    employee_name: evaluation.employee_name,
    manager_id: sanitizeUuid(evaluation.manager_id),
    period: evaluation.period,
    score: evaluation.score,
    feedback: evaluation.feedback,
    status: evaluation.status,
    responses: evaluation.responses,
    activity_log: evaluation.activity_log ?? [],
    updated_at: new Date().toISOString(),
  };

  const tryWrite = async (body: Record<string, unknown>, select: string) => {
    if (remoteId) {
      return supabase.from('evaluations').update(body).eq('id', remoteId).select(select).single();
    }
    return supabase.from('evaluations').insert([body]).select(select).single();
  };

  let { data, error } = await tryWrite(payload, SELECT_FULL);
  if (error && isMissingColumnError(error)) {
    const { responses: _r, activity_log: _a, ...legacy } = payload;
    const retry = await tryWrite(legacy, SELECT_LEGACY);
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (!error && data) {
    const saved = normalizeEvaluation(data as Record<string, unknown>);
    const local = loadFromLocal();
    const next = evaluation.id
      ? local.map((e) => (e.id === saved.id ? saved : e))
      : [saved, ...local];
    saveToLocal(next);
    return saved;
  }

  if (error && !isMissingTableError(error) && !isLegacyDataError(error)) {
    // Legacy local records can have non-UUID ids; keep workflow alive using local fallback.
    if (!(evaluation.id && !remoteId)) throw error;
  }

  const saved: EvaluationRecord = {
    id: evaluation.id ?? crypto.randomUUID(),
    ...evaluation,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const local = loadFromLocal();
  const next = evaluation.id ? local.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...local];
  saveToLocal(next);
  return saved;
}

export async function updateEvaluationStatus(
  id: string,
  status: EvaluationStatus,
  auditComment?: string
): Promise<void> {
  const remoteId = sanitizeUuid(id);
  const list = await fetchEvaluations();
  const current = list.find((e) => e.id === id);
  const action =
    status === 'approved'
      ? 'evaluation_approved'
      : status === 'rejected'
        ? 'evaluation_rejected'
        : 'evaluation_status_changed';
  const activity_log = appendAuditEntry(
    current?.activity_log,
    createAuditEntry(action, auditComment)
  );

  const body: Record<string, unknown> = {
    status,
    activity_log,
    updated_at: new Date().toISOString(),
  };

  let { error } = remoteId
    ? await supabase.from('evaluations').update(body).eq('id', remoteId)
    : { error: null };
  if (error && isMissingColumnError(error)) {
    const { activity_log: _a, ...legacy } = body;
    const retry = remoteId
      ? await supabase.from('evaluations').update(legacy).eq('id', remoteId)
      : { error: null };
    error = retry.error;
  }
  if (error && !isMissingTableError(error)) throw error;

  const local = loadFromLocal();
  saveToLocal(
    local.map((e) =>
      e.id === id ? { ...e, status, activity_log, updated_at: String(body.updated_at) } : e
    )
  );
}

export async function findEvaluationForEmployeePeriod(
  employeeId: string,
  period: string
): Promise<EvaluationRecord | null> {
  const list = await fetchEvaluations();
  return (
    list.find((e) => e.employee_id === employeeId && e.period === period) ?? null
  );
}

export async function deleteEvaluation(id: string): Promise<void> {
  const remoteId = sanitizeUuid(id);
  const { error } = remoteId
    ? await supabase.from('evaluations').delete().eq('id', remoteId)
    : { error: null };
  if (error && !isMissingTableError(error)) throw error;
  saveToLocal(loadFromLocal().filter((e) => e.id !== id));
}

export async function getLatestEvaluationScoreForEmployee(employeeId: string): Promise<number | null> {
  const list = await fetchEvaluations();
  const latest = list.find((e) => e.employee_id === employeeId && e.status !== 'draft');
  return latest?.score ?? null;
}

export async function getLatestEvaluationStatusForEmployee(
  employeeId: string
): Promise<EvaluationStatus | null> {
  const list = await fetchEvaluations();
  const latest = list.find((e) => e.employee_id === employeeId && e.status !== 'draft');
  return latest?.status ?? null;
}

export async function getEvaluationScoreForEmployeePeriod(
  employeeId: string,
  period: string
): Promise<number | null> {
  const list = await fetchEvaluations();
  const evaluation = list.find((e) => e.employee_id === employeeId && e.period === period && e.status !== 'draft');
  return evaluation?.score ?? null;
}

export async function getEvaluationStatusForEmployeePeriod(
  employeeId: string,
  period: string
): Promise<EvaluationStatus | null> {
  const list = await fetchEvaluations();
  const evaluation = list.find((e) => e.employee_id === employeeId && e.period === period && e.status !== 'draft');
  return evaluation?.status ?? null;
}
