// The unrecorded-period queue on a screen (Today, the Dose log, My Body's lab journal): the sheet, the one
// write per answer (lib/doseActions saveUnrecordedAnswer, one transaction), the "Desfazer" bar of the last
// answer (undoUnrecordedAnswer) and, after the last question, the usual vial prompt for a vial an answer
// finished (UP-15). docs/specs/unrecorded-period.md UP-15, UP-17, UP-20, UP-22, UP-24.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import UnrecordedSheet from './UnrecordedSheet';
import { saveUnrecordedAnswer, undoUnrecordedAnswer } from '../../lib/doseActions';
import { getActiveVials } from '../../lib/database';
import { vialCapacity } from '../../lib/supplyLow';
import { requestSync } from '../../lib/sync';
import { syncAllNotifications } from '../../lib/notifications';
import { requestVialPrompt } from '../../lib/vialPromptRequests';
import { useTheme } from '../../lib/theme';
import { useLanguage } from '../../i18n/LanguageContext';

const UNDO_MS = 5000;

// onOpenChange(open): the screen's one-popup gate (BK-20). onAnswered(): an answer was saved (the screen
// refreshes its rows, the Today state counts it). onLater(): "Agora não" / closed (Today counts it, UP-21).
// onChanged(): rows changed (after a save or an undo).
const UnrecordedHost = forwardRef(function UnrecordedHost({ onOpenChange, onAnswered, onLater, onChanged }, ref) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const s = styles(colors);
  const [queue, setQueue] = useState(null);
  const [context, setContext] = useState(null);
  const [toast, setToast] = useState(null); // { undo, at }
  const timer = useRef(null);
  const finished = useRef([]); // vials an answer finished: their prompt opens after the queue
  const openRef = useRef(false);

  useImperativeHandle(ref, () => ({
    open(asks, ctx = null) {
      if (!asks || !asks.length || openRef.current) return false;
      openRef.current = true;
      setContext(ctx);
      setQueue(asks);
      if (onOpenChange) onOpenChange(true);
      return true;
    },
    isOpen: () => openRef.current,
  }));
  useEffect(() => () => clearTimeout(timer.current), []);

  function close() {
    openRef.current = false;
    setQueue(null);
    setContext(null);
    if (onOpenChange) onOpenChange(false);
    const list = finished.current;
    finished.current = [];
    for (const v of list) requestVialPrompt(v); // UP-15: never over the queue, right after it
  }
  function showUndo(undo) {
    clearTimeout(timer.current);
    setToast({ undo });
    timer.current = setTimeout(() => setToast(null), UNDO_MS);
  }
  function save(ask, { choice, picked }) {
    let res = null;
    try { res = saveUnrecordedAnswer({ protocolId: ask.protocol.id, entries: ask.entries, choice, picked }); } catch { res = null; }
    if (!res) return false;
    if (res.plan.vialFinished) {
      const id = res.undo.insertedIds.length ? res.undo.insertedIds[res.undo.insertedIds.length - 1] : (res.plan.updates[0] && res.plan.updates[0].id);
      finished.current.push({ protocol: ask.protocol, logId: id });
    }
    showUndo(res.undo);
    requestSync();
    syncAllNotifications().catch(() => {});
    if (onAnswered) onAnswered();
    if (onChanged) onChanged();
    const last = queue && queue[queue.length - 1] === ask;
    if (last) close();
    return true;
  }
  function undo() {
    const u = toast && toast.undo;
    clearTimeout(timer.current);
    setToast(null);
    if (!u) return;
    try { undoUnrecordedAnswer(u); } catch { /* nothing changed */ }
    finished.current = finished.current.filter((v) => v.protocol.id !== u.protocolId);
    requestSync();
    syncAllNotifications().catch(() => {});
    if (onChanged) onChanged();
  }
  function later() {
    close();
    if (onLater) onLater();
  }

  const bar = toast ? { text: t('unrec_saved'), action: t('today_undo'), onPress: undo } : null;
  return (
    <>
      <UnrecordedSheet queue={queue} context={context} capacityOf={vialCapacity}
        vialFor={(p) => { try { return (getActiveVials(p.user_id) || []).find((v) => v.protocol_id === p.id) || null; } catch { return null; } }}
        onSave={save} onLater={later} toast={bar} />
      {!queue && bar ? (
        <View style={s.bar} accessibilityLiveRegion="polite">
          <Text style={s.barText} numberOfLines={2}>{bar.text}</Text>
          <TouchableOpacity onPress={undo} accessibilityRole="button" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.barAction}>{bar.action}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  );
});

export default UnrecordedHost;

const styles = (c) => StyleSheet.create({
  // Today's Undo bar look (screens/TodayScreen undoBar).
  bar: { position: 'absolute', left: 12, right: 12, bottom: 18, flexDirection: 'row', alignItems: 'center', gap: 18, backgroundColor: c.toast, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14 },
  barText: { flex: 1, fontSize: 17, color: c.toastText },
  barAction: { fontSize: 17, color: c.toastText, fontWeight: '700', textDecorationLine: 'underline' },
});
