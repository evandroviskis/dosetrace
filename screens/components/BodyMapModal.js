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
import {
  SITES,
  suggestNextSite,
  parseStored,
  serializeForStorage,
} from '../../lib/injectionSites';

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
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('cancel')}
            >
              <Text style={s.close}>×</Text>
            </TouchableOpacity>
          </View>

          {protocolName ? (
            <Text style={s.subtitle}>
              {protocolName} · {type === 'subq' ? t('bodymap_subq') : t('bodymap_im')}
            </Text>
          ) : null}

          {/* Type segmented control */}
          <View style={s.segWrap}>
            <TouchableOpacity
              style={[s.seg, type === 'subq' && s.segOn]}
              onPress={() => setType('subq')}
            >
              <Text style={[s.segText, type === 'subq' && s.segTextOn]}>
                {t('bodymap_subq')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.seg, type === 'im' && s.segOn]}
              onPress={() => setType('im')}
            >
              <Text style={[s.segText, type === 'im' && s.segTextOn]}>
                {t('bodymap_im')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Front / Back toggle */}
          <View style={s.viewToggle}>
            <TouchableOpacity
              style={[s.viewBtn, view === 'front' && s.viewBtnOn]}
              onPress={() => setView('front')}
            >
              <Text style={[s.viewBtnText, view === 'front' && s.viewBtnTextOn]}>
                {t('bodymap_front')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.viewBtn, view === 'back' && s.viewBtnOn]}
              onPress={() => setView('back')}
            >
              <Text style={[s.viewBtnText, view === 'back' && s.viewBtnTextOn]}>
                {t('bodymap_back')}
              </Text>
            </TouchableOpacity>
          </View>

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
            <TouchableOpacity style={s.btnSecondary} onPress={onClose}>
              <Text style={s.btnSecondaryText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnPrimary} onPress={handleSave}>
              <Text style={s.btnPrimaryText}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: '94%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#ddd',
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
    paddingBottom: 4,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#111' },
  close: { fontSize: 26, color: '#888', paddingHorizontal: 4, lineHeight: 26 },
  subtitle: { fontSize: 12, color: '#888', marginBottom: 10 },
  segWrap: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 8,
  },
  seg: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segOn: { backgroundColor: '#fff' },
  segText: { fontSize: 13, color: '#888', fontWeight: '500' },
  segTextOn: { color: '#111', fontWeight: '600' },
  viewToggle: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  viewBtn: {
    flex: 1,
    paddingVertical: 6,
    borderWidth: 0.5,
    borderColor: '#ddd',
    borderRadius: 8,
    alignItems: 'center',
  },
  viewBtnOn: { borderColor: '#185FA5', backgroundColor: '#E6F1FB' },
  viewBtnText: { fontSize: 12, color: '#888', fontWeight: '500' },
  viewBtnTextOn: { color: '#0C447C', fontWeight: '600' },
  bodyContainer: {
    width: W,
    height: H,
    position: 'relative',
    marginVertical: 4,
  },
  bodyPart: {
    position: 'absolute',
    backgroundColor: '#F4F1EB',
    borderWidth: 0.6,
    borderColor: '#D3D1C7',
  },
  siteDot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: '#85B7EB',
    borderWidth: 0.8,
    borderColor: '#185FA5',
  },
  siteDotSelected: {
    backgroundColor: '#0C447C',
    borderColor: '#fff',
    borderWidth: 2,
  },
  suggestedRing: {
    position: 'absolute',
    width: DOT + 12,
    height: DOT + 12,
    borderRadius: (DOT + 12) / 2,
    borderWidth: 1.2,
    borderColor: '#185FA5',
    borderStyle: 'dashed',
  },
  legend: {
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'center',
    marginVertical: 8,
    flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDotAvail: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#85B7EB',
    borderWidth: 0.8,
    borderColor: '#185FA5',
  },
  legendDotSel: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0C447C',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  legendRingSug: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.2,
    borderColor: '#185FA5',
    borderStyle: 'dashed',
  },
  legendText: { fontSize: 11, color: '#666' },
  summary: {
    fontSize: 13,
    color: '#0C447C',
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '500',
  },
  disclaimer: {
    fontSize: 10,
    color: '#aaa',
    textAlign: 'center',
    marginVertical: 8,
    lineHeight: 14,
    paddingHorizontal: 16,
  },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 4 },
  btnSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  btnSecondaryText: { fontSize: 14, color: '#888', fontWeight: '500' },
  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#185FA5',
    alignItems: 'center',
  },
  btnPrimaryText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});
