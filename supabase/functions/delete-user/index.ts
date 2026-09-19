import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAppleConfig, revokeRefreshToken } from '../_shared/apple.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify the calling user's JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a client with the user's JWT to identify who's calling
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error('[delete-user] invalid session:', userError?.message);
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // ── Sign in with Apple: revoke the credential (Apple 5.1.1(v) / TN3194) ──
    // BEST-EFFORT AND NEVER FAIL-CLOSED. GDPR Art. 17 says a deletion the user
    // asked for must complete; Apple asks us to *attempt* revoke, not to trap the
    // user forever when a token is already invalid or a config secret is missing
    // (journey-review F1/F3). So: try revoke, retry ONCE only on a transient 5xx/
    // network error, then proceed with deletion regardless and report what happened.
    //   appleRevoked         — token existed and Apple confirmed revoke (or it was
    //                          already gone; nothing left to revoke).
    //   appleManualRevokeNeeded — an Apple credential likely exists but we had no
    //                          stored token to revoke (pre-feature account, or a
    //                          transient failure) — the app tells the user they can
    //                          remove access in iOS Settings → Apple ID.
    let appleRevoked = false;
    let appleManualRevokeNeeded = false;
    try {
      // apple_tokens is service-role only and may not exist yet (first deploy).
      const { data: tokenRow, error: tokenErr } = await adminClient
        .from('apple_tokens')
        .select('refresh_token')
        .eq('user_id', user.id)
        .maybeSingle();

      const isAppleUser = (user.app_metadata?.providers ?? [user.app_metadata?.provider]).includes('apple');

      if (tokenErr && tokenErr.code !== '42P01' && tokenErr.code !== 'PGRST205') {
        // Unexpected read error — don't block deletion; flag manual revoke.
        console.error('[delete-user] apple_tokens read error:', tokenErr.code, tokenErr.message);
        if (isAppleUser) appleManualRevokeNeeded = true;
      } else if (tokenRow?.refresh_token) {
        const cfg = getAppleConfig();
        if (!cfg) {
          console.warn('[delete-user] Apple secrets not configured; skipping revoke, deleting anyway');
          appleManualRevokeNeeded = true;
        } else {
          let outcome = await revokeRefreshToken(cfg, tokenRow.refresh_token);
          if (outcome === 'transient_error') {
            outcome = await revokeRefreshToken(cfg, tokenRow.refresh_token); // retry once
          }
          if (outcome === 'revoked' || outcome === 'already_gone') {
            appleRevoked = true;
          } else {
            // transient_error after retry, or config_missing — delete anyway.
            appleManualRevokeNeeded = true;
          }
        }
      } else if (isAppleUser) {
        // Apple account but no stored token (signed in before this shipped, and
        // hasn't signed in since to backfill). Can't revoke what we never stored.
        appleManualRevokeNeeded = true;
      }
    } catch (e) {
      console.error('[delete-user] apple revoke step threw (continuing):', (e as Error)?.message);
      appleManualRevokeNeeded = true;
    }

    // A table that was never created surfaces as 42P01 (Postgres "relation does
    // not exist") OR PGRST205 (PostgREST "not found in schema cache", e.g.
    // notification_preferences, which actually lives in user_metadata). Both mean
    // there is nothing to delete there — tolerate them so cleanup never blocks
    // the account deletion.
    const tableMissing = (e) => e && (e.code === '42P01' || e.code === 'PGRST205');

    // Delete all of the user's health/app data BEFORE deleting the auth user,
    // as promised by the in-app privacy policy ("deletion of your account and
    // all associated data"). Ordered children-first to respect foreign keys:
    // dose_logs and vials reference protocols; everything references auth.users.
    // NOTE: this list MUST stay a superset of lib/syncCore.js TABLES — a synced
    // table left off here leaks the user's data past deletion (journey-review F4).
    // __tests__/delete-user-covers-sync-tables enforces that.
    const userDataTables = [
      'dose_logs',
      'vials',
      'protocols',
      'biomarkers',
      'vaccines',
      'food_logs',
      'reality_checks',
      'calc_snapshots',
      'calc_targets',
      'ai_food_usage',
      'ai_scan_usage',
      'reminders',
      'notification_preferences',
      'analytics_events',
      'referral_codes',
      'apple_tokens',
    ];

    for (const table of userDataTables) {
      const { error: rowError } = await adminClient.from(table).delete().eq('user_id', user.id);
      if (rowError && !tableMissing(rowError)) {
        console.error(`[delete-user] failed on table "${table}":`, rowError.code, rowError.message);
        return new Response(
          JSON.stringify({ error: `Failed to delete ${table}: ${rowError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // referrals uses referrer_id/referred_id instead of user_id
    const { error: referralsError } = await adminClient
      .from('referrals')
      .delete()
      .or(`referrer_id.eq.${user.id},referred_id.eq.${user.id}`);
    if (referralsError && !tableMissing(referralsError)) {
      console.error('[delete-user] failed on referrals:', referralsError.code, referralsError.message);
      return new Response(
        JSON.stringify({ error: `Failed to delete referrals: ${referralsError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Finally, delete the auth user itself
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('[delete-user] admin.deleteUser failed:', deleteError.message);
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, appleRevoked, appleManualRevokeNeeded }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[delete-user] unexpected error:', err?.message, err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
