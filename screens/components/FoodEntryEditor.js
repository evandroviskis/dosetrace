/**
 * DoseTrace — the food log's fix screen (one entry). Opened from an entry card in
 * the chat thread (FL-31) and from the Journey log list. Numbers and the day eaten
 * can be changed; items can be removed; the whole entry can be deleted.
 *
 * Founder 2026-10-02 (Q3 = C, prototype foodEditor): the day is the shared bar
 * Today / Yesterday / Earlier day (Earlier day: a stepper 2…7 days ago, lib/foodEntryDay),
 * and there are no category chips. Each item keeps the category it already has (FL-23:
 * set by the AI, drives the follow-up questions); the editor never sets or clears it.
 *
 * A value the user fixes is theirs: the item stops being an estimate (FL-9), and
 * any open or offline-pending follow-up on it is dropped (FL-28).
 *
 * Journey redesign part 23 (founder 2026-10-02, prototype foodEditor): the sheet slides up
 * from the bottom, a tap outside it cancels (as Cancel does), and each item's NAME is an
 * editable field above its kcal / carbs / protein (lib/nutrition editedItems).
 */

import { useState, useEffect, useRef } from 'react';
import { getDraft, setDraft, clearDraft } from '../../lib/draftStore';

// BK-14 / A-77: typed changes are kept per entry until Save or Cancel (app lifetime only).
export const editorDraftKey = (row) => (row ? 'foodChat:editor:' + (row.id != null ? row.id : row.local_id) : null);
import { View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { CONTENT_MAX_WIDTH } from '../../lib/responsive';
import { requestSync } from '../../lib/sync';
import { updateFoodLog, deleteFoodLog } from '../../lib/database';
import { editedItems } from '../../lib/nutrition';
import { safeItems } from '../../lib/foodThread';
import { localISO, localDaysAgoISO } from '../../lib/localDate';
import { dayChoice, pickDay, stepEarlier, earlierBounds } from '../../lib/foodEntryDay';
import { CrossMark } from '../../components/CheckMark';
import SegmentedBar from '../../components/SegmentedBar';

const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };

export default function FoodEntryEditor({ row, onClose, onSaved }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const locale = LOCALE_MAP[language] || 'en-US';
  const [items, setItems] = useState([]);
  const [date, setDate] = useState(null);
  const key = editorDraftKey(row);
  const loadedKey = useRef(null);

  useEffect(() => {
    const kept = key ? getDraft(key) : null;
    // Each copy remembers its place in the stored items, so a renamed item still compares
    // against its own original on Save.
    setItems(kept ? kept.items : (row ? safeItems(row.parsed_items).map((it, i) => ({ ...it, __orig: i })) : []));
    setDate(kept ? kept.date : (row ? row.entry_date : null));
    loadedKey.current = key;
  }, [row]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every change is kept, so a fold/unfold or a stray close never loses it.
  useEffect(() => {
    if (!key || loadedKey.current !== key) return;
    setDraft(key, { items, date });
  }, [items, date]); // eslint-disable-line react-hooks/exhaustive-deps
  const cancel = () => { if (key) clearDraft(key); onClose && onClose(); };

  const today = localISO();
  function dayLabel(dateISO) {
    if (dateISO === today) return t('nutri_day_today');
    if (dateISO === localDaysAgoISO(1)) return t('nutri_day_yesterday');
    const d = new Date(dateISO + 'T12:00:00');
    return isNaN(d) ? dateISO : d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  // Move an entry to the day it was really eaten: Today, Yesterday, or Earlier day (2…7 days
  // ago, one step at a time). Never into the future; a date is only moved by the user.
  const pickDayChoice = (k) => setDate((d) => pickDay(k, d, localISO()));
  const stepDay = (delta) => setDate((d) => stepEarlier(d, delta, localISO()));
  const bounds = date ? earlierBounds(date, today) : { canOlder: false, canNewer: false };
  const setField = (i, field, val) => setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [field]: val } : it)));
  const removeItem = (i) => setItems((p) => p.filter((_, idx) => idx !== i));
  const done = () => { if (key) clearDraft(key); requestSync?.(); onSaved && onSaved(); onClose && onClose(); };

  function save() {
    if (!row) return;
    const orig = safeItems(row.parsed_items);
    // A fixed item (name or numbers) is the user's and needs no follow-up (lib/nutrition).
    const cleaned = editedItems(orig, items);
    if (!cleaned.length) { deleteFoodLog(row.id); done(); return; }
    const sum = (k) => Math.round(cleaned.reduce((a, it) => a + (Number(it[k]) || 0), 0));
    updateFoodLog(row.id, { parsed_items: JSON.stringify(cleaned), kcal: sum('kcal'), carb_g: sum('carb_g'), protein_g: sum('protein_g'), fat_g: sum('fat_g'), entry_date: date || row.entry_date });
    done();
  }
  function remove() { if (row) { deleteFoodLog(row.id); done(); } }

  return (
    <Modal visible={!!row} transparent animationType="fade" onRequestClose={cancel}>
      {/* A bottom sheet (prototype foodEditor / FC-edit) that slides up: Cancel · title · Save,
          the day bar, then each item (its name, then its numbers), and Remove entry. A tap
          outside the sheet cancels, as Cancel does. */}
      <KeyboardAvoidingView style={s.scrim} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessibilityRole="button" accessibilityLabel={t('cancel')} />
        <Animated.View entering={SlideInDown.duration(280)} style={s.sheet}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
            <View style={s.head}>
              <TouchableOpacity onPress={cancel} style={s.side} accessibilityRole="button">
                <Text style={s.txtBtn}>{t('cancel')}</Text>
              </TouchableOpacity>
              <Text style={s.title} numberOfLines={2}>{t('nutri_edit_title')}</Text>
              <TouchableOpacity onPress={save} style={[s.side, s.sideEnd]} accessibilityRole="button">
                <Text style={s.txtBtnStrong}>{t('nutri_save')}</Text>
              </TouchableOpacity>
            </View>
            {date && (
              <SegmentedBar
                items={[
                  { key: 'today', label: t('nutri_day_today') },
                  { key: 'yesterday', label: t('nutri_day_yesterday') },
                  { key: 'earlier', label: t('nutri_day_earlier') },
                ]}
                value={dayChoice(date, today)}
                onChange={pickDayChoice}
              />
            )}
            {date && dayChoice(date, today) === 'earlier' && (
              <View style={s.stepper}>
                <TouchableOpacity style={[s.stepBtn, !bounds.canOlder && s.stepOff]} onPress={() => stepDay(-1)} disabled={!bounds.canOlder} accessibilityRole="button" accessibilityLabel={t('nutri_date_earlier')}>
                  <Chev dir="left" color={colors.ink} />
                </TouchableOpacity>
                <Text style={s.stepVal}>{dayLabel(date)}</Text>
                <TouchableOpacity style={[s.stepBtn, !bounds.canNewer && s.stepOff]} onPress={() => stepDay(1)} disabled={!bounds.canNewer} accessibilityRole="button" accessibilityLabel={t('nutri_date_later')}>
                  <Chev dir="right" color={colors.ink} />
                </TouchableOpacity>
              </View>
            )}
            {items.map((it, i) => (
              <View key={i} style={s.item}>
                <View style={s.itemHead}>
                  <TextInput
                    style={[s.input, s.nameInput]}
                    value={it.food == null ? '' : String(it.food)}
                    onChangeText={(v) => setField(i, 'food', v)}
                    placeholderTextColor={colors.ink3}
                    accessibilityLabel={t('nutri_edit_title')}
                    returnKeyType="done"
                  />
                  <TouchableOpacity style={s.del} onPress={() => removeItem(i)} accessibilityRole="button" accessibilityLabel={t('nutri_delete')}>
                    <CrossMark size={16} color={colors.ink2} />
                  </TouchableOpacity>
                </View>
                <View style={s.fields}>
                  <EditNum s={s} colors={colors} label={t('cal_kcal')} value={it.kcal} onChange={(v) => setField(i, 'kcal', v)} />
                  <EditNum s={s} colors={colors} label={t('nutri_carbs')} value={it.carb_g} onChange={(v) => setField(i, 'carb_g', v)} />
                  <EditNum s={s} colors={colors} label={t('nutri_protein')} value={it.protein_g} onChange={(v) => setField(i, 'protein_g', v)} />
                </View>
              </View>
            ))}
            <TouchableOpacity style={s.danger} onPress={remove} accessibilityRole="button">
              <Text style={s.dangerText}>{t('nutri_delete_entry')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EditNum({ s, colors, label, value, onChange }) {
  return (
    <View style={s.num}>
      <Text style={s.numLabel}>{label}</Text>
      <TextInput
        style={s.input}
        value={value == null ? '' : String(Math.round(Number(value) || 0))}
        onChangeText={onChange}
        keyboardType="number-pad"
        placeholderTextColor={colors.ink3}
        accessibilityLabel={label}
      />
    </View>
  );
}

const CHEV_PATHS = { left: 'M10 3l-5 5 5 5', right: 'M6 3l5 5-5 5' };
function Chev({ dir, color }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 16 16">
      <Path d={CHEV_PATHS[dir]} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Graduated (prototype .sheet.bsheet / .segw / .stepper / .feitem / .fe3 / .winp / .dangerbtn).
const makeStyles = (c) => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end', paddingHorizontal: 8, paddingTop: 48, paddingBottom: 30 },
  sheet: { backgroundColor: c.raised, borderRadius: 26, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', maxHeight: '100%', overflow: 'hidden' },
  body: { padding: 20, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  side: { minWidth: 52, minHeight: 44, justifyContent: 'center' },
  sideEnd: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  txtBtn: { fontSize: 17, color: c.ink },
  txtBtnStrong: { fontSize: 17, fontWeight: '600', color: c.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.raised },
  stepBtn: { width: 56, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  stepOff: { opacity: 0.35 },
  stepVal: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: c.ink },
  item: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.line },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  del: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  fields: { flexDirection: 'row', gap: 8 },
  num: { flex: 1, minWidth: 0, gap: 10 },
  numLabel: { fontSize: 13, lineHeight: 18, color: c.ink2, paddingHorizontal: 4 },
  // prototype .winp: system 17/400, tabular figures
  input: { backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, color: c.ink, fontVariant: ['tabular-nums'] },
  nameInput: { flex: 1, minWidth: 0 },
  danger: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  dangerText: { fontSize: 17, fontWeight: '600', color: c.risk },
});

