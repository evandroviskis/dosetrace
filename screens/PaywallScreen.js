import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  checkTrialEligibility,
} from '../lib/purchases';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import FeatureIcon from '../components/FeatureIcon';
import AccumulationHero from '../components/AccumulationHero';
import { FeaturePreviewSheet, PREVIEW_FEATURES } from '../components/FeaturePreviews';
import { friendlyError } from '../lib/friendlyError';
import { getEntitlement } from '../lib/entitlement';
import { PRIVACY_URL, termsTarget } from '../lib/legalLinks';
import LegalModal from '../components/LegalModal';
import { Analytics } from '../lib/analytics';
import CheckMark from '../components/CheckMark';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PAYWALL_VIEWS_KEY = 'dosetrace_paywall_views';
const PAYWALL_ANIM_VARIANT = 'hero_b'; // bump when the paywall hero animation changes

export default function PaywallScreen({ navigation, route }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { width: winW } = useWindowDimensions();
  // The hero card is the content width (screen gutter 16) — its curve is 28 narrower.
  const heroW = Math.min(CONTENT_MAX_WIDTH, winW) - 32 - 28;
  const scrollRef = useRef(null);
  const plansY = useRef(0);
  // Which entry point sent the user here (serum card, PDF wall, 2nd-upload wall,
  // settings, protocol limit, preview sheet, …) — for per-source conversion.
  const source = route?.params?.source || 'unknown';
  const [selected, setSelected] = useState('annual');
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [trialEligibility, setTrialEligibility] = useState(null); // null = unknown
  const [previewKey, setPreviewKey] = useState(null); // which feature preview sheet is open
  const onSuccess = route?.params?.onSuccess;

  function openPreview(key) {
    Analytics.previewSheetViewed(key);
    setPreviewKey(key);
  }

  // "Unlock with Premium" inside a preview: we are already on the paywall, so it
  // closes the sheet and brings the plans into view (no purchase is started).
  function unlockFromPreview() {
    setPreviewKey(null);
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, plansY.current - 12), animated: true }), 250);
  }

  const FREE_FEATURES = [
    { label: t('paywall_free_feat_1'), included: true },   // Reconstitution calculator
    { label: t('paywall_free_feat_3'), included: true },   // Up to 3 protocols
    { label: t('paywall_free_feat_4'), included: true },   // Injection log & vial tracker
    { label: t('paywall_free_feat_5'), included: true },   // Reminders
    { label: t('pw_free_labvax'), included: true },        // Lab & vaccine journals (manual)
    { label: t('pw_free_calc'), included: true },          // Energy & protein calculator
    { label: t('pw_free_scan1'), included: true },         // 3 free scans a month (one pool: labs, vaccines, vials)
    { label: t('pw_free_sync'), included: true },          // Cloud backup & sync (free)
    { label: t('paywall_feat_4'), included: false },       // Unlimited protocols
    { label: t('pw_prem_scan'), included: false },         // Lab, vaccine & vial scans (Premium)
    { label: t('pw_prem_pdf'), included: false },          // PDF export
    { label: t('pw_prem_reality'), included: false },      // Reality check + progress
    { label: t('body_card_dosing_title'), included: false }, // Dose accumulation / serum curve
  ];

  const PREMIUM_FEATURES = [
    t('paywall_feat_1'),        // Everything in Free
    t('paywall_feat_4'),        // Unlimited protocols
    t('pw_prem_scan_full'),     // Unlimited lab & vaccine scanning — photo/PDF, any language
    t('pw_prem_pdf'),           // PDF export for your doctor
    t('pw_prem_reality'),       // Reality check & progress tracking
    t('body_card_dosing_title'), // Dose accumulation / serum curve
  ];

  useEffect(() => {
    Analytics.viewed('paywall');
    // conversion funnel: per-source view, tagged with the hero variant and this
    // device's view number (best effort — storage failure still logs the view)
    (async () => {
      let viewCount = null;
      try {
        viewCount = (parseInt(await AsyncStorage.getItem(PAYWALL_VIEWS_KEY), 10) || 0) + 1;
        await AsyncStorage.setItem(PAYWALL_VIEWS_KEY, String(viewCount));
      } catch { /* ignore */ }
      Analytics.paywallViewed(source, { animVariant: PAYWALL_ANIM_VARIANT, viewCount });
    })();
    loadOfferings();
  }, []);

  async function loadOfferings() {
    const pkgs = await getOfferings();
    setPackages(pkgs);
    setLoading(false);

    // Trial eligibility (iOS-only API — null means unknown, show neutral copy)
    // Trial eligibility (iOS-only) is keyed by the real store product id, taken
    // from the actual subscription packages (see getPackageFor note on Android
    // base-plan suffixes).
    const subIds = pkgs
      .filter(p => p.packageType === 'MONTHLY' || p.packageType === 'ANNUAL')
      .map(p => p.product.identifier);
    if (subIds.length > 0) {
      const eligibility = await checkTrialEligibility(subIds);
      setTrialEligibility(eligibility);
    }
  }

  function getPackageFor(type) {
    // Match by RevenueCat packageType, NOT product.identifier. On Android a
    // subscription's product.identifier carries its base-plan suffix
    // (e.g. "monthly:p1m", "yearly:annual"), so matching the bare id hides every
    // subscription and leaves only the suffix-less lifetime product visible.
    const wanted = type === 'annual' ? 'ANNUAL'
      : type === 'monthly' ? 'MONTHLY'
      : 'LIFETIME';
    return packages.find(p => p.packageType === wanted);
  }

  const annualPkg = getPackageFor('annual');
  const monthlyPkg = getPackageFor('monthly');
  const lifetimePkg = getPackageFor('lifetime');
  const selectedPkg = getPackageFor(selected);
  const hasSubscription = !!(annualPkg || monthlyPkg);
  const hasAnyPackage = !!(hasSubscription || lifetimePkg);

  // Only claim a free trial when eligibility is confirmed by the store
  const trialEligible = !!(selectedPkg && trialEligibility &&
    trialEligibility[selectedPkg.product.identifier] === true);

  function monthlyEquivalent(pkg) {
    return pkg?.product?.pricePerMonthString || null;
  }

  function annualSavingsLabel() {
    const a = annualPkg?.product?.price;
    const m = monthlyPkg?.product?.price;
    if (!a || !m) return null;
    const pct = Math.round((1 - a / (m * 12)) * 100);
    return pct > 0 ? t('paywall_save_pct').replace('{pct}', String(pct)) : null;
  }

  function ctaSubText() {
    if (!selectedPkg) return '';
    const per = t(selected === 'annual' ? 'paywall_per_year' : 'paywall_per_month');
    const price = `${selectedPkg.product.priceString} ${per}`;
    const key = trialEligible ? 'paywall_then_price' : 'paywall_price_cancel';
    return t(key).replace('{price}', price);
  }

  async function doPurchase(pkg, plan) {
    if (!pkg) {
      Alert.alert(t('error'), t('paywall_product_unavailable'));
      return;
    }
    Analytics.paywallCtaTapped({ plan, source });
    setPurchasing(true);
    const result = await purchasePackage(pkg);
    setPurchasing(false);

    if (result.success) {
      // Refresh the ONE entitlement helper (it also writes the offline cache at once).
      const ent = await getEntitlement();
      const premium = result.premium || ent.premium;
      if (premium) Analytics.purchaseCompleted({ plan, source });
      if (premium && onSuccess) onSuccess();
      navigation.goBack();
    } else if (!result.cancelled) {
      Alert.alert(t('error'), friendlyError(result.error, t, 'paywall_purchase_failed'));
    }
  }

  function handlePurchase() {
    doPurchase(selectedPkg, selected);
  }

  function handleLifetime() {
    doPurchase(lifetimePkg, 'lifetime');
  }

  // Terms link: Apple's Standard EULA on iOS, DoseTrace's own terms (in-app) on Android.
  const terms = termsTarget(Platform.OS);
  const [showTerms, setShowTerms] = useState(false);

  async function handleRestore() {
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);

    if (result.success) {
      const ent = await getEntitlement();
      const premium = result.premium || ent.premium;
      if (premium) {
        Alert.alert(t('paywall_restored'), t('paywall_restored_msg'));
        if (onSuccess) onSuccess();
        navigation.goBack();
      } else {
        Alert.alert(t('paywall_no_purchases'), t('paywall_no_purchases_msg'));
      }
    } else {
      Alert.alert(t('error'), friendlyError(result.error, t, 'paywall_restore_failed'));
    }
  }

  // Graduated (docs/design/prototype.html paywallScreen, approved 2026-09-30):
  // hero curve, the 8 feature previews, the plans (selected = ink outline + ink
  // radio), Lifetime as a secondary action, ONE ink capsule to buy, the store's
  // billing text, then Restore + Terms of Use (EULA) + Privacy, then the comparison.
  const renderPlan = (plan, pkg) => {
    const on = selected === plan;
    const annual = plan === 'annual';
    const save = annual ? annualSavingsLabel() : null;
    return (
      <TouchableOpacity
        key={plan}
        style={[s.plan, on && s.planOn]}
        onPress={() => setSelected(plan)}
        activeOpacity={0.8}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
      >
        {annual ? (
          <View style={s.otag}><Text style={s.otagText}>{t('paywall_best_value')}</Text></View>
        ) : (
          <View style={s.otagSpace} />
        )}
        <View style={[s.radio, on && s.radioOn]} />
        <Text style={s.planName}>{t(annual ? 'paywall_annual' : 'paywall_monthly')}</Text>
        {/* The billed amount is the biggest price on the card; the length sits next to it. */}
        <Text style={s.planPrice} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{pkg.product.priceString}</Text>
        <Text style={s.planPer}>{t(annual ? 'paywall_per_year' : 'paywall_per_month')}</Text>
        {annual ? (
          <>
            {save ? <Text style={s.planSave}>{save}</Text> : null}
            {monthlyEquivalent(pkg) ? (
              <Text style={s.planFoot}>{`${monthlyEquivalent(pkg)} ${t('paywall_per_month')}`}</Text>
            ) : null}
          </>
        ) : (
          <Text style={[s.planFoot, s.planFootEnd]}>{t('paywall_billed_monthly')}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.nav}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.navSide} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.navBack} numberOfLines={1}>{t('paywall_back')}</Text>
        </TouchableOpacity>
        <Text style={s.navTitle} numberOfLines={1}>{t('paywall_title')}</Text>
        <View style={s.navSide} />
      </View>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>

        <View style={s.hero}>
          {/* Show the moat, don't describe it: the dose-accumulation curve draws
              itself at the purchase moment. Illustrative Example data only —
              the user's real curve is computed from their own log once Premium. */}
          <AccumulationHero width={heroW} height={140} />
          <Text style={s.heroTitle}>{t('paywall_hero_title')}</Text>
          <Text style={s.heroSub}>{t('paywall_hero_sub')}</Text>
        </View>

        {/* Tap any feature to SEE it (an Example animation) before deciding. */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>{t('pw_preview_heading')}</Text>
            <Text style={s.sectionSub}>{t('pw_preview_hint')}</Text>
          </View>
          <View style={s.list}>
            {PREVIEW_FEATURES.map((f, i) => (
              <TouchableOpacity
                key={f.key}
                style={[s.row, i > 0 && s.rowSep]}
                activeOpacity={0.7}
                onPress={() => openPreview(f.key)}
                accessibilityRole="button"
              >
                <FeatureIcon name={f.icon} size={26} color={colors.data} />
                <Text style={s.rowText}>{t(f.titleKey)}</Text>
                <Text style={s.chev}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View onLayout={(e) => { plansY.current = e.nativeEvent.layout.y; }}>
          {loading ? (
            <View style={s.loadingBox}>
              <ActivityIndicator color={colors.ink2} />
            </View>
          ) : !hasAnyPackage ? (
            <View style={s.unavailable}>
              <Text style={s.unavailableText}>{t('paywall_unavailable')}</Text>
            </View>
          ) : (
            <View style={s.buy}>
              {hasSubscription && (
                <View style={s.plans} accessibilityRole="radiogroup">
                  {annualPkg && renderPlan('annual', annualPkg)}
                  {monthlyPkg && renderPlan('monthly', monthlyPkg)}
                </View>
              )}

              {lifetimePkg && (
                <View style={s.lifetime}>
                  <View style={s.lifetimeRow}>
                    <View style={s.lifetimeText}>
                      <Text style={s.lifetimeTitle}>{t('paywall_lifetime_title')}</Text>
                      <Text style={s.lifetimeSub}>{t('paywall_lifetime_sub')}</Text>
                    </View>
                    <TouchableOpacity
                      style={[s.lifetimeBtn, purchasing && s.busy]}
                      onPress={handleLifetime}
                      disabled={purchasing}
                      accessibilityRole="button"
                    >
                      <Text style={s.lifetimeBtnText}>{lifetimePkg.product.priceString}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.lifetimeNote}>{t('paywall_lifetime_note')}</Text>
                </View>
              )}

              {hasSubscription && (
                <TouchableOpacity
                  style={[s.cta, purchasing && s.busy]}
                  onPress={handlePurchase}
                  disabled={purchasing}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  {purchasing ? (
                    <ActivityIndicator color={colors.onAct} />
                  ) : (
                    <>
                      <Text style={s.ctaText}>
                        {trialEligible ? t('paywall_start_trial') : t('paywall_subscribe_now')}
                      </Text>
                      <Text style={s.ctaSub}>{ctaSubText()}</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {hasSubscription && (
                <Text style={s.legalNote}>
                  {(trialEligible ? t('paywall_legal') : t('paywall_legal_no_trial'))
                    .replace(/\{store\}/g, Platform.OS === 'ios' ? 'Apple ID' : 'Google Play')}
                </Text>
              )}
            </View>
          )}
        </View>

        <View style={s.links}>
          <TouchableOpacity
            style={[s.linkBtn, restoring && s.busy]}
            onPress={handleRestore}
            disabled={restoring}
            accessibilityRole="button"
          >
            {restoring ? (
              <ActivityIndicator size="small" color={colors.ink2} />
            ) : (
              <Text style={s.restoreText}>{t('paywall_restore')}</Text>
            )}
          </TouchableOpacity>

          {/* App Store 3.1.2: Terms of Use (EULA) + Privacy Policy in the purchase flow. */}
          <View style={s.legalRow}>
            <TouchableOpacity
              style={s.linkBtn}
              onPress={() => (terms.kind === 'url' ? Linking.openURL(terms.url).catch(() => {}) : setShowTerms(true))}
              accessibilityRole="link"
            >
              <Text style={s.legalLink}>{t(terms.labelKey)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.linkBtn} onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} accessibilityRole="link">
              <Text style={s.legalLink}>{t('settings_privacy_policy')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.section}>
          <Text style={[s.sectionTitle, s.sectionHead]}>{t('paywall_free_vs_premium')}</Text>
          <View style={s.list}>
            <View style={s.cmpRow}>
              <Text style={[s.cmpHead, s.cmpLabelCol]}>{t('paywall_feature')}</Text>
              <Text style={[s.cmpHead, s.cmpCell]}>{t('paywall_free')}</Text>
              <Text style={[s.cmpHead, s.cmpCell, s.cmpHeadPremium]}>{t('paywall_premium')}</Text>
            </View>
            {FREE_FEATURES.map((f, i) => (
              <View key={i} style={[s.cmpRow, s.rowSep]}>
                <Text style={[s.cmpLabel, s.cmpLabelCol]}>{f.label}</Text>
                <View style={s.cmpCell}>
                  {f.included
                    ? <CheckMark size={18} color={colors.ink} />
                    : <Text style={s.cmpNo}>—</Text>}
                </View>
                <View style={s.cmpCell}><CheckMark size={18} color={colors.ink} /></View>
              </View>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={[s.sectionTitle, s.sectionHead]}>{t('paywall_whats_included_premium')}</Text>
          <View style={s.names}>
            {PREMIUM_FEATURES.map((f, i) => (
              <View key={i} style={s.nameRow}>
                <CheckMark size={20} color={colors.data} />
                <Text style={s.nameText}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <FeaturePreviewSheet featureKey={previewKey} onClose={() => setPreviewKey(null)} onUnlock={unlockFromPreview} />
      {terms.kind === 'inApp' && (
        <LegalModal
          visible={showTerms}
          onClose={() => setShowTerms(false)}
          title={t(terms.titleKey)}
          content={t(terms.bodyKey)}
          doneLabel={t('done')}
        />
      )}
    </SafeAreaView>
  );
}

// Theme tokens only (lib/theme.js, both palettes). Type: Geist from 22 pt up
// (lib/fonts.js), weights stop at 700, no uppercase letter-spaced labels.
const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.ground },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 16, gap: 8 },
  navSide: { width: 72, minHeight: 44, justifyContent: 'center' },
  navBack: { fontSize: 17, color: c.ink },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: c.ink },
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 24 },

  hero: { gap: 10, alignItems: 'center' },
  heroTitle: { fontSize: 30, lineHeight: 36, fontWeight: '700', color: c.ink, textAlign: 'center', letterSpacing: -0.5, marginTop: 6 },
  heroSub: { fontSize: 17, lineHeight: 22, color: c.ink2, textAlign: 'center' },

  section: { gap: 10 },
  sectionHead: { gap: 2, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: c.ink },
  sectionSub: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  list: { backgroundColor: c.raised, borderRadius: 22, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  rowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  rowText: { flex: 1, fontSize: 17, lineHeight: 22, color: c.ink },
  chev: { fontSize: 22, color: c.ink3 },

  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  unavailable: { backgroundColor: c.raised, borderRadius: 20, padding: 20, alignItems: 'center' },
  unavailableText: { fontSize: 15, lineHeight: 20, color: c.ink2, textAlign: 'center' },

  buy: { gap: 12 },
  plans: { flexDirection: 'row', gap: 10 },
  // Unselected = 1.5 line outline; selected = 2.5 ink outline (padding keeps the size).
  plan: { flex: 1, backgroundColor: c.raised, borderRadius: 20, padding: 15, gap: 4, borderWidth: 1.5, borderColor: c.line },
  planOn: { padding: 14, borderWidth: 2.5, borderColor: c.ink },
  otag: { alignSelf: 'flex-start', minHeight: 24, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: c.line, justifyContent: 'center', marginRight: 28 },
  otagText: { fontSize: 12, fontWeight: '600', color: c.ink2 },
  otagSpace: { height: 24 },
  radio: { position: 'absolute', top: 14, right: 12, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.tick },
  radioOn: { borderWidth: 7, borderColor: c.ink },
  planName: { fontSize: 17, fontWeight: '600', color: c.ink, marginTop: 4 },
  planPrice: { fontSize: 28, fontWeight: '300', color: c.ink, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  planPer: { fontSize: 13, lineHeight: 18, color: c.ink2 },
  planSave: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: c.data, fontVariant: ['tabular-nums'] },
  planFoot: { fontSize: 13, lineHeight: 18, color: c.ink2, fontVariant: ['tabular-nums'] },
  planFootEnd: { marginTop: 'auto' },

  lifetime: { backgroundColor: c.raised, borderRadius: 24, padding: 18, gap: 12 },
  lifetimeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lifetimeText: { flex: 1, gap: 3 },
  lifetimeTitle: { fontSize: 17, fontWeight: '600', color: c.ink },
  lifetimeSub: { fontSize: 15, lineHeight: 20, color: c.ink2 },
  // Secondary action: a well capsule (the one primary action is the ink capsule below).
  lifetimeBtn: { flexShrink: 0, minHeight: 44, borderRadius: 22, backgroundColor: c.well, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  lifetimeBtnText: { fontSize: 15, fontWeight: '700', color: c.ink, fontVariant: ['tabular-nums'] },
  lifetimeNote: { fontSize: 13, lineHeight: 18, color: c.ink2 },

  cta: { minHeight: 64, borderRadius: 32, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 10, gap: 2 },
  ctaText: { fontSize: 17, fontWeight: '700', color: c.onAct, textAlign: 'center' },
  ctaSub: { fontSize: 12, fontWeight: '500', color: c.onAct, opacity: 0.85, textAlign: 'center' },
  busy: { opacity: 0.6 },
  legalNote: { fontSize: 13, lineHeight: 18, color: c.ink2, textAlign: 'center', paddingHorizontal: 8 },

  links: { alignItems: 'center', gap: 2, marginTop: -8 },
  linkBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  restoreText: { fontSize: 17, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
  legalRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 24 },
  legalLink: { fontSize: 15, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },

  cmpRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingVertical: 8 },
  cmpLabelCol: { flex: 1 },
  cmpCell: { width: 64, alignItems: 'center', textAlign: 'center' },
  cmpHead: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: c.ink2 },
  cmpHeadPremium: { color: c.data, fontWeight: '700' },
  cmpLabel: { fontSize: 15, lineHeight: 20, color: c.ink },
  cmpNo: { fontSize: 15, fontWeight: '600', color: c.ink3 },

  names: { gap: 8, paddingHorizontal: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  nameText: { flex: 1, fontSize: 17, lineHeight: 22, color: c.ink },
});
