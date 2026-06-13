import { useEffect, useState } from 'react';
import {
  getAllEvaluationPeriods,
  getActiveEvaluationPeriods,
  getCurrentOpenPeriod,
  subscribeToAllPeriodChanges,
  type EvaluationPeriod,
  type EvaluationPeriodInterval,
} from '@/lib/evaluation-period-db';

export function useEvaluationPeriods() {
  const [periods, setPeriods] = useState<EvaluationPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      try {
        const allPeriods = await getAllEvaluationPeriods();
        setPeriods(allPeriods);

        // Subscribe to real-time changes
        unsubscribe = subscribeToAllPeriodChanges((updatedPeriods) => {
          setPeriods(updatedPeriods);
        });
      } catch (error) {
        console.error('Error fetching evaluation periods:', error);
        setPeriods([]);
      } finally {
        setLoading(false);
      }
    };

    init();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return { periods, loading };
}

export function useActivePeriods() {
  const [periods, setPeriods] = useState<EvaluationPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      try {
        const activePeriods = await getActiveEvaluationPeriods();
        setPeriods(activePeriods);

        // Subscribe to real-time changes
        unsubscribe = subscribeToAllPeriodChanges((allPeriods) => {
          // Filter active ones
          const active = allPeriods.filter((p) => p.is_active);
          setPeriods(active);
        });
      } catch (error) {
        console.error('Error fetching active periods:', error);
        setPeriods([]);
      } finally {
        setLoading(false);
      }
    };

    init();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return { periods, loading };
}

export function useCurrentOpenPeriod() {
  const [period, setPeriod] = useState<(EvaluationPeriod & { intervals: EvaluationPeriodInterval[] }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      try {
        const openPeriod = await getCurrentOpenPeriod();
        setPeriod(openPeriod);

        // Subscribe to real-time changes
        unsubscribe = subscribeToAllPeriodChanges(async (allPeriods) => {
          // Get the current open period
          for (const p of allPeriods) {
            if (p.is_active) {
              const openPeriod = await getCurrentOpenPeriod();
              setPeriod(openPeriod);
              break;
            }
          }
        });
      } catch (error) {
        console.error('Error fetching current open period:', error);
        setPeriod(null);
      } finally {
        setLoading(false);
      }
    };

    init();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Check if period is currently open
  const isOpen = period && period.intervals.some((interval) => {
    const now = new Date();
    const start = new Date(interval.start_at);
    const end = new Date(interval.end_at);
    return now >= start && now <= end && !interval.is_prolongation_closed;
  });

  return { period, isOpen: !!isOpen, loading };
}
