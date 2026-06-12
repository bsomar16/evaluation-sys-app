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
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

type DialogMode = 'none' | 'create' | 'edit' | 'delete';
type FilterState = 'all' | 'upcoming' | 'active' | 'ended';
type IntervalPhase = 'upcoming' | 'active' | 'ended';

interface Interval {
  startAt: string;
  endAt: string;
  isProlongation?: boolean;
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
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [startDay, setStartDay] = useState(1);
  const [endDay, setEndDay] = useState(getLastDayOfMonth(CURRENT_YEAR, CURRENT_MONTH));
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

  // Update period name when month changes
  useEffect(() => {
    const code = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    const desc = describeEvaluationPeriodCode(code) || '';
    setPeriodName(desc);
  }, [selectedYear, selectedMonth]);

  // Subscribe to period changes
  useEffect(() => {
    const unsubscribe = subscribeEvaluationPeriodChange(() => {
      const schedule = getEvaluationPeriodSchedule();
      setScheduledIntervals(schedule.intervals ?? []);
    });
    return () => unsubscribe?.();
  }, []);

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
    setSelectedYear(CURRENT_YEAR);
    setSelectedMonth(CURRENT_MONTH);
    setStartDay(1);
    setEndDay(getLastDayOfMonth(CURRENT_YEAR, CURRENT_MONTH));
    setEditingIntervalIndex(null);
    setDialogMode('create');
  }

  function openEditMode(idx: number) {
    const interval = scheduledIntervals[idx];
    const startDate = new Date(interval.startAt);
    const endDate = new Date(interval.endAt);
    
    setSelectedYear(startDate.getFullYear());
    setSelectedMonth(startDate.getMonth() + 1);
    setStartDay(startDate.getDate());
    setEndDay(endDate.getDate());
    setEditingIntervalIndex(idx);
    setDialogMode('edit');
  }

  function openDeleteMode(idx: number) {
    setDeleteTargetIndex(idx);
    setDialogMode('delete');
  }

  async function handleSaveSchedule() {
    try {
      setLoading(true);
      showLoadingOverlay('Enregistrement...');
      
      const startAt = new Date(selectedYear, selectedMonth - 1, startDay);
      const endAt = new Date(selectedYear, selectedMonth - 1, endDay);
      
      startAt.setHours(0, 0, 0, 0);
      endAt.setHours(23, 59, 59, 999);

      // Validation
      if (startAt > endAt) {
        toast({ variant: 'destructive', title: 'Erreur', description: 'Date de début doit être avant la fin' });
        return;
      }

      let newIntervals = [...scheduledIntervals];

      if (editingIntervalIndex !== null) {
        // Update existing
        newIntervals[editingIntervalIndex] = {
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        };
      } else {
        // Create new
        // Check for duplicates
        for (const interval of newIntervals) {
          const iStart = new Date(interval.startAt);
          const iStartMonth = iStart.getMonth() + 1;
          const iStartYear = iStart.getFullYear();
          
          if (iStartYear === selectedYear && iStartMonth === selectedMonth) {
            toast({ variant: 'destructive', title: 'Erreur', description: 'Une période existe déjà pour ce mois' });
            return;
          }
        }

        newIntervals.push({
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
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
      
      // Add 1 month
      endDate.setMonth(endDate.getMonth() + 1);

      const newIntervals = [...scheduledIntervals];
      newIntervals[idx] = {
        startAt: interval.startAt,
        endAt: endDate.toISOString(),
        isProlongation: true,
      };

      setEvaluationPeriodSchedule({ intervals: newIntervals });
      setScheduledIntervals(newIntervals);
      toast({ title: 'Succès', description: 'Période prolongée' });
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
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Liste des périodes</CardTitle>
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
                          <td className="py-3 px-4">
                            <Badge variant={phaseBadgeVariant(phase)}>
                              {intervalPhaseLabel(phase)}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
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

      {/* Add Button Below Card */}
      {canManagePeriods && (
        <div className="flex justify-end">
          <Button onClick={openCreateMode} className="gap-2">
            <Plus className="h-4 w-4" />
            Ajouter une période
          </Button>
        </div>
      )}

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
            {/* Year Select */}
            <div>
              <label className="text-sm font-medium">Année</label>
              <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2].map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Month Select */}
            <div>
              <label className="text-sm font-medium">Mois</label>
              <Select value={String(selectedMonth)} onValueChange={(v) => {
                const month = Number(v);
                setSelectedMonth(month);
                setEndDay(getLastDayOfMonth(selectedYear, month));
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {MONTH_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Day Range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Jour de début</label>
                <Input
                  type="number"
                  min="1"
                  max={getLastDayOfMonth(selectedYear, selectedMonth)}
                  value={startDay}
                  onChange={(e) => setStartDay(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Jour de fin</label>
                <Input
                  type="number"
                  min="1"
                  max={getLastDayOfMonth(selectedYear, selectedMonth)}
                  value={endDay}
                  onChange={(e) => setEndDay(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Period Name Display */}
            {periodName && (
              <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
                Période: <span className="font-medium">{periodName}</span>
              </div>
            )}
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
    </div>
  );
}
