import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckCircle, ChevronRight, Download, Loader2, Printer, Send, Trash2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { ModuleAccessDenied } from '@/components/ModuleAccessDenied';
import {
  EvaluationCriterionInputs,
  getDefaultCriterionValue,
} from '@/components/evaluation/EvaluationCriterionInputs';
import { CriterionDescriptionExpand } from '@/components/evaluation/CriterionDescriptionExpand';
import { EvaluationExportDialog } from '@/components/evaluation/EvaluationExportDialog';
import {
  fetchActiveRejectionReasons,
  getRejectionReasonLabel,
  type RejectionReasonRecord,
} from '@/lib/rejection-reasons';
import {
  generateEvaluationReportPdf,
  generateEvaluationReportsPdf,
  type EvaluationReportPdfInput,
} from '@/lib/evaluation-report-pdf';
import { EvaluationAuditTrail } from '@/components/evaluation/EvaluationAuditTrail';
import {
  calculateCriterionScore,
  computeWeightedEvaluationBreakdown,
  formatEvaluationPercentage,
  getCriterionDisplayName,
  type CalculationRuleRecord,
  type EvaluationCriterionRecord,
} from '@/lib/evaluation-calculator';
import { useI18n } from '@/lib/i18n';
import {
  appendAuditEntry, createAuditEntry, type EvaluationAuditEntry } from '@/lib/evaluation-audit';
import { hasEvaluationModuleAccess, showEvaluationManageButton } from '@/lib/evaluation-access';
import {
  criterionAppliesToEmployee,
  deleteEvaluation,
  fetchEvaluations,
  findEvaluationForOpenPeriod,
  upsertEvaluation,
} from '@/lib/evaluation-storage';
import { type EvaluationStatus } from '@/lib/evaluation-types';
import {
  describeEvaluationPeriodCode,
  dateToPeriodCode,
} from '@/lib/evaluation-period-label';
import { useCurrentOpenPeriod } from '@/hooks/useEvaluationPeriod';
import {
  applyPeriodToSnapshot,
  fetchEvaluationPageData,
  isEvaluationPageSnapshotFresh,
  getEvaluationPageSnapshot,
  refreshEvaluationPageEvaluations,
  type EvaluationPeriodOption,
} from '@/lib/evaluation-page-cache';
import type { EmployeeForEvaluation, EvaluationResponseItem } from '@/lib/evaluation-types';
import { getSessionUser, formatRoleServiceLabel } from '@/lib/session-user';
import { criterionIsApplicableForEvaluation } from '@/lib/criterion-frequency';
import { hideLoadingOverlay, runWithLoadingOverlay } from '@/lib/loading-overlay';
import {
  EVALUATION_TABLE_EXPORT_DEFAULT_FIELDS,
  exportEvaluationListToExcel,
  type EvaluationExportFieldKey,
} from '@/lib/evaluation-list-export';

const EVALUATION_TABLE_COLUMN_COUNT = 7;

const OTHER_REASON_VALUE = '__other__';

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
  const location = useLocation();
  const { toast } = useToast();
  const { isDeveloper, canRead, canWrite, canDelete, canSubmitEvaluation, canReviewEvaluation, canViewEvaluationValues } = useRolePermissions();
  const { lang, t } = useI18n();
  const canReadEvaluations = canRead('evaluations');
  const canWriteEvaluations = canWrite('evaluations');
  const canSubmitEvaluations = canSubmitEvaluation();
  const canReviewEvaluations = canReviewEvaluation();
  const canViewValues = canViewEvaluationValues();
  const canPerformEvaluationActions = canSubmitEvaluations || canReviewEvaluations;
  const canReadEvaluationsManagement = canRead('evaluations_management');
  const [loading, setLoading] = useState(true);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [employees, setEmployees] = useState<EmployeeForEvaluation[]>([]);
  const [criteria, setCriteria] = useState<EvaluationCriterionRecord[]>([]);
  const [rules, setRules] = useState<CalculationRuleRecord[]>([]);
  const [scoresByEmployee, setScoresByEmployee] = useState<Record<string, number | null>>({});
  const [statusByEmployee, setStatusByEmployee] = useState<Record<string, EvaluationStatus | null>>({});

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [period, setPeriod] = useState('');
  const [formValues, setFormValues] = useState<Record<string, number | boolean>>({});
  const [notes, setNotes] = useState('');
  const { isOpen: isPeriodOpen, period: activePeriod } = useCurrentOpenPeriod();
  const [currentEvaluationId, setCurrentEvaluationId] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<EvaluationStatus | null>(null);
  const [activityLog, setActivityLog] = useState<EvaluationAuditEntry[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [branchFilter, setBranchFilter] = useState(FILTER_ALL);
  const [departmentFilter, setDepartmentFilter] = useState(FILTER_ALL);
  const [statusFilter, setStatusFilter] = useState<'all' | 'en-attente' | 'soumis' | 'complet'>('all');
  const [groupBy, setGroupBy] = useState<'none' | 'branch' | 'department'>('none');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReasons, setRejectionReasons] = useState<RejectionReasonRecord[]>([]);
  const [selectedReasonId, setSelectedReasonId] = useState('');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [availablePeriods, setAvailablePeriods] = useState<EvaluationPeriodOption[]>([]);
  const [frequencyOrderedPeriods, setFrequencyOrderedPeriods] = useState<{ start_date: string }[]>([]);
  const loadGenerationRef = useRef(0);

  // Map grouped categories to database statuses
  const mapStatusGroupToDb = (group: string): EvaluationStatus[] => {
    if (group === 'en-attente') return ['draft', 'rejected', 'pending'];
    if (group === 'soumis') return ['submitted'];
    if (group === 'complet') return ['approved', 'completed'];
    return [];
  };

  const statusFilterOptions: Array<{ value: string; label: string; colorClass: string }> = [
    { value: 'soumis', label: t('dashboard.submitted'), colorClass: 'bg-amber-400' },
    { value: 'complet', label: t('dashboard.complete'), colorClass: 'bg-emerald-500' },
  ];

  const selectedStatusOption = statusFilterOptions.find((option) => option.value === statusFilter);

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

  const isSubmitted = currentStatus === 'submitted';
  const isRejected = currentStatus === 'rejected';
  const isFinalized = currentStatus === 'approved';
  const isCompleted = currentStatus === 'completed';
  const showEvaluationValues =
    canViewValues || isSubmitted || isRejected || isFinalized || isCompleted;
  const canEditCriteria =
    canSubmitEvaluations &&
    isPeriodOpen &&
    !isSubmitted &&
    !isFinalized;
  const canOpenEvaluationForm =
    isPeriodOpen && canPerformEvaluationActions;

  const openPeriodName = useMemo(() => {
    if (!activePeriod) return '';
    const code = dateToPeriodCode(new Date(activePeriod.start_date));
    return availablePeriods.find((p) => p.code === code)?.name ?? activePeriod.name;
  }, [activePeriod, availablePeriods]);

  const orderedEvaluationPeriods = useMemo(
    () => frequencyOrderedPeriods,
    [frequencyOrderedPeriods]
  );

  const evaluationPeriodStartDate = useMemo(() => {
    const periodName = openPeriodName || period;
    return availablePeriods.find((p) => p.name === periodName)?.start_date;
  }, [availablePeriods, openPeriodName, period]);

  const applicableCriteria = useMemo(() => {
    if (!selectedEmployee) return [];
    const savedCriterionIds = new Set(Object.keys(formValues));
    return criteria
      .filter((c) => {
        if (!criterionAppliesToEmployee(c, selectedEmployee)) return false;
        return criterionIsApplicableForEvaluation(c, {
          savedCriterionIds,
          periodStartDate: evaluationPeriodStartDate,
          orderedPeriods: orderedEvaluationPeriods,
        });
      })
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }, [
    criteria,
    selectedEmployee,
    formValues,
    evaluationPeriodStartDate,
    orderedEvaluationPeriods,
  ]);
  const scoreBreakdown = useMemo(
    () => computeWeightedEvaluationBreakdown(applicableCriteria, formValues, rules),
    [applicableCriteria, formValues, rules]
  );
  const totalPercentage = scoreBreakdown.percentage;
  const departmentName = (id?: string | null) => departments.find((d) => d.id === id)?.name ?? null;
  const roleName = (id?: string | null) => roles.find((r) => r.id === id)?.name ?? null;
  const employeePosteLabel = (emp: EmployeeForEvaluation) => {
    const label = formatRoleServiceLabel(roleName(emp.role_id), departmentName(emp.department_id));
    return label || '—';
  };

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
      const empStatus = statusByEmployee[emp.id];
      let byStatus = statusFilter === 'all';
      if (!byStatus && statusFilter !== 'all') {
        const allowedStatuses = mapStatusGroupToDb(statusFilter);
        byStatus = allowedStatuses.includes(empStatus as EvaluationStatus) || (empStatus === null && allowedStatuses.includes('draft'));
      }
      return byBranch && byDepartment && byStatus;
    });
  }, [employees, branchFilter, departmentFilter, statusFilter, statusByEmployee]);

  const pagination = usePagination(filteredEmployees, 10);

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
      if (key === 'none') return groupBy === 'branch' ? t('evaluation.noBranchGroup') : t('evaluation.noDepartmentGroup');
      if (groupBy === 'branch') return groups.get(key)?.[0]?.branch_name ?? '—';
      return departmentName(key) ?? '—';
    };
    return [...groups.entries()]
      .map(([key, emps]) => ({ key, label: toLabel(key), employees: emps }))
      .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '', 'fr'));
  }, [filteredEmployees, groupBy, departments]);

  const paginatedGroupedEmployees = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: null as string | null, employees: pagination.paginatedItems }];
    }
    const groups = new Map<string, EmployeeForEvaluation[]>();
    for (const emp of pagination.paginatedItems) {
      const key =
        groupBy === 'branch'
          ? emp.branch_id ?? 'none'
          : emp.department_id ?? 'none';
      const list = groups.get(key) ?? [];
      list.push(emp);
      groups.set(key, list);
    }
    const toLabel = (key: string) => {
      if (key === 'none') return groupBy === 'branch' ? t('evaluation.noBranchGroup') : t('evaluation.noDepartmentGroup');
      if (groupBy === 'branch') return groups.get(key)?.[0]?.branch_name ?? '—';
      return departmentName(key) ?? '—';
    };
    return [...groups.entries()]
      .map(([key, emps]) => ({ key, label: toLabel(key), employees: emps }))
      .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '', 'fr'));
  }, [pagination.paginatedItems, groupBy, departments]);

  const currentPageEmployeeIds = useMemo(
    () => paginatedGroupedEmployees.flatMap((group) => group.employees.map((employee) => employee.id)),
    [paginatedGroupedEmployees]
  );

  const filteredEmployeeIds = useMemo(
    () => filteredEmployees.map((employee) => employee.id),
    [filteredEmployees]
  );

  const selectedCount = selectedEmployeeIds.size;
  const allCurrentPageSelected =
    currentPageEmployeeIds.length > 0 &&
    currentPageEmployeeIds.every((id) => selectedEmployeeIds.has(id));
  const someCurrentPageSelected =
    currentPageEmployeeIds.some((id) => selectedEmployeeIds.has(id)) && !allCurrentPageSelected;
  const allFilteredSelected =
    filteredEmployeeIds.length > 0 &&
    filteredEmployeeIds.every((id) => selectedEmployeeIds.has(id));
  const tableHasMoreRowsThanPage = filteredEmployeeIds.length > currentPageEmployeeIds.length;

  const selectedEmployees = useMemo(
    () => filteredEmployees.filter((employee) => selectedEmployeeIds.has(employee.id)),
    [filteredEmployees, selectedEmployeeIds]
  );
  // Le PDF n'étant produit que pour les évaluations approuvées, le bouton Imprimer
  // n'est visible que si la sélection contient au moins une évaluation approuvée.
  const hasPrintableSelection = useMemo(
    () => selectedEmployees.some((employee) => statusByEmployee[employee.id] === 'approved'),
    [selectedEmployees, statusByEmployee]
  );

  const canBulkDeleteEvaluations = canDelete('evaluations') || canDelete('evaluations_management');

  const toggleEmployeeSelection = (employeeId: string, checked: boolean) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(employeeId);
      else next.delete(employeeId);
      return next;
    });
  };

  const toggleSelectAllCurrentPage = (checked: boolean) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      for (const employeeId of currentPageEmployeeIds) {
        if (checked) next.add(employeeId);
        else next.delete(employeeId);
      }
      return next;
    });
  };

  const toggleSelectAllFiltered = (checked: boolean) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      for (const employeeId of filteredEmployeeIds) {
        if (checked) next.add(employeeId);
        else next.delete(employeeId);
      }
      return next;
    });
  };

  const headerCheckboxChecked: boolean | 'indeterminate' = allFilteredSelected
    ? true
    : allCurrentPageSelected && tableHasMoreRowsThanPage
      ? 'indeterminate'
      : allCurrentPageSelected
        ? true
        : someCurrentPageSelected
          ? 'indeterminate'
          : false;

  const handleHeaderCheckboxChange = (checked: boolean) => {
    if (allFilteredSelected) {
      toggleSelectAllFiltered(false);
      return;
    }
    toggleSelectAllCurrentPage(checked);
  };

  const handleBulkExport = async (fields: EvaluationExportFieldKey[]) => {
    if (selectedEmployees.length === 0) return;

    const periodName = (openPeriodName || period).trim();
    const periodOption = availablePeriods.find((item) => item.name === periodName);

    try {
      const evaluations = await runWithLoadingOverlay(
        () => fetchEvaluations(),
        t('common.loading')
      );

      const evaluationsByEmployeeId: Record<string, EvaluationRecord | null> = {};
      for (const employee of selectedEmployees) {
        if (periodOption) {
          evaluationsByEmployeeId[employee.id] = findEvaluationForOpenPeriod(
            employee.id,
            periodOption,
            evaluations
          );
        } else {
          evaluationsByEmployeeId[employee.id] =
            evaluations.find(
              (row) =>
                row.employee_id === employee.id &&
                (row.period ?? '').trim() === periodName
            ) ?? null;
        }
      }

      exportEvaluationListToExcel(selectedEmployees, fields, {
        departmentName,
        roleName,
        scoresByEmployee,
        statusByEmployee,
        criteria,
        rules,
        evaluationsByEmployeeId,
        evaluationPeriodStartDate: periodOption?.start_date ?? evaluationPeriodStartDate,
        orderedEvaluationPeriods: frequencyOrderedPeriods,
        periodLabel: periodName,
      });

      toast({
        title: t('evaluation.exportDone'),
        description: t('evaluation.exportGeneratedDesc', { count: selectedEmployees.length }),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('evaluation.exportImpossible');
      toast({ variant: 'destructive', title: t('common.error'), description: message });
    }
  };

  const handlePrintSelection = async () => {
    if (selectedEmployees.length === 0) return;

    const periodName = (openPeriodName || period).trim();
    const periodOption = availablePeriods.find((item) => item.name === periodName);

    try {
      const evaluations = await runWithLoadingOverlay(
        () => fetchEvaluations(),
        t('common.loading')
      );

      const reportInputs: EvaluationReportPdfInput[] = [];
      for (const employee of selectedEmployees) {
        const evaluation = periodOption
          ? findEvaluationForOpenPeriod(employee.id, periodOption, evaluations)
          : evaluations.find(
              (row) => row.employee_id === employee.id && (row.period ?? '').trim() === periodName
            ) ?? null;
        // Le rapport PDF n'est produit que pour les évaluations approuvées.
        if (!evaluation || evaluation.status !== 'approved') continue;
        reportInputs.push({
          evaluation,
          employeeName: employee.name,
          position: employee.position ?? null,
          branchName: employee.branch_name ?? null,
          departmentName: departmentName(employee.department_id),
          roleName: roleName(employee.role_id),
          percentage: scoresByEmployee[employee.id] ?? null,
          criteria,
          rules,
        });
      }

      if (reportInputs.length === 0) {
        toast({
          variant: 'destructive',
          title: t('common.error'),
          description: t('reports.noApprovedInSelection'),
        });
        return;
      }

      const opened = generateEvaluationReportsPdf(reportInputs);
      if (!opened) {
        toast({ title: t('reports.popupBlockedTitle'), description: t('reports.popupBlockedDesc') });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('common.error');
      toast({ variant: 'destructive', title: t('common.error'), description: message });
    }
  };

  const handleBulkDelete = async () => {
    if (!canBulkDeleteEvaluations || selectedEmployees.length === 0) {
      toast({ variant: 'destructive', title: t('common.accessDenied'), description: t('common.accessDenied') });
      return;
    }

    const periodName = (openPeriodName || period).trim();
    if (!periodName) {
      toast({ variant: 'destructive', title: t('common.error'), description: t('evaluation.noPeriodSelected') });
      return;
    }

    try {
      const evaluations = await fetchEvaluations();
      const targets = evaluations.filter(
        (evaluation) =>
          evaluation.employee_id &&
          selectedEmployeeIds.has(evaluation.employee_id) &&
          (evaluation.period ?? '').trim() === periodName
      );

      if (targets.length === 0) {
        toast({
          variant: 'destructive',
          title: t('evalStatus.none'),
          description: t('evaluation.noEvalToDelete'),
        });
        setBulkDeleteOpen(false);
        return;
      }

      await runWithLoadingOverlay(async () => {
        for (const evaluation of targets) {
          await deleteEvaluation(evaluation.id);
        }
      }, t('common.loading'));

      setSelectedEmployeeIds(new Set());
      setBulkDeleteOpen(false);
      void refreshEvaluationPageEvaluations(periodName);
      toast({
        title: t('common.success'),
        description: t('evaluation.bulkDeletedDesc', { count: targets.length }),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('common.error');
      toast({ variant: 'destructive', title: t('common.error'), description: message });
    }
  };

  // Initialize filter from navigation state
  useEffect(() => {
    if (location.state?.filterByStatus) {
      const filterStatus = location.state.filterByStatus;
      if (Array.isArray(filterStatus) && filterStatus.length > 0) {
        // Map database statuses to category
        if (filterStatus.includes('draft') || filterStatus.includes('rejected')) {
          setStatusFilter('en-attente');
        } else if (filterStatus.includes('submitted')) {
          setStatusFilter('soumis');
        } else if (filterStatus.includes('approved') || filterStatus.includes('completed')) {
          setStatusFilter('complet');
        } else {
          setStatusFilter('all');
        }
      } else if (typeof filterStatus === 'string') {
        // Single string status
        if (filterStatus === 'draft' || filterStatus === 'rejected') {
          setStatusFilter('en-attente');
        } else if (filterStatus === 'submitted') {
          setStatusFilter('soumis');
        } else if (filterStatus === 'approved' || filterStatus === 'completed') {
          setStatusFilter('complet');
        } else {
          setStatusFilter('all');
        }
      }
    }
  }, [location.state]);
  useEffect(() => {
    pagination.setCurrentPage(1);
  }, [filteredEmployees, pagination.itemsPerPage, groupBy]);

  useEffect(() => {
    setSelectedEmployeeIds(new Set());
  }, [period, branchFilter, departmentFilter, statusFilter, groupBy]);

  useEffect(() => {
    fetchActiveRejectionReasons()
      .then(setRejectionReasons)
      .catch(() => setRejectionReasons([]));
  }, []);

  const applyPageData = (data: {
    employees: EmployeeForEvaluation[];
    criteria: EvaluationCriterionRecord[];
    rules: CalculationRuleRecord[];
    roles: { id: string; name: string }[];
    departments: { id: string; name: string }[];
    availablePeriods: EvaluationPeriodOption[];
    frequencyOrderedPeriods: { start_date: string }[];
    period: string;
    scoresByEmployee: Record<string, number | null>;
    statusByEmployee: Record<string, EvaluationStatus | null>;
  }) => {
    setEmployees(data.employees);
    setCriteria(data.criteria);
    setRules(data.rules);
    setRoles(data.roles);
    setDepartments(data.departments);
    setAvailablePeriods(data.availablePeriods);
    setFrequencyOrderedPeriods(data.frequencyOrderedPeriods);
    setPeriod(data.period);
    setScoresByEmployee(data.scoresByEmployee);
    setStatusByEmployee(data.statusByEmployee);
  };

  const handlePeriodChange = (nextPeriod: string) => {
    if (!nextPeriod || nextPeriod === period) return;

    setPeriod(nextPeriod);
    const maps = applyPeriodToSnapshot(nextPeriod);
    if (maps) {
      setScoresByEmployee(maps.scoresByEmployee);
      setStatusByEmployee(maps.statusByEmployee);
      return;
    }

    setListRefreshing(true);
    void refreshEvaluationPageEvaluations(nextPeriod)
      .then((maps) => {
        if (maps) {
          setScoresByEmployee(maps.scoresByEmployee);
          setStatusByEmployee(maps.statusByEmployee);
        }
      })
      .finally(() => setListRefreshing(false));
  };

  useEffect(() => {
    if (!canReadEvaluations) {
      setLoading(false);
      hideLoadingOverlay();
      return;
    }

    const generation = ++loadGenerationRef.current;
    let cancelled = false;

    const finishInitialLoad = () => {
      if (cancelled || generation !== loadGenerationRef.current) return;
      setLoading(false);
      hideLoadingOverlay();
    };

    const run = async () => {
      try {
        if (isEvaluationPageSnapshotFresh()) {
          const cached = getEvaluationPageSnapshot();
          if (cached) {
            applyPageData(cached);
            finishInitialLoad();
            void fetchEvaluationPageData(cached.period).then((fresh) => {
              if (!cancelled && generation === loadGenerationRef.current) {
                applyPageData(fresh);
              }
            });
            return;
          }
        }

        const data = await withTimeout(
          fetchEvaluationPageData(null),
          20000,
          'Délai dépassé pendant le chargement des données.'
        );
        if (!cancelled && generation === loadGenerationRef.current) {
          applyPageData(data);
        }
      } catch (error: unknown) {
        if (!cancelled && generation === loadGenerationRef.current) {
          const message = error instanceof Error ? error.message : 'Chargement impossible';
          toast({ variant: 'destructive', title: t('common.error'), description: message });
        }
      } finally {
        finishInitialLoad();
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [canReadEvaluations]);

  const startEvaluation = async (empId: string) => {
    if (!isPeriodOpen) {
      toast({
        variant: 'destructive',
        title: t('evaluation.periodClosedTitle'),
        description: t('evaluation.periodClosed'),
      });
      return;
    }
    if (!openPeriodName) {
      toast({
        variant: 'destructive',
        title: t('evaluation.periodUnavailable'),
        description: t('evaluation.noOpenPeriod'),
      });
      return;
    }
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const evaluations = await fetchEvaluations();
    const existing = activePeriod
      ? findEvaluationForOpenPeriod(empId, activePeriod, evaluations)
      : evaluations.find(
          (row) =>
            row.employee_id === empId &&
            (row.period ?? '').trim() === (openPeriodName ?? '').trim()
        ) ?? null;
    const savedCriterionIds = new Set((existing?.responses ?? []).map((r) => r.criterion_id));
    const applicable = criteria
      .filter((c) => {
        if (!criterionAppliesToEmployee(c, emp)) return false;
        return criterionIsApplicableForEvaluation(c, {
          savedCriterionIds,
          periodStartDate: evaluationPeriodStartDate,
          orderedPeriods: orderedEvaluationPeriods,
        });
      })
      .sort((a, b) => a.sort_order - b.sort_order);
    const initial: Record<string, number | boolean> = {};
    for (const c of applicable) {
      const saved = existing?.responses.find((r) => r.criterion_id === c.id);
      initial[c.id] =
        saved?.value !== undefined ? saved.value : getDefaultCriterionValue(c.type);
    }

    setFormValues(initial);
    setNotes(existing?.feedback ?? '');
    setPeriod(openPeriodName);
    setCurrentEvaluationId(existing?.id ?? null);
    setCurrentStatus(existing?.status ?? statusByEmployee[empId] ?? null);
    setActivityLog(existing?.activity_log ?? []);
    setSelectedEmployeeId(empId);
  };

  const closeEvaluationForm = () => {
    setSelectedEmployeeId(null);
    setCurrentEvaluationId(null);
    setCurrentStatus(null);
    setActivityLog([]);
  };

  const handlePrintCurrent = () => {
    if (!selectedEmployee || !currentStatus) return;
    const responses: EvaluationResponseItem[] = applicableCriteria
      .filter((c) => formValues[c.id] !== undefined)
      .map((c) => ({
        criterion_id: c.id,
        criterion_name: c.name,
        type: c.type,
        calculation_rule_id: c.calculation_rule_id,
        value: formValues[c.id],
        points: calculateCriterionScore(c.type, formValues[c.id], rules, c.calculation_rule_id),
      }));

    const opened = generateEvaluationReportPdf({
      evaluation: {
        id: currentEvaluationId ?? '',
        employee_id: selectedEmployee.id,
        employee_email: selectedEmployee.email,
        employee_name: selectedEmployee.name,
        manager_id: null,
        period: openPeriodName || period,
        score: totalPercentage,
        feedback: notes || null,
        status: currentStatus,
        responses,
        activity_log: activityLog,
      },
      employeeName: selectedEmployee.name,
      position: selectedEmployee.position ?? null,
      branchName: selectedEmployee.branch_name ?? null,
      departmentName: departmentName(selectedEmployee.department_id),
      roleName: roleName(selectedEmployee.role_id),
      percentage: totalPercentage,
      criteria,
      rules,
    });
    if (!opened) {
      toast({ title: t('reports.popupBlockedTitle'), description: t('reports.popupBlockedDesc') });
    }
  };

  const persistEvaluation = async (status: EvaluationStatus, requireCriteria: boolean): Promise<boolean> => {
    if (!selectedEmployee) return false;
    if (status === 'submitted' && !canSubmitEvaluations) {
      toast({ variant: 'destructive', title: t('common.error'), description: t('evaluation.submitAccessRequired') });
      return false;
    }
    if ((status === 'approved' || status === 'rejected') && !canReviewEvaluations) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: t('evaluation.reviewAccessRequired'),
      });
      return false;
    }
    if (!isPeriodOpen) {
      toast({
        variant: 'destructive',
        title: t('evaluation.periodClosedTitle'),
        description: t('evaluation.periodClosed'),
      });
      return false;
    }
    if (!period.trim()) {
      toast({ variant: 'destructive', title: t('common.error'), description: t('evaluation.indicatePeriod') });
      return false;
    }
    if (status === 'submitted' && currentStatus === 'submitted') {
      toast({
        variant: 'destructive',
        title: t('evaluation.alreadySubmittedTitle'),
        description: t('evaluation.alreadySubmitted'),
      });
      return false;
    }
    if ((status === 'approved' || status === 'rejected') && currentStatus !== 'submitted') {
      toast({
        variant: 'destructive',
        title: t('evaluation.submitRequiredTitle'),
        description: t('evaluation.submitRequired'),
      });
      return false;
    }
    if (status === 'rejected' && !notes.trim()) {
      toast({
        variant: 'destructive',
        title: t('evaluation.commentRequiredTitle'),
        description: t('evaluation.commentRequired'),
      });
      return false;
    }
    if (requireCriteria && applicableCriteria.length === 0) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: t('evaluation.noCriteria')
      });
      return false;
    }

    if (requireCriteria) {
      const missing = applicableCriteria.filter((c) => formValues[c.id] === undefined);
      if (missing.length > 0) {
        toast({ variant: 'destructive', title: t('common.error'), description: t('evaluation.completeAll') });
        return false;
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
          score: requireCriteria ? totalPercentage : null,
          feedback: notes.trim() || null,
          status,
          responses,
          activity_log: nextLog,
        });
        setActivityLog(saved.activity_log ?? nextLog);
        setCurrentEvaluationId(saved.id);
      }, t('common.loading'));

      if (status === 'submitted') {
        setCurrentStatus('submitted');
        setStatusByEmployee((prev) => ({ ...prev, [selectedEmployee.id]: 'submitted' }));
        void refreshEvaluationPageEvaluations(period);
        toast({
          title: t('common.success'),
          description: t('evaluation.submittedSuccess'),
        });
        return true;
      }

      toast({
        title: t('common.success'),
        description:
          status === 'approved' ? t('evaluation.accepted') : t('evaluation.rejected'),
      });
      if (status === 'approved') {
        setScoresByEmployee((prev) => ({ ...prev, [selectedEmployee.id]: totalPercentage }));
        setStatusByEmployee((prev) => ({ ...prev, [selectedEmployee.id]: 'approved' }));
      } else if (status === 'rejected') {
        setStatusByEmployee((prev) => ({ ...prev, [selectedEmployee.id]: 'rejected' }));
      }
      void refreshEvaluationPageEvaluations(period);
      closeEvaluationForm();
      return true;
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
      toast({ variant: 'destructive', title: t('common.error'), description: message });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const periodCode =
    availablePeriods.find((p) => p.name === (openPeriodName || period))?.code || openPeriodName || period;
  const periodDescription = describeEvaluationPeriodCode(periodCode);

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
            <h1 className="text-3xl font-bold">{t('evaluation.title')}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {t('evaluation.selectEmployee')}
            </p>
          </div>
          {showEvaluationManageButton(isDeveloper, canReadEvaluationsManagement) && (
            <Button variant="outline" asChild className="gap-2">
              <Link to="/admin/evaluations">{t('evaluation.manage')}</Link>
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="p-0 space-y-3">
            <div className="grid gap-4 p-4">
              <div className="space-y-1">
                <Label>{t('evaluation.period')}</Label>
                {availablePeriods.length > 0 ? (
                  <Select value={period} onValueChange={handlePeriodChange}>
                    <SelectTrigger className="w-full">
                      <span className="flex items-center gap-2">
                        {period === activePeriod?.name && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-500/25"
                            aria-hidden
                          />
                        )}
                        {period || t('evaluation.selectPeriod')}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {availablePeriods.map((p) => (
                        <SelectItem key={p.name} value={p.name}>
                          <span className="flex items-center gap-2">
                            {p.name === activePeriod?.name && (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                                aria-hidden
                              />
                            )}
                            {p.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground flex items-center">
                    —
                  </div>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1">
                  <Label>{t('evaluation.branch')}</Label>
                  <Select value={branchFilter} onValueChange={setBranchFilter}>
                    <SelectTrigger className="min-w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FILTER_ALL}>{t('evaluation.allBranches')}</SelectItem>
                      {branchFilterOptions.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t('evaluation.department')}</Label>
                  <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                    <SelectTrigger className="min-w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FILTER_ALL}>{t('evaluation.allDepartments')}</SelectItem>
                      {departmentFilterOptions.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t('evaluation.status')}</Label>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as EvaluationStatus | 'all')}>
                    <SelectTrigger className="min-w-[160px]">
                      <SelectValue placeholder={t('evaluation.allStatuses')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('evaluation.allStatuses')}</SelectItem>
                      {statusFilterOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <span className={`${option.colorClass} inline-block h-2.5 w-2.5 rounded-full`} />
                            {option.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t('evaluation.grouping')}</Label>
                  <Select
                    value={groupBy}
                    onValueChange={(v) => setGroupBy(v as 'none' | 'branch' | 'department')}
                  >
                    <SelectTrigger className="min-w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('evaluation.groupNone')}</SelectItem>
                      <SelectItem value="branch">{t('evaluation.groupBranch')}</SelectItem>
                      <SelectItem value="department">{t('evaluation.groupDepartment')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="relative">
              {listRefreshing && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/60">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            {selectedCount > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <span className="text-sm text-muted-foreground">
                  {selectedCount} {t('evaluation.rowsSelected')}
                  {allFilteredSelected && filteredEmployeeIds.length > 0
                    ? ` ${t('evaluation.of')} ${filteredEmployeeIds.length}`
                    : ''}
                </span>
                {tableHasMoreRowsThanPage && !allFilteredSelected && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto px-0 text-sm"
                    onClick={() => toggleSelectAllFiltered(true)}
                  >
                    {t('evaluation.selectAllRows', { count: filteredEmployeeIds.length })}
                  </Button>
                )}
                {canBulkDeleteEvaluations && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    onClick={() => setBulkDeleteOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('common.delete')}
                  </Button>
                )}
                {hasPrintableSelection && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => void handlePrintSelection()}
                  >
                    <Printer className="h-4 w-4" />
                    {t('evaluation.print')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setExportDialogOpen(true)}
                >
                  <Download className="h-4 w-4" />
                  {t('evaluation.export')}
                </Button>
              </div>
            )}
            {tableHasMoreRowsThanPage && !allFilteredSelected && allCurrentPageSelected && (
              <div className="mb-3 flex flex-wrap items-center gap-1 rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
                <span>
                  {t('evaluation.pageRowsSelected', { count: currentPageEmployeeIds.length })}
                </span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto px-1 text-sm font-medium"
                  onClick={() => toggleSelectAllFiltered(true)}
                >
                  Sélectionner les {filteredEmployeeIds.length} lignes du tableau
                </Button>
              </div>
            )}
            <Table>
              <TableHeader className="evaluation-table-header app-table-header-banded">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={headerCheckboxChecked}
                      onCheckedChange={(checked) => handleHeaderCheckboxChange(checked === true)}
                      aria-label="Sélectionner toutes les lignes de la page"
                    />
                  </TableHead>
                  <TableHead>{t('evaluation.colEmployee')}</TableHead>
                  <TableHead>{t('evaluation.colPoste')}</TableHead>
                  <TableHead>{t('evaluation.colBranch')}</TableHead>
                  <TableHead className="text-right">{t('evaluation.colLastScore')}</TableHead>
                  <TableHead className="text-center">{t('evaluation.colStatus')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={EVALUATION_TABLE_COLUMN_COUNT} className="text-center text-muted-foreground py-8">
                      {t('evaluation.noEmployeeFilter')}
                    </TableCell>
                  </TableRow>
                ) : paginatedGroupedEmployees.length === 0 && groupedEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={EVALUATION_TABLE_COLUMN_COUNT} className="text-center text-muted-foreground py-8">
                      {t('evaluation.noEmployeeFilter')}
                    </TableCell>
                  </TableRow>
                ) : paginatedGroupedEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={EVALUATION_TABLE_COLUMN_COUNT} className="text-center text-muted-foreground py-8">
                      {t('evaluation.noEmployeePage')}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedGroupedEmployees.map((group) => (
                    <Fragment key={`group-block-${group.key}`}>
                      {group.label && (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={EVALUATION_TABLE_COLUMN_COUNT} className="font-medium">
                            {group.label} ({group.employees.length})
                          </TableCell>
                        </TableRow>
                      )}
                      {group.employees.map((emp) => {
                        const last = scoresByEmployee[emp.id];
                        const status = statusByEmployee[emp.id];
                        const statusDotClass =
                          status === 'approved' || (status as string) === 'completed'
                            ? 'bg-emerald-500'
                            : status === 'rejected'
                              ? 'bg-red-500'
                              : status === 'submitted'
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
                            <TableCell
                              className="w-10"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Checkbox
                                checked={selectedEmployeeIds.has(emp.id)}
                                onCheckedChange={(checked) =>
                                  toggleEmployeeSelection(emp.id, checked === true)
                                }
                                aria-label={`Sélectionner ${emp.name}`}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{emp.name}</TableCell>
                            <TableCell className="text-muted-foreground">{employeePosteLabel(emp)}</TableCell>
                            <TableCell className="text-muted-foreground">{emp.branch_name ?? '—'}</TableCell>
                            <TableCell className="text-right">
                              {last != null ? (
                                <Badge variant={last >= 70 ? 'default' : 'secondary'}>
                                  {formatEvaluationPercentage(last)}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <span
                                className={`inline-block h-2.5 w-2.5 rounded-full ${statusDotClass}`}
                                title={status ? t(`evalStatus.${status}`) : t('evalStatus.none')}
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
            </div>
            {filteredEmployees.length > 0 && (
              <PaginationControls
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                itemsPerPage={pagination.itemsPerPage}
                totalItems={pagination.totalItems}
                onPageChange={pagination.setCurrentPage}
                onItemsPerPageChange={pagination.setItemsPerPage}
                canGoPrev={pagination.canGoPrev}
                canGoNext={pagination.canGoNext}
              />
            )}
          </CardContent>
        </Card>

        <EvaluationExportDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          defaultSelectedFields={EVALUATION_TABLE_EXPORT_DEFAULT_FIELDS}
          onExport={handleBulkExport}
        />

        <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogTitle>
              {t('evaluation.bulkDeleteTitle', { count: selectedCount })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('evaluation.bulkDeleteDesc', { period: openPeriodName || period || '—' })}
            </AlertDialogDescription>
            <div className="flex gap-2 justify-end">
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void handleBulkDelete()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t('common.delete')}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        {!isPeriodOpen && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-4 text-sm text-destructive">
              {t('evaluation.periodClosed')}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={closeEvaluationForm}>
        ← {t('evaluation.back')}
      </Button>

      <div className="space-y-3 border-b pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {t('evaluation.evaluate', { name: selectedEmployee.name })}
          </h1>
          {currentStatus && (
            <Badge variant={isSubmitted ? 'secondary' : isFinalized ? 'default' : 'outline'}>
              {t(`evalStatus.${currentStatus}`)}
            </Badge>
          )}
        </div>
        <dl className="grid gap-1.5 text-sm sm:grid-cols-2">
          {selectedEmployee.position && (
            <div>
              <dt className="text-muted-foreground">{t('evaluation.poste')}</dt>
              <dd className="font-medium">{selectedEmployee.position}</dd>
            </div>
          )}
          {selectedEmployee.branch_name && (
            <div>
              <dt className="text-muted-foreground">{t('evaluation.branch')}</dt>
              <dd className="font-medium">{selectedEmployee.branch_name}</dd>
            </div>
          )}
          {departmentName(selectedEmployee.department_id) && (
            <div>
              <dt className="text-muted-foreground">{t('evaluation.service')}</dt>
              <dd className="font-medium">
                {departmentName(selectedEmployee.department_id)}
              </dd>
            </div>
          )}
          {roleName(selectedEmployee.role_id) && (
            <div>
              <dt className="text-muted-foreground">{t('evaluation.role')}</dt>
              <dd className="font-medium">{roleName(selectedEmployee.role_id)}</dd>
            </div>
          )}
        </dl>
        <p className="text-xs text-muted-foreground">
          {t('evaluation.criteriaMatchNote')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="evaluation-period">{t('evaluation.periodCampaign')}</Label>
        <Input
          id="evaluation-period"
          readOnly
          value={openPeriodName || period || '—'}
          className="max-w-xs border-2 border-blue-300 bg-muted/30 cursor-default"
        />
        <p className="text-xs text-muted-foreground leading-relaxed">
          {openPeriodName && (
            <>
              <span className="font-medium">{openPeriodName}</span>
              {periodDescription ? (
                <> désigne la campagne <span className="font-medium">{periodDescription}</span>.</>
              ) : (
                <>
                  {' '}
                  — code année + trimestre (T1 à T4). Ex.{' '}
                  <span className="font-medium">2026-T2</span> = 2e trimestre 2026.
                </>
              )}
              {' '}{t('evaluation.currentOpenPeriod')}
            </>
          )}
        </p>
      </div>

      {isSubmitted && (
        <Card className="border-secondary/50 bg-secondary/10">
          <CardContent className="py-3 text-sm">
            {t('evaluation.submittedInfo')}
          </CardContent>
        </Card>
      )}

      {isFinalized && (
        <Card className="border-muted">
          <CardContent className="py-3 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-2">
            <span>{t('evaluation.finalizedInfo', { status: t(`evalStatus.${currentStatus}`) })}</span>
            <Button variant="outline" size="sm" className="gap-2" onClick={handlePrintCurrent}>
              <Printer className="h-4 w-4" />
              {t('evaluation.print')}
            </Button>
          </CardContent>
        </Card>
      )}

      {applicableCriteria.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('evaluation.noCriteria')}
          </CardContent>
        </Card>
      ) : (
        applicableCriteria.map((criterion) => (
          <Card key={criterion.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CriterionDescriptionExpand
                      description={criterion.description}
                      variant="icon"
                    >
                      <CardTitle className="text-sm font-medium leading-tight">{getCriterionDisplayName(criterion, lang)}</CardTitle>
                    </CriterionDescriptionExpand>
                    <Badge
                      variant="secondary"
                      className="font-mono tabular-nums text-[11px] shrink-0"
                      title="Coefficient du critère"
                    >
                      ×{Number.isInteger(criterion.weight ?? 1)
                        ? (criterion.weight ?? 1)
                        : (criterion.weight ?? 1).toFixed(2).replace(/\.?0+$/, '')}
                    </Badge>
                  </div>
                </div>
                {showEvaluationValues && formValues[criterion.id] !== undefined && (
                  <Badge variant="outline" className="font-normal text-xs shrink-0">
                    {calculateCriterionScore(
                      criterion.type,
                      formValues[criterion.id],
                      rules,
                      criterion.calculation_rule_id
                    ).toFixed(1)}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <EvaluationCriterionInputs
                criterion={criterion}
                value={formValues[criterion.id]}
                onChange={(v) => setFormValues((prev) => ({ ...prev, [criterion.id]: v }))}
                rules={rules}
                disabled={!canEditCriteria}
                showValues={showEvaluationValues}
              />
            </CardContent>
          </Card>
        ))
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{t('evaluation.evaluatorComment')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder={
              isSubmitted
                ? t('evaluation.commentPlaceholderReview')
                : t('evaluation.commentPlaceholderDraft')
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
          {showEvaluationValues && (
            <div>
              <p className="text-3xl font-bold text-primary">
                {formatEvaluationPercentage(totalPercentage)}
              </p>
            </div>
          )}
          {!showEvaluationValues && <div />}
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
                  {t('evaluation.submit')}
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
                    {t('evaluation.accept')}
                  </Button>
                  <Button
                    variant="destructive"
                    className="gap-2"
                    onClick={() => {
                      setSelectedReasonId('');
                      setRejectDialogOpen(true);
                    }}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {t('evaluation.reject')}
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>{t('evaluation.rejectDialogTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('evaluation.rejectDialogDesc')}</AlertDialogDescription>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t('evaluation.rejectReasonLabel')}</Label>
              <Select
                value={selectedReasonId}
                onValueChange={(id) => {
                  setSelectedReasonId(id);
                  if (id === OTHER_REASON_VALUE) return;
                  const reason = rejectionReasons.find((r) => r.id === id);
                  if (reason) setNotes(getRejectionReasonLabel(reason, lang));
                }}
              >
                <SelectTrigger className="border-2 border-blue-300 bg-blue-50">
                  <SelectValue placeholder={t('evaluation.rejectReasonPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {rejectionReasons
                    .filter((r) => r.is_active !== false)
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {getRejectionReasonLabel(r, lang)}
                      </SelectItem>
                    ))}
                  <SelectItem value={OTHER_REASON_VALUE}>{t('evaluation.rejectReasonOther')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              placeholder={t('evaluation.commentPlaceholderReview')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const success = await persistEvaluation('rejected', false);
                if (success) setRejectDialogOpen(false);
              }}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('evaluation.confirmReject')
              )}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <EvaluationAuditTrail entries={activityLog} />
    </div>
  );
}
