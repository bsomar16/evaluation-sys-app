import type { CriterionType } from '@/lib/evaluation-calculator';
import type { EvaluationAuditEntry } from '@/lib/evaluation-audit';

export type EvaluationStatus = 'pending' | 'draft' | 'submitted' | 'approved' | 'rejected';

export const EVALUATION_STATUS_LABELS: Record<EvaluationStatus, string> = {
  pending: 'En attente',
  draft: 'Brouillon',
  submitted: 'Soumise',
  approved: 'Approuvée',
  rejected: 'Rejetée',
};

export interface EvaluationResponseItem {
  criterion_id: string;
  criterion_name: string;
  type: CriterionType;
  calculation_rule_id?: string | null;
  value: number | boolean;
  points: number;
}

export interface EvaluationRecord {
  id: string;
  employee_id: string | null;
  employee_email: string | null;
  employee_name: string | null;
  manager_id: string | null;
  period: string;
  score: number | null;
  feedback: string | null;
  status: EvaluationStatus;
  responses: EvaluationResponseItem[];
  activity_log?: EvaluationAuditEntry[];
  created_at?: string;
  updated_at?: string;
}

export interface EmployeeForEvaluation {
  id: string;
  name: string;
  email: string;
  position?: string | null;
  branch_id?: string | null;
  department_id?: string | null;
  role_id?: string | null;
  branch_name?: string;
}
