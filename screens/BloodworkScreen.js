import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { Analytics } from '../lib/analytics';
import { getBiomarkers, insertBiomarkers } from '../lib/database';
import { requestSync } from '../lib/sync';

export default function BloodworkScreen({ navigation }) {
  const { t } = useLanguage();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [extractedMarkers, setExtractedMarkers] = useState([]);
  const [reportDate, setReportDate] = useState('');
  const [uploadCount, setUploadCount] = useState(0);
  const [expanded, setExpanded] = useState(null);

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
    const user = await getCachedUser();
    if (!user) { setLoading(false); return; }
    const data = getBiomarkers(user.id);
    if (data) {
      const grouped = {};
      data.forEach(row => {
        if (!grouped[row.report_date]) grouped[row.report_date] = [];
        grouped[row.report_date].push(row);
      });
      setReports(Object.entries(grouped));
      setUploadCount(Object.keys(grouped).length);
    }
    setLoading(false);
  }

  async function handleUploadPress() {
  setShowUpgradeModal(true);
}

  async function pickAndExtract() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      setUploading(true);
      const file = result.assets[0];
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await extractWithClaude(base64);
    } catch (err) {
      setUploading(false);
      Alert.alert(t('error'), t('blood_error_read'));
    }
  }

  async function extractWithClaude(base64Data) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: base64Data,
                  },
                },
                {
                  type: 'text',
                  text: `Extract all lab values from this report. Return ONLY a JSON object with this exact structure, no other text:
{
  "report_date": "YYYY-MM-DD",
  "markers": [
    {
      "marker": "Marker name",
      "value": numeric_value,
      "unit": "unit string"
    }
  ]
}
If you cannot determine the report date, use today's date. Include every lab value you can find. Do not interpret, classify, or judge any values. Do not include reference ranges, status, or any clinical assessment. Do not include any explanation or markdown.`,
                },
              ],
            },
          ],
        }),
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);

      setExtractedMarkers(parsed.markers || []);
      setReportDate(parsed.report_date || new Date().toISOString().split('T')[0]);
      setUploading(false);
      setShowConfirmModal(true);
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
      if (!user) { Alert.alert(t('error'), 'Not signed in'); return; }
      const rows = extractedMarkers.map(m => ({
        user_id: user.id,
        report_date: reportDate,
        marker: m.marker,
        value: m.value,
        unit: m.unit || '',
      }));

      insertBiomarkers(rows);
      Analytics.bloodworkUploaded({ biomarkerCount: rows.length });
      setShowConfirmModal(false);
      setExtractedMarkers([]);
      fetchReports();
      requestSync();
    } catch (err) {
      Alert.alert(t('error'), err.message);
    }
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t('blood_title')}</Text>
        <TouchableOpacity style={s.addBtn} onPress={handleUploadPress}>
          <Text style={s.addBtnText}>{t('blood_upload')}</Text>
        </TouchableOpacity>
      </View>

      {uploading && (
        <View style={s.uploadingBanner}>
          <ActivityIndicator size="small" color="#185FA5" />
          <Text style={s.uploadingText}>{t('blood_uploading')}</Text>
        </View>
      )}

      <View style={s.premiumBanner}>
        <View style={s.premiumBannerLeft}>
          <Text style={s.premiumBannerTitle}>{t('blood_premium_badge')}</Text>
          <Text style={s.premiumBannerSub}>
            {uploadCount === 0
              ? t('blood_first_free')
              : t('blood_unlimited')}
          </Text>
        </View>
        <TouchableOpacity
          style={s.premiumBannerBtn}
          onPress={() => navigation.navigate('Paywall')}
        >
          <Text style={s.premiumBannerBtnText}>{t('blood_upgrade')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll}>

        {reports.length === 0 && !loading && (
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

        {reports.map(([date, markers], i) => (
          <View key={i} style={s.reportGroup}>
            <TouchableOpacity
              style={s.reportHeader}
              onPress={() => setExpanded(expanded === date ? null : date)}
            >
              <View>
                <Text style={s.reportDate}>{formatDate(date)}</Text>
                <Text style={s.reportCount}>{markers.length} {t('blood_markers')}</Text>
              </View>
              <View style={s.reportBadges}>
                <Text style={s.chevron}>{expanded === date ? '▲' : '▶'}</Text>
              </View>
            </TouchableOpacity>

            {expanded === date && (
              <View style={s.markerList}>
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

            <View style={s.upgradeDivider}>
              <View style={s.upgradeDividerLine} />
              <Text style={s.upgradeDividerText}>{t('blood_or')}</Text>
              <View style={s.upgradeDividerLine} />
            </View>

            <TouchableOpacity
  style={s.upgradeSecBtn}
  onPress={() => {
    setShowUpgradeModal(false);
    setTimeout(() => pickAndExtract(), 300);
  }}
>
  <Text style={s.upgradeSecBtnText}>{t('blood_pay_single')}</Text>
</TouchableOpacity>
            <Text style={s.upgradeSecNote}>
              {t('blood_pay_note')}
            </Text>

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* CONFIRM MODAL */}
      <Modal visible={showConfirmModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.modalNav}>
            <TouchableOpacity
              onPress={() => { setShowConfirmModal(false); setExtractedMarkers([]); }}
              style={{ width: 60 }}
            >
              <Text style={s.modalClose}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>{t('blood_review_title')}</Text>
            <TouchableOpacity onPress={saveMarkers} style={{ width: 60, alignItems: 'flex-end' }}>
              <Text style={[s.modalClose, { color: '#185FA5', fontWeight: '600' }]}>{t('save')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
            <View style={s.confirmBanner}>
              <Text style={s.confirmBannerText}>
                ✓ {t('blood_review_found_prefix')} {extractedMarkers.length} {t('blood_review_found_suffix')} {formatDate(reportDate)}
              </Text>
            </View>
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 20, backgroundColor: '#fff' },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#111' },
  addBtn: { backgroundColor: '#185FA5', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  addBtnText: { color: 'white', fontSize: 13, fontWeight: '600' },
  uploadingBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#E6F1FB', paddingHorizontal: 20, paddingVertical: 10 },
  uploadingText: { fontSize: 13, color: '#185FA5' },
  premiumBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#E6F1FB', borderBottomWidth: 0.5, borderBottomColor: '#c5daf5' },
  premiumBannerLeft: { flex: 1, marginRight: 12 },
  premiumBannerTitle: { fontSize: 12, fontWeight: '600', color: '#0C447C', marginBottom: 2 },
  premiumBannerSub: { fontSize: 11, color: '#185FA5', lineHeight: 16 },
  premiumBannerBtn: { backgroundColor: '#185FA5', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  premiumBannerBtnText: { color: 'white', fontSize: 12, fontWeight: '600' },
  scroll: { flex: 1, padding: 16 },
  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 8 },
  emptySub: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 20, marginBottom: 24, paddingHorizontal: 20 },
  emptyBtn: { backgroundColor: '#185FA5', paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12, marginBottom: 24 },
  emptyBtnText: { color: 'white', fontSize: 14, fontWeight: '600' },
  tipBox: { backgroundColor: '#f9f9f9', borderRadius: 12, padding: 14, width: '100%', borderWidth: 0.5, borderColor: '#eee' },
  tipTitle: { fontSize: 11, fontWeight: '600', color: '#aaa', letterSpacing: 0.5, marginBottom: 10 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  tipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#185FA5', marginTop: 5, flexShrink: 0 },
  tipText: { fontSize: 12, color: '#666', flex: 1, lineHeight: 18 },
  reportGroup: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  reportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  reportDate: { fontSize: 14, fontWeight: '600', color: '#111' },
  reportCount: { fontSize: 11, color: '#888', marginTop: 2 },
  reportBadges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chevron: { fontSize: 11, color: '#aaa', marginLeft: 4 },
  markerList: { borderTopWidth: 0.5, borderTopColor: '#f0f0f0' },
  markerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 0.5, borderBottomColor: '#f5f5f5' },
  markerLeft: { flex: 1 },
  markerName: { fontSize: 13, fontWeight: '500', color: '#111' },
  markerRight: { alignItems: 'flex-end' },
  markerValue: { fontSize: 13, fontWeight: '600', color: '#333' },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  modalClose: { fontSize: 14, color: '#888' },
  modalBody: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  upgradeHero: { alignItems: 'center', marginBottom: 24 },
  upgradeIcon: { fontSize: 48, marginBottom: 12 },
  upgradeTitle: { fontSize: 20, fontWeight: '600', color: '#111', marginBottom: 8, textAlign: 'center' },
  upgradeSub: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 20 },
  upgradeFeats: { backgroundColor: '#f9f9f9', borderRadius: 12, padding: 14, marginBottom: 20 },
  upgradeFeat: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  upgradeCheck: { color: '#1D9E75', fontWeight: '600', fontSize: 14 },
  upgradeFeatText: { fontSize: 13, color: '#444', flex: 1, lineHeight: 20 },
  upgradePrimaryBtn: { backgroundColor: '#185FA5', padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  upgradePrimaryBtnText: { color: 'white', fontSize: 15, fontWeight: '600' },
  upgradeTrialNote: { fontSize: 11, color: '#aaa', textAlign: 'center', marginBottom: 20 },
  upgradeDivider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  upgradeDividerLine: { flex: 1, height: 0.5, backgroundColor: '#ddd' },
  upgradeDividerText: { fontSize: 12, color: '#aaa' },
  upgradeSecBtn: { borderWidth: 1, borderColor: '#ddd', padding: 13, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  upgradeSecBtnText: { fontSize: 14, color: '#666', fontWeight: '500' },
  upgradeSecNote: { fontSize: 11, color: '#aaa', textAlign: 'center' },
  confirmBanner: { backgroundColor: '#E1F5EE', borderRadius: 10, padding: 12, marginBottom: 16 },
  confirmBannerText: { fontSize: 13, color: '#085041', fontWeight: '500' },
  confirmNote: { fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 20 },
  upgradePrimaryBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 3 },
trialBadge: { backgroundColor: '#E1F5EE', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center', marginBottom: 20 },
trialBadgeText: { fontSize: 13, color: '#085041', fontWeight: '600' },
});