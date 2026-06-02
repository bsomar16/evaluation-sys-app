const TRIMESTER_LABELS: Record<number, string> = {
  1: '1er trimestre (janvier – mars)',
  2: '2e trimestre (avril – juin)',
  3: '3e trimestre (juillet – septembre)',
  4: '4e trimestre (octobre – décembre)',
};

/** Code campagne courante, ex. 2026-T2 = 2e trimestre 2026 */
export function getCurrentEvaluationPeriodCode(): string {
  const d = new Date();
  return `${d.getFullYear()}-T${Math.ceil((d.getMonth() + 1) / 3)}`;
}

export function describeEvaluationPeriodCode(code: string): string | null {
  const m = code.trim().match(/^(\d{4})-T([1-4])$/i);
  if (!m) return null;
  const t = Number(m[2]);
  return `${m[1]} — ${TRIMESTER_LABELS[t]}`;
}
