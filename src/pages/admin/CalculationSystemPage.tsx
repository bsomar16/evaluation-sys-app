import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Edit2, Plus, Search, Trash2 } from 'lucide-react';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { ModuleAccessDenied } from '@/components/ModuleAccessDenied';
import { CalculationMethodParamsPanel } from '@/components/admin/CalculationMethodParamsPanel';
import {
  CALCULATION_METHOD_TYPES,
  getCalculationMethodDefinition,
} from '@/lib/calculation-method-catalog';
import {
  CRITERION_TYPE_LABELS,
  getDefaultCalculationRule,
  mergeCalculationRuleWithDefaults,
  type CalculationRuleRecord,
  type CriterionType,
} from '@/lib/evaluation-calculator';
import {
  countCriteriaUsingCalculationRule,
  deleteCalculationRule,
  fetchCalculationRules,
  upsertCalculationRule,
} from '@/lib/evaluation-config-storage';

export function CalculationSystemPage() {
  const { toast } = useToast();
  const { canRead, canWrite, canDelete } = useRolePermissions();
  const [rules, setRules] = useState<CalculationRuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [isCreate, setIsCreate] = useState(false);
  const [draft, setDraft] = useState<CalculationRuleRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CalculationRuleRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      setRules(await fetchCalculationRules());
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

  const filtered = rules.filter((r) => {
    const q = search.toLowerCase();
    const label = (r.label ?? '').toLowerCase();
    return (
      label.includes(q) ||
      CRITERION_TYPE_LABELS[r.type].toLowerCase().includes(q)
    );
  });

  const pagination = usePagination(filtered, 10);

  const openCreate = () => {
    setIsCreate(true);
    setDraft(getDefaultCalculationRule('binary'));
    setOpenDialog(true);
  };

  const openEdit = (rule: CalculationRuleRecord) => {
    setIsCreate(false);
    setDraft({ ...rule, config: { ...rule.config } });
    setOpenDialog(true);
  };

  const patchDraftConfig = (patch: Partial<CalculationRuleRecord['config']>) => {
    if (!draft) return;
    setDraft({ ...draft, config: { ...draft.config, ...patch } });
  };

  const changeDraftMethod = (type: CriterionType) => {
    const next = getDefaultCalculationRule(type);
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            type: next.type,
            config: {},
            max_points: undefined,
          }
        : next
    );
  };

  const handleSaveRule = async () => {
    if (!draft || !canWrite('calculation_system')) return;
    if (!draft.label.trim()) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Indiquez le nom du système de calcul' });
      return;
    }
    setSaving(true);
    try {
      const saved = await upsertCalculationRule(
        mergeCalculationRuleWithDefaults({ ...draft, label: draft.label.trim() })
      );
      setRules((prev) => {
        const exists = prev.some((r) => r.id === saved.id);
        return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved];
      });
      toast({ title: 'Succès', description: isCreate ? 'Système créé' : 'Système enregistré' });
      setOpenDialog(false);
      setDraft(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Enregistrement impossible';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const canRemove = canDelete('calculation_system') || canWrite('calculation_system');
    if (!canRemove) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Permission suppression requise' });
      return;
    }
    setDeleting(true);
    try {
      const inUse = await countCriteriaUsingCalculationRule(deleteTarget.id, deleteTarget.type);
      if (inUse > 0) {
        toast({
          variant: 'destructive',
          title: 'Suppression impossible',
          description: `${inUse} critère(s) d'évaluation utilisent ce système. Modifiez-les avant de supprimer.`,
        });
        return;
      }
      await deleteCalculationRule(deleteTarget.id);
      setRules((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      toast({ title: 'Succès', description: 'Système de calcul supprimé' });
      setDeleteTarget(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Suppression impossible';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    } finally {
      setDeleting(false);
    }
  };

  if (!canRead('calculation_system')) {
    return <ModuleAccessDenied />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Système de calcul</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Créez autant de systèmes que nécessaire (même méthode possible plusieurs fois).
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Systèmes de calcul configurés</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Chercher par nom ou méthode..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              className="gap-2 shrink-0"
              disabled={!canWrite('calculation_system')}
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" />
              Nouveau
            </Button>
          </div>

          <Dialog
            open={openDialog}
            onOpenChange={(open) => {
              setOpenDialog(open);
              if (!open) {
                setDraft(null);
                setIsCreate(false);
              }
            }}
          >
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {isCreate ? 'Nouveau système de calcul' : 'Modifier le système de calcul'}
                </DialogTitle>
              </DialogHeader>
              {draft && (
                <div className="space-y-4">
                  <Input
                    placeholder="Nom du système de calcul"
                    value={draft.label}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                    disabled={!canWrite('calculation_system')}
                    className="border-2 border-blue-300 bg-blue-50"
                  />

                  <Select
                    value={draft.type}
                    onValueChange={(v) => changeDraftMethod(v as CriterionType)}
                    disabled={!isCreate && !canWrite('calculation_system')}
                  >
                    <SelectTrigger className="border-2 border-blue-300 bg-blue-50">
                      <SelectValue placeholder="Méthode suivie" />
                    </SelectTrigger>
                    <SelectContent>
                      {CALCULATION_METHOD_TYPES.map((type) => {
                        const m = getCalculationMethodDefinition(type);
                        return (
                          <SelectItem key={type} value={type}>
                            {m?.methodLabel ?? CRITERION_TYPE_LABELS[type]}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>

                  <CalculationMethodParamsPanel
                    draft={draft}
                    onPatchConfig={patchDraftConfig}
                    onMaxPointsChange={(max_points) => setDraft({ ...draft, max_points })}
                    disabled={!canWrite('calculation_system')}
                  />

                  {canWrite('calculation_system') && (
                    <Button onClick={handleSaveRule} className="w-full" disabled={saving}>
                      {saving ? 'Enregistrement…' : isCreate ? 'Créer le système' : 'Enregistrer'}
                    </Button>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>

          {loading ? (
            <p>Chargement...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Aucun système de calcul</p>
          ) : (
            <>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">Nom du système</th>
                    <th className="text-left py-3 px-4">Méthode suivie</th>
                    <th className="text-right py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedItems.map((r) => {
                    const method = getCalculationMethodDefinition(r.type);
                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/50 align-top">
                        <td className="py-3 px-4 font-medium">{rule.label}</td>
                        <td className="py-3 px-4">
                          <Badge variant="outline">
                            {method?.methodLabel ?? CRITERION_TYPE_LABELS[rule.type]}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {canWrite('calculation_system') && (
                            <Button variant="ghost" size="sm" onClick={() => openEdit(rule)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}
                          {(canDelete('calculation_system') || canWrite('calculation_system')) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setDeleteTarget(rule)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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

      <AlertDialog open={!!deleteTarget} onOpenChange={() => !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer « {deleteTarget?.label} » ?</AlertDialogTitle>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground"
            >
              {deleting ? 'Suppression…' : 'Supprimer'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default CalculationSystemPage;
