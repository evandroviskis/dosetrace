-- DoseTrace — Food logs table (AI nutrition logger, build 52)
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query).
-- Mirrors the local SQLite `food_logs` table (lib/schema.js) so the sync engine
-- can push/pull rows. Until this runs, the app still works fully offline and the
-- sync engine simply skips the food_logs table (per-table try/catch), so there
-- is no crash — food logs just won't sync yet.
--
-- One row per logging action ("submit"), grouped by entry_date. parsed_items is
-- JSONB in the cloud (JSON TEXT locally — the sync mapper converts). The AI only
-- ever writes structured data here; it never stores prose. Offline-first: the row
-- is created immediately with parse_status 'pending'; the AI parse fills the
-- numbers and flips parse_status to 'done' as an async enrichment.

-- 1. Table
CREATE TABLE IF NOT EXISTS food_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date TEXT,          -- 'YYYY-MM-DD' (parity with biomarkers.report_date)
  raw_text TEXT,            -- what the user typed
  parsed_items JSONB,       -- [{food, qty, unit, kcal, protein_g, carb_g, fat_g}]
  kcal NUMERIC,             -- entry totals
  protein_g NUMERIC,
  carb_g NUMERIC,
  fat_g NUMERIC,            -- stored, not surfaced in v1 UI
  source TEXT DEFAULT 'ai', -- 'ai' | 'manual'
  parse_status TEXT DEFAULT 'pending', -- 'pending' | 'done' | 'none'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_logs_user ON food_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_food_logs_updated ON food_logs (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_food_logs_date ON food_logs (user_id, entry_date);

-- 2. Keep updated_at fresh on every UPDATE so the pull watermark advances.
--    (set_updated_at() already exists from the other tables; CREATE OR REPLACE is safe.)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS food_logs_set_updated_at ON food_logs;
CREATE TRIGGER food_logs_set_updated_at
  BEFORE UPDATE ON food_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. Row Level Security — owner-only. NOTE: unlike the older tables, the UPDATE
--    policy carries WITH CHECK so a user cannot reassign a row's user_id to
--    another account on update (the hole flagged in the vaccines table review).
ALTER TABLE food_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own food_logs"
  ON food_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own food_logs"
  ON food_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own food_logs"
  ON food_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own food_logs"
  ON food_logs FOR DELETE
  USING (auth.uid() = user_id);
