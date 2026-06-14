import { supabase } from '@/integrations/supabase/client';

export interface EvaluationPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  description?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface EvaluationPeriodInterval {
  id: string;
  period_id: string;
  start_at: string;
  end_at: string;
  is_prolongation: boolean;
  is_prolongation_closed: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Get all evaluation periods from database
 */
export async function getAllEvaluationPeriods(): Promise<EvaluationPeriod[]> {
  try {
    console.log('getAllEvaluationPeriods called');
    
    const { data, error } = await supabase
      .from('evaluation_periods')
      .select('*')
      .order('start_date', { ascending: false });

    console.log('getAllEvaluationPeriods - Supabase response:', { data, error });

    if (error) {
      console.error('Error fetching evaluation periods:', error);
      return [];
    }

    console.log('Returning data:', data);
    return data || [];
  } catch (err) {
    console.error('Exception fetching evaluation periods:', err);
    return [];
  }
}

/**
 * Get active evaluation periods
 */
export async function getActiveEvaluationPeriods(): Promise<EvaluationPeriod[]> {
  try {
    const { data, error } = await supabase
      .from('evaluation_periods')
      .select('*')
      .eq('is_active', true)
      .order('start_date', { ascending: false });

    if (error) {
      console.error('Error fetching active periods:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Exception fetching active periods:', err);
    return [];
  }
}

/**
 * Get a specific period by ID
 */
export async function getEvaluationPeriodById(id: string): Promise<EvaluationPeriod | null> {
  try {
    const { data, error } = await supabase
      .from('evaluation_periods')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching period:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception fetching period:', err);
    return null;
  }
}

/**
 * Get a period by name
 */
export async function getEvaluationPeriodByName(name: string): Promise<EvaluationPeriod | null> {
  try {
    const { data, error } = await supabase
      .from('evaluation_periods')
      .select('*')
      .eq('name', name)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching period by name:', error);
      return null;
    }

    return data || null;
  } catch (err) {
    console.error('Exception fetching period by name:', err);
    return null;
  }
}

/**
 * Create a new evaluation period
 */
export async function createEvaluationPeriod(
  name: string,
  start_date: string,
  end_date: string,
  description?: string,
  created_by?: string,
  is_active?: boolean
): Promise<EvaluationPeriod | null> {
  try {
    const { data, error } = await supabase
      .from('evaluation_periods')
      .insert({
        name,
        start_date,
        end_date,
        is_active: is_active ?? true,
        description,
        created_by,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating period:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception creating period:', err);
    return null;
  }
}

/**
 * Update an evaluation period
 */
export async function updateEvaluationPeriod(
  id: string,
  updates: Partial<EvaluationPeriod>
): Promise<EvaluationPeriod | null> {
  try {
    const { data, error } = await supabase
      .from('evaluation_periods')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating period:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception updating period:', err);
    return null;
  }
}

/**
 * Delete an evaluation period
 */
export async function deleteEvaluationPeriod(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('evaluation_periods')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting period:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Exception deleting period:', err);
    return false;
  }
}

/**
 * Get all intervals for a period
 */
export async function getPeriodIntervals(period_id: string): Promise<EvaluationPeriodInterval[]> {
  try {
    const { data, error } = await supabase
      .from('evaluation_period_intervals')
      .select('*')
      .eq('period_id', period_id)
      .order('start_at', { ascending: true });

    if (error) {
      console.error('Error fetching period intervals:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Exception fetching period intervals:', err);
    return [];
  }
}

/**
 * Get active intervals for a period (not prolongation_closed)
 */
export async function getActivePeriodIntervals(period_id: string): Promise<EvaluationPeriodInterval[]> {
  try {
    const { data, error } = await supabase
      .from('evaluation_period_intervals')
      .select('*')
      .eq('period_id', period_id)
      .eq('is_prolongation_closed', false)
      .order('start_at', { ascending: true });

    if (error) {
      console.error('Error fetching active intervals:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Exception fetching active intervals:', err);
    return [];
  }
}

/**
 * Create a new interval for a period
 */
export async function createPeriodInterval(
  period_id: string,
  start_at: string,
  end_at: string,
  is_prolongation: boolean = false,
  created_by?: string
): Promise<EvaluationPeriodInterval | null> {
  try {
    const { data, error } = await supabase
      .from('evaluation_period_intervals')
      .insert({
        period_id,
        start_at,
        end_at,
        is_prolongation,
        is_prolongation_closed: false,
        created_by,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating interval:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception creating interval:', err);
    return null;
  }
}

/**
 * Update a period interval
 */
export async function updatePeriodInterval(
  id: string,
  updates: Partial<EvaluationPeriodInterval>
): Promise<EvaluationPeriodInterval | null> {
  try {
    const { data, error } = await supabase
      .from('evaluation_period_intervals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating interval:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception updating interval:', err);
    return null;
  }
}

/**
 * Delete a period interval
 */
export async function deletePeriodInterval(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('evaluation_period_intervals')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting interval:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Exception deleting interval:', err);
    return false;
  }
}

/**
 * Check if a period is currently open (any active interval is ongoing)
 */
export async function isPeriodOpen(period_id: string): Promise<boolean> {
  try {
    const intervals = await getActivePeriodIntervals(period_id);
    const now = new Date();

    return intervals.some((interval) => {
      const start = new Date(interval.start_at);
      const end = new Date(interval.end_at);
      return now >= start && now <= end;
    });
  } catch (err) {
    console.error('Exception checking if period is open:', err);
    return false;
  }
}

/**
 * Get the current open period (if any)
 */
export async function getCurrentOpenPeriod(): Promise<(EvaluationPeriod & { intervals: EvaluationPeriodInterval[] }) | null> {
  try {
    const periods = await getActiveEvaluationPeriods();
    const now = new Date();

    for (const period of periods) {
      const intervals = await getActivePeriodIntervals(period.id);
      const isOpen = intervals.some((interval) => {
        const start = new Date(interval.start_at);
        const end = new Date(interval.end_at);
        return now >= start && now <= end;
      });

      if (isOpen) {
        return {
          ...period,
          intervals,
        };
      }
    }

    return null;
  } catch (err) {
    console.error('Exception getting current open period:', err);
    return null;
  }
}


/**
 * Migrate evaluation period schedule from localStorage to database
 * Creates period entries for each month based on localStorage intervals
 * Run once on app startup to move legacy data to new database structure
 */
export async function migratePeriodScheduleToDatabase(): Promise<void> {
  try {
    // Check if migration already done
    const migrationKey = 'hr_pulse_period_migration_done';
    if (localStorage.getItem(migrationKey) === 'true') {
      console.log('Period migration already completed');
      return;
    }

    const scheduleKey = 'hr_pulse_evaluation_period_schedule';
    const rawSchedule = localStorage.getItem(scheduleKey);

    if (!rawSchedule) {
      // No localStorage data to migrate
      localStorage.setItem(migrationKey, 'true');
      return;
    }

    try {
      const schedule = JSON.parse(rawSchedule) as {
        enabled?: boolean;
        intervals?: Array<{ startAt: string; endAt: string; isProlongation?: boolean; createdBy?: string; createdAt?: string }>;
      };

      if (!schedule.enabled || !Array.isArray(schedule.intervals) || schedule.intervals.length === 0) {
        localStorage.setItem(migrationKey, 'true');
        return;
      }

      // Get current user for created_by field
      const userData = localStorage.getItem('user');
      const createdBy = userData ? JSON.parse(userData).id : 'system';

      // Group intervals by month/year to create period entries
      const monthMap = new Map<string, typeof schedule.intervals[0][]>();
      const monthLabels: Record<number, string> = {
        1: 'janvier', 2: 'février', 3: 'mars', 4: 'avril', 5: 'mai', 6: 'juin',
        7: 'juillet', 8: 'août', 9: 'septembre', 10: 'octobre', 11: 'novembre', 12: 'décembre',
      };

      for (const interval of schedule.intervals) {
        const date = new Date(interval.startAt);
        const monthNum = date.getMonth() + 1;
        const year = date.getFullYear();
        const monthKey = `${year}-${String(monthNum).padStart(2, '0')}`;
        
        if (!monthMap.has(monthKey)) {
          monthMap.set(monthKey, []);
        }
        monthMap.get(monthKey)!.push(interval);
      }

      // Create period for each month
      for (const [monthKey, intervals] of monthMap.entries()) {
        const [yearStr, monthStr] = monthKey.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        const monthName = monthLabels[month];
        const periodName = `${monthName} ${year}`;

        // Check if period already exists
        let period = await getEvaluationPeriodByName(periodName);

        if (!period) {
          // Create new period
          const firstDate = new Date(intervals[0].startAt);
          const lastDate = new Date(intervals[intervals.length - 1].endAt);
          
          // Check if this is the current month
          const now = new Date();
          const isCurrentMonth = now.getMonth() === month - 1 && now.getFullYear() === year;

          period = await createEvaluationPeriod(
            periodName,
            firstDate.toISOString().split('T')[0], // YYYY-MM-DD format
            lastDate.toISOString().split('T')[0],
            `Period for ${monthName} ${year}`,
            createdBy,
            isCurrentMonth // is_active = true for current month
          );
        }

        if (!period) {
          console.error(`Failed to create period for ${periodName}`);
          continue;
        }

        // Create intervals for this period
        for (const interval of intervals) {
          const existing = await getPeriodIntervals(period.id);
          const isDuplicate = existing.some(
            (e) =>
              new Date(e.start_at).getTime() === new Date(interval.startAt).getTime() &&
              new Date(e.end_at).getTime() === new Date(interval.endAt).getTime()
          );

          if (!isDuplicate) {
            await createPeriodInterval(
              period.id,
              new Date(interval.startAt),
              new Date(interval.endAt),
              interval.isProlongation ?? false,
              false,
              createdBy
            );
          }
        }
      }

      // Mark migration as done
      localStorage.setItem(migrationKey, 'true');
      console.log('Period migration completed successfully - created periods for', monthMap.size, 'months');
    } catch (parseErr) {
      console.error('Failed to parse localStorage schedule:', parseErr);
      localStorage.setItem(migrationKey, 'true');
    }
  } catch (err) {
    console.error('Exception during period migration:', err);
  }
}

/**
 * Subscribe to period changes (real-time updates)
 */
export function subscribeToPeriodChanges(
  periodId: string,
  callback: (period: EvaluationPeriod | null) => void
) {
  return supabase
    .channel(`evaluation_periods:${periodId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'evaluation_periods',
        filter: `id=eq.${periodId}`,
      },
      (payload: any) => {
        callback(payload.new);
      }
    )
    .subscribe();
}

/**
 * Subscribe to all period changes
 */
export function subscribeToAllPeriodChanges(
  callback: (periods: EvaluationPeriod[]) => void
): (() => void) {
  const channel = supabase
    .channel('evaluation_periods_changes_' + Date.now())
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'evaluation_periods',
      },
      async () => {
        try {
          const periods = await getAllEvaluationPeriods();
          callback(periods);
        } catch (error) {
          console.error('Error in subscription callback:', error);
        }
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel);
  };
}
