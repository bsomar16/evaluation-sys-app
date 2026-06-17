import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { hideLoadingOverlay } from '@/lib/loading-overlay';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Archive, CheckCircle2, Plus, RotateCcw, Trash2, Edit2, Search, X } from 'lucide-react';
import { CriterionDescriptionExpand } from '@/components/evaluation/CriterionDescriptionExpand';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { ModuleAccessDenied } from '@/components/ModuleAccessDenied';
import {
  CRITERION_TYPE_LABELS,
  getChoiceOptionsFromConfig,
  type CalculationRuleRecord,
  type CriterionType,
  type EvaluationCriterionRecord,
} from '@/lib/evaluation-calculator';
import { getCalculationMethodDefinition } from '@/lib/calculation-method-catalog';
import { roleBadgeClassName, getRoleBadgeStyleFromColor } from '@/lib/role-colors';
import { supabase } from '@/integrations/supabase/client';
import type { RoleRecord } from '@/lib/role-tree';
import type { BranchRecord } from '@/lib/branch-tree';
import type { DepartmentRecord } from '@/lib/department-tree';
import {
  archiveEvaluationCriterion,
  CriterionInUseError,
  deleteEvaluationCriterion,
  fetchCalculationRules,
  fetchEvaluationCriteria,
  restoreEvaluationCriterion,
  upsertEvaluationCriterion,
} from '@/lib/evaluation-config-storage';
import { formatCriterionFrequencyLabel } from '@/lib/criterion-frequency';
import { partitionCriteriaByArchive } from '@/lib/criterion-archive';
import { countEvaluationsUsingCriterion } from '@/lib/evaluation-storage';
import { formatArchivedAt } from '@/lib/user-archive';
import {
  getAllEvaluationPeriods,
  sortEvaluationPeriodsAsc,
  type EvaluationPeriod,
} from '@/lib/evaluation-period-db';
import { dateToPeriodCode, describeEvaluationPeriodCode } from '@/lib/evaluation-period-label';

type CriterionFormState = {
  name: string;
  coefficient: string;
  frequency: string;
  use_frequency_anchor: boolean;
  frequency_anchor_period_id: string;
  description: string;
  calculation_rule_id: string;
  type: CriterionType;
  choice_option_1_label: string;
  choice_option_2_label: string;
  choice_option_labels: string[];
  role_all: boolean;
  branch_all: boolean;
  department_all: boolean;
  role_ids: string[];
  branch_ids: string[];
  department_ids: string[];
};

type NamedEntity = { id: string; name: string };

function formatPeriodMonthLabel(period: EvaluationPeriod): string {
  return describeEvaluationPeriodCode(dateToPeriodCode(new Date(period.start_date))) ?? period.name;
}

function findPeriodIdForAnchorDate(
  periods: EvaluationPeriod[],
  anchorDate: string | null | undefined
): string {
  if (!anchorDate) return '';
  const anchorCode = dateToPeriodCode(new Date(anchorDate));
  return periods.find((p) => dateToPeriodCode(new Date(p.start_date)) === anchorCode)?.id ?? '';
}

function emptyForm(rules: CalculationRuleRecord[]): CriterionFormState {
  const first = rules[0];
  return {
    name: '',
    coefficient: '1',
    frequency: '1',
    use_frequency_anchor: false,
    frequency_anchor_period_id: '',
    description: '',
    calculation_rule_id: first?.id ?? '',
    type: first?.type ?? 'binary',
    choice_option_1_label: '',
    choice_option_2_label: '',
    choice_option_labels: [],
    role_all: false,
    branch_all: false,
    department_all: false,
    role_ids: [],
    branch_ids: [],
    department_ids: [],
  };
}

function calculationSystemLabel(
  criterion: Pick<EvaluationCriterionRecord, 'calculation_rule_id' | 'type'>,
  rules: CalculationRuleRecord[]
): string {
  const byId = criterion.calculation_rule_id
    ? rules.find((r) => r.id === criterion.calculation_rule_id)
    : undefined;
  if (byId?.label) return byId.label;
  const byType = rules.find((r) => r.type === criterion.type);
  if (byType?.label) return byType.label;
  return CRITERION_TYPE_LABELS[criterion.type] ?? criterion.type;
}

function ScopeMultiField({
  label,
  emptyLabel,
  allLabel,
  allChecked,
  onAllCheckedChange,
  options,
  selectedIds,
  onChange,
  renderBadge,
}: {
  label: string;
  emptyLabel: string;
  allLabel: string;
  allChecked: boolean;
  onAllCheckedChange: (checked: boolean) => void;
  options: NamedEntity[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  renderBadge?: (item: NamedEntity, onRemove: () => void) => ReactNode;
}) {
  const [pickerValue, setPickerValue] = useState('');

  const add = () => {
    if (!pickerValue || selectedIds.includes(pickerValue)) return;
    onChange([...selectedIds, pickerValue]);
    setPickerValue('');
  };

  const remove = (id: string) => onChange(selectedIds.filter((x) => x !== id));
  const available = options.filter((o) => !selectedIds.includes(o.id));

  return (
    <div className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="grid grid-cols-[1fr_96px] items-center gap-3 min-h-6">
        <p className="text-xs font-medium text-muted-foreground leading-none">{label}</p>
        <label className="inline-flex h-6 items-center gap-2 text-xs text-muted-foreground leading-none justify-self-start">
          <Checkbox
            checked={allChecked}
            onCheckedChange={(checked) => {
              const next = checked === true;
              onAllCheckedChange(next);
              if (next) onChange([]);
            }}
          />
          <span>{allLabel}</span>
        </label>
      </div>
      {allChecked ? (
        <Badge variant="secondary" className="gap-1 bg-green-100 text-green-800">
          <CheckCircle2 className="h-3 w-3" />
          {allLabel} sélectionné
        </Badge>
      ) : (
        <>
          <div className="flex gap-2">
            <Select value={pickerValue} onValueChange={setPickerValue}>
              <SelectTrigger className="flex-1 border-2 border-blue-300 bg-blue-50">
                <SelectValue placeholder={emptyLabel} />
              </SelectTrigger>
              <SelectContent>
                {available.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              className="gap-1 shrink-0 w-24 justify-center"
              disabled={!pickerValue}
              onClick={add}
            >
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          </div>
          {selectedIds.length > 0 && (
            <div className="flex flex-col items-start gap-1.5">
              {selectedIds.map((id) => {
                const item = options.find((o) => o.id === id);
                if (!item) return null;
                if (renderBadge) {
                  return <div key={id}>{renderBadge(item, () => remove(id))}</div>;
                }
                return (
                  <Badge key={id} variant="secondary" className="gap-1">
                    {item.name}
                    <button type="button" onClick={() => remove(id)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StackedNames({
  ids,
  options,
  allLabel,
  allSelected = ids.length === 0,
}: {
  ids: string[];
  options: NamedEntity[];
  allLabel: string;
  allSelected?: boolean;
}) {
  if (allSelected) {
    return <span className="text-muted-foreground text-xs">{allLabel}</span>;
  }
  if (ids.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      {ids.map((id) => (
        <span key={id} className="text-sm leading-tight">
          {options.find((o) => o.id === id)?.name ?? '—'}
        </span>
      ))}
    </div>
  );
}

function StackedRoleBadges({
  ids,
  roles,
  allSelected = ids.length === 0,
}: {
  ids: string[];
  roles: RoleRecord[];
  allSelected?: boolean;
}) {
  if (allSelected) {
    return <span className="text-muted-foreground text-xs">Tous</span>;
  }
  if (ids.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex flex-col items-start gap-1.5">
      {ids.map((id) => {
        const role = roles.find((r) => r.id === id);
        if (!role) return null;
        return (
          <span
            key={id}
            className={roleBadgeClassName}
            style={getRoleBadgeStyleFromColor(role.color)}
          >
            {role.name}
          </span>
        );
      })}
    </div>
  );
}

function formatCoefficient(weight: number): string {
  const n = Number(weight);
  if (!Number.isFinite(n)) return '1';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

export function EvaluationCriteriaPage() {
  const { toast } = useToast();
  const { canRead, canWrite, canDelete } = useRolePermissions();
  const [criteria, setCriteria] = useState<EvaluationCriterionRecord[]>([]);
  const [calculationRules, setCalculationRules] = useState<CalculationRuleRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [evaluationPeriods, setEvaluationPeriods] = useState<EvaluationPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editing, setEditing] = useState<EvaluationCriterionRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EvaluationCriterionRecord | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<EvaluationCriterionRecord | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<EvaluationCriterionRecord | null>(null);
  const [criterionTab, setCriterionTab] = useState<'active' | 'archived'>('active');
  const [formData, setFormData] = useState<CriterionFormState>(() => emptyForm([]));

  const orderedEvaluationPeriods = useMemo(
    () => sortEvaluationPeriodsAsc(evaluationPeriods),
    [evaluationPeriods]
  );

  const load = async () => {
    try {
      const [rows, rules, rolesRes, branchesRes, deptsRes, dbPeriods] = await Promise.all([
        fetchEvaluationCriteria(),
        fetchCalculationRules(),
        supabase.from('roles').select('id, name, color'),
        supabase.from('branches').select('id, name'),
        supabase.from('departments').select('id, name'),
        getAllEvaluationPeriods(),
      ]);
      setCriteria(rows.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setCalculationRules(rules);
      setEvaluationPeriods(dbPeriods);
      if (!rolesRes.error) setRoles(rolesRes.data || []);
      if (!branchesRes.error) setBranches(branchesRes.data || []);
      if (!deptsRes.error) setDepartments(deptsRes.data || []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Chargement impossible';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    } finally {
      setLoading(false);
      hideLoadingOverlay();
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    if (calculationRules.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Créez d’abord au moins un système de calcul.',
      });
      return;
    }
    setEditing(null);
    setFormData(emptyForm(calculationRules));
    setOpenDialog(true);
  };

  const openEdit = (c: EvaluationCriterionRecord) => {
    const linked =
      c.calculation_rule_id ??
      calculationRules.find((r) => r.type === c.type)?.id ??
      '';
    setEditing(c);
    const normalizedRoleAll = (c.role_all ?? c.role_ids.length === 0) || c.role_ids.length === 0;
    const normalizedBranchAll = (c.branch_all ?? c.branch_ids.length === 0) || c.branch_ids.length === 0;
    const normalizedDepartmentAll =
      (c.department_all ?? c.department_ids.length === 0) || c.department_ids.length === 0;
    setFormData({
      name: c.name,
      coefficient: formatCoefficient(c.weight ?? 1),
      frequency: String(Math.max(1, c.frequency ?? 1)),
      use_frequency_anchor: Boolean(c.frequency_anchor_date),
      frequency_anchor_period_id: findPeriodIdForAnchorDate(
        sortEvaluationPeriodsAsc(evaluationPeriods),
        c.frequency_anchor_date
      ),
      description: c.description ?? '',
      calculation_rule_id: linked,
      type: c.type,
      choice_option_1_label: c.choice_option_1_label ?? '',
      choice_option_2_label: c.choice_option_2_label ?? '',
      choice_option_labels: c.choice_option_labels ?? [c.choice_option_1_label, c.choice_option_2_label].filter(Boolean) as string[],
      role_all: normalizedRoleAll,
      branch_all: normalizedBranchAll,
      department_all: normalizedDepartmentAll,
      role_ids: [...c.role_ids],
      branch_ids: [...c.branch_ids],
      department_ids: [...c.department_ids],
    });
    setOpenDialog(true);
  };

  const handleSave = async () => {
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Indiquez le nom du critère' });
      return;
    }
    const duplicate = criteria.some(
      (c) => c.id !== editing?.id && c.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Un critère portant ce nom existe déjà' });
      return;
    }
    if (!formData.calculation_rule_id) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Choisissez un système de calcul' });
      return;
    }
    const coefficientValue = Number.parseFloat(formData.coefficient.replace(',', '.'));
    if (!Number.isFinite(coefficientValue) || coefficientValue <= 0) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Indiquez un coefficient valide (supérieur à 0)' });
      return;
    }
    const frequencyValue = Math.floor(Number.parseInt(formData.frequency, 10));
    if (!Number.isFinite(frequencyValue) || frequencyValue < 1) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Indiquez une fréquence valide (entier ≥ 1)' });
      return;
    }
    let frequency_anchor_date: string | null = null;
    if (frequencyValue > 1 && formData.use_frequency_anchor) {
      const anchorPeriod = orderedEvaluationPeriods.find(
        (p) => p.id === formData.frequency_anchor_period_id
      );
      if (!anchorPeriod) {
        toast({
          variant: 'destructive',
          title: 'Erreur',
          description: 'Choisissez le mois de départ pour la fréquence.',
        });
        return;
      }
      frequency_anchor_date = anchorPeriod.start_date.slice(0, 10);
    }
    const selectedRule = calculationRules.find((r) => r.id === formData.calculation_rule_id);
    if ((selectedRule?.type ?? formData.type) === 'choice') {
      const expectedOptions = getChoiceOptionsFromConfig(selectedRule?.config ?? {}).length;
      const filledLabels = formData.choice_option_labels
        .slice(0, expectedOptions)
        .map((label) => label.trim())
        .filter(Boolean);
      if (filledLabels.length < expectedOptions) {
        toast({
          variant: 'destructive',
          title: 'Erreur',
          description: 'Renseignez le nom de chaque choix',
        });
        return;
      }
    }
    if (!formData.role_all && formData.role_ids.length === 0) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Sélectionnez au moins un rôle ou cochez Pour tous' });
      return;
    }
    if (!formData.branch_all && formData.branch_ids.length === 0) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Sélectionnez au moins une filiale ou cochez Pour toutes' });
      return;
    }
    if (!formData.department_all && formData.department_ids.length === 0) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Sélectionnez au moins un service ou cochez Pour tous' });
      return;
    }
    const linkedRule = calculationRules.find((r) => r.id === formData.calculation_rule_id);
    try {
      await upsertEvaluationCriterion({
        id: editing?.id,
        name: formData.name.trim(),
        type: linkedRule?.type ?? formData.type,
        calculation_rule_id: formData.calculation_rule_id,
        choice_option_labels:
          (linkedRule?.type ?? formData.type) === 'choice'
            ? formData.choice_option_labels.map((label) => label.trim()).filter(Boolean)
            : [],
        choice_option_1_label:
          (linkedRule?.type ?? formData.type) === 'choice'
            ? (formData.choice_option_labels[0]?.trim() || formData.choice_option_1_label.trim() || null)
            : null,
        choice_option_2_label:
          (linkedRule?.type ?? formData.type) === 'choice'
            ? (formData.choice_option_labels[1]?.trim() || formData.choice_option_2_label.trim() || null)
            : null,
        role_all: formData.role_all,
        branch_all: formData.branch_all,
        department_all: formData.department_all,
        role_ids: formData.role_all ? [] : formData.role_ids,
        branch_ids: formData.branch_all ? [] : formData.branch_ids,
        department_ids: formData.department_all ? [] : formData.department_ids,
        weight: coefficientValue,
        frequency: frequencyValue,
        frequency_anchor_date,
        description: formData.description.trim() || null,
        sort_order: editing?.sort_order ?? criteria.length + 1,
        is_active: editing?.is_active ?? true,
      });
      toast({ title: 'Succès', description: editing ? 'Critère modifié' : 'Critère créé' });
      if (!editing) setSearch('');
      setOpenDialog(false);
      load();
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null
            ? ((error as { message?: string; details?: string; hint?: string; code?: string }).message ??
              (error as { details?: string }).details ??
              (error as { hint?: string }).hint ??
              (error as { code?: string }).code ??
              'Enregistrement impossible')
            : 'Enregistrement impossible';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEvaluationCriterion(deleteTarget.id);
      toast({ title: 'Succès', description: 'Critère supprimé' });
      setDeleteTarget(null);
      load();
    } catch (error: unknown) {
      const message =
        error instanceof CriterionInUseError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Suppression impossible';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      await archiveEvaluationCriterion(archiveTarget.id);
      toast({ title: 'Succès', description: 'Critère archivé' });
      setArchiveTarget(null);
      load();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Archivage impossible';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    try {
      await restoreEvaluationCriterion(restoreTarget.id);
      toast({ title: 'Succès', description: 'Critère restauré' });
      setRestoreTarget(null);
      load();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Restauration impossible';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    }
  };

  const requestDelete = async (criterion: EvaluationCriterionRecord) => {
    try {
      const usageCount = await countEvaluationsUsingCriterion(criterion.id);
      if (usageCount > 0) {
        toast({
          variant: 'destructive',
          title: 'Suppression impossible',
          description:
            usageCount === 1
              ? 'Ce critère est utilisé dans 1 évaluation. Archivez-le à la place.'
              : `Ce critère est utilisé dans ${usageCount} évaluations. Archivez-le à la place.`,
        });
        return;
      }
      setDeleteTarget(criterion);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Vérification impossible';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    }
  };

  const { active: activeCriteria, archived: archivedCriteria } = useMemo(
    () => partitionCriteriaByArchive(criteria),
    [criteria]
  );

  const listSource = criterionTab === 'active' ? activeCriteria : archivedCriteria;

  const filtered = listSource.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      calculationSystemLabel(c, calculationRules).toLowerCase().includes(search.toLowerCase())
  );

  const pagination = usePagination(filtered, 10);

  if (!canRead('evaluation_criteria')) {
    return <ModuleAccessDenied />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Critères d&apos;évaluation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Associez chaque critère à un système de calcul et ciblez les rôles, filiales et services souhaités.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Liste des critères</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={criterionTab} onValueChange={(v) => setCriterionTab(v as 'active' | 'archived')}>
            <TabsList>
              <TabsTrigger value="active">Actifs ({activeCriteria.length})</TabsTrigger>
              <TabsTrigger value="archived">Archivés ({archivedCriteria.length})</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Chercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
              <DialogTrigger asChild>
                <Button
                  className="gap-2"
                  disabled={!canWrite('evaluation_criteria') || criterionTab === 'archived'}
                  onClick={openCreate}
                >
                  <Plus className="h-4 w-4" />
                  Nouveau
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editing ? 'Modifier' : 'Créer'} un critère</DialogTitle>
                  <DialogDescription>
                    Renseignez le nom, le système de calcul et le périmètre (rôles, filiales, services).
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="criterion-name">Nom du critère</Label>
                    <Input
                      id="criterion-name"
                      placeholder="Nom du critère"
                      value={formData.name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                      className="border-2 border-blue-300 bg-blue-50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="criterion-coefficient">Coefficient</Label>
                    <Input
                      id="criterion-coefficient"
                      type="number"
                      min={0.01}
                      step={0.01}
                      placeholder="1"
                      value={formData.coefficient}
                      onChange={(e) => setFormData((prev) => ({ ...prev, coefficient: e.target.value }))}
                      className="border-2 border-blue-300 bg-blue-50 max-w-[160px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Poids du critère dans le calcul du score global (colonne BDD : weight).
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="criterion-frequency">Fréquence</Label>
                      <Input
                        id="criterion-frequency"
                        type="number"
                        min={1}
                        step={1}
                        placeholder="1"
                        value={formData.frequency}
                        onChange={(e) => setFormData((prev) => ({ ...prev, frequency: e.target.value }))}
                        className="border-2 border-blue-300 bg-blue-50 max-w-[160px]"
                      />
                      <p className="text-xs text-muted-foreground">
                        1 = chaque période · 2 = une période sur deux (ex. janv. → mars).
                      </p>
                    </div>
                    {Math.max(1, Number.parseInt(formData.frequency, 10) || 1) > 1 && (
                      <div className="space-y-2">
                        <label className="inline-flex items-center gap-2 text-sm font-medium leading-none">
                          <Checkbox
                            id="criterion-use-frequency-anchor"
                            checked={formData.use_frequency_anchor}
                            onCheckedChange={(checked) =>
                              setFormData((prev) => ({
                                ...prev,
                                use_frequency_anchor: checked === true,
                                frequency_anchor_period_id:
                                  checked === true ? prev.frequency_anchor_period_id : '',
                              }))
                            }
                          />
                          <span>Période de départ</span>
                        </label>
                        {formData.use_frequency_anchor ? (
                          <Select
                            value={formData.frequency_anchor_period_id || undefined}
                            onValueChange={(value) =>
                              setFormData((prev) => ({ ...prev, frequency_anchor_period_id: value }))
                            }
                          >
                            <SelectTrigger
                              id="criterion-frequency-anchor"
                              className="border-2 border-blue-300 bg-blue-50"
                            >
                              <SelectValue placeholder="Choisir un mois" />
                            </SelectTrigger>
                            <SelectContent>
                              {orderedEvaluationPeriods.map((period) => (
                                <SelectItem key={period.id} value={period.id}>
                                  {formatPeriodMonthLabel(period)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Calcul selon les périodes en base (ordre chronologique), à partir de la
                            création du critère.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="criterion-description">Description</Label>
                    <Textarea
                      id="criterion-description"
                      placeholder="Description optionnelle du critère..."
                      value={formData.description}
                      onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="border-2 border-blue-300 bg-blue-50 resize-y min-h-[72px]"
                    />
                  </div>

                  <div className="space-y-1.5">
                  <Label>Système de calcul</Label>
                  <Select
                    value={formData.calculation_rule_id}
                    onValueChange={(ruleId) => {
                      const selectedRule = calculationRules.find((r) => r.id === ruleId);
                      const optionCount =
                        selectedRule?.type === 'choice'
                          ? getChoiceOptionsFromConfig(selectedRule.config).length
                          : 0;
                      setFormData((prev) => ({
                        ...prev,
                        calculation_rule_id: ruleId,
                        type: selectedRule?.type ?? prev.type,
                        choice_option_labels:
                          selectedRule?.type === 'choice'
                            ? Array.from({ length: optionCount }, (_, idx) => prev.choice_option_labels[idx] || '')
                            : [],
                      }));
                    }}
                  >
                    <SelectTrigger className="border-2 border-blue-300 bg-blue-50">
                      <SelectValue placeholder="Système de calcul" />
                    </SelectTrigger>
                    <SelectContent>
                      {calculationRules.map((rule) => {
                        const method = getCalculationMethodDefinition(rule.type);
                        return (
                          <SelectItem key={rule.id} value={rule.id}>
                            {rule.label || method?.methodLabel || CRITERION_TYPE_LABELS[rule.type]}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  </div>
                  {(calculationRules.find((r) => r.id === formData.calculation_rule_id)?.type ?? formData.type) === 'choice' && (
                    <div className="space-y-2">
                      {getChoiceOptionsFromConfig(
                        calculationRules.find((r) => r.id === formData.calculation_rule_id)?.config ?? {}
                      ).map((choice, idx) => (
                        <div key={`choice-label-${idx + 1}`} className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-2">
                          <Input
                            placeholder={`Nom du choix ${idx + 1}`}
                            value={formData.choice_option_labels[idx] ?? ''}
                            onChange={(e) => {
                              const nextLabels = [...formData.choice_option_labels];
                              nextLabels[idx] = e.target.value;
                              setFormData({
                                ...formData,
                                choice_option_labels: nextLabels,
                                choice_option_1_label: nextLabels[0] ?? '',
                                choice_option_2_label: nextLabels[1] ?? '',
                              });
                            }}
                            className="border-2 border-blue-300 bg-blue-50"
                          />
                          <Input
                            value={`${choice.points} pt`}
                            readOnly
                            className="border border-muted bg-muted/40 text-muted-foreground"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <ScopeMultiField
                    label="Rôles"
                    emptyLabel="Ajouter un rôle"
                    allLabel="Pour tous"
                    allChecked={formData.role_all}
                    onAllCheckedChange={(role_all) => setFormData((prev) => ({ ...prev, role_all }))}
                    options={roles}
                    selectedIds={formData.role_ids}
                    onChange={(role_ids) => setFormData((prev) => ({ ...prev, role_ids }))}
                    renderBadge={(item, onRemove) => {
                      const role = roles.find((r) => r.id === item.id);
                      return (
                        <span
                          className={`${roleBadgeClassName} gap-1 inline-flex items-center`}
                          style={getRoleBadgeStyleFromColor(role?.color)}
                        >
                          {item.name}
                          <button type="button" onClick={onRemove} className="ml-1 hover:opacity-80">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    }}
                  />

                  <ScopeMultiField
                    label="Filiales"
                    emptyLabel="Ajouter une filiale"
                    allLabel="Pour toutes"
                    allChecked={formData.branch_all}
                    onAllCheckedChange={(branch_all) => setFormData((prev) => ({ ...prev, branch_all }))}
                    options={branches}
                    selectedIds={formData.branch_ids}
                    onChange={(branch_ids) => setFormData((prev) => ({ ...prev, branch_ids }))}
                  />

                  <ScopeMultiField
                    label="Services"
                    emptyLabel="Ajouter un service"
                    allLabel="Pour tous"
                    allChecked={formData.department_all}
                    onAllCheckedChange={(department_all) => setFormData((prev) => ({ ...prev, department_all }))}
                    options={departments}
                    selectedIds={formData.department_ids}
                    onChange={(department_ids) => setFormData((prev) => ({ ...prev, department_ids }))}
                  />

                  <Button onClick={handleSave} className="w-full">
                    {editing ? 'Modifier' : 'Créer'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <p>Chargement...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {criterionTab === 'active' ? 'Aucun critère actif' : 'Aucun critère archivé'}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">Nom du critère</th>
                    <th className="text-left py-3 px-4 w-28">Coefficient</th>
                    <th className="text-left py-3 px-4 w-36">Fréquence</th>
                    <th className="text-left py-3 px-4">Système de calcul</th>
                    <th className="text-left py-3 px-4">Rôles</th>
                    <th className="text-left py-3 px-4">Filiales</th>
                    <th className="text-left py-3 px-4">Services</th>
                    {criterionTab === 'archived' && (
                      <th className="text-left py-3 px-4">Archivé le</th>
                    )}
                    <th className="text-right py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedItems.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4 align-top">
                        <p className="font-medium">{c.name}</p>
                        <CriterionDescriptionExpand description={c.description} />
                      </td>
                      <td className="py-3 px-4 align-top">
                        <Badge variant="outline" className="font-mono tabular-nums">
                          {formatCoefficient(c.weight ?? 1)}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 align-top text-muted-foreground">
                        {formatCriterionFrequencyLabel(c.frequency)}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <Badge variant="secondary">
                          {calculationSystemLabel(c, calculationRules)}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <StackedRoleBadges ids={c.role_ids} roles={roles} allSelected={c.role_all ?? c.role_ids.length === 0} />
                      </td>
                      <td className="py-3 px-4 align-top">
                        <StackedNames ids={c.branch_ids} options={branches} allLabel="Toutes" allSelected={c.branch_all ?? c.branch_ids.length === 0} />
                      </td>
                      <td className="py-3 px-4 align-top">
                        <StackedNames ids={c.department_ids} options={departments} allLabel="Tous" allSelected={c.department_all ?? c.department_ids.length === 0} />
                      </td>
                      {criterionTab === 'archived' && (
                        <td className="py-3 px-4 align-top text-muted-foreground text-xs">
                          {formatArchivedAt(c.archived_at)}
                        </td>
                      )}
                      <td className="py-3 px-4 text-right align-top">
                        {criterionTab === 'active' && canWrite('evaluation_criteria') && (
                          <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        )}
                        {criterionTab === 'active' && canWrite('evaluation_criteria') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-amber-700"
                            onClick={() => setArchiveTarget(c)}
                            title="Archiver"
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                        )}
                        {criterionTab === 'archived' && canWrite('evaluation_criteria') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-700"
                            onClick={() => setRestoreTarget(c)}
                            title="Restaurer"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete('evaluation_criteria') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => void requestDelete(c)}
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              itemsPerPage={pagination.itemsPerPage}
              totalItems={pagination.totalItems}
              onPageChange={pagination.setCurrentPage}
              onItemsPerPageChange={pagination.setItemsPerPage}
              canGoPrev={pagination.canGoPrev}
              canGoNext={pagination.canGoNext}
            />
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!archiveTarget} onOpenChange={() => setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Archiver « {archiveTarget?.name} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            Le critère sera masqué des nouvelles évaluations. Les évaluations existantes conservent
            leurs données. Restauration possible depuis l&apos;onglet Archivés.
          </AlertDialogDescription>
          <AlertDialogAction onClick={handleArchive} className="bg-amber-600 hover:bg-amber-700">
            Archiver
          </AlertDialogAction>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!restoreTarget} onOpenChange={() => setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Restaurer « {restoreTarget?.name} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            Le critère redeviendra disponible pour les nouvelles évaluations.
          </AlertDialogDescription>
          <AlertDialogAction onClick={handleRestore}>Restaurer</AlertDialogAction>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer « {deleteTarget?.name} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            Action irréversible. Un critère déjà utilisé dans une évaluation ne peut pas être
            supprimé — archivez-le à la place.
          </AlertDialogDescription>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Supprimer
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default EvaluationCriteriaPage;
