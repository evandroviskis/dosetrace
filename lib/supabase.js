import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
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
    const code = parsed.searchParams.get('code')
      || new URLSearchParams((parsed.hash || '').replace(/^#/, '')).get('code');
    if (!code) return { error: { message: 'This reset link is missing its code.' } };
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { error };
    return { ok: true };
  } catch (e) {
    return { error: { message: e?.message || 'This reset link could not be read.' } };
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

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

  if (result.type !== 'success') {
    return { error: { message: 'Google sign-in was cancelled.' } };
  }

  // PKCE returns an authorization code in the redirect; exchange it for a
  // complete session (access + refresh token) so the session can auto-refresh.
  const url = new URL(result.url);
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