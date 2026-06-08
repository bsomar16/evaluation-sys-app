import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, TrendingUp, Building2, Trophy, CheckCircle, Clock } from 'lucide-react';
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

interface HierarchyNode {
  id: string;
  name: string;
  type: 'branch' | 'role' | 'department' | 'employee';
  children: HierarchyNode[];
  expanded: boolean;
  level: number;
  score?: number;
  period?: string;
  parent_id?: string;
}

interface EmployeeScore {
  id: string;
  name: string;
  email: string;
  score: number;
  period: string;
  branch_id: string;
  role_id: string;
  department_id?: string;
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
  const [hierarchyNodes, setHierarchyNodes] = useState<HierarchyNode[]>([]);
  const [topEmployees, setTopEmployees] = useState<EmployeeScore[]>([]);
  const [worstEmployees, setWorstEmployees] = useState<EmployeeScore[]>([]);
  const [employeesByPeriod, setEmployeesByPeriod] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load stats
      const { data: usersRaw } = await supabase.from('users').select('id, is_active, branch_id, role_id, archived_at');
      const users = usersRaw?.filter((u) => !u.archived_at) ?? [];
      const { data: evaluations } = await supabase.from('evaluations').select('id, status, score');
      const { data: trainings } = await supabase.from('training_requests').select('id, status');
      const { data: branches } = await supabase.from('branches').select('id, name');
      const { data: roles } = await supabase.from('roles').select('id, name');

      const activeCount = users?.filter(u => u.is_active).length || 0;
      const completedEvals = evaluations?.filter(e => e.status === 'completed').length || 0;
      const completedTrains = trainings?.filter(t => t.status === 'completed').length || 0;

      setStats({
        totalUsers: users?.length || 0,
        activeUsers: activeCount,
        totalEvaluations: evaluations?.length || 0,
        completedEvaluations: completedEvals,
        totalBranches: branches?.length || 0,
        totalTrainings: trainings?.length || 0,
      });

      // Build hierarchical view
      buildHierarchy(branches || [], user?.branch_id);

      // Get top and worst employees
      getTopAndWorstEmployees(evaluations || [], users || []);

      // Get employees by period
      getEmployeesByPeriod(evaluations || [], users || []);

      // Branch data with employee counts
      const branchCounts = new Map<string, { employees: number; evaluations: number }>();
      branches?.forEach(b => {
        branchCounts.set(b.id, { employees: 0, evaluations: 0 });
      });

      users?.forEach(u => {
        if (u.branch_id && branchCounts.has(u.branch_id)) {
          const data = branchCounts.get(u.branch_id);
          if (data) data.employees++;
        }
      });

      const branchDataArray: BranchData[] = (branches || []).map(b => ({
        name: b.name,
        employees: branchCounts.get(b.id)?.employees || 0,
        evaluations: evaluations?.filter(e => {
          const evalUser = users?.find(u => evaluations?.some(ev => ev.id === e.id && u.branch_id === b.id));
          return evalUser !== undefined;
        }).length || 0,
      }));
      setBranchData(branchDataArray);

      // Role distribution
      const roleCounts = new Map<string, number>();
      const colors = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--destructive))', 'hsl(var(--accent))'];
      
      roles?.forEach((r, i) => {
        const count = users?.filter(u => u.role_id === r.id).length || 0;
        if (count > 0) {
          roleCounts.set(r.name, count);
        }
      });

      const roleDataArray: RoleData[] = Array.from(roleCounts).map((r, i) => ({
        name: r[0],
        count: r[1],
        color: colors[i % colors.length],
      }));
      setRoleData(roleDataArray);

      // Evaluation status
      const statusMap = new Map<string, number>();
      evaluations?.forEach(e => {
        const count = (statusMap.get(e.status) || 0) + 1;
        statusMap.set(e.status, count);
      });

      const evalStatusArray: EvaluationData[] = Array.from(statusMap).map((s, i) => ({
        status: s[0],
        count: s[1],
        color: s[0] === 'completed' ? 'hsl(var(--primary))' : s[0] === 'pending' ? 'hsl(var(--chart-2))' : 'hsl(var(--muted))',
      }));
      setEvaluationStatus(evalStatusArray);

      // Training status
      const trainingMap = new Map<string, number>();
      trainings?.forEach(t => {
        const count = (trainingMap.get(t.status) || 0) + 1;
        trainingMap.set(t.status, count);
      });

      const trainStatusArray: EvaluationData[] = Array.from(trainingMap).map((t, i) => ({
        status: t[0],
        count: t[1],
        color: t[0] === 'completed' ? 'hsl(var(--primary))' : t[0] === 'pending' ? 'hsl(var(--chart-2))' : 'hsl(var(--muted))',
      }));
      setTrainingStatus(trainStatusArray);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const buildHierarchy = (branches: any[], parentId?: string) => {
    const hierarchy = buildBranchTree(branches, parentId);
    setHierarchyNodes(hierarchy);
  };

  const buildBranchTree = (branches: any[], parentId?: string, level = 0): HierarchyNode[] => {
    return (branches || [])
      .filter(b => b.parent_branch_id === (parentId || null))
      .map(branch => ({
        id: branch.id,
        name: branch.name,
        type: 'branch' as const,
        children: buildBranchTree(branches, branch.id, level + 1),
        expanded: level === 0,
        level,
        parent_id: parentId,
      }));
  };

  const getTopAndWorstEmployees = (evaluations: any[], users: any[]) => {
    try {
      const scores = (evaluations || [])
        .filter(e => e.score !== null)
        .map(e => ({
          score: e.score,
          email: e.employee_email,
          period: e.period,
        }));

      const avgScores = new Map<string, { total: number; count: number; period: string }>();
      scores.forEach(s => {
        const current = avgScores.get(s.email) || { total: 0, count: 0, period: s.period };
        avgScores.set(s.email, {
          total: current.total + s.score,
          count: current.count + 1,
          period: s.period,
        });
      });

      const employeeScores: EmployeeScore[] = Array.from(avgScores).map(([email, data]) => {
        const user = users.find(u => u.email === email);
        return {
          id: user?.id || email,
          name: user?.name || email,
          email,
          score: data.total / data.count,
          period: data.period,
          branch_id: user?.branch_id || '',
          role_id: user?.role_id || '',
          department_id: user?.department_id,
        };
      });

      employeeScores.sort((a, b) => b.score - a.score);
      setTopEmployees(employeeScores.slice(0, 5));
      setWorstEmployees(employeeScores.slice(-5).reverse());
    } catch (error) {
      console.error('Error getting top/worst employees:', error);
    }
  };

  const getEmployeesByPeriod = (evaluations: any[], users: any[]) => {
    const periodMap = new Map<string, number>();
    evaluations?.forEach(e => {
      const count = (periodMap.get(e.period) || 0) + 1;
      periodMap.set(e.period, count);
    });

    const data = Array.from(periodMap).map(([period, count]) => ({
      period,
      count,
    }));

    setEmployeesByPeriod(data);
  };

  const toggleNodeExpanded = (nodeId: string) => {
    const updateNodes = (nodes: HierarchyNode[]): HierarchyNode[] => {
      return nodes.map(node => {
        if (node.id === nodeId) {
          return { ...node, expanded: !node.expanded };
        }
        return { ...node, children: updateNodes(node.children) };
      });
    };

    setHierarchyNodes(updateNodes(hierarchyNodes));
  };

  const renderHierarchyNode = (node: HierarchyNode, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id} className="ml-" style={{ marginLeft: `${depth * 20}px` }}>
        <div className="flex items-center gap-2 py-2 px-3 hover:bg-muted/50 rounded">
          {hasChildren ? (
            <button
              onClick={() => toggleNodeExpanded(node.id)}
              className="w-5 h-5 flex items-center justify-center hover:bg-accent rounded text-sm"
            >
              {node.expanded ? '▼' : '▶'}
            </button>
          ) : (
            <div className="w-5" />
          )}
          <Building2 size={16} className="text-muted-foreground" />
          <span className="text-sm font-medium">{node.name}</span>
        </div>
        {node.expanded && hasChildren && (
          <div>
            {node.children.map(child => renderHierarchyNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

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

      {/* Hierarchical View */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <Building2 size={18} />
            Structure Hiérarchique (Filiales)
          </CardTitle>
        </CardHeader>
        <CardContent className="max-h-96 overflow-y-auto">
          {hierarchyNodes.length > 0 ? (
            <div>
              {hierarchyNodes.map(node => renderHierarchyNode(node))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Aucune filiale trouvée</p>
          )}
        </CardContent>
      </Card>

      {/* Top and Worst Employees */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Employees */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <Trophy size={18} className="text-primary" />
              Meilleurs Employés
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topEmployees.length > 0 ? (
              <div className="space-y-3">
                {topEmployees.map((emp, i) => (
                  <div key={emp.email} className="flex items-center justify-between p-2 rounded bg-muted/30">
                    <div>
                      <p className="font-medium text-sm">{i + 1}. {emp.name}</p>
                      <p className="text-xs text-muted-foreground">{emp.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg text-primary">{emp.score.toFixed(1)}/20</p>
                      <p className="text-xs text-muted-foreground">{emp.period}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Aucune donnée</p>
            )}
          </CardContent>
        </Card>

        {/* Worst Employees */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <TrendingUp size={18} className="text-destructive" />
              Employés à Améliorer
            </CardTitle>
          </CardHeader>
          <CardContent>
            {worstEmployees.length > 0 ? (
              <div className="space-y-3">
                {worstEmployees.map((emp, i) => (
                  <div key={emp.email} className="flex items-center justify-between p-2 rounded bg-muted/30">
                    <div>
                      <p className="font-medium text-sm">{i + 1}. {emp.name}</p>
                      <p className="text-xs text-muted-foreground">{emp.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg text-destructive">{emp.score.toFixed(1)}/20</p>
                      <p className="text-xs text-muted-foreground">{emp.period}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Aucune donnée</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Employees by Period Chart */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-heading">Employés par Période d'Évaluation</CardTitle>
        </CardHeader>
        <CardContent>
          {employeesByPeriod.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={employeesByPeriod}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground">Aucune donnée de période</div>
          )}
        </CardContent>
      </Card>

      {/* Charts Row 1 */}
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
