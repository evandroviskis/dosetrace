/**
 * BodyMapModal — the injection-site picker (Graduated redesign item 27, founder approved
 * 2026-09-30; prototype siteSheet() in docs/design/prototype.html).
 *
 * Bottom sheet on the founder's body images: Subcutaneous shows Front / Back, Intramuscular
 * shows Right side / Left side; the figure follows the profile's "Sex at birth" (male when
 * unknown). Under the image, a named list: one row per area with Left / Right buttons, and
 * "Somewhere else" for a site in the user's own words (stored as plain text, the existing
 * free-text format). Several sites can be picked. "Longest unused in your log" recalls the
 * user's own log (hidden until a site is logged); it is not advice.
 *
 * Points per sex and view, the list, the recall and the opening route are pure:
 * lib/bodySites.js. Stored site ids (lib/injectionSites.js) never change.
 *
 * Props:
 *   visible:        boolean
 *   onClose:        () => void
 *   onSave:         ({ stored, siteIds, type }) => void
 *   onSkip:         () => void   (optional — shows "Skip": keep the dose, no site; S-20 / S-25)
 *   onBack:         () => void   (optional — Android back; defaults to onClose)
 *   initialStored:  string (existing dose_logs.injection_site value)
 *   protocolName:   string (e.g. "BPC-157") — shown in subtitle
 *   protocolId:     id (optional) — opens on the route this protocol last used in the log
 *   recentLogs:     dose_log rows (the user's own log: recall + last route)
 */

import { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  TouchableOpacity,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import Svg, { Ellipse, Circle, Path } from 'react-native-svg';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { CONTENT_MAX_WIDTH } from '../../lib/responsive';
import { getCachedUser } from '../../lib/supabase';
import {
  getSiteById,
  parseStored,
  siteToStore,
  hasSavedSite as siteIsSaved,
} from '../../lib/injectionSites';
import {
  IMG_W,
  IMG_H,
  figureSex,
  viewsFor,
  defaultView,
  imageKey,
  siteOn,
  toggleSite,
  figurePoints,
  listRows,
  siteLongest,
  openingRoute,
  storedType,
} from '../../lib/bodySites';
import CheckMark, { CrossMark } from '../../components/CheckMark';

// The founder's images (assets/body, @2x 600 x 750 and @3x 768 x 960).
const BODY_IMAGES = {
  m_front: require('../../assets/body/m_front.png'),
  m_back: require('../../assets/body/m_back.png'),
  m_right: require('../../assets/body/m_right.png'),
  m_left: require('../../assets/body/m_left.png'),
  f_front: require('../../assets/body/f_front.png'),
  f_back: require('../../assets/body/f_back.png'),
  f_right: require('../../assets/body/f_right.png'),
  f_left: require('../../assets/body/f_left.png'),
};

// The marks sit on the body image, a deliberately fixed light surface in both themes
// (prototype --figInk / --figDot / --figSel / --figOnSel). Everything else is themed.
const FIG = { ink: '#111315', dot: '#FFFFFF', sel: '#2350D8', onSel: '#FFFFFF' };

// New copy proposed for item 27 (not in i18n/translations.js yet). Each one is read through
// t() first, so it switches to the translation as soon as its key exists; until then the
// English placeholder shows. Guarded in this one place.
const PROPOSED_COPY = {
  bodymap_right_side: 'Right side',
  bodymap_left_side: 'Left side',
  bodymap_your_right: 'Your right',
  bodymap_your_left: 'Your left',
  bodymap_side_right: 'Right',
  bodymap_side_left: 'Left',
  bodymap_area_abdomen_upper: 'Abdomen, upper',
  bodymap_area_abdomen_lower: 'Abdomen, lower',
  bodymap_area_thigh_front: 'Thigh, front',
  bodymap_area_arm_back: 'Back of upper arm',
  bodymap_area_glute_dimple: 'Upper buttock',
  bodymap_area_thigh_back: 'Thigh, back',
  bodymap_area_vastus: 'Vastus lateralis',
  bodymap_somewhere_else: 'Somewhere else',
  bodymap_type_it_in: 'Type it in',
  bodymap_where_label: 'Where? (your words)',
  bodymap_where_placeholder: 'e.g. right calf',
  bodymap_saved_text: 'Saved earlier as text:',
  bodymap_saved_text_kept: 'Kept as it is unless you pick a spot or tap Remove site.',
  bodymap_longest_in_log: 'Longest unused in your log:',
  bodymap_not_in_log: 'not in your log yet',
  bodymap_used_today: 'last used today',
  bodymap_used_1_day: 'last used 1 day ago',
  bodymap_used_n_days: 'last used {days} days ago',
};
// Areas whose name already exists in 6 languages (group_*).
const AREA_EXISTING = { flank: 'group_flank', deltoid: 'group_deltoid', ventroglute: 'group_ventroglute', dorsoglute: 'group_dorsoglute' };

const FREE_TEXT_MAX = 40;

// The last figure sex read from the profile, so the next open draws the right figure at once.
let lastKnownSex = 'male';

export default function BodyMapModal({
  visible,
  onClose,
  onSave,
  onSkip = null,
  onBack = null,
  initialStored = null,
  protocolName = null,
  protocolId = null,
  recentLogs = [],
}) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { width: winW } = useWindowDimensions();
  // An older typed-in site ("left glute") has no spot: show the saved text itself so the
  // user sees what is stored; it is kept unless they pick a spot (A-55).
  const freeText = parseStored(initialStored).freeText;
  const hasSavedSite = siteIsSaved(initialStored);
  const tx = (key) => { const v = t(key); return v === key ? (PROPOSED_COPY[key] || key) : v; };

  const [type, setType] = useState('subq');
  const [view, setView] = useState('front');
  const [selected, setSelected] = useState([]);
  const [other, setOther] = useState(null); // "Somewhere else": null = off, string = the typed words
  const [sex, setSex] = useState(lastKnownSex);

  // Hydrate from initialStored each time the modal opens; open on the saved route, else the
  // route this protocol last used in the log, else subcutaneous.
  useEffect(() => {
    if (!visible) return;
    const parsed = parseStored(initialStored);
    const route = openingRoute({ initialStored, protocolId, logs: recentLogs || [] });
    setType(route);
    setView(defaultView(route));
    setSelected(parsed.sites || []);
    setOther(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialStored]);

  // The figure follows the profile's "Sex at birth" (user_metadata.gender); male when unknown.
  useEffect(() => {
    if (!visible) return;
    let live = true;
    getCachedUser()
      .then((user) => {
        const next = figureSex(user?.user_metadata);
        lastKnownSex = next;
        if (live) setSex(next);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [visible]);

  const figW = Math.min(300, Math.max(220, Math.min(winW, CONTENT_MAX_WIDTH) - 64));
  const figH = figW * (IMG_H / IMG_W);
  const k = figW / IMG_W;
  const points = useMemo(() => figurePoints(sex, view, type, figW), [sex, view, type, figW]);
  const rows = useMemo(() => listRows(type, view), [type, view]);
  const longest = useMemo(
    () => (visible ? siteLongest({ view, type, logs: recentLogs || [] }) : null),
    [visible, view, type, recentLogs]
  );
  const isSug = (id) => !!longest && siteOn([longest.site.id], id) && !siteOn(selected, id);

  function pickRoute(next) {
    if (next === type) return;
    // The picked sites are kept (switching back shows them again); never cleared by a look.
    setType(next);
    setView(defaultView(next));
  }

  function tapSite(id) {
    const adding = !siteOn(selected, id);
    setSelected(toggleSite(selected, id));
    setOther(null);
    // Intramuscular: show the side of a newly picked site.
    const site = getSiteById(id);
    if (adding && type === 'im' && site) setView(site.side === 'left' ? 'left' : 'right');
  }

  // "Somewhere else": typing a site in the user's own words replaces the picked spots.
  // Opened empty: an empty field never overwrites a site typed earlier (A-55).
  function tapOther() {
    if (other != null) { setOther(null); return; }
    setSelected([]);
    setOther('');
  }

  function handleSave() {
    const typed = other != null ? other.trim() : '';
    const stored = !selected.length && typed ? typed : siteToStore({ type: storedType(selected, type), selected, initialStored });
    onSave({
      stored,
      siteIds: selected,
      type: storedType(selected, type),
    });
  }

  // "Remove site" (S-20): sites are optional — clear the saved site (picked or typed)
  // without touching the dose. Goes through the same onSave path with no site.
  function handleRemove() {
    onSave({ stored: null, siteIds: [], type });
  }

  const views = viewsFor(type);
  const viewLabel = (v) => ({ front: t('bodymap_front'), back: t('bodymap_back'), right: tx('bodymap_right_side'), left: tx('bodymap_left_side') }[v]);
  const capLeft = { front: tx('bodymap_your_right'), back: tx('bodymap_your_left'), right: t('bodymap_back'), left: t('bodymap_front') }[view];
  const capRight = { front: tx('bodymap_your_left'), back: tx('bodymap_your_right'), right: t('bodymap_front'), left: t('bodymap_back') }[view];
  const areaLabel = (area) => (AREA_EXISTING[area] ? t(AREA_EXISTING[area]) : tx('bodymap_area_' + area));
  const sideLabel = (site) => (site.side === 'left' ? tx('bodymap_side_left') : tx('bodymap_side_right'));
  const selectedNames = selected.map((id) => { const x = getSiteById(id); return x ? t(x.labelKey) : null; }).filter(Boolean);

  let longestText = null;
  if (longest) {
    const d = longest.days;
    const when = d == null ? tx('bodymap_not_in_log')
      : d === 0 ? tx('bodymap_used_today')
      : d === 1 ? tx('bodymap_used_1_day')
      : tx('bodymap_used_n_days').replace('{days}', String(d));
    longestText = { label: t(longest.site.labelKey), when };
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onBack || onClose}
    >
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.header}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.title}>{t('bodymap_title')}</Text>
              {protocolName ? (
                <Text style={s.subtitle} numberOfLines={1}>
                  {protocolName} · {type === 'subq' ? t('bodymap_subq') : t('bodymap_im')}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={s.round}
              onPress={onClose}
              hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
              accessibilityRole="button"
              accessibilityLabel={t('cancel')}
            >
              <CrossMark size={18} color={colors.ink2} />
            </TouchableOpacity>
          </View>

          {/* Route */}
          <View style={s.segFill} accessibilityRole="radiogroup">
            {['subq', 'im'].map((r) => (
              <TouchableOpacity
                key={r}
                style={[s.segFillBtn, type === r && s.segOn]}
                onPress={() => pickRoute(r)}
                accessibilityRole="radio"
                accessibilityState={{ checked: type === r }}
              >
                <Text style={[s.segText, type === r && s.segTextOn]}>
                  {r === 'subq' ? t('bodymap_subq') : t('bodymap_im')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollBody}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.figWrap}>
              {/* View: Front / Back, or Right side / Left side */}
              <View style={s.seg}>
                {views.map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[s.segBtn, view === v && s.segOn]}
                    onPress={() => setView(v)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: view === v }}
                  >
                    <Text style={[s.segText, view === v && s.segTextOn]}>{viewLabel(v)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* The body image with its marks */}
              <View style={{ width: figW, height: figH }}>
                <Image
                  source={BODY_IMAGES[imageKey(sex, view)]}
                  style={{ position: 'absolute', left: 0, top: 0, width: figW, height: figH }}
                  resizeMode="contain"
                  accessible={false}
                />
                <Svg width={figW} height={figH} style={StyleSheet.absoluteFill} pointerEvents="none">
                  {points.map((p) => (siteOn(selected, p.id)
                    ? <Ellipse key={'z' + p.id} cx={p.x} cy={p.y} rx={p.rx} ry={p.ry} fill={FIG.sel} />
                    : isSug(p.id)
                      ? <Ellipse key={'z' + p.id} cx={p.x} cy={p.y} rx={p.rx} ry={p.ry} fill="none" stroke={FIG.ink} strokeWidth={4 * k} strokeDasharray={[11 * k, 8 * k]} />
                      : null))}
                  {points.map((p) => (siteOn(selected, p.id)
                    ? <Path key={'d' + p.id} d={`M${p.x - 11 * k} ${p.y} l${7.5 * k} ${8 * k} ${14.5 * k} ${-16 * k}`} fill="none" stroke={FIG.onSel} strokeWidth={5.5 * k} strokeLinecap="round" strokeLinejoin="round" />
                    : <Circle key={'d' + p.id} cx={p.x} cy={p.y} r={12 * k} fill={FIG.dot} stroke={FIG.ink} strokeWidth={4.5 * k} />))}
                </Svg>
                {points.map((p) => {
                  const hit = Math.max(36, 92 * k);
                  const on = siteOn(selected, p.id);
                  return (
                    <Pressable
                      key={'t' + p.id}
                      onPress={() => tapSite(p.id)}
                      style={{ position: 'absolute', left: p.x - hit / 2, top: p.y - hit / 2, width: hit, height: hit, borderRadius: hit / 2 }}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={t(p.labelKey)}
                    />
                  );
                })}
              </View>
              <View style={[s.capRow, { width: figW }]}>
                <Text style={s.cap}>{capLeft}</Text>
                <Text style={s.cap}>{capRight}</Text>
              </View>
            </View>

            {/* The named list: one row per area, Left / Right in the image's order */}
            <View style={s.list}>
              {rows.map((row, i) => (
                <View key={row.area} style={[s.row, i > 0 && s.rowLine]}>
                  <Text style={s.rowText}>{areaLabel(row.area)}</Text>
                  {row.sites.map((site) => {
                    const on = siteOn(selected, site.id);
                    const sug = isSug(site.id);
                    return (
                      <TouchableOpacity
                        key={site.id}
                        style={[s.sideBtn, on && s.sideBtnOn, sug && s.sideBtnSug]}
                        onPress={() => tapSite(site.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={t(site.labelKey)}
                      >
                        {on ? <CheckMark size={14} color={colors.onInk} /> : null}
                        <Text style={[s.sideBtnText, on && s.sideBtnTextOn]}>{sideLabel(site)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
              <View style={[s.row, s.rowLine]}>
                <Text style={s.rowText}>{tx('bodymap_somewhere_else')}</Text>
                <TouchableOpacity
                  style={[s.sideBtn, s.sideBtnWide, other != null && s.sideBtnOn]}
                  onPress={tapOther}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: other != null }}
                >
                  {other != null ? <CheckMark size={14} color={colors.onInk} /> : null}
                  <Text style={[s.sideBtnText, other != null && s.sideBtnTextOn]}>{tx('bodymap_type_it_in')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {other != null ? (
              <View style={{ gap: 6 }}>
                <Text style={s.sec}>{tx('bodymap_where_label')}</Text>
                <TextInput
                  style={s.input}
                  value={other}
                  onChangeText={setOther}
                  maxLength={FREE_TEXT_MAX}
                  placeholder={tx('bodymap_where_placeholder')}
                  placeholderTextColor={colors.ink3}
                  autoFocus
                  returnKeyType="done"
                />
              </View>
            ) : null}

            {/* A site saved earlier as text (A-55): shown, and kept unless a spot is picked */}
            {freeText && selected.length === 0 && other == null ? (
              <View style={s.freeBox}>
                <Text style={s.sec}>
                  {tx('bodymap_saved_text')} <Text style={{ fontWeight: '600' }}>{'“' + freeText + '”'}</Text>
                </Text>
                <Text style={s.foot}>{tx('bodymap_saved_text_kept')}</Text>
              </View>
            ) : null}

            {longestText ? (
              <View style={s.sugLine}>
                <View style={s.sugKey} />
                <Text style={[s.foot, { flex: 1 }]}>
                  {tx('bodymap_longest_in_log')} <Text style={{ color: colors.ink, fontWeight: '600' }}>{longestText.label}</Text> · {longestText.when}
                </Text>
              </View>
            ) : null}

            <Text style={s.summary}>
              {selected.length
                ? <><Text style={{ fontWeight: '600' }}>{t('bodymap_n_selected').replace('{count}', String(selected.length))}:</Text> {selectedNames.join(' · ')}</>
                : <Text style={{ color: colors.ink2 }}>{t('bodymap_no_selection')}</Text>}
            </Text>
          </ScrollView>

          {/* Disclaimer */}
          <Text style={s.disclaimer}>{t('bodymap_disclaimer')}</Text>

          {/* Actions: one primary (Save) */}
          <View style={s.actions}>
            <TouchableOpacity style={[s.btn, s.btnSecondary]} onPress={onClose} accessibilityRole="button">
              <Text style={s.btnSecondaryText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={handleSave} accessibilityRole="button">
              <Text style={s.btnPrimaryText}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
          {hasSavedSite && (
            <TouchableOpacity style={s.btnLink} onPress={handleRemove} accessibilityRole="button">
              <Text style={s.btnRemoveText}>{t('bodymap_remove_site')}</Text>
            </TouchableOpacity>
          )}
          {onSkip && (
            <TouchableOpacity style={s.btnLink} onPress={onSkip} accessibilityRole="button">
              <Text style={s.btnSkipText}>{t('today_pick_site_skip')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (c) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: c.raised,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: '94%',
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  handle: { width: 36, height: 4, backgroundColor: c.line, borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600', color: c.ink },
  subtitle: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' },
  segFill: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 14, backgroundColor: c.well, marginBottom: 12 },
  segFillBtn: { flex: 1, minHeight: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  seg: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 14, backgroundColor: c.well, alignSelf: 'center' },
  segBtn: { minHeight: 34, paddingHorizontal: 12, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: c.raised, borderWidth: 1, borderColor: c.line },
  segText: { fontSize: 15, fontWeight: '500', color: c.ink2 },
  segTextOn: { color: c.ink, fontWeight: '700' },
  scroll: { flexShrink: 1 },
  scrollBody: { gap: 12, paddingBottom: 4 },
  figWrap: { alignItems: 'center', gap: 6 },
  capRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cap: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: c.ink2 },
  list: { backgroundColor: c.well, borderRadius: 16, paddingVertical: 2, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 54 },
  rowLine: { borderTopWidth: 1, borderTopColor: c.line },
  rowText: { flex: 1, fontSize: 17, lineHeight: 22, color: c.ink },
  sideBtn: {
    minWidth: 72,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: c.raised,
    borderWidth: 1.5,
    borderColor: c.line,
  },
  sideBtnWide: { minWidth: 152 },
  sideBtnOn: { backgroundColor: c.ink, borderColor: c.ink },
  sideBtnSug: { borderStyle: 'dashed', borderColor: c.ink2 },
  sideBtnText: { fontSize: 14, fontWeight: '600', color: c.ink },
  sideBtnTextOn: { color: c.onInk },
  sec: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  foot: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  input: {
    fontSize: 17,
    color: c.ink,
    backgroundColor: c.raised,
    borderRadius: 14,
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: c.line,
  },
  freeBox: { gap: 4, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.well },
  sugLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  sugKey: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.2, borderStyle: 'dashed', borderColor: c.ink2, marginTop: 3 },
  summary: { fontSize: 17, lineHeight: 22, color: c.ink, minHeight: 22 },
  disclaimer: { fontSize: 13, lineHeight: 18, color: c.ink2, marginTop: 10, marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  btn: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnSecondary: { flex: 1, backgroundColor: c.well },
  btnSecondaryText: { fontSize: 17, fontWeight: '700', color: c.ink },
  btnPrimary: { flex: 1.4, backgroundColor: c.act },
  btnPrimaryText: { fontSize: 17, fontWeight: '700', color: c.onAct },
  btnLink: { alignSelf: 'center', minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, marginTop: 4 },
  btnRemoveText: { fontSize: 17, color: c.risk, textDecorationLine: 'underline' },
  btnSkipText: { fontSize: 17, color: c.ink, textDecorationLine: 'underline' },
});
