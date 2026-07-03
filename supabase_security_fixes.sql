-- DoseTrace Security Fixes
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query).
-- This migration is NOT applied automatically — the project owner must run it.
--
-- Fixes:
--   1. referral_codes SELECT policy `USING (true)` made the whole table
--      (user_id UUIDs + codes) world-readable to any authenticated or anon
--      client. Replaced with an owner-only SELECT policy.
--   2. Code redemption previously required that permissive SELECT policy
--      (the client had to look up someone else's code) and could never
--      increment times_used (the UPDATE policy only allows the code OWNER,
--      but redemption is performed by the REFERRED user). Both are fixed by
--      moving redemption into a SECURITY DEFINER function that runs with
--      table-owner privileges, so no permissive policies are needed at all.
--
-- After running this, lib/referrals.js should be updated to call:
--   supabase.rpc('redeem_referral_code', { p_code: code })
-- instead of doing SELECT + INSERT + UPDATE from the client.

-- ============================================================
-- 1. Lock down referral_codes SELECT
-- ============================================================

-- Drop the world-readable policy (this is the vulnerability).
DROP POLICY IF EXISTS "Anyone can look up a code for redemption" ON referral_codes;

-- Recreate the owner-only SELECT policy idempotently. Users can only read
-- their OWN referral code row; nobody can enumerate other users' codes or
-- harvest user_id UUIDs.
DROP POLICY IF EXISTS "Users can read own referral code" ON referral_codes;
CREATE POLICY "Users can read own referral code"
  ON referral_codes FOR SELECT
  USING (auth.uid() = user_id);

-- The owner-only UPDATE policy from the original migration is intentionally
-- left in place; times_used increments now happen inside the SECURITY DEFINER
-- function below, which bypasses RLS.

-- ============================================================
-- 2. Server-side redemption function
-- ============================================================

-- SECURITY DEFINER: runs as the function owner (table owner), so it can look
-- up any code and increment times_used regardless of RLS. The caller is
-- identified via auth.uid() — the code being redeemed is the ONLY thing the
-- client supplies, so a client can no longer forge referrer_id/referred_id.
CREATE OR REPLACE FUNCTION public.redeem_referral_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
-- Pin the search path so a malicious schema cannot shadow the tables.
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_referrer uuid;
BEGIN
  -- Must be called by an authenticated user (the person being referred).
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF length(v_code) <> 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  -- Look up the code (no permissive SELECT policy needed — definer rights).
  -- FOR UPDATE locks the row so the times_used increment below is atomic
  -- with respect to concurrent redemptions of the same code.
  SELECT user_id INTO v_referrer
  FROM referral_codes
  WHERE code = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'code_not_found');
  END IF;

  -- Prevent self-referral.
  IF v_referrer = v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'self_referral');
  END IF;

  -- Record the redemption. The UNIQUE constraint on referrals.referred_id
  -- guarantees each user can only ever be referred once.
  BEGIN
    INSERT INTO referrals (referrer_id, referred_id, code)
    VALUES (v_referrer, v_caller, v_code);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_redeemed');
  END;

  -- Increment usage atomically (row already locked above). This fixes the
  -- audited bug where times_used never incremented because the client-side
  -- UPDATE was blocked by RLS for non-owners.
  UPDATE referral_codes
  SET times_used = coalesce(times_used, 0) + 1
  WHERE code = v_code;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Only signed-in users may redeem; block anon and general public execution.
REVOKE ALL ON FUNCTION public.redeem_referral_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_referral_code(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.redeem_referral_code(text) TO authenticated;
