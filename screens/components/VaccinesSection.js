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

import { useState, useCallback, useMemo, useEffect } from 'react';
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
import { hasPremium } from '../../lib/entitlement';
import { quotaLimitFrom, fillQuotaMessage } from '../../lib/scanQuotaMessage';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import FeatureIcon from '../../components/FeatureIcon';
import { CONTENT_MAX_WIDTH } from '../../lib/responsive';
import { getVaccines, insertVaccine, updateVaccine, deleteVaccine } from '../../lib/database';
import { requestSync } from '../../lib/sync';
import { hasNativeModule } from '../../lib/nativeModule';
import { CrossMark } from '../../components/CheckMark';
import Svg, { Path } from 'react-native-svg';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

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

// S-26 book layout (docs/specs/book-layout.md):
//   inline: the list renders without its own ScrollView, inside the My Body left page (BK-6).
//   draftRef: a ref owned by BodyScreen that holds the open add/edit sheet's values. When a
//     fold or unfold re-lays My Body out, the next VaccinesSection reopens the sheet with
//     them (BK-10: never lose anything typed).
//   onSheetChange: tells BodyScreen whether the add/edit sheet is open.
//   Book only (BK-18, founder decision 6): onSelect(v) replaces the tap-to-edit, so a tapped
//     vaccine opens its read page on the right; selectedId gets the 2 pt ink outline (BK-8) and
//     reports itself as selected (BK-21); onListChange(list) hands every fresh list to
//     BodyScreen (the right page reads it, and a deleted vaccine falls back); controlRef lets
//     the right page's Edit open this instance's add/edit sheet. On a phone none is passed.
export default function VaccinesSection({ inline = false, draftRef = null, onSheetChange = null, onSelect = null, selectedId = null, onListChange = null, controlRef = null } = {}) {
  const { t, language } = useLanguage();
  const { colors, isDark } = useTheme();
  const navigation = useNavigation();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const locale = LOCALE_MAP[language] || 'en-US';

  // An open sheet carried over a fold/unfold (see the draft effect below).
  const [carried] = useState(() => (draftRef && draftRef.current) || null);
  const [list, setList] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(!!carried);
  const [editingId, setEditingId] = useState(carried ? carried.editingId : null);
  const [name, setName] = useState(carried ? carried.name : '');
  const [dateGiven, setDateGiven] = useState(carried ? carried.dateGiven : todayISO());
  const [nextDue, setNextDue] = useState(carried ? carried.nextDue : '');   // '' = none
  const [notes, setNotes] = useState(carried ? carried.notes : '');
  const [manufacturer, setManufacturer] = useState(carried ? carried.manufacturer : '');
  const [doseNumber, setDoseNumber] = useState(carried ? carried.doseNumber : '');   // string in the input; parsed to int on save
  const [batchLot, setBatchLot] = useState(carried ? carried.batchLot : '');
  const [provider, setProvider] = useState(carried ? carried.provider : '');
  const [location, setLocation] = useState(carried ? carried.location : '');
  const [pickerFor, setPickerFor] = useState(carried ? carried.pickerFor : null); // 'given' | 'due' | null
  const [premium, setPremium] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracted, setExtracted] = useState([]);   // reviewed before saving
  const [reviewOpen, setReviewOpen] = useState(false);

  useFocusEffect(useCallback(() => { fetchList(); }, []));

  // BK-10: while the add/edit sheet is open its values are kept current in draftRef, so the
  // VaccinesSection mounted by a fold/unfold (rendered before this one's unmount cleanup
  // would run) reopens the sheet with everything typed. Closed sheet = no draft.
  useEffect(() => {
    if (!draftRef) return;
    draftRef.current = modalOpen
      ? { modalOpen, editingId, name, dateGiven, nextDue, notes, manufacturer, doseNumber, batchLot, provider, location, pickerFor }
      : null;
  });
  useEffect(() => { if (onSheetChange) onSheetChange(modalOpen); }, [modalOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  // BK-18: the right page's Edit opens this sheet for its vaccine.
  useEffect(() => {
    if (!controlRef) return undefined;
    controlRef.current = { openEdit };
    return () => { controlRef.current = null; };
  });

  async function fetchList() {
    setPremium(await hasPremium());
    const user = await getCachedUser();
    if (!user) return;
    const next = getVaccines(user.id) || [];
    setList(next);
    if (onListChange) onListChange(next);
  }

  // ── Scan / upload a card or doctor's sheet ───────────────────────
  async function handleScanPress() {
    if (!(await hasPremium())) {
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
    if (!(await hasPremium())) {
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
        let errBody = null;
        try { errBody = await error.context?.clone?.().json(); code = errBody?.code; } catch { /* body unavailable */ }
        const serviceDown = ['provider_error', 'not_configured', 'internal_error'].includes(code)
          || (code == null && [500, 502, 503].includes(status));
        if (code === 'quota_exceeded' || status === 429) {
          Alert.alert(t('vial_scan_quota_title'), fillQuotaMessage(t('vial_scan_quota_sub'), quotaLimitFrom(errBody)));
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
    return d.toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' });
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
    <View style={inline ? s.inlineWrap : s.wrap}>
      {/* VACCINE JOURNAL (prototype vaxScreen). In the book layout it sits inside the My
          Body left page, which brings the scroll (BK-6). */}
      <JournalScroll inline={inline} s={s}>
        <View style={s.titleBlock}>
          <Text style={s.screenTitle}>{t('body_card_vax_title')}</Text>
        </View>
        <Text style={[s.foot, s.padX]}>{t('vax_disclaimer')}</Text>

        <View style={s.actionRow}>
          <TouchableOpacity style={[s.btn, s.btnP]} onPress={openAdd}>
            <Text style={s.btnPText}>+ {t('vax_add')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnO]} onPress={handleScanPress} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator size="small" color={colors.ink} />
            ) : (
              <>
                <FeatureIcon name="scan" size={18} color={colors.ink} />
                <Text style={s.btnOText}>{t('vax_scan')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {uploading && (
          <View style={[s.card, s.rowCard]}>
            <ActivityIndicator size="small" color={colors.ink} />
            <Text style={[s.body, s.grow]}>{t('vax_scanning')}</Text>
          </View>
        )}

        {list.length === 0 && (
          <View style={[s.card, s.emptyCard]}>
            <FeatureIcon name="syringe" size={44} color={colors.ink3} />
            <Text style={[s.title, s.center]}>{t('vax_empty_title')}</Text>
            <Text style={[s.sec, s.center]}>{t('vax_empty_sub')}</Text>
          </View>
        )}

        {list.length > 0 && (
          <View style={s.searchWrap}>
            <View style={s.searchIcon} pointerEvents="none">
              <FeatureIcon name="search" size={18} color={colors.ink3} />
            </View>
            <TextInput
              style={[s.input, s.searchInput]}
              placeholder={t('vax_search_ph')}
              placeholderTextColor={colors.ink3}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        {list.length > 0 && filtered.length === 0 && (
          <Text style={[s.sec, s.padX]}>{t('vax_no_results')}</Text>
        )}

        {filtered.map(v => {
          const meta = [
            v.dose_number != null ? `${t('vax_dose_short')} ${v.dose_number}` : null,
            v.manufacturer || null,
            v.batch_lot ? `${t('vax_lot_short')} ${v.batch_lot}` : null,
          ].filter(Boolean).join(' · ');
          const selected = !!onSelect && selectedId != null && String(v.id) === String(selectedId);
          return (
            <TouchableOpacity
              key={v.id}
              style={[s.card, selected && s.selCard]}
              activeOpacity={0.7}
              onPress={() => (onSelect ? onSelect(v) : openEdit(v))}
              accessibilityState={onSelect ? { selected } : undefined}
            >
              <View style={s.cardRow}>
                <View style={[s.grow, s.col5]}>
                  <Text style={s.title}>{v.name}</Text>
                  <Text style={[s.sec, s.tnum]}>{formatDate(v.date_given)}</Text>
                  {meta ? <Text style={[s.foot, s.tnum]}>{meta}</Text> : null}
                  {v.next_due ? (
                    <View style={s.dueRow}>
                      <FeatureIcon name="calendar" size={16} color={colors.ink2} />
                      <Text style={[s.secInk, s.tnum, s.grow]}>{t('vax_next_due')}: {formatDate(v.next_due)}</Text>
                    </View>
                  ) : null}
                  {v.notes ? <Text style={s.foot}>{v.notes}</Text> : null}
                </View>
                <Chevron color={colors.tick} />
              </View>
            </TouchableOpacity>
          );
        })}
      </JournalScroll>

      {/* ADD / EDIT (prototype vaxForm) */}
      <Modal visible={modalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalOpen(false)}>
        <SafeAreaView style={s.modal}>
          <View style={s.sheetHead}>
            <TouchableOpacity onPress={() => setModalOpen(false)} style={s.sheetSide}>
              <Text style={s.sheetCancel}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.sheetTitle} numberOfLines={1}>{editingId ? t('vax_edit_title') : t('vax_add_title')}</Text>
            <TouchableOpacity onPress={save} style={[s.sheetSide, s.sheetSideEnd]}>
              <Text style={s.sheetSave}>{t('save')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>{t('vax_name_label')}</Text>
            <TextInput
              style={s.input}
              placeholder={t('vax_name_ph')}
              placeholderTextColor={colors.ink3}
              value={name}
              onChangeText={setName}
            />

            <Text style={s.fieldLabel}>{t('vax_date_given')}</Text>
            <TouchableOpacity style={s.dateBtn} onPress={() => setPickerFor(pickerFor === 'given' ? null : 'given')}>
              <Text style={[s.body, s.tnum]}>{formatDate(dateGiven)}</Text>
              <FeatureIcon name="calendar" size={20} color={colors.ink2} />
            </TouchableOpacity>
            {pickerFor === 'given' && (
              <DateTimePicker
                value={new Date((dateGiven || todayISO()) + 'T12:00:00')}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant={isDark ? 'dark' : 'light'}
                maximumDate={new Date()}
                onChange={(event, d) => {
                  setPickerFor(Platform.OS === 'ios' ? 'given' : null);
                  if (event.type === 'dismissed') { setPickerFor(null); return; }
                  if (d) setDateGiven(d.toISOString().split('T')[0]);
                }}
              />
            )}

            <View style={s.dueHeader}>
              <Text style={[s.fieldLabel, s.grow]}>{t('vax_next_due_opt')}</Text>
              {nextDue ? (
                <TouchableOpacity onPress={() => setNextDue('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={s.clearLink}>{t('vax_clear')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity style={s.dateBtn} onPress={() => setPickerFor(pickerFor === 'due' ? null : 'due')}>
              <Text style={[nextDue ? s.body : s.bodyMuted, s.tnum]}>
                {nextDue ? formatDate(nextDue) : t('vax_next_due_none')}
              </Text>
              <FeatureIcon name="calendar" size={20} color={colors.ink2} />
            </TouchableOpacity>
            {pickerFor === 'due' && (
              <DateTimePicker
                value={new Date((nextDue || todayISO()) + 'T12:00:00')}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant={isDark ? 'dark' : 'light'}
                onChange={(event, d) => {
                  setPickerFor(Platform.OS === 'ios' ? 'due' : null);
                  if (event.type === 'dismissed') { setPickerFor(null); return; }
                  if (d) setNextDue(d.toISOString().split('T')[0]);
                }}
              />
            )}

            <Text style={s.sectionLabel}>{t('vax_details_section')}</Text>

            <View style={s.fieldRow}>
              <View style={s.fieldCol}>
                <Text style={s.fieldLabel}>{t('vax_manufacturer')}</Text>
                <TextInput
                  style={s.input}
                  placeholder={t('vax_manufacturer_ph')}
                  placeholderTextColor={colors.ink3}
                  value={manufacturer}
                  onChangeText={setManufacturer}
                />
              </View>
              <View style={s.fieldColNarrow}>
                <Text style={s.fieldLabel}>{t('vax_dose_number')}</Text>
                <TextInput
                  style={s.input}
                  placeholder="1"
                  placeholderTextColor={colors.ink3}
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
              placeholderTextColor={colors.ink3}
              value={batchLot}
              onChangeText={setBatchLot}
              autoCapitalize="characters"
            />

            <Text style={s.fieldLabel}>{t('vax_provider')}</Text>
            <TextInput
              style={s.input}
              placeholder={t('vax_provider_ph')}
              placeholderTextColor={colors.ink3}
              value={provider}
              onChangeText={setProvider}
            />

            <Text style={s.fieldLabel}>{t('vax_location')}</Text>
            <TextInput
              style={s.input}
              placeholder={t('vax_location_ph')}
              placeholderTextColor={colors.ink3}
              value={location}
              onChangeText={setLocation}
            />

            <Text style={s.fieldLabel}>{t('vax_notes')}</Text>
            <TextInput
              style={[s.input, s.notesInput]}
              placeholder={t('vax_notes_ph')}
              placeholderTextColor={colors.ink3}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            {editingId ? (
              <TouchableOpacity style={s.dangerBtn} onPress={removeVaccine}>
                <Text style={s.dangerText}>{t('vax_delete')}</Text>
              </TouchableOpacity>
            ) : null}

            <View style={{ height: 60 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* REVIEW EXTRACTED VACCINES (retained, unreachable while scans auto-save) */}
      <Modal visible={reviewOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.sheetHead}>
            <TouchableOpacity onPress={() => { setReviewOpen(false); setExtracted([]); }} style={s.sheetSide}>
              <Text style={s.sheetCancel}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.sheetTitle} numberOfLines={1}>{t('vax_review_title')}</Text>
            <TouchableOpacity onPress={saveExtracted} style={[s.sheetSide, s.sheetSideEnd]}>
              <Text style={s.sheetSave}>{t('vax_save_all')}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} contentContainerStyle={s.reviewList} showsVerticalScrollIndicator={false}>
            <Text style={s.head}>{t('vax_review_note').replace('{n}', String(extracted.length))}</Text>
            {extracted.map((v, i) => (
              <View key={i} style={[s.reviewCard, s.cardRow]}>
                <View style={[s.grow, s.col5]}>
                  <Text style={s.head}>{v.name}</Text>
                  <Text style={[s.sec, s.tnum]}>{formatDate(v.date_given)}</Text>
                  {v.next_due ? <Text style={[s.secInk, s.tnum]}>{t('vax_next_due')}: {formatDate(v.next_due)}</Text> : null}
                  {v.notes ? <Text style={s.foot}>{v.notes}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => setExtracted(prev => prev.filter((_, idx) => idx !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <CrossMark size={16} color={colors.risk} />
                </TouchableOpacity>
              </View>
            ))}
            {extracted.length === 0 && <Text style={s.foot}>{t('vax_review_empty')}</Text>}
            <Text style={s.foot}>{t('vax_review_hint')}</Text>
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

// The journal's own scroll on a phone; a plain column inside the book's left page.
function JournalScroll({ inline, s, children }) {
  if (inline) return <View style={s.inlineList}>{children}</View>;
  return (
    <ScrollView showsVerticalScrollIndicator={false} style={s.scroll} contentContainerStyle={[s.centered, s.scrollPad]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

// Graduated chevron (prototype CHEV), drawn so it follows the theme.
function Chevron({ color }) {
  return (
    <Svg width={9} height={15} viewBox="0 0 10 16" fill="none">
      <Path d="M2 2l6 6-6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Redesign (Graduated, My Body part 2 approved): large title, the disclaimer as a
// footnote, "+ Add vaccine" as the one ink action beside a well "Scan / upload", plain
// raised cards, and the add/edit sheet with outlined fields and well date buttons.
// Theme tokens only; both palettes.
const makeStyles = (c) => StyleSheet.create({
  wrap: { flex: 1 },
  inlineWrap: {},
  inlineList: { gap: 12 },
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  scroll: { flex: 1 },
  scrollPad: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 12 },
  titleBlock: { paddingHorizontal: 4, paddingBottom: 2 },
  screenTitle: { fontSize: 30, fontWeight: '700', color: c.ink, letterSpacing: -0.75, lineHeight: 36 },

  // type roles (DESIGN.md §3)
  title: { fontSize: 22, fontWeight: '700', color: c.ink, lineHeight: 28, letterSpacing: -0.2 },
  head: { fontSize: 17, fontWeight: '600', color: c.ink, lineHeight: 22 },
  body: { fontSize: 17, color: c.ink, lineHeight: 22 },
  bodyMuted: { fontSize: 17, color: c.ink2, lineHeight: 22 },
  sec: { fontSize: 15, color: c.ink2, lineHeight: 20 },
  secInk: { fontSize: 15, color: c.ink, lineHeight: 20 },
  foot: { fontSize: 13, color: c.ink2, lineHeight: 18 },
  tnum: { fontVariant: ['tabular-nums'] },
  center: { textAlign: 'center' },
  padX: { paddingHorizontal: 4 },
  grow: { flex: 1, minWidth: 0 },
  col5: { gap: 5 },

  // actions
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  btn: { flexGrow: 1, flexBasis: 140, minHeight: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  btnP: { backgroundColor: c.act },
  btnPText: { color: c.onAct, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  btnO: { backgroundColor: c.well },
  btnOText: { color: c.ink, fontSize: 17, fontWeight: '700', textAlign: 'center' },

  // cards
  card: { backgroundColor: c.raised, borderRadius: 24, padding: 18, gap: 12 },
  // book: the vaccine open on the right page, 2 pt ink (BK-8); padding drops by the border.
  selCard: { borderWidth: 2, borderColor: c.ink, padding: 16 },
  rowCard: { flexDirection: 'row', alignItems: 'center' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyCard: { alignItems: 'center', paddingTop: 28 },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },

  // search
  searchWrap: { justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 14, zIndex: 1 },
  input: { backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, paddingVertical: 10, fontSize: 17, color: c.ink },
  searchInput: { minHeight: 46, paddingLeft: 42 },

  // add / edit sheet
  modal: { flex: 1, backgroundColor: c.raised },
  modalBody: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 4 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 20, gap: 8 },
  sheetSide: { width: 80, minHeight: 44, justifyContent: 'center' },
  sheetSideEnd: { alignItems: 'flex-end' },
  sheetCancel: { fontSize: 17, color: c.ink },
  sheetSave: { fontSize: 17, fontWeight: '600', color: c.ink },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: c.ink, textAlign: 'center' },
  fieldLabel: { fontSize: 13, color: c.ink2, marginBottom: 6, marginTop: 14 },
  sectionLabel: { fontSize: 17, fontWeight: '600', color: c.ink, marginTop: 24, marginBottom: 2 },
  fieldRow: { flexDirection: 'row', gap: 12 },
  fieldCol: { flex: 1 },
  fieldColNarrow: { width: 96 },
  notesInput: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  dateBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.well },
  dueHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  clearLink: { fontSize: 13, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick, marginBottom: 6 },
  dangerBtn: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  dangerText: { fontSize: 17, fontWeight: '600', color: c.risk, textAlign: 'center' },

  // retained review sheet
  reviewList: { gap: 10 },
  reviewCard: { backgroundColor: c.well, borderRadius: 16, padding: 14 },
});
