import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useWindowSize } from '../lib/windowSize';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase, getCachedUser } from '../lib/supabase';
import { hasPremium } from '../lib/entitlement';
import { formatDate as localeDate, decimalText, inputNumber, MONTHS_SHORT } from '../lib/localeFormat';
import { parseMeasure } from '../lib/doseMath';
import { useLanguage } from '../i18n/LanguageContext';
import { Analytics } from '../lib/analytics';
import { getBiomarkers, insertBiomarkers, updateBiomarker, deleteBiomarker, deleteBiomarkerReport, getAllDataForExport, getVaccines, getActiveProtocols } from '../lib/database';
import { buildRecordsCSV, buildRecordsHTML, canonicalMarker, markerSeries as buildMarkerSeries } from '../lib/exportRecords';
import { hasNativeModule } from '../lib/nativeModule';
import { requestSync } from '../lib/sync';
import { hasAIConsent, grantAIConsent, AI_PRIVACY_URL } from '../lib/aiConsent';
import { useTheme } from '../lib/theme';
import FeatureIcon from '../components/FeatureIcon';
import SegmentedBar from '../components/SegmentedBar';
import FeatureExplainerGate from '../components/FeatureExplainerGate';
import { FeaturePreviewSheet } from '../components/FeaturePreviews';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { MONO } from '../lib/fonts';
import Svg, { Path } from 'react-native-svg';
import MarkerChart from './components/MarkerChart';
import VaccinesSection from './components/VaccinesSection';
import VaccinePage from './components/VaccinePage';
import { DTSheet, DTActionSheet, DTPickerSheet, DTWheel } from './components/ProtocolParts';
import { BottomSheet, SheetBar, CloseBar } from './components/BodySheets';
import CheckMark, { CrossMark } from '../components/CheckMark';
import BookPanes, { useBook, useBookSelection } from '../components/BookPanes';
import { defaultSelection, paneWidths } from '../lib/bookLayout';
import { clearSelection } from '../lib/bookSelection';
import SerumCurveScreen from './SerumCurveScreen';
import { pluralKey } from '../lib/plural';
import { defaultCurveLevel, levelLabel } from '../lib/serumModel';
import { loadCurveView } from '../lib/curveViewStore';
import { displayColor } from '../lib/protocolColors';
import { labHubSummary, nextDueVaccine, exportVisible, deleteValueCopy } from '../lib/bodyHub';
import { validateExtraction, scanErrorKind, scanErrorSheet } from '../lib/bodyScan';
import { todayLocal, wheelColumns, wheelAfter } from '../lib/bodyDates';

// Small monoline controls of the Lab test journal (prototype CHEV / BI.star / BI.pen,
// 24-grid, 1.8 stroke). Colors always come from the theme.
function Chevron({ color, flip }) {
  return (
    <View style={flip ? { transform: [{ scaleX: -1 }] } : null}>
      <Svg width={9} height={15} viewBox="0 0 10 16" fill="none">
        <Path d="M2 2l6 6-6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
function StarGlyph({ color, filled, size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5l1.7 4.6 5 .2-3.9 3.1 1.3 4.8L12 15l-4.1 2.7 1.3-4.8-3.9-3.1 5-.2z"
        fill={filled ? color : 'none'} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}
function PenGlyph({ color, size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 19l1-4L15.5 5.5a2 2 0 0 1 3 3L9 18z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13.5 7.5l3 3" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}


// Client-side pre-check: reject files over 10MB before reading into memory.
// The edge function enforces its own ~15MB base64 cap server-side.
const MAX_FILE_BYTES = 10 * 1024 * 1024;
// The Test date wheel (MB-17): a lab test is never in the future.
const TEST_DATE_RANGE = { back: 30, ahead: 0 };

// S-26 book layout, My Body (docs/specs/book-layout.md BK-6, BK-10). Pure and self-contained
// so __tests__/bookBody.test.js can run them. Right-page ids: a lab test = its upload key
// (report_date + '|' + created_at, the same key as the journal cards), a marker =
// 'marker:' + its canonical key, a vaccine = 'vax:' + its id (BK-18), Dose accumulation = 'curve'.

// The newest test = the first card of the By date list, newest first (the default page).
// A-101d: one card per lab test. Every insert batch (created_at) is an upload or one typed marker;
// batches of the same date join one card, unless a batch repeats a marker the card already has —
// that is a second (duplicate) upload, kept as its own card so it can be deleted alone.
// key = date + '|' + the card's first batch; batches = every created_at in the card.
function reportCards(rows) {
  const byDate = {};
  for (const r of rows || []) {
    const c = r.created_at || '';
    const d = (byDate[r.report_date] = byDate[r.report_date] || {});
    (d[c] = d[c] || []).push(r);
  }
  const cards = [];
  for (const date of Object.keys(byDate)) {
    const dateCards = [];
    for (const c of Object.keys(byDate[date]).sort()) {
      const batch = byDate[date][c];
      const names = new Set(batch.map(r => String(r.marker || '').toLowerCase()));
      let card = dateCards.find(k => !k.markers.some(m => names.has(String(m.marker || '').toLowerCase())));
      if (!card) { card = { key: date + '|' + c, date, createdAt: c, latest: c, batches: [], markers: [] }; dateCards.push(card); }
      card.batches.push(c);
      card.markers.push(...batch);
      card.latest = c;
    }
    cards.push(...dateCards);
  }
  return cards;
}

function newestReportKey(rows) {
  let best = null;
  for (const card of reportCards(rows)) {
    if (!best || card.date > best.date || (card.date === best.date && card.latest > best.latest)) best = card;
  }
  return best ? best.key : null;
}

// Every value of one lab test (card), from ALL rows (not the search-filtered list).
function buildReport(rows, key) {
  return reportCards(rows).find(c => c.key === key) || null;
}

// What the right page shows. A chosen test, marker or vaccine that no longer exists
// (deleted, renamed) falls back to the newest test; Dose accumulation only for Premium.
// `vaxKeys`: the ids of the user's vaccines, as strings (BK-18).
function bodyRightPage({ sel, reportKeys, markerKeys, vaxKeys, premium, newestKey }) {
  const has = (keys, k) => (keys && typeof keys.has === 'function' ? keys.has(k) : Array.isArray(keys) && keys.includes(k));
  if (sel === 'curve') {
    if (premium) return { type: 'curve', id: 'curve' };
  } else if (typeof sel === 'string' && sel.indexOf('marker:') === 0) {
    const key = sel.slice('marker:'.length);
    if (has(markerKeys, key)) return { type: 'marker', key, id: sel };
  } else if (typeof sel === 'string' && sel.indexOf('vax:') === 0) {
    const key = sel.slice('vax:'.length);
    if (has(vaxKeys, key)) return { type: 'vaccine', key, id: sel };
  } else if (sel && has(reportKeys, sel)) {
    return { type: 'report', key: sel, id: sel };
  }
  if (newestKey && has(reportKeys, newestKey)) return { type: 'report', key: newestKey, id: newestKey };
  return null;
}

// BK-10, folding: what the one-column My Body shows. An open add/edit vaccine sheet wins
// (its typed values are carried over); then the item the user chose on the right page:
// a test or marker opens its detail with "‹ back", Dose accumulation is pushed as today.
// A default nobody chose changes nothing. A vaccine opens the vaccine journal with "‹ back"
// (the phone has no read page; a tap there opens the sheet, as today).
function bodyFoldPlan({ sel, explicit, vaxSheetOpen }) {
  if (vaxSheetOpen) return { section: 'vaccines', detail: null };
  if (!explicit || !sel) return null;
  if (sel === 'curve') return { section: null, detail: null, push: 'SerumCurve' };
  if (sel.indexOf('vax:') === 0) return { section: 'vaccines', detail: null };
  if (sel.indexOf('marker:') === 0) return { section: 'labs', detail: { type: 'marker', key: sel.slice('marker:'.length) } };
  return { section: 'labs', detail: { type: 'report', key: sel } };
}

// BK-10, unfolding: a test or marker open in the one-column journal moves onto the right page.
function bodyUnfoldSel({ section, detail }) {
  if (section !== 'labs' || !detail) return null;
  if (detail.type === 'report') return detail.key;
  if (detail.type === 'marker') return 'marker:' + detail.key;
  return null;
}

// BK-18: the chosen vaccine is gone from a fresh list (deleted from its sheet, or by sync), so
// the choice is dropped and the right page goes back to the default (the newest test).
function staleVaccineSel(sel, list) {
  if (typeof sel !== 'string' || sel.indexOf('vax:') !== 0) return false;
  const id = sel.slice('vax:'.length);
  return !(list || []).some(v => String(v.id) === id);
}

// Free-feature explainer of the lab journal (Today redesign part 18), until the user has a
// lab value of their own (synced biomarkers).
function labExplainers(userId) {
  return [{ key: 'labsman', used: (getBiomarkers(userId) || []).length > 0 }];
}

export default function BodyScreen({ navigation, route }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowSize();
  // Chart width: screen minus the scroll gutter (16×2) and the card padding (18×2).
  const CHART_WIDTH = Math.min(windowWidth, CONTENT_MAX_WIDTH) - 32 - 36;
  // Book layout: the marker chart sized on the right page (BK-9: two equal pages).
  const bookChartWidth = Math.min(paneWidths(windowWidth).right, CONTENT_MAX_WIDTH) - 32 - 36;
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showSerumPreview, setShowSerumPreview] = useState(false);
  const [premium, setPremium] = useState(false);
  // Dose accumulation card (MB-4): the compound the Curve opens on and its Est. level now.
  const [level, setLevel] = useState(null);
  // DoseTrace sheets (MB-12, MB-13, MB-15, MB-25): `sheet` over the screen; `sourceChoice` the
  // bottom action sheet; `valueSheet` over Edit value; `exportSheet` over Choose what to export.
  const [sheet, setSheet] = useState(null);
  const [sourceChoice, setSourceChoice] = useState(null);
  const [valueSheet, setValueSheet] = useState(null);
  const [exportSheet, setExportSheet] = useState(null);
  // Lab test journal drill-down (prototype reportScreen / markerScreen):
  // null (the journal) | { type: 'report', key } | { type: 'marker', key }.
  const [detail, setDetail] = useState(null);
  const [viewMode, setViewMode] = useState('date');     // 'date' | 'marker'
  const [search, setSearch] = useState('');
  const [newestFirst, setNewestFirst] = useState(true);
  const [favorites, setFavorites] = useState([]);       // marker names, from user_metadata
  const [favOnly, setFavOnly] = useState(false);
  const [reportTags, setReportTags] = useState({});     // { 'YYYY-MM-DD': [label, ...] }, from user_metadata
  const [tagDraft, setTagDraft] = useState('');
  const [section, setSection] = useState(null);         // null (hub) | 'labs' | 'vaccines' | 'calc'

  // Deep link from notifications (e.g. an upload reminder → 'labs'). Param is
  // consumed after use so backing out to the hub isn't re-hijacked. (The
  // calculator/reality-check now lives in the Journey tab, not here.)
  useEffect(() => {
    const target = route?.params?.initialSection;
    if (target === 'labs' || target === 'vaccines') {
      setSection(target);
      setDetail(null);
      navigation.setParams({ initialSection: undefined });
    }
  }, [route?.params?.initialSection]);
  const [exporting, setExporting] = useState(false);
  const [vaccineList, setVaccineList] = useState([]);
  // Export selection
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selMarkers, setSelMarkers] = useState(() => new Set());
  const [selVaccines, setSelVaccines] = useState(() => new Set());
  // Editing a stored marker (correcting an extracted value).
  const [mEdit, setMEdit] = useState(null);
  const [mName, setMName] = useState('');
  const [mValue, setMValue] = useState('');
  const [mUnit, setMUnit] = useState('');
  const [mDate, setMDate] = useState('');
  const [mDateWheel, setMDateWheel] = useState(false);

  const q = search.trim().toLowerCase();

  // Date view: reports grouped by UPLOAD INSTANCE (report_date + created_at), so a
  // duplicate or mistaken second upload on the same date shows as its own card and
  // can be deleted on its own without touching the other. Each filtered by the
  // marker search, sorted by the chosen order. Reports with no matching marker are
  // dropped. `key` is the stable instance id used for expand + delete.
  const reports = useMemo(() => {
    // A-101d: one card per lab test (reportCards), then the marker search.
    const entries = reportCards(rows)
      .map(c => (q ? { ...c, markers: c.markers.filter(m => String(m.marker || '').toLowerCase().includes(q)) } : c))
      .filter(c => c.markers.length > 0);
    entries.sort((a, b) => {
      if (a.date !== b.date) return (a.date < b.date ? 1 : -1) * (newestFirst ? 1 : -1);
      return (a.latest < b.latest ? 1 : -1) * (newestFirst ? 1 : -1);
    });
    return entries;
  }, [rows, q, newestFirst]);

  // Marker view: one entry per distinct marker name, with its full value
  // history (oldest → newest for the chart) and the latest reading.
  const allMarkerSeries = useMemo(() => {
    // Group by canonical key so naming variants merge into one series.
    const byKey = {};
    for (const row of rows) {
      (byKey[canonicalMarker(row.marker)] ||= []).push(row);
    }
    const favSet = new Set(favorites);
    return Object.entries(byKey).map(([key, rs]) => {
      const sorted = rs.slice().sort((a, b) => (a.report_date < b.report_date ? -1 : a.report_date > b.report_date ? 1 : 0));
      const points = sorted.map(r => ({ id: r.id, marker: r.marker, date: r.report_date, value: r.value, unit: r.unit }));
      const latest = points[points.length - 1];
      const display = sorted[sorted.length - 1].marker; // most recent original label
      const names = new Set(rs.map(r => r.marker));
      return { key, marker: display, points, latest, unit: latest?.unit || '', isFav: [...names].some(n => favSet.has(n)) };
    });
  }, [rows, favorites]);
  const markerSeries = useMemo(() => {
    let series = allMarkerSeries;
    if (q) series = series.filter(x => x.marker.toLowerCase().includes(q));
    if (favOnly) series = series.filter(x => x.isFav);
    // Favorites first, then alphabetical within each group.
    return series.slice().sort((a, b) => (b.isFav - a.isFav) || a.marker.localeCompare(b.marker));
  }, [allMarkerSeries, q, favOnly]);

  // The test or marker the user opened. Built from ALL rows (not the search-filtered
  // list), so a test shows every value it holds.
  const reportDetail = useMemo(
    () => (detail?.type === 'report' ? buildReport(rows, detail.key) : null),
    [detail, rows],
  );
  const markerDetail = useMemo(
    () => (detail?.type === 'marker' ? allMarkerSeries.find(x => x.key === detail.key) || null : null),
    [detail, allMarkerSeries],
  );
  // A test that was deleted (or a marker renamed away) closes back to the journal.
  useEffect(() => {
    if (loading || !detail) return;
    if ((detail.type === 'report' && !reportDetail) || (detail.type === 'marker' && !markerDetail)) setDetail(null);
  }, [loading, detail, reportDetail, markerDetail]);
  function openReport(key) { setTagDraft(''); setDetail({ type: 'report', key }); }
  function openMarker(key) { setDetail({ type: 'marker', key }); }

  // S-26 book layout (BK-6): on an unfolded foldable the journal is the left page and the
  // tapped test, marker or Dose accumulation opens on the right page. One column (phone,
  // folded) is exactly the hub → journal → detail flow above (BK-2).
  const book = useBook();
  const newestKey = useMemo(() => newestReportKey(rows), [rows]);
  const { sel, explicit, select } = useBookSelection('Body', defaultSelection('Body', { newestReportKey: newestKey }));
  const reportKeys = useMemo(() => new Set(reportCards(rows).map(c => c.key)), [rows]);
  const markerKeys = useMemo(() => new Set(allMarkerSeries.map(x => x.key)), [allMarkerSeries]);
  const vaxKeys = useMemo(() => new Set(vaccineList.map(v => String(v.id))), [vaccineList]);
  const rightPage = book ? bodyRightPage({ sel, reportKeys, markerKeys, vaxKeys, premium, newestKey }) : null;
  const bookReport = rightPage?.type === 'report' ? buildReport(rows, rightPage.key) : null;
  const bookMarker = rightPage?.type === 'marker' ? allMarkerSeries.find(x => x.key === rightPage.key) || null : null;
  const bookVaccine = rightPage?.type === 'vaccine' ? vaccineList.find(v => String(v.id) === rightPage.key) || null : null;
  function selectReport(key) { if (key !== rightPage?.id) setTagDraft(''); select(key); }
  function selectMarker(key) { select('marker:' + key); }
  // BK-18: a vaccine tapped on the left page opens its read page on the right.
  function selectVaccine(v) { select('vax:' + v.id); }
  // VaccinesSection hands over every fresh list (after an add, edit, delete or sync), so the
  // book's right page shows the saved values (a deleted vaccine falls back) and the hub card,
  // the Export button and the export sheet always count the vaccines that exist.
  const selRef = useRef(sel);
  selRef.current = sel;
  const onVaxList = useCallback((list) => {
    setVaccineList(list);
    if (staleVaccineSel(selRef.current, list)) clearSelection('Body');
  }, []);
  // The right page's Edit opens today's add/edit sheet, in the left page's VaccinesSection.
  const vaxControl = useRef(null);
  function editVaccine(v) { if (vaxControl.current) vaxControl.current.openEdit(v); }

  // BK-10: an open add/edit vaccine sheet is carried over a fold/unfold (VaccinesSection
  // keeps its typed values in this ref while it is re-mounted on the other layout).
  const vaxDraft = useRef(null);
  const [vaxSheetOpen, setVaxSheetOpen] = useState(false);

  // BK-10: folding shows the item the user chose as the phone's detail ("‹ back"); unfolding
  // with a detail open selects it on the right page. Nothing typed is lost: every sheet of
  // this screen lives in BodyScreen's own state, outside the layout branch.
  const wasBook = useRef(book);
  useEffect(() => {
    if (wasBook.current === book) return;
    wasBook.current = book;
    if (!book) {
      const plan = bodyFoldPlan({ sel, explicit, vaxSheetOpen });
      if (!plan) return;
      setSection(plan.section);
      setDetail(plan.detail);
      if (plan.push) navigation.navigate(plan.push);
    } else {
      const next = bodyUnfoldSel({ section, detail });
      if (next) select(next);
    }
  }, [book]); // eslint-disable-line react-hooks/exhaustive-deps

  const UPGRADE_FEATURES = [
    t('blood_upgrade_feat_1'),
    t('blood_upgrade_feat_2'),
    t('blood_upgrade_feat_3'),
    t('blood_upgrade_feat_4'),
    t('blood_upgrade_feat_5'),
  ];

  useFocusEffect(
    useCallback(() => {
      Analytics.viewed('body');
      fetchReports();
    }, [])
  );

  async function fetchReports() {
    const pro = await hasPremium();
    setPremium(pro);
    const user = await getCachedUser();
    if (!user) { setLoading(false); return; }
    const favs = user.user_metadata?.favorite_markers;
    setFavorites(Array.isArray(favs) ? favs : []);
    const tags = user.user_metadata?.report_tags;
    setReportTags(tags && typeof tags === 'object' ? tags : {});
    const data = getBiomarkers(user.id);
    setRows(data || []);
    setVaccineList(getVaccines(user.id) || []);
    setLoading(false);
    // MB-4: the same compound and number as Journey — the first compound the user left
    // selected on the Curve (lib/curveView), else the first charted; Premium only.
    if (!pro) { setLevel(null); return; }
    try {
      const savedView = await loadCurveView(user.id);
      setLevel(defaultCurveLevel(getActiveProtocols(user.id), Date.now(), undefined, savedView));
    } catch { setLevel(null); }
  }

  // Distinct markers available to include in an export (canonical-merged).
  const exportMarkers = useMemo(() => buildMarkerSeries(rows), [rows]);

  // Favorite markers live in Supabase user_metadata (per-user, multi-device).
  // Update optimistically; the write is fire-and-forget.
  function toggleFavorite(marker) {
    setFavorites(prev => {
      const next = prev.includes(marker)
        ? prev.filter(m => m !== marker)
        : [...prev, marker];
      supabase.auth.updateUser({ data: { favorite_markers: next } }).catch(() => {});
      return next;
    });
  }

  // Per-test labels ("baseline", "week 8", …). The user's own categorization,
  // stored per-user in user_metadata keyed by report date. Never interpreted.
  function saveReportTags(next) {
    setReportTags(next);
    supabase.auth.updateUser({ data: { report_tags: next } }).catch(() => {});
  }
  function addReportTag(date) {
    const tag = tagDraft.trim();
    if (!tag) return;
    const cur = reportTags[date] || [];
    if (!cur.some(x => x.toLowerCase() === tag.toLowerCase())) {
      saveReportTags({ ...reportTags, [date]: [...cur, tag] });
    }
    setTagDraft('');
  }
  function removeReportTag(date, tag) {
    const nextTags = (reportTags[date] || []).filter(x => x !== tag);
    const next = { ...reportTags };
    if (nextTags.length) next[date] = nextTags; else delete next[date];
    saveReportTags(next);
  }

  // A DoseTrace sheet with OK (MB-12, MB-13). One that follows the camera / photo library
  // waits for it to close (iOS presents nothing while another view is still animating out).
  function notice(cfg, afterPicker) {
    const withOk = { ...cfg, icon: cfg.icon === undefined ? 'warning' : cfg.icon, buttons: [{ label: t('ok'), kind: 'primary' }] };
    if (afterPicker) setTimeout(() => setSheet(withOk), 450);
    else setSheet(withOk);
  }

  // Founder decision A (2026-10-03): every account — free or Premium — uploads into the ONE
  // monthly scan budget the server keeps (labs, vaccine cards and vials combined: 3 free,
  // 20 Premium; supabase/functions/extract-bloodwork). The app adds no gate of its own; a
  // refused scan shows the server's limit (A-60). (Until then a free user was stopped after
  // one upload per device, with 2 of the 3 monthly scans unused.)
  async function handleUploadPress() {
    chooseSource();
  }

  // Let the user snap a photo, pick an image, or choose a PDF. Any lab, any
  // language — extraction handles all of them. Consent gate first: the file
  // goes to a third-party AI service, and Apple 5.1.1(i)/5.1.2(i) requires
  // explicit permission before anything is sent. Asked in the DoseTrace sheet with the one
  // shared consent key (MB-12); the policy link opens the page and keeps the flow cancelled.
  async function chooseSource() {
    if (!(await hasAIConsent())) {
      setSheet({
        icon: 'ai_spark',
        title: t('ai_consent_title'),
        body: t('ai_consent_body'),
        link: { label: t('ai_consent_privacy'), onPress: () => Linking.openURL(AI_PRIVACY_URL).catch(() => {}) },
        buttons: [
          { label: t('cancel'), kind: 'secondary' },
          { label: t('ai_consent_agree'), kind: 'primary', onPress: async () => { await grantAIConsent(); openSourceChoice(); } },
        ],
      });
      return;
    }
    openSourceChoice();
  }
  function openSourceChoice() {
    setSourceChoice({
      heading: t('blood_upload_choose_title'),
      title: t('blood_upload_choose_sub'),
      options: [
        { label: t('blood_source_camera'), onPress: () => pickImageAndExtract(true) },
        { label: t('blood_source_photo'), onPress: () => pickImageAndExtract(false) },
        { label: t('blood_source_pdf'), onPress: () => pickAndExtract() },
      ],
      cancelLabel: t('cancel'),
    });
  }

  async function pickImageAndExtract(fromCamera) {
    // Confirm the native module exists BEFORE requiring expo-image-picker,
    // whose top-level requireNativeModule('ExponentImagePicker') would otherwise
    // throw in a build that lacks it. PDF/photo upload still works via other paths.
    if (!hasNativeModule('ExponentImagePicker')) { notice(scanErrorSheet('build', t)); return; }
    const ImagePicker = require('expo-image-picker');
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { notice(scanErrorSheet('camera', t), true); return; }
      }
      const opts = { mediaTypes: ['images'], quality: 0.6, base64: true };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled) return;

      const asset = result.assets[0];
      const base64 = asset?.base64;
      if (!base64) { notice(scanErrorSheet('read', t), true); return; }
      if (base64.length > MAX_FILE_BYTES * 1.4) { notice(scanErrorSheet('big', t), true); return; }
      const mediaType = asset.mimeType
        || (String(asset.uri || '').toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');

      setUploading(true);
      await extractWithClaude(base64, { image: true, mediaType });
    } catch (err) {
      setUploading(false);
      if (__DEV__) console.warn('[bloodwork] pickImageAndExtract failed:', err);
      notice(scanErrorSheet('read', t), true);
    }
  }

  async function pickAndExtract() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];

      // Pre-check file size BEFORE reading the whole file into memory.
      let fileSize = typeof file.size === 'number' ? file.size : null;
      if (fileSize == null) {
        try {
          const info = await FileSystem.getInfoAsync(file.uri, { size: true });
          if (info.exists && typeof info.size === 'number') fileSize = info.size;
        } catch {
          // size unknown — the edge function still enforces its own cap
        }
      }
      if (fileSize != null && fileSize > MAX_FILE_BYTES) {
        notice(scanErrorSheet('big', t), true);
        return;
      }

      setUploading(true);
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await extractWithClaude(base64);
    } catch (err) {
      setUploading(false);
      if (__DEV__) console.warn('[bloodwork] pickAndExtract failed:', err);
      notice(scanErrorSheet('read', t), true);
    }
  }

  async function extractWithClaude(base64, opts) {
    try {
      const user = await getCachedUser();
      if (!user) {
        setUploading(false);
        notice(scanErrorSheet('signin', t));
        return;
      }

      // The Anthropic API key lives only in the extract-bloodwork edge
      // function; the app never talks to api.anthropic.com directly.
      const reqBody = opts?.image
        ? { image_base64: base64, media_type: opts.mediaType, lang: language }
        : { pdf_base64: base64, lang: language };
      const { data, error } = await supabase.functions.invoke('extract-bloodwork', {
        body: reqBody,
      });

      if (error) {
        setUploading(false);
        // The edge function tags failures with a `code`: a service-side failure (Anthropic
        // down, key/credit) is never blamed on the user's PDF; the monthly limit names the
        // limit the server sends (A-60).
        const status = error.context?.status;
        let errBody = null;
        try { errBody = await error.context?.clone?.().json(); } catch { /* body unavailable */ }
        notice(scanErrorSheet(scanErrorKind({ code: errBody?.code ?? null, status }), t, { what: 'lab', errBody }));
        return;
      }

      const { markers, reportDate: parsedDate, droppedCount, dateFallback } = validateExtraction(data);

      if (markers.length === 0) {
        setUploading(false);
        notice(scanErrorSheet('unread', t));
        return;
      }

      setUploading(false);

      // Auto-save everything the AI read — no marker-by-marker approval. The
      // user curates later via the per-marker editor. Dates come from the
      // document; a fallback (today) is surfaced so it can be corrected.
      const saved = await persistMarkers(markers, parsedDate);
      if (saved === 0) {
        notice(scanErrorSheet('unread', t));
        return;
      }
      const lines = [
        t(pluralKey('blood_imported_body', saved, language)).replace('{count}', String(saved)).replace('{date}', formatDate(parsedDate)),
      ];
      if (dateFallback) lines.push(t('blood_imported_date_fallback'));
      if (droppedCount > 0) lines.push(`${droppedCount} ${t('blood_dropped_sub')}`);
      lines.push(t('blood_imported_hint'));
      notice({ icon: null, title: t('blood_imported_title'), body: lines.join('\n\n') });
    } catch (err) {
      setUploading(false);
      notice(scanErrorSheet('unread', t));
    }
  }

  // Insert extracted markers straight into storage (no review gate). Returns the
  // number of rows saved. Coerces values to numbers; drops rows with no name or
  // no numeric value.
  async function persistMarkers(markers, date) {
    const user = await getCachedUser();
    if (!user) { notice(scanErrorSheet('signin', t)); return 0; }
    const rows = markers
      .map(m => ({
        user_id: user.id,
        report_date: date,
        marker: String(m.marker || '').trim(),
        value: parseMeasure(m.value, language),
        unit: String(m.unit || '').trim(),
      }))
      .filter(r => r.marker && Number.isFinite(r.value));
    if (rows.length === 0) return 0;

    insertBiomarkers(rows);
    Analytics.bloodworkUploaded({ biomarkerCount: rows.length });
    fetchReports();
    requestSync();
    return rows.length;
  }

  // Open the marker editor for a stored row (from either view). `obj` carries
  // the biomarker id plus its current marker/value/unit/date.
  function openMarkerEdit(obj) {
    setMEdit(obj);
    setMName(obj.marker || '');
    setMValue(obj.value != null ? inputNumber(obj.value, language) : ''); // "5,2" in pt; saved back through the comma-aware parse
    setMUnit(obj.unit || '');
    setMDate(obj.date || obj.report_date || '');
    setMDateWheel(false);
    setValueSheet(null);
  }
  function closeMarkerEdit() {
    setMDateWheel(false);
    setMEdit(null);
  }
  function saveMarkerEdit() {
    if (!mEdit) return;
    const value = parseMeasure(mValue, language); // lab values: in English a comma stays the decimal ("1,025")
    if (!mName.trim() || !Number.isFinite(value)) {
      setValueSheet({ icon: 'warning', title: t('error'), body: t('blood_edit_invalid'), buttons: [{ label: t('ok'), kind: 'primary' }] });
      return;
    }
    updateBiomarker(mEdit.id, { marker: mName.trim(), value, unit: mUnit.trim(), report_date: mDate });
    requestSync();
    setMEdit(null);
    fetchReports();
  }
  // MB-18 (bug): Delete this value asks first; only the question's Delete writes the synced
  // tombstone (deleteBiomarker → sync_status 'deleted'). The question names the value as it
  // is stored (its marker and test date), not what was typed since.
  function askDeleteValue() {
    if (!mEdit) return;
    const id = mEdit.id;
    const copy = deleteValueCopy(t, mEdit.marker, formatDate(mEdit.date || mEdit.report_date));
    setValueSheet({
      title: copy.title,
      body: copy.body,
      buttons: [
        { label: t('cancel'), kind: 'secondary' },
        { label: t('blood_report_delete_confirm'), kind: 'danger', onPress: () => deleteValueNow(id) },
      ],
    });
  }
  function deleteValueNow(id) {
    deleteBiomarker(id);
    requestSync();
    setMEdit(null);
    fetchReports();
  }

  // Delete a whole uploaded blood-test report (a mistaken or duplicate upload) so
  // the user can re-upload. Scoped to the upload instance (date + created_at), so
  // a second report on the same date is untouched. The confirm count is the TRUE
  // instance size from `rows` (not the search-filtered on-screen markers).
  // A-101d: a card can hold several batches (markers typed one at a time): Delete removes them all.
  function deleteReport(card) {
    const { date } = card;
    const count = card.markers.length;
    setSheet({
      title: t('blood_report_delete'),
      body: `${formatDate(date)} · ${count} ${t(pluralKey('blood_markers', count, language))}\n\n${t('blood_report_delete_msg')}`,
      buttons: [
        { label: t('cancel'), kind: 'secondary' },
        {
          label: t('blood_report_delete_confirm'),
          kind: 'danger',
          onPress: async () => {
            const user = await getCachedUser();
            if (!user) return;
            for (const c of card.batches) deleteBiomarkerReport(user.id, card.date, c);
            // Clear this date's tags ONLY if no report remains for the date
            // (another same-date upload keeps its labels).
            const remains = (getBiomarkers(user.id) || []).some(r => r.report_date === date);
            if (!remains && reportTags[date]) {
              const next = { ...reportTags };
              delete next[date];
              saveReportTags(next);
            }
            requestSync();
            setDetail(null);
            // Book layout: the right page goes back to the newest test.
            if (sel === card.key) clearSelection('Body');
            fetchReports();
          },
        },
      ],
    });
  }

  // Open the export picker with everything preselected — the user then chooses
  // which markers and vaccines actually go in the report.
  function handleExport() {
    setSelMarkers(new Set(exportMarkers.map(m => m.key)));
    setSelVaccines(new Set(vaccineList.map(v => v.id)));
    setExportSheet(null);
    setExportModalOpen(true);
  }
  function toggleSel(setFn, value) {
    setFn(prev => { const n = new Set(prev); n.has(value) ? n.delete(value) : n.add(value); return n; });
  }

  async function doExport(kind) {
    // Robust gate: PDF is Premium-only, enforced at the action point with a
    // fresh hasPremium() check — the file is never generated for a free user,
    // even if this is reached by dismissing a dialog. CSV stays free. The question shows
    // over the export sheet: Cancel first, Go Premium second (MB-19).
    if (kind === 'pdf' && !(await hasPremium())) {
      setExportSheet({
        title: t('export_premium_title'),
        body: t('export_premium_sub'),
        buttons: [
          { label: t('cancel'), kind: 'secondary' },
          { label: t('vax_premium_cta'), kind: 'primary', onPress: () => { setExportModalOpen(false); setTimeout(() => navigation.navigate('Paywall', { source: 'export_pdf' }), 300); } },
        ],
      });
      return;
    }
    setExportModalOpen(false);
    setExporting(true);
    try {
      const user = await getCachedUser();
      if (!user) { setExporting(false); return; }
      const data = getAllDataForExport(user.id);
      const selection = { selectedMarkers: selMarkers, selectedVaccineIds: selVaccines, formatDate };
      const labels = {
        labsHeading: t('export_labs'), vaccinesHeading: t('body_section_vaccines'),
        colDate: t('export_col_date'), colMarker: t('export_col_marker'),
        colValue: t('export_col_value'), colUnit: t('export_col_unit'),
        colVaccine: t('vax_name_label'), colGiven: t('vax_date_given'),
        colNextDue: t('vax_next_due'), colNotes: t('vax_notes'),
        noLabs: t('export_no_labs'), noVaccines: t('export_no_vaccines'),
      };
      const dateStr = localeDate(new Date(), language, 'long');
      const Sharing = require('expo-sharing');
      let uri, mime;

      if (kind === 'csv') {
        const csv = buildRecordsCSV(data, { labels, ...selection });
        uri = FileSystem.documentDirectory + 'dosetrace_records.csv';
        await FileSystem.writeAsStringAsync(uri, csv);
        mime = 'text/csv';
      } else {
        const html = buildRecordsHTML(data, {
          labels,
          title: t('export_title'),
          exportedOn: `${t('export_exported_prefix')} ${dateStr}`,
          disclaimer: t('export_disclaimer'),
          ...selection,
        });
        // Confirm the native module exists BEFORE requiring expo-print, whose
        // top-level requireNativeModule('ExpoPrint') would otherwise throw.
        if (!hasNativeModule('ExpoPrint')) { setExporting(false); notice(scanErrorSheet('build', t)); return; }
        const Print = require('expo-print');
        const res = await Print.printToFileAsync({ html });
        uri = res.uri;
        mime = 'application/pdf';
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: t('export_records') });
      }
    } catch (e) {
      notice({ title: t('error'), body: t('export_error') }, true);
    }
    setExporting(false);
  }

  // "October 19, 2026" / "19 de outubro de 2026": the app language (lib/localeFormat).
  function formatDate(dateStr) {
    return localeDate(String(dateStr).slice(0, 10), language, 'long') || String(dateStr);
  }

  // One per upload, the same key as the journal's date cards (A-74).
  const testCount = new Set(rows.map(r => r.report_date + '|' + (r.created_at || ''))).size;
  // MB-2 / MB-3: the starred markers' latest values and the nearest next-due date.
  const labHub = useMemo(() => labHubSummary(rows, favorites), [rows, favorites]);
  const nextDue = nextDueVaccine(vaccineList, todayLocal());
  const canExportLabs = exportVisible('labs', { tests: testCount, vaccines: vaccineList.length });
  const canExportVax = exportVisible('vaccines', { tests: testCount, vaccines: vaccineList.length });
  // The level line names the compound as the Curve names its line (a blend component:
  // "Blend · Component (est.)"), as Journey does.
  const lp = level ? level.protocol : null;
  const levelName = !lp ? null
    : lp.__blend ? `${t(lp.__blend)} · ${t(lp.compound_id)} ${t('blend_est_marker')}`
      : (lp.compound_id ? t(lp.compound_id) : lp.name);

  function openSection(key) {
    Analytics.viewed({ labs: 'labs', vaccines: 'vaccines' }[key] || key);
    setSection(key);
  }

  // Dose accumulation (educational estimate, Premium-only). Phone: the Curve is pushed, as
  // today. Book: the Curve opens on the right page (BK-6). Free users get the preview sheet
  // (an Example curve), then the full-screen Paywall (BK-11).
  function openDoseAccumulation() {
    Analytics.viewed('serum_curve');
    if (premium) {
      if (book) { select('curve'); return; }
      navigation.navigate('SerumCurve');
      return;
    }
    // Free: show the value first (an Example curve) before the paywall.
    Analytics.previewSheetViewed('serum_curve');
    setShowSerumPreview(true);
  }

  // MB-1 / MB-2: the Lab test journal hero card (prototype bodyHub B3).
  function renderLabCard() {
    return (
      <TouchableOpacity style={s.hero} activeOpacity={0.7} onPress={() => openSection('labs')} accessibilityRole="button">
        <View style={s.heroTop}>
          <FeatureIcon name="lab_frame" size={24} color={colors.ink} />
          <Text style={[s.title, s.grow]}>{t('body_card_labs_title')}</Text>
          <Chevron color={colors.tick} />
        </View>
        {testCount > 0 ? (
          <>
            <View style={s.countRow}>
              <Text style={s.count}>{testCount}</Text>
              <Text style={s.countLabel}>{testCount === 1 ? t('body_stat_test') : t('body_stat_tests')}</Text>
            </View>
            {labHub.starred.length > 0 && (
              <>
                <View style={s.names}>
                  {labHub.starred.map(m => (
                    <View key={m.key} style={s.starRow}>
                      <StarGlyph color={colors.ink2} size={16} />
                      <Text style={[s.body, s.grow]} numberOfLines={1}>{m.marker}</Text>
                      <Text style={s.value}>{decimalText(m.value, language)}{m.unit ? ` ${m.unit}` : ''}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[s.foot, s.tnum]}>{t('body_starred_latest').replace('{date}', localeDate(labHub.latestDate, language, 'dayMonthAuto'))}</Text>
              </>
            )}
          </>
        ) : (
          <Text style={s.bodyMuted}>{t('body_stat_none')}</Text>
        )}
        <Text style={s.sec}>{t('body_card_labs_desc')}</Text>
      </TouchableOpacity>
    );
  }

  // MB-1 / MB-3: the Vaccine journal hero card (prototype bodyHub B4). The next-due date is
  // the one the user typed — never a schedule or advice.
  function renderVaxCard() {
    const n = vaccineList.length;
    return (
      <TouchableOpacity style={s.hero} activeOpacity={0.7} onPress={() => openSection('vaccines')} accessibilityRole="button">
        <View style={s.heroTop}>
          <FeatureIcon name="syringe_tilt" size={24} color={colors.ink} />
          <Text style={[s.title, s.grow]}>{t('body_card_vax_title')}</Text>
          <Chevron color={colors.tick} />
        </View>
        {n > 0 ? (
          <>
            <View style={s.countRow}>
              <Text style={s.count}>{n}</Text>
              <Text style={s.countLabel}>{n === 1 ? t('body_stat_vaccine') : t('body_stat_vaccines')}</Text>
            </View>
            {nextDue ? (
              <View style={s.dueRow}>
                <FeatureIcon name="calendar" size={16} color={colors.ink2} />
                <Text style={[s.body, s.grow, s.tnum]}>
                  {t('body_next_due').replace('{name}', nextDue.name).replace('{date}', localeDate(nextDue.due, language, 'dayMonthAuto'))}
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <Text style={s.bodyMuted}>{t('body_stat_none')}</Text>
        )}
        <Text style={s.sec}>{t('body_card_vax_desc')}</Text>
      </TouchableOpacity>
    );
  }

  // MB-4: the Dose accumulation card. `selected`: the book's left page outlines the open item
  // in ink (BK-8).
  function renderDoseCard(selected) {
    return (
      <TouchableOpacity
        style={[s.card, selected && s.selCard]}
        activeOpacity={0.7}
        onPress={openDoseAccumulation}
        accessibilityRole="button"
        accessibilityState={book ? { selected: !!selected } : undefined}
      >
        <View style={s.doseTop}>
          <FeatureIcon name="curve_loose" size={22} color={colors.data} />
          <Text style={[s.title, s.grow]}>{t('body_card_dosing_title')}</Text>
          {premium ? (
            <Chevron color={colors.tick} />
          ) : (
            <>
              <View style={s.otag}><Text style={s.otagText}>{t('paywall_premium')}</Text></View>
              <FeatureIcon name="lock" size={18} color={colors.ink3} />
            </>
          )}
        </View>
        <Text style={s.sec}>{t('body_card_dosing_desc')}</Text>
        {premium && level ? (
          <View style={s.levelRow}>
            <View style={[s.levelName, s.grow]}>
              <View style={[s.dot, { backgroundColor: displayColor(level.protocol.color) || colors.data }]} />
              <Text style={[s.secInk, s.grow]} numberOfLines={2}>{levelName}</Text>
            </View>
            <View style={s.levelNum}>
              <Text style={s.cap}>{t('curve_current_level')}</Text>
              <View style={s.numRow}>
                <Text style={s.level}>{levelLabel(level.value, language)}</Text>
                <Text style={s.unitAfter}>{level.unit}</Text>
              </View>
            </View>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }

  // `inBook`: on the right page the date title is a header, the first thing the screen
  // reader reaches there (BK-21). The phone screen is unchanged.
  function renderReportDetail(reportDetail, inBook) {
    return (
      /* ONE TEST (prototype reportScreen): date as the title, its labels, every value
         (tap to edit), and deleting the whole upload. */
      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll} contentContainerStyle={[s.centered, s.scrollPad]} keyboardShouldPersistTaps="handled">
        <View style={s.titleBlock}>
          <Text style={s.screenTitle} accessibilityRole={inBook ? 'header' : undefined}>{formatDate(reportDetail.date)}</Text>
          <Text style={[s.sec, s.tnum]}>{reportDetail.markers.length} {t(pluralKey('blood_markers', reportDetail.markers.length, language))}</Text>
        </View>

        <View style={s.card}>
          <Text style={s.head}>{t('blood_tags_title')}</Text>
          {(reportTags[reportDetail.date] || []).length > 0 && (
            <View style={s.chips}>
              {(reportTags[reportDetail.date] || []).map((tg, k) => (
                <TouchableOpacity key={k} style={s.tagPill} onPress={() => removeReportTag(reportDetail.date, tg)} accessibilityRole="button">
                  <Text style={s.tagPillText}>{tg}</Text>
                  <CrossMark size={14} color={colors.ink} strokeWidth={1.8} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={s.tagInputRow}>
            <TextInput
              style={[s.input, s.grow]}
              placeholder={t('blood_tag_ph')}
              placeholderTextColor={colors.ink3}
              value={tagDraft}
              onChangeText={setTagDraft}
              onSubmitEditing={() => addReportTag(reportDetail.date)}
              returnKeyType="done"
              autoCapitalize="none"
            />
            <TouchableOpacity style={[s.btnO, s.btnSm]} onPress={() => addReportTag(reportDetail.date)}>
              <Text style={[s.btnOText, s.btnSmText]}>{t('blood_tag_add')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.list}>
          {reportDetail.markers.map((m, j) => (
            <TouchableOpacity key={m.id ?? j} style={[s.li, j > 0 && s.liLine]} onPress={() => openMarkerEdit(m)}>
              <Text style={[s.body, s.grow]}>{m.marker}</Text>
              <Text style={s.value}>{decimalText(m.value, language)} {m.unit}</Text>
              <PenGlyph color={colors.ink3} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={s.dangerBtn} onPress={() => deleteReport(reportDetail)}>
          <Text style={s.dangerText}>{t('blood_report_delete')}</Text>
        </TouchableOpacity>
        <Text style={[s.foot, s.padX]}>{t('blood_hub_disclaimer')}</Text>
      </ScrollView>
    );
  }

  function renderMarkerDetail(markerDetail, chartWidth, withStar) {
    const latestText = `${decimalText(markerDetail.latest.value, language)} ${markerDetail.unit}`;
    return (
      /* ONE MARKER (prototype markerScreen): the latest value as the number, the
         user's readings charted (no ranges, no good/bad colors), every reading. */
      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll} contentContainerStyle={[s.centered, s.scrollPad]}>
        <View style={s.titleBlock}>
          {withStar ? (
            /* Book right page: no nav row, so the favorite star sits beside the title. */
            <View style={s.titleRow}>
              <Text style={[s.screenTitle, s.grow]} accessibilityRole="header">{markerDetail.marker}</Text>
              <TouchableOpacity
                style={s.starBtnLg}
                onPress={() => toggleFavorite(markerDetail.marker)}
                accessibilityRole="button"
                accessibilityLabel={t('blood_favorites')}
                accessibilityState={{ selected: markerDetail.isFav }}
              >
                <StarGlyph color={markerDetail.isFav ? colors.ink : colors.ink2} filled={markerDetail.isFav} size={24} />
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={s.screenTitle}>{markerDetail.marker}</Text>
          )}
        </View>

        <View style={s.card}>
          {/* MB-16: "Latest · {date}" over a light 56 pt number with its unit attached. */}
          <Text style={[s.foot, s.tnum]}>{t('blood_latest_on').replace('{date}', formatDate(markerDetail.latest.date))}</Text>
          <View style={s.numRow} accessible accessibilityLabel={latestText}>
            <Text style={s.display}>{decimalText(markerDetail.latest.value, language)}</Text>
            {markerDetail.unit ? <Text style={s.unitAfter}>{markerDetail.unit}</Text> : null}
          </View>
          <Text style={[s.foot, s.tnum]}>
            {markerDetail.points.length} {markerDetail.points.length === 1 ? t('blood_reading') : t('blood_readings')}
          </Text>
          {markerDetail.points.length >= 2 ? (
            <MarkerChart points={markerDetail.points} unit={markerDetail.unit} language={language} width={chartWidth} />
          ) : (
            <Text style={s.sec}>{t('blood_need_more')}</Text>
          )}
        </View>

        <View style={s.list}>
          {markerDetail.points.slice().reverse().map((p, j) => (
            <TouchableOpacity key={p.id ?? j} style={[s.li, j > 0 && s.liLine]} onPress={() => openMarkerEdit(p)}>
              <Text style={[s.body, s.grow, s.tnum]}>{formatDate(p.date)}</Text>
              <Text style={s.value}>{decimalText(p.value, language)} {p.unit}</Text>
              <PenGlyph color={colors.ink3} />
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[s.foot, s.padX]}>{t('blood_hub_disclaimer')}</Text>
      </ScrollView>
    );
  }

  // The Lab test journal under its title: on the phone's journal screen, and on the book's
  // left page (`inBook`: a tap opens the right page and the open item has an ink outline).
  function renderJournalBody(inBook) {
    return (
      <>
        {uploading && (
          <View style={[s.card, s.rowCard]}>
            <ActivityIndicator size="small" color={colors.ink} />
            <Text style={[s.body, s.grow]}>{t('blood_uploading')}</Text>
          </View>
        )}

        {!premium && (
          <View style={s.card}>
            <Text style={s.head}>{t('blood_premium_badge')}</Text>
            <Text style={s.sec}>
              {/* Decision A: free users scan 3 times a month; the line says so until there are markers to chart. */}
              {markerSeries.length > 0
                ? t(pluralKey('blood_premium_markers', markerSeries.length, language)).replace('{n}', String(markerSeries.length))
                : t('blood_first_free')}
            </Text>
            <TouchableOpacity style={[s.btnP, s.btnSm, s.selfStart]} onPress={() => setShowUpgradeModal(true)}>
              <Text style={[s.btnPText, s.btnSmText]}>{t('blood_upgrade')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {rows.length === 0 && !loading && (
          <>
            <View style={[s.card, s.emptyCard]}>
              <FeatureIcon name="droplet" size={44} color={colors.ink3} />
              <Text style={[s.title, s.center]}>{t('blood_empty_title')}</Text>
              <Text style={[s.sec, s.center]}>{t('blood_empty_sub')}</Text>
              <TouchableOpacity style={[s.btnP, s.selfStretch]} onPress={handleUploadPress}>
                <Text style={s.btnPText}>{t('blood_upload_report')}</Text>
              </TouchableOpacity>
            </View>
            {!inBook && renderTips()}
          </>
        )}

        {rows.length > 0 && (
          <>
            <Text style={[s.foot, s.padX]}>{t('blood_hub_disclaimer')}</Text>

            <SegmentedBar
              items={[{ key: 'date', label: t('blood_view_by_date') }, { key: 'marker', label: t('blood_view_by_marker') }]}
              value={viewMode}
              onChange={setViewMode}
            />

            <View style={s.controlsRow}>
              <View style={s.searchWrap}>
                <View style={s.searchIcon} pointerEvents="none">
                  <FeatureIcon name="search" size={18} color={colors.ink3} />
                </View>
                <TextInput
                  style={[s.input, s.searchInput]}
                  placeholder={t('blood_search_ph')}
                  placeholderTextColor={colors.ink3}
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {viewMode === 'date' && (
                <TouchableOpacity style={s.pill} onPress={() => setNewestFirst(v => !v)}>
                  <Text style={s.pillText}>{newestFirst ? t('blood_sort_newest') : t('blood_sort_oldest')}</Text>
                </TouchableOpacity>
              )}
              {viewMode === 'marker' && (
                <TouchableOpacity
                  style={[s.pill, favOnly && s.pillOn]}
                  onPress={() => setFavOnly(v => !v)}
                  accessibilityLabel={t('blood_favorites')}
                  accessibilityState={{ selected: favOnly }}
                >
                  <StarGlyph color={favOnly ? colors.ink : colors.ink2} filled={favOnly} size={15} />
                  <Text style={[s.pillText, favOnly && s.pillTextOn]}>{t('blood_favorites')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {viewMode === 'date' && reports.length === 0 && (
              <Text style={[s.sec, s.padX]}>{t('blood_no_results')}</Text>
            )}
            {viewMode === 'marker' && markerSeries.length === 0 && (
              <Text style={[s.sec, s.padX]}>{t('blood_no_results')}</Text>
            )}

            {viewMode === 'date' && reports.map(({ key, date, markers }) => (
              <TouchableOpacity
                key={key}
                style={[s.card, inBook && rightPage?.type === 'report' && rightPage.key === key && s.selCard]}
                activeOpacity={0.7}
                onPress={() => (inBook ? selectReport(key) : openReport(key))}
                accessibilityState={inBook ? { selected: rightPage?.type === 'report' && rightPage.key === key } : undefined}
              >
                <View style={s.cardRow}>
                  <View style={[s.grow, s.col6]}>
                    <Text style={s.title}>{formatDate(date)}</Text>
                    <Text style={[s.sec, s.tnum]}>{markers.length} {t(pluralKey('blood_markers', markers.length, language))}</Text>
                    {(reportTags[date] || []).length > 0 && (
                      <View style={s.chips}>
                        {(reportTags[date] || []).map((tg, k) => (
                          <View key={k} style={s.otag}><Text style={s.otagText}>{tg}</Text></View>
                        ))}
                      </View>
                    )}
                  </View>
                  <Chevron color={colors.tick} />
                </View>
              </TouchableOpacity>
            ))}

            {viewMode === 'marker' && markerSeries.length > 0 && (
              <View style={s.list}>
                {markerSeries.map((mk, i) => (
                  <TouchableOpacity
                    key={mk.key}
                    style={[s.li, i > 0 && s.liLine, inBook && rightPage?.type === 'marker' && rightPage.key === mk.key && s.selLi]}
                    onPress={() => (inBook ? selectMarker(mk.key) : openMarker(mk.key))}
                    accessibilityState={inBook ? { selected: rightPage?.type === 'marker' && rightPage.key === mk.key } : undefined}
                  >
                    <TouchableOpacity
                      style={s.starBtn}
                      onPress={() => toggleFavorite(mk.marker)}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('blood_favorites')}
                      accessibilityState={{ selected: mk.isFav }}
                    >
                      <StarGlyph color={mk.isFav ? colors.ink : colors.ink3} filled={mk.isFav} size={20} />
                    </TouchableOpacity>
                    <View style={[s.grow, s.col2]}>
                      <Text style={s.head}>{mk.marker}</Text>
                      <Text style={[s.foot, s.tnum]}>
                        {mk.points.length} {mk.points.length === 1 ? t('blood_reading') : t('blood_readings')}
                      </Text>
                    </View>
                    <Text style={s.value}>{decimalText(mk.latest.value, language)} {mk.unit}</Text>
                    <Chevron color={colors.tick} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
      </>
    );
  }

  function renderTips() {
    return (
      <View style={s.card}>
        <Text style={s.head}>{t('blood_what_we_read')}</Text>
        <View style={s.names}>
          {[t('blood_tip_1'), t('blood_tip_2'), t('blood_tip_3'), t('blood_tip_4'), t('blood_tip_5')].map((tip, i) => (
            <View key={i} style={s.tipRow}>
              <View style={s.tipDot} />
              <Text style={[s.sec, s.grow]}>{tip}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // The Export text button (prototype B9): only when there is something to export (MB-9).
  function renderExportButton() {
    return (
      <TouchableOpacity style={s.txtBtn} onPress={handleExport} disabled={exporting} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} accessibilityRole="button">
        {exporting ? (
          <ActivityIndicator size="small" color={colors.ink} />
        ) : (
          <>
            <FeatureIcon name="arrow_up" size={16} color={colors.ink} />
            <Text style={s.txtBtnText}>{t('export_records')}</Text>
          </>
        )}
      </TouchableOpacity>
    );
  }

  // BOOK (S-26 BK-6): left page = the hub's title, the Lab test journal (+ Upload, Export,
  // By date / By marker, search, sort), the Vaccine journal and the Dose accumulation row;
  // right page = the open test, marker or the Curve. Each page scrolls on its own.
  function renderBookLeft() {
    return (
      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll} contentContainerStyle={[s.centered, s.scrollPad]} keyboardShouldPersistTaps="handled">
        <View style={s.bookHero}>
          <Text style={s.hubGreeting}>{t('tab_body')}</Text>
          <Text style={s.hubHeroSub}>{t('body_hub_subtitle')}</Text>
        </View>

        <View style={s.titleBlock}>
          <Text style={s.screenTitle}>{t('body_card_labs_title')}</Text>
        </View>
        <View style={s.bookActions}>
          <TouchableOpacity style={s.addBtn} onPress={handleUploadPress}>
            <Text style={s.addBtnText}>{t('blood_upload')}</Text>
          </TouchableOpacity>
          {canExportLabs && (
            <TouchableOpacity style={s.txtBtn} onPress={handleExport} disabled={exporting} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              {exporting ? (
                <ActivityIndicator size="small" color={colors.ink} />
              ) : (
                <>
                  <FeatureIcon name="arrow_up" size={16} color={colors.ink} />
                  <Text style={s.txtBtnText}>{t('export_records')}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
        {renderJournalBody(true)}

        <View style={s.bookSection}>
          <VaccinesSection
            inline
            draftRef={vaxDraft}
            onSheetChange={setVaxSheetOpen}
            onSelect={selectVaccine}
            selectedId={rightPage?.type === 'vaccine' ? rightPage.key : null}
            onListChange={onVaxList}
            controlRef={vaxControl}
          />
        </View>

        <View style={s.bookSection}>
          {renderDoseCard(rightPage?.type === 'curve')}
          <Text style={s.hubFootnote}>{t('body_hub_footnote')}</Text>
        </View>
      </ScrollView>
    );
  }

  function renderBookRight() {
    if (rightPage?.type === 'curve') return <SerumCurveScreen embedded />;
    if (bookVaccine) return <VaccinePage vaccine={bookVaccine} onEdit={() => editVaccine(bookVaccine)} />;
    if (bookReport) return renderReportDetail(bookReport, true);
    if (bookMarker) return renderMarkerDetail(bookMarker, bookChartWidth, true);
    if (loading || rows.length > 0) return null;
    // No test yet: the right page shows what the upload reads (the left page has the upload).
    return (
      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll} contentContainerStyle={[s.centered, s.scrollPad]}>
        {renderTips()}
      </ScrollView>
    );
  }

  const monthLabels = MONTHS_SHORT[language] || MONTHS_SHORT.en;
  const today = todayLocal();
  const nothingSelected = selMarkers.size + selVaccines.size === 0;

  return (
    <SafeAreaView style={s.container}>
      {book ? (
        <BookPanes left={renderBookLeft()} right={renderBookRight()} rightKey={rightPage ? rightPage.id : 'none'} />
      ) : section === null ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.centered}>
          <View style={s.hubHero}>
            <Text style={s.hubGreeting}>{t('tab_body')}</Text>
            <Text style={s.hubHeroSub}>{t('body_hub_subtitle')}</Text>
          </View>
          <View style={s.hubBody}>
            {renderLabCard()}
            {renderVaxCard()}
            {/* Dose-accumulation / serum-curve model (educational estimate). Premium-only. */}
            {renderDoseCard(false)}
            <Text style={s.hubFootnote}>{t('body_hub_footnote')}</Text>
          </View>
        </ScrollView>
      ) : (
      <>
      {/* Graduated nav row (prototype labsScreen / reportScreen / markerScreen): back
          link on the left; Export (text) + the one action, "+ Upload", on the right.
          The screen title is a large title in the scroll below. */}
      <View style={s.navRow}>
        <TouchableOpacity
          onPress={() => { if (detail) { setDetail(null); return; } setSection(null); fetchReports(); }}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
          style={s.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('back')}
        >
          <Chevron color={colors.ink} flip />
          <Text style={s.backText} numberOfLines={1}>{detail ? t('body_card_labs_title') : t('tab_body')}</Text>
        </TouchableOpacity>
        <View style={s.headerActions}>
          {!detail && ((section === 'labs' && canExportLabs) || (section === 'vaccines' && canExportVax)) && renderExportButton()}
          {!detail && section === 'labs' && (
            <TouchableOpacity style={s.addBtn} onPress={handleUploadPress}>
              <Text style={s.addBtnText}>{t('blood_upload')}</Text>
            </TouchableOpacity>
          )}
          {detail?.type === 'marker' && markerDetail && (
            <TouchableOpacity
              style={s.starBtnLg}
              onPress={() => toggleFavorite(markerDetail.marker)}
              accessibilityRole="button"
              accessibilityLabel={t('blood_favorites')}
              accessibilityState={{ selected: markerDetail.isFav }}
            >
              <StarGlyph color={markerDetail.isFav ? colors.ink : colors.ink2} filled={markerDetail.isFav} size={24} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {section === 'vaccines' ? (
        <VaccinesSection draftRef={vaxDraft} onSheetChange={setVaxSheetOpen} onListChange={onVaxList} />
      ) : detail?.type === 'report' && reportDetail ? (
        renderReportDetail(reportDetail)
      ) : detail?.type === 'marker' && markerDetail ? (
        renderMarkerDetail(markerDetail, CHART_WIDTH, false)
      ) : (
      /* LAB TEST JOURNAL (prototype labsScreen) */
      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll} contentContainerStyle={[s.centered, s.scrollPad]} keyboardShouldPersistTaps="handled">
        <View style={s.titleBlock}>
          <Text style={s.screenTitle}>{t('body_card_labs_title')}</Text>
        </View>

        {renderJournalBody(false)}
      </ScrollView>
      )}
      </>
      )}

      {/* Sheets render whatever section is showing (the Dose accumulation preview opens
          from the hub) and outside the book/phone branch, so a fold never drops one. */}

      {/* UPLOAD BLOODWORK (prototype upgradeHTML, S-24 copy): a bottom sheet that hugs it. */}
      <BottomSheet visible={showUpgradeModal} onClose={() => setShowUpgradeModal(false)}>
        <CloseBar title={t('blood_upload_modal_title')} onClose={() => setShowUpgradeModal(false)} closeLabel={t('cancel')} />
        <View style={s.upgradeHero}>
          <FeatureIcon name="droplet" size={44} color={colors.ink} />
          <Text style={[s.title, s.center]}>{t('blood_upgrade_title')}</Text>
          <Text style={[s.sec, s.center]}>{t('blood_upgrade_sub')}</Text>
        </View>
        <View style={s.names}>
          {UPGRADE_FEATURES.map((f, i) => (
            <View key={i} style={s.featRow}>
              <CheckMark size={20} color={colors.ink} strokeWidth={1.8} />
              <Text style={[s.body, s.grow]}>{f}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity
          style={[s.btnP, s.btnTall]}
          onPress={() => {
            setShowUpgradeModal(false);
            setTimeout(() => navigation.navigate('Paywall', { source: 'bloodwork_upload' }), 300);
          }}
        >
          <Text style={s.btnPText}>{t('blood_start_trial')}</Text>
          <Text style={s.btnPSub}>{t('blood_trial_sub')}</Text>
        </TouchableOpacity>
        <Text style={[s.foot, s.center]}>{t('blood_trial_badge')}</Text>
      </BottomSheet>

      {/* SEE YOUR COMPOUND BUILD UP (prototype spreviewHTML, part 2): the shared preview sheet
          — the Example curve before the paywall. Illustrative data only. */}
      <FeaturePreviewSheet
        featureKey={showSerumPreview ? 'serum' : null}
        onClose={() => setShowSerumPreview(false)}
        onUnlock={() => { setShowSerumPreview(false); setTimeout(() => navigation.navigate('Paywall', { source: 'serum_preview_sheet' }), 300); }}
      />

      {/* CHOOSE WHAT TO EXPORT (prototype exportSheet) */}
      <BottomSheet
        visible={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        footer={(
          <>
            <TouchableOpacity
              style={[s.btnO, s.grow, nothingSelected && s.btnBlocked]}
              disabled={nothingSelected}
              onPress={() => doExport('csv')}
            >
              <Text style={s.btnOText}>CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btnP, s.grow, nothingSelected && s.btnBlocked]}
              disabled={nothingSelected}
              onPress={() => doExport('pdf')}
            >
              <Text style={s.btnPText}>PDF</Text>
              {!premium && (
                <View style={s.onActTag}><Text style={s.onActTagText}>{t('export_premium_tag')}</Text></View>
              )}
            </TouchableOpacity>
          </>
        )}
      >
        <SheetBar title={t('export_pick_title')} cancelLabel={t('cancel')} onCancel={() => setExportModalOpen(false)} />
        <Text style={s.sec}>{t('export_pick_sub')}</Text>

        {exportMarkers.length > 0 && (
          <View>
            <View style={s.exportSecHead}>
              <Text style={s.head}>{t('export_labs')}</Text>
              <TouchableOpacity onPress={() => setSelMarkers(selMarkers.size === exportMarkers.length ? new Set() : new Set(exportMarkers.map(m => m.key)))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={s.linkText}>{selMarkers.size === exportMarkers.length ? t('export_none') : t('export_all')}</Text>
              </TouchableOpacity>
            </View>
            {exportMarkers.map((m, i) => (
              <TouchableOpacity
                key={m.key}
                style={[s.checkRow, i > 0 && s.liLine]}
                onPress={() => toggleSel(setSelMarkers, m.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selMarkers.has(m.key) }}
              >
                <View style={[s.checkbox, selMarkers.has(m.key) && s.checkboxOn]}>
                  {selMarkers.has(m.key) ? <CheckMark size={16} color={colors.onInk} /> : null}
                </View>
                <View style={[s.grow, s.col2]}>
                  <Text style={s.head}>{m.display}</Text>
                  <Text style={[s.foot, s.tnum]}>{m.points.length} {m.points.length === 1 ? t('blood_reading') : t('blood_readings')}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {vaccineList.length > 0 && (
          <View>
            <View style={s.exportSecHead}>
              <Text style={s.head}>{t('body_section_vaccines')}</Text>
              <TouchableOpacity onPress={() => setSelVaccines(selVaccines.size === vaccineList.length ? new Set() : new Set(vaccineList.map(v => v.id)))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={s.linkText}>{selVaccines.size === vaccineList.length ? t('export_none') : t('export_all')}</Text>
              </TouchableOpacity>
            </View>
            {vaccineList.map((v, i) => (
              <TouchableOpacity
                key={v.id}
                style={[s.checkRow, i > 0 && s.liLine]}
                onPress={() => toggleSel(setSelVaccines, v.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selVaccines.has(v.id) }}
              >
                <View style={[s.checkbox, selVaccines.has(v.id) && s.checkboxOn]}>
                  {selVaccines.has(v.id) ? <CheckMark size={16} color={colors.onInk} /> : null}
                </View>
                <View style={[s.grow, s.col2]}>
                  <Text style={s.head}>{v.name}</Text>
                  <Text style={[s.foot, s.tnum]}>{formatDate(v.date_given)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {exportMarkers.length === 0 && vaccineList.length === 0 && (
          <Text style={s.sec}>{t('export_nothing')}</Text>
        )}
        {/* "PDF export is Premium" shows over the sheet (Cancel keeps the choices). */}
        <DTSheet config={exportModalOpen ? exportSheet : null} onClose={() => setExportSheet(null)} />
      </BottomSheet>

      {/* EDIT / DELETE A STORED VALUE (prototype meditSheet) */}
      <BottomSheet visible={!!mEdit} onClose={closeMarkerEdit}>
        <SheetBar title={t('blood_edit_title')} cancelLabel={t('cancel')} onCancel={closeMarkerEdit} actionLabel={t('save')} onAction={saveMarkerEdit} />
        <View style={s.fld}>
          <Text style={s.fieldLabel}>{t('blood_edit_marker')}</Text>
          <TextInput style={s.input} value={mName} onChangeText={setMName} placeholderTextColor={colors.ink3} />
        </View>
        <View style={s.fieldGrid}>
          <View style={[s.fld, s.grow]}>
            <Text style={s.fieldLabel}>{t('blood_edit_value')}</Text>
            <TextInput style={s.input} value={mValue} onChangeText={setMValue} keyboardType="decimal-pad" placeholderTextColor={colors.ink3} />
          </View>
          <View style={[s.fld, s.grow]}>
            <Text style={s.fieldLabel}>{t('blood_edit_unit')}</Text>
            <TextInput style={s.input} value={mUnit} onChangeText={setMUnit} autoCapitalize="none" placeholderTextColor={colors.ink3} />
          </View>
        </View>
        <View style={s.fld}>
          <Text style={s.fieldLabel}>{t('blood_edit_date')}</Text>
          <TouchableOpacity style={s.dateBtn} onPress={() => setMDateWheel(true)} accessibilityRole="button">
            <Text style={[s.body, s.tnum]}>{mDate ? formatDate(mDate) : '—'}</Text>
            <FeatureIcon name="calendar" size={20} color={colors.ink2} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={s.dangerBtn} onPress={askDeleteValue} accessibilityRole="button">
          <Text style={s.dangerText}>{t('blood_edit_delete')}</Text>
        </TouchableOpacity>
        {/* The Test date wheel (prototype openDate): its own sheet, titled, with Done; never a
            future day. The field and the wheel share one local ISO day. */}
        <DTPickerSheet visible={!!mEdit && mDateWheel} title={t('blood_edit_date')} doneLabel={t('done')} onDone={() => setMDateWheel(false)}>
          <DTWheel
            columns={wheelColumns(mDate || today, new Date(), monthLabels, TEST_DATE_RANGE)}
            onChange={(col, i) => setMDate(wheelAfter(mDate || today, new Date(), col, i, { ...TEST_DATE_RANGE, max: today }))}
          />
        </DTPickerSheet>
        {/* Delete this value? / the invalid-value notice show over the sheet. */}
        <DTSheet config={mEdit ? valueSheet : null} onClose={() => setValueSheet(null)} />
      </BottomSheet>

      {/* The screen's DoseTrace sheets: permission, Add a lab report, results, errors, the
          delete-test question. Never the grey iOS alert (MB-25). */}
      <DTSheet config={sheet} onClose={() => setSheet(null)} />
      <DTActionSheet config={sourceChoice} onClose={() => setSourceChoice(null)} />

      {/* Part 18: the lab-journal explainer when the user first opens Lab results. */}
      {section === 'labs' && <FeatureExplainerGate candidates={labExplainers} />}
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  ...bodyGraduated(c),
  ...labsGraduated(c),
});

// Redesign (Graduated, My Body approved 2026-10-03, prototype bodyHub): large title on the
// ground; the Lab test and Vaccine journals as hero cards (radius 26, padding 20, 24-pt icon
// beside the title, a big light count, the description last); Dose accumulation as a card
// with the Est. level in data blue. No border, shadow or tint.
const bodyGraduated = (c) => ({
  container: { flex: 1, backgroundColor: c.ground },
  hubHero: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18, backgroundColor: c.ground },
  hubGreeting: { fontSize: 34, fontWeight: '700', color: c.ink, letterSpacing: -0.8 },
  hubHeroSub: { fontSize: 15, color: c.ink2, marginTop: 4 },
  hubBody: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 30, gap: 14 },
  hero: { backgroundColor: c.raised, borderRadius: 26, padding: 20, gap: 14 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  doseTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  count: { fontSize: 56, fontWeight: '300', color: c.ink, letterSpacing: -1.7, lineHeight: 60, fontVariant: ['tabular-nums'] },
  countLabel: { fontSize: 17, lineHeight: 22, color: c.ink2 },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  levelRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12 },
  levelName: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  levelNum: { alignItems: 'flex-end', gap: 2 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  numRow: { flexDirection: 'row', alignItems: 'baseline' },
  level: { fontSize: 34, fontWeight: '300', color: c.data, letterSpacing: -1, lineHeight: 38, fontVariant: ['tabular-nums'] },
  unitAfter: { fontFamily: MONO['400'], fontSize: 13, color: c.ink3, marginLeft: 3 },
  cap: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: c.ink2 },
  hubFootnote: { fontSize: 13, color: c.ink2, lineHeight: 18, paddingHorizontal: 4 },
});

// Redesign (Graduated, My Body parts 1-3 approved): Lab test journal (by date / by
// marker, search), one test, one marker with its chart, and every sheet. Prototype
// labsScreen / reportScreen / markerScreen / exportSheet / meditSheet / upgradeHTML.
// Theme tokens only (both palettes); no border, shadow or tint on cards;
// one ink action per element, secondary actions in well; selection = ink outline.
const labsGraduated = (c) => ({
  // nav row + large title
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 18, backgroundColor: c.ground, gap: 12 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, flexShrink: 1 },
  backText: { fontSize: 17, color: c.ink },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  txtBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 },
  txtBtnText: { fontSize: 17, fontWeight: '600', color: c.ink },
  addBtn: { backgroundColor: c.act, paddingHorizontal: 16, minHeight: 40, borderRadius: 20, justifyContent: 'center' },
  addBtnText: { color: c.onAct, fontSize: 15, fontWeight: '700' },
  starBtnLg: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // book layout (S-26): the left page's hero, actions and sections; the open item outlined
  // in ink, 2 pt (BK-8). Padding drops by the border so nothing shifts.
  bookHero: { paddingHorizontal: 4, paddingTop: 8, paddingBottom: 6 },
  bookActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14 },
  bookSection: { marginTop: 18 },
  selCard: { borderWidth: 2, borderColor: c.ink, padding: 16 },
  selLi: { borderWidth: 2, borderColor: c.ink, borderTopWidth: 2, borderTopColor: c.ink, borderRadius: 14, marginHorizontal: -10, paddingHorizontal: 8 },
  scroll: { flex: 1 },
  scrollPad: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 12 },
  titleBlock: { paddingHorizontal: 4, paddingBottom: 2, gap: 4 },
  screenTitle: { fontSize: 30, fontWeight: '700', color: c.ink, letterSpacing: -0.75, lineHeight: 36 },

  // type roles (DESIGN.md §3)
  title: { fontSize: 22, fontWeight: '700', color: c.ink, lineHeight: 28, letterSpacing: -0.2 },
  head: { fontSize: 17, fontWeight: '600', color: c.ink, lineHeight: 22 },
  body: { fontSize: 17, color: c.ink, lineHeight: 22 },
  bodyMuted: { fontSize: 17, color: c.ink2, lineHeight: 22 },
  sec: { fontSize: 15, color: c.ink2, lineHeight: 20 },
  secInk: { fontSize: 15, color: c.ink, lineHeight: 20 },
  foot: { fontSize: 13, color: c.ink2, lineHeight: 18 },
  value: { fontFamily: MONO['500'], fontSize: 15, color: c.ink, fontVariant: ['tabular-nums'] },
  // the marker's latest value (DESIGN.md big number: Geist 300)
  display: { fontSize: 56, fontWeight: '300', color: c.ink, letterSpacing: -1.7, lineHeight: 62, fontVariant: ['tabular-nums'] },
  tnum: { fontVariant: ['tabular-nums'] },
  center: { textAlign: 'center' },
  padX: { paddingHorizontal: 4 },
  grow: { flex: 1, minWidth: 0 },
  col2: { gap: 2 },
  col6: { gap: 6 },
  selfStart: { alignSelf: 'flex-start' },
  selfStretch: { alignSelf: 'stretch' },

  // cards, lists, tags
  card: { backgroundColor: c.raised, borderRadius: 24, padding: 18, gap: 12 },
  rowCard: { flexDirection: 'row', alignItems: 'center' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyCard: { alignItems: 'center', paddingTop: 28 },
  names: { gap: 8 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.ink3, marginTop: 7 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  otag: { minHeight: 24, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: c.line, justifyContent: 'center' },
  otagText: { fontSize: 12, fontWeight: '600', color: c.ink2 },
  list: { backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 16 },
  li: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  liLine: { borderTopWidth: 1, borderTopColor: c.line },
  starBtn: { width: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -6, marginRight: -4 },

  // controls on the ground: segmented, search, pills
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchWrap: { flex: 1, justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 14, zIndex: 1 },
  input: { backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, paddingVertical: 10, fontSize: 17, color: c.ink },
  searchInput: { minHeight: 46, paddingLeft: 42 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line },
  pillOn: { borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.raised },
  pillText: { fontSize: 13, color: c.ink2 },
  pillTextOn: { color: c.ink, fontWeight: '600' },
  tagPill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.raised },
  tagPillText: { fontSize: 13, fontWeight: '600', color: c.ink },
  tagInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // buttons: one ink capsule, secondary well, danger as text
  btnP: { minHeight: 52, borderRadius: 26, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, flexDirection: 'row', gap: 8 },
  btnPText: { fontSize: 17, fontWeight: '700', color: c.onAct, textAlign: 'center' },
  btnPSub: { fontSize: 12, fontWeight: '500', color: c.onAct, opacity: 0.8, textAlign: 'center' },
  btnO: { minHeight: 52, borderRadius: 26, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, flexDirection: 'row', gap: 8 },
  btnOText: { fontSize: 17, fontWeight: '700', color: c.ink, textAlign: 'center' },
  btnSm: { minHeight: 44, borderRadius: 22 },
  btnSmText: { fontSize: 15 },
  btnTall: { minHeight: 64, flexDirection: 'column', gap: 2, paddingVertical: 10 },
  btnBlocked: { opacity: 0.4 },
  dangerBtn: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  dangerText: { fontSize: 17, fontWeight: '600', color: c.risk, textAlign: 'center' },
  linkText: { fontSize: 13, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
  onActTag: { minHeight: 24, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: c.onAct, justifyContent: 'center' },
  onActTagText: { fontSize: 12, fontWeight: '600', color: c.onAct },

  // sheet content (the sheets themselves: screens/components/BodySheets.js)
  upgradeHero: { alignItems: 'center', gap: 10, paddingVertical: 6 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fld: { gap: 10 },
  fieldLabel: { fontSize: 13, lineHeight: 18, color: c.ink2, paddingHorizontal: 4 },
  fieldGrid: { flexDirection: 'row', gap: 12 },
  dateBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.well },
  exportSecHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 6, marginBottom: 2 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: c.tick, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: c.ink, borderColor: c.ink },
});
