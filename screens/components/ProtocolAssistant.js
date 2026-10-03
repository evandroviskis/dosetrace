// The AI protocol assistant window (docs/specs/ai-protocol-assistant.md, signed 2026-10-02;
// approved picture https://claude.ai/artifact/9xEU7h9H1FnUx4TgKUZnhE). ONE window for the four
// ways in (AP-1): Build it with AI, Finish with AI, the dose step, Ask AI for help on the
// doesn't-fit warning. It renders inside the add / edit protocol sheet, in place of the form,
// and always goes back to the form with every answer kept (AP-0, AP-16).
//
// The conversation itself is plain data (lib/protocolAssistant): every sentence here is an
// app-written string (AP-14), every number is the user's and every calculation the app's (AP-2).
// The AI (edge function protocol-assistant) only turns a typed answer into structured values,
// which lib/assistantSchema validates again before anything is used. Graduated tokens only.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useTheme } from '../../lib/theme';
import { MONO } from '../../lib/fonts';
import { CONTENT_MAX_WIDTH } from '../../lib/responsive';
import FeatureIcon from '../../components/FeatureIcon';
import { DTPickerSheet, DTWheel, DTActionSheet } from './ProtocolParts';
import { dateColumns, dateAfter } from '../../lib/wheelPick';
import { MONTHS_SHORT, formatDate } from '../../lib/localeFormat';
import * as A from '../../lib/protocolAssistant';
import { renderText, renderParam } from '../../lib/assistantText';
import { assistantErrorNotice } from '../../lib/assistantErrors';
import { startAssistant, understandAnswer } from '../../lib/assistantClient';

// door: build | finish | dose | fit. form: the wizard form now. ctx: { touched, visitedStep,
// mixedOn, editing }. catalog: { recon, rtu, oral: [{ key, label }] }.
// onFinish(kind, result): kind = save | fill | handback; result = { form, mixedOn, notMixed }.
// scanLabel(fromCamera) → Promise<{ vial } | { error: { title, body } } | null> (the vial-scan path).
export default function ProtocolAssistant({ door, form, ctx, catalog, t, language, onFinish, scanLabel }) {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const tr = (key, params) => renderText(t, key, params);
  const baseForm = useRef(form).current;
  const convId = useRef(null);
  const [conv, setConv] = useState(null);       // the conversation (lib/protocolAssistant)
  const [phase, setPhase] = useState('starting'); // starting | ready | blocked
  const [blocked, setBlocked] = useState(null);   // the notice when the AI can't be used
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(null);     // { iso } while the date wheel is open
  const [photoChoice, setPhotoChoice] = useState(null);
  const scrollRef = useRef(null);
  const finished = useRef(false);

  const now = () => new Date();
  const formatDay = (iso) => formatDate(iso, language, 'weekdayDayMonth', now());

  // Start: one use of the weekly limit, counted on the server (AP-18). A failure says why
  // and leaves only "Continue in the form" (AP-16).
  useEffect(() => {
    let alive = true;
    convId.current = Crypto.randomUUID();
    (async () => {
      const r = await startAssistant(convId.current, door);
      if (!alive) return;
      if (r.error) {
        setBlocked(assistantErrorNotice(r.error, formatDay));
        setPhase('blocked');
        return;
      }
      setConv(A.startConversation(door, form, { ...ctx, language, now: now(), catalog }));
      setPhase('ready');
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The conversation ended (Done / Fill the form / Continue in the form).
  useEffect(() => {
    if (!conv || !conv.ended || finished.current) return;
    finished.current = true;
    onFinish(conv.outcome.kind, A.formFromConversation(conv, baseForm));
  }, [conv]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [conv, busy, phase]);

  function close() {
    if (finished.current) return;
    finished.current = true;
    // Closing keeps every answer: the form gets what was said (AP-0, AP-16).
    onFinish('handback', conv ? A.formFromConversation(conv, baseForm) : null);
  }

  function tap(o) {
    if (!conv || busy) return;
    if (o.id === 'pickdate' || o.id === 'startdate') {
      const today = A.isoDay(now(), 0);
      setPicker({ iso: (conv.step === 'start' && conv.draft.startDate) || today });
      return;
    }
    setConv(A.answerOption(conv, o.id));
  }

  async function send() {
    const typed = text.trim();
    if (!typed || !conv || busy) return;
    const step = A.textStep(conv);
    // Plain numbers ("7 ml", "20 mg", "3") are read on the phone; anything else goes to the AI.
    const local = A.localUnderstand(step, typed, language);
    if (local) { setText(''); setConv(A.answerText(conv, typed, local)); return; }
    setBusy(true);
    const r = await understandAnswer(convId.current, step, typed.slice(0, 300), language, now());
    setBusy(false);
    if (r.error) {
      // Nothing is lost: the typed text stays in the box, the answers stay in the form.
      const n = assistantErrorNotice(r.error, formatDay);
      setConv((cur) => A.notice(cur, n.key, n.params));
      return;
    }
    setText('');
    setConv((cur) => A.answerText(cur, typed, r.data && r.data.result));
  }

  async function photo(fromCamera) {
    if (!scanLabel || !conv) return;
    setBusy(true);
    const r = await scanLabel(fromCamera);
    setBusy(false);
    if (!r) return;
    if (r.vial) { setConv((cur) => A.labelRead(cur, r.vial)); return; }
    setConv((cur) => A.notice(cur, r.quota ? 'ap_label_quota' : 'ap_label_none'));
  }

  const opts = conv && !conv.ended ? A.options(conv) : [];
  const input = conv && !conv.ended ? A.inputFor(conv) : { text: false, photo: false };
  const lastApp = conv ? (() => { for (let i = conv.messages.length - 1; i >= 0; i--) if (conv.messages[i].from === 'app') return conv.messages[i].id; return null; })() : null;

  const Chip = ({ o }) => (
    <TouchableOpacity style={[s.pill, o.primary && s.pillPrimary]} onPress={() => tap(o)} disabled={busy} accessibilityRole="button">
      <Text style={[s.pillText, o.primary && s.pillTextPrimary]} numberOfLines={2}>{o.text != null ? o.text : tr(o.key, o.params)}</Text>
    </TouchableOpacity>
  );

  function renderMsg(m) {
    if (m.from === 'user') {
      const label = m.text != null && m.text !== 'null' ? m.text : tr(m.key, m.params);
      return (
        <View key={m.id} style={s.userWrap}>
          <View style={s.user}><Text style={s.userText}>{label}</Text></View>
        </View>
      );
    }
    if (m.kind === 'review') {
      return (
        <View key={m.id} style={s.review}>
          <Text style={s.reviewTitle}>{tr(m.key, m.params)}</Text>
          {(m.rows || []).map((r, i) => (
            <View key={i} style={s.kv}>
              <Text style={s.kvLabel}>{t(r.key)}</Text>
              <Text style={s.kvValue}>{typeof r.value === 'string' ? r.value : renderParam(t, r.value)}</Text>
            </View>
          ))}
        </View>
      );
    }
    const boxed = m.kind === 'deflect' || m.kind === 'error';
    return (
      <View key={m.id} style={boxed ? s.deflect : s.app}>
        <Text style={boxed ? s.deflectText : (m.kind === 'summary' ? s.appTextStrong : s.appText)}>{tr(m.key, m.params)}</Text>
      </View>
    );
  }

  const title = t(`ap_title_${door}`);

  return (
    <View style={s.root}>
      <View style={s.head}>
        <TouchableOpacity style={s.headSide} onPress={close} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button">
          <Text style={s.headBtn}>{t('ap_close')}</Text>
        </TouchableOpacity>
        <View style={s.headMid}>
          <FeatureIcon name="ai_spark" size={18} color={c.ink2} />
          <Text style={s.headTitle} numberOfLines={1} accessibilityRole="header">{title}</Text>
        </View>
        <View style={s.headSide} />
      </View>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}>
        <ScrollView ref={scrollRef} style={s.flex} contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
          {phase === 'starting' && (
            <View style={s.app}><View style={s.row}><ActivityIndicator size="small" color={c.ink2} /><Text style={s.appText}>{t('ap_starting')}</Text></View></View>
          )}
          {phase === 'blocked' && blocked && (
            <>
              <View style={s.deflect}><Text style={s.deflectText}>{tr(blocked.key, blocked.params)}</Text></View>
              <View style={s.chips}>
                <TouchableOpacity style={[s.pill, s.pillPrimary]} onPress={close} accessibilityRole="button">
                  <Text style={[s.pillText, s.pillTextPrimary]}>{t('ap_opt_form')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
          {conv && conv.messages.map((m) => (
            <View key={m.id}>
              {renderMsg(m)}
              {m.id === lastApp && opts.length > 0 && (
                <View style={s.chips}>{opts.map((o) => <Chip key={o.id} o={o} />)}</View>
              )}
            </View>
          ))}
          {conv && opts.length > 0 && !lastApp && <View style={s.chips}>{opts.map((o) => <Chip key={o.id} o={o} />)}</View>}
          {busy && (
            <View style={s.app}><View style={s.row}><ActivityIndicator size="small" color={c.ink2} /><Text style={s.appTextMuted}>{t('ap_reading')}</Text></View></View>
          )}
        </ScrollView>
        {phase === 'ready' && input.text && (
          <View style={s.composer}>
            <View style={s.field}>
              {input.photo && scanLabel ? (
                <TouchableOpacity
                  style={s.cam}
                  onPress={() => setPhotoChoice({
                    title: t('vial_scan_choose_sub'),
                    options: [{ label: t('blood_source_camera'), onPress: () => photo(true) }, { label: t('blood_source_photo'), onPress: () => photo(false) }],
                    cancelLabel: t('cancel'),
                  })}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={t('ap_photo')}
                >
                  <FeatureIcon name="scan" size={20} color={c.ink} />
                </TouchableOpacity>
              ) : null}
              <TextInput
                style={s.input}
                value={text}
                onChangeText={setText}
                placeholder={t('ap_input_placeholder')}
                placeholderTextColor={c.ink3}
                maxLength={300}
                multiline
                editable={!busy}
                returnKeyType="send"
                blurOnSubmit
                onSubmitEditing={send}
              />
              <TouchableOpacity style={[s.send, (!text.trim() || busy) && s.sendOff]} onPress={send} disabled={!text.trim() || busy} accessibilityRole="button" accessibilityLabel={t('ap_send')}>
                {busy ? <ActivityIndicator size="small" color={c.onAct} /> : <FeatureIcon name="ai_spark" size={20} color={!text.trim() ? c.ink3 : c.onAct} />}
              </TouchableOpacity>
            </View>
          </View>
        )}
        <Text style={s.caveat}>{t('ap_caveat')}</Text>
      </KeyboardAvoidingView>

      <DTActionSheet config={photoChoice} onClose={() => setPhotoChoice(null)} />
      <DTPickerSheet
        visible={!!picker}
        title={conv && conv.step === 'mixed' ? t('ap_q_mixed') : t('ap_q_start')}
        doneLabel={t('done')}
        onDone={() => { const iso = picker && picker.iso; setPicker(null); if (iso && conv) setConv(A.answerDate(conv, iso)); }}
      >
        {picker && (
          <DTWheel
            columns={dateColumns(picker.iso, now(), MONTHS_SHORT[language] || MONTHS_SHORT.en)}
            onChange={(col, i) => setPicker((p) => ({ iso: dateAfter(p.iso, now(), col, i) }))}
          />
        )}
      </DTPickerSheet>
    </View>
  );
}

// Graduated (the food chat's look, prototype .chatsheet / .bub / .deflect / .composer2): the
// chat sits on the ground; app bubbles are raised, the user's are ink; one ink action (send).
const makeStyles = (c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.ground },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.line },
  headSide: { minWidth: 72, minHeight: 44, justifyContent: 'center' },
  headBtn: { fontSize: 17, fontWeight: '600', color: c.ink },
  headMid: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  headTitle: { fontSize: 17, fontWeight: '700', color: c.ink },
  list: { paddingHorizontal: 16, paddingVertical: 16, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  app: { alignSelf: 'flex-start', maxWidth: '88%', backgroundColor: c.raised, borderRadius: 20, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 12, marginVertical: 5 },
  appText: { fontSize: 17, lineHeight: 22, color: c.ink },
  appTextStrong: { fontSize: 17, lineHeight: 22, color: c.ink, fontWeight: '600' },
  appTextMuted: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  userWrap: { alignSelf: 'flex-end', maxWidth: '84%', marginVertical: 5 },
  user: { backgroundColor: c.act, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 12 },
  userText: { fontSize: 17, lineHeight: 22, color: c.onAct },
  deflect: { alignSelf: 'stretch', borderWidth: 1, borderColor: c.line, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, marginVertical: 5 },
  deflectText: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2, marginBottom: 6 },
  pill: { minHeight: 40, maxWidth: '100%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: c.line, backgroundColor: c.raised, justifyContent: 'center' },
  pillPrimary: { backgroundColor: c.act, borderColor: c.act },
  pillText: { fontSize: 15, fontWeight: '600', color: c.ink },
  pillTextPrimary: { color: c.onAct },
  review: { alignSelf: 'stretch', backgroundColor: c.raised, borderRadius: 18, padding: 14, gap: 8, marginVertical: 5 },
  reviewTitle: { fontSize: 13, fontWeight: '600', color: c.ink2 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 7 },
  kvLabel: { fontSize: 15, color: c.ink2, flexShrink: 0 },
  kvValue: { fontSize: 15, color: c.ink, fontFamily: MONO['500'], textAlign: 'right', flexShrink: 1 },
  composer: { borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.ground, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2 },
  field: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  cam: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 46, maxHeight: 120, backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: 23, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 17, color: c.ink },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: c.well },
  caveat: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: c.ink2, textAlign: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
});
