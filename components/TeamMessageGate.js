// A-163 option A (approved picture a163-messages.html section 3, docs/specs/team-messages.md
// TM-13..TM-16, TM-19, TM-20): an unread message from the DoseTrace team opens as a DoseTrace
// sheet over Today — title, date, text, "Entendi" (marks it read on the server; offline the tap
// is queued with its time). A tap outside or Android back does not close it. Several unread show
// oldest first, "1 de 2", "Próxima" then "Entendi". A tapped notification opens its own message.
// It never opens over one of Today's popups or while a dose is being logged from a reminder tap
// (Today's `gateState`), and Today's popups wait while it is up (`onOpenChange`). The list comes
// from the server on every Today focus, return to the foreground and team push (focus and
// foreground reads are throttled to once a minute in lib/teamMessages; a tap and a push always read).
// Notifications off or offline: no error anywhere; the message shows on the next open that can
// read it. Renders nothing until there is something to show.
// Council 2026-10-22: the sheet is at most 85% of the window high — a long text scrolls and the
// button stays on screen (the sheet is locked, so the button must never be out of reach); a tap on
// a message that no longer exists (withdrawn) opens the list (Settings › Support › Team messages)
// instead of a silent Today, under the same wait rules as the sheet (lib/teamMessages tapOutcome).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useLanguage } from '../i18n/LanguageContext';
import { DTSheet } from '../screens/components/ProtocolParts';
import { teamMessages, teamSheetMayOpen, messageWhen, tapOutcome } from '../lib/teamMessages';
import { useWindowSize } from '../lib/windowSize';

const SETTLE_MS = 900; // after Today's own first checks (a kept site question queues at 300 ms)
const RETRY_MS = 1500; // waiting for a popup / a dose being logged to finish

export default function TeamMessageGate({ tapped, gateState, onOpenChange }) {
  const { t, language, timeFormat } = useLanguage();
  const navigation = useNavigation();
  const { height: winH } = useWindowSize();
  const [shown, setShown] = useState(null); // { queue, i }
  const focusedRef = useRef(false);
  const openRef = useRef(false);
  const tapRef = useRef(null); // { id, settled, fetched }: a notification tap until it is answered
  const timerRef = useRef(null);
  const stateRef = useRef(gateState);
  stateRef.current = gateState;
  const changeRef = useRef(onOpenChange);
  changeRef.current = onOpenChange;

  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

  const tryOpen = useCallback(async () => {
    clearTimer();
    if (!focusedRef.current || openRef.current) return;
    const tap = tapRef.current;
    if (tap && !tap.settled) return; // the tap's own read decides (it calls back here)
    const tm = teamMessages();
    if (tapOutcome(tm.snapshot(), tapRef.current) === 'none') { tapRef.current = null; return; }
    let st = {};
    try { st = (await stateRef.current()) || {}; } catch { st = { todayPopup: true }; }
    if (!focusedRef.current || openRef.current) return;
    if (!teamSheetMayOpen({ ...st, focused: true })) {
      timerRef.current = setTimeout(() => { tryOpen(); }, RETRY_MS);
      return;
    }
    const now = tapRef.current; // the list may have changed while asking
    const want = tapOutcome(tm.snapshot(), now);
    tapRef.current = null;
    if (want === 'none') return;
    if (want === 'list') { navigation.navigate('TeamMessages'); return; }
    const fresh = tm.unread(now && now.id);
    if (!fresh.length) return;
    openRef.current = true;
    if (changeRef.current) changeRef.current(true);
    setShown({ queue: fresh, i: 0 });
  }, [navigation]);

  // A forced read (a tap, a push) answers a pending tap: did the server really answer? A focus or
  // foreground read may be the kept copy, so it never decides that a tapped message is gone.
  const refreshThenTry = useCallback((force = false) => {
    const tap = force ? tapRef.current : null;
    teamMessages().refresh(force ? { force: true } : {}).catch(() => {})
      .then((r) => { if (tap && tapRef.current === tap) { tap.fetched = tap.fetched || !!(r && r.ok && !r.cached); } })
      .catch(() => {})
      .finally(() => { if (tap && tapRef.current === tap) tap.settled = true; tryOpen(); });
  }, [tryOpen]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    const t0 = setTimeout(() => refreshThenTry(), SETTLE_MS);
    return () => { focusedRef.current = false; clearTimeout(t0); clearTimer(); };
  }, [refreshThenTry]));

  // A notification tap (Today's route param): that message first — or, gone, the list.
  useEffect(() => {
    if (!tapped) return;
    const tap = { id: tapped.id || null, settled: false, fetched: false };
    tapRef.current = tap;
    refreshThenTry(true);
  }, [tapped && tapped.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back to the foreground (Today's focus does not fire on resume) and a team push that arrives
  // while the app is open: read the list again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || !focusedRef.current) return;
      refreshThenTry();
    });
    let recv = null;
    try {
      const N = require('expo-notifications');
      recv = N.addNotificationReceivedListener((n) => {
        let data = (n && n.request && n.request.content && n.request.content.data) || {};
        if (typeof data.dataString === 'string') { try { data = JSON.parse(data.dataString); } catch { /* keep */ } }
        if (data && data.type === 'team_message') refreshThenTry(true);
      });
    } catch { /* expo-notifications unavailable */ }
    return () => { sub.remove(); if (recv) recv.remove(); };
  }, [refreshThenTry]);

  useEffect(() => () => clearTimer(), []);

  // "Próxima" / "Entendi": the message on screen is read; the next one replaces it in the same
  // sheet; after the last the sheet closes and Today's waiting popups go on.
  const onButton = () => {
    if (!shown) return;
    const m = shown.queue[shown.i];
    if (m) teamMessages().markRead(m.id).catch(() => {});
    if (shown.i + 1 < shown.queue.length) { setShown({ queue: shown.queue, i: shown.i + 1 }); return; }
    setShown(null);
    openRef.current = false;
    if (changeRef.current) changeRef.current(false);
  };

  let config = null;
  if (shown) {
    const m = shown.queue[shown.i];
    const n = shown.queue.length;
    const when = messageWhen(m.created_at, Date.now(), t, language, timeFormat);
    const counter = n > 1 ? String(t('team_msg_counter')).replace('{n}', String(shown.i + 1)).replace('{total}', String(n)) : null;
    config = {
      icon: 'mail',
      title: t('team_msg_title'),
      meta: counter ? `${when} · ${counter}` : when,
      body: m.body,
      bodyInk: true,
      hint: t('team_msg_kept'),
      locked: true, // the person has to see "Entendi" (picture: a tap outside does not close it)
      buttons: [{ label: shown.i + 1 < n ? t('team_msg_next') : t('team_msg_got_it'), kind: 'primary' }],
    };
  }
  return <DTSheet config={config} onClose={onButton} maxHeight={Math.round(winH * 0.85)} />;
}
