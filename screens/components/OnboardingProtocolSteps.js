// The protocol-building screens of the onboarding (docs/specs/onboarding-protocol.md OB-14..OB-19;
// picture docs/design/onboarding-protocolo.html section 4): Which compound, How it comes, Vial and
// dose, Frequency and time, When you start, Protocol ready. ONE set of screens for the onboarding
// before the account and for the 15-day builder of an existing account (OB-26, mode 'builder': the
// account exists, so the ready card shows the syringe math). The rules are lib/onboardingDraft;
// this file draws them with the app's own pieces (DTPickerSheet / DTWheel on iPhone, the system
// dialogs on Android, SegmentedBar, SyringeScale, FeatureIcon, CheckMark). Theme tokens only. No AI
// and no network here (OB-21): the compound list is the catalog, a typed name is kept as written.
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, useReducedMotion, withDelay } from 'react-native-reanimated';
import Svg, { Rect, Path } from 'react-native-svg';
import { useTheme } from '../../lib/theme';
import FeatureIcon from '../../components/FeatureIcon';
import CheckMark from '../../components/CheckMark';
import SegmentedBar from '../../components/SegmentedBar';
import SyringeScale from './SyringeScale';
import { DTPickerSheet, DTWheel, SystemPicker, AndroidDateDialog } from './ProtocolParts';
import { tileStyles } from '../../components/CompoundPills';
import { formatTime, pickerButtons, pickerIs24Hour } from '../../lib/timeFormat';
import { formatDate, MONTHS_SHORT, WEEKDAYS_SHORT } from '../../lib/localeFormat';
import { dateColumns, dateAfter, timeColumns, timeAfter, wheelMotion, WHEEL_IDLE } from '../../lib/wheelPick';
import { wheelStartTime, timeDoneDisabled, timeDoneValue } from '../../lib/protocolForm';
import { computeDraw } from '../../lib/doseMath';
import { pluralKey } from '../../lib/plural';
import { localISO } from '../../lib/localDate';
import {
  compoundChoices, compoundChosen, pickCompound, typedCompound, vialFields, vialPicture, FREQUENCIES, CUSTOM_INTERVALS,
  pastCount, pastAnswers, summaryRows, draftToForm, startDateFor, compoundIdFor,
} from '../../lib/onboardingDraft';
import { purposeFromProfile } from '../../lib/protocolPurpose';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first (the picture's S T Q Q S S D)
const todayKey = () => { const d = new Date(); return localISO(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)); };
const dayOffset = (n) => { const d = new Date(); return localISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12)); };

// "toda segunda" (short) / "Toda segunda-feira" (long): per weekday, so each language gets its own
// grammar (Portuguese "todo domingo" / "toda segunda").
export function weekdayPhrase(t) {
  return (wd, form) => t(`ob_wd_${form === 'long' ? 'long' : 'every'}_${wd}`);
}

export function stepTitle(step, p, { t, tracking }) {
  const name = (p && p.name) || '';
  switch (step) {
    case 'compound': return t('ob_cmp_title_any');
    case 'form': return t('ob_form_title').replace('{compound}', name);
    case 'vial': return t('ob_vial_title');
    case 'frequency': return t('ob_freq_title');
    case 'start': return t('ob_start_title').replace('{compound}', name);
    case 'ready': return t('ob_proto_ready_title');
    default: return '';
  }
}

// profileGoals: her goals (the onboarding answer, or the account's primary_goal in the builder), PQ-14.
export default function OnboardingProtocolSteps({ step, p, setP, tracking, t, language, timeFormat, mode, kb, profileGoals }) {
  const { colors: c } = useTheme();
  const s = useMemo(() => StyleSheet.create({ ...tileStyles(c), ...makeStyles(c) }), [c]);
  const protocol = p || {};
  const patch = (o) => setP((cur) => ({ ...(cur || {}), ...o }));
  const wd = weekdayPhrase(t);

  if (step === 'compound') return <CompoundStep s={s} c={c} p={protocol} patch={patch} setP={setP} tracking={tracking} t={t} kb={kb} />;
  if (step === 'form') {
    const opts = [
      { key: 'recon', t: t('ob_form_recon'), d: t('ob_form_recon_sub'), icon: 'type_vial' },
      { key: 'rtu', t: t('ob_form_rtu'), d: t('ob_form_rtu_sub'), icon: 'syringe' },
    ];
    return (
      <View style={s.list}>
        {opts.map((o) => {
          const on = protocol.form === o.key;
          return (
            <TouchableOpacity key={o.key} style={[s.row, on && s.rowOn]} onPress={() => patch({ form: o.key })} accessibilityRole="radio" accessibilityState={{ selected: on }}>
              <FeatureIcon name={o.icon} size={28} color={on ? c.ink : c.ink2} />
              <View style={s.rowTexts}>
                <Text style={s.rowTitle}>{o.t}</Text>
                <Text style={s.rowSub}>{o.d}</Text>
              </View>
              {on ? <CheckMark size={22} color={c.ink} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }
  if (step === 'vial') return <VialStep s={s} c={c} p={protocol} patch={patch} t={t} language={language} kb={kb} />;
  if (step === 'frequency') return <FrequencyStep s={s} c={c} p={protocol} patch={patch} t={t} language={language} timeFormat={timeFormat} />;
  if (step === 'start') return <StartStep s={s} c={c} p={protocol} patch={patch} t={t} language={language} />;
  if (step === 'ready') {
    const now = new Date();
    const purpose = purposeFromProfile(profileGoals, protocol.form, compoundIdFor(protocol));
    const rows = summaryRows(protocol, { t, language, timeFormat, now, weekdayName: wd, dateText: (iso) => formatDate(iso, language, 'dayMonthYear'), purpose });
    return (
      <View style={s.readyWrap}>
        <View style={s.card}>
          {rows.map((r, i) => (
            <View key={r.key} style={[s.sumRow, i > 0 && s.sumDiv]}>
              <Text style={s.sumLabel}>{r.label}</Text>
              <Text style={s.sumValue}>{r.value}</Text>
            </View>
          ))}
        </View>
        {mode === 'builder' ? <SyringeMath s={s} p={protocol} t={t} language={language} /> : <PreparingCard s={s} c={c} t={t} />}
      </View>
    );
  }
  return null;
}

// ── Which compound (OB-14) ──
function CompoundStep({ s, c, p, setP, tracking, t, kb }) {
  const [q, setQ] = useState('');
  const [changing, setChanging] = useState(false);
  const chosen = compoundChosen(p);
  const list = compoundChoices({ query: q, t });
  const typed = q.trim();
  const exact = list.find((e) => e.label.toLowerCase() === typed.toLowerCase());
  const done = () => { setQ(''); setChanging(false); };
  return (
    <View style={s.gap10}>
      <Text style={s.sub}>{t('ob_cmp_sub')}</Text>
      {chosen && !changing ? (
        // One compound, the first protocol: once chosen, the list and the search go away so it never
        // looks like several protocols are set up here (founder 2026-11-20).
        <View style={s.chosen} accessible accessibilityLabel={`${t('ob_cmp_chosen')}: ${chosen}`}>
          <View style={s.chosenDot}><CheckMark size={16} color={c.onData} /></View>
          <View style={s.flex1}>
            <Text style={s.chosenLabel}>{t('ob_cmp_chosen')}</Text>
            <Text style={s.chosenName} numberOfLines={2}>{chosen}</Text>
          </View>
          <TouchableOpacity onPress={() => setChanging(true)} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={s.chosenChange}>{t('ob_cmp_change')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={s.searchWrap}>
            <View style={s.searchIcon} pointerEvents="none"><FeatureIcon name="search" size={18} color={c.ink3} /></View>
            <TextInput
              {...(kb ? kb.fieldProps('compound') : {})}
              style={[s.input, s.searchInput]}
              placeholder={t('ob_cmp_search')}
              placeholderTextColor={c.ink3}
              value={q}
              // Typing only searches; she picks a row, or "Usar “…”" keeps her own name exactly as written
              // (the app never picks or suggests one for her).
              onChangeText={setQ}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>
          <View style={s.card}>
            {list.map((e, i) => (
              <TouchableOpacity key={e.base} style={[s.listRow, i > 0 && s.sumDiv]} onPress={() => { done(); setP((cur) => pickCompound(cur, e)); }} accessibilityRole="button">
                <Text style={s.listText}>{e.label}</Text>
              </TouchableOpacity>
            ))}
            {typed && !exact ? (
              <TouchableOpacity style={[s.listRow, list.length > 0 && s.sumDiv]} onPress={() => { done(); setP((cur) => typedCompound(cur, q, tracking)); }} accessibilityRole="button">
                <Text style={s.listText}>{t('ob_cmp_use_typed').replace('{name}', typed)}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

// ── Vial and dose (OB-16): no syringe and no units here ──
function SmallVial({ c, label, filled }) {
  const lvl = useSharedValue(filled ? 1 : 0);
  const reduce = useReducedMotion();
  useEffect(() => { lvl.value = reduce ? (filled ? 1 : 0) : withTiming(filled ? 1 : 0, { duration: 500 }); }, [filled, reduce]);
  const liquid = useAnimatedStyle(() => ({ height: `${lvl.value * 58}%` }));
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <View style={{ width: 54, height: 78 }}>
        <Svg width={54} height={78} viewBox="0 0 54 78" style={{ position: 'absolute' }}>
          <Rect x={17} y={2} width={20} height={9} rx={2} fill={c.ink2} />
          <Rect x={13} y={11} width={28} height={6} rx={2} fill={c.line} />
          <Path d="M9 17 h36 v50 a8 8 0 0 1 -8 8 h-20 a8 8 0 0 1 -8 -8 Z" fill={c.raised} stroke={c.ink2} strokeWidth={1.5} />
        </Svg>
        <View style={{ position: 'absolute', left: 10, right: 10, bottom: 4, height: 56, justifyContent: 'flex-end', borderBottomLeftRadius: 7, borderBottomRightRadius: 7, overflow: 'hidden' }}>
          <Animated.View style={[{ backgroundColor: c.data, opacity: 0.35 }, liquid]} />
        </View>
      </View>
      <Text style={{ fontSize: 13, lineHeight: 16, color: c.ink2, minHeight: 16 }}>{label}</Text>
    </View>
  );
}

function NumberField({ s, c, label, hint, value, onChange, unit, units, onUnit, kb, name, t }) {
  return (
    <View style={s.gap8}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.numRow}>
        <TextInput
          {...(kb ? kb.fieldProps(name) : {})}
          style={[s.input, s.numInput]}
          value={value || ''}
          onChangeText={(v) => onChange(v.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={c.ink3}
          accessibilityLabel={label}
        />
        {units ? (
          <SegmentedBar compact items={units.map((u) => ({ key: u, label: u }))} value={unit} onChange={onUnit} accessibilityLabel={label} style={s.unitBar} />
        ) : <Text style={s.unitText}>{unit}</Text>}
      </View>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

function VialStep({ s, c, p, patch, t, language, kb }) {
  const fields = vialFields(p.form);
  const pic = vialPicture(p, language);
  const name = p.name || '';
  return (
    <View style={s.gap16}>
      {p.form !== 'oral' ? <SmallVial c={c} label={pic.label} filled={pic.filled} /> : null}
      {fields.includes('amount') ? (
        <NumberField s={s} c={c} kb={kb} name="amount" t={t} label={t('ob_vial_amount').replace('{compound}', name)} hint={t('ob_vial_amount_hint')}
          value={p.amount} onChange={(v) => patch({ amount: v, vialUnknown: false })} unit={p.unit || 'mg'} units={['mg', 'mcg']} onUnit={(u) => patch({ unit: u })} />
      ) : null}
      {fields.includes('water') ? (
        <NumberField s={s} c={c} kb={kb} name="water" t={t} label={t('ob_vial_water')} hint={t('ob_vial_water_hint')}
          value={p.water} onChange={(v) => patch({ water: v, vialUnknown: false })} unit="mL" />
      ) : null}
      {fields.includes('ml') ? (
        <NumberField s={s} c={c} kb={kb} name="ml" t={t} label={t('ob_vial_ml')} hint={t('ob_vial_amount_hint')}
          value={p.ml} onChange={(v) => patch({ ml: v, vialUnknown: false })} unit="mL" />
      ) : null}
      <NumberField s={s} c={c} kb={kb} name="dose" t={t} label={t('ob_vial_dose')} hint={t('ob_vial_dose_hint')}
        value={p.dose} onChange={(v) => patch({ dose: v, vialUnknown: false })} unit={p.doseUnit || 'mg'} units={['mg', 'mcg']} onUnit={(u) => patch({ doseUnit: u })} />
      <TouchableOpacity style={[s.linkBtn, p.vialUnknown && s.linkOn]} onPress={() => patch({ vialUnknown: !p.vialUnknown })} accessibilityRole="checkbox" accessibilityState={{ checked: !!p.vialUnknown }}>
        <View style={s.inline}>
          {p.vialUnknown ? <CheckMark size={18} color={c.ink} /> : null}
          <Text style={s.linkText}>{t('ob_vial_unknown')}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ── Frequency and time (OB-17) ──
function FrequencyStep({ s, c, p, patch, t, language, timeFormat }) {
  const [timeOpen, setTimeOpen] = useState(false);
  const [motion, setMotion] = useState(WHEEL_IDLE);
  const ios = Platform.OS === 'ios';
  const wheel12h = !/13/.test(formatTime('13:00', language, timeFormat));
  const dayParts = [
    formatTime('09:00', language, '12h').replace(/\d{1,2}[:.]\d{2}/, '').trim() || 'AM',
    formatTime('21:00', language, '12h').replace(/\d{1,2}[:.]\d{2}/, '').trim() || 'PM',
  ];
  const letters = WEEKDAYS_SHORT[language] || WEEKDAYS_SHORT.en;
  const setTime = (d) => patch({ time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` });
  return (
    <View style={s.gap16}>
      <View style={s.tileGrid}>
        {FREQUENCIES.map((f) => {
          const on = p.freq === f.key;
          return (
            <TouchableOpacity key={f.key} style={[s.tile, on && s.tileOn]} onPress={() => patch({ freq: f.key })} accessibilityRole="radio" accessibilityState={{ selected: on }}>
              <Text style={[s.tileText, on && s.tileTextOn]}>{t(f.tKey)}</Text>
              <Text style={s.tileSub}>{t(f.subKey)}</Text>
              {on ? <View style={s.tileCheck}><CheckMark size={18} color={c.ink} /></View> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      {p.freq === 'weekly' ? (
        <View style={s.gap8}>
          <Text style={s.fieldHead}>{t('ob_freq_which_day')}</Text>
          <View style={s.weekRow}>
            {WEEK_ORDER.map((d) => {
              const on = p.weekday === d;
              return (
                <TouchableOpacity key={d} style={[s.weekBtn, on && s.weekBtnOn]} onPress={() => patch({ weekday: d })} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={t(`ob_wd_long_${d}`)}>
                  <Text style={[s.weekText, on && s.weekTextOn]}>{String(letters[d] || '').charAt(0).toUpperCase()}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {Number.isInteger(p.weekday) ? <Text style={s.hint}>{t(`ob_wd_name_${p.weekday}`)}</Text> : null}
        </View>
      ) : null}
      {p.freq === 'custom' ? (
        <View style={s.gap8}>
          <Text style={s.fieldHead}>{t('ob_freq_interval')}</Text>
          <View style={s.chips}>
            {CUSTOM_INTERVALS.map((n) => {
              const on = Number(p.interval) === n;
              return (
                <TouchableOpacity key={n} style={[s.chip, on && s.chipOn]} onPress={() => patch({ interval: n })} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <Text style={[s.chipText, on && s.chipTextOn]}>{t('ob_freq_every_n').replace('{n}', String(n))}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}
      <View style={s.gap8}>
        <Text style={s.fieldHead}>{t('ob_freq_time')}</Text>
        {/* Her own time: never a default (founder 2026-11-04, MF-*); the wheel opens at 12:00. */}
        <TouchableOpacity style={s.timeCard} onPress={() => { setMotion(WHEEL_IDLE); setTimeOpen(true); }} accessibilityRole="button" accessibilityLabel={t('ob_freq_time')}>
          <FeatureIcon name="clock" size={24} color={c.ink2} />
          <Text style={[s.timeText, !p.time && s.timeEmpty]}>{p.time ? formatTime(p.time, language, timeFormat) : t('protocols_time_missing_title')}</Text>
        </TouchableOpacity>
      </View>
      {ios ? (
        <DTPickerSheet visible={timeOpen} title={t('ob_freq_time')} doneLabel={t('done')} doneDisabled={timeDoneDisabled(p.time, motion)}
          onDone={() => { const hm = timeDoneValue(p.time, motion); if (hm) patch({ time: hm }); setTimeOpen(false); }} onCancel={() => setTimeOpen(false)}>
          <DTWheel
            columns={timeColumns(wheelStartTime(p.time), wheel12h, dayParts)}
            onInteract={(ev, col) => setMotion((m) => wheelMotion(m, ev, col))}
            onChange={(col, i) => patch({ time: timeAfter(wheelStartTime(p.time), wheel12h, col, i) })}
          />
        </DTPickerSheet>
      ) : timeOpen ? (
        <SystemPicker
          {...pickerButtons(t)}
          value={(() => { const [h, m] = wheelStartTime(p.time).split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d; })()}
          mode="time"
          is24Hour={pickerIs24Hour(timeFormat, language)}
          display="default"
          onChange={(event, d) => { setTimeOpen(false); if (event.type === 'dismissed' || !d) return; setTime(d); }}
        />
      ) : null}
    </View>
  );
}

// ── When she starts (OB-18) ──
function StartStep({ s, c, p, patch, t, language }) {
  const [dateOpen, setDateOpen] = useState(false);
  const ios = Platform.OS === 'ios';
  const now = new Date();
  const opts = [
    { key: 'today', label: t('ob_start_today') },
    { key: 'started', label: t('ob_start_started') },
    { key: 'later', label: t('ob_start_later') },
  ];
  const dateKey = p.startMode === 'started' ? 'startedOn' : 'laterOn';
  const iso = p[dateKey] || (p.startMode === 'started' ? dayOffset(-7) : dayOffset(1));
  const bounds = p.startMode === 'started' ? { maxISO: dayOffset(-1) } : { minISO: dayOffset(1) };
  const n = pastCount(p, now);
  const answers = pastAnswers(n);
  const label = { yes: t(n === 1 ? 'protocols_past_yes_one' : 'protocols_past_yes'), almost: t('protocols_past_almost'), no: t('protocols_past_no') };
  const choose = (k) => {
    if (k === 'today') patch({ startMode: k });
    else patch({ startMode: k, [k === 'started' ? 'startedOn' : 'laterOn']: p[k === 'started' ? 'startedOn' : 'laterOn'] || (k === 'started' ? dayOffset(-7) : dayOffset(1)), pastAnswer: null });
  };
  const months = MONTHS_SHORT[language] || MONTHS_SHORT.en;
  const clampISO = (v) => (bounds.maxISO && v > bounds.maxISO ? bounds.maxISO : bounds.minISO && v < bounds.minISO ? bounds.minISO : v);
  return (
    <View style={s.gap16}>
      <View style={s.list}>
        {opts.map((o) => {
          const on = p.startMode === o.key;
          return (
            <TouchableOpacity key={o.key} style={[s.row, on && s.rowOn]} onPress={() => choose(o.key)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
              <Text style={[s.rowTitle, s.flex1]}>{o.label}</Text>
              {on ? <CheckMark size={22} color={c.ink} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      {p.startMode === 'started' || p.startMode === 'later' ? (
        <View style={s.gap8}>
          <Text style={s.fieldHead}>{t(p.startMode === 'started' ? 'ob_start_when_started' : 'ob_start_when_later')}</Text>
          <TouchableOpacity style={s.timeCard} onPress={() => setDateOpen(true)} accessibilityRole="button">
            <FeatureIcon name="calendar" size={24} color={c.ink2} />
            <Text style={s.timeText}>{formatDate(iso, language, 'dayMonthYear')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {p.startMode === 'started' && n > 0 ? (
        <View style={s.gap8}>
          {/* The app's past-doses question (lib/pastDoses), the same records effect as the protocol form. */}
          <Text style={s.fieldHead}>{t(pluralKey('ob_start_past', n, language)).replace('{date}', formatDate(startDateFor(p, now), language, 'dayMonthAuto')).replace('{n}', String(n))}</Text>
          <View style={s.chips}>
            {answers.map((k) => {
              const on = p.pastAnswer === k;
              return (
                <TouchableOpacity key={k} style={[s.chip, on && s.chipOn]} onPress={() => patch({ pastAnswer: k })} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <Text style={[s.chipText, on && s.chipTextOn]}>{label[k]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}
      {ios ? (
        <DTPickerSheet visible={dateOpen} title={t(p.startMode === 'started' ? 'ob_start_when_started' : 'ob_start_when_later')} doneLabel={t('done')} onDone={() => setDateOpen(false)}>
          <DTWheel columns={dateColumns(iso, now, months)} onChange={(col, i) => patch({ [dateKey]: clampISO(dateAfter(iso, now, col, i)), pastAnswer: null })} />
        </DTPickerSheet>
      ) : (
        <AndroidDateDialog visible={dateOpen} iso={iso} minISO={bounds.minISO} maxISO={bounds.maxISO} onClose={() => setDateOpen(false)} onPick={(v) => patch({ [dateKey]: clampISO(v), pastAnswer: null })} />
      )}
    </View>
  );
}

// ── Protocol ready (OB-19): before the account, no units — "Preparando o cálculo da sua seringa" ──
function Dot({ c, i }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(reduce ? 1 : 0.25);
  useEffect(() => {
    if (reduce) { o.value = 1; return; }
    o.value = withDelay(i * 180, withRepeat(withSequence(withTiming(1, { duration: 420 }), withTiming(0.25, { duration: 420 })), -1));
  }, [reduce]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.data }, st]} />;
}
function PreparingCard({ s, c, t }) {
  return (
    <View style={[s.card, s.prepCard]}>
      <SyringeScale units={0} size={100} width={260} />
      <View style={s.inline}>
        <Text style={s.prepTitle}>{t('ob_ready_prep_title')}</Text>
        <View style={s.dots}>{[0, 1, 2].map((i) => <Dot key={i} c={c} i={i} />)}</View>
      </View>
      <Text style={s.rowSub}>{t('ob_ready_prep_body')}</Text>
    </View>
  );
}
// OB-26: the account exists, so the ready card shows the syringe math (the app's own computeDraw).
function SyringeMath({ s, p, t, language }) {
  const { form } = draftToForm(p, { now: new Date(), language });
  const draw = p.vialUnknown || p.form === 'oral' ? null : computeDraw({ ...form, language });
  if (!draw || !draw.valid || draw.drawUnits == null) return null;
  const units = Number(draw.drawUnits);
  return (
    <View style={[s.card, s.prepCard]}>
      <SyringeScale units={units} size={100} width={260} />
      <Text style={s.prepTitle}>{t('ob_ready_units').replace('{units}', draw.drawUnits.replace(/\.0$/, '').replace('.', language === 'en' ? '.' : ','))}</Text>
      <Text style={s.rowSub}>{t('ob_ready_units_sub').replace('{ml}', String(draw.drawML))}</Text>
    </View>
  );
}

function makeStyles(c) {
  return {
    gap8: { gap: 8 }, gap10: { gap: 10 }, gap16: { gap: 16 }, flex1: { flex: 1 },
    sub: { fontSize: 17, lineHeight: 22, color: c.ink2 },
    hint: { fontSize: 13, lineHeight: 18, color: c.ink2, paddingHorizontal: 4 },
    fieldLabel: { fontSize: 15, lineHeight: 20, color: c.ink, fontWeight: '600', paddingHorizontal: 4 },
    fieldHead: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink, paddingHorizontal: 4 },
    input: { minHeight: 52, borderRadius: 16, backgroundColor: c.well, borderWidth: 1, borderColor: c.line, paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, color: c.ink },
    searchWrap: { justifyContent: 'center' },
    searchIcon: { position: 'absolute', left: 14, top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 },
    searchInput: { paddingLeft: 42 },
    card: { backgroundColor: c.raised, borderRadius: 20, paddingHorizontal: 16, borderWidth: 1, borderColor: c.line },
    listRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    listText: { flex: 1, fontSize: 17, color: c.ink },
    listTextOn: { fontWeight: '600' },
    chosen: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 2, borderColor: c.data, backgroundColor: c.dataBand, paddingHorizontal: 16, paddingVertical: 14 },
    chosenDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: c.data, alignItems: 'center', justifyContent: 'center' },
    chosenLabel: { fontSize: 13, lineHeight: 16, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: c.data },
    chosenName: { fontSize: 20, lineHeight: 25, fontWeight: '700', color: c.ink },
    chosenChange: { fontSize: 15, fontWeight: '600', color: c.ink, textDecorationLine: 'underline' },
    list: { gap: 10 },
    row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.raised },
    rowOn: { borderWidth: 1.5, borderColor: c.ink },
    rowTexts: { flex: 1, gap: 2 },
    rowTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
    rowSub: { fontSize: 15, lineHeight: 20, color: c.ink2 },
    numRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    numInput: { flex: 1, fontSize: 22 },
    unitBar: { width: 120 },
    unitText: { width: 50, fontSize: 17, color: c.ink2 },
    linkBtn: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
    linkOn: {},
    linkText: { fontSize: 17, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
    inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tileSub: { fontSize: 13, lineHeight: 18, color: c.ink2 },
    weekRow: { flexDirection: 'row', gap: 6 },
    weekBtn: { flex: 1, aspectRatio: 1, maxHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' },
    weekBtnOn: { backgroundColor: c.ink, borderColor: c.ink },
    weekText: { fontSize: 15, fontWeight: '600', color: c.ink2 },
    weekTextOn: { color: c.onInk },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { minHeight: 40, borderRadius: 20, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.raised, justifyContent: 'center' },
    chipOn: { borderWidth: 1.5, borderColor: c.ink },
    chipText: { fontSize: 15, color: c.ink2 },
    chipTextOn: { color: c.ink, fontWeight: '600' },
    timeCard: { minHeight: 64, borderRadius: 18, backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
    timeText: { fontSize: 28, fontWeight: '300', color: c.ink },
    timeEmpty: { fontSize: 17, fontWeight: '400', color: c.ink3 },
    readyWrap: { gap: 14 },
    sumRow: { paddingVertical: 12, gap: 2 },
    sumDiv: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    sumLabel: { fontSize: 13, lineHeight: 18, color: c.ink2 },
    sumValue: { fontSize: 17, lineHeight: 22, color: c.ink, fontWeight: '600' },
    prepCard: { paddingVertical: 16, gap: 10, borderColor: c.data, borderWidth: 1.5 },
    prepTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
    dots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  };
}

export { todayKey };
