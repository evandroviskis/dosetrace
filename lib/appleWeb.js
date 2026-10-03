// "Continue with Apple" on Android: Supabase's web OAuth flow with PKCE (docs/specs/
// premium-and-auth.md PA-110…PA-115; rules in lib/appleWebCheck.js). iOS never comes here —
// it keeps the native Sign in with Apple sheet (lib/supabase.js signInWithApple).
import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import { appleWebReady, parseAppleReturn } from './appleWebCheck';

const BUNDLE_ID = 'io.outcom.dosetrace'; // the iOS client id (native flow only)
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export function appleRedirectUrl() {
  return AuthSession.makeRedirectUri({ scheme: 'dosetrace', path: 'auth-callback' });
}

// Is the server side configured for the web flow? Asked once per run, never throws; any doubt
// (offline, an error page, a native-only setup) hides the button.
let probe = null;
export function appleWebAvailable() {
  if (Platform.OS !== 'android') return Promise.resolve(false);
  if (!probe) {
    probe = (async () => {
      try {
        const headers = { apikey: supabaseAnonKey };
        const settings = await (await fetch(`${supabaseUrl}/auth/v1/settings`, { headers })).json();
        const externalApple = !!(settings && settings.external && settings.external.apple);
        if (!externalApple) return false;
        const redirectTo = appleRedirectUrl();
        // fetch follows Supabase's redirect; the final URL is Apple's page when configured.
        const res = await fetch(`${supabaseUrl}/auth/v1/authorize?provider=apple&redirect_to=${encodeURIComponent(redirectTo)}`, { headers });
        return appleWebReady({ externalApple, finalUrl: res.url, bundleId: BUNDLE_ID, redirectTo });
      } catch {
        probe = null; // offline: ask again next time the screen opens
        return false;
      }
    })();
  }
  return probe;
}

// → { data } | { canceled: true } | { error } — the same shape as the native signInWithApple.
export async function signInWithAppleWeb() {
  try {
    const redirectTo = appleRedirectUrl();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo, skipBrowserRedirect: true, scopes: 'name email' },
    });
    if (error) return { error };
    if (!data || !data.url) return { error: { message: 'no authorize url' } };
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return { canceled: true };
    const ret = parseAppleReturn(result.url);
    if (ret.error) {
      if (/cancel|access_denied|user_cancelled/i.test(ret.error)) return { canceled: true };
      return { error: { message: ret.error } };
    }
    const ex = await supabase.auth.exchangeCodeForSession(ret.code);
    if (ex.error) return { error: ex.error };
    return { data: ex.data };
  } catch (e) {
    return { error: { message: (e && e.message) || 'Sign in with Apple failed.' } };
  }
}
