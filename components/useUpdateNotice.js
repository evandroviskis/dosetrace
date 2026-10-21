// A-127 in-app update notice: when the required screen, the invitation and Android's "downloaded"
// bar show (App.js ThemedRoot). The rules are lib/updateRules + lib/updateFlow; this hook only picks
// the moments:
//   required  — read from the cache at once (every open, offline too), again after each server read and
//               when the A-119 device state changes (DT003 path). Turning it ON waits for a calm screen
//               (lib/updateRules screenAllows) so nothing being typed is pulled away; OFF is at once.
//   invite    — at app open (the first time Main is up, and each return to the foreground), after the
//               server read, on the tab screens only, with no sheet open, never with the required
//               screen; a tap on the version push asks for it (forced) and waits for those moments.
//   ready     — Android Play finished the flexible download.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { updateFlow, takeForcedInvite, onForcedInvite } from '../lib/updateRuntime';
import { subscribeDevice } from '../lib/deviceRuntime';
import { screenAllows } from '../lib/updateRules';
import { openSheetCount } from '../lib/sheetPresence';

const FIRST_SCREEN_MS = 1500; // the first screen is drawn and settled
const RETRY_MS = 1000;
const FORCED_TRIES = 30; // a push tap that launched the app waits for Main (boot, sign-in work)
const OPEN_TRIES = 3;

export function useUpdateNotice({ session, onMain, language, navigationRef, blocked }) {
  const [required, setRequired] = useState(null);
  const [invite, setInvite] = useState(null);
  const [ready, setReady] = useState(false);
  const uid = (session && session.user && session.user.id) || null;
  const live = useRef({});
  live.current = { uid, meta: (session && session.user && session.user.user_metadata) || {}, onMain, language, blocked, required };
  const reading = useRef(null);
  const timer = useRef(null);

  const rootState = () => {
    const nav = navigationRef && navigationRef.current;
    try { return nav && (!nav.isReady || nav.isReady()) && nav.getRootState ? nav.getRootState() : null; } catch { return null; }
  };

  const evalRequired = useCallback(async () => {
    let st = null;
    try { st = await updateFlow().state({ language: live.current.language, signedIn: !!live.current.uid }); } catch { return; }
    const next = st && st.required;
    if (!next) { setRequired(null); return; }
    if (live.current.required || screenAllows({ rootState: rootState(), sheets: openSheetCount(), kind: 'required' })) setRequired(next);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    const p = updateFlow().refresh().catch(() => false).then(() => evalRequired());
    reading.current = p;
    return p;
  }, [evalRequired]);

  const attempt = useCallback((forced, tries) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      timer.current = null;
      const c = live.current;
      const calm = c.uid && c.onMain && !c.blocked && !c.required
        && screenAllows({ rootState: rootState(), sheets: openSheetCount(), kind: 'invite' });
      if (!calm) { if (tries > 1) attempt(forced, tries - 1); return; }
      try { await reading.current; } catch { /* the cache decides */ }
      const f = updateFlow();
      f.flushPending(c.uid).catch(() => {});
      let inv = null;
      try { inv = await f.inviteNow({ meta: c.meta, userId: c.uid, language: c.language, forced }); } catch { inv = null; }
      if (inv && live.current.uid === c.uid) setInvite({ ...inv, userId: c.uid });
    }, tries === (forced ? FORCED_TRIES : OPEN_TRIES) ? FIRST_SCREEN_MS : RETRY_MS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const f = updateFlow();
    const unsub = f.subscribe((s) => { setReady(!!(s && s.ready)); });
    const unsubDev = subscribeDevice(() => { evalRequired(); });
    const unsubForced = onForcedInvite(() => { if (takeForcedInvite()) attempt(true, FORCED_TRIES); });
    evalRequired();
    refresh();
    if (takeForcedInvite()) attempt(true, FORCED_TRIES);
    const app = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      refresh();
      attempt(false, OPEN_TRIES);
    });
    return () => { unsub(); unsubDev(); unsubForced(); app.remove(); if (timer.current) clearTimeout(timer.current); };
  }, [evalRequired, refresh, attempt]);

  // The first time Main is up in this run (a cold start, or right after signing in).
  const mainSeen = useRef(false);
  useEffect(() => {
    if (!onMain || !uid || mainSeen.current) return;
    mainSeen.current = true;
    attempt(false, OPEN_TRIES);
  }, [onMain, uid, attempt]);
  useEffect(() => { if (!uid) mainSeen.current = false; }, [uid]);
  // The language changed: the reason line follows.
  useEffect(() => { evalRequired(); }, [language, uid, evalRequired]);

  const close = (inv, optIn) => {
    setInvite(null);
    if (inv && inv.askOptIn && optIn != null) updateFlow().answerOptIn(inv.userId, optIn === true).catch(() => {});
  };
  return {
    required,
    invite,
    ready: ready && !!uid && !!onMain,
    onLater: (optIn) => close(invite, optIn),
    onUpdate: (optIn) => { const inv = invite; close(inv, optIn); updateFlow().update('invite').catch(() => {}); },
    onRequiredUpdate: () => { updateFlow().update('required').catch(() => {}); },
    onRestart: () => { updateFlow().restart().catch(() => {}); },
  };
}
