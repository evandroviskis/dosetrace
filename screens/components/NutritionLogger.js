/**
 * DoseTrace — AI nutrition logger (build 53). Lives in the Journey tab. First 3
 * logged days are free, then Premium (founder decision A).
 *
 * Layout (founder-directed): the AI composer is the pinned hero at the top — it
 * reads as the special AI feature, not a plain field. Under it, the 7-day average
 * + day history are a COLLAPSIBLE detail (the average is only read weekly by the
 * reality-check, so it's out of the way until wanted). Days are grouped, newest
 * first, each expandable.
 *
 * Regulatory (Apple 1.4.1 / SaMD, founder AI hard line): the model returns
 * structured estimates only; this UI renders totals and NEVER model prose. An
 * advice-shaped question → refusal → a fixed deflection card pointing to a
 * professional. Estimates are always framed as estimates (~ / ≈).
 *
 * Acceptance checklist: docs/specs/food-log.md. After each entry ONE question
 * about the rest of today (by missing category, time-aware); the parser's one
 * follow-up is worded HERE from its structured `ask` (the AI never writes a
 * sentence the user sees); "that's it" / "Nothing else today" closes the day
 * with a synced marker row; past days can be marked "not recorded".
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, AccessibilityInfo, Switch } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getCachedUser } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { isPremium } from '../../lib/purchases';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { CONTENT_MAX_WIDTH } from '../../lib/responsive';
import { requestSync } from '../../lib/sync';
import {
  getFoodLogsSince, getFoodLogDayCount, insertFoodLog, updateFoodLog, deleteFoodLog,
  getFoodLogById, insertFoodDayMarker,
} from '../../lib/database';
import { parseFood, parseFollowup } from '../../lib/nutritionClient';
import {
  checkIntake, unloggedCheckDays, splitByDay, foodOnly, closedDays,
  CATEGORIES, pickDayQuestion, isDoneText, isNoText, mustAskWhichEarlier, itemLabel, needsEstimateFlag,
  echoParts, periodTotals, localRowKey, rowsToReparse, recentForParse, applyFollowup, followupStillValid,
} from '../../lib/nutrition';
import { getRealityStart } from '../../lib/realityCheck';
import { requestAIConsent } from '../../lib/aiConsent';
import { localISO, localDaysAgoISO } from '../../lib/localDate';
import { syncFoodLogReminder, closeFoodDay } from '../../lib/notifications';
import FeatureIcon from '../../components/FeatureIcon';
import { CrossMark } from '../../components/CheckMark';

const FREE_DAYS = 3;
// Per-device conveniences (not user data): today's already-asked questions, and
// follow-up answers given offline, retried on focus (FL-28).
const ASKED_KEY = 'dosetrace_food_asked';
const FOLLOWUP_KEY = 'dosetrace_food_followups';
// Rows typed on THIS device while pending (id|created_at). They are parsed once
// back online even after sync gave them a remote_id; a pending row pulled from
// another device is left to that device (FL-19, no double AI read).
const LOCAL_PENDING_KEY = 'dosetrace_food_local_pending';
async function readLocalPending() {
  try { const raw = await AsyncStorage.getItem(LOCAL_PENDING_KEY); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}
async function addLocalPending(key) {
  if (!key) return;
  const list = await readLocalPending();
  if (!list.includes(key)) { try { await AsyncStorage.setItem(LOCAL_PENDING_KEY, JSON.stringify([...list, key].slice(-200))); } catch { /* ignore */ } }
}
const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };
// LOCAL dates (journey-review F1): a UTC date put evening meals on tomorrow.
const todayISO = () => localISO();
const daysAgoISO = (n) => localDaysAgoISO(n);
const safeItems = (json) => { try { const a = JSON.parse(json); return Array.isArray(a) ? a : []; } catch { return []; } };
const numOr = (v, d = 0) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };

// The animated example — used both for the "See how it works" modal (trial users)
// and the locked upsell (post-trial). Respects Reduce Motion (static final frame).
function DemoBody({ s, t, ctaLabel, onCta }) {
  const [typed, setTyped] = useState('');
  const timers = useRef([]);
  useEffect(() => {
    let cancelled = false;
    const full = t('nutri_intro');
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) { setTyped(full); return; }
      const loop = () => {
        setTyped('');
        let i = 0;
        const step = () => {
          if (cancelled) return;
          i += 1; setTyped(full.slice(0, i));
          if (i < full.length) timers.current.push(setTimeout(step, 38));
          else timers.current.push(setTimeout(loop, 3200));
        };
        timers.current.push(setTimeout(step, 500));
      };
      loop();
    });
    return () => { cancelled = true; timers.current.forEach(clearTimeout); timers.current = []; };
  }, [t]);
  return (
    <View style={s.card}>
      <View style={s.demoBubble}><Text style={s.demoBubbleText}>{typed}<Text style={s.caret}>▎</Text></Text></View>
      <View style={s.demoUser}><Text style={s.demoUserText}>{t('nutri_demo_meal')}</Text></View>
      <View style={s.demoBreak}>
        <View style={[s.entryRow, s.entryTot]}>
          <Text style={s.entryTotFood}>≈ 480 {t('cal_kcal')}</Text>
          <Text style={s.entryTotMacro}>55 g {t('nutri_carbs')} · 26 g {t('nutri_protein')}</Text>
        </View>
      </View>
      <Text style={s.lockedTitle}>{t('nutri_locked_title')}</Text>
      <Text style={s.lockedSub}>{t('nutri_locked_sub')}</Text>
      <TouchableOpacity style={s.cta} onPress={onCta} activeOpacity={0.8}>
        <Text style={s.ctaText}>{ctaLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function NutritionLogger() {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const s = makeStyles(colors);
  const locale = LOCALE_MAP[language] || 'en-US';

  const [premium, setPremium] = useState(false);
  const [userId, setUserId] = useState(null);
  const [recent, setRecent] = useState([]);        // last year of rows (food + day markers)
  const [dayCount, setDayCount] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [deflect, setDeflect] = useState(false);
  const [fixHint, setFixHint] = useState(false);
  const [question, setQuestion] = useState(null);             // { id, tense } — the one open question about today
  const [closedMsg, setClosedMsg] = useState(false);          // "All set for today" after closing the day
  const [followup, setFollowup] = useState(null);             // the parser's one follow-up, app-worded (FL-10)
  const [fuText, setFuText] = useState('');
  const [fuBusy, setFuBusy] = useState(false);
  const [fuNote, setFuNote] = useState(false);                // "Saved — I'll update it when you're back online"
  const [evening, setEvening] = useState(null);               // day key of the 20:00 question opened from the reminder
  const [detailOpen, setDetailOpen] = useState(false);  // intake + day history
  const [showDemo, setShowDemo] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [editDate, setEditDate] = useState(null);
  const reparsingRef = useRef(new Set());
  const askedRef = useRef({ day: null, ids: [] }); // questions already asked today (one per gap)
  const drainingRef = useRef(false);
  const inputRef = useRef(null);
  const [foodReminders, setFoodReminders] = useState(true); // same account pref as Settings
  const [rcStart, setRcStart] = useState(null); // open reality check { date, weightKg } or null
  const [echo, setEcho] = useState(null);       // { text, updated } — what was just logged, with quantities
  const [earlierAsk, setEarlierAsk] = useState(false); // "another one" with nothing logged today → the app asks (FL-14)

  useFocusEffect(useCallback(() => { load(); }, []));

  // Opened from the 20:00 reminder: show that evening's question (FL-18).
  const foodAsk = route?.params?.foodAsk || null;
  const foodLogIt = route?.params?.foodLogIt || null;
  useEffect(() => {
    if (!foodAsk) return;
    const day = String(foodAsk).split('|')[0];
    setEvening(/^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayISO());
  }, [foodAsk]);
  useEffect(() => {
    if (!foodLogIt) return;
    const id = setTimeout(() => inputRef.current?.focus?.(), 450);
    return () => clearTimeout(id);
  }, [foodLogIt]);

  async function load() {
    setPremium(await isPremium());
    const user = await getCachedUser();
    const uid = user?.id || null;
    setUserId(uid);
    setFoodReminders(user?.user_metadata?.food_reminders !== false);
    try { setRcStart(await getRealityStart()); } catch { setRcStart(null); }
    try {
      const raw = await AsyncStorage.getItem(ASKED_KEY);
      const v = raw ? JSON.parse(raw) : null;
      const a = v && v.day === todayISO() && Array.isArray(v.ids) ? v : { day: todayISO(), ids: [] };
      askedRef.current = a;
    } catch { askedRef.current = { day: todayISO(), ids: [] }; }
    // Offline entries from ANY recent day get parsed once back online (not just
    // today's) — otherwise they silently count as nothing for the reality check.
    if (uid) {
      const rows = refresh(uid);
      const recentRows = getFoodLogsSince(uid, daysAgoISO(60)) || [];
      const localKeys = await readLocalPending();
      rowsToReparse(recentRows, localKeys).forEach((r) => reparse(r, uid, rows));
      // Forget keys whose rows have resolved (parsed, removed).
      const stillPending = new Set(recentRows.filter((r) => r.parse_status === 'pending').map(localRowKey));
      const kept = localKeys.filter((k) => stillPending.has(k));
      if (kept.length !== localKeys.length) AsyncStorage.setItem(LOCAL_PENDING_KEY, JSON.stringify(kept)).catch(() => {});
      drainFollowups(uid);
    }
  }

  // The 20:00 question can be switched off right where it points to (same
  // account preference as Settings). A failed save reverts the switch.
  async function toggleFoodReminders(val) {
    setFoodReminders(val);
    let error = null;
    try { ({ error } = await supabase.auth.updateUser({ data: { food_reminders: val } })); } catch (e) { error = e; }
    if (error) {
      setFoodReminders(!val);
      Alert.alert(t('error'), friendlyError(error, t, 'error_save_failed'));
      return;
    }
    syncFoodLogReminder().catch(() => {});
  }

  function refresh(uid) {
    if (!uid) return [];
    const rows = getFoodLogsSince(uid, daysAgoISO(366)) || []; // catch-ups may be dated up to a year back
    setRecent(rows);
    setDayCount(getFoodLogDayCount(uid));
    // Every add/edit/delete/close ends here: re-plan the 20:00 question (a
    // closed day cancels tonight's).
    syncFoodLogReminder().catch(() => {});
    return rows;
  }

  // Neutral echo (FL-7/8): up to 3 items with quantity and kcal, then "+N more".
  function echoFor(items) {
    const { shown, more } = echoParts(items, 3);
    if (!shown.length) return null;
    const kcalU = t('cal_kcal');
    const list = shown.map((it) => `${itemLabel(it)} · ~${Math.round(Number(it.kcal) || 0)} ${kcalU}`).join(', ');
    return more ? `${list} ${t('nutri_echo_more').replace('{n}', String(more))}` : list;
  }

  function rememberAsked(id) {
    const prev = askedRef.current;
    const base = prev.day === todayISO() ? prev.ids : [];
    const next = { day: todayISO(), ids: base.includes(id) ? base : [...base, id] };
    askedRef.current = next;
    AsyncStorage.setItem(ASKED_KEY, JSON.stringify(next)).catch(() => {});
  }

  // The next question about today (FL-4), from what is logged for TODAY only.
  function askNext(rows) {
    const today = todayISO();
    const a = askedRef.current;
    const ids = a.day === today ? a.ids : [];
    const q = pickDayQuestion(rows, today, ids, new Date(), closedDays(rows).has(today));
    setQuestion(q);
    if (q) rememberAsked(q.id);
  }

  // Close a local day ("That's all for today", "Nothing else today", or "that's
  // it" typed): a durable synced marker; no AI read, no entry, no hint (FL-29).
  async function closeDay(dayKey) {
    const uid = userId || (await getCachedUser())?.id || null;
    if (!uid) return;
    const ok = await closeFoodDay(dayKey, uid);
    if (!ok) { Alert.alert(t('error'), t('error_save_failed')); return; }
    requestSync?.();
    refresh(uid);
    setQuestion(null); setEvening(null); setFollowup(null); setFuText(''); setFuNote(false);
    setFixHint(false); setDeflect(false);
    if (dayKey === todayISO()) { setEcho(null); setClosedMsg(true); }
  }

  // Save a parse onto the pending row, one entry per day eaten: the row keeps
  // the first day's items, extra days become their own entries (a catch-up
  // "Monday pizza, Tuesday a salad" must land on both days, or the reality check
  // would count it on the wrong one). Returns [{ rowId, entry_date, items }].
  function saveParsed(rowId, uid, typedISO, res, raw) {
    const groups = splitByDay(res.items, typedISO, res.daysAgo);
    let alive = true;
    const placed = [];
    groups.forEach((g, i) => {
      const fields = {
        parsed_items: JSON.stringify(g.items), kcal: g.totals.kcal,
        protein_g: g.totals.protein_g, carb_g: g.totals.carb_g, fat_g: g.totals.fat_g,
        parse_status: 'done', entry_date: g.entry_date,
      };
      if (i === 0) { alive = updateFoodLog(rowId, fields) > 0; if (alive) placed.push({ rowId, entry_date: g.entry_date, items: g.items }); } // removed meanwhile → add nothing
      else if (alive) { const id = insertFoodLog({ user_id: uid, raw_text: raw, ...fields }); placed.push({ rowId: id, entry_date: g.entry_date, items: g.items }); }
    });
    return placed;
  }

  async function reparse(row, uid, rows) {
    if (reparsingRef.current.has(row.id)) return;
    reparsingRef.current.add(row.id);
    try {
      const res = await parseFood(row.raw_text, language, row.entry_date, recentForParse(rows || [], row.entry_date));
      if (!res.ok) return; // still offline / transient — keep pending, retry later
      if (res.refusal) {
        // An advice-shaped message typed offline. NEVER silently delete what the
        // user wrote (FL-15/19): keep the row as 'refused' — it counts as
        // nothing, stops retrying, and shows the fixed deflection card with a
        // Remove button; the user decides.
        updateFoodLog(row.id, { parse_status: 'refused' });
        requestSync?.(); refresh(uid); return;
      }
      if (!res.items.length || !res.totals) {
        // Ambiguous: a 200 with no items/totals. NEVER silently delete an
        // offline-saved health entry — mark it terminal so it stops retrying (and
        // burning quota) and renders as "couldn't read — tap to remove".
        updateFoodLog(row.id, { parse_status: 'unparsed' });
        requestSync?.(); refresh(uid); return;
      }
      saveParsed(row.id, uid, row.entry_date, res, row.raw_text);
      requestSync?.(); refresh(uid);
      // Tell them what the offline entry became (FL-7).
      const e = echoFor(res.items);
      if (e) setEcho({ text: e, updated: true });
    } finally { reparsingRef.current.delete(row.id); }
  }

  async function onSubmit() {
    const raw = text.trim();
    if (!raw || busy || !userId) return;
    // "That's it" / "nothing else" closes today — no AI read, no empty entry,
    // no fix hint (FL-29).
    if (isDoneText(raw)) { setText(''); await closeDay(todayISO()); return; }
    // A bare "no" answers the question on screen: move on to the next one (or
    // stop for now). The day stays open; no AI read, no entry.
    if (isNoText(raw)) {
      setText(''); setEarlierAsk(false);
      if (followup) { skipFollowup(); return; }
      if (question) { askNext(recent); return; }
      return;
    }
    // "Another one" / "same as breakfast" with nothing logged today: ask what it
    // was — never let the parser guess (FL-14). The typed text stays.
    if (mustAskWhichEarlier(raw, recentForParse(getFoodLogsSince(userId, todayISO()) || [], todayISO()))) {
      setEarlierAsk(true); setQuestion(null); setEcho(null); setClosedMsg(false);
      return;
    }
    setEarlierAsk(false);
    const consented = await requestAIConsent(t);
    if (!consented) return;
    setDeflect(false);
    setFixHint(false);
    // A new meal while a follow-up is open is a new entry; the card closes and
    // the earlier item stays flagged as an estimate (FL-27).
    setFollowup(null); setFuText(''); setFuNote(false);
    setClosedMsg(false);
    setBusy(true);
    const typedOn = todayISO(); // the day it was typed — fixed before the await (a submit can cross midnight)
    // Today's earlier items go along so "another one" resolves (FL-14).
    const context = recentForParse(getFoodLogsSince(userId, typedOn) || [], typedOn);
    const id = insertFoodLog({ user_id: userId, entry_date: typedOn, raw_text: raw, parse_status: 'pending' });
    addLocalPending(localRowKey(getFoodLogById(id))); // typed here: this device parses it (FL-19)
    // Claim the row so a focus-triggered reparse() can't parse the SAME entry
    // concurrently (double AI call = double quota + update/delete races).
    reparsingRef.current.add(id);
    setText('');
    refresh(userId);

    let res;
    try { res = await parseFood(raw, language, typedOn, context); }
    finally { reparsingRef.current.delete(id); }
    setBusy(false);

    if (res.ok && res.refusal) {
      deleteFoodLog(id); requestSync?.(); refresh(userId);
      setText(raw);            // don't lose what they typed if it was misjudged
      setDeflect(true); return;
    }
    if (res.ok && (!res.items.length || !res.totals)) {
      // Nothing to add (e.g. a correction to an item already logged). Don't fail
      // silently — point the user at tap-to-fix, which is how corrections work.
      deleteFoodLog(id); requestSync?.(); refresh(userId);
      setText(raw);            // preserve their words (may have been real food misjudged)
      setDetailOpen(true);     // reveal the log so "tap it below" isn't a dead-end
      setFixHint(true); return;
    }
    if (res.ok) {
      // "An ice cream 3 days ago" is logged like anything else, on the day it was
      // eaten — time never blocks it (founder 2026-09-24). Clear items save now;
      // a follow-up only ever touches the unclear one (FL-26).
      // An item the parser asks about stays flagged as an estimate until it is
      // answered or fixed — also after Skip or a new meal typed instead (FL-27).
      if (res.ask && res.items[res.ask.item]) res.items[res.ask.item].asked = true;
      const placed = saveParsed(id, userId, typedOn, res, raw);
      requestSync?.();
      const rows = refresh(userId);
      // Echo back what was logged with its quantity (FL-7/8) — never a word about the food.
      const e = echoFor(res.items);
      setEcho(e ? { text: e, updated: false } : null);
      // The parser's one follow-up, if any: locate the asked item in the entry it
      // was saved to (a catch-up may have split days).
      let fu = null;
      if (res.ask) {
        const target = res.items[res.ask.item];
        const g = placed.find((x) => x.items.includes(target));
        if (target && g && g.rowId) {
          fu = { rowId: g.rowId, entry_date: g.entry_date, index: g.items.indexOf(target), count: g.items.length, item: { ...target }, kind: res.ask.kind, options: res.ask.options || [] };
        }
      }
      if (fu) { setFollowup(fu); setQuestion(null); } else askNext(rows);
      return;
    }
    if (res.code === 'quota_exceeded' || res.status === 429) {
      // Nothing half-saved, and what they typed comes back (FL-20, never lose data).
      deleteFoodLog(id); requestSync?.(); refresh(userId);
      setText(raw);
      Alert.alert(t('nutri_title'), t('nutri_quota'));
    } else {
      Alert.alert(t('nutri_title'), t('nutri_offline_saved'));
    }
  }

  // ── Follow-up (FL-10/26/27/28) ────────────────────────────────────
  // Apply a follow-up result to its entry: 'applied' | 'dropped' | 'refused' | 'retry'.
  function applyFollowupResult(p, res) {
    if (!res.ok) {
      if (res.code === 'network' || res.status == null || res.status >= 500 || res.status === 401) return 'retry';
      return 'dropped'; // quota / bad request: the item simply stays an estimate
    }
    if (res.refusal) return 'refused';
    const corrected = res.items && res.items[0];
    if (!corrected) return 'dropped';
    const row = getFoodLogById(p.rowId);
    if (!followupStillValid(row, p)) return 'dropped'; // edited or deleted meanwhile
    const items = safeItems(row.parsed_items);
    const next = applyFollowup(items, p.index, corrected);
    if (!next) return 'dropped';
    // Same row, same entry_date (an answer after midnight keeps the day).
    const n = updateFoodLog(p.rowId, { parsed_items: JSON.stringify(next.items), kcal: next.totals.kcal, protein_g: next.totals.protein_g, carb_g: next.totals.carb_g, fat_g: next.totals.fat_g });
    return n > 0 ? 'applied' : 'dropped';
  }

  async function answerFollowup(answerRaw) {
    const f = followup;
    const answer = String(answerRaw || '').trim().slice(0, 200);
    if (!f || !answer || fuBusy) return;
    setFuBusy(true);
    const res = await parseFollowup(f.item, f.kind, answer, language, f.entry_date);
    setFuBusy(false);
    const outcome = applyFollowupResult(f, res);
    if (outcome === 'retry') {
      // Offline: keep the answer and apply it later to the same entry (FL-28).
      await queueFollowup({ ...f, answer, user_id: userId });
      setFuNote(true);
    } else if (outcome === 'refused') {
      setDeflect(true);
    }
    if (outcome === 'applied') {
      requestSync?.();
      const e = echoFor([res.items[0]]);
      if (e) setEcho({ text: e, updated: true });
    }
    setFollowup(null); setFuText('');
    const rows = refresh(userId);
    askNext(rows);
  }

  function skipFollowup() {
    setFollowup(null); setFuText('');
    askNext(recent);
  }

  async function queueFollowup(p) {
    try {
      const raw = await AsyncStorage.getItem(FOLLOWUP_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const next = (Array.isArray(list) ? list : []).filter((x) => !(x.rowId === p.rowId && x.index === p.index));
      next.push(p);
      await AsyncStorage.setItem(FOLLOWUP_KEY, JSON.stringify(next.slice(-20)));
    } catch { /* storage unavailable — the item stays an estimate, tap to fix */ }
  }

  // Retry answers given offline, on every focus. Dropped when the entry was
  // edited or deleted meanwhile (followupStillValid).
  async function drainFollowups(uid) {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      let list = [];
      try { const raw = await AsyncStorage.getItem(FOLLOWUP_KEY); list = raw ? JSON.parse(raw) : []; } catch { list = []; }
      if (!Array.isArray(list) || !list.length) return;
      const keep = [];
      const applied = [];
      let changed = false;
      for (const p of list) {
        if (!p || p.user_id !== uid) { if (p && p.user_id && p.user_id !== uid) keep.push(p); continue; }
        if (!followupStillValid(getFoodLogById(p.rowId), p)) { changed = true; continue; }
        const res = await parseFollowup(p.item, p.kind, p.answer, language, p.entry_date);
        const outcome = applyFollowupResult(p, res);
        if (outcome === 'retry') keep.push(p); else changed = true;
        if (outcome === 'applied') applied.push(res.items[0]);
      }
      try { await AsyncStorage.setItem(FOLLOWUP_KEY, JSON.stringify(keep)); } catch { /* ignore */ }
      if (changed) { requestSync?.(); refresh(uid); }
      if (applied.length) { const e = echoFor(applied); if (e) setEcho({ text: e, updated: true }); }
    } finally { drainingRef.current = false; }
  }

  // ── "Not recorded" days (FL-3) ─────────────────────────────────────
  function markNotRecorded(day) {
    if (!userId) return;
    insertFoodDayMarker(userId, day.date, 'not_recorded');
    requestSync?.(); refresh(userId);
  }
  function unmarkNotRecorded(day) {
    (day.markerIds || []).forEach((id) => deleteFoodLog(id));
    requestSync?.(); refresh(userId);
  }

  // ── Fix-an-entry (tap an entry in an expanded day) ───────────────
  function openEdit(row) { setEditEntry(row); setEditDate(row.entry_date); setEditItems(safeItems(row.parsed_items).map((it) => ({ ...it }))); }
  // Move an entry to the day it was really eaten (never into the future).
  function shiftEditDate(delta) {
    setEditDate((d) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + delta); const n = localISO(x); return n > todayISO() ? d : n; });
  }
  function setItemField(i, field, val) { setEditItems((p) => p.map((it, idx) => (idx === i ? { ...it, [field]: val } : it))); }
  function removeItem(i) { setEditItems((p) => p.filter((_, idx) => idx !== i)); }
  function saveEdit() {
    if (!editEntry) return;
    const origByFood = safeItems(editEntry.parsed_items);
    const cleaned = editItems.map((it) => {
      const next = { ...it, kcal: numOr(it.kcal), carb_g: numOr(it.carb_g), protein_g: numOr(it.protein_g) };
      // A number or category the user fixed is theirs now — no longer an estimate (FL-9).
      const o = origByFood.find((x) => x && x.food === it.food) || {};
      if (numOr(o.kcal) !== next.kcal || numOr(o.carb_g) !== next.carb_g || numOr(o.protein_g) !== next.protein_g || (o.category || null) !== (next.category || null)) next.confidence = 'user';
      return next;
    });
    if (!cleaned.length) { deleteFoodLog(editEntry.id); requestSync?.(); setEditEntry(null); refresh(userId); return; }
    const sum = (k) => Math.round(cleaned.reduce((a, it) => a + (Number(it[k]) || 0), 0));
    updateFoodLog(editEntry.id, { parsed_items: JSON.stringify(cleaned), kcal: sum('kcal'), carb_g: sum('carb_g'), protein_g: sum('protein_g'), fat_g: sum('fat_g'), entry_date: editDate || editEntry.entry_date });
    requestSync?.(); setEditEntry(null); refresh(userId);
  }
  function deleteFromEdit() { if (editEntry) { deleteFoodLog(editEntry.id); requestSync?.(); setEditEntry(null); refresh(userId); } }
  // An "unparsed" row (the model couldn't read it) has no items to edit — offer to remove it.
  function confirmRemove(row, pending) {
    if (reparsingRef.current.has(row.id)) return; // mid-parse: it resolves in a moment
    Alert.alert(t('nutri_title'), pending ? t('nutri_offline_saved') : t('nutri_unparsed'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('nutri_delete_entry'), style: 'destructive', onPress: () => { deleteFoodLog(row.id); requestSync?.(); refresh(userId); } },
    ]);
  }
  function removeRefused(row) { deleteFoodLog(row.id); requestSync?.(); refresh(userId); }

  const today = todayISO();
  const freeLeft = Math.max(0, FREE_DAYS - dayCount);
  const gated = !premium && dayCount >= FREE_DAYS;
  const closedSet = closedDays(recent);
  const todayClosed = closedSet.has(today);
  const showQuestion = question && !todayClosed;
  const questionText = showQuestion ? t(`nutri_q_${question.id}${question.tense === 'neutral' ? '' : '_' + question.tense}`) : null;
  const echoText = echo ? t(echo.updated ? 'nutri_echo_updated' : 'nutri_echo').replace('{items}', echo.text) : null;
  const composerLine = earlierAsk
    ? t('nutri_which_earlier')
    : (todayClosed && closedMsg)
      ? [echoText, t('nutri_day_closed')].filter(Boolean).join(' ')
      : ([echoText, questionText].filter(Boolean).join(' ') || t('nutri_intro'));
  const eveningOpen = evening && !closedSet.has(evening);
  const foodRows = foodOnly(recent);
  const refused = foodRows.filter((e) => e.parse_status === 'refused');
  // Intake across the open reality check — the number this logger exists for.
  const rcDays = rcStart ? Math.max(0, Math.round((new Date(today + 'T12:00:00') - new Date(rcStart.date + 'T12:00:00')) / 86400000)) : null;
  // The SAME figure the calculator uses (completed days of the check), plus
  // today's food so far shown separately — one number, never two "per day"s.
  const intake = rcStart && rcDays >= 1 ? checkIntake(recent, rcStart.date, today, rcDays, 1) : null;
  const unlogged = rcStart ? unloggedCheckDays(recent, rcStart.date, today) : [];
  // Totals per day, per week and for the whole check, each with its working (FL-24).
  const totToday = periodTotals(recent, today, today);
  const totWeek = periodTotals(recent, daysAgoISO(6), today);
  const totWindow = rcStart && rcStart.date <= today ? periodTotals(recent, rcStart.date, today) : null;
  const todayKcal = Math.round(foodRows.filter((e) => e.entry_date === today).reduce((a, e) => a + (Number(e.kcal) || 0), 0));
  const entries = foodRows.filter((e) => e.parse_status !== 'refused').sort((a, b) => (a.entry_date === b.entry_date ? (b.id || 0) - (a.id || 0) : (a.entry_date < b.entry_date ? 1 : -1)));

  function dayLabel(dateISO) {
    if (dateISO === todayISO()) return t('nutri_day_today');
    if (dateISO === daysAgoISO(1)) return t('nutri_day_yesterday');
    const d = new Date(dateISO + 'T12:00:00');
    return isNaN(d) ? dateISO : d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  const macro = (c, p) => `${Math.round(c || 0)} g ${t('nutri_carbs')} · ${Math.round(p || 0)} g ${t('nutri_protein')}`;
  const catLabel = (c) => (CATEGORIES.includes(c) ? t(`nutri_cat_${c}`) : null);

  // Gated (post-trial, non-premium): the upsell demo replaces the composer.
  if (gated) {
    return (
      <View style={s.wrap}>
        <Text style={s.section}>{t('nutri_title')}</Text>
        <DemoBody s={s} t={t} ctaLabel={t('nutri_locked_cta')} onCta={() => navigation.navigate('Paywall')} />
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.secHead} activeOpacity={0.7} onPress={() => setDetailOpen((o) => !o)}>
        <Text style={s.section}>{t('nutri_title')}</Text>
        <Text style={s.secChev}>{detailOpen ? '▾' : '▸'}</Text>
      </TouchableOpacity>

      {/* 20:00 question, opened from the reminder (FL-18) */}
      {eveningOpen && (
        <View style={s.evening}>
          <Text style={s.eveningText}>{t('notif_food_body')}</Text>
          <View style={s.eveningBtns}>
            <TouchableOpacity style={s.eveningPrimary} activeOpacity={0.8} onPress={() => { setEvening(null); setTimeout(() => inputRef.current?.focus?.(), 50); }}>
              <Text style={s.eveningPrimaryText}>{t('notif_food_action_log')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.eveningSecondary} activeOpacity={0.8} onPress={() => closeDay(evening)}>
              <Text style={s.eveningSecondaryText}>{t('notif_food_action_done')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.eveningSecondary} activeOpacity={0.8} onPress={() => setEvening(null)}>
              <Text style={s.eveningSecondaryText}>{t('nutri_evening_later')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* AI composer — pinned open */}
      <View style={s.composer}>
        <View style={s.aiBadge}>
          <FeatureIcon name="ai_spark" size={12} color={colors.accentText} />
          <Text style={s.aiBadgeText}>{t('nutri_ai_badge')}</Text>
        </View>
        <Text style={s.cq}>{composerLine}</Text>
        {showQuestion && (
          <TouchableOpacity style={s.doneChip} activeOpacity={0.75} onPress={() => closeDay(today)} accessibilityRole="button">
            <Text style={s.doneChipText}>{t('nutri_day_done_btn')}</Text>
          </TouchableOpacity>
        )}
        <Text style={s.chint}>{t('nutri_composer_hint')}</Text>
        <View style={s.cfield}>
          <FeatureIcon name="ai_spark" size={18} color={colors.accent} />
          <TextInput
            ref={inputRef}
            style={s.cinput}
            value={text}
            onChangeText={(v) => { setText(v); if (fixHint) setFixHint(false); if (earlierAsk) setEarlierAsk(false); }}
            placeholder={t('nutri_input_placeholder')}
            placeholderTextColor={colors.textFaint}
            multiline
            editable={!busy}
          />
        </View>
        <TouchableOpacity style={[s.logBtn, (busy || !text.trim()) && s.logBtnOff]} onPress={onSubmit} disabled={busy || !text.trim()}>
          {busy ? <ActivityIndicator size="small" color={colors.accentText} /> : (
            <>
              <FeatureIcon name="ai_spark" size={16} color={colors.accentText} />
              <Text style={s.logBtnText}>{t('nutri_send')}</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={s.caveat}>{t('nutri_est_note')}</Text>
        {!premium && freeLeft > 0 && <Text style={s.freeNote}>{t('nutri_free_note').replace('{n}', String(freeLeft))}</Text>}
      </View>

      {/* The parser's one follow-up, worded by the app (FL-10/16/26) */}
      {followup && (
        <View style={s.fu}>
          <Text style={s.fuQ}>{t(`nutri_ask_${followup.kind}`).replace('{food}', String(followup.item.food || '').slice(0, 60))}</Text>
          {followup.options.length > 0 && (
            <View style={s.fuChips}>
              {followup.options.map((o, i) => (
                <TouchableOpacity key={i} style={s.fuChip} activeOpacity={0.75} disabled={fuBusy} onPress={() => answerFollowup(String(o).slice(0, 40))}>
                  <Text style={s.fuChipText} numberOfLines={1}>{String(o).slice(0, 40)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={s.fuField}>
            <TextInput
              style={s.fuInput}
              value={fuText}
              onChangeText={setFuText}
              placeholder={t('nutri_ask_placeholder')}
              placeholderTextColor={colors.textFaint}
              editable={!fuBusy}
              returnKeyType="send"
              onSubmitEditing={() => answerFollowup(fuText)}
              maxLength={200}
            />
            <TouchableOpacity style={[s.fuSend, (!fuText.trim() || fuBusy) && s.logBtnOff]} disabled={!fuText.trim() || fuBusy} onPress={() => answerFollowup(fuText)}>
              {fuBusy ? <ActivityIndicator size="small" color={colors.accentText} /> : <Text style={s.fuSendText}>{t('nutri_ask_send')}</Text>}
            </TouchableOpacity>
          </View>
          <View style={s.fuFoot}>
            <TouchableOpacity onPress={skipFollowup} disabled={fuBusy} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.fuSkip}>{t('nutri_ask_skip')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => closeDay(today)} disabled={fuBusy} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.fuSkip}>{t('nutri_day_done_btn')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {fuNote && !followup && (
        <View style={s.hint}><Text style={s.hintText}>{t('nutri_ask_saved')}</Text></View>
      )}

      <TouchableOpacity style={s.howRow} activeOpacity={0.7} onPress={() => setShowDemo(true)}>
        <FeatureIcon name="ai_spark" size={13} color={colors.accent} />
        <Text style={s.howText}>{t('nutri_how')}</Text>
      </TouchableOpacity>

      <View style={s.remindRow}>
        <FeatureIcon name="food" size={16} color={colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={s.remindLabel}>{t('settings_food_reminders')}</Text>
          <Text style={s.remindSub}>{t('settings_food_reminders_sub')}</Text>
        </View>
        <Switch
          value={foodReminders}
          onValueChange={toggleFoodReminders}
          trackColor={{ true: colors.switchTrack }}
          accessibilityLabel={t('settings_food_reminders')}
        />
      </View>

      {deflect && (
        <View style={s.deflect}>
          <Text style={s.deflectTitle}>{t('nutri_deflect_title')}</Text>
          <Text style={s.deflectBody}>{t('nutri_deflect_body')}</Text>
        </View>
      )}

      {/* Advice-shaped messages typed offline: kept, never silently deleted —
          the fixed deflection card, what they wrote, and a Remove button (FL-15/19). */}
      {refused.map((r) => (
        <View key={r.id} style={s.deflect}>
          <Text style={s.deflectTitle}>{t('nutri_deflect_title')}</Text>
          <Text style={s.deflectBody}>{t('nutri_deflect_body')}</Text>
          <Text style={s.deflectQuote} numberOfLines={3}>{t('nutri_refused_text').replace('{text}', r.raw_text || '')}</Text>
          <TouchableOpacity style={s.deflectRemove} onPress={() => removeRefused(r)} accessibilityRole="button">
            <Text style={s.deflectRemoveText}>{t('nutri_delete_entry')}</Text>
          </TouchableOpacity>
        </View>
      ))}

      {fixHint && (
        <View style={s.hint}>
          <Text style={s.hintText}>{t('nutri_fix_hint')}</Text>
        </View>
      )}

      {/* Collapsed summary — the intake across the open reality check (what this
          logger exists for), not a day-by-day diary. */}
      {!detailOpen && (
        <TouchableOpacity style={s.collapsed} activeOpacity={0.7} onPress={() => setDetailOpen(true)}>
          <Text style={s.collapsedText}>
            {rcStart
              ? (intake
                ? t('nutri_check_summary').replace('{total}', String(intake.totalKcal)).replace('{d}', String(intake.days)).replace('{avg}', String(intake.avgKcal))
                : t('nutri_check_empty'))
              : (entries.length ? t('nutri_entries_count').replace('{n}', String(entries.length)) : t('nutri_none'))}
          </Text>
          {(entries.length > 0 || unlogged.length > 0) && <Text style={s.collapsedShow}>{t('nutri_show')} ▸</Text>}
        </TouchableOpacity>
      )}

      {/* Detail: the check's running intake + every entry, newest first */}
      {detailOpen && (
        <>
          <View style={s.totCard}>
            <Text style={s.avgLabel}>{t('nutri_tot_title')}</Text>
            <Text style={s.totLine}>{t('nutri_tot_today').replace('{kcal}', String(totToday.kcal)).replace('{carbs}', String(totToday.carb_g)).replace('{protein}', String(totToday.protein_g))}</Text>
            <Text style={s.totLine}>{t('nutri_tot_week').replace('{total}', String(totWeek.kcal)).replace('{d}', String(totWeek.days)).replace('{avg}', String(totWeek.avgKcal)).replace('{n}', String(totWeek.loggedDays))}</Text>
            {totWindow && <Text style={s.totLine}>{t('nutri_tot_window').replace('{total}', String(totWindow.kcal)).replace('{d}', String(totWindow.days)).replace('{avg}', String(totWindow.avgKcal)).replace('{n}', String(totWindow.loggedDays))}</Text>}
          </View>
          {rcStart ? (
            <View style={s.avgCard}>
              <Text style={s.avgLabel}>{t('nutri_check_label')}</Text>
              {intake ? (
                <>
                  <Text style={s.avgBig}>≈ {intake.avgKcal} <Text style={s.avgUnit}>{t('cal_kcal')}{t('nutri_per_day')}</Text></Text>
                  <Text style={s.avgFoot}>{t('nutri_check_working').replace('{total}', String(intake.totalKcal)).replace('{d}', String(intake.days))}</Text>
                  <Text style={s.avgFoot}>{t('nutri_check_recorded').replace('{n}', String(intake.recordedDays)).replace('{d}', String(intake.windowDays))}</Text>
                  <Text style={s.avgFoot}>{t('nutri_check_coverage').replace('{n}', String(intake.loggedDays)).replace('{d}', String(intake.days))}</Text>
                  {todayKcal > 0 && <Text style={s.avgFoot}>{t('nutri_today_so_far').replace('{n}', String(todayKcal))}</Text>}
                </>
              ) : todayKcal > 0 ? (
                <Text style={s.avgFoot}>{t('nutri_today_so_far').replace('{n}', String(todayKcal))}</Text>
              ) : (
                <Text style={s.avgFoot}>{t('nutri_check_empty')}</Text>
              )}
              <Text style={s.avgFoot}>{t('nutri_check_foot')}</Text>
            </View>
          ) : (
            <Text style={s.noneDetail}>{t('nutri_no_check')}</Text>
          )}

          {/* Past days of the check with nothing logged: mark / unmark "not recorded" (FL-3) */}
          {rcStart && unlogged.length > 0 && (
            <View style={s.day}>
              <View style={s.unlogHead}>
                <Text style={s.unlogTitle}>{t('nutri_unlogged_title')}</Text>
                <Text style={s.unlogHint}>{t('nutri_unlogged_hint')}</Text>
              </View>
              {unlogged.map((d) => (
                <View key={d.date} style={s.unlogRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.unlogDate}>{dayLabel(d.date)}</Text>
                    <Text style={s.unlogState}>{d.notRecorded ? t('nutri_marked_not_recorded') : t('nutri_nothing_logged')}</Text>
                  </View>
                  <TouchableOpacity
                    style={[s.unlogBtn, d.notRecorded && s.unlogBtnOn]}
                    activeOpacity={0.75}
                    onPress={() => (d.notRecorded ? unmarkNotRecorded(d) : markNotRecorded(d))}
                    accessibilityRole="button"
                  >
                    <Text style={[s.unlogBtnText, d.notRecorded && s.unlogBtnTextOn]}>{d.notRecorded ? t('nutri_undo') : t('nutri_mark_not_recorded')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {entries.length > 0 && (
            <View style={s.day}>
              {entries.map((e) => {
                  const items = safeItems(e.parsed_items);
                  const pending = e.parse_status === 'pending';
                  const unparsed = e.parse_status === 'unparsed';
                  return (
                    <TouchableOpacity key={e.id} style={s.entryCard} activeOpacity={0.7} onPress={() => { if (unparsed || pending) confirmRemove(e, pending); else openEdit(e); }}>
                      {pending ? (
                        <Text style={s.pendingText}>{e.raw_text} · {t('nutri_offline_saved')}</Text>
                      ) : unparsed ? (
                        <Text style={s.pendingText}>{e.raw_text} · {t('nutri_unparsed')}</Text>
                      ) : (
                        <>
                          <Text style={s.entryDate}>{dayLabel(e.entry_date)}</Text>
                          {items.map((it, i) => (
                            <View key={i} style={s.entryItem}>
                              <View style={s.entryRow}>
                                <Text style={s.entryFood}>{itemLabel(it)} · ~{Math.round(it.kcal || 0)} {t('cal_kcal')}</Text>
                                {catLabel(it.category) && <Text style={s.catChip}>{catLabel(it.category)}</Text>}
                              </View>
                              {needsEstimateFlag(it) && <Text style={s.estFlag}>{t('nutri_estimate')}</Text>}
                            </View>
                          ))}
                          <View style={[s.entryRow, s.entryTot]}>
                            <Text style={s.entryTotFood}>≈ {Math.round(e.kcal || 0)} {t('cal_kcal')}</Text>
                            <Text style={s.entryTotMacro}>{macro(e.carb_g, e.protein_g)}</Text>
                          </View>
                        </>
                      )}
                    </TouchableOpacity>
                  );
              })}
            </View>
          )}
        </>
      )}

      {/* See-how-it-works demo modal (trial users) */}
      <Modal visible={showDemo} transparent animationType="fade" onRequestClose={() => setShowDemo(false)}>
        <View style={s.demoWrap}>
          <View style={s.demoCard}>
            <DemoBody s={s} t={t} ctaLabel={t('nutri_how_cta')} onCta={() => setShowDemo(false)} />
          </View>
        </View>
      </Modal>

      {/* Fix-an-entry modal */}
      <Modal visible={!!editEntry} transparent animationType="fade" onRequestClose={() => setEditEntry(null)}>
        <View style={s.modalWrap}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{t('nutri_edit_title')}</Text>
            {editDate && (
              <View style={s.editDateRow}>
                <TouchableOpacity onPress={() => shiftEditDate(-1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('nutri_date_earlier')}>
                  <Text style={s.editDateArrow}>‹</Text>
                </TouchableOpacity>
                <Text style={s.editDateText}>{dayLabel(editDate)}</Text>
                <TouchableOpacity onPress={() => shiftEditDate(1)} disabled={editDate >= todayISO()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('nutri_date_later')}>
                  <Text style={[s.editDateArrow, editDate >= todayISO() && { opacity: 0.3 }]}>›</Text>
                </TouchableOpacity>
              </View>
            )}
            {editItems.map((it, i) => (
              <View key={i} style={s.editItem}>
                <Text style={s.editFood} numberOfLines={1}>{itemLabel(it)}</Text>
                <View style={s.editFields}>
                  <EditNum s={s} colors={colors} label={t('cal_kcal')} value={it.kcal} onChange={(v) => setItemField(i, 'kcal', v)} />
                  <EditNum s={s} colors={colors} label={t('nutri_carbs')} value={it.carb_g} onChange={(v) => setItemField(i, 'carb_g', v)} />
                  <EditNum s={s} colors={colors} label={t('nutri_protein')} value={it.protein_g} onChange={(v) => setItemField(i, 'protein_g', v)} />
                  <TouchableOpacity style={s.editDel} onPress={() => removeItem(i)}><CrossMark style={s.editDelX} /></TouchableOpacity>
                </View>
                <View style={s.editCats}>
                  {CATEGORIES.map((c) => {
                    const on = it.category === c;
                    return (
                      <TouchableOpacity key={c} style={[s.editCat, on && s.editCatOn]} onPress={() => setItemField(i, 'category', c)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                        <Text style={[s.editCatText, on && s.editCatTextOn]}>{t(`nutri_cat_${c}`)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
            <TouchableOpacity style={s.modalSave} onPress={saveEdit}><Text style={s.modalSaveText}>{t('nutri_save')}</Text></TouchableOpacity>
            <View style={s.modalFoot}>
              <TouchableOpacity onPress={() => setEditEntry(null)}><Text style={s.modalCancel}>{t('cancel')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={deleteFromEdit}><Text style={s.modalDelete}>{t('nutri_delete_entry')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function EditNum({ s, colors, label, value, onChange }) {
  return (
    <View style={s.editNum}>
      <TextInput
        style={s.editInput}
        value={value == null ? '' : String(Math.round(Number(value) || 0))}
        onChangeText={onChange}
        keyboardType="number-pad"
        placeholderTextColor={colors.textFaint}
      />
      <Text style={s.editNumLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  wrap: { marginTop: 22 },
  secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginHorizontal: 2 },
  section: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: c.textMuted },
  secChev: { fontSize: 14, color: c.textFaint },
  // composer
  composer: { backgroundColor: c.accentSoft, borderRadius: 18, padding: 15, borderWidth: 1, borderColor: c.accent + '55' },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: c.accent, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  aiBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: c.accentText },
  cq: { fontSize: 18, fontWeight: '800', color: c.text, letterSpacing: -0.3, marginTop: 11 },
  chint: { fontSize: 12.5, color: c.textMuted, lineHeight: 17, marginTop: 4, marginBottom: 11 },
  cfield: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: c.card, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderColor: c.border },
  cinput: { flex: 1, fontSize: 15, color: c.text, maxHeight: 100 },
  logBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.accent, borderRadius: 13, paddingVertical: 13, marginTop: 9 },
  logBtnOff: { opacity: 0.4 },
  logBtnText: { color: c.accentText, fontWeight: '800', fontSize: 15 },
  caveat: { fontSize: 11, color: c.textFaint, textAlign: 'center', marginTop: 8, lineHeight: 15 },
  freeNote: { fontSize: 11.5, fontWeight: '700', color: c.accentSoftText, textAlign: 'center', marginTop: 8 },
  remindRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 4, borderTopWidth: 0.5, borderTopColor: c.border, marginBottom: 6 },
  remindLabel: { fontSize: 13, fontWeight: '600', color: c.text },
  remindSub: { fontSize: 11.5, color: c.textMuted, marginTop: 2, lineHeight: 15 },
  howRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12 },
  howText: { fontSize: 13, fontWeight: '700', color: c.accent },
  // deflect
  deflect: { backgroundColor: c.warningSoft, borderRadius: 14, padding: 14, marginTop: 10 },
  deflectTitle: { fontSize: 13, fontWeight: '800', color: c.warningSoftText, marginBottom: 4 },
  deflectBody: { fontSize: 12.5, color: c.warningSoftText, lineHeight: 18 },
  // tap-to-fix hint (a correction/non-food message → point at the edit modal)
  hint: { backgroundColor: c.accentSoft, borderRadius: 14, padding: 13, marginTop: 10 },
  hintText: { fontSize: 12.5, color: c.accentSoftText, lineHeight: 18 },
  // collapsed summary
  collapsed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.card2, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, marginTop: 10 },
  collapsedText: { fontSize: 12.5, color: c.textMuted, flex: 1 },
  collapsedShow: { fontSize: 12.5, fontWeight: '700', color: c.accent, marginLeft: 8 },
  // average card
  avgCard: { backgroundColor: c.accentSoft, borderRadius: 14, padding: 14, marginTop: 10 },
  avgLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: c.accentSoftText },
  avgBig: { fontSize: 26, fontWeight: '800', color: c.accent, marginTop: 4 },
  avgUnit: { fontSize: 13, fontWeight: '700', color: c.textMuted },
  avgFoot: { fontSize: 11, color: c.textFaint, marginTop: 6 },
  noneDetail: { fontSize: 12.5, color: c.textFaint, marginTop: 10, textAlign: 'center' },
  // day groups
  day: { backgroundColor: c.card, borderRadius: 14, marginTop: 10, borderWidth: 0.5, borderColor: c.border, overflow: 'hidden' },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 13 },
  dayLabel: { fontSize: 14, fontWeight: '800', color: c.text },
  dayRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayKcal: { fontSize: 13.5, fontWeight: '700', color: c.text },
  dayKcalNum: { color: c.accent, fontWeight: '800' },
  dayChev: { fontSize: 14, color: c.textFaint },
  editDateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 10 },
  editDateArrow: { fontSize: 22, fontWeight: '600', color: c.accent, paddingHorizontal: 6 },
  editDateText: { fontSize: 14, fontWeight: '700', color: c.text, minWidth: 120, textAlign: 'center' },
  entryDate: { fontSize: 11, fontWeight: '700', color: c.textMuted, marginBottom: 4 },
  entryCard: { paddingHorizontal: 13, paddingVertical: 11, borderTopWidth: 0.5, borderTopColor: c.border },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 3, gap: 10 },
  entryFood: { fontSize: 13, color: c.text, flex: 1 },
  entryKcal: { fontSize: 12, color: c.textMuted },
  entryTot: { borderTopWidth: 0.5, borderTopColor: c.border, marginTop: 6, paddingTop: 8 },
  entryTotFood: { fontSize: 13, fontWeight: '800', color: c.text },
  entryTotMacro: { fontSize: 12, fontWeight: '700', color: c.accentSoftText },
  pendingText: { fontSize: 12.5, color: c.textMuted, lineHeight: 18 },
  entryItem: { paddingVertical: 1 },
  totCard: { backgroundColor: c.card2, borderRadius: 14, padding: 13, marginTop: 10 },
  totLine: { fontSize: 12.5, color: c.text, lineHeight: 18, marginTop: 5 },
  catChip: { fontSize: 10, fontWeight: '700', color: c.accentSoftText, backgroundColor: c.accentSoft, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  estFlag: { fontSize: 11, fontWeight: '600', color: c.warningSoftText, backgroundColor: c.warningSoft, alignSelf: 'flex-start', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, marginTop: 2, overflow: 'hidden' },
  // "That's all for today" quick answer under the question
  doneChip: { alignSelf: 'flex-start', backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8 },
  doneChipText: { fontSize: 12.5, fontWeight: '700', color: c.text },
  // 20:00 question card (opened from the reminder)
  evening: { backgroundColor: c.card, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border },
  eveningText: { fontSize: 15, fontWeight: '700', color: c.text, lineHeight: 21 },
  eveningBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  eveningPrimary: { backgroundColor: c.accent, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  eveningPrimaryText: { color: c.accentText, fontWeight: '800', fontSize: 13.5 },
  eveningSecondary: { backgroundColor: c.card2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 0.5, borderColor: c.border },
  eveningSecondaryText: { color: c.text, fontWeight: '700', fontSize: 13.5 },
  // follow-up card
  fu: { backgroundColor: c.card, borderRadius: 16, padding: 14, marginTop: 10, borderWidth: 1, borderColor: c.border },
  fuQ: { fontSize: 15, fontWeight: '800', color: c.text, lineHeight: 21 },
  fuChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  fuChip: { backgroundColor: c.accentSoft, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  fuChipText: { fontSize: 13, fontWeight: '700', color: c.accentSoftText },
  fuField: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  fuInput: { flex: 1, backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: c.text, borderWidth: 0.5, borderColor: c.border },
  fuSend: { backgroundColor: c.accent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, minWidth: 70, alignItems: 'center' },
  fuSendText: { color: c.accentText, fontWeight: '800', fontSize: 13 },
  fuFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  fuSkip: { fontSize: 12.5, fontWeight: '600', color: c.textMuted },
  // offline-refused entry (kept, with Remove)
  deflectQuote: { fontSize: 12, color: c.warningSoftText, lineHeight: 17, marginTop: 8, fontStyle: 'italic' },
  deflectRemove: { alignSelf: 'flex-start', marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: c.warningSoftText, paddingHorizontal: 12, paddingVertical: 6 },
  deflectRemoveText: { fontSize: 12.5, fontWeight: '700', color: c.warningSoftText },
  // "not recorded" days
  unlogHead: { padding: 13, paddingBottom: 6 },
  unlogTitle: { fontSize: 13, fontWeight: '800', color: c.text },
  unlogHint: { fontSize: 11.5, color: c.textMuted, lineHeight: 16, marginTop: 3 },
  unlogRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 9, borderTopWidth: 0.5, borderTopColor: c.border },
  unlogDate: { fontSize: 13, fontWeight: '700', color: c.text },
  unlogState: { fontSize: 11.5, color: c.textFaint, marginTop: 1 },
  unlogBtn: { borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.card2, paddingHorizontal: 11, paddingVertical: 6 },
  unlogBtnOn: { backgroundColor: c.accentSoft, borderColor: c.accentSoft },
  unlogBtnText: { fontSize: 12, fontWeight: '700', color: c.text },
  unlogBtnTextOn: { color: c.accentSoftText },
  // category picker in the fix modal
  editCats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  editCat: { borderRadius: 12, borderWidth: 0.5, borderColor: c.border, backgroundColor: c.bg, paddingHorizontal: 9, paddingVertical: 4 },
  editCatOn: { backgroundColor: c.accent, borderColor: c.accent },
  editCatText: { fontSize: 11.5, fontWeight: '600', color: c.textMuted },
  editCatTextOn: { color: c.accentText },
  // demo modal + shared demo body
  demoWrap: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center', padding: 22 },
  demoCard: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  card: { backgroundColor: c.card, borderRadius: 18, padding: 16, borderWidth: 0.5, borderColor: c.border },
  demoBubble: { alignSelf: 'flex-start', backgroundColor: c.card2, borderRadius: 14, borderBottomLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, maxWidth: '90%' },
  demoBubbleText: { fontSize: 13.5, color: c.text, lineHeight: 19 },
  caret: { color: c.accent },
  demoUser: { alignSelf: 'flex-end', backgroundColor: c.accentSoft, borderRadius: 14, borderBottomRightRadius: 4, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 10, maxWidth: '85%' },
  demoUserText: { fontSize: 13, color: c.accentSoftText },
  demoBreak: { backgroundColor: c.card2, borderRadius: 12, padding: 11, marginBottom: 14 },
  lockedTitle: { fontSize: 15, fontWeight: '800', color: c.text, textAlign: 'center' },
  lockedSub: { fontSize: 12.5, color: c.textMuted, textAlign: 'center', lineHeight: 18, marginTop: 6, marginBottom: 14 },
  cta: { backgroundColor: c.accent, borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  ctaText: { color: c.accentText, fontWeight: '800', fontSize: 14 },
  // fix-entry modal
  modalWrap: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center', padding: 22 },
  modalCard: { backgroundColor: c.card, borderRadius: 18, padding: 16, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  modalTitle: { fontSize: 15, fontWeight: '800', color: c.text, marginBottom: 12 },
  editItem: { marginBottom: 12 },
  editFood: { fontSize: 13, fontWeight: '600', color: c.text, marginBottom: 6 },
  editFields: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editNum: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  editInput: { flex: 1, backgroundColor: c.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14, color: c.text, borderWidth: 0.5, borderColor: c.border, textAlign: 'center' },
  editNumLabel: { fontSize: 10, fontWeight: '700', color: c.textFaint },
  editDel: { padding: 6 },
  editDelX: { fontSize: 14, color: c.textFaint },
  modalSave: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  modalSaveText: { color: c.accentText, fontWeight: '800', fontSize: 14 },
  modalFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  modalCancel: { fontSize: 13, fontWeight: '600', color: c.textMuted },
  modalDelete: { fontSize: 13, fontWeight: '700', color: c.danger || c.warningSoftText },
});
