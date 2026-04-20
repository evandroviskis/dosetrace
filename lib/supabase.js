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

  // Extract tokens from the redirect URL
  const url = result.url;
  const params = new URL(url);
  const fragment = params.hash?.substring(1);
  const searchParams = new URLSearchParams(fragment || params.search?.substring(1));
  const accessToken = searchParams.get('access_token');
  const refreshToken = searchParams.get('refresh_token');

  if (accessToken) {
    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return { data: sessionData, error: sessionError };
  }

  return { error: { message: 'No access token received from Google.' } };
}