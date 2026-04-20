-- DoseTrace Analytics Events Table
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  properties JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying by event type
CREATE INDEX idx_analytics_event ON analytics_events (event);

-- Index for querying by user
CREATE INDEX idx_analytics_user ON analytics_events (user_id);

-- Index for time-based queries
CREATE INDEX idx_analytics_created ON analytics_events (created_at DESC);

-- Composite index for common queries (event + time range)
CREATE INDEX idx_analytics_event_time ON analytics_events (event, created_at DESC);

-- Enable Row Level Security
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Users can only insert their own events
CREATE POLICY "Users can insert own events"
  ON analytics_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own events (optional, for future in-app analytics)
CREATE POLICY "Users can read own events"
  ON analytics_events FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================
-- EXAMPLE QUERIES FOR BUSINESS INTELLIGENCE
-- ============================================

-- Top 10 most popular compounds
-- SELECT properties->>'compound' as compound, COUNT(*) as total
-- FROM analytics_events
-- WHERE event = 'protocol_created'
-- GROUP BY compound ORDER BY total DESC LIMIT 10;

-- GLP-1 user count
-- SELECT COUNT(DISTINCT user_id) FROM analytics_events
-- WHERE event = 'onboarding_completed'
-- AND properties->'tracking_types' ? 'glp1';

-- Compound adoption trend (weekly)
-- SELECT date_trunc('week', created_at) as week,
--        properties->>'compound' as compound,
--        COUNT(*) as protocols_created
-- FROM analytics_events
-- WHERE event = 'protocol_created'
-- GROUP BY week, compound ORDER BY week DESC;

-- Average protocol duration before deactivation
-- SELECT properties->>'compound' as compound,
--        AVG((properties->>'duration_days')::int) as avg_days
-- FROM analytics_events
-- WHERE event = 'protocol_deactivated'
-- GROUP BY compound ORDER BY avg_days DESC;

-- Adherence rate by compound (taken vs skipped)
-- SELECT properties->>'compound' as compound,
--        COUNT(*) FILTER (WHERE properties->>'outcome' = 'Taken') as taken,
--        COUNT(*) FILTER (WHERE properties->>'outcome' = 'Skipped') as skipped,
--        ROUND(COUNT(*) FILTER (WHERE properties->>'outcome' = 'Taken') * 100.0 / COUNT(*), 1) as adherence_pct
-- FROM analytics_events
-- WHERE event = 'dose_logged'
-- GROUP BY compound ORDER BY adherence_pct DESC;

-- User geographic distribution
-- SELECT properties->>'region' as timezone, COUNT(DISTINCT user_id) as users
-- FROM analytics_events
-- WHERE event = 'onboarding_completed'
-- GROUP BY timezone ORDER BY users DESC;

-- Most searched compounds (demand signal)
-- SELECT properties->>'query' as compound, COUNT(*) as searches
-- FROM analytics_events
-- WHERE event = 'compound_search'
-- GROUP BY compound ORDER BY searches DESC LIMIT 20;

-- Compound stacking (what people combine)
-- WITH user_compounds AS (
--   SELECT user_id, array_agg(DISTINCT properties->>'compound') as stack
--   FROM analytics_events
--   WHERE event = 'protocol_created'
--   GROUP BY user_id HAVING COUNT(*) > 1
-- )
-- SELECT stack, COUNT(*) as users FROM user_compounds
-- GROUP BY stack ORDER BY users DESC LIMIT 20;
