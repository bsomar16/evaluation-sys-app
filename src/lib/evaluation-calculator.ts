export type CriterionType = 'binary' | 'threshold' | 'direct' | 'choice' | 'scale';

export interface EvaluationCriterionRecord {
  id: string;
  /** Nom de critère (libellé) */
  name: string;
  /** Méthode de saisie / calcul (dérivée du système choisi) */
  type: CriterionType;
  /** Système de calcul configuré (plusieurs peuvent exister pour une même méthode) */
  calculation_rule_id?: string | null;
  /** Libellés personnalisés pour la méthode "choix multiple" */
  choice_option_1_label?: string | null;
  choice_option_2_label?: string | null;
  choice_option_labels?: string[];
  /** Filtres périmètre (vide = tous) */
  role_all?: boolean;
  branch_all?: boolean;
  department_all?: boolean;
  role_ids: string[];
  branch_ids: string[];
  department_ids: string[];
  /** Poids / coefficient du critère dans le score total */
  weight: number;
  /** Description détaillée du critère */
  description?: string | null;
  sort_order: number;
  is_active: boolean;
  /** Archivage soft-delete */
  archived_at?: string | null;
}

export interface CalculationRuleConfig {
  /** binary : true = Oui */
  points_if_yes?: number;
  points_if_no?: number;
  /** @deprecated anciens champs — compatibilité */
  points_if_compliant?: number;
  points_if_not_compliant?: number;
  /** threshold : seuil minimum (%) */
  threshold_min?: number;
  /** divisor pour threshold / direct (ex. /10) */
  divisor?: number;
  /** choice : points par option */
  points_option_1?: number;
  points_option_2?: number;
  choice_option_count?: number;
  choice_options?: Array<{
    label?: string;
    points?: number;
  }>;
  /** scale : note minimum pour points max */
  scale_min?: number;
  points_if_met?: number;
  points_if_not_met?: number;
}

export interface CalculationRuleRecord {
  id: string;
  /** Méthode de calcul (Oui/Non, %, etc.) — plusieurs systèmes peuvent partager la même méthode */
  type: CriterionType;
  label: string;
  max_points?: number;
  config: CalculationRuleConfig;
}

export const CRITERION_TYPE_LABELS: Record<CriterionType, string> = {
  binary: 'Oui / Non',
  threshold: 'Pourcentage (%)',
  direct: 'Score direct (%)',
  choice: 'Choix multiple',
  scale: 'Note sur 10',
};

function binaryPointsFromConfig(cfg: CalculationRuleConfig) {
  return {
    yes: cfg.points_if_yes ?? cfg.points_if_not_compliant ?? 0,
    no: cfg.points_if_no ?? cfg.points_if_compliant ?? 10,
  };
}

export function getChoiceOptionsFromConfig(cfg: CalculationRuleConfig): Array<{ label: string; points: number }> {
  const legacy = [
    { label: 'Choix 1', points: cfg.points_option_1 ?? 5 },
    { label: 'Choix 2', points: cfg.points_option_2 ?? 10 },
  ];

  const fromArray = Array.isArray(cfg.choice_options)
    ? cfg.choice_options
        .map((opt, idx) => ({
          label: opt?.label?.trim() || `Choix ${idx + 1}`,
          points: Number.isFinite(opt?.points) ? Number(opt.points) : 0,
        }))
        .filter((opt) => Boolean(opt.label))
    : [];

  const rawCount = Number(cfg.choice_option_count);
  const count = Number.isFinite(rawCount) ? Math.max(2, Math.min(10, Math.floor(rawCount))) : undefined;

  const base = fromArray.length > 0 ? fromArray : legacy;
  if (!count) return base;

  return Array.from({ length: count }, (_, idx) => ({
    label: base[idx]?.label || `Choix ${idx + 1}`,
    points: base[idx]?.points ?? 0,
  }));
}

export const DEFAULT_EVALUATION_CRITERIA: EvaluationCriterionRecord[] = [
  { id: 'c1', name: 'Assiduité', type: 'binary', choice_option_1_label: null, choice_option_2_label: null, choice_option_labels: [], role_all: true, branch_all: true, department_all: true, role_ids: [], branch_ids: [], department_ids: [], weight: 1, sort_order: 1, is_active: true },
  { id: 'c2', name: 'Atteinte des objectifs', type: 'threshold', choice_option_1_label: null, choice_option_2_label: null, choice_option_labels: [], role_all: true, branch_all: true, department_all: true, role_ids: [], branch_ids: [], department_ids: [], weight: 1, sort_order: 2, is_active: true },
  { id: 'c3', name: 'Qualité du travail', type: 'direct', choice_option_1_label: null, choice_option_2_label: null, choice_option_labels: [], role_all: true, branch_all: true, department_all: true, role_ids: [], branch_ids: [], department_ids: [], weight: 1, sort_order: 3, is_active: true },
  { id: 'c4', name: 'Certification', type: 'choice', choice_option_1_label: 'Choix 1', choice_option_2_label: 'Choix 2', choice_option_labels: ['Choix 1', 'Choix 2'], role_all: true, branch_all: true, department_all: true, role_ids: [], branch_ids: [], department_ids: [], weight: 1, sort_order: 4, is_active: true },
  { id: 'c5', name: 'Travail en équipe', type: 'scale', choice_option_1_label: null, choice_option_2_label: null, choice_option_labels: [], role_all: true, branch_all: true, department_all: true, role_ids: [], branch_ids: [], department_ids: [], weight: 1, sort_order: 5, is_active: true },
];

/** Normalise un champ périmètre (tableau ou ancienne colonne uuid unique) */
export function normalizeScopeIds(
  arrayValue: unknown,
  legacySingle?: string | null
): string[] {
  if (Array.isArray(arrayValue)) {
    return arrayValue.filter((id): id is string => typeof id === 'string' && Boolean(id));
  }
  if (legacySingle) return [legacySingle];
  return [];
}

/** Résumé des paramètres pour affichage en liste */
export function formatCalculationRuleParams(rule: CalculationRuleRecord): string[] {
  const c = rule.config ?? {};
  switch (rule.type) {
    case 'binary': {
      const { yes, no } = binaryPointsFromConfig(c);
      return [`Oui → ${yes} pt`, `Non → ${no} pt`];
    }
    case 'threshold': {
      const min = c.threshold_min ?? 70;
      const div = c.divisor ?? 10;
      return [`≤ ${min} % → 0 pt`, `> ${min} % → % ÷ ${div}`];
    }
    case 'direct':
      return [`÷${c.divisor ?? 10}`];
    case 'choice':
      return getChoiceOptionsFromConfig(c).map((opt, idx) => `${opt.label || `Opt.${idx + 1}`}: ${opt.points} pts`);
    case 'scale': {
      const min = c.scale_min ?? 8;
      return [`< ${min}/10 → ${c.points_if_not_met ?? 0} pt`, `≥ ${min}/10 → ${c.points_if_met ?? 10} pt`];
    }
    default:
      return [];
  }
}

export const ALL_CRITERION_TYPES = Object.keys(CRITERION_TYPE_LABELS) as CriterionType[];

export const DEFAULT_CALCULATION_RULES: CalculationRuleRecord[] = [
  {
    id: 'rule-default-binary',
    type: 'binary',
    label: 'Binaire',
    max_points: 10,
    config: { points_if_compliant: 10, points_if_not_compliant: 0 },
  },
  {
    id: 'rule-default-threshold',
    type: 'threshold',
    label: 'Seuil',
    max_points: 10,
    config: { threshold_min: 70, divisor: 10 },
  },
  {
    id: 'rule-default-direct',
    type: 'direct',
    label: 'Direct',
    max_points: 10,
    config: { divisor: 10 },
  },
  {
    id: 'rule-default-choice',
    type: 'choice',
    label: 'Choix',
    max_points: 10,
    config: { choice_option_count: 2, choice_options: [{ label: 'Choix 1', points: 5 }, { label: 'Choix 2', points: 10 }] },
  },
  {
    id: 'rule-default-scale',
    type: 'scale',
    label: 'Échelle',
    max_points: 10,
    config: { scale_min: 8, points_if_met: 10, points_if_not_met: 0 },
  },
];

/** Config par défaut pour enregistrement (les champs vides du formulaire héritent de ces valeurs) */
export function getDefaultConfigForMethod(type: CriterionType): CalculationRuleConfig {
  const found = DEFAULT_CALCULATION_RULES.find((r) => r.type === type);
  return found ? { ...found.config } : {};
}

export function mergeCalculationRuleWithDefaults(
  rule: CalculationRuleRecord
): CalculationRuleRecord {
  const defaults = DEFAULT_CALCULATION_RULES.find((r) => r.type === rule.type);
  return {
    ...rule,
    max_points: rule.max_points ?? defaults?.max_points ?? 10,
    config: { ...getDefaultConfigForMethod(rule.type), ...rule.config },
  };
}

/** Brouillon vide : placeholders visibles dans les champs (hints à l’intérieur) */
export function getDefaultCalculationRule(type: CriterionType): CalculationRuleRecord {
  return {
    id: crypto.randomUUID(),
    type,
    label: '',
    config: {},
  };
}

export function calculateCriterionScore(
  type: CriterionType,
  value: number | boolean,
  rules: CalculationRuleRecord[],
  ruleId?: string | null
): number {
  const rule =
    (ruleId ? rules.find((r) => r.id === ruleId) : undefined) ??
    rules.find((r) => r.type === type);
  const cfg = rule?.config ?? DEFAULT_CALCULATION_RULES.find((r) => r.type === type)?.config ?? {};

  switch (type) {
    case 'binary': {
      const { yes, no } = binaryPointsFromConfig(cfg);
      return value ? yes : no;
    }
    case 'threshold': {
      const n = value as number;
      const min = cfg.threshold_min ?? 70;
      const div = cfg.divisor ?? 10;
      return n < min ? 0 : n / div;
    }
    case 'direct':
      return (value as number) / (cfg.divisor ?? 10);
    case 'choice':
      return getChoiceOptionsFromConfig(cfg)[Math.max(0, Number(value) - 1)]?.points ?? 0;
    case 'scale': {
      const min = cfg.scale_min ?? 8;
      return (value as number) >= min ? (cfg.points_if_met ?? 10) : (cfg.points_if_not_met ?? 0);
    }
    default:
      return 0;
  }
}
