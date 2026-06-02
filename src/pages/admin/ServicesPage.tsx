import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2, Edit2, Search, X } from 'lucide-react';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { ModuleAccessDenied } from '@/components/ModuleAccessDenied';
import {
  collectAncestorDepartmentIds,
  collectDescendantDepartmentIds,
  type DepartmentRecord,
} from '@/lib/department-tree';

export function DepartmentsPage() {
  const { toast } = useToast();
  const { canRead, canWrite, canDelete } = useRolePermissions();
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<DepartmentRecord | null>(null);
  const [deleteDepartment, setDeleteDepartment] = useState<DepartmentRecord | null>(null);
  const [deleteUserCount, setDeleteUserCount] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', child_departments: [] as string[] });
  const [childDeptInput, setChildDeptInput] = useState('');

  useEffect(() => {
    loadDepartments();
  }, []);

  useEffect(() => {
    if (!deleteDepartment) {
      setDeleteUserCount(null);
      return;
    }
    let cancelled = false;
    countUsersOnDepartment(deleteDepartment.id).then((count) => {
      if (!cancelled) setDeleteUserCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [deleteDepartment]);

  const loadDepartments = async () => {
    try {
      const { data, error } = await supabase.from('departments').select('*');
      if (error) throw error;
      setDepartments(data || []);
    } catch (error: any) {
      console.error('Erreur:', error);
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible de charger les départements' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddDepartment = () => {
    setEditingDepartment(null);
    setFormData({ name: '', child_departments: [] });
    setChildDeptInput('');
    setOpenDialog(true);
  };

  const handleSaveDepartment = async () => {
    if (!formData.name) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Remplissez le nom du département' });
      return;
    }

    try {
      const payload = {
        name: formData.name,
        child_departments: formData.child_departments,
      };

      let savedDeptId = editingDepartment?.id;
      if (editingDepartment) {
        const { error } = await supabase.from('departments').update(payload).eq('id', editingDepartment.id);
        if (error) throw error;
        toast({ title: 'Succès', description: 'Département modifié' });
      } else {
        const { data: inserted, error } = await supabase.from('departments').insert([payload]).select('id').single();
        if (error) throw error;
        savedDeptId = inserted?.id;
        toast({ title: 'Succès', description: 'Département créé' });
      }

      if (savedDeptId) {
        const previousChildIds = editingDepartment
          ? getChildDepartments(editingDepartment).map((d) => d.id)
          : [];
        const nextChildIds = formData.child_departments;
        const removedChildIds = previousChildIds.filter((id) => !nextChildIds.includes(id));
        const addedChildIds = nextChildIds.filter((id) => !previousChildIds.includes(id));

        await Promise.all([
          ...removedChildIds.map((childId) =>
            supabase.from('departments').update({ parent_department_id: null }).eq('id', childId)
          ),
          ...addedChildIds.map((childId) =>
            supabase.from('departments').update({ parent_department_id: savedDeptId }).eq('id', childId)
          ),
        ]);
      }

      loadDepartments();
      setOpenDialog(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: error.message });
    }
  };

  const handleDeleteDepartment = async () => {
    if (!canDelete('departments')) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Permission suppression requise' });
      return;
    }
    if (!deleteDepartment) return;

    const userCount = deleteUserCount ?? (await countUsersOnDepartment(deleteDepartment.id));
    if (userCount > 0) {
      toast({
        variant: 'destructive',
        title: 'Suppression impossible',
        description: `${userCount} utilisateur(s) sont rattachés à ce département. Réassignez-les dans Utilisateurs avant de supprimer.`,
      });
      return;
    }

    try {
      const detachedCount = await detachChildDepartments(deleteDepartment);
      const { error } = await supabase.from('departments').delete().eq('id', deleteDepartment.id);
      if (error) throw error;
      toast({
        title: 'Succès',
        description:
          detachedCount > 0
            ? `Département supprimé. ${detachedCount} département(s) fils détaché(s) (restent dans la liste).`
            : 'Département supprimé',
      });
      loadDepartments();
      setDeleteDepartment(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la suppression';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    }
  };

  /** Enfants : tableau child_departments du parent + parent_department_id pointant vers ce département */
  const getChildDepartments = (dept: DepartmentRecord) => {
    const childIds = new Set<string>(
      Array.isArray(dept.child_departments) ? dept.child_departments.filter(Boolean) : []
    );
    departments.forEach((d) => {
      if (d.parent_department_id === dept.id) childIds.add(d.id);
    });
    return [...childIds]
      .map((id) => departments.find((d) => d.id === id))
      .filter(Boolean) as DepartmentRecord[];
  };

  const detachChildDepartments = async (dept: DepartmentRecord) => {
    const children = getChildDepartments(dept);
    if (children.length === 0) return 0;
    const { error } = await supabase
      .from('departments')
      .update({ parent_department_id: null })
      .in('id', children.map((c) => c.id));
    if (error) throw error;
    return children.length;
  };

  const countUsersOnDepartment = async (departmentId: string) => {
    const { count, error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', departmentId)
      .is('archived_at', null);
    if (error) return 0;
    return count ?? 0;
  };

  const getAvailableChildDepartments = () => {
    if (!editingDepartment?.id) {
      return departments.filter((d) => !formData.child_departments.includes(d.id));
    }

    const blocked = new Set<string>([
      editingDepartment.id,
      ...collectAncestorDepartmentIds(editingDepartment.id, departments),
      ...collectDescendantDepartmentIds(editingDepartment.id, departments),
      ...formData.child_departments,
    ]);

    return departments.filter((d) => !blocked.has(d.id));
  };

  const addChildDepartment = () => {
    if (childDeptInput && !formData.child_departments.includes(childDeptInput)) {
      setFormData((prev) => ({ ...prev, child_departments: [...prev.child_departments, childDeptInput] }));
      setChildDeptInput('');
    }
  };

  const removeChildDepartment = (deptId: string) => {
    setFormData((prev) => ({ ...prev, child_departments: prev.child_departments.filter((id) => id !== deptId) }));
  };

  const filteredDepartments = departments.filter(d =>
    d.name?.toLowerCase().includes(search.toLowerCase())
  );

  if (!canRead('departments')) {
    return <ModuleAccessDenied />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Départements</h1>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Chercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
              <DialogTrigger asChild>
                <Button onClick={handleAddDepartment} className="gap-2" disabled={!canWrite('departments')}>
                  <Plus className="h-4 w-4" />
                  Nouveau
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingDepartment ? 'Modifier' : 'Créer'} Département</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input placeholder="Nom du département" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="border-2 border-blue-300 bg-blue-50" />

                  <div className="border-t pt-4">
                    <p className="font-semibold text-sm mb-2">Départements fils</p>
                    <div className="flex gap-2 mb-2">
                      <Select value={childDeptInput} onValueChange={setChildDeptInput}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Ajouter un département fils" /></SelectTrigger>
                        <SelectContent>
                          {getAvailableChildDepartments().map((dept) => (
                            <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={addChildDepartment} size="sm" className="gap-1" disabled={!childDeptInput}>
                        <Plus className="h-4 w-4" />
                        Ajouter
                      </Button>
                    </div>
                    {formData.child_departments.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {formData.child_departments.map((childId) => {
                          const child = departments.find((d) => d.id === childId);
                          return (
                            <Badge key={childId} variant="secondary" className="gap-1">
                              {child?.name}
                              <button type="button" onClick={() => removeChildDepartment(childId)} className="ml-1 hover:text-destructive">
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <Button onClick={handleSaveDepartment} className="w-full">{editingDepartment ? 'Modifier' : 'Créer'}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? <p>Chargement...</p> : filteredDepartments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Aucun département</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">Nom</th>
                    <th className="text-left py-3 px-4">Départements fils</th>
                    <th className="text-right py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDepartments.map((dept) => {
                    const children = getChildDepartments(dept);
                    return (
                      <tr key={dept.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4 font-medium">{dept.name}</td>
                        <td className="py-3 px-4">
                          {children.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-col gap-1 items-start">
                              {children.map((c) => (
                                <Badge key={c.id} variant="secondary">{c.name}</Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {canWrite('departments') && (
                            <Button variant="ghost" size="sm" onClick={() => {
                              setEditingDepartment(dept);
                              setFormData({
                                name: dept.name,
                                child_departments: getChildDepartments(dept).map((d) => d.id),
                              });
                              setChildDeptInput('');
                              setOpenDialog(true);
                            }}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete('departments') && (
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteDepartment(dept)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteDepartment} onOpenChange={() => setDeleteDepartment(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer « {deleteDepartment?.name} » ?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {deleteDepartment && (() => {
                const children = getChildDepartments(deleteDepartment);
                const blockedByUsers = deleteUserCount !== null && deleteUserCount > 0;
                return (
                  <>
                    {children.length > 0 && (
                      <p>
                        {children.length} département(s) fils seront <strong>détachés</strong> (restent dans la liste) :{' '}
                        {children.map((c) => c.name).join(', ')}.
                      </p>
                    )}
                    {deleteUserCount === null && <p>Vérification des utilisateurs rattachés…</p>}
                    {blockedByUsers && (
                      <p className="text-destructive font-medium">
                        {deleteUserCount} utilisateur(s) ont ce département. Réassignez-les dans Utilisateurs.
                      </p>
                    )}
                    {deleteUserCount === 0 && children.length === 0 && (
                      <p>Ce département sera supprimé définitivement.</p>
                    )}
                  </>
                );
              })()}
            </div>
          </AlertDialogDescription>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDepartment}
              disabled={!deleteDepartment || deleteUserCount === null || deleteUserCount > 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              Supprimer
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default DepartmentsPage;
