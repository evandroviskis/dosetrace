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
import { supabase } from './supabase';
import { SecureStoreAdapter } from './secureStore';
import { signOutIntended } from './accountActions';
import { buildPending, pendingRecoveryUsable, parseAuthLink, isTerminalRecoveryError } from './recoveryFlow';

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
    await writePending(pending);
    return { pending };
  } catch (e) {
    return { error: { message: (e && e.message) || 'link failed' } };
  }
}

async function writePending(p) {
  try { await SecureStoreAdapter.setItem(PENDING_KEY, JSON.stringify(p)); } catch { /* best effort */ }
}
// Continue on the other-account question keeps the link pending (the sheet's close drops it).
export async function savePendingRecovery(p) { if (p) await writePending(p); }

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
// that session. → { ok: true, signedIn } | { error, terminal }. On error nothing changed
// anywhere; a terminal error (the link's session is gone) drops the pending recovery.
export async function saveRecoveryPassword(pending, password) {
  const fail = async (error) => {
    const terminal = isTerminalRecoveryError(error);
    if (terminal) await discardPendingRecovery();
    return { error, terminal };
  };
  try {
    const temp = isolatedClient({});
    const set = await temp.auth.setSession({ access_token: pending.access_token, refresh_token: pending.refresh_token });
    if (set.error) return fail(set.error);
    // setSession may have refreshed (rotating the refresh token): keep the live tokens, so a
    // retry after a refused password still works (Gate B re-review).
    const cur = (await temp.auth.getSession()).data?.session;
    if (cur && cur.refresh_token && cur.refresh_token !== pending.refresh_token) {
      Object.assign(pending, { access_token: cur.access_token, refresh_token: cur.refresh_token });
      await writePending(pending);
    }
    const upd = await temp.auth.updateUser({ password });
    if (upd.error) return fail(upd.error);
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
    return fail({ message: (e && e.message) || 'save failed' });
  }
}

// "Continue" on the other-account question: the deliberate sign-out the Settings button
// does (push what is not backed up, mark it intended so the wipe is right, clear Google),
// so the reset can then sign the link's account in. If anything is still not in the cloud
// after the push (offline), nothing is signed out: { blocked: true } (never lose data).
export async function signOutCurrentForRecovery() {
  return signOutIntended();
}
