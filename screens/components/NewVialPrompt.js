// The new-vial window (A-132, docs/design/a132-expired-vial-new-vial.html screen 4): the mix date
// (Yesterday / Today, the month, the day) and how many doses the new vial holds. One window for
// Today (after the last dose of a vial = mode 'finished', words unchanged; "+ Add vial" / "+ New
// vial" = mode 'new') and for "New vial" on the protocol page of a reconstituted vial (mode 'new':
// "New vial", the approved body, a line about the vial going to the history, Cancel / Start new).
// "Today" is picked when it opens. Theme tokens only; the app's own type (lib/fonts.js).
import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Platform, StyleSheet } from 'react-native';
import Modal from '../../components/PresenceModal';
import { useTheme } from '../../lib/theme';
import { useLanguage } from '../../i18n/LanguageContext';
import useSheetKeyboard from '../../components/useSheetKeyboard';
import { pluralKey } from '../../lib/plural';
import { dosesPerVial } from '../../lib/doseMath';
import { formatDate } from '../../lib/localeFormat';
import { vialPromptKeys, oldVialNote } from '../../lib/newVial';
import { DTSheet } from './ProtocolParts';

const MONTH_KEYS = [
  'month_jan', 'month_feb', 'month_mar', 'month_apr',
  'month_may', 'month_jun', 'month_jul', 'month_aug',
  'month_sep', 'month_oct', 'month_nov', 'month_dec',
];

// The body (build 54): on Android a ScrollView, so the card, capped above the keyboard by
// useSheetKeyboard, scrolls its day field into view while its actions stay under it; on iPhone a
// plain View, exactly as before. Platform is fixed, so the type never switches.
function PromptBody({ style, scrollProps, children }) {
  if (Platform.OS !== 'android') return <View style={style}>{children}</View>;
  return <ScrollView {...scrollProps} contentContainerStyle={style} keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={false}>{children}</ScrollView>;
}

// onSecondary closes; onPrimary(monthIdx, dayText) saves. `sheet` = an error presented from inside
// the window (M1/M4: iOS shows one modal at a time).
export default function NewVialPrompt({ visible, mode = 'new', protocol, protocolName, oldVial = null, onSecondary, onPrimary, sheet = null, onSheetClose }) {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const vialKb = useSheetKeyboard(Platform.OS === 'android' && !!visible, { gap: 16 });
  const [newVialMonth, setNewVialMonth] = useState(new Date().getMonth());
  const [newVialDay, setNewVialDay] = useState(String(new Date().getDate()));
  // "Today" is picked each time the window opens.
  useEffect(() => {
    if (!visible) return;
    const td = new Date();
    setNewVialMonth(td.getMonth());
    setNewVialDay(String(td.getDate()));
  }, [visible]);

  const keys = vialPromptKeys(mode);
  const note = mode === 'new' ? oldVialNote(protocol, oldVial) : null;
  const noteDate = note ? formatDate(note.mixedOn, language, 'dayMonth') : null;
  const noteText = note && noteDate
    ? (note.left != null
        ? t(pluralKey('today_new_vial_old', note.left, language)).replace('{date}', noteDate).replace('{n}', String(note.left))
        : t('today_new_vial_old_date').replace('{date}', noteDate))
    : null;
  const cap = protocol ? dosesPerVial({ amount: protocol.amount, unit: protocol.unit, dose: protocol.dose, doseUnit: protocol.dose_unit }) : null;

  return (
    <Modal visible={!!visible} transparent animationType="fade">
      <View style={vialKb.lift ? [s.promptOverlay, { paddingBottom: vialKb.lift.bottom }] : s.promptOverlay} onLayout={vialKb.onLayout}>
        <View style={[s.promptCard, vialKb.sheetStyle]}>
          <PromptBody style={s.promptBody} scrollProps={vialKb.scrollProps}>
            <Text style={s.promptTitle} accessibilityRole="header">{t(keys.title)}</Text>
            {protocolName ? <Text style={s.promptProtocolName}>{protocolName}</Text> : null}
            <Text style={s.promptSub}>{t(keys.sub)}{noteText ? `\n${noteText}` : ''}</Text>

            <Text style={s.promptLabel}>{t('today_vial_mix_date')}</Text>
            <View style={s.yesterdayRow}>
              <TouchableOpacity
                style={s.yesterdayPill}
                onPress={() => {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  setNewVialMonth(y.getMonth());
                  setNewVialDay(String(y.getDate()));
                }}
              >
                <Text style={s.yesterdayPillText}>{t('today_yesterday')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.yesterdayPill}
                onPress={() => {
                  const td = new Date();
                  setNewVialMonth(td.getMonth());
                  setNewVialDay(String(td.getDate()));
                }}
              >
                <Text style={s.yesterdayPillText}>{t('today_today_pill')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.promptMonthRow}>
                {MONTH_KEYS.map((mk, idx) => (
                  <TouchableOpacity
                    key={mk}
                    style={[s.promptMonthPill, newVialMonth === idx && s.promptMonthPillOn]}
                    onPress={() => setNewVialMonth(idx)}
                  >
                    <Text style={[s.promptMonthText, newVialMonth === idx && s.promptMonthTextOn]}>
                      {t(mk)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TextInput
              style={s.promptDayInput}
              placeholder={t('protocols_day_dd')}
              placeholderTextColor={colors.ink3}
              keyboardType="numeric"
              maxLength={2}
              value={newVialDay}
              onChangeText={(val) => {
                const num = parseInt(val);
                if (val === '' || (num >= 1 && num <= 31)) setNewVialDay(val);
              }}
            />

            {cap ? (
              <Text style={s.promptLabel}>
                {t(pluralKey('today_vial_new_capacity', cap, language)).replace('{n}', String(cap))}
              </Text>
            ) : null}
          </PromptBody>

          <View style={s.promptActions}>
            <TouchableOpacity style={s.promptBtnSecondary} onPress={onSecondary} accessibilityRole="button">
              <Text style={s.promptBtnSecondaryText}>{t(keys.secondary)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.promptBtnPrimary} onPress={() => onPrimary(newVialMonth, newVialDay)} accessibilityRole="button">
              <Text style={s.promptBtnPrimaryText}>{t(keys.primary)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      {/* Errors from the window are presented from inside it (M1/M4). */}
      <DTSheet config={sheet} onClose={onSheetClose} />
    </Modal>
  );
}

const makeStyles = (c) => StyleSheet.create({
  promptOverlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center', alignItems: 'center', padding: 16 },
  promptCard: { backgroundColor: c.raised, borderRadius: 26, padding: 20, gap: 14, width: '100%', maxWidth: 520 },
  promptBody: { gap: 14 }, // the card's gap, inside its (Android: scrolling) body
  promptTitle: { fontSize: 22, fontWeight: '700', lineHeight: 28, color: c.ink },
  promptProtocolName: { fontSize: 17, fontWeight: '600', color: c.ink },
  promptSub: { fontSize: 17, lineHeight: 22, color: c.ink2 },
  promptLabel: { fontSize: 17, fontWeight: '600', color: c.ink },
  yesterdayRow: { flexDirection: 'row', gap: 8 },
  yesterdayPill: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderColor: c.line },
  yesterdayPillText: { fontSize: 15, color: c.ink2 },
  promptMonthRow: { flexDirection: 'row', gap: 8 },
  promptMonthPill: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderColor: c.line },
  promptMonthPillOn: { backgroundColor: c.raised, borderWidth: 1.5, borderColor: c.ink },
  promptMonthText: { fontSize: 15, color: c.ink2 },
  promptMonthTextOn: { color: c.ink, fontWeight: '600' },
  promptDayInput: { backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: 14, minHeight: 50, paddingVertical: 12, paddingHorizontal: 14, fontSize: 17, color: c.ink, width: 90, textAlign: 'center' },
  promptActions: { flexDirection: 'row', gap: 10 },
  promptBtnSecondary: { flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  promptBtnSecondaryText: { fontSize: 15, fontWeight: '700', color: c.ink, textAlign: 'center' },
  promptBtnPrimary: { flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  promptBtnPrimaryText: { fontSize: 15, fontWeight: '700', color: c.onAct, textAlign: 'center' },
});
