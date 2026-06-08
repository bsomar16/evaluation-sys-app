import { Fragment, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ChevronDown, ChevronRight, Plus, Trash2, Edit2, Search, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { roleBadgeClassName, getRoleBadgeStyleFromColor } from '@/lib/role-colors';
import {
  SIDEBAR_MODULE_DEFS,
  createEmptyEvaluationActionsPermissions,
  createEmptyTrainingActionsPermissions,
  createEmptySidebarPermissions,
  parseRolePermissions,
  patchModulePermission,
  serializeRolePermissions,
  type EvaluationActionsPermission,
  type TrainingActionsPermission,
  type SidebarModuleKey,
  type SidebarPermissionsMap,
} from '@/lib/role-permissions';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { ModuleAccessDenied } from '@/components/ModuleAccessDenied';

type RoleFormState = {
  name: string;
  level: number;
  child_roles: string[];
  color: string;
  is_user: boolean;
  permissions: SidebarPermissionsMap;
  evaluations_actions: EvaluationActionsPermission;
  training_actions: TrainingActionsPermission;
};

export function RolesPage() {
  const { toast } = useToast();
  const { canRead, canWrite, canDelete } = useRolePermissions();
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [deleteRole, setDeleteRole] = useState<any>(null);
  const [formData, setFormData] = useState<RoleFormState>({
    name: '',
    level: 0,
    child_roles: [],
    color: '#3b82f6',
    is_user: true,
    permissions: createEmptySidebarPermissions(),
    evaluations_actions: createEmptyEvaluationActionsPermissions(),
    training_actions: createEmptyTrainingActionsPermissions(),
  });
  const [childRoleInput, setChildRoleInput] = useState('');
  const [expandEvaluationAccess, setExpandEvaluationAccess] = useState(true);
  const [expandTrainingAccess, setExpandTrainingAccess] = useState(true);

  const generateRandomColor = () => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const normalizeChildRoles = (value: any): string[] => {
    if (!value) return [];
    
    // Si c'est déjà un array
    if (Array.isArray(value)) return value.filter(v => v);
    
    // Si c'est une string
    if (typeof value === 'string') {
      // Essayer de parser comme JSON (cas: "[\"id1\", \"id2\", \"id3\"]")
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.filter(v => v);
      } catch {}
      
      // Essayer de splitter par virgule (cas: "id1,id2,id3")
      if (value.includes(',')) {
        return value.split(',').map(v => v.trim()).filter(v => v);
      }
      
      // Sinon, c'est un seul ID
      return value.trim() ? [value.trim()] : [];
    }
    
    return [];
  };

  const loadRoles = async () => {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('id, name, code, level, parent_role_id, color, child_roles, permissions, is_user, is_active, created_at, updated_at');
      if (error) throw error;
      // Normalize child_roles to always be an array
      const normalizedData = (data || []).map(role => ({
        ...role,
        child_roles: normalizeChildRoles(role.child_roles)
      }));
      setRoles(normalizedData);
    } catch (error: any) {
      console.error('Erreur:', error);
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible de charger les rôles' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const handleAddRole = () => {
    setEditingRole(null);
    setFormData({
      name: '',
      level: 0,
      child_roles: [],
      color: generateRandomColor(),
      permissions: createEmptySidebarPermissions(),
      evaluations_actions: createEmptyEvaluationActionsPermissions(),
      training_actions: createEmptyTrainingActionsPermissions(),
    });
    setChildRoleInput('');
    setExpandEvaluationAccess(true);
    setExpandTrainingAccess(true);
    setOpenDialog(true);
  };

  const handleSaveRole = async () => {
    if (!formData.name) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Remplissez les champs obligatoires' });
      return;
    }

    try {
      const payload = {
        name: formData.name,
        level: formData.level,
        child_roles: formData.child_roles.length > 0 ? formData.child_roles : null,
        color: formData.color,
        is_user: formData.is_user,
        permissions: serializeRolePermissions(
          formData.permissions,
          formData.evaluations_actions,
          formData.training_actions
        ),
      };

      console.log('Saving role:', {
        id: editingRole?.id,
        name: formData.name,
        level: formData.level,
        child_roles: formData.child_roles,
        child_roles_json: payload.child_roles
      });

      if (editingRole) {
        if (!canWrite('roles')) {
          toast({ variant: 'destructive', title: 'Erreur', description: 'Permission écriture requise' });
          return;
        }
        const { error } = await supabase.from('roles').update(payload).eq('id', editingRole.id);
        if (error) {
          console.error('Update error:', error);
          throw error;
        }
        toast({ title: 'Succès', description: 'Rôle modifié' });
      } else {
        if (!canWrite('roles')) {
          toast({ variant: 'destructive', title: 'Erreur', description: 'Permission écriture requise' });
          return;
        }
        const { error } = await supabase.from('roles').insert([payload]);
        if (error) {
          console.error('Insert error:', error);
          throw error;
        }
        toast({ title: 'Succès', description: 'Rôle créé' });
      }
      loadRoles();
      setOpenDialog(false);
    } catch (error: any) {
      console.error('Full error:', error);
      toast({ variant: 'destructive', title: 'Erreur', description: error.message });
    }
  };

  const handleDeleteRole = async () => {
    if (!canDelete('roles')) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Permission suppression requise' });
      return;
    }
    try {
      const { count, error: countError } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role_id', deleteRole.id)
        .is('archived_at', null);

      if (countError) throw countError;

      if ((count ?? 0) > 0) {
        toast({
          variant: 'destructive',
          title: 'Suppression impossible',
          description: 'Ce rôle est utilisé par des utilisateurs. Vous ne pouvez pas le supprimer.',
        });
        return;
      }

      const { error } = await supabase.from('roles').delete().eq('id', deleteRole.id);
      if (error) throw error;
      toast({ title: 'Succès', description: 'Rôle supprimé' });
      loadRoles();
      setDeleteRole(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erreur', description: error.message });
    }
  };

  // Detect if adding childRoleId to editingRole would create a cycle
  const wouldCreateCycle = (childRoleId: string): boolean => {
    if (!editingRole) return false;
    
    // Check if childRole contains editingRole in its descendants
    const hasAncestorInDescendants = (roleId: string, targetId: string): boolean => {
      const role = roles.find(r => r.id === roleId);
      if (!role || !role.child_roles || role.child_roles.length === 0) return false;
      
      for (const childId of role.child_roles) {
        if (childId === targetId) return true; // Direct child is the target
        if (hasAncestorInDescendants(childId, targetId)) return true; // Check descendants
      }
      return false;
    };
    
    // If the role we want to add as child already contains editingRole as descendant, it's a cycle
    return hasAncestorInDescendants(childRoleId, editingRole.id);
  };

  const getAvailableChildRoles = () => {
    const available = roles.filter(r => 
      r.id !== editingRole?.id && 
      r.level !== undefined && 
      r.level > formData.level &&
      !wouldCreateCycle(r.id)
    );
    
    console.log('Available child roles for', editingRole?.name, ':', available.map(r => `${r.name}(L${r.level})`));
    console.log('Editing role level:', formData.level);
    
    return available;
  };

  const addChildRole = () => {
    if (childRoleInput && !formData.child_roles.includes(childRoleInput)) {
      setFormData({ ...formData, child_roles: [...formData.child_roles, childRoleInput] });
      setChildRoleInput('');
    }
  };

  const removeChildRole = (roleId: string) => {
    setFormData({ ...formData, child_roles: formData.child_roles.filter(id => id !== roleId) });
  };

  const filteredRoles = roles.filter((r) =>
    r.name?.toLowerCase().includes(search.toLowerCase())
  );

  const getChildRoleBadge = (child: any) => ({
    label: child.name,
    className: roleBadgeClassName,
    style: getRoleBadgeStyleFromColor(child.color),
  });

  const getChildRoles = (role: any) => {
    const childIds = new Set<string>(
      Array.isArray(role.child_roles) ? role.child_roles.filter(Boolean) : []
    );
    roles.forEach((r) => {
      if (r.parent_role_id === role.id) childIds.add(r.id);
    });
    return [...childIds]
      .map((id) => roles.find((r) => r.id === id))
      .filter(Boolean) as typeof roles;
  };

  const setModulePerm = (moduleKey: SidebarModuleKey, field: 'read' | 'write' | 'delete', checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      permissions: patchModulePermission(prev.permissions, moduleKey, field, checked),
    }));
  };

  const openEdit = (role: any) => {
    setEditingRole(role);
    const parsed = parseRolePermissions(role.permissions);
    setFormData({
      name: role.name,
      level: role.level,
      child_roles: normalizeChildRoles(role.child_roles),
      color: role.color || '#3b82f6',
      is_user: role.is_user ?? true,
      permissions: parsed.sidebar,
      evaluations_actions: parsed.evaluations_actions,
      training_actions: parsed.training_actions,
    });
    setChildRoleInput('');
    setExpandEvaluationAccess(true);
    setExpandTrainingAccess(true);
    setOpenDialog(true);
  };

  if (!canRead('roles')) {
    return <ModuleAccessDenied />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Rôles</h1>
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
                <Button onClick={handleAddRole} className="gap-2" disabled={!canWrite('roles')}>
                  <Plus className="h-4 w-4" />
                  Nouveau
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingRole ? 'Modifier' : 'Créer'} Rôle</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input placeholder="Nom du rôle" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="border-2 border-blue-300 bg-blue-50" />
                  <Input type="number" min="0" placeholder="Niveau hiérarchique" value={formData.level} onChange={(e) => setFormData({ ...formData, level: Math.max(0, parseInt(e.target.value) || 0) })} className="border-2 border-blue-300 bg-blue-50" />
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    title="Couleur du rôle"
                    aria-label="Couleur du rôle"
                    className="h-10 w-full rounded-md border-2 border-blue-300 bg-blue-50 cursor-pointer"
                  />

                  {/* Checkbox: Is User */}
                  <div className="flex items-center space-x-3 rounded-lg border-2 border-emerald-200 bg-emerald-50 p-3">
                    <Checkbox
                      id="is_user"
                      checked={formData.is_user}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, is_user: checked === true })
                      }
                    />
                    <label htmlFor="is_user" className="text-sm font-medium cursor-pointer">
                      Role can have User Account (is_user)
                    </label>
                  </div>

                  <div id="role-access-section" className="rounded-lg border-2 border-primary/25 bg-primary/5 p-4 space-y-3">
                    <p className="font-semibold text-base">Accès aux modules</p>
                    <div className="overflow-x-auto rounded-lg border bg-background">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="w-8 py-2 px-1" />
                            <th className="text-left py-2 px-3 font-medium">Section</th>
                            <th className="text-center py-2 px-2">Lecture</th>
                            <th className="text-center py-2 px-2">Écriture</th>
                            <th className="text-center py-2 px-2">Suppression</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Dashboard, Employees, Roles, Branches, Departments - Top level modules */}
                          {['dashboard', 'employees', 'roles', 'branches', 'departments'].map((key) => {
                            const mod = SIDEBAR_MODULE_DEFS.find(m => m.key === key as any);
                            if (!mod) return null;
                            const row = formData.permissions[mod.key] ?? { read: false, write: false, delete: false };
                            return (
                              <tr key={mod.key} className="border-b">
                                <td className="py-2 px-1 text-center"><span className="inline-block w-4" /></td>
                                <td className="py-2 px-3"><span>{mod.label}</span></td>
                                <td className="text-center py-2 px-2">
                                  <Checkbox
                                    checked={row.read}
                                    onCheckedChange={(v) => setModulePerm(mod.key, 'read', v === true)}
                                  />
                                </td>
                                <td className="text-center py-2 px-2">
                                  <Checkbox
                                    checked={row.write}
                                    disabled={!row.read}
                                    onCheckedChange={(v) => setModulePerm(mod.key, 'write', v === true)}
                                  />
                                </td>
                                <td className="text-center py-2 px-2">
                                  <Checkbox
                                    checked={row.delete}
                                    disabled={!row.read}
                                    onCheckedChange={(v) => setModulePerm(mod.key, 'delete', v === true)}
                                  />
                                </td>
                              </tr>
                            );
                          })}

                          {/* Critères d'évaluation - TOP LEVEL */}
                          {(() => {
                            const mod = SIDEBAR_MODULE_DEFS.find(m => m.key === 'evaluation_criteria');
                            const row = formData.permissions['evaluation_criteria'] ?? { read: false, write: false, delete: false };
                            return mod ? (
                              <tr className="border-b">
                                <td className="py-2 px-1"><span className="inline-block w-4" /></td>
                                <td className="py-2 px-3"><span>{mod.label}</span></td>
                                <td className="text-center py-2 px-2">
                                  <Checkbox
                                    checked={row.read}
                                    onCheckedChange={(v) => setModulePerm(mod.key, 'read', v === true)}
                                  />
                                </td>
                                <td className="text-center py-2 px-2">
                                  <Checkbox
                                    checked={row.write}
                                    disabled={!row.read}
                                    onCheckedChange={(v) => setModulePerm(mod.key, 'write', v === true)}
                                  />
                                </td>
                                <td className="text-center py-2 px-2">
                                  <Checkbox
                                    checked={row.delete}
                                    disabled={!row.read}
                                    onCheckedChange={(v) => setModulePerm(mod.key, 'delete', v === true)}
                                  />
                                </td>
                              </tr>
                            ) : null;
                          })()}

                          {/* Système de calcul - TOP LEVEL */}
                          {(() => {
                            const mod = SIDEBAR_MODULE_DEFS.find(m => m.key === 'calculation_system');
                            const row = formData.permissions['calculation_system'] ?? { read: false, write: false, delete: false };
                            return mod ? (
                              <tr className="border-b">
                                <td className="py-2 px-1"><span className="inline-block w-4" /></td>
                                <td className="py-2 px-3"><span>{mod.label}</span></td>
                                <td className="text-center py-2 px-2">
                                  <Checkbox
                                    checked={row.read}
                                    onCheckedChange={(v) => setModulePerm(mod.key, 'read', v === true)}
                                  />
                                </td>
                                <td className="text-center py-2 px-2">
                                  <Checkbox
                                    checked={row.write}
                                    disabled={!row.read}
                                    onCheckedChange={(v) => setModulePerm(mod.key, 'write', v === true)}
                                  />
                                </td>
                                <td className="text-center py-2 px-2">
                                  <Checkbox
                                    checked={row.delete}
                                    disabled={!row.read}
                                    onCheckedChange={(v) => setModulePerm(mod.key, 'delete', v === true)}
                                  />
                                </td>
                              </tr>
                            ) : null;
                          })()}

                          {/* EVALUATION GROUP - Expandable parent with children */}
                          <Fragment>
                            <tr className="border-b">
                              <td className="py-2 px-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => setExpandEvaluationAccess((p) => !p)}
                                  className="inline-flex items-center justify-center p-0.5 text-muted-foreground hover:text-foreground"
                                  aria-label={expandEvaluationAccess ? 'Réduire Évaluation' : 'Afficher Évaluation'}
                                >
                                  {expandEvaluationAccess ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </td>
                              <td className="py-2 px-3"><span className="font-medium">Évaluation</span></td>
                              <td className="text-center py-2 px-2">
                                <Checkbox
                                  checked={formData.permissions.evaluations?.read ?? false}
                                  onCheckedChange={(v) => setModulePerm('evaluations', 'read', v === true)}
                                />
                              </td>
                              <td className="text-center py-2 px-2">
                                <Checkbox
                                  checked={formData.permissions.evaluations?.write ?? false}
                                  disabled={!formData.permissions.evaluations?.read}
                                  onCheckedChange={(v) => setModulePerm('evaluations', 'write', v === true)}
                                />
                              </td>
                              <td className="text-center py-2 px-2">
                                <Checkbox
                                  checked={formData.permissions.evaluations?.delete ?? false}
                                  disabled={!formData.permissions.evaluations?.read}
                                  onCheckedChange={(v) => setModulePerm('evaluations', 'delete', v === true)}
                                />
                              </td>
                            </tr>

                            {/* Evaluation children */}
                            {expandEvaluationAccess && (
                              <>
                                {/* Gestion des évaluations */}
                                {(() => {
                                  const mod = SIDEBAR_MODULE_DEFS.find(m => m.key === 'evaluations_management');
                                  const row = formData.permissions['evaluations_management'] ?? { read: false, write: false, delete: false };
                                  return mod ? (
                                    <tr className="border-b bg-muted/20">
                                      <td className="py-2 px-1"><span className="inline-block w-6" /></td>
                                      <td className="py-2 px-3 text-sm text-muted-foreground">{mod.label}</td>
                                      <td className="text-center py-2 px-2">
                                        <Checkbox
                                          checked={row.read}
                                          onCheckedChange={(v) => setModulePerm(mod.key, 'read', v === true)}
                                        />
                                      </td>
                                      <td className="text-center py-2 px-2">
                                        <Checkbox
                                          checked={row.write}
                                          disabled={!row.read}
                                          onCheckedChange={(v) => setModulePerm(mod.key, 'write', v === true)}
                                        />
                                      </td>
                                      <td className="text-center py-2 px-2">
                                        <Checkbox
                                          checked={row.delete}
                                          disabled={!row.read}
                                          onCheckedChange={(v) => setModulePerm(mod.key, 'delete', v === true)}
                                        />
                                      </td>
                                    </tr>
                                  ) : null;
                                })()}

                                {/* Soumission (Évaluation action) */}
                                <tr className="border-b bg-muted/20">
                                  <td className="py-2 px-1"><span className="inline-block w-6" /></td>
                                  <td className="py-2 px-3 text-sm text-muted-foreground">Soumission</td>
                                  <td className="text-center py-2 px-2 text-muted-foreground">—</td>
                                  <td className="text-center py-2 px-2">
                                    <Checkbox
                                      checked={formData.evaluations_actions.submit}
                                      disabled={!formData.permissions.evaluations?.read}
                                      onCheckedChange={(v) =>
                                        setFormData((prev) => ({
                                          ...prev,
                                          evaluations_actions: {
                                            ...prev.evaluations_actions,
                                            submit: v === true,
                                          },
                                        }))
                                      }
                                    />
                                  </td>
                                  <td className="text-center py-2 px-2 text-muted-foreground">—</td>
                                </tr>

                                {/* Refus & Acceptation (Évaluation action) */}
                                <tr className="border-b bg-muted/20">
                                  <td className="py-2 px-1"><span className="inline-block w-6" /></td>
                                  <td className="py-2 px-3 text-sm text-muted-foreground">Refus & Acceptation</td>
                                  <td className="text-center py-2 px-2 text-muted-foreground">—</td>
                                  <td className="text-center py-2 px-2">
                                    <Checkbox
                                      checked={formData.evaluations_actions.review}
                                      disabled={!formData.permissions.evaluations?.read}
                                      onCheckedChange={(v) =>
                                        setFormData((prev) => ({
                                          ...prev,
                                          evaluations_actions: {
                                            ...prev.evaluations_actions,
                                            review: v === true,
                                          },
                                        }))
                                      }
                                    />
                                  </td>
                                  <td className="text-center py-2 px-2 text-muted-foreground">—</td>
                                </tr>
                              </>
                            )}
                          </Fragment>

                          {/* TRAINING GROUP - Expandable parent with children */}
                          <Fragment>
                            <tr className="border-b">
                              <td className="py-2 px-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => setExpandTrainingAccess((p) => !p)}
                                  className="inline-flex items-center justify-center p-0.5 text-muted-foreground hover:text-foreground"
                                  aria-label={expandTrainingAccess ? 'Réduire Formation' : 'Afficher Formation'}
                                >
                                  {expandTrainingAccess ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </td>
                              <td className="py-2 px-3"><span className="font-medium">Formation</span></td>
                              <td className="text-center py-2 px-2">
                                <Checkbox
                                  checked={formData.permissions.training?.read ?? false}
                                  onCheckedChange={(v) => setModulePerm('training', 'read', v === true)}
                                />
                              </td>
                              <td className="text-center py-2 px-2">
                                <Checkbox
                                  checked={formData.permissions.training?.write ?? false}
                                  disabled={!formData.permissions.training?.read}
                                  onCheckedChange={(v) => setModulePerm('training', 'write', v === true)}
                                />
                              </td>
                              <td className="text-center py-2 px-2">
                                <Checkbox
                                  checked={formData.permissions.training?.delete ?? false}
                                  disabled={!formData.permissions.training?.read}
                                  onCheckedChange={(v) => setModulePerm('training', 'delete', v === true)}
                                />
                              </td>
                            </tr>

                            {/* Training children */}
                            {expandTrainingAccess && (
                              <>
                                {/* Planification des formations */}
                                {(() => {
                                  const mod = SIDEBAR_MODULE_DEFS.find(m => m.key === 'training_management');
                                  const row = formData.permissions['training_management'] ?? { read: false, write: false, delete: false };
                                  return mod ? (
                                    <tr className="border-b bg-muted/20">
                                      <td className="py-2 px-1"><span className="inline-block w-6" /></td>
                                      <td className="py-2 px-3 text-sm text-muted-foreground">{mod.label}</td>
                                      <td className="text-center py-2 px-2">
                                        <Checkbox
                                          checked={row.read}
                                          onCheckedChange={(v) => setModulePerm(mod.key, 'read', v === true)}
                                        />
                                      </td>
                                      <td className="text-center py-2 px-2">
                                        <Checkbox
                                          checked={row.write}
                                          disabled={!row.read}
                                          onCheckedChange={(v) => setModulePerm(mod.key, 'write', v === true)}
                                        />
                                      </td>
                                      <td className="text-center py-2 px-2">
                                        <Checkbox
                                          checked={row.delete}
                                          disabled={!row.read}
                                          onCheckedChange={(v) => setModulePerm(mod.key, 'delete', v === true)}
                                        />
                                      </td>
                                    </tr>
                                  ) : null;
                                })()}

                                {/* Demande de formation */}
                                <tr className="border-b bg-muted/20">
                                  <td className="py-2 px-1"><span className="inline-block w-6" /></td>
                                  <td className="py-2 px-3 text-sm text-muted-foreground">Demande de formation</td>
                                  <td className="text-center py-2 px-2 text-muted-foreground">—</td>
                                  <td className="text-center py-2 px-2">
                                    <Checkbox
                                      checked={formData.training_actions.request}
                                      disabled={!formData.permissions.training?.read}
                                      onCheckedChange={(v) =>
                                        setFormData((prev) => ({
                                          ...prev,
                                          training_actions: { ...prev.training_actions, request: v === true },
                                        }))
                                      }
                                    />
                                  </td>
                                  <td className="text-center py-2 px-2 text-muted-foreground">—</td>
                                </tr>

                                {/* Refus & Acceptation (Training action) */}
                                <tr className="border-b bg-muted/20">
                                  <td className="py-2 px-1"><span className="inline-block w-6" /></td>
                                  <td className="py-2 px-3 text-sm text-muted-foreground">Refus & Acceptation</td>
                                  <td className="text-center py-2 px-2 text-muted-foreground">—</td>
                                  <td className="text-center py-2 px-2">
                                    <Checkbox
                                      checked={formData.training_actions.review}
                                      disabled={!formData.permissions.training?.read}
                                      onCheckedChange={(v) =>
                                        setFormData((prev) => ({
                                          ...prev,
                                          training_actions: { ...prev.training_actions, review: v === true },
                                        }))
                                      }
                                    />
                                  </td>
                                  <td className="text-center py-2 px-2 text-muted-foreground">—</td>
                                </tr>
                              </>
                            )}
                          </Fragment>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  <div className="border-t pt-4">
                    <p className="font-semibold text-sm mb-2">Rôles Enfants (Niveau &gt; {formData.level})</p>
                    <div className="flex gap-2 mb-2">
                      <Select value={childRoleInput} onValueChange={setChildRoleInput}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Ajouter un rôle enfant" /></SelectTrigger>
                        <SelectContent>
                          {getAvailableChildRoles().filter(r => !formData.child_roles.includes(r.id)).map((role) => (
                            <SelectItem key={role.id} value={role.id}>{role.name} (Niveau {role.level})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={addChildRole} size="sm" className="gap-1" disabled={!childRoleInput}>
                        <Plus className="h-4 w-4" />
                        Ajouter
                      </Button>
                    </div>
                    {formData.child_roles.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {formData.child_roles.map((childId) => {
                          const childRole = roles.find(r => r.id === childId);
                          return (
                            <Badge key={childId} variant="secondary" className="gap-1">
                              {childRole?.name}
                              <button onClick={() => removeChildRole(childId)} className="ml-1 hover:text-destructive">
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  
                  <Button onClick={handleSaveRole} className="w-full" disabled={!canWrite('roles')}>
                    {editingRole ? 'Modifier' : 'Créer'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? <p>Chargement...</p> : filteredRoles.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Aucun rôle</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">Nom</th>
                    <th className="text-left py-3 px-4">Niveau</th>
                    <th className="text-left py-3 px-4">Rôles fils</th>
                    <th className="text-right py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoles.map((role) => {
                    const childRoles = getChildRoles(role);
                    return (
                      <tr key={role.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4 font-medium">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-4 h-4 rounded shrink-0"
                              style={{ backgroundColor: role.color || '#3b82f6' }}
                            />
                            {role.name}
                          </div>
                        </td>
                        <td className="py-3 px-4">{role.level}</td>
                        <td className="py-3 px-4">
                          {childRoles.length === 0 ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : (
                            <div className="flex flex-col items-start gap-1.5">
                              {childRoles.map((child) => {
                                const badge = getChildRoleBadge(child);
                                return (
                                  <span
                                    key={child.id}
                                    className={badge.className}
                                    style={badge.style}
                                  >
                                    {badge.label}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {canWrite('roles') && (
                            <Button variant="ghost" size="sm" onClick={() => openEdit(role)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete('roles') && (
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteRole(role)}>
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

      <AlertDialog open={!!deleteRole} onOpenChange={() => setDeleteRole(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer {deleteRole?.name}?</AlertDialogTitle>
          <AlertDialogAction onClick={handleDeleteRole} className="bg-destructive">Supprimer</AlertDialogAction>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default RolesPage;
