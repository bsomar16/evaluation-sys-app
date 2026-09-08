import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

/**
 * Bascule de langue FR / AR sous forme de petit segmenté « FR | ع ».
 * La langue active est surlignée. Fonctionne en LTR comme en RTL.
 * variant "compact" : taille header. variant "segmented" : taille page de connexion.
 */
export function LanguageToggle({
  variant = 'compact',
  className,
}: {
  variant?: 'compact' | 'segmented';
  className?: string;
}) {
  const { lang, toggleLang, t } = useI18n();
  const compact = variant === 'compact';

  return (
    <button
      type="button"
      onClick={toggleLang}
      title={t('header.language')}
      aria-label={t('header.language')}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-muted font-semibold leading-none text-foreground transition-colors hover:bg-accent/20',
        compact ? 'h-7 min-w-9 px-2 text-xs' : 'h-9 min-w-12 px-3 text-sm',
        className
      )}
    >
      {lang === 'ar' ? 'AR' : 'FR'}
    </button>
  );
}

export default LanguageToggle;
