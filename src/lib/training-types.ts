export type TrainingStatus = 'pending' | 'approved' | 'rejected' | 'planned' | 'completed';

export interface TrainingRequestDetails {
  problematique?: string;
  source_besoin?: string;
  objectif?: string;
  domaine?: string;
  type_competence?: string;
  priorite?: string;
  periode?: string;
  langue?: string;
  formateur?: string;
  beneficiary_name?: string;
  beneficiary_email?: string;
}

export interface TrainingPlanningDetails {
  type_formation?: string;
  lieu?: string;
  budget?: number | null;
  indicateurs?: string;
  methode_evaluation?: string;
  responsable_suivi?: string;
  date_debut?: string;
  date_fin?: string;
  notes?: string;
}

export interface TrainingRequestRecord {
  id: string;
  employee_id?: string | null;
  employee_email?: string | null;
  employee_name?: string | null;
  manager_id?: string | null;
  course_name: string;
  reason?: string | null;
  status: TrainingStatus;
  request_details: TrainingRequestDetails;
  planning_details: TrainingPlanningDetails;
  created_at?: string;
  updated_at?: string;
}

export const TRAINING_STATUS_LABELS: Record<TrainingStatus, string> = {
  pending: 'En attente',
  approved: 'Acceptée',
  rejected: 'Refusée',
  planned: 'Planifiée',
  completed: 'Terminée',
};

/** Classes Tailwind pour le point de statut (aligné sur Évaluation) */
export function getTrainingStatusDotClass(status: TrainingStatus | null | undefined): string {
  if (!status) return 'bg-muted-foreground/30';
  switch (status) {
    case 'approved':
      return 'bg-emerald-500';
    case 'rejected':
      return 'bg-red-500';
    case 'planned':
    case 'completed':
      return 'bg-sky-500';
    case 'pending':
      return 'bg-orange-400';
    default:
      return 'bg-muted-foreground/30';
  }
}

export const TRAINING_DOMAIN_LABELS: Record<string, string> = {
  communication: 'Communication',
  rh: 'RH',
  logistique: 'Logistique',
  qualite: 'Qualité',
  production: 'Production',
};

export const TRAINING_PRIORITY_LABELS: Record<string, string> = {
  faible: 'Faible',
  moyenne: 'Moyenne',
  elevee: 'Élevée',
};

export function getTrainingPriorityLabel(priorite: string | null | undefined): string {
  if (!priorite) return '—';
  return TRAINING_PRIORITY_LABELS[priorite] ?? priorite;
}

/** Style badge priorité pour la liste des demandes */
export function getTrainingPriorityBadgeClass(priorite: string | null | undefined): string {
  switch (priorite) {
    case 'elevee':
      return 'bg-red-600/15 text-red-700 border-red-300 dark:text-red-300 dark:border-red-800';
    case 'moyenne':
      return 'bg-amber-500/15 text-amber-800 border-amber-300 dark:text-amber-200 dark:border-amber-700';
    case 'faible':
      return 'bg-slate-500/10 text-slate-700 border-slate-300 dark:text-slate-300 dark:border-slate-600';
    default:
      return '';
  }
}
