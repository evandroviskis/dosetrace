// A-163 option A (approved picture a163-messages.html section 3, docs/specs/team-messages.md
// TM-13..TM-16, TM-19, TM-20): an unread message from the DoseTrace team opens as a DoseTrace
// sheet over Today — title, date, text, "Entendi" (marks it read on the server; offline the tap
// is queued with its time). A tap outside or Android back does not close it. Several unread show
// oldest first, "1 de 2", "Próxima" then "Entendi". A tapped notification opens its own message.
// It never opens over one of Today's popups or while a dose is being logged from a reminder tap
// (Today's `gateState`), and Today's popups wait while it is up (`onOpenChange`). The list comes
// from the server on every Today focus, return to the foreground (once a minute) and team push.
// Notifications off or offline: no error anywhere; the message shows on the next open that can
// read it. Renders nothing until there is something to show.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useLanguage } from '../i18n/LanguageContext';
import { DTSheet } from '../screens/components/ProtocolParts';
import { teamMessages, teamSheetMayOpen, messageWhen } from '../lib/teamMessages';

const SETTLE_MS = 900; // after Today's own first checks (a kept site question queues at 300 ms)
const RETRY_MS = 1500; // waiting for a popup / a dose being logged to finish
const FOREGROUND_GAP_MS = 60 * 1000;

export default function TeamMessageGate({ tapped, gateState, onOpenChange }) {
  const { t, language, timeFormat } = useLanguage();
  const [shown, setShown] = useState(null); // { queue, i }
  const focusedRef = useRef(false);
  const openRef = useRef(false);
  const tappedRef = useRef(null);
  const timerRef = useRef(null);
  const lastFgRef = useRef(0);
  const stateRef = useRef(gateState);
  stateRef.current = gateState;
  const changeRef = useRef(onOpenChange);
  changeRef.current = onOpenChange;

  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

  const tryOpen = useCallback(async () => {
    clearTimer();
    if (!focusedRef.current || openRef.current) return;
    const tm = teamMessages();
    const queue = tm.unread(tappedRef.current);
    if (!queue.length) { tappedRef.current = null; return; }
    let st = {};
    try { st = (await stateRef.current()) || {}; } catch { st = { todayPopup: true }; }
    if (!focusedRef.current || openRef.current) return;
    if (!teamSheetMayOpen({ ...st, focused: true })) {
      timerRef.current = setTimeout(() => { tryOpen(); }, RETRY_MS);
      return;
    }
    const fresh = tm.unread(tappedRef.current); // the list may have changed while asking
    if (!fresh.length) return;
    tappedRef.current = null;
    openRef.current = true;
    if (changeRef.current) changeRef.current(true);
    setShown({ queue: fresh, i: 0 });
  }, []);

  const refreshThenTry = useCallback(() => {
    teamMessages().refresh().catch(() => {}).finally(() => { tryOpen(); });
  }, [tryOpen]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    const t0 = setTimeout(refreshThenTry, SETTLE_MS);
    return () => { focusedRef.current = false; clearTimeout(t0); clearTimer(); };
  }, [refreshThenTry]));

  // A notification tap (Today's route param): that message first.
  useEffect(() => {
    if (!tapped) return;
    tappedRef.current = tapped.id || null;
    refreshThenTry();
  }, [tapped && tapped.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back to the foreground (Today's focus does not fire on resume) and a team push that arrives
  // while the app is open: read the list again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || !focusedRef.current) return;
      const now = Date.now();
      if (now - lastFgRef.current < FOREGROUND_GAP_MS && now >= lastFgRef.current) return;
      lastFgRef.current = now;
      refreshThenTry();
    });
    let recv = null;
    try {
      const N = require('expo-notifications');
      recv = N.addNotificationReceivedListener((n) => {
        let data = (n && n.request && n.request.content && n.request.content.data) || {};
        if (typeof data.dataString === 'string') { try { data = JSON.parse(data.dataString); } catch { /* keep */ } }
        if (data && data.type === 'team_message') refreshThenTry();
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
  return <DTSheet config={config} onClose={onButton} />;
}
