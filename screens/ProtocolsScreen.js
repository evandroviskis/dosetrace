import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  Platform,
  Keyboard,
  Linking,
  KeyboardAvoidingView,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { MONO } from '../lib/fonts';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getCachedUser, supabase } from '../lib/supabase';
import { hasPremium } from '../lib/entitlement';
import { hasAIConsent, grantAIConsent, AI_PRIVACY_URL } from '../lib/aiConsent';
import { hasNativeModule } from '../lib/nativeModule';
import { quotaLimitFrom, fillQuotaMessage } from '../lib/scanQuotaMessage';
import { useLanguage } from '../i18n/LanguageContext';
import { Analytics } from '../lib/analytics';
import { scheduleDoseReminder, cancelDoseReminder, dismissDeliveredDoseReminders } from '../lib/notifications';
import { formatTime } from '../lib/timeFormat';
import { friendlyError } from '../lib/friendlyError';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getActiveProtocols, insertProtocol, updateProtocol,
  softDeleteProtocol, getProtocolById, getActiveVials,
  insertVial, deactivateVialsByProtocol, updateVial, getAllLogs,
  getDeletedProtocols, restoreProtocol as restoreProtocolDB, getNewestVialForProtocol,
  permanentlyDeleteProtocol,
} from '../lib/database';
import { requestSync, notifyDataChanged } from '../lib/sync';
import { unitsCompatible, computeDraw, dosesPerVial, massFromUnits, massParts, parseDecimal } from '../lib/doseMath';
import { supplyState } from '../lib/supplyLow';
import { computeServings, supplyDaysLeft } from '../lib/oralMath';
import { matchesQuery, blendComposition, BLEND_IDS } from '../lib/compounds';
import { expectedDosesOn, nextDueDate, frequencyLabelFor, elapsedDoseSlots } from '../lib/schedule';
import { backfillTakenDoses } from '../lib/doseActions';
import { DEFAULT_VALID_DAYS, daysUntilExpiry } from '../lib/vialExpiry';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import FeatureIcon from '../components/FeatureIcon';
import SegmentedBar from '../components/SegmentedBar';
import FeatureExplainerGate from '../components/FeatureExplainerGate';
import SyringeScale from './components/SyringeScale';
import { DTSheet, DTActionSheet, DTPickerSheet, DTWheel, VialCells, SyringeRuler, StepGlyph, RULER, rulerX } from './components/ProtocolParts';
import { dateColumns, dateAfter, timeColumns, timeAfter } from '../lib/wheelPick';
import RowChevron from '../components/RowChevron';
import FoldChevron from '../components/FoldChevron';
import CheckMark from '../components/CheckMark';
import { lastCompleteLog, lastLogWhen } from '../lib/protocolsHero';
import BookPanes, { useBook, useBookSelection } from '../components/BookPanes';
import { defaultSelection } from '../lib/bookLayout';
import { getSelection, clearSelection } from '../lib/bookSelection';
import { getDraft, setDraft, clearDraft } from '../lib/draftStore';
import { PALETTE, DEFAULT_PROTOCOL_COLOR, displayColor, sameColor, colorNameKey } from '../lib/protocolColors';
import {
  isoDay, firstDoseChoice, timeRounded5, newProtocolForm, formFromProtocol,
  editPatch, rtuVialFields, rtuVialPatch, hasNewProtocolInput, nameOnNext,
} from '../lib/protocolForm';

const LOCALE_MAP = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };

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

const LYOPHILIZED_KEYS = ['lyo_5_amino_1mq','lyo_alpha_endorphin','lyo_alpha_msh','lyo_gamma_endorphin','lyo_ac_epithalon','lyo_ace_031','lyo_adamax','lyo_adipotide','lyo_aicar','lyo_albiglutide','lyo_aod_9604','lyo_ara_290','lyo_bpc_157','lyo_cagrilintide','lyo_cecropin_b','lyo_cerebrolysin','lyo_cetrorelix_acetate','lyo_cjc_1295_with_dac','lyo_cjc_1295_without_dac','lyo_cortexin','lyo_dermorphin','lyo_dihexa','lyo_dsip','lyo_dulaglutide','lyo_eloralintide','lyo_epithalon','lyo_epo','lyo_exenatide','lyo_follistatin_344','lyo_foxo4_dri','lyo_fsh','lyo_gdf_8','lyo_ghk_cu','lyo_ghrelin','lyo_ghrp_2','lyo_ghrp_6','lyo_glutathione','lyo_gonadorelin','lyo_gts_21','lyo_hcg','lyo_hexarelin','lyo_hgh','lyo_hgh_fragment_176_191','lyo_hmg','lyo_humanin','lyo_hyaluronic_acid','lyo_igf_1_des','lyo_igf_1_lr3','lyo_ipamorelin','lyo_kisspeptin_10','lyo_kisspeptin_13','lyo_kpv','lyo_lc120','lyo_lc216','lyo_liraglutide','lyo_lixisenatide','lyo_ll_37','lyo_mazdutide','lyo_melanotan_1','lyo_melanotan_2','lyo_melatonin','lyo_mgf','lyo_mog_35_55','lyo_mots_c','lyo_myostatin','lyo_n_acetyl_selank_amidate','lyo_n_acetyl_semax_amidate','lyo_n_acetyl_epitalon_amidate','lyo_nad_plus','lyo_octreotide','lyo_orexin_a','lyo_oxytocin','lyo_p21','lyo_pe_22_28','lyo_peg_mgf','lyo_pentadeca_arginate','lyo_peptide_t','lyo_pinealon','lyo_pt_141','lyo_retatrutide','lyo_rgd_peptide','lyo_selank','lyo_semaglutide','lyo_semax','lyo_sermorelin','lyo_snap_8','lyo_ss_31','lyo_survodutide','lyo_tb_500','lyo_tesamorelin','lyo_tesofensine','lyo_thymalin','lyo_thymosin_alpha_1','lyo_thymosin_beta_4','lyo_thymulin','lyo_tirzepatide','lyo_triptorelin','lyo_vip','lyo_glow','lyo_klow','lyo_wolverine'];

const RTU_KEYS = ['rtu_boldenone_undecylenate','rtu_cyanocobalamin','rtu_drostanolone_enanthate','rtu_drostanolone_propionate','rtu_dulaglutide','rtu_estradiol_cypionate','rtu_estradiol_valerate','rtu_hydroxocobalamin','rtu_insulin_aspart','rtu_insulin_degludec','rtu_insulin_glargine','rtu_insulin_lispro','rtu_l_carnitine','rtu_lipo_c','rtu_liraglutide','rtu_methenolone_enanthate','rtu_methylcobalamin','rtu_mic_blend','rtu_nandrolone_decanoate','rtu_nandrolone_phenylpropionate','rtu_progesterone','rtu_pyridoxine','rtu_semaglutide','rtu_stanozolol','rtu_sustanon_250','rtu_testosterone_cypionate','rtu_testosterone_enanthate','rtu_testosterone_propionate','rtu_testosterone_suspension','rtu_testosterone_undecanoate','rtu_tirzepatide','rtu_trenbolone_acetate','rtu_trenbolone_enanthate','rtu_trenbolone_hexahydrobenzylcarbonate'];

function currentTimeRounded5() {
  return timeRounded5(new Date());
}

const ORAL_KEYS = ['oral_alpha_gpc','oral_ala','oral_ashwagandha','oral_astragalus','oral_bacopa','oral_berberine','oral_beta_alanine','oral_citrulline','oral_coq10','oral_creatine','oral_curcumin','oral_gaba','oral_grape_seed','oral_krill_oil','oral_carnitine','oral_glutamine','oral_theanine','oral_tyrosine','oral_lions_mane','oral_maca','oral_mag_bisglycinate','oral_mag_threonate','oral_melatonin','oral_milk_thistle','oral_nac','oral_nmn','oral_nr','oral_omega3','oral_probiotics','oral_red_yeast','oral_resveratrol','oral_rhodiola','oral_saw_palmetto','oral_taurine','oral_tudca','oral_vit_b','oral_vit_c','oral_vit_d3','oral_vit_k2','oral_zinc'];

const WELLNESS_KEYS_INJECTABLE = ['wt_anabolic','wt_antioxidant','wt_appetite','wt_athletic','wt_body_comp','wt_circadian','wt_cognitive','wt_hormonal_wellness','wt_energy','wt_metabolic_wellness','wt_gut','wt_hormone_balance','wt_recovery_support','wt_joint','wt_libido','wt_longevity','wt_metabolic','wt_cellular_energy','wt_mood','wt_muscle','wt_endurance','wt_rest','wt_sexual','wt_skin','wt_sleep_opt','wt_strength','wt_stress','wt_tissue','wt_vitality','wt_weight'];

const WELLNESS_KEYS_ORAL = ['wt_antioxidant_def','wt_atp','wt_heart_wellness','wt_neuro_wellness','wt_cognitive_vit','wt_electrolyte','wt_digestive_wellness','wt_blood_sugar_wellness','wt_liver_wellness','wt_stress_adaptation','wt_immune','wt_joint_health','wt_mental','wt_cellular_opt','wt_kidney_wellness','wt_sleep_quality','wt_stress_mgmt'];

// Free tier: max active protocols before Premium is required. If you change
// this, update the copy in protocols_limit_msg + paywall_free_feat_3.
const FREE_PROTOCOL_LIMIT = 3;

const MONTH_KEYS = [
  'month_jan', 'month_feb', 'month_mar', 'month_apr',
  'month_may', 'month_jun', 'month_jul', 'month_aug',
  'month_sep', 'month_oct', 'month_nov', 'month_dec',
];

// Diluent options for reconstitution. Stored as canonical tokens so the label
// renders in any language; 'other' lets the user record their own free text.
const DILUENT_OPTIONS = [
  { val: 'bacteriostatic_water', key: 'protocols_diluent_bac' },
  { val: 'sterile_water', key: 'protocols_diluent_sterile' },
  { val: 'sodium_chloride_09', key: 'protocols_diluent_nacl' },
  { val: 'other', key: 'protocols_diluent_other' },
];

// Resolve a stored diluent value to a display label: known token → translated,
// otherwise the user's own free text as entered.
function diluentLabel(val, t) {
  if (!val) return '—';
  const opt = DILUENT_OPTIONS.find(o => o.val === val && o.val !== 'other');
  return opt ? t(opt.key) : val;
}

// Trim a computed number to a clean display value (20, not 20.00; 2.5 stays 2.5).
function trimNum(n) {
  if (!isFinite(n)) return null;
  return Number.isInteger(n) ? n : Number(n.toFixed(2));
}

// Collapsed-card "size" descriptor: the total compound in the container, so every
// injectable reads the same way ("10 mg vial"). recon and rtu both store that total
// in `amount` (RTU has no dilution — its amount = concentration × bottle volume,
// computed at save). Before an RTU vial exists we recompute from the active vial's
// volume if present, else fall back to concentration ("10 mg/ml"). oral → the
// per-unit strength ("500 mg"). Returns null when nothing is entered yet.
function sizeLabel(p, vial, t) {
  if (p.type === 'recon') {
    if (p.amount == null || p.amount === '') return null;
    return `${p.amount} ${p.unit || 'mg'} ${t('protocols_vial_noun')}`;
  }
  if (p.type === 'rtu') {
    if (p.concentration == null || p.concentration === '') return null;
    const ml = vial && vial.water_ml != null ? parseDecimal(vial.water_ml) : null;
    const total = ml ? trimNum(parseDecimal(p.concentration) * ml)
      : (p.amount != null && p.amount !== '' ? trimNum(parseDecimal(p.amount)) : null);
    if (total) return `${total} ${p.concentration_unit || 'mg'} ${t('protocols_vial_noun')}`;
    return `${p.concentration} ${p.concentration_unit || 'mg'}/ml`;
  }
  if (p.type === 'oral') {
    if (p.serving_strength == null || p.serving_strength === '') return null;
    return `${p.serving_strength} ${p.serving_strength_unit || 'mg'}`;
  }
  return null;
}

// The compound-type name shown as an outline tag (Graduated: no tinted chips).
function typeLabel(type, t) {
  if (type === 'recon') return t('protocols_type_badge_lyophilized');
  if (type === 'rtu') return t('protocols_type_badge_rtu');
  if (type === 'oral') return t('protocols_type_badge_oral');
  return type;
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

// Days left on the active vial. Recon: from the mix date + validity window. RTU: the
// box date the user entered (vial.expires_on). null when unknown.
function vialDaysLeftFor(p, vial) {
  if (!vial) return null;
  if (p.type === 'recon') return daysUntilExpiry(vial.mixed_on, p.vial_valid_days || DEFAULT_VALID_DAYS, new Date());
  return vial.expires_on ? Math.ceil((new Date(vial.expires_on + 'T00:00:00') - new Date()) / 86400000) : null;
}

// Supply words only (DESIGN.md §2.5): ≤3 days risk, ≤7 attention, else the plain caption.
function daysTone(days, c) {
  return days <= 3 ? c.risk : days <= 7 ? c.attention : c.ink2;
}

// A label that arrives all in capitals (an old string) is shown in sentence case.
function sentenceCase(str) {
  if (!str || str !== str.toUpperCase()) return str;
  const lower = str.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1).replace(/-([a-zà-ÿ])/g, (m, ch) => '-' + ch.toUpperCase());
}

// Halves read as "½" / "1½"; anything else stays decimal.
function fmtServing(v) {
  if (Math.abs(v * 2 - Math.round(v * 2)) > 1e-9) return String(Math.round(v * 100) / 100);
  const whole = Math.floor(v + 1e-9);
  const isHalf = Math.abs(v - whole - 0.5) < 1e-9;
  if (!isHalf) return String(whole);
  return whole > 0 ? `${whole}½` : '½';
}

// The dose in the other mass unit, so the mcg↔mg equivalence is read beside the draw.
function altMass(dose, unit) {
  if (unit === 'mcg') { const pp = massParts(parseDecimal(dose) / 1000); return pp ? `${pp.mg} mg` : null; }
  if (unit === 'mg') { const pp = massParts(parseDecimal(dose)); return pp ? `${pp.mcg} mcg` : null; }
  return null;
}

// ── Small Graduated controls (prototype .winp / .segw / .pill / .fld) ──

// Input: raised, 1 px line inset; 2 px ink while focused.
function WInput({ s, c, style, onFocus, onBlur, ...props }) {
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      placeholderTextColor={c.ink3}
      {...props}
      style={[s.winp, focus && s.winpOn, style]}
      onFocus={(e) => { setFocus(true); if (onFocus) onFocus(e); }}
      onBlur={(e) => { setFocus(false); if (onBlur) onBlur(e); }}
    />
  );
}

// Selection pill: 1 px line outline; chosen = 1.5 px ink outline on raised.
function Pill({ s, label, on, onPress, short }) {
  return (
    <TouchableOpacity style={[s.pill, short && s.pillShort, on && s.pillOn]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }}>
      <Text style={[s.pillText, on && s.pillTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Fld({ s, label, hint, children }) {
  return (
    <View style={s.fld}>
      {label ? <Text style={s.fldLabel}>{label}</Text> : null}
      {children}
      {hint ? <Text style={s.fldHint}>{hint}</Text> : null}
    </View>
  );
}

function WarnBox({ s, text, risk }) {
  return (
    <View style={[s.warnbox, risk && s.warnboxRisk]}>
      <Text style={[s.warnText, risk && s.warnTextRisk]}>{text}</Text>
    </View>
  );
}

function InfoBox({ s, text }) {
  return (
    <View style={s.infobox}>
      <Text style={s.infoText}>{text}</Text>
    </View>
  );
}

// Rows block (prototype .rows/.rw): section title, then label left / value right.
function RowsBlock({ s, title, rows, style }) {
  const shown = rows.filter(Boolean);
  if (!shown.length) return null;
  return (
    <View style={style || s.blk}>
      {title ? <Text style={s.secth}>{title}</Text> : null}
      <View style={s.rows}>
        {shown.map((r, i) => (
          <View key={`${i}-${r.label}`} style={[s.rw, i > 0 && s.rwSep]}>
            <Text style={s.rwKey}>{r.label}</Text>
            <Text style={[s.rwVal, r.mono && s.rwValMono]}>{r.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Protocol screen: the syringe calculator (hero object) ──
// Draw to + the protocol's own syringe drawn to scale (shared SyringeScale), the
// volume / dose / syringe reads, and the arithmetic disclaimer. Tap to enlarge: the
// enlarged syringe is SyringeZoomSheet, held by the screen so it stays open when a
// foldable folds or unfolds (S-26 BK-10).
function ProtocolDrawHero({ p, t, onDoseDetails, onZoom }) {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const [drawW, setDrawW] = useState(0);

  const draw = computeDraw({
    type: p.type,
    amount: p.amount, water: p.water,
    dose: p.dose, doseUnit: p.dose_unit, unit: p.unit,
    concentration: p.concentration, concentrationUnit: p.concentration_unit,
    syringeSize: p.syringe_size,
  });
  const syringeMax = p.syringe_size || 100;

  if (!draw.drawML || !draw.valid) {
    return (
      <View style={s.hobj}>
        <Text style={s.hobjTitle}>{t('protocols_syringe_title')}</Text>
        <Text style={s.hobjSub}>
          {p.type === 'rtu' && !p.concentration
            ? t('protocols_syringe_no_data_conc')
            : t('protocols_syringe_no_data')}
        </Text>
        <TouchableOpacity style={s.hobjFoot} onPress={onDoseDetails} accessibilityRole="button">
          <Text style={s.hobjFootText}>{t('protocols_step_dose')}</Text>
          <RowChevron color={c.tick} />
        </TouchableOpacity>
      </View>
    );
  }

  const units = Number(draw.drawUnits);
  const over = units > syringeMax;
  const alt = altMass(p.dose, p.dose_unit);

  return (
    <View style={s.hobj}>
      <Text style={s.hobjTitle}>{t('protocols_syringe_title')}</Text>
      <TouchableOpacity
        activeOpacity={0.8}
        style={s.drawWell}
        onPress={onZoom}
        onLayout={(e) => setDrawW(e.nativeEvent.layout.width)}
        accessibilityRole="button"
        accessibilityHint={t('protocols_syringe_zoom_hint')}
      >
        <View style={s.drawHead}>
          <Text style={s.drawLabel}>{t('protocols_syringe_draw_to')}</Text>
          <View style={s.bigRow}>
            <Text style={[s.drawBig, over && s.drawBigRisk]}>{draw.drawUnits}</Text>
            <Text style={s.drawBigUnit}>{t('protocols_syringe_units')}</Text>
          </View>
        </View>
        {drawW > 0 ? <SyringeScale units={units} size={syringeMax} width={drawW - 28} /> : null}
        {over && (
          <Text style={s.drawWarn}>{t('protocols_draw_exceeds_warning').replace('{units}', draw.drawUnits).replace('{size}', String(syringeMax))}</Text>
        )}
        <View style={s.hintRow}>
          <FeatureIcon name="search" size={14} color={c.ink2} />
          <Text style={s.hintText}>{t('protocols_syringe_zoom_hint')}</Text>
        </View>
      </TouchableOpacity>
      <View style={s.reads}>
        <View style={s.readCell}>
          <Text style={s.readLabel}>{t('protocols_syringe_volume')}</Text>
          <Text style={s.readVal}>{draw.drawML} ml</Text>
        </View>
        <View style={s.readCell}>
          <Text style={s.readLabel}>{t('protocols_syringe_dose')}</Text>
          <Text style={s.readVal}>{p.dose} {p.dose_unit}</Text>
          {alt ? <Text style={s.readAlt}>= {alt}</Text> : null}
        </View>
        <View style={s.readCell}>
          <Text style={s.readLabel}>{t('protocols_syringe_size')}</Text>
          <Text style={s.readVal}>{syringeMax} u</Text>
        </View>
      </View>
      <Text style={s.disclaimer}>{t('protocols_calc_disclaimer')}</Text>
    </View>
  );
}

// The enlarged syringe (tap the drawn syringe). Rendered once by the screen, outside the
// list / protocol views and the book pages, so a fold or unfold never closes it (BK-10).
// `p` stays set while the sheet fades out; `visible` opens and closes it.
function SyringeZoomSheet({ p, visible, onClose, t }) {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const { width: windowWidth } = useWindowDimensions();
  const draw = p ? computeDraw({
    type: p.type,
    amount: p.amount, water: p.water,
    dose: p.dose, doseUnit: p.dose_unit, unit: p.unit,
    concentration: p.concentration, concentrationUnit: p.concentration_unit,
    syringeSize: p.syringe_size,
  }) : null;
  const ok = !!(draw && draw.drawML && draw.valid);
  const syringeMax = (p && p.syringe_size) || 100;
  const units = ok ? Number(draw.drawUnits) : 0;
  // The sheet is at most 560 wide (520 inside its padding), not the window (A-76). The
  // ruler is the prototype overlay (part 7): 1640 wide, opened with the dose centred.
  const zoomView = Math.min(windowWidth - 72, 520);
  const name = p ? (p.compound_id ? t(p.compound_id) : p.name) : '';

  return (
    <Modal visible={visible && ok} transparent animationType="fade" onRequestClose={onClose}>
      {ok ? (
        <Pressable style={s.zoomScrim} onPress={onClose}>
          <Pressable style={s.zoomSheet} onPress={() => {}} accessibilityViewIsModal>
            <Text style={s.zoomTitle}>{name}</Text>
            <Text style={s.zoomReadout}>
              {t('protocols_syringe_draw_to')} <Text style={s.zoomReadoutVal}>{draw.drawUnits}u</Text> · {draw.drawML} ml
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: Math.max(0, Math.min(RULER.W - zoomView, rulerX(units, syringeMax) - zoomView / 2)), y: 0 }}
              style={s.ruler}
            >
              <SyringeRuler units={units} size={syringeMax} />
            </ScrollView>
            <TouchableOpacity style={s.btnPrimary} onPress={onClose} accessibilityRole="button">
              <Text style={s.btnPrimaryText}>{t('done')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      ) : null}
    </Modal>
  );
}

// Oral twin of the syringe calculator: target dose + per-serving strength → how many
// units to take, and (with a container size) units / days of supply left. Pure
// arithmetic on the user's own numbers — no recommendation.
function ProtocolServingHero({ p, t, onRefill }) {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
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
        <View style={s.hobj}>
          <Text style={s.hobjTitle}>{t('protocols_serving_title')}</Text>
          <WarnBox s={s} text={t('protocols_serving_unit_mismatch')} />
        </View>
      );
    }
    return null; // not enough info yet — stay quiet
  }

  const unitLabel = t(r.unitKey);
  // Show the amount when it's achievable (continuous, whole, or a clean half on
  // a scored unit). Otherwise the unit can't hit the target, so explain instead.
  const canShowAmount = !r.discrete || r.isAchievable;
  const containsMsg = t('protocols_serving_contains')
    .replace('{strength}', r.perUnitDose)
    .replace('{sunit}', p.dose_unit)
    .replace('{ratio}', r.ratio);
  const containerUnits = parseDecimal(p.container_units);
  const unitsTaken = parseDecimal(p.units_taken) || 0;
  const unitsLeft = containerUnits > 0 ? Math.max(0, Math.round((containerUnits - unitsTaken) * 100) / 100) : null;
  const daysLeft = unitsLeft != null ? supplyDaysLeft(unitsLeft, r.unitsNeeded, p.doses_per_day || 1) : null;
  const reads = [
    { label: t('protocols_serving_dose'), value: `${p.dose} ${p.dose_unit}` },
    unitsLeft != null ? { label: t('protocols_serving_left'), value: `${unitsLeft} ${unitLabel}` } : null,
    daysLeft != null ? { label: t('protocols_serving_days_left'), value: String(daysLeft) } : null,
  ].filter(Boolean);
  while (reads.length < 3) reads.push(null);

  return (
    <View style={s.hobj}>
      <Text style={s.hobjTitle}>{t('protocols_serving_title')}</Text>
      {canShowAmount ? (
        <View style={[s.drawWell, s.drawWellServing]}>
          <Text style={s.drawLabel}>{t('protocols_syringe_based_on')}</Text>
          <View style={s.bigRow} accessible accessibilityLabel={`${t('protocols_serving_take')} ${fmtServing(r.unitsNeeded)} ${unitLabel}`}>
            <Text style={s.drawBig}>{fmtServing(r.unitsNeeded)}</Text>
            <Text style={s.drawBigUnit}>{unitLabel}</Text>
          </View>
        </View>
      ) : (
        <WarnBox s={s} text={r.splittable ? t('protocols_serving_not_half') : containsMsg} />
      )}
      {r.nearest && (
        <Text style={s.nearest}>
          {fmtServing(r.nearest.lowUnits)} {unitLabel} = {r.nearest.lowDose} {p.dose_unit} · {fmtServing(r.nearest.highUnits)} {unitLabel} = {r.nearest.highDose} {p.dose_unit}
        </Text>
      )}
      <View style={s.reads}>
        {reads.map((rd, i) => (
          <View key={i} style={s.readCell}>
            {rd ? <Text style={s.readLabel}>{rd.label}</Text> : null}
            {rd ? <Text style={s.readVal}>{rd.value}</Text> : null}
          </View>
        ))}
      </View>
      {unitsLeft != null && onRefill && unitsTaken > 0 && (
        <TouchableOpacity style={s.obtn2} onPress={() => onRefill(p.id)} accessibilityRole="button">
          <FeatureIcon name="repeat" size={18} color={c.ink} />
          <Text style={s.obtn2Text}>{t('protocols_serving_new_bottle')}</Text>
        </TouchableOpacity>
      )}
      <Text style={s.disclaimer}>{t('protocols_calc_disclaimer')}</Text>
    </View>
  );
}

// Vial block on the protocol screen: one cell per dose (remaining in data), doses left,
// the mix / box date with days left, the supply tags, and New vial for a used RTU vial.
function ProtocolVialBlock({ p, vial, t, onRefillVial }) {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const supply = supplyState(vial, p); // the ONE supply-low rule (S-05)
  const capacity = supply.capacity != null
    ? supply.capacity
    : dosesPerVial({ amount: p.amount, unit: p.unit, dose: p.dose, doseUnit: p.dose_unit });
  const remaining = supply.remaining;
  const daysLeft = vialDaysLeftFor(p, vial);
  if (capacity == null && daysLeft == null) return null;
  const dateText = vial && p.type === 'recon' && vial.mixed_on
    ? (() => { const d = new Date(String(vial.mixed_on).slice(0, 10) + 'T00:00:00'); return isNaN(d.getTime()) ? null : `${t('today_vial_mixed')} ${t(MONTH_KEYS[d.getMonth()])} ${d.getDate()}`; })()
    : vial && p.type === 'rtu' && vial.expires_on
      ? (() => { const d = new Date(String(vial.expires_on).slice(0, 10) + 'T00:00:00'); return isNaN(d.getTime()) ? null : `${t('vials_expires')} ${t(MONTH_KEYS[d.getMonth()])} ${d.getFullYear()}`; })()
      : null;
  const past = daysLeft != null && daysLeft <= 0;
  return (
    <View style={s.blkD}>
    <Text style={s.secth}>{t('protocols_vial_title')}</Text>
    <View style={[s.hobj, s.hobjTight]}>
      {remaining != null && capacity != null ? <VialCells total={capacity} left={remaining} /> : null}
      {capacity != null && (
        <Text style={s.vialHead}>
          {remaining != null
            ? t('protocols_doses_left').replace('{n}', String(remaining)).replace('{total}', String(capacity))
            : t('protocols_doses_capacity').replace('{total}', String(capacity))}
        </Text>
      )}
      {(dateText || (daysLeft != null && !past)) && (
        <Text style={s.vialSub}>
          {dateText}
          {dateText && daysLeft != null && !past ? ' · ' : ''}
          {daysLeft != null && !past ? (
            <Text style={{ color: daysTone(daysLeft, c), fontWeight: daysLeft <= 7 ? '600' : '400' }}>
              {t('protocols_vial_days_left').replace('{n}', String(daysLeft))}
            </Text>
          ) : null}
        </Text>
      )}
      {(supply.low || past) && (
        <View style={s.tags}>
          {supply.low && (
            <View style={[s.otag, s.otagAttn]}>
              <Text style={[s.otagText, s.otagTextAttn]}>{t('protocols_low_supply').replace('{n}', String(remaining))}</Text>
            </View>
          )}
          {past && (
            <View style={[s.otag, s.otagRisk]}>
              <Text style={[s.otagText, s.otagTextRisk]}>{t('protocols_vial_past')}</Text>
            </View>
          )}
        </View>
      )}
      {p.type === 'rtu' && vial && (vial.doses_taken || 0) > 0 && (
        <TouchableOpacity style={s.obtn2} onPress={() => onRefillVial(p.id)} accessibilityRole="button">
          <FeatureIcon name="repeat" size={18} color={c.ink} />
          <Text style={s.obtn2Text}>{t('protocols_new_vial')}</Text>
        </TouchableOpacity>
      )}
    </View>
    </View>
  );
}

// One protocol in the list (prototype pcard): name, size · dose · frequency, the supply
// line with vial cells, and outline tags. The whole card opens the protocol screen.
// Book layout (S-26 BK-8): `book` reserves a 2 pt outline on every card so selecting one
// does not shift it; the card open on the right page draws that outline in ink.
function ProtocolListCard({ p, vial, onOpen, t, book = false, selected = false }) {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const isInjectable = p.type === 'recon' || p.type === 'rtu';
  const vialDaysLeft = vialDaysLeftFor(p, vial);
  // Low-supply flag — must match the Today "Supply low" alert. Capacity uses the
  // stored count, else derived from vial size ÷ dose (older vials have no count).
  const supply = supplyState(vial, p); // the ONE supply-low rule (S-05)
  const dosesRemaining = supply.remaining;
  // Doses a full vial yields, shown for every injectable (lyophilized or RTU) even
  // before a vial is opened: the stored/derived vial capacity, else — with no vial —
  // derived from the vial's total compound ÷ dose (both types store that in `amount`).
  const vialDoseCapacity = supply.capacity != null
    ? supply.capacity
    : dosesPerVial({ amount: p.amount, unit: p.unit, dose: p.dose, doseUnit: p.dose_unit });
  const lowSupply = supply.low;
  const past = vialDaysLeft != null && vialDaysLeft <= 0;
  const showCap = isInjectable && vialDoseCapacity != null;
  const showDays = vialDaysLeft != null && !past;
  const sz = sizeLabel(p, vial, t);

  return (
    <TouchableOpacity
      style={book ? [s.pcard, s.pcardBook, selected && s.pcardSel] : s.pcard}
      activeOpacity={0.75}
      onPress={() => onOpen(p.id)}
      accessibilityRole="button"
      accessibilityState={book ? { selected } : undefined}
    >
      <View style={s.pcardTop}>
        <View style={[s.pdot, { backgroundColor: displayColor(p.color) || c.data }]} />
        <View style={s.pcardInfo}>
          <Text style={s.pname}>{p.compound_id ? t(p.compound_id) : p.name}</Text>
          <Text style={s.pmeta}>
            {sz ? `${sz} · ` : ''}
            {p.dose} {p.dose_unit}{isInjectable ? ` ${t('protocols_dose_noun')}` : ''} · {frequencyLabelFor(p.interval_days, t)}
          </Text>
        </View>
        <View style={s.pchev}><RowChevron color={c.tick} /></View>
      </View>
      {(showCap || showDays) && (
        <View style={s.supply}>
          {showCap && dosesRemaining != null ? <VialCells total={vialDoseCapacity} left={dosesRemaining} /> : null}
          <Text style={s.supplyText}>
            {showCap ? (
              <Text style={s.supplyStrong}>
                {dosesRemaining != null
                  ? t('protocols_doses_left').replace('{n}', String(dosesRemaining)).replace('{total}', String(vialDoseCapacity))
                  : t('protocols_doses_capacity').replace('{total}', String(vialDoseCapacity))}
              </Text>
            ) : null}
            {showCap && showDays ? ' · ' : ''}
            {showDays ? (
              <Text style={{ color: daysTone(vialDaysLeft, c), fontWeight: vialDaysLeft <= 7 ? '600' : '400' }}>
                {t('protocols_vial_days_left').replace('{n}', String(vialDaysLeft))}
              </Text>
            ) : null}
          </Text>
        </View>
      )}
      <View style={s.tags}>
        {lowSupply && (
          <View style={[s.otag, s.otagAttn]}>
            <Text style={[s.otagText, s.otagTextAttn]}>{t('protocols_low_supply').replace('{n}', String(dosesRemaining))}</Text>
          </View>
        )}
        {past && (
          <View style={[s.otag, s.otagRisk]}>
            <Text style={[s.otagText, s.otagTextRisk]}>{t('protocols_vial_past')}</Text>
          </View>
        )}
        <View style={s.otag}><Text style={s.otagText}>{typeLabel(p.type, t)}</Text></View>
        {p.goal ? p.goal.split(',').filter(Boolean).map(g => (
          <View key={g} style={s.otag}><Text style={s.otagText}>{t(g) || g}</Text></View>
        )) : null}
      </View>
    </TouchableOpacity>
  );
}

// The protocol screen (prototype protocol()): title block, the calculator, the vial,
// schedule rows + "+ Reminder", dose details, the note, and Delete at the bottom.
// The draft store key of a protocol's unsaved note (BK-14, A-77).
function noteDraftKey(id) {
  return 'protocolNote:' + id;
}

// The typed note lives outside this view (`draft` / `onDraft`, kept per protocol in
// lib/draftStore), so it survives this view moving between the phone column and the book's
// right page (S-26 BK-10), opening another protocol and leaving the tab (BK-14, A-77).
function ProtocolDetail({ p, vial, openEdit, deleteProtocol, onSaveNote, onRefill, onRefillVial, onZoom, draft, onDraft, t }) {
  const { colors: c } = useTheme();
  const { language, timeFormat } = useLanguage();
  const s = useMemo(() => makeStyles(c), [c]);
  const name = p.compound_id ? t(p.compound_id) : p.name;
  const isInjectable = p.type === 'recon' || p.type === 'rtu';
  const sz = sizeLabel(p, vial, t);

  // Inline, editable note — saved straight from the protocol screen, no need to open Edit.
  const noteDraft = draft != null ? draft : (p.note || '');
  const setNoteDraft = (text) => onDraft(p.id, text);
  const [noteFocus, setNoteFocus] = useState(false);
  // A saved or synced note replaces the draft (as before). Only a real change of the
  // stored note does: remounting after a fold or unfold keeps what was typed.
  const lastNote = useRef(p.note);
  useEffect(() => {
    if (lastNote.current !== p.note) { lastNote.current = p.note; onDraft(p.id, null); }
  }, [p.note]); // eslint-disable-line react-hooks/exhaustive-deps
  const noteDirty = noteDraft !== (p.note || '');
  const saveNote = () => {
    Keyboard.dismiss();
    onSaveNote(p.id, noteDraft);
  };

  const goals = p.goal ? p.goal.split(',').filter(Boolean) : [];
  // The vial block draws only when there is something to count (ProtocolVialBlock's rule).
  const vialShown = isInjectable && (supplyState(vial, p).capacity != null
    || dosesPerVial({ amount: p.amount, unit: p.unit, dose: p.dose, doseUnit: p.dose_unit }) != null
    || vialDaysLeftFor(p, vial) != null);
  const scheduleRows = [
    { label: t('protocols_frequency'), value: p.interval_days ? frequencyLabelFor(p.interval_days, t) : (p.frequency || '—') },
    { label: t('protocols_reminder'), value: (p.reminder_time || '—').split(',').filter(Boolean).map(t24 => formatTime(t24, language, timeFormat)).join('  ·  '), mono: true },
    p.schedule_total ? { label: t('protocols_total_doses_schedule'), value: String(p.schedule_total), mono: true } : null,
    goals.length ? { label: t('protocols_goal'), value: goals.map(g => t(g) || g).join(', ') } : null,
  ];
  let doseRows = [];
  if (p.type === 'recon') {
    doseRows = [
      { label: t('protocols_compound_amount'), value: `${p.amount} ${p.unit}`, mono: true },
      p.diluent ? { label: t('protocols_diluent'), value: diluentLabel(p.diluent, t) } : null,
      { label: t('protocols_diluent_amount'), value: `${p.water} ml`, mono: true },
      {
        label: t('protocols_concentration'),
        value: `${p.amount && p.water ? (parseDecimal(p.amount) / parseDecimal(p.water)).toFixed(2) : '—'} ${p.unit}/ml`,
        mono: true,
      },
      { label: t('protocols_desired_dose'), value: `${p.dose} ${p.dose_unit}`, mono: true },
    ];
  } else if (p.type === 'rtu') {
    doseRows = [
      { label: t('protocols_dose_per_injection'), value: `${p.dose} ${p.dose_unit}`, mono: true },
      p.concentration ? { label: t('protocols_concentration'), value: `${p.concentration} ${p.concentration_unit || 'mg'}/ml`, mono: true } : null,
      vial && vial.water_ml != null ? { label: t('protocols_vial_size'), value: `${vial.water_ml} ml`, mono: true } : null,
    ];
  } else if (p.type === 'oral') {
    doseRows = [
      { label: t('protocols_dose_amount'), value: `${p.dose} ${p.dose_unit}`, mono: true },
      p.notes ? { label: t('protocols_form'), value: oralFormLabel(p.notes, t) } : null,
      p.serving_strength != null ? { label: t('protocols_serving_strength'), value: `${p.serving_strength} ${p.serving_strength_unit || 'mg'}`, mono: true } : null,
      p.serving_units != null ? { label: t('protocols_serving_units'), value: String(p.serving_units), mono: true } : null,
      p.container_units != null ? { label: t('protocols_container_units'), value: String(p.container_units), mono: true } : null,
    ];
  }

  return (
    <View style={s.detail}>
      <View style={s.ptitle}>
        <View style={s.ptitleRow}>
          <View style={[s.ptitleDot, { backgroundColor: displayColor(p.color) || c.data }]} />
          <Text style={s.ptitleMeta}>
            {sz ? `${sz} · ` : ''}{p.dose} {p.dose_unit}{isInjectable ? ` ${t('protocols_dose_noun')}` : ''}
          </Text>
        </View>
        <Text style={s.ptitleName} accessibilityRole="header">{name}</Text>
        <View style={s.tags}>
          <View style={s.otag}><Text style={s.otagText}>{typeLabel(p.type, t)}</Text></View>
          {goals.map(g => (
            <View key={g} style={s.otag}><Text style={s.otagText}>{t(g) || g}</Text></View>
          ))}
        </View>
      </View>

      {isInjectable && <ProtocolDrawHero key={`syr-${p.type}`} p={p} t={t} onDoseDetails={() => openEdit(p, 3)} onZoom={() => onZoom(p.id)} />}
      {vialShown && <ProtocolVialBlock p={p} vial={vial} t={t} onRefillVial={onRefillVial} />}
      <ProtocolServingHero p={p} t={t} onRefill={onRefill} />

      <RowsBlock s={s} title={t('protocols_step_schedule')} rows={scheduleRows} style={vialShown ? [s.blkD, s.blkNext] : s.blkD} />
      <TouchableOpacity style={s.obtn2} onPress={() => openEdit(p, 4)} accessibilityRole="button">
        <Text style={s.obtn2Text}>{t('protocols_add_reminder')}</Text>
      </TouchableOpacity>

      <RowsBlock s={s} title={t('protocols_step_dose')} rows={doseRows} style={s.blkD} />

      <View style={[s.blkD, s.blkNext]}>
        <Text style={s.secth}>{t('protocols_notes')}</Text>
        <TextInput
          style={[s.noteWell, noteFocus && s.noteWellOn]}
          value={noteDraft}
          onChangeText={setNoteDraft}
          onFocus={() => setNoteFocus(true)}
          onBlur={() => setNoteFocus(false)}
          placeholder={p.type === 'oral' ? t('protocols_notes_placeholder_oral') : t('protocols_notes_placeholder')}
          placeholderTextColor={c.ink3}
          multiline
        />
        {noteDirty && (
          <View style={s.acts2}>
            <TouchableOpacity style={[s.btnSm, s.btnSec]} onPress={() => onDraft(p.id, null)} accessibilityRole="button">
              <Text style={[s.btnSecText, s.btnSmText]}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnSm, s.btnPri]} onPress={saveNote} accessibilityRole="button">
              <Text style={[s.btnPriText, s.btnSmText]}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity style={s.dangerBtn} onPress={() => deleteProtocol(p.id)} accessibilityRole="button">
        <Text style={s.dangerText}>{t('protocols_delete_title')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Book layout on foldables (S-26, docs/specs/book-layout.md) ──
// Pure rules for this tab, tested in __tests__/bookProtocols.test.js. One column keeps
// today's views: heroes (showList false), the list (showList, no openId) or one
// protocol's screen (showList + openId). Two pages: the list on the left, the selected
// protocol's screen on the right.

// The cards in the order the list shows them (the 'type' sort shows three sections).
function protocolListOrder(sortBy, sorted) {
  if (sortBy !== 'type') return sorted;
  return ['recon', 'rtu', 'oral'].flatMap(ty => sorted.filter(p => p.type === ty));
}

// BK-4: the protocol on the right page. The chosen one while it still exists, else the
// default (opened from Today / a notification, else the first card), else nothing.
function bookProtocolId(sel, fallback, ids) {
  if (sel != null && ids.includes(sel)) return sel;
  if (fallback != null && ids.includes(fallback)) return fallback;
  return ids.length ? ids[0] : null;
}

// BK-10, folding: a protocol the user chose on the right page becomes the protocol
// screen with "‹ Protocols". A default nobody chose keeps the one-column place the user had.
function protocolsFoldView({ sel, explicit, openId, showList }) {
  if (explicit && sel != null) return { openId: sel, showList: true };
  return { openId, showList };
}

// BK-10, unfolding: an open protocol screen moves onto the right page (null = keep the
// right page as it is).
function protocolsUnfoldSelection({ openId, showList }) {
  return showList && openId != null ? openId : null;
}

// Free-feature explainers this screen offers (Today redesign part 18): the reconstitution
// calculator, the vial tracker and reminders, each until the user has used it — read from the
// user's own synced protocols and vials.
function protocolExplainers(userId) {
  const ps = getActiveProtocols(userId) || [];
  const vials = getActiveVials(userId) || [];
  return [
    { key: 'recon', used: ps.some((p) => p.type === 'recon') },
    { key: 'vial', used: vials.length > 0 },
    { key: 'remind', used: ps.some((p) => !!p.reminder_time) },
  ];
}

export default function ProtocolsScreen() {
  const { t, language, timeFormat } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation();
  const route = useRoute();
  const [protocols, setProtocols] = useState([]);
  // Soft-deleted protocols still restorable (7 days): "Recently deleted" at the bottom of
  // the list (prototype list(); moved here from Settings).
  const [deletedProtocols, setDeletedProtocols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('due');
  const [vialsByProtocol, setVialsByProtocol] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(1);
  // The protocol screen (prototype protocol()): a tapped card opens it over the list.
  const [openId, setOpenId] = useState(null);
  // Redesign (founder approved 2026-09-29, item 7): the tab opens on two heroes —
  // Protocols (count, names, low supply → the list) and Dose log (counts → the log).
  const [showList, setShowList] = useState(false);
  // DoseTrace sheets replace the system alerts (My Protocols part 3, approved
  // 2026-09-29). screenSheet = delete / limit / log past doses (shown on the screen,
  // only once the add/edit sheet is fully gone); wizSheet + scanChoice live inside it.
  const [screenSheet, setScreenSheet] = useState(null);
  const [wizSheet, setWizSheet] = useState(null);
  const [scanChoice, setScanChoice] = useState(null);
  const [wizardPresented, setWizardPresented] = useState(false);
  // Set when the add/edit sheet closes: the form resets only once the sheet is fully gone,
  // so it never flashes "New protocol" while sliding away (sim finding 2026-10-02).
  const resetOnHiddenRef = useRef(false);
  const scrollRef = useRef(null);
  const [logCounts, setLogCounts] = useState({ Taken: 0, Skipped: 0, Missed: 0 });
  const [lastLog, setLastLog] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [name, setName] = useState('');
  // Canonical compound key (e.g. 'lyo_bpc_157'); null for a user-added custom
  // compound. The display name comes from t(compoundId) when set.
  const [compoundId, setCompoundId] = useState(null);
  // The blend the typed composition belongs to. Typing in the name field nulls
  // compoundId, so re-picking the SAME blend must not clear the recipe.
  const compositionForRef = useRef(null);
  // The edit form as it was opened (lib/protocolForm formFromProtocol): Save diffs against it.
  const editStartRef = useRef(null);
  const [type, setType] = useState('recon');
  const [color, setColor] = useState(DEFAULT_PROTOCOL_COLOR);
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('mg');
  const [water, setWater] = useState('2');
  const [diluentChoice, setDiluentChoice] = useState('');
  const [diluentOther, setDiluentOther] = useState('');
  const [dose, setDose] = useState('');
  const [iuInput, setIuInput] = useState(''); // IU→mass converter (recon dose step)
  const [iuOpen, setIuOpen] = useState(false); // the converter folds (prototype .fold2)
  const [doseUnit, setDoseUnit] = useState('mg');
  const [syringeSize, setSyringeSize] = useState(100);
  const [concentration, setConcentration] = useState('');
  const [concentrationUnit, setConcentrationUnit] = useState('mg');
  // ── Vial-label scan (AI prefill) ──
  const [vialScanning, setVialScanning] = useState(false);
  const [vialScanned, setVialScanned] = useState(false); // show the review banner after a scan
  // ── Schedule state ──
  const [intervalDays, setIntervalDays] = useState(1);
  // Custom (typed) dosing interval — for schedules longer than the presets,
  // e.g. testosterone cypionate every 10-14 days or undecanoate every ~12 weeks.
  const [customIntervalOpen, setCustomIntervalOpen] = useState(false);
  const [customIntervalText, setCustomIntervalText] = useState('');
  const [dosesPerDay, setDosesPerDay] = useState(1);
  // First-dose / start date as a full ISO date (YYYY-MM-DD). Defaults to today;
  // any past or future date is allowed so a protocol can be scheduled ahead.
  const [startDate, setStartDate] = useState(() => isoDay(new Date(), 0));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [reminderTimes, setReminderTimes] = useState([currentTimeRounded5()]);
  const [goals, setGoals] = useState([]);
  const [notes, setNotes] = useState('');
  const [note, setNote] = useState('');
  const [composition, setComposition] = useState(''); // blend "what's in the vial" label
  // Oral serving calculator + supply
  const [servingStrength, setServingStrength] = useState('');
  const [servingStrengthUnit, setServingStrengthUnit] = useState('mg');
  const [servingUnits, setServingUnits] = useState('1');
  const [containerUnits, setContainerUnits] = useState('');
  const [divisible, setDivisible] = useState(null); // null = unanswered, true/false = user's answer
  const [saving, setSaving] = useState(false);

  const [activeTimeIndex, setActiveTimeIndex] = useState(0);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Build a Date object from month index (0-11) + day string
  function buildDate(monthIdx, dayStr) {
    return new Date(toSupabaseDateFromMD(monthIdx, dayStr) + 'T00:00:00');
  }

  // The user's local calendar day (lib/protocolForm isoDay), never a UTC date.
  function todayISO() {
    return isoDay(new Date(), 0);
  }
  // First-dose quick pick: is the current start date today (+offset days)?
  function isStartOn(offset) {
    return firstDoseChoice(startDate, new Date()) === offset;
  }
  function setStartOffset(offset) {
    setStartDate(isoDay(new Date(), offset));
  }
  function formatStartDate(iso) {
    if (!iso) return '—'; // an old protocol saved without a start date: nothing preselected
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString(LOCALE_MAP[language] || 'en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  // The time wheel opens on the chosen dose time.
  function timePickerValue() {
    const [h, m] = (reminderTimes[activeTimeIndex] || currentTimeRounded5()).split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d;
  }
  function applyPickedTime(selectedDate) {
    const h = String(selectedDate.getHours()).padStart(2, '0');
    const m = String(selectedDate.getMinutes()).padStart(2, '0');
    setReminderTimes(prev => {
      // Clamp the index into range and never let the array grow
      // past doses-per-day. Writing next[activeTimeIndex] with a
      // stale/out-of-range index (e.g. after Twice→Once) used to
      // append a phantom extra dose while "Once" stayed selected.
      const idx = Math.min(Math.max(activeTimeIndex, 0), prev.length - 1);
      const next = [...prev];
      next[idx] = `${h}:${m}`;
      return next.slice(0, Math.max(1, dosesPerDay));
    });
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
      setActiveTimeIndex(0);
    }
  }

  // When doses per day changes, adjust reminder times array
  function handleDosesPerDayChange(newCount) {
    setDosesPerDay(newCount);
    setActiveTimeIndex(0); // reset so a stale index can't write past the array
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

  // The enlarged syringe ({ id, open }) lives here, outside the views, so a fold or unfold
  // never drops it (S-26 BK-10). The typed protocol note is kept per protocol in
  // lib/draftStore until Save or Cancel (BK-14, A-77): opening another protocol, going back
  // to the list, a fold or unfold and leaving the tab all keep it. setDraftTick re-renders.
  const [zoom, setZoom] = useState({ id: null, open: false });
  const [, setDraftTick] = useState(0);
  function onNoteDraft(id, text) {
    if (text == null) clearDraft(noteDraftKey(id)); else setDraft(noteDraftKey(id), text);
    setDraftTick((n) => n + 1);
  }

  // Book layout (S-26 BK-4): the list on the left page, the selected protocol on the right.
  const book = useBook();
  const listOrderIds = book ? protocolListOrder(sortBy, sortedProtocols()).map(p => p.id) : [];
  const bookSel = useBookSelection('Protocols', defaultSelection('Protocols', {
    protocolIds: listOrderIds,
    openProtocolId: route.params?.openProtocolId,
  }));
  const bookOpenId = bookProtocolId(bookSel.sel, defaultSelection('Protocols', { protocolIds: listOrderIds }), listOrderIds);

  // Open a protocol: the phone pushes its screen, the book shows it on the right page.
  // Both are kept in step so folding or unfolding lands on the same protocol (BK-10).
  function openProtocolById(id) {
    bookSel.select(id);
    setOpenId(id);
    setShowList(true);
  }
  // Back to the list ("‹ Protocols"): the protocol is closed in both layouts.
  function closeProtocol() {
    setOpenId(null);
    clearSelection('Protocols');
  }
  // Working on the right page's default protocol (typing a note, Edit, enlarge) makes it
  // the user's choice, so a fold keeps it open.
  function claimBookProtocol(id) {
    if (book && (!bookSel.explicit || bookSel.sel !== id)) {
      bookSel.select(id);
      setOpenId(id);
      setShowList(true);
    }
  }

  // BK-10: fold and unfold move the open protocol between the right page and the pushed
  // protocol screen. A layout effect, so the first one-column frame is already right.
  const wasBook = useRef(book);
  useLayoutEffect(() => {
    if (wasBook.current === book) return;
    wasBook.current = book;
    if (book) {
      const id = protocolsUnfoldSelection({ openId, showList });
      if (id != null) bookSel.select(id);
    } else {
      const cur = getSelection('Protocols');
      const v = protocolsFoldView({ sel: cur ? cur.sel : null, explicit: !!(cur && cur.explicit), openId, showList });
      setOpenId(v.openId);
      setShowList(v.showList);
    }
  }, [book]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => { fetchProtocols(); }, []));

  // Deep-link from the Today screen: open (expand) a specific protocol, then
  // clear the param so it doesn't re-fire. A plain effect on the param reacts
  // to the change directly, independent of focus timing. In the book it opens on the
  // right page (BK-4).
  useEffect(() => {
    const openId = route.params?.openProtocolId;
    if (openId != null) {
      openProtocolById(openId);
      navigation.setParams({ openProtocolId: undefined });
    }
  }, [route.params?.openProtocolId]);

  // A screen sheet must not be presented while the add/edit sheet is still on screen
  // or animating out (iOS drops the second presentation). iOS reports the end through
  // the Modal's onDismiss; Android closes at once; a timer is the fallback.
  useEffect(() => {
    if (showModal) { setWizardPresented(true); return undefined; }
    if (Platform.OS !== 'ios') { setWizardPresented(false); return undefined; }
    const id = setTimeout(() => setWizardPresented(false), 900);
    return () => clearTimeout(id);
  }, [showModal]);

  // The closed sheet is reset to a new protocol only after it has left the screen.
  useEffect(() => {
    if (!showModal && !wizardPresented && resetOnHiddenRef.current) {
      resetOnHiddenRef.current = false;
      resetForm();
    }
  }, [showModal, wizardPresented]);

  // Each view (heroes, list, protocol screen) opens at its top.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTo({ y: 0, animated: false });
  }, [showList, openId]);

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
    try {
      const counts = { Taken: 0, Skipped: 0, Missed: 0 };
      const logs = getAllLogs(user.id) || [];
      for (const l of logs) if (counts[l.outcome] != null) counts[l.outcome]++;
      setLogCounts(counts);
      setLastLog(lastCompleteLog(logs));
    } catch { /* keep the last counts */ }
    // Active vial per protocol (latest first from the query) for the vial-age sort.
    const vials = getActiveVials(user.id) || [];
    const byProtocol = {};
    for (const v of vials) if (!byProtocol[v.protocol_id]) byProtocol[v.protocol_id] = v;
    setVialsByProtocol(byProtocol);
    fetchDeletedProtocols();
    setLoading(false);
  }

  // Recently deleted (moved from Settings with the founder-approved prototype, 2026-10-01).
  async function fetchDeletedProtocols() {
    const u = await getCachedUser();
    if (!u) return;
    setDeletedProtocols(getDeletedProtocols(u.id) || []);
  }

  function restoreProtocol(id) {
    restoreProtocolDB(id);
    const newestVial = getNewestVialForProtocol(id);
    if (newestVial) updateVial(newestVial.id, { active: 1 });
    const restored = getProtocolById(id);
    if (restored) scheduleDoseReminder(restored).catch(() => {});
    fetchProtocols();
    notifyDataChanged('protocol'); // Today shows it again at once
    requestSync();
  }

  // Permanently remove a soft-deleted protocol before the 7-day auto-purge.
  // Irreversible, so it always goes through a confirm (main's "Delete permanently?").
  function confirmPermanentDelete(p) {
    setScreenSheet({
      icon: 'warning',
      title: t('settings_delete_protocol_title'),
      body: t('settings_delete_protocol_msg').replace('{name}', protocolName(p)),
      buttons: [
        { label: t('cancel'), kind: 'secondary' },
        {
          label: t('settings_delete_forever'), kind: 'danger',
          onPress: () => {
            permanentlyDeleteProtocol(p.id);
            fetchProtocols();
            requestSync();
          },
        },
      ],
    });
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

  // The whole add / edit form as plain data (lib/protocolForm): what the steps hold now.
  function currentForm() {
    return {
      name, compoundId, type, color, amount, unit, water, diluentChoice, diluentOther,
      dose, doseUnit, syringeSize, concentration, concentrationUnit,
      intervalDays, customIntervalOpen, customIntervalText, dosesPerDay, startDate, reminderTimes,
      goals, notes, note, composition,
      servingStrength, servingStrengthUnit, servingUnits, containerUnits, divisible,
      vialValidDays, vialMl, vialExpMonth, vialExpYear,
    };
  }
  function applyForm(f) {
    setName(f.name); setCompoundId(f.compoundId); setType(f.type); setColor(f.color);
    setAmount(f.amount); setUnit(f.unit); setWater(f.water); setDiluentChoice(f.diluentChoice); setDiluentOther(f.diluentOther);
    setDose(f.dose); setDoseUnit(f.doseUnit); setSyringeSize(f.syringeSize);
    setConcentration(f.concentration); setConcentrationUnit(f.concentrationUnit);
    setIntervalDays(f.intervalDays); setCustomIntervalOpen(f.customIntervalOpen); setCustomIntervalText(f.customIntervalText);
    setDosesPerDay(f.dosesPerDay); setStartDate(f.startDate); setReminderTimes(f.reminderTimes);
    setGoals(f.goals); setNotes(f.notes); setNote(f.note); setComposition(f.composition);
    setServingStrength(f.servingStrength); setServingStrengthUnit(f.servingStrengthUnit); setServingUnits(f.servingUnits);
    setContainerUnits(f.containerUnits); setDivisible(f.divisible);
    setVialValidDays(f.vialValidDays); setVialMl(f.vialMl); setVialExpMonth(f.vialExpMonth); setVialExpYear(f.vialExpYear);
  }

  // A new protocol: the first dose is Today (founder decision 2, 2026-10-02).
  function resetForm() {
    applyForm(newProtocolForm(new Date()));
    editStartRef.current = null;
    setStep(1); setIuInput(''); setIuOpen(false); setShowStartPicker(false);
    compositionForRef.current = null;
    setVialMonth(new Date().getMonth()); setVialDay(String(new Date().getDate()));
    setTotalDoses(''); setSkipVial(false);
    setVialScanning(false); setVialScanned(false);
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
    // A different blend has a different recipe: don't carry the old one over.
    if (compositionForRef.current && key !== compositionForRef.current) setComposition('');
    compositionForRef.current = key;
    setCompoundId(key);
    setSearchQuery(label);
    // The list stays open with the chosen one checked (prototype suggestions(), part 14).
    Analytics.compoundSearched(label, type);
  }

  // Escape hatch: record the user's own typed name as a custom (unverified)
  // compound so a missing entry never blocks creating a protocol.
  function addCustomCompound(typed) {
    const custom = (typeof typed === 'string' ? typed : (searchQuery || '')).trim();
    if (!custom) return;
    setName(custom);
    setCompoundId(null);
    setShowSuggestions(false);
    Analytics.compoundSearched(custom, type);
  }

  function getWellnessKeys() {
    return type === 'oral' ? WELLNESS_KEYS_ORAL : WELLNESS_KEYS_INJECTABLE;
  }

  // Edit: the form starts as the stored row (lib/protocolForm formFromProtocol, the same
  // mapping as before) and Save writes only what the user changes (founder decision 2,
  // 2026-10-02): no preselected first dose, no rewritten field, no vial nobody touched.
  function openEdit(p, goToStep) {
    const f = formFromProtocol(p, vialsByProtocol[p.id], new Date());
    applyForm(f);
    editStartRef.current = f;
    setEditingId(p.id);
    setSearchQuery(p.compound_id ? t(p.compound_id) : (p.name || ''));
    setShowSuggestions(true); // Edit shows the list with the saved compound checked (part 14)
    setIuInput(''); setIuOpen(false);
    compositionForRef.current = p.compound_id || null;
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
    const current = parseDecimal(water) || 0;
    const next = Math.max(0.5, Math.round((current + dir * 0.5) * 10) / 10);
    setWater(String(next));
  }

  // ── Vial-label scan → prefill the calculator (AI, review-before-save) ──
  // A photo of the vial label is sent to the extract edge function (kind:'vial').
  // The model only transcribes what is printed; the app resolves the compound
  // name deterministically and fills the fields as DRAFTS the user must review —
  // it never auto-saves. A shared 3-scans/month budget is enforced server-side.
  const MAX_SCAN_BYTES = 10 * 1024 * 1024;
  const UNIT_SET = ['mg', 'mcg', 'IU'];

  // Map a printed compound name to a canonical compound id, deterministically
  // (compounds.js), failing closed to null so the LLM never picks the id that
  // keys the dose math. `hint` biases the search toward powder (recon) vs oil (rtu).
  function resolveScannedCompound(printed, hint) {
    const name = String(printed || '').trim();
    if (!name) return null;
    const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const q = norm(name);
    const lists = hint === 'solution' ? [RTU_KEYS, LYOPHILIZED_KEYS] : [LYOPHILIZED_KEYS, RTU_KEYS];
    // Pass 1: exact label / id-suffix match, preferred list first.
    for (const list of lists) {
      const exact = list.filter((id) => norm(t(id)) === q || norm(id).endsWith(q));
      if (exact.length === 1) return exact[0];
      if (exact.length > 1) return null; // ambiguous → let the user choose
    }
    // Pass 2: alias / substring match (matchesQuery), preferred list first.
    for (const list of lists) {
      const hits = list.filter((id) => matchesQuery(name, id, t(id)));
      if (hits.length === 1) return hits[0];
      if (hits.length > 1) return null;
    }
    return null;
  }

  function mapAmountUnit(u) {
    const s = String(u || '').trim();
    return UNIT_SET.find((x) => x.toLowerCase() === s.toLowerCase()) || null;
  }
  function mapConcUnit(u) {
    // Server returns e.g. "mg/mL". Only accept a per-MILLILITRE strength — the
    // calculator's concentration is mg (or mcg/IU) per ml. A per-vial form like
    // "mg/5mL", or a missing/odd denominator, is ambiguous → return null so we
    // leave the field for the user rather than seed a wrong concentration.
    const [mass, denom] = String(u || '').split('/');
    if (denom == null || !/^\s*m?l\s*$/i.test(denom)) return null;
    return mapAmountUnit(mass);
  }

  // Apply an extracted vial payload to the wizard fields as review drafts.
  function applyVialScan(v) {
    if (!v) return;
    const form = v.form === 'solution' ? 'solution' : v.form === 'powder' ? 'powder' : null;
    // The label decides the type: a solution/oil is ready-to-use (rtu); a powder
    // is reconstituted. Only flip when the label is unambiguous.
    let nextType = type;
    if (form === 'solution') nextType = 'rtu';
    else if (form === 'powder') nextType = 'recon';
    if (nextType !== type) setType(nextType);

    // Compound identity — deterministic; set only when we resolve exactly one and
    // the user has not already chosen one. Otherwise seed the name for the picker.
    if (!compoundId) {
      const id = resolveScannedCompound(v.compound_name, form);
      if (id) { setCompoundId(id); setName(t(id)); }
      else if (v.compound_name) setName(String(v.compound_name).slice(0, 60));
    }

    if (nextType === 'rtu') {
      // Prefill concentration ONLY when the value is present AND the unit is a
      // clean per-ml strength; otherwise leave it for the user (never seed a
      // wrong-but-plausible concentration that would drive every draw).
      const cu = mapConcUnit(v.concentration_unit);
      if (v.concentration != null && cu) {
        setConcentration(String(v.concentration));
        setConcentrationUnit(cu);
      }
      if (v.volume_ml != null) setVialMl(String(v.volume_ml));
    } else if (v.amount != null) {
      setAmount(String(v.amount));
      const au = mapAmountUnit(v.amount_unit);
      if (au) setUnit(au);
    }
    setVialScanned(true);
  }

  // A notice inside the add/edit sheet (DoseTrace sheet, one button). Shown a beat
  // later when it follows the camera / photo library, which is still closing.
  function wizNotice(title, body, delayed) {
    const cfg = { icon: 'warning', title, body, buttons: [{ label: t('ok'), kind: 'primary' }] };
    if (delayed) setTimeout(() => setWizSheet(cfg), 450);
    else setWizSheet(cfg);
  }
  // Not signed in / Couldn't save (part 21): the DoseTrace sheet with the app's warning
  // triangle (Q15), never the grey iOS alert.
  function wizError(body) {
    setWizSheet({ icon: 'warning', title: t('error'), body, buttons: [{ label: t('ok'), kind: 'primary' }] });
  }

  async function handleVialScanPress() {
    // Consent gate: the label photo goes to a third-party AI processor —
    // Apple 5.1.1(i)/5.1.2(i) requires explicit permission before sending. Asked in the
    // DoseTrace sheet (part 21); the same shared consent key as every AI feature. The policy
    // link opens the page and keeps the flow cancelled (as before): the user taps Scan again.
    if (!(await hasAIConsent())) {
      setWizSheet({
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

  // Photo choice as a bottom sheet (approved 2026-09-29); the camera / library
  // opens only after the sheet is gone.
  function openScanChoice() {
    setScanChoice({
      title: t('vial_scan_choose_sub'),
      options: [
        { label: t('blood_source_camera'), onPress: () => pickVialAndExtract(true) },
        { label: t('blood_source_photo'), onPress: () => pickVialAndExtract(false) },
      ],
      cancelLabel: t('cancel'),
    });
  }

  async function pickVialAndExtract(fromCamera) {
    if (!hasNativeModule('ExponentImagePicker')) { wizNotice(t('error'), t('blood_needs_build')); return; }
    const ImagePicker = require('expo-image-picker');
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { wizNotice(t('error'), t('blood_camera_denied'), true); return; }
      }
      const opts = { mediaTypes: ['images'], quality: 0.6, base64: true };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled) return;
      const asset = result.assets[0];
      // Vial-photo errors reuse "Couldn't read that label" (approved 2026-09-29).
      if (!asset?.base64) { wizNotice(t('vial_scan_error'), t('vial_scan_error_sub'), true); return; }
      if (asset.base64.length > MAX_SCAN_BYTES * 1.4) { wizNotice(t('error'), t('blood_error_file_too_large'), true); return; }
      const mediaType = asset.mimeType
        || (String(asset.uri || '').toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
      setVialScanning(true);
      const { data, error } = await supabase.functions.invoke('extract-bloodwork', {
        body: { kind: 'vial', lang: language, image_base64: asset.base64, media_type: mediaType },
      });
      setVialScanning(false);
      if (error) {
        const status = error.context?.status;
        let code = null;
        let errBody = null;
        try { errBody = await error.context?.clone?.().json(); code = errBody?.code; } catch { /* body unavailable */ }
        if (code === 'quota_exceeded' || status === 429) {
          wizNotice(t('vial_scan_quota_title'), fillQuotaMessage(t('vial_scan_quota_sub'), quotaLimitFrom(errBody)), true);
          return;
        }
        const serviceDown = ['provider_error', 'not_configured', 'internal_error'].includes(code)
          || (code == null && [500, 502, 503].includes(status));
        wizNotice(
          serviceDown ? t('blood_error_service') : t('vial_scan_error'),
          serviceDown ? t('vial_scan_error_service_sub') : t('vial_scan_error_sub'),
          true,
        );
        return;
      }
      const v = data?.vial;
      if (!v || (v.compound_name == null && v.amount == null && v.concentration == null)) {
        wizNotice(t('vial_scan_error'), t('vial_scan_none'), true);
        return;
      }
      applyVialScan(v);
    } catch (err) {
      setVialScanning(false);
      wizNotice(t('vial_scan_error'), t('vial_scan_error_sub'), true);
    }
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

  function showMissingName() {
    setWizSheet({ title: t('protocols_missing_name'), body: t('protocols_missing_name_msg'), buttons: [{ label: t('ok'), kind: 'primary' }] });
  }

  async function saveProtocol() {
    if (!name) {
      showMissingName();
      return;
    }
    // Guard: never persist a protocol whose dose can't be drawn correctly.
    if (doseStepBlocked) {
      setStep(3);
      showCheckValues();
      return;
    }
    setSaving(true);
    // Never persist an invalid start_date (a bad picker value must not reach the
    // cloud as e.g. 1969). Clamp to a valid YYYY-MM-DD, falling back to today.
    const safeStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : todayISO();
    try {
    const user = await getCachedUser();
    if (!user) { setSaving(false); wizError(t('protocols_not_signed_in')); return; }

    if (editingId) {
      // Only what the user changed is written (founder decision 2, 2026-10-02): the form
      // as opened and the form now go through the same builder; equal fields are left alone.
      const patch = editStartRef.current ? editPatch(editStartRef.current, currentForm(), frequencyLabel) : {};
      // Did the timing actually move? Only then should we clear already-delivered
      // banners (a rename or color change must NOT drop a still-pending reminder).
      const scheduleChanged = ['reminder_time', 'doses_per_day', 'interval_days', 'start_date'].some(k => k in patch);
      if (Object.keys(patch).length) updateProtocol(editingId, patch);

      // RTU vial: only the vial fields the edit changed; a vial is created only when the
      // user's change describes one and there is none yet.
      const vialPatch = editStartRef.current ? rtuVialPatch(editStartRef.current, currentForm()) : null;
      if (vialPatch) {
        const existing = vialsByProtocol[editingId];
        if (existing) updateVial(existing.id, vialPatch);
        else insertVial({ user_id: user.id, protocol_id: editingId, doses_taken: 0, ...rtuVialFields(currentForm()) });
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
      if (activeCount >= FREE_PROTOCOL_LIMIT && !(await hasPremium())) {
        setSaving(false);
        closeWizard();
        promptUpgrade();
        return;
      }
      // RTU has no dilution: the vial's total compound (concentration × bottle volume) is
      // stored in `amount` (lib/protocolForm protocolPayload) so the card shows "X mg vial".
      const newId = insertProtocol({ user_id: user.id, ...protocolPayload(currentForm(), frequencyLabel), start_date: safeStart });

      if (type === 'recon' && !skipVial) {
        insertVial({
          user_id: user.id, protocol_id: newId,
          mixed_on: toPastSupabaseDate(vialMonth, vialDay),
          water_ml: parseDecimal(water) || null,
          // Vial capacity is derived (vial amount ÷ dose), not asked.
          total_doses: dosesPerVial({ amount, unit, dose, doseUnit }),
          doses_taken: 0,
        });
      }

      // Ready-to-use vial: injections = (concentration × ml) ÷ dose; optional
      // expiry from the box (month/year → last day of that month).
      const rtuVial = rtuVialFields(currentForm());
      if (rtuVial) insertVial({ user_id: user.id, protocol_id: newId, doses_taken: 0, ...rtuVial });
      setSaving(false);
      const protocolData = getProtocolById(newId);
      if (protocolData) scheduleDoseReminder(protocolData).catch(() => {});
      Analytics.protocolCreated({ name, type, dose, dose_unit: doseUnit, frequency: frequencyLabel(intervalDays), goal: goals.join(',') });

      // Started before installing the app? Offer to backfill the elapsed scheduled
      // doses as Taken so adherence + history reflect them (the curve already reads
      // the schedule). Applies to every type. Only when the start date is in the past.
      const todayStr = new Date().toISOString().split('T')[0];
      const pastCount = (protocolData && safeStart < todayStr) ? elapsedDoseSlots(protocolData, Date.now()).length : 0;
      if (pastCount > 0) {
        // Shown once the add sheet is gone (screenSheet waits for it).
        setScreenSheet({
          title: t('protocols_backfill_title'),
          body: t('protocols_backfill_msg').replace('{n}', String(pastCount)).replace('{date}', formatStartDate(safeStart)),
          buttons: [
            { label: t('protocols_backfill_no'), kind: 'secondary' },
            {
              label: t('protocols_backfill_yes').replace('{n}', String(pastCount)),
              kind: 'primary',
              onPress: () => {
                try { backfillTakenDoses(newId); } catch { /* best-effort */ }
                notifyDataChanged('protocol');
                requestSync();
                fetchProtocols();
              },
            },
          ],
        });
      }
    }
    requestSync();
    // Refresh every mounted screen right away (Today, etc.) — don't wait for the
    // network sync to complete, which never fires when offline.
    notifyDataChanged('protocol');
    closeWizard();
    fetchProtocols();
    } catch (err) {
      setSaving(false);
      wizError(friendlyError(err, t, 'error_save_failed'));
    }
  }

  // Advance one wizard step, honoring the step-3 dose-safety guard (same rule the
  // old top-right "Next" used). Save has its own guard inside saveProtocol, so the
  // footer's Save can be tapped from any step.
  function showCheckValues() {
    // Part 21: no icon, the button reads OK (prototype sheetHTML).
    setWizSheet({
      title: t('protocols_check_values_title'),
      body: unitMismatch ? t('protocols_unit_mismatch') : drawExceedsMsg,
      buttons: [{ label: t('ok'), kind: 'primary' }],
    });
  }

  function goNext() {
    // Step 1 needs a name (founder decision 3, prototype wnext): the typed text is taken —
    // the listed compound when it matches one, else the user's own label; an empty field
    // shows "Missing name". A protocol is never saved as "Your compound".
    if (step === 1) {
      const r = nameOnNext(searchQuery, compoundId, name, getCompoundKeys().map(key => ({ key, label: t(key) })));
      if (r.action === 'missing') { showMissingName(); return; }
      if (r.action === 'select') selectCompound({ key: r.key, label: r.label });
      if (r.action === 'custom') { setSearchQuery(r.name); addCustomCompound(r.name); }
    }
    if (step === 3 && doseStepBlocked) {
      showCheckValues();
      return;
    }
    if (step < totalSteps) setStep(step + 1);
  }

  // The sheet keeps showing what it held (an edited protocol stays "Edit protocol") while
  // it slides away; the form resets once it is hidden (the effect on wizardPresented).
  function closeWizard() {
    resetOnHiddenRef.current = true;
    setShowModal(false);
  }

  // Cancel (part 20, approved P6): a new protocol with something typed asks before what
  // was entered is lost (Cancel keeps editing, Discard in risk closes); otherwise it closes.
  function cancelWizard() {
    if (!editingId && hasNewProtocolInput(currentForm(), searchQuery)) {
      setWizSheet({
        title: t('protocols_discard_title'),
        body: t('protocols_discard_body'),
        buttons: [
          { label: t('cancel'), kind: 'secondary' },
          { label: t('protocols_discard'), kind: 'danger', onPress: closeWizard },
        ],
      });
      return;
    }
    closeWizard();
  }

  async function deleteProtocol(id) {
    setScreenSheet({
      title: t('protocols_delete_title'),
      body: t('protocols_delete_confirm_settings'),
      buttons: [
        { label: t('cancel'), kind: 'secondary' },
        {
          label: t('protocols_delete'), kind: 'danger',
          onPress: () => {
            const target = protocols.find(p => p.id === id);
            softDeleteProtocol(id);
            deactivateVialsByProtocol(id);
            cancelDoseReminder(id).catch(() => {});
            dismissDeliveredDoseReminders(id).catch(() => {}); // clear any lingering banner
            if (target) Analytics.protocolDeactivated(target);
            closeProtocol(); // back to the list (and off the book's right page)
            fetchProtocols();
            notifyDataChanged('protocol'); // refresh Today immediately
            requestSync();
          },
        },
      ],
    });
  }


  // Free tier: up to 5 active protocols; premium unlocks unlimited. The gate
  // uses a FRESH DB count (not the possibly-stale `protocols` state) so a rapid
  // second Add right after a save can't slip an extra protocol through.
  function promptUpgrade() {
    setScreenSheet({
      title: t('protocols_limit_title'),
      body: t('protocols_limit_msg'),
      buttons: [
        { label: t('cancel'), kind: 'secondary' },
        { label: t('protocols_limit_upgrade'), kind: 'primary', onPress: () => navigation.navigate('Paywall', { source: 'protocol_limit' }) },
      ],
    });
  }

  async function isOverFreeLimit() {
    const user = await getCachedUser();
    const count = user ? (getActiveProtocols(user.id) || []).length : protocols.length;
    return count >= FREE_PROTOCOL_LIMIT && !(await hasPremium());
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
    onNoteDraft(id, null);
    fetchProtocols();
    requestSync();
  }

  // New vial / New bottle ask first (part 10, approved P5): Cancel changes nothing, Start new
  // runs the reset below. Doses already logged stay in the history either way.
  function askRefillVial(id) {
    setScreenSheet({
      title: t('protocols_new_vial'),
      body: t('protocols_new_vial_body'),
      buttons: [
        { label: t('cancel'), kind: 'secondary' },
        { label: t('protocols_start_new'), kind: 'primary', onPress: () => refillVial(id) },
      ],
    });
  }
  function askRefillBottle(id) {
    setScreenSheet({
      title: t('protocols_serving_new_bottle'),
      body: t('protocols_new_bottle_body'),
      buttons: [
        { label: t('cancel'), kind: 'secondary' },
        { label: t('protocols_start_new'), kind: 'primary', onPress: () => refillOralBottle(id) },
      ],
    });
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
    <ProtocolListCard
      key={p.id} p={p} vial={vialsByProtocol[p.id]} onOpen={openProtocolById} t={t}
      book={book} selected={book && p.id === bookOpenId}
    />
  );

  // Which view the tab shows: the two heroes, the list, or one protocol's screen.
  const openProtocol = showList && openId != null ? (protocols.find(p => p.id === openId) || null) : null;
  const view = openProtocol ? 'detail' : showList ? 'list' : 'heroes';
  // Book: the protocol on the right page (BK-4).
  const bookProtocol = book && bookOpenId != null ? (protocols.find(p => p.id === bookOpenId) || null) : null;
  const zoomProtocol = zoom.id != null ? (protocols.find(p => p.id === zoom.id) || null) : null;

  // The protocol screen, shared by the phone column and the book's right page.
  const renderDetail = (p, inBook) => (
    <ProtocolDetail
      key={p.id}
      p={p} vial={vialsByProtocol[p.id]}
      openEdit={inBook ? (q, st) => { claimBookProtocol(q.id); openEdit(q, st); } : openEdit}
      deleteProtocol={deleteProtocol}
      onSaveNote={saveProtocolNote} onRefill={askRefillBottle} onRefillVial={askRefillVial}
      onZoom={(id) => { if (inBook) claimBookProtocol(id); setZoom({ id, open: true }); }}
      draft={getDraft(noteDraftKey(p.id))}
      onDraft={(id, text) => { if (inBook && text != null) claimBookProtocol(id); onNoteDraft(id, text); }}
      t={t}
    />
  );

  // The list's sort pills and cards, shared by the phone list and the book's left page.
  const sortPills = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.sortScroll} contentContainerStyle={s.sortRow}>
      <Text style={s.sortLabel}>{t('protocols_sort_by')}</Text>
      {SORT_OPTIONS.map(o => (
        <Pill key={o.key} s={s} label={t(o.label)} on={sortBy === o.key} onPress={() => changeSort(o.key)} short />
      ))}
    </ScrollView>
  );
  const listCards = sortBy === 'type' ? (
    <>
      {[
        ['protocols_section_lyophilized', reconProtocols],
        ['protocols_section_rtu', rtuProtocols],
        ['protocols_section_oral', oralProtocols],
      ].filter(([, list]) => list.length > 0).map(([key, list]) => (
        <View key={key} style={s.blk}>
          <Text style={s.secth}>{t(key)}</Text>
          {list.map(renderCard)}
        </View>
      ))}
    </>
  ) : (
    <View style={s.blk}>{sortedProtocols().map(renderCard)}</View>
  );
  const emptyState = (
    <View style={s.emptyCard}>
      <FeatureIcon name="type_vial" size={40} color={colors.ink2} />
      <Text style={s.emptyTitle}>{t('protocols_empty_title')}</Text>
      <Text style={s.emptySub}>{t('protocols_empty_sub')}</Text>
      <TouchableOpacity style={[s.btnPrimary, s.emptyBtn]} onPress={openAdd} accessibilityRole="button">
        <Text style={s.btnPrimaryText}>{t('protocols_empty_btn')}</Text>
      </TouchableOpacity>
    </View>
  );
  // Prototype list(): "Recently deleted" at the bottom of the list, only when something was
  // deleted. Each row: the protocol color as a 9 pt dot, the name, "Deleted Nd ago", a
  // Restore pill and the risk-colored delete-forever trash (with its confirm).
  const deletedSection = deletedProtocols.length > 0 ? (
    <View style={s.blk}>
      <Text style={s.secth}>{t('protocols_recently_deleted')}</Text>
      <View style={s.delList}>
        {deletedProtocols.map((p, idx) => (
          <View key={p.id} style={[s.delRow, idx > 0 && s.delRowLine]}>
            <View style={[s.delDot, { backgroundColor: displayColor(p.color) || colors.ink3 }]} />
            <View style={s.delText}>
              <Text style={s.delName} numberOfLines={2}>{protocolName(p)}</Text>
              <Text style={s.delAgo}>{t('protocols_deleted_ago').replace('{days}', Math.ceil((Date.now() - new Date(p.deleted_at).getTime()) / 86400000))}</Text>
            </View>
            <TouchableOpacity onPress={() => restoreProtocol(p.id)} style={s.restoreBtn} accessibilityRole="button">
              <Text style={s.restoreBtnText}>{t('protocols_restore')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => confirmPermanentDelete(p)}
              accessibilityRole="button"
              accessibilityLabel={t('settings_delete_forever')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={s.deleteForeverBtn}
            >
              <FeatureIcon name="trash" size={22} color={colors.risk} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  ) : null;

  // Add step 3: the live result sits under the fields it depends on and appears only
  // once it can be computed (founder 2026-09-29).
  const [liveW, setLiveW] = useState(0);
  const showLiveDraw = type !== 'oral' && !unitMismatch && !!drawML && (drawValid || drawExceedsSyringe);
  const wizServing = type === 'oral'
    ? computeServings({
        targetDose: dose, doseUnit, servingStrength, servingStrengthUnit, servingUnits,
        form: notes, divisible: divisible == null ? undefined : divisible,
      })
    : null;

  const addButton = (
    <TouchableOpacity style={s.addBtn} onPress={openAdd} accessibilityRole="button">
      <Text style={s.addBtnText}>{t('protocols_add')}</Text>
    </TouchableOpacity>
  );
  // A unit choice sits beside its number field: the shared bar fills the other half of the row.
  const unitSeg = (units, value, setter, suffix = '') => (
    <SegmentedBar style={s.unitBar} items={units.map(u => ({ key: u, label: `${u}${suffix}` }))} value={value} onChange={setter} />
  );
  const iosPicker = Platform.OS === 'ios';
  // The time wheel follows the user's clock (Settings 12h / 24h, else the language), and its
  // AM / PM words are the locale's own (lib/timeFormat).
  const wheel12h = !/13/.test(formatTime('13:00', language, timeFormat));
  const dayParts = [
    formatTime('09:00', language, '12h').replace(/\d{1,2}[:.]\d{2}/, '').trim() || 'AM',
    formatTime('21:00', language, '12h').replace(/\d{1,2}[:.]\d{2}/, '').trim() || 'PM',
  ];

  return (
    <SafeAreaView style={s.container}>
      {/* S-26 book layout: two pages when the window is wide (BK-4). The sheets below sit
          outside this switch, so a fold or unfold never closes them (BK-10, BK-11). */}
      {book ? (
        <BookPanes
          rightKey={bookProtocol ? String(bookProtocol.id) : 'none'}
          left={
            <>
              <View style={s.header}>
                <Text style={s.headerTitle} accessibilityRole="header">{t('protocols_title')}</Text>
                {addButton}
              </View>
              <ScrollView showsVerticalScrollIndicator={false} style={s.scroll} contentContainerStyle={s.centered}>
                {protocols.length === 0 && !loading && emptyState}
                {protocols.length > 0 && sortPills}
                {protocols.length > 0 && listCards}
                {deletedSection}
                <View style={s.bottomPad} />
              </ScrollView>
            </>
          }
          right={bookProtocol ? (
            <>
              <View style={[s.header, s.headerEnd]}>
                <TouchableOpacity style={s.addBtn} onPress={() => { claimBookProtocol(bookProtocol.id); openEdit(bookProtocol); }} accessibilityRole="button">
                  <Text style={s.addBtnText}>{t('protocols_edit')}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} style={s.scroll} contentContainerStyle={s.centered}>
                {renderDetail(bookProtocol, true)}
                <View style={s.bottomPad} />
              </ScrollView>
            </>
          ) : null}
        />
      ) : (
      <>
      <View style={view === 'heroes' ? s.header : s.navrow}>
        {view === 'detail' ? (
          <>
            <TouchableOpacity style={s.backBtn} onPress={closeProtocol} accessibilityRole="button" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <View style={s.backChev}><RowChevron color={colors.ink} /></View>
              <Text style={s.backText}>{t('today_protocols')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.addBtn} onPress={() => openEdit(openProtocol)} accessibilityRole="button">
              <Text style={s.addBtnText}>{t('protocols_edit')}</Text>
            </TouchableOpacity>
          </>
        ) : view === 'list' ? (
          <TouchableOpacity style={s.backBtn} onPress={() => setShowList(false)} accessibilityRole="button" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <View style={s.backChev}><RowChevron color={colors.ink} /></View>
            <Text style={s.backText}>{t('protocols_title')}</Text>
          </TouchableOpacity>
        ) : (
          <>
            <Text style={s.headerTitle}>{t('protocols_title')}</Text>
            {addButton}
          </>
        )}
      </View>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} style={s.scroll} contentContainerStyle={s.centered}>
        {view === 'heroes' && protocols.length > 0 && (() => {
          const low = protocols.filter(p => vialsByProtocol[p.id] && supplyState(vialsByProtocol[p.id], p).low).map(p => (p.compound_id ? t(p.compound_id) : p.name));
          // Part 1: the last completed dose under the counts (prototype "Last: TB-500 · Mon 7:42 PM").
          const lastP = lastLog ? protocols.find(p => p.id === lastLog.protocol_id) : null;
          const lastName = lastP ? protocolName(lastP) : (lastLog && lastLog.protocol_name) || '';
          const lastLine = lastLog && lastName
            ? t('protocols_log_last').replace('{name}', lastName).replace('{when}', lastLogWhen(lastLog.logged_at, new Date(), LOCALE_MAP[language] || 'en-US', (hm) => formatTime(hm, language, timeFormat)))
            : null;
          return (
            <View style={s.heroes}>
              <TouchableOpacity style={s.hero} activeOpacity={0.75} onPress={() => setShowList(true)} accessibilityRole="button">
                <View style={s.heroHead}>
                  <FeatureIcon name="type_vial" size={22} color={colors.ink2} />
                  <Text style={s.heroTitle}>{t('today_protocols')}</Text>
                  <RowChevron color={colors.tick} />
                </View>
                <View style={s.heroBig}>
                  <Text style={s.heroNum}>{protocols.length}</Text>
                  <Text style={s.heroUnit}>{t('protocols_active')}</Text>
                </View>
                <View style={s.heroNames}>
                  {protocols.map(p => (
                    <View key={p.id} style={s.heroNameRow}>
                      <View style={[s.heroDot, { backgroundColor: displayColor(p.color) || colors.data }]} />
                      <Text style={s.heroName}>{p.compound_id ? t(p.compound_id) : p.name}</Text>
                    </View>
                  ))}
                </View>
                {low.length > 0 && (
                  <View style={s.heroLowRow}>
                    <View style={[s.heroDot, { backgroundColor: colors.attention }]} />
                    <Text style={s.heroLow}>{t('today_alert_supply_list').replace('{names}', low.join(', '))}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={s.hero} activeOpacity={0.75} onPress={() => navigation.navigate('Log')} accessibilityRole="button">
                <View style={s.heroHead}>
                  <FeatureIcon name="journal" size={22} color={colors.ink2} />
                  <Text style={s.heroTitle}>{t('log_title')}</Text>
                  <RowChevron color={colors.tick} />
                </View>
                <View style={s.trio}>
                  {[['Taken', 'log_taken', colors.ok], ['Skipped', 'log_skipped', colors.ink2], ['Missed', 'log_missed', colors.risk]].map(([k, key, col]) => (
                    <View key={k} style={s.trioCell}>
                      <Text style={s.trioNum}>{logCounts[k]}</Text>
                      <View style={s.trioLabelRow}>
                        <View style={[s.heroDotSm, { backgroundColor: col }]} />
                        <Text style={s.trioLabel}>{t(key)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
                {lastLine ? <Text style={s.heroLast}>{lastLine}</Text> : null}
              </TouchableOpacity>
            </View>
          );
        })()}

        {view === 'list' && (
          <View style={s.hrow}>
            <Text style={s.listTitle} accessibilityRole="header">{t('today_protocols')}</Text>
            {addButton}
          </View>
        )}

        {view !== 'detail' && protocols.length === 0 && !loading && emptyState}

        {view === 'list' && protocols.length > 0 && sortPills}

        {view === 'list' && protocols.length > 0 && listCards}

        {/* At the bottom of the list; with no protocol left it sits under the empty state,
            so the last deleted protocol can still be restored. */}
        {(view === 'list' || (view === 'heroes' && protocols.length === 0)) && deletedSection}

        {view === 'detail' && renderDetail(openProtocol, false)}

        <View style={s.bottomPad} />
      </ScrollView>
      </>
      )}

      {/* Delete / limit / log past doses: held back until the add sheet is gone. */}
      <DTSheet config={wizardPresented ? null : screenSheet} onClose={() => setScreenSheet(null)} />

      {/* Part 18: a free-feature explainer on the first visit (never over the add / edit sheet). */}
      {!showModal && !wizardPresented && <FeatureExplainerGate candidates={protocolExplainers} />}

      {/* The enlarged syringe, held here so a fold or unfold never closes it (BK-10). */}
      <SyringeZoomSheet p={zoomProtocol} visible={zoom.open} onClose={() => setZoom(z => ({ ...z, open: false }))} t={t} />

      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onDismiss={() => setWizardPresented(false)}
        onRequestClose={() => {
          // Android system back (edge-swipe / nav-bar button): step back, or close
          // from the first step — mirrors the footer Back, so it's reachable
          // without hitting the top of the screen.
          if (step > 1) setStep(step - 1);
          else cancelWizard();
        }}
      >
        <SafeAreaView style={s.modal}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Cancel top-left, the title, Save top-right while editing (approved 2026-09-29). */}
          <View style={s.wnav}>
            <TouchableOpacity style={s.wnavSide} onPress={cancelWizard} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button">
              <Text style={s.wnavCancel}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={s.wnavTitle} numberOfLines={1}>{editingId ? t('protocols_edit_protocol') : t('protocols_new_protocol')}</Text>
            {editingId ? (
              <TouchableOpacity style={[s.wnavSide, s.wnavRight]} onPress={saveProtocol} disabled={saving} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button">
                <Text style={s.wnavSave} numberOfLines={1}>{saving ? t('protocols_saving') : t('save')}</Text>
              </TouchableOpacity>
            ) : <View style={s.wnavSide} />}
          </View>

          <View style={s.prog}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <View key={i} style={[s.progSeg, i < step && s.progSegOn]} />
            ))}
          </View>

          <ScrollView style={s.modalBody} contentContainerStyle={s.wiz} showsVerticalScrollIndicator={false}>

            {step === 1 && (
              <>
                <View style={s.wt}>
                  <Text style={s.wtTitle}>{editingId ? t('protocols_edit_compound') : t('protocols_step_name')}</Text>
                  <Text style={s.wtSub}>{t('protocols_step_name_sub')}</Text>
                </View>

                <Fld s={s} label={t('protocols_type')}>
                  <View style={s.tiles}>
                    {[
                      { val: 'recon', icon: 'type_vial', label: t('protocols_lyophilized'), sub: t('protocols_mix_with_water') },
                      { val: 'rtu', icon: 'syringe', label: t('protocols_rtu'), sub: t('protocols_pre_mixed') },
                      { val: 'oral', icon: 'type_capsule', label: t('protocols_oral'), sub: t('protocols_supplement') },
                    ].map((typeOpt) => {
                      const on = type === typeOpt.val;
                      return (
                        <TouchableOpacity
                          key={typeOpt.val}
                          style={[s.tile, on && s.tileOn]}
                          onPress={() => {
                            setType(typeOpt.val);
                            setName('');
                            setCompoundId(null);
                            setSearchQuery('');
                            setShowSuggestions(false);
                          }}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                        >
                          <FeatureIcon name={typeOpt.icon} size={26} color={on ? colors.ink : colors.ink2} />
                          <Text style={[s.tileLabel, on && s.tileLabelOn]}>{typeOpt.label}</Text>
                          <Text style={s.tileSub}>{typeOpt.sub}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </Fld>

                <Fld s={s} label={t('protocols_compound_name')}>
                  {compoundId && BLEND_IDS.includes(compoundId) && (
                    <Text style={s.footC2}>{t('blend_curve_note')}</Text>
                  )}
                  {compoundId && compoundId.startsWith('rtu_insulin_') && (
                    <Text style={s.footC2}>{t('insulin_no_curve_note')}</Text>
                  )}
                  <WInput
                    s={s} c={colors}
                    placeholder={t('protocols_name_placeholder')}
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
                      <View style={s.sugg}>
                        {sugg.slice(0, 8).map((item, i) => {
                          const comp = blendComposition(item.key, t);
                          return (
                            <TouchableOpacity
                              key={item.key}
                              style={[s.suggRow, i > 0 && s.suggSep]}
                              onPressIn={() => selectCompound(item)}
                            >
                              <View style={s.suggMain}>
                                <Text style={s.suggText}>{item.label}</Text>
                                {comp && (
                                  <Text style={s.suggSub}>{comp} · {t('blend_varies_hint')}</Text>
                                )}
                              </View>
                              {compoundId === item.key ? <CheckMark size={18} color={colors.ink} /> : null}
                            </TouchableOpacity>
                          );
                        })}
                        {sugg.length > 8 && (
                          <View style={[s.suggRow, s.suggSep]}>
                            <Text style={s.suggSub}>+{sugg.length - 8} {t('protocols_more_results')}</Text>
                          </View>
                        )}
                        {showAdd && (
                          <TouchableOpacity
                            style={[s.suggRow, sugg.length > 0 && s.suggSep]}
                            onPressIn={addCustomCompound}
                          >
                            <Text style={s.suggAdd}>
                              {t('protocols_add_custom').replace('{name}', searchQuery.trim())}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })()}
                </Fld>

                {name && !compoundId ? (
                  <Text style={[s.footAttn, s.flush]}>{t('protocols_custom_hint')}</Text>
                ) : null}
                <Text style={[s.footC3, s.flush]}>{t('protocols_spelling_note')}</Text>
              </>
            )}

            {step === 2 && (() => {
              // Colors already taken by *other* active protocols (exclude the one
              // being edited so its own color isn't flagged against itself).
              const usedColors = new Set(
                protocols.filter(p => p.id !== editingId && p.color).map(p => displayColor(p.color))
              );
              return (
                <>
                  <View style={s.wt}>
                    <Text style={s.wtTitle}>{t('protocols_step_color')}</Text>
                    <Text style={s.wtSub}>{t('protocols_step_color_sub')}</Text>
                  </View>
                  <View style={s.prev}>
                    <View style={[s.prevDot, { backgroundColor: color }]} />
                    <Text style={s.prevName}>{name || t('protocols_your_compound')}</Text>
                    {colorNameKey(color) ? <Text style={s.prevSub}>{t(colorNameKey(color))}</Text> : null}
                  </View>
                  <View style={s.swatches}>
                    {PALETTE.map(({ hex: col }) => {
                      const on = sameColor(color, col);
                      return (
                        <View key={col} style={s.swCell}>
                          <TouchableOpacity
                            style={s.swHit}
                            onPress={() => setColor(col)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: on }}
                            accessibilityLabel={t(colorNameKey(col))}
                          >
                            {on && <View style={s.swRingOn} />}
                            <View style={[s.sw, { backgroundColor: col }]} />
                            {usedColors.has(col) && <View style={s.usedMk} />}
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                  {usedColors.size > 0 && (
                    <View style={s.legendRow}>
                      <View style={[s.usedMk, s.usedMkInline]} />
                      <Text style={[s.footC2, s.flush, { flex: 1 }]}>{t('protocols_color_in_use_legend').replace(/^●\s*/, '')}</Text>
                    </View>
                  )}
                  {usedColors.has(color) && <WarnBox s={s} text={t('protocols_color_dup_warning')} />}
                  <Text style={[s.footC2, s.flush]}>{t('protocols_color_tip')}</Text>
                </>
              );
            })()}

            {step === 3 && (
              <>
                <View style={s.wt}>
                  <Text style={s.wtTitle}>{t('protocols_step_dose')}</Text>
                  <Text style={s.wtSub}>{t('protocols_step_dose_sub')}</Text>
                </View>

                {type !== 'oral' && vialScanned && <WarnBox s={s} text={t('vial_scan_review')} />}
                {type !== 'oral' && (
                  <TouchableOpacity
                    style={s.obtn2}
                    onPress={handleVialScanPress}
                    disabled={vialScanning}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                  >
                    {vialScanning ? (
                      <ActivityIndicator size="small" color={colors.ink} />
                    ) : (
                      <FeatureIcon name="scan" size={20} color={colors.ink} />
                    )}
                    <Text style={s.obtn2Text}>
                      {vialScanning ? t('vial_scan_scanning') : t('vial_scan_cta')}
                    </Text>
                  </TouchableOpacity>
                )}

                {type === 'oral' && (
                  <>
                    <Fld s={s} label={t('protocols_dose_amount')}>
                      <View style={s.inrow}>
                        <WInput s={s} c={colors} style={s.inrowInput} placeholder={`${t('protocols_eg')} 500`} keyboardType="numeric" value={dose} onChangeText={setDose} />
                        {unitSeg(['mg', 'mcg', 'IU', 'g'], doseUnit, setDoseUnit)}
                      </View>
                    </Fld>
                    <Fld s={s} label={t('protocols_form')}>
                      <View style={s.pills}>
                        {[
                          { val: 'Capsule', key: 'protocols_capsule' },
                          { val: 'Tablet', key: 'protocols_tablet' },
                          { val: 'Powder', key: 'protocols_powder' },
                          { val: 'Liquid', key: 'protocols_liquid' },
                          { val: 'Gummy', key: 'protocols_gummy' },
                          { val: 'Softgel', key: 'protocols_softgel' },
                        ].map((formType) => (
                          <Pill key={formType.val} s={s} label={t(formType.key)} on={notes === formType.val} onPress={() => setNotes(notes === formType.val ? '' : formType.val)} />
                        ))}
                      </View>
                    </Fld>
                    {['Capsule', 'Tablet', 'Softgel', 'Gummy'].includes(notes) && (
                      <Fld s={s} label={t('protocols_divisible_q')}>
                        {/* Optional: tapping the chosen answer clears it (as before). */}
                        <SegmentedBar
                          allowDeselect
                          items={[
                            { key: 'yes', label: t('protocols_divisible_yes') },
                            { key: 'no', label: t('protocols_divisible_no') },
                          ]}
                          value={divisible === true ? 'yes' : divisible === false ? 'no' : null}
                          onChange={(k) => setDivisible(k === 'yes' ? true : k === 'no' ? false : null)}
                        />
                      </Fld>
                    )}
                    <Fld s={s} label={t('protocols_serving_strength')} hint={t('protocols_serving_strength_hint')}>
                      <View style={s.inrow}>
                        <WInput s={s} c={colors} style={s.inrowInput} placeholder={`${t('protocols_eg')} 1600`} keyboardType="numeric" value={servingStrength} onChangeText={setServingStrength} />
                        {unitSeg(['mg', 'mcg', 'IU', 'g'], servingStrengthUnit, setServingStrengthUnit)}
                      </View>
                    </Fld>
                    <Fld s={s} label={t('protocols_serving_units')} hint={t('protocols_serving_units_hint')}>
                      <WInput s={s} c={colors} placeholder="1" keyboardType="numeric" value={servingUnits} onChangeText={setServingUnits} />
                    </Fld>
                    <Fld s={s} label={t('protocols_container_units')} hint={t('protocols_container_units_hint')}>
                      <WInput s={s} c={colors} placeholder={`${t('protocols_eg')} 60`} keyboardType="numeric" value={containerUnits} onChangeText={setContainerUnits} />
                    </Fld>
                  </>
                )}

                {type === 'recon' && (
                  <>
                    <Fld s={s} label={t('protocols_compound_amount')}>
                      <View style={s.inrow}>
                        <WInput s={s} c={colors} style={s.inrowInput} placeholder={`${t('protocols_eg')} 5`} keyboardType="numeric" value={amount} onChangeText={setAmount} />
                        {unitSeg(['mg', 'mcg', 'IU'], unit, setUnit)}
                      </View>
                    </Fld>
                    <Fld s={s} label={t('protocols_diluent')}>
                      <View style={s.pills}>
                        {DILUENT_OPTIONS.map((opt) => (
                          <Pill key={opt.val} s={s} label={t(opt.key)} on={diluentChoice === opt.val} onPress={() => setDiluentChoice(diluentChoice === opt.val ? '' : opt.val)} />
                        ))}
                      </View>
                      {diluentChoice === 'other' && (
                        <WInput s={s} c={colors} placeholder={t('protocols_diluent_other_placeholder')} value={diluentOther} onChangeText={setDiluentOther} />
                      )}
                    </Fld>
                    <Fld s={s} label={t('protocols_diluent_amount')} hint={t('protocols_steps_05')}>
                      <View style={s.stepper}>
                        <TouchableOpacity style={s.stepperBtn} onPress={() => adjustWater(-1)} accessibilityRole="button" accessibilityLabel="−0.5 ml">
                          <StepGlyph color={colors.ink} />
                        </TouchableOpacity>
                        <View style={s.stepperVal}>
                          <TextInput
                            style={s.stepperValInput}
                            value={String(water || '')}
                            onChangeText={(v) => setWater(v.replace(/[^0-9.,]/g, ''))}
                            onBlur={() => { const n = parseDecimal(water); setWater(String(!(n > 0) ? 0.5 : Math.max(0.5, n))); }}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                            placeholder="0.5"
                            placeholderTextColor={colors.ink3}
                            textAlign="center"
                          />
                          <Text style={s.stepperValUnit}>ml</Text>
                        </View>
                        <TouchableOpacity style={s.stepperBtn} onPress={() => adjustWater(1)} accessibilityRole="button" accessibilityLabel="+0.5 ml">
                          <StepGlyph plus color={colors.ink} />
                        </TouchableOpacity>
                      </View>
                    </Fld>
                    <Fld s={s} label={t('protocols_desired_dose')}>
                      <View style={s.inrow}>
                        <WInput s={s} c={colors} style={s.inrowInput} placeholder={`${t('protocols_eg')} 0.5`} keyboardType="numeric" value={dose} onChangeText={setDose} />
                        {unitSeg(['mg', 'mcg', 'IU'], doseUnit, setDoseUnit)}
                      </View>
                    </Fld>
                    {/* IU → mass converter. A trainer's protocol often reads
                        "10 IU" (syringe units) while the peptide is measured in mg.
                        Given the concentration (amount ÷ diluent) this shows the
                        real mass and can fill the dose — pure conversion, stored as
                        mass so all downstream math is unchanged. Folds (prototype .fold2). */}
                    {['mg', 'mcg'].includes(unit) && parseDecimal(amount) > 0 && parseDecimal(water) > 0 && (() => {
                      // Normalize the peptide amount to mg so the concentration is
                      // correct even when the vial is labeled in mcg.
                      const amountMg = unit === 'mcg' ? parseDecimal(amount) / 1000 : parseDecimal(amount);
                      const iuMassMg = massFromUnits(iuInput, amountMg, water);
                      const parts = iuMassMg != null ? massParts(iuMassMg) : null;
                      return (
                        <View style={s.fold2}>
                          <TouchableOpacity style={s.foldHead} onPress={() => setIuOpen(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: iuOpen }}>
                            <Text style={s.foldTitle}>{t('protocols_iu_label')}</Text>
                            <FoldChevron open={iuOpen} color={colors.ink3} />
                          </TouchableOpacity>
                          {iuOpen && (
                            <>
                              <Text style={[s.footC2, s.flush]}>{t('protocols_iu_hint')}</Text>
                              <View style={s.inrow}>
                                <WInput s={s} c={colors} style={s.inrowInput} placeholder={`${t('protocols_eg')} 10`} keyboardType="numeric" value={iuInput} onChangeText={setIuInput} />
                                <Text style={s.bodyC2}>u</Text>
                              </View>
                              {parts && (
                                <View style={s.inrow}>
                                  <Text style={s.iuEquiv}>{`${iuInput} u = ${parts.mcg} mcg (${parts.mg} mg)`}</Text>
                                  <Pill
                                    s={s}
                                    label={t('protocols_iu_use')}
                                    onPress={() => {
                                      if (iuMassMg < 1) { setDose(parts.mcg); setDoseUnit('mcg'); }
                                      else { setDose(parts.mg); setDoseUnit('mg'); }
                                    }}
                                  />
                                </View>
                              )}
                            </>
                          )}
                        </View>
                      );
                    })()}
                    <Fld s={s} label={t('protocols_syringe_size_label')}>
                      <SegmentedBar
                        items={[
                          { key: 100, label: '1 ml · 100u' },
                          { key: 50, label: '0.5 ml · 50u' },
                          { key: 30, label: '0.3 ml · 30u' },
                        ]}
                        value={syringeSize}
                        onChange={setSyringeSize}
                      />
                    </Fld>
                  </>
                )}

                {type === 'rtu' && (
                  <>
                    <Fld s={s} label={t('protocols_dose_per_injection')}>
                      <View style={s.inrow}>
                        <WInput s={s} c={colors} style={s.inrowInput} placeholder={`${t('protocols_eg')} 100`} keyboardType="numeric" value={dose} onChangeText={setDose} />
                        {unitSeg(['mg', 'mcg', 'IU'], doseUnit, setDoseUnit)}
                      </View>
                    </Fld>
                    <Fld s={s} label={t('protocols_conc_optional')}>
                      <View style={s.inrow}>
                        <WInput s={s} c={colors} style={s.inrowInput} placeholder={`${t('protocols_eg')} 200`} keyboardType="numeric" value={concentration} onChangeText={setConcentration} />
                        {unitSeg(['mg', 'mcg', 'IU'], concentrationUnit, setConcentrationUnit, '/ml')}
                      </View>
                    </Fld>
                    <Fld s={s} label={t('protocols_vial_size')} hint={t('protocols_vial_size_hint')}>
                      <WInput s={s} c={colors} placeholder={`${t('protocols_eg')} 10`} keyboardType="numeric" value={vialMl} onChangeText={setVialMl} />
                    </Fld>
                    <Fld s={s} label={t('protocols_vial_expiry')} hint={t('protocols_vial_expiry_hint')}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.hscrollWrap} contentContainerStyle={s.hscroll}>
                        {MONTH_KEYS.map((mk, idx) => (
                          <Pill key={mk} s={s} label={t(mk)} on={vialExpMonth === idx} onPress={() => setVialExpMonth(vialExpMonth === idx ? null : idx)} />
                        ))}
                      </ScrollView>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.hscrollWrap} contentContainerStyle={s.hscroll}>
                        {[0, 1, 2, 3, 4, 5].map((o) => {
                          const y = new Date().getFullYear() + o;
                          return <Pill key={y} s={s} label={String(y)} on={vialExpYear === y} onPress={() => setVialExpYear(vialExpYear === y ? null : y)} />;
                        })}
                      </ScrollView>
                    </Fld>
                  </>
                )}

                {/* The live result (prototype liveHero). */}
                {type !== 'oral' && unitMismatch && <View style={s.live}><WarnBox s={s} text={t('protocols_unit_mismatch')} /></View>}
                {showLiveDraw && (
                  <View style={s.live} onLayout={(e) => setLiveW(e.nativeEvent.layout.width)}>
                    <View style={s.drawHead}>
                      <Text style={s.drawLabel}>{t('protocols_syringe_draw_to')}</Text>
                      <View style={s.bigRow}>
                        <Text style={[s.drawBig, drawExceedsSyringe && s.drawBigRisk]}>{drawUnits}</Text>
                        <Text style={s.drawBigUnit}>{t('protocols_units')}</Text>
                      </View>
                    </View>
                    {liveW > 0 && (
                      <SyringeScale units={Number(drawUnits)} size={syringeSize} width={liveW - 36} />
                    )}
                    <Text style={s.liveMl}>{drawML} ml</Text>
                    {drawExceedsSyringe && <WarnBox s={s} risk text={drawExceedsMsg} />}
                  </View>
                )}
                {wizServing && wizServing.unitMismatch && <View style={s.live}><WarnBox s={s} text={t('protocols_serving_unit_mismatch')} /></View>}
                {wizServing && wizServing.valid && (() => {
                  const r = wizServing;
                  const unitLabel = t(r.unitKey);
                  const canShowAmount = !r.discrete || r.isAchievable;
                  return (
                    <View style={s.live}>
                      {canShowAmount ? (
                        <>
                          <Text style={s.drawLabel}>{t('protocols_syringe_based_on')}</Text>
                          <View style={s.bigRow}>
                            <Text style={s.drawBig}>{fmtServing(r.unitsNeeded)}</Text>
                            <Text style={s.drawBigUnit}>{unitLabel}</Text>
                          </View>
                        </>
                      ) : (
                        <WarnBox
                          s={s}
                          text={r.splittable
                            ? t('protocols_serving_not_half')
                            : t('protocols_serving_contains').replace('{strength}', r.perUnitDose).replace('{sunit}', doseUnit).replace('{ratio}', r.ratio)}
                        />
                      )}
                      {r.nearest && (
                        <Text style={s.nearest}>
                          {fmtServing(r.nearest.lowUnits)} {unitLabel} = {r.nearest.lowDose} {doseUnit} · {fmtServing(r.nearest.highUnits)} {unitLabel} = {r.nearest.highDose} {doseUnit}
                        </Text>
                      )}
                    </View>
                  );
                })()}
                <Text style={[s.footC3, s.flush]}>{t('protocols_calc_disclaimer')}</Text>
              </>
            )}

            {step === 4 && (
              <>
                <View style={s.wt}>
                  <Text style={s.wtTitle}>{t('protocols_step_schedule')}</Text>
                  <Text style={s.wtSub}>{t('protocols_step_schedule_sub')}</Text>
                </View>

                {/* 1 — First dose: quick pick, then custom date below */}
                <Fld s={s} label={t('protocols_first_dose')}>
                  <SegmentedBar
                    items={[
                      { key: 0, label: t('protocols_start_today') },
                      { key: 1, label: t('protocols_start_tomorrow') },
                    ]}
                    value={isStartOn(0) ? 0 : isStartOn(1) ? 1 : null}
                    onChange={setStartOffset}
                  />
                </Fld>
                {isStartOn(0) && dosesPerDay > 1 && <InfoBox s={s} text={t('protocols_first_dose_hint')} />}

                <Fld s={s} label={t('protocols_start_date')}>
                  <TouchableOpacity style={s.pickbtn} onPress={() => setShowStartPicker(v => !v)} accessibilityRole="button">
                    <FeatureIcon name="calendar" size={18} color={colors.ink} />
                    <Text style={s.pickText}>{formatStartDate(startDate)}</Text>
                  </TouchableOpacity>
                  {!iosPicker && showStartPicker && (
                    <DateTimePicker
                      value={(() => { const d = new Date(startDate + 'T12:00:00'); return isNaN(d.getTime()) ? new Date() : d; })()}
                      mode="date"
                      display="default"
                      onChange={(event, d) => {
                        setShowStartPicker(false);
                        if (event.type === 'dismissed') return;
                        if (d) { const x = new Date(d); x.setHours(12, 0, 0, 0); setStartDate(x.toISOString().split('T')[0]); }
                      }}
                    />
                  )}
                </Fld>

                {/* 2 — Interval: every day, or Custom → type N days (any interval). */}
                <Fld s={s} label={t('protocols_how_often')}>
                  <SegmentedBar
                    items={[
                      { key: 'day', label: t('protocols_every_day') },
                      { key: 'custom', label: t('protocols_custom') },
                    ]}
                    value={customIntervalOpen || intervalDays !== 1 ? 'custom' : 'day'}
                    onChange={(k) => {
                      if (k === 'day') { setCustomIntervalOpen(false); handleIntervalChange(1); }
                      else { setCustomIntervalText(intervalDays !== 1 ? String(intervalDays) : ''); setCustomIntervalOpen(true); }
                    }}
                  />
                  {(customIntervalOpen || intervalDays !== 1) && (
                    <View style={s.inrow}>
                      <Text style={s.bodyInk}>{t('protocols_every_word')}</Text>
                      <WInput
                        s={s} c={colors}
                        style={s.intervalInput}
                        keyboardType="number-pad"
                        maxLength={3}
                        value={customIntervalText}
                        placeholder="14"
                        onChangeText={(v) => {
                          const digits = v.replace(/[^0-9]/g, '');
                          setCustomIntervalText(digits);
                          const n = parseInt(digits, 10);
                          if (Number.isFinite(n) && n > 0) handleIntervalChange(n);
                        }}
                      />
                      <Text style={s.bodyInk}>{t('protocols_days_word')}</Text>
                    </View>
                  )}
                </Fld>

                {/* 3 — Doses per day (only for interval <= 2) */}
                {intervalDays <= 2 && (
                  <Fld s={s} label={t('protocols_doses_per_day')}>
                    <SegmentedBar
                      items={[1, 2, 3].map(n => ({
                        key: n,
                        label: n === 1 ? t('protocols_once') : n === 2 ? t('protocols_twice') : t('protocols_three_times'),
                      }))}
                      value={dosesPerDay}
                      onChange={handleDosesPerDayChange}
                    />
                  </Fld>
                )}

                {/* 4 — Time pickers */}
                <Fld s={s} label={t('protocols_what_time')}>
                  <View style={s.pickCol}>
                    {reminderTimes.map((rt, idx) => (
                      <TouchableOpacity key={idx} style={s.pickbtn} onPress={() => { setActiveTimeIndex(idx); setShowTimePicker(true); }} accessibilityRole="button">
                        <FeatureIcon name="clock" size={18} color={colors.ink} />
                        {reminderTimes.length > 1 && (
                          <Text style={s.pickTextC2}>{t('protocols_dose_label')} {idx + 1}</Text>
                        )}
                        <Text style={s.pickTime}>{formatTimeAMPM(rt)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {!iosPicker && showTimePicker && (
                    <DateTimePicker
                      value={timePickerValue()}
                      mode="time"
                      is24Hour={false}
                      minuteInterval={1}
                      display="default"
                      onChange={(event, selectedDate) => {
                        setShowTimePicker(false);
                        if (selectedDate) applyPickedTime(selectedDate);
                      }}
                    />
                  )}
                </Fld>

                {/* Wellness goals */}
                <Fld s={s} label={t('protocols_wellness_goal')}>
                  <View style={s.pills}>
                    {getWellnessKeys().map((gKey) => (
                      <Pill key={gKey} s={s} label={t(gKey)} on={goals.includes(gKey)} onPress={() => setGoals(prev => prev.includes(gKey) ? prev.filter(g => g !== gKey) : [...prev, gKey])} />
                    ))}
                  </View>
                </Fld>

                {/* Blend composition — "what's in the vial". Blends only. A journal
                    label; it does NOT change the serum curve (which stays half-life only). */}
                {compoundId && BLEND_IDS.includes(compoundId) && (
                  <Fld s={s} label={t('protocols_composition_label')} hint={t('protocols_composition_hint')}>
                    <WInput s={s} c={colors} placeholder={t('protocols_composition_placeholder')} value={composition} onChangeText={setComposition} />
                  </Fld>
                )}

                {/* Free-text note — available on every protocol type */}
                <Fld s={s} label={t('protocols_notes_optional')}>
                  <WInput
                    s={s} c={colors}
                    style={s.winpMulti}
                    placeholder={type === 'oral' ? t('protocols_notes_placeholder_oral') : t('protocols_notes_placeholder')}
                    multiline
                    value={note}
                    onChangeText={setNote}
                  />
                </Fld>
              </>
            )}

            {step === 5 && type === 'recon' && !editingId && (
              <>
                <View style={s.wt}>
                  <Text style={s.wtTitle}>{t('protocols_step_vial')}</Text>
                  <Text style={s.wtSub}>{t('protocols_step_vial_sub')}</Text>
                </View>
                {!skipVial ? (
                  <>
                    <Fld s={s} label={t('protocols_date_mixed')}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.hscrollWrap} contentContainerStyle={s.hscroll}>
                        {MONTH_KEYS.map((mk, idx) => (
                          <Pill key={mk} s={s} label={t(mk)} on={vialMonth === idx} onPress={() => setVialMonth(idx)} />
                        ))}
                      </ScrollView>
                      <View style={s.inrow}>
                      <Text style={s.bodyC2}>{t('protocols_mix_day')}</Text>
                      <WInput
                        s={s} c={colors}
                        style={s.dayInput}
                        placeholder={t('protocols_day_dd')}
                        keyboardType="numeric"
                        maxLength={2}
                        value={vialDay}
                        onChangeText={(val) => {
                          const num = parseInt(val);
                          if (val === '' || (num >= 1 && num <= 31)) setVialDay(val);
                        }}
                      />
                      </View>
                    </Fld>
                    <Fld s={s} label={t('protocols_vial_valid')} hint={t('protocols_vial_valid_hint')}>
                      <WInput
                        s={s} c={colors}
                        placeholder={String(DEFAULT_VALID_DAYS)}
                        keyboardType="numeric"
                        maxLength={3}
                        value={vialValidDays}
                        onChangeText={(val) => { if (val === '' || /^\d+$/.test(val)) setVialValidDays(val); }}
                      />
                    </Fld>
                    <InfoBox s={s} text={t('protocols_bac_info')} />
                    <TouchableOpacity style={s.linkBtn} onPress={() => setSkipVial(true)} accessibilityRole="button">
                      <Text style={s.linkText}>{t('protocols_skip_vial')}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <InfoBox s={s} text={t('protocols_skipped_msg')} />
                    <TouchableOpacity style={s.linkBtn} onPress={() => setSkipVial(false)} accessibilityRole="button">
                      <Text style={s.linkText}>{t('protocols_add_date').replace(/^←\s*/, '')}</Text>
                    </TouchableOpacity>
                  </>
                )}
                <RowsBlock
                  s={s}
                  style={s.blkD}
                  title={sentenceCase(t('protocols_summary'))}
                  rows={[
                    { label: t('protocols_compound_label'), value: name || '—' },
                    { label: t('protocols_amount_label'), value: amount ? `${amount} ${unit}` : '—' },
                    { label: t('protocols_water_label'), value: water ? `${water} ml` : '—' },
                    { label: t('protocols_dose_label'), value: dose ? `${dose} ${doseUnit}` : '—' },
                    drawML && drawValid ? { label: t('protocols_draw_label'), value: `${drawML} ml (${drawUnits} ${t('protocols_units')})` } : null,
                    { label: t('protocols_frequency_label'), value: frequencyLabel(intervalDays) },
                  ]}
                />
              </>
            )}
          </ScrollView>

          {/* Footer (prototype .wfoot): Back as the secondary, Next / Save in ink. */}
          <View style={s.wfoot}>
            {step > 1 ? (
              <TouchableOpacity style={[s.btn, s.btnSec, s.wfootSide]} onPress={() => setStep(step - 1)} accessibilityRole="button">
                <Text style={s.btnSecText}>{t('back')}</Text>
              </TouchableOpacity>
            ) : <View style={s.wfootSide} />}
            {step < totalSteps ? (
              <TouchableOpacity
                style={[s.btn, s.wfootMain, step === 3 && doseStepBlocked ? s.btnBlocked : s.btnPri]}
                onPress={goNext}
                accessibilityRole="button"
              >
                <Text style={step === 3 && doseStepBlocked ? s.btnBlockedText : s.btnPriText}>{t('next')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[s.btn, s.wfootMain, s.btnPri]} onPress={saveProtocol} disabled={saving} accessibilityRole="button">
                <Text style={s.btnPriText}>{saving ? t('protocols_saving') : t('save')}</Text>
              </TouchableOpacity>
            )}
          </View>
          </KeyboardAvoidingView>

          {/* Popups inside the add/edit sheet: notices, the photo choice, and the
              iPhone wheels in a DoseTrace bottom sheet. */}
          <DTSheet config={wizSheet} onClose={() => setWizSheet(null)} />
          <DTActionSheet config={scanChoice} onClose={() => setScanChoice(null)} />
          {iosPicker && (
            <DTPickerSheet visible={showModal && showStartPicker} title={t('protocols_start_date')} doneLabel={t('done')} onDone={() => setShowStartPicker(false)}>
              {/* Part 18: the prototype wheel (short months, the chosen row bold on a band). */}
              <DTWheel
                columns={dateColumns(startDate, new Date(), MONTH_KEYS.map(k => t(k)))}
                onChange={(col, i) => setStartDate(dateAfter(startDate, new Date(), col, i))}
              />
            </DTPickerSheet>
          )}
          {iosPicker && (
            <DTPickerSheet visible={showModal && showTimePicker} title={t('protocols_what_time')} doneLabel={t('done')} onDone={() => setShowTimePicker(false)}>
              <DTWheel
                columns={timeColumns(reminderTimes[activeTimeIndex] || currentTimeRounded5(), wheel12h, dayParts)}
                onChange={(col, i) => {
                  const hm = timeAfter(reminderTimes[activeTimeIndex] || currentTimeRounded5(), wheel12h, col, i);
                  const [h, m] = hm.split(':').map(Number);
                  const d = new Date(); d.setHours(h, m, 0, 0);
                  applyPickedTime(d);
                }}
              />
            </DTPickerSheet>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create(protocolsGraduated(c));

// Graduated (DESIGN.md §2–§5, prototype.html My Protocols parts 1–3, approved
// 2026-09-29): ground screen, raised cards (radius 20–26, no border / shadow / tint),
// ink text in three steps, data blue only for the draw, outline tags, one ink action.
const protocolsGraduated = (c) => ({
  centered: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  container: { flex: 1, backgroundColor: c.ground },
  // My Protocols title row (prototype .scr top 6 + .hrow top 8; 14 to the first card)
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, backgroundColor: c.ground, gap: 12 },
  // back row on the list and the protocol screen (prototype .navrow: 44 high, centred; 14 below)
  navrow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 18, paddingTop: 6, marginBottom: 14, backgroundColor: c.ground, gap: 12 },
  headerEnd: { justifyContent: 'flex-end' }, // book right page: Edit only, no back (BK-4)
  headerTitle: { fontSize: 34, fontWeight: '700', color: c.ink, letterSpacing: -0.8, flexShrink: 1 },
  backBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  backChev: { transform: [{ scaleX: -1 }] }, // the row arrow mirrored (prototype .back svg)
  backText: { fontSize: 17, color: c.ink },
  addBtn: { minHeight: 40, borderRadius: 20, backgroundColor: c.act, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { fontSize: 15, fontWeight: '700', color: c.onAct },
  scroll: { flex: 1, paddingHorizontal: 16 },
  bottomPad: { height: 24 }, // prototype .scr bottom 24

  // Heroes (approved, unchanged)
  heroes: { gap: 14 },
  hero: { backgroundColor: c.raised, borderRadius: 26, padding: 20, gap: 14 },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroTitle: { flex: 1, fontSize: 22, fontWeight: '700', color: c.ink, letterSpacing: -0.22 },
  heroBig: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  heroNum: { fontSize: 56, fontWeight: '500', color: c.ink, letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  heroUnit: { fontSize: 17, color: c.ink2 },
  heroNames: { gap: 8 },
  heroNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroDot: { width: 9, height: 9, borderRadius: 5 },
  heroDotSm: { width: 7, height: 7, borderRadius: 4 },
  heroName: { fontSize: 17, color: c.ink },
  heroLowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroLow: { fontSize: 15, color: c.ink, flex: 1 },
  heroLast: { fontSize: 15, lineHeight: 20, color: c.ink2, fontVariant: ['tabular-nums'] },
  trio: { flexDirection: 'row', gap: 8 },
  trioCell: { flex: 1, gap: 4 },
  trioNum: { fontSize: 34, fontWeight: '500', color: c.ink, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  trioLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trioLabel: { fontSize: 12, fontWeight: '500', color: c.ink2 },

  // Empty state
  emptyCard: { backgroundColor: c.raised, borderRadius: 24, padding: 24, alignItems: 'center', gap: 8, marginTop: 8 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: c.ink, textAlign: 'center', marginTop: 4 },
  emptySub: { fontSize: 15, color: c.ink2, textAlign: 'center' },
  emptyBtn: { alignSelf: 'stretch', marginTop: 12 },

  // List (prototype list() / pcard())
  hrow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingHorizontal: 4, marginBottom: 14 },
  listTitle: { fontSize: 34, fontWeight: '700', color: c.ink, letterSpacing: -0.8, flexShrink: 1 },
  sortScroll: { marginHorizontal: -16, marginBottom: 14, flexGrow: 0 },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18 },
  sortLabel: { fontSize: 13, color: c.ink2 },
  blk: { gap: 10, marginBottom: 26 },
  // a block on the protocol screen / wizard: the screen gap is 14, a block after a block 26
  blkD: { gap: 10 },
  blkNext: { marginTop: 12 },
  secth: { paddingHorizontal: 4, fontSize: 15, fontWeight: '600', color: c.ink2 },
  // Recently deleted (prototype .list / .li): one raised list, rows split by a hairline, the
  // protocol color only as a 9 pt dot, Restore an outline pill, delete forever the risk trash.
  delList: { backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 16 },
  delRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  delRowLine: { borderTopWidth: 1, borderTopColor: c.line },
  delDot: { width: 10, height: 10, borderRadius: 5 },
  delText: { flex: 1, gap: 2 },
  delName: { fontSize: 17, color: c.ink },
  delAgo: { fontSize: 13, color: c.ink2 },
  restoreBtn: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: c.line },
  restoreBtnText: { fontSize: 13, fontWeight: '500', color: c.ink2 },
  deleteForeverBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pcard: { backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, gap: 10 },
  // Book layout (S-26 BK-8): every card keeps room for the outline; the open one is ink.
  pcardBook: { borderWidth: 2, borderColor: 'transparent' },
  pcardSel: { borderColor: c.ink },
  pcardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  pdot: { width: 10, height: 10, borderRadius: 5, marginTop: 7 },
  pcardInfo: { flex: 1, minWidth: 0, gap: 3 },
  pname: { fontSize: 18, fontWeight: '700', color: c.ink, lineHeight: 23 },
  pmeta: { fontSize: 15, color: c.ink2, fontVariant: ['tabular-nums'] },
  pchev: { marginTop: 5 },
  supply: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  supplyText: { fontSize: 13, color: c.ink2, fontVariant: ['tabular-nums'], flexShrink: 1 },
  supplyStrong: { fontWeight: '600', color: c.ink },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  otag: { minHeight: 24, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: c.line, justifyContent: 'center' },
  otagText: { fontSize: 12, fontWeight: '600', color: c.ink2 },
  otagAttn: { borderColor: c.attention },
  otagTextAttn: { color: c.attention },
  otagRisk: { borderColor: c.risk },
  otagTextRisk: { color: c.risk },
  pill: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line, justifyContent: 'center' },
  pillShort: { minHeight: 34 }, // the sort row (prototype .sortrow .pill)
  pillOn: { borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.raised, paddingHorizontal: 13.5 },
  pillText: { fontSize: 13, color: c.ink2 },
  pillTextOn: { color: c.ink, fontWeight: '600' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  // Protocol screen (prototype protocol())
  detail: { gap: 14 },
  ptitle: { gap: 6, paddingHorizontal: 4, paddingTop: 4 },
  ptitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ptitleDot: { width: 12, height: 12, borderRadius: 6 },
  ptitleMeta: { flex: 1, fontSize: 15, color: c.ink2, fontVariant: ['tabular-nums'] },
  ptitleName: { fontSize: 30, fontWeight: '700', color: c.ink, letterSpacing: -0.6 },
  hobj: { backgroundColor: c.raised, borderRadius: 26, padding: 18, gap: 14 },
  hobjTight: { gap: 10 },
  hobjTitle: { fontSize: 17, fontWeight: '600', color: c.ink },
  hobjSub: { fontSize: 15, color: c.ink2, lineHeight: 20 },
  hobjFoot: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderTopWidth: 1, borderTopColor: c.line, gap: 12 },
  hobjFootText: { flex: 1, fontSize: 17, fontWeight: '600', color: c.ink },
  drawWell: { backgroundColor: c.well, borderRadius: 16, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8, gap: 6 },
  drawHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  drawLabel: { fontSize: 15, color: c.ink2 },
  drawBig: { fontSize: 56, fontWeight: '500', color: c.data, letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  drawBigRisk: { color: c.risk },
  bigRow: { flexDirection: 'row', alignItems: 'baseline' },
  drawBigUnit: { fontSize: 13, fontFamily: MONO['400'], color: c.ink3, letterSpacing: 0, marginLeft: 3 }, // prototype .unit
  drawWellServing: { paddingBottom: 14 },
  drawWarn: { fontSize: 15, fontWeight: '600', color: c.risk, lineHeight: 20 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hintText: { fontSize: 13, color: c.ink2 },
  reads: { flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line },
  readCell: { flex: 1, minWidth: 0, gap: 3 },
  readLabel: { fontSize: 12, fontWeight: '500', color: c.ink2 },
  readVal: { fontSize: 17, fontFamily: MONO['500'], color: c.ink, letterSpacing: -0.3 },
  readAlt: { fontSize: 12, fontWeight: '500', color: c.ink3, fontVariant: ['tabular-nums'] },
  disclaimer: { fontSize: 13, lineHeight: 18, color: c.ink3 },
  nearest: { fontSize: 13, color: c.ink2, fontVariant: ['tabular-nums'] },
  vialHead: { fontSize: 17, fontWeight: '600', color: c.ink, fontVariant: ['tabular-nums'] },
  vialSub: { fontSize: 15, color: c.ink2, fontVariant: ['tabular-nums'] },
  obtn2: { minHeight: 50, borderRadius: 25, backgroundColor: c.well, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  obtn2Text: { fontSize: 17, fontWeight: '700', color: c.ink },
  rows: { backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 16 },
  rw: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, minHeight: 50, paddingVertical: 13 },
  rwSep: { borderTopWidth: 1, borderTopColor: c.line },
  rwKey: { fontSize: 17, color: c.ink2, flexShrink: 1 },
  rwVal: { fontSize: 17, fontWeight: '600', color: c.ink, textAlign: 'right', flexShrink: 1 },
  rwValMono: { fontFamily: MONO['500'], fontWeight: undefined, fontSize: 17 },
  noteWell: { minHeight: 72, borderRadius: 16, backgroundColor: c.well, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 17, color: c.ink, textAlignVertical: 'top', borderWidth: 1.5, borderColor: c.well },
  noteWellOn: { borderColor: c.ink },
  acts2: { flexDirection: 'row', gap: 10 },
  dangerBtn: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  dangerText: { fontSize: 17, fontWeight: '600', color: c.risk },

  // Buttons
  btn: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnSm: { flex: 1, minHeight: 44, borderRadius: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnSmText: { fontSize: 15 }, // prototype .btn.sm
  btnPri: { backgroundColor: c.act },
  btnPriText: { fontSize: 17, fontWeight: '700', color: c.onAct },
  btnSec: { backgroundColor: c.well },
  btnSecText: { fontSize: 17, fontWeight: '700', color: c.ink },
  btnBlocked: { backgroundColor: c.well },
  btnBlockedText: { fontSize: 17, fontWeight: '700', color: c.risk },
  btnPrimary: { minHeight: 52, borderRadius: 26, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnPrimaryText: { fontSize: 17, fontWeight: '700', color: c.onAct },

  // Tap to enlarge
  zoomScrim: { flex: 1, backgroundColor: c.scrim, justifyContent: 'center', padding: 16 },
  zoomSheet: { backgroundColor: c.raised, borderRadius: 26, padding: 20, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center' },
  zoomTitle: { fontSize: 22, fontWeight: '700', color: c.ink, letterSpacing: -0.22 },
  zoomReadout: { fontSize: 17, color: c.ink, fontVariant: ['tabular-nums'] },
  zoomReadoutVal: { fontWeight: '700', color: c.data },
  ruler: { flexGrow: 0, borderRadius: 14, backgroundColor: c.well, paddingTop: 14, paddingBottom: 8 },

  // Add / edit steps (prototype wizard() / wizStep())
  modal: { flex: 1, backgroundColor: c.ground },
  wnav: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 16 },
  wnavSide: { width: 70, minHeight: 44, justifyContent: 'center' },
  wnavRight: { alignItems: 'flex-end' },
  wnavCancel: { fontSize: 17, color: c.ink },
  wnavSave: { fontSize: 17, fontWeight: '600', color: c.ink },
  wnavTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: c.ink, textAlign: 'center' },
  prog: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  progSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.line },
  progSegOn: { backgroundColor: c.ink },
  modalBody: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  wiz: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 32, gap: 20 },
  wt: { gap: 4, paddingHorizontal: 4, paddingTop: 6 },
  wtTitle: { fontSize: 22, fontWeight: '700', color: c.ink, lineHeight: 28 },
  wtSub: { fontSize: 15, color: c.ink2, lineHeight: 20 },
  fld: { gap: 10 },
  fldLabel: { paddingHorizontal: 4, fontSize: 17, fontWeight: '600', color: c.ink },
  fldHint: { paddingHorizontal: 4, fontSize: 13, lineHeight: 18, color: c.ink2 },
  footC2: { paddingHorizontal: 4, fontSize: 13, lineHeight: 18, color: c.ink2 },
  flush: { paddingHorizontal: 0 }, // a foot line straight in the step, not in a field (prototype)
  footC3: { paddingHorizontal: 4, fontSize: 13, lineHeight: 18, color: c.ink3 },
  footAttn: { paddingHorizontal: 4, fontSize: 13, lineHeight: 18, color: c.attention },
  bodyC2: { fontSize: 17, color: c.ink2 },
  bodyInk: { fontSize: 17, color: c.ink },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: c.raised, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: c.line },
  tileOn: { borderWidth: 2, borderColor: c.ink, paddingHorizontal: 9, paddingVertical: 13 },
  tileLabel: { fontSize: 15, fontWeight: '600', color: c.ink2, textAlign: 'center' },
  tileLabelOn: { color: c.ink },
  tileSub: { fontSize: 13, color: c.ink2, textAlign: 'center' },
  winp: { fontSize: 17, color: c.ink, backgroundColor: c.raised, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: c.line, fontVariant: ['tabular-nums'] },
  winpOn: { borderWidth: 2, borderColor: c.ink, paddingHorizontal: 13, paddingVertical: 11 },
  winpMulti: { minHeight: 88, textAlignVertical: 'top' },
  inrow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inrowInput: { flex: 1, minWidth: 0 },
  intervalInput: { width: 96 }, // left-aligned like every field (part 17)
  dayInput: { flex: 1, minWidth: 0 }, // fills the row after "Day" (part 19)
  unitBar: { flex: 1, minWidth: 0, alignSelf: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.raised, borderRadius: 16, borderWidth: 1, borderColor: c.line, minHeight: 56 },
  stepperBtn: { width: 56, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  stepperVal: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4 },
  stepperValInput: { fontSize: 24, fontFamily: MONO['500'], color: c.ink, minWidth: 60, padding: 0, textAlign: 'center' },
  stepperValUnit: { fontSize: 17, color: c.ink },
  fold2: { backgroundColor: c.raised, borderRadius: 18, paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  foldHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54 },
  foldTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: c.ink },
  iuEquiv: { flex: 1, fontSize: 17, color: c.ink, fontVariant: ['tabular-nums'] },
  live: { backgroundColor: c.raised, borderRadius: 26, padding: 18, gap: 10 },
  liveMl: { fontSize: 13, color: c.ink2, fontVariant: ['tabular-nums'] },
  warnbox: { borderWidth: 1, borderColor: c.attention, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  warnboxRisk: { borderColor: c.risk },
  warnText: { fontSize: 15, lineHeight: 20, color: c.ink },
  warnTextRisk: { color: c.risk, fontWeight: '600' },
  infobox: { backgroundColor: c.well, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  infoText: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  pickCol: { gap: 8 },
  pickbtn: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 14, backgroundColor: c.raised, borderRadius: 14, borderWidth: 1, borderColor: c.line },
  pickText: { flex: 1, fontSize: 17, color: c.ink },
  pickTextC2: { fontSize: 17, color: c.ink2 },
  pickTime: { fontSize: 17, fontWeight: '600', color: c.ink, fontVariant: ['tabular-nums'] }, // with the clock, on the left (part 17)
  prev: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.raised, borderRadius: 22, paddingVertical: 10, paddingHorizontal: 16, alignSelf: 'flex-start', maxWidth: '100%' },
  prevDot: { width: 12, height: 12, borderRadius: 5 },
  prevName: { fontSize: 17, fontWeight: '600', color: c.ink, flexShrink: 1 },
  prevSub: { fontSize: 13, color: c.ink2 },
  // prototype .swatches: 5 columns, 14 between rows, the ring drawn outside the 44 swatch
  // (3 ground + 2.5 ink), so it takes no room; the used mark 13 (10 + a 1.5 ink ring).
  swatches: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, paddingHorizontal: 8, paddingVertical: 4 },
  swCell: { width: '20%', alignItems: 'center' },
  swHit: { width: 44, height: 44 },
  swRingOn: { position: 'absolute', top: -5.5, left: -5.5, width: 55, height: 55, borderRadius: 27.5, borderWidth: 2.5, borderColor: c.ink },
  sw: { width: 44, height: 44, borderRadius: 22 },
  usedMk: { position: 'absolute', top: -2.5, right: -2.5, width: 13, height: 13, borderRadius: 6.5, backgroundColor: c.raised, borderWidth: 1.5, borderColor: c.ink },
  usedMkInline: { position: 'relative', top: 0, right: 0 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hscrollWrap: { marginHorizontal: -16, flexGrow: 0 },
  hscroll: { flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
  linkBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontSize: 17, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
  sugg: { backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 16, marginTop: -2 },
  suggRow: { minHeight: 50, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  suggMain: { flex: 1, minWidth: 0, gap: 1 },
  suggSep: { borderTopWidth: 1, borderTopColor: c.line },
  suggText: { fontSize: 17, color: c.ink },
  suggSub: { fontSize: 13, color: c.ink2 },
  suggAdd: { fontSize: 17, fontWeight: '600', color: c.ink },
  wfoot: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.ground },
  wfootSide: { flex: 1 },
  wfootMain: { flex: 2 },
});
