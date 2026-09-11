/**
 * DoseTrace — AI nutrition logger (build 52). Lives in the Journey tab, under the
 * reality-check. Premium-only; free users see an animated teaser + upsell.
 *
 * Regulatory (Apple 1.4.1 / SaMD, founder AI hard line): the model only returns
 * structured estimates; this UI renders totals and NEVER shows model prose. An
 * advice-shaped question comes back as a refusal and is met with a fixed
 * deflection card that points to a professional — never an answer. Estimates are
 * always framed as estimates (~) and the user can delete/fix any entry. See
 * docs/nutrition-logger-conversation-spec.md.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getCachedUser } from '../../lib/supabase';
import { isPremium } from '../../lib/purchases';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../lib/theme';
import { requestSync } from '../../lib/sync';
import {
  getFoodLogsByDate, getFoodLogsSince, insertFoodLog, updateFoodLog, deleteFoodLog,
} from '../../lib/database';
import { parseFood } from '../../lib/nutritionClient';
import { dayTotals, pickNudge } from '../../lib/nutrition';
import { requestAIConsent } from '../../lib/aiConsent';

const todayISO = () => new Date().toISOString().split('T')[0];
const safeItems = (json) => { try { const a = JSON.parse(json); return Array.isArray(a) ? a : []; } catch { return []; } };

// ── Animated locked-state teaser (premium upsell) ────────────────
// A lightweight typing loop of the AI prompt over a sample day, so a free user
// sees what the tool does before paying. Pure state (no animation lib) for
// reliability. Founder decision: premium-gated, but show what it is first.
function LockedDemo({ s, colors, t, onUnlock }) {
  const [typed, setTyped] = useState('');
  const timers = useRef([]);
  useEffect(() => {
    let cancelled = false;
    const full = t('nutri_intro');
    function loop() {
      setTyped('');
      let i = 0;
      const step = () => {
        if (cancelled) return;
        i += 1;
        setTyped(full.slice(0, i));
        if (i < full.length) timers.current.push(setTimeout(step, 38));
        else timers.current.push(setTimeout(loop, 3200)); // hold, then retype
      };
      timers.current.push(setTimeout(step, 600));
    }
    loop();
    return () => { cancelled = true; timers.current.forEach(clearTimeout); timers.current = []; };
  }, [t]);

  return (
    <View style={s.card}>
      <View style={s.demoBubble}><Text style={s.demoBubbleText}>{typed}<Text style={s.caret}>▎</Text></Text></View>
      <View style={s.demoUser}><Text style={s.demoUserText}>3 eggs, 2 toasts and a coffee</Text></View>
      <View style={s.demoBreak}>
        <View style={s.entryRow}><Text style={s.entryFood}>3 eggs</Text><Text style={s.entryKcal}>~210 kcal</Text></View>
        <View style={s.entryRow}><Text style={s.entryFood}>2 toast</Text><Text style={s.entryKcal}>~160 · 28 C</Text></View>
        <View style={s.entryRow}><Text style={s.entryFood}>Coffee</Text><Text style={s.entryKcal}>~5</Text></View>
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
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [deflect, setDeflect] = useState(false);
  const [shownNudges, setShownNudges] = useState([]);
  const [nudge, setNudge] = useState(null);
  const loadedRef = useRef(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    setPremium(await isPremium());
    const user = await getCachedUser();
    const uid = user?.id || null;
    setUserId(uid);
    if (uid) {
      const rows = getFoodLogsByDate(uid, todayISO());
      setEntries(rows);
      // Retry any offline/unparsed rows now that we may be online.
      if (!loadedRef.current) { rows.forEach(r => { if (r.parse_status === 'pending' && r.raw_text) reparse(r); }); }
    }
    loadedRef.current = true;
  }

  function refresh(uid) {
    if (!uid) return;
    setEntries(getFoodLogsByDate(uid, todayISO()));
  }

  async function reparse(row) {
    const res = await parseFood(row.raw_text, language, row.entry_date);
    if (res.ok && !res.refusal && res.items.length && res.totals) {
      updateFoodLog(row.id, {
        parsed_items: JSON.stringify(res.items), kcal: res.totals.kcal,
        protein_g: res.totals.protein_g, carb_g: res.totals.carb_g, fat_g: res.totals.fat_g,
        parse_status: 'done',
      });
      requestSync?.();
      refresh(userId);
    }
  }

  async function onSubmit() {
    const raw = text.trim();
    if (!raw || busy || !userId) return;
    // Consent gate (Apple 5.1.1(i)): meal text goes to Anthropic — ask once (v3).
    const consented = await requestAIConsent(t);
    if (!consented) return;
    setDeflect(false);
    setBusy(true);
    // Offline-first: save the raw entry immediately (pending).
    const id = insertFoodLog({ user_id: userId, entry_date: todayISO(), raw_text: raw, parse_status: 'pending' });
    setText('');
    refresh(userId);

    const res = await parseFood(raw, language, todayISO());
    setBusy(false);

    if (res.ok && res.refusal) {
      // Advice-shaped question — not a food log. Remove the row, show deflection.
      deleteFoodLog(id); requestSync?.(); refresh(userId); setDeflect(true);
      return;
    }
    if (res.ok && (!res.items.length || !res.totals)) {
      // Nothing loggable found — drop it and nudge to rephrase.
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
      // Advance the gentle whole-day nudge.
      const next = pickNudge(shownNudges, new Date());
      if (next) { setShownNudges(prev => [...prev, next.id]); setNudge(next); } else { setNudge(null); }
      return;
    }
    // Errors: keep the raw row (offline-first) except a hard quota stop.
    if (res.code === 'quota_exceeded' || res.status === 429) {
      deleteFoodLog(id); requestSync?.(); refresh(userId);
      Alert.alert(t('nutri_title'), t('nutri_quota'));
    } else {
      // network/provider/etc — leave it pending, tell the user it'll estimate later.
      Alert.alert(t('nutri_title'), t('nutri_offline_saved'));
    }
  }

  function confirmDelete(row) {
    Alert.alert(t('nutri_title'), t('nutri_delete_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('nutri_delete'), style: 'destructive', onPress: () => { deleteFoodLog(row.id); requestSync?.(); refresh(userId); } },
    ]);
  }

  const totals = dayTotals(entries.filter(e => e.parse_status === 'done'));

  const nudgeText = nudge
    ? t(`nutri_nudge_${nudge.id}${nudge.id === 'lunch' || nudge.id === 'dinner' ? '_' + nudge.tense : ''}`)
    : null;

  if (!premium) {
    return (
      <View style={s.wrap}>
        <SectionTitle s={s} colors={colors} t={t} />
        <LockedDemo s={s} colors={colors} t={t} onUnlock={() => navigation.navigate('Paywall')} />
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <SectionTitle s={s} colors={colors} t={t} />

      {/* Day total */}
      <View style={s.dayBar}>
        <Text style={s.dayLabel}>{t('nutri_today')}</Text>
        <Text style={s.dayVal}>≈ <Text style={s.dayKcal}>{totals.kcal}</Text> {t('cal_kcal')} · {totals.carb_g} g C · {totals.protein_g} g P</Text>
      </View>

      {/* Today's entries */}
      {entries.map(e => {
        const items = safeItems(e.parsed_items);
        const pending = e.parse_status === 'pending';
        return (
          <TouchableOpacity key={e.id} style={s.card} activeOpacity={0.7} onLongPress={() => confirmDelete(e)}>
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

      {/* Advice deflection (fixed card — never a model answer) */}
      {deflect && (
        <View style={s.deflect}>
          <Text style={s.deflectTitle}>{t('nutri_deflect_title')}</Text>
          <Text style={s.deflectBody}>{t('nutri_deflect_body')}</Text>
        </View>
      )}

      {/* The 8pm prompt / gentle nudge */}
      <Text style={s.prompt}>{nudgeText || t('nutri_intro')}</Text>

      {/* Input */}
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder={t('nutri_input_placeholder')}
          placeholderTextColor={colors.textFaint}
          multiline
          editable={!busy}
          onSubmitEditing={onSubmit}
        />
        <TouchableOpacity style={[s.send, (busy || !text.trim()) && s.sendOff]} onPress={onSubmit} disabled={busy || !text.trim()}>
          {busy ? <ActivityIndicator size="small" color={colors.accentText} /> : <Text style={s.sendText}>{t('nutri_send')}</Text>}
        </TouchableOpacity>
      </View>
      <Text style={s.estNote}>{t('nutri_est_note')}</Text>
    </View>
  );
}

function SectionTitle({ s, t }) {
  return <Text style={s.section}>{t('nutri_title')}</Text>;
}

const makeStyles = (c) => StyleSheet.create({
  wrap: { marginTop: 22 },
  section: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: c.textMuted, marginBottom: 10, marginHorizontal: 2 },
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
  // locked demo
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
});
