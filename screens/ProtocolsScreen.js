import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  Platform,
  FlatList,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getCachedUser } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { Analytics } from '../lib/analytics';
import { scheduleDoseReminder, cancelDoseReminder } from '../lib/notifications';
import {
  getActiveProtocols, insertProtocol, updateProtocol,
  softDeleteProtocol, getProtocolById,
  insertVial, deactivateVialsByProtocol, updateVial,
} from '../lib/database';
import { requestSync } from '../lib/sync';

const LYOPHILIZED_KEYS = ['lyo_5_amino_1mq','lyo_alpha_endorphin','lyo_alpha_msh','lyo_gamma_endorphin','lyo_ac_epithalon','lyo_ace_031','lyo_adamax','lyo_adipotide','lyo_aicar','lyo_albiglutide','lyo_aod_9604','lyo_ara_290','lyo_bpc_157','lyo_cagrilintide','lyo_cecropin_b','lyo_cerebrolysin','lyo_cetrorelix_acetate','lyo_cjc_1295_with_dac','lyo_cjc_1295_without_dac','lyo_cortexin','lyo_dermorphin','lyo_dihexa','lyo_dsip','lyo_dulaglutide','lyo_epithalon','lyo_epo','lyo_exenatide','lyo_follistatin_344','lyo_foxo4_dri','lyo_gdf_8','lyo_ghk_cu','lyo_ghrelin','lyo_ghrp_2','lyo_ghrp_6','lyo_glutathione','lyo_gonadorelin','lyo_gts_21','lyo_hcg','lyo_hexarelin','lyo_hgh','lyo_hgh_fragment_176_191','lyo_hmg','lyo_humanin','lyo_hyaluronic_acid','lyo_igf_1_des','lyo_igf_1_lr3','lyo_ipamorelin','lyo_kisspeptin_10','lyo_kisspeptin_13','lyo_kpv','lyo_lc120','lyo_lc216','lyo_liraglutide','lyo_lixisenatide','lyo_ll_37','lyo_mazdutide','lyo_melanotan_1','lyo_melanotan_2','lyo_melatonin','lyo_mgf','lyo_mog_35_55','lyo_mots_c','lyo_myostatin','lyo_n_acetyl_selank_amidate','lyo_n_acetyl_semax_amidate','lyo_n_acetyl_epitalon_amidate','lyo_nad_plus','lyo_octreotide','lyo_orexin_a','lyo_oxytocin','lyo_p21','lyo_pe_22_28','lyo_peg_mgf','lyo_peptide_t','lyo_pt_141','lyo_retatrutide','lyo_rgd_peptide','lyo_selank','lyo_semaglutide','lyo_semax','lyo_sermorelin','lyo_snap_8','lyo_ss_31','lyo_survodutide','lyo_tb_500','lyo_tesamorelin','lyo_tesofensine','lyo_thymalin','lyo_thymosin_alpha_1','lyo_thymosin_beta_4','lyo_thymulin','lyo_tirzepatide','lyo_triptorelin','lyo_vip'];

const RTU_KEYS = ['rtu_boldenone_undecylenate','rtu_cyanocobalamin','rtu_drostanolone_enanthate','rtu_drostanolone_propionate','rtu_dulaglutide','rtu_estradiol_cypionate','rtu_estradiol_valerate','rtu_hydroxocobalamin','rtu_l_carnitine','rtu_lipo_c','rtu_liraglutide','rtu_methenolone_enanthate','rtu_methylcobalamin','rtu_mic_blend','rtu_nandrolone_decanoate','rtu_nandrolone_phenylpropionate','rtu_progesterone','rtu_pyridoxine','rtu_semaglutide','rtu_stanozolol','rtu_sustanon_250','rtu_testosterone_cypionate','rtu_testosterone_enanthate','rtu_testosterone_propionate','rtu_testosterone_undecanoate','rtu_tirzepatide','rtu_trenbolone_acetate','rtu_trenbolone_enanthate'];

function currentTimeRounded5() {
  const now = new Date();
  const mins = Math.round(now.getMinutes() / 5) * 5;
  const h = mins === 60 ? now.getHours() + 1 : now.getHours();
  const m = mins === 60 ? 0 : mins;
  return `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const ORAL_KEYS = ['oral_alpha_gpc','oral_ala','oral_ashwagandha','oral_astragalus','oral_bacopa','oral_berberine','oral_beta_alanine','oral_citrulline','oral_coq10','oral_creatine','oral_curcumin','oral_gaba','oral_grape_seed','oral_krill_oil','oral_carnitine','oral_glutamine','oral_theanine','oral_tyrosine','oral_lions_mane','oral_maca','oral_mag_bisglycinate','oral_mag_threonate','oral_melatonin','oral_milk_thistle','oral_nac','oral_nmn','oral_nr','oral_omega3','oral_probiotics','oral_red_yeast','oral_resveratrol','oral_rhodiola','oral_saw_palmetto','oral_taurine','oral_tudca','oral_vit_b','oral_vit_c','oral_vit_d3','oral_vit_k2','oral_zinc'];

const WELLNESS_KEYS_INJECTABLE = ['wt_anabolic','wt_antioxidant','wt_appetite','wt_athletic','wt_body_comp','wt_circadian','wt_cognitive','wt_hormonal_wellness','wt_energy','wt_metabolic_wellness','wt_gut','wt_hormone_balance','wt_recovery_support','wt_joint','wt_libido','wt_longevity','wt_metabolic','wt_cellular_energy','wt_mood','wt_muscle','wt_endurance','wt_rest','wt_sexual','wt_skin','wt_sleep_opt','wt_strength','wt_stress','wt_tissue','wt_vitality','wt_weight'];

const WELLNESS_KEYS_ORAL = ['wt_antioxidant_def','wt_atp','wt_heart_wellness','wt_neuro_wellness','wt_cognitive_vit','wt_electrolyte','wt_digestive_wellness','wt_blood_sugar_wellness','wt_liver_wellness','wt_stress_adaptation','wt_immune','wt_joint_health','wt_mental','wt_cellular_opt','wt_kidney_wellness','wt_sleep_quality','wt_stress_mgmt'];

const COLORS = ['#185FA5','#1D9E75','#D85A30','#7F77DD','#BA7517','#D4537E','#5DCAA5','#378ADD','#639922','#888780','#E24B4A','#2C2C2A'];

const COLOR_NAMES = {
  '#185FA5':'Ocean','#1D9E75':'Forest','#D85A30':'Coral',
  '#7F77DD':'Lavender','#BA7517':'Amber','#D4537E':'Rose',
  '#5DCAA5':'Mint','#378ADD':'Sky','#639922':'Olive',
  '#888780':'Stone','#E24B4A':'Red','#2C2C2A':'Charcoal',
};

function getTypeBadge(type, t) {
  if (type === 'recon') return { bg: '#E6F1FB', text: '#0C447C', label: t('protocols_type_badge_lyophilized') };
  if (type === 'rtu') return { bg: '#E1F5EE', text: '#085041', label: t('protocols_type_badge_rtu') };
  if (type === 'oral') return { bg: '#FEF3E2', text: '#92400E', label: t('protocols_type_badge_oral') };
  return { bg: '#f0f0f0', text: '#666', label: type };
}

// Unit compatibility: IU is only compatible with IU, mg/mcg are interconvertible
function unitsCompatible(u1, u2) {
  if (u1 === 'IU' || u2 === 'IU') return u1 === u2;
  return true; // mg↔mcg are convertible
}

// Normalize dose to match compound unit (convert mcg↔mg as needed; IU stays as-is)
function normalizeDoseValue(doseVal, compoundUnit, doseUnit) {
  const d = parseFloat(doseVal) || 0;
  if (compoundUnit === 'IU' && doseUnit === 'IU') return d;
  if (compoundUnit === 'mg' && doseUnit === 'mcg') return d / 1000;
  if (compoundUnit === 'mcg' && doseUnit === 'mg') return d * 1000;
  return d; // same unit
}

// Format ml with adaptive precision for small peptide doses
function formatML(rawML) {
  if (rawML < 0.01) return rawML.toFixed(4);
  if (rawML < 0.1) return rawML.toFixed(3);
  return rawML.toFixed(2);
}

function ProtocolSyringeGuide({ p, t }) {
  if (p.type === 'oral') return null;

  let pDrawML = null;
  let pDrawUnits = null;
  let pDrawValid = false;

  if (p.type === 'recon' && p.amount && p.water && p.dose) {
    if (unitsCompatible(p.unit, p.dose_unit)) {
      const normalDose = normalizeDoseValue(p.dose, p.unit, p.dose_unit);
      const pConc = parseFloat(p.amount) / parseFloat(p.water);
      if (pConc > 0) {
        const rawML = normalDose / pConc;
        pDrawML = formatML(rawML);
        pDrawUnits = (rawML * 100).toFixed(1);
        pDrawValid = rawML > 0 && rawML <= 3;
      }
    }
  }

  if (p.type === 'rtu' && p.concentration && p.dose) {
    const concUnit = p.concentration_unit || 'mg';
    if (unitsCompatible(concUnit, p.dose_unit)) {
      let normalDose = normalizeDoseValue(p.dose, concUnit, p.dose_unit);
      const concVal = parseFloat(p.concentration);
      if (concVal > 0) {
        const rawML = normalDose / concVal;
        pDrawML = formatML(rawML);
        pDrawUnits = (rawML * 100).toFixed(1);
        pDrawValid = rawML > 0 && rawML <= 3;
      }
    }
  }

  const syringeMax = p.syringe_size || 100;
  const fillPct = pDrawValid ? Math.min((parseFloat(pDrawUnits) / syringeMax) * 100, 100) : 0;

  // Animated fill
  const fillWidth = useSharedValue(0);
  const plungerLeft = useSharedValue(0);
  const fillOpacity = useSharedValue(0);

  useEffect(() => {
    // Small delay so the user sees it animate in
    fillWidth.value = withDelay(300, withTiming(fillPct, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    }));
    plungerLeft.value = withDelay(300, withTiming(fillPct, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    }));
    fillOpacity.value = withDelay(200, withTiming(1, { duration: 400 }));
  }, [fillPct]);

  const animatedFillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value}%`,
    opacity: fillOpacity.value * 0.35,
  }));

  const animatedPlungerStyle = useAnimatedStyle(() => ({
    left: `${plungerLeft.value}%`,
    opacity: fillOpacity.value,
  }));

  if (!pDrawML || !pDrawValid) {
    return (
      <View style={s.syringeWrap}>
        <Text style={s.syringeTitle}>{t('protocols_syringe_title')}</Text>
        <Text style={s.syringeNoData}>
          {p.type === 'rtu' && !p.concentration
            ? t('protocols_syringe_no_data_conc')
            : t('protocols_syringe_no_data')}
        </Text>
      </View>
    );
  }

  return (
    <View style={s.syringeWrap}>
      <Text style={s.syringeTitle}>{t('protocols_syringe_title')}</Text>
      <Text style={s.syringeSubtitle}>
        {t('protocols_syringe_draw_to')} <Text style={{ fontWeight: '700', color: '#185FA5' }}>{pDrawUnits} {t('protocols_syringe_units')} ({pDrawML} ml)</Text>
      </Text>
      <View style={s.syringeOuter}>
        <View style={s.syringeBody}>
          <View style={s.syringeTicks}>
            {Array.from({ length: 11 }).map((_, i) => {
              const tickVal = Math.round((syringeMax / 10) * i);
              return (
                <View key={i} style={s.tickGroup}>
                  <View style={[s.tick, i % 5 === 0 && s.tickMajor]} />
                  {i % 5 === 0 && <Text style={s.tickLabel}>{tickVal}</Text>}
                </View>
              );
            })}
          </View>
          <View style={s.syringeTrack}>
            <Animated.View style={[s.syringeFill, animatedFillStyle]} />
            <Animated.View style={[s.plungerLine, animatedPlungerStyle]} />
          </View>
        </View>
        <View style={s.syringeNeedle} />
      </View>
      <View style={s.syringeInfo}>
        <View style={s.syringeInfoItem}>
          <Text style={s.syringeInfoLabel}>{t('protocols_syringe_draw_to')}</Text>
          <Text style={s.syringeInfoVal}>{pDrawUnits}u</Text>
        </View>
        <View style={s.syringeInfoItem}>
          <Text style={s.syringeInfoLabel}>{t('protocols_syringe_volume')}</Text>
          <Text style={s.syringeInfoVal}>{pDrawML} ml</Text>
        </View>
        <View style={s.syringeInfoItem}>
          <Text style={s.syringeInfoLabel}>{t('protocols_syringe_dose')}</Text>
          <Text style={s.syringeInfoVal}>{p.dose} {p.dose_unit}</Text>
        </View>
        <View style={s.syringeInfoItem}>
          <Text style={s.syringeInfoLabel}>{t('protocols_syringe_size')}</Text>
          <Text style={s.syringeInfoVal}>{syringeMax}u</Text>
        </View>
      </View>
      <Text style={s.syringeDisclaimer}>{t('protocols_calc_disclaimer')}</Text>
    </View>
  );
}

function ProtocolCard({ p, expanded, setExpanded, openEdit, deleteProtocol, t }) {
  const badge = getTypeBadge(p.type, t);
  const isExpanded = expanded === p.id;

  return (
    <TouchableOpacity
      style={s.card}
      onPress={() => setExpanded(isExpanded ? null : p.id)}
    >
      <View style={s.cardTop}>
        <View style={[s.cardDot, { backgroundColor: p.color }]} />
        <View style={s.cardInfo}>
          <Text style={s.cardName}>{p.name}</Text>
          <Text style={s.cardMeta}>{p.dose} {p.dose_unit} · {p.frequency}</Text>
          <View style={s.badgeRow}>
            <View style={[s.badge, { backgroundColor: badge.bg }]}>
              <Text style={[s.badgeText, { color: badge.text }]}>{badge.label}</Text>
            </View>
            {p.goal ? p.goal.split(',').filter(Boolean).map(g => (
              <View key={g} style={s.badgeGoal}>
                <Text style={s.badgeGoalText}>{t(g) || g}</Text>
              </View>
            )) : null}
          </View>
        </View>
        <Text style={s.chevron}>{isExpanded ? '▲' : '▶'}</Text>
      </View>

      {isExpanded && (
        <View style={s.cardBody}>
          {p.type === 'recon' && (
            <>
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>{t('protocols_compound_amount')}</Text>
                <Text style={s.detailVal}>{p.amount} {p.unit}</Text>
              </View>
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>{t('protocols_bac_water')}</Text>
                <Text style={s.detailVal}>{p.water} ml</Text>
              </View>
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>{t('protocols_concentration')}</Text>
                <Text style={s.detailVal}>
                  {p.amount && p.water
                    ? (parseFloat(p.amount) / parseFloat(p.water)).toFixed(2)
                    : '—'} {p.unit}/ml
                </Text>
              </View>
            </>
          )}
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>{t('protocols_desired_dose')}</Text>
            <Text style={s.detailVal}>{p.dose} {p.dose_unit}</Text>
          </View>
          {p.type === 'rtu' && p.concentration && (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>{t('protocols_concentration')}</Text>
              <Text style={s.detailVal}>{p.concentration} mg/ml</Text>
            </View>
          )}
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>{t('protocols_frequency')}</Text>
            <Text style={s.detailVal}>{p.frequency || '—'}</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>{t('protocols_reminder')}</Text>
            <Text style={s.detailVal}>{(p.reminder_time || '—').split(',').filter(Boolean).map(t24 => {
              const [h, m] = t24.split(':').map(Number);
              const period = h >= 12 ? 'PM' : 'AM';
              const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
              return `${h12}:${String(m).padStart(2, '0')} ${period}`;
            }).join('  ·  ')}</Text>
          </View>
          {p.schedule_total && (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>{t('protocols_total_doses_schedule')}</Text>
              <Text style={s.detailVal}>{p.schedule_total}</Text>
            </View>
          )}
          {p.goal && (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>{t('protocols_goal')}</Text>
              <Text style={s.detailVal}>{p.goal.split(',').filter(Boolean).map(g => t(g) || g).join(', ')}</Text>
            </View>
          )}
          {p.notes && p.type === 'oral' && (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>{t('protocols_form')}</Text>
              <Text style={s.detailVal}>{p.notes}</Text>
            </View>
          )}

          <ProtocolSyringeGuide p={p} t={t} />

          <View style={s.cardActions}>
            <TouchableOpacity style={s.actionBtn} onPress={() => openEdit(p)}>
              <Text style={s.actionBtnText}>{t('protocols_edit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={() => openEdit(p, 4)}>
              <Text style={s.actionBtnText}>{t('protocols_add_reminder')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, s.actionBtnDanger]}
              onPress={() => deleteProtocol(p.id)}
            >
              <Text style={s.actionBtnDangerText}>{t('protocols_delete')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ProtocolsScreen() {
  const { t, language } = useLanguage();
  const [protocols, setProtocols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [name, setName] = useState('');
  const [type, setType] = useState('recon');
  const [color, setColor] = useState('#185FA5');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('mg');
  const [water, setWater] = useState('2');
  const [dose, setDose] = useState('');
  const [doseUnit, setDoseUnit] = useState('mg');
  const [syringeSize, setSyringeSize] = useState(100);
  const [concentration, setConcentration] = useState('');
  const [concentrationUnit, setConcentrationUnit] = useState('mg');
  // ── Schedule state ──
  const [intervalDays, setIntervalDays] = useState(1);
  const [dosesPerDay, setDosesPerDay] = useState(1);
  const currentYear = new Date().getFullYear();
  const [startMonth, setStartMonth] = useState(new Date().getMonth()); // 0-11
  const [startDay, setStartDay] = useState(String(new Date().getDate()));
  const [reminderTimes, setReminderTimes] = useState([currentTimeRounded5()]);
  const [scheduleTotal, setScheduleTotal] = useState('');
  const [goals, setGoals] = useState([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [activeTimeIndex, setActiveTimeIndex] = useState(0);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Month names for the date selector (translated)
  const MONTH_KEYS = [
    'month_jan', 'month_feb', 'month_mar', 'month_apr',
    'month_may', 'month_jun', 'month_jul', 'month_aug',
    'month_sep', 'month_oct', 'month_nov', 'month_dec',
  ];

  // Build a Date object from month index (0-11) + day string
  function buildDate(monthIdx, dayStr) {
    const day = parseInt(dayStr) || 1;
    return new Date(currentYear, monthIdx, day);
  }

  // Format "HH:MM" (24h) → "h:MM AM/PM"
  function formatTimeAMPM(time24) {
    if (!time24) return '—';
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  // Build a human-readable frequency string from interval_days
  function frequencyLabel(interval) {
    if (interval === 1) return t('protocols_daily');
    return t('protocols_every_x_days').replace('{x}', interval);
  }

  // When interval changes, clamp doses_per_day and adjust times
  function handleIntervalChange(newInterval) {
    setIntervalDays(newInterval);
    // Only allow multiple doses per day for daily or every-2-day
    if (newInterval > 2) {
      setDosesPerDay(1);
      setReminderTimes(prev => [prev[0] || currentTimeRounded5()]);
    }
  }

  // When doses per day changes, adjust reminder times array
  function handleDosesPerDayChange(newCount) {
    setDosesPerDay(newCount);
    setReminderTimes(prev => {
      if (prev.length === newCount) return prev;
      const defaults = [currentTimeRounded5(), '14:00', '21:00'];
      const next = [...prev];
      while (next.length < newCount) next.push(defaults[next.length] || '12:00');
      return next.slice(0, newCount);
    });
  }
  const [vialMonth, setVialMonth] = useState(new Date().getMonth()); // 0-11
  const [vialDay, setVialDay] = useState(String(new Date().getDate()));
  const [totalDoses, setTotalDoses] = useState('');
  const [skipVial, setSkipVial] = useState(false);

  useFocusEffect(useCallback(() => { fetchProtocols(); }, []));

  async function fetchProtocols() {
    const user = await getCachedUser();
    if (!user) { setLoading(false); return; }
    const data = getActiveProtocols(user.id);
    setProtocols(data || []);
    setLoading(false);
  }

  function resetForm() {
    setStep(1); setName(''); setType('recon'); setColor('#185FA5');
    setAmount(''); setUnit('mg'); setWater('2'); setDose('');
    setDoseUnit('mg'); setSyringeSize(100); setConcentration(''); setConcentrationUnit('mg');
    setIntervalDays(1); setDosesPerDay(1);
    setStartMonth(new Date().getMonth()); setStartDay(String(new Date().getDate()));
    setReminderTimes([currentTimeRounded5()]); setScheduleTotal(''); setGoals([]); setNotes('');
    setVialMonth(new Date().getMonth()); setVialDay(String(new Date().getDate()));
    setTotalDoses(''); setSkipVial(false);
    setEditingId(null); setSearchQuery(''); setShowSuggestions(false);
  }

  function getCompoundList() {
    if (type === 'recon') return LYOPHILIZED_KEYS.map(k => t(k));
    if (type === 'rtu') return RTU_KEYS.map(k => t(k));
    if (type === 'oral') return ORAL_KEYS.map(k => t(k));
    return [];
  }

  function getFilteredSuggestions() {
    const list = getCompoundList();
    if (!searchQuery || searchQuery.length < 1) return list;
    return list.filter(c => c.toLowerCase().includes(searchQuery.toLowerCase()));
  }

  function selectCompound(compound) {
    setName(compound);
    setSearchQuery(compound);
    setShowSuggestions(false);
    Analytics.compoundSearched(compound, type);
  }

  function getWellnessKeys() {
    return type === 'oral' ? WELLNESS_KEYS_ORAL : WELLNESS_KEYS_INJECTABLE;
  }

  function openEdit(p, goToStep) {
    setEditingId(p.id);
    setName(p.name || ''); setSearchQuery(p.name || '');
    setType(p.type || 'recon'); setColor(p.color || '#185FA5');
    setAmount(p.amount ? String(p.amount) : ''); setUnit(p.unit || 'mg');
    setWater(p.water ? String(p.water) : '2'); setDose(p.dose ? String(p.dose) : '');
    setDoseUnit(p.dose_unit || 'mg'); setSyringeSize(p.syringe_size || 100);
    setConcentration(p.concentration ? String(p.concentration) : '');
    setConcentrationUnit(p.concentration_unit || 'mg');
    const loadedInterval = p.interval_days || 1;
    setIntervalDays(loadedInterval);
    const loadedDPD = p.doses_per_day || 1;
    setDosesPerDay(loadedDPD);
    if (p.start_date) {
      const sd = new Date(p.start_date + 'T00:00:00');
      setStartMonth(sd.getMonth()); setStartDay(String(sd.getDate()));
    } else {
      setStartMonth(new Date().getMonth()); setStartDay(String(new Date().getDate()));
    }
    const times = (p.reminder_time || currentTimeRounded5()).split(',').filter(Boolean);
    const defaults = [currentTimeRounded5(), '14:00', '21:00'];
    while (times.length < loadedDPD) times.push(defaults[times.length] || '12:00');
    setReminderTimes(times.slice(0, loadedDPD));
    setScheduleTotal(p.schedule_total ? String(p.schedule_total) : '');
    setGoals(p.goal ? p.goal.split(',').filter(Boolean) : []); setNotes(p.notes || '');
    setSkipVial(true); setStep(goToStep || 1); setShowModal(true);
  }

  function toSupabaseDateFromMD(monthIdx, dayStr) {
    const m = String(monthIdx + 1).padStart(2, '0');
    const d = String(parseInt(dayStr) || 1).padStart(2, '0');
    return `${currentYear}-${m}-${d}`;
  }

  function adjustWater(dir) {
    const current = parseFloat(water) || 0;
    const next = Math.max(0.5, Math.round((current + dir * 0.5) * 10) / 10);
    setWater(String(next));
  }

  // Calculate draw volume — only if units are compatible
  const unitsOk = type === 'recon'
    ? unitsCompatible(unit, doseUnit)
    : unitsCompatible(concentrationUnit || 'mg', doseUnit);

  let rawDrawML = null;
  if (type === 'recon' && unitsOk && amount && water && dose) {
    const conc = parseFloat(amount) / parseFloat(water);
    if (conc > 0) rawDrawML = normalizeDoseValue(dose, unit, doseUnit) / conc;
  } else if (type === 'rtu' && unitsOk && concentration && dose) {
    const concVal = parseFloat(concentration);
    if (concVal > 0) rawDrawML = normalizeDoseValue(dose, concentrationUnit, doseUnit) / concVal;
  }

  const drawML = rawDrawML != null ? formatML(rawDrawML) : null;
  const drawUnits = rawDrawML != null ? (rawDrawML * 100).toFixed(1) : null;
  const drawValid = rawDrawML && rawDrawML > 0 && rawDrawML <= 3;
  const unitMismatch = dose && !unitsOk;

  async function saveProtocol() {
    if (!name) { Alert.alert(t('protocols_missing_name'), t('protocols_missing_name_msg')); return; }
    setSaving(true);
    try {
    const user = await getCachedUser();
    if (!user) { setSaving(false); Alert.alert(t('error'), 'Not signed in'); return; }

    if (editingId) {
      const freqStr = frequencyLabel(intervalDays);
      updateProtocol(editingId, {
        name, type, color,
        amount: parseFloat(amount) || null, unit,
        water: parseFloat(water) || null,
        dose: parseFloat(dose) || null, dose_unit: doseUnit,
        syringe_size: syringeSize,
        concentration: parseFloat(concentration) || null,
        concentration_unit: concentrationUnit,
        frequency: freqStr, reminder_time: reminderTimes.join(','),
        interval_days: intervalDays, doses_per_day: dosesPerDay,
        start_date: toSupabaseDateFromMD(startMonth, startDay),
        schedule_total: parseInt(scheduleTotal) || null,
        goal: goals.join(','), notes,
      });
      setSaving(false);
      scheduleDoseReminder({
        id: editingId, name, dose: parseFloat(dose), dose_unit: doseUnit,
        frequency: freqStr, reminder_time: reminderTimes.join(','),
        interval_days: intervalDays, doses_per_day: dosesPerDay,
        start_date: toSupabaseDateFromMD(startMonth, startDay), schedule_total: parseInt(scheduleTotal) || null,
      }).catch(() => {});
    } else {
      const freqStr = frequencyLabel(intervalDays);
      const newId = insertProtocol({
        user_id: user.id, name, type, color,
        amount: parseFloat(amount) || null, unit,
        water: parseFloat(water) || null,
        dose: parseFloat(dose) || null, dose_unit: doseUnit,
        syringe_size: syringeSize,
        concentration: parseFloat(concentration) || null,
        concentration_unit: concentrationUnit,
        frequency: freqStr, reminder_time: reminderTimes.join(','),
        interval_days: intervalDays, doses_per_day: dosesPerDay,
        start_date: toSupabaseDateFromMD(startMonth, startDay),
        schedule_total: parseInt(scheduleTotal) || null,
        goal: goals.join(','), notes,
      });

      if (type === 'recon' && !skipVial) {
        insertVial({
          user_id: user.id, protocol_id: newId,
          mixed_on: toSupabaseDateFromMD(vialMonth, vialDay),
          water_ml: parseFloat(water) || null,
          total_doses: parseInt(scheduleTotal) || null,
          doses_taken: 0,
        });
      }
      setSaving(false);
      const protocolData = getProtocolById(newId);
      if (protocolData) scheduleDoseReminder(protocolData).catch(() => {});
      Analytics.protocolCreated({ name, type, dose, dose_unit: doseUnit, frequency: frequencyLabel(intervalDays), goal: goals.join(',') });
    }
    requestSync();
    setShowModal(false);
    resetForm();
    fetchProtocols();
    } catch (err) {
      setSaving(false);
      Alert.alert(t('error'), err.message);
    }
  }

  async function deleteProtocol(id) {
    Alert.alert(t('protocols_delete_title'), t('protocols_delete_confirm_settings'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('protocols_delete'), style: 'destructive',
        onPress: async () => {
          const target = protocols.find(p => p.id === id);
          softDeleteProtocol(id);
          deactivateVialsByProtocol(id);
          cancelDoseReminder(id).catch(() => {});
          if (target) Analytics.protocolDeactivated(target);
          fetchProtocols();
          requestSync();
        },
      },
    ]);
  }


  const totalSteps = editingId ? 4 : type === 'recon' ? 5 : 4;
  const reconProtocols = protocols.filter(p => p.type === 'recon');
  const rtuProtocols = protocols.filter(p => p.type === 'rtu');
  const oralProtocols = protocols.filter(p => p.type === 'oral');

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t('protocols_title')}</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => { resetForm(); setShowModal(true); }}>
          <Text style={s.addBtnText}>{t('protocols_add')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll}>
        {protocols.length === 0 && !loading && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>🧪</Text>
            <Text style={s.emptyTitle}>{t('protocols_empty_title')}</Text>
            <Text style={s.emptySub}>{t('protocols_empty_sub')}</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => { resetForm(); setShowModal(true); }}>
              <Text style={s.emptyBtnText}>{t('protocols_empty_btn')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {reconProtocols.length > 0 && (
          <>
            <Text style={s.sectionLabel}>{t('protocols_section_lyophilized')}</Text>
            {reconProtocols.map(p => (
              <ProtocolCard
                key={p.id} p={p}
                expanded={expanded} setExpanded={setExpanded}
                openEdit={openEdit} deleteProtocol={deleteProtocol}
                t={t}
              />
            ))}
          </>
        )}

        {rtuProtocols.length > 0 && (
          <>
            <Text style={s.sectionLabel}>{t('protocols_section_rtu')}</Text>
            {rtuProtocols.map(p => (
              <ProtocolCard
                key={p.id} p={p}
                expanded={expanded} setExpanded={setExpanded}
                openEdit={openEdit} deleteProtocol={deleteProtocol}
                t={t}
              />
            ))}
          </>
        )}

        {oralProtocols.length > 0 && (
          <>
            <Text style={s.sectionLabel}>{t('protocols_section_oral')}</Text>
            {oralProtocols.map(p => (
              <ProtocolCard
                key={p.id} p={p}
                expanded={expanded} setExpanded={setExpanded}
                openEdit={openEdit} deleteProtocol={deleteProtocol}
                t={t}
              />
            ))}
          </>
        )}


        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.modalNav}>
            <TouchableOpacity onPress={() => {
              if (step > 1) setStep(step - 1);
              else { setShowModal(false); resetForm(); }
            }}>
              <Text style={s.modalCancel}>{step > 1 ? `← ${t('back')}` : t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>{editingId ? t('protocols_edit_protocol') : t('protocols_new_protocol')}</Text>
            <TouchableOpacity onPress={() => {
              if (step < totalSteps) setStep(step + 1);
              else saveProtocol();
            }}>
              <Text style={s.modalSave}>
                {step < totalSteps ? t('next') : saving ? t('protocols_saving') : t('save')}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={s.modalProgress}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <View key={i} style={[s.modalProgSeg, i < step && s.modalProgDone]} />
            ))}
          </View>

          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>

            {step === 1 && (
              <View>
                <Text style={s.modalStepTitle}>
                  {editingId ? t('protocols_edit_compound') : t('protocols_step_name')}
                </Text>
                <Text style={s.modalStepSub}>{t('protocols_step_name_sub')}</Text>

                <Text style={s.fieldLabel}>{t('protocols_type')}</Text>
                <View style={s.typeRow}>
                  {[
                    { val: 'recon', emoji: '🧪', label: t('protocols_lyophilized'), sub: t('protocols_mix_with_water') },
                    { val: 'rtu', emoji: '💉', label: t('protocols_rtu'), sub: t('protocols_pre_mixed') },
                    { val: 'oral', emoji: '💊', label: t('protocols_oral'), sub: t('protocols_supplement') },
                  ].map((typeOpt) => (
                    <TouchableOpacity
                      key={typeOpt.val}
                      style={[s.typeBtn, type === typeOpt.val && s.typeBtnOn]}
                      onPress={() => {
                        setType(typeOpt.val);
                        setName('');
                        setSearchQuery('');
                        setShowSuggestions(false);
                      }}
                    >
                      <Text style={s.typeEmoji}>{typeOpt.emoji}</Text>
                      <Text style={[s.typeBtnLabel, type === typeOpt.val && s.typeBtnLabelOn]}>
                        {typeOpt.label}
                      </Text>
                      <Text style={s.typeBtnSub}>{typeOpt.sub}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.fieldLabel}>{t('protocols_compound_name')}</Text>
                <TextInput
                  style={s.input}
                  placeholder={
                    type === 'recon' ? t('protocols_search_peptides') :
                    type === 'rtu' ? t('protocols_search_injectables') :
                    t('protocols_search_supplements')
                  }
                  placeholderTextColor="#aaa"
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    setName(text);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                />

                {showSuggestions && getFilteredSuggestions().length > 0 && (
                  <View style={s.suggestionBox}>
  {getFilteredSuggestions().slice(0, 8).map((item) => (
    <TouchableOpacity
      key={item}
      style={s.suggestionItem}
      onPressIn={() => selectCompound(item)}
    >
      <Text style={s.suggestionText}>{item}</Text>
    </TouchableOpacity>
  ))}
                    {getFilteredSuggestions().length > 8 && (
                      <Text style={s.suggestionMore}>
                        +{getFilteredSuggestions().length - 8} {t('protocols_more_results')}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}

            {step === 2 && (
              <View>
                <Text style={s.modalStepTitle}>{t('protocols_step_color')}</Text>
                <Text style={s.modalStepSub}>{t('protocols_step_color_sub')}</Text>
                <View style={s.previewPill}>
                  <View style={[s.previewDot, { backgroundColor: color }]} />
                  <View>
                    <Text style={s.previewName}>{name || t('protocols_your_compound')}</Text>
                    <Text style={s.previewSub}>{COLOR_NAMES[color]}</Text>
                  </View>
                </View>
                <View style={s.colorGrid}>
                  {COLORS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[s.colorSwatch, { backgroundColor: c }, color === c && s.colorSwatchOn]}
                      onPress={() => setColor(c)}
                    >
                      {color === c && <Text style={s.colorCheck}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {step === 3 && (
              <View>
                <Text style={s.modalStepTitle}>{t('protocols_step_dose')}</Text>
                <Text style={s.modalStepSub}>{t('protocols_step_dose_sub')}</Text>

                {type === 'oral' && (
                  <>
                    <Text style={s.fieldLabel}>{t('protocols_dose_amount')}</Text>
                    <View style={s.inputRow}>
                      <TextInput
                        style={[s.input, { flex: 1, marginRight: 8, marginBottom: 0 }]}
                        placeholder="e.g. 500"
                        placeholderTextColor="#aaa"
                        keyboardType="numeric"
                        value={dose}
                        onChangeText={setDose}
                      />
                      <View style={s.unitPicker}>
                        {['mg', 'mcg', 'IU', 'g'].map((u) => (
                          <TouchableOpacity
                            key={u}
                            style={[s.unitBtn, doseUnit === u && s.unitBtnOn]}
                            onPress={() => setDoseUnit(u)}
                          >
                            <Text style={[s.unitBtnText, doseUnit === u && s.unitBtnTextOn]}>{u}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('protocols_form')}</Text>
                    <View style={s.freqGrid}>
                      {[
                        { val: 'Capsule', key: 'protocols_capsule' },
                        { val: 'Tablet', key: 'protocols_tablet' },
                        { val: 'Powder', key: 'protocols_powder' },
                        { val: 'Liquid', key: 'protocols_liquid' },
                        { val: 'Gummy', key: 'protocols_gummy' },
                        { val: 'Softgel', key: 'protocols_softgel' },
                      ].map((formType) => (
                        <TouchableOpacity
                          key={formType.val}
                          style={[s.freqBtn, notes === formType.val && s.freqBtnOn]}
                          onPress={() => setNotes(notes === formType.val ? '' : formType.val)}
                        >
                          <Text style={[s.freqBtnText, notes === formType.val && s.freqBtnTextOn]}>{t(formType.key)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={[s.fieldLabel, { marginTop: 8 }]}>{t('protocols_instructions')}</Text>
                    <TextInput
                      style={[s.input, { height: 70 }]}
                      placeholder={t('protocols_instructions_placeholder')}
                      placeholderTextColor="#aaa"
                      multiline
                      value={notes}
                      onChangeText={setNotes}
                    />
                  </>
                )}

                {type === 'recon' && (
                  <>
                    <Text style={s.fieldLabel}>{t('protocols_compound_amount')}</Text>
                    <View style={s.inputRow}>
                      <TextInput
                        style={[s.input, { flex: 1, marginRight: 8, marginBottom: 0 }]}
                        placeholder="e.g. 5"
                        placeholderTextColor="#aaa"
                        keyboardType="numeric"
                        value={amount}
                        onChangeText={setAmount}
                      />
                      <View style={s.unitPicker}>
                        {['mg', 'mcg', 'IU'].map((u) => (
                          <TouchableOpacity
                            key={u}
                            style={[s.unitBtn, unit === u && s.unitBtnOn]}
                            onPress={() => setUnit(u)}
                          >
                            <Text style={[s.unitBtnText, unit === u && s.unitBtnTextOn]}>{u}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('protocols_bac_water_ml')}</Text>
                    <View style={s.stepperRow}>
                      <TouchableOpacity style={s.stepperBtn} onPress={() => adjustWater(-1)}>
                        <Text style={s.stepperBtnText}>−</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.stepperVal}
                        onLongPress={() => {
                          Alert.prompt(t('protocols_enter_water'), t('protocols_enter_water'),
                            (val) => { if (val) setWater(val); }, 'plain-text', water, 'numeric');
                        }}
                      >
                        <Text style={s.stepperValText}>{water || '0'} ml</Text>
                        <Text style={s.stepperHoldHint}>{t('protocols_hold_to_type')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.stepperBtn} onPress={() => adjustWater(1)}>
                        <Text style={s.stepperBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={s.stepperHint}>{t('protocols_steps_05')}</Text>
                    <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('protocols_desired_dose')}</Text>
                    <View style={s.inputRow}>
                      <TextInput
                        style={[s.input, { flex: 1, marginRight: 8, marginBottom: 0 }]}
                        placeholder="e.g. 0.5"
                        placeholderTextColor="#aaa"
                        keyboardType="numeric"
                        value={dose}
                        onChangeText={setDose}
                      />
                      <View style={s.unitPicker}>
                        {['mg', 'mcg', 'IU'].map((u) => (
                          <TouchableOpacity
                            key={u}
                            style={[s.unitBtn, doseUnit === u && s.unitBtnOn]}
                            onPress={() => setDoseUnit(u)}
                          >
                            <Text style={[s.unitBtnText, doseUnit === u && s.unitBtnTextOn]}>{u}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('protocols_syringe_size_label')}</Text>
                    <View style={s.unitPicker}>
                      {[
                        { label: '1ml (100u)', val: 100 },
                        { label: '0.5ml (50u)', val: 50 },
                        { label: '0.3ml (30u)', val: 30 },
                      ].map((sz) => (
                        <TouchableOpacity
                          key={sz.val}
                          style={[s.unitBtn, syringeSize === sz.val && s.unitBtnOn]}
                          onPress={() => setSyringeSize(sz.val)}
                        >
                          <Text style={[s.unitBtnText, syringeSize === sz.val && s.unitBtnTextOn]}>
                            {sz.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {unitMismatch && (
                      <View style={[s.calcResult, { backgroundColor: '#FEF3E2' }]}>
                        <Text style={[s.calcResultText, { color: '#92400E' }]}>
                          {t('protocols_unit_mismatch') || 'Cannot mix IU with mg/mcg. Use the same unit type for compound and dose.'}
                        </Text>
                      </View>
                    )}
                    {drawML && drawValid && !unitMismatch && (
                      <View style={s.calcResult}>
                        <Text style={s.calcResultText}>
                          {`${t('protocols_draw')}: ${drawML} ml (${drawUnits} ${t('protocols_units')})`}
                        </Text>
                        <Text style={s.calcDisclaimer}>{t('protocols_calc_disclaimer')}</Text>
                      </View>
                    )}
                  </>
                )}

                {type === 'rtu' && (
                  <>
                    <Text style={s.fieldLabel}>{t('protocols_dose_per_injection')}</Text>
                    <View style={s.inputRow}>
                      <TextInput
                        style={[s.input, { flex: 1, marginRight: 8, marginBottom: 0 }]}
                        placeholder="e.g. 100"
                        placeholderTextColor="#aaa"
                        keyboardType="numeric"
                        value={dose}
                        onChangeText={setDose}
                      />
                      <View style={s.unitPicker}>
                        {['mg', 'mcg', 'IU'].map((u) => (
                          <TouchableOpacity
                            key={u}
                            style={[s.unitBtn, doseUnit === u && s.unitBtnOn]}
                            onPress={() => setDoseUnit(u)}
                          >
                            <Text style={[s.unitBtnText, doseUnit === u && s.unitBtnTextOn]}>{u}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('protocols_conc_optional')}</Text>
                    <View style={s.inputRow}>
                      <TextInput
                        style={[s.input, { flex: 1, marginRight: 8, marginBottom: 0 }]}
                        placeholder="e.g. 200"
                        placeholderTextColor="#aaa"
                        keyboardType="numeric"
                        value={concentration}
                        onChangeText={setConcentration}
                      />
                      <View style={s.unitPicker}>
                        {['mg', 'mcg', 'IU'].map((u) => (
                          <TouchableOpacity
                            key={u}
                            style={[s.unitBtn, concentrationUnit === u && s.unitBtnOn]}
                            onPress={() => setConcentrationUnit(u)}
                          >
                            <Text style={[s.unitBtnText, concentrationUnit === u && s.unitBtnTextOn]}>{u}/ml</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    {unitMismatch && (
                      <View style={[s.calcResult, { backgroundColor: '#FEF3E2', marginTop: 10 }]}>
                        <Text style={[s.calcResultText, { color: '#92400E' }]}>
                          {t('protocols_unit_mismatch') || 'Cannot mix IU with mg/mcg. Use the same unit type for concentration and dose.'}
                        </Text>
                      </View>
                    )}
                    <Text style={s.fieldLabel}>{t('protocols_notes_optional')}</Text>
                    <TextInput
                      style={[s.input, { height: 80 }]}
                      placeholder={t('protocols_notes_placeholder')}
                      placeholderTextColor="#aaa"
                      multiline
                      value={notes}
                      onChangeText={setNotes}
                    />
                  </>
                )}
              </View>
            )}

            {step === 4 && (
              <View>
                <Text style={s.modalStepTitle}>{t('protocols_step_schedule')}</Text>
                <Text style={s.modalStepSub}>{t('protocols_step_schedule_sub')}</Text>

                {/* 1 — Start date: month selector + day input */}
                <Text style={s.fieldLabel}>{t('protocols_start_date')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.monthScroll}>
                  <View style={s.monthRow}>
                    {MONTH_KEYS.map((mk, idx) => (
                      <TouchableOpacity
                        key={mk}
                        style={[s.monthPill, startMonth === idx && s.monthPillOn]}
                        onPress={() => setStartMonth(idx)}
                      >
                        <Text style={[s.monthPillText, startMonth === idx && s.monthPillTextOn]}>
                          {t(mk)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <TextInput
                  style={[s.input, { width: 80, textAlign: 'center', marginTop: 8 }]}
                  placeholder="DD"
                  placeholderTextColor="#aaa"
                  keyboardType="numeric"
                  maxLength={2}
                  value={startDay}
                  onChangeText={(val) => {
                    const num = parseInt(val);
                    if (val === '' || (num >= 1 && num <= 31)) setStartDay(val);
                  }}
                />

                {/* 2 — Interval: every X days */}
                <Text style={s.fieldLabel}>{t('protocols_how_often')}</Text>
                <View style={s.freqGrid}>
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <TouchableOpacity
                      key={d}
                      style={[s.freqBtn, intervalDays === d && s.freqBtnOn]}
                      onPress={() => handleIntervalChange(d)}
                    >
                      <Text style={[s.freqBtnText, intervalDays === d && s.freqBtnTextOn]}>
                        {d === 1 ? t('protocols_every_day') : t('protocols_every_x_days').replace('{x}', d)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 3 — Doses per day (only for interval <= 2) */}
                {intervalDays <= 2 && (
                  <>
                    <Text style={s.fieldLabel}>{t('protocols_doses_per_day')}</Text>
                    <View style={s.freqGrid}>
                      {[1, 2, 3].map((n) => (
                        <TouchableOpacity
                          key={n}
                          style={[s.freqBtn, dosesPerDay === n && s.freqBtnOn]}
                          onPress={() => handleDosesPerDayChange(n)}
                        >
                          <Text style={[s.freqBtnText, dosesPerDay === n && s.freqBtnTextOn]}>
                            {n === 1 ? t('protocols_once') : n === 2 ? t('protocols_twice') : t('protocols_three_times')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* 4 — Time pickers */}
                <Text style={s.fieldLabel}>{t('protocols_what_time')}</Text>
                {reminderTimes.map((rt, idx) => (
                  <View key={idx}>
                    {reminderTimes.length > 1 && (
                      <Text style={s.doseTimeLabel}>{t('protocols_dose_label')} {idx + 1}</Text>
                    )}
                    <TouchableOpacity style={s.dateBtn} onPress={() => { setActiveTimeIndex(idx); setShowTimePicker(true); }}>
                      <Text style={s.dateBtnText}>⏰  {formatTimeAMPM(rt)}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {showTimePicker && (
                  <DateTimePicker
                    value={(() => {
                      const [h, m] = (reminderTimes[activeTimeIndex] || currentTimeRounded5()).split(':').map(Number);
                      const d = new Date(); d.setHours(h, m, 0, 0);
                      return d;
                    })()}
                    mode="time"
                    is24Hour={false}
                    minuteInterval={1}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selectedDate) => {
                      setShowTimePicker(Platform.OS === 'ios');
                      if (selectedDate) {
                        const h = String(selectedDate.getHours()).padStart(2, '0');
                        const m = String(selectedDate.getMinutes()).padStart(2, '0');
                        setReminderTimes(prev => {
                          const next = [...prev];
                          next[activeTimeIndex] = `${h}:${m}`;
                          return next;
                        });
                      }
                    }}
                  />
                )}
                {Platform.OS === 'ios' && showTimePicker && (
                  <TouchableOpacity style={s.doneBtn} onPress={() => setShowTimePicker(false)}>
                    <Text style={s.doneBtnText}>{t('done')}</Text>
                  </TouchableOpacity>
                )}

                {/* 5 — Total doses */}
                <Text style={s.fieldLabel}>{t('protocols_total_doses_schedule')}</Text>
                <TextInput
                  style={s.input}
                  placeholder={t('protocols_custom_total')}
                  placeholderTextColor="#aaa"
                  keyboardType="numeric"
                  value={scheduleTotal}
                  onChangeText={setScheduleTotal}
                />
                {scheduleTotal && parseInt(scheduleTotal) > 0 && (
                  <View style={s.infoBox}>
                    <Text style={s.infoText}>
                      {(() => {
                        const total = parseInt(scheduleTotal);
                        const daysNeeded = Math.ceil(total / dosesPerDay) * intervalDays;
                        const endDate = buildDate(startMonth, startDay);
                        endDate.setDate(endDate.getDate() + daysNeeded);
                        const endStr = `${t(MONTH_KEYS[endDate.getMonth()])} ${endDate.getDate()}`;
                        return t('protocols_end_estimate').replace('{date}', endStr);
                      })()}
                    </Text>
                  </View>
                )}

                {/* 6 — Wellness goals */}
                <Text style={s.fieldLabel}>{t('protocols_wellness_goal')}</Text>
                <View style={s.freqGrid}>
                  {getWellnessKeys().map((gKey) => (
                    <TouchableOpacity
                      key={gKey}
                      style={[s.freqBtn, goals.includes(gKey) && s.freqBtnOn]}
                      onPress={() => setGoals(prev => prev.includes(gKey) ? prev.filter(g => g !== gKey) : [...prev, gKey])}
                    >
                      <Text style={[s.freqBtnText, goals.includes(gKey) && s.freqBtnTextOn]}>{t(gKey)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {step === 5 && type === 'recon' && !editingId && (
              <View>
                <Text style={s.modalStepTitle}>{t('protocols_step_vial')}</Text>
                <Text style={s.modalStepSub}>
                  {t('protocols_step_vial_sub')}
                </Text>
                {!skipVial ? (
                  <>
                    <Text style={s.fieldLabel}>{t('protocols_date_mixed')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.monthScroll}>
                      <View style={s.monthRow}>
                        {MONTH_KEYS.map((mk, idx) => (
                          <TouchableOpacity
                            key={mk}
                            style={[s.monthPill, vialMonth === idx && s.monthPillOn]}
                            onPress={() => setVialMonth(idx)}
                          >
                            <Text style={[s.monthPillText, vialMonth === idx && s.monthPillTextOn]}>
                              {t(mk)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                    <TextInput
                      style={[s.input, { width: 80, textAlign: 'center', marginTop: 8 }]}
                      placeholder="DD"
                      placeholderTextColor="#aaa"
                      keyboardType="numeric"
                      maxLength={2}
                      value={vialDay}
                      onChangeText={(val) => {
                        const num = parseInt(val);
                        if (val === '' || (num >= 1 && num <= 31)) setVialDay(val);
                      }}
                    />
                    <View style={[s.infoBox, { marginTop: 8 }]}>
                      <Text style={s.infoText}>
                        {t('protocols_bac_info')}
                      </Text>
                    </View>
                    <TouchableOpacity style={s.skipVialBtn} onPress={() => setSkipVial(true)}>
                      <Text style={s.skipVialBtnText}>{t('protocols_skip_vial')}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={s.skippedBox}>
                    <Text style={s.skippedText}>
                      {t('protocols_skipped_msg')}
                    </Text>
                    <TouchableOpacity onPress={() => setSkipVial(false)}>
                      <Text style={s.skipVialBtnText}>{t('protocols_add_date')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <View style={s.reviewCard}>
                  <Text style={s.reviewTitle}>{t('protocols_summary')}</Text>
                  {[
                    [t('protocols_compound_label'), name],
                    [t('protocols_amount_label'), `${amount} ${unit}`],
                    [t('protocols_water_label'), `${water} ml`],
                    [t('protocols_dose_label'), `${dose} ${doseUnit}`],
                    ...(drawML && drawValid ? [[t('protocols_draw_label'), `${drawML} ml (${drawUnits} units)`]] : []),
                    [t('protocols_frequency_label'), frequencyLabel(intervalDays)],
                  ].map(([label, val], i, arr) => (
                    <View key={label} style={[s.reviewRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                      <Text style={s.reviewLabel}>{label}</Text>
                      <Text style={s.reviewVal}>{val}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
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
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#aaa', letterSpacing: 0.5, marginBottom: 10, marginTop: 8 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 8 },
  emptySub: { fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 24 },
  emptyBtn: { backgroundColor: '#185FA5', paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12 },
  emptyBtnText: { color: 'white', fontSize: 14, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  cardDot: { width: 10, height: 10, borderRadius: 5 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: '600', color: '#111' },
  cardMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '500' },
  badgeGoal: { backgroundColor: '#FAEEDA', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeGoalText: { fontSize: 10, color: '#633806', fontWeight: '500' },
  chevron: { fontSize: 11, color: '#aaa' },
  cardBody: { borderTopWidth: 0.5, borderTopColor: '#f0f0f0', padding: 14 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: '#f5f5f5' },
  detailLabel: { fontSize: 12, color: '#888' },
  detailVal: { fontSize: 12, fontWeight: '500', color: '#111' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, padding: 8, borderRadius: 8, borderWidth: 0.5, borderColor: '#ddd', alignItems: 'center' },
  actionBtnText: { fontSize: 12, color: '#666' },
  actionBtnDanger: { borderColor: '#E24B4A' },
  actionBtnDangerText: { fontSize: 12, color: '#E24B4A' },
  syringeWrap: { backgroundColor: '#f0f6ff', borderRadius: 12, padding: 14, marginTop: 12, marginBottom: 4 },
  syringeTitle: { fontSize: 12, fontWeight: '600', color: '#0C447C', marginBottom: 4 },
  syringeSubtitle: { fontSize: 13, color: '#185FA5', marginBottom: 12 },
  syringeNoData: { fontSize: 12, color: '#888', lineHeight: 18 },
  syringeOuter: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  syringeBody: { flex: 1, height: 48 },
  syringeTicks: { flexDirection: 'row', justifyContent: 'space-between', height: 16, alignItems: 'flex-end', marginBottom: 2 },
  tickGroup: { alignItems: 'center', flex: 1 },
  tick: { width: 1, height: 6, backgroundColor: '#aaa' },
  tickMajor: { height: 10, backgroundColor: '#666', width: 1.5 },
  tickLabel: { fontSize: 8, color: '#888', marginTop: 1 },
  syringeTrack: { height: 22, backgroundColor: '#e8eef5', borderRadius: 4, overflow: 'hidden', position: 'relative', borderWidth: 1, borderColor: '#b0c8e8' },
  syringeFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#185FA5', opacity: 0.35, borderRadius: 3 },
  plungerLine: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: '#185FA5', borderRadius: 2 },
  syringeNeedle: { width: 24, height: 4, backgroundColor: '#aaa', borderRadius: 2, marginLeft: 2 },
  syringeInfo: { flexDirection: 'row', justifyContent: 'space-between' },
  syringeInfoItem: { alignItems: 'center' },
  syringeInfoLabel: { fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 0.3 },
  syringeInfoVal: { fontSize: 13, fontWeight: '600', color: '#0C447C', marginTop: 2 },
  syringeDisclaimer: { fontSize: 9, color: '#999', marginTop: 10, textAlign: 'center', lineHeight: 13 },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  modalCancel: { fontSize: 14, color: '#888' },
  modalTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  modalSave: { fontSize: 14, color: '#185FA5', fontWeight: '600' },
  modalProgress: { flexDirection: 'row', gap: 4, paddingHorizontal: 20, paddingVertical: 12 },
  modalProgSeg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#eee' },
  modalProgDone: { backgroundColor: '#185FA5' },
  modalBody: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  modalStepTitle: { fontSize: 20, fontWeight: '600', color: '#111', marginBottom: 6, marginTop: 8 },
  modalStepSub: { fontSize: 13, color: '#888', marginBottom: 20 },
  fieldLabel: { fontSize: 11, color: '#888', marginBottom: 6 },
  fieldHint: { fontSize: 11, color: '#aaa', marginTop: 4, marginBottom: 12 },
  doseTimeLabel: { fontSize: 12, fontWeight: '600', color: '#666', marginTop: 8, marginBottom: 2 },
  input: { borderWidth: 0.5, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 13, color: '#111', backgroundColor: '#f9f9f9', marginBottom: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  unitPicker: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  unitBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 0.5, borderColor: '#ddd', backgroundColor: '#f9f9f9' },
  unitBtnOn: { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  unitBtnText: { fontSize: 12, color: '#666' },
  unitBtnTextOn: { color: 'white', fontWeight: '600' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  stepperBtn: { width: 48, height: 48, borderRadius: 10, borderWidth: 0.5, borderColor: '#ddd', backgroundColor: '#f9f9f9', alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: { fontSize: 24, color: '#185FA5', fontWeight: '400' },
  stepperVal: { flex: 1, backgroundColor: '#E6F1FB', borderRadius: 10, padding: 12, alignItems: 'center' },
  stepperValText: { fontSize: 20, fontWeight: '600', color: '#0C447C' },
  stepperHoldHint: { fontSize: 10, color: '#185FA5', marginTop: 2 },
  stepperHint: { fontSize: 10, color: '#aaa', marginBottom: 8 },
  calcResult: { backgroundColor: '#E6F1FB', borderRadius: 8, padding: 12, marginTop: 12, marginBottom: 4 },
  calcResultText: { fontSize: 13, color: '#0C447C', fontWeight: '500' },
  calcDisclaimer: { fontSize: 10, color: '#888', marginTop: 6, lineHeight: 14 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  typeBtn: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 0.5, borderColor: '#ddd', backgroundColor: '#f9f9f9', alignItems: 'center' },
  typeBtnOn: { borderWidth: 2, borderColor: '#185FA5', backgroundColor: '#E6F1FB' },
  typeEmoji: { fontSize: 20, marginBottom: 4 },
  typeBtnLabel: { fontSize: 11, fontWeight: '600', color: '#444' },
  typeBtnLabelOn: { color: '#0C447C' },
  typeBtnSub: { fontSize: 9, color: '#aaa', marginTop: 1 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  colorSwatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  colorSwatchOn: { borderWidth: 3, borderColor: '#111' },
  colorCheck: { color: 'white', fontSize: 16, fontWeight: '700' },
  previewPill: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, marginBottom: 20 },
  previewDot: { width: 14, height: 14, borderRadius: 7 },
  previewName: { fontSize: 14, fontWeight: '600', color: '#111' },
  previewSub: { fontSize: 11, color: '#888' },
  freqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  freqBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 0.5, borderColor: '#ddd', backgroundColor: '#f9f9f9' },
  freqBtnOn: { borderWidth: 2, borderColor: '#185FA5', backgroundColor: '#E6F1FB' },
  freqBtnText: { fontSize: 12, color: '#666' },
  freqBtnTextOn: { color: '#0C447C', fontWeight: '600' },
  dateBtn: { backgroundColor: '#f9f9f9', borderWidth: 0.5, borderColor: '#ddd', borderRadius: 10, padding: 14, marginBottom: 14 },
  dateBtnText: { fontSize: 14, color: '#111' },
  monthScroll: { marginBottom: 4 },
  monthRow: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  monthPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: '#f0f0f0', borderWidth: 0.5, borderColor: '#ddd' },
  monthPillOn: { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  monthPillText: { fontSize: 12, color: '#666', fontWeight: '500' },
  monthPillTextOn: { color: '#fff', fontWeight: '600' },
  doneBtn: { backgroundColor: '#185FA5', padding: 12, borderRadius: 10, alignItems: 'center', marginBottom: 14 },
  doneBtnText: { color: 'white', fontSize: 14, fontWeight: '600' },
  skipVialBtn: { alignItems: 'center', paddingVertical: 12, marginBottom: 16 },
  skipVialBtnText: { fontSize: 13, color: '#185FA5' },
  skippedBox: { backgroundColor: '#f9f9f9', borderRadius: 10, padding: 14, marginBottom: 16, alignItems: 'center' },
  skippedText: { fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 10, lineHeight: 20 },
  infoBox: { backgroundColor: '#E6F1FB', borderRadius: 10, padding: 12, marginBottom: 16 },
  infoText: { fontSize: 12, color: '#0C447C', lineHeight: 18 },
  reviewCard: { backgroundColor: '#f9f9f9', borderRadius: 12, padding: 14, marginTop: 8 },
  reviewTitle: { fontSize: 11, fontWeight: '600', color: '#aaa', letterSpacing: 0.5, marginBottom: 10 },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  reviewLabel: { fontSize: 12, color: '#888' },
  reviewVal: { fontSize: 12, fontWeight: '500', color: '#111' },
  suggestionBox: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 0.5, borderColor: '#ddd', marginBottom: 14 },
  suggestionItem: { padding: 12, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' },
  suggestionText: { fontSize: 13, color: '#111' },
  suggestionMore: { fontSize: 11, color: '#aaa', padding: 10, textAlign: 'center' },
});