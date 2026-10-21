// A-127 in-app update notice: lib/updateFlow (the rules, tested with fakes) wired to this app —
// the app_releases row through Supabase (readable signed in or out), AsyncStorage keys no sign-out
// wipe removes, the store links, the A-119 minimum this phone was told (lib/deviceFlow KEYS.update),
// the account write for the opt-in answer and the push registration. Never called inside
// onAuthStateChange.
import { Platform, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { appVersion } from './deviceId';
import { createUpdateFlow } from './updateFlow';
import { createPlayUpdate } from './playUpdate';

const FETCH_TIMEOUT_MS = 10000;

// UN-6: a tap on the version push asks for the invitation (App routeTap → components/useUpdateNotice).
let forcedInvite = false;
const forcedSubs = new Set();
export function requestForcedInvite() {
  forcedInvite = true;
  for (const fn of forcedSubs) { try { fn(); } catch { /* UI only */ } }
}
export function takeForcedInvite() { const f = forcedInvite; forcedInvite = false; return f; }
export function onForcedInvite(fn) { forcedSubs.add(fn); return () => forcedSubs.delete(fn); }

let flow = null;
export function updateFlow() {
  if (flow) return flow;
  flow = createUpdateFlow({
    store: AsyncStorage,
    platform: Platform.OS,
    appVersion: appVersion(),
    fetchRelease: async (platform) => {
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => { try { if (ac) ac.abort(); } catch { /* ignore */ } }, FETCH_TIMEOUT_MS);
      try {
        let q = supabase.from('app_releases').select('platform, latest_version, min_version, notes, reason').eq('platform', platform);
        if (ac && q.abortSignal) q = q.abortSignal(ac.signal);
        return await q.maybeSingle();
      } finally {
        clearTimeout(timer);
      }
    },
    // A-119 DL-105: the server's refusal floor this phone was told (device_status min_version / DT003).
    deviceMin: async () => {
      const st = await require('./deviceRuntime').readDeviceState();
      return (st && st.update && st.update.min) || null;
    },
    openUrl: (u) => Linking.openURL(u),
    writeMeta: (data) => supabase.auth.updateUser({ data }),
    registerPush: () => require('./notifications').registerPushToken(),
    // No Play in-app update module in this build (open question in the A-127 report): Android opens
    // the Play Store page. A linked module is passed here — nothing else changes.
    play: createPlayUpdate(null),
  });
  return flow;
}
