/**
 * Service pour gérer les rôles avec hiérarchie
 */

import { supabase } from "@/integrations/supabase/client";

export interface Role {
  id?: string;
  name: string;
  code: string;
  parent_role_id?: string | null;
  level?: number;
  permissions?: Record<string, any>;
  is_active?: boolean;
  created_at?: string;
}

export const RolesService = {
  /**
   * Récupérer tous les rôles
   */
  async getAll() {
    const { data, error } = await supabase
      .from("roles")
      .select("*, parent:parent_role_id(name, code)")
      .order("level", { ascending: true });

    if (error) throw error;
    return data;
  },

  /**
   * Récupérer un rôle par ID
   */
  async getById(id: string) {
    const { data, error } = await supabase
      .from("roles")
      .select("*, parent:parent_role_id(name, code)")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Récupérer un rôle par code
   */
  async getByCode(code: string) {
    const { data, error } = await supabase
      .from("roles")
      .select("*")
      .eq("code", code)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Créer un nouveau rôle
   */
  async create(role: Role) {
    const { data, error } = await supabase
      .from("roles")
      .insert([role])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Mettre à jour un rôle
   */
  async update(id: string, updates: Partial<Role>) {
    const { data, error } = await supabase
      .from("roles")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Supprimer un rôle
   */
  async delete(id: string) {
    const { error } = await supabase
      .from("roles")
      .delete()
      .eq("id", id);

    if (error) throw error;
  },

  /**
   * Récupérer les rôles enfants d'un rôle parent
   */
  async getChildren(parentRoleId: string) {
    const { data, error } = await supabase
      .from("roles")
      .select("*")
      .eq("parent_role_id", parentRoleId)
      .order("level");

    if (error) throw error;
    return data;
  },

  /**
   * Récupérer les rôles racine (sans parent)
   */
  async getRootRoles() {
    const { data, error } = await supabase
      .from("roles")
      .select("*")
      .is("parent_role_id", null)
      .order("level");

    if (error) throw error;
    return data;
  },

  /**
   * Vérifier si un rôle peut avoir des enfants
   * (système intelligent: un rôle ne peut avoir que certain type d'enfants)
   */
  canAssignChildRole(parentCode: string, childCode: string): boolean {
    // Hiérarchie intelligente
    const hierarchy: Record<string, string[]> = {
      SUPER_ADMIN: ["ADMIN"],
      ADMIN: ["HR", "MANAGER", "EMPLOYEE"],
      HR: ["EMPLOYEE"],
      MANAGER: ["EMPLOYEE"],
      EMPLOYEE: [], // No children allowed
    };

    const parentChildren = hierarchy[parentCode] || [];
    return parentChildren.includes(childCode);
  },

  /**
   * Assigner un rôle parent à un rôle enfant (avec validation)
   */
  async assignParentRole(roleId: string, parentRoleId: string) {
    // Récupérer le code du rôle enfant et parent
    const [childRole, parentRole] = await Promise.all([
      this.getById(roleId),
      this.getById(parentRoleId),
    ]);

    // Valider la relation
    if (!this.canAssignChildRole(parentRole.code, childRole.code)) {
      throw new Error(
        `Le rôle ${parentRole.name} ne peut pas avoir ${childRole.name} comme enfant`
      );
    }

    // Mettre à jour
    return this.update(roleId, { parent_role_id: parentRoleId });
  },

  /**
   * Récupérer l'arborescence complète des rôles
   */
  async getHierarchy() {
    const allRoles = await this.getAll();
    const hierarchy: Record<string, any> = {};

    // Créer une map pour accès rapide
    const rolesMap = new Map();
    allRoles.forEach((role) => {
      rolesMap.set(role.id, { ...role, children: [] });
    });

    // Construire la hiérarchie
    const roots: any[] = [];
    allRoles.forEach((role) => {
      const roleData = rolesMap.get(role.id);

      if (role.parent_role_id) {
        const parent = rolesMap.get(role.parent_role_id);
        if (parent) {
          parent.children.push(roleData);
        }
      } else {
        roots.push(roleData);
      }
    });

    return roots;
  },

  /**
   * Récupérer les permissions effectives d'un rôle (héritées + propres)
   */
  async getEffectivePermissions(roleId: string) {
    const role = await this.getById(roleId);
    let permissions = role.permissions || {};

    // Si le rôle a un parent, hériter ses permissions
    if (role.parent_role_id) {
      const parentPermissions = await this.getEffectivePermissions(role.parent_role_id);
      permissions = { ...parentPermissions, ...permissions };
    }

    return permissions;
  },
};
