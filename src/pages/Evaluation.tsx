import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, ChevronRight, Loader2, Send, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { ModuleAccessDenied } from '@/components/ModuleAccessDenied';
import {
  EvaluationCriterionInputs,
  getDefaultCriterionValue,
} from '@/components/evaluation/EvaluationCriterionInputs';
import { EvaluationAuditTrail } from '@/components/evaluation/EvaluationAuditTrail';
import {
  calculateCriterionScore,
  type CalculationRuleRecord,
  type EvaluationCriterionRecord,
} from '@/lib/evaluation-calculator';
import {
  fetchCalculationRules,
  fetchEvaluationCriteria,
} from '@/lib/evaluation-config-storage';
import {
  appendAuditEntry, createAuditEntry, type EvaluationAuditEntry } from '@/lib/evaluation-audit';
import { hasEvaluationModuleAccess, showEvaluationManageButton } from '@/lib/evaluation-access';
import {
  criterionAppliesToEmployee,
  fetchEmployeesForEvaluation,
  findEvaluationForEmployeePeriod,
  getLatestEvaluationScoreForEmployee,
  getLatestEvaluationStatusForEmployee,
  getEvaluationScoreForEmployeePeriod,
  getEvaluationStatusForEmployeePeriod,
  upsertEvaluation,
} from '@/lib/evaluation-storage';
import { EVALUATION_STATUS_LABELS, type EvaluationStatus } from '@/lib/evaluation-types';
import {
  describeEvaluationPeriodCode,
  getCurrentEvaluationPeriodCode,
} from '@/lib/evaluation-period-label';
import {
  isEvaluationPeriodOpen,
  subscribeEvaluationPeriodChange,
} from '@/lib/evaluation-period-storage';
import type { EmployeeForEvaluation, EvaluationResponseItem } from '@/lib/evaluation-types';
import { getSessionUser } from '@/lib/session-user';
import { supabase } from '@/integrations/supabase/client';
import { runWithLoadingOverlay } from '@/lib/loading-overlay';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    }),
  ]);
}

export default function Evaluation() {
  const FILTER_ALL = '__all__';
  const { toast } = useToast();
  const { isDeveloper, canRead, canWrite, canSubmitEvaluation, canReviewEvaluation } = useRolePermissions();
  const canReadEvaluations = canRead('evaluations');
  const canWriteEvaluations = canWrite('evaluations');
  const canSubmitEvaluations = canSubmitEvaluation();
  const canReviewEvaluations = canReviewEvaluation();
  const canPerformEvaluationActions = canSubmitEvaluations || canReviewEvaluations;
  const canReadEvaluationsManagement = canRead('evaluations_management');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [employees, setEmployees] = useState<EmployeeForEvaluation[]>([]);
  const [criteria, setCriteria] = useState<EvaluationCriterionRecord[]>([]);
  const [rules, setRules] = useState<CalculationRuleRecord[]>([]);
  const [scoresByEmployee, setScoresByEmployee] = useState<Record<string, number | null>>({});
  const [statusByEmployee, setStatusByEmployee] = useState<Record<string, EvaluationStatus | null>>({});

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [period, setPeriod] = useState(getCurrentEvaluationPeriodCode());
  const [formValues, setFormValues] = useState<Record<string, number | boolean>>({});
  const [notes, setNotes] = useState('');
  const [isPeriodOpen, setIsPeriodOpen] = useState<boolean>(() => isEvaluationPeriodOpen());
  const [currentEvaluationId, setCurrentEvaluationId] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<EvaluationStatus | null>(null);
  const [activityLog, setActivityLog] = useState<EvaluationAuditEntry[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [branchFilter, setBranchFilter] = useState(FILTER_ALL);
  const [departmentFilter, setDepartmentFilter] = useState(FILTER_ALL);
  const [groupBy, setGroupBy] = useState<'none' | 'branch' | 'department'>('none');

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

  const isSubmitted = currentStatus === 'submitted';
  const isRejected = currentStatus === 'rejected';
  const isFinalized = currentStatus === 'approved';
  const canEditCriteria =
    canSubmitEvaluations &&
    isPeriodOpen &&
    !isSubmitted &&
    !isFinalized;
  const canOpenEvaluationForm =
    isPeriodOpen && canPerformEvaluationActions;

  const applicableCriteria = useMemo(() => {
    if (!selectedEmployee) return [];
    return criteria
      .filter((c) => criterionAppliesToEmployee(c, selectedEmployee))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }, [criteria, selectedEmployee]);

  const totalScore = applicableCriteria.reduce((sum, c) => {
    const v = formValues[c.id];
    if (v === undefined) return sum;
    return sum + calculateCriterionScore(c.type, v, rules, c.calculation_rule_id);
  }, 0);

  const maxScore = applicableCriteria.length * 10;
  const departmentName = (id?: string | null) => departments.find((d) => d.id === id)?.name ?? null;

  const branchFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const emp of employees) {
      if (emp.branch_id) {
        map.set(emp.branch_id, emp.branch_name ?? '—');
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [employees]);

  const departmentFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const emp of employees) {
      if (emp.department_id) {
        map.set(emp.department_id, departmentName(emp.department_id) ?? '—');
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [employees, departments]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const byBranch = branchFilter === FILTER_ALL || emp.branch_id === branchFilter;
      const byDepartment =
        departmentFilter === FILTER_ALL || emp.department_id === departmentFilter;
      return byBranch && byDepartment;
    });
  }, [employees, branchFilter, departmentFilter]);

  const groupedEmployees = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: null as string | null, employees: filteredEmployees }];
    }
    const groups = new Map<string, EmployeeForEvaluation[]>();
    for (const emp of filteredEmployees) {
      const key =
        groupBy === 'branch'
          ? emp.branch_id ?? 'none'
          : emp.department_id ?? 'none';
      const list = groups.get(key) ?? [];
      list.push(emp);
      groups.set(key, list);
    }
    const toLabel = (key: string) => {
      if (key === 'none') return groupBy === 'branch' ? 'Sans filiale' : 'Sans département';
      if (groupBy === 'branch') return groups.get(key)?.[0]?.branch_name ?? '—';
      return departmentName(key) ?? '—';
    };
    return [...groups.entries()]
      .map(([key, emps]) => ({ key, label: toLabel(key), employees: emps }))
      .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '', 'fr'));
  }, [filteredEmployees, groupBy, departments]);

  useEffect(() => {
    if (!canReadEvaluations) {
      setLoading(false);
      return;
    }
    const init = async () => {
      try {
        await runWithLoadingOverlay(async () => {
          const currentPeriod = getCurrentEvaluationPeriodCode();
          const [emps, crit, calcRules, rolesRes, deptsRes] = await withTimeout(
            Promise.all([
              fetchEmployeesForEvaluation(),
              fetchEvaluationCriteria(),
              fetchCalculationRules(),
              supabase.from('roles').select('id, name'),
              supabase.from('departments').select('id, name'),
            ]),
            10000,
            'Délai dépassé pendant le chargement des données.'
          );

          setEmployees(emps);
          setCriteria(crit.filter((c) => c.is_active !== false));
          setRules(calcRules);
          setRoles(rolesRes.data ?? []);
          setDepartments(deptsRes.data ?? []);

          const scoreMap: Record<string, number | null> = {};
          const statusMap: Record<string, EvaluationStatus | null> = {};
          await withTimeout(
            Promise.all(
              emps.map(async (emp) => {
                scoreMap[emp.id] = await getEvaluationScoreForEmployeePeriod(emp.id, currentPeriod);
                statusMap[emp.id] = await getEvaluationStatusForEmployeePeriod(emp.id, currentPeriod);
              })
            ),
            10000,
            'Délai dépassé pendant le chargement des scores.'
          );
          setScoresByEmployee(scoreMap);
          setStatusByEmployee(statusMap);
        }, 'Chargement des données d’évaluation...');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Chargement impossible';
        toast({ variant: 'destructive', title: 'Erreur', description: message });
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [canReadEvaluations]);

  useEffect(() => {
    return subscribeEvaluationPeriodChange(setIsPeriodOpen);
  }, []);

  const startEvaluation = async (empId: string) => {
    if (!isPeriodOpen) {
      toast({
        variant: 'destructive',
        title: 'Période fermée',
        description: "La période d'évaluation est fermée. Contactez l'administration.",
      });
      return;
    }
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const periodLabel = getCurrentEvaluationPeriodCode();
    const applicable = criteria
      .filter((c) => c.is_active !== false && criterionAppliesToEmployee(c, emp))
      .sort((a, b) => a.sort_order - b.sort_order);

    const existing = await findEvaluationForEmployeePeriod(empId, periodLabel);
    const initial: Record<string, number | boolean> = {};
    for (const c of applicable) {
      const saved = existing?.responses.find((r) => r.criterion_id === c.id);
      initial[c.id] =
        saved?.value !== undefined ? saved.value : getDefaultCriterionValue(c.type);
    }

    setFormValues(initial);
    setNotes(existing?.feedback ?? '');
    setPeriod(periodLabel);
    setCurrentEvaluationId(existing?.id ?? null);
    setCurrentStatus(existing?.status ?? null);
    setActivityLog(existing?.activity_log ?? []);
    setSelectedEmployeeId(empId);
  };

  const closeEvaluationForm = () => {
    setSelectedEmployeeId(null);
    setCurrentEvaluationId(null);
    setCurrentStatus(null);
    setActivityLog([]);
  };

  const persistEvaluation = async (status: EvaluationStatus, requireCriteria: boolean) => {
    if (!selectedEmployee) return;
    if (status === 'submitted' && !canSubmitEvaluations) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Accès Soumission requis' });
      return;
    }
    if ((status === 'approved' || status === 'rejected') && !canReviewEvaluations) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Accès Refus & Acceptation requis',
      });
      return;
    }
    if (!isPeriodOpen) {
      toast({
        variant: 'destructive',
        title: 'Période fermée',
        description: "Impossible d'enregistrer tant que la période est fermée.",
      });
      return;
    }
    if (!period.trim()) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Indiquez la période' });
      return;
    }
    if (status === 'submitted' && currentStatus === 'submitted') {
      toast({
        variant: 'destructive',
        title: 'Déjà soumise',
        description: 'Cette évaluation a déjà été soumise.',
      });
      return;
    }
    if ((status === 'approved' || status === 'rejected') && currentStatus !== 'submitted') {
      toast({
        variant: 'destructive',
        title: 'Soumission requise',
        description: 'Soumettez l’évaluation avant d’accepter ou de refuser.',
      });
      return;
    }
    if (status === 'rejected' && !notes.trim()) {
      toast({
        variant: 'destructive',
        title: 'Commentaire requis',
        description: 'Indiquez le motif du refus.',
      });
      return;
    }
    if (requireCriteria && applicableCriteria.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description:
          'Aucun critère ne correspond à cet employé (rôle, filiale, département).',
      });
      return;
    }

    if (requireCriteria) {
      const missing = applicableCriteria.filter((c) => formValues[c.id] === undefined);
      if (missing.length > 0) {
        toast({ variant: 'destructive', title: 'Erreur', description: 'Complétez tous les critères' });
        return;
      }
    }

    const auditAction =
      status === 'approved'
        ? 'evaluation_approved'
        : status === 'rejected'
          ? 'evaluation_rejected'
          : 'evaluation_submitted';
    const nextLog = appendAuditEntry(activityLog, createAuditEntry(auditAction, notes));

    setSubmitting(true);
    try {
      await runWithLoadingOverlay(async () => {
        const session = getSessionUser();
        const responses: EvaluationResponseItem[] = applicableCriteria
          .filter((c) => formValues[c.id] !== undefined)
          .map((c) => {
            const value = formValues[c.id];
            return {
              criterion_id: c.id,
              criterion_name: c.name,
              type: c.type,
              calculation_rule_id: c.calculation_rule_id,
              value,
              points: calculateCriterionScore(c.type, value, rules, c.calculation_rule_id),
            };
          });

        const saved = await upsertEvaluation({
          id: currentEvaluationId ?? undefined,
          employee_id: selectedEmployee.id,
          employee_email: selectedEmployee.email,
          employee_name: selectedEmployee.name,
          manager_id: session?.id ?? null,
          period: period.trim(),
          score: requireCriteria ? totalScore : null,
          feedback: notes.trim() || null,
          status,
          responses,
          activity_log: nextLog,
        });
        setActivityLog(saved.activity_log ?? nextLog);
        setCurrentEvaluationId(saved.id);
      }, status === 'rejected' ? 'Enregistrement du refus...' : 'Enregistrement de l’évaluation...');

      if (status === 'submitted') {
        setCurrentStatus('submitted');
        setStatusByEmployee((prev) => ({ ...prev, [selectedEmployee.id]: 'submitted' }));
        toast({
          title: 'Succès',
          description: 'Évaluation soumise. Vous pouvez maintenant l’accepter ou la refuser.',
        });
        return;
      }

      toast({
        title: 'Succès',
        description:
          status === 'approved' ? 'Évaluation acceptée' : 'Évaluation refusée',
      });
      if (status === 'approved') {
        setScoresByEmployee((prev) => ({ ...prev, [selectedEmployee.id]: totalScore }));
        setStatusByEmployee((prev) => ({ ...prev, [selectedEmployee.id]: 'approved' }));
      } else if (status === 'rejected') {
        setStatusByEmployee((prev) => ({ ...prev, [selectedEmployee.id]: 'rejected' }));
      }
      closeEvaluationForm();
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null
            ? ((error as { message?: string; details?: string; hint?: string; code?: string }).message ??
              (error as { details?: string }).details ??
              (error as { hint?: string }).hint ??
              (error as { code?: string }).code ??
              'Enregistrement impossible')
            : 'Enregistrement impossible';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const roleName = (id?: string | null) => roles.find((r) => r.id === id)?.name ?? null;
  const periodDescription = describeEvaluationPeriodCode(period);

  if (!hasEvaluationModuleAccess(isDeveloper, canReadEvaluations, canWriteEvaluations)) {
    return <ModuleAccessDenied />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Chargement...
      </div>
    );
  }

  if (!selectedEmployeeId || !selectedEmployee) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Évaluation</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Sélectionnez un employé pour démarrer une évaluation
            </p>
          </div>
          {showEvaluationManageButton(isDeveloper, canReadEvaluationsManagement) && (
            <Button variant="outline" asChild className="gap-2">
              <Link to="/admin/evaluations">Gestion des évaluations</Link>
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="p-0 space-y-3">
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Filiale</Label>
                <Select value={branchFilter} onValueChange={setBranchFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FILTER_ALL}>Toutes les filiales</SelectItem>
                    {branchFilterOptions.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Département</Label>
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FILTER_ALL}>Tous les départements</SelectItem>
                    {departmentFilterOptions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Groupement</Label>
                <Select
                  value={groupBy}
                  onValueChange={(v) => setGroupBy(v as 'none' | 'branch' | 'department')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    <SelectItem value="branch">Par filiale</SelectItem>
                    <SelectItem value="department">Par département</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employé</TableHead>
                  <TableHead>Poste</TableHead>
                  <TableHead>Filiale</TableHead>
                  <TableHead>Département</TableHead>
                  <TableHead className="text-right">Dernier score</TableHead>
                  <TableHead className="text-center">Statut</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Aucun employé pour ce filtre
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedEmployees.map((group) => (
                    <Fragment key={`group-block-${group.key}`}>
                      {group.label && (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={7} className="font-medium">
                            {group.label} ({group.employees.length})
                          </TableCell>
                        </TableRow>
                      )}
                      {group.employees.map((emp) => {
                        const last = scoresByEmployee[emp.id];
                        const status = statusByEmployee[emp.id];
                        const statusDotClass =
                          status === 'approved'
                            ? 'bg-emerald-500'
                            : status === 'rejected'
                              ? 'bg-red-500'
                              : status === 'pending' || status === 'submitted'
                                ? 'bg-orange-400'
                                : 'bg-muted-foreground/30';
                        return (
                          <TableRow
                            key={emp.id}
                            className={
                              canOpenEvaluationForm
                                ? 'cursor-pointer hover:bg-muted/50'
                                : ''
                            }
                            onClick={() => {
                              if (canOpenEvaluationForm) {
                                void startEvaluation(emp.id);
                              }
                            }}
                          >
                            <TableCell className="font-medium">{emp.name}</TableCell>
                            <TableCell className="text-muted-foreground">{emp.position ?? '—'}</TableCell>
                            <TableCell className="text-muted-foreground">{emp.branch_name ?? '—'}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {departmentName(emp.department_id) ?? '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              {last != null ? (
                                <Badge variant={last >= 40 ? 'default' : 'secondary'}>
                                  {last.toFixed(1)} pts
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <span
                                className={`inline-block h-2.5 w-2.5 rounded-full ${statusDotClass}`}
                                title={status ? EVALUATION_STATUS_LABELS[status] : 'Aucun statut'}
                              />
                            </TableCell>
                            <TableCell>
                              {canOpenEvaluationForm && (
                                <ChevronRight size={16} className="text-muted-foreground" />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {!isPeriodOpen && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-4 text-sm text-destructive">
              La période d&apos;évaluation est fermée. Les soumissions sont désactivées jusqu&apos;à
              réouverture par un administrateur.
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={closeEvaluationForm}>
        ← Retour
      </Button>

      <div className="space-y-3 border-b pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Évaluer : {selectedEmployee.name}
          </h1>
          {currentStatus && (
            <Badge variant={isSubmitted ? 'secondary' : isFinalized ? 'default' : 'outline'}>
              {EVALUATION_STATUS_LABELS[currentStatus]}
            </Badge>
          )}
        </div>
        <dl className="grid gap-1.5 text-sm sm:grid-cols-2">
          {selectedEmployee.position && (
            <div>
              <dt className="text-muted-foreground">Poste</dt>
              <dd className="font-medium">{selectedEmployee.position}</dd>
            </div>
          )}
          {selectedEmployee.branch_name && (
            <div>
              <dt className="text-muted-foreground">Filiale</dt>
              <dd className="font-medium">{selectedEmployee.branch_name}</dd>
            </div>
          )}
          {departmentName(selectedEmployee.department_id) && (
            <div>
              <dt className="text-muted-foreground">Département</dt>
              <dd className="font-medium">
                {departmentName(selectedEmployee.department_id)}
              </dd>
            </div>
          )}
          {roleName(selectedEmployee.role_id) && (
            <div>
              <dt className="text-muted-foreground">Rôle</dt>
              <dd className="font-medium">{roleName(selectedEmployee.role_id)}</dd>
            </div>
          )}
        </dl>
        <p className="text-xs text-muted-foreground">
          Les critères affichés correspondent au rôle, à la filiale et au département de
          l&apos;employé.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="evaluation-period">Période d&apos;évaluation (campagne)</Label>
        <Input
          id="evaluation-period"
          readOnly
          value={period}
          className="border-2 border-blue-300 bg-muted/40 max-w-xs cursor-default"
        />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium">{period}</span>
          {periodDescription ? (
            <> désigne la campagne <span className="font-medium">{periodDescription}</span>.</>
          ) : (
            <>
              {' '}
              — code année + trimestre (T1 à T4). Ex.{' '}
              <span className="font-medium">2026-T2</span> = 2e trimestre 2026.
            </>
          )}
        </p>
      </div>

      {isSubmitted && (
        <Card className="border-secondary/50 bg-secondary/10">
          <CardContent className="py-3 text-sm">
            Évaluation soumise — modifiez le commentaire si besoin, puis acceptez ou refusez.
          </CardContent>
        </Card>
      )}

      {isFinalized && (
        <Card className="border-muted">
          <CardContent className="py-3 text-sm text-muted-foreground">
            Cette évaluation est finalisée ({EVALUATION_STATUS_LABELS[currentStatus!]}).
          </CardContent>
        </Card>
      )}

      {applicableCriteria.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Aucun critère d&apos;évaluation ne correspond à cet employé (rôle, filiale, département).
          </CardContent>
        </Card>
      ) : (
        applicableCriteria.map((criterion) => (
          <Card key={criterion.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span>{criterion.name}</span>
                {formValues[criterion.id] !== undefined && (
                  <Badge variant="outline" className="font-normal text-xs shrink-0">
                    {calculateCriterionScore(
                      criterion.type,
                      formValues[criterion.id],
                      rules,
                      criterion.calculation_rule_id
                    ).toFixed(1)}{' '}
                    pt
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EvaluationCriterionInputs
                criterion={criterion}
                value={formValues[criterion.id]}
                onChange={(v) => setFormValues((prev) => ({ ...prev, [criterion.id]: v }))}
                rules={rules}
                disabled={!canEditCriteria}
              />
            </CardContent>
          </Card>
        ))
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Commentaire du manager</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder={
              isSubmitted
                ? 'Commentaire pour acceptation ou motif de refus…'
                : 'Observations, recommandations, axes de développement...'
            }
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            disabled={!canPerformEvaluationActions || !isPeriodOpen || isFinalized}
            className="border-2 border-blue-300 bg-blue-50"
          />
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-accent">
        <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Score total</p>
            <p className="text-3xl font-bold text-primary">
              {totalScore.toFixed(1)}{' '}
              <span className="text-lg text-muted-foreground font-normal">/ {maxScore}</span>
            </p>
          </div>
          {canPerformEvaluationActions && isPeriodOpen && !isFinalized && (
            <div className="flex flex-wrap gap-2">
              {(!isSubmitted || isRejected) && canSubmitEvaluations && (
                <Button
                  className="gap-2"
                  onClick={() => persistEvaluation('submitted', true)}
                  disabled={submitting || applicableCriteria.length === 0}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Soumettre
                </Button>
              )}
              {isSubmitted && canReviewEvaluations && (
                <>
                  <Button
                    className="gap-2"
                    onClick={() => persistEvaluation('approved', true)}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    Accepter
                  </Button>
                  <Button
                    variant="destructive"
                    className="gap-2"
                    onClick={() => persistEvaluation('rejected', false)}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    Refuser
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <EvaluationAuditTrail entries={activityLog} />
    </div>
  );
}
