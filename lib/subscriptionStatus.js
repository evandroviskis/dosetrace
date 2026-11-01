'use strict';
// DV-112 (AD-101; picture docs/design/rodada2-conta-exames.html #dv112): what Settings says about a
// Premium subscription — the plan and its state as the store tells it (lib/purchases
// readLiveEntitlement, read through lib/entitlement getSubscriptionStatus). Never a guess: what the
// store does not say is left out. Pure — runs under plain node --test.

// lib/purchases PRODUCT_IDS; a Play id may carry its base plan ("yearly:yearly-base").
const PLAN_OF = { monthly: 'monthly', yearly: 'annual', lifetime: 'lifetime' };
function planOf(productId) {
  const base = String(productId || '').split(':')[0].trim().toLowerCase();
  return PLAN_OF[base] || null;
}

// live: the store answer ({ reachable, premium, expiresAt, store, willRenew, productId, periodType,
// unsubscribeDetectedAt, billingIssueDetectedAt }) → null (not Premium, not known) or
// { plan: 'monthly' | 'annual' | 'lifetime' | 'promo' | null,
//   state: 'renews' | 'trial' | 'cancelled' | 'billing' | 'access' | 'lifetime' | null, until: ISO | null }.
// The store that bills the plan (RevenueCat live.store): the Mac App Store is Apple's; any other
// value (PLAY_STORE, STRIPE, PROMOTIONAL, …) as given; nothing said → null.
function storeOf(s) {
  return s === 'APP_STORE' || s === 'MAC_APP_STORE' ? 'APP_STORE' : s || null;
}

function subscriptionStatusFrom(live) {
  if (!live || !live.reachable || !live.premium) return null;
  const until = live.expiresAt || null;
  const store = storeOf(live.store);
  if (!until) {
    // No end date: a lifetime purchase — or a team account / unknown product, which says nothing.
    return live.productId ? { plan: 'lifetime', state: 'lifetime', until: null, store } : { plan: null, state: null, until: null, store };
  }
  if (store === 'PROMOTIONAL') return { plan: 'promo', state: 'access', until, store }; // a grant: access until a date
  const plan = planOf(live.productId);
  // A billing problem first: RevenueCat may report willRenew false while a payment is failing, and a
  // person whose card failed must read the billing line, never "Cancelada".
  const cancelled = live.willRenew === false || !!live.unsubscribeDetectedAt;
  const state = live.billingIssueDetectedAt ? 'billing' : cancelled ? 'cancelled' : live.periodType === 'TRIAL' ? 'trial' : 'renews';
  return { plan, state, until, store };
}

const STATE_KEY = { renews: 'settings_sub_renews', trial: 'settings_sub_trial', cancelled: 'settings_sub_cancelled', billing: 'settings_sub_billing', access: 'settings_sub_access' };
const PLAN_KEY = { monthly: 'paywall_monthly', annual: 'paywall_annual' };

// This platform's store (the one "Gerenciar assinatura" opens, SettingsScreen manageSubscriptionsUrl).
const PLATFORM_STORE = { ios: 'APP_STORE', android: 'PLAY_STORE' };

// The card: { name (the plan, the paywall's own words), line (the state, or null), manage (show
// "Gerenciar assinatura": a store subscription billed by THIS platform's store; never for lifetime
// or a team grant), elsewhere (null, or the one line shown instead when another store bills it) }.
// fmtDate(iso) → the date in the app language. platform: Platform.OS.
// DV-112 F4: the button opens the subscriptions page of the phone in hand; a plan bought in the
// other store is managed there, so the card says so. On iOS the line never names Google Play
// (guideline 2.3.10, as deleteAccountSheet); on Android it may name the App Store. Store unknown → the
// button, as before.
function subscriptionCard(status, t, fmtDate, platform) {
  const s = status || { plan: null, state: null, until: null, store: null };
  const name = s.plan === 'lifetime' ? t('settings_sub_lifetime')
    : PLAN_KEY[s.plan] ? t('settings_sub_plan').replace('{premium}', t('paywall_premium')).replace('{plan}', t(PLAN_KEY[s.plan]))
    : t('paywall_premium');
  const storePlan = s.plan !== 'lifetime' && s.plan !== 'promo';
  const here = PLATFORM_STORE[platform];
  const other = storePlan && !!s.store && !!here && s.store !== here;
  const elsewhere = !other ? null
    : platform === 'android' && s.store === 'APP_STORE' ? t('settings_sub_manage_app_store')
    : t('settings_sub_manage_elsewhere');
  // A billing problem's line points to "Gerenciar assinatura" — only when the button is there.
  const key = other && s.state === 'billing' ? 'settings_sub_billing_elsewhere' : STATE_KEY[s.state];
  const line = key ? t(key).replace('{date}', s.until ? fmtDate(s.until) : '') : null;
  return { name, line, manage: storePlan && !other, elsewhere };
}

module.exports = { subscriptionStatusFrom, subscriptionCard, planOf };
