// Book layout (S-26 BK-3, docs/specs/book-layout.md): the dose the user tapped on Today, shown
// on the right page of an unfolded foldable. Name, due time, dose, and for an injectable the
// SAME SyringeScale as the Today card (the protocol's syringe size, the draw-to fill), then
// Skip and Mark taken.
//
// This page never writes anything itself. Mark taken and Skip call the handlers Today's own
// dose card uses (passed in as props), so the S-25 order holds: an injectable is asked where
// it was injected BEFORE any write, and Cancel writes nothing. Everything shown here is
// computed by Today with the same calls as its card (computeDraw, the time label, the counts).
import { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../lib/theme';
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
  time,
  due,
  doseLine,
  draw,
  syringeSize,
  state, // 'open' | 'skipped' | 'taken'
  partial, // { taken, needed } for a multi-dose protocol, else null
  takeLabel,
  takenLabel,
  askFirst,
  resetKey,
  onTake,
  onSkip,
  onOpenProtocol,
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [scaleW, setScaleW] = useState(290);
  const showDraw = !!(draw && draw.drawUnits && !draw.unitMismatch);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.page}>
      <View style={s.head}>
        <View style={s.when}>
          {time ? <Text style={s.time}>{time}</Text> : null}
          {due && state === 'open' && (
            <View style={s.dueTag}>
              <View style={s.dueDot} />
              <Text style={s.dueText}>{t('today_due')}</Text>
            </View>
          )}
        </View>
        <View style={s.titleRow}>
          <View style={[s.dot, { backgroundColor: color || colors.data }]} />
          <Text style={s.title}>{name}</Text>
        </View>
        <Text style={s.amt}>{doseLine}</Text>
      </View>

      <View style={s.card}>
        {partial && partial.taken > 0 && partial.needed > 1 && (
          <Text style={s.sub}>{partial.taken}/{partial.needed} {t('today_taken_partial')}</Text>
        )}
        {state === 'skipped' && <Text style={s.sub}>{t('today_skipped_today')}</Text>}

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

        {state === 'taken' ? (
          <View style={s.takenRow} accessible accessibilityLabel={takenLabel}>
            <CheckMark size={17} color={colors.ok} />
            <Text style={s.takenText}>{takenLabel}</Text>
          </View>
        ) : (
          <View style={s.acts}>
            {state === 'open' && (
              <TouchableOpacity style={s.btnSkip} onPress={onSkip} accessibilityRole="button">
                <Text style={s.btnSkipText}>{t('today_skip')}</Text>
              </TouchableOpacity>
            )}
            <TakeAction
              key={`take-${resetKey}`}
              label={takeLabel}
              takenLabel={takenLabel}
              askFirst={askFirst}
              onTake={onTake}
              s={s}
              colors={colors}
            />
          </View>
        )}
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
  takenRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  takenText: { fontSize: 17, fontWeight: '600', color: c.ok },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4, marginTop: 8 },
  linkText: { fontSize: 15, color: c.ink, textDecorationLine: 'underline' },
});
