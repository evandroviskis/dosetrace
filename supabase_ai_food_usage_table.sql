-- DoseTrace — AI food-parse usage counter (build 52)
-- Run in Supabase SQL Editor. Separate from ai_scan_usage on purpose: the scan
-- cap is 3/MONTH across lab/vaccine/vial; the food logger is a DAILY feature and
-- must NOT share that counter (mixing them would starve the scan features and
-- vice-versa — flagged in the dt-council review). This table bounds AI spend on
-- food parses with a per-day cap, written by the edge function via service role.

CREATE TABLE IF NOT EXISTS ai_food_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date TEXT,               -- 'YYYY-MM-DD' the parse was for (client-supplied)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_food_usage_user_day ON ai_food_usage (user_id, created_at);

-- RLS: the edge function uses the service-role key (bypasses RLS) to count+insert,
-- exactly like ai_scan_usage. Enable RLS with no permissive policies so the anon/
-- authenticated client can neither read nor tamper with the counter.
ALTER TABLE ai_food_usage ENABLE ROW LEVEL SECURITY;
