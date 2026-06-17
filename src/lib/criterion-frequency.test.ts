import { describe, expect, it } from 'vitest';
import { isCriterionDueForPeriod } from '@/lib/criterion-frequency';

const periods = [
  { start_date: '2026-01-01' },
  { start_date: '2026-02-01' },
  { start_date: '2026-03-01' },
  { start_date: '2026-04-01' },
];

describe('isCriterionDueForPeriod', () => {
  it('returns true every period when frequency is 1', () => {
    const criterion = { frequency: 1, frequency_anchor_date: '2026-01-01', created_at: null };
    expect(isCriterionDueForPeriod(criterion, '2026-02-01', periods)).toBe(true);
  });

  it('skips every other period when frequency is 2 anchored in January', () => {
    const criterion = { frequency: 2, frequency_anchor_date: '2026-01-01', created_at: null };
    expect(isCriterionDueForPeriod(criterion, '2026-01-01', periods)).toBe(true);
    expect(isCriterionDueForPeriod(criterion, '2026-02-01', periods)).toBe(false);
    expect(isCriterionDueForPeriod(criterion, '2026-03-01', periods)).toBe(true);
    expect(isCriterionDueForPeriod(criterion, '2026-04-01', periods)).toBe(false);
  });

  it('uses creation date when no explicit anchor is set', () => {
    const criterion = {
      frequency: 2,
      frequency_anchor_date: null,
      created_at: '2026-01-15T12:00:00.000Z',
    };
    expect(isCriterionDueForPeriod(criterion, '2026-01-01', periods)).toBe(true);
    expect(isCriterionDueForPeriod(criterion, '2026-02-01', periods)).toBe(false);
    expect(isCriterionDueForPeriod(criterion, '2026-03-01', periods)).toBe(true);
    expect(isCriterionDueForPeriod(criterion, '2026-04-01', periods)).toBe(false);
  });
});
