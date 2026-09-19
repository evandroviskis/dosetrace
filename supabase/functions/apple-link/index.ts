// apple-link — called (non-blocking) right after a successful Sign in with Apple.
// It exchanges the one-time authorization code for a refresh_token and stores it
// server-side (apple_tokens) so the account's Apple credential can be revoked on
// deletion (Apple 5.1.1(v) / TN3194).
//
// This endpoint is best-effort: sign-in must NEVER depend on it. If Apple secrets
// are unset, or the exchange fails, it returns a benign 200 { linked: false } and
// logs — the app already has a valid Supabase session either way.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAppleConfig, exchangeAuthCode } from '../_shared/apple.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Invalid session' }, 401);

    let authorizationCode: string | undefined;
    try {
      const payload = await req.json();
      authorizationCode = payload?.authorizationCode;
    } catch { /* no body */ }
    if (!authorizationCode) return json({ linked: false, reason: 'no_code' });

    const cfg = getAppleConfig();
    if (!cfg) {
      // Secrets not configured yet — do not fail sign-in; token is backfilled once
      // the secrets land and the user signs in with Apple again.
      console.warn('[apple-link] Apple secrets not configured; skipping token exchange');
      return json({ linked: false, reason: 'not_configured' });
    }

    // Bind the token to the CALLER's own Apple identity. user_id already comes
    // from the verified JWT (never the body), but also refuse to store a token
    // whose Apple `sub` doesn't match the caller's Apple identity — so a stolen
    // one-time code can't be parked under a different account (review finding #1).
    // Non-Apple callers (Google/email) have nothing to link.
    const appleIdentity = (user.identities || []).find((i: { provider?: string }) => i.provider === 'apple');
    if (!appleIdentity) return json({ linked: false, reason: 'not_apple_user' });
    const callerSub = appleIdentity.identity_data?.sub || appleIdentity.id || null;

    const result = await exchangeAuthCode(cfg, authorizationCode);
    if (!result) return json({ linked: false, reason: 'exchange_failed' });

    // Only enforce when both subs are known; a missing sub falls back to the
    // JWT-bound user_id (still safe — the code came from this user's own device).
    if (result.sub && callerSub && result.sub !== callerSub) {
      console.error('[apple-link] Apple sub mismatch; refusing to store token');
      return json({ linked: false, reason: 'sub_mismatch' });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { error: upsertError } = await adminClient
      .from('apple_tokens')
      .upsert(
        { user_id: user.id, apple_sub: result.sub, refresh_token: result.refreshToken, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    if (upsertError) {
      console.error('[apple-link] upsert failed:', upsertError.code, upsertError.message);
      return json({ linked: false, reason: 'store_failed' });
    }

    return json({ linked: true });
  } catch (err) {
    console.error('[apple-link] unexpected error:', (err as Error)?.message);
    // Still benign — never surface as a sign-in failure.
    return json({ linked: false, reason: 'error' });
  }
});
