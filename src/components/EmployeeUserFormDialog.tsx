import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { passwordService } from '@/services/passwordService';
import { roleSlugFromRoleCode } from '@/lib/auth-roles';
import { isUserArchived } from '@/lib/user-archive';
import {
  filterByScope,
  getUserCreationScope,
  isBranchAssignable,
  isDepartmentAssignable,
  isRoleAssignable,
} from '@/lib/user-creation-scope';
import {
  buildUsernameFromName,
  emptyEmployeeUserForm,
  formatNom,
  formatPrenom,
  type EmployeeUserFormValues,
} from '@/lib/user-form-utils';
import { getSessionUser, isPlatformAdmin } from '@/lib/session-user';
import type { BranchRecord } from '@/lib/branch-tree';
import type { DepartmentRecord } from '@/lib/department-tree';
import type { RoleRecord } from '@/lib/role-tree';
import { Eye, EyeOff } from 'lucide-react';
import { splitFullName } from '@/lib/user-name';

export interface EmployeeUserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  editingUser?: {
    id: string;
    name: string;
    email: string;
    code?: string;
    branch_id?: string;
    department_id?: string;
    role_id?: string;
    role?: string;
  } | null;
  roles: RoleRecord[];
  branches: BranchRecord[];
  departments: DepartmentRecord[];
  onSaved: () => void;
  /** Pré-sélection du rôle (page /equipe/:roleId) */
  defaultRoleId?: string;
}

export function EmployeeUserFormDialog({
  open,
  onOpenChange,
  mode,
  editingUser = null,
  roles,
  branches,
  departments,
  onSaved,
  defaultRoleId = '',
}: EmployeeUserFormDialogProps) {
  const { toast } = useToast();
  const session = getSessionUser();
  const isDeveloper = isPlatformAdmin(session);
  const isCreate = mode === 'create';

  const [formData, setFormData] = useState<EmployeeUserFormValues>(() =>
    emptyEmployeeUserForm(defaultRoleId)
  );
  const [passwordFeedback, setPasswordFeedback] = useState({
    valid: false,
    strength: 'weak' as 'weak' | 'fair' | 'good' | 'strong' | 'very-strong',
    suggestions: [] as string[],
  });
  const [showPassword, setShowPassword] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const creationScope = useMemo(
    () => getUserCreationScope(session, roles, branches, departments),
    [session, roles, branches, departments]
  );

  const editKeepIds = useMemo(() => {
    if (!editingUser) return [] as string[];
    return [editingUser.role_id, editingUser.branch_id, editingUser.department_id].filter(
      Boolean
    ) as string[];
  }, [editingUser]);

  const selectableRoles = useMemo(
    () => filterByScope(roles, creationScope.roleIds, creationScope.unrestricted, editKeepIds),
    [roles, creationScope, editKeepIds]
  );

  const selectableBranches = useMemo(
    () => filterByScope(branches, creationScope.branchIds, creationScope.unrestricted, editKeepIds),
    [branches, creationScope, editKeepIds]
  );

  const selectableDepartments = useMemo(
    () =>
      filterByScope(departments, creationScope.departmentIds, creationScope.unrestricted, editKeepIds),
    [departments, creationScope, editKeepIds]
  );

  useEffect(() => {
    setPasswordFeedback(passwordService.validatePasswordStrength(formData.password));
  }, [formData.password]);

  useEffect(() => {
    if (!open) return;
    if (isCreate) {
      setFormData(emptyEmployeeUserForm(defaultRoleId));
      setUsernameError(null);
      setUsernameTouched(false);
      setShowPassword(false);
      return;
    }
    if (editingUser) {
      const { nom, prenom } = splitFullName(editingUser.name);
      setFormData({
        code: editingUser.code || '',
        first_name: prenom,
        last_name: nom,
        username: editingUser.email,
        password: '',
        branch: editingUser.branch_id || '',
        department: editingUser.department_id || '',
        role: editingUser.role_id || '',
      });
      setUsernameError(null);
      setUsernameTouched(false);
      setShowPassword(false);
    }
  }, [open, isCreate, editingUser, defaultRoleId]);

  // Auto-sélectionner la filiale si elle est seule
  useEffect(() => {
    if (!isCreate || !open || formData.branch) return;
    if (selectableBranches.length === 1) {
      setFormData((prev) => ({ ...prev, branch: selectableBranches[0].id }));
    }
  }, [selectableBranches, isCreate, open, formData.branch]);

  // Auto-sélectionner le département si c'est le seul disponible (département sans fils)
  useEffect(() => {
    if (!isCreate || !open || formData.department) return;
    if (selectableDepartments.length === 1 && session?.department_id === selectableDepartments[0].id) {
      setFormData((prev) => ({ ...prev, department: selectableDepartments[0].id }));
    }
  }, [selectableDepartments, isCreate, open, formData.department, session?.department_id]);

  useEffect(() => {
    if (!isCreate || !open || usernameTouched) return;
    if (!formData.last_name.trim() || !formData.first_name.trim()) return;
    const auto = buildUsernameFromName(formData.last_name, formData.first_name);
    if (auto) {
      setFormData((prev) => ({ ...prev, username: auto }));
    }
  }, [formData.last_name, formData.first_name, isCreate, usernameTouched, open]);

  const renderPasswordStrength = () => {
    if (!formData.password) return null;
    const rules = passwordService.getPasswordRules(formData.password);
    return (
      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <div className="flex items-center justify-between mb-2">
          <span>Force du mot de passe</span>
          <span
            className={`font-semibold ${passwordFeedback.valid ? 'text-emerald-600' : 'text-amber-600'}`}
          >
            {passwordFeedback.strength.replace('-', ' ')}
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-200 overflow-hidden mb-2">
          <div
            className={`h-full ${
              passwordFeedback.strength === 'weak'
                ? 'bg-red-500'
                : passwordFeedback.strength === 'fair'
                  ? 'bg-orange-500'
                  : passwordFeedback.strength === 'good'
                    ? 'bg-yellow-500'
                    : passwordFeedback.strength === 'strong'
                      ? 'bg-emerald-500'
                      : 'bg-cyan-500'
            }`}
            style={{
              width:
                passwordFeedback.strength === 'weak'
                  ? '20%'
                  : passwordFeedback.strength === 'fair'
                    ? '40%'
                    : passwordFeedback.strength === 'good'
                      ? '60%'
                      : passwordFeedback.strength === 'strong'
                        ? '80%'
                        : '100%',
            }}
          />
        </div>
        <ul className="space-y-1 text-xs">
          {rules.map((rule) => (
            <li key={rule.label} className={rule.passed ? 'text-emerald-700' : 'text-amber-700'}>
              {rule.passed ? '✓' : '○'} {rule.label}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const handleSave = async () => {
    if (!formData.first_name || !formData.last_name || !formData.username || !formData.branch || !formData.role) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Remplissez tous les champs obligatoires' });
      return;
    }

    const deptId = formData.department || '';
    if (!isRoleAssignable(formData.role, creationScope, editKeepIds)) {
      toast({
        variant: 'destructive',
        title: 'Rôle non autorisé',
        description: 'Vous ne pouvez assigner que des rôles fils de votre rôle.',
      });
      return;
    }
    if (!isBranchAssignable(formData.branch, creationScope, editKeepIds)) {
      toast({
        variant: 'destructive',
        title: 'Filiale non autorisée',
        description: 'Vous ne pouvez assigner que des filiales filles de votre filiale.',
      });
      return;
    }
    if (deptId && !isDepartmentAssignable(deptId, creationScope, editKeepIds)) {
      toast({
        variant: 'destructive',
        title: 'Département non autorisé',
        description: 'Vous ne pouvez assigner que des départements fils de votre département.',
      });
      return;
    }

    const username = formData.username.trim();
    const usernameValidation = passwordService.validateUsername(username);
    if (!usernameValidation.valid) {
      toast({
        variant: 'destructive',
        title: 'Username invalide',
        description: usernameValidation.message,
      });
      return;
    }

    if (isCreate && !formData.password) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Le mot de passe est obligatoire' });
      return;
    }

    if (formData.password) {
      const validation = passwordService.validatePasswordStrength(formData.password);
      if (!validation.valid) {
        toast({
          variant: 'destructive',
          title: 'Mot de passe faible',
          description: validation.suggestions.join(', '),
        });
        return;
      }
    }

    setSaving(true);
    try {
      const name = `${formatNom(formData.last_name)} ${formatPrenom(formData.first_name)}`;

      const { data: existingUser } = await supabase
        .from('users')
        .select('id, archived_at')
        .eq('email', username)
        .maybeSingle();

      if (existingUser && (!editingUser || existingUser.id !== editingUser.id)) {
        const archivedConflict = isUserArchived(existingUser);
        setUsernameError(
          archivedConflict ? 'Username réservé par un compte archivé' : 'Username déjà utilisé'
        );
        toast({
          variant: 'destructive',
          title: archivedConflict ? 'Compte archivé' : 'Username déjà utilisé',
          description: archivedConflict
            ? 'Restaurez le compte ou modifiez son identifiant.'
            : 'Choisissez un autre identifiant',
        });
        return;
      }

      const selectedRole = roles.find((r) => r.id === formData.role);
      const userCode = formData.code.trim() || null;

      if (!isCreate && editingUser) {
        const roleSlug = roleSlugFromRoleCode(selectedRole?.code ?? editingUser.role);
        const dataToUpdate: Record<string, unknown> = {
          name,
          email: username,
          code: userCode,
          branch_id: formData.branch,
          department_id: deptId || null,
          role_id: formData.role,
          role: roleSlug,
        };
        if (formData.password) {
          await passwordService.updateUserPassword(editingUser.id, formData.password);
        }
        let { error } = await supabase.from('users').update(dataToUpdate).eq('id', editingUser.id);
        if (error?.message?.toLowerCase().includes('code')) {
          const { code: _code, ...legacyUpdate } = dataToUpdate;
          const retry = await supabase.from('users').update(legacyUpdate).eq('id', editingUser.id);
          error = retry.error;
        }
        if (error) throw error;
        toast({ title: 'Succès', description: 'Employé modifié' });
      } else {
        const roleSlug = roleSlugFromRoleCode(selectedRole?.code);
        const result = await passwordService.createUserWithPassword(username, name, formData.password, {
          branch_id: formData.branch,
          department_id: deptId || null,
          role_id: formData.role,
          role: roleSlug,
        });
        if (!result.success) {
          throw new Error("Impossible de créer l'employé");
        }
        if (userCode) {
          let { error } = await supabase
            .from('users')
            .update({ code: userCode })
            .eq('email', username);
          if (error?.message?.toLowerCase().includes('code')) {
            error = null; // Colonne absente : on laisse passer sans bloquer la création
          }
          if (error) throw error;
        }
        toast({ title: 'Succès', description: 'Employé créé' });
      }

      onSaved();
      onOpenChange(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur';
      toast({ variant: 'destructive', title: 'Erreur', description: message });
    } finally {
      setSaving(false);
    }
  };

  const submitDisabled =
    !!usernameError ||
    saving ||
    (!isDeveloper && (selectableRoles.length === 0 || selectableBranches.length === 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isCreate ? 'Créer un employé' : 'Modifier l\'employé'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Code"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="border-2 border-blue-300 bg-blue-50"
          />
          <Input
            placeholder="Nom (majuscule)"
            value={formData.last_name}
            onChange={(e) => setFormData({ ...formData, last_name: formatNom(e.target.value) })}
            className="border-2 border-blue-300 bg-blue-50"
          />
          <Input
            placeholder="Prénom"
            value={formData.first_name}
            onChange={(e) => setFormData({ ...formData, first_name: formatPrenom(e.target.value) })}
            className="border-2 border-blue-300 bg-blue-50"
          />
          <div className="space-y-2">
            <Input
              placeholder="Nom utilisateur"
              value={formData.username}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^a-zA-Z0-9._-]/g, '');
                setFormData({ ...formData, username: cleaned });
                setUsernameError(null);
                setUsernameTouched(true);
              }}
              className={`border-2 bg-blue-50 ${usernameError ? 'border-red-500' : 'border-blue-300'}`}
              autoComplete="username"
            />
            {usernameError && <p className="text-xs text-red-600">{usernameError}</p>}
          </div>
          <div className="space-y-2">
            {!isCreate && <label className="text-sm font-medium">Mot de passe</label>}
            <div className="relative">
              <Input
                placeholder={
                  isCreate ? 'Mot de passe' : 'Nouveau mot de passe (vide = inchangé)'
                }
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="pr-10 border-2 border-blue-300 bg-blue-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {renderPasswordStrength()}
          </div>
          <Select
            value={formData.branch}
            onValueChange={(value) => setFormData({ ...formData, branch: value })}
            disabled={selectableBranches.length === 1}
          >
            <SelectTrigger className={`border-2 ${selectableBranches.length === 1 ? 'bg-gray-100 border-gray-300 opacity-60' : 'border-blue-300 bg-blue-50'}`}>
              <SelectValue placeholder="Filiale" />
            </SelectTrigger>
            <SelectContent>
              {selectableBranches.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  Aucune filiale disponible
                </SelectItem>
              ) : (
                selectableBranches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {selectableBranches.length === 1 && (
            <p className="text-xs text-muted-foreground">
              Filiale fixée par défaut (lecture seule)
            </p>
          )}
          {!isDeveloper && session?.branch_id && selectableBranches.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Aucune filiale fille sous votre filiale.
            </p>
          )}
          <Select
            value={formData.department || '__none__'}
            onValueChange={(value) =>
              setFormData({ ...formData, department: value === '__none__' ? '' : value })
            }
            disabled={selectableDepartments.length === 1 && session?.department_id && formData.department === session.department_id}
          >
            <SelectTrigger className={`border-2 ${selectableDepartments.length === 1 && session?.department_id && formData.department === session.department_id ? 'bg-gray-100 border-gray-300 opacity-60' : 'border-blue-300 bg-blue-50'}`}>
              <SelectValue placeholder="Département (optionnel)" />
            </SelectTrigger>
            <SelectContent>
              {selectableDepartments.length > 1 && (
                <SelectItem value="__none__">— Aucun —</SelectItem>
              )}
              {selectableDepartments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectableDepartments.length === 1 && session?.department_id && formData.department === session.department_id && (
            <p className="text-xs text-muted-foreground">
              Département fixé par défaut (lecture seule)
            </p>
          )}
          <Select
            value={formData.role}
            onValueChange={(value) => setFormData({ ...formData, role: value })}
          >
            <SelectTrigger className="border-2 border-blue-300 bg-blue-50">
              <SelectValue placeholder="Rôle" />
            </SelectTrigger>
            <SelectContent>
              {selectableRoles.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  Aucun rôle fils disponible
                </SelectItem>
              ) : (
                selectableRoles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {!isDeveloper && selectableRoles.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Configurez des rôles fils pour créer un employé.
            </p>
          )}
          <Button onClick={handleSave} className="w-full" disabled={submitDisabled}>
            {saving ? 'Enregistrement…' : isCreate ? 'Créer' : 'Modifier'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
