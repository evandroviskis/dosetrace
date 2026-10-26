// A-139 — why the app asks "Sex at birth" (founder 2026-10-17; picture docs/design/a139-sex-at-birth.html,
// founder 2026-10-20: B, C, E + D′). One place for the two pieces every screen with the field uses:
//  • SexWhy (B / E): the "Why do we ask?" link (.link: 15/20 ink, tick underline, 12 pt chevron)
//    that opens the full text in a well box (.wbox) under it; a tap again closes it.
//  • SexChangeNote (C): the outlined "What this changes" note with the info glyph (.cnote), shown
//    by the screen only while an already-saved value is changed (lib/sexAtBirth).
// True claims only: energy formulas (when body fat is not entered), the minimum calories in the
// goals, the injection-site figure; the Dose accumulation curve does not use it (decision 2026-09-09).
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../lib/theme';
import { useLanguage } from '../i18n/LanguageContext';
import FeatureIcon from './FeatureIcon';

function SmallChevron({ up, color }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={up ? 'M3 7.5 6 4.5 9 7.5' : 'M3 4.5 6 7.5 9 4.5'} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SexWhy({ style }) {
  const { colors: c } = useTheme();
  const { t } = useLanguage();
  const s = useMemo(() => makeStyles(c), [c]);
  const [open, setOpen] = useState(false);
  return (
    <View style={style}>
      <TouchableOpacity
        style={s.link}
        onPress={() => setOpen(o => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 8 }}
      >
        <Text style={s.linkText}>{t('sex_why_link')}</Text>
        <SmallChevron up={open} color={c.ink2} />
      </TouchableOpacity>
      {open ? (
        <View style={s.box}>
          <Text style={s.head} accessibilityRole="header">{t('sex_why_title')}</Text>
          <Text style={[s.help, s.para]}>{t('sex_why_body')}</Text>
          <Text style={s.help}>{t('sex_why_body2')}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function SexChangeNote({ style }) {
  const { colors: c } = useTheme();
  const { t } = useLanguage();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={[s.note, style]} accessibilityLiveRegion="polite">
      <View style={s.noteIcon}><FeatureIcon name="info" size={18} color={c.ink2} /></View>
      <View style={s.noteText}>
        <Text style={[s.head, s.headNote]}>{t('sex_change_title')}</Text>
        <Text style={[s.help, s.helpInk, s.helpNote]}>{t('sex_change_body')}</Text>
      </View>
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 4, alignSelf: 'flex-start' },
  linkText: { fontSize: 15, lineHeight: 20, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
  box: { backgroundColor: c.well, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 10, marginTop: 4 },
  head: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: c.ink, marginBottom: 4, paddingHorizontal: 4 },
  help: { fontSize: 13, lineHeight: 18, color: c.ink2, paddingHorizontal: 4 },
  para: { marginBottom: 8 },
  helpInk: { color: c.ink },
  note: { flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingTop: 12, paddingBottom: 12, paddingRight: 12, paddingLeft: 10, marginTop: 10 },
  noteIcon: { marginTop: 1 },
  noteText: { flex: 1, minWidth: 0 },
  headNote: { paddingHorizontal: 0 },
  helpNote: { paddingHorizontal: 0 },
});
