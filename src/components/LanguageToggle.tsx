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
  const { lang, setLang, t } = useI18n();
  const compact = variant === 'compact';
  const btn = compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';

  return (
    <div
      dir="ltr"
      role="group"
      aria-label={t('header.language')}
      title={t('header.language')}
      className={cn(
        'inline-flex shrink-0 items-stretch rounded-full border border-border bg-muted overflow-hidden',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setLang('fr')}
        aria-pressed={lang === 'fr'}
        className={cn(
          'font-semibold leading-none transition-colors',
          btn,
          lang === 'fr'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent/20'
        )}
      >
        FR
      </button>
      <button
        type="button"
        onClick={() => setLang('ar')}
        aria-pressed={lang === 'ar'}
        className={cn(
          'font-semibold leading-none transition-colors',
          btn,
          lang === 'ar'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent/20'
        )}
      >
        ع
      </button>
    </div>
  );
}

export default LanguageToggle;
