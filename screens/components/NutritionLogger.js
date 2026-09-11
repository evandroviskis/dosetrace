/**
 * DoseTrace — AI nutrition logger (build 52). Lives in the Journey tab, under the
 * reality-check. First 3 logged days are free, then Premium (founder decision A).
 *
 * Regulatory (Apple 1.4.1 / SaMD, founder AI hard line): the model only returns
 * structured estimates; this UI renders totals and NEVER shows model prose. An
 * advice-shaped question comes back as a refusal and is met with a fixed
 * deflection card that points to a professional — never an answer. Estimates are
 * always framed as estimates (~) and the user can fix or remove any entry. See
 * docs/nutrition-logger-conversation-spec.md.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, AccessibilityInfo } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getCachedUser } from '../../lib/supabase';
import { isPremium } from '../../lib/purchases';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { requestSync } from '../../lib/sync';
import {
  getFoodLogsByDate, getFoodLogDayCount, insertFoodLog, updateFoodLog, deleteFoodLog,
} from '../../lib/database';
import { parseFood } from '../../lib/nutritionClient';
import { dayTotals, pickNudge } from '../../lib/nutrition';
import { requestAIConsent } from '../../lib/aiConsent';

const FREE_DAYS = 3;
const todayISO = () => new Date().toISOString().split('T')[0];
const safeItems = (json) => { try { const a = JSON.parse(json); return Array.isArray(a) ? a : []; } catch { return []; } };
const numOr = (v, d = 0) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };

// ── Animated locked-state teaser (premium upsell) ────────────────
// Types the AI prompt over a sample day so a free user sees what the tool does.
// Respects Reduce Motion: if enabled, it renders the final frame statically (no
// loop) — accessibility + it avoids the "generic chatbot" feel on that setting.
function LockedDemo({ s, t, onUnlock }) {
  const [typed, setTyped] = useState('');
  const timers = useRef([]);
  useEffect(() => {
    let cancelled = false;
    const full = t('nutri_intro');
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) { setTyped(full); return; } // static, no loop
      const loop = () => {
        setTyped('');
        let i = 0;
        const step = () => {
          if (cancelled) return;
          i += 1;
          setTyped(full.slice(0, i));
          if (i < full.length) timers.current.push(setTimeout(step, 38));
          else timers.current.push(setTimeout(loop, 3200));
        };
        timers.current.push(setTimeout(step, 600));
      };
      loop();
    });
    return () => { cancelled = true; timers.current.forEach(clearTimeout); timers.current = []; };
  }, [t]);

  return (
    <View style={s.card}>
      <View style={s.demoBubble}><Text style={s.demoBubbleText}>{typed}<Text style={s.caret}>▎</Text></Text></View>
      <View style={s.demoUser}><Text style={s.demoUserText}>{t('nutri_demo_meal')}</Text></View>
      <View style={s.demoBreak}>
        <View style={[s.entryRow, s.entryTot]}>
          <Text style={s.entryTotFood}>≈ 480 {t('cal_kcal')}</Text>
          <Text style={s.entryTotMacro}>55 C · 26 P</Text>
        </View>
      </View>
      <Text style={s.lockedTitle}>{t('nutri_locked_title')}</Text>
      <Text style={s.lockedSub}>{t('nutri_locked_sub')}</Text>
      <TouchableOpacity style={s.cta} onPress={onUnlock} activeOpacity={0.8}>
        <Text style={s.ctaText}>{t('nutri_locked_cta')}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function NutritionLogger() {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const s = makeStyles(colors);

  const [premium, setPremium] = useState(false);
  const [userId, setUserId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [dayCount, setDayCount] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [deflect, setDeflect] = useState(false);
  const [shownNudges, setShownNudges] = useState([]);
  const [nudge, setNudge] = useState(null);
  const [editEntry, setEditEntry] = useState(null); // the entry open in the fix modal
  const [editItems, setEditItems] = useState([]);
  const reparsingRef = useRef(new Set());

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    setPremium(await isPremium());
    const user = await getCachedUser();
    const uid = user?.id || null;
    setUserId(uid);
    if (uid) {
      const rows = getFoodLogsByDate(uid, todayISO());
      setEntries(rows);
      setDayCount(getFoodLogDayCount(uid));
      // Retry any still-pending rows on EVERY focus (e.g. logged offline, now online).
      rows.forEach((r) => { if (r.parse_status === 'pending' && r.raw_text) reparse(r, uid); });
    }
  }

  function refresh(uid) {
    if (!uid) return;
    setEntries(getFoodLogsByDate(uid, todayISO()));
    setDayCount(getFoodLogDayCount(uid));
  }

  async function reparse(row, uid) {
    if (reparsingRef.current.has(row.id)) return; // don't double-fire on rapid focus
    reparsingRef.current.add(row.id);
    try {
      const res = await parseFood(row.raw_text, language, row.entry_date);
      if (res.ok && !res.refusal && res.items.length && res.totals) {
        updateFoodLog(row.id, {
          parsed_items: JSON.stringify(res.items), kcal: res.totals.kcal,
          protein_g: res.totals.protein_g, carb_g: res.totals.carb_g, fat_g: res.totals.fat_g,
          parse_status: 'done',
        });
        requestSync?.();
        refresh(uid);
      }
    } finally {
      reparsingRef.current.delete(row.id);
    }
  }

  async function onSubmit() {
    const raw = text.trim();
    if (!raw || busy || !userId) return;
    const consented = await requestAIConsent(t);
    if (!consented) return;
    setDeflect(false);
    setBusy(true);
    const id = insertFoodLog({ user_id: userId, entry_date: todayISO(), raw_text: raw, parse_status: 'pending' });
    setText('');
    refresh(userId);

    const res = await parseFood(raw, language, todayISO());
    setBusy(false);

    if (res.ok && res.refusal) {
      deleteFoodLog(id); requestSync?.(); refresh(userId); setDeflect(true);
      return;
    }
    if (res.ok && (!res.items.length || !res.totals)) {
      deleteFoodLog(id); requestSync?.(); refresh(userId);
      Alert.alert(t('nutri_title'), t('nutri_entry_none'));
      return;
    }
    if (res.ok) {
      updateFoodLog(id, {
        parsed_items: JSON.stringify(res.items), kcal: res.totals.kcal,
        protein_g: res.totals.protein_g, carb_g: res.totals.carb_g, fat_g: res.totals.fat_g,
        parse_status: 'done',
      });
      requestSync?.(); refresh(userId);
      const next = pickNudge(shownNudges, new Date());
      if (next) { setShownNudges((prev) => [...prev, next.id]); setNudge(next); } else { setNudge(null); }
      return;
    }
    if (res.code === 'quota_exceeded' || res.status === 429) {
      deleteFoodLog(id); requestSync?.(); refresh(userId);
      Alert.alert(t('nutri_title'), t('nutri_quota'));
    } else {
      Alert.alert(t('nutri_title'), t('nutri_offline_saved'));
    }
  }

  // ── Fix-an-entry (tap-to-fix, founder decision B) ────────────────
  function openEdit(row) {
    setEditEntry(row);
    setEditItems(safeItems(row.parsed_items).map((it) => ({ ...it })));
  }
  function setItemField(i, field, val) {
    setEditItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [field]: val } : it)));
  }
  function removeItem(i) {
    setEditItems((prev) => prev.filter((_, idx) => idx !== i));
  }
  function saveEdit() {
    if (!editEntry) return;
    const cleaned = editItems.map((it) => ({
      ...it, kcal: numOr(it.kcal), carb_g: numOr(it.carb_g), protein_g: numOr(it.protein_g),
    }));
    if (!cleaned.length) { // all items removed → delete the entry
      deleteFoodLog(editEntry.id); requestSync?.(); setEditEntry(null); refresh(userId); return;
    }
    const sum = (k) => Math.round(cleaned.reduce((a, it) => a + (Number(it[k]) || 0), 0));
    updateFoodLog(editEntry.id, {
      parsed_items: JSON.stringify(cleaned), kcal: sum('kcal'),
      carb_g: sum('carb_g'), protein_g: sum('protein_g'),
    });
    requestSync?.(); setEditEntry(null); refresh(userId);
  }
  function deleteFromEdit() {
    if (!editEntry) return;
    deleteFoodLog(editEntry.id); requestSync?.(); setEditEntry(null); refresh(userId);
  }

  const totals = dayTotals(entries.filter((e) => e.parse_status === 'done'));
  const nudgeText = nudge
    ? t(`nutri_nudge_${nudge.id}${nudge.id === 'lunch' || nudge.id === 'dinner' ? '_' + nudge.tense : ''}`)
    : null;
  const freeLeft = Math.max(0, FREE_DAYS - dayCount);
  const gated = !premium && dayCount >= FREE_DAYS;

  if (gated) {
    return (
      <View style={s.wrap}>
        <SectionTitle s={s} t={t} />
        <LockedDemo s={s} t={t} onUnlock={() => navigation.navigate('Paywall')} />
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <SectionTitle s={s} t={t} />

      {!premium && freeLeft > 0 && (
        <Text style={s.freeNote}>{t('nutri_free_note').replace('{n}', String(freeLeft))}</Text>
      )}

      <View style={s.dayBar}>
        <Text style={s.dayLabel}>{t('nutri_today')}</Text>
        <Text style={s.dayVal}>≈ <Text style={s.dayKcal}>{totals.kcal}</Text> {t('cal_kcal')} · {totals.carb_g} g C · {totals.protein_g} g P</Text>
      </View>

      {entries.map((e) => {
        const items = safeItems(e.parsed_items);
        const pending = e.parse_status === 'pending';
        return (
          <TouchableOpacity key={e.id} style={s.card} activeOpacity={0.7} onPress={() => !pending && openEdit(e)}>
            {pending ? (
              <Text style={s.pendingText}>{e.raw_text} · {t('nutri_offline_saved')}</Text>
            ) : (
              <>
                {items.map((it, i) => (
                  <View key={i} style={s.entryRow}>
                    <Text style={s.entryFood}>{it.food}</Text>
                    <Text style={s.entryKcal}>~{Math.round(it.kcal || 0)} {t('cal_kcal')}</Text>
                  </View>
                ))}
                <View style={[s.entryRow, s.entryTot]}>
                  <Text style={s.entryTotFood}>≈ {Math.round(e.kcal || 0)} {t('cal_kcal')}</Text>
                  <Text style={s.entryTotMacro}>{Math.round(e.carb_g || 0)} C · {Math.round(e.protein_g || 0)} P</Text>
                </View>
              </>
            )}
          </TouchableOpacity>
        );
      })}

      {deflect && (
        <View style={s.deflect}>
          <Text style={s.deflectTitle}>{t('nutri_deflect_title')}</Text>
          <Text style={s.deflectBody}>{t('nutri_deflect_body')}</Text>
        </View>
      )}

      <Text style={s.prompt}>{nudgeText || t('nutri_intro')}</Text>

      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder={t('nutri_input_placeholder')}
          placeholderTextColor={colors.textFaint}
          multiline
          editable={!busy}
        />
        <TouchableOpacity style={[s.send, (busy || !text.trim()) && s.sendOff]} onPress={onSubmit} disabled={busy || !text.trim()}>
          {busy ? <ActivityIndicator size="small" color={colors.accentText} /> : <Text style={s.sendText}>{t('nutri_send')}</Text>}
        </TouchableOpacity>
      </View>
      <Text style={s.estNote}>{t('nutri_est_note')}</Text>

      {/* Fix-an-entry modal */}
      <Modal visible={!!editEntry} transparent animationType="fade" onRequestClose={() => setEditEntry(null)}>
        <View style={s.modalWrap}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{t('nutri_edit_title')}</Text>
            {editItems.map((it, i) => (
              <View key={i} style={s.editItem}>
                <Text style={s.editFood} numberOfLines={1}>{it.food}</Text>
                <View style={s.editFields}>
                  <EditNum s={s} colors={colors} label={t('cal_kcal')} value={it.kcal} onChange={(v) => setItemField(i, 'kcal', v)} />
                  <EditNum s={s} colors={colors} label="C" value={it.carb_g} onChange={(v) => setItemField(i, 'carb_g', v)} />
                  <EditNum s={s} colors={colors} label="P" value={it.protein_g} onChange={(v) => setItemField(i, 'protein_g', v)} />
                  <TouchableOpacity style={s.editDel} onPress={() => removeItem(i)}><Text style={s.editDelX}>✕</Text></TouchableOpacity>
                </View>
              </View>
            ))}
            <TouchableOpacity style={s.modalSave} onPress={saveEdit}><Text style={s.modalSaveText}>{t('nutri_save')}</Text></TouchableOpacity>
            <View style={s.modalFoot}>
              <TouchableOpacity onPress={() => setEditEntry(null)}><Text style={s.modalCancel}>{t('cancel')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={deleteFromEdit}><Text style={s.modalDelete}>{t('nutri_delete_entry')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function EditNum({ s, colors, label, value, onChange }) {
  return (
    <View style={s.editNum}>
      <TextInput
        style={s.editInput}
        value={value == null ? '' : String(Math.round(Number(value) || 0))}
        onChangeText={onChange}
        keyboardType="number-pad"
        placeholderTextColor={colors.textFaint}
      />
      <Text style={s.editNumLabel}>{label}</Text>
    </View>
  );
}

function SectionTitle({ s, t }) {
  return <Text style={s.section}>{t('nutri_title')}</Text>;
}

const makeStyles = (c) => StyleSheet.create({
  wrap: { marginTop: 22 },
  section: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: c.textMuted, marginBottom: 10, marginHorizontal: 2 },
  freeNote: { fontSize: 11.5, fontWeight: '700', color: c.accentSoftText, backgroundColor: c.accentSoft, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7, marginBottom: 10, overflow: 'hidden' },
  card: { backgroundColor: c.card, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: c.border },
  dayBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.card2, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, marginBottom: 10 },
  dayLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: c.textFaint },
  dayVal: { fontSize: 13, fontWeight: '700', color: c.text },
  dayKcal: { color: c.accent, fontWeight: '800' },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 3, gap: 10 },
  entryFood: { fontSize: 13, color: c.text, flex: 1 },
  entryKcal: { fontSize: 12, color: c.textMuted },
  entryTot: { borderTopWidth: 0.5, borderTopColor: c.border, marginTop: 6, paddingTop: 8 },
  entryTotFood: { fontSize: 13, fontWeight: '800', color: c.text },
  entryTotMacro: { fontSize: 12, fontWeight: '700', color: c.accentSoftText },
  pendingText: { fontSize: 12.5, color: c.textMuted, lineHeight: 18 },
  deflect: { backgroundColor: c.warningSoft, borderRadius: 14, padding: 14, marginBottom: 10 },
  deflectTitle: { fontSize: 13, fontWeight: '800', color: c.warningSoftText, marginBottom: 4 },
  deflectBody: { fontSize: 12.5, color: c.warningSoftText, lineHeight: 18 },
  prompt: { fontSize: 14, fontWeight: '600', color: c.text, marginTop: 4, marginBottom: 10, lineHeight: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: c.text, borderWidth: 0.5, borderColor: c.border, maxHeight: 110 },
  send: { backgroundColor: c.accent, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', minWidth: 64 },
  sendOff: { opacity: 0.4 },
  sendText: { color: c.accentText, fontWeight: '700', fontSize: 14 },
  estNote: { fontSize: 11, color: c.textFaint, lineHeight: 15, marginTop: 8 },
  demoBubble: { alignSelf: 'flex-start', backgroundColor: c.card2, borderRadius: 14, borderBottomLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, maxWidth: '90%' },
  demoBubbleText: { fontSize: 13.5, color: c.text, lineHeight: 19 },
  caret: { color: c.accent },
  demoUser: { alignSelf: 'flex-end', backgroundColor: c.accentSoft, borderRadius: 14, borderBottomRightRadius: 4, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 10, maxWidth: '85%' },
  demoUserText: { fontSize: 13, color: c.accentSoftText },
  demoBreak: { backgroundColor: c.card2, borderRadius: 12, padding: 11, marginBottom: 14 },
  lockedTitle: { fontSize: 15, fontWeight: '800', color: c.text, textAlign: 'center' },
  lockedSub: { fontSize: 12.5, color: c.textMuted, textAlign: 'center', lineHeight: 18, marginTop: 6, marginBottom: 14 },
  cta: { backgroundColor: c.accent, borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  ctaText: { color: c.accentText, fontWeight: '800', fontSize: 14 },
  // fix-entry modal
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 22 },
  modalCard: { backgroundColor: c.card, borderRadius: 18, padding: 16 },
  modalTitle: { fontSize: 15, fontWeight: '800', color: c.text, marginBottom: 12 },
  editItem: { marginBottom: 12 },
  editFood: { fontSize: 13, fontWeight: '600', color: c.text, marginBottom: 6 },
  editFields: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editNum: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  editInput: { flex: 1, backgroundColor: c.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14, color: c.text, borderWidth: 0.5, borderColor: c.border, textAlign: 'center' },
  editNumLabel: { fontSize: 10, fontWeight: '700', color: c.textFaint },
  editDel: { padding: 6 },
  editDelX: { fontSize: 14, color: c.textFaint },
  modalSave: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  modalSaveText: { color: c.accentText, fontWeight: '800', fontSize: 14 },
  modalFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  modalCancel: { fontSize: 13, fontWeight: '600', color: c.textMuted },
  modalDelete: { fontSize: 13, fontWeight: '700', color: c.danger || c.warningSoftText },
});
