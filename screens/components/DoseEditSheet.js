// AD-95 / F2 (founder 2026-10-26, picture docs/design/f2-dose-time-edit.html, columns 3 and 4): the two
// corrections a Taken dose offers from its Dose log sheet.
//   mode 'time' — "Alterar horário": the day and the time the dose was really given (never later
//     than now); the curve follows it.
//   mode 'dose' — "Alterar dose": this dose's own amount, in its own unit; only this dose changes.
// Graduated sheet look (the dose sheet's), theme tokens only; on iPhone the number pad never covers
// Save (KeyboardAvoidingView + a tap outside the field closes it — the vial-window lesson).
import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Pressable, Platform, KeyboardAvoidingView, Keyboard, TouchableWithoutFeedback, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Modal from '../../components/PresenceModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatTime, hour12Pref, LOCALES } from '../../lib/timeFormat';
import { formatDate, formatNumber } from '../../lib/localeFormat';
import { checkEditedTime, combineDateTime, parseDoseEdit, unitForDoseEdit } from '../../lib/doseEdit';

// The local "HH:MM" of a moment, for formatTime.
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// edit: { mode, log, name, when } or null (when: the Dose log's "Ontem, 08:00"). onSave(mode, value): value = an ISO time or { amount, unit }.
export default function DoseEditSheet({ edit, onClose, onSave }) {
  const { colors, isDark } = useTheme();
  const { t, language, timeFormat } = useLanguage();
  const insets = useSafeAreaInsets();
  const s = styles(colors);
  const [at, setAt] = useState(Date.now());
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [androidPicker, setAndroidPicker] = useState(null); // 'date' | 'time' | null

  useEffect(() => {
    if (!edit) return;
    const ms = Date.parse(edit.log.logged_at);
    setAt(Number.isFinite(ms) ? ms : Date.now());
    setText(edit.log.dose_amount != null ? formatNumber(edit.log.dose_amount, language, { trim: true, grouping: false }) : '');
    setError(null);
    setAndroidPicker(null);
  }, [edit, language]);

  if (!edit) return <Modal visible={false} transparent onRequestClose={onClose}><View /></Modal>;
  const { mode, log, name } = edit;
  const unit = unitForDoseEdit(log) || '';
  const amountLine = log.dose_amount != null ? `${formatNumber(log.dose_amount, language, { trim: true, grouping: false })}\u00A0${unit}`.trim() : '';
  // The Dose log's own way of naming the day ("Ontem, 08:00"), passed in; the plain date otherwise.
  const whenLine = edit.when || `${formatDate(new Date(Date.parse(log.logged_at)), language, 'dayMonth')}, ${formatTime(hhmm(Date.parse(log.logged_at)), language, timeFormat)}`;

  function save() {
    if (mode === 'time') {
      const err = checkEditedTime(at, Date.now());
      if (err === 'future') { setError(t('log_time_future')); return; }
      if (err) return; // an unreadable moment (never from the wheels): nothing saved
      onSave('time', new Date(at).toISOString());
      return;
    }
    const r = parseDoseEdit(text, language);
    if (r.error) { setError(t('log_dose_invalid')); return; }
    onSave('dose', { amount: r.amount, unit: unitForDoseEdit(log) });
  }

  const now = new Date();
  // The wheels speak the app language, not the phone's (an English phone with the app in Portuguese
  // showed "October … PM"); an English app set to 24 h reads en-GB.
  const pickerLocale = language === 'en' && hour12Pref(timeFormat) === false ? 'en-GB' : (LOCALES[language] || 'en-US');
  const body = (
    <Pressable style={[s.sheet, { paddingBottom: 22 + insets.bottom }]} onPress={() => Keyboard.dismiss()} accessibilityViewIsModal>
      <Text style={s.title} accessibilityRole="header">{t(mode === 'time' ? 'log_change_time' : 'log_change_dose')}</Text>
      <Text style={s.sub} numberOfLines={2}>{[name, mode === 'time' ? amountLine : whenLine].filter(Boolean).join(' · ')}</Text>

      {mode === 'time' ? (
        Platform.OS === 'ios' ? (
          <View style={s.pickRow}>
            <DateTimePicker value={new Date(at)} mode="date" display="spinner" maximumDate={now} style={s.pickDate} locale={pickerLocale}
              themeVariant={isDark ? 'dark' : 'light'} textColor={colors.ink}
              onChange={(e, d) => { if (d) { setAt(combineDateTime(d.getTime(), at)); setError(null); } }} />
            <DateTimePicker value={new Date(at)} mode="time" display="spinner" style={s.pickTime} locale={pickerLocale}
              themeVariant={isDark ? 'dark' : 'light'} textColor={colors.ink}
              onChange={(e, d) => { if (d) { setAt(combineDateTime(at, d.getTime())); setError(null); } }} />
          </View>
        ) : (
          <View style={s.pickRow}>
            <TouchableOpacity style={[s.field, s.flex]} onPress={() => setAndroidPicker('date')} accessibilityRole="button">
              <Text style={s.fieldText}>{formatDate(new Date(at), language, 'dayMonth')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.field} onPress={() => setAndroidPicker('time')} accessibilityRole="button">
              <Text style={s.fieldText}>{formatTime(hhmm(at), language, timeFormat)}</Text>
            </TouchableOpacity>
            {androidPicker && (
              <DateTimePicker value={new Date(at)} mode={androidPicker} display="default" maximumDate={androidPicker === 'date' ? now : undefined}
                is24Hour={hour12Pref(timeFormat) === undefined ? language !== 'en' : !hour12Pref(timeFormat)}
                onChange={(e, d) => {
                  const which = androidPicker;
                  setAndroidPicker(null);
                  if (e.type === 'dismissed' || !d) return;
                  setAt(which === 'date' ? combineDateTime(d.getTime(), at) : combineDateTime(at, d.getTime()));
                  setError(null);
                }} />
            )}
          </View>
        )
      ) : (
        <View style={s.field}>
          <TextInput
            style={[s.fieldText, s.flex, s.input]}
            value={text}
            onChangeText={(v) => { setText(v); setError(null); }}
            keyboardType="decimal-pad"
            autoFocus
            selectTextOnFocus
            accessibilityLabel={t('log_sheet_dose')}
            placeholderTextColor={colors.ink3}
          />
          {unit ? <Text style={s.unit}>{unit}</Text> : null}
        </View>
      )}

      {error ? <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      <Text style={s.hint}>{t(mode === 'time' ? 'log_time_hint' : 'log_dose_hint')}</Text>
      <View style={s.actions}>
        <TouchableOpacity style={[s.btn, s.btnSec]} onPress={onClose} accessibilityRole="button">
          <Text style={s.btnSecText}>{t('cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.btnPri]} onPress={save} accessibilityRole="button">
          <Text style={s.btnPriText}>{t('save')}</Text>
        </TouchableOpacity>
      </View>
    </Pressable>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.flex}>
        <TouchableWithoutFeedback onPress={onClose} accessible={false}>
          <View style={s.scrim}>
            <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()} accessible={false}>
              {body}
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = (c) => StyleSheet.create({
  flex: { flex: 1 },
  scrim: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.raised, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 18, paddingHorizontal: 18, gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: c.ink, letterSpacing: -0.3 },
  sub: { fontSize: 14, color: c.ink2 },
  pickRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pickDate: { flex: 1.6 },
  pickTime: { flex: 1 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderRadius: 14, backgroundColor: c.well, paddingHorizontal: 14 },
  fieldText: { fontSize: 18, fontWeight: '600', color: c.ink },
  input: { paddingVertical: 10, fontSize: 20 },
  unit: { fontSize: 16, color: c.ink2 },
  hint: { fontSize: 13, color: c.ink2, lineHeight: 18 },
  error: { fontSize: 14, fontWeight: '600', color: c.risk },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnSec: { backgroundColor: c.well },
  btnSecText: { fontSize: 17, fontWeight: '600', color: c.ink },
  btnPri: { backgroundColor: c.act },
  btnPriText: { fontSize: 17, fontWeight: '700', color: c.onAct },
});
