import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  isPremium,
  checkTrialEligibility,
} from '../lib/purchases';
import { useTheme } from '../lib/theme';
import { friendlyError } from '../lib/friendlyError';

export default function PaywallScreen({ navigation, route }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [selected, setSelected] = useState('annual');
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [trialEligibility, setTrialEligibility] = useState(null); // null = unknown
  const onSuccess = route?.params?.onSuccess;

  const FREE_FEATURES = [
    { label: t('paywall_free_feat_1'), included: true },   // Reconstitution calculator
    { label: t('paywall_free_feat_3'), included: true },   // Up to 3 protocols
    { label: t('paywall_free_feat_4'), included: true },   // Injection log & vial tracker
    { label: t('paywall_free_feat_5'), included: true },   // Reminders
    { label: t('pw_free_labvax'), included: true },        // Lab & vaccine journals (manual)
    { label: t('pw_free_calc'), included: true },          // Energy & protein calculator
    { label: t('pw_free_scan1'), included: true },         // 1 free lab scan
    { label: t('pw_free_sync'), included: true },          // Cloud backup & sync (free)
    { label: t('paywall_feat_4'), included: false },       // Unlimited protocols
    { label: t('pw_prem_scan'), included: false },         // Unlimited lab & vaccine scanning
    { label: t('pw_prem_pdf'), included: false },          // PDF export
    { label: t('pw_prem_reality'), included: false },      // Reality check + progress
  ];

  const PREMIUM_FEATURES = [
    t('paywall_feat_1'),        // Everything in Free
    t('paywall_feat_4'),        // Unlimited protocols
    t('pw_prem_scan_full'),     // Unlimited lab & vaccine scanning — photo/PDF, any language
    t('pw_prem_pdf'),           // PDF export for your doctor
    t('pw_prem_reality'),       // Reality check & progress tracking
  ];

  useEffect(() => {
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

  async function doPurchase(pkg) {
    if (!pkg) {
      Alert.alert(t('error'), t('paywall_product_unavailable'));
      return;
    }
    setPurchasing(true);
    const result = await purchasePackage(pkg);
    setPurchasing(false);

    if (result.success) {
      // Re-check entitlement before unlocking
      const premium = result.premium || (await isPremium());
      if (premium && onSuccess) onSuccess();
      navigation.goBack();
    } else if (!result.cancelled) {
      Alert.alert(t('error'), friendlyError(result.error, t, 'paywall_purchase_failed'));
    }
  }

  function handlePurchase() {
    doPurchase(selectedPkg);
  }

  function handleLifetime() {
    doPurchase(lifetimePkg);
  }

  async function handleRestore() {
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);

    if (result.success) {
      const premium = result.premium || (await isPremium());
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

  return (
    <SafeAreaView style={s.container}>
      <View style={s.nav}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.navBack}>{t('paywall_back')}</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>{t('paywall_title')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        <View style={s.hero}>
          <Text style={s.heroIcon}>🚀</Text>
          <Text style={s.heroTitle}>{t('paywall_hero_title')}</Text>
          <Text style={s.heroSub}>
            {t('paywall_hero_sub')}
          </Text>
        </View>

        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : !hasAnyPackage ? (
          <View style={s.loadingBox}>
            <Text style={s.unavailableText}>{t('paywall_unavailable')}</Text>
          </View>
        ) : (
          <>
            <View style={s.planRow}>
              {annualPkg && (
                <TouchableOpacity
                  style={[s.planCard, selected === 'annual' && s.planCardSelected]}
                  onPress={() => setSelected('annual')}
                >
                  <View style={s.bestValueBadge}>
                    <Text style={s.bestValueText}>{t('paywall_best_value')}</Text>
                  </View>
                  <View style={s.planRadio}>
                    <View style={[s.planRadioInner, selected === 'annual' && s.planRadioInnerOn]} />
                  </View>
                  <Text style={s.planName}>{t('paywall_annual')}</Text>
                  <Text style={s.planPrice}>{annualPkg.product.priceString}</Text>
                  <Text style={s.planPer}>{t('paywall_per_year')}</Text>
                  {annualSavingsLabel() ? (
                    <View style={s.saveBadge}>
                      <Text style={s.saveBadgeText}>{annualSavingsLabel()}</Text>
                    </View>
                  ) : (
                    <View style={{ height: 22 }} />
                  )}
                  {monthlyEquivalent(annualPkg) && (
                    <Text style={s.planMonthly}>
                      {`${monthlyEquivalent(annualPkg)} ${t('paywall_per_month')}`}
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {monthlyPkg && (
                <TouchableOpacity
                  style={[s.planCard, selected === 'monthly' && s.planCardSelected]}
                  onPress={() => setSelected('monthly')}
                >
                  <View style={s.planRadio}>
                    <View style={[s.planRadioInner, selected === 'monthly' && s.planRadioInnerOn]} />
                  </View>
                  <Text style={s.planName}>{t('paywall_monthly')}</Text>
                  <Text style={s.planPrice}>{monthlyPkg.product.priceString}</Text>
                  <Text style={s.planPer}>{t('paywall_per_month')}</Text>
                  <View style={{ height: 22 }} />
                  <Text style={s.planMonthly}>{t('paywall_billed_monthly')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {lifetimePkg && (
              <View style={s.lifetimeCard}>
                <View style={s.lifetimeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.lifetimeTitle}>{t('paywall_lifetime_title')}</Text>
                    <Text style={s.lifetimeSub}>{t('paywall_lifetime_sub')}</Text>
                  </View>
                  <TouchableOpacity
                    style={[s.lifetimeBtn, purchasing && { opacity: 0.6 }]}
                    onPress={handleLifetime}
                    disabled={purchasing}
                  >
                    <Text style={s.lifetimeBtnText}>{lifetimePkg.product.priceString}</Text>
                    <Text style={s.lifetimeBtnSub}>{t('paywall_lifetime_note')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {hasSubscription && (
              <TouchableOpacity
                style={[s.ctaBtn, purchasing && { opacity: 0.6 }]}
                onPress={handlePurchase}
                disabled={purchasing}
              >
                {purchasing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={s.ctaBtnText}>
                      {trialEligible ? t('paywall_start_trial') : t('paywall_subscribe_now')}
                    </Text>
                    <Text style={s.ctaBtnSub}>{ctaSubText()}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <Text style={s.legalNote}>
              {trialEligible ? t('paywall_legal') : t('paywall_legal_no_trial')}
            </Text>
          </>
        )}

        <View style={s.divider} />

        <Text style={s.sectionTitle}>{t('paywall_free_vs_premium')}</Text>

        <View style={s.compareCard}>
          <View style={s.compareHeader}>
            <Text style={[s.compareCol, { flex: 2, textAlign: 'left' }]}>{t('paywall_feature')}</Text>
            <Text style={s.compareCol}>{t('paywall_free')}</Text>
            <Text style={[s.compareCol, { color: colors.accent, fontWeight: '600' }]}>{t('paywall_premium')}</Text>
          </View>
          {FREE_FEATURES.map((f, i) => (
            <View key={i} style={[s.compareRow, i === FREE_FEATURES.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={[s.compareLabel, { flex: 2 }]}>{f.label}</Text>
              <Text style={[s.compareVal, { color: f.included ? colors.success : colors.danger }]}>
                {f.included ? '✓' : '✕'}
              </Text>
              <Text style={[s.compareVal, { color: colors.success }]}>✓</Text>
            </View>
          ))}
        </View>

        <View style={s.divider} />

        <Text style={s.sectionTitle}>{t('paywall_whats_included_premium')}</Text>

        <View style={s.featuresCard}>
          {PREMIUM_FEATURES.map((f, i) => (
            <View key={i} style={[s.featRow, { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
              <Text style={s.featCheck}>✓</Text>
              <Text style={s.featText}>{f}</Text>
            </View>
          ))}
        </View>

        {!loading && hasSubscription && (
          <TouchableOpacity
            style={[s.ctaBtn, { marginTop: 16 }, purchasing && { opacity: 0.6 }]}
            onPress={handlePurchase}
            disabled={purchasing}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={s.ctaBtnText}>
                  {trialEligible ? t('paywall_start_trial') : t('paywall_subscribe_now')}
                </Text>
                <Text style={s.ctaBtnSub}>{ctaSubText()}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[s.restoreBtn, restoring && { opacity: 0.6 }]}
          onPress={handleRestore}
          disabled={restoring}
        >
          {restoring ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Text style={s.restoreBtnText}>{t('paywall_restore')}</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: c.card },
  navBack: { fontSize: 14, color: c.accent, width: 60 },
  navTitle: { fontSize: 15, fontWeight: '600', color: c.text },
  hero: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24, backgroundColor: c.card, borderBottomWidth: 0.5, borderBottomColor: c.border },
  heroIcon: { fontSize: 48, marginBottom: 12 },
  heroTitle: { fontSize: 26, fontWeight: '700', color: c.text, marginBottom: 8 },
  heroSub: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 22 },
  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  unavailableText: { fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 20 },
  planRow: { flexDirection: 'row', gap: 12, padding: 16 },
  planCard: { flex: 1, backgroundColor: c.card, borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', position: 'relative', overflow: 'visible', marginTop: 12 },
  planCardSelected: { borderColor: c.accent, backgroundColor: c.accentSoft },
  bestValueBadge: { position: 'absolute', top: -12, backgroundColor: c.accent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  bestValueText: { fontSize: 10, fontWeight: '700', color: c.accentText, letterSpacing: 0.5 },
  planRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: c.border, alignItems: 'center', justifyContent: 'center', marginBottom: 10, marginTop: 8 },
  planRadioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'transparent' },
  planRadioInnerOn: { backgroundColor: c.accent },
  planName: { fontSize: 13, fontWeight: '600', color: c.text, marginBottom: 6 },
  planPrice: { fontSize: 28, fontWeight: '700', color: c.text },
  planPer: { fontSize: 11, color: c.textMuted, marginBottom: 8 },
  saveBadge: { backgroundColor: c.successSoft, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, marginBottom: 6 },
  saveBadgeText: { fontSize: 11, fontWeight: '600', color: c.successSoftText },
  planMonthly: { fontSize: 11, color: c.textMuted },
  lifetimeCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: c.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.border },
  lifetimeRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  lifetimeTitle: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 2 },
  lifetimeSub: { fontSize: 12, color: c.textMuted, lineHeight: 18 },
  lifetimeBtn: { backgroundColor: c.accent, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center' },
  lifetimeBtnText: { color: c.accentText, fontSize: 18, fontWeight: '700' },
  lifetimeBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 2 },
  ctaBtn: { marginHorizontal: 16, backgroundColor: c.accent, borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 12 },
  ctaBtnText: { color: c.accentText, fontSize: 16, fontWeight: '700', marginBottom: 3 },
  ctaBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11 },
  legalNote: { fontSize: 10, color: c.textFaint, textAlign: 'center', paddingHorizontal: 24, lineHeight: 16, marginBottom: 8 },
  divider: { height: 8, backgroundColor: c.border, marginVertical: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: c.text, marginHorizontal: 16, marginTop: 16, marginBottom: 12 },
  featuresCard: { marginHorizontal: 16, backgroundColor: c.card, borderRadius: 16, overflow: 'hidden' },
  featRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 13, borderBottomWidth: 0.5, borderBottomColor: c.border },
  featCheck: { color: c.success, fontWeight: '700', fontSize: 14, width: 16 },
  featText: { fontSize: 13, color: c.text, flex: 1, lineHeight: 20 },
  compareCard: { marginHorizontal: 16, backgroundColor: c.card, borderRadius: 16, overflow: 'hidden' },
  compareHeader: { flexDirection: 'row', padding: 12, backgroundColor: c.card2, borderBottomWidth: 0.5, borderBottomColor: c.border },
  compareCol: { flex: 1, fontSize: 11, fontWeight: '600', color: c.textMuted, textAlign: 'center' },
  compareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 0.5, borderBottomColor: c.border },
  compareLabel: { fontSize: 12, color: c.textMuted, lineHeight: 18 },
  compareVal: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '600' },
  bloodworkCard: { marginHorizontal: 16, backgroundColor: c.card, borderRadius: 16, padding: 16 },
  bloodworkTitle: { fontSize: 16, fontWeight: '600', color: c.text, marginBottom: 8 },
  bloodworkSub: { fontSize: 13, color: c.textMuted, lineHeight: 20, marginBottom: 16 },
  bloodworkOptions: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  bloodworkOption: { flex: 1, alignItems: 'flex-start' },
  bloodworkOptionTitle: { fontSize: 11, color: c.textMuted, fontWeight: '500', marginBottom: 2 },
  bloodworkOptionPrice: { fontSize: 24, fontWeight: '700', color: c.text },
  bloodworkOptionPer: { fontSize: 11, color: c.textMuted },
  bloodworkDivider: { width: 0.5, height: 50, backgroundColor: c.border, marginHorizontal: 16 },
  bloodworkNote: { fontSize: 12, color: c.warningSoftText, backgroundColor: c.warningSoft, borderRadius: 8, padding: 10, lineHeight: 18 },
  singleUploadCard: { marginHorizontal: 16, backgroundColor: c.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: c.border },
  singleUploadTitle: { fontSize: 14, fontWeight: '600', color: c.text, marginBottom: 6 },
  singleUploadSub: { fontSize: 12, color: c.textMuted, lineHeight: 18, marginBottom: 12 },
  singleUploadBtn: { borderWidth: 1, borderColor: c.accent, borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 8 },
  singleUploadBtnText: { fontSize: 13, color: c.accent, fontWeight: '600' },
  singleUploadNote: { fontSize: 11, color: c.warningSoftText, textAlign: 'center' },
  restoreBtn: { alignItems: 'center', paddingVertical: 14 },
  restoreBtnText: { fontSize: 13, color: c.textMuted },
});
