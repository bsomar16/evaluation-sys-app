import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { usePagination } from '@/hooks/usePagination';
import { supabase } from '@/integrations/supabase/client';
import { archiveUser, restoreUser, setUserActive, partitionUsersByArchive } from '@/services/userArchiveService';
import { formatArchivedAt } from '@/lib/user-archive';
import { Plus, Archive, ArchiveRestore, Edit2, Search, Trash2 } from 'lucide-react';
import { UsersService } from '@/services/admin/users';
import { roleBadgeClassName, getRoleBadgeStyleFromColor } from '@/lib/role-colors';
import { splitFullName } from '@/lib/user-name';
import { getSessionUser, isSiteDeveloper } from '@/lib/session-user';
import type { BranchRecord } from '@/lib/branch-tree';
import type { DepartmentRecord } from '@/lib/department-tree';
import type { RoleRecord } from '@/lib/role-tree';
import { EmployeeUserFormDialog } from '@/components/EmployeeUserFormDialog';
import { PaginationControls } from '@/components/PaginationControls';

type UserDialogState = { mode: 'create' | 'edit'; user?: any } | null;

export function UsersPage() {
  const { toast } = useToast();
  const session = getSessionUser();
  const isDeveloper = isSiteDeveloper(session);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [userDialog, setUserDialog] = useState<UserDialogState>(null);
  const [userTab, setUserTab] = useState<'active' | 'archived'>('active');
  const [archiveTarget, setArchiveTarget] = useState<any>(null);
  const [restoreTarget, setRestoreTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);

  useEffect(() => {
    loadUsers();
    loadRoles();
    loadBranches();
    loadDepartments();
  }, []);

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase.from('users').select('*');
      if (error) throw error;
      setUsers(data || []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    } finally {
      setLoading(false);
    }
  };

  const loadRoles = async () => {
    const { data } = await supabase
      .from('roles')
      .select('id, name, code, level, color, child_roles, parent_role_id');
    setRoles(data || []);
  };

  const loadBranches = async () => {
    const { data } = await supabase
      .from('branches')
      .select('id, name, code, child_branches, parent_branch_id');
    setBranches(data || []);
  };

  const loadDepartments = async () => {
    const { data } = await supabase
      .from('departments')
      .select('id, name, child_departments, parent_department_id');
    setDepartments(data || []);
  };

  const handleArchiveUser = async () => {
    if (!archiveTarget) return;
    try {
      await archiveUser(archiveTarget.id);
      toast({ title: 'Succès', description: 'Utilisateur archivé' });
      loadUsers();
      setArchiveTarget(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    }
  };

  const handleRestoreUser = async () => {
    if (!restoreTarget) return;
    try {
      await restoreUser(restoreTarget.id);
      toast({ title: 'Succès', description: 'Utilisateur restauré' });
      loadUsers();
      setRestoreTarget(null);
      setUserTab('active');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      await UsersService.delete(deleteTarget.id);
      toast({ title: 'Succès', description: 'Utilisateur supprimé définitivement' });
      loadUsers();
      setDeleteTarget(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    }
  };

  const handleToggleActive = async (user: any, nextActive: boolean) => {
    try {
      await setUserActive(user.id, nextActive);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: nextActive } : u))
      );
      toast({
        title: 'Succès',
        description: nextActive ? 'Compte activé' : 'Compte désactivé',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    }
  };

  const { active: activeUsers, archived: archivedUsers } = useMemo(
    () => partitionUsersByArchive(users),
    [users]
  );

  const listSource = userTab === 'active' ? activeUsers : archivedUsers;

  const filteredUsers = listSource.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  });

  const pagination = usePagination(filteredUsers, 10);

  const getRoleBadge = (user: any) => {
    const roleRecord = roles.find((r) => r.id === user.role_id || r.code === user.role);
    const label = roleRecord?.name || user.role || '—';
    return {
      label,
      className: roleBadgeClassName,
      style: getRoleBadgeStyleFromColor(roleRecord?.color),
    };
  };

  const extractNom = (name: string) => splitFullName(name).nom;
  const extractPrenom = (name: string) => splitFullName(name).prenom;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Utilisateurs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Administration technique — la création d&apos;employés se fait dans{' '}
          <strong>Employés</strong>.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <Tabs value={userTab} onValueChange={(v) => setUserTab(v as 'active' | 'archived')}>
            <TabsList>
              <TabsTrigger value="active">Actifs ({activeUsers.length})</TabsTrigger>
              <TabsTrigger value="archived">Archivés ({archivedUsers.length})</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Chercher par nom ou username..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            {isDeveloper && userTab === 'active' && (
              <Button className="gap-2" onClick={() => setUserDialog({ mode: 'create' })}>
                <Plus className="h-4 w-4" />
                Nouveau
              </Button>
            )}
          </div>

          {loading ? (
            <p>Chargement...</p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {userTab === 'active' ? 'Aucun utilisateur actif' : 'Aucun utilisateur archivé'}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Code</th>
                      <th className="text-left py-3 px-4">Nom</th>
                      <th className="text-left py-3 px-4">Prénom</th>
                      <th className="text-left py-3 px-4">Username</th>
                      <th className="text-left py-3 px-4">Filiale</th>
                      <th className="text-left py-3 px-4">Service</th>
                      <th className="text-left py-3 px-4">Rôle</th>
                      {userTab === 'active' ? (
                        <th className="text-left py-3 px-4">Statut</th>
                      ) : (
                        <th className="text-left py-3 px-4">Archivé le</th>
                      )}
                      <th className="text-right py-3 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.paginatedItems.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">{user.code || '—'}</td>
                      <td className="py-3 px-4">{extractNom(user.name)}</td>
                      <td className="py-3 px-4">{extractPrenom(user.name)}</td>
                      <td className="py-3 px-4">{user.email}</td>
                      <td className="py-3 px-4">
                        {branches.find((b) => b.id === user.branch_id)?.name || user.branch_id}
                      </td>
                      <td className="py-3 px-4">
                        {departments.find((d) => d.id === user.department_id)?.name || user.department_id || '—'}
                      </td>
                      <td className="py-3 px-4">
                        {(() => {
                          const badge = getRoleBadge(user);
                          return (
                            <span className={badge.className} style={badge.style}>
                              {badge.label}
                            </span>
                          );
                        })()}
                      </td>
                      {userTab === 'active' ? (
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={user.is_active !== false}
                              onCheckedChange={(checked) => handleToggleActive(user, checked)}
                              aria-label="Activer ou désactiver le compte"
                            />
                            <Badge variant={user.is_active !== false ? 'default' : 'secondary'}>
                              {user.is_active !== false ? 'Actif' : 'Inactif'}
                            </Badge>
                          </div>
                        </td>
                      ) : (
                        <td className="py-3 px-4 text-muted-foreground">
                          {formatArchivedAt(user.archived_at)}
                        </td>
                      )}
                      <td className="py-3 px-4 text-right">
                        {userTab === 'active' ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setUserDialog({ mode: 'edit', user })}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-amber-700"
                              onClick={() => setArchiveTarget(user)}
                              title="Archiver"
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setDeleteTarget(user)}
                              title="Supprimer définitivement"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-emerald-700"
                              onClick={() => setRestoreTarget(user)}
                              title="Restaurer"
                            >
                              <ArchiveRestore className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setDeleteTarget(user)}
                              title="Supprimer définitivement"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            </>
          )}
        </CardContent>
      </Card>

      {userDialog && (
        <EmployeeUserFormDialog
          open
          onOpenChange={(open) => {
            if (!open) setUserDialog(null);
          }}
          mode={userDialog.mode}
          editingUser={userDialog.mode === 'edit' ? userDialog.user : null}
          roles={roles}
          branches={branches}
          departments={departments}
          onSaved={loadUsers}
        />
      )}

      <AlertDialog open={!!archiveTarget} onOpenChange={() => setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Archiver {archiveTarget?.name} ?</AlertDialogTitle>
          <AlertDialogDescription>
            Le compte sera désactivé et masqué des listes. Restauration possible depuis l&apos;onglet
            Archivés.
          </AlertDialogDescription>
          <AlertDialogAction onClick={handleArchiveUser} className="bg-amber-600 hover:bg-amber-700">
            Archiver
          </AlertDialogAction>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!restoreTarget} onOpenChange={() => setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Restaurer {restoreTarget?.name} ?</AlertDialogTitle>
          <AlertDialogDescription>
            Le compte redeviendra visible (s&apos;il est activé).
          </AlertDialogDescription>
          <AlertDialogAction onClick={handleRestoreUser}>Restaurer</AlertDialogAction>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer définitivement {deleteTarget?.name} ?</AlertDialogTitle>
          <AlertDialogDescription>
            Action irréversible.
            {userTab === 'active' && ' Préférez l’archivage pour un retrait temporaire.'}
          </AlertDialogDescription>
          <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive hover:bg-destructive/90">
            Supprimer
          </AlertDialogAction>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default UsersPage;
