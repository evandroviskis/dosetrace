import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
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
import RowChevron from '../components/RowChevron';
import AccumulationHero from '../components/AccumulationHero';
import { FeaturePreviewSheet, PREVIEW_FEATURES } from '../components/FeaturePreviews';
import { DTSheet } from './components/ProtocolParts';
import { getEntitlement } from '../lib/entitlement';
import { PRIVACY_URL, termsTarget } from '../lib/legalLinks';
import {
  pickPackages, paywallView, savingsPct, perMonthString, ctaModel, defaultPlan,
  purchaseOutcome, restoreOutcome, outcomeSheet, comparisonRows, includedLines, storeName,
} from '../lib/paywallPlans';
import { FREE_DAYS } from '../lib/foodThread';
import LegalModal from '../components/LegalModal';
import { Analytics } from '../lib/analytics';
import CheckMark from '../components/CheckMark';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PAYWALL_VIEWS_KEY = 'dosetrace_paywall_views';
const PAYWALL_ANIM_VARIANT = 'hero_b'; // bump when the paywall hero animation changes

// The back arrow (prototype CHEV), drawn — never a font glyph.
function BackChevron({ color }) {
  return (
    <Svg width={11} height={18} viewBox="0 0 10 16" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M8 2 L2 8 L8 14" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * Upgrade to Premium (docs/specs/premium-and-auth.md PA-1…PA-21; prototype paywallScreen,
 * approved from the pictures 2026-10-03). Every price, saving and trial comes from the store
 * at runtime (lib/paywallPlans); every message is a DoseTrace sheet, never a native alert.
 */
export default function PaywallScreen({ navigation, route }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { width: winW } = useWindowDimensions();
  // The hero card is the content width (screen gutter 16) — its curve is 28 narrower.
  const heroW = Math.min(CONTENT_MAX_WIDTH, winW) - 32 - 28;
  const scrollRef = useRef(null);
  const plansY = useRef(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  // Which entry point sent the user here (serum card, PDF wall, settings, protocol limit,
  // preview sheet, …) — for per-source conversion.
  const source = route?.params?.source || 'unknown';
  const onSuccess = route?.params?.onSuccess;
  const [selected, setSelected] = useState(null);
  const [packages, setPackages] = useState([]);
  const [eligibility, setEligibility] = useState(null); // iOS { productId: bool }; null = unknown
  const [loading, setLoading] = useState(true);
  const [premium, setPremium] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [previewKey, setPreviewKey] = useState(null); // which feature preview sheet is open
  const [sheet, setSheet] = useState(null); // the DoseTrace message sheet
  const [showTerms, setShowTerms] = useState(false);

  // Terms link: Apple's Standard EULA on iOS, DoseTrace's own terms (in-app) on Android.
  const terms = termsTarget(Platform.OS);

  const leave = useCallback(() => { if (navigation.canGoBack?.() !== false) navigation.goBack(); }, [navigation]);

  // A message sheet for one outcome (lib/paywallPlans outcomeSheet). Done on a success
  // sheet leaves the paywall; every other sheet just closes (OK).
  const showOutcome = useCallback((kind) => {
    const cfg = outcomeSheet(kind, t);
    if (!cfg) return;
    setSheet({
      icon: cfg.icon,
      title: cfg.title,
      body: cfg.body,
      buttons: [{ label: cfg.done ? t('done') : t('ok'), kind: 'primary', onPress: cfg.done ? leave : undefined }],
    });
  }, [t, leave]);

  // Prices, the trial answer and the user's Premium state, all before any buy button
  // shows (PA-6): the label never changes under the user's thumb.
  const load = useCallback(async () => {
    setLoading(true);
    const [pkgs, ent] = await Promise.all([
      getOfferings().catch(() => []),
      getEntitlement().catch(() => ({ premium: false })),
    ]);
    let elig = null;
    const subIds = (pkgs || [])
      .filter((p) => p && (p.packageType === 'MONTHLY' || p.packageType === 'ANNUAL') && p.product)
      .map((p) => p.product.identifier);
    if (subIds.length > 0) elig = await checkTrialEligibility(subIds).catch(() => null);
    if (!mounted.current) return;
    setPackages(pkgs || []);
    setEligibility(elig);
    setSelected((cur) => cur || defaultPlan(pkgs));
    setPremium(!!(ent && ent.premium));
    setLoading(false);
    if (ent && ent.premium) showOutcome('premium_already');
  }, [showOutcome]);

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
    load();
  }, []);

  function openPreview(key) {
    Analytics.previewSheetViewed(key);
    setPreviewKey(key);
  }

  // "Unlock with Premium" inside a preview: we are already on the paywall, so it closes the
  // sheet and brings the plans into view (no purchase is started).
  function unlockFromPreview() {
    setPreviewKey(null);
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, plansY.current - 12), animated: true }), 250);
  }

  const view = paywallView({ loading, premium, pkgs: packages });
  const { annual: annualPkg, monthly: monthlyPkg, lifetime: lifetimePkg } = pickPackages(packages);
  const cta = selected ? ctaModel({ selected, pkgs: packages, eligibility, platform: Platform.OS, t }) : null;
  const save = savingsPct(annualPkg, monthlyPkg);
  const perMonth = perMonthString(annualPkg, language);

  async function doPurchase(pkg, plan) {
    if (purchasing) return;
    if (!pkg) { showOutcome('unavailable'); return; }
    Analytics.paywallCtaTapped({ plan, source });
    setPurchasing(true);
    const result = await purchasePackage(pkg);
    let premiumNow = false;
    // Refresh the ONE entitlement helper (it also writes the offline cache at once).
    if (result && result.success) premiumNow = !!(await getEntitlement().catch(() => ({ premium: false }))).premium;
    if (!mounted.current) return;
    setPurchasing(false);
    const outcome = purchaseOutcome(result, premiumNow);
    if (outcome === 'premium') {
      Analytics.purchaseCompleted({ plan, source });
      if (onSuccess) onSuccess();
      leave();
      return;
    }
    showOutcome(outcome); // pending / failed; cancelled says nothing
  }

  async function handleRestore() {
    if (restoring) return;
    setRestoring(true);
    const result = await restorePurchases();
    let premiumNow = false;
    if (result && result.success) premiumNow = !!(await getEntitlement().catch(() => ({ premium: false }))).premium;
    if (!mounted.current) return;
    setRestoring(false);
    const outcome = restoreOutcome(result, premiumNow);
    if (outcome === 'restored' && onSuccess) onSuccess();
    showOutcome(outcome === 'failed' ? 'restore_failed' : outcome);
  }

  // Graduated (prototype paywallScreen): hero curve, the 8 feature previews, the plans
  // (selected = ink outline + ink radio), Lifetime as a secondary action, ONE ink capsule to
  // buy, the store's billing text, then Restore + Terms of Use (EULA) + Privacy, then the
  // comparison and what Premium includes.
  const renderPlan = (plan, pkg) => {
    const on = selected === plan;
    const isAnnual = plan === 'annual';
    return (
      <TouchableOpacity
        key={plan}
        style={[s.plan, on && s.planOn]}
        onPress={() => setSelected(plan)}
        activeOpacity={0.8}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
      >
        {isAnnual ? (
          <View style={s.otag}><Text style={s.otagText}>{t('paywall_best_value')}</Text></View>
        ) : (
          <View style={s.otagSpace} />
        )}
        <View style={[s.radio, on && s.radioOn]} />
        <Text style={s.planName}>{t(isAnnual ? 'paywall_annual' : 'paywall_monthly')}</Text>
        {/* Apple 3.1.2: the billed amount is the biggest price on the card; the length sits next to it. */}
        <Text style={s.planPrice} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{pkg.product.priceString}</Text>
        <Text style={s.planPer}>{t(isAnnual ? 'paywall_per_year' : 'paywall_per_month')}</Text>
        {isAnnual ? (
          <>
            {save ? <Text style={s.planSave}>{t('paywall_save_pct').replace('{pct}', String(save))}</Text> : null}
            {perMonth ? <Text style={s.planFoot}>{`${perMonth} ${t('paywall_per_month')}`}</Text> : null}
          </>
        ) : (
          <Text style={[s.planFoot, s.planFootEnd]}>{t('paywall_billed_monthly')}</Text>
        )}
      </TouchableOpacity>
    );
  };

  const rows = comparisonRows(t, { freeFoodDays: FREE_DAYS });

  return (
    <SafeAreaView style={s.container}>
      <View style={s.nav}>
        <TouchableOpacity onPress={leave} style={[s.navSide, s.navBack]} accessibilityRole="button" accessibilityLabel={t('back')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <BackChevron color={colors.ink} />
          <Text style={s.navBackText} numberOfLines={1}>{t('back')}</Text>
        </TouchableOpacity>
        <Text style={s.navTitle} numberOfLines={1}>{t('paywall_title')}</Text>
        <View style={s.navSide} />
      </View>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>

        <View style={s.hero}>
          {/* Show the moat, don't describe it: the dose-accumulation curve draws itself at the
              purchase moment. Illustrative Example data only. */}
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
                <RowChevron color={colors.tick} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View onLayout={(e) => { plansY.current = e.nativeEvent.layout.y; }}>
          {view === 'loading' ? (
            <View style={s.loadingBox}>
              <ActivityIndicator color={colors.ink2} />
            </View>
          ) : view === 'unavailable' ? (
            <View style={s.unavailable}>
              <Text style={s.unavailableText}>{t('paywall_unavailable')}</Text>
              <TouchableOpacity style={s.linkBtn} onPress={load} accessibilityRole="button">
                <Text style={s.legalLink}>{t('pw_try_again')}</Text>
              </TouchableOpacity>
            </View>
          ) : view === 'plans' ? (
            <View style={s.buy}>
              {(annualPkg || monthlyPkg) && (
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
                      onPress={() => doPurchase(lifetimePkg, 'lifetime')}
                      disabled={purchasing}
                      accessibilityRole="button"
                    >
                      <Text style={s.lifetimeBtnText}>{lifetimePkg.product.priceString}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.lifetimeNote}>{t('paywall_lifetime_note')}</Text>
                </View>
              )}

              {cta && (
                <TouchableOpacity
                  style={[s.cta, purchasing && s.busy]}
                  onPress={() => doPurchase(cta.pkg, selected)}
                  disabled={purchasing}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  {purchasing ? (
                    <ActivityIndicator color={colors.onAct} />
                  ) : (
                    <>
                      <Text style={s.ctaText}>{cta.title}</Text>
                      <Text style={s.ctaSub}>{cta.sub}</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {cta && (
                <Text style={s.legalNote}>
                  {t(cta.legalKey).replace(/\{store\}/g, storeName(Platform.OS))}
                </Text>
              )}
            </View>
          ) : null}
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
            {rows.map((r, i) => (
              <View key={i} style={[s.cmpRow, s.rowSep]}>
                <Text style={[s.cmpLabel, s.cmpLabelCol]}>{r.label}</Text>
                <View style={s.cmpCell}>
                  {r.free === true
                    ? <CheckMark size={18} color={colors.ink} />
                    : r.free === false
                      ? <Text style={s.cmpNo}>—</Text>
                      : <Text style={s.cmpAmount}>{r.free}</Text>}
                </View>
                <View style={s.cmpCell}><CheckMark size={18} color={colors.ink} /></View>
              </View>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={[s.sectionTitle, s.sectionHead]}>{t('paywall_whats_included_premium')}</Text>
          <View style={s.names}>
            {includedLines(t).map((f, i) => (
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
      <DTSheet config={sheet} onClose={() => setSheet(null)} />
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
  navSide: { width: 76, minHeight: 44, justifyContent: 'center' },
  navBack: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 6 },
  navBackText: { fontSize: 17, color: c.ink },
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

  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  unavailable: { backgroundColor: c.raised, borderRadius: 20, padding: 20, alignItems: 'center', gap: 4 },
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
  cmpCell: { width: 72, alignItems: 'center', textAlign: 'center' },
  cmpHead: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: c.ink2 },
  cmpHeadPremium: { color: c.data, fontWeight: '700' },
  cmpLabel: { fontSize: 15, lineHeight: 20, color: c.ink },
  cmpNo: { fontSize: 15, fontWeight: '600', color: c.ink3 },
  cmpAmount: { fontSize: 12, lineHeight: 16, color: c.ink, textAlign: 'center', fontVariant: ['tabular-nums'] },

  names: { gap: 8, paddingHorizontal: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  nameText: { flex: 1, fontSize: 17, lineHeight: 22, color: c.ink },
});
