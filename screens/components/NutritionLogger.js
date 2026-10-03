/**
 * DoseTrace — food-log pieces shared by the AI food log chat and the Progress screen.
 *
 *  • FoodDemo: the animated example (prototype FC-demo) for the chat's "See how it works".
 *  • FoodReminderRow: the food-log reminder switch inside Progress › Reality check.
 *
 * Journey redesign part 8 (founder 2026-10-02): the old "Daily intake" fold of the Reality
 * check card (totals, entries, days to mark "not recorded") is replaced by the prototype's
 * "Your reality check so far" day list in CalculatorSection. Nothing logged is touched: the
 * entries stay in the food log and are fixed from the chat; markers stay in food_logs.
 *
 * Regulatory (Apple 1.4.1 / SaMD, founder AI hard line): estimates only, never advice.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AccessibilityInfo } from 'react-native';
import GradSwitch from '../../components/GradSwitch';
import { useFocusEffect } from '@react-navigation/native';
import { supabase, getCachedUser } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { syncFoodLogReminder } from '../../lib/notifications';
import FeatureIcon from '../../components/FeatureIcon';
import { DTSheet } from './ProtocolParts';

// The animated example (prototype FC-demo) — used for "See how it works" in the food
// chat and for the locked upsell here. Respects Reduce Motion (static final frame).
// Content only: the caller puts it on a sheet or inside a card.
export function FoodDemo({ ctaLabel, onCta }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = makeDemoStyles(colors);
  const [typed, setTyped] = useState('');
  const [caretOn, setCaretOn] = useState(true);
  const timers = useRef([]);
  useEffect(() => {
    let cancelled = false;
    const full = t('nutri_intro');
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) { setTyped(full); return; }
      // The caret blinks once a second (prototype caretb); a still caret with Reduce Motion.
      const blink = setInterval(() => setCaretOn((v) => !v), 500);
      timers.current.push({ blink });
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
    return () => {
      cancelled = true;
      timers.current.forEach((x) => (x && x.blink ? clearInterval(x.blink) : clearTimeout(x)));
      timers.current = [];
    };
  }, [t]);
  return (
    <View style={s.body}>
      <View style={s.appBub}><Text style={s.appText}>{typed}<Text style={caretOn ? s.caret : s.caretOff}>▎</Text></Text></View>
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

// The food-log reminder row inside the Reality check card (prototype rcCard: fork icon,
// "Food-log reminder", 8 pm note, the switch). The 20:00 question can be switched off right
// where it points to — the same account preference as Settings; a failed save reverts it.
// (Journey redesign part 8: the old "Daily intake" fold that held it is replaced by
// "Your reality check so far" in CalculatorSection; the entries stay fixable in the chat.)
export function FoodReminderRow() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [foodReminders, setFoodReminders] = useState(true);
  const [sheet, setSheet] = useState(null); // DoseTrace sheet instead of a native alert (M4)
  useFocusEffect(useCallback(() => {
    let alive = true;
    getCachedUser().then((user) => { if (alive) setFoodReminders(user?.user_metadata?.food_reminders !== false); }).catch(() => {});
    return () => { alive = false; };
  }, []));
  async function toggleFoodReminders(val) {
    setFoodReminders(val);
    let error = null;
    try { ({ error } = await supabase.auth.updateUser({ data: { food_reminders: val } })); } catch (e) { error = e; }
    if (error) {
      setFoodReminders(!val);
      setSheet({ icon: 'warning', title: t('error'), body: friendlyError(error, t, 'error_save_failed'), buttons: [{ label: t('ok'), kind: 'primary' }] });
      return;
    }
    syncFoodLogReminder().catch(() => {});
  }
  return (
    <View style={s.remindRow}>
      <FeatureIcon name="food" size={22} color={colors.ink2} />
      <View style={[s.grow, s.gap2]}>
        <Text style={s.head}>{t('settings_food_reminders')}</Text>
        <Text style={s.foot2}>{t('settings_food_reminders_sub')}</Text>
      </View>
      <GradSwitch
        value={foodReminders}
        onValueChange={toggleFoodReminders}
        accessibilityLabel={t('settings_food_reminders')}
      />
      <DTSheet config={sheet} onClose={() => setSheet(null)} />
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  gap2: { gap: 2 },
  head: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  foot2: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  // prototype .row.sep (padding-top 12, a 1 pt line above, gap 12)
  remindRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line },
});

// The demo (prototype FC-demo sheet): the app's line typing in a well bubble, the
// user's meal in an ink bubble, the totals, then the pitch and one ink action.
const makeDemoStyles = (c) => StyleSheet.create({
  body: { gap: 14 },
  appBub: { alignSelf: 'flex-start', maxWidth: '100%', minHeight: 48, backgroundColor: c.well, borderRadius: 20, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 12 },
  appText: { fontSize: 17, lineHeight: 22, color: c.ink },
  caret: { color: c.ink3 },
  caretOff: { color: c.well }, // the caret's blink-off frame: the bubble colour
  userBub: { alignSelf: 'flex-end', maxWidth: '84%', backgroundColor: c.act, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 12 },
  userText: { fontSize: 17, lineHeight: 22, color: c.onAct },
  tot: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 8, marginTop: 2, gap: 2 },
  totK: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink, fontVariant: ['tabular-nums'] },
  totM: { fontSize: 13, lineHeight: 18, color: c.ink2, fontVariant: ['tabular-nums'] },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: c.ink },
  sub: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  cta: { minHeight: 52, borderRadius: 26, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  ctaText: { color: c.onAct, fontSize: 17, fontWeight: '700' },
});
