import { useEffect, useState, type CSSProperties } from 'react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Star, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EvaluationCriterionRecord } from '@/lib/evaluation-calculator';
import {
  calculateCriterionScore,
  getChoiceOptionsFromConfig,
  type CalculationRuleRecord,
  type CriterionType,
} from '@/lib/evaluation-calculator';

function StarRating({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {Array.from({ length: 10 }, (_, i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onClick={() => onChange(i + 1)}
          className="transition-transform hover:scale-110 disabled:opacity-50"
        >
          <Star
            size={22}
            className={cn(
              'transition-colors',
              i < value ? 'fill-warning text-warning' : 'text-muted-foreground/30'
            )}
          />
        </button>
      ))}
    </div>
  );
}

type Props = {
  criterion: EvaluationCriterionRecord;
  value: number | boolean | undefined;
  onChange: (value: number | boolean) => void;
  rules: CalculationRuleRecord[];
  disabled?: boolean;
  showValues?: boolean;
};

export function EvaluationCriterionInputs({ criterion, value, onChange, rules, disabled, showValues = true }: Props) {
  const ruleId = criterion.calculation_rule_id;
  const method = criterion.type as CriterionType;
  const linkedRule =
    (ruleId ? rules.find((r) => r.id === ruleId) : undefined) ??
    rules.find((r) => r.type === method);
  const points =
    value !== undefined
      ? calculateCriterionScore(method, value, rules, ruleId)
      : 0;

  // Échelle de la barre pour le critère "Pourcentage (%)" (threshold) : la saisie peut
  // dépasser 100 % à titre informatif, mais le calcul (ci-dessus) plafonne toujours à
  // 100 %. La barre elle-même garde une largeur fixe — seule l'échelle qu'elle
  // représente change (100 → 200 → 300…), via les boutons +/-.
  const [scaleMax, setScaleMax] = useState(100);
  useEffect(() => {
    if (typeof value === 'number') {
      setScaleMax((prev) => (value > prev ? Math.ceil(value / 100) * 100 : prev));
    }
  }, [value]);

  if (method === 'binary') {
    const checked = Boolean(value);
    return (
      <div className="flex items-center justify-start gap-4 py-0.5">
        <span className="text-sm text-muted-foreground">Non</span>
        <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
        <span className="text-sm text-muted-foreground">Oui</span>
      </div>
    );
  }

  if (method === 'threshold') {
    const num = typeof value === 'number' ? value : 50;
    const isExtended = scaleMax > 100;
    const hundredMarkPercent = (100 / scaleMax) * 100;
    // Au-delà de 100 %, le remplissage de la barre passe en dégradé ambre/orangé à
    // partir du point "100 %" — pour distinguer visuellement la portion réellement
    // comptée dans le calcul (teinte primaire) de la portion informative en bonus.
    const bonusRangeStyle: CSSProperties | undefined =
      num > 100
        ? {
            background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${(100 / num) * 100}%, #fbbf24 ${(100 / num) * 100}%, #f97316 100%)`,
          }
        : undefined;

    return (
      <div className="space-y-3">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Pourcentage atteint</span>
          <span className="font-bold text-foreground">
            {num} %
            {num > 100 && (
              <span className="ml-1 font-normal text-muted-foreground">(compté pour 100 %)</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isExtended && (
            <button
              type="button"
              onClick={() => {
                const next = Math.max(100, scaleMax - 100);
                setScaleMax(next);
                if (num > next) onChange(next);
              }}
              disabled={disabled}
              title="Réduire l'échelle de la barre"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="relative flex-1">
            <Slider
              value={[num]}
              onValueChange={([v]) => onChange(v)}
              max={scaleMax}
              step={1}
              disabled={disabled}
              rangeStyle={bonusRangeStyle}
            />
            {isExtended && (
              <div
                className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-muted-foreground/50"
                style={{ left: `${hundredMarkPercent}%` }}
                title="Limite prise en compte dans le calcul (100 %)"
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => setScaleMax((prev) => prev + 100)}
            disabled={disabled}
            title="Étendre l'échelle de la barre au-delà de 100 %"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {showValues && (
          <Badge variant="outline" className="font-normal">
            {points.toFixed(1)}
          </Badge>
        )}
      </div>
    );
  }

  if (method === 'direct') {
    const num = typeof value === 'number' ? value : 50;
    return (
      <div className="space-y-3">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Score direct (%)</span>
          <span className="font-bold text-foreground">{num} %</span>
        </div>
        <Slider
          value={[num]}
          onValueChange={([v]) => onChange(v)}
          max={100}
          step={1}
          disabled={disabled}
        />
        {showValues && (
          <Badge variant="outline" className="font-normal">
            {points.toFixed(1)}
          </Badge>
        )}
      </div>
    );
  }

  if (method === 'choice') {
    const opt = typeof value === 'number' ? value : 1;
    const ruleOptions = getChoiceOptionsFromConfig(linkedRule?.config ?? {});
    const optionLabels = ruleOptions.map((o) => o.label);
    const overrides =
      (criterion.choice_option_labels ?? []).map((label) => label.trim()).filter(Boolean).length > 0
        ? (criterion.choice_option_labels ?? []).map((label) => label.trim())
        : [criterion.choice_option_1_label?.trim(), criterion.choice_option_2_label?.trim()];
    optionLabels.forEach((_, idx) => {
      if (overrides[idx]) optionLabels[idx] = overrides[idx] as string;
    });
    return (
      <div className="space-y-2">
        <div className="inline-flex max-w-full rounded-lg overflow-hidden border border-border">
          {optionLabels.map((label, idx) => {
            const n = idx + 1;
            return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange(n)}
              className={cn(
                'py-2 px-4 text-sm font-medium transition-colors whitespace-nowrap',
                opt === n
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              )}
            >
              {label}
            </button>
            );
          })}
        </div>
        {showValues && (
          <Badge variant="outline" className="font-normal">
            {points.toFixed(1)}
          </Badge>
        )}
      </div>
    );
  }

  if (method === 'scale') {
    const num = typeof value === 'number' ? value : 5;
    return (
      <div className="space-y-2">
        <StarRating value={num} onChange={onChange} disabled={disabled} />
        {showValues && (
          <Badge variant="outline" className="font-normal">
            {points.toFixed(1)}
          </Badge>
        )}
      </div>
    );
  }

  return null;
}

export function getDefaultCriterionValue(type: CriterionType): number | boolean {
  switch (type) {
    case 'binary':
      return false;
    case 'choice':
      return 1;
    case 'scale':
      return 5;
    default:
      return 50;
  }
}
