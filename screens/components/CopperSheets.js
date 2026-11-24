// Copper this cycle (docs/specs/ghk-cu-copper.md CU-6, CU-8; picture docs/design/ghk-cu-cobre-ciclo.html): the two
// bottom sheets of the protocol page's copper section — "Forma no rótulo" (four choices, a tap saves and closes,
// Cancelar changes nothing) and "Quanto de GHK-Cu tem no frasco?" (a blend's GHK-Cu, read with parseDecimal in
// the app language, never above the vial total; "Não sei" clears). Both write only through onSave(fields) — the
// screen saves them on the protocol. Theme tokens only (the sheetStyles look of ProtocolParts).
import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Pressable, Platform, KeyboardAvoidingView, Keyboard, ScrollView, StyleSheet } from 'react-native';
import Modal from '../../components/PresenceModal';
import CheckMark from '../../components/CheckMark';
import { useSheetGap } from '../../components/useSheetInset';
import useSheetKeyboard from '../../components/useSheetKeyboard';
import { useTheme } from '../../lib/theme';
import { MONO } from '../../lib/fonts';
import { inputNumber } from '../../lib/localeFormat';
import { formOptions, parseGhkAmount, mgText } from '../../lib/copperCycle';

// visible, current (the saved copper_form or null), onSave({ copper_form }), onClose.
export function CopperFormSheet({ visible, current, onSave, onClose, t, language }) {
  const { colors: c } = useTheme();
  const s = styles(c);
  const gap = useSheetGap(30);
  const options = formOptions(t, language);
  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[s.scrim, { paddingBottom: gap }]} onPress={onClose} accessibilityRole="button">
        <Pressable style={s.sheet} onPress={() => {}} accessibilityViewIsModal>
          <Text style={s.title} accessibilityRole="header">{t('copper_form_row')}</Text>
          <Text style={s.hint}>{t('copper_form_hint')}</Text>
          <View>
            {options.map((o, i) => {
              const on = (current || null) === o.id;
              return (
                <TouchableOpacity key={o.id || 'unknown'} style={[s.opt, i > 0 && s.optSep]} onPress={() => onSave({ copper_form: o.id })}
                  accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${o.label}, ${o.sub}`}>
                  <View style={s.optText}>
                    <Text style={[s.optLabel, on && s.optLabelOn]}>{o.label}</Text>
                    <Text style={s.optSub}>{o.sub}</Text>
                  </View>
                  <View style={s.optCheck}>{on ? <CheckMark size={18} color={c.ink} /> : null}</View>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={s.btnRow}>
            <TouchableOpacity style={[s.btn, s.btnSec]} onPress={onClose} accessibilityRole="button">
              <Text style={[s.btnText, s.btnSecText]}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// visible, name (the blend as the page names it), totalMg (the vial total in mg), current (ghk_cu_mg or null),
// onSave({ ghk_cu_mg }), onClose.
export function GhkAmountSheet({ visible, name, totalMg, current, onSave, onClose, t, language }) {
  const { colors: c } = useTheme();
  const s = styles(c);
  const restGap = useSheetGap(30);
  // Android draws edge to edge (the Modal is not resized): the sheet sits above the keyboard, capped to the room
  // left, the field scrolled into view (modalKeyboard.test.js); iPhone: the KeyboardAvoidingView.
  const kb = useSheetKeyboard(Platform.OS === 'android' && !!visible);
  const gap = kb.lift ? kb.lift.bottom : restGap;
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!visible) return;
    setText(current != null ? inputNumber(current, language) : '');
    setError(null);
  }, [visible, current, language]);
  const total = totalMg != null ? mgText(totalMg, language) : '';
  function save() {
    const r = parseGhkAmount(text, language, totalMg);
    if (r.error) { setError(r.error === 'over' ? t('copper_ghk_over').replace('{total}', total) : t('copper_ghk_invalid')); return; }
    Keyboard.dismiss();
    onSave({ ghk_cu_mg: r.mg });
  }
  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.flex} onLayout={kb.onLayout}>
        <Pressable style={[s.scrim, { paddingBottom: gap }]} onPress={onClose} accessibilityRole="button">
          <Pressable style={[s.sheet, kb.sheetStyle]} onPress={() => Keyboard.dismiss()} accessibilityViewIsModal>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled" {...kb.scrollProps} contentContainerStyle={s.scrollBody} showsVerticalScrollIndicator={false}>
            <Text style={s.title} accessibilityRole="header">{t('copper_ghk_title')}</Text>
            <Text style={s.body}>{t('copper_ghk_body').replace('{name}', name || '').replace('{total}', total)}</Text>
            <View style={s.field}>
              <TextInput
                style={s.input}
                value={text}
                onChangeText={(v) => { setText(v); setError(null); }}
                keyboardType="decimal-pad"
                autoFocus
                selectTextOnFocus
                accessibilityLabel={t('copper_ghk_title')}
                placeholderTextColor={c.ink3}
                selectionColor={c.data}
              />
              <Text style={s.unit}>{t('copper_ghk_unit').replace('{total}', total)}</Text>
            </View>
            {error ? <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text> : null}
            <Text style={s.hint}>{t('copper_ghk_hint')}</Text>
            </ScrollView>
            <View style={s.btnRow}>
              <TouchableOpacity style={[s.btn, s.btnFlex, s.btnSec]} onPress={() => { Keyboard.dismiss(); onSave({ ghk_cu_mg: null }); }} accessibilityRole="button">
                <Text style={[s.btnText, s.btnSecText]}>{t('copper_form_unknown')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnFlex, s.btnPri]} onPress={save} accessibilityRole="button">
                <Text style={[s.btnText, s.btnPriText]}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Picture .scrim / .sheet / .opt / .winp / .btn (sheetStyles in ProtocolParts).
const styles = (c) => StyleSheet.create({
  flex: { flex: 1 },
  scrim: { flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end', paddingHorizontal: 8, paddingTop: 8 },
  sheet: { backgroundColor: c.raised, borderRadius: 26, padding: 20, gap: 14, width: '100%', maxWidth: 520, alignSelf: 'center' },
  scrollBody: { gap: 14 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: c.ink },
  body: { fontSize: 17, lineHeight: 22, color: c.ink2 },
  hint: { fontSize: 13, lineHeight: 18, color: c.ink3 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  optSep: { borderTopWidth: 1, borderTopColor: c.line },
  optText: { flex: 1, gap: 2 },
  optLabel: { fontSize: 17, color: c.ink },
  optLabelOn: { fontWeight: '600' },
  optSub: { fontSize: 13, lineHeight: 18, color: c.ink3 },
  optCheck: { width: 22, alignItems: 'center' },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 50, borderRadius: 14, borderWidth: 2, borderColor: c.ink, backgroundColor: c.raised, paddingHorizontal: 13 },
  input: { flex: 1, fontSize: 17, color: c.ink, paddingVertical: 11, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: MONO, fontSize: 15, color: c.ink3 },
  error: { fontSize: 14, fontWeight: '600', color: c.risk },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, minHeight: 44, borderRadius: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnFlex: { flex: 1 },
  btnSec: { backgroundColor: c.well },
  btnPri: { backgroundColor: c.act },
  btnText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  btnSecText: { color: c.ink },
  btnPriText: { color: c.onAct },
});
