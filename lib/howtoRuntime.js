// How-to videos in the FAQ (docs/specs/howto-videos.md): lib/howtoVideos (the rules, tested) wired to this
// app — the manifest in the public `howto` bucket fetched with a 3 s timeout and its last good copy in
// AsyncStorage (configuration, not the person's data; the videos themselves are never saved on the phone),
// the connection (NetInfo), the app version and the profile's sex at birth (HV-8).
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect } from '@react-navigation/native';
import { appVersion } from './deviceId';
import { getCachedUser } from './supabase';
import { profileMeta } from './pendingGateStore';
import { createManifestStore, MANIFEST_URL, HOWTO_TIMEOUT_MS } from './howtoVideos';

// The player module is native (expo-video). A binary without it never shows the row (fails closed).
let videoReady = null;
export function videoModuleReady() {
  if (videoReady !== null) return videoReady;
  try {
    const ev = require('expo-video');
    videoReady = !!(ev && ev.useVideoPlayer && ev.VideoView);
  } catch {
    videoReady = false;
  }
  return videoReady;
}

async function fetchManifest() {
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => { try { if (ac) ac.abort(); } catch { /* ignore */ } }, HOWTO_TIMEOUT_MS);
  try {
    const res = await fetch(MANIFEST_URL, ac ? { signal: ac.signal } : undefined);
    return { status: res.status, text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

const manifestStore = createManifestStore({ store: AsyncStorage, fetchManifest });

const netOk = (st) => !!st && st.isConnected !== false && st.isInternetReachable !== false;

// At the tap (HV-5): is there a connection right now? Unknown → no (never an empty player).
export async function videoOnlineNow() {
  try { return netOk(await NetInfo.fetch()); } catch { return false; }
}

// The manifest for the FAQ screen: { manifest, online, markOffline, version }.
// online: null until the first answer (no row while it is unknown), then the manifest was reachable and
// the phone is connected. A connection that comes back reads the manifest again.
export function useHowtoManifest() {
  const [state, setState] = useState({ manifest: null, reachable: false, net: true, fetched: false });
  const reach = useRef(false);
  const fetched = useRef(false);
  useEffect(() => {
    let alive = true;
    if (!videoModuleReady()) return () => { alive = false; };
    manifestStore.cached().then((m) => { if (alive && !fetched.current) setState((s) => ({ ...s, manifest: m })); });
    const run = () => manifestStore.refresh().then((r) => {
      if (!alive) return;
      reach.current = r.reachable;
      fetched.current = true;
      setState((s) => ({ ...s, manifest: r.manifest, reachable: r.reachable, fetched: true }));
    });
    run();
    const unsub = NetInfo.addEventListener((st) => {
      const net = netOk(st);
      if (net && fetched.current && !reach.current) run();
      if (alive) setState((s) => (s.net === net ? s : { ...s, net }));
    });
    return () => { alive = false; if (unsub) unsub(); };
  }, []);
  const markOffline = useCallback(() => { reach.current = false; setState((s) => ({ ...s, reachable: false })); }, []);
  return {
    manifest: state.manifest,
    online: state.fetched ? state.reachable && state.net : null,
    markOffline,
    version: appVersion(),
  };
}

// HV-8: the profile's sex at birth (user_metadata gender, with an answer still kept on this phone laid
// over it), read at every focus so a change in the profile switches the variant at the next open.
export function useProfileSex() {
  const [sex, setSex] = useState(null);
  useFocusEffect(useCallback(() => {
    let live = true;
    getCachedUser()
      .then((u) => {
        const g = (profileMeta(u) || (u && u.user_metadata) || {}).gender;
        if (live) setSex(g === 'male' || g === 'female' ? g : null);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []));
  return sex;
}
