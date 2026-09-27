/**
 * BodyMapModal
 *
 * Bottom-sheet modal launched from the dose-log undo toast (and from
 * tapping a saved log row). Lets the user mark one or more body sites
 * for an injection. Multi-spot supported. Includes a rotation hint
 * (longest-unused site in the current view+type) and a 6-language
 * disclaimer footer.
 *
 * Drawn with React Native primitives only — no react-native-svg
 * dependency, no native rebuild required.
 *
 * Props:
 *   visible:        boolean
 *   onClose:        () => void
 *   onSave:         ({ stored, siteIds, type }) => void
 *   initialStored:  string (existing dose_logs.injection_site value)
 *   protocolName:   string (e.g. "BPC-157") — shown in subtitle
 *   recentLogs:     dose_log rows (used for rotation suggestion)
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { CONTENT_MAX_WIDTH } from '../../lib/responsive';
import {
  SITES,
  suggestNextSite,
  parseStored,
  serializeForStorage,
} from '../../lib/injectionSites';
import { CrossMark } from '../../components/CheckMark';
import { Segmented } from '../../components/ui';

// Body figure: 100×220 viewBox scaled by 1.8 → 180×396 px
const SCALE = 1.8;
const W = 180;
const H = 396;
const DOT = 24;

export default function BodyMapModal({
  visible,
  onClose,
  onSave,
  initialStored = null,
  protocolName = null,
  recentLogs = [],
}) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [view, setView] = useState('front');
  const [type, setType] = useState('subq');
  const [selected, setSelected] = useState([]);

  // Hydrate from initialStored each time the modal opens
  useEffect(() => {
    if (!visible) return;
    if (initialStored) {
      const parsed = parseStored(initialStored);
      if (parsed.type) setType(parsed.type);
      setSelected(parsed.sites || []);
    } else {
      setSelected([]);
    }
  }, [visible, initialStored]);

  const visibleSites = useMemo(
    () => SITES.filter(s => s.view === view && s.type === type),
    [view, type]
  );

  const suggestedSite = useMemo(() => {
    if (!visible) return null;
    return suggestNextSite(view, type, recentLogs || []);
  }, [view, type, recentLogs, visible]);

  const toggleSite = useCallback((siteId) => {
    setSelected(prev =>
      prev.includes(siteId)
        ? prev.filter(id => id !== siteId)
        : [...prev, siteId]
    );
  }, []);

  const summary = selected.length === 0
    ? t('bodymap_no_selection')
    : t('bodymap_n_selected').replace('{count}', String(selected.length));

  function handleSave() {
    onSave({
      stored: serializeForStorage(type, selected),
      siteIds: selected,
      type,
    });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>{t('bodymap_title')}</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
              accessibilityRole="button"
              accessibilityLabel={t('cancel')}
              style={s.closeBtn}
            >
              <CrossMark size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {protocolName ? (
            <Text style={s.subtitle}>
              {protocolName} · {type === 'subq' ? t('bodymap_subq') : t('bodymap_im')}
            </Text>
          ) : null}

          {/* Type segmented control */}
          <Segmented
            style={s.segWrap}
            value={type}
            onChange={setType}
            options={[
              { value: 'subq', label: t('bodymap_subq') },
              { value: 'im', label: t('bodymap_im') },
            ]}
          />

          {/* Front / Back toggle */}
          <Segmented
            style={s.viewToggle}
            value={view}
            onChange={setView}
            options={[
              { value: 'front', label: t('bodymap_front') },
              { value: 'back', label: t('bodymap_back') },
            ]}
          />

          <ScrollView
            contentContainerStyle={{ alignItems: 'center', paddingVertical: 6 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Body figure (front/back share the same silhouette geometry) */}
            <View style={s.bodyContainer}>
              {/* Head */}
              <View style={[s.bodyPart, { left: 70, top: 16, width: 40, height: 47, borderRadius: 20 }]} />
              {/* Neck */}
              <View style={[s.bodyPart, { left: 81, top: 61, width: 18, height: 14, borderRadius: 4 }]} />
              {/* Shoulders */}
              <View style={[s.bodyPart, { left: 50, top: 76, width: 80, height: 23, borderRadius: 11 }]} />
              {/* Torso */}
              <View style={[s.bodyPart, { left: 54, top: 95, width: 72, height: 125, borderRadius: 15 }]} />
              {/* Left arm (visible from front and back) */}
              <View style={[s.bodyPart, { left: 29, top: 90, width: 23, height: 144, borderRadius: 11 }]} />
              {/* Right arm */}
              <View style={[s.bodyPart, { left: 128, top: 90, width: 23, height: 144, borderRadius: 11 }]} />
              {/* Left leg */}
              <View style={[s.bodyPart, { left: 58, top: 216, width: 29, height: 166, borderRadius: 12 }]} />
              {/* Right leg */}
              <View style={[s.bodyPart, { left: 93, top: 216, width: 29, height: 166, borderRadius: 12 }]} />

              {/* Site dots — TouchableOpacity per site */}
              {visibleSites.map(site => {
                const isSelected = selected.includes(site.id);
                const isSuggested = suggestedSite && suggestedSite.id === site.id;
                const cx = site.x * SCALE;
                const cy = site.y * SCALE;
                return (
                  <View key={site.id} style={{ position: 'absolute', left: cx - DOT, top: cy - DOT, width: DOT * 2, height: DOT * 2, alignItems: 'center', justifyContent: 'center' }}>
                    {/* Suggested ring renders behind the dot */}
                    {isSuggested && !isSelected && (
                      <View style={s.suggestedRing} pointerEvents="none" />
                    )}
                    <TouchableOpacity
                      onPress={() => toggleSite(site.id)}
                      activeOpacity={0.6}
                      accessibilityLabel={t(site.labelKey)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={[
                        s.siteDot,
                        isSelected && s.siteDotSelected,
                      ]}
                    />
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {/* Legend */}
          <View style={s.legend}>
            <View style={s.legendItem}>
              <View style={s.legendDotAvail} />
              <Text style={s.legendText}>{t('bodymap_available')}</Text>
            </View>
            <View style={s.legendItem}>
              <View style={s.legendDotSel} />
              <Text style={s.legendText}>{t('bodymap_selected')}</Text>
            </View>
            <View style={s.legendItem}>
              <View style={s.legendRingSug} />
              <Text style={s.legendText}>{t('bodymap_suggested')}</Text>
            </View>
          </View>

          {/* Selected count */}
          <Text style={s.summary}>{summary}</Text>

          {/* Disclaimer */}
          <Text style={s.disclaimer}>{t('bodymap_disclaimer')}</Text>

          {/* Actions */}
          <View style={s.actions}>
            <TouchableOpacity style={s.btnSecondary} onPress={onClose} accessibilityRole="button">
              <Text style={s.btnSecondaryText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnPrimary} onPress={handleSave} accessibilityRole="button">
              <Text style={s.btnPrimaryText}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const HAIR = StyleSheet.hairlineWidth;

const makeStyles = (c) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: c.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: '94%',
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: c.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 2,
  },
  title: { fontSize: 19, fontWeight: '600', color: c.text },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.card2, alignItems: 'center', justifyContent: 'center' },
  subtitle: { fontSize: 14, color: c.textMuted, marginBottom: 12 },
  segWrap: { marginBottom: 8 },
  viewToggle: { marginBottom: 4 },
  bodyContainer: {
    width: W,
    height: H,
    position: 'relative',
    marginVertical: 4,
  },
  // Figure: soft secondary surface with a quiet outline — resolves in both themes.
  bodyPart: {
    position: 'absolute',
    backgroundColor: c.card2,
    borderWidth: 0.8,
    borderColor: c.textFaint,
  },
  siteDot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: c.accentSoft,
    borderWidth: 1.2,
    borderColor: c.accent,
  },
  siteDotSelected: {
    backgroundColor: c.accent,
    borderColor: c.card,
    borderWidth: 2.5,
  },
  suggestedRing: {
    position: 'absolute',
    width: DOT + 12,
    height: DOT + 12,
    borderRadius: (DOT + 12) / 2,
    borderWidth: 1.4,
    borderColor: c.accent,
    borderStyle: 'dashed',
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDotAvail: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: c.accentSoft,
    borderWidth: 1,
    borderColor: c.accent,
  },
  legendDotSel: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: c.accent,
  },
  legendRingSug: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.4,
    borderColor: c.accent,
    borderStyle: 'dashed',
  },
  legendText: { fontSize: 12, color: c.textMuted },
  summary: {
    fontSize: 16,
    color: c.text,
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 11.5,
    color: c.textSubtle,
    textAlign: 'center',
    marginVertical: 10,
    lineHeight: 16,
    paddingHorizontal: 12,
  },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: HAIR, borderTopColor: c.border },
  btnSecondary: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: c.card2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: { fontSize: 16, color: c.text, fontWeight: '500' },
  btnPrimary: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: { fontSize: 16, color: c.accentText, fontWeight: '600' },
});
