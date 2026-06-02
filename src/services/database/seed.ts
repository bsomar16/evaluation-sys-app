/**
 * Service de seed (insertion des données par défaut)
 * Insère les rôles, branches et utilisateurs par défaut
 */

import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_DEMO } from "@/types/roles";
import { passwordService } from "@/services/passwordService";

export interface Role {
  name: string;
  code: string;
  level: number;
  permissions: Record<string, any>;
}

export interface Branch {
  name: string;
  code: string;
}

const DEFAULT_ROLES: Role[] = [
  {
    name: "Super Admin",
    code: "SUPER_ADMIN",
    level: 0,
    permissions: { all: true },
  },
  {
    name: "Admin",
    code: "ADMIN",
    level: 1,
    permissions: {
      users: true,
      roles: true,
      branches: true,
    },
  },
  {
    name: "HR Manager",
    code: "HR",
    level: 2,
    permissions: {
      users_view: true,
      users_create: true,
      evaluations: true,
    },
  },
  {
    name: "Manager",
    code: "MANAGER",
    level: 2,
    permissions: {
      team_view: true,
      evaluations: true,
      training: true,
    },
  },
  {
    name: "Employee",
    code: "EMPLOYEE",
    level: 3,
    permissions: {
      self_view: true,
      training_request: true,
    },
  },
];

const DEFAULT_BRANCHES: Branch[] = [
  {
    name: "Siège Principal",
    code: "HEAD",
  },
  {
    name: "Agence Nord",
    code: "NORTH",
  },
  {
    name: "Agence Sud",
    code: "SOUTH",
  },
];

/**
 * Seed les rôles par défaut avec hiérarchie parent-child
 */
export async function seedDefaultRoles() {
  try {
    console.log("🌱 Seeding des rôles par défaut...");

    // Vérifier si les rôles existent déjà
    const { data: existingRoles } = await supabase
      .from("roles")
      .select("code")
      .in("code", DEFAULT_ROLES.map((r) => r.code));

    if (existingRoles && existingRoles.length > 0) {
      console.log("✓ Rôles par défaut déjà existants");
      return true;
    }

    // Insérer les rôles
    for (const role of DEFAULT_ROLES) {
      // Pour les rôles enfants, trouver le parent
      let parentRoleId = null;

      if (role.code !== "SUPER_ADMIN") {
        let parentCode = "SUPER_ADMIN";
        if (role.code === "ADMIN") {
          parentCode = "SUPER_ADMIN";
        } else if (role.code === "HR" || role.code === "MANAGER") {
          parentCode = "ADMIN";
        } else if (role.code === "EMPLOYEE") {
          parentCode = "ADMIN";
        }

        const { data: parentRole } = await supabase
          .from("roles")
          .select("id")
          .eq("code", parentCode)
          .single();

        parentRoleId = parentRole?.id;
      }

      const { error } = await supabase.from("roles").insert({
        name: role.name,
        code: role.code,
        level: role.level,
        permissions: role.permissions,
        parent_role_id: parentRoleId,
        is_active: true,
      });

      if (error) {
        console.warn(`⚠️ Erreur lors de l'insertion du rôle ${role.code}:`, error);
      } else {
        console.log(`✅ Rôle créé: ${role.name}`);
      }
    }

    return true;
  } catch (error) {
    console.error("❌ Erreur lors du seeding des rôles:", error);
    return false;
  }
}

/**
 * Seed les branches par défaut
 */
export async function seedDefaultBranches() {
  try {
    console.log("🌱 Seeding des branches par défaut...");

    // Vérifier si les branches existent déjà
    const { data: existingBranches } = await supabase
      .from("branches")
      .select("code")
      .in("code", DEFAULT_BRANCHES.map((b) => b.code));

    if (existingBranches && existingBranches.length > 0) {
      console.log("✓ Branches par défaut déjà existantes");
      return true;
    }

    // Insérer les branches
    for (const branch of DEFAULT_BRANCHES) {
      const { error } = await supabase.from("branches").insert({
        name: branch.name,
        code: branch.code,
        is_active: true,
      });

      if (error) {
        console.warn(`⚠️ Erreur lors de l'insertion de la branche ${branch.code}:`, error);
      } else {
        console.log(`✅ Branche créée: ${branch.name}`);
      }
    }

    return true;
  } catch (error) {
    console.error("❌ Erreur lors du seeding des branches:", error);
    return false;
  }
}

/**
 * Compte démo employé (username demo / mot de passe demo123) — aligné avec Login.tsx
 */
export async function seedDemoUser() {
  try {
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", DEFAULT_DEMO.username)
      .maybeSingle();

    if (existing) {
      console.log("✓ Compte démo déjà présent");
      return true;
    }

    const { data: employeeRole } = await supabase
      .from("roles")
      .select("id")
      .eq("code", "EMPLOYEE")
      .maybeSingle();

    if (!employeeRole?.id) {
      console.warn("⚠️ Rôle EMPLOYEE absent — compte démo non créé");
      return false;
    }

    const { data: branch } = await supabase
      .from("branches")
      .select("id")
      .eq("code", "HEAD")
      .maybeSingle();

    await passwordService.createUserWithPassword(
      DEFAULT_DEMO.username,
      DEFAULT_DEMO.name,
      DEFAULT_DEMO.password,
      {
        branch_id: branch?.id ?? undefined,
        role_id: employeeRole.id,
        role: DEFAULT_DEMO.role,
      }
    );

    console.log(`✅ Compte démo créé: ${DEFAULT_DEMO.username}`);
    return true;
  } catch (error) {
    console.warn("⚠️ Erreur création compte démo:", error);
    return false;
  }
}

/**
 * Seed tous les données par défaut
 */
export async function seedAllDefaults() {
  try {
    console.log("🌱 Seeding des données par défaut...");

    const rolesSuccess = await seedDefaultRoles();
    const branchesSuccess = await seedDefaultBranches();
    await seedDemoUser();

    if (rolesSuccess && branchesSuccess) {
      console.log("✅ Seeding des données par défaut terminé!");
      return true;
    }

    return false;
  } catch (error) {
    console.error("❌ Erreur lors du seeding:", error);
    return false;
  }
}
