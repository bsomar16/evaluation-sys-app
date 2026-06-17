import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface CriterionDescriptionExpandProps {
  description?: string | null;
  /** icon = chevron à gauche du titre (page évaluation) ; link = chevron + « Description » */
  variant?: 'icon' | 'link';
  className?: string;
  children?: ReactNode;
}

export function CriterionDescriptionExpand({
  description,
  variant = 'link',
  className,
  children,
}: CriterionDescriptionExpandProps) {
  const text = description?.trim();
  const alwaysShow = variant === 'icon';

  if (!text && !alwaysShow) {
    return children ? <>{children}</> : null;
  }

  return (
    <Collapsible className={cn('group w-full', className)}>
      <div className={cn(variant === 'icon' && 'flex items-center gap-1.5 min-w-0')}>
        <CollapsibleTrigger
          className={cn(
            'inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors shrink-0',
            variant === 'icon' ? 'rounded p-0.5 hover:bg-muted' : 'text-xs'
          )}
          aria-label="Afficher la description du critère"
        >
          <ChevronRight className="h-4 w-4 group-data-[state=open]:hidden" />
          <ChevronDown className="h-4 w-4 hidden group-data-[state=open]:inline" />
          {variant === 'link' && <span>Description</span>}
        </CollapsibleTrigger>
        {variant === 'icon' && children}
      </div>
      <CollapsibleContent
        className={cn(
          'text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed',
          variant === 'icon' ? 'mt-2 pl-0.5' : 'mt-1.5 max-w-md'
        )}
      >
        {text ? (
          text
        ) : (
          <span className="italic text-muted-foreground/80">Aucune description renseignée pour ce critère.</span>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
