import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { passwordService } from '@/services/passwordService';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Eye, EyeOff } from 'lucide-react';
import { getSessionUser, isSiteDeveloper } from '@/lib/session-user';
import { SITE_DEVELOPER } from '@/types/roles';
import { roleBadgeClassName, getRoleBadgeStyleFromColor } from '@/lib/role-colors';
import { hideLoadingOverlay } from '@/lib/loading-overlay';
import { useI18n } from '@/lib/i18n';

interface UserProfile {
  name: string;
  email: string;
  role: string;
}

export default function Settings() {
  const { toast } = useToast();
  const { t } = useI18n();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [newPasswordFeedback, setNewPasswordFeedback] = useState({ valid: false, strength: 'weak' as 'weak' | 'fair' | 'good' | 'strong' | 'very-strong', suggestions: [] as string[] });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadUserProfile();
  }, []);

  useEffect(() => {
    setNewPasswordFeedback(passwordService.validatePasswordStrength(passwordData.newPassword));
  }, [passwordData.newPassword]);

  const loadUserProfile = () => {
    try {
      const session = getSessionUser();
      if (session) {
        setUser({
          name: session.name || 'User',
          email: session.email || session.username || '',
          role: isSiteDeveloper(session) ? SITE_DEVELOPER.role : (session.role || 'employee'),
        });
      }
    } catch (error) {
      console.error('Erreur:', error);
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible de charger le profil' });
    } finally {
      setLoading(false);
      hideLoadingOverlay();
    }
  };

  const handleChangePassword = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Remplissez tous les champs' });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Les mots de passe ne correspondent pas' });
      return;
    }

    // Valider la force du nouveau mot de passe
    const validation = passwordService.validatePasswordStrength(passwordData.newPassword);
    if (!validation.valid) {
      toast({ 
        variant: 'destructive', 
        title: 'Mot de passe trop faible', 
        description: validation.suggestions.join(', ') 
      });
      return;
    }

    setUpdating(true);
    try {
      // Récupérer l'utilisateur courant
      const userData = localStorage.getItem('user');
      if (!userData) throw new Error('Utilisateur non trouvé');

      const user = JSON.parse(userData);
      const userId = user.id;

      // TODO: Vérifier le mot de passe actuel avec la BD
      // Pour maintenant, on assume que l'utilisateur a saisi le bon mot de passe
      
      // Mettre à jour le mot de passe (qui sera haché automatiquement)
      const result = await passwordService.updateUserPassword(userId, passwordData.newPassword);

      if (result.success) {
        toast({ title: 'Succès', description: 'Mot de passe changé avec succès et haché' });
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        throw new Error('Impossible de mettre à jour le mot de passe');
      }
    } catch (error: any) {
      console.error('Erreur:', error);
      toast({ variant: 'destructive', title: 'Erreur', description: error.message });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">{t('common.loading')}</div>;
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleLabel = (role: string) => {
    if (role === SITE_DEVELOPER.role) return SITE_DEVELOPER.roleName;
    const roleMap: Record<string, string> = {
      admin: 'Administrateur',
      hr: 'RH',
      manager: 'Manager',
      employee: 'Employé',
      developer: SITE_DEVELOPER.roleName,
    };
    return roleMap[role] || role;
  };

  const session = getSessionUser();
  const isDeveloper = isSiteDeveloper(session);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('settings.title')}</h1>
        <p className="text-muted-foreground">{t('settings.subtitle')}</p>
      </div>

      {/* Profil Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.profileInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-lg font-bold bg-primary text-primary-foreground">
                {user ? getInitials(user.name) : 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-lg font-semibold">{user?.name}</h3>
              <p className="text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('settings.name')}</label>
              <Input value={user?.name || ''} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('settings.email')}</label>
              <Input value={user?.email || ''} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('settings.role')}</label>
              {isDeveloper ? (
                <div className="flex h-10 items-center">
                  <span
                    className={roleBadgeClassName}
                    style={getRoleBadgeStyleFromColor(SITE_DEVELOPER.roleColor)}
                  >
                    {SITE_DEVELOPER.roleName}
                  </span>
                </div>
              ) : (
                <Input value={getRoleLabel(user?.role || '')} disabled className="bg-muted" />
              )}
            </div>
            {isDeveloper ? (
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">{t('settings.accountType')}</label>
                <Input value={SITE_DEVELOPER.controlPanelLabel} disabled className="bg-muted" />
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Change Password Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.security')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('settings.currentPassword')}</label>
            <div className="relative">
              <Input
                type={showPasswords.current ? 'text' : 'password'}
                placeholder={t('settings.currentPasswordPlaceholder')}
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
              />
              <button
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
              >
                {showPasswords.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('settings.newPassword')}</label>
            <div className="relative">
              <Input
                type={showPasswords.new ? 'text' : 'password'}
                placeholder={t('settings.newPasswordPlaceholder')}
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
              />
              <button
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
              >
                {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordData.newPassword && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <span>{t('settings.passwordStrength')}</span>
                  <span className={`font-semibold ${newPasswordFeedback.valid ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {newPasswordFeedback.strength.replace('-', ' ')}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden mb-2">
                  <div
                    className={`h-full ${newPasswordFeedback.strength === 'weak' ? 'bg-red-500' : newPasswordFeedback.strength === 'fair' ? 'bg-orange-500' : newPasswordFeedback.strength === 'good' ? 'bg-yellow-500' : newPasswordFeedback.strength === 'strong' ? 'bg-emerald-500' : 'bg-cyan-500'}`}
                    style={{ width: newPasswordFeedback.strength === 'weak' ? '20%' : newPasswordFeedback.strength === 'fair' ? '40%' : newPasswordFeedback.strength === 'good' ? '60%' : newPasswordFeedback.strength === 'strong' ? '80%' : '100%' }}
                  />
                </div>
                {newPasswordFeedback.suggestions.length > 0 ? (
                  <ul className="list-disc list-inside text-xs text-amber-700 space-y-1">
                    {newPasswordFeedback.suggestions.map((suggestion) => (
                      <li key={suggestion}>{suggestion}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-emerald-700">{t('settings.passwordSolid')}</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('settings.confirmPassword')}</label>
            <div className="relative">
              <Input
                type={showPasswords.confirm ? 'text' : 'password'}
                placeholder={t('settings.confirmPasswordPlaceholder')}
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
              />
              <button
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
              >
                {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button onClick={handleChangePassword} disabled={updating} className="w-full">
            {updating ? t('settings.changingPassword') : t('settings.changePassword')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
