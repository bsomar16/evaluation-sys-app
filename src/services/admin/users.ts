/**
 * Service pour gérer les utilisateurs
 */

import { supabase } from "@/integrations/supabase/client";
import { archiveUser, restoreUser, setUserActive } from "@/services/userArchiveService";

export interface User {
  id?: string;
  email: string;
  name: string;
  position?: string;
  branch_id?: string;
  role_id?: string;
  role?: string;
  is_active?: boolean;
  archived_at?: string | null;
  created_at?: string;
}

export const UsersService = {
  /**
   * Récupérer tous les utilisateurs
   */
  async getAll() {
    const { data, error } = await supabase
      .from("users")
      .select("*, branches(name), roles(name, code)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  },

  /**
   * Récupérer un utilisateur par ID
   */
  async getById(id: string) {
    const { data, error } = await supabase
      .from("users")
      .select("*, branches(name), roles(name, code)")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Créer un nouvel utilisateur
   */
  async create(user: User) {
    const { data, error } = await supabase
      .from("users")
      .insert([user])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Mettre à jour un utilisateur
   */
  async update(id: string, updates: Partial<User>) {
    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Archiver un utilisateur (soft delete)
   */
  async archive(id: string) {
    return archiveUser(id);
  },

  /**
   * Restaurer un utilisateur archivé
   */
  async restore(id: string) {
    return restoreUser(id);
  },

  /** Suppression définitive en base (irréversible) */
  async delete(id: string) {
    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", id);

    if (error) throw error;
  },

  /**
   * Chercher des utilisateurs par email
   */
  async searchByEmail(email: string) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .ilike("email", `%${email}%`);

    if (error) throw error;
    return data;
  },

  /**
   * Récupérer les utilisateurs par rôle
   */
  async getByRole(roleId: string) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("role_id", roleId)
      .order("name");

    if (error) throw error;
    return data;
  },

  /**
   * Récupérer les utilisateurs par branche
   */
  async getByBranch(branchId: string) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("branch_id", branchId)
      .order("name");

    if (error) throw error;
    return data;
  },

  /**
   * Toggle actif/inactif
   */
  async toggleActive(id: string, isActive: boolean) {
    return setUserActive(id, isActive);
  },
};
