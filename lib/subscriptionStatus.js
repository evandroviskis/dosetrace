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
function subscriptionStatusFrom(live) {
  if (!live || !live.reachable || !live.premium) return null;
  const until = live.expiresAt || null;
  if (!until) {
    // No end date: a lifetime purchase — or a team account / unknown product, which says nothing.
    return live.productId ? { plan: 'lifetime', state: 'lifetime', until: null } : { plan: null, state: null, until: null };
  }
  if (live.store === 'PROMOTIONAL') return { plan: 'promo', state: 'access', until }; // a grant: access until a date
  const plan = planOf(live.productId);
  // A billing problem first: RevenueCat may report willRenew false while a payment is failing, and a
  // person whose card failed must read the billing line, never "Cancelada".
  const cancelled = live.willRenew === false || !!live.unsubscribeDetectedAt;
  const state = live.billingIssueDetectedAt ? 'billing' : cancelled ? 'cancelled' : live.periodType === 'TRIAL' ? 'trial' : 'renews';
  return { plan, state, until };
}

const STATE_KEY = { renews: 'settings_sub_renews', trial: 'settings_sub_trial', cancelled: 'settings_sub_cancelled', billing: 'settings_sub_billing', access: 'settings_sub_access' };
const PLAN_KEY = { monthly: 'paywall_monthly', annual: 'paywall_annual' };

// The card: { name (the plan, the paywall's own words), line (the state, or null), manage (show
// "Gerenciar assinatura": a store subscription; never for lifetime or a team grant) }.
// fmtDate(iso) → the date in the app language.
function subscriptionCard(status, t, fmtDate) {
  const s = status || { plan: null, state: null, until: null };
  const name = s.plan === 'lifetime' ? t('settings_sub_lifetime')
    : PLAN_KEY[s.plan] ? t('settings_sub_plan').replace('{premium}', t('paywall_premium')).replace('{plan}', t(PLAN_KEY[s.plan]))
    : t('paywall_premium');
  const key = STATE_KEY[s.state];
  const line = key ? t(key).replace('{date}', s.until ? fmtDate(s.until) : '') : null;
  return { name, line, manage: s.plan !== 'lifetime' && s.plan !== 'promo' };
}

module.exports = { subscriptionStatusFrom, subscriptionCard, planOf };
