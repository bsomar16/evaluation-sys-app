import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SITE_DEVELOPER, DEFAULT_DEMO } from "@/types/roles";
import { saveSiteDeveloperSession } from "@/lib/session-user";
import { passwordService } from "@/services/passwordService";
import { getHomePathForRole, roleSlugFromRoleCode } from "@/lib/auth-roles";
import { isUserArchived } from "@/lib/user-archive";

export default function Login() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);


  const buildSessionFromDbUser = async (userData: any, loginUsername: string) => {
    const roleSlug = roleSlugFromRoleCode(userData?.role);

    let roleName = "";
    let roleColor = "";
    let branchName = "";
    let departmentName = "";
    let rolePermissions: Record<string, unknown> = {};

    if (userData.role_id) {
      const { data: roleRow } = await supabase
        .from("roles")
        .select("name, color, permissions")
        .eq("id", userData.role_id)
        .maybeSingle();
      roleName = roleRow?.name ?? "";
      roleColor = roleRow?.color ?? "";
      rolePermissions = (roleRow?.permissions as Record<string, unknown>) ?? {};
    }

    if (userData.branch_id) {
      const { data: branchRow } = await supabase
        .from("branches")
        .select("name")
        .eq("id", userData.branch_id)
        .maybeSingle();
      branchName = branchRow?.name ?? "";
    }

    if (userData.department_id) {
      const { data: deptRow } = await supabase
        .from("departments")
        .select("name")
        .eq("id", userData.department_id)
        .maybeSingle();
      departmentName = deptRow?.name ?? "";
    }

    return {
      id: userData.id,
      username: loginUsername,
      name: userData?.name || loginUsername,
      email: userData?.email || loginUsername,
      role: roleSlug,
      role_id: userData.role_id ?? null,
      roleName,
      roleColor,
      branch_id: userData.branch_id ?? null,
      branchName,
      department_id: userData.department_id ?? null,
      departmentName,
      permissions: rolePermissions,
    };
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const loginUsername = username.trim().toLowerCase();

      // Créateur du site — username « admin » réservé au développeur (pas un user BDD)
      if (loginUsername === SITE_DEVELOPER.username) {
        if (password !== SITE_DEVELOPER.password) {
          throw new Error("Identifiants invalides");
        }

        let hierarchyRoleId: string | null = null;
        const { data: superRole } = await supabase
          .from("roles")
          .select("id")
          .eq("code", "SUPER_ADMIN")
          .maybeSingle();
        if (superRole?.id) {
          hierarchyRoleId = superRole.id;
        } else {
          const { data: adminRole } = await supabase
            .from("roles")
            .select("id")
            .eq("code", "ADMIN")
            .maybeSingle();
          hierarchyRoleId = adminRole?.id ?? null;
        }

        saveSiteDeveloperSession(hierarchyRoleId);

        toast({
          title: "Succès",
          description: "Connexion réussie!",
        });

        navigate(getHomePathForRole(SITE_DEVELOPER.role));
        return;
      }

      // Cherche l'utilisateur dans la base par username
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("email", loginUsername)
        .limit(1)
        .single();

      if (userError || !userData) {
        throw new Error("Identifiants invalides");
      }

      if (isUserArchived(userData)) {
        throw new Error("Ce compte est archivé. Contactez l'administrateur.");
      }

      if (userData.is_active === false) {
        throw new Error("Ce compte est désactivé. Contactez l'administrateur.");
      }

      const storedPassword = userData.password ?? "";
      const passwordOk = await passwordService.verifyPassword(password, storedPassword);
      if (!passwordOk) {
        throw new Error("Identifiants invalides");
      }

      await passwordService.rehashIfPlain(userData.id, password, storedPassword);

      const sessionUser = await buildSessionFromDbUser(userData, username);

      localStorage.setItem("user", JSON.stringify(sessionUser));
      localStorage.setItem("userRole", sessionUser.role);

      toast({
        title: "Succès",
        description: "Connexion réussie!",
      });

      navigate(getHomePathForRole(sessionUser.role));
    } catch (error: any) {
      console.error("Erreur connexion:", error);
      toast({
        title: "Erreur",
        description: error.message || "Identifiants invalides",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-md space-y-6">
        {/* Titre */}
        <div className="text-center space-y-3">
          <p className="text-muted-foreground text-sm">Plateforme de gestion des ressources humaines</p>
        </div>

        {/* Formulaire */}
        <Card className="border-border shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl font-heading text-foreground">Connexion</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Nom d&apos;utilisateur</label>
                <Input
                  type="text"
                  placeholder="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="border-input bg-background text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Mot de passe</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10 border-input bg-background text-foreground placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary hover:bg-primary text-primary-foreground font-medium"
              >
                {isLoading ? "Connexion en cours..." : "Se connecter"}
              </Button>
            </form>

            {/* Information de démo */}
            <div className="mt-6 p-4 bg-accent rounded-lg border border-border space-y-3">
              <p className="font-medium text-accent-foreground text-sm font-heading">Comptes de test</p>
              
              {/* Admin Account */}
              <div className="space-y-1 text-sm border-b border-border pb-3">
                <p className="text-accent-foreground font-semibold">🛠️ Développeur (créateur du site)</p>
                <p className="text-accent-foreground">
                  Username: <span className="font-semibold text-primary">{SITE_DEVELOPER.username}</span>
                </p>
                <p className="text-accent-foreground">
                  Mot de passe: <span className="font-semibold text-primary">{SITE_DEVELOPER.password}</span>
                </p>
              </div>

              {/* Demo Account */}
              <div className="space-y-1 text-sm">
                <p className="text-accent-foreground font-semibold">👤 Démo Employee</p>
                <p className="text-accent-foreground">
                  Username: <span className="font-semibold text-primary">{DEFAULT_DEMO.username}</span>
                </p>
                <p className="text-accent-foreground">
                  Mot de passe: <span className="font-semibold text-primary">{DEFAULT_DEMO.password}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-muted-foreground text-xs">
          <p>© 2026 DD Agro. Tous droits réservés.</p>
        </div>
      </div>
    </div>
  );
}
