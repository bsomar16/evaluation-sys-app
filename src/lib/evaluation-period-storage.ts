const STORAGE_KEY = 'hr_pulse_evaluation_period_open';
const SCHEDULE_KEY = 'hr_pulse_evaluation_period_schedule';
const EVENT_NAME = 'evaluation-period-changed';

export interface EvaluationPeriodSchedule {
  enabled: boolean;
  intervals: Array<{
    startAt: string; // ISO
    endAt: string; // ISO
  }>;
}

function defaultSchedule(): EvaluationPeriodSchedule {
  return {
    enabled: false,
    intervals: [],
  };
}

function parseSchedule(raw: string | null): EvaluationPeriodSchedule {
  if (!raw) return defaultSchedule();
  try {
    const parsed = JSON.parse(raw) as Partial<EvaluationPeriodSchedule>;
    const enabled = parsed.enabled === true;
    const intervals =
      Array.isArray(parsed.intervals) && parsed.intervals.length > 0
        ? parsed.intervals
            .map((i) => ({
              startAt: typeof i?.startAt === 'string' ? i.startAt : '',
              endAt: typeof i?.endAt === 'string' ? i.endAt : '',
            }))
            .filter((i) => i.startAt && i.endAt)
        : [];
    return { enabled, intervals };
  } catch {
    return defaultSchedule();
  }
}

function isOpenFromSchedule(schedule: EvaluationPeriodSchedule): boolean | null {
  const now = Date.now();
  if (!schedule.enabled) return null;
  const intervals = schedule.intervals ?? [];
  if (intervals.length === 0) return null;

  return intervals.some((i) => {
    const start = new Date(i.startAt).getTime();
    const end = new Date(i.endAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return false;
    // Chevauchement/présence : inclusif sur start et end
    return now >= start && now <= end;
  });
}

export function getEvaluationPeriodSchedule(): EvaluationPeriodSchedule {
  return parseSchedule(localStorage.getItem(SCHEDULE_KEY));
}

export function isEvaluationPeriodOpen(): boolean {
  const scheduleState = isOpenFromSchedule(getEvaluationPeriodSchedule());
  if (scheduleState != null) return scheduleState;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw == null) return true;
  return raw === 'true';
}

export function setEvaluationPeriodOpen(isOpen: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(isOpen));
  // Basculer manuellement désactive la programmation automatique.
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(defaultSchedule()));
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, {
      detail: { isOpen },
    })
  );
}

export function setEvaluationPeriodSchedule(schedule: EvaluationPeriodSchedule): void {
  const normalizedIntervals = Array.isArray(schedule.intervals) ? schedule.intervals : [];
  const normalizedEnabled = schedule.enabled === true && normalizedIntervals.length > 0;

  localStorage.setItem(
    SCHEDULE_KEY,
    JSON.stringify({
      enabled: normalizedEnabled,
      intervals: normalizedIntervals,
    } satisfies EvaluationPeriodSchedule)
  );

  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, {
      detail: { isOpen: isEvaluationPeriodOpen() },
    })
  );
}

export function subscribeEvaluationPeriodChange(onChange: (isOpen: boolean) => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== SCHEDULE_KEY) return;
    onChange(isEvaluationPeriodOpen());
  };

  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<{ isOpen?: boolean }>).detail;
    onChange(detail?.isOpen !== false);
  };

  const intervalId = window.setInterval(() => {
    onChange(isEvaluationPeriodOpen());
  }, 30000);

  window.addEventListener('storage', onStorage);
  window.addEventListener(EVENT_NAME, onCustom);

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EVENT_NAME, onCustom);
  };
}
