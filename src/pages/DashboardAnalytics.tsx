import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Users, CheckCircle2, AlertTriangle, Star, TrendingDown, Minus,
  ArrowUp, ArrowDown, Building2, Sparkles, ThumbsUp, Target, Trophy,
  type LucideIcon,
} from 'lucide-react';
import {
  LineChart, Line, PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { hideLoadingOverlay } from '@/lib/loading-overlay';
import { getAllEvaluationPeriods, getCurrentOpenPeriod, getDashboardPeriods } from '@/lib/evaluation-period-db';
import { collectBranchScopeIds } from '@/lib/branch-tree';
import { fetchEvaluationCriteria, fetchCalculationRules } from '@/lib/evaluation-config-storage';
import { resolveEvaluationPercentage } from '@/lib/evaluation-storage';
import {
  getCriterionDisplayName, getCriterionMaxPoints,
  type CalculationRuleRecord, type EvaluationCriterionRecord,
} from '@/lib/evaluation-calculator';
import { EVALUATION_STATUS_LABELS } from '@/lib/evaluation-types';
import { useI18n } from '@/lib/i18n';

/**
 * Second gabarit de tableau de bord ("Analytique") — vue synthétique multi-panneaux
 * (KPI, évolution, comparaisons filiale/département, alertes, classements).
 * Choix du gabarit actif dans Configuration (UI Studio) via dashboard-template.ts.
 * Toutes les valeurs sont calculées à partir des données réelles ; aucune donnée
 * n'est fabriquée — un panneau reste vide plutôt que d'afficher un chiffre inventé.
 */

interface Row {
  id: string;
  email: string;
  name: string;
  branch_id: string;
  department_id: string;
  role_id: string;
}

interface DbUser {
  id: string;
  email: string;
  name: string;
  branch_id: string;
  department_id: string;
  role_id: string;
  position?: string | null;
  archived_at?: string | null;
}

interface DbBranch {
  id: string;
  name: string;
  child_branches?: string[];
}

interface DbDepartment {
  id: string;
  name: string;
}

interface DbRole {
  id: string;
  name: string;
}

interface DbEvaluationResponse {
  criterion_id: string;
  points: number;
}

interface DbEvaluation {
  id: string;
  employee_email: string;
  employee_name?: string | null;
  period: string;
  score: number | null;
  status: string;
  responses?: DbEvaluationResponse[];
  created_at?: string | null;
}

interface CurrentUser {
  role?: string;
  role_id?: string;
  branch_id?: string;
}

interface CriterionEvolutionRow {
  id: string;
  name: string;
  values: (number | null)[];
  trend: 'up' | 'down' | 'flat' | null;
}

interface Insight {
  icon: LucideIcon;
  tone: 'red' | 'amber' | 'blue' | 'green';
  title: string;
  detail: string;
  onClick?: () => void;
}

const SCORE_BANDS = [
  { key: 'excellent', min: 90, label: 'Excellent (90 – 100)', color: '#10b981' },
  { key: 'bon', min: 80, label: 'Bon (80 – 89)', color: '#34d399' },
  { key: 'moyen', min: 70, label: 'Moyen (70 – 79)', color: '#f59e0b' },
  { key: 'ameliorer', min: 60, label: 'À améliorer (60 – 69)', color: '#f97316' },
  { key: 'faible', min: 0, label: 'Faible (< 60)', color: '#ef4444' },
] as const;

function scoreBand(pct: number) {
  return SCORE_BANDS.find((b) => pct >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

function fmtPct(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)} %`;
}

function DeltaTag({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-xs text-muted-foreground">—</span>;
  const isUp = delta > 0.05;
  const isDown = delta < -0.05;
  const color = isUp ? 'text-emerald-600' : isDown ? 'text-red-600' : 'text-muted-foreground';
  const Icon = isUp ? ArrowUp : isDown ? ArrowDown : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${color}`}>
      <Icon size={12} />
      {delta > 0 ? '+' : ''}
      {delta.toFixed(1)}%
    </span>
  );
}

export default function DashboardAnalytics() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [users, setUsers] = useState<DbUser[]>([]);
  const [evaluations, setEvaluations] = useState<DbEvaluation[]>([]);
  const [branches, setBranches] = useState<DbBranch[]>([]);
  const [departments, setDepartments] = useState<DbDepartment[]>([]);
  const [roles, setRoles] = useState<DbRole[]>([]);
  const [criteria, setCriteria] = useState<EvaluationCriterionRecord[]>([]);
  const [rules, setRules] = useState<CalculationRuleRecord[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [openPeriodName, setOpenPeriodName] = useState<string | null>(null);

  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('');

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (raw) setCurrentUser(JSON.parse(raw));

    (async () => {
      try {
        setLoading(true);
        const [dbPeriods, openPeriod, results] = await Promise.all([
          getAllEvaluationPeriods(),
          getCurrentOpenPeriod(),
          Promise.allSettled([
            supabase.from('users').select('*'),
            supabase.from('evaluations').select('*'),
            supabase.from('branches').select('*'),
            supabase.from('departments').select('*'),
            supabase.from('roles').select('*'),
            fetchEvaluationCriteria(),
            fetchCalculationRules(),
          ]),
        ]);

        const eligible = getDashboardPeriods(dbPeriods);
        const periodNames = eligible.map((p) => p.name);
        setPeriods(periodNames);
        setOpenPeriodName(openPeriod?.name ?? null);
        setSelectedPeriod(openPeriod?.name ?? periodNames[periodNames.length - 1] ?? '');

        const [usersRes, evalsRes, branchesRes, deptsRes, rolesRes, criteriaRes, rulesRes] = results;
        const usersData: DbUser[] = usersRes.status === 'fulfilled' ? usersRes.value.data ?? [] : [];
        setUsers(usersData.filter((u) => !u.archived_at));
        setEvaluations(evalsRes.status === 'fulfilled' ? evalsRes.value.data ?? [] : []);
        setBranches(branchesRes.status === 'fulfilled' ? branchesRes.value.data ?? [] : []);
        setDepartments(deptsRes.status === 'fulfilled' ? deptsRes.value.data ?? [] : []);
        setRoles(rolesRes.status === 'fulfilled' ? rolesRes.value.data ?? [] : []);
        setCriteria(criteriaRes.status === 'fulfilled' ? criteriaRes.value : []);
        setRules(rulesRes.status === 'fulfilled' ? rulesRes.value : []);
      } catch (err) {
        console.error('Erreur chargement tableau de bord analytique', err);
      } finally {
        setLoading(false);
        hideLoadingOverlay();
      }
    })();
  }, []);

  // Filiales accessibles selon le rôle de l'utilisateur connecté
  const accessibleBranches = useMemo(() => {
    if (!branches.length) return [];
    if (currentUser?.role === 'developer') return branches;
    const userRole = roles.find((r) => r.id === currentUser?.role_id);
    if (userRole?.name?.toLowerCase().includes('directeur') || userRole?.name?.toLowerCase().includes('admin')) {
      return branches;
    }
    if (currentUser?.branch_id) {
      const userBranch = branches.find((b) => b.id === currentUser.branch_id);
      if (!userBranch) return [];
      const childIds: string[] = userBranch.child_branches || [];
      const ids = [currentUser.branch_id, ...childIds];
      return branches.filter((b) => ids.includes(b.id));
    }
    return branches;
  }, [branches, roles, currentUser]);

  const branchScopeIds = useMemo(() => {
    if (selectedBranch) return collectBranchScopeIds(selectedBranch, branches);
    const ids = new Set<string>();
    accessibleBranches.forEach((b) => collectBranchScopeIds(b.id, branches).forEach((id) => ids.add(id)));
    return [...ids];
  }, [selectedBranch, accessibleBranches, branches]);

  const accessibleDepartments = useMemo(() => {
    return departments.filter((d) => users.some((u) => u.department_id === d.id && branchScopeIds.includes(u.branch_id)));
  }, [departments, users, branchScopeIds]);

  const scopedUsers = useMemo<Row[]>(() => {
    return users
      .filter(
        (u) =>
          u.email &&
          branchScopeIds.includes(u.branch_id) &&
          (!selectedDepartment || u.department_id === selectedDepartment) &&
          (!selectedRole || u.role_id === selectedRole)
      )
      .map((u) => ({
        id: u.id, email: u.email, name: u.name,
        branch_id: u.branch_id, department_id: u.department_id, role_id: u.role_id,
      }));
  }, [users, branchScopeIds, selectedDepartment, selectedRole]);

  const scopedEmails = useMemo(() => new Set(scopedUsers.map((u) => u.email)), [scopedUsers]);

  const percentOf = (evaluation: DbEvaluation): number | null => {
    const employee = users.find((u) => u.email === evaluation.employee_email);
    if (!employee || evaluation.score == null) return null;
    return resolveEvaluationPercentage(evaluation, criteria, rules, employee);
  };

  /** Moyenne des évaluations notées d'un ensemble d'emails, pour une période donnée. */
  function averageForScope(emails: Set<string>, period: string): { avg: number | null; count: number } {
    const evals = evaluations.filter((e) => e.period === period && e.score != null && emails.has(e.employee_email));
    const pcts = evals.map(percentOf).filter((p): p is number => p != null);
    if (pcts.length === 0) return { avg: null, count: 0 };
    return { avg: pcts.reduce((a, b) => a + b, 0) / pcts.length, count: pcts.length };
  }

  const previousPeriod = useMemo(() => {
    const idx = periods.indexOf(selectedPeriod);
    return idx > 0 ? periods[idx - 1] : null;
  }, [periods, selectedPeriod]);

  // ── KPI principaux ─────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const effectif = scopedUsers.length;
    const evalsInPeriod = evaluations.filter((e) => e.period === selectedPeriod && scopedEmails.has(e.employee_email));
    const completed = evalsInPeriod.filter((e) => e.status === 'approved' || e.status === 'completed').length;
    const late = evalsInPeriod.filter((e) => !e.status || e.status === 'draft' || e.status === 'rejected').length
      + Math.max(0, effectif - evalsInPeriod.length);
    const { avg } = averageForScope(scopedEmails, selectedPeriod);
    const prevAvg = previousPeriod ? averageForScope(scopedEmails, previousPeriod).avg : null;
    const delta = avg != null && prevAvg != null ? avg - prevAvg : null;
    return {
      effectif,
      completed,
      completedRate: effectif > 0 ? (completed / effectif) * 100 : null,
      late,
      lateRate: effectif > 0 ? (late / effectif) * 100 : null,
      avg,
      delta,
    };
  }, [scopedUsers, evaluations, selectedPeriod, scopedEmails, previousPeriod, criteria, rules, users]);

  // ── Évolution de la performance globale (toutes périodes) ───────────────
  const evolutionData = useMemo(() => {
    return periods.map((period) => ({
      period,
      average: averageForScope(scopedEmails, period).avg,
    }));
  }, [periods, scopedEmails, evaluations, criteria, rules, users]);
  const hasEvolutionData = evolutionData.some((p) => p.average != null);

  // ── Performance par filiale ───────────────────────────────────────────
  const branchPerformance = useMemo(() => {
    return accessibleBranches
      .map((branch) => {
        const ids = collectBranchScopeIds(branch.id, branches);
        const emails = new Set(users.filter((u) => u.email && ids.includes(u.branch_id)).map((u) => u.email));
        const { avg, count } = averageForScope(emails, selectedPeriod);
        const prevAvg = previousPeriod ? averageForScope(emails, previousPeriod).avg : null;
        return {
          id: branch.id,
          name: branch.name,
          avg,
          count,
          delta: avg != null && prevAvg != null ? avg - prevAvg : null,
        };
      })
      .filter((b) => b.avg != null)
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  }, [accessibleBranches, branches, users, selectedPeriod, previousPeriod, evaluations, criteria, rules]);

  // ── Performance par département (Top 5) ──────────────────────────────
  const departmentPerformance = useMemo(() => {
    return accessibleDepartments
      .map((dept) => {
        const emails = new Set(
          users.filter((u) => u.email && u.department_id === dept.id && branchScopeIds.includes(u.branch_id)).map((u) => u.email)
        );
        const { avg, count } = averageForScope(emails, selectedPeriod);
        return { id: dept.id, name: dept.name, avg, count };
      })
      .filter((d) => d.avg != null)
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))
      .slice(0, 5);
  }, [accessibleDepartments, users, branchScopeIds, selectedPeriod, evaluations, criteria, rules]);

  // ── Répartition des résultats (bandes de score) ──────────────────────
  const distribution = useMemo(() => {
    const evalsInPeriod = evaluations.filter((e) => e.period === selectedPeriod && e.score != null && scopedEmails.has(e.employee_email));
    const pcts = evalsInPeriod.map(percentOf).filter((p): p is number => p != null);
    const counts = new Map<string, number>();
    pcts.forEach((p) => {
      const band = scoreBand(p).key;
      counts.set(band, (counts.get(band) ?? 0) + 1);
    });
    const total = pcts.length;
    return SCORE_BANDS.map((band) => ({
      key: band.key,
      label: band.label,
      color: band.color,
      count: counts.get(band.key) ?? 0,
      pct: total > 0 ? ((counts.get(band.key) ?? 0) / total) * 100 : 0,
    })).filter((b) => b.count > 0);
  }, [evaluations, selectedPeriod, scopedEmails, criteria, rules, users]);

  // ── Classement des employés (Top 5 / Flop 5) ─────────────────────────
  const employeeRanking = useMemo(() => {
    return scopedUsers
      .map((u) => {
        const { avg, count } = averageForScope(new Set([u.email]), selectedPeriod);
        return {
          ...u,
          avg,
          count,
          roleName: roles.find((r) => r.id === u.role_id)?.name ?? '—',
        };
      })
      .filter((u) => u.avg != null && u.count > 0)
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  }, [scopedUsers, selectedPeriod, roles, evaluations, criteria, rules, users]);
  const top5 = employeeRanking.slice(0, 5);
  const flop5 = employeeRanking.length > 5 ? [...employeeRanking].reverse().slice(0, 5) : [];

  // ── Évolution par critère d'évaluation (dernières périodes) ──────────
  const criterionEvolution = useMemo(() => {
    const recentPeriods = periods.slice(-6);
    if (recentPeriods.length === 0) return { periods: [] as string[], rows: [] as CriterionEvolutionRow[] };

    const usedCriterionIds = new Set<string>();
    evaluations.forEach((e) => {
      if (!scopedEmails.has(e.employee_email) || !recentPeriods.includes(e.period)) return;
      (e.responses ?? []).forEach((r) => usedCriterionIds.add(r.criterion_id));
    });

    const rows: CriterionEvolutionRow[] = criteria
      .filter((c) => usedCriterionIds.has(c.id))
      .map((criterion) => {
        const perPeriod = recentPeriods.map((period) => {
          let earned = 0;
          let max = 0;
          evaluations.forEach((e) => {
            if (e.period !== period || !scopedEmails.has(e.employee_email)) return;
            const response = (e.responses ?? []).find((r) => r.criterion_id === criterion.id);
            if (!response) return;
            const weight = criterion.weight ?? 1;
            // Points pondérés des deux côtés : le coefficient s'applique aux points obtenus ET au max.
            earned += (response.points ?? 0) * weight;
            max += getCriterionMaxPoints(criterion, rules) * weight;
          });
          return max > 0 ? (earned / max) * 100 : null;
        });
        const lastTwo = perPeriod.filter((v): v is number => v != null).slice(-2);
        const trend: CriterionEvolutionRow['trend'] =
          lastTwo.length === 2 ? (lastTwo[1] > lastTwo[0] + 0.5 ? 'up' : lastTwo[1] < lastTwo[0] - 0.5 ? 'down' : 'flat') : null;
        return {
          id: criterion.id,
          name: getCriterionDisplayName(criterion, 'fr'),
          values: perPeriod,
          trend,
        };
      })
      // Ne garder que les critères avec assez d'historique pour montrer une vraie tendance.
      .filter((row) => row.values.filter((v) => v != null).length >= 2)
      .slice(0, 8);

    return { periods: recentPeriods, rows };
  }, [periods, evaluations, scopedEmails, criteria, rules]);

  // ── Dernières évaluations ─────────────────────────────────────────────
  const latestEvaluations = useMemo(() => {
    return [...evaluations]
      .filter((e) => scopedEmails.has(e.employee_email))
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
      .slice(0, 6)
      .map((e) => {
        const employee = users.find((u) => u.email === e.employee_email);
        return {
          id: e.id,
          name: employee?.name ?? e.employee_name ?? '—',
          position: employee?.position ?? '—',
          branchName: branches.find((b) => b.id === employee?.branch_id)?.name ?? '—',
          pct: percentOf(e),
          status: e.status,
        };
      });
  }, [evaluations, scopedEmails, users, branches, criteria, rules]);

  // ── Alertes & Insights (calculés, pas fabriqués) ─────────────────────
  const insights = useMemo(() => {
    const list: Insight[] = [];

    if (kpi.late > 0) {
      const branchesAffected = new Set(
        evaluations
          .filter((e) => e.period === selectedPeriod && scopedEmails.has(e.employee_email) && e.status !== 'approved' && e.status !== 'completed')
          .map((e) => users.find((u) => u.email === e.employee_email)?.branch_id)
          .filter(Boolean)
      ).size;
      list.push({
        icon: AlertTriangle, tone: 'red',
        title: `${kpi.late} évaluation${kpi.late > 1 ? 's' : ''} en retard`,
        detail: branchesAffected > 0 ? `${branchesAffected} filiale${branchesAffected > 1 ? 's' : ''} concernée${branchesAffected > 1 ? 's' : ''}` : '',
        onClick: () => navigate('/evaluation', { state: { filterByStatus: ['draft', 'rejected'] } }),
      });
    }

    const worstDelta = branchPerformance.filter((b) => b.delta != null).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))[0];
    if (worstDelta && (worstDelta.delta ?? 0) < -1) {
      list.push({
        icon: TrendingDown, tone: 'amber',
        title: 'Baisse de performance',
        detail: `${worstDelta.name} (${worstDelta.delta!.toFixed(1)}%)`,
      });
    }

    const bestDelta = branchPerformance.filter((b) => b.delta != null).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))[0];
    if (bestDelta && (bestDelta.delta ?? 0) > 1) {
      list.push({
        icon: ThumbsUp, tone: 'green',
        title: 'Progression notable',
        detail: `${bestDelta.name} (+${bestDelta.delta!.toFixed(1)}%)`,
      });
    }

    if (departmentPerformance.length > 0) {
      const best = departmentPerformance[0];
      list.push({
        icon: Trophy, tone: 'blue',
        title: 'Meilleur département',
        detail: `${best.name} (${fmtPct(best.avg)})`,
      });
    }

    const lowestBranch = branchPerformance[branchPerformance.length - 1];
    if (lowestBranch && (lowestBranch.avg ?? 100) < 70) {
      list.push({
        icon: Target, tone: 'amber',
        title: 'Matière à attention',
        detail: `${lowestBranch.name} (${fmtPct(lowestBranch.avg)})`,
      });
    }

    return list;
  }, [kpi, branchPerformance, departmentPerformance, evaluations, selectedPeriod, scopedEmails, users, navigate]);

  const scopeLabel = (() => {
    const branchName = branches.find((b) => b.id === selectedBranch)?.name;
    return branchName ?? 'Toutes les filiales';
  })();

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t('dashboard.subtitle')}</p>
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Période" />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                  {p === openPeriodName ? ' •' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedBranch || 'all'} onValueChange={(v) => { setSelectedBranch(v === 'all' ? '' : v); setSelectedDepartment(''); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filiale" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les filiales</SelectItem>
              {accessibleBranches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedDepartment || 'all'} onValueChange={(v) => setSelectedDepartment(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Département" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les départements</SelectItem>
              {accessibleDepartments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedRole || 'all'} onValueChange={(v) => setSelectedRole(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Poste" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les postes</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border shadow-sm">
          <CardContent className="p-5 flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Effectif total</p>
              <p className="text-2xl font-bold mt-1">{loading ? '-' : kpi.effectif}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
              <Users size={20} className="text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardContent className="p-5 flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Évaluations complétées</p>
              <p className="text-2xl font-bold mt-1">{loading ? '-' : kpi.completed}</p>
              <p className="text-xs text-emerald-600 mt-1">{kpi.completedRate != null ? `${kpi.completedRate.toFixed(1)}%` : '—'}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
              <CheckCircle2 size={20} className="text-emerald-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardContent className="p-5 flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Évaluations en retard</p>
              <p className="text-2xl font-bold mt-1">{loading ? '-' : kpi.late}</p>
              <p className="text-xs text-red-600 mt-1">{kpi.lateRate != null ? `${kpi.lateRate.toFixed(1)}%` : '—'}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardContent className="p-5 flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Note moyenne globale</p>
              <p className="text-2xl font-bold mt-1">{loading ? '-' : fmtPct(kpi.avg)}</p>
              <div className="mt-1"><DeltaTag delta={kpi.delta} /></div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
              <Star size={20} className="text-amber-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Évolution + Performance filiale + Répartition + Alertes */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Card className="border-border shadow-sm xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading">Évolution de la performance globale</CardTitle>
          </CardHeader>
          <CardContent>
            {hasEvolutionData ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={evolutionData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                    formatter={(v: number) => [`${v.toFixed(1)} %`, 'Moyenne']}
                  />
                  <Line type="monotone" dataKey="average" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">Aucune donnée</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <Building2 size={16} /> Performance par filiale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {branchPerformance.length === 0 && <p className="text-sm text-muted-foreground">Aucune donnée</p>}
            {branchPerformance.map((b) => (
              <div key={b.id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium truncate">{b.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold">{fmtPct(b.avg)}</span>
                    <DeltaTag delta={b.delta} />
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, b.avg ?? 0)}%`, backgroundColor: scoreBand(b.avg ?? 0).color }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading">Répartition des résultats</CardTitle>
          </CardHeader>
          <CardContent>
            {distribution.length > 0 ? (
              <div className="relative">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={distribution} dataKey="count" innerRadius={55} outerRadius={85} paddingAngle={2}>
                      {distribution.map((d) => <Cell key={d.key} fill={d.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                      formatter={(value: number, _n, ctx) => [`${value} (${ctx.payload.pct.toFixed(0)}%)`, ctx.payload.label]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-bold">{fmtPct(kpi.avg)}</span>
                  <span className="text-[10px] text-muted-foreground">Moyenne globale</span>
                </div>
                <div className="mt-2 space-y-1">
                  {distribution.map((d) => (
                    <div key={d.key} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                        {d.label}
                      </span>
                      <span className="text-muted-foreground">{d.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">Aucune donnée</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <Sparkles size={16} /> Alertes &amp; Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {insights.length === 0 && <p className="text-sm text-muted-foreground">Rien à signaler</p>}
            {insights.map((insight, i) => {
              const toneClasses = {
                red: 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400',
                amber: 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400',
                blue: 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400',
                green: 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400',
              }[insight.tone];
              return (
                <button
                  key={i}
                  onClick={insight.onClick}
                  disabled={!insight.onClick}
                  className={`w-full text-left flex items-start gap-2 p-2.5 rounded-lg ${toneClasses} ${insight.onClick ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
                >
                  <insight.icon size={16} className="shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{insight.title}</p>
                    {insight.detail && <p className="text-xs opacity-80 truncate">{insight.detail}</p>}
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Top départements + Top/Flop employés */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading">Performance par département (Top 5)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {departmentPerformance.length === 0 && <p className="text-sm text-muted-foreground">Aucune donnée</p>}
            {departmentPerformance.map((d) => (
              <div key={d.id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium truncate">{d.name}</span>
                  <span className="font-semibold">{fmtPct(d.avg)}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, d.avg ?? 0)}%`, backgroundColor: scoreBand(d.avg ?? 0).color }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading flex items-center gap-1.5">
                <Trophy size={14} className="text-emerald-600" /> Top 5
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {top5.length === 0 && <p className="text-xs text-muted-foreground">Aucune donnée</p>}
              {top5.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-xs">
                  <span className="truncate">{e.name}</span>
                  <span className="font-semibold text-emerald-600">{fmtPct(e.avg)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading flex items-center gap-1.5">
                <TrendingDown size={14} className="text-red-600" /> Flop 5
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {flop5.length === 0 && <p className="text-xs text-muted-foreground">Aucune donnée</p>}
              {flop5.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-xs">
                  <span className="truncate">{e.name}</span>
                  <span className="font-semibold text-red-600">{fmtPct(e.avg)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Évolution par critère + Dernières évaluations + Taux de réalisation */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="border-border shadow-sm xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading">Évolution par critère d'évaluation</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {criterionEvolution.rows.length > 0 ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="pb-2 font-medium">Critère</th>
                    {criterionEvolution.periods.map((p) => (
                      <th key={p} className="pb-2 font-medium text-center">{p.split(' ')[0]}</th>
                    ))}
                    <th className="pb-2 font-medium text-center">Tendance</th>
                  </tr>
                </thead>
                <tbody>
                  {criterionEvolution.rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-1.5 pr-2">{row.name}</td>
                      {row.values.map((v: number | null, i: number) => (
                        <td key={i} className="py-1.5 text-center">{v != null ? `${v.toFixed(0)}%` : '—'}</td>
                      ))}
                      <td className="py-1.5 text-center">
                        {row.trend === 'up' && <ArrowUp size={14} className="text-emerald-600 inline" />}
                        {row.trend === 'down' && <ArrowDown size={14} className="text-red-600 inline" />}
                        {row.trend === 'flat' && <Minus size={14} className="text-muted-foreground inline" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune donnée</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading">Dernières évaluations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {latestEvaluations.length === 0 && <p className="text-sm text-muted-foreground">Aucune donnée</p>}
            {latestEvaluations.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 text-xs border-b last:border-0 pb-2 last:pb-0">
                <div className="min-w-0">
                  <p className="font-medium truncate">{e.name}</p>
                  <p className="text-muted-foreground truncate">{e.position} · {e.branchName}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold">{fmtPct(e.pct)}</p>
                  <Badge variant="secondary" className="text-[10px]">
                    {EVALUATION_STATUS_LABELS[e.status as keyof typeof EVALUATION_STATUS_LABELS] ?? e.status}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading">Taux de réalisation des évaluations</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <div className="relative w-28 h-28">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'done', value: kpi.completed },
                      { name: 'rest', value: Math.max(0, kpi.effectif - kpi.completed) },
                    ]}
                    dataKey="value"
                    innerRadius={38}
                    outerRadius={54}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="hsl(var(--muted))" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold">{kpi.completedRate != null ? `${kpi.completedRate.toFixed(0)}%` : '—'}</span>
              </div>
            </div>
            <p className="text-sm font-semibold">{kpi.completed} / {kpi.effectif} évaluations complétées</p>
            {kpi.late > 0 && (
              <div className="w-full flex items-center justify-between text-xs rounded-md bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 p-2">
                <span>{kpi.late} en retard</span>
                <span>{kpi.lateRate?.toFixed(0)}%</span>
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5"
              onClick={() => navigate('/evaluation', { state: { filterByStatus: ['draft', 'rejected'] } })}
            >
              Voir le détail
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
