import { useState, useCallback, useMemo } from 'react';
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
  Dimensions,
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
import { getBiomarkers, insertBiomarkers, getAllDataForExport } from '../lib/database';
import { buildRecordsCSV, buildRecordsHTML } from '../lib/exportRecords';
import { requestSync } from '../lib/sync';
import { useTheme } from '../lib/theme';
import { friendlyError } from '../lib/friendlyError';
import MarkerChart from './components/MarkerChart';
import VaccinesSection from './components/VaccinesSection';
import CalculatorSection from './components/CalculatorSection';

// Chart plot width: screen minus the scroll padding (16×2) and card padding (14×2).
const CHART_WIDTH = Dimensions.get('window').width - 32 - 28;

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

export default function BodyScreen({ navigation }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
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
  const [section, setSection] = useState('labs');       // 'labs' | 'vaccines' | 'calc'
  const [exporting, setExporting] = useState(false);

  const locale = LOCALE_MAP[language] || 'en-US';
  const q = search.trim().toLowerCase();

  // Date view: reports grouped by date, each filtered by the marker search,
  // sorted by the chosen order. Reports with no matching marker are dropped.
  const reports = useMemo(() => {
    const grouped = {};
    for (const row of rows) {
      if (q && !row.marker.toLowerCase().includes(q)) continue;
      (grouped[row.report_date] ||= []).push(row);
    }
    const entries = Object.entries(grouped);
    entries.sort((a, b) => (a[0] < b[0] ? 1 : -1) * (newestFirst ? 1 : -1));
    return entries;
  }, [rows, q, newestFirst]);

  // Marker view: one entry per distinct marker name, with its full value
  // history (oldest → newest for the chart) and the latest reading.
  const markerSeries = useMemo(() => {
    const byMarker = {};
    for (const row of rows) {
      (byMarker[row.marker] ||= []).push(row);
    }
    const favSet = new Set(favorites);
    let series = Object.entries(byMarker).map(([marker, rs]) => {
      const points = rs
        .map(r => ({ date: r.report_date, value: r.value, unit: r.unit }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const latest = points[points.length - 1];
      return { marker, points, latest, unit: latest?.unit || '', isFav: favSet.has(marker) };
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
    setLoading(false);
  }

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
      pickAndExtract();
      return;
    }
    const count = await getUploadCount();
    if (count < 1) {
      pickAndExtract();
      return;
    }
    setShowUpgradeModal(true);
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

  async function extractWithClaude(pdfBase64) {
    try {
      const user = await getCachedUser();
      if (!user) {
        setUploading(false);
        Alert.alert(t('error'), t('blood_error_not_signed_in'));
        return;
      }

      // The Anthropic API key lives only in the extract-bloodwork edge
      // function; the app never talks to api.anthropic.com directly.
      const { data, error } = await supabase.functions.invoke('extract-bloodwork', {
        body: { pdf_base64: pdfBase64 },
      });

      if (error) {
        setUploading(false);
        const status = error.context?.status;
        if (status === 401) {
          Alert.alert(t('error'), t('blood_error_not_signed_in'));
        } else if (status === 413) {
          Alert.alert(t('error'), t('blood_error_file_too_large'));
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

      setExtractedMarkers(markers);
      setReportDate(parsedDate);
      setDateWasFallback(dateFallback);
      setUploading(false);
      setShowConfirmModal(true);

      if (droppedCount > 0) {
        Alert.alert(t('blood_dropped_title'), `${droppedCount} ${t('blood_dropped_sub')}`);
      }
    } catch (err) {
      setUploading(false);
      Alert.alert(
        t('blood_error_extract'),
        t('blood_error_extract_sub')
      );
    }
  }

  async function saveMarkers() {
    try {
      const user = await getCachedUser();
      if (!user) { Alert.alert(t('error'), t('blood_error_not_signed_in')); return; }
      const rows = extractedMarkers.map(m => ({
        user_id: user.id,
        report_date: reportDate,
        marker: m.marker,
        value: m.value,
        unit: m.unit || '',
      }));

      insertBiomarkers(rows);
      const newCount = await incrementUploadCount();
      setUploadCount(newCount);
      Analytics.bloodworkUploaded({ biomarkerCount: rows.length });
      setShowConfirmModal(false);
      setExtractedMarkers([]);
      setDateWasFallback(false);
      fetchReports();
      requestSync();
    } catch (err) {
      Alert.alert(t('error'), friendlyError(err, t, 'error_save_failed'));
    }
  }

  // Export the user's health records (labs + vaccines) as PDF or CSV.
  function handleExport() {
    Alert.alert(t('export_records'), t('export_choose'), [
      { text: 'PDF', onPress: () => doExport('pdf') },
      { text: 'CSV', onPress: () => doExport('csv') },
      { text: t('cancel'), style: 'cancel' },
    ]);
  }

  async function doExport(kind) {
    setExporting(true);
    try {
      const user = await getCachedUser();
      if (!user) { setExporting(false); return; }
      const data = getAllDataForExport(user.id);
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
        const csv = buildRecordsCSV(data, labels);
        uri = FileSystem.documentDirectory + 'dosetrace_records.csv';
        await FileSystem.writeAsStringAsync(uri, csv);
        mime = 'text/csv';
      } else {
        const html = buildRecordsHTML(data, {
          labels,
          title: t('export_title'),
          exportedOn: `${t('export_exported_prefix')} ${dateStr}`,
          disclaimer: t('export_disclaimer'),
        });
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

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t('tab_body')}</Text>
        <View style={s.headerActions}>
          {(section === 'labs' || section === 'vaccines') && (
            <TouchableOpacity style={s.exportBtn} onPress={handleExport} disabled={exporting}>
              <Text style={s.exportBtnText}>{exporting ? '…' : `⬆ ${t('export_records')}`}</Text>
            </TouchableOpacity>
          )}
          {section === 'labs' && (
            <TouchableOpacity style={s.addBtn} onPress={handleUploadPress}>
              <Text style={s.addBtnText}>{t('blood_upload')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={s.sectionTabs}>
        <TouchableOpacity
          style={[s.sectionTab, section === 'labs' && s.sectionTabOn]}
          onPress={() => setSection('labs')}
        >
          <Text style={[s.sectionTabText, section === 'labs' && s.sectionTabTextOn]}>{t('body_section_labs')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.sectionTab, section === 'vaccines' && s.sectionTabOn]}
          onPress={() => setSection('vaccines')}
        >
          <Text style={[s.sectionTabText, section === 'vaccines' && s.sectionTabTextOn]}>{t('body_section_vaccines')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.sectionTab, section === 'calc' && s.sectionTabOn]}
          onPress={() => setSection('calc')}
        >
          <Text style={[s.sectionTabText, section === 'calc' && s.sectionTabTextOn]}>{t('body_section_calc')}</Text>
        </TouchableOpacity>
      </View>

      {section === 'vaccines' ? (
        <VaccinesSection />
      ) : section === 'calc' ? (
        <CalculatorSection />
      ) : (
      <>
      {uploading && (
        <View style={s.uploadingBanner}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={s.uploadingText}>{t('blood_uploading')}</Text>
        </View>
      )}

      {!premium && (
        <View style={s.premiumBanner}>
          <View style={s.premiumBannerLeft}>
            <Text style={s.premiumBannerTitle}>{t('blood_premium_badge')}</Text>
            <Text style={s.premiumBannerSub}>
              {uploadCount === 0 ? t('blood_first_free') : t('blood_premium_only')}
            </Text>
          </View>
          <TouchableOpacity
            style={s.premiumBannerBtn}
            onPress={() => setShowUpgradeModal(true)}
          >
            <Text style={s.premiumBannerBtnText}>{t('blood_upgrade')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll}>

        {rows.length === 0 && !loading && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>🩸</Text>
            <Text style={s.emptyTitle}>{t('blood_empty_title')}</Text>
            <Text style={s.emptySub}>
              {t('blood_empty_sub')}
            </Text>
            <TouchableOpacity style={s.emptyBtn} onPress={handleUploadPress}>
  <Text style={s.emptyBtnText}>{t('blood_upload_report')}</Text>
</TouchableOpacity>
            <View style={s.tipBox}>
              <Text style={s.tipTitle}>{t('blood_what_we_read')}</Text>
              {[
                t('blood_tip_1'),
                t('blood_tip_2'),
                t('blood_tip_3'),
                t('blood_tip_4'),
                t('blood_tip_5'),
              ].map((tip, i) => (
                <View key={i} style={s.tipRow}>
                  <View style={s.tipDot} />
                  <Text style={s.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {rows.length > 0 && (
          <>
            <Text style={s.hubDisclaimer}>{t('blood_hub_disclaimer')}</Text>

            <View style={s.segment}>
              <TouchableOpacity
                style={[s.segmentBtn, viewMode === 'date' && s.segmentBtnOn]}
                onPress={() => setViewMode('date')}
              >
                <Text style={[s.segmentText, viewMode === 'date' && s.segmentTextOn]}>{t('blood_view_by_date')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.segmentBtn, viewMode === 'marker' && s.segmentBtnOn]}
                onPress={() => setViewMode('marker')}
              >
                <Text style={[s.segmentText, viewMode === 'marker' && s.segmentTextOn]}>{t('blood_view_by_marker')}</Text>
              </TouchableOpacity>
            </View>

            <View style={s.controlsRow}>
              <TextInput
                style={s.searchInput}
                placeholder={t('blood_search_ph')}
                placeholderTextColor={colors.textFaint}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {viewMode === 'date' && (
                <TouchableOpacity style={s.sortBtn} onPress={() => setNewestFirst(v => !v)}>
                  <Text style={s.sortBtnText}>{newestFirst ? t('blood_sort_newest') : t('blood_sort_oldest')}</Text>
                </TouchableOpacity>
              )}
              {viewMode === 'marker' && (
                <TouchableOpacity
                  style={[s.sortBtn, favOnly && s.sortBtnOn]}
                  onPress={() => setFavOnly(v => !v)}
                  accessibilityLabel={t('blood_favorites')}
                >
                  <Text style={[s.sortBtnText, favOnly && s.sortBtnTextOn]}>★ {t('blood_favorites')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {viewMode === 'date' && reports.length === 0 && (
              <Text style={s.noResults}>{t('blood_no_results')}</Text>
            )}
            {viewMode === 'marker' && markerSeries.length === 0 && (
              <Text style={s.noResults}>{t('blood_no_results')}</Text>
            )}

            {viewMode === 'date' && reports.map(([date, markers], i) => (
              <View key={date} style={s.reportGroup}>
                <TouchableOpacity
                  style={s.reportHeader}
                  onPress={() => setExpanded(expanded === date ? null : date)}
                >
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={s.reportDate}>{formatDate(date)}</Text>
                    <Text style={s.reportCount}>{markers.length} {t('blood_markers')}</Text>
                    {(reportTags[date] || []).length > 0 && (
                      <View style={s.tagChipsPreview}>
                        {(reportTags[date] || []).map((tg, k) => (
                          <View key={k} style={s.tagChip}><Text style={s.tagChipText}>{tg}</Text></View>
                        ))}
                      </View>
                    )}
                  </View>
                  <View style={s.reportBadges}>
                    <Text style={s.chevron}>{expanded === date ? '▲' : '▶'}</Text>
                  </View>
                </TouchableOpacity>

                {expanded === date && (
                  <View style={s.markerList}>
                    <View style={s.tagEditor}>
                      <Text style={s.tagEditorLabel}>{t('blood_tags_title')}</Text>
                      <View style={s.tagEditorChips}>
                        {(reportTags[date] || []).map((tg, k) => (
                          <TouchableOpacity key={k} style={s.tagChipEditable} onPress={() => removeReportTag(date, tg)}>
                            <Text style={s.tagChipText}>{tg}</Text>
                            <Text style={s.tagChipX}> ✕</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={s.tagInputRow}>
                        <TextInput
                          style={s.tagInput}
                          placeholder={t('blood_tag_ph')}
                          placeholderTextColor={colors.textFaint}
                          value={expanded === date ? tagDraft : ''}
                          onChangeText={setTagDraft}
                          onSubmitEditing={() => addReportTag(date)}
                          returnKeyType="done"
                          autoCapitalize="none"
                        />
                        <TouchableOpacity style={s.tagAddBtn} onPress={() => addReportTag(date)}>
                          <Text style={s.tagAddBtnText}>{t('blood_tag_add')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    {markers.map((m, j) => (
                      <View key={j} style={s.markerRow}>
                        <View style={s.markerLeft}>
                          <Text style={s.markerName}>{m.marker}</Text>
                        </View>
                        <View style={s.markerRight}>
                          <Text style={s.markerValue}>
                            {m.value} {m.unit}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}

            {viewMode === 'marker' && markerSeries.map((mk) => (
              <View key={mk.marker} style={s.reportGroup}>
                <View style={s.markerHeaderRow}>
                  <TouchableOpacity
                    style={s.starBtn}
                    onPress={() => toggleFavorite(mk.marker)}
                    hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                    accessibilityLabel={t('blood_favorites')}
                  >
                    <Text style={[s.star, mk.isFav && s.starOn]}>{mk.isFav ? '★' : '☆'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.markerHeaderMain}
                    onPress={() => setExpandedMarker(expandedMarker === mk.marker ? null : mk.marker)}
                  >
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={s.reportDate}>{mk.marker}</Text>
                      <Text style={s.reportCount}>
                        {mk.points.length} {mk.points.length === 1 ? t('blood_reading') : t('blood_readings')}
                      </Text>
                    </View>
                    <View style={s.reportBadges}>
                      <Text style={s.markerLatest}>{mk.latest.value} {mk.unit}</Text>
                      <Text style={s.chevron}>{expandedMarker === mk.marker ? '▲' : '▶'}</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {expandedMarker === mk.marker && (
                  <View style={s.markerExpanded}>
                    {mk.points.length >= 2 ? (
                      <MarkerChart points={mk.points} unit={mk.unit} locale={locale} width={CHART_WIDTH} />
                    ) : (
                      <Text style={s.singlePointHint}>{t('blood_need_more')}</Text>
                    )}
                    <View style={s.markerHistory}>
                      {mk.points.slice().reverse().map((p, j) => (
                        <View key={j} style={s.markerRow}>
                          <Text style={s.markerName}>{formatDate(p.date)}</Text>
                          <Text style={s.markerValue}>{p.value} {p.unit}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            ))}
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
            <TouchableOpacity onPress={() => setShowUpgradeModal(false)} style={{ width: 60, alignItems: 'flex-end' }}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
            <View style={s.upgradeHero}>
              <Text style={s.upgradeIcon}>🩸</Text>
              <Text style={s.upgradeTitle}>{t('blood_upgrade_title')}</Text>
              <Text style={s.upgradeSub}>
                {t('blood_upgrade_sub')}
              </Text>
            </View>

            <View style={s.upgradeFeats}>
              {UPGRADE_FEATURES.map((f, i) => (
                <View key={i} style={s.upgradeFeat}>
                  <Text style={s.upgradeCheck}>✓</Text>
                  <Text style={s.upgradeFeatText}>{f}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
  style={s.upgradePrimaryBtn}
  onPress={() => {
    setShowUpgradeModal(false);
    setTimeout(() => navigation.navigate('Paywall'), 300);
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
              <Text style={s.confirmBannerText}>
                ✓ {t('blood_review_found_prefix')} {extractedMarkers.length} {t('blood_review_found_suffix')} {formatDate(reportDate)}
              </Text>
            </View>
            {dateWasFallback && (
              <View style={s.dateFallbackBanner}>
                <Text style={s.dateFallbackText}>{t('blood_date_fallback_note')}</Text>
              </View>
            )}
            <Text style={s.confirmNote}>
              {t('blood_review_note')}
            </Text>

            {extractedMarkers.map((m, i) => (
              <View key={i} style={s.markerRow}>
                <View style={s.markerLeft}>
                  <Text style={s.markerName}>{m.marker}</Text>
                </View>
                <View style={s.markerRight}>
                  <Text style={s.markerValue}>
                    {m.value} {m.unit}
                  </Text>
                </View>
              </View>
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
      </>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 20, backgroundColor: c.card },
  headerTitle: { fontSize: 24, fontWeight: '700', color: c.text },
  addBtn: { backgroundColor: c.accent, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  addBtnText: { color: c.accentText, fontSize: 13, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exportBtn: { backgroundColor: c.card2, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 0.5, borderColor: c.border },
  exportBtnText: { color: c.accent, fontSize: 13, fontWeight: '600' },
  uploadingBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.accentSoft, paddingHorizontal: 20, paddingVertical: 10 },
  uploadingText: { fontSize: 13, color: c.accent },
  premiumBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.accentSoft, borderBottomWidth: 0.5, borderBottomColor: c.border },
  premiumBannerLeft: { flex: 1, marginRight: 12 },
  premiumBannerTitle: { fontSize: 12, fontWeight: '600', color: c.accentSoftText, marginBottom: 2 },
  premiumBannerSub: { fontSize: 11, color: c.accent, lineHeight: 16 },
  premiumBannerBtn: { backgroundColor: c.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  premiumBannerBtnText: { color: c.accentText, fontSize: 12, fontWeight: '600' },
  scroll: { flex: 1, padding: 16 },
  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: c.text, marginBottom: 8 },
  emptySub: { fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24, paddingHorizontal: 20 },
  emptyBtn: { backgroundColor: c.accent, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12, marginBottom: 24 },
  emptyBtnText: { color: c.accentText, fontSize: 14, fontWeight: '600' },
  tipBox: { backgroundColor: c.card2, borderRadius: 12, padding: 14, width: '100%', borderWidth: 0.5, borderColor: c.border },
  tipTitle: { fontSize: 11, fontWeight: '600', color: c.textFaint, letterSpacing: 0.5, marginBottom: 10 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  tipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent, marginTop: 5, flexShrink: 0 },
  tipText: { fontSize: 12, color: c.textMuted, flex: 1, lineHeight: 18 },
  sectionTabs: { flexDirection: 'row', backgroundColor: c.card, paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  sectionTab: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: c.card2 },
  sectionTabOn: { backgroundColor: c.accent },
  sectionTabText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
  sectionTabTextOn: { color: c.accentText },
  hubDisclaimer: { fontSize: 11, color: c.textFaint, lineHeight: 16, marginBottom: 12 },
  segment: { flexDirection: 'row', backgroundColor: c.card2, borderRadius: 10, padding: 3, marginBottom: 10 },
  segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentBtnOn: { backgroundColor: c.card, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  segmentText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
  segmentTextOn: { color: c.text },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  searchInput: { flex: 1, backgroundColor: c.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: c.text, borderWidth: 0.5, borderColor: c.border },
  sortBtn: { backgroundColor: c.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 0.5, borderColor: c.border },
  sortBtnOn: { backgroundColor: c.accentSoft, borderColor: c.accent },
  sortBtnText: { fontSize: 12, fontWeight: '600', color: c.accent },
  sortBtnTextOn: { color: c.accent },
  markerHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  starBtn: { paddingLeft: 12, paddingRight: 4, paddingVertical: 14 },
  star: { fontSize: 18, color: c.textFaint },
  starOn: { color: c.warning },
  markerHeaderMain: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 14, paddingVertical: 14, paddingLeft: 4 },
  noResults: { fontSize: 13, color: c.textMuted, textAlign: 'center', paddingVertical: 24 },
  markerLatest: { fontSize: 13, fontWeight: '700', color: c.text, marginRight: 6 },
  tagChipsPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tagChip: { backgroundColor: c.accentSoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagChipText: { fontSize: 11, color: c.accentSoftText, fontWeight: '500' },
  tagEditor: { padding: 14, borderBottomWidth: 0.5, borderBottomColor: c.border, backgroundColor: c.card2 },
  tagEditorLabel: { fontSize: 11, fontWeight: '600', color: c.textFaint, letterSpacing: 0.4, marginBottom: 8 },
  tagEditorChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  tagChipEditable: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.accentSoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  tagChipX: { fontSize: 10, color: c.accentSoftText },
  tagInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tagInput: { flex: 1, backgroundColor: c.card, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, color: c.text, borderWidth: 0.5, borderColor: c.border },
  tagAddBtn: { backgroundColor: c.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  tagAddBtnText: { color: c.accentText, fontSize: 13, fontWeight: '600' },
  markerExpanded: { borderTopWidth: 0.5, borderTopColor: c.border, padding: 14 },
  singlePointHint: { fontSize: 12, color: c.textMuted, textAlign: 'center', paddingVertical: 18, lineHeight: 18 },
  markerHistory: { marginTop: 8 },
  reportGroup: { backgroundColor: c.card, borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  reportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  reportDate: { fontSize: 14, fontWeight: '600', color: c.text },
  reportCount: { fontSize: 11, color: c.textMuted, marginTop: 2 },
  reportBadges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chevron: { fontSize: 11, color: c.textFaint, marginLeft: 4 },
  markerList: { borderTopWidth: 0.5, borderTopColor: c.border },
  markerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 0.5, borderBottomColor: c.border },
  markerLeft: { flex: 1 },
  markerName: { fontSize: 13, fontWeight: '500', color: c.text },
  markerRight: { alignItems: 'flex-end' },
  markerValue: { fontSize: 13, fontWeight: '600', color: c.text },
  modal: { flex: 1, backgroundColor: c.card },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: c.border },
  modalTitle: { fontSize: 15, fontWeight: '600', color: c.text },
  modalClose: { fontSize: 14, color: c.textMuted },
  modalBody: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  upgradeHero: { alignItems: 'center', marginBottom: 24 },
  upgradeIcon: { fontSize: 48, marginBottom: 12 },
  upgradeTitle: { fontSize: 20, fontWeight: '600', color: c.text, marginBottom: 8, textAlign: 'center' },
  upgradeSub: { fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 20 },
  upgradeFeats: { backgroundColor: c.card2, borderRadius: 12, padding: 14, marginBottom: 20 },
  upgradeFeat: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  upgradeCheck: { color: c.success, fontWeight: '600', fontSize: 14 },
  upgradeFeatText: { fontSize: 13, color: c.textMuted, flex: 1, lineHeight: 20 },
  upgradePrimaryBtn: { backgroundColor: c.accent, padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  upgradePrimaryBtnText: { color: c.accentText, fontSize: 15, fontWeight: '600' },
  upgradeTrialNote: { fontSize: 11, color: c.textFaint, textAlign: 'center', marginBottom: 20 },
  upgradeDivider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  upgradeDividerLine: { flex: 1, height: 0.5, backgroundColor: c.border },
  upgradeDividerText: { fontSize: 12, color: c.textFaint },
  upgradeSecBtn: { borderWidth: 1, borderColor: c.border, padding: 13, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  upgradeSecBtnText: { fontSize: 14, color: c.textMuted, fontWeight: '500' },
  upgradeSecNote: { fontSize: 11, color: c.textFaint, textAlign: 'center' },
  confirmBanner: { backgroundColor: c.successSoft, borderRadius: 10, padding: 12, marginBottom: 16 },
  confirmBannerText: { fontSize: 13, color: c.successSoftText, fontWeight: '500' },
  dateFallbackBanner: { backgroundColor: c.accentSoft, borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 0.5, borderColor: c.border },
  dateFallbackText: { fontSize: 12, color: c.accentSoftText, lineHeight: 18 },
  confirmNote: { fontSize: 13, color: c.textMuted, marginBottom: 16, lineHeight: 20 },
  upgradePrimaryBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 3 },
trialBadge: { backgroundColor: c.successSoft, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center', marginBottom: 20 },
trialBadgeText: { fontSize: 13, color: c.successSoftText, fontWeight: '600' },
});