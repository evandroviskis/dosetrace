// DV-114 (DL-92): the phone side of lib/pendingGate — an answer to "Confirm your age" or "Finish your
// profile" given offline is kept in AsyncStorage (survives a restart) and written to the account
// (merge-only: supabase.auth.updateUser({ data: patch }) sends only the answer's keys) on the next
// app open, sign-in, connection back or return to the app. Never from inside onAuthStateChange.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { addSyncListener, isOnlineNow } from './sync';
import { createPendingGate, answerGate as answerGateCore, withPendingAnswer } from './pendingGate';

export const pendingGate = createPendingGate({
  storage: AsyncStorage,
  getSessionUserId: async () => {
    const { data } = await supabase.auth.getSession(); // the stored session: no network
    return (data && data.session && data.session.user && data.session.user.id) || null;
  },
  updateUser: (patch) => supabase.auth.updateUser({ data: patch }),
});

export { withPendingAnswer };

// Read at module load, so the gates know the answer before they first decide.
pendingGate.load().catch(() => {});

// A gate screen's save (lib/pendingGate answerGate): when the phone already knows it is offline the
// answer is kept at once (no wait for a request that cannot leave).
export function answerGate({ userId, patch, write }) {
  return answerGateCore({ userId, patch, write, gate: pendingGate, knownOffline: isOnlineNow() === false });
}

export function flushPendingGate() {
  return pendingGate.flush().catch(() => ({ status: 'offline' }));
}

// Started once by App.js: tries again when the connection comes back and when the app returns to the
// front. → stop().
export function startPendingGateFlush() {
  const unsubSync = addSyncListener((e) => {
    if (e && e.type === 'connectivity' && e.online) flushPendingGate();
  });
  const sub = AppState.addEventListener('change', (st) => { if (st === 'active') flushPendingGate(); });
  flushPendingGate();
  return () => { unsubSync(); sub.remove(); };
}

// App.js: { ready, pending } for the signed-in account — ready once the phone's answers were read.
export function usePendingGate(userId) {
  const snap = () => ({ ready: pendingGate.isReady(), pending: pendingGate.get(userId) });
  const [state, setState] = useState(snap);
  useEffect(() => {
    setState(snap());
    return pendingGate.subscribe((e) => { if (e.type === 'change') setState(snap()); });
  }, [userId]);
  return state;
}

// Gate B 1: the deliberate sign-out counts the account's kept answer as one unsent change, and it
// goes from the phone only once that account signed out ("Sign out anyway" included) or was deleted.
export function keptGateCount(userId) { return pendingGate.countFor(userId); }
export function forgetKeptGate(userId) { return pendingGate.clear(userId); }

// App.js: the toast over the app — "saved on this phone" when a gate was answered offline, and the
// honest line when the account later refused the answer (it stays on the phone, tried again).
const TOAST_MS = 4000;
let refusedTold = false; // the refusal is told once per app run (each retry is silent)
export function useGateToast(t) {
  const [key, setKey] = useState(null);
  useEffect(() => {
    let timer = null;
    const off = pendingGate.subscribe((e) => {
      const k = e.type === 'saved' ? 'gate_saved_offline' : e.type === 'refused' && !refusedTold ? 'gate_save_refused' : null;
      if (!k) return;
      if (k === 'gate_save_refused') refusedTold = true;
      setKey(k);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setKey(null), TOAST_MS);
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, []);
  return key ? t(key) : null;
}
