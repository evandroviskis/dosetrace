/**
 * DoseTrace — Vaccines section (inside the Body hub)
 *
 * A personal vaccine log the user fills in themselves: name, date given,
 * optional next-due date, notes. Sort by date, search by name, edit, delete.
 *
 * IMPORTANT — regulatory framing:
 *   The user enters everything. The app NEVER advises which vaccines to get
 *   or when — the next-due date is whatever the user typed. No schedules, no
 *   recommendations, no interpretation. It's a record, not medical advice.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Modal, Platform,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { getCachedUser, supabase } from '../../lib/supabase';
import { requestAIConsent } from '../../lib/aiConsent';
import { isPremium } from '../../lib/purchases';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme, TYPE } from '../../lib/theme';
import { Card, Chip, SectionLabel } from '../../components/ui';
import Svg, { Path } from 'react-native-svg';
import FeatureIcon from '../../components/FeatureIcon';
import { CONTENT_MAX_WIDTH } from '../../lib/responsive';
import { getVaccines, insertVaccine, updateVaccine, deleteVaccine } from '../../lib/database';
import { requestSync } from '../../lib/sync';
import { hasNativeModule } from '../../lib/nativeModule';
import { CrossMark } from '../../components/CheckMark';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Drawn glyphs (hybrid restyle) replacing the old ＋ and › text glyphs.
function PlusGlyph({ color, size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
function ChevronRight({ color, size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5.5l6.5 6.5L9 18.5" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Sanitize an extracted vaccine row: require a name + valid ISO date_given,
// null-out an invalid next_due, coerce notes to a string.
function validateVaccine(v) {
  if (!v || typeof v.name !== 'string' || !v.name.trim()) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const dateGiven = typeof v.date_given === 'string' && iso.test(v.date_given) ? v.date_given : null;
  if (!dateGiven) return null;
  const nextDue = typeof v.next_due === 'string' && iso.test(v.next_due) ? v.next_due : null;
  const notes = typeof v.notes === 'string' ? v.notes.trim() : '';
  // Structured detail fields — captured if the extractor provides them (kept
  // backward-compatible: today's edge function only returns name/date/notes).
  const str = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null);
  const doseNum = Number.isInteger(v.dose_number) ? v.dose_number
    : (typeof v.dose_number === 'string' && /^\d+$/.test(v.dose_number.trim()) ? parseInt(v.dose_number.trim(), 10) : null);
  return {
    name: v.name.trim(), date_given: dateGiven, next_due: nextDue, notes,
    manufacturer: str(v.manufacturer), batch_lot: str(v.batch_lot),
    dose_number: doseNum, provider: str(v.provider), location: str(v.location),
  };
}

const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export default function VaccinesSection() {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const locale = LOCALE_MAP[language] || 'en-US';

  const [list, setList] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [dateGiven, setDateGiven] = useState(todayISO());
  const [nextDue, setNextDue] = useState('');   // '' = none
  const [notes, setNotes] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [doseNumber, setDoseNumber] = useState('');   // string in the input; parsed to int on save
  const [batchLot, setBatchLot] = useState('');
  const [provider, setProvider] = useState('');
  const [location, setLocation] = useState('');
  const [pickerFor, setPickerFor] = useState(null); // 'given' | 'due' | null
  const [premium, setPremium] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracted, setExtracted] = useState([]);   // reviewed before saving
  const [reviewOpen, setReviewOpen] = useState(false);

  useFocusEffect(useCallback(() => { fetchList(); }, []));

  async function fetchList() {
    setPremium(await isPremium());
    const user = await getCachedUser();
    if (!user) return;
    setList(getVaccines(user.id) || []);
  }

  // ── Scan / upload a card or doctor's sheet ───────────────────────
  async function handleScanPress() {
    if (!(await isPremium())) {
      Alert.alert(t('vax_scan_premium_title'), t('vax_scan_premium_sub'), [
        { text: t('vax_premium_cta'), onPress: () => navigation.navigate('Paywall') },
        { text: t('cancel'), style: 'cancel' },
      ]);
      return;
    }
    // Consent gate: the card photo/PDF goes to a third-party AI service —
    // Apple 5.1.1(i)/5.1.2(i) requires explicit permission before sending.
    if (!(await requestAIConsent(t))) return;
    Alert.alert(t('vax_scan_choose_title'), t('vax_scan_choose_sub'), [
      { text: t('blood_source_camera'), onPress: () => pickImageAndExtract(true) },
      { text: t('blood_source_photo'), onPress: () => pickImageAndExtract(false) },
      { text: t('blood_source_pdf'), onPress: () => pickPdfAndExtract() },
      { text: t('cancel'), style: 'cancel' },
    ]);
  }

  async function pickImageAndExtract(fromCamera) {
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
      if (!asset?.base64) { Alert.alert(t('error'), t('blood_error_read')); return; }
      if (asset.base64.length > MAX_FILE_BYTES * 1.4) { Alert.alert(t('error'), t('blood_error_file_too_large')); return; }
      const mediaType = asset.mimeType
        || (String(asset.uri || '').toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
      setUploading(true);
      await extractVaccines({ image_base64: asset.base64, media_type: mediaType });
    } catch (err) {
      setUploading(false);
      Alert.alert(t('error'), t('blood_error_read'));
    }
  }

  async function pickPdfAndExtract() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      setUploading(true);
      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
      if (base64.length > MAX_FILE_BYTES * 1.4) { setUploading(false); Alert.alert(t('error'), t('blood_error_file_too_large')); return; }
      await extractVaccines({ pdf_base64: base64 });
    } catch (err) {
      setUploading(false);
      Alert.alert(t('error'), t('blood_error_read'));
    }
  }

  async function extractVaccines(source) {
    // Robust gate: vaccine scanning is Premium-only. Re-check at the action
    // point (fresh isPremium) so the paid extraction never runs for a free user.
    if (!(await isPremium())) {
      setUploading(false);
      Alert.alert(t('vax_scan_premium_title'), t('vax_scan_premium_sub'), [
        { text: t('vax_premium_cta'), onPress: () => navigation.navigate('Paywall') },
        { text: t('cancel'), style: 'cancel' },
      ]);
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('extract-bloodwork', {
        body: { kind: 'vaccines', lang: language, ...source },
      });
      if (error) {
        setUploading(false);
        // Same distinction as lab scanning: a service outage is not the user's card.
        const status = error.context?.status;
        let code = null;
        try { code = (await error.context?.clone?.().json())?.code; } catch { /* body unavailable */ }
        const serviceDown = ['provider_error', 'not_configured', 'internal_error'].includes(code)
          || (code == null && [500, 502, 503].includes(status));
        if (code === 'quota_exceeded' || status === 429) {
          Alert.alert(t('vial_scan_quota_title'), t('vial_scan_quota_sub'));
        } else if (serviceDown) {
          Alert.alert(t('blood_error_service'), t('blood_error_service_sub'));
        } else {
          Alert.alert(t('vax_scan_error'), t('vax_scan_error_sub'));
        }
        return;
      }
      const raw = Array.isArray(data?.vaccines) ? data.vaccines : [];
      const clean = raw.map(validateVaccine).filter(Boolean);
      setUploading(false);
      if (clean.length === 0) {
        Alert.alert(t('vax_scan_error'), t('vax_scan_none'));
        return;
      }

      // Auto-save everything the AI read, dated from the document — no
      // record-by-record approval. The user edits later via the list. Entries
      // whose administration date couldn't be read are dropped (never dated to
      // today) and reported.
      const saved = await persistVaccines(clean);
      const dropped = raw.length - clean.length;
      const lines = [t('vax_imported_body').replace('{count}', String(saved))];
      if (dropped > 0) lines.push(t('vax_imported_dropped').replace('{count}', String(dropped)));
      lines.push(t('vax_imported_hint'));
      Alert.alert(t('vax_imported_title'), lines.join('\n\n'));
    } catch (err) {
      setUploading(false);
      Alert.alert(t('vax_scan_error'), t('vax_scan_error_sub'));
    }
  }

  // Insert extracted vaccines straight into storage (no review gate). Returns the
  // number saved. Dates come from each record's date_given. Shared by auto-save.
  async function persistVaccines(list) {
    const user = await getCachedUser();
    if (!user) return 0;
    for (const v of list) {
      insertVaccine({
        user_id: user.id, name: v.name, date_given: v.date_given, next_due: v.next_due, notes: v.notes || null,
        manufacturer: v.manufacturer || null, batch_lot: v.batch_lot || null,
        dose_number: v.dose_number ?? null, provider: v.provider || null, location: v.location || null,
      });
    }
    requestSync();
    fetchList();
    return list.length;
  }

  // Retained for the (now-unreachable) review sheet; delegates to persistVaccines.
  async function saveExtracted() {
    await persistVaccines(extracted);
    setReviewOpen(false);
    setExtracted([]);
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function openAdd() {
    setEditingId(null);
    setName(''); setDateGiven(todayISO()); setNextDue(''); setNotes('');
    setManufacturer(''); setDoseNumber(''); setBatchLot(''); setProvider(''); setLocation('');
    setModalOpen(true);
  }

  function openEdit(v) {
    setEditingId(v.id);
    setName(v.name || '');
    setDateGiven(v.date_given || todayISO());
    setNextDue(v.next_due || '');
    setNotes(v.notes || '');
    setManufacturer(v.manufacturer || '');
    setDoseNumber(v.dose_number != null ? String(v.dose_number) : '');
    setBatchLot(v.batch_lot || '');
    setProvider(v.provider || '');
    setLocation(v.location || '');
    setModalOpen(true);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const user = await getCachedUser();
    if (!user) return;
    // dose_number is an integer column — keep only digits, null if empty/invalid.
    const doseInt = /^\d+$/.test(doseNumber.trim()) ? parseInt(doseNumber.trim(), 10) : null;
    const payload = {
      name: trimmed,
      date_given: dateGiven || null,
      next_due: nextDue || null,
      notes: notes.trim() || null,
      manufacturer: manufacturer.trim() || null,
      batch_lot: batchLot.trim() || null,
      dose_number: doseInt,
      provider: provider.trim() || null,
      location: location.trim() || null,
    };
    if (editingId) {
      updateVaccine(editingId, payload);
    } else {
      insertVaccine({ user_id: user.id, ...payload });
    }
    requestSync();
    setModalOpen(false);
    fetchList();
  }

  function removeVaccine() {
    if (!editingId) return;
    deleteVaccine(editingId);
    requestSync();
    setModalOpen(false);
    fetchList();
  }

  const q = search.trim().toLowerCase();
  const filtered = q ? list.filter(v => (v.name || '').toLowerCase().includes(q)) : list;

  return (
    <View style={s.wrap}>
      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll} contentContainerStyle={s.centered}>
        <Text style={s.hubDisclaimer}>{t('vax_disclaimer')}</Text>

        <View style={s.actionRow}>
          <TouchableOpacity style={[s.actionBtn, s.actionPrimary]} onPress={openAdd} accessibilityRole="button" accessibilityLabel={t('vax_add')}>
            <PlusGlyph color={colors.accentText} />
            <Text style={s.actionPrimaryText} numberOfLines={1}>{t('vax_add')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, s.actionSecondary]}
            onPress={handleScanPress}
            disabled={uploading}
            accessibilityRole="button"
            accessibilityLabel={t('vax_scan')}
            accessibilityState={{ disabled: uploading, busy: uploading }}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <FeatureIcon name="scan" size={15} color={colors.accent} />
                <Text style={s.actionSecondaryText} numberOfLines={1}>{t('vax_scan')}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {uploading && (
          <View style={s.uploadingBanner}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={s.uploadingText}>{t('vax_scanning')}</Text>
          </View>
        )}

        {list.length > 0 && (
          <TextInput
            style={s.searchInput}
            placeholder={t('vax_search_ph')}
            accessibilityLabel={t('vax_search_ph')}
            placeholderTextColor={colors.textFaint}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}

        {list.length === 0 && (
          <Card style={s.empty}>
            <View style={s.emptyIcon}><FeatureIcon name="syringe" size={44} color={colors.textMuted} /></View>
            <Text style={s.emptyTitle}>{t('vax_empty_title')}</Text>
            <Text style={s.emptySub}>{t('vax_empty_sub')}</Text>
          </Card>
        )}

        {list.length > 0 && filtered.length === 0 && (
          <Text style={s.noResults}>{t('vax_no_results')}</Text>
        )}

        {filtered.length > 0 && (
          <Card padded={false} style={s.listCard}>
        {filtered.map((v, i) => (
          <TouchableOpacity
            key={v.id}
            style={[s.card, i === filtered.length - 1 && s.cardLast]}
            onPress={() => openEdit(v)}
            accessibilityRole="button"
            accessibilityLabel={[v.name, formatDate(v.date_given), v.next_due ? `${t('vax_next_due')}: ${formatDate(v.next_due)}` : null].filter(Boolean).join(', ')}
            accessibilityHint={t('vax_edit_title')}
          >
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={s.cardName}>{v.name}</Text>
              <Text style={s.cardDate}>{formatDate(v.date_given)}</Text>
              {(v.dose_number != null || v.manufacturer || v.batch_lot) ? (
                <Text style={s.cardMeta}>
                  {[
                    v.dose_number != null ? `${t('vax_dose_short')} ${v.dose_number}` : null,
                    v.manufacturer || null,
                    v.batch_lot ? `${t('vax_lot_short')} ${v.batch_lot}` : null,
                  ].filter(Boolean).join('  ·  ')}
                </Text>
              ) : null}
              {v.next_due ? (
                <Chip tone="accent" label={`${t('vax_next_due')}: ${formatDate(v.next_due)}`} style={s.dueChip} />
              ) : null}
              {v.notes ? <Text style={s.cardNotes}>{v.notes}</Text> : null}
            </View>
            <ChevronRight color={colors.textSubtle} />
          </TouchableOpacity>
        ))}
          </Card>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ADD / EDIT MODAL */}
      <Modal visible={modalOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.modalNav}>
            <TouchableOpacity onPress={() => setModalOpen(false)} style={{ width: 70 }}>
              <Text style={s.modalClose}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>{editingId ? t('vax_edit_title') : t('vax_add_title')}</Text>
            <TouchableOpacity onPress={save} style={{ width: 70, alignItems: 'flex-end' }}>
              <Text style={[s.modalClose, { color: colors.accent, fontWeight: '600' }]}>{t('save')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>{t('vax_name_label')}</Text>
            <TextInput
              style={s.input}
              placeholder={t('vax_name_ph')}
              placeholderTextColor={colors.textFaint}
              value={name}
              onChangeText={setName}
            />

            <Text style={s.fieldLabel}>{t('vax_date_given')}</Text>
            <TouchableOpacity style={[s.dateBtn, { flexDirection: 'row', alignItems: 'center', gap: 8 }]} onPress={() => setPickerFor(pickerFor === 'given' ? null : 'given')}>
              <FeatureIcon name="calendar" size={15} color={colors.text} />
              <Text style={s.dateBtnText}>{formatDate(dateGiven)}</Text>
            </TouchableOpacity>
            {pickerFor === 'given' && (
              <DateTimePicker
                value={new Date((dateGiven || todayISO()) + 'T12:00:00')}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={(event, d) => {
                  setPickerFor(Platform.OS === 'ios' ? 'given' : null);
                  if (event.type === 'dismissed') { setPickerFor(null); return; }
                  if (d) setDateGiven(d.toISOString().split('T')[0]);
                }}
              />
            )}

            <View style={s.dueHeader}>
              <Text style={s.fieldLabel}>{t('vax_next_due_opt')}</Text>
              {nextDue ? (
                <TouchableOpacity onPress={() => setNextDue('')} hitSlop={{ top: 12, bottom: 4, left: 12, right: 12 }} accessibilityRole="button">
                  <Text style={s.clearLink}>{t('vax_clear')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity style={[s.dateBtn, { flexDirection: 'row', alignItems: 'center', gap: 8 }]} onPress={() => setPickerFor(pickerFor === 'due' ? null : 'due')}>
              {nextDue ? <FeatureIcon name="calendar" size={15} color={colors.text} /> : null}
              <Text style={s.dateBtnText}>
                {nextDue ? formatDate(nextDue) : t('vax_next_due_none')}
              </Text>
            </TouchableOpacity>
            {pickerFor === 'due' && (
              <DateTimePicker
                value={new Date((nextDue || todayISO()) + 'T12:00:00')}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, d) => {
                  setPickerFor(Platform.OS === 'ios' ? 'due' : null);
                  if (event.type === 'dismissed') { setPickerFor(null); return; }
                  if (d) setNextDue(d.toISOString().split('T')[0]);
                }}
              />
            )}

            <SectionLabel style={s.sectionLabel}>{t('vax_details_section')}</SectionLabel>

            <View style={s.fieldRow}>
              <View style={s.fieldCol}>
                <Text style={s.fieldLabel}>{t('vax_manufacturer')}</Text>
                <TextInput
                  style={s.input}
                  placeholder={t('vax_manufacturer_ph')}
                  placeholderTextColor={colors.textFaint}
                  value={manufacturer}
                  onChangeText={setManufacturer}
                />
              </View>
              <View style={s.fieldColNarrow}>
                <Text style={s.fieldLabel}>{t('vax_dose_number')}</Text>
                <TextInput
                  style={s.input}
                  placeholder="1"
                  placeholderTextColor={colors.textFaint}
                  value={doseNumber}
                  onChangeText={(v) => setDoseNumber(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
            </View>

            <Text style={s.fieldLabel}>{t('vax_batch_lot')}</Text>
            <TextInput
              style={s.input}
              placeholder={t('vax_batch_lot_ph')}
              placeholderTextColor={colors.textFaint}
              value={batchLot}
              onChangeText={setBatchLot}
              autoCapitalize="characters"
            />

            <Text style={s.fieldLabel}>{t('vax_provider')}</Text>
            <TextInput
              style={s.input}
              placeholder={t('vax_provider_ph')}
              placeholderTextColor={colors.textFaint}
              value={provider}
              onChangeText={setProvider}
            />

            <Text style={s.fieldLabel}>{t('vax_location')}</Text>
            <TextInput
              style={s.input}
              placeholder={t('vax_location_ph')}
              placeholderTextColor={colors.textFaint}
              value={location}
              onChangeText={setLocation}
            />

            <Text style={s.fieldLabel}>{t('vax_notes')}</Text>
            <TextInput
              style={[s.input, s.notesInput]}
              placeholder={t('vax_notes_ph')}
              placeholderTextColor={colors.textFaint}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            {editingId ? (
              <TouchableOpacity style={s.deleteBtn} onPress={removeVaccine} accessibilityRole="button">
                <Text style={s.deleteBtnText}>{t('vax_delete')}</Text>
              </TouchableOpacity>
            ) : null}

            <View style={{ height: 60 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* REVIEW EXTRACTED VACCINES */}
      <Modal visible={reviewOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.modalNav}>
            <TouchableOpacity onPress={() => { setReviewOpen(false); setExtracted([]); }} style={{ width: 70 }}>
              <Text style={s.modalClose}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>{t('vax_review_title')}</Text>
            <TouchableOpacity onPress={saveExtracted} style={{ width: 70, alignItems: 'flex-end' }}>
              <Text style={[s.modalClose, { color: colors.accent, fontWeight: '600' }]}>{t('vax_save_all')}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={s.reviewNote}>{t('vax_review_note').replace('{n}', String(extracted.length))}</Text>
            {extracted.map((v, i) => (
              <View key={i} style={s.reviewCard}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={s.cardName}>{v.name}</Text>
                  <Text style={s.cardDate}>{formatDate(v.date_given)}</Text>
                  {v.next_due ? <Text style={s.cardDue}>{t('vax_next_due')}: {formatDate(v.next_due)}</Text> : null}
                  {v.notes ? <Text style={s.cardNotes}>{v.notes}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => setExtracted(prev => prev.filter((_, idx) => idx !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <View style={{ paddingHorizontal: 4 }}><CrossMark style={s.reviewRemove} /></View>
                </TouchableOpacity>
              </View>
            ))}
            {extracted.length === 0 && <Text style={s.reviewHint}>{t('vax_review_empty')}</Text>}
            <Text style={s.reviewHint}>{t('vax_review_hint')}</Text>
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  wrap: { flex: 1 },
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 4 },
  scroll: { flex: 1 },
  hubDisclaimer: { ...TYPE.caption, color: c.textSubtle, lineHeight: 18, marginBottom: 12 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', gap: 6, borderRadius: 16, minHeight: 52, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  actionPrimary: { backgroundColor: c.accent },
  actionPrimaryText: { color: c.accentText, fontSize: 15.5, fontWeight: '600', flexShrink: 1 },
  actionSecondary: { backgroundColor: c.card, ...c.shadowSoft },
  actionSecondaryText: { color: c.accent, fontSize: 15.5, fontWeight: '600', flexShrink: 1 },
  uploadingBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.accentSoft, paddingHorizontal: 14, minHeight: 44, borderRadius: 14, marginBottom: 12 },
  uploadingText: { fontSize: 14, color: c.accentSoftText, fontWeight: '500', flexShrink: 1 },
  reviewNote: { fontSize: 15, color: c.text, fontWeight: '600', marginBottom: 12 },
  reviewCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card2, borderRadius: 16, padding: 14, marginBottom: 10 },
  reviewRemove: { fontSize: 16, color: c.danger, paddingHorizontal: 4 },
  reviewHint: { ...TYPE.caption, color: c.textSubtle, lineHeight: 18, marginTop: 6 },
  searchInput: { backgroundColor: c.card, borderRadius: 14, paddingHorizontal: 14, height: 44, fontSize: 15, color: c.text, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, marginBottom: 12 },
  empty: { alignItems: 'center', paddingVertical: 28 },
  emptyIcon: { marginBottom: 12 },
  emptyTitle: { ...TYPE.heading, color: c.text, marginBottom: 6, textAlign: 'center' },
  emptySub: { fontSize: 15, color: c.textMuted, textAlign: 'center', lineHeight: 21, paddingHorizontal: 8 },
  noResults: { fontSize: 14.5, color: c.textMuted, textAlign: 'center', paddingVertical: 24 },
  card: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, minHeight: 60, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  cardName: { fontSize: 16, fontWeight: '600', color: c.text },
  cardDate: { fontSize: 14, color: c.textMuted, marginTop: 3 },
  cardMeta: { ...TYPE.caption, color: c.text, marginTop: 4, fontWeight: '500' },
  cardDue: { ...TYPE.caption, color: c.accent, marginTop: 3 },
  cardNotes: { ...TYPE.caption, color: c.textMuted, marginTop: 6, lineHeight: 18 },
  modal: { flex: 1, backgroundColor: c.card },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  modalTitle: { fontSize: 17, fontWeight: '600', color: c.text, flexShrink: 1, textAlign: 'center' },
  modalClose: { fontSize: 15, color: c.textMuted },
  modalBody: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 18 },
  fieldLabel: { ...TYPE.label, color: c.textSubtle, marginBottom: 8, marginTop: 16 },
  sectionLabel: { marginTop: 28, marginBottom: 0, color: c.text },
  fieldRow: { flexDirection: 'row', gap: 12 },
  fieldCol: { flex: 1 },
  fieldColNarrow: { width: 96 },
  input: { backgroundColor: c.bg, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, paddingVertical: 11, fontSize: 16, color: c.text, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  dateBtn: { backgroundColor: c.bg, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  dateBtnText: { fontSize: 16, color: c.text },
  dueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  clearLink: { fontSize: 14, color: c.accent, fontWeight: '600', marginBottom: 8 },
  deleteBtn: { marginTop: 28, borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.danger },
  deleteBtnText: { color: c.danger, fontSize: 15, fontWeight: '600' },
  listCard: { paddingHorizontal: 16, paddingVertical: 2 },
  cardLast: { borderBottomWidth: 0 },
  dueChip: { alignSelf: 'flex-start', marginTop: 8 },
});
