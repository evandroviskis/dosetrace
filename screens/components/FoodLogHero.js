/**
 * DoseTrace — compact food-log hero (FL-32/33). Tapping it opens the ONE food
 * chat ('FoodChat' modal route, FL-37). Shown on Journey (before the Reality
 * check, FL-34) and on Today under the alerts ONLY while a reality check is open
 * (FL-33/42/43; lib/foodThread todayFoodHeroPolicy). Access — Premium, free days,
 * the grace week with its note, or the lock — comes from foodLogAccess (FL-41).
 *
 * A-124 (founder 2026-10-15, picture A1, docs/specs/food-log-emphasis.md): while the food log
 * is active — a reality check running, the same policy.show that puts the card on Today — and
 * the user can log, the card stands out on Today and Journey alike: the sparkle in a round well,
 * a full-width "Log food" button and a 2 pt border drawn inside the card, both in the emph token.
 * No shadow. Otherwise (no check, or locked) the card is exactly as before.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getCachedUser } from '../../lib/supabase';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { getFoodLogsSince } from '../../lib/database';
import { addSyncListener } from '../../lib/sync';
import { todayFoodHeroPolicy, todaySummary } from '../../lib/foodThread';
import { intakeRun, MIN_RUN_DAYS } from '../../lib/nutrition';
import { catchUpFood, loadFoodAccess } from '../../lib/foodLogActions';
import { readCheckNow } from '../../lib/realityCheckNow';
import FoodGraceNote from './FoodGraceNote';
import { localISO } from '../../lib/localDate';
import FeatureIcon from '../../components/FeatureIcon';
import RowChevron from '../../components/RowChevron';
import { fontFamilyFor } from '../../lib/fonts';
import { pluralKey } from '../../lib/plural';

const CHECK_DAYS = 21;

// The card's data: today's food rows (from the earliest of today, the reality check's start and
// the first free day), the access answer and the check's state. Read on focus and, A-146, again
// when a sync brings data.
async function readFoodCard() {
  const user = await getCachedUser();
  const uid = user?.id || null;
  const today = localISO();
  const { access, rcStart } = await loadFoodAccess(uid);
  const since = [today, rcStart && rcStart.date ? String(rcStart.date).slice(0, 10) : null, access.freeFrom].filter(Boolean).sort()[0];
  const rows = uid ? (getFoodLogsSince(uid, since) || []) : [];
  // Founder 2026-10-09: after the weigh-in the line says so (never "time to weigh in" again).
  const now = await readCheckNow().catch(() => null);
  return { uid, state: { access, rcStart, today, rows, sum: todaySummary(rows, today), checkState: now ? now.outcome.state : null } };
}

// A-146: reload on the sync events that bring data (the ones Today's dose lists use). A burst
// (import_complete, then sync_complete, then data_changed) reloads once, waitMs after the last.
// Returns the unsubscribe, which also drops a reload still waiting.
function reloadOnSync(addListener, reload, waitMs = 300) {
  let timer = null;
  const off = addListener((e) => {
    if (!e || (e.type !== 'import_complete' && e.type !== 'sync_complete' && e.type !== 'data_changed')) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; reload(); }, waitMs);
  });
  return () => { if (timer) clearTimeout(timer); timer = null; off(); };
}

// onReady (A-120, Today): called once the card's first read is done (also when it fails), so Today
// shows its first screen complete, with this card already in place.
export default function FoodLogHero({ variant = 'journey', onChanged, onReady }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const s = makeStyles(colors);
  const [state, setState] = useState(null);
  // A-146: the read of the focused card, for the sync listener below (null while blurred).
  const readRef = useRef(null);

  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      let uid = null;
      const read = async () => {
        const r = await readFoodCard();
        uid = r.uid;
        if (alive) setState(r.state);
      };
      readRef.current = read;
      try { await read(); } finally { if (onReady) onReady(); }
      // Offline entries / follow-up answers are parsed once back online, even if
      // the chat is never opened (FL-19/28).
      if (uid) {
        const { changed } = await catchUpFood(uid, language);
        if (changed) { await read(); onChanged && onChanged(); }
      }
    })();
    return () => { alive = false; readRef.current = null; };
  }, [language]));

  // A-146: after signing back in the cloud import fills food_logs AFTER the focus read, so the
  // card also reads again when an import / sync finishes or data changes (as Today's dose lists
  // do), debounced; the listener goes away on unmount.
  useEffect(() => reloadOnSync(addSyncListener, () => { if (readRef.current) readRef.current().catch(() => {}); }), []);

  if (!state) return null;
  const policy = todayFoodHeroPolicy({ rcStart: state.rcStart, todayISO: state.today, access: state.access, checkDays: CHECK_DAYS });
  if (variant === 'today' && !policy.show) return null;
  const locked = !state.access.canLog;
  const note = state.access.reason === 'premium_ended' || state.access.reason === 'free_days_ending';
  // A-124: emphasised while a check runs and logging is open (locked keeps its own Unlock button).
  const emph = policy.show && !locked;
  // The card and the "Log food" button open the same chat (FE-3; the Paywall when locked).
  const openFood = () => navigation.navigate(locked ? 'Paywall' : 'FoodChat', locked ? { source: 'food_hero' } : undefined);

  // The 7-days-in-a-row progress the check's intake needs (FL-3).
  const run = state.rcStart ? intakeRun(state.rows, String(state.rcStart.date).slice(0, 10), state.today) : null;
  const runShort = run ? (run.ok ? t('nutri_hero_run_ready').replace('{d}', String(run.days)) : t(variant === 'today' ? 'nutri_hero_run_today' : 'nutri_hero_run').replace('{n}', String(Math.min(run.current, MIN_RUN_DAYS)))) : null;
  // Journey (redesign part 1, founder 2026-10-02): only the 7-day run; the day of the check
  // lives on the Progress screen. Today keeps the day of the check + the run.
  const checkLine = variant === 'journey' ? runShort : policy.show
    ? [policy.weighInDue ? t(state.checkState === 'needs_food' || state.checkState === 'ready' ? 'nutri_hero_weighed' : 'nutri_hero_weigh') : t('nutri_hero_day').replace('{n}', String(policy.day)).replace('{total}', String(policy.of)), runShort].filter(Boolean).join(' · ')
    : null;
  const { items, kcal, closed } = state.sum;
  const todayLine = closed
    ? t('nutri_hero_closed').replace('{kcal}', String(kcal))
    : items > 0 ? t(pluralKey('nutri_hero_today', items, language)).replace('{n}', String(items)).replace('{kcal}', String(kcal)) : t('nutri_hero_empty');

  return (
    <View style={variant === 'today' && s.cardToday}>
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.8}
      onPress={openFood}
      accessibilityRole="button"
      accessibilityLabel={`${t('nutri_ai_badge')}. ${checkLine ? checkLine + '. ' : ''}${todayLine}`}
    >
      {/* Redesign (Graduated, approved 2026-09-29): the whole card opens the food chat;
          the day's line is the headline, the reality check under it; no tinted box. */}
      {emph ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.emphRing]} /> : null}
      <View style={[s.head, emph && s.headEmph]}>
        {emph ? (
          <View style={s.well}>
            <FeatureIcon name="ai_spark" size={22} color={colors.emph} />
          </View>
        ) : (
          <FeatureIcon name="ai_spark" size={22} color={colors.ink2} />
        )}
        <Text style={s.title}>{t('nutri_ai_badge')}</Text>
        <RowChevron color={colors.tick} />
      </View>
      <Text style={s.line}>{locked ? t(state.access.reason === 'premium_ended' ? 'nutri_hero_locked_premium' : 'nutri_hero_locked') : todayLine}</Text>
      {checkLine && <Text style={s.check}>{checkLine}</Text>}
      {locked && <View style={s.cta}><Text style={s.ctaText}>{t('nutri_locked_cta')}</Text></View>}
      {emph && (
        <TouchableOpacity style={s.emphCta} onPress={openFood} activeOpacity={0.8} accessibilityRole="button">
          <Text style={s.emphCtaText}>{t('nutri_hero_cta')}</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
    {!locked && note && <FoodGraceNote rcStart={state.rcStart} until={state.access.until} reason={state.access.reason} freeFrom={state.access.freeFrom} rows={state.rows} style={s.grace} />}
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  card: { backgroundColor: c.raised, borderRadius: 24, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16, gap: 8 },
  cardToday: { marginHorizontal: 16, marginBottom: 26 },
  grace: { marginTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: 17, fontWeight: '600', color: c.ink },
  // prototype food(): r-title at 19, Geist 600, the same on Today and Journey (set here: the
  // app maps Geist from 22 pt up).
  line: { fontSize: 19, fontFamily: fontFamilyFor('600'), lineHeight: 24, letterSpacing: -0.19, color: c.ink, fontVariant: ['tabular-nums'] },
  check: { fontSize: 15, lineHeight: 20, color: c.ink2, fontVariant: ['tabular-nums'] },
  cta: { alignSelf: 'flex-start', backgroundColor: c.act, borderRadius: 22, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center', marginTop: 6 },
  ctaText: { color: c.onAct, fontWeight: '700', fontSize: 15 },
  // A-124 (picture A1): the 2 pt line sits inside the card (inset), so nothing moves.
  emphRing: { borderWidth: 2, borderColor: c.emph, borderRadius: 24 },
  headEmph: { gap: 12 },
  well: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' },
  emphCta: { alignSelf: 'stretch', minHeight: 48, borderRadius: 24, backgroundColor: c.emph, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 6 },
  emphCtaText: { color: c.onEmph, fontSize: 17, fontWeight: '700', textAlign: 'center' },
});
