import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useEmblaCarousel from 'embla-carousel-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, TrendingUp, Building2, Trophy, CheckCircle, Clock, Award, TrendingDown, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { hideLoadingOverlay } from '@/lib/loading-overlay';
import {
  getAllEvaluationPeriods,
  getCurrentOpenPeriod,
  getDashboardPeriods,
} from '@/lib/evaluation-period-db';
import { collectBranchScopeIds } from '@/lib/branch-tree';
import {
  fetchEvaluationCriteria,
  fetchCalculationRules,
} from '@/lib/evaluation-config-storage';
import {
  formatEvaluationScore,
  resolveEvaluationPercentage,
} from '@/lib/evaluation-storage';
import type { CalculationRuleRecord, EvaluationCriterionRecord } from '@/lib/evaluation-calculator';

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalEvaluations: number;
  completedEvaluations: number;
  totalBranches: number;
  totalTrainings: number;
}

interface RoleData {
  name: string;
  count: number;
  color: string;
}

interface EvaluationData {
  status: string;
  count: number;
  color: string;
  label?: string;
}

interface AgentWithScore {
  id: string;
  name: string;
  email: string;
  role_name: string;
  avg_score: number;
  eval_count: number;
}

interface EmployeePerformance extends AgentWithScore {
  branch_id: string;
  branch_name: string;
  department_id: string;
  department_name: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeUsers: 0,
    totalEvaluations: 0,
    completedEvaluations: 0,
    totalBranches: 0,
    totalTrainings: 0,
  });
  const [roleData, setRoleData] = useState<RoleData[]>([]);
  const [trainingStatus, setTrainingStatus] = useState<EvaluationData[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selector data states
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [periods, setPeriods] = useState<string[]>([]);
  const [openPeriodName, setOpenPeriodName] = useState<string | null>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [allEvaluations, setAllEvaluations] = useState<any[]>([]);
  const [evaluationCriteria, setEvaluationCriteria] = useState<EvaluationCriterionRecord[]>([]);
  const [calculationRules, setCalculationRules] = useState<CalculationRuleRecord[]>([]);
  
  // Selected values
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [expandedBranch, setExpandedBranch] = useState<boolean>(true); // Expansion state for hierarchy
  
  // Filtered data
  const [departmentManager, setDepartmentManager] = useState<any>(null);
  
  // Initialization tracking
  const hasInitializedSelection = useRef(false);
  const hasInitializedPeriod = useRef(false);
  
  // Selected employee details
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeePerformance | null>(null);

  const [branchEmblaRef, branchEmblaApi] = useEmblaCarousel({ loop: true, align: 'center', containScroll: 'trimSnaps' });
  const [departmentEmblaRef, departmentEmblaApi] = useEmblaCarousel({ loop: true, align: 'center', containScroll: 'trimSnaps' });

  // Helper functions to get accessible data
  function getAccessibleBranches() {
    if (!branches.length) return [];
    
    // Developer account (hardcoded admin) can see all branches
    if (currentUser?.role === 'developer') {
      return branches;
    }
    
    const userRole = roles.find(r => r.id === currentUser?.role_id);
    if (userRole?.name?.toLowerCase().includes('directeur') || userRole?.name?.toLowerCase().includes('admin')) {
      return branches;
    }
    
    if (currentUser?.branch_id) {
      const userBranch = branches.find(b => b.id === currentUser.branch_id);
      if (!userBranch) return [];
      
      // Inclure la branche de l'utilisateur ET ses filiales filles
      const childBranchIds = userBranch.child_branches || [];
      const accessibleBranchIds = [currentUser.branch_id, ...childBranchIds];
      
      return branches.filter(b => accessibleBranchIds.includes(b.id));
    }
    
    return branches;
  }

  function getAccessibleDepartments() {
    if (!selectedBranch) return [];

    // Inclut les services de la filiale sélectionnée ET de ses filiales filles
    const scopeIds = collectBranchScopeIds(selectedBranch, branches);
    return departments.filter(d =>
      users.some(u => u.department_id === d.id && scopeIds.includes(u.branch_id))
    );
  }

  /** Périmètre filiales pour les stats : filiale sélectionnée (+ filles) ou toutes les filiales accessibles */
  function getDashboardBranchScopeIds(): string[] {
    if (!branches.length) return [];

    if (selectedBranch) {
      return collectBranchScopeIds(selectedBranch, branches);
    }

    const ids = new Set<string>();
    getAccessibleBranches().forEach((branch) => {
      collectBranchScopeIds(branch.id, branches).forEach((id) => ids.add(id));
    });
    return [...ids];
  }

  function handleBranchClick(branchId: string) {
    if (selectedBranch === branchId) {
      setSelectedBranch('');
      setSelectedDepartment('');
      return;
    }
    setSelectedBranch(branchId);
    setSelectedDepartment('');
  }

  function handleDepartmentClick(departmentId: string) {
    setSelectedDepartment((prev) => (prev === departmentId ? '' : departmentId));
  }

  const getCarouselItemStyle = (itemIndex: number, selectedItems: any[], selectedId: string) => {
    const selectedIndex = selectedItems.findIndex(item => item.id === selectedId);
    if (selectedIndex === -1) return { opacity: 1, transform: 'scale(1)' };

    const total = selectedItems.length;
    let distance = Math.abs(itemIndex - selectedIndex);
    distance = Math.min(distance, total - distance);

    let opacity = 1;
    let scale = 1;

    switch (distance) {
      case 0:
        opacity = 1;
        scale = 1;
        break;
      case 1:
        opacity = 0.88;
        scale = 0.92;
        break;
      case 2:
        opacity = 0.75;
        scale = 0.84;
        break;
      default:
        opacity = 0.58;
        scale = 0.76;
        break;
    }

    return {
      opacity,
      transform: `scale(${scale})`,
      transformOrigin: 'center',
      transition: 'all 0.25s ease-in-out',
    };
  };

  const handleEvaluationStatusClick = (data: any) => {
    // Map status to filter types for Evaluation page
    let statusFilter = '';
    if (data.dataKey === 'status') {
      statusFilter = data.name;
    } else if (data.payload?.status) {
      statusFilter = data.payload.status;
    } else if (data.name) {
      statusFilter = data.name;
    }

    if (statusFilter) {
      // Map to evaluation page filter statuses (3 grouped categories)
      if (statusFilter === 'en-attente') {
        // En attente = draft + rejected
        navigate('/evaluation', { state: { filterByStatus: ['draft', 'rejected'] } });
      } else if (statusFilter === 'soumis') {
        // Soumis
        navigate('/evaluation', { state: { filterByStatus: ['submitted'] } });
      } else if (statusFilter === 'complet') {
        // Complet = approved + completed
        navigate('/evaluation', { state: { filterByStatus: ['approved', 'completed'] } });
      }
    }
  };

  const accessibleBranches = getAccessibleBranches();
  const accessibleDepartments = getAccessibleDepartments();

  // Scroll to selected branch when manually selected
  useEffect(() => {
    if (selectedBranch && branchEmblaApi && accessibleBranches.length > 0) {
      const selectedIndex = accessibleBranches.findIndex(item => item.id === selectedBranch);
      if (selectedIndex !== -1) {
        branchEmblaApi.scrollTo(selectedIndex);
      }
    }
  }, [selectedBranch, branchEmblaApi, accessibleBranches]);

  // Scroll to selected department when manually selected
  useEffect(() => {
    if (selectedDepartment && departmentEmblaApi && accessibleDepartments.length > 0) {
      const selectedIndex = accessibleDepartments.findIndex(item => item.id === selectedDepartment);
      if (selectedIndex !== -1) {
        departmentEmblaApi.scrollTo(selectedIndex);
      }
    }
  }, [selectedDepartment, departmentEmblaApi, accessibleDepartments]);

  // Initialize branch selection only once when data is loaded
  useEffect(() => {
    if (hasInitializedSelection.current || !branches.length || !currentUser) return;
    
    hasInitializedSelection.current = true;
    
    const accessibleList = getAccessibleBranches();
    if (accessibleList.length > 0) {
      if (currentUser?.branch_id) {
        setSelectedBranch(currentUser.branch_id);
      } else {
        setSelectedBranch(accessibleList[0].id);
      }
    }
  }, [branches, currentUser, getAccessibleBranches]);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setCurrentUser(JSON.parse(userData));
    }
    
    const loadPeriods = async () => {
      const dbPeriods = await getAllEvaluationPeriods();
      const eligible = getDashboardPeriods(dbPeriods);
      setPeriods(eligible.map((p) => p.name));

      const openPeriod = await getCurrentOpenPeriod();
      setOpenPeriodName(openPeriod?.name ?? null);

      if (!hasInitializedPeriod.current && eligible.length > 0) {
        hasInitializedPeriod.current = true;
        if (openPeriod?.name) {
          setSelectedPeriod(openPeriod.name);
        } else {
          setSelectedPeriod(eligible[eligible.length - 1].name);
        }
      }
    };

    loadPeriods();
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);

      const results = await Promise.allSettled([
        supabase.from('users').select('*'),
        supabase.from('evaluations').select('*'),
        supabase.from('branches').select('*'),
        supabase.from('departments').select('*'),
        supabase.from('roles').select('*'),
        supabase.from('training_requests').select('*'),
        fetchEvaluationCriteria(),
        fetchCalculationRules(),
      ]);

      // Extract successful results with defaults
      const [usersResult, evaluationsResult, branchesResult, departmentsResult, rolesResult, trainingsResult, criteriaResult, rulesResult] = results;
      
      const { data: usersRaw } = usersResult.status === 'fulfilled' ? usersResult.value : { data: [] };
      const { data: evaluations } = evaluationsResult.status === 'fulfilled' ? evaluationsResult.value : { data: [] };
      const { data: branchesData } = branchesResult.status === 'fulfilled' ? branchesResult.value : { data: [] };
      const { data: departmentsData } = departmentsResult.status === 'fulfilled' ? departmentsResult.value : { data: [] };
      const { data: rolesData } = rolesResult.status === 'fulfilled' ? rolesResult.value : { data: [] };
      const { data: trainings } = trainingsResult.status === 'fulfilled' ? trainingsResult.value : { data: [] };
      const criteria = criteriaResult.status === 'fulfilled' ? criteriaResult.value : [];
      const rules = rulesResult.status === 'fulfilled' ? rulesResult.value : [];

      const filteredUsers = usersRaw?.filter((u) => !u.archived_at) ?? [];
      setUsers(filteredUsers);
      setAllEvaluations(evaluations || []);
      setBranches(branchesData || []);
      setDepartments(departmentsData || []);
      setRoles(rolesData || []);
      setEvaluationCriteria(criteria);
      setCalculationRules(rules);

      // Calculate stats
      const activeCount = filteredUsers.filter(u => u.is_active).length;
      const completedEvals = evaluations?.length || 0;

      setStats({
        totalUsers: filteredUsers.length,
        activeUsers: activeCount,
        totalEvaluations: evaluations?.length || 0,
        completedEvaluations: completedEvals,
        totalBranches: branchesData?.length || 0,
        totalTrainings: trainings?.length || 0,
      });

      // Calculate training statuses for charts
      const trainingMap = new Map<string, number>();
      trainings?.forEach(t => {
        const count = (trainingMap.get(t.status) || 0) + 1;
        trainingMap.set(t.status, count);
      });

      const trainStatusArray = Array.from(trainingMap).map((t) => ({
        status: t[0],
        count: t[1],
        color: t[0] === 'completed' ? 'hsl(var(--primary))' : t[0] === 'pending' ? 'hsl(var(--chart-2))' : 'hsl(var(--muted))',
      }));
      setTrainingStatus(trainStatusArray);

      // Calculate role data
      const roleCounts = new Map<string, number>();
      const colors = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--destructive))', 'hsl(var(--accent))'];
      
      rolesData?.forEach((r) => {
        const count = filteredUsers?.filter(u => u.role_id === r.id).length || 0;
        if (count > 0) {
          roleCounts.set(r.name, count);
        }
      });

      const roleDataArray = Array.from(roleCounts).map((r, i) => ({
        name: r[0],
        count: r[1],
        color: colors[i % colors.length],
      }));
      setRoleData(roleDataArray);

    } catch (error) {
      console.error('Error loading initial dashboard data:', error);
    } finally {
      setLoading(false);
      hideLoadingOverlay();
    }
  };

  const loadDepartmentData = () => {
    if (!selectedPeriod || !selectedBranch || !selectedDepartment) {
      setDepartmentManager(null);
      return;
    }

    // Responsable du service (premier utilisateur du service dans le périmètre filiale + filles)
    const scopeIds = collectBranchScopeIds(selectedBranch, branches);
    const manager = users.find(
      u => u.department_id === selectedDepartment && scopeIds.includes(u.branch_id)
    );
    setDepartmentManager(manager || null);
  };

  // Load department data when selections change
  useEffect(() => {
    loadDepartmentData();
  }, [selectedPeriod, selectedBranch, selectedDepartment, users, roles, allEvaluations]);

  const resolvePercent = (evaluation: any, employee: any): number =>
    resolveEvaluationPercentage(evaluation, evaluationCriteria, calculationRules, employee) ?? 0;

  // Employés évalués dans le périmètre sélectionné (filiale + filles, service, période),
  // triés par moyenne décroissante. Si aucun service n'est sélectionné => tous les services
  // de la filiale (et de ses filiales filles).
  const scopedEmployees = useMemo<EmployeePerformance[]>(() => {
    if (!selectedPeriod || users.length === 0) return [];

    const branchScopeIds = getDashboardBranchScopeIds();
    if (branchScopeIds.length === 0) return [];

    return users
      .filter(
        (u) =>
          !u.archived_at &&
          u.email &&
          branchScopeIds.includes(u.branch_id) &&
          (!selectedDepartment || u.department_id === selectedDepartment)
      )
      .map((employee) => {
        const evals = allEvaluations.filter(
          (e) => e.employee_email === employee.email && e.period === selectedPeriod && e.score !== null
        );
        const avgScore =
          evals.length > 0
            ? evals.reduce((sum: number, e: any) => sum + resolvePercent(e, employee), 0) / evals.length
            : 0;

        return {
          id: employee.id,
          name: employee.name,
          email: employee.email,
          role_name: roles.find((r) => r.id === employee.role_id)?.name || '—',
          avg_score: avgScore,
          eval_count: evals.length,
          branch_id: employee.branch_id,
          branch_name: branches.find((b) => b.id === employee.branch_id)?.name || '—',
          department_id: employee.department_id,
          department_name: departments.find((d) => d.id === employee.department_id)?.name || '—',
        } as EmployeePerformance;
      })
      .filter((e) => e.eval_count > 0)
      .sort((a, b) => b.avg_score - a.avg_score);
  }, [selectedPeriod, selectedBranch, selectedDepartment, users, allEvaluations, branches, departments, roles, evaluationCriteria, calculationRules]);

  // Un seul meilleur et un seul moins bon employé du périmètre
  const topEmployee = scopedEmployees.length > 0 ? scopedEmployees[0] : null;
  const worstEmployee = scopedEmployees.length > 1 ? scopedEmployees[scopedEmployees.length - 1] : null;

  // Évaluation du responsable de service (si elle existe) pour la période sélectionnée
  const departmentManagerScore = useMemo(() => {
    if (!departmentManager?.email || !selectedPeriod) return null;
    const evals = allEvaluations.filter(
      (e) => e.employee_email === departmentManager.email && e.period === selectedPeriod && e.score !== null
    );
    if (evals.length === 0) return null;
    return {
      avg: evals.reduce((sum: number, e: any) => sum + resolvePercent(e, departmentManager), 0) / evals.length,
      count: evals.length,
    };
  }, [departmentManager, selectedPeriod, allEvaluations, evaluationCriteria, calculationRules]);

  const dashboardMaxScore = 100;

  // Libellé du périmètre courant (pour les titres)
  const scopeLabel = (() => {
    const branchName = branches.find((b) => b.id === selectedBranch)?.name;
    const deptName = departments.find((d) => d.id === selectedDepartment)?.name;
    if (deptName && branchName) return `${branchName} • ${deptName}`;
    if (branchName) return `${branchName} (tous les services)`;
    return 'Toutes les filiales (tous les services)';
  })();

  // Statut des évaluations (périmètre filiale + service + période sélectionnés)
  const evaluationStatus = useMemo<EvaluationData[]>(() => {
    if (!selectedPeriod || users.length === 0) return [];

    const branchScopeIds = getDashboardBranchScopeIds();
    if (branchScopeIds.length === 0) return [];
    const scopedUsers = users.filter(
      (u) =>
        !u.archived_at &&
        u.email &&
        branchScopeIds.includes(u.branch_id) &&
        (!selectedDepartment || u.department_id === selectedDepartment)
    );
    const scopedEmails = new Set(scopedUsers.map((u) => u.email));

    const filteredEvals = allEvaluations.filter(
      (e) => e.period === selectedPeriod && scopedEmails.has(e.employee_email)
    );

    const notSubmittedCount = filteredEvals.filter((e) => !e.status || e.status === 'draft').length;
    const rejectedCount = filteredEvals.filter((e) => e.status === 'rejected').length;
    const submittedCount = filteredEvals.filter((e) => e.status === 'submitted').length;
    const completeCount = filteredEvals.filter((e) => e.status === 'approved' || e.status === 'completed').length;

    const evaluatedEmails = new Set(filteredEvals.map((e) => e.employee_email));
    const eligibleWithoutEval = scopedUsers.filter((emp) => !evaluatedEmails.has(emp.email)).length;
    const enAttenteCount = notSubmittedCount + rejectedCount + eligibleWithoutEval;

    return [
      { status: 'en-attente', count: enAttenteCount, color: '#9ca3af', label: 'En attente' },
      { status: 'soumis', count: submittedCount, color: '#f59e0b', label: 'Soumis' },
      { status: 'complet', count: completeCount, color: '#10b981', label: 'Complet' },
    ];
  }, [selectedPeriod, selectedBranch, selectedDepartment, users, allEvaluations, branches]);

  // Courbe des moyennes d'évaluation par période (périmètre filiale + service)
  const periodEvaluationCurve = useMemo(() => {
    if (periods.length === 0) return [];

    const branchScopeIds = getDashboardBranchScopeIds();
    if (branchScopeIds.length === 0) return [];
    const scopedEmails = new Set(
      users
        .filter(
          (u) =>
            !u.archived_at &&
            u.email &&
            branchScopeIds.includes(u.branch_id) &&
            (!selectedDepartment || u.department_id === selectedDepartment)
        )
        .map((u) => u.email)
    );

    return periods.map((period) => {
      const evals = allEvaluations.filter(
        (e) => e.period === period && e.score !== null && scopedEmails.has(e.employee_email)
      );
      const average =
        evals.length > 0
          ? parseFloat(
              (
                evals.reduce((sum: number, e: any) => {
                  const employee = users.find((u) => u.email === e.employee_email);
                  return sum + (employee ? resolveEvaluationPercentage(e, evaluationCriteria, calculationRules, employee) ?? 0 : 0);
                }, 0) / evals.length
              ).toFixed(2)
            )
          : null;

      return {
        period,
        average,
        count: evals.length,
        isSelected: period === selectedPeriod,
      };
    });
  }, [selectedBranch, selectedDepartment, periods, users, branches, allEvaluations, selectedPeriod, evaluationCriteria, calculationRules]);

  const hasPeriodCurveData = periodEvaluationCurve.some((p) => p.average !== null);

  // Dynamic stat cards from real data
  const dynamicStatCards = [
    { label: 'Employés totaux', value: stats.totalUsers.toString(), icon: Users, change: `${stats.activeUsers} actifs` },
    { label: 'Évaluations', value: stats.totalEvaluations.toString(), icon: TrendingUp, change: `${stats.completedEvaluations} complétées` },
    { label: 'Formations', value: stats.totalTrainings.toString(), icon: Trophy, change: 'Demandes' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Tableau de bord</h1>
        <p className="text-muted-foreground text-sm mt-1">Aperçu du système et statistiques</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {dynamicStatCards.map((stat) => (
          <Card key={stat.label} className="border-border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{stat.label}</p>
                  <p className="text-2xl font-bold font-heading mt-1 text-foreground">{loading ? '-' : stat.value}</p>
                  <p className="text-xs text-primary mt-1">{stat.change}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                  <stat.icon size={20} className="text-accent-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Hierarchy Filters - Professional Display with Steps & Cards */}
      <div className="space-y-6">
        {/* Period Steps - With Arrow Format */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Période d'Évaluation (Mois)</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {periods.length > 0 ? (
              periods.map((period, idx) => {
                const isOpen = period === openPeriodName;
                return (
                <div key={period} className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedPeriod(period)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedPeriod === period
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'
                    }`}
                  >
                    {isOpen && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-500/25"
                        title="Période ouverte"
                        aria-label="Période ouverte"
                      />
                    )}
                    {period}
                  </button>
                  {idx < periods.length - 1 && (
                    <span className="text-muted-foreground">→</span>
                  )}
                </div>
                );
              })
            ) : (
              <p className="text-muted-foreground text-sm">Aucune période disponible</p>
            )}
          </div>
        </div>

        {/* Branch Carousel - Horizontal loop with arrows */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Filiale
            {selectedBranch && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">(cliquer à nouveau pour tout afficher)</span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => branchEmblaApi?.scrollPrev()}
              className="flex-shrink-0 p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Scroll left"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="flex-1 overflow-hidden">
              <div ref={branchEmblaRef} className="overflow-hidden">
                <div className="flex gap-3 pb-2 pl-2 pr-2">
                  {accessibleBranches.length > 0 ? (
                    accessibleBranches.map((branch, index) => (
                      <div key={branch.id} className="flex-shrink-0 w-[clamp(180px,22vw,280px)] box-border">
                        <button
                          data-carousel-item
                          data-branch-id={branch.id}
                          onClick={() => handleBranchClick(branch.id)}
                          style={getCarouselItemStyle(index, accessibleBranches, selectedBranch)}
                          className={`w-full h-full p-3 rounded-xl border-2 text-left transition-all duration-300 ${
                            selectedBranch === branch.id
                              ? 'border-primary bg-primary/10 shadow-md'
                              : 'border-border bg-card hover:border-muted-foreground/50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Building2 size={16} className={selectedBranch === branch.id ? 'text-primary' : 'text-muted-foreground'} />
                            <div>
                              <p className="font-semibold text-sm text-foreground">{branch.name}</p>
                              {branch.code && (
                                <p className="text-xs text-muted-foreground">{branch.code}</p>
                              )}
                            </div>
                          </div>
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm">Aucune filiale accessible</p>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => branchEmblaApi?.scrollNext()}
              className="flex-shrink-0 p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Scroll right"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Department Carousel - Shows when branch selected, horizontal loop with arrows */}
        {selectedBranch && (
          <div className="pl-4 border-l-2 border-l-primary">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Service
              {selectedDepartment && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">(cliquer à nouveau pour tous les services)</span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => departmentEmblaApi?.scrollPrev()}
                className="flex-shrink-0 p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Scroll left"
              >
                <ChevronLeft size={20} />
              </button>

              <div className="flex-1 overflow-hidden">
                <div ref={departmentEmblaRef} className="overflow-hidden">
                  <div className="flex gap-3 pb-2 pl-2 pr-2">
                    {accessibleDepartments.length > 0 ? (
                      accessibleDepartments.map((dept, index) => (
                        <div key={dept.id} className="flex-shrink-0 w-[240px] max-w-[240px] box-border">
                          <button
                            data-carousel-item
                            data-dept-id={dept.id}
                            onClick={() => handleDepartmentClick(dept.id)}
                            style={getCarouselItemStyle(index, accessibleDepartments, selectedDepartment)}
                            className={`w-full h-full p-3 rounded-xl border-2 text-left transition-all duration-300 ${
                              selectedDepartment === dept.id
                                ? 'border-primary bg-primary/10 shadow-md'
                                : 'border-border bg-card hover:border-muted-foreground/50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Users size={16} className={selectedDepartment === dept.id ? 'text-primary' : 'text-muted-foreground'} />
                              <div>
                                <p className="font-semibold text-sm text-foreground">{dept.name}</p>
                              </div>
                            </div>
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground text-sm">Aucun service disponible</p>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => departmentEmblaApi?.scrollNext()}
                className="flex-shrink-0 p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Scroll right"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Department Manager Card */}
      {selectedDepartment && departmentManager && (
        <Card className="border-border shadow-sm border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading">Responsable du Service</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 p-3 rounded bg-muted/30">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold">
                  {departmentManager.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{departmentManager.name}</p>
                  <p className="text-sm text-muted-foreground">{departmentManager.email}</p>
                </div>
              </div>
              <div className="text-right">
                {departmentManagerScore ? (
                  <p className="font-bold text-lg text-primary">{formatEvaluationScore(departmentManagerScore.avg)}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Aucune évaluation</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Meilleur & moins bon employé du périmètre sélectionné (un seul de chaque, dans un seul bloc) */}
      {selectedPeriod && scopedEmployees.length > 0 && (
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2 flex-wrap">
              <Trophy size={18} className="text-amber-600" />
              Meilleur & moins bon employé
              <span className="text-xs font-normal text-muted-foreground">— {scopeLabel}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`grid gap-4 ${worstEmployee ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
              {/* TOP */}
              <button
                onClick={() => topEmployee && setSelectedEmployee(topEmployee)}
                className="text-left p-3 rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Award size={16} className="text-green-600" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-300">Meilleur employé</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{topEmployee?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{topEmployee?.department_name} · {topEmployee?.branch_name}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-lg text-green-600">{formatEvaluationScore(topEmployee?.avg_score ?? 0)}</p>
                  </div>
                </div>
              </button>

              {/* WORST */}
              {worstEmployee && (
                <button
                  onClick={() => setSelectedEmployee(worstEmployee)}
                  className="text-left p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown size={16} className="text-red-600" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">Moins bon employé</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{worstEmployee.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{worstEmployee.department_name} · {worstEmployee.branch_name}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-lg text-red-600">{formatEvaluationScore(worstEmployee.avg_score)}</p>
                    </div>
                  </div>
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Classement des employés du périmètre (décroissant) */}
      {selectedPeriod && scopedEmployees.length > 0 && (
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2 flex-wrap">
              <Users size={18} />
              Classement des employés ({scopedEmployees.length})
              <span className="text-xs font-normal text-muted-foreground">— {scopeLabel}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[480px] overflow-y-auto">
              {scopedEmployees.map((emp, idx) => (
                <button
                  key={emp.id}
                  onClick={() => setSelectedEmployee(emp)}
                  className={`w-full flex items-center justify-between gap-2 p-3 rounded text-left transition-colors border ${
                    selectedEmployee?.id === emp.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border/50 hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`font-bold text-sm w-6 text-center flex-shrink-0 ${idx === 0 ? 'text-green-600' : idx === scopedEmployees.length - 1 && scopedEmployees.length > 1 ? 'text-red-600' : 'text-muted-foreground'}`}>{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{emp.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{emp.role_name} · {emp.department_name} · {emp.branch_name}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-foreground">{formatEvaluationScore(emp.avg_score)}</p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie Chart - Evaluation Status */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2 flex-wrap">
              Statut des Évaluations
              {selectedPeriod && (
                <span className="text-xs font-normal text-muted-foreground">— {selectedPeriod} · {scopeLabel}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {evaluationStatus.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie 
                    data={evaluationStatus} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={60} 
                    outerRadius={100} 
                    paddingAngle={3} 
                    dataKey="count" 
                    label={({ label, count }) => count > 0 ? `${count} ${label}` : ''}
                  >
                    {evaluationStatus.map((entry, index) => (
                      <Cell key={index} fill={entry.color} cursor="pointer" onClick={() => handleEvaluationStatusClick({ name: entry.status })} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} 
                    formatter={(value: any, name: any, props: any) => {
                      const labels: Record<string, string> = {
                        submitted: 'Soumises',
                        approved: 'Approuvées',
                        pending: 'En attente'
                      };
                      const status = props.payload.status;
                      return `${value} évaluation${value > 1 ? 's' : ''}`;
                    }}
                    labelFormatter={(label) => {
                      const labels: Record<string, string> = {
                        submitted: 'Soumises',
                        approved: 'Approuvées',
                        pending: 'En attente'
                      };
                      return labels[label] || label;
                    }}
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: 12, cursor: 'pointer' }} 
                    onClick={(e) => handleEvaluationStatusClick(e)}
                    formatter={(value, entry) => entry.payload.label || value}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">Aucune donnée d'évaluation</div>
            )}
          </CardContent>
        </Card>

        {/* Courbe des évaluations par période */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2 flex-wrap">
              Évolution des évaluations
              <span className="text-xs font-normal text-muted-foreground">— {scopeLabel}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasPeriodCurveData ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={periodEvaluationCurve} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(value) => (value === selectedPeriod ? `▶ ${value}` : value)}
                  />
                  <YAxis domain={[0, dashboardMaxScore]} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                    formatter={(value: number) => [formatEvaluationScore(value), 'Moyenne']}
                    labelFormatter={(label) => `Période : ${label}${label === selectedPeriod ? ' (sélectionnée)' : ''}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="average"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                    connectNulls={false}
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      if (cx == null || cy == null || payload.average == null) return null;
                      const isSelected = payload.isSelected;
                      return (
                        <circle
                          key={payload.period}
                          cx={cx}
                          cy={cy}
                          r={isSelected ? 7 : 4}
                          fill={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                          stroke={isSelected ? 'hsl(var(--primary))' : 'none'}
                          strokeWidth={isSelected ? 2 : 0}
                        />
                      );
                    }}
                    activeDot={{ r: 8, fill: 'hsl(var(--primary))' }}
                    name="Moyenne"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                Aucune évaluation pour ce périmètre
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Employee Details Section */}
      {selectedEmployee && selectedPeriod && (
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading">Détails Employé - {selectedEmployee.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Filiale</p>
                <p className="font-semibold text-sm">{selectedEmployee.branch_name}</p>
              </div>
              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Service</p>
                <p className="font-semibold text-sm">{selectedEmployee.department_name}</p>
              </div>
              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Rôle</p>
                <p className="font-semibold text-sm">{selectedEmployee.role_name}</p>
              </div>
              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Email</p>
                <p className="font-semibold text-sm text-xs">{selectedEmployee.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="border border-border rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Moyenne</p>
                <p className="text-2xl font-bold text-primary">{formatEvaluationScore(selectedEmployee.avg_score)}</p>
              </div>
              {(() => {
                const employee = users.find((u) => u.email === selectedEmployee.email);
                const evals = allEvaluations.filter(e => e.employee_email === selectedEmployee.email && e.period === selectedPeriod && e.score !== null);
                const percentages = evals.map((e) =>
                  employee ? resolvePercent(e, employee) : (e.score ?? 0)
                );
                const min = percentages.length > 0 ? Math.min(...percentages) : 0;
                const max = percentages.length > 0 ? Math.max(...percentages) : 0;
                return (
                  <>
                    <div className="border border-border rounded-lg p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Minimum</p>
                      <p className="text-2xl font-bold text-red-600">{formatEvaluationScore(min)}</p>
                    </div>
                    <div className="border border-border rounded-lg p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Maximum</p>
                      <p className="text-2xl font-bold text-green-600">{formatEvaluationScore(max)}</p>
                    </div>
                    <div className="border border-border rounded-lg p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Évaluations</p>
                      <p className="text-2xl font-bold text-blue-600">{evals.length}</p>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Evaluations Details */}
            <div>
              <h3 className="font-semibold text-sm mb-3">Détail des Évaluations Acceptées (Mois: {selectedPeriod})</h3>
              <div className="max-h-64 overflow-y-auto border border-border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-center p-2">Score</th>
                      <th className="text-left p-2">Commentaire</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const employee = users.find((u) => u.email === selectedEmployee.email);
                      const evals = allEvaluations.filter(e => e.employee_email === selectedEmployee.email && e.period === selectedPeriod && e.score !== null);
                      return evals.length > 0 ? (
                        evals.map((eval_, idx) => (
                          <tr key={idx} className="border-t border-border hover:bg-muted/30">
                            <td className="p-2">{eval_.created_at ? new Date(eval_.created_at).toLocaleDateString() : '—'}</td>
                            <td className="p-2 text-center font-semibold">
                              {formatEvaluationScore(employee ? resolvePercent(eval_, employee) : eval_.score)}
                            </td>
                            <td className="p-2 text-muted-foreground">{eval_.feedback || '—'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-muted-foreground">
                            Aucune évaluation pour cette période
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evaluation Curve Chart */}
      {selectedEmployee && (
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading">Courbe d'Évaluation - {selectedEmployee.name}</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const employee = users.find((u) => u.email === selectedEmployee.email);
              const evalsByPeriod = new Map<string, number[]>();

              allEvaluations
                .filter(e => e.employee_email === selectedEmployee.email && e.score !== null)
                .forEach(e => {
                  const pct = employee ? resolvePercent(e, employee) : (e.score ?? 0);
                  if (!evalsByPeriod.has(e.period)) {
                    evalsByPeriod.set(e.period, []);
                  }
                  evalsByPeriod.get(e.period)!.push(pct);
                });

              // Convert to chart data
              const chartData = Array.from(evalsByPeriod.entries())
                .sort(([periodA], [periodB]) => periodA.localeCompare(periodB))
                .map(([period, scores]) => ({
                  period,
                  average: parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)),
                  min: Math.min(...scores),
                  max: Math.max(...scores),
                  count: scores.length,
                }));

              return chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="period" 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip 
                      formatter={(value: number) => value.toFixed(2)}
                      labelFormatter={(label) => `Période: ${label}`}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="average" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', r: 4 }}
                      activeDot={{ r: 6 }}
                      name="Moyenne"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="max" 
                      stroke="#22c55e" 
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      dot={false}
                      name="Maximum"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="min" 
                      stroke="#ef4444" 
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      dot={false}
                      name="Minimum"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Aucune évaluation disponible pour cet employé
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading flex items-center gap-2">
              <CheckCircle size={18} className="text-primary" />
              Évaluations Complétées
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{loading ? '-' : stats.completedEvaluations}</p>
            <p className="text-xs text-muted-foreground mt-1">sur {stats.totalEvaluations} au total</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading flex items-center gap-2">
              <Clock size={18} className="text-chart-2" />
              Évaluations en Attente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{loading ? '-' : (stats.totalEvaluations - stats.completedEvaluations)}</p>
            <p className="text-xs text-muted-foreground mt-1">en attente de réalisation</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading flex items-center gap-2">
              <TrendingUp size={18} className="text-accent" />
              Évaluations soumises
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {loading || !selectedPeriod
                ? '-'
                : (evaluationStatus.find((s) => s.status === 'soumis')?.count ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedPeriod ? `${selectedPeriod} · ${scopeLabel}` : 'sélectionnez une période'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
