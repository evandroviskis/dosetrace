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
 *
 * Graduated redesign (docs/specs/my-body.md MB-20…MB-24, founder 2026-10-03): the add/edit
 * form is a bottom sheet that hugs its content, the dates open the date-wheel sheet, Save
 * without a name shows a toast, Delete asks first, and every popup of the scan is a DoseTrace
 * sheet (never a native alert).
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { getCachedUser, supabase } from '../../lib/supabase';
import { hasAIConsent, grantAIConsent, AI_PRIVACY_URL } from '../../lib/aiConsent';
import { hasPremium } from '../../lib/entitlement';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import FeatureIcon from '../../components/FeatureIcon';
import { CONTENT_MAX_WIDTH } from '../../lib/responsive';
import { getVaccines, insertVaccine, updateVaccine, deleteVaccine } from '../../lib/database';
import { requestSync } from '../../lib/sync';
import { hasNativeModule } from '../../lib/nativeModule';
import { formatDate as localeDate, MONTHS_SHORT } from '../../lib/localeFormat';
import { pluralKey } from '../../lib/plural';
import { validateVaccine, scanErrorKind, scanErrorSheet } from '../../lib/bodyScan';
import { vaccineNameMissing, deleteVaccineCopy } from '../../lib/bodyHub';
import { todayLocal, wheelColumns, wheelAfter } from '../../lib/bodyDates';
import { DTSheet, DTActionSheet, DTPickerSheet, DTWheel } from './ProtocolParts';
import { BottomSheet, SheetBar, SheetToast } from './BodySheets';
import Svg, { Path } from 'react-native-svg';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const TOAST_MS = 4000; // the prototype toast()
// The date wheels (MB-21): a vaccine may have been given decades ago, never in the future;
// a next-due booster may be years ahead.
const GIVEN_RANGE = { back: 80, ahead: 0 };
const DUE_RANGE = { back: 10, ahead: 15 };

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
  const { colors } = useTheme();
  const navigation = useNavigation();
  const s = useMemo(() => makeStyles(colors), [colors]);

  // An open sheet carried over a fold/unfold (see the draft effect below).
  const [carried] = useState(() => (draftRef && draftRef.current) || null);
  const [list, setList] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(!!carried);
  const [editingId, setEditingId] = useState(carried ? carried.editingId : null);
  const [name, setName] = useState(carried ? carried.name : '');
  const [dateGiven, setDateGiven] = useState(carried ? carried.dateGiven : todayLocal());
  const [nextDue, setNextDue] = useState(carried ? carried.nextDue : '');   // '' = none
  const [notes, setNotes] = useState(carried ? carried.notes : '');
  const [manufacturer, setManufacturer] = useState(carried ? carried.manufacturer : '');
  const [doseNumber, setDoseNumber] = useState(carried ? carried.doseNumber : '');   // string in the input; parsed to int on save
  const [batchLot, setBatchLot] = useState(carried ? carried.batchLot : '');
  const [provider, setProvider] = useState(carried ? carried.provider : '');
  const [location, setLocation] = useState(carried ? carried.location : '');
  const [pickerFor, setPickerFor] = useState(carried ? carried.pickerFor : null); // 'given' | 'due' | null
  const [uploading, setUploading] = useState(false);
  // DoseTrace sheets: formSheet shows over the add/edit sheet (Delete vaccine?); scanSheet and
  // scanChoice belong to the journal (scan, Premium, results, errors).
  const [formSheet, setFormSheet] = useState(null);
  const [scanSheet, setScanSheet] = useState(null);
  const [scanChoice, setScanChoice] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

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
    const user = await getCachedUser();
    if (!user) return;
    const next = getVaccines(user.id) || [];
    setList(next);
    if (onListChange) onListChange(next);
  }

  // A sheet that follows the camera / photo library waits for it to close (iOS presents
  // nothing while another view is still animating out).
  function notice(cfg, afterPicker) {
    const withOk = { ...cfg, icon: cfg.icon === undefined ? 'warning' : cfg.icon, buttons: [{ label: t('ok'), kind: 'primary' }] };
    if (afterPicker) setTimeout(() => setScanSheet(withOk), 450);
    else setScanSheet(withOk);
  }
  function premiumSheet() {
    // Part 20: Cancel on the left, Go Premium on the right (prototype vaxPremium).
    setScanSheet({
      title: t('vax_scan_premium_title'),
      body: t('vax_scan_premium_sub'),
      buttons: [
        { label: t('cancel'), kind: 'secondary' },
        { label: t('vax_premium_cta'), kind: 'primary', onPress: () => navigation.navigate('Paywall') },
      ],
    });
  }

  // ── Scan / upload a card or doctor's sheet ───────────────────────
  async function handleScanPress() {
    if (!(await hasPremium())) { premiumSheet(); return; }
    // Consent gate: the card photo/PDF goes to a third-party AI service — Apple
    // 5.1.1(i)/5.1.2(i) requires explicit permission before sending. Asked in the DoseTrace
    // sheet with the one shared consent key; the policy link opens the page and keeps the
    // flow cancelled (the user taps Scan again).
    if (!(await hasAIConsent())) {
      setScanSheet({
        icon: 'ai_spark',
        title: t('ai_consent_title'),
        body: t('ai_consent_body'),
        link: { label: t('ai_consent_privacy'), onPress: () => Linking.openURL(AI_PRIVACY_URL).catch(() => {}) },
        buttons: [
          { label: t('cancel'), kind: 'secondary' },
          { label: t('ai_consent_agree'), kind: 'primary', onPress: async () => { await grantAIConsent(); openScanChoice(); } },
        ],
      });
      return;
    }
    openScanChoice();
  }
  function openScanChoice() {
    setScanChoice({
      heading: t('vax_scan_choose_title'),
      title: t('vax_scan_choose_sub'),
      options: [
        { label: t('blood_source_camera'), onPress: () => pickImageAndExtract(true) },
        { label: t('blood_source_photo'), onPress: () => pickImageAndExtract(false) },
        { label: t('blood_source_pdf'), onPress: () => pickPdfAndExtract() },
      ],
      cancelLabel: t('cancel'),
    });
  }

  async function pickImageAndExtract(fromCamera) {
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
      if (!asset?.base64) { notice(scanErrorSheet('read', t), true); return; }
      if (asset.base64.length > MAX_FILE_BYTES * 1.4) { notice(scanErrorSheet('big', t), true); return; }
      const mediaType = asset.mimeType
        || (String(asset.uri || '').toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
      setUploading(true);
      await extractVaccines({ image_base64: asset.base64, media_type: mediaType });
    } catch (err) {
      setUploading(false);
      notice(scanErrorSheet('read', t), true);
    }
  }

  async function pickPdfAndExtract() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      setUploading(true);
      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
      if (base64.length > MAX_FILE_BYTES * 1.4) { setUploading(false); notice(scanErrorSheet('big', t), true); return; }
      await extractVaccines({ pdf_base64: base64 });
    } catch (err) {
      setUploading(false);
      notice(scanErrorSheet('read', t), true);
    }
  }

  async function extractVaccines(source) {
    // Robust gate: vaccine scanning is Premium-only. Re-check at the action
    // point (fresh isPremium) so the paid extraction never runs for a free user.
    if (!(await hasPremium())) {
      setUploading(false);
      premiumSheet();
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('extract-bloodwork', {
        body: { kind: 'vaccines', lang: language, ...source },
      });
      if (error) {
        setUploading(false);
        // Same distinction as lab scanning: a service outage is not the user's card; the
        // monthly limit names the limit the server sends (A-60).
        const status = error.context?.status;
        let errBody = null;
        try { errBody = await error.context?.clone?.().json(); } catch { /* body unavailable */ }
        notice(scanErrorSheet(scanErrorKind({ code: errBody?.code ?? null, status }), t, { what: 'vaccine', errBody }));
        return;
      }
      const raw = Array.isArray(data?.vaccines) ? data.vaccines : [];
      const clean = raw.map(validateVaccine).filter(Boolean);
      setUploading(false);
      if (clean.length === 0) { notice(scanErrorSheet('none', t)); return; }

      // Auto-save everything the AI read, dated from the document — no
      // record-by-record approval. The user edits later via the list. Entries
      // whose administration date couldn't be read are dropped (never dated to
      // today) and reported.
      const saved = await persistVaccines(clean);
      const dropped = raw.length - clean.length;
      const lines = [t(pluralKey('vax_imported_body', saved, language)).replace('{count}', String(saved))];
      if (dropped > 0) lines.push(t(pluralKey('vax_imported_dropped', dropped, language)).replace('{count}', String(dropped)));
      lines.push(t('vax_imported_hint'));
      notice({ icon: null, title: t('vax_imported_title'), body: lines.join('\n\n') });
    } catch (err) {
      setUploading(false);
      notice(scanErrorSheet('unread', t, { what: 'vaccine' }));
    }
  }

  // Insert extracted vaccines straight into storage (no review gate). Returns the
  // number saved. Dates come from each record's date_given.
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

  function formatDate(iso) {
    if (!iso) return '';
    return localeDate(String(iso).slice(0, 10), language, 'long') || iso;
  }

  function openAdd() {
    setEditingId(null);
    setName(''); setDateGiven(todayLocal()); setNextDue(''); setNotes('');
    setManufacturer(''); setDoseNumber(''); setBatchLot(''); setProvider(''); setLocation('');
    setPickerFor(null);
    setModalOpen(true);
  }

  function openEdit(v) {
    setEditingId(v.id);
    setName(v.name || '');
    setDateGiven(v.date_given || todayLocal());
    setNextDue(v.next_due || '');
    setNotes(v.notes || '');
    setManufacturer(v.manufacturer || '');
    setDoseNumber(v.dose_number != null ? String(v.dose_number) : '');
    setBatchLot(v.batch_lot || '');
    setProvider(v.provider || '');
    setLocation(v.location || '');
    setPickerFor(null);
    setModalOpen(true);
  }

  function showToast(text) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }
  function closeForm() {
    setPickerFor(null);
    setModalOpen(false);
  }

  async function save() {
    // MB-21: no name → say so (prototype toast), save nothing.
    if (vaccineNameMissing(name)) { showToast(t('vax_name_first')); return; }
    const user = await getCachedUser();
    if (!user) return;
    // dose_number is an integer column — keep only digits, null if empty/invalid.
    const doseInt = /^\d+$/.test(doseNumber.trim()) ? parseInt(doseNumber.trim(), 10) : null;
    const payload = {
      name: name.trim(),
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
    closeForm();
    fetchList();
  }

  // MB-22 (bug): Delete vaccine asks first; only the question's Delete writes the synced
  // tombstone (deleteVaccine → sync_status 'deleted').
  function askDeleteVaccine() {
    if (!editingId) return;
    const id = editingId;
    const copy = deleteVaccineCopy(t, name.trim());
    setFormSheet({
      title: copy.title,
      body: copy.body,
      buttons: [
        { label: t('cancel'), kind: 'secondary' },
        { label: t('blood_report_delete_confirm'), kind: 'danger', onPress: () => deleteVaccineNow(id) },
      ],
    });
  }
  function deleteVaccineNow(id) {
    deleteVaccine(id);
    requestSync();
    setModalOpen(false);
    fetchList();
  }

  const monthLabels = MONTHS_SHORT[language] || MONTHS_SHORT.en;
  const today = todayLocal();
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
          <TouchableOpacity style={[s.btn, s.btnP]} onPress={openAdd} accessibilityRole="button">
            <Text style={s.btnPText}>+ {t('vax_add')}</Text>
          </TouchableOpacity>
          {/* One indicator while a record is read: the card below (MB-23), never the button. */}
          <TouchableOpacity style={[s.btn, s.btnO]} onPress={handleScanPress} disabled={uploading} accessibilityRole="button" accessibilityState={{ disabled: uploading }}>
            <FeatureIcon name="lab_frame" size={18} color={colors.ink} />
            <Text style={s.btnOText}>{t('vax_scan')}</Text>
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
            <FeatureIcon name="syringe_tilt" size={44} color={colors.ink3} />
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

      {/* ADD / EDIT (prototype vaxForm): a bottom sheet that hugs its content. */}
      <BottomSheet visible={modalOpen} onClose={closeForm} overlay={<SheetToast text={toast} />}>
        <SheetBar
          title={editingId ? t('vax_edit_title') : t('vax_add_title')}
          cancelLabel={t('cancel')}
          onCancel={closeForm}
          actionLabel={t('save')}
          onAction={save}
        />
        <View style={s.fld}>
          <Text style={s.fieldLabel}>{t('vax_name_label')}</Text>
          <TextInput
            style={s.input}
            placeholder={t('vax_name_ph')}
            placeholderTextColor={colors.ink3}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={s.fld}>
          <Text style={s.fieldLabel}>{t('vax_date_given')}</Text>
          <TouchableOpacity style={s.dateBtn} onPress={() => setPickerFor('given')} accessibilityRole="button">
            <Text style={[s.body, s.tnum]}>{formatDate(dateGiven)}</Text>
            <FeatureIcon name="calendar" size={20} color={colors.ink2} />
          </TouchableOpacity>
        </View>

        <View style={s.fld}>
          <View style={s.dueHeader}>
            <Text style={[s.fieldLabel, s.grow]}>{t('vax_next_due_opt')}</Text>
            {nextDue ? (
              <TouchableOpacity onPress={() => setNextDue('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button">
                <Text style={s.clearLink}>{t('vax_clear')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity style={s.dateBtn} onPress={() => setPickerFor('due')} accessibilityRole="button">
            <Text style={[nextDue ? s.body : s.bodyMuted, s.tnum]}>
              {nextDue ? formatDate(nextDue) : t('vax_next_due_none')}
            </Text>
            <FeatureIcon name="calendar" size={20} color={colors.ink2} />
          </TouchableOpacity>
        </View>

        <Text style={s.sectionLabel}>{t('vax_details_section')}</Text>

        <View style={s.fieldRow}>
          <View style={[s.fld, s.fieldCol]}>
            <Text style={s.fieldLabel}>{t('vax_manufacturer')}</Text>
            <TextInput
              style={s.input}
              placeholder={t('vax_manufacturer_ph')}
              placeholderTextColor={colors.ink3}
              value={manufacturer}
              onChangeText={setManufacturer}
            />
          </View>
          <View style={[s.fld, s.fieldColNarrow]}>
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

        <View style={s.fld}>
          <Text style={s.fieldLabel}>{t('vax_batch_lot')}</Text>
          <TextInput
            style={s.input}
            placeholder={t('vax_batch_lot_ph')}
            placeholderTextColor={colors.ink3}
            value={batchLot}
            onChangeText={setBatchLot}
            autoCapitalize="characters"
          />
        </View>

        <View style={s.fld}>
          <Text style={s.fieldLabel}>{t('vax_provider')}</Text>
          <TextInput
            style={s.input}
            placeholder={t('vax_provider_ph')}
            placeholderTextColor={colors.ink3}
            value={provider}
            onChangeText={setProvider}
          />
        </View>

        <View style={s.fld}>
          <Text style={s.fieldLabel}>{t('vax_location')}</Text>
          <TextInput
            style={s.input}
            placeholder={t('vax_location_ph')}
            placeholderTextColor={colors.ink3}
            value={location}
            onChangeText={setLocation}
          />
        </View>

        <View style={s.fld}>
          <Text style={s.fieldLabel}>{t('vax_notes')}</Text>
          <TextInput
            style={[s.input, s.notesInput]}
            placeholder={t('vax_notes_ph')}
            placeholderTextColor={colors.ink3}
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>

        {editingId ? (
          <TouchableOpacity style={s.dangerBtn} onPress={askDeleteVaccine} accessibilityRole="button">
            <Text style={s.dangerText}>{t('vax_delete')}</Text>
          </TouchableOpacity>
        ) : null}

        {/* The date wheels (prototype openDate): a sheet titled with the field, Done. The day
            is one local ISO string shared by the field and the wheel (MB-21). */}
        <DTPickerSheet visible={pickerFor === 'given'} title={t('vax_date_given')} doneLabel={t('done')} onDone={() => setPickerFor(null)}>
          <DTWheel
            columns={wheelColumns(dateGiven || today, new Date(), monthLabels, GIVEN_RANGE)}
            onChange={(col, i) => setDateGiven(wheelAfter(dateGiven || today, new Date(), col, i, { ...GIVEN_RANGE, max: today }))}
          />
        </DTPickerSheet>
        <DTPickerSheet visible={pickerFor === 'due'} title={t('vax_next_due_opt')} doneLabel={t('done')} onDone={() => { if (!nextDue) setNextDue(today); setPickerFor(null); }}>
          <DTWheel
            columns={wheelColumns(nextDue || today, new Date(), monthLabels, DUE_RANGE)}
            onChange={(col, i) => setNextDue(wheelAfter(nextDue || today, new Date(), col, i, DUE_RANGE))}
          />
        </DTPickerSheet>
        {/* Delete vaccine? shows over the sheet. */}
        <DTSheet config={modalOpen ? formSheet : null} onClose={() => setFormSheet(null)} />
      </BottomSheet>

      {/* The scan's sheets (part 19 / 20): permission, source, results, errors, Premium. */}
      <DTSheet config={modalOpen ? null : scanSheet} onClose={() => setScanSheet(null)} />
      <DTActionSheet config={scanChoice} onClose={() => setScanChoice(null)} />
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

  // add / edit sheet (prototype .fld: label 13 ink2 with 4 pt inset, 10 pt to the field)
  fld: { gap: 10 },
  fieldLabel: { fontSize: 13, lineHeight: 18, color: c.ink2, paddingHorizontal: 4 },
  sectionLabel: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink, paddingHorizontal: 4, paddingTop: 6 },
  fieldRow: { flexDirection: 'row', gap: 12 },
  fieldCol: { flex: 1 },
  fieldColNarrow: { width: 96 },
  notesInput: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  dateBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.well },
  dueHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clearLink: { fontSize: 13, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick, paddingHorizontal: 4 },
  dangerBtn: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  dangerText: { fontSize: 17, fontWeight: '600', color: c.risk, textAlign: 'center' },
});
