// A-119 one active device per account: lib/deviceFlow (the rules, tested in the two-device harness)
// wired to this app — Supabase RPCs, AsyncStorage keys no sign-out wipe removes (the verdict, the
// screen-4 question, the takeover notice), the Keychain secret for the background check, the local
// database, the sync engine and the reminders. Never called inside onAuthStateChange: App.js calls
// it from its deferred sign-in work, the cold start, the foreground and the sync pass.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { supabase, getCachedUser, readStoredUser, setMetadataGuard, signOutGoogleNative } from './supabase';
import { getDeviceId, deviceInfo, appVersion } from './deviceId';
import { createDeviceFlow } from './deviceFlow';
import { summarizeUnsent } from './unsentSummary';
import { readChangeSeq } from './changeSeq';
import { getDB, getLocalDataUserId, clearLocalDatabase } from './database';
import { isExplicitSignIn } from './explicitSignIn';
import { finishReplacedCore } from './signOutCore';
import { markIntentionalSignOut, consumeIntentionalSignOut } from './authIntent';
import { runRegisteredWipe, WIPE_PENDING_KEY } from './signedOut';
import { setStrictRemoval } from './secureStore';

const SECRET_KEY = 'dosetrace_device_secret';
const KEYCHAIN = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
const RPC_TIMEOUT_MS = 10000;

const listeners = new Set();
export function subscribeDevice(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// An RPC with the project's anon key only — no session, no refresh (the Android background run;
// the "was the account deleted?" check after a session ended on its own). Its own timeout.
async function rpcAnon(name, args) {
  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${name}`;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => { try { if (ac) ac.abort(); } catch { /* ignore */ } }, RPC_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {}),
      ...(ac ? { signal: ac.signal } : {}),
    });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok) return { data: null, error: (body && typeof body === 'object' ? body : { status: res.status }) };
    return { data: body, error: null };
  } catch (e) {
    return { data: null, error: { message: (e && e.message) || 'network' } };
  } finally {
    clearTimeout(timer);
  }
}

let flow = null;
export function deviceFlow() {
  if (flow) return flow;
  flow = createDeviceFlow({
    // Gate B round 2: the request itself is aborted after RPC_TIMEOUT_MS (deviceFlow also stops
    // waiting then, so one stalled call never holds the checks queued behind it).
    rpc: (name, args) => {
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => { try { if (ac) ac.abort(); } catch { /* ignore */ } }, RPC_TIMEOUT_MS);
      const q = supabase.rpc(name, args);
      return Promise.resolve(ac && q.abortSignal ? q.abortSignal(ac.signal) : q).finally(() => clearTimeout(timer));
    },
    rpcTimeoutMs: RPC_TIMEOUT_MS,
    rpcAnon,
    deviceId: getDeviceId,
    deviceInfo,
    appVersion: appVersion(),
    store: AsyncStorage,
    secret: {
      get: () => SecureStore.getItemAsync(SECRET_KEY, KEYCHAIN),
      set: (v) => SecureStore.setItemAsync(SECRET_KEY, v, KEYCHAIN),
      remove: () => SecureStore.deleteItemAsync(SECRET_KEY, KEYCHAIN),
    },
    // The same rows the deliberate sign-out counts (lib/recoveryFlow pendingForSignOut).
    // opts.keep (screen 4, round 3): only what "Use here" would discard.
    summarize: async (uid, opts) => summarizeUnsent(getDB(), [getLocalDataUserId(), uid], opts || {}),
    changeSeq: () => readChangeSeq(getDB()), // Gate B round 2: the keep point of a takeover
    rebuild: (uid, o) => require('./sync').rebuildFromCloudNow(uid, o),
    // Gate B M1: an owed rebuild runs in a sync pass (one at a time); a check outside asks for one.
    requestPass: () => { try { require('./sync').requestSync(); } catch { /* the next pass */ } },
    stopSync: () => { try { require('./sync').stopSyncEngine(); } catch { /* not running */ } },
    cancelReminders: async () => {
      const N = require('./notifications');
      await N.cancelAllNotifications().catch(() => {});
      await N.dismissAllNotifications().catch(() => {});
    },
    onChange: () => { for (const fn of listeners) { try { fn(); } catch { /* UI only */ } } },
  });
  return flow;
}

// OD-7: the check before any profile / user_metadata write (lib/supabase updateUser).
setMetadataGuard(async () => {
  let user = null;
  try { user = await getCachedUser(); } catch { user = null; }
  if (!user) return true;
  return deviceFlow().metadataAllowed(user.id, { explicit: isExplicitSignIn() });
});

// The sync pass's first call, the foreground and the cold start (before the import).
export async function deviceGate(ctx) {
  let user = null;
  try { user = await getCachedUser(); } catch { user = null; }
  if (!user) return { go: false, reason: 'no_user' };
  return deviceFlow().gate(user.id, ctx);
}

export function readDeviceState() { return deviceFlow().load(); }

// The sign-out sheet (screens 3 / 3b / 5a / 5b): what is not backed up and the last full backup.
export async function signOutFacts() {
  let uid = null;
  try { const { data } = await supabase.auth.getSession(); uid = data?.session?.user?.id || null; } catch { uid = null; }
  let summary = null;
  try { summary = summarizeUnsent(getDB(), [getLocalDataUserId(), uid]); } catch { summary = null; }
  let lastBackup = null;
  try { lastBackup = uid ? await deviceFlow().lastFullBackup(uid) : null; } catch { lastBackup = null; }
  return { summary, lastBackup };
}

export function releaseThisDevice() { return deviceFlow().release(); }

// Screen 2 / the account deleted elsewhere: "Continue" wipes this phone and signs it out exactly like
// an intentional sign-out (lib/signOutCore finishReplacedCore); with no session left, the wipe alone.
// The verdict is removed only after that worked, so a kill or a failure shows the screen again.
export async function continueAfterVerdict() {
  const st = await deviceFlow().load();
  const v = st.verdict;
  if (!v) return { ok: true };
  try { require('./sync').stopSyncEngine(); } catch { /* not running */ }
  let session = null;
  try { session = (await supabase.auth.getSession()).data?.session || null; } catch { session = null; }
  const wipeNow = () => { try { runRegisteredWipe(); } catch { clearLocalDatabase(); } };
  if (!session) {
    wipeNow();
    await deviceFlow().clearOnSignOut();
    await deviceFlow().finishVerdict();
    return { ok: true };
  }
  const r = await finishReplacedCore({
    auth: supabase.auth,
    intent: { mark: markIntentionalSignOut, consume: consumeIntentionalSignOut },
    userId: v.userId,
    signOutGoogle: () => signOutGoogleNative({ revoke: v.kind === 'gone' }),
    setWipePending: (val) => AsyncStorage.setItem(WIPE_PENDING_KEY, String(val)),
    wipeNow,
    strictStorage: { begin: () => setStrictRemoval(true), end: () => setStrictRemoval(false) },
  });
  if (r && r.ok) {
    await deviceFlow().clearOnSignOut();
    await deviceFlow().finishVerdict();
  }
  return r;
}

// OD-16: the Android background run (no session refresh): replaced → verdict stored, reminders
// cancelled, the next open shows screen 2.
export async function backgroundDeviceCheck() {
  let user = null;
  try { user = await readStoredUser(); } catch { user = null; }
  if (!user || !user.id) return 'unknown';
  return deviceFlow().backgroundCheck(user.id);
}

// OD-10 / DL-85: a session that ended on its own (not a sign-out) while the phone holds an account's
// data: the server says whether that account still exists.
export async function checkAccountGoneFor(ownerId) {
  try { return await deviceFlow().checkAccountGone(ownerId); } catch { return false; }
}
