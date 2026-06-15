-- Fix RLS for evaluation_periods (and evaluation_period_intervals)
--
-- Contexte : l'application n'utilise PAS Supabase Auth. L'autorisation est gérée
-- côté client (sessions maison en localStorage), donc toutes les requêtes utilisent
-- le rôle PostgREST `anon`. Les anciennes politiques limitaient l'écriture au rôle
-- `authenticated`, ce qui faisait échouer toute création de période avec :
--   code 42501 : new row violates row-level security policy for table "evaluation_periods"
--
-- Cette migration remplace ces politiques par des politiques permissives, cohérentes
-- avec la table evaluation_period_intervals.

-- ============================ evaluation_periods ============================
ALTER TABLE evaluation_periods ENABLE ROW LEVEL SECURITY;

-- Supprime les politiques restrictives (rôle authenticated) si elles existent
DROP POLICY IF EXISTS "Allow authenticated users to manage periods" ON evaluation_periods;
DROP POLICY IF EXISTS "Allow authenticated users to create periods" ON evaluation_periods;
DROP POLICY IF EXISTS "Allow authenticated users to update periods" ON evaluation_periods;
DROP POLICY IF EXISTS "Allow authenticated users to delete periods" ON evaluation_periods;

-- Lecture publique
DROP POLICY IF EXISTS "Allow public read" ON evaluation_periods;
DROP POLICY IF EXISTS "Allow public read on evaluation_periods" ON evaluation_periods;
CREATE POLICY "Allow public read on evaluation_periods" ON evaluation_periods
  FOR SELECT USING (true);

-- Écriture publique (autorisation gérée côté application)
DROP POLICY IF EXISTS "Allow public insert on evaluation_periods" ON evaluation_periods;
CREATE POLICY "Allow public insert on evaluation_periods" ON evaluation_periods
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on evaluation_periods" ON evaluation_periods;
CREATE POLICY "Allow public update on evaluation_periods" ON evaluation_periods
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete on evaluation_periods" ON evaluation_periods;
CREATE POLICY "Allow public delete on evaluation_periods" ON evaluation_periods
  FOR DELETE USING (true);

-- ======================= evaluation_period_intervals =======================
ALTER TABLE evaluation_period_intervals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to create intervals" ON evaluation_period_intervals;
DROP POLICY IF EXISTS "Allow authenticated users to update intervals" ON evaluation_period_intervals;
DROP POLICY IF EXISTS "Allow authenticated users to delete intervals" ON evaluation_period_intervals;
DROP POLICY IF EXISTS "Allow auth write" ON evaluation_period_intervals;

DROP POLICY IF EXISTS "Allow public read on evaluation_period_intervals" ON evaluation_period_intervals;
DROP POLICY IF EXISTS "Allow public read for evaluation_period_intervals" ON evaluation_period_intervals;
CREATE POLICY "Allow public read on evaluation_period_intervals" ON evaluation_period_intervals
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on evaluation_period_intervals" ON evaluation_period_intervals;
DROP POLICY IF EXISTS "Allow authenticated write for evaluation_period_intervals" ON evaluation_period_intervals;
CREATE POLICY "Allow public insert on evaluation_period_intervals" ON evaluation_period_intervals
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on evaluation_period_intervals" ON evaluation_period_intervals;
DROP POLICY IF EXISTS "Allow authenticated update for evaluation_period_intervals" ON evaluation_period_intervals;
CREATE POLICY "Allow public update on evaluation_period_intervals" ON evaluation_period_intervals
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete on evaluation_period_intervals" ON evaluation_period_intervals;
DROP POLICY IF EXISTS "Allow authenticated delete for evaluation_period_intervals" ON evaluation_period_intervals;
CREATE POLICY "Allow public delete on evaluation_period_intervals" ON evaluation_period_intervals
  FOR DELETE USING (true);
