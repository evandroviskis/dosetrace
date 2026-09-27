/**
 * DoseTrace — food log on Journey (FL-32/34). A compact hero (placed before the
 * Reality check) that opens the ONE food chat ('FoodChat' modal route, FL-37),
 * plus the log's collapsible detail: totals per day / 7 days / whole check
 * (FL-24), the reality check's intake with its working, past days to mark "not
 * recorded" (FL-3), and every entry (tap → the same fix screen as the chat).
 * The conversation itself (composer, questions, follow-ups, day closing) lives
 * ONLY in screens/FoodChatScreen.js. First 3 logged days are free, then Premium.
 *
 * Regulatory (Apple 1.4.1 / SaMD, founder AI hard line): estimates only, never
 * advice; the only model text on screen is short food/unit names.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Modal, AccessibilityInfo, Switch } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase, getCachedUser } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { isPremium } from '../../lib/purchases';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { CONTENT_MAX_WIDTH } from '../../lib/responsive';
import { requestSync } from '../../lib/sync';
import { getFoodLogsSince, getFoodLogDayCount, deleteFoodLog, insertFoodDayMarker } from '../../lib/database';
import {
  checkIntake, unloggedCheckDays, foodOnly, CATEGORIES, itemLabel, needsEstimateFlag, periodTotals,
} from '../../lib/nutrition';
import { safeItems } from '../../lib/foodThread';
import { getRealityStart } from '../../lib/realityCheck';
import { localISO, localDaysAgoISO } from '../../lib/localDate';
import { syncFoodLogReminder } from '../../lib/notifications';
import FeatureIcon from '../../components/FeatureIcon';
import FoodLogHero from './FoodLogHero';
import FoodEntryEditor from './FoodEntryEditor';

const FREE_DAYS = 3;
const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };
const todayISO = () => localISO();
const daysAgoISO = (n) => localDaysAgoISO(n);

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
  const s = makeStyles(colors);
  const locale = LOCALE_MAP[language] || 'en-US';

  const [premium, setPremium] = useState(false);
  const [userId, setUserId] = useState(null);
  const [recent, setRecent] = useState([]);        // last year of rows (food + day markers)
  const [dayCount, setDayCount] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [foodReminders, setFoodReminders] = useState(true); // same account pref as Settings
  const [rcStart, setRcStart] = useState(null); // open reality check { date, weightKg } or null

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    setPremium(await isPremium());
    const user = await getCachedUser();
    const uid = user?.id || null;
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
    setDayCount(getFoodLogDayCount(id));
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
  const gated = !premium && dayCount >= FREE_DAYS;
  const foodRows = foodOnly(recent);
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
  const entries = [...foodRows].sort((a, b) => (a.entry_date === b.entry_date ? (b.id || 0) - (a.id || 0) : (a.entry_date < b.entry_date ? 1 : -1)));

  function dayLabel(dateISO) {
    if (dateISO === todayISO()) return t('nutri_day_today');
    if (dateISO === daysAgoISO(1)) return t('nutri_day_yesterday');
    const d = new Date(dateISO + 'T12:00:00');
    return isNaN(d) ? dateISO : d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  const macro = (c, p) => `${Math.round(c || 0)} g ${t('nutri_carbs')} · ${Math.round(p || 0)} g ${t('nutri_protein')}`;
  const catLabel = (c) => (CATEGORIES.includes(c) ? t(`nutri_cat_${c}`) : null);

  // Gated (post-trial, non-premium): the upsell demo replaces the hero.
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

      {/* The food log hero — opens the one chat (FL-32/37) */}
      <FoodLogHero variant="journey" onChanged={() => load()} />

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
                  const refused = e.parse_status === 'refused';
                  return (
                    <TouchableOpacity key={e.id} style={s.entryCard} activeOpacity={0.7} onPress={() => { if (unparsed || pending || refused) confirmRemove(e, pending ? t('nutri_offline_saved') : refused ? t('nutri_deflect_title') : t('nutri_unparsed')); else openEdit(e); }}>
                      {refused ? (
                        <Text style={s.pendingText}>{e.raw_text} · {t('nutri_deflect_title')}</Text>
                      ) : pending ? (
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

      <FoodEntryEditor row={editRow} onClose={() => setEditRow(null)} onSaved={() => refresh(userId)} />
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  wrap: { marginTop: 22 },
  secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginHorizontal: 2 },
  section: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: c.textMuted },
  secChev: { fontSize: 14, color: c.textFaint },
  // composer
  remindRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 4, borderTopWidth: 0.5, borderTopColor: c.border, marginBottom: 6 },
  remindLabel: { fontSize: 13, fontWeight: '600', color: c.text },
  remindSub: { fontSize: 11.5, color: c.textMuted, marginTop: 2, lineHeight: 15 },
  howRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12 },
  howText: { fontSize: 13, fontWeight: '700', color: c.accent },
  // deflect
  // tap-to-fix hint (a correction/non-food message → point at the edit modal)
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
  entryDate: { fontSize: 11, fontWeight: '700', color: c.textMuted, marginBottom: 4 },
  entryCard: { paddingHorizontal: 13, paddingVertical: 11, borderTopWidth: 0.5, borderTopColor: c.border },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 3, gap: 10 },
  entryFood: { fontSize: 13, color: c.text, flex: 1 },
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
  // 20:00 question card (opened from the reminder)
  // follow-up card
  // offline-refused entry (kept, with Remove)
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
});
