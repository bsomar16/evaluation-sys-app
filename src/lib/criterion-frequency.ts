import type { EvaluationCriterionRecord } from '@/lib/evaluation-calculator';
import { isCriterionAvailableForEvaluation } from '@/lib/criterion-archive';

export interface EvaluationPeriodLike {
  start_date: string;
}

function periodMonthKey(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeFrequency(value: number | null | undefined): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

/** Index de la période d'ancrage (première application du critère). */
export function getCriterionAnchorPeriodIndex(
  criterion: Pick<EvaluationCriterionRecord, 'created_at' | 'frequency_anchor_date'>,
  orderedPeriods: EvaluationPeriodLike[]
): number {
  if (orderedPeriods.length === 0) return 0;

  const anchorSource = criterion.frequency_anchor_date ?? criterion.created_at;
  if (!anchorSource) return 0;

  const anchorKey = periodMonthKey(anchorSource);
  const exactIndex = orderedPeriods.findIndex(
    (period) => periodMonthKey(period.start_date) === anchorKey
  );
  if (exactIndex !== -1) return exactIndex;

  const anchorTime = new Date(anchorSource).getTime();
  const onOrAfter = orderedPeriods.findIndex(
    (period) => new Date(period.start_date).getTime() >= anchorTime
  );
  return onOrAfter === -1 ? orderedPeriods.length - 1 : onOrAfter;
}

/**
 * Fréquence = 1 → chaque période d'évaluation.
 * Fréquence = 2 → une période sur deux à partir du mois d'ancrage (ex. janv. → mars → mai…).
 */
export function isCriterionDueForPeriod(
  criterion: Pick<
    EvaluationCriterionRecord,
    'frequency' | 'created_at' | 'frequency_anchor_date'
  >,
  currentPeriodStartDate: string,
  orderedPeriods: EvaluationPeriodLike[]
): boolean {
  const frequency = normalizeFrequency(criterion.frequency);
  if (frequency === 1 || orderedPeriods.length === 0) return true;

  const currentKey = periodMonthKey(currentPeriodStartDate);
  const currentIndex = orderedPeriods.findIndex(
    (period) => periodMonthKey(period.start_date) === currentKey
  );
  if (currentIndex === -1) return true;

  const anchorIndex = getCriterionAnchorPeriodIndex(criterion, orderedPeriods);
  if (currentIndex < anchorIndex) return false;

  return (currentIndex - anchorIndex) % frequency === 0;
}

export function criterionIsApplicableForEvaluation(
  criterion: EvaluationCriterionRecord,
  options: {
    savedCriterionIds?: Set<string>;
    periodStartDate?: string;
    orderedPeriods?: EvaluationPeriodLike[];
  }
): boolean {
  if (options.savedCriterionIds?.has(criterion.id)) return true;
  if (!isCriterionAvailableForEvaluation(criterion)) return false;
  if (!options.periodStartDate || !options.orderedPeriods?.length) return true;
  return isCriterionDueForPeriod(criterion, options.periodStartDate, options.orderedPeriods);
}

export function formatCriterionFrequencyLabel(frequency: number | null | undefined): string {
  const value = normalizeFrequency(frequency);
  if (value === 1) return 'Chaque période';
  return `Toutes les ${value} périodes`;
}
