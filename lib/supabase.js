import { createClient } from '@supabase/supabase-js';
import { Platform, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE returns an authorization code we exchange for a full session
    // (access + refresh token), so auto-refresh actually works after ~1h.
    flowType: 'pkce',
  },
});

/**
 * Get the current user from the locally cached session.
 * Unlike supabase.auth.getUser(), this does NOT make a network call,
 * so it works offline. Returns null if not signed in.
 */
export async function getCachedUser() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user || null;
}

/**
 * Where the password-reset email should send the user BACK TO. Without an
 * explicit redirectTo, Supabase falls back to the project's Site URL
 * (dosetrace.io) — a marketing page with no reset form, so the user dead-ends.
 * This deep-links into the app instead.
 *
 * NOTE: this exact URL must be allow-listed in the Supabase dashboard under
 * Authentication → URL Configuration → Redirect URLs, or Supabase ignores it
 * and silently falls back to the Site URL again.
 */
export function passwordResetRedirectUrl() {
  return AuthSession.makeRedirectUri({ scheme: 'dosetrace', path: 'reset-password' });
}

/**
 * Where the signup confirmation email should send the user back to. Same
 * problem as the reset link: without this, Supabase falls back to the Site URL
 * and the user lands on dosetrace.io with no "confirmed" feedback.
 * Must also be allow-listed in Supabase → Redirect URLs.
 */
export function emailConfirmRedirectUrl() {
  return AuthSession.makeRedirectUri({ scheme: 'dosetrace', path: 'confirm-email' });
}

export async function sendPasswordReset(email) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: passwordResetRedirectUrl(),
  });
}

/**
 * Finish an auth action opened from an emailed link (password reset OR signup
 * confirmation). The client is PKCE, so the URL carries a `code` that must be
 * exchanged for a session. Returns { ok } or { error }.
 */
export async function exchangeAuthCodeFromUrl(url) {
  try {
    const parsed = new URL(url);
    const qs = new URLSearchParams((parsed.search || '').replace(/^\?/, ''));
    const hs = new URLSearchParams((parsed.hash || '').replace(/^#/, ''));
    const pick = (k) => qs.get(k) || hs.get(k);

    // Supabase surfaces a dead link (expired / already used) this way. Report it
    // rather than looking like nothing happened.
    const errDesc = pick('error_description') || pick('error');
    if (errDesc) return { error: { message: String(errDesc).replace(/\+/g, ' ') } };

    // Shape 1 — PKCE: an authorization code we exchange for a session.
    const code = pick('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return { error };
      return { ok: true };
    }

    // Shape 2 — some Supabase email links hand back tokens directly in the
    // fragment instead of a code. Accept that too, otherwise the app opens and
    // silently does nothing (indistinguishable from the original bug).
    const access_token = pick('access_token');
    const refresh_token = pick('refresh_token');
    if (access_token && refresh_token) {
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) return { error };
      return { ok: true };
    }

    return { error: { message: 'This link is missing its sign-in code.' } };
  } catch (e) {
    return { error: { message: e?.message || 'This link could not be read.' } };
  }
}

/**
 * Sign in with Google using Supabase OAuth + expo-auth-session.
 * Requires Google OAuth to be enabled in Supabase Dashboard
 * (Authentication > Providers > Google) with valid client ID/secret.
 */
export async function signInWithGoogle() {
  const redirectUrl = AuthSession.makeRedirectUri({ scheme: 'dosetrace' });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
    },
  });

  if (error) return { error };

  // The redirect can come back two different ways:
  //  - iOS (and some Android): through the WebBrowser auth-session result.
  //  - Android with a custom scheme: the OS delivers dosetrace://?code=... to
  //    the app as a deep link, which foregrounds the app and leaves the auth
  //    session "dismissed" — so the code never returns through the browser
  //    result and a successful sign-in looks like a cancellation. Listen for
  //    both and take whichever arrives first.
  let linkSub;
  const deepLink = new Promise((resolve) => {
    linkSub = Linking.addEventListener('url', ({ url: u }) => {
      if (u && u.startsWith('dosetrace://') && u.includes('code=')) resolve(u);
    });
  });
  let browserErr = null;
  let browserType = 'none';
  const browser = WebBrowser.openAuthSessionAsync(data.url, redirectUrl)
    .then((r) => { browserType = r?.type || 'none'; return r.type === 'success' ? r.url : null; })
    .catch((e) => { browserErr = e; return null; });

  let resultUrl = await Promise.race([browser, deepLink]);
  if (!resultUrl) {
    // Browser dismissed with no URL — wait briefly for a deep link in flight.
    resultUrl = await Promise.race([
      deepLink,
      new Promise((r) => setTimeout(() => r(null), 2000)),
    ]);
  }
  if (linkSub) linkSub.remove();
  try { WebBrowser.dismissBrowser(); } catch { /* noop */ }

  if (!resultUrl) {
    if (browserErr) {
      return { error: { message: `Browser failed to open: ${browserErr.message || browserErr}` } };
    }
    // Diagnostic during testing: the redirect never returned a code. Surface the
    // redirect URI the app expects + how the browser closed, so we can see WHY
    // (e.g. the redirect went to the Site URL instead of dosetrace://).
    return { error: { message: `Google sign-in didn't return a code (browser: ${browserType}, redirect: ${redirectUrl}).` } };
  }

  // PKCE returns an authorization code in the redirect; exchange it for a
  // complete session (access + refresh token) so the session can auto-refresh.
  const url = new URL(resultUrl);
  const code = url.searchParams.get('code') ||
    new URLSearchParams(url.hash?.substring(1) || '').get('code');

  if (!code) {
    return { error: { message: 'No authorization code received from Google.' } };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
  return { data: sessionData, error: sessionError };
}

/**
 * Sign in with Apple (iOS only).
 *
 * Apple Guideline 4.8 requires this wherever a third-party login (our Google
 * sign-in) is offered. Unlike Google this is a NATIVE flow — no browser, no
 * redirect URL — so it needs nothing in Supabase's Redirect URLs list. It does
 * require the Apple provider to be configured in Supabase (Authentication →
 * Providers → Apple) with the Service ID / Team ID / Key ID / private key.
 *
 * Apple only returns name/email on the FIRST authorization for an Apple ID, so
 * we stash the full name in user metadata when we get it.
 */
export async function signInWithApple() {
  if (Platform.OS !== 'ios') {
    return { error: { message: 'Sign in with Apple is only available on iOS.' } };
  }
  try {
    const AppleAuthentication = require('expo-apple-authentication');

    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      return { error: { message: 'Sign in with Apple is not available on this device.' } };
    }

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { error: { message: 'Apple did not return an identity token.' } };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) return { error };

    // Apple sends the name only once, on first authorization — persist it now
    // or it is gone forever. Never overwrite an existing name with null.
    const given = credential.fullName?.givenName;
    const family = credential.fullName?.familyName;
    const full = [given, family].filter(Boolean).join(' ').trim();
    if (full) {
      await supabase.auth.updateUser({ data: { display_name: full } }).catch(() => {});
    }

    return { data };
  } catch (e) {
    // The user tapping Cancel surfaces as ERR_REQUEST_CANCELED — not an error
    // worth showing them.
    if (e?.code === 'ERR_REQUEST_CANCELED' || e?.code === 'ERR_CANCELED') {
      return { canceled: true };
    }
    return { error: { message: e?.message || 'Sign in with Apple failed.' } };
  }
}