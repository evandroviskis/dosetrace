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
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { CONTENT_MAX_WIDTH } from '../../lib/responsive';
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
      <View style={s.wrap}>
        <View style={s.card}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>
            <Text style={s.title}>{t('nutri_edit_title')}</Text>
            {date && (
              <View style={s.dateRow}>
                <TouchableOpacity onPress={() => shiftDate(-1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('nutri_date_earlier')}>
                  <Text style={s.dateArrow}>‹</Text>
                </TouchableOpacity>
                <Text style={s.dateText}>{dayLabel(date)}</Text>
                <TouchableOpacity onPress={() => shiftDate(1)} disabled={date >= today} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('nutri_date_later')}>
                  <Text style={[s.dateArrow, date >= today && { opacity: 0.3 }]}>›</Text>
                </TouchableOpacity>
              </View>
            )}
            {items.map((it, i) => (
              <View key={i} style={s.item}>
                <Text style={s.food} numberOfLines={1}>{itemLabel(it)}</Text>
                <View style={s.fields}>
                  <EditNum s={s} colors={colors} label={t('cal_kcal')} value={it.kcal} onChange={(v) => setField(i, 'kcal', v)} />
                  <EditNum s={s} colors={colors} label={t('nutri_carbs')} value={it.carb_g} onChange={(v) => setField(i, 'carb_g', v)} />
                  <EditNum s={s} colors={colors} label={t('nutri_protein')} value={it.protein_g} onChange={(v) => setField(i, 'protein_g', v)} />
                  <TouchableOpacity style={s.del} onPress={() => removeItem(i)} accessibilityRole="button" accessibilityLabel={t('nutri_delete')}><CrossMark style={s.delX} /></TouchableOpacity>
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
          </ScrollView>
          <TouchableOpacity style={s.save} onPress={save}><Text style={s.saveText}>{t('nutri_save')}</Text></TouchableOpacity>
          <View style={s.foot}>
            <TouchableOpacity onPress={onClose}><Text style={s.cancel}>{t('cancel')}</Text></TouchableOpacity>
            <TouchableOpacity onPress={remove}><Text style={s.delete}>{t('nutri_delete_entry')}</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function EditNum({ s, colors, label, value, onChange }) {
  return (
    <View style={s.num}>
      <TextInput
        style={s.input}
        value={value == null ? '' : String(Math.round(Number(value) || 0))}
        onChangeText={onChange}
        keyboardType="number-pad"
        placeholderTextColor={colors.textFaint}
      />
      <Text style={s.numLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center', padding: 22 },
  card: { backgroundColor: c.card, borderRadius: 18, padding: 16, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 12 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 10 },
  dateArrow: { fontSize: 22, fontWeight: '600', color: c.accent, paddingHorizontal: 6 },
  dateText: { fontSize: 14, fontWeight: '700', color: c.text, minWidth: 120, textAlign: 'center' },
  item: { marginBottom: 12 },
  food: { fontSize: 13, fontWeight: '600', color: c.text, marginBottom: 6 },
  fields: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  num: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  input: { flex: 1, backgroundColor: c.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14, color: c.text, borderWidth: 0.5, borderColor: c.border, textAlign: 'center' },
  numLabel: { fontSize: 10, fontWeight: '700', color: c.textFaint },
  del: { padding: 6 },
  delX: { fontSize: 14, color: c.textFaint },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  cat: { borderRadius: 12, borderWidth: 0.5, borderColor: c.border, backgroundColor: c.bg, paddingHorizontal: 9, paddingVertical: 4 },
  catOn: { backgroundColor: c.accent, borderColor: c.accent },
  catText: { fontSize: 11.5, fontWeight: '600', color: c.textMuted },
  catTextOn: { color: c.accentText },
  save: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  saveText: { color: c.accentText, fontWeight: '700', fontSize: 14 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  cancel: { fontSize: 13, fontWeight: '600', color: c.textMuted },
  delete: { fontSize: 13, fontWeight: '700', color: c.danger || c.warningSoftText },
});
