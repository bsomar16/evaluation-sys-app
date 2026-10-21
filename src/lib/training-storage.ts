import { supabase } from '@/integrations/supabase/client';
import { getSessionUser, isPlatformAdmin } from '@/lib/session-user';
import type {
  TrainingPlanningDetails,
  TrainingRequestDetails,
  TrainingRequestRecord,
  TrainingStatus,
} from '@/lib/training-types';

const STORAGE_KEY = 'dd_training_requests_v2';

const SELECT_FULL =
  'id, employee_id, employee_email, employee_name, manager_id, course_name, reason, status, request_details, planning_details, created_at, updated_at';
const SELECT_LEGACY =
  'id, employee_id, employee_email, employee_name, manager_id, course_name, reason, status, created_at, updated_at';

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

function parseJsonObject<T extends object>(raw: unknown): T {
  if (!raw) return {} as T;
  if (typeof raw === 'string') {
    try {
      return parseJsonObject<T>(JSON.parse(raw));
    } catch {
      return {} as T;
    }
  }
  if (typeof raw === 'object') return raw as T;
  return {} as T;
}

function normalizeStatus(raw: string | null | undefined): TrainingStatus {
  const s = (raw ?? 'pending').toLowerCase();
  if (s === 'pending' || s === 'approved' || s === 'rejected' || s === 'planned' || s === 'completed') {
    return s;
  }
  return 'pending';
}

function normalizeRow(row: Record<string, unknown>): TrainingRequestRecord {
  const details = parseJsonObject<TrainingRequestDetails>(row.request_details);
  const planning = parseJsonObject<TrainingPlanningDetails>(row.planning_details);
  return {
    id: String(row.id),
    employee_id: (row.employee_id as string) ?? null,
    employee_email: (row.employee_email as string) ?? null,
    employee_name: (row.employee_name as string) ?? null,
    manager_id: (row.manager_id as string) ?? null,
    course_name: String(row.course_name ?? details.objectif ?? 'Formation'),
    reason: (row.reason as string) ?? details.problematique ?? null,
    status: normalizeStatus(row.status as string),
    request_details: details,
    planning_details: planning,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

function readLocal(): TrainingRequestRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((r) => normalizeRow(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

function writeLocal(rows: TrainingRequestRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function mergeLocalOverlay(rows: TrainingRequestRecord[]): TrainingRequestRecord[] {
  const local = readLocal();
  const byId = new Map(local.map((r) => [r.id, r]));
  return rows.map((r) => {
    const overlay = byId.get(r.id);
    if (!overlay) return r;
    return {
      ...r,
      request_details: { ...r.request_details, ...overlay.request_details },
      planning_details: { ...r.planning_details, ...overlay.planning_details },
      status: overlay.status ?? r.status,
    };
  });
}

export async function fetchTrainingRequests(options?: {
  scope?: 'all' | 'mine';
}): Promise<TrainingRequestRecord[]> {
  const session = getSessionUser();
  const isDev = isPlatformAdmin(session);
  const scopeAll = options?.scope === 'all' || isDev;

  let query = supabase.from('training_requests').select(SELECT_FULL).order('created_at', { ascending: false });
  let { data, error } = await query;

  if (error && isMissingColumnError(error)) {
    const legacy = await supabase.from('training_requests').select(SELECT_LEGACY).order('created_at', { ascending: false });
    data = legacy.data;
    error = legacy.error;
  }

  if (error && (isMissingTableError(error) || error.message)) {
    const local = readLocal();
    if (local.length > 0) return filterByAccess(local, session, scopeAll);
    if (isMissingTableError(error)) return [];
  }

  const rows = (data ?? []).map((r) => normalizeRow(r as Record<string, unknown>));
  const merged = mergeLocalOverlay(rows);
  if (merged.length === 0 && readLocal().length > 0) {
    return filterByAccess(readLocal(), session, scopeAll);
  }
  return filterByAccess(merged, session, scopeAll);
}

function filterByAccess(
  rows: TrainingRequestRecord[],
  session: ReturnType<typeof getSessionUser>,
  scopeAll: boolean
): TrainingRequestRecord[] {
  if (scopeAll || !session?.id) return rows;
  const managerId = sanitizeUuid(session.id);
  if (!managerId) return rows;
  return rows.filter((r) => r.manager_id === managerId || r.employee_id === managerId);
}

export async function createTrainingRequest(input: {
  course_name: string;
  reason?: string | null;
  request_details: TrainingRequestDetails;
  beneficiary?: { id?: string; email?: string; name?: string };
}): Promise<TrainingRequestRecord> {
  const session = getSessionUser();
  const managerId = sanitizeUuid(session?.id);
  const beneficiaryId = sanitizeUuid(input.beneficiary?.id);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const row: TrainingRequestRecord = {
    id,
    employee_id: beneficiaryId,
    employee_email: input.beneficiary?.email ?? session?.email ?? null,
    employee_name: input.beneficiary?.name ?? input.request_details.beneficiary_name ?? session?.name ?? null,
    manager_id: managerId,
    course_name: input.course_name,
    reason: input.reason ?? input.request_details.problematique ?? null,
    status: 'pending',
    request_details: input.request_details,
    planning_details: {},
    created_at: now,
    updated_at: now,
  };

  const payload: Record<string, unknown> = {
    id,
    employee_id: beneficiaryId,
    employee_email: row.employee_email,
    employee_name: row.employee_name,
    manager_id: managerId,
    course_name: row.course_name,
    reason: row.reason,
    status: 'pending',
    request_details: row.request_details,
    planning_details: {},
    updated_at: now,
  };

  let { error } = await supabase.from('training_requests').insert(payload);
  if (error && isMissingColumnError(error)) {
    const { request_details: _rd, planning_details: _pd, ...legacy } = payload;
    const retry = await supabase.from('training_requests').insert(legacy);
    error = retry.error;
  }

  if (error) {
    const local = readLocal();
    local.unshift(row);
    writeLocal(local);
  } else {
    const local = readLocal().filter((r) => r.id !== id);
    local.unshift(row);
    writeLocal(local);
  }

  return row;
}

export async function updateTrainingStatus(id: string, status: TrainingStatus): Promise<void> {
  const now = new Date().toISOString();
  let { error } = await supabase.from('training_requests').update({ status, updated_at: now }).eq('id', id);
  if (error && isMissingTableError(error)) {
    /* local only */
  }
  patchLocal(id, { status, updated_at: now });
}

export async function saveTrainingPlanning(
  id: string,
  planning: TrainingPlanningDetails
): Promise<void> {
  const now = new Date().toISOString();
  let { error } = await supabase
    .from('training_requests')
    .update({ planning_details: planning, status: 'planned', updated_at: now })
    .eq('id', id);

  if (error && isMissingColumnError(error)) {
    const retry = await supabase.from('training_requests').update({ status: 'planned', updated_at: now }).eq('id', id);
    error = retry.error;
  }

  patchLocal(id, { planning_details: planning, status: 'planned', updated_at: now });
}

function patchLocal(id: string, patch: Partial<TrainingRequestRecord>): void {
  const local = readLocal();
  const idx = local.findIndex((r) => r.id === id);
  if (idx >= 0) {
    local[idx] = { ...local[idx], ...patch };
  } else {
    local.push({
      id,
      course_name: 'Formation',
      status: 'pending',
      request_details: {},
      planning_details: {},
      ...patch,
    } as TrainingRequestRecord);
  }
  writeLocal(local);
}
