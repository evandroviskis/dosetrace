// Unrecorded period beyond 14 days, option B (founder 2026-11-03 "B"; answers 2026-11-04 10:04 EST;
// docs/design/unrecorded-period.html, docs/specs/unrecorded-period.md UP-2, UP-13, UP-14, UP-20, UP-31 … UP-35).
// One protocol per sheet, in a queue ("1 de 3"): "De {de} a {até} há {n} doses de {nome} sem registro. Você
// tomou?" → Tomei todas no horário / Escolher quais / Não tomei, and the link "Não lembro". Nothing selected on
// open; Salvar stays off until a choice; the summary (from the plan that writes) shows what changes, the vial
// included, before saving. "Escolher quais" replaces the content of the same sheet ("Voltar" goes back); a daily
// protocol is grouped by week. The look of DoseFixSheet ("Desde quando você usa…?"). Theme tokens only.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet } from 'react-native';
import Modal from '../../components/PresenceModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';
import { useLanguage } from '../../i18n/LanguageContext';
import { protocolDisplayName } from '../../lib/protocolName';
import { formatDate } from '../../lib/localeFormat';
import { formatTime } from '../../lib/timeFormat';
import { frequencyLabelFor } from '../../lib/schedule';
import { planUnrecordedAnswer, groupsByWeek, weekGroups } from '../../lib/unrecordedPeriod';
import { questionTexts, summaryText, fill } from '../../lib/unrecordedText';
import CheckMark from '../../components/CheckMark';

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// queue: [{ protocol, entries, kept }] (lib/doseActions unrecordedQueue). context: null | { labDate (text) }.
// vialFor(protocol) → the protocol's active vial (for the summary); capacityOf: lib/supplyLow vialCapacity.
// onSave(ask, { choice, picked }) → true when written (the next question opens); onLater(): "Agora não" or a
// tap outside — the whole queue closes. toast: { text, action, onPress } — the "Desfazer" bar of the answer just
// saved, shown over the next question (UP-17).
export default function UnrecordedSheet({ queue, context = null, vialFor, capacityOf, onSave, onLater, toast = null }) {
  const { colors } = useTheme();
  const { t, language, timeFormat } = useLanguage();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => styles(colors), [colors]);
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState(null);
  const [mode, setMode] = useState('ask');
  const [picked, setPicked] = useState(() => new Set());
  const [openWeeks, setOpenWeeks] = useState(() => new Set());
  const busy = useRef(false);
  const total = queue ? queue.length : 0;
  const ask = queue && queue[index] ? queue[index] : null;
  useEffect(() => { setIndex(0); }, [queue]);
  useEffect(() => {
    setChoice(null); setMode('ask'); setPicked(new Set()); busy.current = false;
    const weeks = ask ? weekGroups(ask.entries) : [];
    setOpenWeeks(new Set(weeks.length ? [weeks[0].startMs] : []));
  }, [ask]);
  if (!ask) return <Modal visible={false} transparent onRequestClose={onLater}><View /></Modal>;

  const p = ask.protocol;
  const name = protocolDisplayName(p, t);
  const fmtDay = (ms) => formatDate(new Date(ms), language, 'dayMonth');
  const fmtWeekday = (ms) => formatDate(new Date(ms), language, 'weekdayDayMonth');
  const fmtTime = (h) => formatTime(h, language, timeFormat);
  const q = questionTexts(ask, { t, language, name, fmtDay, fmtTime, freqLabel: (i) => frequencyLabelFor(i, t), index, total, personMarked: ask.kept || [] });
  const vial = vialFor ? vialFor(p) : null;
  const ready = choice === 'all' || choice === 'none' || choice === 'unknown' || choice === 'pick';
  const plan = ready ? planUnrecordedAnswer({ protocol: p, entries: ask.entries, choice, picked, vial, capacityOf }) : null;
  const sum = plan ? summaryText(plan.summary, { t, language, fmtDay }) : '';
  const weekly = groupsByWeek(p);
  const newestFirst = ask.entries.slice().sort((a, b) => b.slotMs - a.slotMs);

  const togglePick = (ms) => setPicked((prev) => { const n = new Set(prev); if (n.has(ms)) n.delete(ms); else n.add(ms); return n; });
  const setMany = (list, on) => setPicked((prev) => { const n = new Set(prev); for (const e of list) { if (on) n.add(e.slotMs); else n.delete(e.slotMs); } return n; });
  const allOn = picked.size === ask.entries.length;
  function save() {
    if (!ready || busy.current) return; // UP-17: a double tap never writes twice
    busy.current = true;
    let ok = false;
    try { ok = !!onSave(ask, { choice, picked }); } catch { ok = false; }
    if (!ok) { busy.current = false; return; }
    if (index + 1 < total) setIndex(index + 1);
  }

  const Opt = ({ k, title, sub }) => (
    <TouchableOpacity style={[s.opt, choice === k ? s.optOn : null]} onPress={() => { setChoice(k); if (k === 'pick') setMode('pick'); }}
      accessibilityRole="radio" accessibilityState={{ selected: choice === k }}>
      <Text style={s.optTitle}>{title}</Text>
      <Text style={s.optSub}>{sub}</Text>
    </TouchableOpacity>
  );
  const Box = ({ on, mixed }) => (
    <View style={[s.box, on || mixed ? s.boxOn : null]}>
      {on ? <CheckMark size={16} color={colors.onAct} /> : mixed ? <View style={s.dash} /> : null}
    </View>
  );
  const Row = ({ e }) => {
    const on = picked.has(e.slotMs);
    const day = fmtWeekday(e.slotMs);
    const time = fmtTime(hhmm(e.slotMs));
    return (
      <TouchableOpacity style={s.row} onPress={() => togglePick(e.slotMs)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
        accessibilityLabel={fill(t(on ? 'unrec_row_taken_a11y' : 'unrec_row_not_a11y'), { day, time })}>
        <Box on={on} />
        <Text style={s.rowDay}>{day}</Text>
        <Text style={s.rowTime}>{time}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onLater}>
      <Pressable style={s.scrim} onPress={onLater} accessibilityRole="button" accessibilityLabel={t('unrec_later')}>
        {toast ? (
          <View style={[s.toast, { top: 12 + insets.top }]} accessibilityLiveRegion="polite">
            <Text style={s.toastText} numberOfLines={2}>{toast.text}</Text>
            <TouchableOpacity onPress={toast.onPress} accessibilityRole="button" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.toastAction}>{toast.action}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <Pressable style={[s.sheet, { paddingBottom: 22 + insets.bottom }]} onPress={() => {}} accessibilityViewIsModal>
          <ScrollView style={s.scroll} contentContainerStyle={s.scrollIn} bounces={false}>
            {context && context.labDate ? <Text style={s.context}>{fill(t('unrec_lab_context'), { date: context.labDate })}</Text> : null}
            {q.counter ? <Text style={s.counter} accessibilityLabel={q.counterA11y}>{q.counter}</Text> : null}
            {mode === 'ask' ? (
              <>
                <Text style={s.title} accessibilityRole="header">{q.title}</Text>
                <Text style={s.sub}>{q.sub}</Text>
                {q.appLine ? <Text style={s.sub}>{[q.appLine, q.personLine].filter(Boolean).join(' ')}</Text> : null}
                <View style={s.opts} accessibilityRole="radiogroup">
                  <Opt k="all" title={t('unrec_all')} sub={t('unrec_all_sub')} />
                  <Opt k="pick" title={t('unrec_pick')} sub={t('unrec_pick_sub')} />
                  <Opt k="none" title={t('unrec_none')} sub={q.noneSub} />
                </View>
                <TouchableOpacity onPress={() => setChoice('unknown')} accessibilityRole="radio" accessibilityState={{ selected: choice === 'unknown' }}
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
                  <Text style={[s.link, choice === 'unknown' ? s.linkOn : null]}>{t('unrec_unknown')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity onPress={() => setMode('ask')} accessibilityRole="button" hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
                  <Text style={s.link}>‹ {t('back')}</Text>
                </TouchableOpacity>
                <Text style={s.title} accessibilityRole="header">{fill(t('unrec_pick_title'), { name })}</Text>
                <Text style={s.sub}>{ask.entries.length === 1
                  ? fill(t('unrec_pick_head_single'), { from: fmtDay(ask.entries[0].slotMs) })
                  : fill(t('unrec_pick_head'), { from: fmtDay(ask.entries[0].slotMs), to: fmtDay(ask.entries[ask.entries.length - 1].slotMs), n: ask.entries.length })}</Text>
                <TouchableOpacity style={s.row} onPress={() => setMany(ask.entries, !allOn)} accessibilityRole="checkbox" accessibilityState={{ checked: allOn ? true : picked.size ? 'mixed' : false }}>
                  <Box on={allOn} mixed={!allOn && picked.size > 0} />
                  <Text style={s.rowAll}>{t('unrec_select_all')}</Text>
                </TouchableOpacity>
                <View style={s.list}>
                  {weekly ? weekGroups(ask.entries).map((w) => {
                    const k = w.slots.filter((e) => picked.has(e.slotMs)).length;
                    const open = openWeeks.has(w.startMs);
                    const last = new Date(w.endMs - 1);
                    const label = fill(t('unrec_week'), { from: fmtDay(w.slots[w.slots.length - 1].slotMs), to: fmtDay(Math.min(last.getTime(), w.slots[0].slotMs)) });
                    return (
                      <View key={w.startMs}>
                        <View style={s.weekRow}>
                          <TouchableOpacity onPress={() => setMany(w.slots, k < w.slots.length)} accessibilityRole="checkbox"
                            accessibilityState={{ checked: k === w.slots.length ? true : k ? 'mixed' : false }}
                            accessibilityLabel={fill(t('unrec_week_a11y'), { from: fmtDay(w.slots[w.slots.length - 1].slotMs), to: fmtDay(w.slots[0].slotMs), k, n: w.slots.length })}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 6 }}>
                            <Box on={k === w.slots.length} mixed={k > 0 && k < w.slots.length} />
                          </TouchableOpacity>
                          <TouchableOpacity style={s.weekName} onPress={() => setOpenWeeks((prev) => { const n = new Set(prev); if (n.has(w.startMs)) n.delete(w.startMs); else n.add(w.startMs); return n; })}
                            accessibilityRole="button" accessibilityState={{ expanded: open }}>
                            <Text style={s.weekText}>{label}</Text>
                            <Text style={s.weekCount}>{fill(t('unrec_week_count'), { k, n: w.slots.length })}</Text>
                          </TouchableOpacity>
                        </View>
                        {open ? w.slots.map((e) => <Row key={e.slotMs} e={e} />) : null}
                      </View>
                    );
                  }) : newestFirst.map((e) => <Row key={e.slotMs} e={e} />)}
                </View>
              </>
            )}
            {plan ? (
              <View style={s.sum} accessibilityLiveRegion="polite">
                <Text style={s.sumText}>{sum}</Text>
              </View>
            ) : null}
          </ScrollView>
          <TouchableOpacity style={[s.btn, s.btnPri, !ready ? s.btnOff : null]} disabled={!ready} onPress={save}
            accessibilityRole="button" accessibilityState={{ disabled: !ready }}>
            <Text style={s.btnPriText}>{t('save')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnSec]} onPress={onLater} accessibilityRole="button">
            <Text style={s.btnSecText}>{t('unrec_later')}</Text>
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
  context: { fontSize: 14, color: c.ink2, lineHeight: 19 },
  counter: { fontSize: 13, fontWeight: '600', color: c.ink3, letterSpacing: 0.3 },
  title: { fontSize: 22, fontWeight: '700', color: c.ink, letterSpacing: -0.3 },
  sub: { fontSize: 15, color: c.ink2, lineHeight: 20 },
  opts: { gap: 10, marginTop: 2 },
  // one border width for both states, so the content never moves when selected (DoseFixSheet)
  opt: { borderWidth: 2, borderColor: c.line, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  optOn: { borderColor: c.ink },
  optTitle: { fontSize: 16, fontWeight: '700', color: c.ink },
  optSub: { fontSize: 14, color: c.ink2, marginTop: 3, lineHeight: 19 },
  link: { fontSize: 14, fontWeight: '600', color: c.data, paddingVertical: 4 },
  linkOn: { color: c.ink, textDecorationLine: 'underline' },
  list: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 4 },
  rowDay: { flex: 1, fontSize: 15, color: c.ink },
  rowTime: { fontSize: 15, color: c.ink2 },
  rowAll: { flex: 1, fontSize: 15, fontWeight: '600', color: c.ink },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 4 },
  weekName: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  weekText: { fontSize: 15, fontWeight: '600', color: c.ink },
  weekCount: { fontSize: 14, color: c.ink2 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: c.ink2, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: c.act, borderColor: c.act },
  dash: { width: 10, height: 2, borderRadius: 1, backgroundColor: c.onAct },
  sum: { backgroundColor: c.well, borderRadius: 12, padding: 12 },
  sumText: { fontSize: 14, color: c.ink, lineHeight: 20 },
  btn: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnPri: { backgroundColor: c.act, marginTop: 4 },
  btnOff: { opacity: 0.35 },
  btnPriText: { fontSize: 17, fontWeight: '700', color: c.onAct },
  btnSec: { backgroundColor: c.well },
  btnSecText: { fontSize: 17, fontWeight: '600', color: c.ink },
  // Today's Undo bar look (screens/TodayScreen undoBar): the toast block, its own text colour.
  toast: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 18, backgroundColor: c.toast, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14, maxWidth: 560, alignSelf: 'center' },
  toastText: { flex: 1, fontSize: 17, color: c.toastText },
  toastAction: { fontSize: 17, color: c.toastText, fontWeight: '700', textDecorationLine: 'underline' },
});
