import type { EvaluationCriterionRecord } from '@/lib/evaluation-calculator';

export type CriterionArchiveFields = {
  archived_at?: string | null;
  is_active?: boolean | null;
};

export function isCriterionArchived(criterion: CriterionArchiveFields): boolean {
  return criterion.archived_at != null && criterion.archived_at !== '';
}

export function isCriterionAvailableForEvaluation(criterion: EvaluationCriterionRecord): boolean {
  return criterion.is_active !== false && !isCriterionArchived(criterion);
}

export function partitionCriteriaByArchive<T extends CriterionArchiveFields>(
  items: T[]
): { active: T[]; archived: T[] } {
  const active: T[] = [];
  const archived: T[] = [];
  for (const item of items) {
    if (isCriterionArchived(item)) archived.push(item);
    else active.push(item);
  }
  return { active, archived };
}
