// "Your meals" (docs/specs/meal-reminders.md MR-1..MR-4; picture docs/design/food-goals-progress.html
// part 4 a): which meals the person eats, so the food reminders come 1 hour after each one. Asked
// right after a Reality check starts when nothing was chosen yet, and changed later from the food
// reminder rows (the Reality check card and Settings). "Not now" closes without writing: the single
// 20:00 question stays. The choice lives in the account (user_metadata.food_meals, ONE top-level
// key — the metadata merge keeps every other key), never on the phone alone. Theme tokens only.
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import Modal from '../../components/PresenceModal';
import { useFocusEffect } from '@react-navigation/native';
import { supabase, getCachedUser } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { errorSheet } from '../../lib/errorSheet';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { syncAllNotifications } from '../../lib/notifications';
import { normalizeMeals, presetMeals, cleanMeals, mealChoicePayload, nextMealTime, MAX_MEALS, MEAL_PLANS, onMealsChanged, emitMealsChanged } from '../../lib/mealReminders';
import { formatTime, pickerButtons, pickerIs24Hour } from '../../lib/timeFormat';
import { timeColumns, timeAfter } from '../../lib/wheelPick';
import { pluralKey } from '../../lib/plural';
import { useSheetGap } from '../../components/useSheetInset';
import RowChevron from '../../components/RowChevron';
import { DTSheet, DTPickerSheet, DTWheel, SystemPicker } from './ProtocolParts';

// MR-3: ask at the start of a Reality check only when nothing is chosen and food reminders are on.
export function shouldAskMeals(meta) {
  const m = meta || {};
  if (m.food_reminders === false) return false;
  return !normalizeMeals(m.food_meals);
}

const COUNTS = { three: 3, five: 5, every3h: 6 };

export default function MealTimesSheet({ visible, onClose, onSaved }) {
  const { t, language, timeFormat } = useLanguage();
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const gap = useSheetGap(30);
  const [plan, setPlan] = useState('three');
  const [custom, setCustom] = useState(presetMeals('three'));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(null); // index of the custom time being changed

  // Opens on the saved choice (or the design's first option).
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    getCachedUser().then((user) => {
      if (!alive) return;
      const saved = normalizeMeals(user?.user_metadata?.food_meals);
      setPlan(saved ? saved.plan : 'three');
      setCustom(saved && saved.plan === 'custom' ? saved.meals : presetMeals('three'));
    }).catch(() => {});
    return () => { alive = false; };
  }, [visible]);

  const label = (m) => t(`meal_kind_${m.kind}`);
  const time = (at) => formatTime(at, language, timeFormat);

  async function save() {
    const payload = mealChoicePayload(plan, plan === 'custom' ? custom : null);
    if (!payload || saving) return;
    setSaving(true);
    let error = null;
    try { ({ error } = await supabase.auth.updateUser({ data: payload })); } catch (e) { error = e; }
    if (error) { setErr(errorSheet(t, 'save', friendlyError(error, t, 'error_save_failed'))); setSaving(false); return; }
    setSaving(false);
    syncAllNotifications().catch(() => {});
    const saved = normalizeMeals(payload.food_meals);
    emitMealsChanged(saved);
    if (onSaved) onSaved(saved);
    onClose();
  }

  // A time already taken by another meal is not applied (two meals never merge into one). The list
  // is put back in clock order when the picker closes, so the row being changed never moves under it.
  function setTime(i, at) {
    setCustom((list) => (list.some((m, k) => k !== i && m.at === at) ? list : list.map((m, k) => (k === i ? { ...m, at } : m))));
  }
  function doneEditing() {
    setEditing(null);
    setCustom((list) => cleanMeals(list));
  }
  function addMeal() {
    const at = nextMealTime(custom);
    if (!at || custom.length >= MAX_MEALS) return;
    setCustom((list) => cleanMeals([...list, { at, kind: 'meal' }]));
  }
  function removeMeal(i) {
    setCustom((list) => (list.length > 1 ? list.filter((_, k) => k !== i) : list));
  }

  const wheel12h = !/13/.test(formatTime('13:00', language, timeFormat));
  const dayParts = [
    formatTime('09:00', language, '12h').replace(/\d{1,2}[:.]\d{2}/, '').trim() || 'AM',
    formatTime('21:00', language, '12h').replace(/\d{1,2}[:.]\d{2}/, '').trim() || 'PM',
  ];
  const editAt = editing != null && custom[editing] ? custom[editing].at : '12:00';

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.scrim, { paddingBottom: gap }]}>
        <View style={s.sheet} accessibilityViewIsModal>
          <ScrollView bounces={false} contentContainerStyle={s.body}>
            <Text style={s.title} accessibilityRole="header">{t('meal_sheet_title')}</Text>
            <Text style={s.sub}>{t('meal_sheet_sub')}</Text>
            <View style={s.opts}>
              {MEAL_PLANS.map((p) => {
                const on = plan === p;
                const n = COUNTS[p];
                return (
                  <TouchableOpacity key={p} style={[s.opt, on && s.optOn]} onPress={() => setPlan(p)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                    <Text style={s.optLabel}>{t(`meal_plan_${p}`)}</Text>
                    {n ? <Text style={s.optCount}>{t(pluralKey('meal_count', n, language)).replace('{n}', String(n))}</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
            {plan === 'custom' ? (
              <View style={s.times}>
                {custom.map((m, i) => (
                  <View key={`${m.at}-${i}`} style={s.tm}>
                    <Text style={s.tmLabel}>{label(m)}</Text>
                    <TouchableOpacity onPress={() => setEditing(i)} style={s.tmTimeHit} accessibilityRole="button" accessibilityLabel={`${label(m)} ${time(m.at)}`}>
                      <Text style={s.tmTime}>{time(m.at)}</Text>
                    </TouchableOpacity>
                    {custom.length > 1 ? (
                      <TouchableOpacity onPress={() => removeMeal(i)} style={s.tmRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('meal_remove').replace('{meal}', label(m))}>
                        <Text style={s.tmRemoveText}>×</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))}
                {custom.length < MAX_MEALS ? (
                  <TouchableOpacity onPress={addMeal} style={s.link} accessibilityRole="button">
                    <Text style={s.linkText}>{t('meal_add')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            <TouchableOpacity style={[s.btn, saving && s.btnDim]} onPress={save} disabled={saving} accessibilityRole="button">
              <Text style={s.btnText}>{t('meal_continue')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.link} onPress={onClose} accessibilityRole="button"><Text style={s.linkText}>{t('meal_not_now')}</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </View>
      {Platform.OS === 'ios' ? (
        <DTPickerSheet visible={editing != null} title={editing != null && custom[editing] ? label(custom[editing]) : ''} doneLabel={t('done')} onDone={doneEditing}>
          <DTWheel
            columns={timeColumns(editAt, wheel12h, dayParts)}
            onChange={(col, i) => { const idx = editing; if (idx != null) setTime(idx, timeAfter(editAt, wheel12h, col, i)); }}
          />
        </DTPickerSheet>
      ) : editing != null ? (
        <SystemPicker
          {...pickerButtons(t)}
          value={(() => { const [h, m] = editAt.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d; })()}
          mode="time"
          is24Hour={pickerIs24Hour(timeFormat, language)}
          display="default"
          onChange={(event, d) => {
            const idx = editing;
            if (event.type !== 'dismissed' && d && idx != null) setTime(idx, `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
            doneEditing();
          }}
        />
      ) : null}
      <DTSheet config={err} onClose={() => setErr(null)} />
    </Modal>
  );
}

// MR-4: the row where the choice is changed later (the Reality check card's food reminder row and
// Settings). Shows the chosen option and its times, or that the single 8 pm question is on.
export function MealTimesRow({ onChange, variant = 'card' }) {
  const { t, language, timeFormat } = useLanguage();
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const [choice, setChoice] = useState(null);
  const [open, setOpen] = useState(false);
  const changed = useRef(onChange); // a parent's inline callback never re-runs the read
  changed.current = onChange;
  const tell = (n) => { if (changed.current) changed.current(n); };
  const load = useCallback(() => {
    let alive = true;
    getCachedUser().then((user) => {
      if (!alive) return;
      const n = normalizeMeals(user?.user_metadata?.food_meals);
      setChoice(n);
      tell(n);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useFocusEffect(load);
  useEffect(() => onMealsChanged((n) => { setChoice(n); tell(n); }), []);
  const summary = choice
    ? `${t(`meal_plan_${choice.plan}`)} · ${choice.meals.map((m) => formatTime(m.at, language, timeFormat)).join(', ')}`
    : t('meal_row_none');
  return (
    <>
      <TouchableOpacity style={variant === 'settings' ? s.rowSettings : s.rowCard} onPress={() => setOpen(true)} accessibilityRole="button">
        <View style={s.grow}>
          <Text style={variant === 'settings' ? s.rowLabelSettings : s.rowLabel}>{t('meal_sheet_title')}</Text>
          <Text style={s.rowSub}>{summary}</Text>
        </View>
        <RowChevron color={c.tick} />
      </TouchableOpacity>
      <MealTimesSheet visible={open} onClose={() => setOpen(false)} onSaved={(n) => { setChoice(n); tell(n); }} />
    </>
  );
}

const makeStyles = (c) => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end', paddingHorizontal: 8, paddingTop: 8 },
  sheet: { backgroundColor: c.raised, borderRadius: 26, width: '100%', maxWidth: 520, alignSelf: 'center', maxHeight: '92%' },
  body: { padding: 20, gap: 12 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: c.ink },
  sub: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  opts: { gap: 8 },
  // prototype .opt / .opt.on: a well row, the chosen one outlined in ink (selection = ink outline)
  opt: { minHeight: 52, borderRadius: 16, backgroundColor: c.well, borderWidth: 2, borderColor: c.well, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  optOn: { borderColor: c.ink },
  optLabel: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  optCount: { fontSize: 15, lineHeight: 20, color: c.ink2, fontVariant: ['tabular-nums'] },
  times: { gap: 2, paddingHorizontal: 4 },
  tm: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: c.line },
  tmLabel: { flex: 1, fontSize: 17, lineHeight: 22, color: c.ink2 },
  tmTimeHit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  tmTime: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: c.ink, fontVariant: ['tabular-nums'] },
  tmRemove: { minWidth: 28, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  tmRemoveText: { fontSize: 20, lineHeight: 24, color: c.ink3 },
  link: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontSize: 17, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
  btn: { minHeight: 48, borderRadius: 26, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 4 },
  btnDim: { opacity: 0.5 },
  btnText: { fontSize: 16, fontWeight: '700', color: c.onAct },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line },
  rowSettings: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, minHeight: 60, paddingVertical: 10, paddingLeft: 40, borderBottomWidth: 1, borderBottomColor: c.line },
  rowLabel: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  rowLabelSettings: { fontSize: 17, color: c.ink },
  rowSub: { fontSize: 13, lineHeight: 18, color: c.ink2 },
});
