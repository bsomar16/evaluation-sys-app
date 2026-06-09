import { useState, useEffect } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, TrendingUp, Building2, Trophy, CheckCircle, Clock, Award, TrendingDown, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';

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
}

interface AgentWithScore {
  id: string;
  name: string;
  email: string;
  role_name: string;
  avg_score: number;
  eval_count: number;
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
  const [topAgents, setTopAgents] = useState<AgentWithScore[]>([]);
  const [worstAgents, setWorstAgents] = useState<AgentWithScore[]>([]);

  const [branchEmblaRef, branchEmblaApi] = useEmblaCarousel({ loop: true, align: 'center', containScroll: 'trimSnaps' });
  const [departmentEmblaRef, departmentEmblaApi] = useEmblaCarousel({ loop: true, align: 'center', containScroll: 'trimSnaps' });

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

  const accessibleBranches = getAccessibleBranches();
  const accessibleDepartments = getAccessibleDepartments();

  useEffect(() => {
    if (selectedBranch && branchEmblaApi && accessibleBranches.length > 0) {
      const selectedIndex = accessibleBranches.findIndex(item => item.id === selectedBranch);
      if (selectedIndex !== -1) {
        branchEmblaApi.scrollTo(selectedIndex);
      }
    }
  }, [selectedBranch, accessibleBranches, branchEmblaApi]);

  // Auto-select branch dynamically while carousel is being scrolled
  useEffect(() => {
    if (!branchEmblaApi) return;

    const handleScroll = () => {
      const selectedIndex = branchEmblaApi.selectedScrollSnap();
      if (selectedIndex >= 0 && selectedIndex < accessibleBranches.length) {
        setSelectedBranch(accessibleBranches[selectedIndex].id);
      }
    };

    branchEmblaApi.on('scroll', handleScroll);
    branchEmblaApi.on('select', handleScroll);
    return () => {
      branchEmblaApi.off('scroll', handleScroll);
      branchEmblaApi.off('select', handleScroll);
    };
  }, [branchEmblaApi, accessibleBranches]);

  useEffect(() => {
    if (selectedDepartment && departmentEmblaApi && accessibleDepartments.length > 0) {
      const selectedIndex = accessibleDepartments.findIndex(item => item.id === selectedDepartment);
      if (selectedIndex !== -1) {
        departmentEmblaApi.scrollTo(selectedIndex);
      }
    }
  }, [selectedDepartment, accessibleDepartments, departmentEmblaApi]);

  // Auto-select department dynamically while carousel is being scrolled
  useEffect(() => {
    if (!departmentEmblaApi) return;

    const handleScroll = () => {
      const selectedIndex = departmentEmblaApi.selectedScrollSnap();
      if (selectedIndex >= 0 && selectedIndex < accessibleDepartments.length) {
        setSelectedDepartment(accessibleDepartments[selectedIndex].id);
      }
    };

    departmentEmblaApi.on('scroll', handleScroll);
    departmentEmblaApi.on('select', handleScroll);
    return () => {
      departmentEmblaApi.off('scroll', handleScroll);
      departmentEmblaApi.off('select', handleScroll);
    };
  }, [departmentEmblaApi, accessibleDepartments]);

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

      // Load base data
      const { data: usersRaw } = await supabase.from('users').select('*');
      const filteredUsers = usersRaw?.filter((u) => !u.archived_at) ?? [];
      setUsers(filteredUsers);

      const { data: evaluations } = await supabase.from('evaluations').select('*');
      setAllEvaluations(evaluations || []);

      const { data: branchesData } = await supabase.from('branches').select('*');
      setBranches(branchesData || []);

      const { data: departmentsData } = await supabase.from('departments').select('*');
      setDepartments(departmentsData || []);

      const { data: rolesData } = await supabase.from('roles').select('*');
      setRoles(rolesData || []);

      const { data: trainings } = await supabase.from('training_requests').select('*');

      // Extract periods from evaluations
      const uniquePeriods = [...new Set((evaluations || []).map(e => e.period).filter(Boolean))];
      const sortedPeriods = Array.from(uniquePeriods).sort().reverse(); // Most recent first
      setPeriods(sortedPeriods);
      if (sortedPeriods.length > 0) {
        setSelectedPeriod(sortedPeriods[0]);
      }

      // Calculate stats
      const activeCount = filteredUsers.filter(u => u.is_active).length;
      const completedEvals = evaluations?.filter(e => e.status === 'completed').length || 0;

      setStats({
        totalUsers: filteredUsers.length,
        activeUsers: activeCount,
        totalEvaluations: evaluations?.length || 0,
        completedEvaluations: completedEvals,
        totalBranches: branchesData?.length || 0,
        totalTrainings: trainings?.length || 0,
      });

      // Pre-select first branch
      if (currentUser?.branch_id) {
        setSelectedBranch(currentUser.branch_id);
      } else if (branchesData?.length > 0) {
        setSelectedBranch(branchesData[0].id);
      }

      // Calculate evaluation statuses for charts
      const statusMap = new Map<string, number>();
      evaluations?.forEach(e => {
        const count = (statusMap.get(e.status) || 0) + 1;
        statusMap.set(e.status, count);
      });

      const evalStatusArray = Array.from(statusMap).map((s) => ({
        status: s[0],
        count: s[1],
        color: s[0] === 'completed' ? 'hsl(var(--primary))' : s[0] === 'pending' ? 'hsl(var(--chart-2))' : 'hsl(var(--muted))',
      }));
      setEvaluationStatus(evalStatusArray);

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
      console.error('Error loading initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  function getAccessibleBranches() {
    if (!branches.length) return [];
    
    const userRole = roles.find(r => r.id === currentUser?.role_id);
    if (userRole?.name?.toLowerCase().includes('directeur')) {
      return branches;
    }
    
    if (currentUser?.branch_id) {
      return branches.filter(b => b.id === currentUser.branch_id);
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
          <h3 className="text-sm font-semibold text-foreground mb-3">Période d'Évaluation</h3>
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
            <h3 className="text-sm font-semibold text-foreground mb-3">Département</h3>
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
                      <p className="text-muted-foreground text-sm">Aucun département disponible</p>
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
            <CardTitle className="text-base font-heading">Responsable du Département</CardTitle>
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
                  <Pie data={evaluationStatus} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="count" label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`}>
                    {evaluationStatus.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">Aucune donnée d'évaluation</div>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart - Training Status */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading">Statut des Formations</CardTitle>
          </CardHeader>
          <CardContent>
            {trainingStatus.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={trainingStatus} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="count" label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`}>
                    {trainingStatus.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">Aucune donnée de formation</div>
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

        {/* Pie Chart - Roles Distribution */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading">Employés par Rôle</CardTitle>
          </CardHeader>
          <CardContent>
            {roleData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={roleData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="count" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {roleData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">Aucune donnée de rôle</div>
            )}
          </CardContent>
        </Card>
      </div>

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
