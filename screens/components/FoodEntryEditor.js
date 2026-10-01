/**
 * DoseTrace — the food log's fix screen (one entry). Opened from an entry card in
 * the chat thread (FL-31) and from the Journey log list. Numbers, category
 * (meal/snack/drink/supplement, FL-23) and the day eaten can be changed; items
 * can be removed; the whole entry can be deleted.
 *
 * A value the user fixes is theirs: the item stops being an estimate (FL-9), and
 * any open or offline-pending follow-up on it is dropped (FL-28).
 */

import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { CONTENT_MAX_WIDTH } from '../../lib/responsive';
import { MONO } from '../../lib/fonts';
import { requestSync } from '../../lib/sync';
import { updateFoodLog, deleteFoodLog } from '../../lib/database';
import { CATEGORIES, itemLabel } from '../../lib/nutrition';
import { safeItems } from '../../lib/foodThread';
import { localISO, localDaysAgoISO } from '../../lib/localDate';
import { CrossMark } from '../../components/CheckMark';

const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };
const numOr = (v, d = 0) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };

export default function FoodEntryEditor({ row, onClose, onSaved }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const locale = LOCALE_MAP[language] || 'en-US';
  const [items, setItems] = useState([]);
  const [date, setDate] = useState(null);

  useEffect(() => {
    setItems(row ? safeItems(row.parsed_items).map((it) => ({ ...it })) : []);
    setDate(row ? row.entry_date : null);
  }, [row]);

  const today = localISO();
  function dayLabel(dateISO) {
    if (dateISO === today) return t('nutri_day_today');
    if (dateISO === localDaysAgoISO(1)) return t('nutri_day_yesterday');
    const d = new Date(dateISO + 'T12:00:00');
    return isNaN(d) ? dateISO : d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  // Move an entry to the day it was really eaten (never into the future).
  function shiftDate(delta) {
    setDate((d) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + delta); const n = localISO(x); return n > localISO() ? d : n; });
  }
  const setField = (i, field, val) => setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [field]: val } : it)));
  const removeItem = (i) => setItems((p) => p.filter((_, idx) => idx !== i));
  const done = () => { requestSync?.(); onSaved && onSaved(); onClose && onClose(); };

  function save() {
    if (!row) return;
    const orig = safeItems(row.parsed_items);
    const cleaned = items.map((it) => {
      const next = { ...it, kcal: numOr(it.kcal), carb_g: numOr(it.carb_g), protein_g: numOr(it.protein_g) };
      const o = orig.find((x) => x && x.food === it.food) || {};
      const changed = numOr(o.kcal) !== next.kcal || numOr(o.carb_g) !== next.carb_g || numOr(o.protein_g) !== next.protein_g || (o.category || null) !== (next.category || null);
      if (changed) {
        next.confidence = 'user';
        // A fixed item needs no follow-up: close an open one, drop an offline answer.
        if (next.ask && !next.ask_done) next.ask_skipped = true;
        delete next.ask_pending;
      }
      return next;
    });
    if (!cleaned.length) { deleteFoodLog(row.id); done(); return; }
    const sum = (k) => Math.round(cleaned.reduce((a, it) => a + (Number(it[k]) || 0), 0));
    updateFoodLog(row.id, { parsed_items: JSON.stringify(cleaned), kcal: sum('kcal'), carb_g: sum('carb_g'), protein_g: sum('protein_g'), fat_g: sum('fat_g'), entry_date: date || row.entry_date });
    done();
  }
  function remove() { if (row) { deleteFoodLog(row.id); done(); } }

  return (
    <Modal visible={!!row} transparent animationType="fade" onRequestClose={onClose}>
      {/* A bottom sheet (prototype foodEditor / FC-edit): Cancel · title · Save, the day,
          then each item with its numbers and category, and Remove entry. */}
      <KeyboardAvoidingView style={s.scrim} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheet}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
            <View style={s.head}>
              <TouchableOpacity onPress={onClose} style={s.side} accessibilityRole="button">
                <Text style={s.txtBtn}>{t('cancel')}</Text>
              </TouchableOpacity>
              <Text style={s.title} numberOfLines={2}>{t('nutri_edit_title')}</Text>
              <TouchableOpacity onPress={save} style={[s.side, s.sideEnd]} accessibilityRole="button">
                <Text style={s.txtBtnStrong}>{t('nutri_save')}</Text>
              </TouchableOpacity>
            </View>
            {date && (
              <View style={s.stepper}>
                <TouchableOpacity style={s.stepBtn} onPress={() => shiftDate(-1)} accessibilityRole="button" accessibilityLabel={t('nutri_date_earlier')}>
                  <Chev dir="left" color={colors.ink} />
                </TouchableOpacity>
                <Text style={s.stepVal}>{dayLabel(date)}</Text>
                <TouchableOpacity style={[s.stepBtn, date >= today && s.stepOff]} onPress={() => shiftDate(1)} disabled={date >= today} accessibilityRole="button" accessibilityLabel={t('nutri_date_later')}>
                  <Chev dir="right" color={colors.ink} />
                </TouchableOpacity>
              </View>
            )}
            {items.map((it, i) => (
              <View key={i} style={s.item}>
                <View style={s.itemHead}>
                  <Text style={s.food} numberOfLines={1}>{itemLabel(it)}</Text>
                  <TouchableOpacity style={s.del} onPress={() => removeItem(i)} accessibilityRole="button" accessibilityLabel={t('nutri_delete')}>
                    <CrossMark size={16} color={colors.ink2} />
                  </TouchableOpacity>
                </View>
                <View style={s.fields}>
                  <EditNum s={s} colors={colors} label={t('cal_kcal')} value={it.kcal} onChange={(v) => setField(i, 'kcal', v)} />
                  <EditNum s={s} colors={colors} label={t('nutri_carbs')} value={it.carb_g} onChange={(v) => setField(i, 'carb_g', v)} />
                  <EditNum s={s} colors={colors} label={t('nutri_protein')} value={it.protein_g} onChange={(v) => setField(i, 'protein_g', v)} />
                </View>
                <View style={s.cats}>
                  {CATEGORIES.map((c) => {
                    const on = it.category === c;
                    return (
                      <TouchableOpacity key={c} style={[s.cat, on && s.catOn]} onPress={() => setField(i, 'category', c)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                        <Text style={[s.catText, on && s.catTextOn]}>{t(`nutri_cat_${c}`)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
            <TouchableOpacity style={s.danger} onPress={remove} accessibilityRole="button">
              <Text style={s.dangerText}>{t('nutri_delete_entry')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
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

// Graduated (prototype .sheet.bsheet / .stepper / .feitem / .fe3 / .winp / .pill / .dangerbtn).
const makeStyles = (c) => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end', paddingHorizontal: 8, paddingTop: 48, paddingBottom: 30 },
  sheet: { backgroundColor: c.raised, borderRadius: 26, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', maxHeight: '100%', overflow: 'hidden' },
  body: { padding: 20, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  side: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
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
  food: { flex: 1, fontSize: 17, lineHeight: 22, color: c.ink },
  del: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  fields: { flexDirection: 'row', gap: 8 },
  num: { flex: 1, minWidth: 0, gap: 6 },
  numLabel: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  input: { backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: 14, minHeight: 50, paddingHorizontal: 12, paddingVertical: 12, fontSize: 17, color: c.ink, fontFamily: MONO['500'] },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line, justifyContent: 'center' },
  catOn: { borderWidth: 1.5, borderColor: c.ink, paddingHorizontal: 13.5 },
  catText: { fontSize: 13, color: c.ink2 },
  catTextOn: { color: c.ink, fontWeight: '600' },
  danger: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  dangerText: { fontSize: 17, fontWeight: '600', color: c.risk },
});

