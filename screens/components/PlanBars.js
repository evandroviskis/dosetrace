/**
 * DoseTrace — the day's bars against the plan (docs/specs/food-plan-actual.md PA-2/PA-3; picture
 * docs/design/food-goals-progress.html parts 1-3). One component for the three places: Progress › Your
 * daily plan ("Today · logged so far"), the food chat after a log ("Today · your plan") and the food card
 * on Today / Journey (short). The rows come from lib/planActual todayBars, the text from barParts.
 *
 * Numbers side by side only: the bar fills up to the plan; over the plan it is grey (ink3) and the
 * difference reads "20 g above" in grey — never red, never a warning, never advice.
 */
import { View, Text, StyleSheet } from 'react-native';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { formatInt } from '../../lib/localeFormat';
import { isOne } from '../../lib/plural';
import { barParts } from '../../lib/planActual';

const LABEL = { kcal: 'pa_kcal', protein: 'pa_protein', carbs: 'pa_carbs' };

export default function PlanBars({ rows, short = false }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const opts = { t, fmt: (n) => formatInt(n, language), isOne: (n) => isOne(n, language), short };
  return (
    <View style={s.wrap}>
      {(rows || []).map((r) => {
        const p = barParts(r, opts);
        return (
          <View key={r.key} style={s.row} accessible accessibilityLabel={`${t(LABEL[r.key])}: ${p.of}${p.diff ? ', ' + p.diff : ''}`}>
            <Text style={s.label} numberOfLines={1}>{t(LABEL[r.key])}</Text>
            <View style={s.col}>
              {r.plan != null ? (
                <View style={s.track}>
                  <View style={[s.fill, r.over && s.fillOver, { width: `${Math.round(r.fill * 1000) / 10}%` }]} />
                </View>
              ) : null}
              <Text style={s.value}>
                {p.of}
                {p.diff ? <Text style={p.above ? s.over : s.diff}>{` · ${p.diff}`}</Text> : null}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  label: { width: '30%', maxWidth: 120, fontSize: 13, lineHeight: 18, color: c.ink2, paddingTop: 0 },
  col: { flex: 1, minWidth: 0, gap: 3, paddingTop: 5 },
  track: { height: 8, borderRadius: 4, backgroundColor: c.well, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: c.data },
  fillOver: { backgroundColor: c.ink3 },
  value: { fontSize: 13, lineHeight: 18, color: c.ink, textAlign: 'right', fontVariant: ['tabular-nums'] },
  diff: { color: c.ink2 },
  over: { color: c.ink3 },
});
