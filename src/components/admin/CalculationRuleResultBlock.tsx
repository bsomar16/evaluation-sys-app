import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  formatCalculationRuleSummary,
  getCalculationMethodDefinition,
} from '@/lib/calculation-method-catalog';
import type { CalculationRuleConfig, CalculationRuleRecord } from '@/lib/evaluation-calculator';

type Props = {
  type: CalculationRuleRecord['type'];
  config: CalculationRuleConfig;
  /** Libellé du bouton (défaut : Résultat — règle appliquée) */
  title?: string;
  /** Ouvert par défaut */
  defaultOpen?: boolean;
  /** Style compact pour la liste */
  variant?: 'panel' | 'inline';
  className?: string;
};

export function CalculationRuleResultBlock({
  type,
  config,
  title = 'Résultat — règle appliquée',
  defaultOpen = false,
  variant = 'panel',
  className,
}: Props) {
  const def = getCalculationMethodDefinition(type);
  if (!def) return null;

  const lines = def.logicLines(config);
  const examples = def.examples(config, 10);
  const preview = lines[0] ?? '—';

  return (
    <Collapsible defaultOpen={defaultOpen} className={className}>
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-lg border text-left transition-colors hover:bg-muted/50',
          variant === 'panel' ? 'bg-emerald-50/60 border-emerald-200/80 px-4 py-3' : 'px-2 py-1.5 border-transparent hover:border-border'
        )}
      >
        <div className="min-w-0 flex-1">
          <p className={cn('font-medium text-foreground', variant === 'inline' ? 'text-xs' : 'text-sm')}>
            {title}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {variant === 'panel' ? 'Cliquez pour développer' : 'Développer'} — {preview}
          </p>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div
          className={cn(
            'rounded-b-lg border border-t-0 bg-background space-y-3',
            variant === 'panel' ? 'border-emerald-200/80 px-4 py-3' : 'border-border px-2 py-2 mt-1 rounded-lg'
          )}
        >
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Règle calculée
            </p>
            <ul className="space-y-1.5 text-sm list-none">
              {lines.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-emerald-600 font-bold shrink-0">→</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Exemples
            </p>
            <table className="w-full text-sm border rounded-md overflow-hidden">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2 px-3 font-medium">Réponse</th>
                  <th className="text-right py-2 px-3 font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {examples.map((row) => (
                  <tr key={row.input} className="border-b last:border-0">
                    <td className="py-2 px-3">{row.input}</td>
                    <td className="py-2 px-3 text-right font-semibold text-emerald-700">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Résumé une ligne pour la liste */
export function getRuleOneLinePreview(rule: CalculationRuleRecord): string {
  const lines = formatCalculationRuleSummary(rule);
  return lines[0] ?? '—';
}
