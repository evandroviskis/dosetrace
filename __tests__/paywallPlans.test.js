'use strict';
// Premium (paywall) rules — docs/specs/premium-and-auth.md PA-5…PA-18. Every state the
// buy section can be in, with the real-store numbers (no invented prices or savings).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/paywallPlans');

const T = {
  paywall_per_month: 'per month', paywall_per_year: 'per year',
  paywall_start_trial_days: 'Start {days}-day free trial', paywall_subscribe_now: 'Subscribe',
  paywall_then_price: 'Then {price} · Cancel anytime', paywall_price_cancel: '{price} · Cancel anytime',
  paywall_restored: 'Purchases restored', paywall_restored_msg: 'Your premium subscription has been restored.',
  paywall_no_purchases: 'No purchases found', paywall_no_purchases_msg: 'We could not find…',
  error: 'Error', paywall_restore_failed: 'Restore failed', paywall_purchase_failed: 'Purchase failed',
  paywall_pending_title: 'Purchase pending', paywall_pending_msg: 'Waiting for approval',
  paywall_product_unavailable: 'Product not available.', paywall_already_title: 'You already have Premium', paywall_already_msg: 'Every Premium feature is on.',
  pw_free_days: '{n} days', pw_per_month: '{n} / month',
};
const t = (k) => (k in T ? T[k] : k);

// The real App Store US prices read 2026-10-03 (docs/decisions.md): $28.99 / $2.99 / $69.99.
const annual = { packageType: 'ANNUAL', product: { identifier: 'yearly', price: 28.99, priceString: '$28.99', currencyCode: 'USD', pricePerMonthString: '$2.41', introPrice: { price: 0, priceString: '$0.00', cycles: 1, period: 'P1W', periodUnit: 'WEEK', periodNumberOfUnits: 1 } } };
const monthly = { packageType: 'MONTHLY', product: { identifier: 'monthly', price: 2.99, priceString: '$2.99', currencyCode: 'USD', pricePerMonthString: '$2.99', introPrice: { price: 0, priceString: '$0.00', cycles: 1, period: 'P7D', periodUnit: 'DAY', periodNumberOfUnits: 7 } } };
const lifetime = { packageType: 'LIFETIME', product: { identifier: 'lifetime', price: 69.99, priceString: '$69.99', currencyCode: 'USD' } };
const ALL = [lifetime, monthly, annual];

test('PA-5: plans are matched by packageType (Android ids carry a base-plan suffix)', () => {
  const android = [{ packageType: 'MONTHLY', product: { identifier: 'monthly:p1m', price: 2.99, priceString: '$2.99' } }, { packageType: 'ANNUAL', product: { identifier: 'yearly:annual', price: 28.99, priceString: '$28.99' } }];
  const got = P.pickPackages(android);
  assert.equal(got.monthly.product.identifier, 'monthly:p1m');
  assert.equal(got.annual.product.identifier, 'yearly:annual');
  assert.equal(got.lifetime, null);
  assert.deepEqual(P.pickPackages(null), { annual: null, monthly: null, lifetime: null });
  assert.deepEqual(P.pickPackages([{ packageType: 'ANNUAL' }]), { annual: null, monthly: null, lifetime: null }, 'a package without a product is ignored');
});

test('PA-6: the buy section has exactly four states and Premium wins', () => {
  assert.equal(P.paywallView({ loading: true, premium: false, pkgs: [] }), 'loading');
  assert.equal(P.paywallView({ loading: false, premium: false, pkgs: [] }), 'unavailable', 'offerings missing / offline');
  assert.equal(P.paywallView({ loading: false, premium: false, pkgs: null }), 'unavailable');
  assert.equal(P.paywallView({ loading: false, premium: false, pkgs: [lifetime] }), 'plans', 'lifetime alone still sells');
  assert.equal(P.paywallView({ loading: false, premium: false, pkgs: ALL }), 'plans');
  assert.equal(P.paywallView({ loading: true, premium: true, pkgs: [] }), 'premium', 'already Premium: never a buy button');
  assert.equal(P.paywallView({ loading: false, premium: true, pkgs: ALL }), 'premium');
});

test('PA-7: "Save N%" comes only from the real prices, rounded down, hidden when nothing is saved', () => {
  assert.equal(P.savingsPct(annual, monthly), 19, '$28.99 vs 12 × $2.99 = $35.88 → 19.2% → 19');
  assert.notEqual(P.savingsPct(annual, monthly), 37, 'never the prototype sample 37');
  const br = (a, m) => P.savingsPct({ product: { price: a, currencyCode: 'BRL' } }, { product: { price: m, currencyCode: 'BRL' } });
  assert.equal(br(199.9, 19.9), 16, 'Brazil R$199,90 vs 12 × R$19,90 = R$238,80 → 16.3% → 16');
  assert.equal(br(240, 20), null, 'no saving → no badge');
  assert.equal(br(300, 20), null, 'annual dearer → no badge');
  assert.equal(P.savingsPct(annual, null), null);
  assert.equal(P.savingsPct(null, monthly), null);
  assert.equal(P.savingsPct({ product: { price: 0 } }, monthly), null);
  assert.equal(P.savingsPct({ product: { price: 'x' } }, monthly), null);
  assert.equal(P.savingsPct({ product: { price: 10, currencyCode: 'EUR' } }, { product: { price: 2, currencyCode: 'USD' } }), null, 'different currencies are never compared');
  assert.equal(br(119.4, 9.95), null, 'exactly 0% → null');
});

test('PA-8: per-month line is the store string, else computed in the store currency (never invented)', () => {
  assert.equal(P.perMonthString(annual, 'en'), '$2.41');
  const noStr = { product: { price: 28.99, currencyCode: 'USD' } };
  assert.equal(P.perMonthString(noStr, 'en'), '$2.41', 'floor(28.99/12 × 100)/100');
  const brl = P.perMonthString({ product: { price: 199.9, currencyCode: 'BRL' } }, 'pt');
  assert.match(brl, /R\$\s?16,65/, 'pt-BR format with comma decimals');
  const eur = P.perMonthString({ product: { price: 29.99, currencyCode: 'EUR' } }, 'de');
  assert.match(eur, /2,49\s?€/);
  assert.equal(P.perMonthString(null, 'en'), null);
  assert.equal(P.perMonthString({ product: { price: 10 } }, 'en'), null, 'no currency → nothing shown');
  assert.equal(P.perMonthString({ product: { price: 10, currencyCode: 'ZZZZ' } }, 'en'), null, 'bad currency never throws');
});

test('PA-9: the trial is claimed only when the store says eligible, with its real length', () => {
  const yes = { yearly: true, monthly: true };
  assert.equal(P.trialDays(annual, yes, 'ios'), 7, '1 WEEK = 7 days');
  assert.equal(P.trialDays(monthly, yes, 'ios'), 7, '7 DAY');
  assert.equal(P.trialDays(annual, { yearly: false }, 'ios'), null, 'trial already used → no claim');
  assert.equal(P.trialDays(annual, null, 'ios'), null, 'eligibility unknown → no claim');
  assert.equal(P.trialDays(lifetime, { lifetime: true }, 'ios'), null, 'no intro offer → no claim');
  const paidIntro = { product: { ...annual.product, introPrice: { ...annual.product.introPrice, price: 0.99 } } };
  assert.equal(P.trialDays(paidIntro, yes, 'ios'), null, 'a paid intro price is not a free trial');
  const monthIntro = { product: { ...annual.product, introPrice: { price: 0, cycles: 1, periodUnit: 'MONTH', periodNumberOfUnits: 1 } } };
  assert.equal(P.trialDays(monthIntro, yes, 'ios'), null, 'length not expressible in days → no claim rather than a wrong one');
  // Android: Google Play only returns a free phase the user is eligible for.
  const andr = { product: { identifier: 'yearly:annual', defaultOption: { freePhase: { billingPeriod: { unit: 'DAY', value: 7, iso8601: 'P7D' }, billingCycleCount: 1 } } } };
  assert.equal(P.trialDays(andr, null, 'android'), 7);
  assert.equal(P.trialDays({ product: { defaultOption: { freePhase: null } } }, null, 'android'), null);
  assert.equal(P.trialDays({ product: { defaultOption: null } }, null, 'android'), null);
  assert.equal(P.trialDays(annual, yes, 'web'), null);
  assert.equal(P.trialDays(null, yes, 'ios'), null);
});

test('PA-9: the button carries the trial length and the later price; without a trial it says Subscribe', () => {
  const yes = { yearly: true, monthly: true };
  const a = P.ctaModel({ selected: 'annual', pkgs: ALL, eligibility: yes, platform: 'ios', t });
  assert.equal(a.title, 'Start 7-day free trial');
  assert.equal(a.sub, 'Then $28.99 per year · Cancel anytime');
  assert.equal(a.legalKey, 'paywall_legal');
  const m = P.ctaModel({ selected: 'monthly', pkgs: ALL, eligibility: { monthly: false }, platform: 'ios', t });
  assert.equal(m.title, 'Subscribe');
  assert.equal(m.sub, '$2.99 per month · Cancel anytime');
  assert.equal(m.legalKey, 'paywall_legal_no_trial');
  assert.equal(P.ctaModel({ selected: 'annual', pkgs: [lifetime], eligibility: yes, platform: 'ios', t }), null, 'no subscription → no ink button');
});

test('PA-10: Annual is preselected when the store has it, else Monthly', () => {
  assert.equal(P.defaultPlan(ALL), 'annual');
  assert.equal(P.defaultPlan([monthly]), 'monthly');
  assert.equal(P.defaultPlan([lifetime]), null);
});

test('PA-12: purchase outcomes: Premium / cancelled / failed / pending', () => {
  assert.equal(P.purchaseOutcome({ success: true, premium: true }, false), 'premium');
  assert.equal(P.purchaseOutcome({ success: true, premium: false }, true), 'premium', 'the entitlement helper confirms it');
  assert.equal(P.purchaseOutcome({ success: true, premium: false }, false), 'pending', 'Ask to Buy / deferred');
  assert.equal(P.purchaseOutcome({ success: false, cancelled: true }, false), 'cancelled');
  assert.equal(P.purchaseOutcome({ success: false, pending: true }, false), 'pending', 'RevenueCat PAYMENT_PENDING_ERROR is never "Purchase failed"');
  assert.equal(P.purchaseOutcome({ success: false, error: 'x' }, false), 'failed');
  assert.equal(P.purchaseOutcome(null, false), 'failed');
});

test('PA-13: restore outcomes: restored / none / failed', () => {
  assert.equal(P.restoreOutcome({ success: true, premium: true }, false), 'restored');
  assert.equal(P.restoreOutcome({ success: true, premium: false }, true), 'restored');
  assert.equal(P.restoreOutcome({ success: true, premium: false }, false), 'none');
  assert.equal(P.restoreOutcome({ success: false, error: 'net' }, false), 'failed');
  assert.equal(P.restoreOutcome(undefined, true), 'failed');
});

test('PA-14: every outcome is a DoseTrace sheet with the approved words; cancel says nothing', () => {
  assert.deepEqual(P.outcomeSheet('restored', t), { icon: 'check', title: 'Purchases restored', body: 'Your premium subscription has been restored.', done: true });
  assert.equal(P.outcomeSheet('none', t).title, 'No purchases found');
  assert.deepEqual(P.outcomeSheet('restore_failed', t), { icon: 'alert', title: 'Error', body: 'Restore failed' });
  assert.deepEqual(P.outcomeSheet('failed', t), { icon: 'alert', title: 'Error', body: 'Purchase failed' });
  assert.equal(P.outcomeSheet('pending', t).title, 'Purchase pending');
  assert.equal(P.outcomeSheet('unavailable', t).body, 'Product not available.');
  assert.deepEqual(P.outcomeSheet('premium_already', t), { icon: 'check', title: 'You already have Premium', body: 'Every Premium feature is on.', done: true });
  assert.equal(P.outcomeSheet('cancelled', t), null);
  assert.equal(P.outcomeSheet('premium', t), null);
});

test('PA-17: Free vs Premium has the 13 prototype rows; AI food log free = FREE_DAYS; scans 3 / month', () => {
  const { FREE_DAYS } = require('../lib/foodThread');
  assert.equal(FREE_DAYS, 7, 'founder: 7 free food-log days (docs/decisions.md)');
  const rows = P.comparisonRows(t, { freeFoodDays: FREE_DAYS });
  assert.equal(rows.length, 13);
  assert.deepEqual(rows.map((r) => r.free), [true, true, true, true, true, true, true, '7 days', false, '3 / month', false, false, false]);
  assert.equal(rows[7].label, 'nutri_ai_badge');
  assert.equal(rows[9].label, 'pw_scans_row');
  assert.ok(!rows.some((r) => /20/.test(String(r.free))), 'S-24: no Premium scan number');
  assert.equal(P.FREE_SCANS_PER_MONTH, 3);
});

test('PA-18: What\'s included lists six lines, the scans line without a number', () => {
  assert.deepEqual(P.includedLines(t), ['paywall_feat_1', 'paywall_feat_4', 'pw_prem_scan_full', 'pw_prem_pdf', 'pw_prem_reality', 'body_card_dosing_title']);
});

test('PA-11: the billing text names the right store', () => {
  assert.equal(P.storeName('ios'), 'Apple ID');
  assert.equal(P.storeName('android'), 'Google Play');
});

test('PA-74: Lifetime bought while a subscription still renews → a sheet says to cancel it in the store', () => {
  assert.equal(P.lifetimeCancelNeeded('lifetime', { success: true, premium: true, activeSubscriptions: ['yearly'] }), true);
  assert.equal(P.lifetimeCancelNeeded('lifetime', { success: true, premium: true, activeSubscriptions: [] }), false);
  assert.equal(P.lifetimeCancelNeeded('lifetime', { success: true, premium: true }), false);
  assert.equal(P.lifetimeCancelNeeded('annual', { success: true, activeSubscriptions: ['monthly'] }), false, 'only Lifetime');
  assert.equal(P.lifetimeCancelNeeded('lifetime', { success: false, activeSubscriptions: ['yearly'] }), false);
  const tt = (k) => ({ paywall_cancel_sub_title: 'Cancel your subscription', paywall_cancel_sub_msg: 'Cancel it in your {store} subscription settings — {store}.' }[k] || k);
  assert.deepEqual(P.outcomeSheet('lifetime_cancel_sub', tt, 'ios'), { icon: 'alert', title: 'Cancel your subscription', body: 'Cancel it in your Apple ID subscription settings — Apple ID.', done: true });
  assert.match(P.outcomeSheet('lifetime_cancel_sub', tt, 'android').body, /Google Play subscription settings/);
  const fs = require('fs'); const path = require('path');
  const pay = fs.readFileSync(path.join(__dirname, '..', 'screens', 'PaywallScreen.js'), 'utf8');
  assert.match(pay, /if \(lifetimeCancelNeeded\(plan, result\)\) \{ showOutcome\('lifetime_cancel_sub'\); return; \}/);
  const purchases = fs.readFileSync(path.join(__dirname, '..', 'lib', 'purchases.js'), 'utf8');
  assert.match(purchases, /return \{ success: true, premium, activeSubscriptions \};/);
});
