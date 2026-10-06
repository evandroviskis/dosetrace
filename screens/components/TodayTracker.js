// Today v2.1 tracker (founder approved 2026-09-29; docs/design/today-build-handoff.md §1.2–1.3,
// prototype.html "tracker"). One slab: the big Today gauge (% + "{n} of {m}"), two small
// gauges (7 days, 30 days), the week as circles (done / partial / missed / rest), the
// streak with "On fire!", and "View history" + the drawn arrow to the Dose log.
// The slab is the opposite surface (light theme: dark slab; dark theme: light slab) with its
// OWN measured interior palette (prototype .inv; theme.js slabInv, Today redesign part 3).
// Ring math: lib/adherenceRings.js (doses, not days; never above 100%).
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useTheme } from '../../lib/theme';
import { ringPct } from '../../lib/adherenceRings';
import FeatureIcon from '../../components/FeatureIcon';
import RowChevron from '../../components/RowChevron';

const WEEKDAY_KEYS = ['today_sun', 'today_mon', 'today_tue', 'today_wed', 'today_thu', 'today_fri', 'today_sat'];

// The prototype gauge() (Today redesign part 3, founder 2026-10-02), drawn in its own
// 100 x 100 viewBox: a quiet track with the done share as a data arc; the big gauge adds a
// fine graduation outside (a tick every 5%, longer every 25%). Butt cap at 100%.
function Gauge({ size, pct, inv, big }) {
  const r = big ? 38 : 40, sw = big ? 9 : 10;
  const frac = pct == null ? 0 : Math.max(0, Math.min(1, pct / 100));
  const L = 2 * Math.PI * r;
  const ticks = [];
  if (big) {
    for (let k = 0; k < 20; k++) {
      const a = ((-90 + k * 18) * Math.PI) / 180;
      const maj = k % 5 === 0, r0 = maj ? 45 : 46.5;
      ticks.push(<Line key={k} x1={50 + r0 * Math.cos(a)} y1={50 + r0 * Math.sin(a)} x2={50 + 49.5 * Math.cos(a)} y2={50 + 49.5 * Math.sin(a)} stroke={inv.tick} strokeWidth={maj ? 1.6 : 1} strokeLinecap="round" />);
    }
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {ticks}
      <Circle cx={50} cy={50} r={r} stroke={inv.line} strokeWidth={sw} fill="none" />
      {frac > 0 && (
        <Circle
          cx={50} cy={50} r={r} stroke={inv.data} strokeWidth={sw} fill="none" strokeLinecap={pct >= 100 ? 'butt' : 'round'}
          strokeDasharray={`${L * frac} ${L}`} transform="rotate(-90 50 50)"
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
  const { colors } = useTheme();
  const inv = colors.slabInv; // the slab's own measured palette (prototype .inv)
  const slab = colors.slab;
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
                <Text style={s.bigCap} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{ofText(rings.today)}</Text>
                <Text style={s.bigCapDay} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t('today_section_today').toLowerCase()}</Text>
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
        <Text style={s.streakText} numberOfLines={2}>
          {streak > 0 ? `${streak} ${streak === 1 ? t('today_streak_day') : t('today_streak_days')}` : t('today_streak_none')}
        </Text>
        {streak >= 7 && <Text style={s.fire}>{t('today_streak_fire')}</Text>}
        <View style={s.history}>
          <Text style={s.historyText}>{t('today_view_log')}</Text>
          <RowChevron color={inv.tick} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c, slab) => StyleSheet.create({
  slab: { backgroundColor: slab, borderRadius: 28, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, gap: 18, marginHorizontal: 16, marginBottom: 26 },
  gauges: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  big: { width: 132, height: 132 },
  bigIn: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 1, paddingHorizontal: 22 },
  bigNum: { fontSize: 32, fontWeight: '500', color: c.ink, letterSpacing: -1.28, fontVariant: ['tabular-nums'] },
  bigNumSign: { fontSize: 16, color: c.ink2 },
  bigNothing: { fontSize: 15, fontWeight: '600', color: c.ink, textAlign: 'center' },
  bigCap: { fontSize: 12, fontWeight: '600', color: c.ink2, lineHeight: 14.4, fontVariant: ['tabular-nums'], maxWidth: 58 },
  // A-79: the count and 'today' on two lines inside the 88 pt ring opening (prototype .gcap 12/600).
  // The lower line sits ~33 pt below the centre, where the opening is only ~58 pt wide: the captions
  // are capped there and shrink to fit ("aujourd'hui" ran into the arc, store prints 2026-10-06).
  bigCapDay: { fontSize: 12, fontWeight: '600', color: c.ink2, lineHeight: 14.4, maxWidth: 58 },
  side: { flex: 1, gap: 14, minWidth: 0 },
  sideRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sideText: { flex: 1, minWidth: 0, gap: 2 },
  sideLabel: { fontSize: 15, fontWeight: '600', color: c.ink },
  sideSub: { fontSize: 13, color: c.ink2, fontVariant: ['tabular-nums'] },
  sidePct: { fontSize: 26, fontWeight: '500', color: c.ink, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  sidePctSign: { fontSize: 14, color: c.ink2 },
  week: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  wd: { alignItems: 'center', gap: 6, flex: 1 },
  wdLabel: { fontSize: 12, fontWeight: '500', color: c.ink3 },
  wdLabelToday: { color: c.ink, fontWeight: '700' },
  streak: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.line },
  // Grows to fill the row but never below 110 pt: a long history link wraps to its own line.
  streakText: { flexGrow: 1, flexShrink: 1, minWidth: 110, fontSize: 17, fontWeight: '600', color: c.ink },
  fire: { borderWidth: 1, borderColor: c.attention, color: c.attention, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 2, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  history: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  historyText: { fontSize: 15, color: c.ink2 },
});
