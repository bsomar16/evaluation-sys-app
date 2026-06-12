import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useEmblaCarousel from 'embla-carousel-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, TrendingUp, Building2, Trophy, CheckCircle, Clock, Award, TrendingDown, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { hideLoadingOverlay } from '@/lib/loading-overlay';
import { getCurrentQuarterPeriod } from '@/lib/evaluation-period-label';
import { getOpenEvaluationPeriodName } from '@/lib/evaluation-period-storage';

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalEvaluations: number;
  completedEvaluations: number;
  totalBranches: number;
  totalTrainings: number;
}

interface BranchData {
  name: string;
  employees: number;
  evaluations: number;
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

interface DepartmentHierarchy {
  id: string;
  name: string;
  employees: EmployeePerformance[];
  expanded?: boolean;
}

interface BranchHierarchy {
  id: string;
  name: string;
  departments: DepartmentHierarchy[];
  expanded?: boolean;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeUsers: 0,
    totalEvaluations: 0,
    completedEvaluations: 0,
    totalBranches: 0,
    totalTrainings: 0,
  });
  const [branchData, setBranchData] = useState<BranchData[]>([]);
  const [roleData, setRoleData] = useState<RoleData[]>([]);
  const [evaluationStatus, setEvaluationStatus] = useState<EvaluationData[]>([]);
  const [trainingStatus, setTrainingStatus] = useState<EvaluationData[]>([]);
  const [topEmployees, setTopEmployees] = useState<BranchHierarchy[]>([]);
  const [worstEmployees, setWorstEmployees] = useState<BranchHierarchy[]>([]);
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  
  // Selector data states
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [periods, setPeriods] = useState<string[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [allEvaluations, setAllEvaluations] = useState<any[]>([]);
  
  // Selected values
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [expandedBranch, setExpandedBranch] = useState<boolean>(true); // Expansion state for hierarchy
  
  // Filtered data
  const [departmentManager, setDepartmentManager] = useState<any>(null);
  const [departmentAgents, setDepartmentAgents] = useState<AgentWithScore[]>([]);
  
  // Initialization tracking
  const hasInitializedSelection = useRef(false);
  const [topAgents, setTopAgents] = useState<AgentWithScore[]>([]);
  const [worstAgents, setWorstAgents] = useState<AgentWithScore[]>([]);
  
  // Filter by branch/department for TOP/WORST
  const [filterByBranch, setFilterByBranch] = useState<string | null>(null);
  const [filterByDepartment, setFilterByDepartment] = useState<string | null>(null);
  
  // Selected employee details
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeePerformance | null>(null);

  const [branchEmblaRef, branchEmblaApi] = useEmblaCarousel({ loop: true, align: 'center', containScroll: 'trimSnaps' });
  const [departmentEmblaRef, departmentEmblaApi] = useEmblaCarousel({ loop: true, align: 'center', containScroll: 'trimSnaps' });

  const navigate = useNavigate();

  // Helper functions to get accessible data
  function getAccessibleBranches() {
    if (!branches.length) return [];
    
    const userRole = roles.find(r => r.id === currentUser?.role_id);
    if (userRole?.name?.toLowerCase().includes('directeur')) {
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
    
    return departments.filter(d => {
      const deptUsers = users.filter(u => u.department_id === d.id && u.branch_id === selectedBranch);
      return deptUsers.length > 0;
    });
  }

  // Calculate employee performance by branch and department hierarchy
  const calculateEmployeePerformance = () => {
    if (!selectedPeriod || allEvaluations.length === 0 || users.length === 0) {
      return { top: [], worst: [] };
    }

    // Get accessible branch IDs for role-based filtering
    const getAccessibleBranchIds = (): string[] => {
      if (!branches.length) return [];
      
      const userRole = roles.find(r => r.id === currentUser?.role_id);
      if (userRole?.name?.toLowerCase().includes('directeur')) {
        return branches.map(b => b.id);
      }
      
      if (currentUser?.branch_id) {
        const userBranch = branches.find(b => b.id === currentUser.branch_id);
        if (!userBranch) return [];
        
        const childBranchIds = userBranch.child_branches || [];
        return [currentUser.branch_id, ...childBranchIds];
      }
      
      return branches.map(b => b.id);
    };

    const accessibleBranchIds = getAccessibleBranchIds();

    // Calculate scores for all users, applying role-based access filtering
    let employeeScores: EmployeePerformance[] = users
      .filter(u => !u.archived_at && u.email && accessibleBranchIds.includes(u.branch_id))
      .map(employee => {
        const evals = allEvaluations.filter(e => e.employee_email === employee.email && e.period === selectedPeriod && e.score !== null);
        const avgScore = evals.length > 0 ? evals.reduce((sum: number, e: any) => sum + e.score, 0) / evals.length : 0;
        
        return {
          id: employee.id,
          name: employee.name,
          email: employee.email,
          role_name: roles.find(r => r.id === employee.role_id)?.name || '—',
          avg_score: avgScore,
          eval_count: evals.length,
          branch_id: employee.branch_id,
          branch_name: branches.find(b => b.id === employee.branch_id)?.name || '—',
          department_id: employee.department_id,
          department_name: departments.find(d => d.id === employee.department_id)?.name || '—',
        };
      });

    // Apply filters based on selection (with hierarchy: department > branch > manual filter)
    if (filterByDepartment) {
      employeeScores = employeeScores.filter(e => e.department_id === filterByDepartment);
    } else if (filterByBranch) {
      employeeScores = employeeScores.filter(e => e.branch_id === filterByBranch);
    }

    // Filter employees with at least one evaluation and sort (only top 1)
    const withEvals = employeeScores.filter(e => e.eval_count > 0);
    
    const topList = [...withEvals].sort((a, b) => b.avg_score - a.avg_score).slice(0, 1);
    const worstList = [...withEvals].sort((a, b) => a.avg_score - b.avg_score).slice(0, 1);

    // Build hierarchical structures
    const buildHierarchy = (employees: EmployeePerformance[]): BranchHierarchy[] => {
      const branchMap = new Map<string, Map<string, EmployeePerformance[]>>();
      
      employees.forEach(emp => {
        if (!branchMap.has(emp.branch_id)) {
          branchMap.set(emp.branch_id, new Map());
        }
        const deptMap = branchMap.get(emp.branch_id)!;
        if (!deptMap.has(emp.department_id)) {
          deptMap.set(emp.department_id, []);
        }
        deptMap.get(emp.department_id)!.push(emp);
      });

      return Array.from(branchMap.entries()).map(([branchId, deptMap]) => ({
        id: branchId,
        name: branches.find(b => b.id === branchId)?.name || '—',
        departments: Array.from(deptMap.entries()).map(([deptId, emps]) => ({
          id: deptId,
          name: departments.find(d => d.id === deptId)?.name || '—',
          employees: emps,
        })),
      }));
    };

    return {
      top: buildHierarchy(topList),
      worst: buildHierarchy(worstList),
    };
  };

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

  // Helper to get filtered evaluations for the currently open period and accessible branches
  const getFilteredEvaluationsForPeriod = () => {
    if (!selectedPeriod || allEvaluations.length === 0) return [];
    
    // Get accessible branch IDs
    const getAccessibleBranchIds = (): string[] => {
      if (!branches.length) return [];
      
      const userRole = roles.find(r => r.id === currentUser?.role_id);
      if (userRole?.name?.toLowerCase().includes('directeur')) {
        return branches.map(b => b.id);
      }
      
      if (currentUser?.branch_id) {
        const userBranch = branches.find(b => b.id === currentUser.branch_id);
        if (!userBranch) return [];
        
        const childBranchIds = userBranch.child_branches || [];
        return [currentUser.branch_id, ...childBranchIds];
      }
      
      return [];
    };
    
    const accessibleBranchIds = getAccessibleBranchIds();
    
    // Filter evaluations for selected period and accessible branches
    return allEvaluations.filter(e => {
      // Check period match
      if (e.period !== selectedPeriod) return false;
      
      // Check if employee is in accessible branch
      const evaluatee = users.find(u => u.email === e.employee_email);
      if (!evaluatee) return false;
      
      return accessibleBranchIds.includes(evaluatee.branch_id);
    });
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

  // Update TOP/WORST employees when filter changes
  useEffect(() => {
    const { top, worst } = calculateEmployeePerformance();
    setTopEmployees(top);
    setWorstEmployees(worst);
  }, [selectedPeriod, selectedBranch, filterByBranch, filterByDepartment, allEvaluations, users, branches, departments, roles]);

  const accessibleBranches = getAccessibleBranches();
  const accessibleDepartments = getAccessibleDepartments();

  // Update selection dynamically during scroll
  const updateBranchSelection = useCallback(() => {
    if (!branchEmblaApi || accessibleBranches.length === 0) return;
    const selectedIndex = branchEmblaApi.selectedScrollSnap();
    if (selectedIndex >= 0 && selectedIndex < accessibleBranches.length) {
      setSelectedBranch(accessibleBranches[selectedIndex].id);
    }
  }, [branchEmblaApi, accessibleBranches]);

  const updateDepartmentSelection = useCallback(() => {
    if (!departmentEmblaApi || accessibleDepartments.length === 0) return;
    const selectedIndex = departmentEmblaApi.selectedScrollSnap();
    if (selectedIndex >= 0 && selectedIndex < accessibleDepartments.length) {
      setSelectedDepartment(accessibleDepartments[selectedIndex].id);
    }
  }, [departmentEmblaApi, accessibleDepartments]);

  // Listen to carousel selection (not scroll — scroll fights with explicit clicks)
  useEffect(() => {
    if (!branchEmblaApi) return;

    branchEmblaApi.on('select', updateBranchSelection);

    return () => {
      branchEmblaApi.off('select', updateBranchSelection);
    };
  }, [branchEmblaApi, updateBranchSelection]);

  useEffect(() => {
    if (!departmentEmblaApi) return;

    departmentEmblaApi.on('select', updateDepartmentSelection);

    return () => {
      departmentEmblaApi.off('select', updateDepartmentSelection);
    };
  }, [departmentEmblaApi, updateDepartmentSelection]);

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

  // Helper: Get eligible employees for evaluation (in accessible branches, not archived)
  const getEligibleEmployees = (): any[] => {
    if (branches.length === 0 || users.length === 0) return [];
    
    const getAccessibleBranchIds = (): string[] => {
      if (!branches.length) return [];
      
      const userRole = roles.find(r => r.id === currentUser?.role_id);
      if (userRole?.name?.toLowerCase().includes('directeur')) {
        return branches.map(b => b.id);
      }
      
      if (currentUser?.branch_id) {
        const userBranch = branches.find(b => b.id === currentUser.branch_id);
        if (!userBranch) return [];
        
        const childBranchIds = userBranch.child_branches || [];
        return [currentUser.branch_id, ...childBranchIds];
      }
      
      return [];
    };
    
    const accessibleBranchIds = getAccessibleBranchIds();
    
    // Return employees in accessible branches (not archived)
    return users.filter(u => 
      u.branch_id && 
      accessibleBranchIds.includes(u.branch_id) && 
      !u.archived_at
    );
  };

  // Helper: Count eligible employees WITHOUT an evaluation for current period
  const getEligibleEmployeesWithoutEvaluation = (): number => {
    if (!selectedPeriod) return 0;
    
    const eligibleEmployees = getEligibleEmployees();
    
    // Get emails of employees with evaluations for this period
    const evaluatedEmails = new Set(
      allEvaluations
        .filter(e => e.period === selectedPeriod)
        .map(e => e.employee_email)
    );
    
    // Count eligible employees NOT in the evaluated set
    return eligibleEmployees.filter(emp => !evaluatedEmails.has(emp.email)).length;
  };

  // Recalculate evaluation statuses when period or user context changes
  useEffect(() => {
    if (!selectedPeriod) {
      setEvaluationStatus([]);
      return;
    }
    
    const filteredEvals = getFilteredEvaluationsForPeriod();
    
    // Count evaluations by status and group into 3 categories
    const notSubmittedCount = filteredEvals.filter(e => !e.status || e.status === 'draft').length;
    const rejectedCount = filteredEvals.filter(e => e.status === 'rejected').length;
    const submittedCount = filteredEvals.filter(e => e.status === 'submitted').length;
    const completeCount = filteredEvals.filter(e => e.status === 'approved' || e.status === 'completed').length;
    
    // Add eligible employees without evaluation to "En attente" (if branches are loaded)
    let eligibleWithoutEval = 0;
    if (branches.length > 0) {
      eligibleWithoutEval = getEligibleEmployeesWithoutEvaluation();
    }
    
    // Group into 3 categories: En attente (draft+rejected+eligible without eval), Soumis, Complet
    const enAttenteCount = notSubmittedCount + rejectedCount + eligibleWithoutEval;
    
    // Always show all 3 categories (even with 0), so legend displays all options
    const evalStatusArray = [
      {
        status: 'en-attente',
        count: enAttenteCount,
        color: '#9ca3af', // gray
        label: 'En attente'
      },
      {
        status: 'soumis',
        count: submittedCount,
        color: '#f59e0b', // amber
        label: 'Soumis'
      },
      {
        status: 'complet',
        count: completeCount,
        color: '#10b981', // emerald
        label: 'Complet'
      }
    ];
    
    setEvaluationStatus(evalStatusArray);
  }, [selectedPeriod, allEvaluations, branches, currentUser, roles, users]);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setCurrentUser(JSON.parse(userData));
    }
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);

      const [
        { data: usersRaw },
        { data: evaluations },
        { data: branchesData },
        { data: departmentsData },
        { data: rolesData },
        { data: trainings },
        { data: periodsData },
      ] = await Promise.all([
        supabase.from('users').select('*'),
        supabase.from('evaluations').select('*'),
        supabase.from('branches').select('*'),
        supabase.from('departments').select('*'),
        supabase.from('roles').select('*'),
        supabase.from('training_requests').select('*'),
        supabase.from('evaluation_periods').select('name').order('created_at', { ascending: false }),
      ]);

      const filteredUsers = usersRaw?.filter((u) => !u.archived_at) ?? [];
      setUsers(filteredUsers);
      setAllEvaluations(evaluations || []);
      setBranches(branchesData || []);
      setDepartments(departmentsData || []);
      setRoles(rolesData || []);

      // Get periods from evaluation_periods table, fall back to evaluations if table is empty
      let sortedPeriods: string[] = [];
      
      if (periodsData && periodsData.length > 0) {
        // Use periods from evaluation_periods table
        sortedPeriods = periodsData.map((p: any) => p.name).filter(Boolean);
      } else {
        // Fall back to extracting periods from evaluations
        const uniquePeriods = [...new Set((evaluations || []).map(e => e.period).filter(Boolean))];
        sortedPeriods = Array.from(uniquePeriods).sort((a, b) => {
          // Extract year and quarter from "Q2 2026" format
          const aMatch = a.match(/Q(\d+)\s(\d{4})/i);
          const bMatch = b.match(/Q(\d+)\s(\d{4})/i);
          
          if (!aMatch || !bMatch) {
            // Fallback: string comparison if format doesn't match
            return b.localeCompare(a);
          }
          
          const [, aQuarter, aYear] = aMatch;
          const [, bQuarter, bYear] = bMatch;
          const aDate = new Date(parseInt(aYear), (parseInt(aQuarter) - 1) * 3, 1);
          const bDate = new Date(parseInt(bYear), (parseInt(bQuarter) - 1) * 3, 1);
          
          return bDate.getTime() - aDate.getTime(); // Most recent first
        });
      }
      
      // Ensure we always have the currently open period if it exists
      const openPeriodName = getOpenEvaluationPeriodName();
      const periodToUse = openPeriodName || getCurrentQuarterPeriod();
      
      if (!sortedPeriods.includes(periodToUse)) {
        sortedPeriods.unshift(periodToUse);
      }
      
      setPeriods(sortedPeriods);
      if (sortedPeriods.length > 0) {
        setSelectedPeriod(sortedPeriods[0]);
      }

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

      // Evaluation status will be calculated in useEffect when period/user changes
      // Initialize empty for now, will be populated once data loads
      setEvaluationStatus([]);

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

      // Calculate branch data
      const branchCounts = new Map<string, number>();
      branchesData?.forEach(b => {
        branchCounts.set(b.id, 0);
      });

      filteredUsers?.forEach(u => {
        if (u.branch_id && branchCounts.has(u.branch_id)) {
          branchCounts.set(u.branch_id, (branchCounts.get(u.branch_id) || 0) + 1);
        }
      });

      const branchDataArray = (branchesData || []).map(b => ({
        name: b.name,
        employees: branchCounts.get(b.id) || 0,
        evaluations: 0,
      }));
      setBranchData(branchDataArray);

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
      setDepartmentAgents([]);
      setTopAgents([]);
      setWorstAgents([]);
      return;
    }

    // Get department manager (first user in department)
    const manager = users.find(
      u => u.department_id === selectedDepartment && u.branch_id === selectedBranch
    );
    setDepartmentManager(manager || null);

    // Get all Agents in this department
    const agentRole = roles.find(r => r.name === 'Agent');
    const departmentAgentsUsers = users.filter(
      u => u.department_id === selectedDepartment && 
           u.branch_id === selectedBranch && 
           u.role_id === agentRole?.id
    );

    // Calculate scores for this period
    const agentsWithScores: AgentWithScore[] = departmentAgentsUsers.map(agent => {
      const agentEvals = allEvaluations.filter(
        e => e.employee_email === agent.email && e.period === selectedPeriod && e.score !== null
      );

      const avgScore = agentEvals.length > 0
        ? agentEvals.reduce((sum: number, e: any) => sum + e.score, 0) / agentEvals.length
        : 0;

      return {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        role_name: 'Agent',
        avg_score: avgScore,
        eval_count: agentEvals.length,
      };
    });

    // Sort by score descending
    agentsWithScores.sort((a, b) => b.avg_score - a.avg_score);

    setDepartmentAgents(agentsWithScores);
    setTopAgents(agentsWithScores.slice(0, 3));
    setWorstAgents(agentsWithScores.slice(-3).reverse());
  };

  // Load department data when selections change
  useEffect(() => {
    loadDepartmentData();
  }, [selectedPeriod, selectedBranch, selectedDepartment, users, roles, allEvaluations]);

  // Dynamic stat cards from real data
  const dynamicStatCards = [
    { label: 'Employés totaux', value: stats.totalUsers.toString(), icon: Users, change: `${stats.activeUsers} actifs` },
    { label: 'Évaluations', value: stats.totalEvaluations.toString(), icon: TrendingUp, change: `${stats.completedEvaluations} complétées` },
    { label: 'Succursales', value: stats.totalBranches.toString(), icon: Building2, change: 'Branches' },
    { label: 'Formations', value: stats.totalTrainings.toString(), icon: Trophy, change: 'Demandes' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Tableau de bord</h1>
        <p className="text-muted-foreground text-sm mt-1">Aperçu du système et statistiques</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              periods.map((period, idx) => (
                <div key={period} className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedPeriod(period)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedPeriod === period
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'
                    }`}
                  >
                    {period}
                  </button>
                  {idx < periods.length - 1 && (
                    <span className="text-muted-foreground">→</span>
                  )}
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">Aucune période disponible</p>
            )}
          </div>
        </div>

        {/* Branch Carousel - Horizontal loop with arrows */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Filiale</h3>
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
                      <div key={branch.id} className="flex-shrink-0 w-[240px] max-w-[240px] box-border">
                        <button
                          data-carousel-item
                          data-branch-id={branch.id}
                          onClick={() => {
                            setSelectedBranch(branch.id);
                            setSelectedDepartment('');
                          }}
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
            <h3 className="text-sm font-semibold text-foreground mb-3">Service</h3>
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
                            onClick={() => setSelectedDepartment(dept.id)}
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
            <div className="flex items-center gap-4 p-3 rounded bg-muted/30">
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold">
                {departmentManager.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-foreground">{departmentManager.name}</p>
                <p className="text-sm text-muted-foreground">{departmentManager.email}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top and Worst Agents */}
      {selectedDepartment && departmentAgents.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Agents */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-heading flex items-center gap-2">
                <Award size={18} className="text-primary" />
                Meilleurs Agents
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topAgents.length > 0 ? (
                <div className="space-y-3">
                  {topAgents.map((agent, i) => (
                    <div key={agent.email} className="flex items-center justify-between p-2 rounded bg-muted/30 border-l-2 border-l-primary">
                      <div>
                        <p className="font-medium text-sm">{i + 1}. {agent.name}</p>
                        <p className="text-xs text-muted-foreground">{agent.email}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg text-primary">{agent.avg_score.toFixed(2)}/20</p>
                        <p className="text-xs text-muted-foreground">{agent.eval_count} éval.</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">Aucun agent évalué</p>
              )}
            </CardContent>
          </Card>

          {/* Worst Agents */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-heading flex items-center gap-2">
                <TrendingDown size={18} className="text-destructive" />
                Agents à Améliorer
              </CardTitle>
            </CardHeader>
            <CardContent>
              {worstAgents.length > 0 ? (
                <div className="space-y-3">
                  {worstAgents.map((agent, i) => (
                    <div key={agent.email} className="flex items-center justify-between p-2 rounded bg-muted/30 border-l-2 border-l-destructive">
                      <div>
                        <p className="font-medium text-sm">{i + 1}. {agent.name}</p>
                        <p className="text-xs text-muted-foreground">{agent.email}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg text-destructive">{agent.avg_score.toFixed(2)}/20</p>
                        <p className="text-xs text-muted-foreground">{agent.eval_count} éval.</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">Aucun agent à améliorer</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* All Agents List */}
      {selectedDepartment && departmentAgents.length > 0 && (
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <Users size={18} />
              Tous les Agents ({departmentAgents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {departmentAgents.map((agent, idx) => (
                <div key={agent.email} className="flex items-center justify-between p-3 rounded hover:bg-muted/50 transition-colors border border-border/50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-muted-foreground">{idx + 1}.</span>
                      <div>
                        <p className="font-medium text-sm">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">{agent.email}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">{agent.avg_score.toFixed(2)}/20</p>
                    <p className="text-xs text-muted-foreground">{agent.eval_count} éval.</p>
                  </div>
                </div>
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
            <CardTitle className="text-base font-heading">Statut des Évaluations</CardTitle>
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

        {/* TOP Employees - Hierarchical */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <Trophy size={18} className="text-amber-600" />
              TOP Employés
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topEmployees.length > 0 ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {topEmployees.map(branch => (
                  <div key={branch.id} className="border border-border/30 rounded-lg overflow-hidden">
                    <button
                      onClick={() => {
                        setExpandedBranches(prev => {
                          const next = new Set(prev);
                          next.has(branch.id) ? next.delete(branch.id) : next.add(branch.id);
                          return next;
                        });
                        // Quand on expand une branche, filtrer par cette branche
                        if (!expandedBranches.has(branch.id)) {
                          setFilterByBranch(branch.id);
                          setFilterByDepartment(null);
                        } else {
                          setFilterByBranch(null);
                        }
                      }}
                      className={`w-full px-4 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors font-semibold text-left ${filterByBranch === branch.id ? 'bg-blue-100 dark:bg-blue-950' : 'bg-muted/20'}`}
                    >
                      {expandedBranches.has(branch.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <Building2 size={14} />
                      <span>{branch.name}</span>
                    </button>
                    {expandedBranches.has(branch.id) && (
                      <div className="bg-background p-2 space-y-1">
                        {branch.departments.map(dept => (
                          <div key={dept.id} className="ml-2 border border-border/20 rounded overflow-hidden">
                            <button
                              onClick={() => {
                                setExpandedDepartments(prev => {
                                  const next = new Set(prev);
                                  const key = `${branch.id}-${dept.id}`;
                                  next.has(key) ? next.delete(key) : next.add(key);
                                  return next;
                                });
                                // Quand on expand un service, filtrer par ce service
                                const key = `${branch.id}-${dept.id}`;
                                if (!expandedDepartments.has(key)) {
                                  setFilterByBranch(branch.id);
                                  setFilterByDepartment(dept.id);
                                } else {
                                  setFilterByDepartment(null);
                                }
                              }}
                              className={`w-full px-3 py-1.5 flex items-center gap-2 hover:bg-muted/30 transition-colors text-sm font-medium text-left ${filterByDepartment === dept.id ? 'bg-blue-100 dark:bg-blue-950' : 'bg-muted/10'}`}
                            >
                              {expandedDepartments.has(`${branch.id}-${dept.id}`) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              <span>{dept.name}</span>
                            </button>
                            {expandedDepartments.has(`${branch.id}-${dept.id}`) && (
                              <div className="bg-background p-2 space-y-1">
                                {dept.employees.map((emp, idx) => (
                                  <button
                                    key={emp.id}
                                    onClick={() => setSelectedEmployee(emp)}
                                    className={`w-full px-3 py-1.5 rounded text-xs flex justify-between items-center transition-colors cursor-pointer ${
                                      selectedEmployee?.id === emp.id
                                        ? 'bg-green-200 dark:bg-green-800 border border-green-500'
                                        : 'bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-900/30'
                                    }`}
                                  >
                                    <div>
                                      <span className="font-semibold text-green-700 dark:text-green-300">#{idx + 1}</span> {emp.name}
                                    </div>
                                    <span className="font-bold text-green-600 dark:text-green-400">{emp.avg_score.toFixed(1)}/20</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground text-center py-4">Aucune donnée d'évaluation</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bar Chart - Branch Employees */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading">Employés par Succursale</CardTitle>
          </CardHeader>
          <CardContent>
            {branchData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={branchData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Bar dataKey="employees" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">Aucune donnée de succursale</div>
            )}
          </CardContent>
        </Card>

        {/* WORST Employees - Hierarchical */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <TrendingDown size={18} className="text-red-600" />
              WORST Employés
            </CardTitle>
          </CardHeader>
          <CardContent>
            {worstEmployees.length > 0 ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {worstEmployees.map(branch => (
                  <div key={branch.id} className="border border-border/30 rounded-lg overflow-hidden">
                    <button
                      onClick={() => {
                        setExpandedBranches(prev => {
                          const next = new Set(prev);
                          next.has(branch.id) ? next.delete(branch.id) : next.add(branch.id);
                          return next;
                        });
                        // Quand on expand une branche, filtrer par cette branche
                        if (!expandedBranches.has(branch.id)) {
                          setFilterByBranch(branch.id);
                          setFilterByDepartment(null);
                        } else {
                          setFilterByBranch(null);
                        }
                      }}
                      className={`w-full px-4 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors font-semibold text-left ${filterByBranch === branch.id ? 'bg-blue-100 dark:bg-blue-950' : 'bg-muted/20'}`}
                    >
                      {expandedBranches.has(branch.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <Building2 size={14} />
                      <span>{branch.name}</span>
                    </button>
                    {expandedBranches.has(branch.id) && (
                      <div className="bg-background p-2 space-y-1">
                        {branch.departments.map(dept => (
                          <div key={dept.id} className="ml-2 border border-border/20 rounded overflow-hidden">
                            <button
                              onClick={() => {
                                setExpandedDepartments(prev => {
                                  const next = new Set(prev);
                                  const key = `${branch.id}-${dept.id}`;
                                  next.has(key) ? next.delete(key) : next.add(key);
                                  return next;
                                });
                                // Quand on expand un service, filtrer par ce service
                                const key = `${branch.id}-${dept.id}`;
                                if (!expandedDepartments.has(key)) {
                                  setFilterByBranch(branch.id);
                                  setFilterByDepartment(dept.id);
                                } else {
                                  setFilterByDepartment(null);
                                }
                              }}
                              className={`w-full px-3 py-1.5 flex items-center gap-2 hover:bg-muted/30 transition-colors text-sm font-medium text-left ${filterByDepartment === dept.id ? 'bg-blue-100 dark:bg-blue-950' : 'bg-muted/10'}`}
                            >
                              {expandedDepartments.has(`${branch.id}-${dept.id}`) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              <span>{dept.name}</span>
                            </button>
                            {expandedDepartments.has(`${branch.id}-${dept.id}`) && (
                              <div className="bg-background p-2 space-y-1">
                                {dept.employees.map((emp, idx) => (
                                  <button
                                    key={emp.id}
                                    onClick={() => setSelectedEmployee(emp)}
                                    className={`w-full px-3 py-1.5 rounded text-xs flex justify-between items-center transition-colors cursor-pointer ${
                                      selectedEmployee?.id === emp.id
                                        ? 'bg-red-200 dark:bg-red-800 border border-red-500'
                                        : 'bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-900/30'
                                    }`}
                                  >
                                    <div>
                                      <span className="font-semibold text-red-700 dark:text-red-300">#{idx + 1}</span> {emp.name}
                                    </div>
                                    <span className="font-bold text-red-600 dark:text-red-400">{emp.avg_score.toFixed(1)}/20</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground text-center py-4">Aucune donnée d'évaluation</div>
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
                <p className="text-2xl font-bold text-primary">{selectedEmployee.avg_score.toFixed(2)}/20</p>
              </div>
              {(() => {
                const evals = allEvaluations.filter(e => e.employee_email === selectedEmployee.email && e.period === selectedPeriod && e.score !== null);
                const scores = evals.map(e => e.score);
                const min = scores.length > 0 ? Math.min(...scores) : 0;
                const max = scores.length > 0 ? Math.max(...scores) : 0;
                return (
                  <>
                    <div className="border border-border rounded-lg p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Minimum</p>
                      <p className="text-2xl font-bold text-red-600">{min.toFixed(2)}</p>
                    </div>
                    <div className="border border-border rounded-lg p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Maximum</p>
                      <p className="text-2xl font-bold text-green-600">{max.toFixed(2)}</p>
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
                      const evals = allEvaluations.filter(e => e.employee_email === selectedEmployee.email && e.period === selectedPeriod && e.score !== null);
                      return evals.length > 0 ? (
                        evals.map((eval_, idx) => (
                          <tr key={idx} className="border-t border-border hover:bg-muted/30">
                            <td className="p-2">{eval_.created_at ? new Date(eval_.created_at).toLocaleDateString() : '—'}</td>
                            <td className="p-2 text-center font-semibold">{eval_.score}/20</td>
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
              // Gather all evaluations for selected employee grouped by period
              const evalsByPeriod = new Map<string, number[]>();
              
              allEvaluations
                .filter(e => e.employee_email === selectedEmployee.email && e.score !== null)
                .forEach(e => {
                  if (!evalsByPeriod.has(e.period)) {
                    evalsByPeriod.set(e.period, []);
                  }
                  evalsByPeriod.get(e.period)!.push(e.score);
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
                    <YAxis domain={[0, 20]} />
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
              <Users size={18} className="text-accent" />
              Utilisateurs Actifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{loading ? '-' : stats.activeUsers}</p>
            <p className="text-xs text-muted-foreground mt-1">sur {stats.totalUsers} utilisateurs</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
