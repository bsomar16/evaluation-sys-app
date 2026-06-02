/**
 * Service pour gérer les branches (filiales)
 */

import { supabase } from "@/integrations/supabase/client";

export interface Branch {
  id?: string;
  name: string;
  code: string;
  is_active?: boolean;
  created_at?: string;
}

export const BranchesService = {
  /**
   * Récupérer toutes les branches
   */
  async getAll() {
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .order("name");

    if (error) throw error;
    return data;
  },

  /**
   * Récupérer une branche par ID
   */
  async getById(id: string) {
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Récupérer une branche par code
   */
  async getByCode(code: string) {
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("code", code)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Créer une nouvelle branche
   */
  async create(branch: Branch) {
    const { data, error } = await supabase
      .from("branches")
      .insert([branch])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Mettre à jour une branche
   */
  async update(id: string, updates: Partial<Branch>) {
    const { data, error } = await supabase
      .from("branches")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Supprimer une branche
   */
  async delete(id: string) {
    const { error } = await supabase
      .from("branches")
      .delete()
      .eq("id", id);

    if (error) throw error;
  },

  /**
   * Récupérer les branches actives
   */
  async getActive() {
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("is_active", true)
      .order("name");

    if (error) throw error;
    return data;
  },

  /**
   * Toggle actif/inactif
   */
  async toggleActive(id: string, isActive: boolean) {
    return this.update(id, { is_active: isActive });
  },

  /**
   * Compter le nombre d'utilisateurs par branche
   */
  async getUsersCount(branchId: string) {
    const { count, error } = await supabase
      .from("users")
      .select("*", { count: "exact" })
      .eq("branch_id", branchId);

    if (error) throw error;
    return count || 0;
  },

  /**
   * Récupérer les statistiques de toutes les branches
   */
  async getStatistics() {
    const branches = await this.getAll();
    const stats = await Promise.all(
      branches.map(async (branch) => ({
        ...branch,
        usersCount: await this.getUsersCount(branch.id!),
      }))
    );

    return stats;
  },
};
