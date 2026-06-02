// Exemples d'utilisation des hooks Supabase

// === EXEMPLE 1: Connexion avec Supabase ===

import { useSupabaseAuth } from '@/hooks/useSupabase';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

export function LoginExample() {
  const { signIn } = useSupabaseAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (email: string, password: string) => {
    const { data, error } = await signIn(email, password);
    
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Succès", description: "Connecté!" });
      navigate("/");
    }
  };

  return null;
}

// === EXEMPLE 2: Charger les données avec useSupabaseQuery ===

import { useSupabaseQuery } from '@/hooks/useSupabase';

export function EmployeesList() {
  const { data: employees, loading, error } = useSupabaseQuery('users', {
    select: 'id, name, position, branch, email'
  });

  if (loading) return <div>Chargement...</div>;
  if (error) return <div>Erreur: {error.message}</div>;

  return (
    <div>
      {employees.map((emp: any) => (
        <div key={emp.id}>
          <h3>{emp.name}</h3>
          <p>{emp.position} - {emp.branch}</p>
        </div>
      ))}
    </div>
  );
}

// === EXEMPLE 3: Créer une évaluation (INSERT) ===

import { useSupabaseMutation } from '@/hooks/useSupabase';

export function CreateEvaluation() {
  const { execute: insertEvaluation, loading } = useSupabaseMutation('evaluations', 'insert');

  const handleSubmit = async () => {
    try {
      await insertEvaluation({
        employee_id: 'uuid-employee',
        evaluated_by: 'uuid-manager',
        score: 85,
        attendance_compliance: true,
        target_achievement: 90,
        quality_of_work: 88,
        teamwork_collaboration: 9,
        comments: 'Excellent travail'
      });

      console.log('Évaluation créée!');
    } catch (err) {
      console.error('Erreur:', err);
    }
  };

  return (
    <button onClick={handleSubmit} disabled={loading}>
      {loading ? 'Création...' : 'Créer évaluation'}
    </button>
  );
}

// === EXEMPLE 4: Mettre à jour un utilisateur (UPDATE) ===

export function UpdateUser() {
  const { execute: updateUser, loading } = useSupabaseMutation('users', 'update');

  const handleUpdate = async (userId: string) => {
    try {
      await updateUser({
        name: 'Nouveau Nom',
        position: 'Manager'
      }, userId);

      console.log('Utilisateur mis à jour!');
    } catch (err) {
      console.error('Erreur:', err);
    }
  };

  return (
    <button onClick={() => handleUpdate('uuid-user')} disabled={loading}>
      {loading ? 'Mise à jour...' : 'Mettre à jour'}
    </button>
  );
}

// === EXEMPLE 5: Supprimer une formation (DELETE) ===

export function DeleteTraining() {
  const { execute: deleteTraining, loading } = useSupabaseMutation('training_requests', 'delete');

  const handleDelete = async (trainingId: string) => {
    try {
      await deleteTraining(null, trainingId);
      console.log('Formation supprimée!');
    } catch (err) {
      console.error('Erreur:', err);
    }
  };

  return (
    <button onClick={() => handleDelete('uuid-training')} disabled={loading}>
      {loading ? 'Suppression...' : 'Supprimer'}
    </button>
  );
}

// === EXEMPLE 6: Charger avec filtre ===

export function EvaluationsByEmployee() {
  const employeeId = 'uuid-employee';
  
  const { data: evaluations, loading } = useSupabaseQuery('evaluations', {
    select: 'id, score, comments, created_at',
    filter: { employee_id: employeeId }
  });

  if (loading) return <div>Chargement...</div>;

  return (
    <div>
      <h2>Évaluations</h2>
      {evaluations.map((eval: any) => (
        <div key={eval.id}>
          <p>Score: {eval.score}</p>
          <p>{eval.comments}</p>
        </div>
      ))}
    </div>
  );
}

// === EXEMPLE 7: Authentification - Vérifier si l'utilisateur est connecté ===

export function ProtectedContent() {
  const { user, loading } = useSupabaseAuth();

  if (loading) return <div>Chargement...</div>;
  if (!user) return <div>Vous n'êtes pas connecté</div>;

  return (
    <div>
      <h2>Bienvenue, {user.email}!</h2>
      <p>Vous êtes authentifié</p>
    </div>
  );
}

// === EXEMPLE 8: Real-time subscription (Écouter les changements) ===

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function RealtimeEmployees() {
  const [employees, setEmployees] = useState<any[]>([]);

  useEffect(() => {
    // Subscribe aux changements en temps réel
    const subscription = supabase
      .from('users')
      .on('*', payload => {
        console.log('Changement détecté:', payload);
        setEmployees(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => {
      supabase.removeSubscription(subscription);
    };
  }, []);

  return (
    <div>
      {employees.map((emp: any) => (
        <div key={emp.id}>{emp.name}</div>
      ))}
    </div>
  );
}

// === EXEMPLE 9: Upload de fichier (Avatar) ===

export function AvatarUpload() {
  const handleUpload = async (file: File, userId: string) => {
    try {
      // Upload le fichier
      const { data, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(`${userId}/${file.name}`, file);

      if (uploadError) throw uploadError;

      // Récupère l'URL publique
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(data.path);

      // Met à jour le profil
      await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

      console.log('Avatar uploadé!');
    } catch (err) {
      console.error('Erreur:', err);
    }
  };

  return null;
}
