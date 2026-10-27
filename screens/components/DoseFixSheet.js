// Founder 2026-10-27 ("aprovo sua sugestão", docs/design/dose-fix-or-change.html): saving a new dose on
// a protocol with doses already marked at the old value asks once — "Estava errada" (correct those
// doses) or "Mudou a partir de agora" (keep them). The person chooses, then Save; Cancel saves nothing.
// Graduated sheet look (the dose sheet's), theme tokens only.
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import Modal from '../../components/PresenceModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';
import { useLanguage } from '../../i18n/LanguageContext';
import { pluralKey } from '../../lib/plural';

// ask: { count, name, oldDose, newDose } (doses as display text with their unit) or null.
// onChoose('fix' | 'change'); onClose: Cancel.
export default function DoseFixSheet({ ask, onChoose, onClose }) {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const insets = useSafeAreaInsets();
  const s = styles(colors);
  const [pick, setPick] = useState('fix');
  useEffect(() => { if (ask) setPick('fix'); }, [ask]);
  const fill = (k) => t(k === 'dosefix_title' ? k : pluralKey(k, ask ? ask.count : 0, language)).replace('{n}', String(ask ? ask.count : 0)).replace('{name}', ask ? ask.name : '')
    .replace('{old}', ask ? ask.oldDose : '').replace('{new}', ask ? ask.newDose : '');
  const Opt = ({ k, title, sub }) => (
    <TouchableOpacity style={[s.opt, pick === k && s.optOn]} onPress={() => setPick(k)} accessibilityRole="radio" accessibilityState={{ selected: pick === k }}>
      <Text style={s.optTitle}>{t(title)}</Text>
      <Text style={s.optSub}>{fill(sub)}</Text>
    </TouchableOpacity>
  );
  return (
    <Modal visible={!!ask} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('cancel')}>
        {ask ? (
          <Pressable style={[s.sheet, { paddingBottom: 22 + insets.bottom }]} onPress={() => {}} accessibilityViewIsModal>
            <Text style={s.title} accessibilityRole="header">{t('dosefix_title')}</Text>
            <Text style={s.body}>{fill('dosefix_body')}</Text>
            <View style={s.opts} accessibilityRole="radiogroup">
              <Opt k="fix" title="dosefix_wrong" sub="dosefix_wrong_sub" />
              <Opt k="change" title="dosefix_changed" sub="dosefix_changed_sub" />
            </View>
            <TouchableOpacity style={[s.btn, s.btnPri]} onPress={() => onChoose(pick)} accessibilityRole="button">
              <Text style={s.btnPriText}>{t('save')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnSec]} onPress={onClose} accessibilityRole="button">
              <Text style={s.btnSecText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = (c) => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.raised, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 20, paddingHorizontal: 18, gap: 10, width: '100%', maxWidth: 560, alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: c.ink, letterSpacing: -0.3 },
  body: { fontSize: 15, color: c.ink2, lineHeight: 21 },
  opts: { gap: 10, marginTop: 2 },
  opt: { borderWidth: 1.5, borderColor: c.line, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  optOn: { borderWidth: 2, borderColor: c.ink },
  optTitle: { fontSize: 16, fontWeight: '700', color: c.ink },
  optSub: { fontSize: 14, color: c.ink2, marginTop: 3, lineHeight: 19 },
  btn: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnPri: { backgroundColor: c.act, marginTop: 4 },
  btnPriText: { fontSize: 17, fontWeight: '700', color: c.onAct },
  btnSec: { backgroundColor: c.well },
  btnSecText: { fontSize: 17, fontWeight: '600', color: c.ink },
});
