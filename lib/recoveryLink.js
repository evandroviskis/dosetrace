// The password-reset link, opened WITHOUT touching the account the app is signed in to
// (docs/specs/premium-and-auth.md PA-75, PA-76; rules in lib/recoveryFlow.js).
//
// The link carries a PKCE code. It is exchanged in an isolated auth client (its own memory
// storage, seeded with the code verifier this phone saved when it asked for the link), so the
// main client's session is untouched. The link's session is kept as a pending recovery in the
// Keychain for up to an hour: killing the app on Reset password brings the screen back. Only
// when the new password is saved does the main client take the link's session (one step —
// nothing half-written).
import { createClient } from '@supabase/supabase-js';
import { supabase, signOutGoogleNative } from './supabase';
import { SecureStoreAdapter } from './secureStore';
import { markIntentionalSignOut } from './authIntent';
import { buildPending, pendingRecoveryUsable, parseAuthLink } from './recoveryFlow';

const PENDING_KEY = 'dosetrace_pending_recovery';
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function memoryStorage(seed) {
  const m = new Map(Object.entries(seed || {}).filter(([, v]) => v != null));
  return {
    getItem: async (k) => (m.has(k) ? m.get(k) : null),
    setItem: async (k, v) => { m.set(k, v); },
    removeItem: async (k) => { m.delete(k); },
  };
}

function isolatedClient(seed) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: memoryStorage(seed),
      storageKey: supabase.auth.storageKey,
      persistSession: true, // into the memory storage above, never the Keychain
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}

// → { pending } or { error }. The main session is not touched.
export async function openRecoveryLink(url) {
  const link = parseAuthLink(url);
  if (link.error) return { error: { message: link.error } };
  try {
    const verifierKey = `${supabase.auth.storageKey}-code-verifier`;
    let data;
    if (link.code) {
      const verifier = await SecureStoreAdapter.getItem(verifierKey);
      const temp = isolatedClient({ [verifierKey]: verifier });
      const res = await temp.auth.exchangeCodeForSession(link.code);
      if (res.error) return { error: res.error };
      data = res.data;
      SecureStoreAdapter.removeItem(verifierKey).catch(() => {}); // used once, like the main client does
    } else {
      const temp = isolatedClient({});
      const res = await temp.auth.setSession(link.tokens);
      if (res.error) return { error: res.error };
      data = res.data;
    }
    const pending = buildPending({ session: data && data.session, user: data && data.user }, Date.now());
    if (!pending) return { error: { message: 'no session in link' } };
    await SecureStoreAdapter.setItem(PENDING_KEY, JSON.stringify(pending));
    return { pending };
  } catch (e) {
    return { error: { message: (e && e.message) || 'link failed' } };
  }
}

export async function loadPendingRecovery() {
  try {
    const raw = await SecureStoreAdapter.getItem(PENDING_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (pendingRecoveryUsable(p, Date.now())) return p;
    if (raw) SecureStoreAdapter.removeItem(PENDING_KEY).catch(() => {});
    return null;
  } catch {
    return null;
  }
}

export async function discardPendingRecovery() {
  try { await SecureStoreAdapter.removeItem(PENDING_KEY); } catch { /* best effort */ }
}

// Save the new password for the link's account, then — only then — sign the app in with
// that session. → { ok: true } | { error }. On error nothing changed anywhere.
export async function saveRecoveryPassword(pending, password) {
  try {
    const temp = isolatedClient({});
    const set = await temp.auth.setSession({ access_token: pending.access_token, refresh_token: pending.refresh_token });
    if (set.error) return { error: set.error };
    const upd = await temp.auth.updateUser({ password });
    if (upd.error) return { error: upd.error };
    const { data } = await temp.auth.getSession();
    const s = data && data.session;
    if (!s) return { error: { message: 'session missing' } };
    await discardPendingRecovery();
    // The password is changed; now the app takes the link's session (SIGNED_IN, deferred
    // work in App.js). If this last step failed the user simply signs in with the new password.
    const main = await supabase.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
    if (main.error) return { ok: true, signedIn: false };
    return { ok: true, signedIn: true };
  } catch (e) {
    return { error: { message: (e && e.message) || 'save failed' } };
  }
}

// "Continue" on the other-account question: the deliberate sign-out the Settings button
// does (push what is not backed up, mark it intended so the wipe is right, clear Google),
// so the reset can then sign the link's account in.
export async function signOutCurrentForRecovery() {
  try { const { forceSync } = require('./sync'); await forceSync(); } catch { /* best effort */ }
  try { const { removePushToken } = require('./notifications'); await removePushToken(); } catch { /* best effort */ }
  markIntentionalSignOut();
  try { await signOutGoogleNative(); } catch { /* not a Google session */ }
  try { await supabase.auth.signOut({ scope: 'local' }); }
  catch { await supabase.auth.signOut().catch(() => {}); }
}
