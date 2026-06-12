import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { hideLoadingOverlay } from '@/lib/loading-overlay';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Search,
  Trash2,
  Eye,
  CheckCircle,
  XCircle,
  ClipboardList,
  CalendarClock,
  Circle,
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
  setEvaluationPeriodSchedule,
  subscribeEvaluationPeriodChange,
} from '@/lib/evaluation-period-storage';
import {
  dateToPeriodCode,
  describeEvaluationPeriodCode,
  parsePeriodCode,
  getLastDayOfMonth,
} from '@/lib/evaluation-period-label';
import { runWithLoadingOverlay } from '@/lib/loading-overlay';
import { EvaluationAuditTrail } from '@/components/evaluation/EvaluationAuditTrail';

const ALL_STATUS = '__all__';

function toIsoValue(localValue: string): string | null {
  if (!localValue) return null;
  const date = new Date(localValue);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

/** Extraire année/mois d'une période (YYYY-MM) pour validation */
function getPeriodYearMonth(code: string): string | null {
  const parsed = parsePeriodCode(code);
  if (!parsed) return null;
  return `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
}

type IntervalPhase = 'active' | 'ended' | 'upcoming';

function getIntervalPhase(startAt: string, endAt: string, now = Date.now()): IntervalPhase {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'ended';
  if (now < start) return 'upcoming';
  if (now > end) return 'ended';
  return 'active';
}

function formatIntervalRange(startAt: string, endAt: string): string {
  const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  return `${fmt.format(new Date(startAt))} → ${fmt.format(new Date(endAt))}`;
}

function intervalPhaseLabel(phase: IntervalPhase): string {
  switch (phase) {
    case 'active':
      return 'Active';
    case 'ended':
      return 'Terminée';
    default:
      return 'À venir';
  }
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
  const { toast } = useToast();
  const { canRead, canWrite, canDelete } = useRolePermissions();

  const [rows, setRows] = useState<EvaluationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS);
  const [viewTarget, setViewTarget] = useState<EvaluationRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EvaluationRecord | null>(null);
  const [isPeriodOpen, setIsPeriodOpen] = useState<boolean>(() => isEvaluationPeriodOpen());
  const [scheduleOpen, setScheduleOpen] = useState(false);
  
  // Nouveaux états pour les périodes mensuelles
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [startDay, setStartDay] = useState(1);
  const [endDay, setEndDay] = useState(getLastDayOfMonth(currentYear, currentMonth));
  const [periodName, setPeriodName] = useState<string>('');
  
  // États pour compatibilité avec programmation
  const [scheduleStart, setScheduleStart] = useState('');
  const [scheduleEnd, setScheduleEnd] = useState('');
  const [scheduledIntervals, setScheduledIntervals] = useState(
    () => getEvaluationPeriodSchedule().intervals ?? []
  );
  const [isScheduleEnabled, setIsScheduleEnabled] = useState(() => {
    const s = getEvaluationPeriodSchedule();
    return s.enabled && (s.intervals?.length ?? 0) > 0;
  });

  const refreshScheduledIntervals = () => {
    setScheduledIntervals(getEvaluationPeriodSchedule().intervals ?? []);
  };

  // Mettre à jour periodName quand année/mois change
  useEffect(() => {
    const code = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    const description = describeEvaluationPeriodCode(code) || code;
    setPeriodName(description);
  }, [selectedYear, selectedMonth]);

  // Mettre à jour endDay quand le mois change
  useEffect(() => {
    const lastDay = getLastDayOfMonth(selectedYear, selectedMonth);
    setEndDay(Math.min(endDay, lastDay));
  }, [selectedYear, selectedMonth]);

  const load = async () => {
    try {
      setRows(
        await runWithLoadingOverlay(
          () => fetchEvaluations(),
          'Chargement de la liste des évaluations...'
        )
      );
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

  const openScheduleDialog = () => {
    setSelectedYear(currentYear);
    setSelectedMonth(currentMonth);
    setStartDay(1);
    setEndDay(getLastDayOfMonth(currentYear, currentMonth));
    setScheduleStart('');
    setScheduleEnd('');
    refreshScheduledIntervals();
    setScheduleOpen(true);
  };

  const handleSaveSchedule = () => {
    // Valider les jours
    if (startDay < 1 || startDay > 31 || endDay < 1 || endDay > 31) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Les jours doivent être entre 1 et 31.',
      });
      return;
    }

    const lastDay = getLastDayOfMonth(selectedYear, selectedMonth);
    if (startDay > lastDay || endDay > lastDay) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: `Le mois a seulement ${lastDay} jours.`,
      });
      return;
    }

    if (startDay > endDay) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'La date de fin doit être après ou égale à la date de début.',
      });
      return;
    }

    // Créer les dates de début/fin
    const startAt = new Date(selectedYear, selectedMonth - 1, startDay, 0, 0, 0, 0).toISOString();
    const endAt = new Date(selectedYear, selectedMonth - 1, endDay, 23, 59, 59, 999).toISOString();

    // Vérifier les doublons de mois-année
    const schedule = getEvaluationPeriodSchedule();
    const existing = schedule.intervals ?? [];
    const newYearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

    const hasDuplicateMonth = existing.some((i) => {
      const existingStart = new Date(i.startAt);
      const existingMonth = `${existingStart.getFullYear()}-${String(existingStart.getMonth() + 1).padStart(2, '0')}`;
      return existingMonth === newYearMonth;
    });

    if (hasDuplicateMonth) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: `Une période pour ${periodName} existe déjà. Une seule période par mois-année est autorisée.`,
      });
      return;
    }

    const newStart = new Date(startAt).getTime();
    const newEnd = new Date(endAt).getTime();

    const overlaps = existing.some((i) => {
      const s = new Date(i.startAt).getTime();
      const e = new Date(i.endAt).getTime();
      if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e) return false;
      // Chevauchement si : newStart < existingEnd && newEnd > existingStart
      return newStart < e && newEnd > s;
    });

    if (overlaps) {
      toast({
        variant: 'destructive',
        title: 'Chevauchement',
        description: 'Le nouvel intervalle chevauche une période déjà programmée.',
      });
      return;
    }

    const nextIntervals = [
      ...existing,
      { startAt, endAt },
    ].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

    setEvaluationPeriodSchedule({
      enabled: true,
      intervals: nextIntervals,
    });
    setIsScheduleEnabled(true);
    setIsPeriodOpen(isEvaluationPeriodOpen());
    refreshScheduledIntervals();
    
    // Réinitialiser les champs
    setStartDay(1);
    setEndDay(getLastDayOfMonth(currentYear, currentMonth));
    setSelectedYear(currentYear);
    setSelectedMonth(currentMonth);
    setScheduleStart('');
    setScheduleEnd('');
    
    toast({
      title: 'Période enregistrée',
      description: `La période ${periodName} s'ouvrira et se fermera automatiquement selon le calendrier programmé.`,
    });
  };

  const handleDeleteInterval = (idx: number) => {
    const schedule = getEvaluationPeriodSchedule();
    const target = schedule.intervals?.[idx];
    if (!target) return;

    const phase = getIntervalPhase(target.startAt, target.endAt);
    if (phase !== 'upcoming') {
      toast({
        variant: 'destructive',
        title: 'Suppression impossible',
        description:
          phase === 'active'
            ? 'Impossible de supprimer une période en cours.'
            : 'Impossible de supprimer une période déjà terminée.',
      });
      return;
    }

    const nextIntervals = (schedule.intervals ?? []).filter((_, i) => i !== idx);
    setEvaluationPeriodSchedule({
      enabled: nextIntervals.length > 0,
      intervals: nextIntervals,
    });
    setIsScheduleEnabled(nextIntervals.length > 0);
    setIsPeriodOpen(isEvaluationPeriodOpen());
    refreshScheduledIntervals();
    toast({
      title: 'Intervalle supprimé',
      description: 'La programmation a été mise à jour.',
    });
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
                onClick={openScheduleDialog}
              >
                <CalendarClock className="h-4 w-4" />
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

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Programmer une période d&apos;évaluation mensuelle</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <p className="text-xs text-muted-foreground">
              Créez une période d&apos;évaluation pour un mois spécifique. Une seule période par mois-année est autorisée.
            </p>

            {/* Section Sélection Mois/Année */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium">1. Sélectionnez le mois et l&apos;année</p>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Année</label>
                  <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2024, 2025, 2026, 2027, 2028].map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Mois</label>
                  <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
                        const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
                        return (
                          <SelectItem key={m} value={String(m)}>
                            {monthNames[m - 1]}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Nom de la période (lecture seule)</label>
                <Input type="text" value={periodName} disabled className="bg-background" />
              </div>
            </div>

            {/* Section Sélection Dates */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium">2. Sélectionnez les dates de début et fin du mois</p>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Jour de début</label>
                  <Select value={String(startDay)} onValueChange={(v) => setStartDay(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: getLastDayOfMonth(selectedYear, selectedMonth) }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Jour de fin</label>
                  <Select value={String(endDay)} onValueChange={(v) => setEndDay(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: getLastDayOfMonth(selectedYear, selectedMonth) }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)} disabled={d < startDay}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded p-2 text-xs">
                <p className="text-blue-900 dark:text-blue-100">
                  📅 Période : <strong>{startDay} – {endDay} {String(selectedMonth).padStart(2, '0')}/{selectedYear}</strong>
                </p>
              </div>
            </div>

            {/* Liste des périodes programmées */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Périodes programmées</p>
              {scheduledIntervals.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucune période programmée.</p>
              ) : (
                <ul className="space-y-2 max-h-48 overflow-auto pr-1">
                  {scheduledIntervals.map((interval, idx) => {
                    const phase = getIntervalPhase(interval.startAt, interval.endAt);
                    const canDelete = phase === 'upcoming';
                    const startDate = new Date(interval.startAt);
                    const periodCode = dateToPeriodCode(startDate);
                    const periodDesc = describeEvaluationPeriodCode(periodCode) || periodCode;
                    
                    return (
                      <li
                        key={`${interval.startAt}-${interval.endAt}-${idx}`}
                        className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Circle
                            className={`h-3.5 w-3.5 shrink-0 fill-current ${
                              phase === 'active'
                                ? 'text-green-600'
                                : phase === 'ended'
                                  ? 'text-red-600'
                                  : 'text-foreground'
                            }`}
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-medium">{intervalPhaseLabel(phase)}</p>
                            <div className="flex flex-col gap-0.5">
                              <p className="text-xs font-semibold text-foreground">{periodDesc}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {formatIntervalRange(interval.startAt, interval.endAt)}
                              </p>
                            </div>
                          </div>
                        </div>
                        {canDelete ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-foreground"
                            title="Supprimer cette période à venir"
                            onClick={() => handleDeleteInterval(idx)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="h-8 w-8 shrink-0" aria-hidden />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Circle className="h-2.5 w-2.5 fill-green-600 text-green-600" /> Active
                </span>
                {' · '}
                <span className="inline-flex items-center gap-1">
                  <Circle className="h-2.5 w-2.5 fill-red-600 text-red-600" /> Terminée
                </span>
                {' · '}
                <span className="inline-flex items-center gap-1">
                  <Circle className="h-2.5 w-2.5 fill-foreground text-foreground" /> À venir
                </span>
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="ghost" onClick={() => setScheduleOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleSaveSchedule}>Enregistrer la période</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default EvaluationsPage;
