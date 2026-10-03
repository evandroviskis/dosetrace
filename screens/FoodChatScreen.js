/**
 * DoseTrace — the food log chat (FL-31..40). ONE full-screen modal route
 * ('FoodChat'), opened from Today's hero, Journey's hero and the 8 PM reminder
 * (FL-37). Swipe down to close; it also closes itself after ~30 s idle with the
 * keyboard down or when the app goes to the background — never while text is in
 * the box, a send / follow-up is in flight, the fix screen / consent / an alert is
 * open, or a screen reader is on (FL-32/36, lib/foodThread shouldAutoClose).
 *
 * Every bubble is rebuilt from stored food_logs rows (FL-35, lib/foodThread
 * buildThread). App bubbles are ALWAYS app-written; the only model text on screen
 * is short food/unit names and the parser's short answer options (FL-16).
 * Regulatory: never advice — an advice-shaped message gets the fixed deflection.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, FlatList,
  KeyboardAvoidingView, Keyboard, AppState, AccessibilityInfo, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withDelay, useReducedMotion } from 'react-native-reanimated';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { MONO } from '../lib/fonts';
import { requestSync, isOnlineNow } from '../lib/sync';
import { getFoodLogsSince, insertFoodLog, deleteFoodLog, getFoodLogById } from '../lib/database';
import { parseFood, parseFollowup } from '../lib/nutritionClient';
import {
  closedDays, CATEGORIES, catchUpOutcome, isDoneText, isNoText, mustAskWhichEarlier, itemLabel, needsEstimateFlag, echoParts, recentForParse, isMarker,
} from '../lib/nutrition';
import { buildThread, threadQuestion, openFollowup, shouldAutoClose, dayWord, sendFailureNotice, resumableQuestion } from '../lib/foodThread';
import { saveParsed, updateItem, applyAnswer, catchUpFood, rememberTypedHere, inFlight, loadFoodAccess, ensureFreeStart, markAteNothing } from '../lib/foodLogActions';
import FoodGraceNote from './components/FoodGraceNote';
import { requestAIConsent } from '../lib/aiConsent';
import { localISO, localDaysAgoISO } from '../lib/localDate';
import { syncFoodLogReminder, closeFoodDay } from '../lib/notifications';
import FeatureIcon from '../components/FeatureIcon';
import FoodEntryEditor from './components/FoodEntryEditor';
import { useUnfoldToPage } from '../components/BookPanes';
import { getDraft, setDraft, clearDraft } from '../lib/draftStore';
const EDITOR_OPEN_KEY = 'foodChat:editorOpen';
import { FoodDemo } from './components/NutritionLogger';

import { formatDate } from '../lib/localeFormat';
import { pluralKey } from '../lib/plural';
// Per-device conveniences (not user data): today's asked questions (+ the one on
// screen) and the unsent draft (FL-36, per user).
const ASKED_KEY = 'dosetrace_food_asked';
const draftKey = (uid) => `dosetrace_food_draft:${uid}`;
const THREAD_DAYS = 7; // typed days shown in the thread
// The follow-up answer typed and not sent is kept per question (one item of one entry) in
// lib/draftStore while the app is open (S-26 BK-14, A-77), so leaving the chat, another
// Journey item, a fold or an unfold never throws it away.
function fuDraftKey(open) {
  return open ? `foodChat:answer:${open.rowId}:${open.index}` : null;
}

// S-26 book layout: `embedded` = shown on the Journey tab's right page (BK-5). No "Done"
// (nothing to close), no top safe-area edge, no auto-close (a tab page is not a sheet), and
// the 8 PM / "Log it" params come from the `params` prop instead of the route. As a pushed
// screen it moves onto the right page when the window unfolds, saving the draft first (BK-10).
export default function FoodChatScreen({ embedded = false, params: paramsProp = null }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const routeParams = embedded ? (paramsProp || null) : ((route && route.params) || null);
  const s = makeStyles(colors);

  const [userId, setUserId] = useState(null);
  const userIdRef = useRef(null);
  const [access, setAccess] = useState(null);   // Premium / free days / grace week / locked (FL-41)
  const [rcStart, setRcStart] = useState(null);
  const [rows, setRows] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendingId, setSendingId] = useState(null); // the row being read right now
  const [fuText, setFuText] = useState('');
  const [fuBusy, setFuBusy] = useState(false);
  const [notice, setNotice] = useState(null);     // transient app bubble: deflect | fix | earlier | quota | offline | updated
  const [question, setQuestion] = useState(null); // { id, tense } — the one open question about today
  const [evening, setEvening] = useState(null);   // day the 8 PM question is about
  const [logDay, setLogDay] = useState(null);     // "Log it" for an earlier day: entries land on that day (FL-40)
  const [editRow, setEditRowState] = useState(null);
  // BK-14: remember which entry editor is open, so it reopens after a fold/unfold remount.
  const setEditRow = (r) => { if (r) setDraft(EDITOR_OPEN_KEY, r.id != null ? r.id : r.local_id); else clearDraft(EDITOR_OPEN_KEY); setEditRowState(r); };
  useEffect(() => {
    const openId = getDraft(EDITOR_OPEN_KEY);
    if (openId != null) { try { const r = getFoodLogById(openId); if (r) setEditRowState(r); else clearDraft(EDITOR_OPEN_KEY); } catch { /* keep the draft */ } }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [now, setNow] = useState(Date.now());
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [showDemo, setShowDemo] = useState(false); // "See how it works" sheet
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef(null);
  const askedRef = useRef({ day: null, ids: [], current: null });
  const lastTouch = useRef(Date.now());
  const draftTimer = useRef(null);

  const today = localISO(new Date(now));
  const touch = () => { lastTouch.current = Date.now(); };

  // ── Load / refresh ─────────────────────────────────────────────
  function refresh(uid) {
    const id = uid || userId;
    if (!id) return [];
    const r = getFoodLogsSince(id, localDaysAgoISO(366)) || [];
    setRows(r);
    syncFoodLogReminder().catch(() => {});
    return r;
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const user = await getCachedUser();
    const uid = user?.id || null;
    try { const a = await loadFoodAccess(uid); setAccess(a.access); setRcStart(a.rcStart); } catch { setAccess(null); }
    setUserId(uid);
    userIdRef.current = uid;
    try {
      const raw = await AsyncStorage.getItem(ASKED_KEY);
      const v = raw ? JSON.parse(raw) : null;
      askedRef.current = v && v.day === localISO() && Array.isArray(v.ids) ? { current: null, ...v } : { day: localISO(), ids: [], current: null };
    } catch { askedRef.current = { day: localISO(), ids: [], current: null }; }
    if (!uid) { setLoaded(true); return; }
    // The draft / put-back text survives closing the chat (FL-36).
    try { const d = await AsyncStorage.getItem(draftKey(uid)); if (d) setText((cur) => cur || d); } catch { /* ignore */ }
    const r = refresh(uid);
    // Resume the question that was on screen (FL-32) only while it still applies: like the
    // prototype, a day question follows a log — never on open when nothing logged today
    // calls for it (founder 2026-10-02).
    const cur = askedRef.current.day === localISO() ? askedRef.current.current : null;
    const keep = resumableQuestion(cur, r, localISO(), askedRef.current.ids, new Date());
    if (keep) setQuestion(keep);
    setLoaded(true);
    // Offline rows and offline follow-up answers catch up now (FL-19/28).
    const { changed, updatedItems } = await catchUpFood(uid, language);
    if (changed) refresh(uid);
    const e = echoFor(updatedItems);
    if (e) setNotice({ kind: 'updated', text: e });
  }

  // Retry what waited for the network (offline rows, offline follow-up answers).
  const retryTimer = useRef(null);
  const wasOffline = useRef(false);
  function scheduleCatchUp(ms) {
    clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(async () => {
      const uid = userIdRef.current;
      if (!uid) return;
      const { changed, updatedItems } = await catchUpFood(uid, language);
      if (changed) refresh(uid);
      const e = echoFor(updatedItems);
      if (e) setNotice({ kind: 'updated', text: e });
    }, ms);
  }
  useEffect(() => {
    const unsub = NetInfo.addEventListener((st) => {
      const on = !!(st.isConnected && st.isInternetReachable !== false);
      if (on && wasOffline.current) scheduleCatchUp(800); // back online → read what was saved
      wasOffline.current = !on;
    });
    return () => { unsub && unsub(); clearTimeout(retryTimer.current); };
  }, [language]);

  // Route params: the 8 PM question (FL-18/40) or "Log it".
  const eveningParam = routeParams?.eveningDay;
  const eveningNonce = routeParams?.nonce;
  const logItNonce = routeParams?.logIt;
  useEffect(() => {
    if (eveningNonce == null && eveningParam == null) return;
    setEvening(/^\d{4}-\d{2}-\d{2}$/.test(String(eveningParam || '')) ? eveningParam : localISO());
  }, [eveningParam, eveningNonce]);
  useEffect(() => {
    if (!logItNonce) return;
    const id = setTimeout(() => inputRef.current?.focus?.(), 450);
    return () => clearTimeout(id);
  }, [logItNonce]);

  // ── Draft (FL-36) ──────────────────────────────────────────────
  function saveDraftNow(v) {
    if (!userId) return;
    const val = String(v ?? '');
    (val.trim() ? AsyncStorage.setItem(draftKey(userId), val) : AsyncStorage.removeItem(draftKey(userId))).catch(() => {});
  }
  useEffect(() => {
    if (!loaded || !userId) return;
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => saveDraftNow(text), 300);
    return () => clearTimeout(draftTimer.current);
  }, [text, userId, loaded]);

  // ── Clock, keyboard, screen reader, app state, auto-close (FL-32/36/40) ──
  const guardRef = useRef({});
  guardRef.current = { text, sending: busy, followupBusy: fuBusy, modalOpen: !!editRow || consentOpen || showDemo, alertOpen, screenReader, keyboardVisible };
  useEffect(() => {
    const tick = setInterval(() => {
      setNow(Date.now()); // a midnight crossing re-dates the thread (divider)
      if (!embedded && shouldAutoClose({ ...guardRef.current, idleMs: Date.now() - lastTouch.current }, 'idle') && navigation.canGoBack()) navigation.goBack();
    }, 5000);
    const kShow = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => { setKeyboardVisible(true); touch(); });
    const kHide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => { setKeyboardVisible(false); touch(); });
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader).catch(() => {});
    const sr = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    const app = AppState.addEventListener('change', (st) => {
      if (st === 'active') { touch(); return; }
      saveDraftNow(guardRef.current.text);
      if (!embedded && st === 'background' && shouldAutoClose(guardRef.current, 'background') && navigation.canGoBack()) navigation.goBack();
    });
    return () => { clearInterval(tick); kShow.remove(); kHide.remove(); sr?.remove?.(); app.remove(); };
  }, [navigation, embedded]);
  // Swipe-down is the user's choice — but never while a message is being sent. (A tab page
  // has no swipe-down: the options would land on the Journey tab.)
  useEffect(() => { if (!embedded) navigation.setOptions({ gestureEnabled: !busy && !fuBusy }); }, [busy, fuBusy, navigation, embedded]);
  useEffect(() => () => { saveDraftNow(guardRef.current.text); }, [userId]);
  // BK-10: unfolding moves this pushed chat onto the Journey right page; the draft is written
  // first so the page's chat reads it back (never lose what was typed).
  useUnfoldToPage('FoodChat', { embedded, params: routeParams, beforeLeave: () => saveDraftNow(guardRef.current.text) });

  // An alert holds the chat open until it is answered.
  function alert(title, msg, buttons) {
    setAlertOpen(true);
    const wrap = (buttons && buttons.length ? buttons : [{ text: 'OK' }]).map((b) => ({ ...b, onPress: () => { setAlertOpen(false); b.onPress && b.onPress(); } }));
    Alert.alert(title, msg, wrap, { cancelable: true, onDismiss: () => setAlertOpen(false) });
  }

  // ── Questions about today (FL-4/6) ─────────────────────────────
  function rememberAsked(q) {
    const prev = askedRef.current;
    const base = prev.day === localISO() ? prev.ids : [];
    const next = { day: localISO(), ids: q && !base.includes(q.id) ? [...base, q.id] : base, current: q || null };
    askedRef.current = next;
    AsyncStorage.setItem(ASKED_KEY, JSON.stringify(next)).catch(() => {});
  }
  function askNext(r) {
    const a = askedRef.current;
    const q = threadQuestion(r, localISO(), a.day === localISO() ? a.ids : [], new Date());
    setQuestion(q);
    rememberAsked(q);
  }

  // ── Echo (FL-7/8) ──────────────────────────────────────────────
  function echoFor(items) {
    const { shown, more } = echoParts(items, 3);
    if (!shown.length) return null;
    const list = shown.map((it) => `${itemLabel(it, language)} · ~${Math.round(Number(it.kcal) || 0)} ${t('cal_kcal')}`).join(', ');
    return more ? `${list} ${t('nutri_echo_more').replace('{n}', String(more))}` : list;
  }

  // ── Day label / naming (FL-40) ─────────────────────────────────
  function dayLabel(dateISO) {
    const w = dayWord(dateISO, today);
    if (w === 'today') return t('nutri_day_today');
    if (w === 'yesterday') return t('nutri_day_yesterday');
    return formatDate(dateISO, language, 'weekdayDayMonth') || dateISO;
  }

  // ── Close a day (FL-29 / FL-18) ────────────────────────────────
  async function closeDay(dayKey, opts = {}) {
    const uid = userId || (await getCachedUser())?.id || null;
    if (!uid) return;
    // FL-47: closing a day with NO food logged — ask first. Only a confirmed
    // "I ate nothing" makes it a 0-kcal day that counts toward the 7 days in a row.
    const hasFood = (rows || []).some((r) => r && r.entry_date === dayKey && !isMarker(r));
    if (!hasFood && !opts.confirmed) {
      Alert.alert(t('nutri_close_empty_title'), t('nutri_close_empty_msg'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('nutri_close_just_close'), onPress: () => closeDay(dayKey, { confirmed: true }) },
        { text: t('nutri_close_ate_nothing'), onPress: () => closeDay(dayKey, { confirmed: true, ateNothing: true }) },
      ]);
      return;
    }
    const ok = await closeFoodDay(dayKey, uid);
    if (!ok) { alert(t('error'), t('error_save_failed')); return; }
    if (opts.ateNothing) markAteNothing(uid, dayKey); // marker: durable + synced ('ate_nothing')
    const open = openFollowup(rows);
    if (open) { updateItem(open.rowId, open.index, (it) => ({ ...it, ask_skipped: true })); clearDraft(fuDraftKey(open)); } // stays an estimate
    requestSync?.();
    refresh(uid);
    setQuestion(null); rememberAsked(null); setEvening(null); setNotice(null); setFuText('');
    if (logDay === dayKey) setLogDay(null);
  }

  // ── Send (FL-4/10/14/20/27/29) ─────────────────────────────────
  async function onSubmit() {
    const raw = text.trim();
    if (!raw || busy || !userId) return;
    touch();
    if (isDoneText(raw)) { setText(''); saveDraftNow(''); await closeDay(logDay || localISO()); return; }
    if (isNoText(raw)) {
      setText(''); saveDraftNow(''); setNotice(null);
      const open = openFollowup(rows);
      if (open) { skipFollowup(open); return; }
      if (question) askNext(rows);
      return;
    }
    const day = logDay || localISO(); // fixed before any await (a send can cross midnight)
    if (mustAskWhichEarlier(raw, recentForParse(getFoodLogsSince(userId, day) || [], day))) {
      setNotice({ kind: 'earlier' }); setQuestion(null);
      return;
    }
    setConsentOpen(true);
    const consented = await requestAIConsent(t);
    setConsentOpen(false);
    if (!consented) return;
    setNotice(null);
    // A new meal while a follow-up is open is a new entry; the earlier item stays
    // flagged (FL-27) and its question is closed — stored, so it stays closed.
    const open = openFollowup(rows);
    if (open) updateItem(open.rowId, open.index, (it) => ({ ...it, ask_skipped: true }));
    setBusy(true);
    const context = recentForParse(getFoodLogsSince(userId, day) || [], day);
    ensureFreeStart(userId); // the free days' anchor: the real day of first use (FL-41)
    const id = insertFoodLog({ user_id: userId, entry_date: day, raw_text: raw, parse_status: 'pending' });
    rememberTypedHere(id); // typed here: this device parses it if the send fails (FL-19)
    inFlight.add(id);
    setSendingId(id);
    setText(''); saveDraftNow('');
    refresh(userId);

    let res;
    try { res = await parseFood(raw, language, day, context); }
    finally { inFlight.delete(id); setSendingId(null); }
    setBusy(false);
    touch();

    if (res.ok && res.refusal) {
      deleteFoodLog(id); requestSync?.(); refresh(userId);
      setText(raw);            // never lose what they typed
      setNotice({ kind: 'deflect' }); return;
    }
    if (res.ok && (!res.items.length || !res.totals)) {
      deleteFoodLog(id); requestSync?.(); refresh(userId);
      setText(raw);
      setNotice({ kind: 'fix' }); return;
    }
    if (res.ok) {
      // Food from more than 7 days back is not logged (FL-2/45); the rest of the
      // message still saves. Nothing left → no entry, and the typed text comes back.
      const outcome = catchUpOutcome(res.items, res.daysAgo, raw);
      const keep = outcome.save;
      if (!keep.length) {
        deleteFoodLog(id); requestSync?.(); refresh(userId);
        setText(raw);
        setNotice({ kind: 'too_old' }); return;
      }
      const target = res.ask ? res.items[res.ask.item] : null;
      const askKept = target && keep.includes(target);
      if (askKept) {
        // The follow-up is STORED on the item (FL-38): it survives closing the chat.
        target.asked = true;
        target.ask = { kind: res.ask.kind, options: (res.ask.options || []).map((o) => String(o).slice(0, 40)).slice(0, 4) };
      }
      saveParsed(id, userId, day, { ...res, items: keep }, raw);
      requestSync?.();
      const r = refresh(userId);
      // Some of it was too old: the recent part is saved, and the full typed text goes
      // back in the box so the older part isn't lost (FL-45).
      if (outcome.notice === 'too_old_some') { setText(outcome.putBack); setNotice({ kind: 'too_old_some' }); setQuestion(null); rememberAsked(null); return; }
      if (!askKept && day === localISO()) askNext(r); else { setQuestion(null); rememberAsked(null); }
      return;
    }
    // "Saved — I'll estimate it when you're back online" ONLY when actually offline;
    // any other failure: saved, tried again later (FL-46).
    const fail = sendFailureNotice(res, isOnlineNow());
    if (fail === 'quota') {
      deleteFoodLog(id); requestSync?.(); refresh(userId);
      setText(raw);
      setNotice({ kind: 'quota' });
    } else {
      setNotice({ kind: fail });
      // The saved row is really retried (FL-46): shortly while online, and as soon
      // as the connection comes back when offline (NetInfo listener below).
      if (fail === 'retry') scheduleCatchUp(20000);
    }
  }

  // ── Follow-up (FL-10/26/27/28) ─────────────────────────────────
  async function answerFollowup(open, answerRaw) {
    const answer = String(answerRaw || '').trim().slice(0, 200);
    if (!open || !answer || fuBusy) return;
    touch();
    setFuBusy(true);
    const res = await parseFollowup(open.item, open.kind, answer, language, open.entry_date);
    setFuBusy(false);
    touch();
    const outcome = applyAnswer(open, answer, res);
    if (outcome === 'retry') {
      // Offline: the answer is kept ON the item (durable, synced) and retried (FL-28).
      updateItem(open.rowId, open.index, (it) => ({ ...it, ask_pending: answer }));
    } else if (outcome !== 'applied') {
      updateItem(open.rowId, open.index, (it) => ({ ...it, ask_skipped: true }));
      if (outcome === 'refused') setNotice({ kind: 'deflect' });
    } else {
      const e = echoFor([res.items[0]]);
      if (e) setNotice({ kind: 'updated', text: e });
    }
    requestSync?.();
    setFuText('');
    clearDraft(fuDraftKey(open));
    const r = refresh(userId);
    if (open.entry_date === localISO() || outcome === 'applied') askNext(r);
  }

  function skipFollowup(open) {
    touch();
    updateItem(open.rowId, open.index, (it) => ({ ...it, ask_skipped: true })); // stays an estimate (FL-27)
    requestSync?.();
    setFuText('');
    clearDraft(fuDraftKey(open));
    askNext(refresh(userId));
  }

  function confirmRemove(rowId, pending) {
    if (inFlight.has(rowId)) return;
    alert(t('nutri_title'), pending ? t('nutri_offline_saved') : t('nutri_unparsed'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('nutri_delete_entry'), style: 'destructive', onPress: () => { deleteFoodLog(rowId); requestSync?.(); refresh(userId); } },
    ]);
  }
  function removeRow(rowId) { deleteFoodLog(rowId); requestSync?.(); refresh(userId); }

  // ── Thread ─────────────────────────────────────────────────────
  const closedSet = useMemo(() => closedDays(rows), [rows]);
  const eveningOpen = evening && !closedSet.has(evening);
  const thread = useMemo(() => {
    const th = buildThread(rows, {
      todayISO: today,
      sinceISO: localDaysAgoISO(THREAD_DAYS - 1),
      question: question && !closedSet.has(today) ? question : null,
      evening: eveningOpen ? evening : null,
    });
    // Today starts with the app's invitation (FL-1) until something is typed.
    const lastDiv = th.map((x) => x.type).lastIndexOf('divider');
    if (lastDiv >= 0 && th[lastDiv].day === today && !th.slice(lastDiv).some((x) => x.type === 'user')) th.splice(lastDiv + 1, 0, { type: 'intro', key: 'intro:' + today });
    if (notice) th.push({ type: 'notice', key: 'notice', ...notice });
    if (busy || fuBusy) th.push({ type: 'typing', key: 'typing' });
    return th;
  }, [rows, today, question, closedSet, eveningOpen, evening, notice, busy, fuBusy]);
  const data = useMemo(() => thread.slice().reverse(), [thread]); // inverted list opens at the latest (FL-39)

  // BK-14 / A-77: the open follow-up's answer field shows that question's kept draft, and
  // each keystroke updates it. Send, Skip and Day done clear it (they end the question).
  const fuOpen = thread.find((x) => x.type === 'followup') || null;
  const fuKey = fuDraftKey(fuOpen);
  useEffect(() => { setFuText(fuKey ? (getDraft(fuKey) || '') : ''); }, [fuKey]);
  function typeFollowup(v) {
    setFuText(v);
    if (fuKey) { if (v) setDraft(fuKey, v); else clearDraft(fuKey); }
    touch();
  }

  const gated = !!access && !access.canLog;
  const inTrial = access && access.mode === 'trial';
  const freeLeft = inTrial && access.freeDaysLeft != null ? access.freeDaysLeft : 0;

  // ── Bubbles (Graduated, prototype chatScreen: .bub.app / .bub.user / .entry / .deflect) ──
  const AppBubble = ({ children, style }) => <View style={[s.app, style]}>{children}</View>;
  // A short answer chip (prototype .pill); `on` = the suggested one (ink outline).
  const Pill = ({ label, onPress, on, disabled }) => (
    <TouchableOpacity style={[s.pill, on && s.pillOn]} onPress={onPress} disabled={disabled} accessibilityRole="button">
      <Text style={[s.pillText, on && s.pillTextOn]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
  const doneChip = (day) => (
    <View style={s.chips}>
      <Pill label={t('nutri_day_done_btn')} onPress={() => closeDay(day)} />
    </View>
  );

  function renderItem({ item: x }) {
    switch (x.type) {
      case 'divider':
        return <View style={s.divider}><View style={s.divLine} /><Text style={s.divText}>{dayLabel(x.day)}</Text><View style={s.divLine} /></View>;
      case 'intro':
        return (
          <View style={s.introWrap}>
            <AppBubble><Text style={s.appText}>{t('nutri_intro')}</Text></AppBubble>
            {/* "See how it works" sits under the first message (journey-dashboard #20). */}
            <TouchableOpacity style={s.seeHow} onPress={() => { touch(); setShowDemo(true); }} accessibilityRole="button">
              <FeatureIcon name="ai_spark" size={15} color={colors.ink} />
              <Text style={s.seeHowText}>{t('nutri_how')}</Text>
            </TouchableOpacity>
          </View>
        );
      case 'user':
        return (
          <TouchableOpacity activeOpacity={x.status === 'done' || x.status === 'too_old' ? 1 : 0.7} disabled={x.status === 'done' || x.status === 'too_old'} onPress={() => confirmRemove(x.rowId, x.status === 'pending')} style={s.userWrap}>
            <View style={s.user}><Text style={s.userText}>{x.text}</Text></View>
            {/* A row being read right now is not "saved offline" (FL-46). */}
            {x.status === 'pending' && x.rowId !== sendingId && <Text style={s.userNote}>{t(isOnlineNow() === false ? 'nutri_offline_saved' : 'nutri_retry_later')}</Text>}
            {x.status === 'unparsed' && <Text style={[s.userNote, s.userNoteWarn]}>{t('nutri_unparsed')}</Text>}
          </TouchableOpacity>
        );
      case 'too_old':
        return (
          <AppBubble>
            <Text style={s.appText}>{t('nutri_too_old')}</Text>
            <View style={s.chips}>
              <Pill label={t('nutri_delete_entry')} onPress={() => removeRow(x.rowId)} />
            </View>
          </AppBubble>
        );
      case 'refused':
        return (
          <View style={s.deflect}>
            <Text style={s.deflectTitle}>{t('nutri_deflect_title')}</Text>
            <Text style={s.deflectBody}>{t('nutri_deflect_body')}</Text>
            <View style={s.chips}>
              <Pill label={t('nutri_delete_entry')} onPress={() => removeRow(x.rowId)} />
            </View>
          </View>
        );
      case 'entry':
        return (
          <TouchableOpacity style={s.entry} activeOpacity={0.75} onPress={() => { touch(); setEditRow(getFoodLogById(x.rowId)); }} accessibilityRole="button" accessibilityLabel={t('nutri_edit_title')}>
            {x.entry_date !== today && <Text style={s.entryDay}>{dayLabel(x.entry_date)}</Text>}
            {x.items.map((it, i) => (
              <View key={i} style={s.entryItem}>
                <View style={s.entryRow}>
                  <Text style={s.entryFood}>{itemLabel(it, language)} · <Text style={s.mono}>~{Math.round(it.kcal || 0)}</Text> {t('cal_kcal')}</Text>
                  {CATEGORIES.includes(it.category) && <Text style={s.catTag}>{t(`nutri_cat_${it.category}`)}</Text>}
                </View>
                {needsEstimateFlag(it) && <Text style={s.estFlag}>{t('nutri_estimate')}</Text>}
              </View>
            ))}
            <View style={s.entryTot}>
              <Text style={s.entryTotText}>≈ {Math.round(x.kcal || 0)} {t('cal_kcal')}</Text>
              <Text style={s.entryMacro}>{Math.round(x.carb_g || 0)} g {t('nutri_carbs')} · {Math.round(x.protein_g || 0)} g {t('nutri_protein')}</Text>
            </View>
          </TouchableOpacity>
        );
      case 'echo': {
        const e = echoFor(x.items);
        return e ? <AppBubble><Text style={s.appText}>{t('nutri_echo').replace('{items}', e)}</Text></AppBubble> : null;
      }
      case 'asked':
        return (
          <>
            <AppBubble><Text style={s.appText}>{t(`nutri_ask_${x.kind}`).replace('{food}', String(x.food || '').slice(0, 60))}</Text></AppBubble>
            <View style={s.userWrap}><View style={s.user}><Text style={s.userText}>{x.answer}</Text></View></View>
          </>
        );
      case 'answer_pending':
        return (
          <View style={s.userWrap}>
            <View style={s.user}><Text style={s.userText}>{x.answer}</Text></View>
            <Text style={s.userNote}>{t('nutri_ask_saved')}</Text>
          </View>
        );
      case 'closed': {
        const w = dayWord(x.day, today);
        return <AppBubble><Text style={s.appText}>{w === 'today' ? t('nutri_day_closed') : w === 'yesterday' ? t('nutri_day_closed_yesterday') : t('nutri_day_closed_on').replace('{day}', dayLabel(x.day))}</Text></AppBubble>;
      }
      case 'not_recorded':
        return <AppBubble><Text style={s.appText}>{t('nutri_nr_bubble').replace('{day}', dayLabel(x.day))}</Text></AppBubble>;
      case 'followup':
        return (
          <AppBubble style={s.fu}>
            <Text style={s.appText}>{t(`nutri_ask_${x.kind}`).replace('{food}', String(x.item.food || '').slice(0, 60))}</Text>
            {x.options.length > 0 && (
              <View style={s.chips}>
                {x.options.map((o, i) => (
                  // Parser-suggested short answers: plain one-line text, ≤ 40 chars (FL-16).
                  <Pill key={i} label={String(o).slice(0, 40)} disabled={fuBusy} onPress={() => answerFollowup(x, String(o).slice(0, 40))} />
                ))}
              </View>
            )}
            <View style={s.fuField}>
              <TextInput
                style={s.fuInput}
                value={fuText}
                onChangeText={typeFollowup}
                placeholder={t('nutri_ask_placeholder')}
                placeholderTextColor={colors.ink3}
                editable={!fuBusy}
                returnKeyType="send"
                onSubmitEditing={() => answerFollowup(x, fuText)}
                maxLength={200}
              />
              <Pill label={t('nutri_ask_send')} on={!!fuText.trim() && !fuBusy} disabled={!fuText.trim() || fuBusy} onPress={() => answerFollowup(x, fuText)} />
            </View>
            <View style={s.fuFoot}>
              <TouchableOpacity onPress={() => skipFollowup(x)} disabled={fuBusy} style={s.linkHit} accessibilityRole="button">
                <Text style={s.link}>{t('nutri_ask_skip')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => closeDay(x.entry_date)} disabled={fuBusy} style={s.linkHit} accessibilityRole="button">
                <Text style={s.link}>{t('nutri_day_done_btn')}</Text>
              </TouchableOpacity>
            </View>
          </AppBubble>
        );
      case 'question':
        return (
          <AppBubble>
            <Text style={s.appText}>{t(`nutri_q_${x.id}${x.tense === 'neutral' ? '' : '_' + x.tense}`)}</Text>
            {doneChip(today)}
          </AppBubble>
        );
      case 'evening': {
        const w = dayWord(x.day, today);
        const q = w === 'today' ? t('notif_food_body') : w === 'yesterday' ? t('nutri_evening_q_yesterday') : t('nutri_evening_q_on').replace('{day}', dayLabel(x.day));
        return (
          <AppBubble>
            <Text style={s.appText}>{q}</Text>
            <View style={s.chips}>
              <Pill on label={t('notif_food_action_log')} onPress={() => { setEvening(null); setLogDay(w === 'today' ? null : x.day); setTimeout(() => inputRef.current?.focus?.(), 50); }} />
              <Pill label={w === 'today' ? t('notif_food_action_done') : t('nutri_evening_done_day')} onPress={() => closeDay(x.day)} />
              {w === 'today' && <Pill label={t('nutri_evening_later')} onPress={() => setEvening(null)} />}
            </View>
          </AppBubble>
        );
      }
      case 'notice': {
        if (x.kind === 'deflect') {
          return (
            <View style={s.deflect}>
              <Text style={s.deflectTitle}>{t('nutri_deflect_title')}</Text>
              <Text style={s.deflectBody}>{t('nutri_deflect_body')}</Text>
            </View>
          );
        }
        const msg = x.kind === 'fix' ? t('nutri_fix_hint')
          : x.kind === 'too_old' ? t('nutri_too_old')
          : x.kind === 'too_old_some' ? t('nutri_too_old_some')
          : x.kind === 'earlier' ? t('nutri_which_earlier')
            : x.kind === 'quota' ? t('nutri_quota')
              : x.kind === 'offline' ? t('nutri_offline_saved')
                : x.kind === 'retry' ? t('nutri_retry_later')
                : x.kind === 'updated' ? t('nutri_echo_updated').replace('{items}', x.text || '') : '';
        return msg ? <AppBubble><Text style={s.appText}>{msg}</Text></AppBubble> : null;
      }
      case 'typing':
        return (
          <AppBubble style={s.typing}>
            <Text style={s.typingText}>{t('nutri_typing')}</Text>
            <TypingDots s={s} label={t('nutri_typing')} />
          </AppBubble>
        );
      default:
        return null;
    }
  }

  const canSend = !busy && !!text.trim();

  // Journey redesign part 21 (founder 2026-10-02): the chat opens full screen on both
  // platforms (it used to be an iOS sheet that started below the status bar, A-68), so it
  // holds the top edge itself. On a book page the Journey tab screen already holds it.
  const edges = embedded ? ['left', 'right'] : ['top', 'left', 'right', 'bottom'];
  return (
    <SafeAreaView style={s.container} edges={edges}>
      <View style={s.header}>
        <View style={s.headTitleRow}>
          <FeatureIcon name="ai_spark" size={20} color={colors.ink} />
          <Text style={s.headTitle}>{t('nutri_ai_badge')}</Text>
        </View>
        {embedded ? null : (
          <TouchableOpacity onPress={() => navigation.goBack()} disabled={busy || fuBusy} style={s.headDoneHit} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button">
            <Text style={[s.headDone, (busy || fuBusy) && s.headDoneOff]}>{t('done')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {gated ? (
        <View style={s.locked}>
          <View style={s.lockedCard}>
            <FeatureIcon name="ai_spark" size={28} color={colors.ink} />
            <Text style={s.lockedTitle}>{t('nutri_locked_title')}</Text>
            <Text style={s.lockedSub}>{t('nutri_locked_sub')}</Text>
            <TouchableOpacity style={s.cta} onPress={() => navigation.navigate('Paywall')} accessibilityRole="button">
              <Text style={s.ctaText}>{t('nutri_locked_cta')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <KeyboardAvoidingView style={s.flex} behavior="padding" keyboardVerticalOffset={0} onTouchStart={touch}>
          {access && (access.reason === 'premium_ended' || access.reason === 'free_days_ending') && (
            <FoodGraceNote rcStart={rcStart} until={access.until} reason={access.reason} freeFrom={access.freeFrom} rows={rows} style={s.graceNote} />
          )}
          <FlatList
            style={s.flex}
            contentContainerStyle={s.list}
            data={data}
            inverted
            keyExtractor={(x) => x.key}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onScrollBeginDrag={touch}
            initialNumToRender={20}
            windowSize={11}
          />
          <View style={s.composer}>
            {logDay && (
              <TouchableOpacity style={s.logDayChip} onPress={() => setLogDay(null)} accessibilityRole="button">
                <Text style={s.logDayText}>{t('nutri_logging_for').replace('{day}', dayLabel(logDay))} ×</Text>
              </TouchableOpacity>
            )}
            <View style={s.field}>
              <TextInput
                ref={inputRef}
                style={s.input}
                value={text}
                onChangeText={(v) => { setText(v); touch(); if (notice && notice.kind === 'earlier') setNotice(null); }}
                placeholder={t('nutri_input_placeholder')}
                placeholderTextColor={colors.ink3}
                multiline
                editable={!busy}
              />
              <TouchableOpacity style={s.send} onPress={onSubmit} disabled={!canSend} accessibilityRole="button" accessibilityLabel={t('nutri_send')} accessibilityState={{ disabled: !canSend }}>
                {busy ? <ActivityIndicator size="small" color={colors.onAct} /> : <FeatureIcon name="ai_spark" size={20} color={colors.onAct} />}
              </TouchableOpacity>
            </View>
            <Text style={s.caveat}>{t('nutri_est_note')}{inTrial && freeLeft > 0 ? '  ·  ' + t(pluralKey('nutri_free_note', freeLeft, language)).replace('{n}', String(freeLeft)) : ''}</Text>
          </View>
        </KeyboardAvoidingView>
      )}

      <FoodEntryEditor row={editRow} onClose={() => { setEditRow(null); touch(); }} onSaved={() => refresh(userId)} />

      {/* See how it works (prototype FC-demo): the animated example on a sheet. */}
      <Modal visible={showDemo} transparent animationType="fade" onRequestClose={() => { setShowDemo(false); touch(); }}>
        <View style={s.demoScrim}>
          <View style={s.demoSheet}>
            <FoodDemo ctaLabel={t('nutri_how_cta')} onCta={() => { setShowDemo(false); touch(); }} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// "Reading your message": three dots blinking one after another (prototype .typing .dots:
// 5 pt, gap 3, ink3, 1 s, 0.2 s apart); with Reduce Motion they rest at 0.6.
function TypingDots({ s, label }) {
  const reduced = useReducedMotion();
  return (
    <View style={s.dots} accessible accessibilityLabel={label}>
      {[0, 1, 2].map((k) => <TypingDot key={k} delay={k * 200} reduced={reduced} s={s} />)}
    </View>
  );
}
function TypingDot({ delay, reduced, s }) {
  const o = useSharedValue(reduced ? 0.6 : 0.2);
  useEffect(() => {
    if (reduced) { o.value = 0.6; return; }
    o.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 500 }), withTiming(0.2, { duration: 500 })), -1));
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[s.dot, st]} />;
}

// Graduated (prototype .chatsheet / .chathd / .chatbody / .bub / .entry / .erow / .etot /
// .unote / .deflect / .typing / .composer2 / .send2 / .chatfoot): the chat sits on the
// ground; app bubbles are raised, the user's are ink; one ink action (send).
const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.ground },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.ground },
  headTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headTitle: { fontSize: 17, fontWeight: '600', color: c.ink },
  headDoneHit: { minHeight: 44, justifyContent: 'center' },
  headDone: { fontSize: 17, fontWeight: '600', color: c.ink },
  headDoneOff: { color: c.ink3 },
  list: { paddingHorizontal: 16, paddingVertical: 16, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  mono: { fontFamily: MONO['500'], color: c.ink, fontVariant: ['tabular-nums'] },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 },
  divLine: { flex: 1, height: 1, backgroundColor: c.line },
  divText: { fontSize: 12, fontWeight: '500', color: c.ink3 },
  app: { alignSelf: 'flex-start', maxWidth: '84%', backgroundColor: c.raised, borderRadius: 20, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 12, marginVertical: 5, gap: 10 },
  appText: { fontSize: 17, lineHeight: 22, color: c.ink },
  introWrap: { alignSelf: 'stretch' },
  seeHow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, marginLeft: 6, marginTop: -4 },
  seeHowText: { fontSize: 15, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: c.ink3 },
  typingText: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  userWrap: { alignSelf: 'flex-end', maxWidth: '84%', marginVertical: 5, alignItems: 'flex-end' },
  user: { backgroundColor: c.act, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 12 },
  userText: { fontSize: 17, lineHeight: 22, color: c.onAct },
  userNote: { fontSize: 13, lineHeight: 18, color: c.ink2, marginTop: 4, textAlign: 'right' },
  userNoteWarn: { color: c.attention },
  entry: { alignSelf: 'flex-end', width: '88%', backgroundColor: c.raised, borderRadius: 20, borderWidth: 1, borderColor: c.line, paddingHorizontal: 14, paddingVertical: 12, marginVertical: 5, gap: 6 },
  entryDay: { fontSize: 12, fontWeight: '500', color: c.ink2 },
  entryItem: { gap: 2 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryFood: { flex: 1, fontSize: 17, lineHeight: 22, color: c.ink },
  catTag: { borderWidth: 1, borderColor: c.line, color: c.ink2, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 2, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  estFlag: { fontSize: 13, lineHeight: 18, color: c.attention },
  entryTot: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 8, marginTop: 2, gap: 2 },
  entryTotText: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink, fontVariant: ['tabular-nums'] },
  entryMacro: { fontSize: 13, lineHeight: 18, color: c.ink2, fontVariant: ['tabular-nums'] },
  // The fixed "no diet advice" card: an outline, never a tinted box.
  deflect: { alignSelf: 'stretch', borderWidth: 1, borderColor: c.line, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, marginVertical: 5, gap: 4 },
  deflectTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  deflectBody: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { minHeight: 36, maxWidth: '100%', borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line, justifyContent: 'center' },
  pillOn: { borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.raised, paddingHorizontal: 13.5 },
  pillText: { fontSize: 13, color: c.ink2 },
  pillTextOn: { color: c.ink, fontWeight: '600' },
  fu: { width: '88%' },
  fuField: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fuInput: { flex: 1, minHeight: 44, backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: c.ink },
  fuFoot: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  linkHit: { minHeight: 36, justifyContent: 'center' },
  link: { fontSize: 13, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
  composer: { borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.ground, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  logDayChip: { alignSelf: 'flex-start', minHeight: 36, borderRadius: 18, borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.raised, paddingHorizontal: 13.5, justifyContent: 'center', marginBottom: 8 },
  logDayText: { fontSize: 13, fontWeight: '600', color: c.ink },
  field: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  input: { flex: 1, minHeight: 46, maxHeight: 120, backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: 23, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 17, color: c.ink },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center' },
  // Disabled = well + ink3 (readable, clearly inactive), never a faded fill.
  caveat: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: c.ink2, textAlign: 'center', marginTop: 6, paddingBottom: 4 },
  locked: { flex: 1, justifyContent: 'center', padding: 16 },
  lockedCard: { backgroundColor: c.raised, borderRadius: 24, padding: 18, gap: 12, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  graceNote: { marginHorizontal: 16, marginTop: 10 },
  lockedTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: c.ink },
  lockedSub: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  cta: { minHeight: 52, borderRadius: 26, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  ctaText: { color: c.onAct, fontWeight: '700', fontSize: 17 },
  demoScrim: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center', padding: 16 },
  demoSheet: { backgroundColor: c.raised, borderRadius: 26, padding: 20, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
});
