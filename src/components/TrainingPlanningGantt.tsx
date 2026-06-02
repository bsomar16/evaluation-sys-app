import { useMemo } from 'react';
import {
  addDays,
  differenceInCalendarDays,
  format,
  isValid,
  max as maxDate,
  min as minDate,
  startOfDay,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { TrainingRequestRecord, TrainingStatus } from '@/lib/training-types';
import { TRAINING_STATUS_LABELS } from '@/lib/training-types';

export interface GanttBar {
  id: string;
  label: string;
  sublabel: string;
  start: Date;
  end: Date;
  status: TrainingStatus;
}

function parsePlanningDate(value?: string): Date | null {
  if (!value?.trim()) return null;
  const d = startOfDay(new Date(value.trim()));
  return isValid(d) ? d : null;
}

export interface AwaitingPlanningItem {
  id: string;
  label: string;
  sublabel: string;
}

export function buildGanttBars(rows: TrainingRequestRecord[]): {
  scheduled: GanttBar[];
  awaiting: AwaitingPlanningItem[];
} {
  const scheduled: GanttBar[] = [];
  const awaiting: AwaitingPlanningItem[] = [];

  for (const row of rows) {
    const label = row.course_name || 'Formation';
    const sublabel = row.employee_name || row.employee_email || '—';
    const start = parsePlanningDate(row.planning_details.date_debut);
    const endRaw = parsePlanningDate(row.planning_details.date_fin);

    if (row.status === 'approved') {
      awaiting.push({ id: row.id, label, sublabel });
      continue;
    }

    if (row.status !== 'planned' && row.status !== 'completed') continue;
    if (!start) continue;
    const end = endRaw && endRaw >= start ? endRaw : addDays(start, 1);

    scheduled.push({
      id: row.id,
      label,
      sublabel,
      start,
      end,
      status: row.status,
    });
  }

  scheduled.sort((a, b) => a.start.getTime() - b.start.getTime());
  awaiting.sort((a, b) => a.label.localeCompare(b.label, 'fr'));

  return { scheduled, awaiting };
}

function barColor(status: TrainingStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500';
    case 'planned':
      return 'bg-sky-500';
    case 'approved':
      return 'bg-amber-400';
    default:
      return 'bg-muted-foreground';
  }
}

interface TrainingPlanningGanttProps {
  scheduled: GanttBar[];
  awaiting?: AwaitingPlanningItem[];
  className?: string;
}

export function TrainingPlanningGantt({ scheduled, awaiting = [], className }: TrainingPlanningGanttProps) {
  const { rangeStart, rangeEnd, totalDays, monthTicks } = useMemo(() => {
    const allDates = scheduled.flatMap((b) => [b.start, b.end]);
    const fallbackStart = startOfDay(new Date());
    const start = allDates.length ? minDate(allDates) : fallbackStart;
    const end = allDates.length ? maxDate(allDates) : addDays(fallbackStart, 90);
    const paddedStart = addDays(start, -7);
    const paddedEnd = addDays(end, 14);
    const days = Math.max(differenceInCalendarDays(paddedEnd, paddedStart) + 1, 1);

    const ticks: { label: string; offsetPct: number }[] = [];
    const cursor = new Date(paddedStart);
    cursor.setDate(1);
    while (cursor <= paddedEnd) {
      const offsetPct = (differenceInCalendarDays(cursor, paddedStart) / days) * 100;
      ticks.push({
        label: format(cursor, 'MMM yyyy', { locale: fr }),
        offsetPct: Math.min(100, Math.max(0, offsetPct)),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return {
      rangeStart: paddedStart,
      rangeEnd: paddedEnd,
      totalDays: days,
      monthTicks: ticks,
    };
  }, [scheduled]);

  const positionBar = (bar: GanttBar) => {
    const startOffset = differenceInCalendarDays(bar.start, rangeStart);
    const duration = Math.max(differenceInCalendarDays(bar.end, bar.start) + 1, 1);
    const left = (startOffset / totalDays) * 100;
    const width = (duration / totalDays) * 100;
    return { left: `${left}%`, width: `${Math.max(width, 0.8)}%` };
  };

  if (scheduled.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground py-4 text-center">
          Aucune formation planifiée avec dates de début. Renseignez les dates depuis la page Planification.
        </p>
        {awaiting.length > 0 && <AwaitingList items={awaiting} />}
      </div>
    );
  }

  const renderRow = (bar: GanttBar) => {
    const pos = positionBar(bar);
    return (
      <div
        key={bar.id}
        className="grid grid-cols-[minmax(180px,240px)_1fr] gap-3 items-center border-b border-border/60 py-2.5 last:border-0"
      >
        <div className="min-w-0 pr-2">
          <p className="text-sm font-medium truncate" title={bar.label}>
            {bar.label}
          </p>
          <p className="text-xs text-muted-foreground truncate">{bar.sublabel}</p>
        </div>
        <div className="relative h-9 rounded-md bg-muted/30 overflow-hidden">
          {monthTicks.map((t) => (
            <div
              key={`${bar.id}-${t.label}`}
              className="absolute top-0 bottom-0 border-l border-border/40"
              style={{ left: `${t.offsetPct}%` }}
            />
          ))}
          <div
            className={cn('absolute top-1.5 bottom-1.5 rounded-md shadow-sm', barColor(bar.status))}
            style={pos}
            title={`${format(bar.start, 'dd/MM/yyyy')} → ${format(bar.end, 'dd/MM/yyyy')} · ${TRAINING_STATUS_LABELS[bar.status]}`}
          />
        </div>
      </div>
    );
  };

  return (
    <div className={cn('space-y-6', className)}>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[minmax(180px,240px)_1fr] gap-3 mb-2">
            <div className="text-xs font-medium text-muted-foreground">Formation</div>
            <div className="relative h-6">
              {monthTicks.map((t) => (
                <span
                  key={t.label}
                  className="absolute text-[10px] text-muted-foreground -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${t.offsetPct}%` }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          </div>

          <div>{scheduled.map((bar) => renderRow(bar))}</div>
        </div>
      </div>

      {awaiting.length > 0 && <AwaitingList items={awaiting} />}

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-6 rounded bg-sky-500" /> Planifiée
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-6 rounded bg-emerald-500" /> Terminée
        </span>
      </div>
    </div>
  );
}

function AwaitingList({ items }: { items: AwaitingPlanningItem[] }) {
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
        Acceptées — à planifier ({items.length})
      </p>
      <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
        {items.map((item) => (
          <li key={item.id} className="flex justify-between gap-2 text-muted-foreground">
            <span className="truncate font-medium text-foreground">{item.label}</span>
            <span className="truncate shrink-0">{item.sublabel}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
