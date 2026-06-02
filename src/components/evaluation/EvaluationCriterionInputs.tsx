import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Star } from 'lucide-react';
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
};

export function EvaluationCriterionInputs({ criterion, value, onChange, rules, disabled }: Props) {
  const ruleId = criterion.calculation_rule_id;
  const method = criterion.type as CriterionType;
  const linkedRule =
    (ruleId ? rules.find((r) => r.id === ruleId) : undefined) ??
    rules.find((r) => r.type === method);
  const points =
    value !== undefined
      ? calculateCriterionScore(method, value, rules, ruleId)
      : 0;

  if (method === 'binary') {
    const checked = Boolean(value);
    return (
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted-foreground">Non</span>
        <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
        <span className="text-sm text-muted-foreground">Oui</span>
        <Badge variant="outline" className="ml-auto shrink-0">
          {points.toFixed(1)} pt
        </Badge>
      </div>
    );
  }

  if (method === 'threshold' || method === 'direct') {
    const num = typeof value === 'number' ? value : 50;
    return (
      <div className="space-y-3">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{method === 'threshold' ? 'Pourcentage atteint' : 'Score direct (%)'}</span>
          <span className="font-bold text-foreground">{num} %</span>
        </div>
        <Slider
          value={[num]}
          onValueChange={([v]) => onChange(v)}
          max={100}
          step={1}
          disabled={disabled}
        />
        <Badge variant="outline">{points.toFixed(1)} pt</Badge>
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
        <div className="flex rounded-lg overflow-hidden border border-border">
          {optionLabels.map((label, idx) => {
            const n = idx + 1;
            return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange(n)}
              className={cn(
                'flex-1 py-2 px-4 text-sm font-medium transition-colors',
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
        <Badge variant="outline">{points.toFixed(1)} pt</Badge>
      </div>
    );
  }

  if (method === 'scale') {
    const num = typeof value === 'number' ? value : 5;
    return (
      <div className="space-y-2">
        <StarRating value={num} onChange={onChange} disabled={disabled} />
        <Badge variant="outline">{points.toFixed(1)} pt</Badge>
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
