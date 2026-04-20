import { supabase } from './supabase';

/**
 * Generate a short unique referral code (6 chars, uppercase alphanumeric)
 */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/1/I to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
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
      const code = generateCode();
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

    // Find the referrer
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
    await supabase.from('referral_codes')
      .update({ times_used: (referralData.times_used || 0) + 1 })
      .eq('code', code.toUpperCase());

    // Grant credit to the new user via their own metadata
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const currentCredits = currentUser?.user_metadata?.bloodwork_credits || 0;
    await supabase.auth.updateUser({
      data: { bloodwork_credits: currentCredits + 1, referred_by: code.toUpperCase() },
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: 'unknown' };
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
