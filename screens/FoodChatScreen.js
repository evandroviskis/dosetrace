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
  KeyboardAvoidingView, Keyboard, AppState, AccessibilityInfo, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { requestSync, isOnlineNow } from '../lib/sync';
import { getFoodLogsSince, insertFoodLog, deleteFoodLog, getFoodLogById } from '../lib/database';
import { parseFood, parseFollowup } from '../lib/nutritionClient';
import {
  closedDays, CATEGORIES, catchUpOutcome, isDoneText, isNoText, mustAskWhichEarlier, itemLabel, needsEstimateFlag, echoParts, recentForParse,
} from '../lib/nutrition';
import { buildThread, threadQuestion, openFollowup, shouldAutoClose, dayWord, sendFailureNotice } from '../lib/foodThread';
import { saveParsed, updateItem, applyAnswer, catchUpFood, rememberTypedHere, inFlight, loadFoodAccess } from '../lib/foodLogActions';
import FoodGraceNote from './components/FoodGraceNote';
import { requestAIConsent } from '../lib/aiConsent';
import { localISO, localDaysAgoISO } from '../lib/localDate';
import { syncFoodLogReminder, closeFoodDay } from '../lib/notifications';
import FeatureIcon from '../components/FeatureIcon';
import FoodEntryEditor from './components/FoodEntryEditor';

const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };
// Per-device conveniences (not user data): today's asked questions (+ the one on
// screen) and the unsent draft (FL-36, per user).
const ASKED_KEY = 'dosetrace_food_asked';
const draftKey = (uid) => `dosetrace_food_draft:${uid}`;
const THREAD_DAYS = 7; // typed days shown in the thread

export default function FoodChatScreen() {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const s = makeStyles(colors);
  const locale = LOCALE_MAP[language] || 'en-US';

  const [userId, setUserId] = useState(null);
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
  const [editRow, setEditRow] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
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
    try {
      const raw = await AsyncStorage.getItem(ASKED_KEY);
      const v = raw ? JSON.parse(raw) : null;
      askedRef.current = v && v.day === localISO() && Array.isArray(v.ids) ? { current: null, ...v } : { day: localISO(), ids: [], current: null };
    } catch { askedRef.current = { day: localISO(), ids: [], current: null }; }
    if (!uid) { setLoaded(true); return; }
    // The draft / put-back text survives closing the chat (FL-36).
    try { const d = await AsyncStorage.getItem(draftKey(uid)); if (d) setText((cur) => cur || d); } catch { /* ignore */ }
    const r = refresh(uid);
    // Resume the question that was on screen (FL-32), if it still applies.
    const cur = askedRef.current.current;
    if (cur && askedRef.current.day === localISO() && !closedDays(r).has(localISO())) setQuestion(cur);
    setLoaded(true);
    // Offline rows and offline follow-up answers catch up now (FL-19/28).
    const { changed, updatedItems } = await catchUpFood(uid, language);
    if (changed) refresh(uid);
    const e = echoFor(updatedItems);
    if (e) setNotice({ kind: 'updated', text: e });
  }

  // Route params: the 8 PM question (FL-18/40) or "Log it".
  const eveningParam = route?.params?.eveningDay;
  const eveningNonce = route?.params?.nonce;
  const logItNonce = route?.params?.logIt;
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
  guardRef.current = { text, sending: busy, followupBusy: fuBusy, modalOpen: !!editRow || consentOpen, alertOpen, screenReader, keyboardVisible };
  useEffect(() => {
    const tick = setInterval(() => {
      setNow(Date.now()); // a midnight crossing re-dates the thread (divider)
      if (shouldAutoClose({ ...guardRef.current, idleMs: Date.now() - lastTouch.current }, 'idle') && navigation.canGoBack()) navigation.goBack();
    }, 5000);
    const kShow = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => { setKeyboardVisible(true); touch(); });
    const kHide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => { setKeyboardVisible(false); touch(); });
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader).catch(() => {});
    const sr = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    const app = AppState.addEventListener('change', (st) => {
      if (st === 'active') { touch(); return; }
      saveDraftNow(guardRef.current.text);
      if (st === 'background' && shouldAutoClose(guardRef.current, 'background') && navigation.canGoBack()) navigation.goBack();
    });
    return () => { clearInterval(tick); kShow.remove(); kHide.remove(); sr?.remove?.(); app.remove(); };
  }, [navigation]);
  // Swipe-down is the user's choice — but never while a message is being sent.
  useEffect(() => { navigation.setOptions({ gestureEnabled: !busy && !fuBusy }); }, [busy, fuBusy, navigation]);
  useEffect(() => () => { saveDraftNow(guardRef.current.text); }, [userId]);

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
    const list = shown.map((it) => `${itemLabel(it)} · ~${Math.round(Number(it.kcal) || 0)} ${t('cal_kcal')}`).join(', ');
    return more ? `${list} ${t('nutri_echo_more').replace('{n}', String(more))}` : list;
  }

  // ── Day label / naming (FL-40) ─────────────────────────────────
  function dayLabel(dateISO) {
    const w = dayWord(dateISO, today);
    if (w === 'today') return t('nutri_day_today');
    if (w === 'yesterday') return t('nutri_day_yesterday');
    const d = new Date(dateISO + 'T12:00:00');
    return isNaN(d) ? dateISO : d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // ── Close a day (FL-29 / FL-18) ────────────────────────────────
  async function closeDay(dayKey) {
    const uid = userId || (await getCachedUser())?.id || null;
    if (!uid) return;
    const ok = await closeFoodDay(dayKey, uid);
    if (!ok) { alert(t('error'), t('error_save_failed')); return; }
    const open = openFollowup(rows);
    if (open) updateItem(open.rowId, open.index, (it) => ({ ...it, ask_skipped: true })); // stays an estimate
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
    const r = refresh(userId);
    if (open.entry_date === localISO() || outcome === 'applied') askNext(r);
  }

  function skipFollowup(open) {
    touch();
    updateItem(open.rowId, open.index, (it) => ({ ...it, ask_skipped: true })); // stays an estimate (FL-27)
    requestSync?.();
    setFuText('');
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

  const gated = !!access && !access.canLog;
  const inTrial = access && access.mode === 'trial';
  const freeLeft = inTrial && access.freeDaysLeft != null ? access.freeDaysLeft : 0;

  // ── Bubbles ────────────────────────────────────────────────────
  const AppBubble = ({ children, style }) => <View style={[s.app, style]}>{children}</View>;
  const doneChip = (day) => (
    <TouchableOpacity style={s.chip} onPress={() => closeDay(day)} accessibilityRole="button">
      <Text style={s.chipText}>{t('nutri_day_done_btn')}</Text>
    </TouchableOpacity>
  );

  function renderItem({ item: x }) {
    switch (x.type) {
      case 'divider':
        return <View style={s.divider}><View style={s.divLine} /><Text style={s.divText}>{dayLabel(x.day)}</Text><View style={s.divLine} /></View>;
      case 'intro':
        return <AppBubble><Text style={s.appText}>{t('nutri_intro')}</Text></AppBubble>;
      case 'user':
        return (
          <TouchableOpacity activeOpacity={x.status === 'done' || x.status === 'too_old' ? 1 : 0.7} disabled={x.status === 'done' || x.status === 'too_old'} onPress={() => confirmRemove(x.rowId, x.status === 'pending')} style={s.userWrap}>
            <View style={s.user}><Text style={s.userText}>{x.text}</Text></View>
            {/* A row being read right now is not "saved offline" (FL-46). */}
            {x.status === 'pending' && x.rowId !== sendingId && <Text style={s.userNote}>{t(isOnlineNow() === false ? 'nutri_offline_saved' : 'nutri_retry_later')}</Text>}
            {x.status === 'unparsed' && <Text style={s.userNote}>{t('nutri_unparsed')}</Text>}
          </TouchableOpacity>
        );
      case 'too_old':
        return (
          <AppBubble>
            <Text style={s.appText}>{t('nutri_too_old')}</Text>
            <TouchableOpacity style={s.chip} onPress={() => removeRow(x.rowId)} accessibilityRole="button">
              <Text style={s.chipText}>{t('nutri_delete_entry')}</Text>
            </TouchableOpacity>
          </AppBubble>
        );
      case 'refused':
        return (
          <View style={s.deflect}>
            <Text style={s.deflectTitle}>{t('nutri_deflect_title')}</Text>
            <Text style={s.deflectBody}>{t('nutri_deflect_body')}</Text>
            <TouchableOpacity style={s.deflectRemove} onPress={() => removeRow(x.rowId)} accessibilityRole="button">
              <Text style={s.deflectRemoveText}>{t('nutri_delete_entry')}</Text>
            </TouchableOpacity>
          </View>
        );
      case 'entry':
        return (
          <TouchableOpacity style={s.entry} activeOpacity={0.75} onPress={() => { touch(); setEditRow(getFoodLogById(x.rowId)); }} accessibilityRole="button" accessibilityLabel={t('nutri_edit_title')}>
            {x.entry_date !== today && <Text style={s.entryDay}>{dayLabel(x.entry_date)}</Text>}
            {x.items.map((it, i) => (
              <View key={i} style={s.entryItem}>
                <View style={s.entryRow}>
                  <Text style={s.entryFood}>{itemLabel(it)} · ~{Math.round(it.kcal || 0)} {t('cal_kcal')}</Text>
                  {CATEGORIES.includes(it.category) && <Text style={s.catChip}>{t(`nutri_cat_${it.category}`)}</Text>}
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
                  <TouchableOpacity key={i} style={s.optChip} disabled={fuBusy} onPress={() => answerFollowup(x, String(o).slice(0, 40))}>
                    <Text style={s.optChipText} numberOfLines={1}>{String(o).slice(0, 40)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={s.fuField}>
              <TextInput
                style={s.fuInput}
                value={fuText}
                onChangeText={(v) => { setFuText(v); touch(); }}
                placeholder={t('nutri_ask_placeholder')}
                placeholderTextColor={colors.textFaint}
                editable={!fuBusy}
                returnKeyType="send"
                onSubmitEditing={() => answerFollowup(x, fuText)}
                maxLength={200}
              />
              <TouchableOpacity style={[s.fuSend, (!fuText.trim() || fuBusy) && s.off]} disabled={!fuText.trim() || fuBusy} onPress={() => answerFollowup(x, fuText)}>
                <Text style={s.fuSendText}>{t('nutri_ask_send')}</Text>
              </TouchableOpacity>
            </View>
            <View style={s.fuFoot}>
              <TouchableOpacity onPress={() => skipFollowup(x)} disabled={fuBusy} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.link}>{t('nutri_ask_skip')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => closeDay(x.entry_date)} disabled={fuBusy} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
              <TouchableOpacity style={s.primaryChip} onPress={() => { setEvening(null); setLogDay(w === 'today' ? null : x.day); setTimeout(() => inputRef.current?.focus?.(), 50); }}>
                <Text style={s.primaryChipText}>{t('notif_food_action_log')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.chip} onPress={() => closeDay(x.day)}>
                <Text style={s.chipText}>{w === 'today' ? t('notif_food_action_done') : t('nutri_evening_done_day')}</Text>
              </TouchableOpacity>
              {w === 'today' && (
                <TouchableOpacity style={s.chip} onPress={() => setEvening(null)}>
                  <Text style={s.chipText}>{t('nutri_evening_later')}</Text>
                </TouchableOpacity>
              )}
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
            <ActivityIndicator size="small" color={colors.textMuted} accessibilityLabel={t('nutri_typing')} />
          </AppBubble>
        );
      default:
        return null;
    }
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.header}>
        <View style={s.grabber} />
        <View style={s.headRow}>
          <View style={s.headTitleRow}>
            <FeatureIcon name="ai_spark" size={16} color={colors.accent} />
            <Text style={s.headTitle}>{t('nutri_ai_badge')}</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.goBack()} disabled={busy || fuBusy} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button">
            <Text style={[s.headDone, (busy || fuBusy) && s.off]}>{t('done')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {gated ? (
        <View style={s.locked}>
          <Text style={s.lockedTitle}>{t('nutri_locked_title')}</Text>
          <Text style={s.lockedSub}>{t('nutri_locked_sub')}</Text>
          <TouchableOpacity style={s.cta} onPress={() => navigation.navigate('Paywall')}>
            <Text style={s.ctaText}>{t('nutri_locked_cta')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAvoidingView style={s.flex} behavior="padding" keyboardVerticalOffset={0} onTouchStart={touch}>
          {access && (access.reason === 'premium_ended' || access.reason === 'free_days_ending') && (
            <FoodGraceNote rcStart={rcStart} until={access.until} reason={access.reason} rows={rows} style={s.graceNote} />
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
                placeholderTextColor={colors.textFaint}
                multiline
                editable={!busy}
              />
              <TouchableOpacity style={[s.send, (busy || !text.trim()) && s.off]} onPress={onSubmit} disabled={busy || !text.trim()} accessibilityRole="button" accessibilityLabel={t('nutri_send')}>
                {busy ? <ActivityIndicator size="small" color={colors.accentText} /> : <FeatureIcon name="ai_spark" size={18} color={colors.accentText} />}
              </TouchableOpacity>
            </View>
            <Text style={s.caveat}>{t('nutri_est_note')}{inTrial && freeLeft > 0 ? '  ·  ' + t('nutri_free_note').replace('{n}', String(freeLeft)) : ''}</Text>
          </View>
        </KeyboardAvoidingView>
      )}

      <FoodEntryEditor row={editRow} onClose={() => { setEditRow(null); touch(); }} onSaved={() => refresh(userId)} />
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  flex: { flex: 1 },
  header: { backgroundColor: c.card, borderBottomWidth: 0.5, borderBottomColor: c.border, paddingBottom: 10 },
  grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: c.border, marginTop: 6, marginBottom: 6 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  headTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headTitle: { fontSize: 16, fontWeight: '800', color: c.text },
  headDone: { fontSize: 15, fontWeight: '700', color: c.accent },
  list: { paddingHorizontal: 14, paddingVertical: 12, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10 },
  divLine: { flex: 1, height: 0.5, backgroundColor: c.border },
  divText: { fontSize: 11, fontWeight: '700', color: c.textFaint, textTransform: 'uppercase', letterSpacing: 0.4 },
  app: { alignSelf: 'flex-start', maxWidth: '88%', backgroundColor: c.card, borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 13, paddingVertical: 10, marginVertical: 4, borderWidth: 0.5, borderColor: c.border },
  appText: { fontSize: 14.5, color: c.text, lineHeight: 20 },
  typing: { paddingVertical: 12, paddingHorizontal: 18 },
  userWrap: { alignSelf: 'flex-end', maxWidth: '85%', marginVertical: 4, alignItems: 'flex-end' },
  user: { backgroundColor: c.accent, borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 13, paddingVertical: 9 },
  userText: { fontSize: 14.5, color: c.accentText, lineHeight: 20 },
  userNote: { fontSize: 11, color: c.textMuted, marginTop: 3, textAlign: 'right' },
  entry: { alignSelf: 'flex-start', width: '88%', backgroundColor: c.card2, borderRadius: 14, padding: 11, marginVertical: 4, borderWidth: 0.5, borderColor: c.border },
  entryDay: { fontSize: 11, fontWeight: '700', color: c.textMuted, marginBottom: 4 },
  entryItem: { paddingVertical: 2 },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  entryFood: { fontSize: 13, color: c.text, flex: 1 },
  catChip: { fontSize: 10, fontWeight: '700', color: c.accentSoftText, backgroundColor: c.accentSoft, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  estFlag: { fontSize: 11, fontWeight: '600', color: c.warningSoftText, backgroundColor: c.warningSoft, alignSelf: 'flex-start', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, marginTop: 2, overflow: 'hidden' },
  entryTot: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: c.border, marginTop: 6, paddingTop: 6 },
  entryTotText: { fontSize: 13, fontWeight: '800', color: c.text },
  entryMacro: { fontSize: 11.5, fontWeight: '700', color: c.accentSoftText },
  deflect: { alignSelf: 'flex-start', maxWidth: '88%', backgroundColor: c.warningSoft, borderRadius: 14, padding: 13, marginVertical: 4 },
  deflectTitle: { fontSize: 13, fontWeight: '800', color: c.warningSoftText, marginBottom: 4 },
  deflectBody: { fontSize: 12.5, color: c.warningSoftText, lineHeight: 18 },
  deflectRemove: { alignSelf: 'flex-start', marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: c.warningSoftText, paddingHorizontal: 12, paddingVertical: 6 },
  deflectRemoveText: { fontSize: 12.5, fontWeight: '700', color: c.warningSoftText },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { alignSelf: 'flex-start', backgroundColor: c.card2, borderRadius: 16, borderWidth: 0.5, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 7, marginTop: 8 },
  chipText: { fontSize: 12.5, fontWeight: '700', color: c.text },
  primaryChip: { alignSelf: 'flex-start', backgroundColor: c.accent, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, marginTop: 8 },
  primaryChipText: { fontSize: 12.5, fontWeight: '800', color: c.accentText },
  optChip: { backgroundColor: c.accentSoft, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, maxWidth: '100%' },
  optChipText: { fontSize: 13, fontWeight: '700', color: c.accentSoftText },
  fu: { width: '88%' },
  fuField: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  fuInput: { flex: 1, backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: c.text, borderWidth: 0.5, borderColor: c.border },
  fuSend: { backgroundColor: c.accent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  fuSendText: { color: c.accentText, fontWeight: '800', fontSize: 13 },
  fuFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  link: { fontSize: 12.5, fontWeight: '600', color: c.textMuted },
  off: { opacity: 0.4 },
  composer: { borderTopWidth: 0.5, borderTopColor: c.border, backgroundColor: c.card, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 },
  logDayChip: { alignSelf: 'flex-start', backgroundColor: c.accentSoft, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6 },
  logDayText: { fontSize: 12, fontWeight: '700', color: c.accentSoftText },
  field: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  input: { flex: 1, minHeight: 42, maxHeight: 120, backgroundColor: c.bg, borderRadius: 20, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, fontSize: 15, color: c.text, borderWidth: 0.5, borderColor: c.border },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  caveat: { fontSize: 10.5, color: c.textFaint, textAlign: 'center', marginTop: 6 },
  locked: { flex: 1, justifyContent: 'center', padding: 24 },
  graceNote: { marginHorizontal: 14, marginTop: 10 },
  lockedTitle: { fontSize: 17, fontWeight: '800', color: c.text, textAlign: 'center' },
  lockedSub: { fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 19, marginTop: 8, marginBottom: 16 },
  cta: { backgroundColor: c.accent, borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  ctaText: { color: c.accentText, fontWeight: '800', fontSize: 14 },
});
