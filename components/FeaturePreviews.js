// In-app "show, don't tell" previews for the Pro features. Each renders an
// EXAMPLE simulation of the feature in use (sample data only — never the user's
// real numbers, never a measurement or advice; SaMD / Apple 1.4.1 line). Opened
// from the paywall so a user hitting any wall can tap a feature and see what it
// does. The dose-accumulation curve reuses the onboarding AccumulationHero.
import { useMemo } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Circle, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../lib/theme';
import { useLanguage } from '../i18n/LanguageContext';
import AccumulationHero from './AccumulationHero';
import FeatureIcon from './FeatureIcon';

const CHART_W = 300;

// Build an SVG path from normalized points {x:0..1, y:0..1 (1 = top)}.
function linePath(pts, w, h, padT, padB, padX) {
  const pw = w - padX * 2, ph = h - padT - padB;
  return pts.map((p, i) => {
    const x = padX + pw * p.x, y = padT + ph * (1 - p.y);
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

/* ---- Lab marker trend (Testosterone rising over 4 tests) ---- */
function MarkerTrendPreview({ colors, t, width }) {
  const s = useMemo(() => makeStyles(colors), [colors]);
  const W = width, H = 130, padT = 12, padB = 16, padX = 6;
  const pts = [{ x: 0, y: 0.30 }, { x: 0.34, y: 0.44 }, { x: 0.68, y: 0.62 }, { x: 1, y: 0.82 }];
  const d = linePath(pts, W, H, padT, padB, padX);
  const pw = W - padX * 2, ph = H - padT - padB;
  const bandTop = padT + ph * (1 - 0.9), bandH = ph * 0.6; // reference range 300–1000 band
  const chips = [
    { n: 'HDL', v: '58', up: true }, { n: 'ALT', v: '29', up: false },
    { n: 'Estradiol', v: '34', up: true }, { n: 'Hematocrit', v: '49', up: true },
  ];
  return (
    <View style={s.sim}>
      <View style={s.mkTop}>
        <Text style={s.mkName}>Testosterone</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text style={s.mkVal}>742</Text>
          <Text style={[s.pill, { color: colors.accentSoftText, backgroundColor: colors.accentSoft }]}>▲ 41%</Text>
        </View>
      </View>
      <Text style={s.mkRange}>ng/dL · 4 tests · reference 300–1000</Text>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ marginTop: 8 }}>
        <Defs><LinearGradient id="mk" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accent} stopOpacity={0.20} /><Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
        </LinearGradient></Defs>
        <Rect x={padX} y={bandTop} width={pw} height={bandH} fill={colors.accentSoft} opacity={0.4} />
        <Path d={`${d} L ${padX + pw} ${H - padB} L ${padX} ${H - padB} Z`} fill="url(#mk)" />
        <Path d={d} fill="none" stroke={colors.accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <Circle key={i} cx={padX + pw * p.x} cy={padT + ph * (1 - p.y)} r={3.4} fill={colors.accent} />
        ))}
      </Svg>
      <View style={s.chips}>
        {chips.map((c) => (
          <View key={c.n} style={s.chip}>
            <Text style={s.chipText}>{c.n} <Text style={s.chipB}>{c.v}</Text> <Text style={{ color: colors.textMuted }}>{c.up ? '▲' : '▼'}</Text></Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ---- Reality check: measured maintenance vs estimate ---- */
function RealityCheckPreview({ colors, t, width }) {
  const s = useMemo(() => makeStyles(colors), [colors]);
  const W = width, H = 84, padT = 8, padB = 12, padX = 6;
  const pts = [{ x: 0, y: 0.75 }, { x: 0.25, y: 0.64 }, { x: 0.5, y: 0.55 }, { x: 0.75, y: 0.45 }, { x: 1, y: 0.38 }];
  const d = linePath(pts, W, H, padT, padB, padX);
  const pw = W - padX * 2, ph = H - padT - padB;
  return (
    <View style={s.sim}>
      <View style={{ alignItems: 'center', paddingVertical: 4 }}>
        <Text style={s.rcBig}>2,540</Text>
        <Text style={s.rcUnit}>{t('pw_prev_reality_unit')}</Text>
      </View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ marginVertical: 6 }}>
        <Path d={d} fill="none" stroke={colors.accent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (<Circle key={i} cx={padX + pw * p.x} cy={padT + ph * (1 - p.y)} r={3} fill={colors.accent} />))}
      </Svg>
      <View style={s.rcRow}><Text style={s.rcRowL}>{t('pw_prev_estimated')}</Text><Text style={s.rcRowV}>2,780</Text></View>
      <View style={s.rcRow}><Text style={s.rcRowL}>{t('pw_prev_measured')}</Text><Text style={s.rcRowV}>2,540</Text></View>
      <View style={s.rcRow}><Text style={s.rcRowL}>{t('pw_prev_difference')}</Text><Text style={[s.rcRowV, { color: colors.success }]}>−240 / {t('pw_prev_day')}</Text></View>
    </View>
  );
}

/* ---- Bloodwork scan: PDF -> markers extracted ---- */
function ScanPreview({ colors, t, width }) {
  const s = useMemo(() => makeStyles(colors), [colors]);
  const chips = [['Testosterone', '742'], ['HDL', '58'], ['TSH', '1.8']];
  return (
    <View style={s.sim}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={s.pdfBox}><Text style={s.pdfText}>PDF{'\n'}lab.pdf</Text></View>
        <Text style={{ color: colors.accent, fontSize: 22 }}>→</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.scanCount}>{t('pw_prev_scan_count')}</Text>
          <View style={s.chips}>
            {chips.map(([n, v]) => (
              <View key={n} style={s.chip}><Text style={s.chipText}><Text style={s.chipB}>{n}</Text> {v}</Text></View>
            ))}
            <View style={s.chip}><Text style={s.chipText}>+11</Text></View>
          </View>
        </View>
      </View>
    </View>
  );
}

/* ---- Vaccine journal: populated rows ---- */
function VaccinePreview({ colors, t, width }) {
  const s = useMemo(() => makeStyles(colors), [colors]);
  const rows = [
    { n: 'Influenza', sub: '2026-03-12', badge: t('pw_prev_vax_due'), due: true },
    { n: 'Tetanus (Tdap)', sub: '2024-08-04', badge: t('pw_prev_vax_ok'), due: false },
    { n: 'Hepatitis B', sub: t('pw_prev_vax_dose'), badge: t('pw_prev_vax_due'), due: true },
  ];
  return (
    <View style={[s.sim, { paddingVertical: 4 }]}>
      {rows.map((r, i) => (
        <View key={r.n} style={[s.vrow, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
          <View style={s.vic}><FeatureIcon name="syringe" size={16} color={colors.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.vname}>{r.n}</Text>
            <Text style={s.vsub}>{r.sub}</Text>
          </View>
          <Text style={[s.vbadge, { color: r.due ? colors.warningSoftText : colors.successSoftText, backgroundColor: r.due ? colors.warningSoft : colors.successSoft }]}>{r.badge}</Text>
        </View>
      ))}
    </View>
  );
}

// Registry: feature key -> icon, title/body i18n keys, and the preview renderer.
export const PREVIEW_FEATURES = [
  { key: 'serum', icon: 'curve', titleKey: 'serum_preview_title', bodyKey: 'serum_preview_body', render: (c, t, w) => <AccumulationHero width={w} height={150} /> },
  { key: 'labs', icon: 'droplet', titleKey: 'pw_prev_labs_title', bodyKey: 'pw_prev_labs_body', render: (c, t, w) => <MarkerTrendPreview colors={c} t={t} width={w} /> },
  { key: 'reality', icon: 'flame', titleKey: 'pw_prev_reality_title', bodyKey: 'pw_prev_reality_body', render: (c, t, w) => <RealityCheckPreview colors={c} t={t} width={w} /> },
  { key: 'scan', icon: 'scan', titleKey: 'pw_prev_scan_title', bodyKey: 'pw_prev_scan_body', render: (c, t, w) => <ScanPreview colors={c} t={t} width={w} /> },
  { key: 'vaccine', icon: 'syringe', titleKey: 'pw_prev_vax_title', bodyKey: 'pw_prev_vax_body', render: (c, t, w) => <VaccinePreview colors={c} t={t} width={w} /> },
];

export function FeaturePreviewSheet({ featureKey, onClose }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { width: winW } = useWindowDimensions();
  const w = Math.min(340, winW - 72);
  const feature = PREVIEW_FEATURES.find((f) => f.key === featureKey);
  return (
    <Modal visible={!!feature} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.modal}>
        <View style={s.modalNav}>
          <View style={{ width: 60 }} />
          <Text style={s.modalTitle}>{feature ? t(feature.titleKey) : ''}</Text>
          <TouchableOpacity onPress={onClose} style={{ width: 60, alignItems: 'flex-end' }}>
            <Text style={s.modalClose}>✕</Text>
          </TouchableOpacity>
        </View>
        {feature && (
          <ScrollView style={s.modalBody} contentContainerStyle={{ alignItems: 'center', paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <Text style={s.exampleTag}>{t('paywall_hero_example')}</Text>
            {feature.render(colors, t, w)}
            <Text style={s.previewBody}>{t(feature.bodyKey)}</Text>
            <Text style={s.previewNote}>{t('pw_prev_disclaimer')}</Text>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function withA(hex, a) {
  // hex (#rrggbb) -> rgba string; falls back to the hex if not parseable.
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const makeStyles = (c) => StyleSheet.create({
  modal: { flex: 1, backgroundColor: c.card },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: c.border },
  modalTitle: { fontSize: 15, fontWeight: '700', color: c.text },
  modalClose: { fontSize: 16, color: c.accent, fontWeight: '700' },
  modalBody: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 20 },
  exampleTag: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: c.textFaint, marginBottom: 12 },
  previewBody: { fontSize: 14.5, color: c.textMuted, textAlign: 'center', lineHeight: 22, marginTop: 18, paddingHorizontal: 6 },
  previewNote: { fontSize: 12, color: c.textFaint, textAlign: 'center', lineHeight: 17, marginTop: 18 },

  sim: { alignSelf: 'stretch', backgroundColor: c.card2, borderWidth: 0.5, borderColor: c.border, borderRadius: 14, padding: 14 },
  mkTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  mkName: { fontSize: 14, fontWeight: '700', color: c.text },
  mkVal: { fontSize: 18, fontWeight: '800', color: c.text },
  pill: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  mkRange: { fontSize: 11, color: c.textFaint, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  chip: { borderWidth: 0.5, borderColor: c.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: c.card },
  chipText: { fontSize: 12, fontWeight: '600', color: c.textMuted },
  chipB: { color: c.text, fontWeight: '700' },

  rcBig: { fontSize: 30, fontWeight: '800', color: c.accent, letterSpacing: -0.5 },
  rcUnit: { fontSize: 13, color: c.textMuted, marginTop: 2, textAlign: 'center' },
  rcRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: c.border },
  rcRowL: { fontSize: 13, color: c.textMuted },
  rcRowV: { fontSize: 13, fontWeight: '700', color: c.text },

  pdfBox: { width: 52, height: 66, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  pdfText: { fontSize: 10, color: c.textFaint, textAlign: 'center' },
  scanCount: { fontSize: 12, color: c.textFaint, marginBottom: 5 },

  vrow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: c.border },
  vic: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  vname: { fontSize: 14, fontWeight: '700', color: c.text },
  vsub: { fontSize: 12, color: c.textFaint, marginTop: 1 },
  vbadge: { fontSize: 10.5, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
});
