import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2, Edit2, Search, X } from 'lucide-react';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { ModuleAccessDenied } from '@/components/ModuleAccessDenied';
import {
  collectAncestorBranchIds,
  collectDescendantBranchIds,
  type BranchRecord,
} from '@/lib/branch-tree';

type BranchFormState = {
  name: string;
  code: string;
  location: string;
  is_active: boolean;
  child_branches: string[];
};

export function BranchesPage() {
  const { toast } = useToast();
  const { canRead, canWrite, canDelete } = useRolePermissions();
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchRecord | null>(null);
  const [deleteBranch, setDeleteBranch] = useState<BranchRecord | null>(null);
  const [formData, setFormData] = useState<BranchFormState>({
    name: '',
    code: '',
    location: '',
    is_active: true,
    child_branches: [],
  });
  const [childBranchInput, setChildBranchInput] = useState('');

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    try {
      const { data, error } = await supabase.from('branches').select('*');
      if (error) throw error;
      setBranches(data || []);
    } catch (error: any) {
      console.error('Erreur:', error);
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible de charger les filiales' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddBranch = () => {
    setEditingBranch(null);
    setFormData({ name: '', code: '', location: '', is_active: true, child_branches: [] });
    setChildBranchInput('');
    setOpenDialog(true);
  };

  const handleSaveBranch = async () => {
    if (!canWrite('branches')) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Permission écriture requise' });
      return;
    }
    if (!formData.name) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Le nom de la filiale est obligatoire' });
      return;
    }

    try {
      const payload = {
        name: formData.name,
        code: formData.code,
        location: formData.location,
        is_active: formData.is_active,
        child_branches: formData.child_branches,
      };

      let savedBranchId = editingBranch?.id;

      if (editingBranch) {
        const { error } = await supabase.from('branches').update(payload).eq('id', editingBranch.id);
        if (error) throw error;
        toast({ title: 'Succès', description: 'Filiale modifiée' });
      } else {
        const { data: inserted, error } = await supabase.from('branches').insert([payload]).select('id').single();
        if (error) throw error;
        savedBranchId = inserted?.id;
        toast({ title: 'Succès', description: 'Filiale créée' });
      }

      if (savedBranchId && formData.child_branches.length > 0) {
        await Promise.all(
          formData.child_branches.map((childId) =>
            supabase.from('branches').update({ parent_branch_id: savedBranchId }).eq('id', childId)
          )
        );
      }

      loadBranches();
      setOpenDialog(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: error.message });
    }
  };

  const handleDeleteBranch = async () => {
    if (!canDelete('branches')) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Permission suppression requise' });
      return;
    }
    if (!deleteBranch) return;

    try {
      const { count, error: countError } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('branch_id', deleteBranch.id)
        .is('archived_at', null);

      if (countError) throw countError;

      if ((count ?? 0) > 0) {
        toast({
          variant: 'destructive',
          title: 'Suppression impossible',
          description: 'Cette filiale est utilisée par des utilisateurs. Vous ne pouvez pas la supprimer.',
        });
        return;
      }

      if (getChildBranches(deleteBranch).length > 0) {
        toast({
          variant: 'destructive',
          title: 'Suppression impossible',
          description: 'Cette filiale a des filiales filles. Retirez-les avant de supprimer.',
        });
        return;
      }

      const { error } = await supabase.from('branches').delete().eq('id', deleteBranch.id);
      if (error) throw error;
      toast({ title: 'Succès', description: 'Filiale supprimée' });
      loadBranches();
      setDeleteBranch(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: error.message });
    }
  };

  const getAvailableChildBranches = () => {
    if (!editingBranch?.id) {
      return branches.filter((b) => !formData.child_branches.includes(b.id));
    }

    const blocked = new Set<string>([
      editingBranch.id,
      ...collectAncestorBranchIds(editingBranch.id, branches),
      ...collectDescendantBranchIds(editingBranch.id, branches),
      ...formData.child_branches,
    ]);

    return branches.filter((b) => !blocked.has(b.id));
  };

  const addChildBranch = () => {
    if (childBranchInput && !formData.child_branches.includes(childBranchInput)) {
      setFormData({ ...formData, child_branches: [...formData.child_branches, childBranchInput] });
      setChildBranchInput('');
    }
  };

  const removeChildBranch = (branchId: string) => {
    setFormData({ ...formData, child_branches: formData.child_branches.filter((id) => id !== branchId) });
  };

  const getChildBranches = (branch: BranchRecord) => {
    const childIds = new Set<string>(
      Array.isArray(branch.child_branches) ? branch.child_branches.filter(Boolean) : []
    );
    branches.forEach((b) => {
      if (b.parent_branch_id === branch.id) childIds.add(b.id);
    });
    return [...childIds]
      .map((id) => branches.find((b) => b.id === id))
      .filter(Boolean) as BranchRecord[];
  };

  const filteredBranches = branches.filter(
    (b) =>
      b.name?.toLowerCase().includes(search.toLowerCase()) ||
      b.code?.toLowerCase().includes(search.toLowerCase())
  );

  const pagination = usePagination(filteredBranches, 10);

  if (!canRead('branches')) {
    return <ModuleAccessDenied />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Filiales</h1>
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
                <Button onClick={handleAddBranch} className="gap-2" disabled={!canWrite('branches')}>
                  <Plus className="h-4 w-4" />
                  Nouveau
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingBranch ? 'Modifier' : 'Créer'} Filiale</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="Nom de la filiale"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="border-2 border-blue-300 bg-blue-50"
                  />
                  <Input
                    placeholder="Code filiale"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="border-2 border-blue-300 bg-blue-50"
                  />
                  <Input
                    placeholder="Localisation"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="border-2 border-blue-300 bg-blue-50"
                  />

                  <div className="border-t pt-4">
                    <p className="font-semibold text-sm mb-2">Filiales filles</p>
                    <div className="flex gap-2 mb-2">
                      <Select value={childBranchInput} onValueChange={setChildBranchInput}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Ajouter une filiale fille" />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableChildBranches().map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>
                              {branch.name} ({branch.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={addChildBranch} size="sm" className="gap-1" disabled={!childBranchInput}>
                        <Plus className="h-4 w-4" />
                        Ajouter
                      </Button>
                    </div>
                    {formData.child_branches.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {formData.child_branches.map((childId) => {
                          const child = branches.find((b) => b.id === childId);
                          return (
                            <Badge key={childId} variant="secondary" className="gap-1">
                              {child?.name}
                              <button
                                type="button"
                                onClick={() => removeChildBranch(childId)}
                                className="ml-1 hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <Button onClick={handleSaveBranch} className="w-full">
                    {editingBranch ? 'Modifier' : 'Créer'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <p>Chargement...</p>
          ) : filteredBranches.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Aucune filiale</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">Nom</th>
                    <th className="text-left py-3 px-4">Code</th>
                    <th className="text-left py-3 px-4">Localisation</th>
                    <th className="text-left py-3 px-4">Filiales filles</th>
                    <th className="text-left py-3 px-4">Statut</th>
                    <th className="text-right py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedItems.map((branch) => {
                    const childBranches = getChildBranches(branch);
                    return (
                      <tr key={branch.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4 font-medium">{branch.name}</td>
                        <td className="py-3 px-4">
                          <Badge variant="outline">{branch.code}</Badge>
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">{branch.location || '—'}</td>
                        <td className="py-3 px-4">
                          {childBranches.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-col gap-1 items-start">
                              {childBranches.map((child) => (
                                <Badge key={child.id} variant="secondary">
                                  {child.name}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={branch.is_active ? 'default' : 'secondary'}>
                            {branch.is_active ? 'Actif' : 'Inactif'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {canWrite('branches') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingBranch(branch);
                                setFormData({
                                  name: branch.name,
                                  code: branch.code || '',
                                  location: branch.location || '',
                                  is_active: branch.is_active ?? true,
                                  child_branches: Array.isArray(branch.child_branches)
                                    ? branch.child_branches.filter(Boolean)
                                    : [],
                                });
                                setChildBranchInput('');
                                setOpenDialog(true);
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete('branches') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setDeleteBranch(branch)}
                            >
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

      <AlertDialog open={!!deleteBranch} onOpenChange={() => setDeleteBranch(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer {deleteBranch?.name}?</AlertDialogTitle>
          <AlertDialogAction onClick={handleDeleteBranch} className="bg-destructive">
            Supprimer
          </AlertDialogAction>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default BranchesPage;
