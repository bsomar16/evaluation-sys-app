import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { hideLoadingOverlay } from '@/lib/loading-overlay';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Search,
  Trash2,
  Eye,
  CheckCircle,
  XCircle,
  ClipboardList,
} from 'lucide-react';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { ModuleAccessDenied } from '@/components/ModuleAccessDenied';
import {
  deleteEvaluation,
  fetchEvaluations,
  updateEvaluationStatus,
} from '@/lib/evaluation-storage';
import {
  EVALUATION_STATUS_LABELS,
  type EvaluationRecord,
  type EvaluationStatus,
} from '@/lib/evaluation-types';
import {
  getEvaluationPeriodSchedule,
  isEvaluationPeriodOpen,
  setEvaluationPeriodOpen,
  subscribeEvaluationPeriodChange,
} from '@/lib/evaluation-period-storage';
import { EvaluationAuditTrail } from '@/components/evaluation/EvaluationAuditTrail';

const ALL_STATUS = '__all__';

function toIsoValue(localValue: string): string | null {
  if (!localValue) return null;
  const date = new Date(localValue);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function statusBadgeVariant(status: EvaluationStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'approved':
      return 'default';
    case 'rejected':
      return 'destructive';
    case 'submitted':
      return 'secondary';
    default:
      return 'outline';
  }
}

export function EvaluationsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canRead, canWrite, canDelete } = useRolePermissions();

  const [rows, setRows] = useState<EvaluationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS);
  const [viewTarget, setViewTarget] = useState<EvaluationRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EvaluationRecord | null>(null);
  const [isPeriodOpen, setIsPeriodOpen] = useState<boolean>(() => isEvaluationPeriodOpen());
  const [isScheduleEnabled, setIsScheduleEnabled] = useState(() => {
    const s = getEvaluationPeriodSchedule();
    return s.enabled && (s.intervals?.length ?? 0) > 0;
  });

  const load = async () => {
    try {
      const data = await fetchEvaluations();
      setRows(data);
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

  useEffect(() => {
    const syncPeriodState = (openState: boolean) => {
      setIsPeriodOpen(openState);
      const s = getEvaluationPeriodSchedule();
      setIsScheduleEnabled(s.enabled && (s.intervals?.length ?? 0) > 0);
    };
    syncPeriodState(isEvaluationPeriodOpen());
    return subscribeEvaluationPeriodChange(syncPeriodState);
  }, []);

  const filtered = rows.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch =
      (e.employee_name ?? '').toLowerCase().includes(q) ||
      (e.period ?? '').toLowerCase().includes(q) ||
      (e.employee_email ?? '').toLowerCase().includes(q);
    const matchStatus = statusFilter === ALL_STATUS || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const pagination = usePagination(filtered, 10);

  const handleStatus = async (id: string, status: EvaluationStatus) => {
    if (!canWrite('evaluations_management')) return;
    try {
      await runWithLoadingOverlay(
        () => updateEvaluationStatus(id, status),
        'Mise à jour du statut...'
      );
      toast({ title: 'Succès', description: `Statut : ${EVALUATION_STATUS_LABELS[status]}` });
      load();
      setViewTarget(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Mise à jour impossible';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await runWithLoadingOverlay(
        () => deleteEvaluation(deleteTarget.id),
        "Suppression de l'évaluation..."
      );
      toast({ title: 'Succès', description: 'Évaluation supprimée' });
      setDeleteTarget(null);
      load();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Suppression impossible';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    }
  };

  const handlePeriodToggle = () => {
    if (!canWrite('evaluations_management')) return;
    const nextValue = !isPeriodOpen;
    setEvaluationPeriodOpen(nextValue);
    setIsPeriodOpen(nextValue);
    setIsScheduleEnabled(false);
    toast({
      title: nextValue ? 'Période ouverte' : 'Période fermée',
      description: nextValue
        ? 'Les managers peuvent soumettre des évaluations.'
        : "Les soumissions d'évaluations sont temporairement bloquées.",
    });
  };

  const handleOpenScheduledPeriods = () => {
    navigate('/admin/scheduled-periods');
  };

  if (!canRead('evaluations_management')) {
    return <ModuleAccessDenied />;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">Gestion des évaluations</h1>
          <Badge variant={isPeriodOpen ? 'default' : 'destructive'}>
            {isPeriodOpen ? 'Période ouverte' : 'Période fermée'}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            Historique, validation et suivi des évaluations enregistrées.
          </p>
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            {canWrite('evaluations_management') && (
              <Button
                variant={isPeriodOpen ? 'destructive' : 'default'}
                onClick={handlePeriodToggle}
              >
                {isPeriodOpen ? "Fermer l'évaluation" : "Ouvrir l'évaluation"}
              </Button>
            )}
            {canWrite('evaluations_management') && (
              <Button
                variant={isScheduleEnabled ? 'default' : 'outline'}
                className={
                  isScheduleEnabled
                    ? 'gap-2 bg-primary text-primary-foreground'
                    : 'gap-2 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                }
                onClick={handleOpenScheduledPeriods}
              >
                {isScheduleEnabled ? 'Période programmée' : 'Programmer la période'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Liste des évaluations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Chercher employé, période, e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUS}>Tous les statuts</SelectItem>
                {(Object.keys(EVALUATION_STATUS_LABELS) as EvaluationStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {EVALUATION_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <p>Chargement...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Aucune évaluation</p>
          ) : (
            <>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">Employé</th>
                    <th className="text-left py-3 px-4">Période</th>
                    <th className="text-left py-3 px-4">Score</th>
                    <th className="text-left py-3 px-4">Statut</th>
                    <th className="text-left py-3 px-4">Date</th>
                    <th className="text-right py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedItems.map((e) => (
                    <tr key={e.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4 font-medium">{e.employee_name ?? '—'}</td>
                      <td className="py-3 px-4">{e.period || '—'}</td>
                      <td className="py-3 px-4">
                        {e.score != null ? `${e.score.toFixed(1)} pts` : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={statusBadgeVariant(e.status)}>
                          {EVALUATION_STATUS_LABELS[e.status]}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {e.created_at
                          ? new Date(e.created_at).toLocaleDateString('fr-FR')
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => setViewTarget(e)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canDelete('evaluations_management') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setDeleteTarget(e)}
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

      <Dialog open={!!viewTarget} onOpenChange={() => setViewTarget(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détail — {viewTarget?.employee_name}</DialogTitle>
          </DialogHeader>
          {viewTarget && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Période</span>
                <span>{viewTarget.period}</span>
                <span className="text-muted-foreground">Score total</span>
                <span className="font-semibold">
                  {viewTarget.score != null ? `${viewTarget.score.toFixed(1)} pts` : '—'}
                </span>
                <span className="text-muted-foreground">Statut</span>
                <Badge variant={statusBadgeVariant(viewTarget.status)}>
                  {EVALUATION_STATUS_LABELS[viewTarget.status]}
                </Badge>
              </div>
              {viewTarget.feedback && (
                <div>
                  <p className="text-muted-foreground mb-1">Commentaire</p>
                  <p className="rounded-md border p-3 bg-muted/30">{viewTarget.feedback}</p>
                </div>
              )}
              {viewTarget.responses.length > 0 && (
                <div>
                  <p className="font-medium mb-2 flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    Critères
                  </p>
                  <ul className="space-y-2">
                    {viewTarget.responses.map((r) => (
                      <li key={r.criterion_id} className="flex justify-between border-b pb-2">
                        <span>{r.criterion_name}</span>
                        <span className="text-muted-foreground">{r.points.toFixed(1)} pt</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {viewTarget.activity_log && viewTarget.activity_log.length > 0 && (
                <EvaluationAuditTrail entries={viewTarget.activity_log} />
              )}
              {(canWrite('evaluations_management') || canWrite('evaluations')) &&
                viewTarget.status === 'submitted' && (
                <div className="flex gap-2 pt-2">
                  <Button
                    className="flex-1 gap-1"
                    onClick={() => handleStatus(viewTarget.id, 'approved')}
                  >
                    <CheckCircle className="h-4 w-4" />
                    Approuver
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 gap-1"
                    onClick={() => handleStatus(viewTarget.id, 'rejected')}
                  >
                    <XCircle className="h-4 w-4" />
                    Rejeter
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>
            Supprimer l&apos;évaluation de {deleteTarget?.employee_name} ?
          </AlertDialogTitle>
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

export default EvaluationsPage;
