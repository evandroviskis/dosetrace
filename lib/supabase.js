import { createClient } from '@supabase/supabase-js';
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

export async function sendPasswordReset(email) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: passwordResetRedirectUrl(),
  });
}

/**
 * Finish a reset opened from the emailed link. The client is PKCE, so the URL
 * carries a `code` that must be exchanged for a session before
 * updateUser({ password }) is permitted. Returns { ok } or { error }.
 */
export async function completePasswordResetFromUrl(url) {
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