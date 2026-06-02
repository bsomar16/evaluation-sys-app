import { supabase } from '@/integrations/supabase/client';
import { isUserArchived } from '@/lib/user-archive';

export async function archiveUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({
      archived_at: new Date().toISOString(),
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;
}

export async function restoreUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({
      archived_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;
}

export async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;
}

export function partitionUsersByArchive<T extends { archived_at?: string | null }>(
  users: T[]
): { active: T[]; archived: T[] } {
  const active: T[] = [];
  const archived: T[] = [];
  for (const user of users) {
    if (isUserArchived(user)) archived.push(user);
    else active.push(user);
  }
  return { active, archived };
}
