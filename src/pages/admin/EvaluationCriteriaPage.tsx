import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Plus, Trash2, Edit2, Search, X } from 'lucide-react';
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
  deleteEvaluationCriterion,
  fetchCalculationRules,
  fetchEvaluationCriteria,
  upsertEvaluationCriterion,
} from '@/lib/evaluation-config-storage';

type CriterionFormState = {
  name: string;
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

function emptyForm(rules: CalculationRuleRecord[]): CriterionFormState {
  const first = rules[0];
  return {
    name: '',
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

export function EvaluationCriteriaPage() {
  const { toast } = useToast();
  const { canRead, canWrite, canDelete } = useRolePermissions();
  const [criteria, setCriteria] = useState<EvaluationCriterionRecord[]>([]);
  const [calculationRules, setCalculationRules] = useState<CalculationRuleRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editing, setEditing] = useState<EvaluationCriterionRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EvaluationCriterionRecord | null>(null);
  const [formData, setFormData] = useState<CriterionFormState>(() => emptyForm([]));

  const load = async () => {
    try {
      const [rows, rules, rolesRes, branchesRes, deptsRes] = await Promise.all([
        fetchEvaluationCriteria(),
        fetchCalculationRules(),
        supabase.from('roles').select('id, name, color'),
        supabase.from('branches').select('id, name'),
        supabase.from('departments').select('id, name'),
      ]);
      setCriteria(rows.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setCalculationRules(rules);
      if (!rolesRes.error) setRoles(rolesRes.data || []);
      if (!branchesRes.error) setBranches(branchesRes.data || []);
      if (!deptsRes.error) setDepartments(deptsRes.data || []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Chargement impossible';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    } finally {
      setLoading(false);
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
    if (!formData.name.trim()) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Indiquez le nom du critère' });
      return;
    }
    if (!formData.calculation_rule_id) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Choisissez un système de calcul' });
      return;
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
      toast({ variant: 'destructive', title: 'Erreur', description: 'Sélectionnez au moins un département ou cochez Pour tous' });
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
        weight: editing?.weight ?? 1,
        sort_order: editing?.sort_order ?? criteria.length + 1,
        is_active: editing?.is_active ?? true,
      });
      toast({ title: 'Succès', description: editing ? 'Critère modifié' : 'Critère créé' });
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
      const message = error instanceof Error ? error.message : 'Suppression impossible';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    }
  };

  const filtered = criteria.filter(
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
          Associez chaque critère à un système de calcul et ciblez les rôles, filiales et départements souhaités.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Liste des critères</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                <Button className="gap-2" disabled={!canWrite('evaluation_criteria')} onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Nouveau
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editing ? 'Modifier' : 'Créer'} un critère</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="Nom du critère"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="border-2 border-blue-300 bg-blue-50"
                  />

                  <Select
                    value={formData.calculation_rule_id}
                    onValueChange={(ruleId) => {
                      const selectedRule = calculationRules.find((r) => r.id === ruleId);
                      const optionCount =
                        selectedRule?.type === 'choice'
                          ? getChoiceOptionsFromConfig(selectedRule.config).length
                          : 0;
                      setFormData({
                        ...formData,
                        calculation_rule_id: ruleId,
                        type: selectedRule?.type ?? formData.type,
                        choice_option_labels:
                          selectedRule?.type === 'choice'
                            ? Array.from({ length: optionCount }, (_, idx) => formData.choice_option_labels[idx] || '')
                            : [],
                      });
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
                    onAllCheckedChange={(role_all) => setFormData({ ...formData, role_all })}
                    options={roles}
                    selectedIds={formData.role_ids}
                    onChange={(role_ids) => setFormData({ ...formData, role_ids })}
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
                    onAllCheckedChange={(branch_all) => setFormData({ ...formData, branch_all })}
                    options={branches}
                    selectedIds={formData.branch_ids}
                    onChange={(branch_ids) => setFormData({ ...formData, branch_ids })}
                  />

                  <ScopeMultiField
                    label="Départements"
                    emptyLabel="Ajouter un département"
                    allLabel="Pour tous"
                    allChecked={formData.department_all}
                    onAllCheckedChange={(department_all) => setFormData({ ...formData, department_all })}
                    options={departments}
                    selectedIds={formData.department_ids}
                    onChange={(department_ids) => setFormData({ ...formData, department_ids })}
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
            <p className="text-center text-muted-foreground py-8">Aucun critère</p>
          ) : (
            <>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">Nom du critère</th>
                    <th className="text-left py-3 px-4">Système de calcul</th>
                    <th className="text-left py-3 px-4">Rôles</th>
                    <th className="text-left py-3 px-4">Filiales</th>
                    <th className="text-left py-3 px-4">Départements</th>
                    <th className="text-right py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedItems.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4 font-medium align-top">{c.name}</td>
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
                      <td className="py-3 px-4 text-right align-top">
                        {canWrite('evaluation_criteria') && (
                          <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete('evaluation_criteria') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setDeleteTarget(c)}
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

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer « {deleteTarget?.name} » ?</AlertDialogTitle>
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
