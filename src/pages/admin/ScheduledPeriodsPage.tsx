import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useRolePermissions } from '@/hooks/useRolePermissions';
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
import { Circle } from 'lucide-react';

type DialogMode = 'none' | 'create' | 'edit' | 'delete';
type FilterState = 'all' | 'upcoming' | 'active' | 'ended';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const MONTH_LABELS: Record<number, string> = {
  1: 'janvier', 2: 'février', 3: 'mars', 4: 'avril', 5: 'mai', 6: 'juin',
  7: 'juillet', 8: 'août', 9: 'septembre', 10: 'octobre', 11: 'novembre', 12: 'décembre',
};

// Helper functions
function getIntervalPhase(startAt: string, endAt: string): 'upcoming' | 'active' | 'ended' {
  const now = new Date();
  const start = new Date(startAt);
  const end = new Date(endAt);
  
  if (now < start) return 'upcoming';
  if (now > end) return 'ended';
  return 'active';
}

function intervalPhaseLabel(phase: 'upcoming' | 'active' | 'ended'): string {
  const labels: Record<string, string> = {
    upcoming: 'À venir',
    active: 'Actif',
    ended: 'Clôturé',
  };
  return labels[phase] || phase;
}

function formatIntervalRange(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  
  const dateFormat = (date: Date) => {
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  
  return `${dateFormat(start)} — ${dateFormat(end)}`;
}

export default function ScheduledPeriodsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { can } = useRolePermissions();

  // State
  const [scheduledIntervals, setScheduledIntervals] = useState(() =>
    getEvaluationPeriodSchedule().intervals ?? []
  );
  const [filterState, setFilterState] = useState<FilterState>('all');
  const [dialogMode, setDialogMode] = useState<DialogMode>('none');
  const [editingIntervalIndex, setEditingIntervalIndex] = useState<number | null>(null);
  const [deleteTargetIndex, setDeleteTargetIndex] = useState<number | null>(null);

  // Form state
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [startDay, setStartDay] = useState(1);
  const [endDay, setEndDay] = useState(getLastDayOfMonth(CURRENT_YEAR, CURRENT_MONTH));
  const [periodName, setPeriodName] = useState('');

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
    return unsubscribe;
  }, []);

  // Filter periods by state
  const filteredIntervals = scheduledIntervals.filter((interval, idx) => {
    const phase = getIntervalPhase(interval.startAt, interval.endAt);
    if (filterState === 'all') return true;
    return phase === filterState;
  });

  // Open create mode
  const openCreateMode = () => {
    setDialogMode('create');
    setEditingIntervalIndex(null);
    setSelectedYear(CURRENT_YEAR);
    setSelectedMonth(CURRENT_MONTH);
    setStartDay(1);
    setEndDay(getLastDayOfMonth(CURRENT_YEAR, CURRENT_MONTH));
  };

  // Open edit mode
  const openEditMode = (idx: number) => {
    const interval = scheduledIntervals[idx];
    if (!interval) return;
    const startDate = new Date(interval.startAt);
    const endDate = new Date(interval.endAt);
    setEditingIntervalIndex(idx);
    setSelectedYear(startDate.getFullYear());
    setSelectedMonth(startDate.getMonth() + 1);
    setStartDay(startDate.getDate());
    setEndDay(endDate.getDate());
    setDialogMode('edit');
  };

  // Open delete confirmation
  const openDeleteMode = (idx: number) => {
    setDeleteTargetIndex(idx);
    setDialogMode('delete');
  };

  // Save schedule
  const handleSaveSchedule = () => {
    const startDate = new Date(selectedYear, selectedMonth - 1, startDay, 0, 0, 0, 0);
    const endDate = new Date(selectedYear, selectedMonth - 1, endDay, 23, 59, 59, 999);
    const startAt = startDate.toISOString();
    const endAt = endDate.toISOString();

    const currentSchedule = getEvaluationPeriodSchedule();
    let updatedIntervals = [...(currentSchedule.intervals ?? [])];

    // Validation: check day ranges
    const maxDays = getLastDayOfMonth(selectedYear, selectedMonth);
    if (startDay < 1 || startDay > maxDays || endDay < 1 || endDay > maxDays) {
      toast({
        variant: 'destructive',
        title: 'Erreur de validation',
        description: `Les jours doivent être entre 1 et ${maxDays}.`,
      });
      return;
    }

    if (startDay > endDay) {
      toast({
        variant: 'destructive',
        title: 'Erreur de validation',
        description: 'Le jour de début doit être avant le jour de fin.',
      });
      return;
    }

    const periodCode = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

    // Check for duplicate month-year (except when editing the same interval)
    const isDuplicate = updatedIntervals.some((interval, idx) => {
      if (dialogMode === 'edit' && idx === editingIntervalIndex) return false;
      const intervalStart = new Date(interval.startAt);
      const intervalCode = `${intervalStart.getFullYear()}-${String(intervalStart.getMonth() + 1).padStart(2, '0')}`;
      return intervalCode === periodCode;
    });

    if (isDuplicate) {
      toast({
        variant: 'destructive',
        title: 'Doublon détecté',
        description: `Une période pour ${periodName} existe déjà.`,
      });
      return;
    }

    // Check for overlaps (except when editing)
    const hasOverlap = updatedIntervals.some((interval, idx) => {
      if (dialogMode === 'edit' && idx === editingIntervalIndex) return false;
      const existingStart = new Date(interval.startAt).getTime();
      const existingEnd = new Date(interval.endAt).getTime();
      return !(endDate.getTime() < existingStart || startDate.getTime() > existingEnd);
    });

    if (hasOverlap) {
      toast({
        variant: 'destructive',
        title: 'Chevauchement détecté',
        description: 'Cette période chevauche une autre période existante.',
      });
      return;
    }

    // Create or update interval
    if (dialogMode === 'create') {
      updatedIntervals.push({ startAt, endAt });
    } else if (dialogMode === 'edit' && editingIntervalIndex !== null) {
      const existing = updatedIntervals[editingIntervalIndex];
      updatedIntervals[editingIntervalIndex] = {
        ...existing,
        startAt,
        endAt,
      };
    }

    // Sort by start date
    updatedIntervals.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

    // Save and update
    setEvaluationPeriodSchedule({ enabled: true, intervals: updatedIntervals });
    setScheduledIntervals(updatedIntervals);
    setDialogMode('none');

    const action = dialogMode === 'create' ? 'créée' : 'modifiée';
    toast({
      title: 'Succès',
      description: `Période ${action} et enregistrée.`,
    });
  };

  // Delete interval
  const handleDeleteInterval = (idx: number) => {
    const interval = scheduledIntervals[idx];
    if (!interval) return;

    const phase = getIntervalPhase(interval.startAt, interval.endAt);
    if (phase !== 'upcoming') {
      toast({
        variant: 'destructive',
        title: 'Suppression impossible',
        description: 'Seules les périodes à venir peuvent être supprimées.',
      });
      return;
    }

    const currentSchedule = getEvaluationPeriodSchedule();
    const updatedIntervals = [...(currentSchedule.intervals ?? [])];
    updatedIntervals.splice(idx, 1);

    setEvaluationPeriodSchedule({ enabled: true, intervals: updatedIntervals });
    setScheduledIntervals(updatedIntervals);
    setDialogMode('none');

    toast({
      title: 'Période supprimée',
      description: 'La période a été supprimée avec succès.',
    });
  };

  // Prolong period
  const handleProlongPeriod = (idx: number) => {
    const schedule = getEvaluationPeriodSchedule();
    const target = schedule.intervals?.[idx];
    if (!target) return;

    const phase = getIntervalPhase(target.startAt, target.endAt);
    if (phase !== 'ended') {
      toast({
        variant: 'destructive',
        title: 'Prolongation impossible',
        description: 'Seules les périodes clôturées peuvent être prolongées.',
      });
      return;
    }

    const endDate = new Date(target.endAt);
    endDate.setMonth(endDate.getMonth() + 1);
    const newEndAt = endDate.toISOString();

    const updatedIntervals = [...(schedule.intervals ?? [])];
    updatedIntervals[idx] = { ...target, endAt: newEndAt, isProlongation: true };

    setEvaluationPeriodSchedule({ enabled: true, intervals: updatedIntervals });
    setScheduledIntervals(updatedIntervals);

    toast({
      title: 'Période prolongée',
      description: 'La période a été rouverte et prolongée d\'un mois.',
    });
  };

  const canEdit = can('manage_evaluation_periods');

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Périodes Programmées</h1>
            <p className="text-muted-foreground mt-1">Gestion complète des périodes d'évaluation</p>
          </div>
          <Button onClick={() => navigate(-1)} variant="outline">
            ← Retour
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <Button
            variant={filterState === 'all' ? 'default' : 'outline'}
            onClick={() => setFilterState('all')}
            size="sm"
          >
            Tous ({scheduledIntervals.length})
          </Button>
          <Button
            variant={filterState === 'upcoming' ? 'default' : 'outline'}
            onClick={() => setFilterState('upcoming')}
            size="sm"
          >
            À venir ({scheduledIntervals.filter((i) => getIntervalPhase(i.startAt, i.endAt) === 'upcoming').length})
          </Button>
          <Button
            variant={filterState === 'active' ? 'default' : 'outline'}
            onClick={() => setFilterState('active')}
            size="sm"
          >
            Actives ({scheduledIntervals.filter((i) => getIntervalPhase(i.startAt, i.endAt) === 'active').length})
          </Button>
          <Button
            variant={filterState === 'ended' ? 'default' : 'outline'}
            onClick={() => setFilterState('ended')}
            size="sm"
          >
            Clôturées ({scheduledIntervals.filter((i) => getIntervalPhase(i.startAt, i.endAt) === 'ended').length})
          </Button>
        </div>

        {/* Action Button */}
        {canEdit && (
          <div className="mb-6">
            <Button onClick={openCreateMode} className="gap-2">
              + Ajouter une période
            </Button>
          </div>
        )}

        {/* Periods List */}
        <div className="space-y-3">
          {filteredIntervals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucune période trouvée pour ce filtre.
            </div>
          ) : (
            filteredIntervals.map((interval, idx) => {
              const globalIdx = scheduledIntervals.indexOf(interval);
              const phase = getIntervalPhase(interval.startAt, interval.endAt);
              const periodDesc = describeEvaluationPeriodCode(
                `${new Date(interval.startAt).getFullYear()}-${String(new Date(interval.startAt).getMonth() + 1).padStart(2, '0')}`
              );

              return (
                <div
                  key={globalIdx}
                  className="border rounded-lg p-4 bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <Circle
                        className={`h-4 w-4 shrink-0 fill-current ${
                          phase === 'active'
                            ? 'text-green-600'
                            : phase === 'ended'
                              ? 'text-red-600'
                              : 'text-blue-500'
                        }`}
                      />
                      <div className="flex-1">
                        <p className="font-semibold text-base">{periodDesc}</p>
                        <p className="text-xs text-muted-foreground">{formatIntervalRange(interval.startAt, interval.endAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {interval.isProlongation && <Badge variant="secondary">✓ Prolongation</Badge>}
                      <Badge
                        variant={
                          phase === 'active' ? 'default' : phase === 'ended' ? 'destructive' : 'outline'
                        }
                      >
                        {intervalPhaseLabel(phase)}
                      </Badge>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 justify-end flex-wrap mt-3">
                    {canEdit ? (
                      phase === 'upcoming' ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openEditMode(globalIdx)}>
                            ✎ Modifier
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => openDeleteMode(globalIdx)}
                          >
                            🗑 Supprimer
                          </Button>
                        </>
                      ) : phase === 'ended' ? (
                        <Button size="sm" variant="default" onClick={() => handleProlongPeriod(globalIdx)}>
                          🔄 Prolonger
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">En cours - Non modifiable</span>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">Lecture seule</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogMode === 'create' || dialogMode === 'edit'} onOpenChange={(open) => {
        if (!open) setDialogMode('none');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create' ? 'Ajouter une période' : 'Modifier une période'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Year and Month Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Année</label>
                <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027, 2028].map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Mois</label>
                <Select value={String(selectedMonth)} onValueChange={(val) => setSelectedMonth(Number(val))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MONTH_LABELS).map(([num, label]) => (
                      <SelectItem key={num} value={num}>
                        {label.charAt(0).toUpperCase() + label.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Period Name (Read-only) */}
            <div>
              <label className="text-sm font-medium">Période</label>
              <Input value={periodName} readOnly className="bg-muted" />
            </div>

            {/* Day Range Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Jour de début</label>
                <Input
                  type="number"
                  min={1}
                  max={getLastDayOfMonth(selectedYear, selectedMonth)}
                  value={startDay}
                  onChange={(e) => setStartDay(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Jour de fin</label>
                <Input
                  type="number"
                  min={1}
                  max={getLastDayOfMonth(selectedYear, selectedMonth)}
                  value={endDay}
                  onChange={(e) => setEndDay(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode('none')}>
              Annuler
            </Button>
            <Button onClick={handleSaveSchedule}>
              {dialogMode === 'create' ? '✓ Enregistrer' : '💾 Mettre à jour'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={dialogMode === 'delete'} onOpenChange={(open) => {
        if (!open) setDialogMode('none');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Êtes-vous sûr de vouloir supprimer cette période ? Cette action est irréversible.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode('none')}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTargetIndex !== null) {
                  handleDeleteInterval(deleteTargetIndex);
                }
              }}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
