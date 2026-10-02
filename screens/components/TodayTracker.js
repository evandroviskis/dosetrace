// Today v2.1 tracker (founder approved 2026-09-29; docs/design/today-build-handoff.md §1.2–1.3,
// prototype.html "tracker"). One slab: the big Today gauge (% + "{n} of {m}"), two small
// gauges (7 days, 30 days), the week as circles (done / partial / missed / rest), the
// streak with "On fire!", and "View history ›" to the Dose log.
// The slab uses the OPPOSITE palette inside (light theme: #383C41 with the dark tokens;
// dark theme: #EEEFEB with the light tokens) — measured, DESIGN.md. Ring math:
// lib/adherenceRings.js (doses, not days; never above 100%).
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { LIGHT, DARK, useTheme } from '../../lib/theme';
import { ringPct } from '../../lib/adherenceRings';
import FeatureIcon from '../../components/FeatureIcon';

const WEEKDAY_KEYS = ['today_sun', 'today_mon', 'today_tue', 'today_wed', 'today_thu', 'today_fri', 'today_sat'];

function Gauge({ size, pct, inv, big }) {
  const stroke = big ? 12 : 6;
  const r = big ? size / 2 - 22 : size / 2 - stroke / 2 - 1;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const frac = pct == null ? 0 : Math.max(0, Math.min(1, pct / 100));
  const ticks = [];
  if (big) {
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * 2 * Math.PI - Math.PI / 2;
      const long = i % 4 === 0;
      const r1 = c - 6, r2 = c - (long ? 13 : 10);
      ticks.push(<Line key={i} x1={c + r1 * Math.cos(a)} y1={c + r1 * Math.sin(a)} x2={c + r2 * Math.cos(a)} y2={c + r2 * Math.sin(a)} stroke={inv.tick} strokeWidth={long ? 1.6 : 1} />);
    }
  }
  return (
    <Svg width={size} height={size}>
      {ticks}
      <Circle cx={c} cy={c} r={r} stroke={inv.line} strokeWidth={stroke} fill="none" />
      {frac > 0 && (
        <Circle
          cx={c} cy={c} r={r} stroke={inv.data} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${circ * frac} ${circ}`} transform={`rotate(-90 ${c} ${c})`}
        />
      )}
    </Svg>
  );
}

function DayMark({ status, inv }) {
  if (status === 'complete') {
    return (
      <Svg width={22} height={22} viewBox="0 0 22 22">
        <Circle cx={11} cy={11} r={10} fill={inv.data} />
        <Path d="M6.5 11.3l3 3 6-6.3" fill="none" stroke={inv.onData} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  if (status === 'partial') {
    return (
      <Svg width={22} height={22} viewBox="0 0 22 22">
        <Circle cx={11} cy={11} r={9.25} fill="none" stroke={inv.data} strokeWidth={1.5} />
        <Path d="M11 1.75a9.25 9.25 0 0 1 0 18.5z" fill={inv.data} />
      </Svg>
    );
  }
  if (status === 'missed') {
    return (
      <Svg width={22} height={22} viewBox="0 0 22 22">
        <Circle cx={11} cy={11} r={9.25} fill="none" stroke={inv.tick} strokeWidth={1.5} />
      </Svg>
    );
  }
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22">
      <Circle cx={11} cy={11} r={2.5} fill={inv.tick} />
    </Svg>
  );
}

// rings: { today: {taken, due} | null, week, month } · weekDots: [{ dayIndex, isToday, status }]
export default function TodayTracker({ rings, weekDots = [], streak = 0, onHistory, t, ringRef }) {
  const { isDark } = useTheme();
  const inv = isDark ? LIGHT : DARK; // the opposite palette inside the slab
  const slab = isDark ? DARK.slab : LIGHT.slab; // light theme: #383C41 slab; dark theme: #EEEFEB
  const s = makeStyles(inv, slab);
  const ofText = (r) => t('vials_count_of').replace('{x}', String(r.taken)).replace('{y}', String(r.due));
  const todayPct = ringPct(rings && rings.today);
  const side = (label, r) => {
    const p = ringPct(r);
    return (
      <View style={s.sideRow}>
        <Gauge size={44} pct={p} inv={inv} />
        <View style={s.sideText}>
          <Text style={s.sideLabel}>{label}</Text>
          <Text style={s.sideSub}>{r && r.due ? ofText(r) : '—'}</Text>
        </View>
        <Text style={s.sidePct}>{p == null ? '—' : p}<Text style={s.sidePctSign}>{p == null ? '' : '%'}</Text></Text>
      </View>
    );
  };
  return (
    <View style={s.slab}>
      <View style={s.gauges}>
        <View style={s.big} ref={ringRef} collapsable={false}>
          <Gauge size={132} pct={todayPct} inv={inv} big />
          <View style={s.bigIn} pointerEvents="none">
            {todayPct == null ? (
              <>
                <Text style={s.bigNothing}>{t('today_nothing_due')}</Text>
                <Text style={s.bigCap}>{t('today_section_today').toLowerCase()}</Text>
              </>
            ) : (
              <>
                <Text style={s.bigNum}>{todayPct}<Text style={s.bigNumSign}>%</Text></Text>
                <Text style={s.bigCap} numberOfLines={1}>{ofText(rings.today)}</Text>
                <Text style={s.bigCapDay} numberOfLines={1}>{t('today_section_today').toLowerCase()}</Text>
              </>
            )}
          </View>
        </View>
        <View style={s.side}>
          {side(t('today_ring_7d'), rings && rings.week)}
          {side(t('today_ring_30d'), rings && rings.month)}
        </View>
      </View>
      {weekDots.length > 0 && (
        <View style={s.week}>
          {weekDots.map((d, i) => (
            <View key={i} style={s.wd}>
              <DayMark status={d.status} inv={inv} />
              <Text style={[s.wdLabel, d.isToday && s.wdLabelToday]}>{t(WEEKDAY_KEYS[d.dayIndex])}</Text>
            </View>
          ))}
        </View>
      )}
      <TouchableOpacity style={s.streak} onPress={onHistory} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('today_view_log')}>
        <FeatureIcon name="flame" size={20} color={inv.attention} />
        <Text style={s.streakText} numberOfLines={1}>
          {streak > 0 ? `${streak} ${streak === 1 ? t('today_streak_day') : t('today_streak_days')}` : t('today_streak_none')}
        </Text>
        {streak >= 7 && <Text style={s.fire}>{t('today_streak_fire')}</Text>}
        <Text style={s.history}>{t('today_view_log')} ›</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c, slab) => StyleSheet.create({
  slab: { backgroundColor: slab, borderRadius: 28, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, gap: 18, marginHorizontal: 16, marginBottom: 26 },
  gauges: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  big: { width: 132, height: 132 },
  bigIn: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 2 },
  bigNum: { fontSize: 38, fontWeight: '500', color: c.ink, letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  bigNumSign: { fontSize: 19, color: c.ink2 },
  bigNothing: { fontSize: 15, fontWeight: '600', color: c.ink, textAlign: 'center' },
  bigCap: { fontSize: 12, fontWeight: '600', color: c.ink2 },
  // A-79: the count and 'today' on two lines, so the caption fits the 76 pt ring opening.
  bigCapDay: { fontSize: 12, fontWeight: '500', color: c.ink2, marginTop: -1 },
  side: { flex: 1, gap: 14, minWidth: 0 },
  sideRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sideText: { flex: 1, minWidth: 0, gap: 2 },
  sideLabel: { fontSize: 15, fontWeight: '600', color: c.ink },
  sideSub: { fontSize: 13, color: c.ink2, fontVariant: ['tabular-nums'] },
  sidePct: { fontSize: 26, fontWeight: '500', color: c.ink, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  sidePctSign: { fontSize: 14, color: c.ink2 },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  wd: { alignItems: 'center', gap: 6, flex: 1 },
  wdLabel: { fontSize: 12, fontWeight: '500', color: c.ink3 },
  wdLabelToday: { color: c.ink, fontWeight: '700' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, minHeight: 44 },
  streakText: { flex: 1, fontSize: 17, fontWeight: '600', color: c.ink },
  fire: { borderWidth: 1, borderColor: c.attention, color: c.attention, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 2, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  history: { fontSize: 15, color: c.ink2 },
});
