-- DoseTrace Referral System Tables
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. Referral Codes table (one per user)
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  code TEXT NOT NULL UNIQUE,
  times_used INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast code lookups
CREATE INDEX idx_referral_codes_code ON referral_codes (code);
CREATE INDEX idx_referral_codes_user ON referral_codes (user_id);

-- 2. Referrals table (tracks who referred whom)
CREATE TABLE IF NOT EXISTS referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Each user can only be referred once (UNIQUE on referred_id above)
CREATE INDEX idx_referrals_referrer ON referrals (referrer_id);
CREATE INDEX idx_referrals_code ON referrals (code);

-- Enable Row Level Security
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for referral_codes
CREATE POLICY "Users can read own referral code"
  ON referral_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own referral code"
  ON referral_codes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can look up a code for redemption"
  ON referral_codes FOR SELECT
  USING (true);

CREATE POLICY "Users can update own code stats"
  ON referral_codes FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for referrals
CREATE POLICY "Users can see referrals they made"
  ON referrals FOR SELECT
  USING (auth.uid() = referrer_id);

CREATE POLICY "Users can see their own referral record"
  ON referrals FOR SELECT
  USING (auth.uid() = referred_id);

CREATE POLICY "Users can insert referral records"
  ON referrals FOR INSERT
  WITH CHECK (auth.uid() = referred_id);
