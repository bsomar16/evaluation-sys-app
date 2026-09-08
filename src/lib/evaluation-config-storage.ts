import { supabase } from '@/integrations/supabase/client';
import { parseRuleConfig } from '@/lib/calculation-method-catalog';
import {
  CRITERION_TYPE_LABELS,
  DEFAULT_CALCULATION_RULES,
  DEFAULT_EVALUATION_CRITERIA,
  normalizeScopeIds,
  type CalculationRuleRecord,
  type CriterionType,
  type EvaluationCriterionRecord,
} from '@/lib/evaluation-calculator';
import { CriterionInUseError, countEvaluationsUsingCriterion } from '@/lib/evaluation-storage';



const CRITERIA_STORAGE_KEY = 'hr_pulse_evaluation_criteria';




type CriterionRow = EvaluationCriterionRecord & {

  role_id?: string | null;

  branch_id?: string | null;

  department_id?: string | null;
  role_all?: boolean | null;
  branch_all?: boolean | null;
  department_all?: boolean | null;
  frequency?: number | null;
  frequency_anchor_date?: string | null;
  created_at?: string | null;

};



function isMissingTableError(error: { code?: string; message?: string } | null): boolean {

  if (!error) return false;

  return error.code === 'PGRST116' || error.code === '42P01' || /does not exist/i.test(error.message ?? '');

}



function normalizeCriterion(row: CriterionRow): EvaluationCriterionRecord {
  const role_ids = normalizeScopeIds(row.role_ids, row.role_id);
  const branch_ids = normalizeScopeIds(row.branch_ids, row.branch_id);
  const department_ids = normalizeScopeIds(row.department_ids, row.department_id);
  return {
    ...row,
    name_ar: row.name_ar ?? null,
    calculation_rule_id: row.calculation_rule_id ?? null,
    choice_option_1_label: row.choice_option_1_label ?? null,
    choice_option_2_label: row.choice_option_2_label ?? null,
    choice_option_labels:
      Array.isArray(row.choice_option_labels) && row.choice_option_labels.length > 0
        ? row.choice_option_labels.filter((label): label is string => typeof label === 'string')
        : [row.choice_option_1_label, row.choice_option_2_label].filter(
            (label): label is string => typeof label === 'string' && Boolean(label)
          ),
    role_all: row.role_all ?? role_ids.length === 0,
    branch_all: row.branch_all ?? branch_ids.length === 0,
    department_all: row.department_all ?? department_ids.length === 0,
    role_ids,
    branch_ids,
    department_ids,
    weight: row.weight != null ? Number(row.weight) : 1,
    frequency:
      row.frequency != null ? Math.max(1, Math.floor(Number(row.frequency))) : 1,
    frequency_anchor_date: row.frequency_anchor_date ?? null,
    description: row.description?.trim() || null,
    sort_order: row.sort_order ?? 0,
    is_active: row.is_active !== false,
    archived_at: row.archived_at ?? null,
    created_at: row.created_at ?? null,
  };
}



function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {

  if (!error) return false;

  const msg = error.message ?? '';

  return error.code === '42703' || /column.*does not exist/i.test(msg);

}

function isPermissionError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // Treat common DB permission errors and HTTP auth failures (401/403/Unauthorized)
  return (
    error.code === '42501' ||
    /permission denied|not authorized|forbidden|unauthorized|401|403/i.test(error.message ?? '')
  );
}

function sanitizeUuid(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}



function loadCriteriaFromLocal(): EvaluationCriterionRecord[] {

  try {

    const raw = localStorage.getItem(CRITERIA_STORAGE_KEY);

    if (!raw) return [...DEFAULT_EVALUATION_CRITERIA];

    const parsed = JSON.parse(raw) as CriterionRow[];

    const list = Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULT_EVALUATION_CRITERIA];

    return list.map(normalizeCriterion);

  } catch {

    return [...DEFAULT_EVALUATION_CRITERIA];

  }

}



function saveCriteriaToLocal(criteria: EvaluationCriterionRecord[]) {

  localStorage.setItem(CRITERIA_STORAGE_KEY, JSON.stringify(criteria));

}






const SELECT_ARRAYS =
  'id, name, type, calculation_rule_id, choice_option_1_label, choice_option_2_label, choice_option_labels, role_all, branch_all, department_all, role_ids, branch_ids, department_ids, weight, frequency, frequency_anchor_date, description, sort_order, is_active, archived_at, created_at';

/** Comme SELECT_ARRAYS mais avec la colonne name_ar (repli si la colonne n'existe pas encore). */
const SELECT_ARRAYS_WITH_NAME_AR = `${SELECT_ARRAYS}, name_ar`;

const SELECT_WITHOUT_DESCRIPTION =
  'id, name, type, calculation_rule_id, choice_option_1_label, choice_option_2_label, choice_option_labels, role_all, branch_all, department_all, role_ids, branch_ids, department_ids, weight, sort_order, is_active';

const SELECT_LEGACY_SINGLES =
  'id, name, type, role_id, branch_id, department_id, weight, sort_order, is_active';

const SELECT_MINIMAL = 'id, name, type, weight, sort_order, is_active';



function buildPayload(criterion: Omit<EvaluationCriterionRecord, 'id'> & { id?: string }) {

  const roleIds = criterion.role_ids ?? [];

  const branchIds = criterion.branch_ids ?? [];

  const departmentIds = criterion.department_ids ?? [];

  return {

    name: criterion.name,
    name_ar: criterion.name_ar?.trim() || null,
    type: criterion.type,
    calculation_rule_id: sanitizeUuid(criterion.calculation_rule_id),
    choice_option_1_label: criterion.choice_option_1_label?.trim() || null,
    choice_option_2_label: criterion.choice_option_2_label?.trim() || null,
    choice_option_labels: (criterion.choice_option_labels ?? [])
      .map((label) => label.trim())
      .filter(Boolean),
    role_all: criterion.role_all ?? roleIds.length === 0,
    branch_all: criterion.branch_all ?? branchIds.length === 0,
    department_all: criterion.department_all ?? departmentIds.length === 0,
    role_ids: roleIds,

    branch_ids: branchIds,

    department_ids: departmentIds,

    weight: criterion.weight ?? 1,
    frequency: Math.max(1, Math.floor(Number(criterion.frequency) || 1)),
    frequency_anchor_date: criterion.frequency_anchor_date || null,
    description: criterion.description?.trim() || null,
    sort_order: criterion.sort_order,

    is_active: criterion.is_active,

    /** Compatibilité BDD avec colonnes uuid uniques */

    role_id: roleIds[0] ?? null,

    branch_id: branchIds[0] ?? null,

    department_id: departmentIds[0] ?? null,

  };

}



function syncCriterionToLocal(criterion: EvaluationCriterionRecord): void {
  const local = loadCriteriaFromLocal();
  const next = local.some((c) => c.id === criterion.id)
    ? local.map((c) => (c.id === criterion.id ? criterion : c))
    : [...local, criterion];
  saveCriteriaToLocal(next);
}

function mergeCriterionFieldsFromLocal(
  records: EvaluationCriterionRecord[]
): EvaluationCriterionRecord[] {
  const localById = new Map(loadCriteriaFromLocal().map((c) => [c.id, c]));
  return records.map((c) => {
    const local = localById.get(c.id);
    let next = c;
    if (!c.description?.trim() && local?.description?.trim()) {
      next = { ...next, description: local.description };
    }
    if (c.archived_at == null && local?.archived_at) {
      next = { ...next, archived_at: local.archived_at, is_active: local.is_active };
    }
    return next;
  });
}

export async function fetchEvaluationCriteria(): Promise<EvaluationCriterionRecord[]> {

  let { data, error } = await supabase

    .from('evaluation_criteria')

    .select(SELECT_ARRAYS_WITH_NAME_AR)

    .order('sort_order', { ascending: true });

  // Repli si la colonne name_ar n'existe pas encore (migration non appliquée).
  if (error && isMissingColumnError(error)) {
    const withoutNameAr = await supabase
      .from('evaluation_criteria')
      .select(SELECT_ARRAYS)
      .order('sort_order', { ascending: true });
    data = withoutNameAr.data as typeof data;
    error = withoutNameAr.error;
  }



  if (error && isMissingColumnError(error)) {

    const withoutDescription = await supabase

      .from('evaluation_criteria')

      .select(SELECT_WITHOUT_DESCRIPTION)

      .order('sort_order', { ascending: true });

    data = withoutDescription.data as typeof data;

    error = withoutDescription.error;

  }



  if (error && isMissingColumnError(error)) {

    const legacy = await supabase

      .from('evaluation_criteria')

      .select(SELECT_LEGACY_SINGLES)

      .order('sort_order', { ascending: true });

    data = legacy.data as typeof data;

    error = legacy.error;

  }



  if (error && isMissingColumnError(error)) {

    const minimal = await supabase

      .from('evaluation_criteria')

      .select(SELECT_MINIMAL)

      .order('sort_order', { ascending: true });

    data = minimal.data as typeof data;

    error = minimal.error;

  }



  if (error && isMissingTableError(error)) {

    return loadCriteriaFromLocal();

  }

  if (error) throw error;

  if (!data?.length) return loadCriteriaFromLocal();

  return mergeCriterionFieldsFromLocal((data as CriterionRow[]).map(normalizeCriterion));

}



async function persistCriterion(

  criterion: Omit<EvaluationCriterionRecord, 'id'> & { id?: string }

): Promise<EvaluationCriterionRecord> {

  const fullPayload = buildPayload(criterion);
  const remoteId = sanitizeUuid(criterion.id);

  const arrayPayload = {

    name: fullPayload.name,

    type: fullPayload.type,
    calculation_rule_id: fullPayload.calculation_rule_id,
    choice_option_1_label: fullPayload.choice_option_1_label,
    choice_option_2_label: fullPayload.choice_option_2_label,
    choice_option_labels: fullPayload.choice_option_labels,
    role_all: fullPayload.role_all,
    branch_all: fullPayload.branch_all,
    department_all: fullPayload.department_all,

    role_ids: fullPayload.role_ids,

    branch_ids: fullPayload.branch_ids,

    department_ids: fullPayload.department_ids,

    weight: fullPayload.weight,

    frequency: fullPayload.frequency,

    frequency_anchor_date: fullPayload.frequency_anchor_date,

    description: fullPayload.description,

    sort_order: fullPayload.sort_order,

    is_active: fullPayload.is_active,

  };

  const compatibilityPayload = {

    name: fullPayload.name,

    type: fullPayload.type,
    calculation_rule_id: fullPayload.calculation_rule_id,
    role_all: fullPayload.role_all,
    branch_all: fullPayload.branch_all,
    department_all: fullPayload.department_all,

    role_ids: fullPayload.role_ids,

    branch_ids: fullPayload.branch_ids,

    department_ids: fullPayload.department_ids,

    weight: fullPayload.weight,

    frequency: fullPayload.frequency,

    frequency_anchor_date: fullPayload.frequency_anchor_date,

    description: fullPayload.description,

    sort_order: fullPayload.sort_order,

    is_active: fullPayload.is_active,

  };

  const legacyPayload = {

    name: fullPayload.name,

    type: fullPayload.type,

    role_id: fullPayload.role_id,

    branch_id: fullPayload.branch_id,

    department_id: fullPayload.department_id,

    weight: fullPayload.weight,

    frequency: fullPayload.frequency,

    frequency_anchor_date: fullPayload.frequency_anchor_date,

    description: fullPayload.description,

    sort_order: fullPayload.sort_order,

    is_active: fullPayload.is_active,

  };

  const minimalPayload = {

    name: fullPayload.name,

    type: fullPayload.type,

    weight: fullPayload.weight,

    frequency: fullPayload.frequency,

    frequency_anchor_date: fullPayload.frequency_anchor_date,

    description: fullPayload.description,

    sort_order: fullPayload.sort_order,

    is_active: fullPayload.is_active,

  };



  const tryWrite = async (payload: Record<string, unknown>, select: string) => {

    if (remoteId) {

      return supabase

        .from('evaluation_criteria')

        .update(payload)

        .eq('id', remoteId)

        .select(select)

        .single();

    }

    return supabase.from('evaluation_criteria').insert([payload]).select(select).single();

  };



  const arrayPayloadWithNameAr = { ...arrayPayload, name_ar: fullPayload.name_ar } as Record<string, unknown>;

  const arrayPayloadWithoutDescription = { ...arrayPayload } as Record<string, unknown>;
  delete arrayPayloadWithoutDescription.description;

  const compatibilityPayloadWithoutDescription = { ...compatibilityPayload } as Record<string, unknown>;
  delete compatibilityPayloadWithoutDescription.description;

  const attempts: { payload: Record<string, unknown>; select: string }[] = [

    { payload: arrayPayloadWithNameAr, select: SELECT_ARRAYS_WITH_NAME_AR },
    { payload: arrayPayload, select: SELECT_ARRAYS },
    { payload: arrayPayloadWithoutDescription, select: SELECT_WITHOUT_DESCRIPTION },
    { payload: compatibilityPayload, select: SELECT_ARRAYS },
    { payload: compatibilityPayloadWithoutDescription, select: SELECT_WITHOUT_DESCRIPTION },

    { payload: legacyPayload, select: SELECT_LEGACY_SINGLES },

    { payload: minimalPayload, select: SELECT_MINIMAL },

  ];



  for (const { payload, select } of attempts) {

    if (criterion.id && !remoteId) break;

    const { data, error } = await tryWrite(payload, select);

    if (!error && data) {
      const normalized = normalizeCriterion(data as CriterionRow);
      const merged: EvaluationCriterionRecord = {
        ...normalized,
        description: normalized.description ?? fullPayload.description ?? null,
        name_ar: normalized.name_ar ?? fullPayload.name_ar ?? null,
      };
      syncCriterionToLocal(merged);
      return merged;
    }

    // If we hit a permission/auth error, break and fall back to local storage.
    if (error && isPermissionError(error)) break;

    if (error && isMissingTableError(error)) break;

  }



  const local = loadCriteriaFromLocal();

  const saved: EvaluationCriterionRecord = {

    id: criterion.id ?? crypto.randomUUID(),

    name: fullPayload.name,
    name_ar: fullPayload.name_ar,

    type: fullPayload.type as EvaluationCriterionRecord['type'],
    calculation_rule_id: fullPayload.calculation_rule_id,
    choice_option_1_label: fullPayload.choice_option_1_label,
    choice_option_2_label: fullPayload.choice_option_2_label,
    choice_option_labels: fullPayload.choice_option_labels,
    role_all: Boolean(fullPayload.role_all),
    branch_all: Boolean(fullPayload.branch_all),
    department_all: Boolean(fullPayload.department_all),

    role_ids: fullPayload.role_ids,

    branch_ids: fullPayload.branch_ids,

    department_ids: fullPayload.department_ids,

    weight: fullPayload.weight,

    frequency: fullPayload.frequency,

    frequency_anchor_date: fullPayload.frequency_anchor_date,

    description: fullPayload.description,

    sort_order: fullPayload.sort_order,

    is_active: fullPayload.is_active,

  };

  const next = criterion.id

    ? local.map((c) => (c.id === criterion.id ? saved : c))

    : [...local, saved];

  saveCriteriaToLocal(next);

  return saved;

}



export async function upsertEvaluationCriterion(

  criterion: Omit<EvaluationCriterionRecord, 'id'> & { id?: string }

): Promise<EvaluationCriterionRecord> {

  return persistCriterion(criterion);

}



export async function deleteEvaluationCriterion(id: string): Promise<void> {
  const usageCount = await countEvaluationsUsingCriterion(id);
  if (usageCount > 0) {
    throw new CriterionInUseError(usageCount);
  }

  const { error } = await supabase.from('evaluation_criteria').delete().eq('id', id);

  if (error && !isMissingTableError(error)) throw error;

  const next = loadCriteriaFromLocal().filter((c) => c.id !== id);

  saveCriteriaToLocal(next);
}

export async function archiveEvaluationCriterion(id: string): Promise<void> {
  const archivedAt = new Date().toISOString();
  const { error } = await supabase
    .from('evaluation_criteria')
    .update({
      archived_at: archivedAt,
      is_active: false,
      updated_at: archivedAt,
    })
    .eq('id', id);

  if (error && !isMissingColumnError(error) && !isMissingTableError(error)) throw error;

  const local = loadCriteriaFromLocal();
  saveCriteriaToLocal(
    local.map((c) =>
      c.id === id ? { ...c, archived_at: archivedAt, is_active: false } : c
    )
  );
}

export async function restoreEvaluationCriterion(id: string): Promise<void> {
  const { error } = await supabase
    .from('evaluation_criteria')
    .update({
      archived_at: null,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error && !isMissingColumnError(error) && !isMissingTableError(error)) throw error;

  const local = loadCriteriaFromLocal();
  saveCriteriaToLocal(
    local.map((c) =>
      c.id === id ? { ...c, archived_at: null, is_active: true } : c
    )
  );
}

/**
 * Active ou désactive un critère (sans l'archiver).
 * Un critère désactivé reste dans la liste mais n'apparaît plus dans les
 * nouvelles évaluations tant qu'il n'est pas réactivé.
 */
export async function setEvaluationCriterionActive(id: string, isActive: boolean): Promise<void> {
  const remoteId = sanitizeUuid(id);
  if (remoteId) {
    const { error } = await supabase
      .from('evaluation_criteria')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', remoteId);
    if (error && !isMissingColumnError(error) && !isMissingTableError(error)) throw error;
  }

  const local = loadCriteriaFromLocal();
  saveCriteriaToLocal(local.map((c) => (c.id === id ? { ...c, is_active: isActive } : c)));
}

export { CriterionInUseError };



function normalizeCalculationRule(row: Partial<CalculationRuleRecord>): CalculationRuleRecord {
  const type = row.type as CriterionType;
  const legacyId = type ? `legacy-rule-${type}` : crypto.randomUUID();
  return {
    id: row.id ?? legacyId,
    type,
    label: row.label?.trim() || CRITERION_TYPE_LABELS[type] || String(type),
    max_points: row.max_points != null ? Number(row.max_points) : 10,
    config: parseRuleConfig(row.config),
  };
}

const SELECT_RULES_WITH_ID = 'id, type, label, max_points, config';
const SELECT_RULES_LEGACY = 'type, label, max_points, config';

export async function fetchCalculationRules(): Promise<CalculationRuleRecord[]> {
  let { data, error } = await supabase.from('calculation_rules').select(SELECT_RULES_WITH_ID);

  if (error && isMissingColumnError(error)) {
    const legacy = await supabase.from('calculation_rules').select(SELECT_RULES_LEGACY);
    data = legacy.data as typeof data;
    error = legacy.error;
  }

  if (error) throw error;
  return ((data ?? []) as Partial<CalculationRuleRecord>[]).map(normalizeCalculationRule);
}

export async function countCriteriaUsingCalculationRule(ruleId: string, method: CriterionType): Promise<number> {
  const byId = await supabase
    .from('evaluation_criteria')
    .select('id', { count: 'exact', head: true })
    .eq('calculation_rule_id', ruleId);
  if (!byId.error && (byId.count ?? 0) > 0) return byId.count ?? 0;

  const { count, error } = await supabase
    .from('evaluation_criteria')
    .select('id', { count: 'exact', head: true })
    .eq('type', method);
  if (error && isMissingTableError(error)) {
    return loadCriteriaFromLocal().filter(
      (c) => c.calculation_rule_id === ruleId || (!c.calculation_rule_id && c.type === method)
    ).length;
  }
  if (error) return 0;
  return count ?? 0;
}

export async function deleteCalculationRule(ruleId: string): Promise<void> {
  let { error } = await supabase.from('calculation_rules').delete().eq('id', ruleId);
  if (error && isMissingColumnError(error)) {
    const legacyType = ruleId.startsWith('legacy-rule-') ? ruleId.replace('legacy-rule-', '') : null;
    if (legacyType) {
      const retry = await supabase.from('calculation_rules').delete().eq('type', legacyType);
      error = retry.error;
    }
  }
  if (error) throw error;
}

export async function upsertCalculationRule(rule: CalculationRuleRecord): Promise<CalculationRuleRecord> {
  const normalized = normalizeCalculationRule(rule);
  const withId = {
    id: normalized.id,
    type: normalized.type,
    label: normalized.label,
    max_points: normalized.max_points,
    config: normalized.config,
  };
  const legacy = {
    type: normalized.type,
    label: normalized.label,
    max_points: normalized.max_points,
    config: normalized.config,
  };

  let { data, error } = await supabase
    .from('calculation_rules')
    .upsert(withId, { onConflict: 'id' })
    .select(SELECT_RULES_WITH_ID)
    .single();

  if (error && isMissingColumnError(error)) {
    const retry = await supabase
      .from('calculation_rules')
      .upsert(legacy, { onConflict: 'type' })
      .select(SELECT_RULES_LEGACY)
      .single();
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error) throw error;
  if (!data) throw new Error('Aucune donnée retournée après enregistrement');
  return normalizeCalculationRule(data as Partial<CalculationRuleRecord>);
}

export async function saveCalculationRules(rules: CalculationRuleRecord[]): Promise<void> {
  for (const rule of rules) {
    await upsertCalculationRule(rule);
  }
}

