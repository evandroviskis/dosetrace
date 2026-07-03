import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Platform,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { syncVialAlerts } from '../lib/notifications';
import {
  getActiveVials,
  getActiveProtocols,
  getProtocolById,
  insertVial,
  updateVial,
} from '../lib/database';
import { requestSync } from '../lib/sync';

const LOCALES = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };

export default function VialScreen() {
  const [vials, setVials] = useState([]);
  const [protocols, setProtocols] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [selectedProtocol, setSelectedProtocol] = useState(null);
  const [mixedOn, setMixedOn] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [waterMl, setWaterMl] = useState('');
  const [totalDoses, setTotalDoses] = useState('');
  const [saving, setSaving] = useState(false);
  const [showWaterInput, setShowWaterInput] = useState(false);
  const [waterInput, setWaterInput] = useState('');
  const { t, language } = useLanguage();
  const locale = LOCALES[language] || 'en-US';

  useFocusEffect(
    useCallback(() => {
      fetchVials();
      fetchProtocols();
    }, [])
  );

  async function fetchVials() {
    const user = await getCachedUser();
    if (!user) { setVials([]); return; }
    const rows = getActiveVials(user.id) || [];
    // Join protocol name/color locally (protocol may be inactive or deleted)
    const mapped = rows.map(v => {
      const p = v.protocol_id ? getProtocolById(v.protocol_id) : null;
      return { ...v, protocols: p ? { name: p.name, color: p.color } : null };
    });
    setVials(mapped);
  }

  async function fetchProtocols() {
    const user = await getCachedUser();
    if (!user) { setProtocols([]); return; }
    const rows = getActiveProtocols(user.id) || [];
    setProtocols(rows.filter(p => p.type === 'recon'));
  }

  function selectProtocol(p) {
    setSelectedProtocol(p);
    if (p.water) setWaterMl(String(p.water));
  }

  // Parse a date-only string ('YYYY-MM-DD') as local midnight, not UTC
  function parseDateOnly(dateStr) {
    return new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  }

  function daysUntilExpiry(mixedOn) {
    if (!mixedOn) return 0;
    const expiry = parseDateOnly(mixedOn);
    expiry.setDate(expiry.getDate() + 30);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((expiry - today) / (1000 * 60 * 60 * 24));
  }

  function expiryColor(days) {
    if (days <= 3) return '#E24B4A';
    if (days <= 7) return '#BA7517';
    return '#555';
  }

  function expiryBgColor(days) {
    if (days <= 3) return '#FCEBEB';
    if (days <= 7) return '#FAEEDA';
    return '#f0f0f0';
  }

  function formatDate(date) {
    return date.toLocaleDateString(locale, {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  }

  function formatShortDate(dateStr) {
    if (!dateStr) return '—';
    return parseDateOnly(dateStr).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  }

  function formatExpiryDate(mixedOn) {
    if (!mixedOn) return '—';
    const expiry = parseDateOnly(mixedOn);
    expiry.setDate(expiry.getDate() + 30);
    return expiry.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  }

  function toDateOnlyString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function adjustWater(dir) {
    const current = parseFloat(waterMl) || 0;
    const next = Math.max(0.5, Math.round((current + dir * 0.5) * 10) / 10);
    setWaterMl(String(next));
  }

  function openNewVialModal() {
    setSelectedProtocol(null);
    setMixedOn(new Date());
    setWaterMl('');
    setTotalDoses('');
    setShowModal(true);
  }

  function openWaterInput() {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        t('vials_water_label'),
        '',
        (val) => { if (val) setWaterMl(val); },
        'plain-text',
        waterMl,
        'numeric'
      );
    } else {
      setWaterInput(waterMl);
      setShowWaterInput(true);
    }
  }

  async function saveVial() {
    if (!selectedProtocol) {
      Alert.alert(t('vials_select_compound'), t('vials_compound_hint'));
      return;
    }
    setSaving(true);
    try {
      const user = await getCachedUser();
      if (!user) { setSaving(false); Alert.alert(t('error'), t('protocols_not_signed_in')); return; }
      insertVial({
        user_id: user.id,
        protocol_id: selectedProtocol.id,
        protocol_remote_id: selectedProtocol.remote_id || null,
        mixed_on: toDateOnlyString(mixedOn),
        water_ml: parseFloat(waterMl) || null,
        total_doses: parseInt(totalDoses) || null,
        doses_taken: 0,
      });
      setSaving(false);
      setShowModal(false);
      setSelectedProtocol(null);
      setMixedOn(new Date());
      setWaterMl('');
      setTotalDoses('');
      fetchVials();
      syncVialAlerts().catch(() => {}); // Refresh vial expiry/supply alerts
      requestSync();
    } catch (err) {
      setSaving(false);
      Alert.alert(t('error'), err.message);
    }
  }

  async function discardVial(id) {
    Alert.alert(t('vials_discard'), t('vials_discard_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('vials_discard'), style: 'destructive',
        onPress: () => {
          try {
            updateVial(id, { active: 0 });
            fetchVials();
            syncVialAlerts().catch(() => {});
            requestSync();
          } catch (err) {
            Alert.alert(t('error'), err.message);
          }
        },
      },
    ]);
  }

  const expiringVials = vials.filter(v => daysUntilExpiry(v.mixed_on) <= 7);
  const activeVials = vials.filter(v => daysUntilExpiry(v.mixed_on) > 7);

  function VialCard({ v }) {
    const days = daysUntilExpiry(v.mixed_on);
    const dosesPct = v.total_doses
      ? ((v.total_doses - v.doses_taken) / v.total_doses) * 100
      : 0;
    const isExpiring = days <= 7;

    return (
      <TouchableOpacity
        style={[s.vialCard, isExpiring && { borderColor: expiryColor(days), borderWidth: 1.5 }]}
        onPress={() => setExpanded(expanded === v.id ? null : v.id)}
      >
        <View style={s.vialTop}>
          <View style={[s.vialDot, { backgroundColor: v.protocols?.color || '#185FA5' }]} />
          <View style={s.vialInfo}>
            <Text style={s.vialName}>{v.protocols?.name || '—'}</Text>
            <Text style={s.vialMeta}>
              {t('today_vial_mixed')} {formatShortDate(v.mixed_on)}
              {v.total_doses ? ` · ${v.total_doses - v.doses_taken} ${t('vials_doses_left')}` : ''}
            </Text>
          </View>
          <View style={[s.expiryBadge, { backgroundColor: expiryBgColor(days) }]}>
            <Text style={[s.expiryBadgeText, { color: expiryColor(days) }]}>
              {days <= 0 ? t('vials_expired') : `${days} ${t('vials_days_left')}`}
            </Text>
          </View>
        </View>

        {expanded === v.id && (
          <View style={s.vialBody}>
            {v.total_doses && (
              <View style={s.progressWrap}>
                <View style={s.progressRow}>
                  <Text style={s.progressLabel}>{t('vials_doses_remaining')}</Text>
                  <Text style={s.progressVal}>
                    {t('vials_count_of').replace('{x}', String(v.total_doses - v.doses_taken)).replace('{y}', String(v.total_doses))}
                  </Text>
                </View>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: `${dosesPct}%`, backgroundColor: expiryColor(days) }]} />
                </View>
              </View>
            )}
            <View style={s.progressWrap}>
              <View style={s.progressRow}>
                <Text style={s.progressLabel}>{t('vials_days_until_expiry')}</Text>
                <Text style={s.progressVal}>
                  {t('vials_days_of_total').replace('{x}', String(Math.max(days, 0))).replace('{y}', '30')}
                </Text>
              </View>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${Math.max((days / 30) * 100, 0)}%`, backgroundColor: expiryColor(days) }]} />
              </View>
            </View>
            <View style={s.detailGrid}>
              <View style={s.detailItem}>
                <Text style={s.detailLabel}>{t('vials_mix_date')}</Text>
                <Text style={s.detailVal}>{formatShortDate(v.mixed_on)}</Text>
              </View>
              <View style={s.detailItem}>
                <Text style={s.detailLabel}>{t('vials_expires')}</Text>
                <Text style={[s.detailVal, { color: expiryColor(days) }]}>
                  {formatExpiryDate(v.mixed_on)}
                </Text>
              </View>
            </View>
            <View style={s.vialActions}>
              <TouchableOpacity style={[s.vialBtn, s.vialBtnDanger]} onPress={() => discardVial(v.id)}>
                <Text style={s.vialBtnDangerText}>{t('vials_discard')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.vialBtn} onPress={openNewVialModal}>
                <Text style={s.vialBtnText}>{t('vials_mix_new')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t('vials_title')}</Text>
        <TouchableOpacity style={s.addBtn} onPress={openNewVialModal}>
          <Text style={s.addBtnText}>{t('vials_new_btn')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll}>
        <View style={s.summaryRow}>
          <View style={[s.summaryCard, { backgroundColor: '#E1F5EE' }]}>
            <Text style={[s.summaryVal, { color: '#085041' }]}>{vials.length}</Text>
            <Text style={[s.summaryLbl, { color: '#0F6E56' }]}>{t('vials_active')}</Text>
          </View>
          <View style={[s.summaryCard, expiringVials.length > 0 ? { backgroundColor: '#FAEEDA' } : {}]}>
            <Text style={[s.summaryVal, { color: expiringVials.length > 0 ? '#633806' : '#111' }]}>
              {expiringVials.length}
            </Text>
            <Text style={[s.summaryLbl, { color: expiringVials.length > 0 ? '#BA7517' : '#888' }]}>
              {t('vials_expiring_soon')}
            </Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryVal}>
              {vials.reduce((sum, v) => sum + ((v.total_doses || 0) - (v.doses_taken || 0)), 0)}
            </Text>
            <Text style={s.summaryLbl}>{t('vials_doses_left')}</Text>
          </View>
        </View>

        {vials.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>⚗️</Text>
            <Text style={s.emptyTitle}>{t('vials_empty_title')}</Text>
            <Text style={s.emptySub}>{t('vials_empty_sub')}</Text>
            <TouchableOpacity style={s.addBtn} onPress={openNewVialModal}>
              <Text style={s.addBtnText}>{t('vials_add')}</Text>
            </TouchableOpacity>
            <View style={s.tipBox}>
              <Text style={s.tipTitle}>{t('vials_why_track').toUpperCase()}</Text>
              {[
                t('vials_tip_1'),
                t('vials_tip_2'),
                t('vials_tip_3'),
              ].map((tip, i) => (
                <View key={i} style={s.tipRow}>
                  <View style={s.tipDot} />
                  <Text style={s.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {expiringVials.length > 0 && (
          <>
            <Text style={s.sectionLabel}>{t('vials_expiring_soon').toUpperCase()}</Text>
            {expiringVials.map(v => <VialCard key={v.id} v={v} />)}
          </>
        )}

        {activeVials.length > 0 && (
          <>
            <Text style={s.sectionLabel}>{t('vials_active').toUpperCase()}</Text>
            {activeVials.map(v => <VialCard key={v.id} v={v} />)}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.modalNav}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={s.modalCancel}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>{t('vials_log_mix')}</Text>
            <TouchableOpacity onPress={saveVial}>
              <Text style={s.modalSave}>{saving ? t('loading') : t('save')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={s.modalSub}>
              {t('vials_log_mix_sub')}
            </Text>

            <Text style={s.fieldLabel}>{t('vials_compound')}</Text>
            <Text style={s.fieldHint}>{t('vials_compound_hint')}</Text>
            {protocols.length === 0 && (
              <Text style={s.noProtocols}>
                {t('vials_no_protocols')}
              </Text>
            )}
            {protocols.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[s.protocolOption, selectedProtocol?.id === p.id && s.protocolOptionOn]}
                onPress={() => selectProtocol(selectedProtocol?.id === p.id ? null : p)}
              >
                <View style={[s.optDot, { backgroundColor: p.color }]} />
                <View style={s.optInfo}>
                  <Text style={[s.optText, selectedProtocol?.id === p.id && { color: '#0C447C', fontWeight: '600' }]}>
                    {p.name}
                  </Text>
                  {p.water && (
                    <Text style={s.optSub}>
                      {t('vials_mix_summary').replace('{amount}', String(p.amount)).replace('{water}', String(p.water))}
                    </Text>
                  )}
                </View>
                <View style={[s.optRadio, selectedProtocol?.id === p.id && s.optRadioOn]}>
                  {selectedProtocol?.id === p.id && <Text style={s.optCheck}>✓</Text>}
                </View>
              </TouchableOpacity>
            ))}

            <Text style={[s.fieldLabel, { marginTop: 8 }]}>{t('vials_mix_date')}</Text>
            <TouchableOpacity style={s.dateBtn} onPress={() => setShowDatePicker(true)}>
              <Text style={s.dateBtnText}>📅  {formatDate(mixedOn)}</Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={mixedOn}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={(event, selectedDate) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (selectedDate) setMixedOn(selectedDate);
                }}
              />
            )}

            {Platform.OS === 'ios' && showDatePicker && (
              <TouchableOpacity style={s.doneBtn} onPress={() => setShowDatePicker(false)}>
                <Text style={s.doneBtnText}>{t('done')}</Text>
              </TouchableOpacity>
            )}

            {selectedProtocol?.water ? (
              <View style={s.autoFillBox}>
                <Text style={s.autoFillText}>
                  💧 {t('vials_water_prefill')} <Text style={{ fontWeight: '600' }}>{waterMl} ml</Text>
                </Text>
              </View>
            ) : (
              <>
                <Text style={s.fieldLabel}>{t('vials_water_label')}</Text>
                <View style={s.stepperRow}>
                  <TouchableOpacity style={s.stepperBtn} onPress={() => adjustWater(-1)}>
                    <Text style={s.stepperBtnText}>−</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.stepperVal}
                    onLongPress={openWaterInput}
                  >
                    <Text style={s.stepperValText}>{waterMl || '0'} ml</Text>
                    <Text style={s.stepperHoldHint}>{t('vials_hold_type')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.stepperBtn} onPress={() => adjustWater(1)}>
                    <Text style={s.stepperBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.stepperHint}>{t('vials_steps')}</Text>
              </>
            )}

            <Text style={s.fieldLabel}>{t('vials_total_doses')}</Text>
            <View style={s.numberRow}>
              {['4', '6', '8', '10', '12', '16', '20', '30'].map(v => (
                <TouchableOpacity
                  key={v}
                  style={[s.numberBtn, totalDoses === v && s.numberBtnOn]}
                  onPress={() => setTotalDoses(totalDoses === v ? '' : v)}
                >
                  <Text style={[s.numberBtnText, totalDoses === v && s.numberBtnTextOn]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.infoBox}>
              <Text style={s.infoText}>
                {t('vials_bac_info')}
              </Text>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>

          {/* Android fallback for Alert.prompt (iOS-only): inline water input */}
          <Modal
            visible={showWaterInput}
            transparent
            animationType="fade"
            onRequestClose={() => setShowWaterInput(false)}
          >
            <View style={s.promptOverlay}>
              <View style={s.promptBox}>
                <Text style={s.promptTitle}>{t('vials_water_label')}</Text>
                <TextInput
                  style={s.promptInput}
                  value={waterInput}
                  onChangeText={setWaterInput}
                  keyboardType="decimal-pad"
                  autoFocus
                  placeholder="0"
                  placeholderTextColor="#aaa"
                />
                <View style={s.promptActions}>
                  <TouchableOpacity style={s.promptBtn} onPress={() => setShowWaterInput(false)}>
                    <Text style={s.promptBtnCancelText}>{t('cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.promptBtn, s.promptBtnPrimary]}
                    onPress={() => {
                      if (waterInput) setWaterMl(waterInput);
                      setShowWaterInput(false);
                    }}
                  >
                    <Text style={s.promptBtnOkText}>{t('done')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
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
  scroll: { flex: 1, padding: 16 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 10, alignItems: 'center', borderWidth: 0.5, borderColor: '#eee' },
  summaryVal: { fontSize: 20, fontWeight: '600', color: '#111' },
  summaryLbl: { fontSize: 10, color: '#888', marginTop: 2 },
  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 8 },
  emptySub: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn: { backgroundColor: '#185FA5', paddingVertical: 12, paddingHorizontal: 32, borderRadius: 10, marginBottom: 24 },
  emptyBtnText: { color: 'white', fontSize: 14, fontWeight: '600' },
  tipBox: { backgroundColor: '#f9f9f9', borderRadius: 12, padding: 14, width: '100%', borderWidth: 0.5, borderColor: '#eee' },
  tipTitle: { fontSize: 11, fontWeight: '600', color: '#aaa', letterSpacing: 0.5, marginBottom: 10 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  tipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#185FA5', marginTop: 5, flexShrink: 0 },
  tipText: { fontSize: 12, color: '#666', flex: 1, lineHeight: 18 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#aaa', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
  vialCard: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 10, overflow: 'hidden', borderWidth: 0.5, borderColor: '#eee' },
  vialTop: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  vialDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  vialInfo: { flex: 1 },
  vialName: { fontSize: 14, fontWeight: '600', color: '#111' },
  vialMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  expiryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  expiryBadgeText: { fontSize: 11, fontWeight: '600' },
  vialBody: { borderTopWidth: 0.5, borderTopColor: '#f0f0f0', padding: 14 },
  progressWrap: { marginBottom: 12 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 11, color: '#888' },
  progressVal: { fontSize: 11, fontWeight: '500', color: '#111' },
  progressTrack: { height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  detailGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  detailItem: { flex: 1, backgroundColor: '#f9f9f9', borderRadius: 8, padding: 10 },
  detailLabel: { fontSize: 10, color: '#888', marginBottom: 3 },
  detailVal: { fontSize: 13, fontWeight: '600', color: '#111' },
  vialActions: { flexDirection: 'row', gap: 8 },
  vialBtn: { flex: 1, padding: 9, borderRadius: 8, borderWidth: 0.5, borderColor: '#ddd', alignItems: 'center' },
  vialBtnText: { fontSize: 12, color: '#666' },
  vialBtnDanger: { borderColor: '#E24B4A' },
  vialBtnDangerText: { fontSize: 12, color: '#E24B4A' },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  modalCancel: { fontSize: 14, color: '#888' },
  modalTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  modalSave: { fontSize: 14, color: '#185FA5', fontWeight: '600' },
  modalBody: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  modalSub: { fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 20 },
  fieldLabel: { fontSize: 11, color: '#888', marginBottom: 4 },
  fieldHint: { fontSize: 11, color: '#aaa', marginBottom: 10, fontStyle: 'italic' },
  dateBtn: { backgroundColor: '#f9f9f9', borderWidth: 0.5, borderColor: '#ddd', borderRadius: 10, padding: 14, marginBottom: 14 },
  dateBtnText: { fontSize: 14, color: '#111' },
  doneBtn: { backgroundColor: '#185FA5', padding: 12, borderRadius: 10, alignItems: 'center', marginBottom: 14 },
  doneBtnText: { color: 'white', fontSize: 14, fontWeight: '600' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  stepperBtn: { width: 48, height: 48, borderRadius: 10, borderWidth: 0.5, borderColor: '#ddd', backgroundColor: '#f9f9f9', alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: { fontSize: 24, color: '#185FA5', fontWeight: '400' },
  stepperVal: { flex: 1, backgroundColor: '#E6F1FB', borderRadius: 10, padding: 12, alignItems: 'center' },
  stepperValText: { fontSize: 20, fontWeight: '600', color: '#0C447C' },
  stepperHoldHint: { fontSize: 10, color: '#185FA5', marginTop: 2 },
  stepperHint: { fontSize: 10, color: '#aaa', marginBottom: 12 },
  numberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  numberBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 0.5, borderColor: '#ddd', backgroundColor: '#f9f9f9' },
  numberBtnOn: { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  numberBtnText: { fontSize: 13, color: '#666' },
  numberBtnTextOn: { color: 'white', fontWeight: '600' },
  autoFillBox: { backgroundColor: '#E6F1FB', borderRadius: 10, padding: 12, marginBottom: 16 },
  autoFillText: { fontSize: 12, color: '#0C447C', lineHeight: 18 },
  protocolOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 0.5, borderColor: '#ddd', backgroundColor: '#f9f9f9', marginBottom: 8 },
  protocolOptionOn: { borderWidth: 2, borderColor: '#185FA5', backgroundColor: '#E6F1FB' },
  optDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  optInfo: { flex: 1 },
  optText: { fontSize: 13, color: '#666' },
  optSub: { fontSize: 11, color: '#aaa', marginTop: 2 },
  optRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center' },
  optRadioOn: { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  optCheck: { fontSize: 11, color: 'white', fontWeight: '700' },
  noProtocols: { fontSize: 12, color: '#E24B4A', marginBottom: 14 },
  infoBox: { backgroundColor: '#E6F1FB', borderRadius: 10, padding: 12, marginTop: 4 },
  infoText: { fontSize: 12, color: '#0C447C', lineHeight: 18 },
  promptOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 32 },
  promptBox: { backgroundColor: '#fff', borderRadius: 14, padding: 18 },
  promptTitle: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 12 },
  promptInput: { borderWidth: 0.5, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 16, color: '#111', backgroundColor: '#f9f9f9', marginBottom: 14 },
  promptActions: { flexDirection: 'row', gap: 8 },
  promptBtn: { flex: 1, padding: 11, borderRadius: 10, alignItems: 'center', borderWidth: 0.5, borderColor: '#ddd' },
  promptBtnPrimary: { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  promptBtnCancelText: { fontSize: 14, color: '#666' },
  promptBtnOkText: { fontSize: 14, color: 'white', fontWeight: '600' },
});