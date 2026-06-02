/** Dinar algérien (DA) — affichage avec 2 décimales */
export const CURRENCY_CODE = 'DZD';
export const CURRENCY_LABEL = 'DZD';

export function formatDzd(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  const formatted = Number(amount).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${CURRENCY_LABEL}`;
}
