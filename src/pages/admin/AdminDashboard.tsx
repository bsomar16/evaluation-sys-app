/**
 * Admin Dashboard - Panneau d'administration complet
 * Gestion des Utilisateurs, Rôles, et Branches
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Shield, Building2, BarChart3, Plus, ArrowRight, GraduationCap, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface DashboardStats {
  totalUsers: number;
  totalRoles: number;
  totalBranches: number;
  activeUsers: number;
  totalEvaluations: number;
  completedEvaluations: number;
  totalTrainings: number;
  completedTrainings: number;
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalRoles: 0,
    totalBranches: 0,
    activeUsers: 0,
    totalEvaluations: 0,
    completedEvaluations: 0,
    totalTrainings: 0,
    completedTrainings: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      // Charger les stats générales
      const { data: usersRaw } = await supabase.from('users').select('id, is_active, archived_at');
      const users = usersRaw?.filter((u) => !u.archived_at) ?? [];
      const { data: roles } = await supabase.from('roles').select('id');
      const { data: branches } = await supabase.from('branches').select('id');
      
      // Charger les stats d'évaluations
      const { data: evaluations } = await supabase.from('evaluations').select('id, status');
      const completedEvals = evaluations?.filter(e => e.status === 'completed').length || 0;

      // Charger les stats de formations (training_requests table)
      const { data: trainings } = await supabase.from('training_requests').select('id, status');
      const completedTrains = trainings?.filter(t => t.status === 'completed').length || 0;

      const activeCount = users?.filter(u => u.is_active).length || 0;

      setStats({
        totalUsers: users?.length || 0,
        totalRoles: roles?.length || 0,
        totalBranches: branches?.length || 0,
        activeUsers: activeCount,
        totalEvaluations: evaluations?.length || 0,
        completedEvaluations: completedEvals,
        totalTrainings: trainings?.length || 0,
        completedTrainings: completedTrains,
      });
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ icon: Icon, title, value, color }: any) => (
    <Card className="border-l-4" style={{ borderLeftColor: color }}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className="text-3xl font-bold mt-2">{loading ? '-' : value}</p>
          </div>
          <div className="p-3 rounded-lg" style={{ backgroundColor: `${color}15` }}>
            <Icon size={24} color={color} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const ActionCard = ({ icon: Icon, title, onClick, color }: any) => (
    <button
      onClick={onClick}
      className="group h-full p-6 rounded-lg border border-border bg-card hover:bg-accent/50 transition-all duration-200 text-left"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}15` }}>
          <Icon size={20} color={color} />
        </div>
        <ArrowRight size={16} className="text-muted-foreground group-hover:translate-x-1 transition-transform" />
      </div>
      <h3 className="font-semibold text-sm">{title}</h3>
    </button>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tableau de Bord Admin</h1>
        </div>
        <Badge variant="outline">Admin</Badge>
      </div>

      {/* Main Stats Grid - Key metrics for the evaluation system */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          title="Utilisateurs"
          value={stats.totalUsers}
          color="hsl(var(--accent))"
        />
        <StatCard
          icon={BarChart3}
          title="Évaluations"
          value={stats.totalEvaluations}
          color="hsl(var(--success))"
        />
        <StatCard
          icon={GraduationCap}
          title="Formations"
          value={stats.totalTrainings}
          color="hsl(var(--warning))"
        />
        <StatCard
          icon={Shield}
          title="Taux de Complétion"
          value={stats.totalEvaluations > 0 ? Math.round((stats.completedEvaluations / stats.totalEvaluations) * 100) : 0}
          color="hsl(var(--destructive))"
        />
      </div>

      {/* Secondary Stats - System administration */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={Shield}
          title="Rôles"
          value={stats.totalRoles}
          color="hsl(var(--accent))"
        />
        <StatCard
          icon={Building2}
          title="Filiales"
          value={stats.totalBranches}
          color="hsl(var(--success))"
        />
        <StatCard
          icon={Users}
          title="Taux d'Activité"
          value={stats.totalUsers > 0 ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : 0}
          color="hsl(var(--warning))"
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Actions Rapides</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ActionCard
            icon={Users}
            title="Gérer les Utilisateurs"
            onClick={() => navigate('/admin/users')}
            color="hsl(var(--accent))"
          />
          <ActionCard
            icon={Shield}
            title="Gérer les Rôles"
            onClick={() => navigate('/admin/roles')}
            color="hsl(var(--destructive))"
          />
          <ActionCard
            icon={Building2}
            title="Gérer les Filiales"
            onClick={() => navigate('/admin/branches')}
            color="hsl(var(--success))"
          />
        </div>
      </div>

    </div>
  );
}
