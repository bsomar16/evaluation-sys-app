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



const CRITERIA_STORAGE_KEY = 'hr_pulse_evaluation_criteria';

const RULES_STORAGE_KEY = 'hr_pulse_calculation_rules';



type CriterionRow = EvaluationCriterionRecord & {

  role_id?: string | null;

  branch_id?: string | null;

  department_id?: string | null;
  role_all?: boolean | null;
  branch_all?: boolean | null;
  department_all?: boolean | null;

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
    description: row.description?.trim() || null,
    sort_order: row.sort_order ?? 0,
    is_active: row.is_active !== false,
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



function loadRulesFromLocal(): CalculationRuleRecord[] {

  try {

    const raw = localStorage.getItem(RULES_STORAGE_KEY);

    if (!raw) return [...DEFAULT_CALCULATION_RULES];

    const parsed = JSON.parse(raw) as CalculationRuleRecord[];

    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULT_CALCULATION_RULES];

  } catch {

    return [...DEFAULT_CALCULATION_RULES];

  }

}



function saveRulesToLocal(rules: CalculationRuleRecord[]) {

  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));

}



const SELECT_ARRAYS =
  'id, name, type, calculation_rule_id, choice_option_1_label, choice_option_2_label, choice_option_labels, role_all, branch_all, department_all, role_ids, branch_ids, department_ids, weight, description, sort_order, is_active';

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

function mergeCriterionDescriptionsFromLocal(
  records: EvaluationCriterionRecord[]
): EvaluationCriterionRecord[] {
  const localById = new Map(loadCriteriaFromLocal().map((c) => [c.id, c]));
  return records.map((c) => {
    if (c.description?.trim()) return c;
    const local = localById.get(c.id);
    if (local?.description?.trim()) {
      return { ...c, description: local.description };
    }
    return c;
  });
}

export async function fetchEvaluationCriteria(): Promise<EvaluationCriterionRecord[]> {

  let { data, error } = await supabase

    .from('evaluation_criteria')

    .select(SELECT_ARRAYS)

    .order('sort_order', { ascending: true });



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

  return mergeCriterionDescriptionsFromLocal((data as CriterionRow[]).map(normalizeCriterion));

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

    description: fullPayload.description,

    sort_order: fullPayload.sort_order,

    is_active: fullPayload.is_active,

  };

  const minimalPayload = {

    name: fullPayload.name,

    type: fullPayload.type,

    weight: fullPayload.weight,

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



  const arrayPayloadWithoutDescription = { ...arrayPayload } as Record<string, unknown>;
  delete arrayPayloadWithoutDescription.description;

  const compatibilityPayloadWithoutDescription = { ...compatibilityPayload } as Record<string, unknown>;
  delete compatibilityPayloadWithoutDescription.description;

  const attempts: { payload: Record<string, unknown>; select: string }[] = [

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

  const { error } = await supabase.from('evaluation_criteria').delete().eq('id', id);

  if (error && !isMissingTableError(error)) throw error;



  const next = loadCriteriaFromLocal().filter((c) => c.id !== id);

  saveCriteriaToLocal(next);

}



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

  if (error && isMissingTableError(error)) {
    return loadRulesFromLocal().map(normalizeCalculationRule);
  }
  if (error) throw error;
  if (!data?.length) return loadRulesFromLocal().map(normalizeCalculationRule);
  return (data as Partial<CalculationRuleRecord>[]).map(normalizeCalculationRule);
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
  if (error && !isMissingTableError(error)) throw error;
  const next = loadRulesFromLocal().filter((r) => r.id !== ruleId);
  saveRulesToLocal(next);
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

  if (!error && data) {
    const saved = normalizeCalculationRule(data as Partial<CalculationRuleRecord>);
    const local = loadRulesFromLocal();
    const next = local.some((r) => r.id === saved.id)
      ? local.map((r) => (r.id === saved.id ? saved : r))
      : [...local, saved];
    saveRulesToLocal(next);
    return saved;
  }

  if (error && !isMissingTableError(error)) throw error;

  const local = loadRulesFromLocal();
  const next = local.some((r) => r.id === normalized.id)
    ? local.map((r) => (r.id === normalized.id ? normalized : r))
    : [...local, normalized];
  saveRulesToLocal(next);
  return normalized;
}

export async function saveCalculationRules(rules: CalculationRuleRecord[]): Promise<void> {
  for (const rule of rules) {
    await upsertCalculationRule(rule);
  }
}

