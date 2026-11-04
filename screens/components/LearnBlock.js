/**
 * DoseTrace — "Understand the numbers" and "Sources & references" (prototype learnBlock,
 * Journey redesign part 3, founder 2026-10-02): one raised list with two folds, both
 * closed by default. Shown under the Journey dashboard tiles AND at the end of the
 * Progress screen — this one component, so the two never drift apart.
 *
 * App Review 1.4.1: health information cites its sources. Citation text stays in English
 * (the convention for references); the topic labels are localized.
 */
import { useEffect, useMemo, useState } from 'react';
import { markRanges, markedPieces } from '../../lib/appSearchText';
import { learnRequest, onLearnRequest } from '../../lib/appSearchStore';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import FoldChevron from '../../components/FoldChevron';

const REFERENCES = [
  { key: 'cal_src_bmr_mifflin', cite: 'Mifflin & St Jeor et al. — Am J Clin Nutr, 1990', url: 'https://doi.org/10.1093/ajcn/51.2.241' },
  { key: 'cal_src_bmr_lbm', cite: 'Cunningham — Am J Clin Nutr, 1991', url: 'https://pubmed.ncbi.nlm.nih.gov/1957828/' },
  { key: 'cal_src_protein', cite: 'Jäger et al. — ISSN Position Stand, 2017', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5477153/' },
  { key: 'cal_src_glycogen', cite: 'Muscle glycogen & body water — Nutrients, 2023', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9823884/' },
  { key: 'cal_src_energy', cite: 'Hall — Int J Obes, 2008', url: 'https://www.nature.com/articles/0803720' },
];

// "What this is" is the first entry of Understand the numbers (journey-dashboard #4).
const EXPLAINERS = [
  { key: 'intro', title: 'cal_intro_title', body: 'cal_intro_body' },
  { key: 'scale', title: 'cal_expl_scale_title', body: 'cal_expl_scale_body' },
  { key: 'deficit', title: 'cal_expl_deficit_title', body: 'cal_expl_deficit_body' },
  { key: 'measure', title: 'cal_expl_measure_title', body: 'cal_expl_measure_body' },
  { key: 'composition', title: 'cal_expl_comp_title', body: 'cal_expl_comp_body' },
];

// Opens in the browser (prototype's external-link glyph, monoline).
function ExternalIcon({ color }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// App search (AS-27): an "Entenda os números" hit (lib/appSearchStore requestLearn) opens the block
// and that explainer, with the typed words marked (lib/appSearchText markRanges; the text never
// changes). The marks clear when the item is closed or another one is opened.
export default function LearnBlock({ style }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [learnOpen, setLearnOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [expl, setExpl] = useState(null);
  const [marked, setMarked] = useState(null);
  const [mark, setMark] = useState(null);
  useEffect(() => {
    const apply = (req) => {
      if (!req || !EXPLAINERS.some((e) => e.key === req.key)) return;
      setLearnOpen(true);
      setExpl(req.key);
      setMark(req.mark);
      setMarked(req.mark ? req.key : null);
    };
    apply(learnRequest());
    return onLearnRequest(apply);
  }, []);
  const bodyText = (e) => {
    const text = t(e.body);
    if (marked !== e.key || !mark) return text;
    return markedPieces(text, markRanges(text, mark)).map((p, i) => (
      p.mark ? <Text key={i} style={s.mark}>{p.text}</Text> : p.text
    ));
  };
  return (
    <View style={[s.list, style]}>
      <TouchableOpacity style={s.head} onPress={() => setLearnOpen(o => !o)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ expanded: learnOpen }}>
        <Text style={[s.headText, s.grow]}>{t('cal_learn')}</Text>
        <FoldChevron open={learnOpen} color={colors.ink3} />
      </TouchableOpacity>
      {learnOpen && EXPLAINERS.map(e => (
        <View key={e.key} style={s.item}>
          <TouchableOpacity style={s.row} onPress={() => { setMarked(null); setExpl(expl === e.key ? null : e.key); }} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ expanded: expl === e.key }}>
            <Text style={[s.body, s.grow]}>{t(e.title)}</Text>
            <FoldChevron open={expl === e.key} color={colors.ink3} />
          </TouchableOpacity>
          {expl === e.key && <Text style={[s.sec2, s.itemBody]}>{bodyText(e)}</Text>}
        </View>
      ))}
      <View style={s.item}>
        <TouchableOpacity style={s.head} onPress={() => setSourcesOpen(o => !o)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ expanded: sourcesOpen }}>
          <Text style={[s.headText, s.grow]}>{t('cal_sources_title')}</Text>
          <FoldChevron open={sourcesOpen} color={colors.ink3} />
        </TouchableOpacity>
        {sourcesOpen && (
          <>
            <Text style={[s.foot2, s.intro]}>{t('cal_sources_intro')}</Text>
            {REFERENCES.map(r => (
              <TouchableOpacity key={r.key} style={s.src} activeOpacity={0.6} onPress={() => Linking.openURL(r.url).catch(() => {})} accessibilityRole="link">
                <View style={[s.grow, s.gap2]}>
                  <Text style={s.body}>{t(r.key)}</Text>
                  <Text style={s.foot2}>{r.cite}</Text>
                </View>
                <ExternalIcon color={colors.ink2} />
              </TouchableOpacity>
            ))}
          </>
        )}
      </View>
    </View>
  );
}

// prototype .list (raised, r22, padding 0 16), .fh (min-h 60, gap 12), .li rows.
const makeStyles = (c) => StyleSheet.create({
  list: { backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 16 },
  grow: { flex: 1, minWidth: 0 },
  gap2: { gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  headText: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  item: { borderTopWidth: 1, borderTopColor: c.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  body: { fontSize: 17, lineHeight: 22, color: c.ink },
  sec2: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  foot2: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  itemBody: { paddingBottom: 14 },
  intro: { paddingBottom: 10 },
  src: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line },
  mark: { backgroundColor: c.mark, color: c.ink }, // the search's typed words (AS-26, AS-27)
});
