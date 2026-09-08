-- Ajoute le nom arabe des critères d'évaluation.
-- Le nom existant (colonne "name") est considéré comme le français (langue de référence).
-- name_ar est optionnel : s'il est vide, l'application affiche le nom français.

ALTER TABLE evaluation_criteria
  ADD COLUMN IF NOT EXISTS name_ar varchar(255);

-- Recharge le cache du schéma PostgREST pour exposer la nouvelle colonne.
NOTIFY pgrst, 'reload schema';
