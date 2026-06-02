import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useSupabaseAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Récupère la session actuelle
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };

    getUser();

    // Écoute les changements d'auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription?.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { data, error };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return {
    user,
    loading,
    signUp,
    signIn,
    signOut,
  };
}

export function useSupabaseQuery(table: string, options?: any) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        let query = supabase.from(table).select('*');

        if (options?.select) {
          query = supabase.from(table).select(options.select);
        }

        if (options?.filter) {
          for (const [key, value] of Object.entries(options.filter)) {
            query = query.eq(key, value);
          }
        }

        const { data: result, error: err } = await query;

        if (err) throw err;
        setData(result || []);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [table, options]);

  return { data, loading, error };
}

export function useSupabaseMutation(table: string, type: 'insert' | 'update' | 'delete' = 'insert') {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);

  const execute = async (payload: any, id?: string) => {
    setLoading(true);
    setError(null);

    try {
      let query: any;

      if (type === 'insert') {
        query = supabase.from(table).insert(payload);
      } else if (type === 'update' && id) {
        query = supabase.from(table).update(payload).eq('id', id);
      } else if (type === 'delete' && id) {
        query = supabase.from(table).delete().eq('id', id);
      }

      const { data, error: err } = await query;

      if (err) throw err;
      return data;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { execute, loading, error };
}
