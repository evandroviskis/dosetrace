import { supabase } from './supabase';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

// AsyncStorage key for a referral code entered during signup, redeemed after
// the first authenticated session exists (see redeemPendingReferral).
const PENDING_REFERRAL_KEY = 'dosetrace_pending_referral';

/**
 * Generate a short unique referral code (6 chars, uppercase alphanumeric)
 */
async function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/1/I to avoid confusion
  // 32 chars divides 256 evenly, so byte % 32 has no modulo bias
  const bytes = await Crypto.getRandomBytesAsync(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(bytes[i] % chars.length);
  }
  return code;
}

/**
 * Create a referral code for a user (called after signup)
 */
export async function createReferralCode(userId) {
  try {
    // Try up to 3 times in case of code collision
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = await generateCode();
      const { error } = await supabase.from('referral_codes').insert({
        user_id: userId,
        code,
      });
      if (!error) return code;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Get the current user's referral code
 */
export async function getMyReferralCode(userId) {
  try {
    const { data } = await supabase
      .from('referral_codes')
      .select('code')
      .eq('user_id', userId)
      .single();
    return data?.code || null;
  } catch (e) {
    return null;
  }
}

/**
 * Redeem a referral code (called by new user during signup)
 * Returns { success, error }
 */
export async function redeemReferralCode(code, newUserId) {
  try {
    if (!code || code.length !== 6) return { success: false, error: 'invalid_code' };

    // Preferred path: SECURITY DEFINER RPC (supabase_security_fixes.sql).
    // It validates, records the referral, and increments times_used atomically
    // without needing a world-readable referral_codes table.
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('redeem_referral_code', { p_code: code.toUpperCase() });
    if (!rpcError && rpcData) {
      if (rpcData.success) {
        // Credit granting happens inside the SECURITY DEFINER RPC, server-side.
        // The client must NOT write bloodwork_credits (user_metadata is
        // client-writable and would be forgeable).
        return { success: true };
      }
      return { success: false, error: rpcData.error || 'unknown' };
    }
    // Fall through to the legacy path only when the RPC doesn't exist yet
    // (migration not applied). Any other RPC error is definitive.
    const missingFn = rpcError && (rpcError.code === '42883' || rpcError.code === 'PGRST202');
    if (rpcError && !missingFn) return { success: false, error: 'unknown' };

    // Legacy path — requires the permissive SELECT policy that the migration removes
    const { data: referralData } = await supabase
      .from('referral_codes')
      .select('user_id, times_used')
      .eq('code', code.toUpperCase())
      .single();

    if (!referralData) return { success: false, error: 'code_not_found' };
    if (referralData.user_id === newUserId) return { success: false, error: 'self_referral' };

    // Record the referral
    const { error: insertError } = await supabase.from('referrals').insert({
      referrer_id: referralData.user_id,
      referred_id: newUserId,
      code: code.toUpperCase(),
    });

    if (insertError) return { success: false, error: 'already_redeemed' };

    // Increment the code usage count (RPC or direct — may fail silently due to RLS, that's ok)
    // TODO(server): this update is blocked by RLS for non-owners; move the
    // times_used increment into a SECURITY DEFINER RPC or Edge Function.
    await supabase.from('referral_codes')
      .update({ times_used: (referralData.times_used || 0) + 1 })
      .eq('code', code.toUpperCase());

    // Credit granting is intentionally NOT done here. bloodwork_credits must be
    // awarded server-side (SECURITY DEFINER RPC + RLS-protected table), because
    // user_metadata is client-writable and any client could forge credits.
    return { success: true };
  } catch (e) {
    return { success: false, error: 'unknown' };
  }
}

/**
 * Store a referral code entered during signup so it can be redeemed once an
 * authenticated session exists (email confirmation means signUp returns no
 * session, and RLS blocks unauthenticated writes).
 */
export async function storePendingReferral(code) {
  try {
    const trimmed = (code || '').trim().toUpperCase();
    if (trimmed.length !== 6) return;
    await AsyncStorage.setItem(PENDING_REFERRAL_KEY, trimmed);
  } catch (e) {
    // Best effort — losing a referral code must never block signup
  }
}

/**
 * Redeem any pending referral code and ensure the signed-in user has their
 * own referral code. Idempotent and safe to call on every sign-in — it no-ops
 * without a session, and clears the pending key once handled.
 */
export async function redeemPendingReferral() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const userId = session.user.id;

    // Ensure the user has their own referral code to share
    const existing = await getMyReferralCode(userId);
    if (!existing) await createReferralCode(userId);

    // Redeem a referral code stored during signup, if any
    const pending = await AsyncStorage.getItem(PENDING_REFERRAL_KEY);
    if (pending) {
      const result = await redeemReferralCode(pending, userId);
      // Clear on success or on a definitive failure (bad/used code);
      // keep it for retry only on transient/unknown errors.
      if (result.success || result.error !== 'unknown') {
        await AsyncStorage.removeItem(PENDING_REFERRAL_KEY);
      }
    }
  } catch (e) {
    // Best effort — never block sign-in on referral bookkeeping
  }
}

/**
 * Get referral stats for the current user
 */
export async function getReferralStats(userId) {
  try {
    const { data } = await supabase
      .from('referrals')
      .select('id')
      .eq('referrer_id', userId);
    return { referralCount: data?.length || 0 };
  } catch (e) {
    return { referralCount: 0 };
  }
}
