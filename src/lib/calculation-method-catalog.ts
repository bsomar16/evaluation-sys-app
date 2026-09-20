import { getChoiceOptionsFromConfig, type CalculationRuleConfig, type CalculationRuleRecord, type CriterionType } from '@/lib/evaluation-calculator';
import { formatDecimal } from '@/lib/utils';

export interface CalculationMethodDefinition {
  type: CriterionType;
  /** Libellé court dans les listes */
  methodLabel: string;
  /** Description de la logique (texte fixe, les chiffres viennent des paramètres) */
  logicLines: (config: CalculationRuleConfig) => string[];
  /** Exemples calculés avec la config courante */
  examples: (config: CalculationRuleConfig, maxPoints: number) => { input: string; points: string }[];
}

function binaryPoints(cfg: CalculationRuleConfig) {
  return {
    yes: cfg.points_if_yes ?? cfg.points_if_not_compliant ?? 0,
    no: cfg.points_if_no ?? cfg.points_if_compliant ?? 10,
  };
}

/** Méthodes proposées dans l’admin « Système de calcul » (ordre d’affichage) */
export const CALCULATION_METHOD_CATALOG: CalculationMethodDefinition[] = [
  {
    type: 'binary',
    methodLabel: 'Oui / Non',
    logicLines: (c) => {
      const { yes, no } = binaryPoints(c);
      return [`Réponse « Oui » → ${yes} point${yes > 1 ? 's' : ''}`, `Réponse « Non » → ${no} point${no > 1 ? 's' : ''}`];
    },
    examples: (c) => {
      const { yes, no } = binaryPoints(c);
      return [
        { input: 'Oui', points: `${yes} pt` },
        { input: 'Non', points: `${no} pt` },
      ];
    },
  },
  {
    type: 'threshold',
    methodLabel: 'Pourcentage (%)',
    logicLines: (c) => {
      const min = c.threshold_min ?? 70;
      const div = c.divisor ?? 10;
      return [
        `${min} % ou moins → 0 point`,
        `Au-dessus de ${min} % → pourcentage ÷ ${div} (équivalent sur 10)`,
      ];
    },
    examples: (c) => {
      const min = c.threshold_min ?? 70;
      const div = c.divisor ?? 10;
      const below = Math.max(0, min - 5);
      const above = min + 15;
      return [
        { input: `${below} %`, points: '0 pt' },
        { input: `${above} %`, points: `${formatDecimal(above / div)} pt` },
      ];
    },
  },
  {
    type: 'scale',
    methodLabel: 'Note sur 10',
    logicLines: (c) => {
      const min = c.scale_min ?? 8;
      const met = c.points_if_met ?? 10;
      const notMet = c.points_if_not_met ?? 0;
      return [
        `Note strictement inférieure à ${min}/10 → ${notMet} point${notMet > 1 ? 's' : ''}`,
        `Note ≥ ${min}/10 → ${met} point${met > 1 ? 's' : ''}`,
      ];
    },
    examples: (c) => {
      const min = c.scale_min ?? 8;
      const met = c.points_if_met ?? 10;
      const notMet = c.points_if_not_met ?? 0;
      return [
        { input: `${min - 1}/10`, points: `${notMet} pt` },
        { input: `${min}/10`, points: `${met} pt` },
      ];
    },
  },
  {
    type: 'choice',
    methodLabel: 'Choix multiple',
    logicLines: (c) => {
      return getChoiceOptionsFromConfig(c).map(
        (opt) => `${opt.label} → ${opt.points} point${opt.points > 1 ? 's' : ''}`
      );
    },
    examples: (c) => {
      return getChoiceOptionsFromConfig(c).map((opt) => ({ input: opt.label, points: `${opt.points} pt` }));
    },
  },
  {
    type: 'direct',
    methodLabel: 'Score direct (%)',
    logicLines: (c) => {
      const div = c.divisor ?? 10;
      return [`Le pourcentage saisi est divisé par ${div} pour obtenir les points (plafond habituel : 10)`];
    },
    examples: (c) => {
      const div = c.divisor ?? 10;
      return [
        { input: '50 %', points: `${formatDecimal(50 / div)} pt` },
        { input: '100 %', points: `${formatDecimal(100 / div)} pt` },
      ];
    },
  },
];

export const CALCULATION_METHOD_TYPES = CALCULATION_METHOD_CATALOG.map((m) => m.type);

export function getCalculationMethodDefinition(
  type: CriterionType
): CalculationMethodDefinition | undefined {
  return CALCULATION_METHOD_CATALOG.find((m) => m.type === type);
}

export function formatCalculationRuleSummary(rule: CalculationRuleRecord): string[] {
  const config = parseRuleConfig(rule.config);
  const def = getCalculationMethodDefinition(rule.type);
  if (def) return def.logicLines(config);
  return [];
}

/** Config Supabase (jsonb) parfois renvoyée en chaîne ou null */
export function parseRuleConfig(raw: unknown): CalculationRuleConfig {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as CalculationRuleConfig)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as CalculationRuleConfig;
  }
  return {};
}
