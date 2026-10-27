// Founder 2026-10-27, option A ("Opção A, aceito"; docs/design/dose-fix-or-change.html): saving a new
// dose on a protocol that already has doses marked at the old value (or an estimated past) asks
// "Desde quando você usa {new}?" — A partir de agora / Desde o início / A partir de uma dose (tap the first
// dose that was wrong; it and every later one at the old value light up). Nothing is pre-selected and Save
// stays off until a choice (the app never deduces). A summary line says what will change, the vial
// included, before saving. Doses at another value (or corrected by hand) are grey and never change. Loose
// wrong doses are corrected one by one in the Dose log (link). Cancel saves nothing. Theme tokens only.
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet } from 'react-native';
import Modal from '../../components/PresenceModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';
import { useLanguage } from '../../i18n/LanguageContext';
import { pluralKey } from '../../lib/plural';
import { MONO } from '../../lib/fonts';

const SHOW_FIRST = 8;

// ask: { name, oldDose, newDose (display text), rows: [{ id, date, amount, atOld }] newest first,
//        atOld (count), estimated (bool), summary(mode, fromId) → { n, from, to, vialLeft } }.
// onChoose({ mode: 'now' | 'start' | 'from', fromId }); onClose: Cancel; onLink: open the Dose log.
export default function DoseFixSheet({ ask, onChoose, onClose, onLink }) {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const insets = useSafeAreaInsets();
  const s = styles(colors);
  const [mode, setMode] = useState(null);
  const [fromId, setFromId] = useState(null);
  const [all, setAll] = useState(false);
  useEffect(() => { if (ask) { setMode(null); setFromId(null); setAll(false); } }, [ask]);
  if (!ask) return <Modal visible={false} transparent onRequestClose={onClose}><View /></Modal>;

  const fill = (txt, n) => txt.replace('{n}', String(n)).replace('{name}', ask.name).replace('{old}', ask.oldDose).replace('{new}', ask.newDose);
  const tk = (k, n) => fill(t(pluralKey(k, n, language)), n);
  const startSub = ask.atOld === 0 ? fill(t('dosefix_start_sub_only_est'), 0)
    : tk(ask.estimated ? 'dosefix_start_sub_est' : 'dosefix_start_sub', ask.atOld);
  const fromIdx = fromId != null ? ask.rows.findIndex((r) => r.id === fromId) : -1;
  const lit = (r, i) => mode === 'from' && fromIdx >= 0 && i <= fromIdx && r.atOld;
  const ready = mode === 'now' || mode === 'start' || (mode === 'from' && fromIdx >= 0);
  const sum = ready ? ask.summary(mode, fromId) : null;
  const rows = all ? ask.rows : ask.rows.slice(0, SHOW_FIRST);

  const Opt = ({ k, title, sub, children }) => (
    <TouchableOpacity style={[s.opt, mode === k ? s.optOn : null]} onPress={() => setMode(k)} accessibilityRole="radio" accessibilityState={{ selected: mode === k }}>
      <Text style={s.optTitle}>{t(title)}</Text>
      <Text style={s.optSub}>{sub}</Text>
      {children}
    </TouchableOpacity>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('cancel')}>
        <Pressable style={[s.sheet, { paddingBottom: 22 + insets.bottom }]} onPress={() => {}} accessibilityViewIsModal>
          <ScrollView style={s.scroll} contentContainerStyle={s.scrollIn} bounces={false}>
            <Text style={s.title} accessibilityRole="header">{fill(t('dosefix_title'), 0)}</Text>
            <Text style={s.sub}>{fill(t('dosefix_sub'), 0)}</Text>
            <View style={s.opts} accessibilityRole="radiogroup">
              <Opt k="now" title="dosefix_now" sub={fill(t('dosefix_now_sub'), 0)} />
              <Opt k="start" title="dosefix_start" sub={startSub} />
              {ask.atOld > 0 ? (
                <Opt k="from" title="dosefix_from" sub={fill(t('dosefix_from_sub'), 0)}>
                  {mode === 'from' ? (
                    <View style={s.list}>
                      {rows.map((r, i) => (
                        <TouchableOpacity key={r.id} disabled={!r.atOld} onPress={() => setFromId(r.id)}
                          style={[s.row, lit(r, i) ? s.rowLit : null]} accessibilityRole="button" accessibilityState={{ disabled: !r.atOld, selected: lit(r, i) }}>
                          <Text style={[s.rowText, !r.atOld ? s.rowOff : null, lit(r, i) ? s.rowTextLit : null]}>{r.date}</Text>
                          <Text style={[s.rowText, !r.atOld ? s.rowOff : null, lit(r, i) ? s.rowTextLit : null]}>
                            {lit(r, i) ? <Text style={s.strike}>{r.amount}</Text> : r.amount}{lit(r, i) ? `  ${ask.newDose}` : ''}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      {!all && ask.rows.length > SHOW_FIRST ? (
                        <TouchableOpacity onPress={() => setAll(true)} accessibilityRole="button">
                          <Text style={s.more}>{tk('dosefix_see_all', ask.rows.length)}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                </Opt>
              ) : null}
            </View>
            {sum ? (
              <View style={s.sum} accessibilityLiveRegion="polite">
                <Text style={s.sumText}>
                  {mode === 'now' ? [fill(t('dosefix_sum_now'), 0), sum.vialLeft != null ? tk('dosefix_sum_vial', sum.vialLeft) : null].filter(Boolean).join(' ')
                    : [sum.n > 0 ? tk('dosefix_sum_fix', sum.n).replace('{from}', sum.from || '').replace('{to}', sum.to || '') : null,
                      mode === 'start' && ask.estimated ? fill(t('dosefix_sum_est'), 0) : null,
                      sum.vialLeft != null ? tk('dosefix_sum_vial', sum.vialLeft) : null].filter(Boolean).join(' ')}
                </Text>
              </View>
            ) : null}
            {onLink ? (
              <TouchableOpacity onPress={onLink} accessibilityRole="link">
                <Text style={s.link}>{t('dosefix_link')}</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
          <TouchableOpacity style={[s.btn, s.btnPri, !ready ? s.btnOff : null]} disabled={!ready}
            onPress={() => onChoose({ mode, fromId: mode === 'from' ? fromId : null })} accessibilityRole="button" accessibilityState={{ disabled: !ready }}>
            <Text style={s.btnPriText}>{t('save')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnSec]} onPress={onClose} accessibilityRole="button">
            <Text style={s.btnSecText}>{t('cancel')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = (c) => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.raised, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 20, paddingHorizontal: 18, gap: 10, width: '100%', maxWidth: 560, alignSelf: 'center', maxHeight: '92%' },
  scroll: { flexGrow: 0 },
  scrollIn: { gap: 10 },
  title: { fontSize: 22, fontWeight: '700', color: c.ink, letterSpacing: -0.3 },
  sub: { fontSize: 15, color: c.ink2 },
  opts: { gap: 10, marginTop: 2 },
  // one border width for both states, so the content never moves when selected
  opt: { borderWidth: 2, borderColor: c.line, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  optOn: { borderColor: c.ink },
  optTitle: { fontSize: 16, fontWeight: '700', color: c.ink },
  optSub: { fontSize: 14, color: c.ink2, marginTop: 3, lineHeight: 19 },
  list: { marginTop: 10, gap: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8 },
  rowLit: { backgroundColor: c.hit },
  rowText: { fontFamily: MONO, fontSize: 14, color: c.ink2 },
  rowTextLit: { color: c.ink, fontWeight: '600' },
  rowOff: { color: c.ink3 },
  strike: { textDecorationLine: 'line-through', color: c.ink3 },
  more: { fontSize: 14, fontWeight: '600', color: c.data, paddingVertical: 8, paddingHorizontal: 8 },
  sum: { backgroundColor: c.well, borderRadius: 12, padding: 12 },
  sumText: { fontSize: 14, color: c.ink, lineHeight: 20 },
  link: { fontSize: 14, fontWeight: '600', color: c.data, paddingVertical: 4 },
  btn: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnPri: { backgroundColor: c.act, marginTop: 4 },
  btnOff: { opacity: 0.35 },
  btnPriText: { fontSize: 17, fontWeight: '700', color: c.onAct },
  btnSec: { backgroundColor: c.well },
  btnSecText: { fontSize: 17, fontWeight: '600', color: c.ink },
});
