const MONTH_LABELS: Record<number, string> = {
  1: 'janvier',
  2: 'février',
  3: 'mars',
  4: 'avril',
  5: 'mai',
  6: 'juin',
  7: 'juillet',
  8: 'août',
  9: 'septembre',
  10: 'octobre',
  11: 'novembre',
  12: 'décembre',
};

/** Code période courante, ex. 2026-06 = juin 2026 (format mensuel) */
export function getCurrentEvaluationPeriodCode(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${month}`;
}

/** Extraire année et mois d'un code période (YYYY-MM) */
export function parsePeriodCode(code: string): { year: number; month: number } | null {
  const m = code.trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** Convertir date en code période (YYYY-MM) */
export function dateToPeriodCode(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** Décrire un code période en français, ex: "2026-06" → "Juin 2026" */
export function describeEvaluationPeriodCode(code: string): string | null {
  const parsed = parsePeriodCode(code);
  if (!parsed) return null;
  const monthLabel = MONTH_LABELS[parsed.month];
  if (!monthLabel) return null;
  return `${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)} ${parsed.year}`;
}

/** Obtenir le dernier jour du mois pour une date donnée */
export function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Créer une date début/fin pour une période donnée */
export function getPeriodDateRange(code: string): { start: Date; end: Date } | null {
  const parsed = parsePeriodCode(code);
  if (!parsed) return null;
  const start = new Date(parsed.year, parsed.month - 1, 1, 0, 0, 0, 0);
  const lastDay = getLastDayOfMonth(parsed.year, parsed.month);
  const end = new Date(parsed.year, parsed.month - 1, lastDay, 23, 59, 59, 999);
  return { start, end };
}
