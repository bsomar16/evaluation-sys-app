import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import {
  getCalculationMethodDefinition,
  type CalculationMethodDefinition,
} from '@/lib/calculation-method-catalog';
import { getChoiceOptionsFromConfig, type CalculationRuleConfig, type CalculationRuleRecord } from '@/lib/evaluation-calculator';

const fieldClass =
  'border-2 border-blue-300 bg-blue-50 placeholder:text-muted-foreground/80';

type HintNumberInputProps = {
  placeholder: string;
  value: number | undefined | null;
  onChange: (value: number | undefined) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
};

/** Champ numérique : hint dans la case (placeholder visible tant que la valeur n’est pas saisie) */
function HintNumberInput({
  placeholder,
  value,
  onChange,
  disabled,
  min,
  max,
  step,
}: HintNumberInputProps) {
  return (
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      value={value === undefined || value === null ? '' : value}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === '' ? undefined : Number(raw));
      }}
      disabled={disabled}
      className={fieldClass}
    />
  );
}

type Props = {
  draft: CalculationRuleRecord;
  onPatchConfig: (patch: Partial<CalculationRuleConfig>) => void;
  onMaxPointsChange: (max: number | undefined) => void;
  disabled?: boolean;
};

function MethodRulesCard({ def, config }: { def: CalculationMethodDefinition; config: CalculationRuleConfig }) {
  const lines = def.logicLines(config);
  const examples = def.examples(config, 10);

  return (
    <div className="rounded-lg border bg-slate-50/80 space-y-3 p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Règle appliquée</p>
        <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground list-none">
          {lines.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="text-primary font-bold shrink-0">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Exemples</p>
        <table className="mt-2 w-full text-sm border rounded-md overflow-hidden bg-background">
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
                <td className="py-2 px-3 text-right font-medium">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CalculationMethodParamsPanel({ draft, onPatchConfig, onMaxPointsChange, disabled }: Props) {
  const def = getCalculationMethodDefinition(draft.type);
  if (!def) return null;

  const cfg = draft.config;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <HintNumberInput
          placeholder="Plafond de points (ex. 10 sur 10)"
          value={draft.max_points}
          onChange={onMaxPointsChange}
          disabled={disabled}
          min={0}
          max={100}
        />

        {draft.type === 'binary' && (
          <div className="grid grid-cols-2 gap-3">
            <HintNumberInput
              placeholder="Points attribués si réponse Oui"
              value={cfg.points_if_yes ?? cfg.points_if_not_compliant}
              onChange={(v) =>
                onPatchConfig({
                  points_if_yes: v,
                  points_if_not_compliant: undefined,
                })
              }
              disabled={disabled}
              min={0}
            />
            <HintNumberInput
              placeholder="Points attribués si réponse Non"
              value={cfg.points_if_no ?? cfg.points_if_compliant}
              onChange={(v) =>
                onPatchConfig({
                  points_if_no: v,
                  points_if_compliant: undefined,
                })
              }
              disabled={disabled}
              min={0}
            />
          </div>
        )}

        {draft.type === 'threshold' && (
          <div className="grid grid-cols-2 gap-3">
            <HintNumberInput
              placeholder="Seuil minimum en % (ex. 70)"
              value={cfg.threshold_min}
              onChange={(v) => onPatchConfig({ threshold_min: v })}
              disabled={disabled}
              min={0}
              max={100}
            />
            <HintNumberInput
              placeholder="Diviseur pour convertir en points (ex. 10)"
              value={cfg.divisor}
              onChange={(v) => onPatchConfig({ divisor: v })}
              disabled={disabled}
              min={1}
            />
          </div>
        )}

        {draft.type === 'scale' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <HintNumberInput
              placeholder="Note minimale sur 10 (ex. 8)"
              value={cfg.scale_min}
              onChange={(v) => onPatchConfig({ scale_min: v })}
              disabled={disabled}
              min={0}
              max={10}
              step={0.5}
            />
            <HintNumberInput
              placeholder="Points si note ≥ seuil"
              value={cfg.points_if_met}
              onChange={(v) => onPatchConfig({ points_if_met: v })}
              disabled={disabled}
              min={0}
            />
            <HintNumberInput
              placeholder="Points si note sous le seuil"
              value={cfg.points_if_not_met}
              onChange={(v) => onPatchConfig({ points_if_not_met: v })}
              disabled={disabled}
              min={0}
            />
          </div>
        )}

        {draft.type === 'choice' && (
          <div className="space-y-3">
            <HintNumberInput
              placeholder="Nombre de choix (min 2, max 10)"
              value={cfg.choice_option_count ?? 2}
              onChange={(v) => {
                const nextCount = Math.max(2, Math.min(10, Math.floor(v ?? 2)));
                const current = getChoiceOptionsFromConfig(cfg);
                const nextOptions = Array.from({ length: nextCount }, (_, idx) => ({
                  label: current[idx]?.label || `Choix ${idx + 1}`,
                  points: current[idx]?.points ?? 0,
                }));
                onPatchConfig({
                  choice_option_count: nextCount,
                  choice_options: nextOptions,
                });
              }}
              disabled={disabled}
              min={2}
              max={10}
              step={1}
            />
            <div className="space-y-2">
              {getChoiceOptionsFromConfig(cfg).map((opt, idx) => (
                <div key={`choice-opt-${idx + 1}`} className="grid grid-cols-[1fr_180px] gap-2 items-center">
                  <div className="text-sm text-muted-foreground px-3 py-2 rounded-md border bg-muted/30">
                    Choix {idx + 1}
                  </div>
                  <HintNumberInput
                    placeholder="Points"
                    value={opt.points}
                    onChange={(v) => {
                      const next = getChoiceOptionsFromConfig(cfg);
                      next[idx] = { ...next[idx], label: `Choix ${idx + 1}`, points: v ?? 0 };
                      onPatchConfig({ choice_options: next });
                    }}
                    disabled={disabled}
                    min={0}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {draft.type === 'direct' && (
          <HintNumberInput
            placeholder="Diviseur du % pour obtenir les points (ex. 10)"
            value={cfg.divisor}
            onChange={(v) => onPatchConfig({ divisor: v })}
            disabled={disabled}
            min={1}
          />
        )}
      </div>

      <Collapsible className="rounded-lg border bg-slate-50/80 p-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between">
            <span className="font-semibold">Résultat — Règle appliquée & exemples</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <MethodRulesCard def={def} config={draft.config} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
