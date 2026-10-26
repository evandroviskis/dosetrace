// The vial windows. Theme tokens only; the app's own type (lib/fonts.js: the phone font for text
// and controls, Geist only for the 22 pt title).
//
// NewVialPrompt (A-132, docs/design/a132-expired-vial-new-vial.html screen 4): the mix date
// (Yesterday / Today, the month, the day) and how many doses the new vial holds. One window for
// Today (after the last dose of a vial = mode 'finished', words unchanged; "+ Add vial" / "+ New
// vial" = mode 'new') and for "New vial" on the protocol page (mode 'new': "New vial", the approved
// body, a line about the vial going to the history, Cancel / Start new). "Today" is picked when it
// opens. AD-80 (docs/design/ad80-edit-vial.html screen 5 = A): a ready-to-use vial asks the new
// box's month and year instead, with the protocol form's pills — blank when it opens, a second
// tap clears, blank allowed.
//
// EditVialPrompt (AD-80 screens 3 and 4): "Edit vial" — a reconstituted vial's mix date, the
// protocol's validity in days and the doses already used; a ready-to-use vial's box month/year
// and the doses already used. Opens with the current values.
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
import { editVialStart, acceptValidDaysText, acceptDosesUsedText, expiryYears } from '../../lib/vialEdit';
import { supplyState } from '../../lib/supplyLow';
import { DEFAULT_VALID_DAYS } from '../../lib/vialExpiry';
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

// The mix date: Yesterday / Today, the month, the day (Today's vial window).
function MixDateField({ s, t, colors, month, day, setMonth, setDay }) {
  return (
    <>
      <Text style={s.promptLabel}>{t('today_vial_mix_date')}</Text>
      <View style={s.yesterdayRow}>
        <TouchableOpacity
          style={s.yesterdayPill}
          onPress={() => {
            const y = new Date();
            y.setDate(y.getDate() - 1);
            setMonth(y.getMonth());
            setDay(String(y.getDate()));
          }}
        >
          <Text style={s.yesterdayPillText}>{t('today_yesterday')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.yesterdayPill}
          onPress={() => {
            const td = new Date();
            setMonth(td.getMonth());
            setDay(String(td.getDate()));
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
              style={[s.promptMonthPill, month === idx && s.promptMonthPillOn]}
              onPress={() => setMonth(idx)}
            >
              <Text style={[s.promptMonthText, month === idx && s.promptMonthTextOn]}>
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
        value={day}
        onChangeText={(val) => {
          const num = parseInt(val);
          if (val === '' || (num >= 1 && num <= 31)) setDay(val);
        }}
      />
    </>
  );
}

// The box's month and year (the protocol form's pills: a second tap clears; blank allowed).
function BoxExpiryField({ s, t, expMonth, expYear, setExpMonth, setExpYear }) {
  return (
    <>
      <Text style={s.promptLabel}>{t('protocols_vial_expiry')}</Text>
      <Text style={s.promptHint}>{t('protocols_vial_expiry_hint')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={s.promptMonthRow}>
          {MONTH_KEYS.map((mk, idx) => (
            <TouchableOpacity
              key={mk}
              style={[s.promptMonthPill, expMonth === idx && s.promptMonthPillOn]}
              onPress={() => setExpMonth(expMonth === idx ? null : idx)}
              accessibilityRole="button" accessibilityState={{ selected: expMonth === idx }}
            >
              <Text style={[s.promptMonthText, expMonth === idx && s.promptMonthTextOn]}>{t(mk)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={s.promptMonthRow}>
          {expiryYears(new Date()).map((y) => (
            <TouchableOpacity
              key={y}
              style={[s.promptMonthPill, expYear === y && s.promptMonthPillOn]}
              onPress={() => setExpYear(expYear === y ? null : y)}
              accessibilityRole="button" accessibilityState={{ selected: expYear === y }}
            >
              <Text style={[s.promptMonthText, expYear === y && s.promptMonthTextOn]}>{String(y)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </>
  );
}

function Actions({ s, secondary, onSecondary, primary, onPrimary }) {
  return (
    <View style={s.promptActions}>
      <TouchableOpacity style={s.promptBtnSecondary} onPress={onSecondary} accessibilityRole="button">
        <Text style={s.promptBtnSecondaryText}>{secondary}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.promptBtnPrimary} onPress={onPrimary} accessibilityRole="button">
        <Text style={s.promptBtnPrimaryText}>{primary}</Text>
      </TouchableOpacity>
    </View>
  );
}

// onSecondary closes; onPrimary({ month, day, expMonth, expYear }) saves. `sheet` = an error
// presented from inside the window (M1/M4: iOS shows one modal at a time).
export default function NewVialPrompt({ visible, mode = 'new', protocol, protocolName, oldVial = null, onSecondary, onPrimary, sheet = null, onSheetClose }) {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const vialKb = useSheetKeyboard(Platform.OS === 'android' && !!visible, { gap: 16 });
  const [newVialMonth, setNewVialMonth] = useState(new Date().getMonth());
  const [newVialDay, setNewVialDay] = useState(String(new Date().getDate()));
  const [expMonth, setExpMonth] = useState(null);
  const [expYear, setExpYear] = useState(null);
  // "Today" is picked each time the window opens; a new box's month and year start blank.
  useEffect(() => {
    if (!visible) return;
    const td = new Date();
    setNewVialMonth(td.getMonth());
    setNewVialDay(String(td.getDate()));
    setExpMonth(null); setExpYear(null);
  }, [visible]);

  const rtu = protocol && protocol.type === 'rtu';
  const keys = vialPromptKeys(mode);
  const note = mode === 'new' ? oldVialNote(protocol, oldVial) : null;
  const noteDate = note && note.mixedOn ? formatDate(note.mixedOn, language, 'dayMonth') : null;
  const noteText = !note ? null
    : noteDate
      ? (note.left != null
          ? t(pluralKey('today_new_vial_old', note.left, language)).replace('{date}', noteDate).replace('{n}', String(note.left))
          : t('today_new_vial_old_date').replace('{date}', noteDate))
      : note.left != null
        ? t(pluralKey('today_new_vial_prev', note.left, language)).replace('{n}', String(note.left))
        : null;
  const cap = !protocol ? null
    : rtu ? supplyState(oldVial, protocol).capacity
    : dosesPerVial({ amount: protocol.amount, unit: protocol.unit, dose: protocol.dose, doseUnit: protocol.dose_unit });

  return (
    <Modal visible={!!visible} transparent animationType="fade">
      <View style={vialKb.lift ? [s.promptOverlay, { paddingBottom: vialKb.lift.bottom }] : s.promptOverlay} onLayout={vialKb.onLayout}>
        <View style={[s.promptCard, vialKb.sheetStyle]}>
          <PromptBody style={s.promptBody} scrollProps={vialKb.scrollProps}>
            <Text style={s.promptTitle} accessibilityRole="header">{t(keys.title)}</Text>
            {protocolName ? <Text style={s.promptProtocolName}>{protocolName}</Text> : null}
            <Text style={s.promptSub}>{t(keys.sub)}{noteText ? `\n${noteText}` : ''}</Text>

            {rtu ? (
              <BoxExpiryField s={s} t={t} expMonth={expMonth} expYear={expYear} setExpMonth={setExpMonth} setExpYear={setExpYear} />
            ) : (
              <MixDateField s={s} t={t} colors={colors} month={newVialMonth} day={newVialDay} setMonth={setNewVialMonth} setDay={setNewVialDay} />
            )}

            {cap ? (
              <Text style={s.promptLabel}>
                {t(pluralKey('today_vial_new_capacity', cap, language)).replace('{n}', String(cap))}
              </Text>
            ) : null}
          </PromptBody>

          <Actions
            s={s}
            secondary={t(keys.secondary)} onSecondary={onSecondary}
            primary={t(keys.primary)} onPrimary={() => onPrimary({ month: newVialMonth, day: newVialDay, expMonth, expYear })}
          />
        </View>
      </View>
      {/* Errors from the window are presented from inside it (M1/M4). */}
      <DTSheet config={sheet} onClose={onSheetClose} />
    </Modal>
  );
}

// "Edit vial". onCancel closes; onSave({ month, day, validDays, dosesUsed, expMonth, expYear })
// saves; a refused date comes back as `sheet` ("Date in the future", OK returns here).
export function EditVialPrompt({ visible, protocol, protocolName, vial, onCancel, onSave, sheet = null, onSheetClose }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const kb = useSheetKeyboard(Platform.OS === 'android' && !!visible, { gap: 16 });
  const [month, setMonth] = useState(null);
  const [day, setDay] = useState('');
  const [validDays, setValidDays] = useState('');
  const [dosesUsed, setDosesUsed] = useState('');
  const [expMonth, setExpMonth] = useState(null);
  const [expYear, setExpYear] = useState(null);
  const [capacity, setCapacity] = useState(null);
  // Opens with the vial's current values.
  useEffect(() => {
    if (!visible || !protocol) return;
    const v = editVialStart(protocol, vial);
    setMonth(v.month); setDay(v.day); setValidDays(v.validDays); setDosesUsed(v.dosesUsed);
    setExpMonth(v.expMonth); setExpYear(v.expYear); setCapacity(v.capacity);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const recon = protocol && protocol.type === 'recon';
  return (
    <Modal visible={!!visible} transparent animationType="fade">
      <View style={kb.lift ? [s.promptOverlay, { paddingBottom: kb.lift.bottom }] : s.promptOverlay} onLayout={kb.onLayout}>
        <View style={[s.promptCard, kb.sheetStyle]}>
          <PromptBody style={s.promptBody} scrollProps={kb.scrollProps}>
            <Text style={s.promptTitle} accessibilityRole="header">{t('vial_edit_title')}</Text>
            {protocolName ? <Text style={s.promptProtocolName}>{protocolName}</Text> : null}
            <Text style={s.promptSub}>{t('vial_edit_body')}</Text>

            {recon ? (
              <>
                <MixDateField s={s} t={t} colors={colors} month={month} day={day} setMonth={setMonth} setDay={setDay} />
                <Text style={s.promptLabel}>{t('protocols_vial_valid')}</Text>
                <TextInput
                  style={s.promptDayInput}
                  placeholder={String(DEFAULT_VALID_DAYS)}
                  placeholderTextColor={colors.ink3}
                  keyboardType="numeric"
                  maxLength={3}
                  value={validDays}
                  onChangeText={(val) => { if (acceptValidDaysText(val)) setValidDays(val); }}
                />
                <Text style={s.promptHint}>{t('protocols_vial_valid_hint')} {t('vial_edit_valid_next')}</Text>
              </>
            ) : (
              <BoxExpiryField s={s} t={t} expMonth={expMonth} expYear={expYear} setExpMonth={setExpMonth} setExpYear={setExpYear} />
            )}

            {capacity != null && (
              <>
                <Text style={s.promptLabel}>{t('vial_edit_used')}</Text>
                <View style={s.inRow}>
                  <TextInput
                    style={s.promptDayInput}
                    keyboardType="numeric"
                    maxLength={String(capacity).length}
                    value={dosesUsed}
                    onChangeText={(val) => { if (acceptDosesUsedText(val, capacity)) setDosesUsed(val); }}
                  />
                  <Text style={s.ofTotal}>{t('vial_edit_of').replace('{total}', String(capacity))}</Text>
                </View>
              </>
            )}
          </PromptBody>

          <Actions
            s={s}
            secondary={t('cancel')} onSecondary={onCancel}
            primary={t('save')} onPrimary={() => onSave({ month, day, validDays, dosesUsed, expMonth, expYear })}
          />
        </View>
      </View>
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
  promptHint: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  yesterdayRow: { flexDirection: 'row', gap: 8 },
  yesterdayPill: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderColor: c.line },
  yesterdayPillText: { fontSize: 15, color: c.ink2 },
  promptMonthRow: { flexDirection: 'row', gap: 8 },
  promptMonthPill: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderColor: c.line },
  promptMonthPillOn: { backgroundColor: c.raised, borderWidth: 1.5, borderColor: c.ink },
  promptMonthText: { fontSize: 15, color: c.ink2 },
  promptMonthTextOn: { color: c.ink, fontWeight: '600' },
  promptDayInput: { backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: 14, minHeight: 50, paddingVertical: 12, paddingHorizontal: 14, fontSize: 17, color: c.ink, width: 90, textAlign: 'center' },
  inRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ofTotal: { fontSize: 17, color: c.ink2, fontVariant: ['tabular-nums'] },
  promptActions: { flexDirection: 'row', gap: 10 },
  promptBtnSecondary: { flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  promptBtnSecondaryText: { fontSize: 15, fontWeight: '700', color: c.ink, textAlign: 'center' },
  promptBtnPrimary: { flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  promptBtnPrimaryText: { fontSize: 15, fontWeight: '700', color: c.onAct, textAlign: 'center' },
});
