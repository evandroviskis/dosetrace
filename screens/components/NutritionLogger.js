/**
 * DoseTrace — the food log inside Progress › Reality check (redesign, journey-dashboard
 * "Where the Journey food logger goes": the AI food log card lives on Journey and
 * Today, "See how it works" lives in the food chat, and the check's intake, run rule,
 * totals, days with nothing logged and the reminder switch live here).
 *
 * The log's collapsible detail: totals per day / 7 days / whole check (FL-24), the
 * reality check's intake — only from 7+ days in a row, else progress — with its
 * working and past days to mark "not recorded" (FL-3), and every entry (tap → the
 * same fix screen as the chat). The conversation itself (composer, questions,
 * follow-ups, day closing) lives ONLY in screens/FoodChatScreen.js. First days are
 * free, then Premium (with a grace week when access ends during a reality check, FL-41).
 *
 * Regulatory (Apple 1.4.1 / SaMD, founder AI hard line): estimates only, never
 * advice; the only model text on screen is short food/unit names.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, AccessibilityInfo, Switch } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { supabase, getCachedUser } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { MONO } from '../../lib/fonts';
import { requestSync } from '../../lib/sync';
import { getFoodLogsSince, deleteFoodLog, insertFoodDayMarker } from '../../lib/database';
import { loadFoodAccess } from '../../lib/foodLogActions';
import {
  intakeRun, MIN_RUN_DAYS, unloggedCheckDays, foodOnly, CATEGORIES, itemLabel, needsEstimateFlag, periodTotals,
} from '../../lib/nutrition';
import { safeItems } from '../../lib/foodThread';
import { getRealityStart } from '../../lib/realityCheck';
import { localISO, localDaysAgoISO } from '../../lib/localDate';
import { syncFoodLogReminder } from '../../lib/notifications';
import FeatureIcon from '../../components/FeatureIcon';
import FoodEntryEditor from './FoodEntryEditor';

const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };
const todayISO = () => localISO();
const daysAgoISO = (n) => localDaysAgoISO(n);

// The animated example (prototype FC-demo) — used for "See how it works" in the food
// chat and for the locked upsell here. Respects Reduce Motion (static final frame).
// Content only: the caller puts it on a sheet or inside a card.
export function FoodDemo({ ctaLabel, onCta }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = makeDemoStyles(colors);
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
    <View style={s.body}>
      <View style={s.appBub}><Text style={s.appText}>{typed}<Text style={s.caret}>▎</Text></Text></View>
      <View style={s.userBub}><Text style={s.userText}>{t('nutri_demo_meal')}</Text></View>
      <View style={s.tot}>
        <Text style={s.totK}>≈ 480 {t('cal_kcal')}</Text>
        <Text style={s.totM}>55 g {t('nutri_carbs')} · 26 g {t('nutri_protein')}</Text>
      </View>
      <Text style={s.title}>{t('nutri_locked_title')}</Text>
      <Text style={s.sub}>{t('nutri_locked_sub')}</Text>
      <TouchableOpacity style={s.cta} onPress={onCta} activeOpacity={0.8} accessibilityRole="button">
        <Text style={s.ctaText}>{ctaLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Chev({ open, color }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      <Path d={open ? 'M3 10l5-5 5 5' : 'M3 6l5 5 5-5'} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function NutritionLogger() {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const s = makeStyles(colors);
  const locale = LOCALE_MAP[language] || 'en-US';

  const [access, setAccess] = useState(null); // Premium / free days / grace week / locked (FL-41)
  const [userId, setUserId] = useState(null);
  const [recent, setRecent] = useState([]);        // last year of rows (food + day markers)
  const [detailOpen, setDetailOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [foodReminders, setFoodReminders] = useState(true); // same account pref as Settings
  const [rcStart, setRcStart] = useState(null); // open reality check { date, weightKg } or null

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const user = await getCachedUser();
    const uid = user?.id || null;
    try { setAccess((await loadFoodAccess(uid)).access); } catch { setAccess(null); }
    setUserId(uid);
    setFoodReminders(user?.user_metadata?.food_reminders !== false);
    try { setRcStart(await getRealityStart()); } catch { setRcStart(null); }
    if (uid) refresh(uid);
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
    const id = uid || userId;
    if (!id) return;
    setRecent(getFoodLogsSince(id, daysAgoISO(366)) || []); // catch-ups may be dated up to a year back
    syncFoodLogReminder().catch(() => {});
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
  // A row with nothing to fix (offline, unreadable, advice-shaped) — offer to remove it.
  function confirmRemove(row, msg) {
    Alert.alert(t('nutri_title'), msg, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('nutri_delete_entry'), style: 'destructive', onPress: () => { deleteFoodLog(row.id); requestSync?.(); refresh(userId); } },
    ]);
  }
  const openEdit = (row) => setEditRow(row);

  const today = todayISO();
  const gated = !!access && !access.canLog;
  const foodRows = foodOnly(recent);
  // The SAME figure the calculator uses (completed days of the check), plus
  // today's food so far shown separately — one number, never two "per day"s.
  // FL-3: the check's intake comes ONLY from 7+ consecutive complete days; until then, progress.
  const run = rcStart ? intakeRun(recent, String(rcStart.date).slice(0, 10), today) : null;
  const intake = run && run.ok ? run : null;
  const runLine = run ? (run.ok ? t('nutri_run_working').replace('{total}', String(run.totalKcal)).replace('{d}', String(run.days)).replace('{from}', dayLabel(run.fromISO)).replace('{to}', dayLabel(run.toISO)) : t('nutri_run_progress').replace('{n}', String(Math.min(run.current, MIN_RUN_DAYS)))) : null;
  const unlogged = rcStart ? unloggedCheckDays(recent, rcStart.date, today) : [];
  // Totals per day, per week and for the whole check, each with its working (FL-24).
  const totToday = periodTotals(recent, today, today);
  const totWeek = periodTotals(recent, daysAgoISO(6), today);
  const totWindow = rcStart && rcStart.date <= today ? periodTotals(recent, rcStart.date, today) : null;
  const todayKcal = Math.round(foodRows.filter((e) => e.entry_date === today).reduce((a, e) => a + (Number(e.kcal) || 0), 0));
  const entries = [...foodRows].sort((a, b) => (a.entry_date === b.entry_date ? (b.id || 0) - (a.id || 0) : (a.entry_date < b.entry_date ? 1 : -1)));

  function dayLabel(dateISO) {
    if (dateISO === todayISO()) return t('nutri_day_today');
    if (dateISO === daysAgoISO(1)) return t('nutri_day_yesterday');
    const d = new Date(dateISO + 'T12:00:00');
    return isNaN(d) ? dateISO : d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  const macro = (c, p) => `${Math.round(c || 0)} g ${t('nutri_carbs')} · ${Math.round(p || 0)} g ${t('nutri_protein')}`;
  const catLabel = (c) => (CATEGORIES.includes(c) ? t(`nutri_cat_${c}`) : null);

  // Locked (free days used / Premium ended, no grace week left): the upsell demo —
  // the normal Premium lock with a paywall path (FL-41).
  if (gated) {
    return (
      <View style={s.wrap}>
        <View style={s.section}>
          <Text style={s.head}>{t('nutri_title')}</Text>
          <FoodDemo ctaLabel={t('nutri_locked_cta')} onCta={() => navigation.navigate('Paywall')} />
        </View>
      </View>
    );
  }

  // Collapsed: the intake across the open reality check (what this log exists for),
  // not a day-by-day diary.
  const summary = rcStart
    ? (intake ? t('nutri_run_summary').replace('{avg}', String(intake.avgKcal)).replace('{d}', String(intake.days)) : runLine)
    : (entries.length ? t('nutri_entries_count').replace('{n}', String(entries.length)) : t('nutri_none'));

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.foldRow} activeOpacity={0.7} onPress={() => setDetailOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: detailOpen }}>
        <View style={s.grow}>
          <Text style={s.head}>{t('nutri_title')}</Text>
          {!detailOpen && <Text style={s.foot2}>{summary}</Text>}
        </View>
        <Chev open={detailOpen} color={colors.ink3} />
      </TouchableOpacity>

      {/* Detail: the check's running intake + every entry, newest first */}
      {detailOpen && (
        <View style={s.detail}>
          <View style={s.cell}>
            <Text style={s.cap2}>{t('nutri_tot_title')}</Text>
            <Text style={s.sec}>{t('nutri_tot_today').replace('{kcal}', String(totToday.kcal)).replace('{carbs}', String(totToday.carb_g)).replace('{protein}', String(totToday.protein_g))}</Text>
            <Text style={s.sec}>{t('nutri_tot_week').replace('{total}', String(totWeek.kcal)).replace('{d}', String(totWeek.days)).replace('{avg}', String(totWeek.avgKcal)).replace('{n}', String(totWeek.loggedDays))}</Text>
            {totWindow && <Text style={s.sec}>{t('nutri_tot_window').replace('{total}', String(totWindow.kcal)).replace('{d}', String(totWindow.days)).replace('{avg}', String(totWindow.avgKcal)).replace('{n}', String(totWindow.loggedDays))}</Text>}
          </View>
          {rcStart ? (
            <View style={s.cell}>
              <Text style={s.cap2}>{t('nutri_check_label')}</Text>
              {intake ? (
                <>
                  <Text style={s.val}>≈ {intake.avgKcal} <Text style={s.unit}>{t('cal_kcal')}{t('nutri_per_day')}</Text></Text>
                  <Text style={s.foot2}>{runLine}</Text>
                </>
              ) : (
                // Day counts are text only (DESIGN.md §5) — no bar.
                <Text style={s.sec}>{runLine}</Text>
              )}
              {todayKcal > 0 && <Text style={s.foot2}>{t('nutri_today_so_far').replace('{n}', String(todayKcal))}</Text>}
              <Text style={s.foot2}>{t('nutri_run_rule')}</Text>
            </View>
          ) : (
            <Text style={s.sec2}>{t('nutri_no_check')}</Text>
          )}

          {/* Past days of the check with nothing logged: mark / unmark "not recorded" (FL-3) */}
          {rcStart && unlogged.length > 0 && (
            <View>
              <View style={s.gap2}>
                <Text style={s.head}>{t('nutri_unlogged_title')}</Text>
                <Text style={s.foot2}>{t('nutri_unlogged_hint')}</Text>
              </View>
              {unlogged.map((d) => (
                <View key={d.date} style={s.row}>
                  <View style={s.grow}>
                    <Text style={s.sec}>{dayLabel(d.date)}</Text>
                    <Text style={s.foot2}>{d.notRecorded ? t('nutri_marked_not_recorded') : t('nutri_nothing_logged')}</Text>
                  </View>
                  <TouchableOpacity
                    style={[s.pill, d.notRecorded && s.pillOn]}
                    activeOpacity={0.75}
                    onPress={() => (d.notRecorded ? unmarkNotRecorded(d) : markNotRecorded(d))}
                    accessibilityRole="button"
                  >
                    <Text style={[s.pillText, d.notRecorded && s.pillTextOn]}>{d.notRecorded ? t('nutri_undo') : t('nutri_mark_not_recorded')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {entries.length > 0 && (
            <View>
              {entries.map((e) => {
                const items = safeItems(e.parsed_items);
                const pending = e.parse_status === 'pending';
                const unparsed = e.parse_status === 'unparsed';
                const refused = e.parse_status === 'refused';
                const tooOld = e.parse_status === 'too_old'; // more than 7 days back, not counted (FL-45)
                return (
                  <TouchableOpacity key={e.id} style={s.entry} activeOpacity={0.7} accessibilityRole="button" onPress={() => { if (unparsed || pending || refused || tooOld) confirmRemove(e, pending ? t('nutri_offline_saved') : refused ? t('nutri_deflect_title') : tooOld ? t('nutri_too_old') : t('nutri_unparsed')); else openEdit(e); }}>
                    {tooOld ? (
                      <Text style={s.sec2}>{e.raw_text} · {t('nutri_too_old')}</Text>
                    ) : refused ? (
                      <Text style={s.sec2}>{e.raw_text} · {t('nutri_deflect_title')}</Text>
                    ) : pending ? (
                      <Text style={s.sec2}>{e.raw_text} · {t('nutri_offline_saved')}</Text>
                    ) : unparsed ? (
                      <Text style={s.sec2}>{e.raw_text} · {t('nutri_unparsed')}</Text>
                    ) : (
                      <>
                        <Text style={s.cap2}>{dayLabel(e.entry_date)}</Text>
                        {items.map((it, i) => (
                          <View key={i} style={s.gap2}>
                            <View style={s.itemRow}>
                              <Text style={[s.sec, s.grow]}>{itemLabel(it)} · <Text style={s.mono}>~{Math.round(it.kcal || 0)}</Text> {t('cal_kcal')}</Text>
                              {catLabel(it.category) && <Text style={s.otag}>{catLabel(it.category)}</Text>}
                            </View>
                            {needsEstimateFlag(it) && <Text style={s.estFlag}>{t('nutri_estimate')}</Text>}
                          </View>
                        ))}
                        <View style={s.tot}>
                          <Text style={s.head}>≈ {Math.round(e.kcal || 0)} {t('cal_kcal')}</Text>
                          <Text style={s.foot2}>{macro(e.carb_g, e.protein_g)}</Text>
                        </View>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}

      <View style={s.remindRow}>
        <FeatureIcon name="food" size={22} color={colors.ink2} />
        <View style={[s.grow, s.gap2]}>
          <Text style={s.head}>{t('settings_food_reminders')}</Text>
          <Text style={s.foot2}>{t('settings_food_reminders_sub')}</Text>
        </View>
        <Switch
          value={foodReminders}
          onValueChange={toggleFoodReminders}
          trackColor={{ true: colors.switchTrack, false: colors.line }}
          ios_backgroundColor={colors.line}
          thumbColor={colors.raised}
          accessibilityLabel={t('settings_food_reminders')}
        />
      </View>

      <FoodEntryEditor row={editRow} onClose={() => setEditRow(null)} onSaved={() => refresh(userId)} />
    </View>
  );
}

// Graduated: this sits INSIDE the Reality check card — hairline rows and wells, never
// a card on a card; day counts are text only; selection = ink outline.
const makeStyles = (c) => StyleSheet.create({
  wrap: { gap: 0 },
  section: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12, gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  gap2: { gap: 2 },
  head: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  sec: { fontSize: 15, lineHeight: 20, color: c.ink },
  sec2: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  foot2: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  cap2: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: c.ink2 },
  val: { fontFamily: MONO['500'], fontSize: 17, lineHeight: 22, color: c.ink, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: MONO['400'], fontSize: 13, color: c.ink3 },
  mono: { fontFamily: MONO['500'], color: c.ink, fontVariant: ['tabular-nums'] },
  foldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.line },
  detail: { gap: 12, paddingBottom: 14 },
  cell: { backgroundColor: c.well, borderRadius: 14, padding: 12, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.line, marginTop: 8 },
  pill: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line, justifyContent: 'center' },
  pillOn: { borderWidth: 1.5, borderColor: c.ink, paddingHorizontal: 13.5 },
  pillText: { fontSize: 13, color: c.ink2 },
  pillTextOn: { color: c.ink, fontWeight: '600' },
  entry: { paddingVertical: 12, gap: 6, borderTopWidth: 1, borderTopColor: c.line },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  otag: { borderWidth: 1, borderColor: c.line, color: c.ink2, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 2, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  estFlag: { fontSize: 13, lineHeight: 18, color: c.attention },
  tot: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 8, marginTop: 2, gap: 2 },
  remindRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line },
});

// The demo (prototype FC-demo sheet): the app's line typing in a well bubble, the
// user's meal in an ink bubble, the totals, then the pitch and one ink action.
const makeDemoStyles = (c) => StyleSheet.create({
  body: { gap: 12 },
  appBub: { alignSelf: 'stretch', minHeight: 48, backgroundColor: c.well, borderRadius: 20, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 12 },
  appText: { fontSize: 17, lineHeight: 22, color: c.ink },
  caret: { color: c.ink3 },
  userBub: { alignSelf: 'flex-end', maxWidth: '84%', backgroundColor: c.act, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 12 },
  userText: { fontSize: 17, lineHeight: 22, color: c.onAct },
  tot: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 8, gap: 2 },
  totK: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink, fontVariant: ['tabular-nums'] },
  totM: { fontSize: 13, lineHeight: 18, color: c.ink2, fontVariant: ['tabular-nums'] },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: c.ink },
  sub: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  cta: { minHeight: 52, borderRadius: 26, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  ctaText: { color: c.onAct, fontSize: 17, fontWeight: '700' },
});
