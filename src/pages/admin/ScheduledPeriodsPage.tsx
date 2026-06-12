import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { showLoadingOverlay, hideLoadingOverlay } from '@/lib/loading-overlay';
import { getSessionUser } from '@/lib/session-user';
import {
  getEvaluationPeriodSchedule,
  setEvaluationPeriodSchedule,
  subscribeEvaluationPeriodChange,
} from '@/lib/evaluation-period-storage';
import {
  getCurrentEvaluationPeriodCode,
  getLastDayOfMonth,
  describeEvaluationPeriodCode,
} from '@/lib/evaluation-period-label';
import { Plus, Pencil, Trash2, Search, Info } from 'lucide-react';

type DialogMode = 'none' | 'create' | 'edit' | 'delete' | 'view';
type FilterState = 'all' | 'upcoming' | 'active' | 'ended';
type IntervalPhase = 'upcoming' | 'active' | 'ended';

interface Interval {
  startAt: string;
  endAt: string;
  isProlongation?: boolean;
  createdAt?: string;
  createdBy?: string;
  isProlongationClosed?: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const MONTH_LABELS: Record<number, string> = {
  1: 'janvier', 2: 'février', 3: 'mars', 4: 'avril', 5: 'mai', 6: 'juin',
  7: 'juillet', 8: 'août', 9: 'septembre', 10: 'octobre', 11: 'novembre', 12: 'décembre',
};

// Helper functions
function getIntervalPhase(startAt: string, endAt: string): IntervalPhase {
  const now = new Date();
  const start = new Date(startAt);
  const end = new Date(endAt);
  
  if (now < start) return 'upcoming';
  if (now > end) return 'ended';
  return 'active';
}

function intervalPhaseLabel(phase: IntervalPhase): string {
  const labels: Record<IntervalPhase, string> = {
    upcoming: 'À venir',
    active: 'Actif',
    ended: 'Clôturé',
  };
  return labels[phase];
}

function formatIntervalRange(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  
  const dateFormat = (date: Date) => {
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  
  return `${dateFormat(start)} — ${dateFormat(end)}`;
}

function getPeriodYearMonth(startAt: string): string {
  const date = new Date(startAt);
  return `${MONTH_LABELS[date.getMonth() + 1]} ${date.getFullYear()}`;
}

export default function ScheduledPeriodsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canWrite } = useRolePermissions();
  const canManagePeriods = canWrite('evaluations_management');

  // State
  const [scheduledIntervals, setScheduledIntervals] = useState<Interval[]>(() =>
    getEvaluationPeriodSchedule().intervals ?? []
  );
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<FilterState>('all');
  const [dialogMode, setDialogMode] = useState<DialogMode>('none');
  const [editingIntervalIndex, setEditingIntervalIndex] = useState<number | null>(null);
  const [deleteTargetIndex, setDeleteTargetIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Form state
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [periodName, setPeriodName] = useState('');

  // Get filtered intervals
  function getFilteredIntervals(): Interval[] {
    return scheduledIntervals.filter((interval) => {
      if (filterState !== 'all') {
        const phase = getIntervalPhase(interval.startAt, interval.endAt);
        if (phase !== filterState) return false;
      }
      
      if (search) {
        const name = getPeriodYearMonth(interval.startAt);
        if (!name.toLowerCase().includes(search.toLowerCase())) return false;
      }
      
      return true;
    });
  }

  // Pagination
  const pagination = usePagination(getFilteredIntervals(), 10);

  // Get minimum date (current month start)
  function getMinDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  }

  // Get last day of month for a date
  function getLastDayForDate(dateStr: string): number {
    if (!dateStr) return 1;
    const [year, month] = dateStr.split('-').map(Number);
    return getLastDayOfMonth(year, month);
  }

  // Get max date for end date (last day of same month)
  function getEndDateMax(): string {
    if (!startDate) return '';
    const [year, month] = startDate.split('-');
    const lastDay = getLastDayForDate(startDate);
    return `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
  }

  // Update period name when start date changes
  useEffect(() => {
    if (!startDate) {
      setPeriodName('');
      return;
    }
    const [year, month] = startDate.split('-').map(Number);
    const code = `${year}-${String(month).padStart(2, '0')}`;
    const desc = describeEvaluationPeriodCode(code) || '';
    setPeriodName(desc);
  }, [startDate]);

  // Subscribe to period changes
  useEffect(() => {
    const unsubscribe = subscribeEvaluationPeriodChange(() => {
      const schedule = getEvaluationPeriodSchedule();
      setScheduledIntervals(schedule.intervals ?? []);
    });
    return () => unsubscribe?.();
  }, []);

  // Auto-close prolongations at end of month
  useEffect(() => {
    const now = new Date();
    let updated = false;
    const newIntervals = scheduledIntervals.map((interval) => {
      // If it's a prolongation that hasn't been manually closed and end date is past, mark as closed
      if (interval.isProlongation && !interval.isProlongationClosed) {
        const endDate = new Date(interval.endAt);
        if (now > endDate) {
          updated = true;
          return {
            ...interval,
            isProlongationClosed: true,
          };
        }
      }
      return interval;
    });

    if (updated) {
      setEvaluationPeriodSchedule({ intervals: newIntervals });
      setScheduledIntervals(newIntervals);
    }
  }, [scheduledIntervals]);

  // Count intervals by phase
  function countByPhase(phase: IntervalPhase): number {
    return scheduledIntervals.filter(
      (i) => getIntervalPhase(i.startAt, i.endAt) === phase
    ).length;
  }

  // Phase badge variant
  function phaseBadgeVariant(phase: IntervalPhase) {
    switch (phase) {
      case 'upcoming': return 'secondary';
      case 'active': return 'default';
      case 'ended': return 'destructive';
    }
  }

  // Dialogs
  function openCreateMode() {
    setStartDate('');
    setEndDate('');
    setFormError('');
    setPeriodName('');
    setEditingIntervalIndex(null);
    setDeleteTargetIndex(null);
    setDialogMode('create');
  }

  function openEditMode(idx: number) {
    const interval = scheduledIntervals[idx];
    const start = new Date(interval.startAt);
    const end = new Date(interval.endAt);
    
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    
    setStartDate(startStr);
    setEndDate(endStr);
    setFormError('');
    setEditingIntervalIndex(idx);
    setDialogMode('edit');
  }

  function openDeleteMode(idx: number) {
    setDeleteTargetIndex(idx);
    setDialogMode('delete');
  }

  function openViewMode(idx: number) {
    setEditingIntervalIndex(idx);
    setDialogMode('view');
  }

  async function handleSaveSchedule() {
    try {
      setFormError('');
      
      if (!startDate || !endDate) {
        setFormError('Veuillez saisir les dates de début et de fin');
        return;
      }

      const minDate = getMinDate();
      if (startDate < minDate) {
        setFormError(`La date de début doit être >= ${new Date(minDate).toLocaleDateString('fr-FR')}`);
        return;
      }

      setLoading(true);
      showLoadingOverlay('Enregistrement...');
      
      const startAt = new Date(startDate);
      const endAt = new Date(endDate);
      
      startAt.setHours(0, 0, 0, 0);
      endAt.setHours(23, 59, 59, 999);

      // Validation
      if (startAt > endAt) {
        toast({ variant: 'destructive', title: 'Erreur', description: 'Date de début doit être avant la fin' });
        return;
      }

      // Check same month
      if (startAt.getMonth() !== endAt.getMonth() || startAt.getFullYear() !== endAt.getFullYear()) {
        toast({ variant: 'destructive', title: 'Erreur', description: 'Les dates doivent être dans le même mois' });
        return;
      }

      let newIntervals = [...scheduledIntervals];
      const sessionUser = getSessionUser();
      const currentUser = sessionUser?.name || sessionUser?.email || 'Utilisateur';

      if (editingIntervalIndex !== null) {
        // Update existing (preserve createdAt and createdBy)
        const existing = newIntervals[editingIntervalIndex];
        newIntervals[editingIntervalIndex] = {
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          createdAt: existing.createdAt,
          createdBy: existing.createdBy,
          isProlongation: existing.isProlongation,
        };
      } else {
        // Create new
        // Check for duplicates
        for (const interval of newIntervals) {
          const iStart = new Date(interval.startAt);
          const iStartMonth = iStart.getMonth() + 1;
          const iStartYear = iStart.getFullYear();
          
          const startMonth = startAt.getMonth() + 1;
          const startYear = startAt.getFullYear();
          
          if (iStartYear === startYear && iStartMonth === startMonth) {
            toast({ variant: 'destructive', title: 'Erreur', description: 'Une période existe déjà pour ce mois' });
            return;
          }
        }

        newIntervals.push({
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: currentUser,
        });
      }

      // Sort by startAt
      newIntervals = newIntervals.sort((a, b) => 
        new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
      );

      setEvaluationPeriodSchedule({ intervals: newIntervals });
      setScheduledIntervals(newIntervals);
      setDialogMode('none');
      toast({ title: 'Succès', description: editingIntervalIndex !== null ? 'Période modifiée' : 'Période créée' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de l\'enregistrement';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    } finally {
      setLoading(false);
      hideLoadingOverlay();
    }
  }

  async function handleDeleteInterval() {
    try {
      setLoading(true);
      showLoadingOverlay('Suppression...');
      
      if (deleteTargetIndex === null) return;

      const interval = scheduledIntervals[deleteTargetIndex];
      const phase = getIntervalPhase(interval.startAt, interval.endAt);

      if (phase === 'active') {
        toast({ variant: 'destructive', title: 'Impossible', description: 'Impossible de supprimer une période active' });
        return;
      }

      const newIntervals = scheduledIntervals.filter((_, idx) => idx !== deleteTargetIndex);
      setEvaluationPeriodSchedule({ intervals: newIntervals });
      setScheduledIntervals(newIntervals);
      setDialogMode('none');
      setDeleteTargetIndex(null);
      toast({ title: 'Succès', description: 'Période supprimée' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la suppression';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    } finally {
      setLoading(false);
      hideLoadingOverlay();
    }
  }

  async function handleProlongPeriod(idx: number) {
    try {
      setLoading(true);
      showLoadingOverlay('Prolongation en cours...');
      
      const interval = scheduledIntervals[idx];
      const endDate = new Date(interval.endAt);
      const sessionUser = getSessionUser();
      const currentUser = sessionUser?.name || sessionUser?.email || 'Utilisateur';
      
      // Add 1 month
      endDate.setMonth(endDate.getMonth() + 1);

      const newIntervals = [...scheduledIntervals];
      newIntervals[idx] = {
        startAt: interval.startAt,
        endAt: endDate.toISOString(),
        isProlongation: true,
        createdAt: interval.createdAt,
        createdBy: interval.createdBy,
        isProlongationClosed: false,
      };

      setEvaluationPeriodSchedule({ intervals: newIntervals });
      setScheduledIntervals(newIntervals);
      toast({ title: 'Succès', description: 'Période prolongée - Sera fermée automatiquement à la fin du mois' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la prolongation';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    } finally {
      setLoading(false);
      hideLoadingOverlay();
    }
  }

  const filteredIntervals = getFilteredIntervals();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">Périodes Programmées</h1>
          <Button variant="outline" onClick={() => navigate('/admin/evaluations')}>
            ← Retour
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Gestion complète des périodes d'évaluation
        </p>
      </div>

      {/* Periods List Card */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Liste des périodes</CardTitle>
          {canManagePeriods && (
            <Button onClick={openCreateMode} size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Ajouter une période
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters Row */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Chercher une période..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterState} onValueChange={(v) => setFilterState(v as FilterState)}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="État" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  Tous ({scheduledIntervals.length})
                </SelectItem>
                <SelectItem value="upcoming">
                  À venir ({countByPhase('upcoming')})
                </SelectItem>
                <SelectItem value="active">
                  Actives ({countByPhase('active')})
                </SelectItem>
                <SelectItem value="ended">
                  Clôturées ({countByPhase('ended')})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Chargement...</p>
          ) : filteredIntervals.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Aucune période trouvée</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Période</th>
                      <th className="text-left py-3 px-4">Dates</th>
                      <th className="text-left py-3 px-4">Durée</th>
                      <th className="text-left py-3 px-4">État</th>
                      <th className="text-right py-3 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.paginatedItems.map((interval) => {
                      const phase = getIntervalPhase(interval.startAt, interval.endAt);
                      const periodName = getPeriodYearMonth(interval.startAt);
                      const realIdx = scheduledIntervals.indexOf(interval);

                      return (
                        <tr key={realIdx} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4 font-medium">{periodName}</td>
                          <td className="py-3 px-4 text-sm">{formatIntervalRange(interval.startAt, interval.endAt)}</td>
                          <td className="py-3 px-4 text-sm">
                            {Math.ceil((new Date(interval.endAt).getTime() - new Date(interval.startAt).getTime()) / (1000 * 60 * 60 * 24)) + 1} jours
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={phaseBadgeVariant(phase)}>
                              {intervalPhaseLabel(phase)}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openViewMode(realIdx)}
                              title="Voir les détails"
                            >
                              <Info className="h-4 w-4" />
                            </Button>
                            {phase !== 'active' && canManagePeriods && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditMode(realIdx)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => openDeleteMode(realIdx)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {phase === 'ended' && !interval.isProlongation && canManagePeriods && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleProlongPeriod(realIdx)}
                              >
                                Prolonger
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogMode === 'create' || dialogMode === 'edit'} onOpenChange={(open) => {
        if (!open) setDialogMode('none');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create' ? 'Créer une période' : 'Modifier la période'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Period Name Display (readonly, derived from start date) - FIRST FIELD */}
            <div>
              <label className="text-sm font-medium">Période</label>
              <div className="text-sm bg-background border border-input p-3 rounded cursor-default text-foreground font-semibold">
                {startDate ? (
                  new Date(startDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).charAt(0).toUpperCase() + new Date(startDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).slice(1)
                ) : (
                  <span className="text-muted-foreground">Sélectionnez une date de début</span>
                )}
              </div>
            </div>

            {/* Start Date */}
            <div>
              <label className="text-sm font-medium">Date de début</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const value = e.target.value;
                  setStartDate(value);
                  setFormError('');
                  // Auto-set end date to same start date initially
                  if (value && !endDate) {
                    setEndDate(value);
                  } else if (!value) {
                    setEndDate('');
                  }
                }}
                min={getMinDate()}
              />
              {!startDate && formError.includes('début') && (
                <p className="text-xs text-destructive mt-1">{formError}</p>
              )}
            </div>

            {/* End Date */}
            <div>
              <label className="text-sm font-medium">Date de fin</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setFormError('');
                }}
                min={startDate || ''}
                max={getEndDateMax()}
                disabled={!startDate}
              />
              {!endDate && startDate && (
                <p className="text-xs text-muted-foreground mt-1">Saisir une date de fin dans le même mois</p>
              )}
            </div>

            {/* Error Message */}
            {formError && (
              <div className="text-sm bg-destructive/10 border border-destructive/30 p-3 rounded text-destructive">
                {formError}
              </div>
            )}

            {/* Removed: Period name already displayed above */}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode('none')}>
              Annuler
            </Button>
            <Button onClick={handleSaveSchedule} disabled={loading}>
              {dialogMode === 'create' ? 'Créer' : 'Modifier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={dialogMode === 'delete'} onOpenChange={(open) => {
        if (!open) setDialogMode('none');
      }}>
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer la période</AlertDialogTitle>
          <p className="text-sm text-muted-foreground">
            Êtes-vous sûr ? Cette action est irréversible.
          </p>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteInterval} className="bg-destructive text-destructive-foreground">
              Supprimer
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Details Dialog (Traceability) */}
      {editingIntervalIndex !== null && scheduledIntervals[editingIntervalIndex] && (
        <Dialog open={dialogMode === 'view'} onOpenChange={(open) => {
          if (!open) setDialogMode('none');
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Détails de la période</DialogTitle>
            </DialogHeader>

            {(() => {
              const interval = scheduledIntervals[editingIntervalIndex!];
              const phase = getIntervalPhase(interval.startAt, interval.endAt);
              const createdDate = interval.createdAt ? new Date(interval.createdAt).toLocaleDateString('fr-FR', { 
                day: '2-digit', 
                month: 'long', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }) : 'Non disponible';

              return (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Période</label>
                    <p className="text-sm py-2 px-3 bg-muted rounded">{getPeriodYearMonth(interval.startAt)}</p>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Dates</label>
                    <p className="text-sm py-2 px-3 bg-muted rounded">{formatIntervalRange(interval.startAt, interval.endAt)}</p>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Durée</label>
                    <p className="text-sm py-2 px-3 bg-muted rounded">
                      {Math.ceil((new Date(interval.endAt).getTime() - new Date(interval.startAt).getTime()) / (1000 * 60 * 60 * 24)) + 1} jours
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium">État</label>
                    <div className="py-2">
                      <Badge variant={phaseBadgeVariant(phase)}>
                        {intervalPhaseLabel(phase)}
                      </Badge>
                    </div>
                  </div>

                  {interval.isProlongation && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                      <p className="text-sm font-medium text-blue-900">⏱️ Période prolongée</p>
                      <p className="text-xs text-blue-800 mt-1">
                        {interval.isProlongationClosed ? '✓ Fermée manuellement' : 'Sera fermée automatiquement à la fin du mois'}
                      </p>
                    </div>
                  )}

                  {/* Traceability Section */}
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-semibold mb-3">Traçabilité</h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Créée par:</span>
                        <span className="font-medium">{interval.createdBy || 'Utilisateur'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date de création:</span>
                        <span className="font-medium">{createdDate}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogMode('none')}>
                Fermer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
