import { supabase } from '@/integrations/supabase/client';
import type { Lang } from '@/lib/i18n/translations';

export interface RejectionReasonRecord {
  id: string;
  label_fr: string;
  label_ar: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string | null;
}

const STORAGE_KEY = 'hr_pulse_rejection_reasons';

const DEFAULT_REASONS: RejectionReasonRecord[] = [
  { id: 'default-1', label_fr: 'Score insuffisant', label_ar: 'نتيجة غير كافية', is_active: true, sort_order: 1 },
  { id: 'default-2', label_fr: 'Données manquantes', label_ar: 'بيانات ناقصة', is_active: true, sort_order: 2 },
  { id: 'default-3', label_fr: 'Erreur de saisie', label_ar: 'خطأ في الإدخال', is_active: true, sort_order: 3 },
  { id: 'default-4', label_fr: 'Critères non atteints', label_ar: 'المعايير غير مستوفاة', is_active: true, sort_order: 4 },
];

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST116' || error.code === '42P01' || /does not exist/i.test(error.message ?? '');
}

function loadFromLocal(): RejectionReasonRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_REASONS];
    const parsed = JSON.parse(raw) as RejectionReasonRecord[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULT_REASONS];
  } catch {
    return [...DEFAULT_REASONS];
  }
}

function saveToLocal(reasons: RejectionReasonRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reasons));
}

/** Libellé du motif dans la langue courante (repli sur le français si l'arabe est vide). */
export function getRejectionReasonLabel(reason: Pick<RejectionReasonRecord, 'label_fr' | 'label_ar'>, lang: Lang): string {
  if (lang === 'ar' && reason.label_ar?.trim()) return reason.label_ar;
  return reason.label_fr;
}

export async function fetchRejectionReasons(): Promise<RejectionReasonRecord[]> {
  const { data, error } = await supabase
    .from('rejection_reasons')
    .select('id, label_fr, label_ar, is_active, sort_order, created_at')
    .order('sort_order', { ascending: true });

  if (error && isMissingTableError(error)) {
    return loadFromLocal();
  }
  if (error) throw error;
  if (!data?.length) return [];
  return data as RejectionReasonRecord[];
}

export async function fetchActiveRejectionReasons(): Promise<RejectionReasonRecord[]> {
  const all = await fetchRejectionReasons();
  return all.filter((r) => r.is_active !== false);
}

export async function upsertRejectionReason(
  reason: Omit<RejectionReasonRecord, 'id'> & { id?: string }
): Promise<RejectionReasonRecord> {
  const payload = {
    label_fr: reason.label_fr.trim(),
    label_ar: reason.label_ar?.trim() || null,
    is_active: reason.is_active,
    sort_order: reason.sort_order,
  };

  const query = reason.id
    ? supabase.from('rejection_reasons').update(payload).eq('id', reason.id).select().single()
    : supabase.from('rejection_reasons').insert([payload]).select().single();

  const { data, error } = await query;

  if (error && isMissingTableError(error)) {
    const local = loadFromLocal();
    const saved: RejectionReasonRecord = {
      id: reason.id ?? crypto.randomUUID(),
      label_fr: payload.label_fr,
      label_ar: payload.label_ar,
      is_active: payload.is_active,
      sort_order: payload.sort_order,
    };
    const next = reason.id ? local.map((r) => (r.id === reason.id ? saved : r)) : [...local, saved];
    saveToLocal(next);
    return saved;
  }
  if (error) throw error;
  return data as RejectionReasonRecord;
}

export async function deleteRejectionReason(id: string): Promise<void> {
  const { error } = await supabase.from('rejection_reasons').delete().eq('id', id);
  if (error && !isMissingTableError(error)) throw error;
  saveToLocal(loadFromLocal().filter((r) => r.id !== id));
}

export async function setRejectionReasonActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('rejection_reasons').update({ is_active: isActive }).eq('id', id);
  if (error && !isMissingTableError(error)) throw error;
  saveToLocal(loadFromLocal().map((r) => (r.id === id ? { ...r, is_active: isActive } : r)));
}
