import { useState, useCallback, useEffect, useMemo } from 'react';
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
  Keyboard,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getCachedUser } from '../lib/supabase';
import { isPremium } from '../lib/purchases';
import { useLanguage } from '../i18n/LanguageContext';
import { Analytics } from '../lib/analytics';
import { scheduleDoseReminder, cancelDoseReminder, dismissDeliveredDoseReminders } from '../lib/notifications';
import { formatTime } from '../lib/timeFormat';
import { friendlyError } from '../lib/friendlyError';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getActiveProtocols, insertProtocol, updateProtocol,
  softDeleteProtocol, getProtocolById, getActiveVials,
  insertVial, deactivateVialsByProtocol, updateVial,
} from '../lib/database';
import { requestSync, notifyDataChanged } from '../lib/sync';
import { unitsCompatible, computeDraw, dosesPerVial, massFromUnits, massParts } from '../lib/doseMath';
import { computeServings, supplyDaysLeft } from '../lib/oralMath';
import { matchesQuery } from '../lib/compounds';
import { expectedDosesOn, nextDueDate, frequencyLabelFor } from '../lib/schedule';
import { DEFAULT_VALID_DAYS, daysUntilExpiry, expiryColor } from '../lib/vialExpiry';
import { useTheme } from '../lib/theme';

// Protocols list sort options. 'type' keeps the compound-type sections; the
// rest render a single flat list.
const SORT_OPTIONS = [
  { key: 'due', label: 'protocols_sort_due' },
  { key: 'az', label: 'protocols_sort_az' },
  { key: 'vial', label: 'protocols_sort_vial' },
  { key: 'added', label: 'protocols_sort_added' },
  { key: 'type', label: 'protocols_sort_type' },
];
const SORT_STORAGE_KEY = 'dosetrace_protocols_sort';

const LYOPHILIZED_KEYS = ['lyo_5_amino_1mq','lyo_alpha_endorphin','lyo_alpha_msh','lyo_gamma_endorphin','lyo_ac_epithalon','lyo_ace_031','lyo_adamax','lyo_adipotide','lyo_aicar','lyo_albiglutide','lyo_aod_9604','lyo_ara_290','lyo_bpc_157','lyo_cagrilintide','lyo_cecropin_b','lyo_cerebrolysin','lyo_cetrorelix_acetate','lyo_cjc_1295_with_dac','lyo_cjc_1295_without_dac','lyo_cortexin','lyo_dermorphin','lyo_dihexa','lyo_dsip','lyo_dulaglutide','lyo_epithalon','lyo_epo','lyo_exenatide','lyo_follistatin_344','lyo_foxo4_dri','lyo_gdf_8','lyo_ghk_cu','lyo_ghrelin','lyo_ghrp_2','lyo_ghrp_6','lyo_glutathione','lyo_gonadorelin','lyo_gts_21','lyo_hcg','lyo_hexarelin','lyo_hgh','lyo_hgh_fragment_176_191','lyo_hmg','lyo_humanin','lyo_hyaluronic_acid','lyo_igf_1_des','lyo_igf_1_lr3','lyo_ipamorelin','lyo_kisspeptin_10','lyo_kisspeptin_13','lyo_kpv','lyo_lc120','lyo_lc216','lyo_liraglutide','lyo_lixisenatide','lyo_ll_37','lyo_mazdutide','lyo_melanotan_1','lyo_melanotan_2','lyo_melatonin','lyo_mgf','lyo_mog_35_55','lyo_mots_c','lyo_myostatin','lyo_n_acetyl_selank_amidate','lyo_n_acetyl_semax_amidate','lyo_n_acetyl_epitalon_amidate','lyo_nad_plus','lyo_octreotide','lyo_orexin_a','lyo_oxytocin','lyo_p21','lyo_pe_22_28','lyo_peg_mgf','lyo_peptide_t','lyo_pt_141','lyo_retatrutide','lyo_rgd_peptide','lyo_selank','lyo_semaglutide','lyo_semax','lyo_sermorelin','lyo_snap_8','lyo_ss_31','lyo_survodutide','lyo_tb_500','lyo_tesamorelin','lyo_tesofensine','lyo_thymalin','lyo_thymosin_alpha_1','lyo_thymosin_beta_4','lyo_thymulin','lyo_tirzepatide','lyo_triptorelin','lyo_vip','lyo_glow','lyo_klow','lyo_wolverine'];

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

// Free tier: max active protocols before Premium is required. If you change
// this, update the copy in protocols_limit_msg + paywall_free_feat_3.
const FREE_PROTOCOL_LIMIT = 3;

const COLORS = [
  '#185FA5','#1D9E75','#D85A30','#7F77DD','#BA7517','#D4537E','#5DCAA5','#378ADD','#639922','#888780',
  '#E24B4A','#2C2C2A','#0E8C8C','#6A3FB5','#C13A9E','#8A5A2B','#4C6E8F','#E0A500','#17B0B8','#A82E55',
];

const COLOR_NAMES = {
  '#185FA5':'color_ocean','#1D9E75':'color_forest','#D85A30':'color_coral',
  '#7F77DD':'color_lavender','#BA7517':'color_amber','#D4537E':'color_rose',
  '#5DCAA5':'color_mint','#378ADD':'color_sky','#639922':'color_olive',
  '#888780':'color_stone','#E24B4A':'color_red','#2C2C2A':'color_charcoal',
  '#0E8C8C':'color_teal','#6A3FB5':'color_grape','#C13A9E':'color_magenta',
  '#8A5A2B':'color_bronze','#4C6E8F':'color_slate','#E0A500':'color_gold',
  '#17B0B8':'color_turquoise','#A82E55':'color_wine',
};

// Diluent options for reconstitution. Stored as canonical tokens so the label
// renders in any language; 'other' lets the user record their own free text.
const DILUENT_OPTIONS = [
  { val: 'bacteriostatic_water', key: 'protocols_diluent_bac' },
  { val: 'sterile_water', key: 'protocols_diluent_sterile' },
  { val: 'sodium_chloride_09', key: 'protocols_diluent_nacl' },
  { val: 'other', key: 'protocols_diluent_other' },
];
const DILUENT_TOKENS = DILUENT_OPTIONS.map(o => o.val);

// Resolve a stored diluent value to a display label: known token → translated,
// otherwise the user's own free text as entered.
function diluentLabel(val, t) {
  if (!val) return '—';
  const opt = DILUENT_OPTIONS.find(o => o.val === val && o.val !== 'other');
  return opt ? t(opt.key) : val;
}

function getTypeBadge(type, t, c) {
  if (type === 'recon') return { bg: c.accentSoft, text: c.accentSoftText, label: t('protocols_type_badge_lyophilized') };
  if (type === 'rtu') return { bg: c.successSoft, text: c.successSoftText, label: t('protocols_type_badge_rtu') };
  if (type === 'oral') return { bg: c.warningSoft, text: c.warningSoftText, label: t('protocols_type_badge_oral') };
  return { bg: c.card2, text: c.textMuted, label: type };
}

// The oral form is stored in `notes` as an English value (Capsule/Tablet/…);
// map it to its localized label for display.
const ORAL_FORM_KEY = {
  Capsule: 'protocols_capsule', Tablet: 'protocols_tablet', Powder: 'protocols_powder',
  Liquid: 'protocols_liquid', Gummy: 'protocols_gummy', Softgel: 'protocols_softgel',
};
function oralFormLabel(form, t) {
  return ORAL_FORM_KEY[form] ? t(ORAL_FORM_KEY[form]) : form;
}

function ProtocolSyringeGuide({ p, t }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [zoom, setZoom] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  if (p.type === 'oral') return null;

  const draw = computeDraw({
    type: p.type,
    amount: p.amount, water: p.water,
    dose: p.dose, doseUnit: p.dose_unit, unit: p.unit,
    concentration: p.concentration, concentrationUnit: p.concentration_unit,
    syringeSize: p.syringe_size,
  });
  const pDrawML = draw.drawML;
  const pDrawUnits = draw.drawUnits;
  const pDrawValid = draw.valid;

  const syringeMax = p.syringe_size || 100;
  const drawFrac = pDrawValid ? Math.min(parseFloat(pDrawUnits) / syringeMax, 1) : 0;
  const fillPct = drawFrac * 100;
  // Zoom modal: an enlarged, horizontally-scrollable ruler (~16px per unit).
  const zoomWidth = Math.max(windowWidth - 72, syringeMax * 16);

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
        {t('protocols_syringe_based_on')} <Text style={{ fontWeight: '700', color: colors.accent }}>{pDrawUnits} {t('protocols_syringe_units')} ({pDrawML} ml)</Text>
      </Text>
      <TouchableOpacity activeOpacity={0.85} onPress={() => setZoom(true)}>
      <View style={s.syringeOuter}>
        <View style={s.syringeBody}>
          <View style={s.syringeTicks}>
            {/* One minor tick every 2 units (0.02 ml on a U-100 syringe) so a draw
                like 18u lands on a mark; a taller, labelled tick every 10 units.
                Positioned on the true 0–100% scale so ticks line up with the fill
                and plunger. */}
            {Array.from({ length: Math.floor(syringeMax / 2) + 1 }).map((_, i) => {
              const tickVal = i * 2;
              const isMajor = tickVal % 10 === 0;
              return (
                <View key={i} style={[s.tickGroup, { left: `${(tickVal / syringeMax) * 100}%` }]}>
                  {isMajor && <Text style={s.tickLabel}>{tickVal}</Text>}
                  <View style={[s.tick, isMajor && s.tickMajor]} />
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
      <Text style={s.syringeZoomHint}>🔍 {t('protocols_syringe_zoom_hint')}</Text>
      </TouchableOpacity>
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
          {/* Show the dose in the other mass unit too, so the mcg↔mg equivalence
              is visible right where the draw is read. */}
          {(() => {
            let alt = null;
            if (p.dose_unit === 'mcg') { const pp = massParts(parseFloat(p.dose) / 1000); if (pp) alt = `${pp.mg} mg`; }
            else if (p.dose_unit === 'mg') { const pp = massParts(parseFloat(p.dose)); if (pp) alt = `${pp.mcg} mcg`; }
            return alt ? <Text style={s.syringeInfoAlt}>= {alt}</Text> : null;
          })()}
        </View>
        <View style={s.syringeInfoItem}>
          <Text style={s.syringeInfoLabel}>{t('protocols_syringe_size')}</Text>
          <Text style={s.syringeInfoVal}>{syringeMax}u</Text>
        </View>
      </View>
      <Text style={s.syringeDisclaimer}>{t('protocols_calc_disclaimer')}</Text>

      <Modal visible={zoom} transparent animationType="fade" onRequestClose={() => setZoom(false)}>
        <TouchableOpacity style={s.zoomBackdrop} activeOpacity={1} onPress={() => setZoom(false)}>
          <TouchableOpacity style={s.zoomCard} activeOpacity={1} onPress={() => {}}>
            <Text style={s.zoomTitle}>{p.name}</Text>
            <Text style={s.zoomReadout}>
              {t('protocols_syringe_draw_to')} <Text style={{ fontWeight: '800', color: colors.accent }}>{pDrawUnits}u</Text> · {pDrawML} ml
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              contentOffset={{ x: Math.max(0, drawFrac * zoomWidth - (windowWidth - 72) / 2), y: 0 }}
              style={s.zoomScroll}
            >
              <View style={{ width: zoomWidth, paddingTop: 4 }}>
                <View style={[s.zoomTicks, { width: zoomWidth }]}>
                  {Array.from({ length: Math.floor(syringeMax / 2) + 1 }).map((_, i) => {
                    const tickVal = i * 2;
                    const isMajor = tickVal % 10 === 0;
                    return (
                      <View key={i} style={[s.zoomTickGroup, { left: (tickVal / syringeMax) * zoomWidth }]}>
                        {isMajor && <Text style={s.zoomTickLabel}>{tickVal}</Text>}
                        <View style={[s.zoomTick, isMajor && s.zoomTickMajor]} />
                      </View>
                    );
                  })}
                </View>
                <View style={[s.zoomBarrel, { width: zoomWidth }]}>
                  <View style={[s.zoomFill, { width: drawFrac * zoomWidth }]} />
                  <View style={[s.zoomPlunger, { left: drawFrac * zoomWidth }]} />
                </View>
              </View>
            </ScrollView>
            <TouchableOpacity style={s.zoomClose} onPress={() => setZoom(false)}>
              <Text style={s.zoomCloseText}>{t('done')}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// Oral serving calculator card — the oral twin of the syringe guide. Turns the
// user's target dose + per-serving strength into how many units to take, and
// (if a container size is set) how many units / days of supply remain. Pure
// arithmetic on the user's own numbers — no recommendation.
function ProtocolServingGuide({ p, t, onRefill }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  if (p.type !== 'oral') return null;

  const r = computeServings({
    targetDose: p.dose,
    doseUnit: p.dose_unit,
    servingStrength: p.serving_strength,
    servingStrengthUnit: p.serving_strength_unit,
    servingUnits: p.serving_units,
    form: p.notes, // oral form (Capsule/Tablet/…) is stored in `notes`
    divisible: p.divisible == null ? undefined : p.divisible === 1,
  });

  if (!r.valid) {
    if (r.unitMismatch) {
      return (
        <View style={s.syringeWrap}>
          <Text style={s.syringeTitle}>{t('protocols_serving_title')}</Text>
          <Text style={s.syringeNoData}>{t('protocols_serving_unit_mismatch')}</Text>
        </View>
      );
    }
    return null; // not enough info yet — stay quiet
  }

  const unitLabel = t(r.unitKey);
  // Pretty-print halves: 0.5 → "½", 1.5 → "1½"; anything else stays decimal.
  const fmt = (v) => {
    if (Math.abs(v * 2 - Math.round(v * 2)) > 1e-9) return String(Math.round(v * 100) / 100);
    const whole = Math.floor(v + 1e-9);
    const isHalf = Math.abs(v - whole - 0.5) < 1e-9;
    if (!isHalf) return String(whole);
    return whole > 0 ? `${whole}½` : '½';
  };
  // Show the amount when it's achievable (continuous, whole, or a clean half on
  // a scored unit). Otherwise the unit can't hit the target, so explain instead.
  const canShowAmount = !r.discrete || r.isAchievable;
  const containsMsg = t('protocols_serving_contains')
    .replace('{strength}', r.perUnitDose)
    .replace('{sunit}', p.dose_unit)
    .replace('{ratio}', r.ratio);
  const containerUnits = parseFloat(p.container_units);
  const unitsTaken = parseFloat(p.units_taken) || 0;
  const unitsLeft = containerUnits > 0 ? Math.max(0, Math.round((containerUnits - unitsTaken) * 100) / 100) : null;
  const daysLeft = unitsLeft != null ? supplyDaysLeft(unitsLeft, r.unitsNeeded, p.doses_per_day || 1) : null;

  return (
    <View style={s.syringeWrap}>
      <Text style={s.syringeTitle}>{t('protocols_serving_title')}</Text>
      {canShowAmount ? (
        <Text style={s.syringeSubtitle}>
          {t('protocols_syringe_based_on')}{' '}
          <Text style={{ fontWeight: '700', color: colors.accent }}>{fmt(r.unitsNeeded)} {unitLabel}</Text>
        </Text>
      ) : (
        <View style={[s.calcResult, { backgroundColor: colors.warningSoft, marginTop: 8 }]}>
          <Text style={[s.calcResultText, { color: colors.warningSoftText }]}>
            {r.splittable ? t('protocols_serving_not_half') : containsMsg}
          </Text>
        </View>
      )}

      {r.nearest && (
        <Text style={s.servingNearest}>
          {fmt(r.nearest.lowUnits)} {unitLabel} = {r.nearest.lowDose} {p.dose_unit} · {fmt(r.nearest.highUnits)} {unitLabel} = {r.nearest.highDose} {p.dose_unit}
        </Text>
      )}

      <View style={[s.syringeInfo, { marginTop: 12 }]}>
        {canShowAmount && (
          <View style={s.syringeInfoItem}>
            <Text style={s.syringeInfoLabel}>{t('protocols_serving_take')}</Text>
            <Text style={s.syringeInfoVal}>{fmt(r.unitsNeeded)} {unitLabel}</Text>
          </View>
        )}
        <View style={s.syringeInfoItem}>
          <Text style={s.syringeInfoLabel}>{t('protocols_serving_dose')}</Text>
          <Text style={s.syringeInfoVal}>{p.dose} {p.dose_unit}</Text>
        </View>
        {unitsLeft != null && (
          <View style={s.syringeInfoItem}>
            <Text style={s.syringeInfoLabel}>{t('protocols_serving_left')}</Text>
            <Text style={s.syringeInfoVal}>{unitsLeft} {unitLabel}</Text>
          </View>
        )}
        {daysLeft != null && (
          <View style={s.syringeInfoItem}>
            <Text style={s.syringeInfoLabel}>{t('protocols_serving_days_left')}</Text>
            <Text style={s.syringeInfoVal}>{daysLeft}</Text>
          </View>
        )}
      </View>

      {unitsLeft != null && onRefill && unitsTaken > 0 && (
        <TouchableOpacity style={s.newBottleBtn} onPress={() => onRefill(p.id)}>
          <Text style={s.newBottleText}>↺ {t('protocols_serving_new_bottle')}</Text>
        </TouchableOpacity>
      )}

      <Text style={s.syringeDisclaimer}>{t('protocols_calc_disclaimer')}</Text>
    </View>
  );
}

function ProtocolCard({ p, vial, expanded, setExpanded, openEdit, deleteProtocol, onSaveNote, onRefill, onRefillVial, t }) {
  const { colors } = useTheme();
  const { language, timeFormat } = useLanguage();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const badge = getTypeBadge(p.type, t, colors);
  const isExpanded = expanded === p.id;

  // Inline, editable note — saved straight from the card, no need to open Edit.
  const [noteDraft, setNoteDraft] = useState(p.note || '');
  useEffect(() => { setNoteDraft(p.note || ''); }, [p.note]);
  const noteDirty = noteDraft !== (p.note || '');
  const saveNote = () => {
    Keyboard.dismiss();
    onSaveNote(p.id, noteDraft);
  };
  // Recon: expiry is derived from the mix date + validity window. RTU: expiry is
  // the box date the user entered (vial.expires_on).
  const vialDaysLeft = vial
    ? (p.type === 'recon'
        ? daysUntilExpiry(vial.mixed_on, p.vial_valid_days || DEFAULT_VALID_DAYS, new Date())
        : (vial.expires_on ? Math.ceil((new Date(vial.expires_on + 'T00:00:00') - new Date()) / 86400000) : null))
    : null;
  const vialDosesLeft = vial ? Math.max(0, (vial.total_doses || 0) - (vial.doses_taken || 0)) : null;

  return (
    <TouchableOpacity
      style={s.card}
      onPress={() => setExpanded(isExpanded ? null : p.id)}
    >
      <View style={s.cardTop}>
        <View style={[s.cardDot, { backgroundColor: p.color }]} />
        <View style={s.cardInfo}>
          <Text style={s.cardName}>{p.compound_id ? t(p.compound_id) : p.name}</Text>
          <Text style={s.cardMeta}>{p.dose} {p.dose_unit} · {frequencyLabelFor(p.interval_days, t)}</Text>
          {p.type === 'rtu' && vialDosesLeft != null && (
            <Text style={[s.cardMeta, { fontWeight: '600', color: colors.accent }]}>
              {t('protocols_injections_left').replace('{n}', String(vialDosesLeft))}
            </Text>
          )}
          {vialDaysLeft != null && (
            <Text style={[s.cardMeta, { color: expiryColor(vialDaysLeft), fontWeight: '600' }]}>
              {vialDaysLeft <= 0
                ? t('protocols_vial_past')
                : t('protocols_vial_days_left').replace('{n}', String(vialDaysLeft))}
            </Text>
          )}
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
              {p.diluent && (
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>{t('protocols_diluent')}</Text>
                  <Text style={s.detailVal}>{diluentLabel(p.diluent, t)}</Text>
                </View>
              )}
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
              <Text style={s.detailVal}>{p.concentration} {p.concentration_unit || 'mg'}/ml</Text>
            </View>
          )}
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>{t('protocols_frequency')}</Text>
            <Text style={s.detailVal}>{p.interval_days ? frequencyLabelFor(p.interval_days, t) : (p.frequency || '—')}</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>{t('protocols_reminder')}</Text>
            <Text style={s.detailVal}>{(p.reminder_time || '—').split(',').filter(Boolean).map(t24 => formatTime(t24, language, timeFormat)).join('  ·  ')}</Text>
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
              <Text style={s.detailVal}>{oralFormLabel(p.notes, t)}</Text>
            </View>
          )}
          <View style={s.noteBlock}>
            <Text style={s.detailLabel}>{t('protocols_notes')}</Text>
            <TextInput
              style={s.noteEditBox}
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder={p.type === 'oral' ? t('protocols_notes_placeholder_oral') : t('protocols_notes_placeholder')}
              placeholderTextColor={colors.textFaint}
              multiline
            />
            {noteDirty && (
              <View style={s.noteEditActions}>
                <TouchableOpacity onPress={() => setNoteDraft(p.note || '')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.noteCancelText}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.noteSaveBtn} onPress={saveNote}>
                  <Text style={s.noteSaveText}>{t('save')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <ProtocolSyringeGuide p={p} t={t} />
          <ProtocolServingGuide p={p} t={t} onRefill={onRefill} />

          {p.type === 'rtu' && vial && (vial.doses_taken || 0) > 0 && (
            <TouchableOpacity style={[s.newBottleBtn, { marginTop: 4 }]} onPress={() => onRefillVial(p.id)}>
              <Text style={s.newBottleText}>↺ {t('protocols_new_vial')}</Text>
            </TouchableOpacity>
          )}

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
  const { t, language, timeFormat } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation();
  const route = useRoute();
  const [protocols, setProtocols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('due');
  const [vialsByProtocol, setVialsByProtocol] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [name, setName] = useState('');
  // Canonical compound key (e.g. 'lyo_bpc_157'); null for a user-added custom
  // compound. The display name comes from t(compoundId) when set.
  const [compoundId, setCompoundId] = useState(null);
  const [type, setType] = useState('recon');
  const [color, setColor] = useState('#185FA5');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('mg');
  const [water, setWater] = useState('2');
  const [diluentChoice, setDiluentChoice] = useState('');
  const [diluentOther, setDiluentOther] = useState('');
  const [dose, setDose] = useState('');
  const [iuInput, setIuInput] = useState(''); // IU→mass converter (recon dose step)
  const [doseUnit, setDoseUnit] = useState('mg');
  const [syringeSize, setSyringeSize] = useState(100);
  const [concentration, setConcentration] = useState('');
  const [concentrationUnit, setConcentrationUnit] = useState('mg');
  // ── Schedule state ──
  const [intervalDays, setIntervalDays] = useState(1);
  // Custom (typed) dosing interval — for schedules longer than the presets,
  // e.g. testosterone cypionate every 10-14 days or undecanoate every ~12 weeks.
  const [customIntervalOpen, setCustomIntervalOpen] = useState(false);
  const [customIntervalText, setCustomIntervalText] = useState('');
  const [dosesPerDay, setDosesPerDay] = useState(1);
  const [startMonth, setStartMonth] = useState(new Date().getMonth()); // 0-11
  const [startDay, setStartDay] = useState(String(new Date().getDate()));
  const [reminderTimes, setReminderTimes] = useState([currentTimeRounded5()]);
  const [goals, setGoals] = useState([]);
  const [notes, setNotes] = useState('');
  const [note, setNote] = useState('');
  // Oral serving calculator + supply
  const [servingStrength, setServingStrength] = useState('');
  const [servingStrengthUnit, setServingStrengthUnit] = useState('mg');
  const [servingUnits, setServingUnits] = useState('1');
  const [containerUnits, setContainerUnits] = useState('');
  const [divisible, setDivisible] = useState(null); // null = unanswered, true/false = user's answer
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
    return new Date(toSupabaseDateFromMD(monthIdx, dayStr) + 'T00:00:00');
  }

  // First-dose quick pick: is the current start date today (+offset days)?
  function isStartOn(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return startMonth === d.getMonth() && (parseInt(startDay) || 0) === d.getDate();
  }
  function setStartOffset(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    setStartMonth(d.getMonth());
    setStartDay(String(d.getDate()));
  }

  // Format "HH:MM" (24h) → locale-aware time (AM/PM in en, 24h in de/fr/it, …)
  function formatTimeAMPM(time24) {
    return formatTime(time24, language, timeFormat);
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
  const [vialValidDays, setVialValidDays] = useState(String(DEFAULT_VALID_DAYS));
  const [totalDoses, setTotalDoses] = useState('');
  const [skipVial, setSkipVial] = useState(false);
  // RTU vial tracking: bottle volume (ml) + the box's printed expiry (month/year)
  const [vialMl, setVialMl] = useState('');
  const [vialExpMonth, setVialExpMonth] = useState(null); // 0-11 or null
  const [vialExpYear, setVialExpYear] = useState(null);   // full year or null

  useFocusEffect(useCallback(() => { fetchProtocols(); }, []));

  // Deep-link from the Today screen: open (expand) a specific protocol, then
  // clear the param so it doesn't re-fire. A plain effect on the param reacts
  // to the change directly, independent of focus timing.
  useEffect(() => {
    const openId = route.params?.openProtocolId;
    if (openId != null) {
      setExpanded(openId);
      navigation.setParams({ openProtocolId: undefined });
    }
  }, [route.params?.openProtocolId]);

  useEffect(() => {
    AsyncStorage.getItem(SORT_STORAGE_KEY)
      .then(v => { if (v && SORT_OPTIONS.some(o => o.key === v)) setSortBy(v); })
      .catch(() => {});
  }, []);

  function changeSort(key) {
    setSortBy(key);
    AsyncStorage.setItem(SORT_STORAGE_KEY, key).catch(() => {});
  }

  async function fetchProtocols() {
    const user = await getCachedUser();
    if (!user) { setLoading(false); return; }
    const data = getActiveProtocols(user.id);
    setProtocols(data || []);
    // Active vial per protocol (latest first from the query) for the vial-age sort.
    const vials = getActiveVials(user.id) || [];
    const byProtocol = {};
    for (const v of vials) if (!byProtocol[v.protocol_id]) byProtocol[v.protocol_id] = v;
    setVialsByProtocol(byProtocol);
    setLoading(false);
  }

  // Display name follows the user's language via the canonical compound key.
  function protocolName(p) {
    return p.compound_id ? t(p.compound_id) : (p.name || '');
  }

  // Next scheduled dose date, counting today if a dose is expected today.
  function nextDoseDate(p) {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    if (expectedDosesOn(p, d) > 0) return d;
    return nextDueDate(p, d);
  }

  function sortedProtocols() {
    const arr = [...protocols];
    if (sortBy === 'az') return arr.sort((a, b) => protocolName(a).localeCompare(protocolName(b)));
    if (sortBy === 'added') return arr.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    if (sortBy === 'due') return arr.sort((a, b) => {
      const na = nextDoseDate(a), nb = nextDoseDate(b);
      return (na ? na.getTime() : Infinity) - (nb ? nb.getTime() : Infinity);
    });
    if (sortBy === 'vial') return arr.sort((a, b) => {
      // Oldest mixed vial first (closest to the 30-day mark); no vial → end.
      const va = vialsByProtocol[a.id], vb = vialsByProtocol[b.id];
      const ta = va?.mixed_on ? new Date(va.mixed_on).getTime() : Infinity;
      const tb = vb?.mixed_on ? new Date(vb.mixed_on).getTime() : Infinity;
      return ta - tb;
    });
    return arr;
  }

  function resetForm() {
    setStep(1); setName(''); setCompoundId(null); setType('recon'); setColor('#185FA5');
    setAmount(''); setUnit('mg'); setWater('2'); setDiluentChoice(''); setDiluentOther(''); setDose('');
    setIuInput('');
    setDoseUnit('mg'); setSyringeSize(100); setConcentration(''); setConcentrationUnit('mg');
    setIntervalDays(1); setDosesPerDay(1);
    setCustomIntervalOpen(false); setCustomIntervalText('');
    setStartMonth(new Date().getMonth()); setStartDay(String(new Date().getDate()));
    setReminderTimes([currentTimeRounded5()]); setGoals([]); setNotes(''); setNote('');
    setServingStrength(''); setServingStrengthUnit('mg'); setServingUnits('1'); setContainerUnits(''); setDivisible(null);
    setVialMonth(new Date().getMonth()); setVialDay(String(new Date().getDate()));
    setTotalDoses(''); setSkipVial(false); setVialValidDays(String(DEFAULT_VALID_DAYS));
    setVialMl(''); setVialExpMonth(null); setVialExpYear(null);
    setEditingId(null); setSearchQuery(''); setShowSuggestions(false);
  }

  function getCompoundKeys() {
    if (type === 'recon') return LYOPHILIZED_KEYS;
    if (type === 'rtu') return RTU_KEYS;
    if (type === 'oral') return ORAL_KEYS;
    return [];
  }

  // Returns [{ key, label }] matching the search (alias-aware). An exact,
  // already-selected match is hidden so the list doesn't echo the selection.
  function getFilteredSuggestions() {
    return getCompoundKeys()
      .map(key => ({ key, label: t(key) }))
      .filter(({ key, label }) => matchesQuery(searchQuery, key, label));
  }

  // Whether the current query already equals a listed compound's name (so we
  // don't offer "add" for something that exists).
  function queryMatchesExisting() {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return true;
    return getCompoundKeys().some(key => t(key).toLowerCase() === q);
  }

  // Pick a canonical compound from the list — stores the key + display name.
  function selectCompound({ key, label }) {
    setName(label);
    setCompoundId(key);
    setSearchQuery(label);
    setShowSuggestions(false);
    Analytics.compoundSearched(label, type);
  }

  // Escape hatch: record the user's own typed name as a custom (unverified)
  // compound so a missing entry never blocks creating a protocol.
  function addCustomCompound() {
    const custom = (searchQuery || '').trim();
    if (!custom) return;
    setName(custom);
    setCompoundId(null);
    setShowSuggestions(false);
    Analytics.compoundSearched(custom, type);
  }

  function getWellnessKeys() {
    return type === 'oral' ? WELLNESS_KEYS_ORAL : WELLNESS_KEYS_INJECTABLE;
  }

  function openEdit(p, goToStep) {
    setEditingId(p.id);
    setName(p.name || ''); setCompoundId(p.compound_id || null);
    setSearchQuery(p.compound_id ? t(p.compound_id) : (p.name || ''));
    setType(p.type || 'recon'); setColor(p.color || '#185FA5');
    setAmount(p.amount ? String(p.amount) : ''); setUnit(p.unit || 'mg');
    setWater(p.water ? String(p.water) : '2');
    if (p.diluent && DILUENT_TOKENS.includes(p.diluent) && p.diluent !== 'other') {
      setDiluentChoice(p.diluent); setDiluentOther('');
    } else if (p.diluent) {
      setDiluentChoice('other'); setDiluentOther(p.diluent);
    } else {
      setDiluentChoice(''); setDiluentOther('');
    }
    setDose(p.dose ? String(p.dose) : ''); setIuInput('');
    setDoseUnit(p.dose_unit || 'mg'); setSyringeSize(p.syringe_size || 100);
    setConcentration(p.concentration ? String(p.concentration) : '');
    setConcentrationUnit(p.concentration_unit || 'mg');
    // RTU vial (size + box expiry) for editing
    const editVial = vialsByProtocol[p.id];
    if (p.type === 'rtu' && editVial) {
      setVialMl(editVial.water_ml != null ? String(editVial.water_ml) : '');
      if (editVial.expires_on) {
        const ed = new Date(editVial.expires_on + 'T00:00:00');
        setVialExpMonth(ed.getMonth()); setVialExpYear(ed.getFullYear());
      } else { setVialExpMonth(null); setVialExpYear(null); }
    } else {
      setVialMl(''); setVialExpMonth(null); setVialExpYear(null);
    }
    const loadedInterval = p.interval_days || 1;
    setIntervalDays(loadedInterval);
    // Open the custom field when the saved interval isn't one of the presets.
    if (![1, 2, 3, 4, 5, 6, 7, 10, 14].includes(loadedInterval)) {
      setCustomIntervalOpen(true); setCustomIntervalText(String(loadedInterval));
    } else {
      setCustomIntervalOpen(false); setCustomIntervalText('');
    }
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
    setGoals(p.goal ? p.goal.split(',').filter(Boolean) : []); setNotes(p.notes || ''); setNote(p.note || '');
    setServingStrength(p.serving_strength != null ? String(p.serving_strength) : '');
    setServingStrengthUnit(p.serving_strength_unit || 'mg');
    setServingUnits(p.serving_units != null ? String(p.serving_units) : '1');
    setContainerUnits(p.container_units != null ? String(p.container_units) : '');
    setDivisible(p.divisible == null ? null : p.divisible === 1);
    setVialValidDays(String(p.vial_valid_days || DEFAULT_VALID_DAYS));
    setSkipVial(true); setStep(goToStep || 1); setShowModal(true);
  }

  // Resolve month+day to a real date. Clamps impossible days (Feb 31),
  // and treats dates more than ~2 months ahead as last year's — tapping
  // "Dec 31" in January means the recent one, not 11 months from now.
  function toSupabaseDateFromMD(monthIdx, dayStr) {
    const year = new Date().getFullYear();
    const lastDay = new Date(year, monthIdx + 1, 0).getDate();
    const day = Math.min(parseInt(dayStr) || 1, lastDay);
    let y = year;
    const candidate = new Date(y, monthIdx, day);
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 60);
    if (candidate > horizon) y -= 1;
    return `${y}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Vials are always mixed in the past: resolve to the most recent occurrence
  function toPastSupabaseDate(monthIdx, dayStr) {
    const year = new Date().getFullYear();
    const lastDay = new Date(year, monthIdx + 1, 0).getDate();
    const day = Math.min(parseInt(dayStr) || 1, lastDay);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const y = new Date(year, monthIdx, day) > todayEnd ? year - 1 : year;
    return `${y}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function adjustWater(dir) {
    const current = parseFloat(water) || 0;
    const next = Math.max(0.5, Math.round((current + dir * 0.5) * 10) / 10);
    setWater(String(next));
  }

  // Calculate draw volume from the current wizard inputs (pure module).
  const unitsOk = type === 'recon'
    ? unitsCompatible(unit, doseUnit)
    : unitsCompatible(concentrationUnit || 'mg', doseUnit);
  const wizardDraw = computeDraw({
    type, amount, water, dose, doseUnit, unit,
    concentration, concentrationUnit, syringeSize,
  });
  const drawML = wizardDraw.drawML;
  const drawUnits = wizardDraw.drawUnits;
  const drawValid = wizardDraw.valid;
  const unitMismatch = !!(dose && !unitsOk);
  // A recon draw that overflows the chosen syringe is almost always a data-entry
  // slip (wrong water volume, dose, or syringe). Flag it and block saving.
  const drawExceedsSyringe = type === 'recon' && wizardDraw.exceedsSyringe;
  // The dose step can't be left until the entered values produce a drawable dose.
  const doseStepBlocked = unitMismatch || drawExceedsSyringe;
  const drawExceedsMsg = t('protocols_draw_exceeds_warning')
    .replace('{units}', drawUnits || '?')
    .replace('{size}', String(syringeSize));

  // Resolve the diluent selection to a stored value: token for a preset choice,
  // the trimmed free text for 'other', or null if the user left it blank.
  const resolvedDiluent = type === 'recon'
    ? (diluentChoice === 'other' ? (diluentOther.trim() || null) : (diluentChoice || null))
    : null;

  async function saveProtocol() {
    if (!name) { Alert.alert(t('protocols_missing_name'), t('protocols_missing_name_msg')); return; }
    // Guard: never persist a protocol whose dose can't be drawn correctly.
    if (doseStepBlocked) {
      setStep(3);
      Alert.alert(
        t('protocols_check_values_title'),
        unitMismatch ? t('protocols_unit_mismatch') : drawExceedsMsg,
      );
      return;
    }
    setSaving(true);
    try {
    const user = await getCachedUser();
    if (!user) { setSaving(false); Alert.alert(t('error'), t('protocols_not_signed_in')); return; }

    if (editingId) {
      const freqStr = frequencyLabel(intervalDays);
      // Did the timing actually move? Only then should we clear already-delivered
      // banners (a rename or color change must NOT drop a still-pending reminder).
      const prev = protocols.find(p => p.id === editingId);
      const scheduleChanged = !prev
        || prev.reminder_time !== reminderTimes.join(',')
        || (prev.doses_per_day || 1) !== dosesPerDay
        || (prev.interval_days || 1) !== intervalDays
        || (prev.start_date || null) !== toSupabaseDateFromMD(startMonth, startDay);
      updateProtocol(editingId, {
        name, compound_id: compoundId, type, color,
        amount: parseFloat(amount) || null, unit,
        water: parseFloat(water) || null,
        diluent: resolvedDiluent,
        dose: parseFloat(dose) || null, dose_unit: doseUnit,
        syringe_size: syringeSize,
        concentration: parseFloat(concentration) || null,
        concentration_unit: concentrationUnit,
        frequency: freqStr, reminder_time: reminderTimes.join(','),
        interval_days: intervalDays, doses_per_day: dosesPerDay,
        start_date: toSupabaseDateFromMD(startMonth, startDay),
        schedule_total: null,
        vial_valid_days: parseInt(vialValidDays) || null,
        goal: goals.join(','), notes, note,
        serving_strength: type === 'oral' ? (parseFloat(servingStrength) || null) : null,
        serving_strength_unit: type === 'oral' ? servingStrengthUnit : null,
        serving_units: type === 'oral' ? (parseFloat(servingUnits) || null) : null,
        container_units: type === 'oral' ? (parseFloat(containerUnits) || null) : null,
        divisible: type === 'oral' ? divisible : null,
      });

      // RTU vial: create or update from the edited size / box expiry.
      if (type === 'rtu' && parseFloat(vialMl) > 0 && parseFloat(concentration) > 0 && parseFloat(dose) > 0) {
        let expiresOn = null;
        if (vialExpMonth != null && vialExpYear != null) {
          const lastDay = new Date(vialExpYear, vialExpMonth + 1, 0).getDate();
          expiresOn = `${vialExpYear}-${String(vialExpMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        }
        const total = dosesPerVial({ amount: parseFloat(concentration) * parseFloat(vialMl), unit: concentrationUnit, dose, doseUnit }) || 0;
        const existing = vialsByProtocol[editingId];
        if (existing) {
          updateVial(existing.id, { water_ml: parseFloat(vialMl), total_doses: total, expires_on: expiresOn, active: 1 });
        } else {
          insertVial({ user_id: user.id, protocol_id: editingId, water_ml: parseFloat(vialMl), total_doses: total, doses_taken: 0, expires_on: expiresOn });
        }
      }
      setSaving(false);
      // Reschedule from the freshly-persisted row (real user_id/created_at) so
      // the reschedule uses the new time AND correctly skips slots already logged
      // today.
      const editedProtocol = getProtocolById(editingId);
      if (editedProtocol) scheduleDoseReminder(editedProtocol).catch(() => {});
      // Only when the timing moved: clear any banner delivered under the old
      // schedule so it stops "asking" at the previous hour. A rename/color/dose
      // edit leaves a still-pending reminder untouched.
      if (scheduleChanged) dismissDeliveredDoseReminders(editingId).catch(() => {});
    } else {
      // Safety net: never persist beyond the free limit even if the wizard was
      // somehow opened over it (stale count, reopened modal). Checks the live
      // DB count, so the extra protocol is never created — the block happens
      // before insert, not after.
      const activeCount = (getActiveProtocols(user.id) || []).length;
      if (activeCount >= FREE_PROTOCOL_LIMIT && !(await isPremium())) {
        setSaving(false);
        setShowModal(false);
        resetForm();
        promptUpgrade();
        return;
      }
      const freqStr = frequencyLabel(intervalDays);
      const newId = insertProtocol({
        user_id: user.id, name, compound_id: compoundId, type, color,
        amount: parseFloat(amount) || null, unit,
        water: parseFloat(water) || null,
        diluent: resolvedDiluent,
        dose: parseFloat(dose) || null, dose_unit: doseUnit,
        syringe_size: syringeSize,
        concentration: parseFloat(concentration) || null,
        concentration_unit: concentrationUnit,
        frequency: freqStr, reminder_time: reminderTimes.join(','),
        interval_days: intervalDays, doses_per_day: dosesPerDay,
        start_date: toSupabaseDateFromMD(startMonth, startDay),
        schedule_total: null,
        vial_valid_days: parseInt(vialValidDays) || null,
        goal: goals.join(','), notes, note,
        serving_strength: type === 'oral' ? (parseFloat(servingStrength) || null) : null,
        serving_strength_unit: type === 'oral' ? servingStrengthUnit : null,
        serving_units: type === 'oral' ? (parseFloat(servingUnits) || null) : null,
        container_units: type === 'oral' ? (parseFloat(containerUnits) || null) : null,
        divisible: type === 'oral' ? divisible : null,
      });

      if (type === 'recon' && !skipVial) {
        insertVial({
          user_id: user.id, protocol_id: newId,
          mixed_on: toPastSupabaseDate(vialMonth, vialDay),
          water_ml: parseFloat(water) || null,
          // Vial capacity is derived (vial amount ÷ dose), not asked.
          total_doses: dosesPerVial({ amount, unit, dose, doseUnit }),
          doses_taken: 0,
        });
      }

      // Ready-to-use vial: injections = (concentration × ml) ÷ dose; optional
      // expiry from the box (month/year → last day of that month).
      if (type === 'rtu' && parseFloat(vialMl) > 0 && parseFloat(concentration) > 0 && parseFloat(dose) > 0) {
        let expiresOn = null;
        if (vialExpMonth != null && vialExpYear != null) {
          const lastDay = new Date(vialExpYear, vialExpMonth + 1, 0).getDate();
          expiresOn = `${vialExpYear}-${String(vialExpMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        }
        insertVial({
          user_id: user.id, protocol_id: newId,
          water_ml: parseFloat(vialMl),
          total_doses: dosesPerVial({ amount: parseFloat(concentration) * parseFloat(vialMl), unit: concentrationUnit, dose, doseUnit }),
          doses_taken: 0,
          expires_on: expiresOn,
        });
      }
      setSaving(false);
      const protocolData = getProtocolById(newId);
      if (protocolData) scheduleDoseReminder(protocolData).catch(() => {});
      Analytics.protocolCreated({ name, type, dose, dose_unit: doseUnit, frequency: frequencyLabel(intervalDays), goal: goals.join(',') });
    }
    requestSync();
    // Refresh every mounted screen right away (Today, etc.) — don't wait for the
    // network sync to complete, which never fires when offline.
    notifyDataChanged('protocol');
    setShowModal(false);
    resetForm();
    fetchProtocols();
    } catch (err) {
      setSaving(false);
      Alert.alert(t('error'), friendlyError(err, t, 'error_save_failed'));
    }
  }

  // Advance one wizard step, honoring the step-3 dose-safety guard (same rule the
  // old top-right "Next" used). Save has its own guard inside saveProtocol, so the
  // footer's Save can be tapped from any step.
  function goNext() {
    if (step === 3 && doseStepBlocked) {
      Alert.alert(
        t('protocols_check_values_title'),
        unitMismatch ? t('protocols_unit_mismatch') : drawExceedsMsg,
      );
      return;
    }
    if (step < totalSteps) setStep(step + 1);
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
          dismissDeliveredDoseReminders(id).catch(() => {}); // clear any lingering banner
          if (target) Analytics.protocolDeactivated(target);
          fetchProtocols();
          notifyDataChanged('protocol'); // refresh Today immediately
          requestSync();
        },
      },
    ]);
  }


  // Free tier: up to 5 active protocols; premium unlocks unlimited. The gate
  // uses a FRESH DB count (not the possibly-stale `protocols` state) so a rapid
  // second Add right after a save can't slip an extra protocol through.
  function promptUpgrade() {
    Alert.alert(t('protocols_limit_title'), t('protocols_limit_msg'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('protocols_limit_upgrade'), onPress: () => navigation.navigate('Paywall') },
    ]);
  }

  async function isOverFreeLimit() {
    const user = await getCachedUser();
    const count = user ? (getActiveProtocols(user.id) || []).length : protocols.length;
    return count >= FREE_PROTOCOL_LIMIT && !(await isPremium());
  }

  async function openAdd() {
    if (await isOverFreeLimit()) { promptUpgrade(); return; }
    resetForm();
    setShowModal(true);
  }

  const totalSteps = editingId ? 4 : type === 'recon' ? 5 : 4;
  const reconProtocols = protocols.filter(p => p.type === 'recon');
  const rtuProtocols = protocols.filter(p => p.type === 'rtu');
  const oralProtocols = protocols.filter(p => p.type === 'oral');

  // Save an edited note straight from the card (inline), then refresh + sync.
  function saveProtocolNote(id, note) {
    const trimmed = (note || '').trim();
    updateProtocol(id, { note: trimmed ? trimmed : null });
    fetchProtocols();
    requestSync();
  }

  // Reset an oral protocol's supply counter — "opened a new bottle".
  function refillOralBottle(id) {
    updateProtocol(id, { units_taken: 0 });
    fetchProtocols();
    requestSync();
  }

  // Reset an RTU vial's used count — "started a new vial" (same size/expiry).
  function refillVial(id) {
    const v = vialsByProtocol[id];
    if (!v) return;
    updateVial(v.id, { doses_taken: 0, active: 1 });
    fetchProtocols();
    requestSync();
  }

  const renderCard = (p) => (
    <ProtocolCard
      key={p.id} p={p} vial={vialsByProtocol[p.id]}
      expanded={expanded} setExpanded={setExpanded}
      openEdit={openEdit} deleteProtocol={deleteProtocol}
      onSaveNote={saveProtocolNote} onRefill={refillOralBottle} onRefillVial={refillVial}
      t={t}
    />
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t('protocols_title')}</Text>
        <TouchableOpacity style={s.addBtn} onPress={openAdd}>
          <Text style={s.addBtnText}>{t('protocols_add')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={s.scroll}>
        {protocols.length === 0 && !loading && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>🧪</Text>
            <Text style={s.emptyTitle}>{t('protocols_empty_title')}</Text>
            <Text style={s.emptySub}>{t('protocols_empty_sub')}</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={openAdd}>
              <Text style={s.emptyBtnText}>{t('protocols_empty_btn')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {protocols.length > 0 && (
          <View style={s.sortRow}>
            <Text style={s.sortLabel}>{t('protocols_sort_by')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {SORT_OPTIONS.map(o => (
                <TouchableOpacity
                  key={o.key}
                  style={[s.sortPill, sortBy === o.key && s.sortPillOn]}
                  onPress={() => changeSort(o.key)}
                >
                  <Text style={[s.sortPillText, sortBy === o.key && s.sortPillTextOn]}>{t(o.label)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {protocols.length > 0 && sortBy === 'type' && (
          <>
            {reconProtocols.length > 0 && (
              <><Text style={s.sectionLabel}>{t('protocols_section_lyophilized')}</Text>{reconProtocols.map(renderCard)}</>
            )}
            {rtuProtocols.length > 0 && (
              <><Text style={s.sectionLabel}>{t('protocols_section_rtu')}</Text>{rtuProtocols.map(renderCard)}</>
            )}
            {oralProtocols.length > 0 && (
              <><Text style={s.sectionLabel}>{t('protocols_section_oral')}</Text>{oralProtocols.map(renderCard)}</>
            )}
          </>
        )}

        {protocols.length > 0 && sortBy !== 'type' && sortedProtocols().map(renderCard)}


        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          // Android system back (edge-swipe / nav-bar button): step back, or close
          // from the first step — mirrors the header back arrow, so it's reachable
          // without hitting the top of the screen.
          if (step > 1) setStep(step - 1);
          else { setShowModal(false); resetForm(); }
        }}
      >
        <SafeAreaView style={s.modal}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalNav}>
            {step > 1 ? (
              <TouchableOpacity onPress={() => setStep(step - 1)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={s.modalCancel}>{`← ${t('back')}`}</Text>
              </TouchableOpacity>
            ) : <View style={s.modalNavSpacer} />}
            <Text style={s.modalTitle}>{editingId ? t('protocols_edit_protocol') : t('protocols_new_protocol')}</Text>
            <View style={s.modalNavSpacer} />
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
                        setCompoundId(null);
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
                  placeholder={t('protocols_name_placeholder')}
                  placeholderTextColor={colors.textFaint}
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    // Select-first: nothing is committed until the user taps a
                    // suggestion or the "add" row.
                    setName('');
                    setCompoundId(null);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  autoCorrect={false}
                />

                {showSuggestions && (() => {
                  // Blank until the user types — the app never surfaces a compound
                  // unprompted. Matching here is spelling help, not a suggestion.
                  if (searchQuery.trim().length < 2) return null;
                  const sugg = getFilteredSuggestions();
                  const showAdd = !!(searchQuery && searchQuery.trim()) && !queryMatchesExisting();
                  if (sugg.length === 0 && !showAdd) return null;
                  return (
                    <View style={s.suggestionBox}>
                      {sugg.slice(0, 8).map((item) => (
                        <TouchableOpacity
                          key={item.key}
                          style={s.suggestionItem}
                          onPressIn={() => selectCompound(item)}
                        >
                          <Text style={s.suggestionText}>{item.label}</Text>
                        </TouchableOpacity>
                      ))}
                      {sugg.length > 8 && (
                        <Text style={s.suggestionMore}>
                          +{sugg.length - 8} {t('protocols_more_results')}
                        </Text>
                      )}
                      {showAdd && (
                        <TouchableOpacity
                          style={s.suggestionItem}
                          onPressIn={addCustomCompound}
                        >
                          <Text style={[s.suggestionText, { color: colors.accent, fontWeight: '700' }]}>
                            {t('protocols_add_custom').replace('{name}', searchQuery.trim())}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })()}

                <Text style={{ fontSize: 11, color: colors.textFaint, marginTop: 6, lineHeight: 15 }}>
                  {t('protocols_spelling_note')}
                </Text>

                {name && !compoundId ? (
                  <Text style={{ fontSize: 12, color: colors.warningSoftText, marginTop: 6 }}>
                    {t('protocols_custom_hint')}
                  </Text>
                ) : null}
              </View>
            )}

            {step === 2 && (() => {
              // Colors already taken by *other* active protocols (exclude the one
              // being edited so its own color isn't flagged against itself).
              const usedColors = new Set(
                protocols.filter(p => p.id !== editingId && p.color).map(p => p.color)
              );
              return (
              <View>
                <Text style={s.modalStepTitle}>{t('protocols_step_color')}</Text>
                <Text style={s.modalStepSub}>{t('protocols_step_color_sub')}</Text>
                <View style={s.previewPill}>
                  <View style={[s.previewDot, { backgroundColor: color }]} />
                  <View>
                    <Text style={s.previewName}>{name || t('protocols_your_compound')}</Text>
                    <Text style={s.previewSub}>{t(COLOR_NAMES[color])}</Text>
                  </View>
                </View>
                <Text style={s.colorTip}>{t('protocols_color_tip')}</Text>
                <View style={s.colorGrid}>
                  {COLORS.map((c) => {
                    const inUse = usedColors.has(c);
                    return (
                    <TouchableOpacity
                      key={c}
                      style={[s.colorSwatch, { backgroundColor: c }, color === c && s.colorSwatchOn]}
                      onPress={() => setColor(c)}
                    >
                      {color === c
                        ? <Text style={s.colorCheck}>✓</Text>
                        : inUse ? <View style={s.colorInUseDot} /> : null}
                    </TouchableOpacity>
                    );
                  })}
                </View>
                {usedColors.size > 0 && (
                  <Text style={s.colorLegend}>{t('protocols_color_in_use_legend')}</Text>
                )}
                {usedColors.has(color) && (
                  <Text style={s.colorDupWarn}>{t('protocols_color_dup_warning')}</Text>
                )}
              </View>
              );
            })()}

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
                        placeholder={`${t('protocols_eg')} 500`}
                        placeholderTextColor={colors.textFaint}
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
                    {['Capsule', 'Tablet', 'Softgel', 'Gummy'].includes(notes) && (
                      <>
                        <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('protocols_divisible_q')}</Text>
                        <View style={s.freqGrid}>
                          <TouchableOpacity
                            style={[s.freqBtn, divisible === true && s.freqBtnOn]}
                            onPress={() => setDivisible(divisible === true ? null : true)}
                          >
                            <Text style={[s.freqBtnText, divisible === true && s.freqBtnTextOn]}>{t('protocols_divisible_yes')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.freqBtn, divisible === false && s.freqBtnOn]}
                            onPress={() => setDivisible(divisible === false ? null : false)}
                          >
                            <Text style={[s.freqBtnText, divisible === false && s.freqBtnTextOn]}>{t('protocols_divisible_no')}</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                    <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('protocols_serving_strength')}</Text>
                    <Text style={s.fieldHint}>{t('protocols_serving_strength_hint')}</Text>
                    <View style={s.inputRow}>
                      <TextInput
                        style={[s.input, { flex: 1, marginRight: 8, marginBottom: 0 }]}
                        placeholder={`${t('protocols_eg')} 1600`}
                        placeholderTextColor={colors.textFaint}
                        keyboardType="numeric"
                        value={servingStrength}
                        onChangeText={setServingStrength}
                      />
                      <View style={s.unitPicker}>
                        {['mg', 'mcg', 'IU', 'g'].map((u) => (
                          <TouchableOpacity
                            key={u}
                            style={[s.unitBtn, servingStrengthUnit === u && s.unitBtnOn]}
                            onPress={() => setServingStrengthUnit(u)}
                          >
                            <Text style={[s.unitBtnText, servingStrengthUnit === u && s.unitBtnTextOn]}>{u}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('protocols_serving_units')}</Text>
                    <Text style={s.fieldHint}>{t('protocols_serving_units_hint')}</Text>
                    <TextInput
                      style={s.input}
                      placeholder="1"
                      placeholderTextColor={colors.textFaint}
                      keyboardType="numeric"
                      value={servingUnits}
                      onChangeText={setServingUnits}
                    />
                    <Text style={s.fieldLabel}>{t('protocols_container_units')}</Text>
                    <Text style={s.fieldHint}>{t('protocols_container_units_hint')}</Text>
                    <TextInput
                      style={s.input}
                      placeholder={`${t('protocols_eg')} 60`}
                      placeholderTextColor={colors.textFaint}
                      keyboardType="numeric"
                      value={containerUnits}
                      onChangeText={setContainerUnits}
                    />
                  </>
                )}

                {type === 'recon' && (
                  <>
                    <Text style={s.fieldLabel}>{t('protocols_compound_amount')}</Text>
                    <View style={s.inputRow}>
                      <TextInput
                        style={[s.input, { flex: 1, marginRight: 8, marginBottom: 0 }]}
                        placeholder={`${t('protocols_eg')} 5`}
                        placeholderTextColor={colors.textFaint}
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
                    <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('protocols_diluent')}</Text>
                    <View style={s.freqGrid}>
                      {DILUENT_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt.val}
                          style={[s.freqBtn, diluentChoice === opt.val && s.freqBtnOn]}
                          onPress={() => setDiluentChoice(diluentChoice === opt.val ? '' : opt.val)}
                        >
                          <Text style={[s.freqBtnText, diluentChoice === opt.val && s.freqBtnTextOn]}>
                            {t(opt.key)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {diluentChoice === 'other' && (
                      <TextInput
                        style={[s.input, { marginTop: 8 }]}
                        placeholder={t('protocols_diluent_other_placeholder')}
                        placeholderTextColor={colors.textFaint}
                        value={diluentOther}
                        onChangeText={setDiluentOther}
                      />
                    )}
                    <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('protocols_diluent_amount')}</Text>
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
                        placeholder={`${t('protocols_eg')} 0.5`}
                        placeholderTextColor={colors.textFaint}
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
                    {/* IU → mass converter. A trainer's protocol often reads
                        "10 IU" (syringe units) while the peptide is measured in mg.
                        Given the concentration (amount ÷ diluent) this shows the
                        real mass and can fill the dose — pure conversion, stored as
                        mass so all downstream math is unchanged. */}
                    {['mg', 'mcg'].includes(unit) && parseFloat(amount) > 0 && parseFloat(water) > 0 && (() => {
                      // Normalize the peptide amount to mg so the concentration is
                      // correct even when the vial is labeled in mcg.
                      const amountMg = unit === 'mcg' ? parseFloat(amount) / 1000 : parseFloat(amount);
                      const iuMassMg = massFromUnits(iuInput, amountMg, water);
                      const parts = iuMassMg != null ? massParts(iuMassMg) : null;
                      return (
                        <View style={s.iuConverter}>
                          <Text style={s.iuConverterLabel}>{t('protocols_iu_label')}</Text>
                          <Text style={s.iuConverterHint}>{t('protocols_iu_hint')}</Text>
                          <View style={s.inputRow}>
                            <TextInput
                              style={[s.input, { flex: 1, marginRight: 8, marginBottom: 0 }]}
                              placeholder={`${t('protocols_eg')} 10`}
                              placeholderTextColor={colors.textFaint}
                              keyboardType="numeric"
                              value={iuInput}
                              onChangeText={setIuInput}
                            />
                            <View style={s.iuUnitTag}><Text style={s.iuUnitTagText}>IU</Text></View>
                          </View>
                          {parts && (
                            <View style={s.iuEquivBox}>
                              <Text style={s.iuEquivText}>{`${iuInput} IU = ${parts.mcg} mcg (${parts.mg} mg)`}</Text>
                              <TouchableOpacity
                                style={s.iuUseBtn}
                                onPress={() => {
                                  if (iuMassMg < 1) { setDose(parts.mcg); setDoseUnit('mcg'); }
                                  else { setDose(parts.mg); setDoseUnit('mg'); }
                                }}
                              >
                                <Text style={s.iuUseBtnText}>{t('protocols_iu_use')}</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })()}
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
                      <View style={[s.calcResult, { backgroundColor: colors.warningSoft }]}>
                        <Text style={[s.calcResultText, { color: colors.warningSoftText }]}>
                          {t('protocols_unit_mismatch')}
                        </Text>
                      </View>
                    )}
                    {drawExceedsSyringe && !unitMismatch && (
                      <View style={[s.calcResult, { backgroundColor: colors.dangerSoft }]}>
                        <Text style={[s.calcResultText, { color: colors.dangerSoftText, fontWeight: '700' }]}>
                          {drawExceedsMsg}
                        </Text>
                      </View>
                    )}
                    {drawML && drawValid && !drawExceedsSyringe && !unitMismatch && (
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
                        placeholder={`${t('protocols_eg')} 100`}
                        placeholderTextColor={colors.textFaint}
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
                        placeholder={`${t('protocols_eg')} 200`}
                        placeholderTextColor={colors.textFaint}
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
                      <View style={[s.calcResult, { backgroundColor: colors.warningSoft, marginTop: 10 }]}>
                        <Text style={[s.calcResultText, { color: colors.warningSoftText }]}>
                          {t('protocols_unit_mismatch')}
                        </Text>
                      </View>
                    )}
                    <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('protocols_vial_size')}</Text>
                    <Text style={s.fieldHint}>{t('protocols_vial_size_hint')}</Text>
                    <TextInput
                      style={s.input}
                      placeholder={`${t('protocols_eg')} 10`}
                      placeholderTextColor={colors.textFaint}
                      keyboardType="numeric"
                      value={vialMl}
                      onChangeText={setVialMl}
                    />
                    <Text style={s.fieldLabel}>{t('protocols_vial_expiry')}</Text>
                    <Text style={s.fieldHint}>{t('protocols_vial_expiry_hint')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.monthScroll}>
                      <View style={s.monthRow}>
                        {MONTH_KEYS.map((mk, idx) => (
                          <TouchableOpacity
                            key={mk}
                            style={[s.monthPill, vialExpMonth === idx && s.monthPillOn]}
                            onPress={() => setVialExpMonth(vialExpMonth === idx ? null : idx)}
                          >
                            <Text style={[s.monthPillText, vialExpMonth === idx && s.monthPillTextOn]}>{t(mk)}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                      <View style={s.monthRow}>
                        {[0, 1, 2, 3, 4, 5].map((o) => {
                          const y = new Date().getFullYear() + o;
                          return (
                            <TouchableOpacity
                              key={y}
                              style={[s.monthPill, vialExpYear === y && s.monthPillOn]}
                              onPress={() => setVialExpYear(vialExpYear === y ? null : y)}
                            >
                              <Text style={[s.monthPillText, vialExpYear === y && s.monthPillTextOn]}>{y}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </>
                )}
              </View>
            )}

            {step === 4 && (
              <View>
                <Text style={s.modalStepTitle}>{t('protocols_step_schedule')}</Text>
                <Text style={s.modalStepSub}>{t('protocols_step_schedule_sub')}</Text>

                {/* 1 — First dose: quick pick, then custom date below */}
                <Text style={s.fieldLabel}>{t('protocols_first_dose')}</Text>
                <View style={s.freqGrid}>
                  {[
                    { offset: 0, key: 'protocols_start_today' },
                    { offset: 1, key: 'protocols_start_tomorrow' },
                  ].map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      style={[s.freqBtn, isStartOn(opt.offset) && s.freqBtnOn]}
                      onPress={() => setStartOffset(opt.offset)}
                    >
                      <Text style={[s.freqBtnText, isStartOn(opt.offset) && s.freqBtnTextOn]}>
                        {t(opt.key)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {isStartOn(0) && dosesPerDay > 1 && (
                  <View style={[s.infoBox, { marginBottom: 12 }]}>
                    <Text style={s.infoText}>{t('protocols_first_dose_hint')}</Text>
                  </View>
                )}

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
                  placeholder={t('protocols_day_dd')}
                  placeholderTextColor={colors.textFaint}
                  keyboardType="numeric"
                  maxLength={2}
                  value={startDay}
                  onChangeText={(val) => {
                    const num = parseInt(val);
                    if (val === '' || (num >= 1 && num <= 31)) setStartDay(val);
                  }}
                />

                {/* 2 — Interval: every X days (presets + typed custom for long TRT intervals) */}
                <Text style={s.fieldLabel}>{t('protocols_how_often')}</Text>
                <View style={s.freqGrid}>
                  {[1, 2, 3, 4, 5, 6, 7, 10, 14].map((d) => {
                    const on = !customIntervalOpen && intervalDays === d;
                    return (
                      <TouchableOpacity
                        key={d}
                        style={[s.freqBtn, on && s.freqBtnOn]}
                        onPress={() => { setCustomIntervalOpen(false); handleIntervalChange(d); }}
                      >
                        <Text style={[s.freqBtnText, on && s.freqBtnTextOn]}>
                          {d === 1 ? t('protocols_every_day') : t('protocols_every_x_days').replace('{x}', d)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {(() => {
                    const on = customIntervalOpen || ![1, 2, 3, 4, 5, 6, 7, 10, 14].includes(intervalDays);
                    return (
                      <TouchableOpacity
                        style={[s.freqBtn, on && s.freqBtnOn]}
                        onPress={() => { setCustomIntervalText(String(intervalDays)); setCustomIntervalOpen(true); }}
                      >
                        <Text style={[s.freqBtnText, on && s.freqBtnTextOn]}>{t('protocols_custom')}</Text>
                      </TouchableOpacity>
                    );
                  })()}
                </View>
                {(customIntervalOpen || ![1, 2, 3, 4, 5, 6, 7, 10, 14].includes(intervalDays)) && (
                  <View style={s.customIntervalRow}>
                    <Text style={s.customIntervalEvery}>{t('protocols_every_word')}</Text>
                    <TextInput
                      style={s.customIntervalInput}
                      keyboardType="number-pad"
                      maxLength={3}
                      value={customIntervalText}
                      placeholder="14"
                      placeholderTextColor={colors.textFaint}
                      onChangeText={(v) => {
                        const digits = v.replace(/[^0-9]/g, '');
                        setCustomIntervalText(digits);
                        const n = parseInt(digits, 10);
                        if (Number.isFinite(n) && n > 0) handleIntervalChange(n);
                      }}
                    />
                    <Text style={s.customIntervalEvery}>{t('protocols_days_word')}</Text>
                  </View>
                )}

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

                {/* Wellness goals */}
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

                {/* Free-text note — available on every protocol type */}
                <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('protocols_notes_optional')}</Text>
                <TextInput
                  style={[s.input, { height: 80 }]}
                  placeholder={type === 'oral' ? t('protocols_notes_placeholder_oral') : t('protocols_notes_placeholder')}
                  placeholderTextColor={colors.textFaint}
                  multiline
                  value={note}
                  onChangeText={setNote}
                />
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
                      placeholder={t('protocols_day_dd')}
                      placeholderTextColor={colors.textFaint}
                      keyboardType="numeric"
                      maxLength={2}
                      value={vialDay}
                      onChangeText={(val) => {
                        const num = parseInt(val);
                        if (val === '' || (num >= 1 && num <= 31)) setVialDay(val);
                      }}
                    />
                    <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('protocols_vial_valid')}</Text>
                    <TextInput
                      style={[s.input, { width: 100, textAlign: 'center' }]}
                      placeholder={String(DEFAULT_VALID_DAYS)}
                      placeholderTextColor={colors.textFaint}
                      keyboardType="numeric"
                      maxLength={3}
                      value={vialValidDays}
                      onChangeText={(val) => { if (val === '' || /^\d+$/.test(val)) setVialValidDays(val); }}
                    />
                    <Text style={s.stepperHint}>{t('protocols_vial_valid_hint')}</Text>
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
                    ...(drawML && drawValid ? [[t('protocols_draw_label'), `${drawML} ml (${drawUnits} ${t('protocols_units')})`]] : []),
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

          {/* Bottom action bar — always visible, thumb-reachable on every step.
              Cancel closes instantly; Save commits from any step (during an edit
              all fields are loaded, so one changed field = one tap to Save). */}
          <View style={s.modalFooter}>
            <TouchableOpacity
              style={s.footerCancel}
              onPress={() => { setShowModal(false); resetForm(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={s.footerCancelText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <View style={s.footerRight}>
              {step < totalSteps && (
                <TouchableOpacity style={s.footerNext} onPress={goNext}>
                  <Text style={[s.footerNextText, step === 3 && doseStepBlocked && s.footerDisabledText]}>
                    {t('next')} →
                  </Text>
                </TouchableOpacity>
              )}
              {(editingId || step === totalSteps) && (
                <TouchableOpacity style={s.footerSave} onPress={saveProtocol} disabled={saving}>
                  <Text style={s.footerSaveText}>{saving ? t('protocols_saving') : t('save')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 20, backgroundColor: c.card },
  headerTitle: { fontSize: 24, fontWeight: '700', color: c.text },
  addBtn: { backgroundColor: c.accent, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  addBtnText: { color: c.accentText, fontSize: 13, fontWeight: '600' },
  scroll: { flex: 1, padding: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: c.textFaint, letterSpacing: 0.5, marginBottom: 10, marginTop: 8 },
  sortRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  sortLabel: { fontSize: 12, fontWeight: '600', color: c.textMuted },
  sortPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: c.card2, borderWidth: 0.5, borderColor: c.border, marginRight: 8 },
  sortPillOn: { backgroundColor: c.accent, borderColor: c.accent },
  sortPillText: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
  sortPillTextOn: { color: c.accentText, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: c.text, marginBottom: 8 },
  emptySub: { fontSize: 13, color: c.textMuted, textAlign: 'center', marginBottom: 24 },
  emptyBtn: { backgroundColor: c.accent, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12 },
  emptyBtnText: { color: c.accentText, fontSize: 14, fontWeight: '600' },
  card: { backgroundColor: c.card, borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  cardDot: { width: 10, height: 10, borderRadius: 5 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: '600', color: c.text },
  cardMeta: { fontSize: 11, color: c.textMuted, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '500' },
  badgeGoal: { backgroundColor: c.warningSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeGoalText: { fontSize: 10, color: c.warningSoftText, fontWeight: '500' },
  chevron: { fontSize: 11, color: c.textFaint },
  cardBody: { borderTopWidth: 0.5, borderTopColor: c.border, padding: 14 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: c.border },
  detailLabel: { fontSize: 12, color: c.textMuted },
  detailVal: { fontSize: 12, fontWeight: '500', color: c.text },
  noteBlock: { paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: c.border },
  noteEditBox: { marginTop: 6, minHeight: 56, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: c.text, backgroundColor: c.card2, textAlignVertical: 'top' },
  noteEditActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 8, gap: 16 },
  noteCancelText: { fontSize: 13, color: c.textMuted, fontWeight: '500' },
  noteSaveBtn: { backgroundColor: c.accent, paddingVertical: 7, paddingHorizontal: 18, borderRadius: 8 },
  noteSaveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, padding: 8, borderRadius: 8, borderWidth: 0.5, borderColor: c.border, alignItems: 'center' },
  actionBtnText: { fontSize: 12, color: c.textMuted },
  actionBtnDanger: { borderColor: c.danger },
  actionBtnDangerText: { fontSize: 12, color: c.danger },
  syringeWrap: { backgroundColor: c.accentSoft, borderRadius: 12, padding: 14, marginTop: 12, marginBottom: 4 },
  syringeTitle: { fontSize: 12, fontWeight: '600', color: c.accentSoftText, marginBottom: 4 },
  syringeSubtitle: { fontSize: 13, color: c.accent, marginBottom: 12 },
  syringeNoData: { fontSize: 12, color: c.textMuted, lineHeight: 18 },
  syringeOuter: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  syringeBody: { flex: 1, height: 48 },
  syringeTicks: { height: 22, marginBottom: 2, position: 'relative' },
  // Fixed width + negative half-margin centers the tick/label exactly on `left`.
  // (A width:0 box collapses Text labels, so give it real width.)
  tickGroup: { position: 'absolute', bottom: 0, width: 28, marginLeft: -14, alignItems: 'center' },
  tick: { width: 1, height: 6, backgroundColor: c.textFaint },
  tickMajor: { height: 10, backgroundColor: c.textMuted, width: 1.5 },
  tickLabel: { fontSize: 8, color: c.textMuted, marginBottom: 1 },
  syringeTrack: { height: 22, backgroundColor: c.card2, borderRadius: 4, overflow: 'hidden', position: 'relative', borderWidth: 1, borderColor: c.border },
  syringeFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: c.accent, opacity: 0.35, borderRadius: 3 },
  plungerLine: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: c.accent, borderRadius: 2 },
  syringeNeedle: { width: 24, height: 4, backgroundColor: c.textFaint, borderRadius: 2, marginLeft: 2 },
  syringeInfo: { flexDirection: 'row', justifyContent: 'space-between' },
  syringeInfoItem: { alignItems: 'center' },
  syringeInfoLabel: { fontSize: 9, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  syringeInfoVal: { fontSize: 13, fontWeight: '600', color: c.accentSoftText, marginTop: 2 },
  syringeInfoAlt: { fontSize: 10, color: c.textMuted, marginTop: 1 },
  syringeDisclaimer: { fontSize: 9, color: c.textFaint, marginTop: 10, textAlign: 'center', lineHeight: 13 },
  syringeZoomHint: { fontSize: 10, color: c.accent, textAlign: 'center', marginTop: 2, marginBottom: 2 },
  // Zoom modal
  zoomBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  zoomCard: { backgroundColor: c.card, borderRadius: 16, padding: 18, width: '100%', maxWidth: 560 },
  zoomTitle: { fontSize: 16, fontWeight: '700', color: c.text, textAlign: 'center' },
  zoomReadout: { fontSize: 15, color: c.textMuted, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  zoomScroll: { flexGrow: 0 },
  zoomTicks: { height: 48, position: 'relative', marginBottom: 0 },
  zoomTickGroup: { position: 'absolute', bottom: 0, width: 36, marginLeft: -18, alignItems: 'center' },
  zoomTick: { width: 1.5, height: 16, backgroundColor: c.textMuted },
  zoomTickMajor: { width: 2, height: 30, backgroundColor: c.text },
  zoomTickLabel: { fontSize: 13, fontWeight: '600', color: c.text, marginBottom: 3 },
  zoomBarrel: { height: 34, backgroundColor: c.card2, borderWidth: 1, borderColor: c.border, borderRadius: 6, position: 'relative', overflow: 'visible' },
  zoomFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: c.accent, opacity: 0.32, borderTopLeftRadius: 5, borderBottomLeftRadius: 5 },
  zoomPlunger: { position: 'absolute', top: -4, bottom: -4, width: 4, marginLeft: -2, backgroundColor: c.accent, borderRadius: 2 },
  zoomClose: { marginTop: 18, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 32, backgroundColor: c.accent, borderRadius: 10 },
  zoomCloseText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modal: { flex: 1, backgroundColor: c.card },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: c.border },
  modalCancel: { fontSize: 14, color: c.textMuted },
  modalNavSpacer: { width: 64 },
  modalTitle: { fontSize: 15, fontWeight: '600', color: c.text },
  modalSave: { fontSize: 14, color: c.accent, fontWeight: '600' },
  modalSaveDisabled: { color: c.danger },
  modalFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 12 : 16, borderTopWidth: 0.5, borderTopColor: c.border, backgroundColor: c.card },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerCancel: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10 },
  footerCancelText: { fontSize: 15, color: c.textMuted, fontWeight: '600' },
  footerNext: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: c.accent },
  footerNextText: { fontSize: 15, color: c.accent, fontWeight: '600' },
  footerDisabledText: { color: c.danger },
  footerSave: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, backgroundColor: c.accent },
  footerSaveText: { fontSize: 15, color: '#fff', fontWeight: '700' },
  modalProgress: { flexDirection: 'row', gap: 4, paddingHorizontal: 20, paddingVertical: 12 },
  modalProgSeg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: c.border },
  modalProgDone: { backgroundColor: c.accent },
  modalBody: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  modalStepTitle: { fontSize: 20, fontWeight: '600', color: c.text, marginBottom: 6, marginTop: 8 },
  modalStepSub: { fontSize: 13, color: c.textMuted, marginBottom: 20 },
  fieldLabel: { fontSize: 11, color: c.textMuted, marginBottom: 6 },
  servingNearest: { fontSize: 11, color: c.textMuted, textAlign: 'center', marginTop: 8 },
  newBottleBtn: { alignSelf: 'center', marginTop: 12, paddingVertical: 7, paddingHorizontal: 18, borderRadius: 8, borderWidth: 1, borderColor: c.accent },
  newBottleText: { fontSize: 12, fontWeight: '600', color: c.accent },
  fieldHint: { fontSize: 11, color: c.textFaint, marginTop: 4, marginBottom: 12 },
  doseTimeLabel: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginTop: 8, marginBottom: 2 },
  input: { borderWidth: 0.5, borderColor: c.border, borderRadius: 10, padding: 12, fontSize: 13, color: c.text, backgroundColor: c.card2, marginBottom: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  unitPicker: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  unitBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 0.5, borderColor: c.border, backgroundColor: c.card2 },
  unitBtnOn: { backgroundColor: c.accent, borderColor: c.accent },
  unitBtnText: { fontSize: 12, color: c.textMuted },
  unitBtnTextOn: { color: c.accentText, fontWeight: '600' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  stepperBtn: { width: 48, height: 48, borderRadius: 10, borderWidth: 0.5, borderColor: c.border, backgroundColor: c.card2, alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: { fontSize: 24, color: c.accent, fontWeight: '400' },
  stepperVal: { flex: 1, backgroundColor: c.accentSoft, borderRadius: 10, padding: 12, alignItems: 'center' },
  stepperValText: { fontSize: 20, fontWeight: '600', color: c.accentSoftText },
  stepperHoldHint: { fontSize: 10, color: c.accent, marginTop: 2 },
  stepperHint: { fontSize: 10, color: c.textFaint, marginBottom: 8 },
  calcResult: { backgroundColor: c.accentSoft, borderRadius: 8, padding: 12, marginTop: 12, marginBottom: 4 },
  calcResultText: { fontSize: 13, color: c.accentSoftText, fontWeight: '500' },
  iuConverter: { marginTop: 14, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.card2 },
  iuConverterLabel: { fontSize: 13, fontWeight: '600', color: c.text, marginBottom: 2 },
  iuConverterHint: { fontSize: 11, color: c.textMuted, marginBottom: 10 },
  iuUnitTag: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, backgroundColor: c.accentSoft },
  iuUnitTagText: { fontSize: 13, fontWeight: '700', color: c.accentSoftText },
  iuEquivBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 10 },
  iuEquivText: { flex: 1, fontSize: 14, fontWeight: '700', color: c.text },
  iuUseBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: c.accent },
  iuUseBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  calcDisclaimer: { fontSize: 10, color: c.textMuted, marginTop: 6, lineHeight: 14 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  typeBtn: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 0.5, borderColor: c.border, backgroundColor: c.card2, alignItems: 'center' },
  typeBtnOn: { borderWidth: 2, borderColor: c.accent, backgroundColor: c.accentSoft },
  typeEmoji: { fontSize: 20, marginBottom: 4 },
  typeBtnLabel: { fontSize: 11, fontWeight: '600', color: c.textMuted },
  typeBtnLabelOn: { color: c.accentSoftText },
  typeBtnSub: { fontSize: 9, color: c.textFaint, marginTop: 1 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  colorSwatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  colorSwatchOn: { borderWidth: 3, borderColor: c.text },
  colorCheck: { color: 'white', fontSize: 16, fontWeight: '700' },
  colorInUseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.28)' },
  colorTip: { fontSize: 12.5, color: c.textMuted, lineHeight: 18, marginBottom: 14 },
  colorLegend: { fontSize: 12, color: c.textFaint, marginBottom: 4 },
  colorDupWarn: { fontSize: 12.5, color: c.warningSoftText, backgroundColor: c.warningSoft, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginTop: 6 },
  previewPill: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.card2, borderRadius: 10, padding: 12, marginBottom: 20 },
  previewDot: { width: 14, height: 14, borderRadius: 7 },
  previewName: { fontSize: 14, fontWeight: '600', color: c.text },
  previewSub: { fontSize: 11, color: c.textMuted },
  freqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  freqBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 0.5, borderColor: c.border, backgroundColor: c.card2 },
  freqBtnOn: { borderWidth: 2, borderColor: c.accent, backgroundColor: c.accentSoft },
  customIntervalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -4, marginBottom: 16 },
  customIntervalEvery: { fontSize: 14, color: c.text },
  customIntervalInput: { borderWidth: 0.5, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontWeight: '700', color: c.text, backgroundColor: c.card2, width: 72, textAlign: 'center' },
  freqBtnText: { fontSize: 12, color: c.textMuted },
  freqBtnTextOn: { color: c.accentSoftText, fontWeight: '600' },
  dateBtn: { backgroundColor: c.card2, borderWidth: 0.5, borderColor: c.border, borderRadius: 10, padding: 14, marginBottom: 14 },
  dateBtnText: { fontSize: 14, color: c.text },
  monthScroll: { marginBottom: 4 },
  monthRow: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  monthPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: c.card2, borderWidth: 0.5, borderColor: c.border },
  monthPillOn: { backgroundColor: c.accent, borderColor: c.accent },
  monthPillText: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
  monthPillTextOn: { color: c.accentText, fontWeight: '600' },
  doneBtn: { backgroundColor: c.accent, padding: 12, borderRadius: 10, alignItems: 'center', marginBottom: 14 },
  doneBtnText: { color: c.accentText, fontSize: 14, fontWeight: '600' },
  skipVialBtn: { alignItems: 'center', paddingVertical: 12, marginBottom: 16 },
  skipVialBtnText: { fontSize: 13, color: c.accent },
  skippedBox: { backgroundColor: c.card2, borderRadius: 10, padding: 14, marginBottom: 16, alignItems: 'center' },
  skippedText: { fontSize: 13, color: c.textMuted, textAlign: 'center', marginBottom: 10, lineHeight: 20 },
  infoBox: { backgroundColor: c.accentSoft, borderRadius: 10, padding: 12, marginBottom: 16 },
  infoText: { fontSize: 12, color: c.accentSoftText, lineHeight: 18 },
  reviewCard: { backgroundColor: c.card2, borderRadius: 12, padding: 14, marginTop: 8 },
  reviewTitle: { fontSize: 11, fontWeight: '600', color: c.textFaint, letterSpacing: 0.5, marginBottom: 10 },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: c.border },
  reviewLabel: { fontSize: 12, color: c.textMuted },
  reviewVal: { fontSize: 12, fontWeight: '500', color: c.text },
  suggestionBox: { backgroundColor: c.card, borderRadius: 10, borderWidth: 0.5, borderColor: c.border, marginBottom: 14 },
  suggestionItem: { padding: 12, borderBottomWidth: 0.5, borderBottomColor: c.border },
  suggestionText: { fontSize: 13, color: c.text },
  suggestionMore: { fontSize: 11, color: c.textFaint, padding: 10, textAlign: 'center' },
});