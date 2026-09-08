-- Table des motifs de refus (gérée depuis Configuration > Motifs de refus)
-- Chaque motif a un libellé français (obligatoire) et arabe (optionnel).

CREATE TABLE IF NOT EXISTS rejection_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_fr varchar(255) NOT NULL,
  label_ar varchar(255),
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rejection_reasons_sort_order ON rejection_reasons(sort_order);

-- L'app n'utilise pas Supabase Auth : toutes les requêtes passent par le rôle
-- PostgREST `anon`. On aligne les politiques RLS sur celles des autres tables
-- (evaluation_periods, evaluation_period_intervals) : lecture/écriture publiques,
-- l'autorisation étant gérée côté application.
ALTER TABLE rejection_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on rejection_reasons" ON rejection_reasons;
CREATE POLICY "Allow public read on rejection_reasons" ON rejection_reasons
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on rejection_reasons" ON rejection_reasons;
CREATE POLICY "Allow public insert on rejection_reasons" ON rejection_reasons
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on rejection_reasons" ON rejection_reasons;
CREATE POLICY "Allow public update on rejection_reasons" ON rejection_reasons
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete on rejection_reasons" ON rejection_reasons;
CREATE POLICY "Allow public delete on rejection_reasons" ON rejection_reasons
  FOR DELETE USING (true);

-- Motifs par défaut (uniquement si la table est vide)
INSERT INTO rejection_reasons (label_fr, label_ar, sort_order)
SELECT * FROM (VALUES
  ('Score insuffisant', 'نتيجة غير كافية', 1),
  ('Données manquantes', 'بيانات ناقصة', 2),
  ('Erreur de saisie', 'خطأ في الإدخال', 3),
  ('Critères non atteints', 'المعايير غير مستوفاة', 4)
) AS v(label_fr, label_ar, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM rejection_reasons);

NOTIFY pgrst, 'reload schema';
