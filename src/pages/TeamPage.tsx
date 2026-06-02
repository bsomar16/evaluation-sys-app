import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Plus, Edit2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getSessionUser, isSiteDeveloper } from '@/lib/session-user';
import { collectDescendantRoleIds, type RoleRecord } from '@/lib/role-tree';
import { collectBranchScopeIds, type BranchRecord } from '@/lib/branch-tree';
import { collectDepartmentScopeIds, type DepartmentRecord } from '@/lib/department-tree';
import { roleBadgeClassName, getRoleBadgeStyleFromColor } from '@/lib/role-colors';
import { splitFullName } from '@/lib/user-name';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { ModuleAccessDenied } from '@/components/ModuleAccessDenied';
import { isUserArchived } from '@/lib/user-archive';
import { EmployeeUserFormDialog } from '@/components/EmployeeUserFormDialog';

export default function TeamPage() {
  const { roleId } = useParams<{ roleId?: string }>();
  const { toast } = useToast();
  const { canRead, canWrite } = useRolePermissions();
  const session = getSessionUser();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<any | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [usersRes, rolesRes, branchesRes, deptsRes] = await Promise.all([
        supabase.from('users').select('*'),
        supabase.from('roles').select('id, name, code, color, level, child_roles, parent_role_id'),
        supabase.from('branches').select('id, name, code, child_branches, parent_branch_id'),
        supabase.from('departments').select('id, name, child_departments, parent_department_id'),
      ]);
      if (usersRes.error) throw usersRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (deptsRes.error) throw deptsRes.error;
      setUsers((usersRes.data || []).filter((u) => !isUserArchived(u)));
      setRoles(rolesRes.data || []);
      setBranches(branchesRes.data || []);
      setDepartments(deptsRes.data || []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur';
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: message || "Impossible de charger l'équipe",
      });
    } finally {
      setLoading(false);
    }
  };

  const allowedRoleIds = useMemo(() => {
    if (!session?.role_id || roles.length === 0) return [] as string[];

    if (roleId) {
      return [roleId, ...collectDescendantRoleIds(roleId, roles)];
    }

    return collectDescendantRoleIds(session.role_id, roles);
  }, [session?.role_id, roles, roleId]);

  const allowedBranchIds = useMemo(() => {
    if (!session?.branch_id || branches.length === 0) return null;
    return collectBranchScopeIds(session.branch_id, branches);
  }, [session?.branch_id, branches]);

  const allowedDepartmentIds = useMemo(() => {
    if (!session?.department_id || departments.length === 0) return null;
    return collectDepartmentScopeIds(session.department_id, departments);
  }, [session?.department_id, departments]);

  const defaultCreateRoleId = useMemo(() => {
    if (!roleId || !allowedRoleIds.includes(roleId)) return '';
    return roleId;
  }, [roleId, allowedRoleIds]);

  const pageTitle = useMemo(() => {
    if (roleId) {
      const role = roles.find((r) => r.id === roleId);
      return role?.name ?? 'Employés';
    }
    return 'Employés';
  }, [roleId, roles]);

  const teamUsers = useMemo(() => {
    if (allowedRoleIds.length === 0) return [];
    return users.filter((u) => {
      if (u.id === session?.id) return false;
      if (!u.role_id || !allowedRoleIds.includes(u.role_id)) return false;
      if (allowedBranchIds !== null) {
        if (!u.branch_id || !allowedBranchIds.includes(u.branch_id)) return false;
      }
      if (allowedDepartmentIds !== null) {
        if (!u.department_id || !allowedDepartmentIds.includes(u.department_id)) return false;
      }
      return true;
    });
  }, [users, allowedRoleIds, allowedBranchIds, allowedDepartmentIds, session?.id]);

  const filteredUsers = teamUsers.filter((u) => {
    const q = search.toLowerCase();
    return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  const getRoleBadge = (user: any) => {
    const roleRecord = roles.find((r) => r.id === user.role_id);
    return {
      label: roleRecord?.name || user.role || '—',
      className: roleBadgeClassName,
      style: getRoleBadgeStyleFromColor(roleRecord?.color),
    };
  };

  const extractNom = (name: string) => splitFullName(name).nom;
  const extractPrenom = (name: string) => splitFullName(name).prenom;

  const canManageEmployees = canWrite('employees');

  if (isSiteDeveloper(session) || !canRead('employees')) {
    return <ModuleAccessDenied />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{pageTitle}</h1>
        {canManageEmployees && (
          <Button
            className="gap-2"
            onClick={() => setCreateOpen(true)}
            disabled={allowedRoleIds.length === 0}
          >
            <Plus className="h-4 w-4" />
            Nouvel employé
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Chercher par nom ou username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {loading ? (
            <p>Chargement...</p>
          ) : allowedRoleIds.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Aucun rôle fils configuré pour votre profil.
            </p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Aucun employé</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">Code</th>
                    <th className="text-left py-3 px-4">Nom</th>
                    <th className="text-left py-3 px-4">Prénom</th>
                    <th className="text-left py-3 px-4">Username</th>
                    <th className="text-left py-3 px-4">Filiale</th>
                    <th className="text-left py-3 px-4">Rôle</th>
                    {canManageEmployees && <th className="text-right py-3 px-4">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const badge = getRoleBadge(user);
                    return (
                      <tr key={user.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4">{user.code || '—'}</td>
                        <td className="py-3 px-4">{extractNom(user.name)}</td>
                        <td className="py-3 px-4">{extractPrenom(user.name)}</td>
                        <td className="py-3 px-4">{user.email}</td>
                        <td className="py-3 px-4">
                          {branches.find((b) => b.id === user.branch_id)?.name || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={badge.className} style={badge.style}>
                            {badge.label}
                          </span>
                        </td>
                        {canManageEmployees && (
                          <td className="py-3 px-4 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditUser(user)}
                              title="Modifier"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EmployeeUserFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        roles={roles}
        branches={branches}
        departments={departments}
        onSaved={loadData}
        defaultRoleId={defaultCreateRoleId}
      />

      <EmployeeUserFormDialog
        open={!!editUser}
        onOpenChange={(open) => {
          if (!open) setEditUser(null);
        }}
        mode="edit"
        editingUser={editUser}
        roles={roles}
        branches={branches}
        departments={departments}
        onSaved={loadData}
      />
    </div>
  );
}
