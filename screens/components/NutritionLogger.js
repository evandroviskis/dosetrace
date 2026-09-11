/**
 * DoseTrace — AI nutrition logger (build 53). Lives in the Journey tab. First 3
 * logged days are free, then Premium (founder decision A).
 *
 * Layout (founder-directed): the AI composer is the pinned hero at the top — it
 * reads as the special AI feature, not a plain field. Under it, the 7-day average
 * + day history are a COLLAPSIBLE detail (the average is only read weekly by the
 * reality-check, so it's out of the way until wanted). Days are grouped, newest
 * first, each expandable.
 *
 * Regulatory (Apple 1.4.1 / SaMD, founder AI hard line): the model returns
 * structured estimates only; this UI renders totals and NEVER model prose. An
 * advice-shaped question → refusal → a fixed deflection card pointing to a
 * professional. Estimates are always framed as estimates (~ / ≈).
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
  getFoodLogsByDate, getFoodLogsSince, getFoodLogDayCount, insertFoodLog, updateFoodLog, deleteFoodLog,
} from '../../lib/database';
import { parseFood } from '../../lib/nutritionClient';
import { rollingAvgKcal, pickNudge, groupByDay } from '../../lib/nutrition';
import { requestAIConsent } from '../../lib/aiConsent';
import FeatureIcon from '../../components/FeatureIcon';

const FREE_DAYS = 3;
const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };
const todayISO = () => new Date().toISOString().split('T')[0];
const daysAgoISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; };
const safeItems = (json) => { try { const a = JSON.parse(json); return Array.isArray(a) ? a : []; } catch { return []; } };
const numOr = (v, d = 0) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };

// The animated example — used both for the "See how it works" modal (trial users)
// and the locked upsell (post-trial). Respects Reduce Motion (static final frame).
function DemoBody({ s, t, ctaLabel, onCta }) {
  const [typed, setTyped] = useState('');
  const timers = useRef([]);
  useEffect(() => {
    let cancelled = false;
    const full = t('nutri_intro');
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) { setTyped(full); return; }
      const loop = () => {
        setTyped('');
        let i = 0;
        const step = () => {
          if (cancelled) return;
          i += 1; setTyped(full.slice(0, i));
          if (i < full.length) timers.current.push(setTimeout(step, 38));
          else timers.current.push(setTimeout(loop, 3200));
        };
        timers.current.push(setTimeout(step, 500));
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
          <Text style={s.entryTotMacro}>55 g {t('nutri_carbs')} · 26 g {t('nutri_protein')}</Text>
        </View>
      </View>
      <Text style={s.lockedTitle}>{t('nutri_locked_title')}</Text>
      <Text style={s.lockedSub}>{t('nutri_locked_sub')}</Text>
      <TouchableOpacity style={s.cta} onPress={onCta} activeOpacity={0.8}>
        <Text style={s.ctaText}>{ctaLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function NutritionLogger() {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const s = makeStyles(colors);
  const locale = LOCALE_MAP[language] || 'en-US';

  const [premium, setPremium] = useState(false);
  const [userId, setUserId] = useState(null);
  const [recent, setRecent] = useState([]);        // last ~30 days of entries
  const [dayCount, setDayCount] = useState(0);
  const [avg, setAvg] = useState(null);            // { avgKcal, loggedDays } (7-day)
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [deflect, setDeflect] = useState(false);
  const [fixHint, setFixHint] = useState(false);
  const [shownNudges, setShownNudges] = useState([]);
  const [nudge, setNudge] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);  // 7-day avg + day history
  const [openDays, setOpenDays] = useState({});         // { 'YYYY-MM-DD': true }
  const [showDemo, setShowDemo] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const reparsingRef = useRef(new Set());

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    setPremium(await isPremium());
    const user = await getCachedUser();
    const uid = user?.id || null;
    setUserId(uid);
    if (uid) { refresh(uid); getFoodLogsByDate(uid, todayISO()).forEach((r) => { if (r.parse_status === 'pending' && r.raw_text) reparse(r, uid); }); }
  }

  function refresh(uid) {
    if (!uid) return;
    const rows = getFoodLogsSince(uid, daysAgoISO(30));
    setRecent(rows);
    setDayCount(getFoodLogDayCount(uid));
    setAvg(rollingAvgKcal(rows, todayISO(), 7));
  }

  async function reparse(row, uid) {
    if (reparsingRef.current.has(row.id)) return;
    reparsingRef.current.add(row.id);
    try {
      const res = await parseFood(row.raw_text, language, row.entry_date);
      if (!res.ok) return; // still offline / transient — keep pending, retry later
      if (res.refusal || !res.items.length || !res.totals) {
        // Not food — e.g. a correction ("the can was half") typed into the composer
        // while offline. Don't let it sit as a pending entry forever; drop it.
        deleteFoodLog(row.id); requestSync?.(); refresh(uid); return;
      }
      updateFoodLog(row.id, {
        parsed_items: JSON.stringify(res.items), kcal: res.totals.kcal,
        protein_g: res.totals.protein_g, carb_g: res.totals.carb_g, fat_g: res.totals.fat_g,
        parse_status: 'done',
      });
      requestSync?.(); refresh(uid);
    } finally { reparsingRef.current.delete(row.id); }
  }

  async function onSubmit() {
    const raw = text.trim();
    if (!raw || busy || !userId) return;
    const consented = await requestAIConsent(t);
    if (!consented) return;
    setDeflect(false);
    setFixHint(false);
    setBusy(true);
    const id = insertFoodLog({ user_id: userId, entry_date: todayISO(), raw_text: raw, parse_status: 'pending' });
    setText('');
    refresh(userId);

    const res = await parseFood(raw, language, todayISO());
    setBusy(false);

    if (res.ok && res.refusal) { deleteFoodLog(id); requestSync?.(); refresh(userId); setDeflect(true); return; }
    if (res.ok && (!res.items.length || !res.totals)) {
      // Nothing to add (e.g. a correction to an item already logged). Don't fail
      // silently — point the user at tap-to-fix, which is how corrections work.
      deleteFoodLog(id); requestSync?.(); refresh(userId);
      setFixHint(true); return;
    }
    if (res.ok) {
      updateFoodLog(id, {
        parsed_items: JSON.stringify(res.items), kcal: res.totals.kcal,
        protein_g: res.totals.protein_g, carb_g: res.totals.carb_g, fat_g: res.totals.fat_g,
        parse_status: 'done',
      });
      requestSync?.(); refresh(userId);
      setOpenDays((p) => ({ ...p, [todayISO()]: true })); // show today's new entry
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

  // ── Fix-an-entry (tap an entry in an expanded day) ───────────────
  function openEdit(row) { setEditEntry(row); setEditItems(safeItems(row.parsed_items).map((it) => ({ ...it }))); }
  function setItemField(i, field, val) { setEditItems((p) => p.map((it, idx) => (idx === i ? { ...it, [field]: val } : it))); }
  function removeItem(i) { setEditItems((p) => p.filter((_, idx) => idx !== i)); }
  function saveEdit() {
    if (!editEntry) return;
    const cleaned = editItems.map((it) => ({ ...it, kcal: numOr(it.kcal), carb_g: numOr(it.carb_g), protein_g: numOr(it.protein_g) }));
    if (!cleaned.length) { deleteFoodLog(editEntry.id); requestSync?.(); setEditEntry(null); refresh(userId); return; }
    const sum = (k) => Math.round(cleaned.reduce((a, it) => a + (Number(it[k]) || 0), 0));
    updateFoodLog(editEntry.id, { parsed_items: JSON.stringify(cleaned), kcal: sum('kcal'), carb_g: sum('carb_g'), protein_g: sum('protein_g') });
    requestSync?.(); setEditEntry(null); refresh(userId);
  }
  function deleteFromEdit() { if (editEntry) { deleteFoodLog(editEntry.id); requestSync?.(); setEditEntry(null); refresh(userId); } }

  const days = groupByDay(recent);
  const freeLeft = Math.max(0, FREE_DAYS - dayCount);
  const gated = !premium && dayCount >= FREE_DAYS;
  const nudgeText = nudge ? t(`nutri_nudge_${nudge.id}${nudge.id === 'lunch' || nudge.id === 'dinner' ? '_' + nudge.tense : ''}`) : null;

  function dayLabel(dateISO) {
    if (dateISO === todayISO()) return t('nutri_day_today');
    if (dateISO === daysAgoISO(1)) return t('nutri_day_yesterday');
    const d = new Date(dateISO + 'T12:00:00');
    return isNaN(d) ? dateISO : d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  const macro = (c, p) => `${Math.round(c || 0)} g ${t('nutri_carbs')} · ${Math.round(p || 0)} g ${t('nutri_protein')}`;

  // Gated (post-trial, non-premium): the upsell demo replaces the composer.
  if (gated) {
    return (
      <View style={s.wrap}>
        <Text style={s.section}>{t('nutri_title')}</Text>
        <DemoBody s={s} t={t} ctaLabel={t('nutri_locked_cta')} onCta={() => navigation.navigate('Paywall')} />
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.secHead} activeOpacity={0.7} onPress={() => setDetailOpen((o) => !o)}>
        <Text style={s.section}>{t('nutri_title')}</Text>
        <Text style={s.secChev}>{detailOpen ? '▾' : '▸'}</Text>
      </TouchableOpacity>

      {/* AI composer — pinned open */}
      <View style={s.composer}>
        <View style={s.aiBadge}>
          <FeatureIcon name="ai_spark" size={12} color={colors.accentText} />
          <Text style={s.aiBadgeText}>{t('nutri_ai_badge')}</Text>
        </View>
        <Text style={s.cq}>{nudgeText || t('nutri_intro')}</Text>
        <Text style={s.chint}>{t('nutri_composer_hint')}</Text>
        <View style={s.cfield}>
          <FeatureIcon name="ai_spark" size={18} color={colors.accent} />
          <TextInput
            style={s.cinput}
            value={text}
            onChangeText={(v) => { setText(v); if (fixHint) setFixHint(false); }}
            placeholder={t('nutri_input_placeholder')}
            placeholderTextColor={colors.textFaint}
            multiline
            editable={!busy}
          />
        </View>
        <TouchableOpacity style={[s.logBtn, (busy || !text.trim()) && s.logBtnOff]} onPress={onSubmit} disabled={busy || !text.trim()}>
          {busy ? <ActivityIndicator size="small" color={colors.accentText} /> : (
            <>
              <FeatureIcon name="ai_spark" size={16} color={colors.accentText} />
              <Text style={s.logBtnText}>{t('nutri_send')}</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={s.caveat}>{t('nutri_est_note')}</Text>
        {!premium && freeLeft > 0 && <Text style={s.freeNote}>{t('nutri_free_note').replace('{n}', String(freeLeft))}</Text>}
      </View>

      <TouchableOpacity style={s.howRow} activeOpacity={0.7} onPress={() => setShowDemo(true)}>
        <FeatureIcon name="ai_spark" size={13} color={colors.accent} />
        <Text style={s.howText}>{t('nutri_how')}</Text>
      </TouchableOpacity>

      {deflect && (
        <View style={s.deflect}>
          <Text style={s.deflectTitle}>{t('nutri_deflect_title')}</Text>
          <Text style={s.deflectBody}>{t('nutri_deflect_body')}</Text>
        </View>
      )}

      {fixHint && (
        <View style={s.hint}>
          <Text style={s.hintText}>{t('nutri_fix_hint')}</Text>
        </View>
      )}

      {/* Collapsed summary line — toggles the detail (average + days) */}
      {!detailOpen && (
        <TouchableOpacity style={s.collapsed} activeOpacity={0.7} onPress={() => setDetailOpen(true)}>
          <Text style={s.collapsedText}>
            {avg && avg.avgKcal
              ? `${t('nutri_avg_days').replace('{n}', String(avg.loggedDays))} · ${t('nutri_avg_label')} ≈ ${avg.avgKcal} ${t('cal_kcal')}`
              : t('nutri_none')}
          </Text>
          {days.length > 0 && <Text style={s.collapsedShow}>{t('nutri_show')} ▸</Text>}
        </TouchableOpacity>
      )}

      {/* Detail: 7-day average + day-grouped history */}
      {detailOpen && (
        <>
          {avg && avg.avgKcal ? (
            <View style={s.avgCard}>
              <Text style={s.avgLabel}>{t('nutri_avg_label')}</Text>
              <Text style={s.avgBig}>≈ {avg.avgKcal} <Text style={s.avgUnit}>{t('cal_kcal')}</Text></Text>
              <Text style={s.avgFoot}>{t('nutri_avg_days').replace('{n}', String(avg.loggedDays))} · {t('nutri_avg_foot')}</Text>
            </View>
          ) : (
            <Text style={s.noneDetail}>{t('nutri_none')}</Text>
          )}

          {days.map((day) => {
            const open = day.date === todayISO() ? openDays[day.date] !== false : !!openDays[day.date];
            return (
              <View key={day.date} style={s.day}>
                <TouchableOpacity style={s.dayHead} activeOpacity={0.7} onPress={() => setOpenDays((p) => ({ ...p, [day.date]: !open }))}>
                  <Text style={s.dayLabel}>{dayLabel(day.date)}</Text>
                  <View style={s.dayRight}>
                    <Text style={s.dayKcal}>≈ <Text style={s.dayKcalNum}>{day.totals.kcal}</Text> {t('cal_kcal')}</Text>
                    <Text style={s.dayChev}>{open ? '▾' : '▸'}</Text>
                  </View>
                </TouchableOpacity>
                {open && day.entries.map((e) => {
                  const items = safeItems(e.parsed_items);
                  const pending = e.parse_status === 'pending';
                  return (
                    <TouchableOpacity key={e.id} style={s.entryCard} activeOpacity={0.7} onPress={() => !pending && openEdit(e)}>
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
                            <Text style={s.entryTotMacro}>{macro(e.carb_g, e.protein_g)}</Text>
                          </View>
                        </>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </>
      )}

      {/* See-how-it-works demo modal (trial users) */}
      <Modal visible={showDemo} transparent animationType="fade" onRequestClose={() => setShowDemo(false)}>
        <View style={s.demoWrap}>
          <View style={s.demoCard}>
            <DemoBody s={s} t={t} ctaLabel={t('nutri_how_cta')} onCta={() => setShowDemo(false)} />
          </View>
        </View>
      </Modal>

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
                  <EditNum s={s} colors={colors} label={t('nutri_carbs')} value={it.carb_g} onChange={(v) => setItemField(i, 'carb_g', v)} />
                  <EditNum s={s} colors={colors} label={t('nutri_protein')} value={it.protein_g} onChange={(v) => setItemField(i, 'protein_g', v)} />
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

const makeStyles = (c) => StyleSheet.create({
  wrap: { marginTop: 22 },
  secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginHorizontal: 2 },
  section: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: c.textMuted },
  secChev: { fontSize: 14, color: c.textFaint },
  // composer
  composer: { backgroundColor: c.accentSoft, borderRadius: 18, padding: 15, borderWidth: 1, borderColor: c.accent + '55' },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: c.accent, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  aiBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: c.accentText },
  cq: { fontSize: 18, fontWeight: '800', color: c.text, letterSpacing: -0.3, marginTop: 11 },
  chint: { fontSize: 12.5, color: c.textMuted, lineHeight: 17, marginTop: 4, marginBottom: 11 },
  cfield: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: c.card, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderColor: c.border },
  cinput: { flex: 1, fontSize: 15, color: c.text, maxHeight: 100 },
  logBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.accent, borderRadius: 13, paddingVertical: 13, marginTop: 9 },
  logBtnOff: { opacity: 0.4 },
  logBtnText: { color: c.accentText, fontWeight: '800', fontSize: 15 },
  caveat: { fontSize: 11, color: c.textFaint, textAlign: 'center', marginTop: 8, lineHeight: 15 },
  freeNote: { fontSize: 11.5, fontWeight: '700', color: c.accentSoftText, textAlign: 'center', marginTop: 8 },
  howRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12 },
  howText: { fontSize: 13, fontWeight: '700', color: c.accent },
  // deflect
  deflect: { backgroundColor: c.warningSoft, borderRadius: 14, padding: 14, marginTop: 10 },
  deflectTitle: { fontSize: 13, fontWeight: '800', color: c.warningSoftText, marginBottom: 4 },
  deflectBody: { fontSize: 12.5, color: c.warningSoftText, lineHeight: 18 },
  // tap-to-fix hint (a correction/non-food message → point at the edit modal)
  hint: { backgroundColor: c.accentSoft, borderRadius: 14, padding: 13, marginTop: 10 },
  hintText: { fontSize: 12.5, color: c.accentSoftText, lineHeight: 18 },
  // collapsed summary
  collapsed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.card2, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, marginTop: 10 },
  collapsedText: { fontSize: 12.5, color: c.textMuted, flex: 1 },
  collapsedShow: { fontSize: 12.5, fontWeight: '700', color: c.accent, marginLeft: 8 },
  // average card
  avgCard: { backgroundColor: c.accentSoft, borderRadius: 14, padding: 14, marginTop: 10 },
  avgLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: c.accentSoftText },
  avgBig: { fontSize: 26, fontWeight: '800', color: c.accent, marginTop: 4 },
  avgUnit: { fontSize: 13, fontWeight: '700', color: c.textMuted },
  avgFoot: { fontSize: 11, color: c.textFaint, marginTop: 6 },
  noneDetail: { fontSize: 12.5, color: c.textFaint, marginTop: 10, textAlign: 'center' },
  // day groups
  day: { backgroundColor: c.card, borderRadius: 14, marginTop: 10, borderWidth: 0.5, borderColor: c.border, overflow: 'hidden' },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 13 },
  dayLabel: { fontSize: 14, fontWeight: '800', color: c.text },
  dayRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayKcal: { fontSize: 13.5, fontWeight: '700', color: c.text },
  dayKcalNum: { color: c.accent, fontWeight: '800' },
  dayChev: { fontSize: 14, color: c.textFaint },
  entryCard: { paddingHorizontal: 13, paddingVertical: 11, borderTopWidth: 0.5, borderTopColor: c.border },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 3, gap: 10 },
  entryFood: { fontSize: 13, color: c.text, flex: 1 },
  entryKcal: { fontSize: 12, color: c.textMuted },
  entryTot: { borderTopWidth: 0.5, borderTopColor: c.border, marginTop: 6, paddingTop: 8 },
  entryTotFood: { fontSize: 13, fontWeight: '800', color: c.text },
  entryTotMacro: { fontSize: 12, fontWeight: '700', color: c.accentSoftText },
  pendingText: { fontSize: 12.5, color: c.textMuted, lineHeight: 18 },
  // demo modal + shared demo body
  demoWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 22 },
  demoCard: { },
  card: { backgroundColor: c.card, borderRadius: 18, padding: 16, borderWidth: 0.5, borderColor: c.border },
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
