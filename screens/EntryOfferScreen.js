import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Linking,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { fillStoreText } from '../lib/storeText';
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  checkTrialEligibility,
} from '../lib/purchases';
import { getEntitlement } from '../lib/entitlement';
import { purchaseOutcome, restoreOutcome, outcomeSheet } from '../lib/paywallPlans';
import { offerModel, benefitRows, freePremiumRows, offerProductIds } from '../lib/entryOffer';
import useFreeProtocolLimit from '../lib/useFreeProtocolLimit'; // OB-28: the account's free protocol count
import { applyReferralCode, removeReferralCode, loadReferralCode, syncReferralAttributes, flushPendingAttribution } from '../lib/referralSync';
import { PRIVACY_URL, termsTarget } from '../lib/legalLinks';
import { Analytics } from '../lib/analytics';
import FeatureIcon from '../components/FeatureIcon';
import RowChevron from '../components/RowChevron';
import CheckMark from '../components/CheckMark';
import LegalModal from '../components/LegalModal';
import Modal from '../components/PresenceModal';
import useKeyboardLift from '../components/useKeyboardLift';
import { DTSheet } from './components/ProtocolParts';

// The message for each way Aplicar can fail (lib/referralCode applyReferralCode reasons).
const REF_ERROR = { shape: 'eo_ref_invalid', unknown: 'eo_ref_unknown', ended: 'eo_ref_ended', offline: 'eo_ref_offline', save: 'eo_ref_save_failed' };

/**
 * The entry offer, right after account creation (docs/design/onboarding-offer.html, PT version 3
 * + the founder's changes of 2026-11-20). Every price comes from the store through
 * lib/entryOffer offerModel; the screen writes no number. In __DEV__ builds only, when the store
 * has no 3-month product yet, a labelled sample preview shows the layout (never purchasable).
 *
 * route.params = { protocolName, protocolSummary } (the protocol just saved, e.g. "Tirzepatida" /
 * "2,5 mg · toda segunda, 08:00"). onFinish(outcome), outcome 'purchased' | 'free' | 'closed';
 * without onFinish the screen goes back when it can.
 */
export default function EntryOfferScreen({ navigation, route, onFinish }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { protocolName, protocolSummary } = route?.params || {};
  // OB-28: the free side of the table states this account's count (1 new / 3 for an OB-26 account).
  const knownFree = useFreeProtocolLimit();
  const freeProtocols = route?.params?.freeProtocols ?? knownFree;
  const mounted = useRef(true);
  const busyRef = useRef(false); // one store action at a time
  useEffect(() => () => { mounted.current = false; }, []);

  const [packages, setPackages] = useState([]);
  const [eligibility, setEligibility] = useState(null); // iOS { productId: bool }; null = unknown
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [showFree, setShowFree] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [refText, setRefText] = useState('');
  const [refCode, setRefCode] = useState(null);
  const [refBenefit, setRefBenefit] = useState(null); // the server benefit_text of the applied code
  const [refError, setRefError] = useState(null);
  const [refChecking, setRefChecking] = useState(false);
  const busy = purchasing || restoring;
  const kb = useKeyboardLift(); // the referral field stays above the keyboard (A-152)
  const terms = termsTarget(Platform.OS);

  const finish = useCallback((outcome) => {
    if (onFinish) { onFinish(outcome); return; }
    if (navigation && navigation.canGoBack?.()) navigation.goBack();
  }, [onFinish, navigation]);

  // The offer is left only through its own buttons (X, Continuar no plano grátis, a purchase), so the
  // landing after it (OB-9) always runs: never a swipe back, and the tab bar under it stays locked
  // (lib/mainBar reads gestureEnabled false). Council 2026-11-20 (UX): on mount !busy was true and
  // unlocked both.
  useEffect(() => { navigation?.setOptions?.({ gestureEnabled: false }); }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (busyRef.current) return true;
      finish('closed');
      return true;
    });
    return () => sub.remove();
  }, [finish]);

  const showOutcome = useCallback((kind, onDone) => {
    const cfg = outcomeSheet(kind, t, Platform.OS);
    if (!cfg) return;
    setSheet({
      icon: cfg.icon,
      title: cfg.title,
      body: cfg.body,
      buttons: [{ label: cfg.done ? t('done') : t('ok'), kind: 'primary', onPress: cfg.done ? onDone : undefined }],
    });
  }, [t]);

  // Prices, the store's intro answer and the Premium state, all before any buy button shows.
  const load = useCallback(async () => {
    setLoading(true);
    const [pkgs, ent] = await Promise.all([
      getOfferings().catch(() => []),
      getEntitlement().catch(() => ({ premium: false })),
    ]);
    const ids = offerProductIds(pkgs);
    const elig = ids.length > 0 ? await checkTrialEligibility(ids).catch(() => null) : null;
    if (!mounted.current) return;
    setPackages(pkgs || []);
    setEligibility(elig);
    setLoading(false);
    if (ent && ent.premium) showOutcome('premium_already', () => finish('closed'));
  }, [showOutcome, finish]); // load-end

  useEffect(() => {
    Analytics.viewed('entry_offer');
    load();
    loadReferralCode().then((rec) => { if (rec && mounted.current) { setRefCode(rec.code); setRefBenefit(rec.benefitText || null); } });
  }, []);

  const model = useMemo(
    () => offerModel({ pkgs: packages, eligibility, platform: Platform.OS, language, t, now: new Date(), dev: __DEV__, selected }),
    [packages, eligibility, language, t, selected],
  );

  // The offer button inside "Grátis e Premium": the store's purchase sheet opens only once that
  // sheet has closed (iOS cannot present it over a closing page sheet: __tests__/modalStacking).
  const buyAfterCompare = useRef(false);
  function buyFromCompare() {
    buyAfterCompare.current = true;
    setShowFree(false);
  }
  function afterCompareClosed() {
    if (!buyAfterCompare.current) return;
    buyAfterCompare.current = false;
    doPurchase();
  }
  useEffect(() => {
    // Android has no Modal onDismiss: the sheet is gone as soon as it is hidden.
    if (!showFree && Platform.OS === 'android') afterCompareClosed();
  }, [showFree]); // eslint-disable-line react-hooks/exhaustive-deps

  async function doPurchase() {
    if (busyRef.current) return;
    if (model.sample) {
      setSheet({ icon: 'info', title: t('eo_sample_buy_title'), body: t('eo_sample_buy_body'), buttons: [{ label: t('ok'), kind: 'primary' }] });
      return;
    }
    const pkg = model.pkg;
    if (!pkg) { showOutcome('unavailable'); return; }
    busyRef.current = true;
    Analytics.paywallCtaTapped({ plan: model.selected, source: 'entry_offer' });
    setPurchasing(true);
    let result = null;
    let premiumNow = false;
    try {
      // creators AP4: the code must be on the RevenueCat customer before the purchase.
      // The server record too (creators AP5), without holding the purchase on the network.
      flushPendingAttribution();
      await syncReferralAttributes();
      result = await purchasePackage(pkg);
      if (result && result.success) premiumNow = !!(await getEntitlement().catch(() => ({ premium: false }))).premium;
    } finally {
      busyRef.current = false;
    }
    const outcome = purchaseOutcome(result, premiumNow);
    if (outcome === 'premium') Analytics.purchaseCompleted({ plan: model.selected, source: 'entry_offer' });
    if (!mounted.current) { if (outcome === 'premium' && onFinish) onFinish('purchased'); return; }
    setPurchasing(false);
    if (outcome === 'premium') { finish('purchased'); return; }
    showOutcome(outcome); // pending / failed; cancelled says nothing
  }

  async function handleRestore() {
    if (busyRef.current) return;
    busyRef.current = true;
    setRestoring(true);
    let result = null;
    let premiumNow = false;
    try {
      result = await restorePurchases();
      if (result && result.success) premiumNow = !!(await getEntitlement().catch(() => ({ premium: false }))).premium;
    } finally {
      busyRef.current = false;
    }
    const outcome = restoreOutcome(result, premiumNow);
    if (!mounted.current) return;
    setRestoring(false);
    showOutcome(outcome === 'failed' ? 'restore_failed' : outcome, () => finish('purchased'));
  }

  // Aplicar asks the server (lib/referralCode checkReferralCode). Only a code it says is valid is
  // applied; unknown / ended / could not check keep what she typed so she can fix it or try again.
  async function applyCode() {
    if (refChecking || !refText.trim()) return;
    setRefChecking(true);
    setRefError(null);
    const r = await applyReferralCode(refText);
    if (!mounted.current) return;
    setRefChecking(false);
    if (r.ok) {
      setRefCode(r.code);
      setRefBenefit(r.benefitText || null);
      setRefText('');
      setRefOpen(false);
      flushPendingAttribution(); // RevenueCat + the server record (AP4, AP5); pending if offline
      return;
    }
    setRefError(t(REF_ERROR[r.reason] || 'eo_ref_save_failed'));
  }

  async function removeCode() {
    await removeReferralCode();
    if (mounted.current) { setRefCode(null); setRefBenefit(null); }
  }

  const hero = model.hero;

  const renderPlan = (p) => {
    const on = model.selected === p.key;
    return (
      <TouchableOpacity
        key={p.key}
        style={[s.plan, on && s.planOn]}
        onPress={() => setSelected(p.key)}
        activeOpacity={0.8}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        disabled={busy}
      >
        {p.badge ? <View style={s.tag}><Text style={s.tagText}>{p.badge}</Text></View> : <View style={s.tagSpace} />}
        <View style={[s.radio, on && s.radioOn]} />
        <Text style={s.planName}>{p.name}</Text>
        {/* Apple 3.1.2: the billed amount is the biggest price; the struck one is smaller, beside it. */}
        <View style={s.planPriceRow}>
          <Text style={s.planPrice} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{p.price}</Text>
          {p.struck ? <Text style={s.planStruck} numberOfLines={1}>{p.struck}</Text> : null}
        </View>
        <Text style={s.planLine}>{p.line1}</Text>
        {p.line2 ? <Text style={s.planLine}>{p.line2}</Text> : null}
        {p.equiv ? <Text style={s.planEquiv}>{p.equiv}</Text> : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.nav}>
        <TouchableOpacity
          onPress={() => finish('closed')}
          disabled={busy}
          style={[s.navBtn, busy && s.busy]}
          accessibilityRole="button"
          accessibilityLabel={t('eo_close')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <FeatureIcon name="close" size={22} color={colors.ink} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleRestore} disabled={busy} style={[s.navBtn, s.navRight, busy && s.busy]} accessibilityRole="button">
          {restoring ? <ActivityIndicator size="small" color={colors.ink2} /> : <Text style={s.restoreText} numberOfLines={1}>{t('paywall_restore')}</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView {...kb.scrollProps} style={s.flex} showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
          <View style={s.head}>
            <Text style={s.title} accessibilityRole="header">{t('eo_title')}</Text>
            <Text style={s.titleSub}>{t('eo_title_sub')}</Text>
          </View>

          {protocolName ? (
            <View style={s.chip}>
              <View style={s.chipText}>
                <Text style={s.chipName} numberOfLines={1}>{protocolName}</Text>
                {protocolSummary ? <Text style={s.chipSummary} numberOfLines={2}>{protocolSummary}</Text> : null}
              </View>
              <View style={s.saved}>
                <CheckMark size={14} color={colors.ok} />
                <Text style={s.savedText}>{t('eo_saved')}</Text>
              </View>
            </View>
          ) : null}

          {model.sampleLabel ? (
            <View style={s.sample}><Text style={s.sampleText}>{model.sampleLabel}</Text></View>
          ) : null}

          {loading ? (
            <View style={s.loadingBox}><ActivityIndicator color={colors.ink2} /></View>
          ) : !hero ? (
            <View style={s.card}>
              <Text style={s.unavailableText}>{t('paywall_unavailable')}</Text>
              <TouchableOpacity style={s.linkBtn} onPress={load} accessibilityRole="button">
                <Text style={s.link}>{t('pw_try_again')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={s.card}>
                {hero.badge ? <View style={s.badge}><Text style={s.badgeText}>{hero.badge}</Text></View> : null}
                <Text style={s.heroTitle}>{hero.title}</Text>
                <View style={s.heroPriceRow}>
                  <Text style={s.heroPrice} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{hero.price}</Text>
                  {hero.struck ? <Text style={s.heroStruck} numberOfLines={1}>{hero.struck}</Text> : null}
                  {hero.per ? <Text style={s.heroPer}>{hero.per}</Text> : null}
                </View>
                {hero.normal ? <Text style={s.foot}>{hero.normal}</Text> : null}
                {hero.ticks > 0 ? (
                  <View style={s.ticks} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    {Array.from({ length: hero.ticks }, (_, i) => (
                      <View key={i} style={[s.tick, i < model.hero.filled && s.tickOn]} />
                    ))}
                  </View>
                ) : null}
                {hero.ticksLine ? <Text style={s.foot}>{hero.ticksLine}</Text> : null}
              </View>

              <View style={s.card}>
                {model.timeline.map((row, i) => (
                  <View key={i} style={s.tlRow}>
                    <View style={s.tlRail}>
                      <View style={[s.tlDot, i === 0 && s.tlDotNow]} />
                      {i < model.timeline.length - 1 ? <View style={s.tlLine} /> : null}
                    </View>
                    <View style={s.tlBody}>
                      <Text style={s.tlWhen}>{row.when}</Text>
                      <Text style={s.tlText}>{row.text}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={s.list}>
                {benefitRows(t).map((b, i) => (
                  <View key={b.label} style={[s.benRow, i > 0 && s.rowSep]}>
                    <FeatureIcon name={b.icon} size={24} color={colors.data} />
                    <Text style={s.benLabel}>{b.label}</Text>
                    <Text style={s.benValue}>{b.value}</Text>
                  </View>
                ))}
              </View>

              <View style={s.plans} accessibilityRole="radiogroup">
                {model.plans.map(renderPlan)}
              </View>
            </>
          )}

          <TouchableOpacity style={s.allPlans} onPress={() => navigation.navigate('Paywall', { source: 'entry_offer' })} disabled={busy} accessibilityRole="button">
            <Text style={s.allPlansText}>{t('eo_all_plans')}</Text>
          </TouchableOpacity>

          {/* The referral code: a dashed coupon row; tapped, a field; applied, the code and Remove. */}
          {refCode ? (
            <View style={s.coupon}>
              <CheckMark size={16} color={colors.ok} />
              <View style={s.couponBody}>
                <Text style={s.couponTitle}>{t('eo_ref_applied').replace('{code}', refCode)}</Text>
                {/* Only here: a code the server said is valid. Its own benefit_text, else the app's line. */}
                <Text style={s.couponSub}>{refBenefit || t('eo_ref_benefit_default')}</Text>
              </View>
              <TouchableOpacity style={s.linkBtn} onPress={removeCode} disabled={busy} accessibilityRole="button">
                <Text style={s.link}>{t('eo_ref_remove')}</Text>
              </TouchableOpacity>
            </View>
          ) : refOpen ? (
            <View style={[s.coupon, s.couponOpen]}>
              <Text style={s.fieldLabel}>{t('eo_ref_label')}</Text>
              <View style={s.fieldRow}>
                <TextInput
                  {...kb.fieldProps('referral')}
                  style={s.field}
                  value={refText}
                  onChangeText={(v) => { setRefText(v); if (refError) setRefError(null); }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="off"
                  maxLength={20}
                  returnKeyType="done"
                  onSubmitEditing={applyCode}
                  accessibilityLabel={t('eo_ref_label')}
                  placeholderTextColor={colors.ink3}
                  autoFocus
                />
                <TouchableOpacity style={[s.applyBtn, (!refText.trim() || refChecking) && s.busy]} onPress={applyCode} disabled={!refText.trim() || refChecking} accessibilityRole="button">
                  {refChecking ? <ActivityIndicator size="small" color={colors.ink2} /> : <Text style={s.applyText}>{t('eo_ref_apply')}</Text>}
                </TouchableOpacity>
              </View>
              {refError ? <Text style={s.fieldError}>{refError}</Text> : null}
            </View>
          ) : (
            <TouchableOpacity style={s.coupon} onPress={() => setRefOpen(true)} accessibilityRole="button">
              <FeatureIcon name="star" size={20} color={colors.ink2} />
              <Text style={s.couponText}>{t('eo_ref_row')}</Text>
              <RowChevron color={colors.tick} />
            </TouchableOpacity>
          )}

          {model.renewal ? <Text style={s.renewal}>{model.renewal}</Text> : null}
          {model.cta ? (
            <TouchableOpacity
              style={[s.cta, busy && s.busy]}
              onPress={doPurchase}
              disabled={busy || loading}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              {purchasing ? <ActivityIndicator color={colors.onAct} /> : <Text style={s.ctaText}>{model.cta}</Text>}
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={s.freeBtn} onPress={() => finish('free')} disabled={busy} accessibilityRole="button">
            <Text style={s.freeText}>{t('eo_continue_free')}</Text>
          </TouchableOpacity>

          <View style={s.links}>
            <TouchableOpacity style={s.linkBtn} onPress={() => setShowFree(true)} accessibilityRole="button">
              <Text style={s.link}>{t('eo_free_link')}</Text>
            </TouchableOpacity>
            <View style={s.legalRow}>
              {/* Apple 3.1.2: Terms of Use (EULA) and Privacy Policy in the purchase flow. */}
              <TouchableOpacity
                style={s.linkBtn}
                onPress={() => (terms.kind === 'url' ? Linking.openURL(terms.url).catch(() => {}) : setShowTerms(true))}
                accessibilityRole="link"
              >
                <Text style={s.link}>{t('eo_terms')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.linkBtn} onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} accessibilityRole="link">
                <Text style={s.link}>{t('eo_privacy')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        {kb.spacer}
      </ScrollView>

      <FreePremiumSheet
        visible={showFree}
        onClose={() => setShowFree(false)}
        freeProtocols={freeProtocols}
        cta={model.cta}
        renewal={model.renewal}
        busy={busy || loading}
        onCta={buyFromCompare}
        onDismiss={afterCompareClosed}
      />
      <DTSheet config={sheet} onClose={() => setSheet(null)} />
      {terms.kind === 'inApp' && (
        <LegalModal
          visible={showTerms}
          onClose={() => setShowTerms(false)}
          title={t(terms.titleKey)}
          content={fillStoreText(t(terms.bodyKey), t, Platform.OS)}
          doneLabel={t('done')}
        />
      )}
    </SafeAreaView>
  );
}

/**
 * "Grátis e Premium" (picture A, founder 2026-11-20, docs/design/oferta-gratis-premium.html): the
 * rows both plans have, then what changes with Premium; the Premium column sits on a data band with
 * its values in the data colour; the offer button (the plan chosen on the offer) above Voltar.
 */
// freeProtocols: the account's free protocol count (lib/freePlan, OB-28). cta / renewal / onCta: the
// offer's own button text, renewal line and purchase (null when the store has no price yet).
export function FreePremiumSheet({ visible, onClose, onDismiss, freeProtocols, cta, renewal, onCta, busy }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const rows = freePremiumRows(t, { freeProtocols });
  const cell = (v, premium) => (v === true
    ? <CheckMark size={18} color={premium ? colors.data : colors.ink} />
    : v === false
      ? <Text style={s.cmpNo}>—</Text>
      : <Text style={[s.cmpAmount, premium && s.cmpPremiumText]}>{v}</Text>);
  const row = (r) => (
    <View key={r.label} style={s.cmpRow}>
      <View style={[s.cmpLabelCol, s.cmpLabelWrap]}>
        <FeatureIcon name={r.icon} size={18} color={colors.ink2} />
        <Text style={s.cmpLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{r.label}</Text>
      </View>
      <View style={s.cmpFree}>{cell(r.free, false)}</View>
      <View style={s.cmpCell}>{cell(r.premium, true)}</View>
    </View>
  );
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} onDismiss={onDismiss}>
      <SafeAreaView style={s.sheetWrap} edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView keyboardShouldPersistTaps="handled" style={s.flex} contentContainerStyle={s.sheetBody} showsVerticalScrollIndicator={false}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle} accessibilityRole="header">{t('eo_cmp_title')}</Text>
            <Text style={s.sheetSub}>{t('eo_cmp_sub')}</Text>
          </View>
          <View style={s.cmpList}>
            <View style={s.cmpBand} pointerEvents="none" />
            <View style={s.cmpRow}>
              <View style={s.cmpLabelCol} />
              <Text style={[s.cmpHead, s.cmpFree]}>{t('eo_cmp_free')}</Text>
              <Text style={[s.cmpHead, s.cmpCell, s.cmpHeadPremium]}>{t('paywall_premium')}</Text>
            </View>
            <Text style={s.cmpGroup}>{t('eo_cmp_both')}</Text>
            {rows.filter((r) => r.group === 'both').map(row)}
            <View style={s.cmpSep} />
            <Text style={s.cmpGroup}>{t('eo_cmp_changes')}</Text>
            {rows.filter((r) => r.group === 'diff').map(row)}
          </View>
        </ScrollView>
        <View style={s.sheetFoot}>
          {cta ? (
            <TouchableOpacity style={[s.cta, busy && s.busy]} onPress={onCta} disabled={busy} activeOpacity={0.85} accessibilityRole="button">
              <Text style={s.ctaText}>{cta}</Text>
            </TouchableOpacity>
          ) : null}
          {cta && renewal ? <Text style={s.sheetFine}>{renewal}</Text> : null}
          <TouchableOpacity style={s.sheetBack} onPress={onClose} accessibilityRole="button">
            <Text style={s.sheetBackText}>{t('back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// Theme tokens only (lib/theme.js, both palettes). Geist from 22 pt up (lib/fonts.js), weights
// stop at 700, no uppercase letter-spaced labels.
const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.ground },
  flex: { flex: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 16 },
  navBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  navRight: { alignItems: 'flex-end' },
  restoreText: { fontSize: 17, color: c.ink },
  busy: { opacity: 0.6 },
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32, gap: 12 },

  head: { gap: 6, paddingHorizontal: 4, marginBottom: 4 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', color: c.ink, letterSpacing: -0.5 },
  titleSub: { fontSize: 17, lineHeight: 22, color: c.ink2 },

  chip: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.raised, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
  chipText: { flex: 1, gap: 2 },
  chipName: { fontSize: 17, fontWeight: '600', color: c.ink },
  chipSummary: { fontSize: 15, lineHeight: 20, color: c.ink2, fontVariant: ['tabular-nums'] },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 26, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: c.line },
  savedText: { fontSize: 13, fontWeight: '600', color: c.ok },

  sample: { backgroundColor: c.well, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: c.attention },
  sampleText: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: c.attention, textAlign: 'center' },

  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  unavailableText: { fontSize: 15, lineHeight: 20, color: c.ink2, textAlign: 'center' },

  card: { backgroundColor: c.raised, borderRadius: 24, padding: 18, gap: 8 },
  badge: { alignSelf: 'flex-start', minHeight: 26, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: c.data, justifyContent: 'center' },
  badgeText: { fontSize: 13, fontWeight: '600', color: c.data },
  heroTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: c.ink, marginTop: 2 },
  heroPriceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 10 },
  heroPrice: { fontSize: 48, fontWeight: '500', color: c.ink, letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  heroStruck: { fontSize: 20, fontWeight: '400', color: c.ink3, textDecorationLine: 'line-through', fontVariant: ['tabular-nums'] },
  heroPer: { fontSize: 17, color: c.ink2 },
  foot: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  ticks: { flexDirection: 'row', gap: 4, marginVertical: 4 },
  tick: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.line },
  tickOn: { backgroundColor: c.data },

  tlRow: { flexDirection: 'row', gap: 12 },
  tlRail: { width: 12, alignItems: 'center' },
  tlDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5, borderWidth: 2, borderColor: c.tick, backgroundColor: c.raised },
  tlDotNow: { borderColor: c.data, backgroundColor: c.data },
  tlLine: { flex: 1, width: 2, backgroundColor: c.line, marginTop: 2 },
  tlBody: { flex: 1, gap: 2, paddingBottom: 10 },
  tlWhen: { fontSize: 15, fontWeight: '600', color: c.ink, fontVariant: ['tabular-nums'] },
  tlText: { fontSize: 15, lineHeight: 20, color: c.ink2 },

  list: { backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 16 },
  rowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  benRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8 },
  benLabel: { flex: 1, fontSize: 15, lineHeight: 20, color: c.ink },
  benValue: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: c.ink2, textAlign: 'right' },

  plans: { flexDirection: 'row', gap: 10 },
  plan: { flex: 1, backgroundColor: c.raised, borderRadius: 20, padding: 15, gap: 3, borderWidth: 1.5, borderColor: c.line },
  planOn: { padding: 14, borderWidth: 2.5, borderColor: c.ink },
  tag: { alignSelf: 'flex-start', minHeight: 24, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: c.data, justifyContent: 'center', marginRight: 28 },
  tagText: { fontSize: 12, fontWeight: '600', color: c.data },
  tagSpace: { height: 24 },
  radio: { position: 'absolute', top: 14, right: 12, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.tick },
  radioOn: { borderWidth: 7, borderColor: c.ink },
  planName: { fontSize: 17, fontWeight: '600', color: c.ink, marginTop: 4 },
  planPriceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 6 },
  planPrice: { fontSize: 26, fontWeight: '500', color: c.ink, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  planStruck: { fontSize: 13, color: c.ink3, textDecorationLine: 'line-through', fontVariant: ['tabular-nums'] },
  planLine: { fontSize: 13, lineHeight: 18, color: c.ink2, fontVariant: ['tabular-nums'] },
  planEquiv: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: c.data, fontVariant: ['tabular-nums'] },

  allPlans: { minHeight: 50, borderRadius: 25, borderWidth: 1.5, borderColor: c.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  allPlansText: { fontSize: 15, fontWeight: '600', color: c.ink, textAlign: 'center' },

  coupon: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.tick, backgroundColor: c.raised },
  couponOpen: { flexDirection: 'column', alignItems: 'stretch', gap: 8, paddingVertical: 12 },
  couponText: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: c.ink },
  couponBody: { flex: 1, gap: 2 },
  couponTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: c.ink },
  couponSub: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: c.ink2 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  field: { flex: 1, minHeight: 50, borderRadius: 14, backgroundColor: c.well, paddingHorizontal: 14, fontSize: 17, color: c.ink, letterSpacing: 0.5 },
  applyBtn: { minHeight: 50, borderRadius: 25, backgroundColor: c.well, borderWidth: 1, borderColor: c.line, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  applyText: { fontSize: 15, fontWeight: '700', color: c.ink },
  fieldError: { fontSize: 13, lineHeight: 18, color: c.risk },

  renewal: { fontSize: 13, lineHeight: 18, color: c.ink2, textAlign: 'center', paddingHorizontal: 8, marginTop: 4 },
  cta: { minHeight: 56, borderRadius: 28, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  ctaText: { fontSize: 17, fontWeight: '700', color: c.onAct, textAlign: 'center', fontVariant: ['tabular-nums'] },
  freeBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  freeText: { fontSize: 17, fontWeight: '600', color: c.ink },

  links: { alignItems: 'center', gap: 2 },
  linkBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  link: { fontSize: 15, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
  legalRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 24 },

  sheetWrap: { flex: 1, backgroundColor: c.ground, paddingHorizontal: 16 },
  sheetBody: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', gap: 12, paddingTop: 16, paddingBottom: 8 },
  sheetHead: { gap: 4, paddingHorizontal: 4 },
  sheetTitle: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: c.ink },
  sheetSub: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  cmpList: { backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 12, paddingVertical: 6 },
  cmpBand: { position: 'absolute', top: 6, bottom: 6, right: 7, width: 88, borderRadius: 16, backgroundColor: c.dataBand },
  cmpRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingVertical: 2 },
  cmpLabelCol: { flex: 1 },
  cmpLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cmpFree: { width: 62, alignItems: 'center', textAlign: 'center' },
  cmpCell: { width: 82, alignItems: 'center', textAlign: 'center' },
  cmpHead: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: c.ink2 },
  cmpHeadPremium: { color: c.data, fontWeight: '700', fontSize: 14 },
  cmpGroup: { fontSize: 13, lineHeight: 18, color: c.ink3, paddingTop: 6, paddingBottom: 0 },
  cmpSep: { height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginTop: 4, marginRight: 96 },
  cmpLabel: { flexShrink: 1, fontSize: 14, lineHeight: 18, color: c.ink },
  cmpNo: { fontSize: 15, fontWeight: '600', color: c.ink3 },
  cmpAmount: { fontSize: 13, lineHeight: 16, color: c.ink2, textAlign: 'center', fontVariant: ['tabular-nums'] },
  cmpPremiumText: { color: c.data, fontWeight: '700' },
  sheetFoot: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', gap: 4, paddingTop: 8 },
  sheetFine: { fontSize: 12, lineHeight: 16, color: c.ink3, textAlign: 'center', paddingHorizontal: 8 },
  sheetBack: { minHeight: 50, borderRadius: 25, borderWidth: 1.5, borderColor: c.line, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 12, width: '100%' },
  sheetBackText: { fontSize: 17, fontWeight: '600', color: c.ink },
});
