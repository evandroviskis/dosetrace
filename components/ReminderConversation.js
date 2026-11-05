// "Make sure your reminders arrive" as a guided conversation (docs/specs/reminder-setup-conversation.md,
// RS-1..RS-14, founder 2026-11-05; picture docs/design/reminder-setup-conversation.html). It replaces
// the list (A-112 picture B) everywhere it opened: the Reminder check screen (Android and iPhone) and
// the Android onboarding step. What it says and when is decided in lib/reminderConversation (pure);
// this file reads the phone (lib/notifications), opens the Android screens and draws the bubbles in
// the assistant's look (ProtocolAssistant: app bubbles raised, the person's in ink, chips). Every
// sentence is a fixed app text: no AI, no network. Theme tokens only.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, AppState, AccessibilityInfo, Platform } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { MONO } from '../lib/fonts';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import FeatureIcon from './FeatureIcon';
import { readReminderHealth, openReminderFix, askNotificationPermission, markDeepSleepChecked, sendTestReminder } from '../lib/notifications';
import { rowTitleKey, scheduleState } from '../lib/reminderHealth';
import * as C from '../lib/reminderConversation';
import { renderText } from '../lib/assistantText';
import { saveResume, clearResume } from '../lib/reminderSetup';
import { formatDate, fillDate } from '../lib/localeFormat';
import { formatTime } from '../lib/timeFormat';
import { pluralKey } from '../lib/plural';
import { protocolDisplayName } from '../lib/protocolName';

// mode: 'screen' (Settings, Today, the notification tap) | 'onboarding' (Android, phone items only).
// resume: the item an Android screen was open on when Android closed the app (RS-4, cold return).
// focus: the item a Today card pointed at (marked in the summary). onClose: Fechar / "Agora não" /
// "Concluir". onContinue: onboarding's "Continuar" / "Configurar depois" / "Agora não".
export default function ReminderConversation({ mode = 'screen', resume = null, focus = null, onClose, onContinue }) {
  const { t, language, timeFormat } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [health, setHealth] = useState(null);
  const [conv, setConv] = useState(null);
  const convRef = useRef(null);
  const healthRef = useRef(null);
  const pending = useRef(null); // { away, settled, opened, settledAt } while an Android screen is open
  const scrollRef = useRef(null);
  const nearBottom = useRef(true); // review 6: the person is at the end of the conversation
  const seenCount = useRef(0);
  convRef.current = conv;
  healthRef.current = health;

  // The first read starts the conversation (never drawn before the phone is read).
  useEffect(() => {
    let live = true;
    readReminderHealth().then((h) => {
      if (!live) return;
      setHealth(h);
      setConv((c) => c || C.startConversation(h, { mode, resume }));
      if (resume) clearResume();
    }).catch(() => {});
    return () => { live = false; if (mode === 'screen') clearResume(); };
  }, []);

  // A plain re-read (back in front, a test sent): the summary updates, and a setting that became OK by
  // itself while its step is on screen gets its green line and the walk goes on (review 6).
  const refresh = useCallback(() => {
    readReminderHealth().then((h) => { setHealth(h); setConv((c) => C.refreshed(c, h)); }).catch(() => {});
  }, []);

  // Back from Android (RS-4): read the phone again, then the conversation says what it found. The read
  // does not wait for a resync in flight (review 6: no chip lag after "Permitir"); a full read follows.
  const readBack = useCallback(() => {
    pending.current = null;
    if (mode === 'screen') clearResume();
    readReminderHealth({ waitSync: false })
      .then((h) => { setHealth(h); setConv((c) => C.returned(c, h)); refresh(); })
      // Unreadable: decide with the last read rather than leave the person without chips.
      .catch(() => { setConv((c) => C.returned(c, healthRef.current)); });
  }, [mode, refresh]);
  const check = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    if (C.returnReady({ away: p.away, settled: p.settled, appState: AppState.currentState, opened: p.opened, waitedMs: p.settledAt ? Date.now() - p.settledAt : 0, activeMs: p.activeAt ? Date.now() - p.activeAt : 0 })) readBack();
  }, [readBack]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (pending.current && (st === 'background' || st === 'inactive')) { pending.current.away = true; pending.current.activeAt = 0; }
      if (st === 'active') {
        if (pending.current) {
          // Review 3: Android's startActivityAsync may never settle — read anyway after 1.5 s in front.
          if (pending.current.away && !pending.current.activeAt) pending.current.activeAt = Date.now();
          check();
          setTimeout(check, 1600);
        } else refresh();
      }
    });
    return () => sub.remove();
  }, [check, refresh]);

  async function runOpen(effect) {
    const p = { away: false, settled: false, opened: true, settledAt: 0, activeAt: 0 };
    pending.current = p;
    // Cold return: Today brings the person back here — only this account (review 6).
    if (mode === 'screen') saveResume(effect.item, healthRef.current && healthRef.current.userId);
    let opened = false;
    try {
      // RS-3: notifications first try the system dialog; when it cannot show, DoseTrace's notification settings.
      if (effect.ask) opened = (await askNotificationPermission()) || (await openReminderFix(effect.fix));
      else opened = await openReminderFix(effect.fix);
    } catch { opened = false; }
    if (pending.current !== p) return;
    p.settled = true; p.opened = !!opened; p.settledAt = Date.now();
    check();
    setTimeout(check, 1600);
  }

  function tap(id) {
    const cur = convRef.current;
    const h = healthRef.current;
    if (!cur || !h || pending.current) return;
    const { conv: next, effect } = C.choose(cur, id, h);
    setConv(next);
    if (!effect) return;
    if (effect.type === 'close') { if (onClose) onClose(); return; }
    if (effect.type === 'continue') { if (onContinue) onContinue(); return; }
    if (effect.type === 'open') { runOpen(effect); return; }
    if (effect.type === 'checked') {
      // SP-10: saved on this phone with its date.
      markDeepSleepChecked().then(() => readReminderHealth()).then((fresh) => { setHealth(fresh); setConv((c) => C.afterChecked(c, fresh)); }).catch(() => {});
      return;
    }
    if (effect.type === 'test') {
      const blocked = C.testBlocked(h); // the same rule as before: a red row means it cannot arrive
      sendTestReminder().then((ok) => { setConv((c) => C.testResult(c, { ok, blocked })); refresh(); }).catch(() => {});
    }
  }

  // RS-11: a new message is announced (the app's lines, in order).
  const said = useRef(null);
  useEffect(() => {
    if (!conv) return;
    const prev = said.current;
    said.current = conv;
    if (!prev) return;
    const lines = C.newSpoken(prev, conv).map(msgText).filter(Boolean);
    if (lines.length) AccessibilityInfo.announceForAccessibility(lines.join(' '));
  }, [conv]);

  const tr = (key, params) => renderText(t, key, params);
  function msgText(m) {
    // Only the latest summary reads the phone live; an older head keeps the words it was shown with.
    if (m.kind === 'head') { const hd = health && C.isLatestSummary(conv, m) ? C.summaryHead(C.summaryHealth(conv, m, health), conv) : m; return tr(hd.key, hd.params); }
    if (m.parts) return m.parts.map((p) => tr(p.key, p.params)).join(' ');
    return m.key ? tr(m.key, m.params) : '';
  }
  function rich(m, style) {
    const parts = m.parts || [{ key: m.key, params: m.params, bold: m.bold }];
    const segs = [];
    parts.forEach((p, i) => {
      if (i > 0) segs.push({ text: ' ', bold: false });
      for (const sg of C.segments(t, p.key, p.params, p.bold)) segs.push(sg);
    });
    return <Text style={style}>{segs.map((sg, i) => (sg.bold ? <Text key={i} style={s.bold}>{sg.text}</Text> : sg.text))}</Text>;
  }

  // ── the summary card (RS-9): every item with its state as read now ──
  function stateText(c) {
    if (c.id === 'refresh') {
      if (c.pending) return t('rc_refresh_pending');
      if (c.state === 'warn') return t('rc_refresh_warn').replace('{n}', String(c.days));
      const d = new Date(c.at);
      const when = t('rc_refresh_ok').replace('{when}', `${formatDate(d, language, 'weekdayDayMonth')}, ${formatTime(d.toTimeString().slice(0, 5), language, timeFormat)}`);
      return c.until ? `${when} · ${t('rc_refresh_until').replace('{date}', formatDate(new Date(c.until), language, 'dayMonth'))}` : when;
    }
    if (c.id === 'deep_sleep' && c.state === 'ok' && c.at) return fillDate(t('rc_deep_sleep_checked'), formatDate(new Date(c.at), language, 'dayMonth'));
    return t(C.stateTextKey(c));
  }
  function stateColor(c) {
    if (c.state === 'block') return colors.risk;
    if (c.state === 'warn') return colors.attention;
    if (c.state === 'ok') return colors.ok;
    return colors.ink2;
  }
  // health: the phone this card is drawn from (live for the latest summary, its snapshot otherwise).
  // latest: only the latest card offers actions (review 2: "Abrir" on confirmed deep sleep and on the
  // rows the app cannot read, as the list had it; it opens the system screen, the return re-reads).
  function summary(key, health, latest) {
    const rows = C.summaryRows(health, { mode });
    return (
      <View key={key} style={s.sum}>
        {rows.map((c, i) => {
          const title = t(rowTitleKey(c.id, health.manufacturer) || C.ROW[c.id].title);
          const ok = c.state === 'ok';
          const openFix = latest ? C.rowOpenFix(c) : null;
          return (
            <View key={c.id} style={[s.sumRow, i === rows.length - 1 && s.sumRowLast, c.id === focus && s.sumRowFocus]}>
              <View style={s.sumMain} accessible accessibilityLabel={`${title}: ${stateText(c)}`}>
                <Text style={s.sumTitle}>{title}</Text>
                <View style={s.sumState}>
                  {ok ? <FeatureIcon name="check" size={16} color={colors.ok} /> : c.state === 'block' ? <FeatureIcon name="warning" size={16} color={colors.risk} /> : null}
                  <Text style={[s.sumStateText, { color: stateColor(c) }]}>{stateText(c)}</Text>
                </View>
              </View>
              {openFix ? (
                <TouchableOpacity onPress={() => { openReminderFix(openFix).catch(() => {}); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={`${t('rc_fix_open')}: ${title}`}>
                  <Text style={s.link}>{t('rc_fix_open')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  }
  function schedule(key, health) {
    const sched = scheduleState(health);
    const next = health.next;
    let main = null;
    let sub = null;
    let risk = false;
    if (sched === 'silent') main = t('rc_silent_on');
    else if (sched === 'off') main = t('rc_reminders_off');
    else if (sched === 'block') { main = t('rc_none'); sub = t('rc_none_sub'); risk = true; }
    else if (next) {
      const when = `${formatDate(new Date(next.atMs), language, 'weekdayDayMonth')}, ${formatTime(new Date(next.atMs).toTimeString().slice(0, 5), language, timeFormat)}`;
      main = t('rcv_next_line').replace('{when}', when);
      // A-134: the protocol's display name (as on Today), not the stored notification title.
      sub = [(health.next.protocol ? protocolDisplayName(health.next.protocol, t) : health.next.title), t(pluralKey('rc_count', health.scheduledCount, language)).replace('{n}', String(health.scheduledCount))].filter(Boolean).join(' · ');
    } else main = t(pluralKey('rc_count', health.scheduledCount, language)).replace('{n}', String(health.scheduledCount));
    return (
      <View key={key} style={s.app}>
        <Text style={[s.appText, risk && { color: colors.risk }]}>{main}</Text>
        {sub ? <Text style={s.appSub}>{sub}</Text> : null}
      </View>
    );
  }

  // The DoseTrace mark (founder "2 ícone"): the app's own icon, fixed brand artwork, beside the first
  // message of each step only. Decoration for screen readers.
  function mark() {
    return (
      <View style={s.markWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Image source={require('../assets/icon.png')} style={s.mark} accessibilityIgnoresInvertColors />
      </View>
    );
  }
  function line(m, icon, color) {
    return (
      <View key={m.id} style={s.line}>
        <FeatureIcon name={icon} size={18} color={color} />
        <Text style={[s.lineText, { color }]}>{msgText(m)}</Text>
      </View>
    );
  }
  function renderMsg(m) {
    if (m.kind === 'user') return <View key={m.id} style={s.user}><Text style={s.userText}>{tr(m.key, m.params)}</Text></View>;
    if (m.kind === 'done') return line(m, 'check', colors.ok);
    if (m.kind === 'warn') return line(m, 'alert', colors.attention);
    if (m.kind === 'note') return line(m, 'info', colors.ink2);
    if (m.kind === 'summary') {
      if (!health) return null;
      // RS-9 (coordinator 2026-11-05): under the latest card, "Ajustar <item>" for every item not OK.
      const fixes = m.id === lastSummaryId ? C.fixChips(conv, health) : [];
      return (
        <View key={m.id} style={s.sumWrap}>
          {summary(`${m.id}-card`, C.summaryHealth(conv, m, health), m.id === lastSummaryId)}
          {fixes.length > 0 ? <View style={s.chips}>{fixes.map(chipView)}</View> : null}
        </View>
      );
    }
    if (m.kind === 'schedule') return health ? schedule(m.id, C.summaryHealth(conv, m, health)) : null;
    const bubble = (
      <View style={[s.app, m.mark && s.appMarked]}>
        {m.titleKey ? (
          <View style={s.appHead}>
            <FeatureIcon name={m.icon} size={16} color={colors.ink2} />
            <Text style={s.appTitle}>{t(m.titleKey)}</Text>
          </View>
        ) : null}
        {m.kind === 'head' ? <Text style={s.appText}>{msgText(m)}</Text> : rich(m, s.appText)}
      </View>
    );
    if (!m.mark) return <View key={m.id}>{bubble}</View>;
    return <View key={m.id} style={s.markRow}>{mark()}{bubble}</View>;
  }

  const prog = C.progress(conv);
  const chipList = conv && !pending.current ? C.chips(conv, health) : [];
  const lastSummaryId = conv ? (conv.messages.filter((m) => m.kind === 'summary').pop() || {}).id : null;
  function chipView(chip) {
    const label = tr(chip.key, chip.params);
    return (
      <TouchableOpacity key={chip.id} style={[s.chip, chip.primary && s.chipPrimary]} onPress={() => tap(chip.id)} accessibilityRole="button" accessibilityLabel={label}>
        <Text style={[s.chipText, chip.primary && s.chipTextPrimary]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.root}>
      {/* Review 5: inside onboarding its own top bar is the one progress indicator. */}
      {C.showHeader(mode) ? (
      <>
      <View style={s.head}>
        <View style={s.headSide}>
          {onClose ? (
            <TouchableOpacity onPress={() => onClose()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button">
              <Text style={s.headBtn}>{t('ap_close')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {/* The picture's short title; screen readers hear the screen's full name, as the door names it. */}
        <Text style={s.headTitle} accessibilityRole="header" accessibilityLabel={t(Platform.OS === 'android' ? 'rc_setup_title' : 'settings_rc_title')}>{t('rcv_title')}</Text>
        <View style={[s.headSide, s.headRight]}>
          {conv && prog.total > 0 ? <Text style={s.headCount}>{t('rcv_progress').replace('{n}', String(prog.n)).replace('{total}', String(prog.total))}</Text> : null}
        </View>
      </View>
      <View style={s.bar}><View style={[s.barFill, { width: `${prog.total ? (prog.n / prog.total) * 100 : 0}%` }]} /></View>
      </>
      ) : null}
      <ScrollView
        ref={scrollRef}
        style={s.flex}
        contentContainerStyle={s.list}
        scrollEventThrottle={64}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          nearBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80;
        }}
        onContentSizeChange={() => {
          // Review 6: follow a new message, never pull someone reading the history back down.
          const count = conv ? conv.messages.length : 0;
          const newMessage = count !== seenCount.current;
          seenCount.current = count;
          if (C.shouldAutoScroll({ nearBottom: nearBottom.current, newMessage }) && scrollRef.current) scrollRef.current.scrollToEnd({ animated: true });
        }}
      >
        {conv ? conv.messages.map(renderMsg) : null}
        {chipList.length > 0 ? (
          <View style={s.chips}>
            {chipList.map((chip) => (
              <TouchableOpacity key={chip.id} style={[s.chip, chip.primary && s.chipPrimary]} onPress={() => tap(chip.id)} accessibilityRole="button" accessibilityLabel={t(chip.key)}>
                <Text style={[s.chipText, chip.primary && s.chipTextPrimary]}>{t(chip.key)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

// The assistant's look (screens/components/ProtocolAssistant makeStyles) and the picture: the
// conversation on the ground, app bubbles raised, the person's in ink, chips outlined with one ink.
const makeStyles = (c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.ground },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 16, gap: 8 },
  headSide: { minWidth: 72, minHeight: 44, justifyContent: 'center' },
  headRight: { alignItems: 'flex-end' },
  headBtn: { fontSize: 17, fontWeight: '600', color: c.ink },
  headTitle: { flexShrink: 1, fontSize: 17, fontWeight: '700', color: c.ink, textAlign: 'center' },
  headCount: { fontSize: 14, color: c.ink2, fontFamily: MONO['400'] },
  bar: { height: 3, backgroundColor: c.well },
  barFill: { height: 3, backgroundColor: c.ok },
  list: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', gap: 8 },
  markRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  markWrap: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden' },
  mark: { width: 28, height: 28 },
  app: { alignSelf: 'flex-start', maxWidth: '88%', backgroundColor: c.raised, borderRadius: 20, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 12 },
  appMarked: { flexShrink: 1 },
  appHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  appTitle: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: c.ink2 },
  appText: { fontSize: 17, lineHeight: 22, color: c.ink },
  appSub: { fontSize: 14, lineHeight: 19, color: c.ink2, marginTop: 2 },
  bold: { fontWeight: '700' },
  user: { alignSelf: 'flex-end', maxWidth: '84%', backgroundColor: c.act, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },
  userText: { fontSize: 17, lineHeight: 22, fontWeight: '500', color: c.onAct },
  line: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, maxWidth: '100%' },
  lineText: { flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  sumWrap: { alignSelf: 'stretch', gap: 8 },
  sum: { alignSelf: 'stretch', backgroundColor: c.raised, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 4 },
  sumRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line },
  sumMain: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  link: { fontSize: 14, fontWeight: '600', color: c.ink, textDecorationLine: 'underline' },
  sumRowLast: { borderBottomWidth: 0 },
  // The item a Today card pointed at (A-110 RG-5): the well tone, as the list had it.
  sumRowFocus: { backgroundColor: c.well, marginHorizontal: -14, paddingHorizontal: 14 },
  sumTitle: { flexShrink: 1, fontSize: 15, lineHeight: 20, color: c.ink },
  sumState: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, marginLeft: 'auto' },
  sumStateText: { flexShrink: 1, fontSize: 14, lineHeight: 19, fontWeight: '600', textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { minHeight: 44, maxWidth: '100%', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1, borderColor: c.line, backgroundColor: c.raised, justifyContent: 'center' },
  chipPrimary: { backgroundColor: c.act, borderColor: c.act },
  chipText: { fontSize: 15, fontWeight: '600', color: c.ink },
  chipTextPrimary: { color: c.onAct },
});
