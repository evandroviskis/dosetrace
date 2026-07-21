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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getCachedUser } from '../../lib/supabase';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { getVaccines, insertVaccine, updateVaccine, deleteVaccine } from '../../lib/database';
import { requestSync } from '../../lib/sync';

const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export default function VaccinesSection() {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
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

  useFocusEffect(useCallback(() => { fetchList(); }, []));

  async function fetchList() {
    const user = await getCachedUser();
    if (!user) return;
    setList(getVaccines(user.id) || []);
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

        <TouchableOpacity style={s.addBtn} onPress={openAdd}>
          <Text style={s.addBtnText}>＋ {t('vax_add')}</Text>
        </TouchableOpacity>

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
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  wrap: { flex: 1 },
  scroll: { flex: 1, padding: 16 },
  hubDisclaimer: { fontSize: 11, color: c.textFaint, lineHeight: 16, marginBottom: 12 },
  addBtn: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
  addBtnText: { color: c.accentText, fontSize: 14, fontWeight: '600' },
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
