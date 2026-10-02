import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getCachedUser } from '../lib/supabase';
import { hasPremium } from '../lib/entitlement';
import { quotaLimitFrom, fillQuotaMessage } from '../lib/scanQuotaMessage';
import { useLanguage } from '../i18n/LanguageContext';
import { Analytics } from '../lib/analytics';
import { getBiomarkers, insertBiomarkers, updateBiomarker, deleteBiomarker, deleteBiomarkerReport, getAllDataForExport, getVaccines } from '../lib/database';
import DateTimePicker from '@react-native-community/datetimepicker';
import { buildRecordsCSV, buildRecordsHTML, canonicalMarker, markerSeries as buildMarkerSeries } from '../lib/exportRecords';
import { hasNativeModule } from '../lib/nativeModule';
import { requestSync } from '../lib/sync';
import { requestAIConsent } from '../lib/aiConsent';
import { useTheme } from '../lib/theme';
import FeatureIcon from '../components/FeatureIcon';
import AccumulationHero from '../components/AccumulationHero';
import SegmentedBar from '../components/SegmentedBar';
import FeatureExplainerGate from '../components/FeatureExplainerGate';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { MONO } from '../lib/fonts';
import { friendlyError } from '../lib/friendlyError';
import Svg, { Path, Rect, Circle, Line, Polyline, G } from 'react-native-svg';
import MarkerChart from './components/MarkerChart';
import VaccinesSection from './components/VaccinesSection';
import VaccinePage from './components/VaccinePage';
import CheckMark, { CrossMark } from '../components/CheckMark';
import BookPanes, { useBook, useBookSelection } from '../components/BookPanes';
import { defaultSelection, paneWidths } from '../lib/bookLayout';
import { clearSelection } from '../lib/bookSelection';
import SerumCurveScreen from './SerumCurveScreen';

// Monochrome line glyphs for the My Body hub tiles — same 24×24 / ~1.9-stroke
// language as the tab-bar icons in App.js, replacing the old mismatched emoji.
function LabsGlyph({ color }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.5C12 3.5 5.5 11 5.5 15.5a6.5 6.5 0 0 0 13 0C18.5 11 12 3.5 12 3.5Z"
        stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
    </Svg>
  );
}
function VaccinesGlyph({ color }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <G transform="rotate(45 12 12)">
        <Rect x={9} y={5.5} width={6} height={10.5} rx={2} stroke={color} strokeWidth={1.9} />
        <Line x1={12} y1={16} x2={12} y2={20} stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        <Line x1={9} y1={5.5} x2={15} y2={5.5} stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        <Line x1={12} y1={3} x2={12} y2={5.5} stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        <Line x1={10.5} y1={9} x2={13.5} y2={9} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        <Line x1={10.5} y1={11.5} x2={13.5} y2={11.5} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      </G>
    </Svg>
  );
}
function AccumGlyph({ color }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M4 20V4" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M4 20h16" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Polyline points="4,17 8,10 12,12 16,7 20,9" stroke={color} strokeWidth={1.9}
        strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

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


// One free bloodwork analysis, then Premium required. Counts successful saves
// (not distinct report dates) so re-uploading the same date can't reopen the
// free slot.
const UPLOADS_KEY = 'dosetrace_bloodwork_uploads';
// Client-side pre-check: reject files over 10MB before reading into memory.
// The edge function enforces its own ~15MB base64 cap server-side.
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };

async function getUploadCount() {
  try {
    const raw = await AsyncStorage.getItem(UPLOADS_KEY);
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

async function incrementUploadCount() {
  const count = (await getUploadCount()) + 1;
  try {
    await AsyncStorage.setItem(UPLOADS_KEY, String(count));
  } catch {
    // best effort — never block a save on the counter
  }
  return count;
}

// Validate the edge function's extraction result before it reaches the UI/DB.
// Coerces numeric strings, drops non-numeric rows (counted), and falls back
// to today's date when report_date doesn't parse.
function validateExtraction(data) {
  const rawMarkers = Array.isArray(data?.markers) ? data.markers : [];
  const markers = [];
  let droppedCount = 0;
  for (const m of rawMarkers) {
    if (!m || typeof m.marker !== 'string' || !m.marker.trim()) {
      droppedCount++;
      continue;
    }
    let value = m.value;
    if (typeof value !== 'number') {
      value = parseFloat(String(value ?? '').replace(',', '.'));
    }
    if (!Number.isFinite(value)) {
      droppedCount++;
      continue;
    }
    markers.push({
      marker: m.marker.trim(),
      value,
      unit: typeof m.unit === 'string' ? m.unit : '',
    });
  }

  let reportDate = typeof data?.report_date === 'string' ? data.report_date.trim() : '';
  let dateFallback = false;
  const validShape = /^\d{4}-\d{2}-\d{2}$/.test(reportDate);
  if (!validShape || isNaN(new Date(reportDate + 'T12:00:00').getTime())) {
    reportDate = new Date().toISOString().split('T')[0];
    dateFallback = true;
  }

  return { markers, reportDate, droppedCount, dateFallback };
}

// S-26 book layout, My Body (docs/specs/book-layout.md BK-6, BK-10). Pure and self-contained
// so __tests__/bookBody.test.js can run them. Right-page ids: a lab test = its upload key
// (report_date + '|' + created_at, the same key as the journal cards), a marker =
// 'marker:' + its canonical key, a vaccine = 'vax:' + its id (BK-18), Dose accumulation = 'curve'.

// The newest test = the first card of the By date list, newest first (the default page).
function newestReportKey(rows) {
  let best = null;
  for (const r of rows || []) {
    const c = r.created_at || '';
    if (!best || r.report_date > best.d || (r.report_date === best.d && c > best.c)) best = { d: r.report_date, c };
  }
  return best ? best.d + '|' + best.c : null;
}

// Every value of one upload, from ALL rows (not the search-filtered list).
function buildReport(rows, key) {
  const markers = (rows || []).filter(r => r.report_date + '|' + (r.created_at || '') === key);
  if (!markers.length) return null;
  return { key, date: markers[0].report_date, createdAt: markers[0].created_at || '', markers };
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
  const { colors, isDark } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
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
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [extractedMarkers, setExtractedMarkers] = useState([]);
  const [reportDate, setReportDate] = useState('');
  const [premium, setPremium] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [dateWasFallback, setDateWasFallback] = useState(false);
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
  const [vaxCount, setVaxCount] = useState(0);
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
  const [mDatePicker, setMDatePicker] = useState(false);
  const [confirmDatePicker, setConfirmDatePicker] = useState(false);

  const locale = LOCALE_MAP[language] || 'en-US';
  const q = search.trim().toLowerCase();

  // Date view: reports grouped by UPLOAD INSTANCE (report_date + created_at), so a
  // duplicate or mistaken second upload on the same date shows as its own card and
  // can be deleted on its own without touching the other. Each filtered by the
  // marker search, sorted by the chosen order. Reports with no matching marker are
  // dropped. `key` is the stable instance id used for expand + delete.
  const reports = useMemo(() => {
    const grouped = {};
    for (const row of rows) {
      if (q && !row.marker.toLowerCase().includes(q)) continue;
      const createdAt = row.created_at || '';
      const key = row.report_date + '|' + createdAt;
      (grouped[key] ||= { key, date: row.report_date, createdAt, markers: [] }).markers.push(row);
    }
    const entries = Object.values(grouped);
    entries.sort((a, b) => {
      if (a.date !== b.date) return (a.date < b.date ? 1 : -1) * (newestFirst ? 1 : -1);
      return (a.createdAt < b.createdAt ? 1 : -1) * (newestFirst ? 1 : -1);
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
  const reportKeys = useMemo(() => new Set(rows.map(r => r.report_date + '|' + (r.created_at || ''))), [rows]);
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
  // The left page's VaccinesSection hands over every fresh list (after an add, edit, delete or
  // sync), so the right page shows the saved values and a deleted vaccine falls back.
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
    setPremium(await hasPremium());
    setUploadCount(await getUploadCount());
    const user = await getCachedUser();
    if (!user) { setLoading(false); return; }
    const favs = user.user_metadata?.favorite_markers;
    setFavorites(Array.isArray(favs) ? favs : []);
    const tags = user.user_metadata?.report_tags;
    setReportTags(tags && typeof tags === 'object' ? tags : {});
    const data = getBiomarkers(user.id);
    setRows(data || []);
    const vlist = getVaccines(user.id) || [];
    setVaccineList(vlist);
    setVaxCount(vlist.length);
    setLoading(false);
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

  async function handleUploadPress() {
    // Premium: unlimited. Everyone else gets ONE free analysis to try it, then
    // it's Premium-only (upsell → paywall + 7-day trial). No per-upload charge.
    if (await hasPremium()) {
      chooseSource();
      return;
    }
    const count = await getUploadCount();
    if (count < 1) {
      chooseSource();
      return;
    }
    setShowUpgradeModal(true);
  }

  // Let the user snap a photo, pick an image, or choose a PDF. Any lab, any
  // language — extraction handles all of them. Consent gate first: the file
  // goes to a third-party AI service, and Apple 5.1.1(i)/5.1.2(i) requires
  // explicit permission before anything is sent.
  async function chooseSource() {
    if (!(await requestAIConsent(t))) return;
    Alert.alert(t('blood_upload_choose_title'), t('blood_upload_choose_sub'), [
      { text: t('blood_source_camera'), onPress: () => pickImageAndExtract(true) },
      { text: t('blood_source_photo'), onPress: () => pickImageAndExtract(false) },
      { text: t('blood_source_pdf'), onPress: () => pickAndExtract() },
      { text: t('cancel'), style: 'cancel' },
    ]);
  }

  async function pickImageAndExtract(fromCamera) {
    // Confirm the native module exists BEFORE requiring expo-image-picker,
    // whose top-level requireNativeModule('ExponentImagePicker') would otherwise
    // throw in a build that lacks it. PDF/photo upload still works via other paths.
    if (!hasNativeModule('ExponentImagePicker')) { Alert.alert(t('error'), t('blood_needs_build')); return; }
    const ImagePicker = require('expo-image-picker');
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert(t('error'), t('blood_camera_denied')); return; }
      }
      const opts = { mediaTypes: ['images'], quality: 0.6, base64: true };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled) return;

      const asset = result.assets[0];
      const base64 = asset?.base64;
      if (!base64) { Alert.alert(t('error'), t('blood_error_read')); return; }
      if (base64.length > MAX_FILE_BYTES * 1.4) {
        Alert.alert(t('error'), t('blood_error_file_too_large'));
        return;
      }
      const mediaType = asset.mimeType
        || (String(asset.uri || '').toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');

      setUploading(true);
      await extractWithClaude(base64, { image: true, mediaType });
    } catch (err) {
      setUploading(false);
      if (__DEV__) console.warn('[bloodwork] pickImageAndExtract failed:', err);
      Alert.alert(t('error'), t('blood_error_read'));
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
        Alert.alert(t('error'), t('blood_error_file_too_large'));
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
      Alert.alert(t('error'), t('blood_error_read'));
    }
  }

  async function extractWithClaude(base64, opts) {
    try {
      const user = await getCachedUser();
      if (!user) {
        setUploading(false);
        Alert.alert(t('error'), t('blood_error_not_signed_in'));
        return;
      }

      // Robust gate: free tier gets ONE extraction. Re-check at the action
      // point (fresh premium + upload count) so the paid extraction never runs
      // for an over-limit free user, regardless of how this was reached.
      if (!(await hasPremium()) && (await getUploadCount()) >= 1) {
        setUploading(false);
        setShowUpgradeModal(true);
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
        const status = error.context?.status;
        // The edge function tags failures with a `code`. Distinguish a
        // service-side failure (Anthropic down, key/credit) from an actual
        // unreadable file, so we never blame the user's PDF for our outage.
        let code = null;
        let errBody = null;
        try { errBody = await error.context?.clone?.().json(); code = errBody?.code; } catch { /* body unavailable */ }
        const serviceDown = ['provider_error', 'not_configured', 'internal_error'].includes(code)
          || (code == null && [500, 502, 503].includes(status));
        if (code === 'quota_exceeded' || status === 429) {
          Alert.alert(t('vial_scan_quota_title'), fillQuotaMessage(t('vial_scan_quota_sub'), quotaLimitFrom(errBody)));
        } else if (status === 401) {
          Alert.alert(t('error'), t('blood_error_not_signed_in'));
        } else if (status === 413) {
          Alert.alert(t('error'), t('blood_error_file_too_large'));
        } else if (serviceDown) {
          Alert.alert(t('blood_error_service'), t('blood_error_service_sub'));
        } else {
          Alert.alert(t('blood_error_extract'), t('blood_error_extract_sub'));
        }
        return;
      }

      const { markers, reportDate: parsedDate, droppedCount, dateFallback } = validateExtraction(data);

      if (markers.length === 0) {
        setUploading(false);
        Alert.alert(t('blood_error_extract'), t('blood_error_extract_sub'));
        return;
      }

      setUploading(false);

      // Auto-save everything the AI read — no marker-by-marker approval. The
      // user curates later via the per-marker editor. Dates come from the
      // document; a fallback (today) is surfaced so it can be corrected.
      const saved = await persistMarkers(markers, parsedDate);
      if (saved === 0) {
        Alert.alert(t('blood_error_extract'), t('blood_error_extract_sub'));
        return;
      }
      const lines = [
        t('blood_imported_body').replace('{count}', String(saved)).replace('{date}', formatDate(parsedDate)),
      ];
      if (dateFallback) lines.push(t('blood_imported_date_fallback'));
      if (droppedCount > 0) lines.push(`${droppedCount} ${t('blood_dropped_sub')}`);
      lines.push(t('blood_imported_hint'));
      Alert.alert(t('blood_imported_title'), lines.join('\n\n'));
    } catch (err) {
      setUploading(false);
      Alert.alert(
        t('blood_error_extract'),
        t('blood_error_extract_sub')
      );
    }
  }

  // Inline edits in the review sheet before saving.
  function updateExtractedMarker(i, field, val) {
    setExtractedMarkers(prev => prev.map((m, idx) => (idx === i ? { ...m, [field]: val } : m)));
  }
  function removeExtractedMarker(i) {
    setExtractedMarkers(prev => prev.filter((_, idx) => idx !== i));
  }

  // Insert extracted markers straight into storage (no review gate). Returns the
  // number of rows saved. Coerces values to numbers; drops rows with no name or
  // no numeric value. Shared by the auto-save upload path.
  async function persistMarkers(markers, date) {
    const user = await getCachedUser();
    if (!user) { Alert.alert(t('error'), t('blood_error_not_signed_in')); return 0; }
    const rows = markers
      .map(m => ({
        user_id: user.id,
        report_date: date,
        marker: String(m.marker || '').trim(),
        value: parseFloat(String(m.value).replace(',', '.')),
        unit: String(m.unit || '').trim(),
      }))
      .filter(r => r.marker && Number.isFinite(r.value));
    if (rows.length === 0) return 0;

    insertBiomarkers(rows);
    const newCount = await incrementUploadCount();
    setUploadCount(newCount);
    Analytics.bloodworkUploaded({ biomarkerCount: rows.length });
    fetchReports();
    requestSync();
    return rows.length;
  }

  // Retained for the (now-unreachable) review sheet; delegates to persistMarkers.
  async function saveMarkers() {
    try {
      const saved = await persistMarkers(extractedMarkers, reportDate);
      if (saved === 0) { Alert.alert(t('error'), t('blood_edit_invalid')); return; }
      setShowConfirmModal(false);
      setExtractedMarkers([]);
      setDateWasFallback(false);
    } catch (err) {
      Alert.alert(t('error'), friendlyError(err, t, 'error_save_failed'));
    }
  }

  // Open the marker editor for a stored row (from either view). `obj` carries
  // the biomarker id plus its current marker/value/unit/date.
  function openMarkerEdit(obj) {
    setMEdit(obj);
    setMName(obj.marker || '');
    setMValue(obj.value != null ? String(obj.value) : '');
    setMUnit(obj.unit || '');
    setMDate(obj.date || obj.report_date || '');
    setMDatePicker(false);
  }
  function saveMarkerEdit() {
    if (!mEdit) return;
    const value = parseFloat(String(mValue).replace(',', '.'));
    if (!mName.trim() || !Number.isFinite(value)) {
      Alert.alert(t('error'), t('blood_edit_invalid'));
      return;
    }
    updateBiomarker(mEdit.id, { marker: mName.trim(), value, unit: mUnit.trim(), report_date: mDate });
    requestSync();
    setMEdit(null);
    fetchReports();
  }
  function deleteMarkerEdit() {
    if (!mEdit) return;
    deleteBiomarker(mEdit.id);
    requestSync();
    setMEdit(null);
    fetchReports();
  }

  // Delete a whole uploaded blood-test report (a mistaken or duplicate upload) so
  // the user can re-upload. Scoped to the upload instance (date + created_at), so
  // a second report on the same date is untouched. The confirm count is the TRUE
  // instance size from `rows` (not the search-filtered on-screen markers).
  function deleteReport(date, createdAt) {
    const count = rows.filter(r => r.report_date === date && (r.created_at || '') === createdAt).length;
    Alert.alert(
      t('blood_report_delete'),
      `${formatDate(date)} · ${count} ${t('blood_markers')}\n\n${t('blood_report_delete_msg')}`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('blood_report_delete_confirm'),
          style: 'destructive',
          onPress: async () => {
            const user = await getCachedUser();
            if (!user) return;
            deleteBiomarkerReport(user.id, date, createdAt);
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
            if (sel === date + '|' + createdAt) clearSelection('Body');
            fetchReports();
          },
        },
      ]
    );
  }

  // Open the export picker with everything preselected — the user then chooses
  // which markers and vaccines actually go in the report.
  function handleExport() {
    setSelMarkers(new Set(exportMarkers.map(m => m.key)));
    setSelVaccines(new Set(vaccineList.map(v => v.id)));
    setExportModalOpen(true);
  }
  function toggleSel(setFn, value) {
    setFn(prev => { const n = new Set(prev); n.has(value) ? n.delete(value) : n.add(value); return n; });
  }

  async function doExport(kind) {
    // Robust gate: PDF is Premium-only, enforced at the action point with a
    // fresh hasPremium() check — the file is never generated for a free user,
    // even if this is reached by dismissing a dialog. CSV stays free.
    if (kind === 'pdf' && !(await hasPremium())) {
      Alert.alert(t('export_premium_title'), t('export_premium_sub'), [
        { text: t('vax_premium_cta'), onPress: () => navigation.navigate('Paywall', { source: 'export_pdf' }) },
        { text: t('cancel'), style: 'cancel' },
      ]);
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
      const locale = LOCALE_MAP[language] || 'en-US';
      const dateStr = new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
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
        if (!hasNativeModule('ExpoPrint')) { setExporting(false); Alert.alert(t('error'), t('blood_needs_build')); return; }
        const Print = require('expo-print');
        const res = await Print.printToFileAsync({ html });
        uri = res.uri;
        mime = 'application/pdf';
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: t('export_records') });
      }
    } catch (e) {
      Alert.alert(t('error'), t('export_error'));
    }
    setExporting(false);
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const locale = LOCALE_MAP[language] || 'en-US';
    return d.toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' });
  }

  // One per upload, the same key as the journal's date cards (A-74).
  const testCount = new Set(rows.map(r => r.report_date + '|' + (r.created_at || ''))).size;
  const labStat = testCount > 0
    ? `${testCount} ${testCount === 1 ? t('body_stat_test') : t('body_stat_tests')}`
    : t('body_stat_none');
  const vaxStat = vaxCount > 0
    ? `${vaxCount} ${vaxCount === 1 ? t('body_stat_vaccine') : t('body_stat_vaccines')}`
    : t('body_stat_none');

  // Dose accumulation (educational estimate, Premium-only). Phone: the Curve is pushed, as
  // today. Book: the Curve opens on the right page (BK-6). Free users keep today's preview
  // sheet, then the full-screen Paywall (BK-11).
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
  // `selected`: the book's left page outlines the open item in ink (BK-8).
  function renderDoseCard(selected) {
    return (
      <TouchableOpacity
        style={[s.hubCard, selected && s.selCard]}
        activeOpacity={0.7}
        onPress={openDoseAccumulation}
        accessibilityState={book ? { selected: !!selected } : undefined}
      >
        <View style={[s.hubBadge, { backgroundColor: colors.well }]}>
          <AccumGlyph color={colors.ink} />
        </View>
        <View style={s.hubCardMain}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={s.hubCardTitle}>{t('body_card_dosing_title')}</Text>
            {!premium && (
              <Text style={{ marginLeft: 8, fontSize: 12, fontWeight: '500', color: colors.ink2, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 9, paddingVertical: 2, borderRadius: 13, overflow: 'hidden' }}>{t('paywall_premium')}</Text>
            )}
          </View>
          <Text style={s.hubCardDesc}>{t('body_card_dosing_desc')}</Text>
          <Text style={s.hubCardStat}>{t('curve_title')}</Text>
        </View>
        {premium
          ? <Text style={s.hubCardChevron}>›</Text>
          : <View style={{ marginLeft: 8 }}><FeatureIcon name="lock" size={18} color={colors.textFaint} /></View>}
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
          <Text style={[s.sec, s.tnum]}>{reportDetail.markers.length} {t('blood_markers')}</Text>
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
              <Text style={s.value}>{m.value} {m.unit}</Text>
              <PenGlyph color={colors.ink3} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={s.dangerBtn} onPress={() => deleteReport(reportDetail.date, reportDetail.createdAt)}>
          <Text style={s.dangerText}>{t('blood_report_delete')}</Text>
        </TouchableOpacity>
        <Text style={[s.foot, s.padX]}>{t('blood_hub_disclaimer')}</Text>
      </ScrollView>
    );
  }

  function renderMarkerDetail(markerDetail, chartWidth, withStar) {
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
          <Text style={[s.foot, s.tnum]}>{formatDate(markerDetail.latest.date)}</Text>
          <Text style={s.display} accessibilityLabel={`${markerDetail.latest.value} ${markerDetail.unit}`}>
            {markerDetail.latest.value}
            {markerDetail.unit ? <Text style={s.unit}> {markerDetail.unit}</Text> : null}
          </Text>
          <Text style={[s.foot, s.tnum]}>
            {markerDetail.points.length} {markerDetail.points.length === 1 ? t('blood_reading') : t('blood_readings')}
          </Text>
          {markerDetail.points.length >= 2 ? (
            <MarkerChart points={markerDetail.points} unit={markerDetail.unit} locale={locale} width={chartWidth} />
          ) : (
            <Text style={s.sec}>{t('blood_need_more')}</Text>
          )}
        </View>

        <View style={s.list}>
          {markerDetail.points.slice().reverse().map((p, j) => (
            <TouchableOpacity key={p.id ?? j} style={[s.li, j > 0 && s.liLine]} onPress={() => openMarkerEdit(p)}>
              <Text style={[s.body, s.grow, s.tnum]}>{formatDate(p.date)}</Text>
              <Text style={s.value}>{p.value} {p.unit}</Text>
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
              {uploadCount === 0
                ? t('blood_first_free')
                : (markerSeries.length > 0
                    ? t('blood_premium_markers').replace('{n}', String(markerSeries.length))
                    : t('blood_premium_only'))}
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
                    <Text style={[s.sec, s.tnum]}>{markers.length} {t('blood_markers')}</Text>
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
                    <Text style={s.value}>{mk.latest.value} {mk.unit}</Text>
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
            {[
              { key: 'labs', Glyph: LabsGlyph, bg: colors.well, fg: colors.ink, title: t('body_card_labs_title'), desc: t('body_card_labs_desc'), stat: labStat },
              { key: 'vaccines', Glyph: VaccinesGlyph, bg: colors.well, fg: colors.ink, title: t('body_card_vax_title'), desc: t('body_card_vax_desc'), stat: vaxStat },
            ].map(card => (
              <TouchableOpacity key={card.key} style={s.hubCard} activeOpacity={0.7} onPress={() => { Analytics.viewed({ labs: 'labs', vaccines: 'vaccines', calc: 'calculator' }[card.key] || card.key); setSection(card.key); }}>
                <View style={[s.hubBadge, { backgroundColor: card.bg }]}>
                  <card.Glyph color={card.fg} />
                </View>
                <View style={s.hubCardMain}>
                  <Text style={s.hubCardTitle}>{card.title}</Text>
                  <Text style={s.hubCardDesc}>{card.desc}</Text>
                  <Text style={s.hubCardStat}>{card.stat}</Text>
                </View>
                <Text style={s.hubCardChevron}>›</Text>
              </TouchableOpacity>
            ))}

            {/* Dose-accumulation / serum-curve model (educational estimate). Premium-only. */}
            {renderDoseCard(false)}

            <Text style={s.hubFootnote}>{t('body_hub_footnote')}</Text>
            <View style={{ height: 30 }} />
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
          {!detail && (section === 'labs' || section === 'vaccines') && (
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
        <VaccinesSection draftRef={vaxDraft} onSheetChange={setVaxSheetOpen} />
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

      {/* Sheets render whatever section is showing: the Dose accumulation preview
          opens from the hub (it was trapped inside the Labs branch on main). */}

      {/* UPGRADE SHEET (prototype upgradeHTML) */}
      <Modal visible={showUpgradeModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowUpgradeModal(false)}>
        <SafeAreaView style={s.modal}>
          <View style={s.sheetTop}>
            <Text style={[s.head, s.grow]}>{t('blood_upload_modal_title')}</Text>
            <TouchableOpacity onPress={() => setShowUpgradeModal(false)} style={s.roundClose} accessibilityRole="button" accessibilityLabel={t('cancel')}>
              <CrossMark size={18} color={colors.ink} strokeWidth={1.8} />
            </TouchableOpacity>
          </View>

          <ScrollView style={s.modalBody} contentContainerStyle={s.sheetBody} showsVerticalScrollIndicator={false}>
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
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* SERUM-CURVE PREVIEW SHEET (prototype spreviewHTML) — show the moat (an
          Example curve) before the paywall. Illustrative data only; the real curve
          is from the user's own log once Premium. */}
      <Modal visible={showSerumPreview} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSerumPreview(false)}>
        <SafeAreaView style={s.modal}>
          <View style={s.sheetTop}>
            <Text style={[s.head, s.grow]}>{t('serum_preview_title')}</Text>
            <TouchableOpacity onPress={() => setShowSerumPreview(false)} style={s.roundClose} accessibilityRole="button" accessibilityLabel={t('cancel')}>
              <CrossMark size={18} color={colors.ink} strokeWidth={1.8} />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} contentContainerStyle={s.sheetBody} showsVerticalScrollIndicator={false}>
            <View style={s.previewHero}>
              <AccumulationHero width={Math.min(360, windowWidth - 72)} height={150} playKey="body" />
              <Text style={s.cap3}>{t('paywall_hero_example')}</Text>
            </View>
            <Text style={s.sec}>{t('serum_preview_body')}</Text>
            <TouchableOpacity
              style={s.btnP}
              onPress={() => { setShowSerumPreview(false); setTimeout(() => navigation.navigate('Paywall', { source: 'serum_preview_sheet' }), 300); }}
            >
              <Text style={s.btnPText}>{t('preview_unlock_cta')}</Text>
            </TouchableOpacity>
            <Text style={s.foot3}>{t('body_hub_footnote')}</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* CONFIRM MODAL (retained, unreachable: uploads auto-save) */}
      <Modal visible={showConfirmModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.sheetHead}>
            <TouchableOpacity
              onPress={() => { setShowConfirmModal(false); setExtractedMarkers([]); setDateWasFallback(false); }}
              style={s.sheetSide}
            >
              <Text style={s.sheetCancel}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.sheetTitle} numberOfLines={1}>{t('blood_review_title')}</Text>
            <TouchableOpacity onPress={saveMarkers} style={[s.sheetSide, s.sheetSideEnd]}>
              <Text style={s.sheetSave}>{t('save')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
            <View style={s.infoBox}>
              <CheckMark size={16} color={colors.ok} />
              <Text style={[s.sec, s.grow]}>
                {t('blood_review_found_prefix')} {extractedMarkers.length} {t('blood_review_found_suffix')}
              </Text>
            </View>
            {dateWasFallback && (
              <View style={s.warnBox}>
                <Text style={s.sec}>{t('blood_date_fallback_note')}</Text>
              </View>
            )}
            <Text style={s.sec}>{t('blood_review_note_edit')}</Text>

            <Text style={s.fieldLabel}>{t('blood_edit_date')}</Text>
            <TouchableOpacity style={s.dateBtn} onPress={() => setConfirmDatePicker(v => !v)}>
              <Text style={s.body}>{reportDate ? formatDate(reportDate) : '—'}</Text>
              <FeatureIcon name="calendar" size={20} color={colors.ink2} />
            </TouchableOpacity>
            {confirmDatePicker && (
              <DateTimePicker
                value={new Date((reportDate || new Date().toISOString().split('T')[0]) + 'T12:00:00')}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant={isDark ? 'dark' : 'light'}
                maximumDate={new Date()}
                onChange={(event, d) => {
                  setConfirmDatePicker(Platform.OS === 'ios');
                  if (event.type === 'dismissed') { setConfirmDatePicker(false); return; }
                  if (d) setReportDate(d.toISOString().split('T')[0]);
                }}
              />
            )}

            <Text style={s.fieldLabel}>{t('blood_review_markers')}</Text>
            {extractedMarkers.map((m, i) => (
              <View key={i} style={s.exRow}>
                <TextInput
                  style={[s.input, s.grow]}
                  value={String(m.marker ?? '')}
                  onChangeText={v => updateExtractedMarker(i, 'marker', v)}
                  placeholderTextColor={colors.ink3}
                />
                <TextInput
                  style={[s.input, s.exVal]}
                  value={String(m.value ?? '')}
                  onChangeText={v => updateExtractedMarker(i, 'value', v)}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.ink3}
                />
                <TextInput
                  style={[s.input, s.exUnit]}
                  value={String(m.unit ?? '')}
                  onChangeText={v => updateExtractedMarker(i, 'unit', v)}
                  autoCapitalize="none"
                  placeholderTextColor={colors.ink3}
                />
                <TouchableOpacity onPress={() => removeExtractedMarker(i)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                  <CrossMark size={16} color={colors.risk} />
                </TouchableOpacity>
              </View>
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* CHOOSE WHAT TO EXPORT (prototype exportSheet) */}
      <Modal visible={exportModalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setExportModalOpen(false)}>
        <SafeAreaView style={s.modal}>
          <View style={s.sheetHead}>
            <TouchableOpacity onPress={() => setExportModalOpen(false)} style={s.sheetSide}>
              <Text style={s.sheetCancel}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.sheetTitle} numberOfLines={1}>{t('export_pick_title')}</Text>
            <View style={s.sheetSide} />
          </View>
          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={s.sec}>{t('export_pick_sub')}</Text>

            {exportMarkers.length > 0 && (
              <>
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
                      <Text style={[s.foot, s.tnum]}>{m.points.length} {m.points.length === 1 ? t('blood_reading') : t('blood_readings')}{m.unit ? ` · ${m.unit}` : ''}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {vaccineList.length > 0 && (
              <>
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
              </>
            )}

            {exportMarkers.length === 0 && vaccineList.length === 0 && (
              <Text style={s.sec}>{t('export_nothing')}</Text>
            )}
            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={s.exportFooter}>
            <TouchableOpacity
              style={[s.btnO, s.grow, (selMarkers.size + selVaccines.size === 0) && s.btnBlocked]}
              disabled={selMarkers.size + selVaccines.size === 0}
              onPress={() => doExport('csv')}
            >
              <Text style={s.btnOText}>CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btnP, s.grow, (selMarkers.size + selVaccines.size === 0) && s.btnBlocked]}
              disabled={selMarkers.size + selVaccines.size === 0}
              onPress={() => doExport('pdf')}
            >
              <Text style={s.btnPText}>PDF</Text>
              {!premium && (
                <View style={s.onActTag}><Text style={s.onActTagText}>{t('export_premium_tag')}</Text></View>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* EDIT / DELETE A STORED VALUE (prototype meditSheet) */}
      <Modal visible={!!mEdit} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMEdit(null)}>
        <SafeAreaView style={s.modal}>
          <View style={s.sheetHead}>
            <TouchableOpacity onPress={() => setMEdit(null)} style={s.sheetSide}>
              <Text style={s.sheetCancel}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.sheetTitle} numberOfLines={1}>{t('blood_edit_title')}</Text>
            <TouchableOpacity onPress={saveMarkerEdit} style={[s.sheetSide, s.sheetSideEnd]}>
              <Text style={s.sheetSave}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>{t('blood_edit_marker')}</Text>
            <TextInput style={s.input} value={mName} onChangeText={setMName} placeholderTextColor={colors.ink3} />
            <View style={s.fieldGrid}>
              <View style={s.grow}>
                <Text style={s.fieldLabel}>{t('blood_edit_value')}</Text>
                <TextInput style={s.input} value={mValue} onChangeText={setMValue} keyboardType="decimal-pad" placeholderTextColor={colors.ink3} />
              </View>
              <View style={s.grow}>
                <Text style={s.fieldLabel}>{t('blood_edit_unit')}</Text>
                <TextInput style={s.input} value={mUnit} onChangeText={setMUnit} autoCapitalize="none" placeholderTextColor={colors.ink3} />
              </View>
            </View>
            <Text style={s.fieldLabel}>{t('blood_edit_date')}</Text>
            <TouchableOpacity style={s.dateBtn} onPress={() => setMDatePicker(v => !v)}>
              <Text style={s.body}>{mDate ? formatDate(mDate) : '—'}</Text>
              <FeatureIcon name="calendar" size={20} color={colors.ink2} />
            </TouchableOpacity>
            {mDatePicker && (
              <DateTimePicker
                value={new Date((mDate || new Date().toISOString().split('T')[0]) + 'T12:00:00')}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant={isDark ? 'dark' : 'light'}
                maximumDate={new Date()}
                onChange={(event, d) => {
                  setMDatePicker(Platform.OS === 'ios');
                  if (event.type === 'dismissed') { setMDatePicker(false); return; }
                  if (d) setMDate(d.toISOString().split('T')[0]);
                }}
              />
            )}
            <TouchableOpacity style={s.dangerBtn} onPress={deleteMarkerEdit}>
              <Text style={s.dangerText}>{t('blood_edit_delete')}</Text>
            </TouchableOpacity>
            <View style={{ height: 60 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Part 18: the lab-journal explainer when the user first opens Lab results. */}
      {section === 'labs' && <FeatureExplainerGate candidates={labExplainers} />}
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  hubCardMain: { flex: 1 },
  ...bodyGraduated(c),
  ...labsGraduated(c),
});

// Redesign (Graduated, My Body approved 2026-09-29): large title on the ground, white
// cards with no border / shadow / tint, the one action in ink, secondary actions in well.
const bodyGraduated = (c) => ({
  container: { flex: 1, backgroundColor: c.ground },
  hubHero: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18, backgroundColor: c.ground },
  hubGreeting: { fontSize: 34, fontWeight: '700', color: c.ink, letterSpacing: -0.8 },
  hubHeroSub: { fontSize: 15, color: c.ink2, marginTop: 4 },
  hubBody: { paddingHorizontal: 16, paddingTop: 0 },
  hubCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.raised, borderRadius: 24, padding: 18, marginBottom: 12 },
  hubBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  hubCardTitle: { fontSize: 20, fontWeight: '700', color: c.ink, marginBottom: 4 },
  hubCardDesc: { fontSize: 15, color: c.ink2, lineHeight: 20 },
  hubCardStat: { fontSize: 15, color: c.ink, fontWeight: '600', marginTop: 8 },
  hubCardChevron: { fontSize: 22, color: c.tick, marginLeft: 8 },
  hubFootnote: { fontSize: 13, color: c.ink3, lineHeight: 18, marginTop: 10, textAlign: 'center', paddingHorizontal: 8 },
});

// Redesign (Graduated, My Body parts 1-3 approved): Lab test journal (by date / by
// marker, search), one test, one marker with its chart, and every sheet. Prototype
// labsScreen / reportScreen / markerScreen / exportSheet / meditSheet / upgradeHTML /
// spreviewHTML. Theme tokens only (both palettes); no border, shadow or tint on cards;
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
  sec: { fontSize: 15, color: c.ink2, lineHeight: 20 },
  foot: { fontSize: 13, color: c.ink2, lineHeight: 18 },
  foot3: { fontSize: 13, color: c.ink3, lineHeight: 18 },
  cap3: { fontSize: 12, fontWeight: '500', color: c.ink3 },
  value: { fontFamily: MONO['500'], fontSize: 15, color: c.ink, fontVariant: ['tabular-nums'] },
  display: { fontSize: 56, fontWeight: '500', color: c.ink, letterSpacing: -1.7, lineHeight: 62, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: MONO['400'], fontSize: 13, color: c.ink3, letterSpacing: 0 },
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
  dangerBtn: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  dangerText: { fontSize: 17, fontWeight: '600', color: c.risk, textAlign: 'center' },
  linkText: { fontSize: 13, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
  onActTag: { minHeight: 24, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: c.onAct, justifyContent: 'center' },
  onActTagText: { fontSize: 12, fontWeight: '600', color: c.onAct },

  // sheets (presented as page sheets; raised surface)
  modal: { flex: 1, backgroundColor: c.raised },
  modalBody: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 20, gap: 8 },
  sheetSide: { width: 80, minHeight: 44, justifyContent: 'center' },
  sheetSideEnd: { alignItems: 'flex-end' },
  sheetCancel: { fontSize: 17, color: c.ink },
  sheetSave: { fontSize: 17, fontWeight: '600', color: c.ink },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: c.ink, textAlign: 'center' },
  sheetTop: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  roundClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' },
  sheetBody: { gap: 14, paddingBottom: 40 },
  upgradeHero: { alignItems: 'center', gap: 10, paddingVertical: 6 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewHero: { alignItems: 'center', gap: 4, paddingTop: 4 },
  fieldLabel: { fontSize: 13, color: c.ink2, marginTop: 14, marginBottom: 6 },
  fieldGrid: { flexDirection: 'row', gap: 12 },
  dateBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.well },
  exportSecHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 2 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: c.tick, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: c.ink, borderColor: c.ink },
  exportFooter: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, backgroundColor: c.raised },
  // retained review sheet (unreachable while uploads auto-save)
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.well, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  warnBox: { borderWidth: 1, borderColor: c.attention, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  exVal: { width: 80, textAlign: 'right' },
  exUnit: { width: 70 },
});
