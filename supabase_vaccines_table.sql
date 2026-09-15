-- DoseTrace — Vaccines table (personal vaccine log)
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query).
-- Mirrors the local SQLite `vaccines` table (lib/schema.js) so the sync engine
-- can push/pull rows. Until this runs, the app still works fully offline and
-- the sync engine simply skips the vaccines table (its push/pull is wrapped in
-- per-table try/catch), so there is no crash — vaccines just won't sync yet.

-- 1. Table
CREATE TABLE IF NOT EXISTS vaccines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  date_given TEXT,   -- 'YYYY-MM-DD' (kept as text for parity with biomarkers.report_date)
  next_due TEXT,     -- 'YYYY-MM-DD' or null
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vaccines_user ON vaccines (user_id);
CREATE INDEX IF NOT EXISTS idx_vaccines_updated ON vaccines (user_id, updated_at);

-- 2. Keep updated_at fresh on every UPDATE so the pull watermark advances.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vaccines_set_updated_at ON vaccines;
CREATE TRIGGER vaccines_set_updated_at
  BEFORE UPDATE ON vaccines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. Row Level Security — owner-only, same shape as the other user tables.
ALTER TABLE vaccines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own vaccines"
  ON vaccines FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vaccines"
  ON vaccines FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vaccines"
  ON vaccines FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own vaccines"
  ON vaccines FOR DELETE
  USING (auth.uid() = user_id);
