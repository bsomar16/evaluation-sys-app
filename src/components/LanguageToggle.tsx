import { Languages } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

/**
 * Bascule de langue FR / AR.
 * variant "compact" : bouton icône (header).
 * variant "segmented" : deux boutons FR | ع (page de connexion).
 */
export function LanguageToggle({
  variant = 'compact',
  className,
}: {
  variant?: 'compact' | 'segmented';
  className?: string;
}) {
  const { lang, setLang, toggleLang, t } = useI18n();

  if (variant === 'segmented') {
    return (
      <div className={cn('inline-flex rounded-lg border border-border overflow-hidden', className)}>
        <button
          type="button"
          onClick={() => setLang('fr')}
          className={cn(
            'px-3 py-1.5 text-sm font-medium transition-colors',
            lang === 'fr' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'
          )}
        >
          FR
        </button>
        <button
          type="button"
          onClick={() => setLang('ar')}
          className={cn(
            'px-3 py-1.5 text-sm font-medium transition-colors',
            lang === 'ar' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'
          )}
        >
          ع
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleLang}
      title={t('header.language')}
      aria-label={t('header.language')}
      className={cn(
        'relative w-7 h-7 rounded-full bg-muted hover:bg-accent/20 flex items-center justify-center text-foreground transition-colors cursor-pointer gap-1',
        className
      )}
    >
      <Languages size={15} />
      <span className="text-[10px] font-semibold uppercase">{lang}</span>
    </button>
  );
}

export default LanguageToggle;
