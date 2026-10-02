/**
 * DoseTrace — one vaccine, read on the My Body right page (S-26 book layout, BK-18).
 *
 * Founder decision 6 (2026-10-01): on an unfolded foldable, tapping a vaccine on the left page
 * opens this READ page on the right: the vaccine name as the title, then one row per detail
 * the user filled in (empty ones are left out), with the labels of the add/edit sheet. "Edit"
 * opens today's edit sheet. On a phone none of this exists: a tap opens the sheet (BK-2).
 *
 * It only shows what the user typed — no schedules, no advice (see VaccinesSection.js).
 * Theme tokens only, both palettes.
 */

import { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { CONTENT_MAX_WIDTH } from '../../lib/responsive';

const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };

// The read rows, in the add/edit sheet's order: only the fields with a value. `label` is the
// sheet's own i18n key; dates are formatted by the caller. Pure (tested in bookBody.test.js).
function vaccineRows(v) {
  if (!v) return [];
  const filled = (x) => x !== null && x !== undefined && String(x).trim() !== '';
  const rows = [
    { label: 'vax_date_given', value: v.date_given, date: true },
    { label: 'vax_next_due', value: v.next_due, date: true },
    { label: 'vax_manufacturer', value: v.manufacturer },
    { label: 'vax_dose_number', value: v.dose_number },
    { label: 'vax_batch_lot', value: v.batch_lot },
    { label: 'vax_provider', value: v.provider },
    { label: 'vax_location', value: v.location },
    { label: 'vax_notes', value: v.notes, long: true },
  ];
  return rows
    .filter((r) => filled(r.value))
    .map((r) => ({ label: r.label, value: String(r.value).trim(), date: !!r.date, long: !!r.long }));
}

export default function VaccinePage({ vaccine, onEdit }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const locale = LOCALE_MAP[language] || 'en-US';

  function formatDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' });
  }

  const rows = vaccineRows(vaccine);
  return (
    <ScrollView showsVerticalScrollIndicator={false} style={s.scroll} contentContainerStyle={[s.centered, s.scrollPad]}>
      {/* BK-21: the title is the first thing the screen reader reaches on this page. */}
      <View style={s.titleRow}>
        <Text style={[s.screenTitle, s.grow]} accessibilityRole="header">{vaccine.name}</Text>
        <TouchableOpacity style={s.editBtn} onPress={onEdit} accessibilityRole="button">
          <Text style={s.editBtnText}>{t('protocols_edit')}</Text>
        </TouchableOpacity>
      </View>

      {rows.length > 0 && (
        <View style={s.list}>
          {rows.map((r, i) => (r.long ? (
            <View key={r.label} style={[s.liLong, i > 0 && s.liLine]}>
              <Text style={s.sec}>{t(r.label)}</Text>
              <Text style={s.body}>{r.value}</Text>
            </View>
          ) : (
            <View key={r.label} style={[s.li, i > 0 && s.liLine]}>
              <Text style={[s.sec, s.label]}>{t(r.label)}</Text>
              <Text style={[s.body, s.val, s.tnum]}>{r.date ? formatDate(r.value) : r.value}</Text>
            </View>
          )))}
        </View>
      )}

      <Text style={[s.foot, s.padX]}>{t('vax_disclaimer')}</Text>
    </ScrollView>
  );
}

// Graduated, like the lab test detail (BodyScreen labsGraduated): large title, the one ink
// capsule beside it, the values in one raised list with hairline rows. Theme tokens only.
const makeStyles = (c) => StyleSheet.create({
  scroll: { flex: 1 },
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  scrollPad: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, paddingBottom: 2 },
  screenTitle: { fontSize: 30, fontWeight: '700', color: c.ink, letterSpacing: -0.75, lineHeight: 36 },
  grow: { flex: 1, minWidth: 0 },
  editBtn: { backgroundColor: c.act, paddingHorizontal: 16, minHeight: 40, borderRadius: 20, justifyContent: 'center' },
  editBtnText: { color: c.onAct, fontSize: 15, fontWeight: '700' },
  list: { backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 16 },
  li: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  liLong: { gap: 4, minHeight: 56, paddingVertical: 12 },
  liLine: { borderTopWidth: 1, borderTopColor: c.line },
  label: { flexShrink: 0, maxWidth: '50%' },
  val: { flex: 1, minWidth: 0, textAlign: 'right' },
  body: { fontSize: 17, color: c.ink, lineHeight: 22 },
  sec: { fontSize: 15, color: c.ink2, lineHeight: 20 },
  foot: { fontSize: 13, color: c.ink2, lineHeight: 18 },
  tnum: { fontVariant: ['tabular-nums'] },
  padX: { paddingHorizontal: 4 },
});
