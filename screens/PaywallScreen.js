import { useState, useEffect } from 'react';
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
  PRODUCT_IDS,
} from '../lib/purchases';

export default function PaywallScreen({ navigation, route }) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState('annual');
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const onSuccess = route?.params?.onSuccess;

  const FREE_FEATURES = [
    { label: t('paywall_free_feat_1'), included: true },   // Reconstitution calculator
    { label: t('paywall_free_feat_2'), included: true },   // Syringe guide
    { label: t('paywall_free_feat_3'), included: true },   // Up to 5 protocols
    { label: t('paywall_free_feat_4'), included: true },   // Injection log & vial tracker
    { label: t('paywall_free_feat_5'), included: true },   // Reminders
    { label: t('paywall_free_feat_6'), included: true },   // Oral supplement tracking
    { label: t('paywall_free_feat_7'), included: true },   // 1 free bloodwork upload
    { label: t('paywall_free_feat_9'), included: false },  // Unlimited protocols
    { label: t('paywall_free_feat_10'), included: false },  // Unlimited bloodwork uploads
  ];

  const PREMIUM_FEATURES = [
    t('paywall_feat_1'),   // Everything in Free
    t('paywall_feat_4'),   // Unlimited protocols
    t('paywall_feat_5'),   // Unlimited bloodwork uploads
  ];

  const COMING_SOON_FEATURES = [
    t('paywall_coming_1'),  // Cloud backup & sync
    t('paywall_coming_2'),  // Serum curve & protocol timeline
    t('paywall_coming_3'),  // Cycle planner
    t('paywall_coming_4'),  // Apple Health & Watch
    t('paywall_coming_5'),  // PDF export
  ];

  useEffect(() => {
    loadOfferings();
  }, []);

  async function loadOfferings() {
    const pkgs = await getOfferings();
    setPackages(pkgs);
    setLoading(false);
  }

  function getPackageFor(type) {
    const id = type === 'annual' ? PRODUCT_IDS.ANNUAL
      : type === 'monthly' ? PRODUCT_IDS.MONTHLY
      : PRODUCT_IDS.LIFETIME;
    return packages.find(p => p.product.identifier === id);
  }

  // Launch promo — flip to false to disable
  const PROMO_ACTIVE = true;
  const PROMO_DISCOUNTS = { annual: 0.50 }; // only yearly gets a discount

  function getDiscount(type) {
    return PROMO_ACTIVE ? (PROMO_DISCOUNTS[type] || 0) : 0;
  }

  function getDiscountLabel(type) {
    const d = getDiscount(type);
    return d > 0 ? `${Math.round(d * 100)}% OFF` : '';
  }

  // Hardcoded prices — used until real App Store Connect products exist.
  // Once ASC products are live, replace with pkg.product.priceString / pkg.product.price.
  const BASE_PRICES = { monthly: 5.99, annual: 49.99, lifetime: 119.99 };

  function getOriginalPrice(type) {
    return `$${BASE_PRICES[type].toFixed(2)}`;
  }

  function getPrice(type) {
    const discount = getDiscount(type);
    if (discount === 0) return getOriginalPrice(type);
    const discounted = (BASE_PRICES[type] * (1 - discount)).toFixed(2);
    return `$${discounted}`;
  }

  function getMonthlyEquivalent() {
    const discount = getDiscount('annual');
    const price = BASE_PRICES.annual * (1 - discount);
    const monthly = (price / 12).toFixed(2);
    return `$${monthly} / ${t('paywall_per_month').replace('/', '').trim()}`;
  }

  async function handlePurchase() {
    const pkg = getPackageFor(selected);
    if (!pkg) {
      Alert.alert(t('error'), 'Product not available. Please try again later.');
      return;
    }
    setPurchasing(true);
    const result = await purchasePackage(pkg);
    setPurchasing(false);

    if (result.success) {
      if (onSuccess) onSuccess();
      navigation.goBack();
    } else if (!result.cancelled) {
      Alert.alert(t('error'), result.error || 'Purchase failed');
    }
  }

  async function handleLifetime() {
    const pkg = getPackageFor('lifetime');
    if (!pkg) {
      Alert.alert(t('error'), 'Product not available. Please try again later.');
      return;
    }
    setPurchasing(true);
    const result = await purchasePackage(pkg);
    setPurchasing(false);

    if (result.success) {
      if (onSuccess) onSuccess();
      navigation.goBack();
    } else if (!result.cancelled) {
      Alert.alert(t('error'), result.error || 'Purchase failed');
    }
  }

  async function handleRestore() {
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);

    if (result.success && result.premium) {
      Alert.alert(t('paywall_restored'), t('paywall_restored_msg'));
      if (onSuccess) onSuccess();
      navigation.goBack();
    } else if (result.success && !result.premium) {
      Alert.alert(t('paywall_no_purchases'), t('paywall_no_purchases_msg'));
    } else {
      Alert.alert(t('error'), result.error || 'Restore failed');
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

        {PROMO_ACTIVE && (
          <View style={s.promoBanner}>
            <Text style={s.promoText}>{t('paywall_promo_banner') || 'LAUNCH OFFER'}</Text>
          </View>
        )}

        <View style={s.planRow}>
          <TouchableOpacity
            style={[s.planCard, selected === 'annual' && s.planCardSelected]}
            onPress={() => setSelected('annual')}
          >
            <View style={[s.bestValueBadge, getDiscount('annual') > 0 && { backgroundColor: '#E24B4A' }]}>
              <Text style={s.bestValueText}>{getDiscountLabel('annual') || t('paywall_best_value')}</Text>
            </View>
            <View style={s.planRadio}>
              <View style={[s.planRadioInner, selected === 'annual' && s.planRadioInnerOn]} />
            </View>
            <Text style={s.planName}>{t('paywall_annual')}</Text>
            {getDiscount('annual') > 0 && (
              <Text style={s.strikePrice}>{getOriginalPrice('annual')}</Text>
            )}
            <Text style={[s.planPrice, getDiscount('annual') > 0 && { color: '#E24B4A' }]}>{getPrice('annual')}</Text>
            <Text style={s.planPer}>{t('paywall_per_year')}</Text>
            <View style={s.saveBadge}>
              <Text style={s.saveBadgeText}>{getDiscountLabel('annual') || t('paywall_save')}</Text>
            </View>
            <Text style={s.planMonthly}>{getMonthlyEquivalent()}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.planCard, selected === 'monthly' && s.planCardSelected]}
            onPress={() => setSelected('monthly')}
          >
            {getDiscount('monthly') > 0 && (
              <View style={[s.bestValueBadge, { backgroundColor: '#E24B4A' }]}>
                <Text style={s.bestValueText}>{getDiscountLabel('monthly')}</Text>
              </View>
            )}
            <View style={[s.planRadio, getDiscount('monthly') > 0 && { marginTop: 8 }]}>
              <View style={[s.planRadioInner, selected === 'monthly' && s.planRadioInnerOn]} />
            </View>
            <Text style={s.planName}>{t('paywall_monthly')}</Text>
            {getDiscount('monthly') > 0 && (
              <Text style={s.strikePrice}>{getOriginalPrice('monthly')}</Text>
            )}
            <Text style={[s.planPrice, getDiscount('monthly') > 0 && { color: '#E24B4A' }]}>{getPrice('monthly')}</Text>
            <Text style={s.planPer}>{t('paywall_per_month')}</Text>
            <View style={{ height: 22 }} />
            <Text style={s.planMonthly}>{t('paywall_billed_monthly')}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.lifetimeCard}>
          <View style={s.lifetimeRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.lifetimeTitle}>{t('paywall_lifetime_title') || 'Lifetime Access'}</Text>
              <Text style={s.lifetimeSub}>{t('paywall_lifetime_sub') || 'Pay once, unlock Pro forever.'}</Text>
            </View>
            <TouchableOpacity
              style={[s.lifetimeBtn, purchasing && { opacity: 0.6 }]}
              onPress={handleLifetime}
              disabled={purchasing}
            >
              <Text style={s.lifetimeBtnText}>{getPrice('lifetime')}</Text>
              <Text style={s.lifetimeBtnSub}>{t('paywall_lifetime_note') || 'One-time'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[s.ctaBtn, purchasing && { opacity: 0.6 }]}
          onPress={handlePurchase}
          disabled={purchasing}
        >
          {purchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={s.ctaBtnText}>{t('paywall_start_trial')}</Text>
              <Text style={s.ctaBtnSub}>
                {selected === 'annual'
                  ? t('paywall_then_annual')
                  : t('paywall_then_monthly')}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={s.legalNote}>
          {t('paywall_legal')}
        </Text>

        <View style={s.divider} />

        <Text style={s.sectionTitle}>{t('paywall_free_vs_premium')}</Text>

        <View style={s.compareCard}>
          <View style={s.compareHeader}>
            <Text style={[s.compareCol, { flex: 2, textAlign: 'left' }]}>{t('paywall_feature')}</Text>
            <Text style={s.compareCol}>{t('paywall_free')}</Text>
            <Text style={[s.compareCol, { color: '#185FA5', fontWeight: '600' }]}>{t('paywall_premium')}</Text>
          </View>
          {FREE_FEATURES.map((f, i) => (
            <View key={i} style={[s.compareRow, i === FREE_FEATURES.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={[s.compareLabel, { flex: 2 }]}>{f.label}</Text>
              <Text style={[s.compareVal, { color: f.included ? '#1D9E75' : '#E24B4A' }]}>
                {f.included ? '✓' : '✕'}
              </Text>
              <Text style={[s.compareVal, { color: '#1D9E75' }]}>✓</Text>
            </View>
          ))}
        </View>

        <View style={s.divider} />

        <Text style={s.sectionTitle}>{t('paywall_whats_included_premium')}</Text>

        <View style={s.featuresCard}>
          {PREMIUM_FEATURES.map((f, i) => (
            <View key={i} style={[s.featRow, { borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' }]}>
              <Text style={s.featCheck}>✓</Text>
              <Text style={s.featText}>{f}</Text>
            </View>
          ))}
        </View>

        <Text style={[s.sectionTitle, { marginTop: 20 }]}>{t('paywall_coming_soon_title') || 'Coming soon'}</Text>

        <View style={s.featuresCard}>
          {COMING_SOON_FEATURES.map((f, i) => (
            <View key={i} style={[s.featRow, { borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' }]}>
              <Text style={{ fontSize: 14, width: 16 }}>🔜</Text>
              <Text style={[s.featText, { color: '#888' }]}>{f}</Text>
            </View>
          ))}
        </View>

        <View style={s.divider} />

        <View style={s.bloodworkCard}>
          <Text style={s.bloodworkTitle}>{t('paywall_bloodwork_title')}</Text>
          <Text style={s.bloodworkSub}>
            {t('paywall_bloodwork_sub')}
          </Text>
          <View style={s.bloodworkOptions}>
            <View style={s.bloodworkOption}>
              <Text style={s.bloodworkOptionTitle}>{t('paywall_bloodwork_free_label')}</Text>
              <Text style={s.bloodworkOptionPrice}>{t('paywall_bloodwork_free_price')}</Text>
              <Text style={s.bloodworkOptionPer}>{t('paywall_bloodwork_per_upload')}</Text>
            </View>
            <View style={s.bloodworkDivider} />
            <View style={[s.bloodworkOption, { alignItems: 'flex-end' }]}>
              <Text style={[s.bloodworkOptionTitle, { color: '#185FA5' }]}>{t('paywall_bloodwork_premium_label')}</Text>
              <Text style={[s.bloodworkOptionPrice, { color: '#185FA5' }]}>{t('paywall_bloodwork_premium_price')}</Text>
              <Text style={[s.bloodworkOptionPer, { color: '#185FA5' }]}>{t('paywall_bloodwork_included')}</Text>
            </View>
          </View>
          <Text style={s.bloodworkNote}>
            {t('paywall_bloodwork_note')}
          </Text>
        </View>

        <TouchableOpacity
          style={[s.ctaBtn, { marginTop: 16 }, purchasing && { opacity: 0.6 }]}
          onPress={handlePurchase}
          disabled={purchasing}
        >
          {purchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={s.ctaBtnText}>{t('paywall_start_trial')}</Text>
              <Text style={s.ctaBtnSub}>
                {selected === 'annual'
                  ? t('paywall_then_annual')
                  : t('paywall_then_monthly')}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.restoreBtn, restoring && { opacity: 0.6 }]}
          onPress={handleRestore}
          disabled={restoring}
        >
          {restoring ? (
            <ActivityIndicator size="small" color="#888" />
          ) : (
            <Text style={s.restoreBtnText}>{t('paywall_restore')}</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff' },
  navBack: { fontSize: 14, color: '#185FA5', width: 60 },
  navTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  hero: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24, backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  heroIcon: { fontSize: 48, marginBottom: 12 },
  heroTitle: { fontSize: 26, fontWeight: '700', color: '#111', marginBottom: 8 },
  heroSub: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 22 },
  promoBanner: { backgroundColor: '#E24B4A', marginHorizontal: 16, marginTop: 12, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  promoText: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  strikePrice: { fontSize: 14, color: '#aaa', textDecorationLine: 'line-through', marginBottom: 2 },
  planRow: { flexDirection: 'row', gap: 12, padding: 16 },
  planCard: { flex: 1, backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: '#eee', alignItems: 'center', position: 'relative', overflow: 'visible', marginTop: 12 },
  planCardSelected: { borderColor: '#185FA5', backgroundColor: '#f0f6ff' },
  bestValueBadge: { position: 'absolute', top: -12, backgroundColor: '#185FA5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  bestValueText: { fontSize: 10, fontWeight: '700', color: 'white', letterSpacing: 0.5 },
  planRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center', marginBottom: 10, marginTop: 8 },
  planRadioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'transparent' },
  planRadioInnerOn: { backgroundColor: '#185FA5' },
  planName: { fontSize: 13, fontWeight: '600', color: '#111', marginBottom: 6 },
  planPrice: { fontSize: 28, fontWeight: '700', color: '#111' },
  planPer: { fontSize: 11, color: '#888', marginBottom: 8 },
  saveBadge: { backgroundColor: '#E1F5EE', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, marginBottom: 6 },
  saveBadgeText: { fontSize: 11, fontWeight: '600', color: '#085041' },
  planMonthly: { fontSize: 11, color: '#888' },
  lifetimeCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#eee' },
  lifetimeRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  lifetimeTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 2 },
  lifetimeSub: { fontSize: 12, color: '#888', lineHeight: 18 },
  lifetimeBtn: { backgroundColor: '#185FA5', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center' },
  lifetimeBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  lifetimeBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 2 },
  ctaBtn: { marginHorizontal: 16, backgroundColor: '#185FA5', borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 12 },
  ctaBtnText: { color: 'white', fontSize: 16, fontWeight: '700', marginBottom: 3 },
  ctaBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11 },
  legalNote: { fontSize: 10, color: '#aaa', textAlign: 'center', paddingHorizontal: 24, lineHeight: 16, marginBottom: 8 },
  divider: { height: 8, backgroundColor: '#f0f0f0', marginVertical: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111', marginHorizontal: 16, marginTop: 16, marginBottom: 12 },
  featuresCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  featRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 13, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' },
  featCheck: { color: '#1D9E75', fontWeight: '700', fontSize: 14, width: 16 },
  featText: { fontSize: 13, color: '#333', flex: 1, lineHeight: 20 },
  compareCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  compareHeader: { flexDirection: 'row', padding: 12, backgroundColor: '#f9f9f9', borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  compareCol: { flex: 1, fontSize: 11, fontWeight: '600', color: '#888', textAlign: 'center' },
  compareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 0.5, borderBottomColor: '#f5f5f5' },
  compareLabel: { fontSize: 12, color: '#444', lineHeight: 18 },
  compareVal: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '600' },
  bloodworkCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  bloodworkTitle: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 8 },
  bloodworkSub: { fontSize: 13, color: '#888', lineHeight: 20, marginBottom: 16 },
  bloodworkOptions: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  bloodworkOption: { flex: 1, alignItems: 'flex-start' },
  bloodworkOptionTitle: { fontSize: 11, color: '#888', fontWeight: '500', marginBottom: 2 },
  bloodworkOptionPrice: { fontSize: 24, fontWeight: '700', color: '#111' },
  bloodworkOptionPer: { fontSize: 11, color: '#888' },
  bloodworkDivider: { width: 0.5, height: 50, backgroundColor: '#eee', marginHorizontal: 16 },
  bloodworkNote: { fontSize: 12, color: '#BA7517', backgroundColor: '#FAEEDA', borderRadius: 8, padding: 10, lineHeight: 18 },
  singleUploadCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#eee' },
  singleUploadTitle: { fontSize: 14, fontWeight: '600', color: '#111', marginBottom: 6 },
  singleUploadSub: { fontSize: 12, color: '#888', lineHeight: 18, marginBottom: 12 },
  singleUploadBtn: { borderWidth: 1, borderColor: '#185FA5', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 8 },
  singleUploadBtnText: { fontSize: 13, color: '#185FA5', fontWeight: '600' },
  singleUploadNote: { fontSize: 11, color: '#BA7517', textAlign: 'center' },
  restoreBtn: { alignItems: 'center', paddingVertical: 14 },
  restoreBtnText: { fontSize: 13, color: '#888' },
});
