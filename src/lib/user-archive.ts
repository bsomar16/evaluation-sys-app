/** Utilitaires archivage utilisateurs (soft delete via archived_at) */

export type UserArchiveFields = {
  archived_at?: string | null;
  is_active?: boolean | null;
};

export function isUserArchived(user: UserArchiveFields): boolean {
  return user.archived_at != null && user.archived_at !== '';
}

export function formatArchivedAt(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}
