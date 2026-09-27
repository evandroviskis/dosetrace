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
import { isPremium } from '../lib/purchases';
import { useLanguage } from '../i18n/LanguageContext';
import { Analytics } from '../lib/analytics';
import { getBiomarkers, insertBiomarkers, updateBiomarker, deleteBiomarker, deleteBiomarkerReport, getAllDataForExport, getVaccines } from '../lib/database';
import DateTimePicker from '@react-native-community/datetimepicker';
import { buildRecordsCSV, buildRecordsHTML, canonicalMarker, markerSeries as buildMarkerSeries } from '../lib/exportRecords';
import { hasNativeModule } from '../lib/nativeModule';
import { requestSync } from '../lib/sync';
import { requestAIConsent } from '../lib/aiConsent';
import { useTheme, TYPE } from '../lib/theme';
import { Card, Chip, Dot, SectionLabel, BigNumber, ScreenTitle, CircleButton, Segmented } from '../components/ui';
import FeatureIcon from '../components/FeatureIcon';
import AccumulationHero from '../components/AccumulationHero';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { friendlyError } from '../lib/friendlyError';
import Svg, { Path } from 'react-native-svg';
import MarkerChart from './components/MarkerChart';
import VaccinesSection from './components/VaccinesSection';
import CheckMark, { CrossMark } from '../components/CheckMark';

// Small drawn glyphs (hybrid restyle) replacing the old text glyphs
// (›, ‹, ▲, ▶, ★, ☆, ✎). Stroke colors always come from theme tokens.
const CHEVRON_PATHS = {
  right: 'M9 5.5l6.5 6.5L9 18.5',
  left: 'M15 5.5L8.5 12l6.5 6.5',
  down: 'M6.5 9.5l5.5 5.5 5.5-5.5',
  up: 'M6.5 14.5L12 9l5.5 5.5',
};
function Chevron({ dir = 'right', color, size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={CHEVRON_PATHS[dir]} stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function Pencil({ color, size = 16 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 19l1-4 9.5-9.5a2.1 2.1 0 013 3L9 18z" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
    </Svg>
  );
}
function Star({ filled, color, size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3.6l2.55 5.4 5.85.7-4.33 4.02 1.13 5.8L12 16.66 6.8 19.52l1.13-5.8L3.6 9.7l5.85-.7z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Chart plot width: screen minus the scroll padding (16×2) and card padding (16×2).
// Computed inside the component via useWindowDimensions so it tracks
// fold/unfold and rotation on resizable displays.


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

export default function BodyScreen({ navigation, route }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const CHART_WIDTH = Math.min(windowWidth, CONTENT_MAX_WIDTH) - 32 - 32;
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
  const [expanded, setExpanded] = useState(null);       // date view: expanded report date
  const [expandedMarker, setExpandedMarker] = useState(null); // marker view: expanded marker name
  const [viewMode, setViewMode] = useState('date');     // 'date' | 'marker'
  const [search, setSearch] = useState('');
  const [newestFirst, setNewestFirst] = useState(true);
  const [favorites, setFavorites] = useState([]);       // marker names, from user_metadata
  const [favOnly, setFavOnly] = useState(false);
  const [reportTags, setReportTags] = useState({});     // { 'YYYY-MM-DD': [label, ...] }, from user_metadata
  const [tagDraft, setTagDraft] = useState('');
  const [section, setSection] = useState(null);         // null (hub) | 'labs' | 'vaccines' | 'calc'
  const scrollRef = useRef(null);                       // lab journal scroll (jump to the selected marker)
  const selCardY = useRef(0);

  // Deep link from notifications (e.g. an upload reminder → 'labs'). Param is
  // consumed after use so backing out to the hub isn't re-hijacked. (The
  // calculator/reality-check now lives in the Journey tab, not here.)
  useEffect(() => {
    const target = route?.params?.initialSection;
    if (target === 'labs' || target === 'vaccines') {
      setSection(target);
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
  const markerSeries = useMemo(() => {
    // Group by canonical key so naming variants merge into one series.
    const byKey = {};
    for (const row of rows) {
      (byKey[canonicalMarker(row.marker)] ||= []).push(row);
    }
    const favSet = new Set(favorites);
    let series = Object.values(byKey).map(rs => {
      const sorted = rs.slice().sort((a, b) => (a.report_date < b.report_date ? -1 : a.report_date > b.report_date ? 1 : 0));
      const points = sorted.map(r => ({ id: r.id, marker: r.marker, date: r.report_date, value: r.value, unit: r.unit }));
      const latest = points[points.length - 1];
      const display = sorted[sorted.length - 1].marker; // most recent original label
      const names = new Set(rs.map(r => r.marker));
      return { marker: display, points, latest, unit: latest?.unit || '', isFav: [...names].some(n => favSet.has(n)) };
    });
    if (q) series = series.filter(x => x.marker.toLowerCase().includes(q));
    if (favOnly) series = series.filter(x => x.isFav);
    // Favorites first, then alphabetical within each group.
    series.sort((a, b) => (b.isFav - a.isFav) || a.marker.localeCompare(b.marker));
    return series;
  }, [rows, q, favorites, favOnly]);

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
    setPremium(await isPremium());
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
    if (await isPremium()) {
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
      if (!(await isPremium()) && (await getUploadCount()) >= 1) {
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
        try { code = (await error.context?.clone?.().json())?.code; } catch { /* body unavailable */ }
        const serviceDown = ['provider_error', 'not_configured', 'internal_error'].includes(code)
          || (code == null && [500, 502, 503].includes(status));
        if (code === 'quota_exceeded' || status === 429) {
          Alert.alert(t('vial_scan_quota_title'), t('vial_scan_quota_sub'));
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
            setExpanded(null);
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
    // fresh isPremium() check — the file is never generated for a free user,
    // even if this is reached by dismissing a dialog. CSV stays free.
    if (kind === 'pdf' && !(await isPremium())) {
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

  const sectionTitle = section === 'labs' ? t('body_card_labs_title')
    : section === 'vaccines' ? t('body_card_vax_title') : '';
  const testCount = new Set(rows.map(r => r.report_date)).size;
  const labStat = testCount > 0
    ? `${testCount} ${testCount === 1 ? t('body_stat_test') : t('body_stat_tests')}`
    : t('body_stat_none');
  const vaxStat = vaxCount > 0
    ? `${vaxCount} ${vaxCount === 1 ? t('body_stat_vaccine') : t('body_stat_vaccines')}`
    : t('body_stat_none');

  // Hub entries: title, one short status line, chevron. The feature
  // description stays reachable (accessibility hint) and is shown in full
  // while a section is still empty, so a first-time user knows what it is.
  const lastTestDate = rows.reduce((mx, r) => (r.report_date > mx ? r.report_date : mx), '');
  const todayIso = new Date().toISOString().split('T')[0];
  const nextVaxDue = vaccineList
    .map(v => v.next_due)
    .filter(d => typeof d === 'string' && d >= todayIso)
    .sort()[0];
  const hubEntries = [
    {
      key: 'labs', title: t('body_card_labs_title'), desc: t('body_card_labs_desc'),
      empty: testCount === 0,
      status: testCount > 0 && lastTestDate ? `${labStat} · ${formatDate(lastTestDate)}` : labStat,
    },
    {
      key: 'vaccines', title: t('body_card_vax_title'), desc: t('body_card_vax_desc'),
      empty: vaxCount === 0,
      status: vaxCount > 0 && nextVaxDue ? `${vaxStat} · ${t('vax_next_due')}: ${formatDate(nextVaxDue)}` : vaxStat,
    },
  ];

  // Marker view: the selected marker (chip / row) drives the hero card.
  const selMk = markerSeries.find(m => m.marker === expandedMarker) || markerSeries[0] || null;
  function selectMarker(name, scroll) {
    setExpandedMarker(name);
    if (scroll && scrollRef.current) {
      scrollRef.current.scrollTo({ y: Math.max(0, selCardY.current - 12), animated: true });
    }
  }

  return (
    <SafeAreaView style={s.container}>
      {section === null ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.centered, s.hubBody]}>
          <ScreenTitle title={t('tab_body')} />
          <Text style={s.hubHeroSub}>{t('body_hub_subtitle')}</Text>

          <View style={s.hubList}>
            {hubEntries.map(entry => (
              <TouchableOpacity
                key={entry.key}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${entry.title}, ${entry.status}`}
                accessibilityHint={entry.desc}
                onPress={() => { Analytics.viewed({ labs: 'labs', vaccines: 'vaccines', calc: 'calculator' }[entry.key] || entry.key); setSection(entry.key); }}
              >
                <Card style={s.hubCard}>
                  <View style={s.hubCardMain}>
                    <Text style={s.hubCardTitle}>{entry.title}</Text>
                    <Text style={s.hubCardStat}>{entry.status}</Text>
                    {entry.empty && <Text style={s.hubCardDesc}>{entry.desc}</Text>}
                  </View>
                  <Chevron dir="right" color={colors.textSubtle} />
                </Card>
              </TouchableOpacity>
            ))}

            {/* Dose-accumulation / serum-curve model (educational estimate). Premium-only. */}
            <TouchableOpacity
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${t('body_card_dosing_title')}${premium ? '' : ', PRO'}`}
              accessibilityHint={t('body_card_dosing_desc')}
              onPress={() => {
                Analytics.viewed('serum_curve');
                if (premium) { navigation.navigate('SerumCurve'); return; }
                // Free: show the value first (an Example curve) before the paywall.
                Analytics.previewSheetViewed('serum_curve');
                setShowSerumPreview(true);
              }}
            >
              <Card style={s.hubCard}>
                <View style={s.hubCardMain}>
                  <View style={s.hubTitleRow}>
                    <Text style={s.hubCardTitle}>{t('body_card_dosing_title')}</Text>
                    {!premium && <Chip label="PRO" tone="accent" style={{ marginLeft: 8, height: 22 }} textStyle={{ fontSize: 11, letterSpacing: 0.5 }} />}
                  </View>
                  <Text style={s.hubCardStat}>{t('curve_title')}</Text>
                  {/* Always visible: it carries the "math estimate, never a measurement" framing. */}
                  <Text style={s.hubCardDesc}>{t('body_card_dosing_desc')}</Text>
                </View>
                {premium
                  ? <Chevron dir="right" color={colors.textSubtle} />
                  : <View style={{ marginLeft: 8 }}><FeatureIcon name="lock" size={18} color={colors.textSubtle} /></View>}
              </Card>
            </TouchableOpacity>
          </View>

          <Text style={s.hubFootnote}>{t('body_hub_footnote')}</Text>
          <View style={{ height: 30 }} />
        </ScrollView>
      ) : (
      <>
      <View style={[s.centered, s.header]}>
        <View style={s.headerTop}>
          <CircleButton
            onPress={() => { setSection(null); fetchReports(); }}
            accessibilityLabel={t('back')}
          >
            <Chevron dir="left" color={colors.text} size={20} />
          </CircleButton>
          {(section === 'labs' || section === 'vaccines') && (
            <TouchableOpacity
              style={s.exportBtn}
              onPress={handleExport}
              disabled={exporting}
              accessibilityRole="button"
              accessibilityLabel={t('export_records')}
              accessibilityState={{ disabled: exporting, busy: exporting }}
            >
              {exporting ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <>
                  <FeatureIcon name="arrow_up" size={16} color={colors.accent} />
                  <Text style={s.exportBtnText}>{t('export_records')}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
        <ScreenTitle
          title={sectionTitle}
          style={{ marginTop: 14 }}
          right={section === 'labs' ? (
            <TouchableOpacity style={s.addBtn} onPress={handleUploadPress} accessibilityRole="button" accessibilityLabel={t('blood_upload')}>
              <Text style={s.addBtnText} numberOfLines={1}>{t('blood_upload')}</Text>
            </TouchableOpacity>
          ) : null}
        />
      </View>

      {section === 'vaccines' ? (
        <VaccinesSection />
      ) : (
      <>
      {uploading && (
        <View style={[s.centered, { paddingHorizontal: 16 }]}>
          <View style={s.uploadingBanner}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={s.uploadingText}>{t('blood_uploading')}</Text>
          </View>
        </View>
      )}

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} style={s.scroll} contentContainerStyle={[s.centered, s.scrollContent]} keyboardShouldPersistTaps="handled">

        {!premium && (
          <Card style={s.premiumBanner}>
            <View style={s.premiumBannerLeft}>
              <Text style={s.premiumBannerTitle}>{t('blood_premium_badge')}</Text>
              <Text style={s.premiumBannerSub}>
                {uploadCount === 0
                  ? t('blood_first_free')
                  : (markerSeries.length > 0
                      ? t('blood_premium_markers').replace('{n}', String(markerSeries.length))
                      : t('blood_premium_only'))}
              </Text>
            </View>
            <TouchableOpacity
              style={s.premiumBannerBtn}
              onPress={() => setShowUpgradeModal(true)}
              accessibilityRole="button"
            >
              <Text style={s.premiumBannerBtnText}>{t('blood_upgrade')}</Text>
            </TouchableOpacity>
          </Card>
        )}

        {rows.length === 0 && !loading && (
          <>
            <Card style={s.emptyState}>
              <View style={s.emptyIcon}><FeatureIcon name="droplet" size={44} color={colors.textMuted} /></View>
              <Text style={s.emptyTitle}>{t('blood_empty_title')}</Text>
              <Text style={s.emptySub}>{t('blood_empty_sub')}</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={handleUploadPress} accessibilityRole="button">
                <Text style={s.emptyBtnText}>{t('blood_upload_report')}</Text>
              </TouchableOpacity>
            </Card>
            <Card style={s.tipBox}>
              <SectionLabel style={{ marginBottom: 10 }}>{t('blood_what_we_read')}</SectionLabel>
              {[
                t('blood_tip_1'),
                t('blood_tip_2'),
                t('blood_tip_3'),
                t('blood_tip_4'),
                t('blood_tip_5'),
              ].map((tip, i) => (
                <View key={i} style={s.tipRow}>
                  <Dot color={colors.accent} size={6} style={{ marginTop: 7 }} />
                  <Text style={s.tipText}>{tip}</Text>
                </View>
              ))}
            </Card>
          </>
        )}

        {rows.length > 0 && (
          <>
            <Text style={s.hubDisclaimer}>{t('blood_hub_disclaimer')}</Text>

            <Segmented
              style={s.segment}
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: 'date', label: t('blood_view_by_date') },
                { value: 'marker', label: t('blood_view_by_marker') },
              ]}
            />

            <View style={s.controlsRow}>
              <TextInput
                style={s.searchInput}
                placeholder={t('blood_search_ph')}
                placeholderTextColor={colors.textFaint}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={t('blood_search_ph')}
              />
              {viewMode === 'date' && (
                <TouchableOpacity style={s.sortBtn} onPress={() => setNewestFirst(v => !v)} accessibilityRole="button">
                  <Text style={s.sortBtnText}>{newestFirst ? t('blood_sort_newest') : t('blood_sort_oldest')}</Text>
                </TouchableOpacity>
              )}
              {viewMode === 'marker' && (
                <TouchableOpacity
                  style={[s.sortBtn, favOnly && s.sortBtnOn]}
                  onPress={() => setFavOnly(v => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={t('blood_favorites')}
                  accessibilityState={{ selected: favOnly }}
                >
                  <Star filled={favOnly} size={14} color={favOnly ? colors.accentSoftText : colors.accent} />
                  <Text style={[s.sortBtnText, favOnly && s.sortBtnTextOn]}>{t('blood_favorites')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {viewMode === 'date' && reports.length === 0 && (
              <Text style={s.noResults}>{t('blood_no_results')}</Text>
            )}
            {viewMode === 'marker' && markerSeries.length === 0 && (
              <Text style={s.noResults}>{t('blood_no_results')}</Text>
            )}

            {viewMode === 'date' && reports.map(({ key, date, createdAt, markers }) => (
              <Card key={key} padded={false} style={s.reportGroup}>
                <TouchableOpacity
                  style={s.reportHeader}
                  onPress={() => setExpanded(expanded === key ? null : key)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: expanded === key }}
                >
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={s.reportDate}>{formatDate(date)}</Text>
                    <Text style={s.reportCount}>{markers.length} {t('blood_markers')}</Text>
                    {(reportTags[date] || []).length > 0 && (
                      <View style={s.tagChipsPreview}>
                        {(reportTags[date] || []).map((tg, k) => (
                          <Chip key={k} label={tg} tone="accent" />
                        ))}
                      </View>
                    )}
                  </View>
                  <Chevron dir={expanded === key ? 'up' : 'down'} color={colors.textSubtle} />
                </TouchableOpacity>

                {expanded === key && (
                  <View style={s.markerList}>
                    <View style={s.tagEditor}>
                      <SectionLabel style={{ marginBottom: 8 }}>{t('blood_tags_title')}</SectionLabel>
                      {(reportTags[date] || []).length > 0 && (
                        <View style={s.tagEditorChips}>
                          {(reportTags[date] || []).map((tg, k) => (
                            <TouchableOpacity
                              key={k}
                              style={s.tagChipEditable}
                              onPress={() => removeReportTag(date, tg)}
                              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                              accessibilityRole="button"
                              accessibilityLabel={tg}
                            >
                              <Text style={s.tagChipText}>{tg}</Text>
                              <View style={{ marginLeft: 4 }}><CrossMark style={s.tagChipX} /></View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      <View style={s.tagInputRow}>
                        <TextInput
                          style={s.tagInput}
                          placeholder={t('blood_tag_ph')}
                          placeholderTextColor={colors.textFaint}
                          value={expanded === key ? tagDraft : ''}
                          onChangeText={setTagDraft}
                          onSubmitEditing={() => addReportTag(date)}
                          returnKeyType="done"
                          autoCapitalize="none"
                        />
                        <TouchableOpacity style={s.tagAddBtn} onPress={() => addReportTag(date)} accessibilityRole="button">
                          <Text style={s.tagAddBtnText}>{t('blood_tag_add')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    {markers.map((m, j) => (
                      <TouchableOpacity
                        key={j}
                        style={[s.markerRow, j === markers.length - 1 && s.markerRowLast]}
                        onPress={() => openMarkerEdit(m)}
                        accessibilityRole="button"
                        accessibilityLabel={`${m.marker}, ${m.value} ${m.unit || ''}`}
                        accessibilityHint={t('blood_edit_title')}
                      >
                        <Text style={s.markerName} numberOfLines={2}>{m.marker}</Text>
                        <View style={s.markerRight}>
                          <Text style={s.markerValue}>{m.value}{!!m.unit && <Text style={s.markerUnit}> {m.unit}</Text>}</Text>
                          <Pencil color={colors.textSubtle} />
                        </View>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={s.reportDeleteBtn} onPress={() => deleteReport(date, createdAt)} accessibilityRole="button">
                      <Text style={s.reportDeleteText}>{t('blood_report_delete')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Card>
            ))}

            {viewMode === 'marker' && selMk && (
              <>
                {/* Marker selector */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={s.chipScroll}
                  contentContainerStyle={s.chipScrollContent}
                >
                  {markerSeries.map(mk => {
                    const on = mk.marker === selMk.marker;
                    return (
                      <TouchableOpacity
                        key={mk.marker}
                        style={[s.mChip, on ? s.mChipOn : s.mChipOff]}
                        onPress={() => selectMarker(mk.marker, false)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                      >
                        {mk.isFav && <Star filled size={11} color={on ? colors.accentText : colors.warning} />}
                        <Text style={[s.mChipText, on && s.mChipTextOn]} numberOfLines={1}>{mk.marker}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Selected marker: latest value, chart, full history */}
                <View onLayout={(e) => { selCardY.current = e.nativeEvent.layout.y; }}>
                <Card style={s.selCard}>
                  <View style={s.selTop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <BigNumber value={String(selMk.latest.value)} unit={selMk.unit} size={52} />
                      <Text style={s.selCaption}>{selMk.marker} · {formatDate(selMk.latest.date)}</Text>
                    </View>
                    <View style={s.selSide}>
                      <TouchableOpacity
                        style={s.starBtn}
                        onPress={() => toggleFavorite(selMk.marker)}
                        accessibilityRole="button"
                        accessibilityLabel={t('blood_favorites')}
                        accessibilityState={{ selected: selMk.isFav }}
                      >
                        <Star filled={selMk.isFav} size={20} color={selMk.isFav ? colors.warning : colors.textSubtle} />
                      </TouchableOpacity>
                      <Chip label={`${selMk.points.length} ${selMk.points.length === 1 ? t('blood_reading') : t('blood_readings')}`} />
                    </View>
                  </View>

                  {selMk.points.length >= 2 ? (
                    <View style={{ marginTop: 12 }}>
                      <MarkerChart points={selMk.points} unit={selMk.unit} locale={locale} width={CHART_WIDTH} />
                    </View>
                  ) : (
                    <Text style={s.singlePointHint}>{t('blood_need_more')}</Text>
                  )}

                  <View style={s.markerHistory}>
                    {selMk.points.slice().reverse().map((p, j, arr) => (
                      <TouchableOpacity
                        key={p.id ?? j}
                        style={[s.historyRow, j === arr.length - 1 && s.markerRowLast]}
                        onPress={() => openMarkerEdit(p)}
                        accessibilityRole="button"
                        accessibilityLabel={`${formatDate(p.date)}, ${p.value} ${p.unit || ''}`}
                        accessibilityHint={t('blood_edit_title')}
                      >
                        <Text style={s.markerName}>{formatDate(p.date)}</Text>
                        <View style={s.markerRight}>
                          <Text style={s.markerValue}>{p.value}{!!p.unit && <Text style={s.markerUnit}> {p.unit}</Text>}</Text>
                          <Pencil color={colors.textSubtle} />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </Card>
                </View>

                {/* Every other marker as a flat row */}
                {markerSeries.length > 1 && (
                  <Card padded={false} style={s.otherCard}>
                    {markerSeries.filter(mk => mk.marker !== selMk.marker).map((mk, i, arr) => (
                      <View key={mk.marker} style={[s.otherRow, i === arr.length - 1 && s.markerRowLast]}>
                        <TouchableOpacity
                          style={s.otherStar}
                          onPress={() => toggleFavorite(mk.marker)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 2 }}
                          accessibilityRole="button"
                          accessibilityLabel={`${t('blood_favorites')}: ${mk.marker}`}
                          accessibilityState={{ selected: mk.isFav }}
                        >
                          <Star filled={mk.isFav} size={16} color={mk.isFav ? colors.warning : colors.textSubtle} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={s.otherMain}
                          onPress={() => selectMarker(mk.marker, true)}
                          accessibilityRole="button"
                          accessibilityLabel={`${mk.marker}, ${mk.latest.value} ${mk.unit}, ${mk.points.length} ${mk.points.length === 1 ? t('blood_reading') : t('blood_readings')}`}
                        >
                          <View style={{ flex: 1, marginRight: 10 }}>
                            <Text style={s.otherName} numberOfLines={2}>{mk.marker}</Text>
                            <Text style={s.reportCount}>
                              {mk.points.length} {mk.points.length === 1 ? t('blood_reading') : t('blood_readings')}
                            </Text>
                          </View>
                          <Text style={s.markerValue}>{mk.latest.value}{!!mk.unit && <Text style={s.markerUnit}> {mk.unit}</Text>}</Text>
                          <Chevron dir="right" color={colors.textSubtle} size={16} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </Card>
                )}
              </>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* UPGRADE MODAL */}
      <Modal visible={showUpgradeModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.modalNav}>
            <View style={{ width: 60 }} />
            <Text style={s.modalTitle}>{t('blood_upload_modal_title')}</Text>
            <TouchableOpacity onPress={() => setShowUpgradeModal(false)} style={{ width: 60, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('cancel')}>
              <CrossMark style={s.modalClose} size={18} />
            </TouchableOpacity>
          </View>

          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
            <View style={s.upgradeHero}>
              <View style={s.upgradeIcon}><FeatureIcon name="droplet" size={48} color={colors.accent} /></View>
              <Text style={s.upgradeTitle}>{t('blood_upgrade_title')}</Text>
              <Text style={s.upgradeSub}>
                {t('blood_upgrade_sub')}
              </Text>
            </View>

            <View style={s.upgradeFeats}>
              {UPGRADE_FEATURES.map((f, i) => (
                <View key={i} style={s.upgradeFeat}>
                  <CheckMark style={s.upgradeCheck} />
                  <Text style={s.upgradeFeatText}>{f}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
  style={s.upgradePrimaryBtn}
  onPress={() => {
    setShowUpgradeModal(false);
    setTimeout(() => navigation.navigate('Paywall', { source: 'bloodwork_upload' }), 300);
  }}
>
  <Text style={s.upgradePrimaryBtnText}>{t('blood_start_trial')}</Text>
  <Text style={s.upgradePrimaryBtnSub}>{t('blood_trial_sub')}</Text>
</TouchableOpacity>
<View style={s.trialBadge}>
  <Text style={s.trialBadgeText}>{t('blood_trial_badge')}</Text>
</View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* SERUM-CURVE PREVIEW SHEET — show the moat (an Example curve) before the
          paywall. Illustrative data only; the real curve is from the user's own
          log once Pro. */}
      <Modal visible={showSerumPreview} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.modalNav}>
            <View style={{ width: 60 }} />
            <Text style={s.modalTitle}>{t('serum_preview_title')}</Text>
            <TouchableOpacity onPress={() => setShowSerumPreview(false)} style={{ width: 60, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('cancel')}>
              <CrossMark style={s.modalClose} size={18} />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
            <View style={{ height: 12 }} />
            <AccumulationHero width={Math.min(360, windowWidth - 72)} height={150} playKey="body" />
            <Text style={s.serumExample}>{t('paywall_hero_example')}</Text>
            <Text style={s.serumPreviewBody}>{t('serum_preview_body')}</Text>
            <TouchableOpacity
              style={s.serumUnlockBtn}
              onPress={() => { setShowSerumPreview(false); setTimeout(() => navigation.navigate('Paywall', { source: 'serum_preview_sheet' }), 300); }}
            >
              <Text style={s.serumUnlockBtnText}>{t('preview_unlock_cta')}</Text>
            </TouchableOpacity>
            <Text style={s.serumPreviewNote}>{t('body_hub_footnote')}</Text>
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* CONFIRM MODAL */}
      <Modal visible={showConfirmModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.modalNav}>
            <TouchableOpacity
              onPress={() => { setShowConfirmModal(false); setExtractedMarkers([]); setDateWasFallback(false); }}
              style={{ width: 60 }}
            >
              <Text style={s.modalClose}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>{t('blood_review_title')}</Text>
            <TouchableOpacity onPress={saveMarkers} style={{ width: 60, alignItems: 'flex-end' }}>
              <Text style={[s.modalClose, { color: colors.accent, fontWeight: '600' }]}>{t('save')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
            <View style={s.confirmBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <CheckMark style={s.confirmBannerText} />
                <Text style={[s.confirmBannerText, { flexShrink: 1 }]}>
                  {t('blood_review_found_prefix')} {extractedMarkers.length} {t('blood_review_found_suffix')}
                </Text>
              </View>
            </View>
            {dateWasFallback && (
              <View style={s.dateFallbackBanner}>
                <Text style={s.dateFallbackText}>{t('blood_date_fallback_note')}</Text>
              </View>
            )}
            <Text style={s.confirmNote}>
              {t('blood_review_note_edit')}
            </Text>

            <Text style={s.editLabel}>{t('blood_edit_date')}</Text>
            <TouchableOpacity style={[s.editDateBtn, { flexDirection: 'row', alignItems: 'center', gap: 8 }]} onPress={() => setConfirmDatePicker(v => !v)}>
              <FeatureIcon name="calendar" size={15} color={colors.text} />
              <Text style={s.editDateText}>{reportDate ? formatDate(reportDate) : '—'}</Text>
            </TouchableOpacity>
            {confirmDatePicker && (
              <DateTimePicker
                value={new Date((reportDate || new Date().toISOString().split('T')[0]) + 'T12:00:00')}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={(event, d) => {
                  setConfirmDatePicker(Platform.OS === 'ios');
                  if (event.type === 'dismissed') { setConfirmDatePicker(false); return; }
                  if (d) setReportDate(d.toISOString().split('T')[0]);
                }}
              />
            )}

            <Text style={[s.editLabel, { marginBottom: 4 }]}>{t('blood_review_markers')}</Text>
            {extractedMarkers.map((m, i) => (
              <View key={i} style={s.exRow}>
                <TextInput
                  style={[s.editInput, s.exName]}
                  value={String(m.marker ?? '')}
                  onChangeText={v => updateExtractedMarker(i, 'marker', v)}
                  placeholderTextColor={colors.textFaint}
                />
                <TextInput
                  style={[s.editInput, s.exVal]}
                  value={String(m.value ?? '')}
                  onChangeText={v => updateExtractedMarker(i, 'value', v)}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textFaint}
                />
                <TextInput
                  style={[s.editInput, s.exUnit]}
                  value={String(m.unit ?? '')}
                  onChangeText={v => updateExtractedMarker(i, 'unit', v)}
                  autoCapitalize="none"
                  placeholderTextColor={colors.textFaint}
                />
                <TouchableOpacity onPress={() => removeExtractedMarker(i)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                  <View style={{ paddingHorizontal: 4 }}><CrossMark style={s.exRemove} /></View>
                </TouchableOpacity>
              </View>
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
      </>
      )}
      </>
      )}

      {/* CHOOSE WHAT TO EXPORT */}
      <Modal visible={exportModalOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.modalNav}>
            <TouchableOpacity onPress={() => setExportModalOpen(false)} style={{ width: 70 }}>
              <Text style={s.modalClose}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>{t('export_pick_title')}</Text>
            <View style={{ width: 70 }} />
          </View>
          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={s.exportPickSub}>{t('export_pick_sub')}</Text>

            {exportMarkers.length > 0 && (
              <>
                <View style={s.exportSecHead}>
                  <Text style={s.exportSecTitle}>{t('export_labs')}</Text>
                  <TouchableOpacity onPress={() => setSelMarkers(selMarkers.size === exportMarkers.length ? new Set() : new Set(exportMarkers.map(m => m.key)))}>
                    <Text style={s.selectAll}>{selMarkers.size === exportMarkers.length ? t('export_none') : t('export_all')}</Text>
                  </TouchableOpacity>
                </View>
                {exportMarkers.map(m => (
                  <TouchableOpacity key={m.key} style={s.checkRow} onPress={() => toggleSel(setSelMarkers, m.key)}>
                    <View style={[s.checkbox, selMarkers.has(m.key) && s.checkboxOn]}>{selMarkers.has(m.key) ? <CheckMark style={s.checkMark} /> : null}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.checkName}>{m.display}</Text>
                      <Text style={s.checkMeta}>{m.points.length} {m.points.length === 1 ? t('blood_reading') : t('blood_readings')}{m.unit ? ` · ${m.unit}` : ''}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {vaccineList.length > 0 && (
              <>
                <View style={s.exportSecHead}>
                  <Text style={s.exportSecTitle}>{t('body_section_vaccines')}</Text>
                  <TouchableOpacity onPress={() => setSelVaccines(selVaccines.size === vaccineList.length ? new Set() : new Set(vaccineList.map(v => v.id)))}>
                    <Text style={s.selectAll}>{selVaccines.size === vaccineList.length ? t('export_none') : t('export_all')}</Text>
                  </TouchableOpacity>
                </View>
                {vaccineList.map(v => (
                  <TouchableOpacity key={v.id} style={s.checkRow} onPress={() => toggleSel(setSelVaccines, v.id)}>
                    <View style={[s.checkbox, selVaccines.has(v.id) && s.checkboxOn]}>{selVaccines.has(v.id) ? <CheckMark style={s.checkMark} /> : null}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.checkName}>{v.name}</Text>
                      <Text style={s.checkMeta}>{formatDate(v.date_given)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {exportMarkers.length === 0 && vaccineList.length === 0 && (
              <Text style={s.exportPickSub}>{t('export_nothing')}</Text>
            )}
            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={s.exportFooter}>
            <TouchableOpacity
              style={[s.exportFooterBtn, s.exportFooterSecondary, (selMarkers.size + selVaccines.size === 0) && s.exportBtnDisabled]}
              disabled={selMarkers.size + selVaccines.size === 0}
              onPress={() => doExport('csv')}
            >
              <Text style={s.exportFooterSecondaryText}>CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.exportFooterBtn, s.exportFooterPrimary, (selMarkers.size + selVaccines.size === 0) && s.exportBtnDisabled]}
              disabled={selMarkers.size + selVaccines.size === 0}
              onPress={() => doExport('pdf')}
            >
              <Text style={s.exportFooterPrimaryText}>{premium ? 'PDF' : `PDF · ${t('export_premium_tag')}`}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* EDIT / DELETE A STORED MARKER */}
      <Modal visible={!!mEdit} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.modalNav}>
            <TouchableOpacity onPress={() => setMEdit(null)} style={{ width: 70 }}>
              <Text style={s.modalClose}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>{t('blood_edit_title')}</Text>
            <TouchableOpacity onPress={saveMarkerEdit} style={{ width: 70, alignItems: 'flex-end' }}>
              <Text style={[s.modalClose, { color: colors.accent, fontWeight: '600' }]}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={s.editLabel}>{t('blood_edit_marker')}</Text>
            <TextInput style={s.editInput} value={mName} onChangeText={setMName} placeholderTextColor={colors.textFaint} />
            <View style={s.editRow2}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={s.editLabel}>{t('blood_edit_value')}</Text>
                <TextInput style={s.editInput} value={mValue} onChangeText={setMValue} keyboardType="decimal-pad" placeholderTextColor={colors.textFaint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.editLabel}>{t('blood_edit_unit')}</Text>
                <TextInput style={s.editInput} value={mUnit} onChangeText={setMUnit} autoCapitalize="none" placeholderTextColor={colors.textFaint} />
              </View>
            </View>
            <Text style={s.editLabel}>{t('blood_edit_date')}</Text>
            <TouchableOpacity style={[s.editDateBtn, { flexDirection: 'row', alignItems: 'center', gap: 8 }]} onPress={() => setMDatePicker(v => !v)}>
              <FeatureIcon name="calendar" size={15} color={colors.text} />
              <Text style={s.editDateText}>{mDate ? formatDate(mDate) : '—'}</Text>
            </TouchableOpacity>
            {mDatePicker && (
              <DateTimePicker
                value={new Date((mDate || new Date().toISOString().split('T')[0]) + 'T12:00:00')}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={(event, d) => {
                  setMDatePicker(Platform.OS === 'ios');
                  if (event.type === 'dismissed') { setMDatePicker(false); return; }
                  if (d) setMDate(d.toISOString().split('T')[0]);
                }}
              />
            )}
            <TouchableOpacity style={s.editDeleteBtn} onPress={deleteMarkerEdit}>
              <Text style={s.editDeleteText}>{t('blood_edit_delete')}</Text>
            </TouchableOpacity>
            <View style={{ height: 60 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  container: { flex: 1, backgroundColor: c.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  addBtn: { backgroundColor: c.accent, height: 44, paddingHorizontal: 16, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  addBtnText: { color: c.accentText, fontSize: 15, fontWeight: '600' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.card, height: 44, minWidth: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center', ...c.shadowSoft },
  exportBtnText: { color: c.accent, fontSize: 15, fontWeight: '600' },
  // Hub landing — warm hero + colored cards
  hubHeroSub: { fontSize: 15, color: c.textMuted, marginTop: 6, lineHeight: 21 },
  hubBody: { paddingHorizontal: 16, paddingTop: 12 },
  hubCard: { flexDirection: 'row', alignItems: 'center', minHeight: 76 },
  hubCardMain: { flex: 1, marginRight: 10 },
  hubCardTitle: { fontSize: 17, fontWeight: '600', color: c.text },
  hubCardDesc: { ...TYPE.caption, color: c.textSubtle, lineHeight: 18, marginTop: 6 },
  hubCardStat: { fontSize: 14.5, color: c.textMuted, marginTop: 3, lineHeight: 20 },
  hubFootnote: { ...TYPE.caption, color: c.textSubtle, lineHeight: 18, marginTop: 18, textAlign: 'center', paddingHorizontal: 8 },
  uploadingBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.accentSoft, paddingHorizontal: 14, minHeight: 44, borderRadius: 14, marginBottom: 8 },
  uploadingText: { fontSize: 14, color: c.accentSoftText, fontWeight: '500', flexShrink: 1 },
  premiumBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  premiumBannerLeft: { flex: 1, marginRight: 12 },
  premiumBannerTitle: { fontSize: 14.5, fontWeight: '600', color: c.text, marginBottom: 3 },
  premiumBannerSub: { ...TYPE.caption, color: c.textMuted, lineHeight: 18 },
  premiumBannerBtn: { backgroundColor: c.accent, height: 40, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  premiumBannerBtnText: { color: c.accentText, fontSize: 14, fontWeight: '600' },
  scroll: { flex: 1 },
  emptyState: { alignItems: 'center', paddingVertical: 28, marginBottom: 12 },
  emptyIcon: { marginBottom: 14 },
  emptyTitle: { ...TYPE.heading, color: c.text, marginBottom: 8, textAlign: 'center' },
  emptySub: { fontSize: 15, color: c.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: 20, paddingHorizontal: 8 },
  emptyBtn: { backgroundColor: c.accent, minHeight: 52, paddingHorizontal: 28, borderRadius: 16, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  emptyBtnText: { color: c.accentText, fontSize: 16, fontWeight: '600' },
  tipBox: { marginBottom: 12 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  tipText: { fontSize: 14.5, color: c.textMuted, flex: 1, lineHeight: 20 },
  hubDisclaimer: { ...TYPE.caption, color: c.textSubtle, lineHeight: 18, marginBottom: 12 },
  segment: { marginBottom: 12 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  searchInput: { flex: 1, backgroundColor: c.card, borderRadius: 14, paddingHorizontal: 14, height: 44, fontSize: 15, color: c.text, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.card, borderRadius: 22, paddingHorizontal: 14, height: 44, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  sortBtnOn: { backgroundColor: c.accentSoft, borderColor: c.accentSoft },
  sortBtnText: { fontSize: 14, fontWeight: '600', color: c.accent },
  sortBtnTextOn: { color: c.accentSoftText },
  starBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10, marginTop: -8 },
  noResults: { fontSize: 14.5, color: c.textMuted, textAlign: 'center', paddingVertical: 24 },
  tagChipsPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tagChipText: { fontSize: 12.5, color: c.accentSoftText, fontWeight: '600' },
  tagEditor: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  tagEditorChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  tagChipEditable: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.accentSoft, borderRadius: 13, height: 28, paddingHorizontal: 10 },
  tagChipX: { fontSize: 11, color: c.accentSoftText },
  tagInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tagInput: { flex: 1, backgroundColor: c.card2, borderRadius: 12, paddingHorizontal: 12, height: 44, fontSize: 15, color: c.text },
  tagAddBtn: { backgroundColor: c.accent, borderRadius: 22, paddingHorizontal: 16, height: 44, alignItems: 'center', justifyContent: 'center' },
  tagAddBtnText: { color: c.accentText, fontSize: 14, fontWeight: '600' },
  singlePointHint: { fontSize: 14, color: c.textMuted, textAlign: 'center', paddingVertical: 18, lineHeight: 20 },
  markerHistory: { marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  reportGroup: { marginBottom: 12, overflow: 'hidden' },
  reportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, minHeight: 64 },
  reportDate: { fontSize: 17, fontWeight: '600', color: c.text },
  reportCount: { ...TYPE.caption, color: c.textSubtle, marginTop: 2 },
  markerList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  markerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 52, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  markerName: { flex: 1, fontSize: 15.5, fontWeight: '500', color: c.text, marginRight: 10 },
  markerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  markerValue: { fontSize: 17, fontWeight: '400', color: c.text, fontVariant: ['tabular-nums'] },
  editLabel: { ...TYPE.label, color: c.textSubtle, marginBottom: 8, marginTop: 18 },
  editInput: { backgroundColor: c.bg, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, paddingVertical: 11, fontSize: 16, color: c.text, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  editRow2: { flexDirection: 'row' },
  editDateBtn: { backgroundColor: c.bg, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  editDateText: { fontSize: 16, color: c.text },
  editDeleteBtn: { marginTop: 28, borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.danger },
  editDeleteText: { color: c.danger, fontSize: 15, fontWeight: '600' },
  reportDeleteBtn: { margin: 16, marginTop: 12, borderRadius: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.danger },
  reportDeleteText: { color: c.danger, fontSize: 15, fontWeight: '600' },
  exportPickSub: { fontSize: 14.5, color: c.textMuted, lineHeight: 20, marginBottom: 8 },
  exportSecHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 6 },
  exportSecTitle: { ...TYPE.label, color: c.textSubtle },
  selectAll: { fontSize: 14, color: c.accent, fontWeight: '600', paddingVertical: 10, paddingLeft: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: c.textFaint, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: c.accent, borderColor: c.accent },
  checkMark: { color: c.accentText, fontSize: 13, fontWeight: '700' },
  checkName: { fontSize: 15.5, color: c.text, fontWeight: '500' },
  checkMeta: { ...TYPE.caption, color: c.textSubtle, marginTop: 2 },
  exportFooter: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.card },
  exportFooterBtn: { flex: 1, borderRadius: 16, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  exportFooterSecondary: { backgroundColor: c.card2 },
  exportFooterSecondaryText: { color: c.accent, fontSize: 16, fontWeight: '600' },
  exportFooterPrimary: { backgroundColor: c.accent },
  exportFooterPrimaryText: { color: c.accentText, fontSize: 16, fontWeight: '600' },
  exportBtnDisabled: { opacity: 0.4 },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  exName: { flex: 1, minHeight: 44, paddingVertical: 9 },
  exVal: { width: 74, minHeight: 44, paddingVertical: 9, textAlign: 'right' },
  exUnit: { width: 64, minHeight: 44, paddingVertical: 9 },
  exRemove: { fontSize: 16, color: c.danger, paddingHorizontal: 4 },
  modal: { flex: 1, backgroundColor: c.card },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  modalTitle: { fontSize: 17, fontWeight: '600', color: c.text, flexShrink: 1, textAlign: 'center' },
  modalClose: { fontSize: 15, color: c.textMuted },
  modalBody: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 20 },
  upgradeHero: { alignItems: 'center', marginBottom: 24 },
  upgradeIcon: { marginBottom: 12 },
  upgradeTitle: { ...TYPE.heading, color: c.text, marginBottom: 8, textAlign: 'center' },
  upgradeSub: { fontSize: 15, color: c.textMuted, textAlign: 'center', lineHeight: 21 },
  upgradeFeats: { backgroundColor: c.card2, borderRadius: 16, padding: 16, marginBottom: 20 },
  upgradeFeat: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  upgradeCheck: { color: c.success, fontWeight: '600', fontSize: 14 },
  upgradeFeatText: { fontSize: 14.5, color: c.textMuted, flex: 1, lineHeight: 20 },
  upgradePrimaryBtn: { backgroundColor: c.accent, minHeight: 56, paddingVertical: 10, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  upgradePrimaryBtnText: { color: c.accentText, fontSize: 16, fontWeight: '600' },
  // Serum-curve preview sheet
  serumExample: { ...TYPE.label, color: c.textSubtle, marginTop: 4 },
  serumPreviewBody: { fontSize: 15, color: c.textMuted, textAlign: 'center', lineHeight: 22, marginTop: 18, paddingHorizontal: 6 },
  serumUnlockBtn: { backgroundColor: c.accent, minHeight: 54, paddingHorizontal: 28, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 24, alignSelf: 'stretch' },
  serumUnlockBtnText: { color: c.accentText, fontSize: 16, fontWeight: '600' },
  serumPreviewNote: { ...TYPE.caption, color: c.textSubtle, textAlign: 'center', lineHeight: 18, marginTop: 18 },
  confirmBanner: { backgroundColor: c.successSoft, borderRadius: 14, padding: 14, marginBottom: 16 },
  confirmBannerText: { fontSize: 14, color: c.successSoftText, fontWeight: '500' },
  dateFallbackBanner: { backgroundColor: c.accentSoft, borderRadius: 14, padding: 14, marginBottom: 16 },
  dateFallbackText: { fontSize: 13, color: c.accentSoftText, lineHeight: 19 },
  confirmNote: { fontSize: 14.5, color: c.textMuted, marginBottom: 16, lineHeight: 20 },
  upgradePrimaryBtnSub: { color: c.accentText, opacity: 0.8, fontSize: 12, marginTop: 2 },
trialBadge: { backgroundColor: c.successSoft, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', marginBottom: 20 },
trialBadgeText: { fontSize: 14, color: c.successSoftText, fontWeight: '600' },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hubList: { gap: 12, marginTop: 20 },
  hubTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  markerRowLast: { borderBottomWidth: 0 },
  markerUnit: { fontSize: 12.5, fontWeight: '400', color: c.textMuted },
  chipScroll: { marginHorizontal: -16, marginBottom: 12 },
  chipScrollContent: { paddingHorizontal: 16, paddingVertical: 4, gap: 8 },
  mChip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 14, borderRadius: 18, maxWidth: 220 },
  mChipOn: { backgroundColor: c.accent },
  mChipOff: { backgroundColor: c.card, ...c.shadowSoft },
  mChipText: { fontSize: 14, fontWeight: '600', color: c.text, flexShrink: 1 },
  mChipTextOn: { color: c.accentText },
  selCard: { marginBottom: 12 },
  selTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  selSide: { alignItems: 'flex-end', gap: 6, marginLeft: 8 },
  selCaption: { ...TYPE.caption, color: c.textSubtle, marginTop: 2 },
  otherCard: { paddingHorizontal: 16, paddingVertical: 4, marginBottom: 12 },
  otherRow: { flexDirection: 'row', alignItems: 'center', minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  otherStar: { width: 32, height: 44, justifyContent: 'center' },
  otherMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingVertical: 6 },
  otherName: { fontSize: 15.5, fontWeight: '500', color: c.text },
});
