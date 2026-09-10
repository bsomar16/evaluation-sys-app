import { getSessionUser } from '@/lib/session-user';

export type EvaluationAuditAction =
  | 'evaluation_opened'
  | 'evaluation_submitted'
  | 'evaluation_approved'
  | 'evaluation_rejected'
  | 'evaluation_status_changed';

export interface EvaluationAuditEntry {
  id: string;
  user_id: string;
  user_name: string;
  action: EvaluationAuditAction;
  at: string;
  comment?: string | null;
}

export const EVALUATION_AUDIT_ACTION_LABELS: Record<EvaluationAuditAction, string> = {
  evaluation_opened: 'Ouverture du formulaire',
  evaluation_submitted: 'Soumission',
  evaluation_approved: 'Acceptation',
  evaluation_rejected: 'Refus',
  evaluation_status_changed: 'Changement de statut',
};

export function createAuditEntry(
  action: EvaluationAuditAction,
  comment?: string | null
): EvaluationAuditEntry {
  const session = getSessionUser();
  return {
    id: crypto.randomUUID(),
    user_id: session?.id ?? 'unknown',
    user_name: session?.name ?? session?.email ?? 'Utilisateur',
    action,
    at: new Date().toISOString(),
    comment: comment?.trim() || null,
  };
}

export function appendAuditEntry(
  existing: EvaluationAuditEntry[] | undefined,
  entry: EvaluationAuditEntry
): EvaluationAuditEntry[] {
  return [...(existing ?? []), entry];
}

/** Commentaire laissé par la personne qui a approuvé l'évaluation (entrée d'audit la plus récente). */
export function getApprovalComment(entries: EvaluationAuditEntry[] | undefined): string | null {
  const approvals = (entries ?? []).filter((e) => e.action === 'evaluation_approved' && e.comment?.trim());
  if (approvals.length === 0) return null;
  const latest = approvals.reduce((a, b) => (new Date(b.at).getTime() > new Date(a.at).getTime() ? b : a));
  return latest.comment ?? null;
}

export function formatAuditDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
