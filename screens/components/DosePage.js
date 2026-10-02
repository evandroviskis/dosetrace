// Book layout (S-26 BK-3 / BK-16, docs/specs/book-layout.md): ONE dose slot the user tapped on
// Today, shown on the right page of an unfolded foldable. Name, time, dose, and for an
// injectable the SAME SyringeScale as the Today card (the protocol's syringe size, the draw-to
// fill). What the page offers comes from lib/dosePageState.js (planDosePage), computed by Today:
//  - due / pending: Skip and Mark taken (only when the planner allows: canSkip / canTake);
//  - upcoming: the dose's info only;
//  - taken / skipped: the state and Undo (when Today can undo that row), else a Dose log link —
//    never a second Mark taken;
//  - missed: the state and a Dose log link.
//
// This page never writes anything itself. Mark taken, Skip and Undo call the handlers Today
// passes in (its own handleTake / skipDose, takePending / skipPending, applyUndo), so the
// S-25 order holds: an injectable is asked where it was injected BEFORE any write, and Cancel
// writes nothing.
import { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../lib/theme';
import { displayColor } from '../../lib/protocolColors';
import SyringeScale from './SyringeScale';
import CheckMark from '../../components/CheckMark';
import { lightHaptic } from '../../components/motion';

// Mark taken: an injectable only opens the site question (the button stays "Mark taken"
// until the answer writes the dose). An oral dose shows "Taken" at once, like the Today card;
// a failed write re-mounts this button (Today bumps resetKey), so it is never stuck.
function TakeAction({ label, takenLabel, askFirst, onTake, s, colors }) {
  const [ok, setOk] = useState(false);
  const onPress = () => {
    if (ok) return;
    lightHaptic();
    if (!askFirst) setOk(true);
    onTake(null);
  };
  return (
    <TouchableOpacity
      style={[s.btnAct, ok && s.btnOk]}
      onPress={onPress}
      disabled={ok}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: ok }}
    >
      <View style={s.btnRow}>
        {ok && <CheckMark size={15} color={colors.successSoftText} />}
        <Text style={[s.btnActText, ok && s.btnOkText]}>{ok ? takenLabel : label}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function DosePage({
  t,
  name,
  color,
  time, // the slot's time, with its day when it is not today ("Yesterday 20:00")
  due,
  doseLine,
  draw,
  syringeSize,
  kind, // lib/dosePageState.js: 'due' | 'pending' | 'upcoming' | 'taken' | 'skipped' | 'missed'
  canTake,
  canSkip,
  canUndo,
  sub, // a line under the title card (Pending from yesterday, 1/2 taken)
  stateLabel, // Taken / Skipped / Missed
  takeLabel,
  takenLabel,
  skipLabel,
  askFirst,
  resetKey,
  onTake,
  onSkip,
  onUndo,
  onOpenLog,
  onOpenProtocol,
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [scaleW, setScaleW] = useState(290);
  const showDraw = !!(draw && draw.drawUnits && !draw.unitMismatch);
  const logged = kind === 'taken' || kind === 'skipped' || kind === 'missed';
  const stateColor = kind === 'taken' ? colors.ok : kind === 'skipped' ? colors.risk : colors.attention;
  // BK-21: the title is the first thing a screen reader reads on this page (time and Due
  // are read with it, not before it).
  const titleA11y = [name, time, due ? t('today_due') : null].filter(Boolean).join(', ');

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.page}>
      <View style={s.head}>
        <View style={s.when} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {time ? <Text style={s.time}>{time}</Text> : null}
          {due && (
            <View style={s.dueTag}>
              <View style={s.dueDot} />
              <Text style={s.dueText}>{t('today_due')}</Text>
            </View>
          )}
        </View>
        <View style={s.titleRow}>
          <View style={[s.dot, { backgroundColor: displayColor(color) || colors.data }]} />
          <Text style={s.title} accessible accessibilityRole="header" accessibilityLabel={titleA11y}>{name}</Text>
        </View>
        <Text style={s.amt}>{doseLine}</Text>
      </View>

      <View style={s.card}>
        {sub ? <Text style={s.sub}>{sub}</Text> : null}

        {showDraw && (
          <View style={s.draw} onLayout={(e) => setScaleW(Math.max(160, Math.floor(e.nativeEvent.layout.width) - 28))}>
            <View style={s.drawHead}>
              <Text style={s.drawLabel}>{t('protocols_syringe_draw_to')}</Text>
              <Text style={s.drawVal}>{draw.drawUnits}<Text style={s.drawUnit}> u · {draw.drawML} ml</Text></Text>
            </View>
            {draw.exceedsSyringe ? (
              <Text style={s.drawWarn}>{t('protocols_draw_exceeds_warning').replace('{units}', draw.drawUnits).replace('{size}', String(syringeSize))}</Text>
            ) : (
              <SyringeScale units={Number(draw.drawUnits)} size={syringeSize} width={scaleW} />
            )}
          </View>
        )}

        {logged ? (
          <View style={s.loggedRow}>
            <View style={s.stateRow} accessible accessibilityLabel={stateLabel}>
              {kind === 'taken'
                ? <CheckMark size={17} color={colors.ok} />
                : <View style={[s.stateDot, { backgroundColor: stateColor }]} />}
              <Text style={[s.stateText, { color: stateColor }]}>{stateLabel}</Text>
            </View>
            {canUndo && onUndo ? (
              <TouchableOpacity style={s.btnSkip} onPress={onUndo} accessibilityRole="button">
                <Text style={s.btnSkipText}>{t('today_undo')}</Text>
              </TouchableOpacity>
            ) : onOpenLog ? (
              <TouchableOpacity style={s.btnSkip} onPress={onOpenLog} accessibilityRole="button">
                <Text style={s.btnSkipText}>{t('log_title')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (canTake || canSkip) ? (
          <View style={s.acts}>
            {canSkip && (
              <TouchableOpacity style={s.btnSkip} onPress={onSkip} accessibilityRole="button">
                <Text style={s.btnSkipText}>{skipLabel}</Text>
              </TouchableOpacity>
            )}
            {canTake && (
              <TakeAction
                key={`take-${resetKey}`}
                label={takeLabel}
                takenLabel={takenLabel}
                askFirst={askFirst}
                onTake={onTake}
                s={s}
                colors={colors}
              />
            )}
          </View>
        ) : null}
      </View>

      {onOpenProtocol && (
        <TouchableOpacity style={s.link} onPress={onOpenProtocol} accessibilityRole="button">
          <Text style={s.linkText}>{t('tab_protocols')} ›</Text>
        </TouchableOpacity>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// Graduated (DESIGN.md §3–§5): large title 34/600, one raised card (no border, no shadow,
// no tint), the syringe in a well inside it, capsule buttons, the one action in ink.
const makeStyles = (c) => StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 8 },
  head: { paddingHorizontal: 4, paddingTop: 8, paddingBottom: 18, gap: 4 },
  when: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 24 },
  time: { fontSize: 17, fontWeight: '600', color: c.ink, fontVariant: ['tabular-nums'] },
  dueTag: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: c.attention },
  dueDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.attention },
  dueText: { fontSize: 12, fontWeight: '700', color: c.attention },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { flex: 1, fontSize: 34, fontWeight: '600', color: c.ink, letterSpacing: -0.7 },
  amt: { fontSize: 17, fontWeight: '500', color: c.ink, fontVariant: ['tabular-nums'] },
  card: { backgroundColor: c.raised, borderRadius: 24, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, gap: 14 },
  sub: { fontSize: 15, color: c.ink2 },
  draw: { backgroundColor: c.well, borderRadius: 16, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, gap: 6 },
  drawHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  drawLabel: { fontSize: 15, fontWeight: '600', color: c.ink2 },
  drawVal: { fontSize: 22, fontWeight: '500', color: c.ink, fontVariant: ['tabular-nums'] },
  drawUnit: { fontSize: 13, fontWeight: '400', color: c.ink3 },
  drawWarn: { fontSize: 15, fontWeight: '600', color: c.risk },
  acts: { flexDirection: 'row', gap: 10 },
  btnSkip: { flex: 1, minHeight: 52, borderRadius: 26, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnSkipText: { fontSize: 17, fontWeight: '700', color: c.ink },
  btnAct: { flex: 2, minHeight: 52, borderRadius: 26, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnActText: { fontSize: 17, fontWeight: '700', color: c.onAct },
  btnOk: { backgroundColor: c.well },
  btnOkText: { color: c.successSoftText },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  loggedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stateRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  stateDot: { width: 8, height: 8, borderRadius: 4 },
  stateText: { fontSize: 17, fontWeight: '600' },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4, marginTop: 8 },
  linkText: { fontSize: 15, color: c.ink, textDecorationLine: 'underline' },
});
