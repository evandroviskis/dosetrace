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
import { isPremium } from '../../lib/purchases';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { getVaccines, insertVaccine, updateVaccine, deleteVaccine } from '../../lib/database';
import { requestSync } from '../../lib/sync';

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
  return { name: v.name.trim(), date_given: dateGiven, next_due: nextDue, notes };
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
    Alert.alert(t('vax_scan_choose_title'), t('vax_scan_choose_sub'), [
      { text: t('blood_source_camera'), onPress: () => pickImageAndExtract(true) },
      { text: t('blood_source_photo'), onPress: () => pickImageAndExtract(false) },
      { text: t('blood_source_pdf'), onPress: () => pickPdfAndExtract() },
      { text: t('cancel'), style: 'cancel' },
    ]);
  }

  async function pickImageAndExtract(fromCamera) {
    let ImagePicker;
    try { ImagePicker = require('expo-image-picker'); } catch { Alert.alert(t('error'), t('blood_needs_build')); return; }
    if (!ImagePicker?.launchCameraAsync) { Alert.alert(t('error'), t('blood_needs_build')); return; }
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
        body: { kind: 'vaccines', ...source },
      });
      if (error) {
        setUploading(false);
        Alert.alert(t('vax_scan_error'), t('vax_scan_error_sub'));
        return;
      }
      const raw = Array.isArray(data?.vaccines) ? data.vaccines : [];
      const clean = raw.map(validateVaccine).filter(Boolean);
      setUploading(false);
      if (clean.length === 0) {
        Alert.alert(t('vax_scan_error'), t('vax_scan_none'));
        return;
      }
      setExtracted(clean);
      setReviewOpen(true);
    } catch (err) {
      setUploading(false);
      Alert.alert(t('vax_scan_error'), t('vax_scan_error_sub'));
    }
  }

  async function saveExtracted() {
    const user = await getCachedUser();
    if (!user) return;
    for (const v of extracted) {
      insertVaccine({ user_id: user.id, name: v.name, date_given: v.date_given, next_due: v.next_due, notes: v.notes || null });
    }
    requestSync();
    setReviewOpen(false);
    setExtracted([]);
    fetchList();
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
    setModalOpen(true);
  }

  function openEdit(v) {
    setEditingId(v.id);
    setName(v.name || '');
    setDateGiven(v.date_given || todayISO());
    setNextDue(v.next_due || '');
    setNotes(v.notes || '');
    setModalOpen(true);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const user = await getCachedUser();
    if (!user) return;
    const payload = {
      name: trimmed,
      date_given: dateGiven || null,
      next_due: nextDue || null,
      notes: notes.trim() || null,
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
      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll}>
        <Text style={s.hubDisclaimer}>{t('vax_disclaimer')}</Text>

        <View style={s.actionRow}>
          <TouchableOpacity style={[s.actionBtn, s.actionPrimary]} onPress={openAdd}>
            <Text style={s.actionPrimaryText}>＋ {t('vax_add')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, s.actionSecondary]} onPress={handleScanPress} disabled={uploading}>
            <Text style={s.actionSecondaryText}>{uploading ? '…' : `📷 ${t('vax_scan')}`}</Text>
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
            placeholderTextColor={colors.textFaint}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}

        {list.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>💉</Text>
            <Text style={s.emptyTitle}>{t('vax_empty_title')}</Text>
            <Text style={s.emptySub}>{t('vax_empty_sub')}</Text>
          </View>
        )}

        {list.length > 0 && filtered.length === 0 && (
          <Text style={s.noResults}>{t('vax_no_results')}</Text>
        )}

        {filtered.map(v => (
          <TouchableOpacity key={v.id} style={s.card} onPress={() => openEdit(v)}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={s.cardName}>{v.name}</Text>
              <Text style={s.cardDate}>{formatDate(v.date_given)}</Text>
              {v.next_due ? (
                <Text style={s.cardDue}>{t('vax_next_due')}: {formatDate(v.next_due)}</Text>
              ) : null}
              {v.notes ? <Text style={s.cardNotes}>{v.notes}</Text> : null}
            </View>
            <Text style={s.cardChevron}>›</Text>
          </TouchableOpacity>
        ))}

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
            <TouchableOpacity style={s.dateBtn} onPress={() => setPickerFor(pickerFor === 'given' ? null : 'given')}>
              <Text style={s.dateBtnText}>📅  {formatDate(dateGiven)}</Text>
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
                <TouchableOpacity onPress={() => setNextDue('')}>
                  <Text style={s.clearLink}>{t('vax_clear')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity style={s.dateBtn} onPress={() => setPickerFor(pickerFor === 'due' ? null : 'due')}>
              <Text style={s.dateBtnText}>
                {nextDue ? `📅  ${formatDate(nextDue)}` : t('vax_next_due_none')}
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
              <TouchableOpacity style={s.deleteBtn} onPress={removeVaccine}>
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
                  <Text style={s.reviewRemove}>✕</Text>
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
  scroll: { flex: 1, padding: 16 },
  hubDisclaimer: { fontSize: 11, color: c.textFaint, lineHeight: 16, marginBottom: 12 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  actionBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  actionPrimary: { backgroundColor: c.accent },
  actionPrimaryText: { color: c.accentText, fontSize: 14, fontWeight: '600' },
  actionSecondary: { backgroundColor: c.card, borderWidth: 0.5, borderColor: c.border },
  actionSecondaryText: { color: c.accent, fontSize: 14, fontWeight: '600' },
  uploadingBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.accentSoft, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginBottom: 12 },
  uploadingText: { fontSize: 13, color: c.accent },
  reviewNote: { fontSize: 13, color: c.text, fontWeight: '600', marginBottom: 12 },
  reviewCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card2, borderRadius: 12, padding: 14, marginBottom: 10 },
  reviewRemove: { fontSize: 16, color: c.danger, paddingHorizontal: 4 },
  reviewHint: { fontSize: 12, color: c.textFaint, lineHeight: 17, marginTop: 6 },
  searchInput: { backgroundColor: c.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: c.text, borderWidth: 0.5, borderColor: c.border, marginBottom: 12 },
  empty: { alignItems: 'center', paddingTop: 30 },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 6 },
  emptySub: { fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 19, paddingHorizontal: 16 },
  noResults: { fontSize: 13, color: c.textMuted, textAlign: 'center', paddingVertical: 24 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardName: { fontSize: 15, fontWeight: '600', color: c.text },
  cardDate: { fontSize: 12, color: c.textMuted, marginTop: 3 },
  cardDue: { fontSize: 12, color: c.accent, marginTop: 3 },
  cardNotes: { fontSize: 12, color: c.textMuted, marginTop: 4, lineHeight: 17 },
  cardChevron: { fontSize: 22, color: c.textFaint },
  modal: { flex: 1, backgroundColor: c.card },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: c.border },
  modalTitle: { fontSize: 15, fontWeight: '600', color: c.text },
  modalClose: { fontSize: 14, color: c.textMuted },
  modalBody: { flex: 1, paddingHorizontal: 20, paddingTop: 18 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginBottom: 8, marginTop: 14 },
  input: { backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: c.text, borderWidth: 0.5, borderColor: c.border },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  dateBtn: { backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 0.5, borderColor: c.border },
  dateBtnText: { fontSize: 15, color: c.text },
  dueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  clearLink: { fontSize: 12, color: c.accent, fontWeight: '600', marginBottom: 8 },
  deleteBtn: { marginTop: 28, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: c.danger },
  deleteBtnText: { color: c.danger, fontSize: 14, fontWeight: '600' },
});
