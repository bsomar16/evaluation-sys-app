/**
 * Service de sécurité des mots de passe
 * Hachage bcrypt via RPC Supabase (pgcrypto) ou bcryptjs en secours — jamais en clair.
 */

import { supabase } from '@/integrations/supabase/client';
import {
  hashPasswordClient,
  isPasswordHashed,
  verifyPasswordClient,
} from '@/lib/password-hash';

function isMissingRpcError(error: unknown, functionName: string): boolean {
  const err = error as { message?: string; code?: string };
  const message = (err?.message ?? '').toLowerCase();
  const code = err?.code ?? '';
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    message.includes('could not find the function') ||
    message.includes('could not found function') ||
    message.includes(functionName.toLowerCase())
  );
}

/** Hache toujours le mot de passe (RPC puis bcryptjs) */
async function hashPassword(plainPassword: string): Promise<string> {
  const { data, error } = await supabase.rpc('hash_password', {
    password: plainPassword,
  });

  if (!error && typeof data === 'string' && isPasswordHashed(data)) {
    return data;
  }

  if (error && !isMissingRpcError(error, 'hash_password')) {
    console.warn('⚠️ hash_password RPC:', (error as Error).message);
  }

  return hashPasswordClient(plainPassword);
}

async function createUserDirect(
  email: string,
  name: string,
  password: string,
  options?: {
    position?: string;
    branch_id?: string;
    department_id?: string;
    role_id?: string;
    role?: string;
  }
) {
  const hashedPassword = await hashPassword(password);

  const { data, error } = await supabase
    .from('users')
    .insert({
      email,
      name,
      password: hashedPassword,
      position: options?.position || null,
      branch_id: options?.branch_id || null,
      department_id: options?.department_id || null,
      role_id: options?.role_id || null,
      role: options?.role || 'employee',
      is_active: true,
      archived_at: null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Impossible de créer l'utilisateur: ${error.message}`);
  }

  return { success: true, data };
}

export const passwordService = {
  async createUserWithPassword(
    email: string,
    name: string,
    password: string,
    options?: {
      position?: string;
      branch_id?: string;
      department_id?: string;
      role_id?: string;
      role?: string;
    }
  ) {
    try {
      const { data, error } = await supabase.rpc('create_user_with_password', {
        p_email: email,
        p_name: name,
        p_password: password,
        p_position: options?.position || null,
        p_branch_id: options?.branch_id || null,
        p_department_id: options?.department_id || null,
        p_role_id: options?.role_id || null,
        p_role: options?.role || 'employee',
      });

      if (error) {
        if (isMissingRpcError(error, 'create_user_with_password')) {
          return createUserDirect(email, name, password, options);
        }
        throw new Error(`Impossible de créer l'utilisateur: ${error.message}`);
      }

      const result = data as { success?: boolean; error?: string };
      if (result?.success === false) {
        throw new Error(`Impossible de créer l'utilisateur: ${result?.error || 'erreur RPC'}`);
      }

      return { success: true, data };
    } catch (error: unknown) {
      const err = error as Error;
      throw err;
    }
  },

  async updateUserPassword(userId: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Le mot de passe doit contenir au moins 8 caractères');
    }

    const { data, error } = await supabase.rpc('update_user_password', {
      p_user_id: userId,
      p_new_password: newPassword,
    });

    if (error && isMissingRpcError(error, 'update_user_password')) {
      const hashedPassword = await hashPassword(newPassword);
      const { data: updated, error: updateError } = await supabase
        .from('users')
        .update({ password: hashedPassword })
        .eq('id', userId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Impossible de mettre à jour le mot de passe: ${updateError.message}`);
      }
      return { success: true, data: updated };
    }

    if (error) {
      throw new Error(`Impossible de mettre à jour le mot de passe: ${error.message}`);
    }

    const result = data as { success?: boolean; error?: string };
    if (result?.success === false) {
      throw new Error(`Impossible de mettre à jour le mot de passe: ${result?.error}`);
    }

    return { success: true, data };
  },

  async verifyPassword(plainPassword: string, storedHash: string): Promise<boolean> {
    if (!storedHash) return false;

    if (isPasswordHashed(storedHash)) {
      const { data, error } = await supabase.rpc('verify_password', {
        password: plainPassword,
        hash: storedHash,
      });

      if (!error && data === true) {
        return true;
      }

      return verifyPasswordClient(plainPassword, storedHash);
    }

    return plainPassword === storedHash;
  },

  /** Ré-hache un mot de passe encore en clair (migration douce) */
  async rehashIfPlain(userId: string, plainPassword: string, currentStored: string): Promise<void> {
    if (isPasswordHashed(currentStored)) return;
    const hashed = await hashPassword(plainPassword);
    await supabase.from('users').update({ password: hashed }).eq('id', userId);
  },

  generateTemporaryPassword(length: number = 12): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*_-+=';

    const allChars = uppercase + lowercase + numbers + symbols;
    let password = '';

    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    return password.split('').sort(() => Math.random() - 0.5).join('');
  },

  validateUsername(username: string): { valid: boolean; message?: string } {
    const value = username.trim();
    if (!value) {
      return { valid: false, message: 'Le username est obligatoire' };
    }
    if (value.length < 3) {
      return { valid: false, message: 'Le username doit contenir au moins 3 caractères' };
    }
    if (value.length > 50) {
      return { valid: false, message: 'Le username ne peut pas dépasser 50 caractères' };
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
      return {
        valid: false,
        message: 'Lettres, chiffres, point, tiret et underscore uniquement (pas d\'espace ni @)',
      };
    }
    return { valid: true };
  },

  getPasswordRules(password: string): { label: string; passed: boolean }[] {
    return [
      { label: 'Au moins 8 caractères', passed: password.length >= 8 },
      { label: 'Au moins une minuscule', passed: /[a-z]/.test(password) },
      { label: 'Au moins une majuscule', passed: /[A-Z]/.test(password) },
      { label: 'Au moins un chiffre', passed: /[0-9]/.test(password) },
      { label: 'Au moins un caractère spécial (!@#$%^&*_-+=)', passed: /[!@#$%^&*_\-+=]/.test(password) },
    ];
  },

  validatePasswordStrength(password: string): {
    valid: boolean;
    strength: 'weak' | 'fair' | 'good' | 'strong' | 'very-strong';
    suggestions: string[];
  } {
    const suggestions: string[] = [];
    let score = 0;

    if (password.length < 8) suggestions.push('Au moins 8 caractères');
    if (password.length < 12) score += 1;
    else score += 2;

    if (!/[a-z]/.test(password)) suggestions.push('Au moins une minuscule');
    else score += 1;

    if (!/[A-Z]/.test(password)) suggestions.push('Au moins une majuscule');
    else score += 1;

    if (!/[0-9]/.test(password)) suggestions.push('Au moins un chiffre');
    else score += 1;

    if (!/[!@#$%^&*_\-+=]/.test(password)) suggestions.push('Au moins un caractère spécial');
    else score += 1;

    if (/(.)\1{2,}/.test(password)) {
      suggestions.push('Évitez les caractères répétés');
      score -= 1;
    }

    let strength: 'weak' | 'fair' | 'good' | 'strong' | 'very-strong';
    if (score < 2) strength = 'weak';
    else if (score < 3) strength = 'fair';
    else if (score < 4) strength = 'good';
    else if (score < 5) strength = 'strong';
    else strength = 'very-strong';

    return { valid: suggestions.length === 0, strength, suggestions };
  },
};
