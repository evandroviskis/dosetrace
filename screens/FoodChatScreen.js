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
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Linking, ScrollView,
  KeyboardAvoidingView, Keyboard, AppState, AccessibilityInfo, Platform, PanResponder,
} from 'react-native';
import { startsHeaderSwipe, closesOnRelease } from '../lib/headerSwipe';
import Modal from '../components/PresenceModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TAB_SCREEN_EDGES } from '../lib/tabBarStyle';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withDelay, useReducedMotion } from 'react-native-reanimated';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { MONO } from '../lib/fonts';
import { requestSync, isOnlineNow, notifyDataChanged } from '../lib/sync';
import { getFoodLogsSince, insertFoodLog, deleteFoodLog, getFoodLogById } from '../lib/database';
import { parseFood, parseFollowup } from '../lib/nutritionClient';
import {
  closedDays, catchUpOutcome, isDoneText, isNoText, mustAskWhichEarlier, itemLabel, foodCase, needsEstimateFlag, echoParts, recentForParse, isMarker, quotaWaitDay,
} from '../lib/nutrition';
import { mealChatAsk, normalizeMeals, onMealsChanged } from '../lib/mealReminders';
import { buildThread, withNotice, dayFoodTotal, liveNotice, openFollowup, shouldAutoClose, dayWord, sendFailureNotice, pendingNoteShown, newMessageId } from '../lib/foodThread';
import { recentMeals, repeatEntry, canRepeat, goodbyeFor } from '../lib/foodRecent';
import { saveParsed, updateItem, applyAnswer, storedItem, catchUpFood, rememberTypedHere, inFlight, loadFoodAccess, ensureFreeStart, markAteNothing } from '../lib/foodLogActions';
import FoodGraceNote from './components/FoodGraceNote';
import { DTSheet } from './components/ProtocolParts';
import { hasAIConsent, grantAIConsent, AI_PRIVACY_URL } from '../lib/aiConsent';
import { localISO, localDaysAgoISO } from '../lib/localDate';
import { formatTime } from '../lib/timeFormat';
import { syncAllNotifications, closeFoodDay, notificationsGranted } from '../lib/notifications';
import FeatureIcon from '../components/FeatureIcon';
import { Analytics } from '../lib/analytics';
import FoodEntryEditor from './components/FoodEntryEditor';
import PlanBars from './components/PlanBars';
import { todayBars, addedProtein } from '../lib/planActual';
import { readProgressTile } from '../lib/progressTileLoad';
import { useUnfoldToPage } from '../components/BookPanes';
import { getDraft, setDraft, clearDraft } from '../lib/draftStore';
const EDITOR_OPEN_KEY = 'foodChat:editorOpen';
import { FoodDemo } from './components/NutritionLogger';

import { formatDate, formatInt } from '../lib/localeFormat';
import { pluralKey } from '../lib/plural';
import { ERROR_ICON, errorTitle } from '../lib/errorSheet';
// Per-device convenience (not user data): the unsent draft (FL-36, per user).
const draftKey = (uid) => `dosetrace_food_draft:${uid}`;
// FR-5: how long "Undo" stays after a recent meal is logged with one tap (longer with a screen reader).
const UNDO_MS = 6000;
const UNDO_MS_SCREEN_READER = 15000;
const BYE_NAMED = new Set(['breakfast', 'lunch', 'dinner']);
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
  const { t, language, timeFormat } = useLanguage();
  // DV-213: when the 24-hour ceiling frees a call, in the user's 12/24 h choice.
  const ceilingTime = (iso) => {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return '—';
    return formatTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, language, timeFormat);
  };
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
  // FR-12: the goodbye after an entry ({ day, next: { kind, at } | null }) — replaces the day question (FL-4).
  const [bye, setBye] = useState(null);
  // FR-5: the row a recent-meal tap just logged, while "Undo" shows ({ rowId, label }).
  const [undo, setUndo] = useState(null);
  const undoTimer = useRef(null);
  const repeatingRef = useRef(false);
  // FR-12: the meal times and the reminders switch (user_metadata), to know whether the next meal's reminder is on.
  const mealMetaRef = useRef({ meals: null, on: false });
  // A meal-time change made while the chat is open (MealTimesSheet) reaches the goodbye at once.
  useEffect(() => onMealsChanged((n) => { mealMetaRef.current = { ...mealMetaRef.current, meals: (n && n.meals) || null }; }), []);
  const [evening, setEvening] = useState(null);   // day the 8 PM question is about
  const [mealAsk, setMealAsk] = useState(null);   // MR-11: { meal, day } — the meal a reminder's Log asks about
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
  const [chatSheet, setChatSheet] = useState(null); // DoseTrace sheet instead of a native alert (M4)
  const [consentOpen, setConsentOpen] = useState(false);
  const [showDemo, setShowDemo] = useState(false); // "See how it works" sheet
  const [loaded, setLoaded] = useState(false);
  // PA-7 / PA-8 (docs/specs/food-plan-actual.md): the Progress plan for the day's bars, or null (no plan yet).
  const [plan, setPlan] = useState(null);
  const inputRef = useRef(null);
  const lastTouch = useRef(Date.now());
  const draftTimer = useRef(null);

  const today = localISO(new Date(now));
  const touch = () => { lastTouch.current = Date.now(); };

  // ── Load / refresh ─────────────────────────────────────────────
  // DV-238: after a write the other screens showing the food log (the Journey hero beside this chat on
  // the open Fold) hear it — announce = false only for the plain opening.
  function refresh(uid, announce = true) {
    const id = uid || userId;
    if (!id) return [];
    const r = getFoodLogsSince(id, localDaysAgoISO(366)) || [];
    setRows(r);
    syncAllNotifications().catch(() => {});
    if (announce) notifyDataChanged('food_logs');
    return r;
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const user = await getCachedUser();
    const uid = user?.id || null;
    try { const a = await loadFoodAccess(uid); setAccess(a.access); setRcStart(a.rcStart); } catch { setAccess(null); }
    // PA-7: the plan of the Progress card (one loader), re-read on every focus so a goal changed there shows here.
    setPlan((await readProgressTile().catch(() => null))?.plan || null);
    setUserId(uid);
    userIdRef.current = uid;
    const meta = (user && user.user_metadata) || {};
    // FR-12: the goodbye names a reminder time only when it can really arrive — the account switch AND
    // the phone's notification permission (council 2026-11-26: never promise a question that never comes).
    const granted = await notificationsGranted().catch(() => false);
    mealMetaRef.current = { meals: (normalizeMeals(meta.food_meals) || {}).meals || null, on: meta.food_reminders !== false && granted };
    if (!uid) { setLoaded(true); return; }
    // The draft / put-back text survives closing the chat (FL-36).
    try { const d = await AsyncStorage.getItem(draftKey(uid)); if (d) setText((cur) => cur || d); } catch { /* ignore */ }
    refresh(uid, false);
    setLoaded(true);
    // Offline rows and offline follow-up answers catch up now (FL-19/28).
    const { changed, updatedItems, updatedRowIds } = await catchUpFood(uid, language);
    if (changed) refresh(uid);
    const e = echoFor(updatedItems, rawOfRows(updatedRowIds));
    if (e) setNotice({ kind: 'updated', text: e, rowIds: updatedRowIds || [], catchUp: true });
  }

  // Retry what waited for the network (offline rows, offline follow-up answers).
  const retryTimer = useRef(null);
  const wasOffline = useRef(false);
  function scheduleCatchUp(ms) {
    clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(async () => {
      const uid = userIdRef.current;
      if (!uid) return;
      const { changed, updatedItems, updatedRowIds } = await catchUpFood(uid, language);
      if (changed) refresh(uid);
      const e = echoFor(updatedItems, rawOfRows(updatedRowIds));
      if (e) setNotice({ kind: 'updated', text: e, rowIds: updatedRowIds || [], catchUp: true });
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
  // MR-11 (docs/specs/meal-reminders.md): "Log" on a meal reminder opens the chat asking for that
  // meal; an earlier day's reminder logs onto that day (as the 8 PM question's Log does).
  const mealParam = routeParams?.meal;
  const mealDayParam = routeParams?.mealDay;
  useEffect(() => {
    if (!logItNonce || !mealParam || !mealParam.at) return;
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(mealDayParam || '')) ? mealDayParam : localISO();
    setMealAsk({ meal: { at: mealParam.at, kind: mealParam.kind }, day, since: new Date().toISOString() });
    setLogDay(day === localISO() ? null : day);
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
  // Swipe-down closes the chat (FL-32) only from the title bar, never while a message is being sent;
  // a downward drag on the thread scrolls back through it (founder 2026-11-26: the stack's vertical
  // gesture took the drag from almost anywhere and closed the chat). A tab page has no swipe-down.
  const busyRef = useRef(false);
  busyRef.current = busy || fuBusy;
  const headerSwipe = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !embedded && startsHeaderSwipe(g),
    onPanResponderRelease: (_, g) => { if (!embedded && closesOnRelease(g) && !busyRef.current && navigation.canGoBack()) navigation.goBack(); },
  })).current;
  useEffect(() => () => { saveDraftNow(guardRef.current.text); }, [userId]);
  // BK-10: unfolding moves this pushed chat onto the Journey right page; the draft is written
  // first so the page's chat reads it back (never lose what was typed).
  useUnfoldToPage('FoodChat', { embedded, params: routeParams, beforeLeave: () => saveDraftNow(guardRef.current.text) });

  // A DoseTrace sheet holds the chat open until it is answered (M4: no native alerts).
  // buttons: [{ text, style: 'cancel' | 'destructive' | undefined, onPress }]. Two buttons sit in
  // a row with Cancel first; three stack with Cancel last. The risk colour marks a destructive
  // choice; a tap outside or Android back = Cancel.
  // icon: a FeatureIcon name — an error passes ERROR_ICON, the warning triangle (DV-233).
  function alert(title, msg, buttons, icon) {
    setAlertOpen(true);
    const list = buttons && buttons.length ? buttons : [{ text: t('ok') }];
    const cancel = list.filter((b) => b.style === 'cancel');
    const rest = list.filter((b) => b.style !== 'cancel');
    const ordered = list.length > 2 ? [...rest, ...cancel] : [...cancel, ...rest];
    const lastAction = rest[rest.length - 1];
    setChatSheet({
      icon,
      title,
      body: msg,
      buttons: ordered.map((b) => ({
        label: b.text,
        kind: b.style === 'destructive' ? 'danger' : b.style === 'cancel' ? 'secondary' : b === lastAction ? 'primary' : 'secondary',
        onPress: b.onPress,
      })),
    });
  }
  function closeChatSheet() { setChatSheet(null); setAlertOpen(false); }
  // The one shared AI consent (same key, same policy link as every AI feature), asked in the
  // DoseTrace sheet. Resolves true only after an explicit "Agree"; the policy link opens the
  // page and keeps the send cancelled (the typed text stays in the box).
  function askAIConsent() {
    return new Promise((resolve) => {
      hasAIConsent().then((granted) => {
        if (granted) { resolve(true); return; }
        setChatSheet({
          icon: 'ai_spark',
          title: t('ai_consent_title'),
          body: t('ai_consent_body'),
          link: { label: t('ai_consent_privacy'), onPress: () => { Linking.openURL(AI_PRIVACY_URL).catch(() => {}); resolve(false); } },
          buttons: [
            { label: t('cancel'), kind: 'secondary', onPress: () => resolve(false) },
            { label: t('ai_consent_agree'), kind: 'primary', onPress: async () => { await grantAIConsent(); resolve(true); } },
          ],
          onDismiss: () => resolve(false),
        });
      });
    });
  }

  // ── The goodbye after an entry (FR-12, amends FL-4) ────────────
  // No question right after each entry: "Done, logged." and, only when the next meal's reminder is
  // really on today, when it will ask (lib/foodRecent goodbyeFor). The day question keeps coming from
  // the meal reminders and the 20:00 question.
  function sayBye(day, r, acc = access) {
    const meta = mealMetaRef.current || {};
    const todayKey = localISO();
    const list = r || rows || [];
    const next = goodbyeFor({
      todayISO: todayKey, entryDay: day, nowMs: Date.now(), meals: meta.meals, remindersOn: meta.on,
      checkOpen: !!(rcStart && rcStart.date), access: acc, closed: closedDays(list).has(todayKey),
      entries: list.filter((x) => x && x.entry_date >= todayKey),
    });
    setBye({ day, next });
  }
  function byeText(x) {
    const next = x && x.next;
    if (!next) return `${t('nutri_bye')} ${t('nutri_bye_free')}`;
    const key = BYE_NAMED.has(next.kind) ? `nutri_bye_next_${next.kind}` : 'nutri_bye_next_any';
    return `${t('nutri_bye')} ${t(key).replace('{time}', formatTime(next.at, language, timeFormat))}`;
  }

  // ── Echo (FL-7/8, FR-9) ────────────────────────────────────────
  // The receipt is the echo on screen (no separate bubble); a screen reader still hears what was logged.
  // rawText: the user's own words for those items, so a generic food reads as they typed it (A-133).
  function echoFor(items, rawText) {
    const { shown, more } = echoParts(items, 3);
    if (!shown.length) return null;
    const list = shown.map((it) => `${itemLabel(it, language, rawText)} · ~${Math.round(Number(it.kcal) || 0)} ${t('cal_kcal')}`).join(', ');
    return more ? `${list} ${t(pluralKey('nutri_echo_more', more, language)).replace('{n}', String(more))}` : list;
  }
  function announceLogged(items, rawText) {
    const e = echoFor(items, rawText);
    if (e) { try { AccessibilityInfo.announceForAccessibility(t('nutri_echo').replace('{items}', e)); } catch { /* no screen reader API */ } }
  }

  // ── Recent meals (FR-1..FR-7) ──────────────────────────────────
  // One tap logs a past meal again on the chat's day: no AI call (no daily read, works offline), the same
  // numbers as last time, a new message, saved already read. "Undo" stays a few seconds (normal delete).
  async function repeatMeal(meal) {
    if (!meal || busy || fuBusy || repeatingRef.current || !userId) return;
    touch();
    repeatingRef.current = true;
    try {
      // FR-7: the same free days / Premium rule as typing (FL-41), asked again right now.
      let a = access;
      try { a = (await loadFoodAccess(userId)).access; setAccess(a); } catch { /* keep the last answer */ }
      if (!canRepeat(a)) return;
      const day = logDay || localISO();
      ensureFreeStart(userId); // the free days' anchor: the real day of first use (FL-41)
      // A new meal while a follow-up is open is a new entry; the earlier item stays flagged (FL-27).
      const open = openFollowup(rows);
      if (open) { updateItem(open.rowId, open.index, (it) => ({ ...it, ask_skipped: true })); clearDraft(fuDraftKey(open)); }
      setNotice(null);
      const id = insertFoodLog(repeatEntry(meal, { userId, day, msgId: newMessageId() }));
      Analytics.foodLogged('recent');
      requestSync?.();
      const r = refresh(userId);
      announceLogged(meal.items, meal.label);
      sayBye(day, r, a);
      clearTimeout(undoTimer.current);
      // Undo puts back everything the tap changed: the follow-up it closed reopens (journey review 2026-11-26).
      setUndo({ rowId: id, label: meal.label, reopen: open ? { rowId: open.rowId, index: open.index } : null });
      undoTimer.current = setTimeout(() => setUndo(null), screenReader ? UNDO_MS_SCREEN_READER : UNDO_MS);
    } finally { repeatingRef.current = false; }
  }
  function undoRepeat() {
    const u = undo;
    clearTimeout(undoTimer.current);
    setUndo(null);
    if (!u) return;
    touch();
    deleteFoodLog(u.rowId); // the normal delete: a synced tombstone
    Analytics.foodRecentUndo();
    if (u.reopen) updateItem(u.reopen.rowId, u.reopen.index, (it) => { const { ask_skipped, ...rest } = it || {}; return rest; });
    requestSync?.();
    refresh(userId);
    setBye(null);
  }
  useEffect(() => () => clearTimeout(undoTimer.current), []);
  function openRecentInfo() {
    touch();
    alert(t('nutri_recent_title'), t('nutri_recent_body'), [{ text: t('nutri_how_cta') }], 'info');
  }

  // The user's own text of these rows (A-133 foodCase), for notices built outside the thread.
  function rawOfRows(ids) {
    return (ids || []).map((id) => (getFoodLogById(id) || {}).raw_text || '').filter(Boolean).join(' · ');
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
    // DV-064: a refused / unparsed / too-old row is not food the run counts — still ask.
    // DV-066: an item waiting for tomorrow's read (quota_wait) is food typed that day, like a pending one.
    const hasFood = (rows || []).some((r) => r && r.entry_date === dayKey && !isMarker(r) && (r.parse_status === 'done' || r.parse_status === 'pending' || !!quotaWaitDay(r.parse_status)));
    if (!hasFood && !opts.confirmed) {
      alert(t('nutri_close_empty_title'), t('nutri_close_empty_msg'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('nutri_close_just_close'), onPress: () => closeDay(dayKey, { confirmed: true }) },
        { text: t('nutri_close_ate_nothing'), onPress: () => closeDay(dayKey, { confirmed: true, ateNothing: true }) },
      ]);
      return;
    }
    const ok = await closeFoodDay(dayKey, uid);
    if (!ok) { alert(errorTitle(t, 'save'), t('error_save_failed'), null, ERROR_ICON); return; } // DV-233
    if (opts.ateNothing) markAteNothing(uid, dayKey); // marker: durable + synced ('ate_nothing')
    const open = openFollowup(rows);
    if (open) { updateItem(open.rowId, open.index, (it) => ({ ...it, ask_skipped: true })); clearDraft(fuDraftKey(open)); } // stays an estimate
    requestSync?.();
    refresh(uid);
    setBye(null); setEvening(null); setMealAsk(null); setNotice(null); setFuText('');
    if (logDay === dayKey) setLogDay(null);
  }

  // ── Send (FL-10/14/20/27/29, FR-12) ────────────────────────────
  async function onSubmit() {
    const raw = text.trim();
    if (!raw || busy || !userId) return;
    touch();
    if (isDoneText(raw)) { setText(''); saveDraftNow(''); await closeDay(logDay || localISO()); return; }
    if (isNoText(raw)) {
      setText(''); saveDraftNow(''); setNotice(null);
      const open = openFollowup(rows);
      if (open) skipFollowup(open);
      return;
    }
    const day = logDay || localISO(); // fixed before any await (a send can cross midnight)
    if (mustAskWhichEarlier(raw, recentForParse(getFoodLogsSince(userId, day) || [], day))) {
      setNotice({ kind: 'earlier' }); setBye(null);
      return;
    }
    setConsentOpen(true);
    const consented = await askAIConsent();
    setConsentOpen(false);
    if (!consented) return;
    setNotice(null); setBye(null);
    // A new meal while a follow-up is open is a new entry; the earlier item stays
    // flagged (FL-27) and its question is closed — stored, so it stays closed.
    const open = openFollowup(rows);
    if (open) updateItem(open.rowId, open.index, (it) => ({ ...it, ask_skipped: true }));
    setBusy(true);
    const context = recentForParse(getFoodLogsSince(userId, day) || [], day);
    ensureFreeStart(userId); // the free days' anchor: the real day of first use (FL-41)
    const id = insertFoodLog({ user_id: userId, entry_date: day, raw_text: raw, parse_status: 'pending' });
    Analytics.foodLogged('typed');
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
      // An advice question is not food: nothing is saved and the box stays empty, as after any
      // sent message (S25 2026-11-07: the refused question stayed in the box). Only the fixed
      // deflection card shows (FL-15).
      deleteFoodLog(id); requestSync?.(); refresh(userId);
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
      announceLogged(keep, raw); // FR-9: the receipt is the echo; a screen reader still hears it
      if (outcome.notice === 'too_old_some') { setText(outcome.putBack); setNotice({ kind: 'too_old_some' }); return; }
      // FR-12: an open follow-up asks first; otherwise the goodbye (never a question right away).
      if (!askKept) sayBye(day, r);
      return;
    }
    // "Saved — I'll estimate it when you're back online" ONLY when actually offline;
    // any other failure: saved, tried again later (FL-46).
    const fail = sendFailureNotice(res, isOnlineNow());
    if (fail === 'quota' || fail === 'ceiling') {
      // DV-213: the day's limit, or the 24-hour ceiling with the time a call frees up; the text goes back.
      deleteFoodLog(id); requestSync?.(); refresh(userId);
      setText(raw);
      setNotice(fail === 'ceiling' ? { kind: 'ceiling', at: res.retryAt || null } : { kind: 'quota' });
    } else {
      setNotice({ kind: fail, rowId: id });
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
      // DV-213 (AD-105): a refused answer says why (it was dropped in silence).
      else if (outcome === 'limit') setNotice({ kind: 'followup_limit' });
      else if (outcome === 'ceiling') setNotice({ kind: 'ceiling', at: res.retryAt || null });
    } else {
      // FR-9: the updated receipt is the echo (no "Updated" bubble under it); a screen reader hears it.
      announceLogged([storedItem(open.rowId, open.index) || res.items[0]], open.raw || rawOfRows([open.rowId]));
    }
    requestSync?.();
    setFuText('');
    clearDraft(fuDraftKey(open));
    const r = refresh(userId);
    sayBye(open.entry_date, r); // FR-12: after a follow-up answer, the goodbye
  }

  function skipFollowup(open) {
    touch();
    updateItem(open.rowId, open.index, (it) => ({ ...it, ask_skipped: true })); // stays an estimate (FL-27)
    requestSync?.();
    setFuText('');
    clearDraft(fuDraftKey(open));
    sayBye(open.entry_date, refresh(userId));
  }

  function confirmRemove(rowId, status) {
    if (inFlight.has(rowId)) return;
    alert(t('nutri_title'), t(status === 'pending' ? 'nutri_offline_saved' : status === 'quota_wait' ? 'nutri_quota_wait_note' : 'nutri_unparsed'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('nutri_delete_entry'), style: 'destructive', onPress: () => { deleteFoodLog(rowId); requestSync?.(); refresh(userId); } },
    ]);
  }
  function removeRow(rowId) { deleteFoodLog(rowId); requestSync?.(); refresh(userId); }
  // DV-226 / AD-01: the Remove entry pill under a refused or too-old message asks first (the
  // user's typed text); only the sheet's Remove entry deletes it.
  function confirmRemoveRow(rowId) {
    if (inFlight.has(rowId)) return; // being read right now (same guard as confirmRemove)
    alert(t('nutri_delete_confirm'), null, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('nutri_delete_entry'), style: 'destructive', onPress: () => removeRow(rowId) },
    ]);
  }

  // ── Thread ─────────────────────────────────────────────────────
  const closedSet = useMemo(() => closedDays(rows), [rows]);
  const eveningOpen = evening && !closedSet.has(evening);
  const thread = useMemo(() => {
    const th = buildThread(rows, {
      todayISO: today,
      sinceISO: localDaysAgoISO(THREAD_DAYS - 1),
      bye: bye && !closedSet.has(bye.day) && !busy ? bye : null,
      evening: eveningOpen ? evening : null,
    });
    // Today starts with the app's invitation (FL-1) until something is typed.
    const lastDiv = th.map((x) => x.type).lastIndexOf('divider');
    if (lastDiv >= 0 && th[lastDiv].day === today && !th.slice(lastDiv).some((x) => x.type === 'user')) th.splice(lastDiv + 1, 0, { type: 'intro', key: 'intro:' + today });
    // A-133: the notice goes before the next prompt (live order = the order on reopen).
    // A-133: an Updated notice whose row was removed is stale and goes (liveNotice).
    // FR-10: today's total is no longer a line in the thread — it is the fixed panel on top.
    const live = withNotice(th, liveNotice(notice ? { type: 'notice', key: 'notice', ...notice } : null, rows));
    // MR-11: the meal a reminder's Log opened the chat for, asked last — until something is logged
    // after it was asked (the answer) or the day closes.
    const answered = mealAsk && (rows || []).some((r) => r && !isMarker(r) && String(r.created_at || '') >= mealAsk.since);
    if (mealAsk && !answered && !closedSet.has(mealAsk.day) && !busy) live.push({ type: 'mealAsk', key: 'mealAsk', meal: mealAsk.meal });
    if (busy || fuBusy) live.push({ type: 'typing', key: 'typing' });
    return live;
  }, [rows, today, bye, closedSet, eveningOpen, evening, mealAsk, notice, busy, fuBusy]);
  // FR-10: today's total, fixed on top (null until something is read today).
  const dayTot = useMemo(() => dayFoodTotal(rows, today), [rows, today]);
  // FR-1/FR-2: the recent meals for the row above the field, in the order of the time of day.
  const minute = Math.floor(now / 60000);
  const recent = useMemo(() => recentMeals(rows, { todayISO: today, now: new Date(minute * 60000), language }), [rows, today, minute, language]);
  const data = useMemo(() => thread.slice().reverse(), [thread]); // inverted list opens at the latest (FL-39)
  // PA-7: the entry just logged = the latest of today's entries; it carries "+N g protein in your day".
  const lastTodayEntry = useMemo(() => {
    let key = null;
    for (const x of thread) if (x.type === 'entry' && x.entry_date === today) key = x.key;
    return key;
  }, [thread, today]);

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
  const inFreeDays = access && access.mode === 'free_days';
  const freeLeft = inFreeDays && access.freeDaysLeft != null ? access.freeDaysLeft : 0;

  // ── Bubbles (Graduated, prototype chatScreen: .bub.app / .bub.user / .entry / .deflect) ──
  const AppBubble = ({ children, style }) => <View style={[s.app, style]}>{children}</View>;
  // A short answer chip (prototype .pill); `on` = the suggested one (ink outline).
  const Pill = ({ label, onPress, on, disabled }) => (
    <TouchableOpacity style={[s.pill, on && s.pillOn]} onPress={onPress} disabled={disabled} accessibilityRole="button">
      <Text style={[s.pillText, on && s.pillTextOn]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
  // FR-8: the time a receipt was logged, in the user's 12/24 h choice.
  const clock = (ms) => {
    const d = ms ? new Date(ms) : null;
    if (!d || Number.isNaN(d.getTime())) return null;
    return formatTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, language, timeFormat);
  };

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
          <TouchableOpacity activeOpacity={x.status === 'done' || x.status === 'too_old' ? 1 : 0.7} disabled={x.status === 'done' || x.status === 'too_old'} onPress={() => confirmRemove(x.rowId, x.status)} style={s.userWrap}>
            <View style={s.user}><Text style={s.userText}>{x.text}</Text></View>
            {/* A row being read right now is not "saved offline" (FL-46). */}
            {pendingNoteShown(x, notice) && x.rowId !== sendingId && <Text style={s.userNote}>{t(isOnlineNow() === false ? 'nutri_offline_saved' : 'nutri_retry_later')}</Text>}
            {x.status === 'unparsed' && <Text style={[s.userNote, s.userNoteWarn]}>{t('nutri_unparsed')}</Text>}
            {/* DV-066: the day's reads were used up; read on a later day, the text kept. */}
            {x.status === 'quota_wait' && <Text style={[s.userNote, s.userNoteWarn]}>{t('nutri_quota_wait_note')}</Text>}
          </TouchableOpacity>
        );
      case 'quota_wait':
        // DV-066 (DL-28): said once per day, under the first item the limit held back.
        return (
          <AppBubble><Text style={s.appText}>{t('nutri_quota_wait')}</Text></AppBubble>
        );
      case 'too_old':
        return (
          <AppBubble>
            <Text style={s.appText}>{t('nutri_too_old')}</Text>
            <View style={s.chips}>
              <Pill label={t('nutri_delete_entry')} onPress={() => confirmRemoveRow(x.rowId)} />
            </View>
          </AppBubble>
        );
      case 'refused':
        return (
          <View style={s.deflect}>
            <Text style={s.deflectTitle}>{t('nutri_deflect_title')}</Text>
            <Text style={s.deflectBody}>{t('nutri_deflect_body')}</Text>
            <View style={s.chips}>
              <Pill label={t('nutri_delete_entry')} onPress={() => confirmRemoveRow(x.rowId)} />
            </View>
          </View>
        );
      case 'entry': {
        // FR-8 (picture registro-comida-visual.html option A): a receipt — names on the left, kcal in a
        // right column, a total line; an estimate is a dotted underline plus "estimate · tap to fix". No
        // per-item category tag (the category is still stored). FR-9: it is also the echo of the entry.
        const est = x.items.some(needsEstimateFlag);
        const time = clock(x.at);
        const head = x.entry_date !== today || !time ? dayLabel(x.entry_date) : t('nutri_receipt_logged').replace('{time}', time);
        const said = echoFor(x.items, x.raw);
        return (
          <TouchableOpacity style={s.rc} activeOpacity={0.75} onPress={() => { touch(); setEditRow(getFoodLogById(x.rowId)); }} accessibilityRole="button" accessibilityLabel={said ? `${t('nutri_echo').replace('{items}', said)} ${t('nutri_edit_title')}` : t('nutri_edit_title')}>
            <View style={s.rcHead}>
              <Text style={s.rcWhen} numberOfLines={1}>{head}</Text>
              <Text style={s.rcWhen}>{t('cal_kcal')}</Text>
            </View>
            {x.items.map((it, i) => {
              const flag = needsEstimateFlag(it);
              return (
                <View key={i} style={s.ln}>
                  <View style={s.lnFoodBox}><View style={[s.lnEstWrap, flag && s.lnEstBox]}><Text style={s.lnFood}>{itemLabel(it, language, x.raw)}</Text></View></View>
                  <Text style={s.lnKcal}>{`${flag ? '~' : ''}${formatInt(Math.round(Number(it.kcal) || 0), language)}`}</Text>
                </View>
              );
            })}
            <View style={s.tot}>
              <Text style={s.totK}>{`${est ? '~' : ''}${formatInt(Math.round(Number(x.kcal) || 0), language)} ${t('cal_kcal')}`}</Text>
              {/* FW-4: the fiber stays on the entry's line when it is known. */}
              <Text style={s.totM}>{`${Math.round(x.carb_g || 0)} g ${t('nutri_carbs')} · ${Math.round(x.protein_g || 0)} g ${t('nutri_protein')}${x.fiber_g != null ? ` · ${Math.round(x.fiber_g)} g ${t('nutri_fiber')}` : ''}`}</Text>
            </View>
            {x.key === lastTodayEntry && addedProtein(x) != null ? <Text style={s.entryAdded}>{t('pa_added_protein').replace('{n}', formatInt(addedProtein(x), language))}</Text> : null}
            {est ? <Text style={s.estn}>{t('nutri_estimate')}</Text> : null}
          </TouchableOpacity>
        );
      }
      case 'asked':
        // One root view: an inverted list lays out a cell's children in reverse,
        // so a fragment showed the answer above the question.
        return (
          <View>
            <AppBubble><Text style={s.appText}>{t(`nutri_ask_${x.kind}`).replace('{food}', foodCase(x.food, x.raw, language).slice(0, 60))}</Text></AppBubble>
            <View style={s.userWrap}><View style={s.user}><Text style={s.userText}>{x.answer}</Text></View></View>
          </View>
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
            <Text style={s.appText}>{t(`nutri_ask_${x.kind}`).replace('{food}', foodCase(x.item.food, x.raw, language).slice(0, 60))}</Text>
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
            {/* FR-11: the quick answers, the typed answer and Skip — no "That's all for today" here. */}
            <View style={s.fuFoot}>
              <TouchableOpacity onPress={() => skipFollowup(x)} disabled={fuBusy} style={s.linkHit} accessibilityRole="button">
                <Text style={s.link}>{t('nutri_ask_skip')}</Text>
              </TouchableOpacity>
            </View>
          </AppBubble>
        );
      case 'bye':
        // FR-12: the human goodbye after an entry (replaces the question right after each entry, FL-4).
        return (
          <AppBubble>
            <Text style={s.appText}>{byeText(x)}</Text>
          </AppBubble>
        );
      case 'mealAsk':
        return (
          <AppBubble>
            <Text style={s.appText}>{mealChatAsk(t, x.meal, language, timeFormat)}</Text>
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
            : x.kind === 'ceiling' ? t('nutri_ceiling').replace('{time}', ceilingTime(x.at))
            : x.kind === 'followup_limit' ? t('nutri_followup_limit')
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
  const edges = embedded ? ['left', 'right'] : TAB_SCREEN_EDGES; // above the glass bar, which clears the system bar
  return (
    <SafeAreaView style={s.container} edges={edges}>
      <View style={s.header} {...headerSwipe.panHandlers}>
        {/* FR-14: the handle shows that pulling the title bar down closes the chat (a tab page has none). */}
        {embedded ? null : <View style={s.grab} />}
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
            <TouchableOpacity style={s.cta} onPress={() => navigation.navigate('Paywall', { source: 'food_chat_locked' })} accessibilityRole="button">
              <Text style={s.ctaText}>{t('nutri_locked_cta')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <KeyboardAvoidingView style={s.flex} behavior="padding" keyboardVerticalOffset={0} onTouchStart={touch}>
          {access && (access.reason === 'premium_ended' || access.reason === 'free_days_ending') && (
            <FoodGraceNote rcStart={rcStart} until={access.until} reason={access.reason} freeFrom={access.freeFrom} rows={rows} style={s.graceNote} />
          )}
          {/* FR-10: today's total, fixed on top — kcal large, a ruler, carbs · protein and fiber (FW-9: fiber
              only when known). PA-7: with a plan, "Today · your plan" and the three bars; PA-8: no plan → the
              numbers and the way to set one. Not a line inside the thread any more. */}
          {dayTot ? <View style={s.band}>{plan ? (
            <View style={s.gauge} accessibilityRole="summary">
              <Text style={s.gHead}>{t('pa_today_plan')}</Text>
              <PlanBars rows={todayBars(dayTot, plan)} />
              {dayTot.fiber_g != null ? <Text style={s.gSub}>{`${Math.round(dayTot.fiber_g)} g ${t('nutri_fiber')}`}</Text> : null}
            </View>
          ) : (
            <View style={s.gauge} accessible accessibilityRole="summary" accessibilityLabel={`${t('nutri_today')}: ${formatInt(dayTot.kcal, language)} ${t('cal_kcal')}, ${dayTot.carb_g} g ${t('nutri_carbs')}, ${dayTot.protein_g} g ${t('nutri_protein')}${dayTot.fiber_g != null ? `, ${Math.round(dayTot.fiber_g)} g ${t('nutri_fiber')}` : ''}`}>
              <View style={s.gLine}>
                <Text style={s.gHead}>{t('nutri_today')}</Text>
                <Text style={s.gK}>{`${formatInt(dayTot.kcal, language)} ${t('cal_kcal')}`}</Text>
              </View>
              <View style={s.ticks}>{Array.from({ length: 11 }, (_, i) => <View key={i} style={s.tick} />)}</View>
              <View style={s.gLineWrap}>
                <Text style={s.gSub}>{`${dayTot.carb_g} g ${t('nutri_carbs')} · ${dayTot.protein_g} g ${t('nutri_protein')}`}</Text>
                {dayTot.fiber_g != null ? <Text style={s.gSub}>{`${Math.round(dayTot.fiber_g)} g ${t('nutri_fiber')}`}</Text> : null}
              </View>
              <Text style={s.gNoPlan}>{t('pa_no_plan')}</Text>
            </View>
          )}</View> : null}
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
          {/* FR-5: one tap logged a recent meal — "Undo" for a few seconds (the normal delete). */}
          {undo ? (
            <View style={s.band}>
              <View style={s.toast} accessibilityLiveRegion="polite">
                <Text style={s.toastText} numberOfLines={2}>{t('nutri_recent_logged').replace('{meal}', undo.label)}</Text>
                <TouchableOpacity onPress={undoRepeat} style={s.toastHit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
                  <Text style={s.toastUndo}>{t('nutri_undo')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          <View style={s.composer}>
            {/* FR-1..FR-3 (picture refeicoes-recentes.html v2): a fixed row of recent meal NAMES above the
                field, in the order of the time of day; hidden until the first meal is logged. The "i" explains it. */}
            {recent.length > 0 && (
              <View style={s.recent}>
                <View style={s.recentHead}>
                  <Text style={s.recentLabel} numberOfLines={1}>{t('nutri_recent_label')}</Text>
                  <TouchableOpacity onPress={openRecentInfo} style={s.infoHit} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={t('nutri_recent_info')}>
                    <FeatureIcon name="info" size={16} color={colors.ink3} />
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.recentRow}>
                  {recent.map((m) => (
                    <TouchableOpacity key={m.key} style={s.recentChip} onPress={() => repeatMeal(m)} disabled={busy || fuBusy} accessibilityRole="button" accessibilityLabel={m.label} accessibilityHint={t('nutri_recent_hint')}>
                      <Text style={s.recentChipText} numberOfLines={1}>{m.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
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
            {/* FR-13: the AI notice stays, on one smaller line. */}
            <Text style={s.caveat} numberOfLines={2}>{t('nutri_est_note')}{inFreeDays && freeLeft > 0 ? '  ·  ' + t(pluralKey('nutri_free_note', freeLeft, language)).replace('{n}', String(freeLeft)) : ''}</Text>
          </View>
        </KeyboardAvoidingView>
      )}

      <DTSheet config={chatSheet} onClose={closeChatSheet} />

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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.ground },
  // FR-14 (prototype .grab): the handle on top of the title bar.
  grab: { position: 'absolute', top: 6, left: '50%', marginLeft: -18, width: 36, height: 4, borderRadius: 2, backgroundColor: c.line },
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
  // FR-8 (picture registro-comida-visual.html option A, .rc / .ln / .tot / .estn): the receipt.
  rc: { alignSelf: 'stretch', backgroundColor: c.raised, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11, marginVertical: 5, gap: 2 },
  rcHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 2 },
  rcWhen: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '500', color: c.ink3, letterSpacing: 0.5, textTransform: 'uppercase' },
  ln: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingVertical: 2 },
  lnFoodBox: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  lnEstWrap: { maxWidth: '100%' },
  lnFood: { fontSize: 16, lineHeight: 21, color: c.ink },
  // FR-8: dotted underline drawn as a border (text decoration styles are iOS-only).
  lnEstBox: { borderBottomWidth: 1.5, borderStyle: 'dotted', borderColor: c.attention },
  lnKcal: { fontFamily: MONO['500'], fontSize: 15, lineHeight: 21, color: c.ink2, fontVariant: ['tabular-nums'] },
  tot: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, borderTopWidth: 1, borderTopColor: c.line, marginTop: 4, paddingTop: 7 },
  totK: { fontFamily: MONO['500'], fontSize: 16, lineHeight: 21, fontWeight: '600', color: c.ink, fontVariant: ['tabular-nums'] },
  totM: { fontFamily: MONO['500'], fontSize: 13, lineHeight: 18, color: c.ink2, fontVariant: ['tabular-nums'] },
  estn: { fontSize: 13, lineHeight: 18, color: c.attention, marginTop: 4 },
  // PA-7: "+N g protein in your day" on the latest entry.
  entryAdded: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: c.data, marginTop: 4, fontVariant: ['tabular-nums'] },
  // FR-10 (picture option A, .gauge / .ticks): today's total, fixed on top with a ruler.
  band: { paddingHorizontal: 16 },
  gauge: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', marginTop: 10, marginBottom: 2, backgroundColor: c.raised, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  gLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  // German "Ballaststoffe" (recording 2026-11-26): the carbs · protein / fiber row wraps instead of running past the card.
  gLineWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: 10, rowGap: 2 },
  gHead: { fontSize: 12, fontWeight: '600', color: c.ink2, letterSpacing: 0.5, textTransform: 'uppercase' },
  gK: { fontFamily: MONO['500'], fontSize: 20, lineHeight: 26, fontWeight: '600', color: c.ink, fontVariant: ['tabular-nums'] },
  gSub: { fontFamily: MONO['500'], fontSize: 13, lineHeight: 18, color: c.ink2, fontVariant: ['tabular-nums'] },
  gNoPlan: { fontSize: 12, lineHeight: 16, color: c.ink2 },
  ticks: { flexDirection: 'row', justifyContent: 'space-between', height: 8, borderBottomWidth: 1, borderBottomColor: c.tick, opacity: 0.55 },
  tick: { width: 1, height: 8, backgroundColor: c.tick },
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
  composer: { borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.ground, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 },
  // FR-1 (picture refeicoes-recentes.html v2, .rhead / .ibtn / .chips): the recent meals row.
  recent: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', marginBottom: 8, gap: 6 },
  recentHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recentLabel: { flexShrink: 1, fontSize: 12, lineHeight: 16, color: c.ink2 },
  infoHit: { minHeight: 24, minWidth: 24, alignItems: 'center', justifyContent: 'center' },
  recentRow: { gap: 6, paddingRight: 8 },
  recentChip: { minHeight: 36, maxWidth: 240, borderRadius: 18, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.raised, paddingHorizontal: 12, justifyContent: 'center' },
  recentChipText: { fontSize: 14, color: c.ink },
  // FR-5 (picture .toast): "Logged: … · Undo" in the one ink action colour.
  toast: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', marginBottom: 8, borderRadius: 14, backgroundColor: c.act, paddingHorizontal: 14, paddingVertical: 10 },
  toastText: { flex: 1, fontSize: 14, lineHeight: 19, color: c.onAct },
  toastHit: { minHeight: 32, justifyContent: 'center' },
  toastUndo: { fontSize: 14, fontWeight: '700', color: c.onAct, textDecorationLine: 'underline', textDecorationColor: c.onAct },
  logDayChip: { alignSelf: 'flex-start', minHeight: 36, borderRadius: 18, borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.raised, paddingHorizontal: 13.5, justifyContent: 'center', marginBottom: 8 },
  logDayText: { fontSize: 13, fontWeight: '600', color: c.ink },
  field: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  input: { flex: 1, minHeight: 46, maxHeight: 120, backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: 23, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 17, color: c.ink },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center' },
  // Disabled = well + ink3 (readable, clearly inactive), never a faded fill.
  caveat: { fontSize: 11, lineHeight: 14, fontWeight: '500', color: c.ink2, textAlign: 'center', marginTop: 5, paddingBottom: 4 },
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
