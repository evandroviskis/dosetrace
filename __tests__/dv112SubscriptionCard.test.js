'use strict';
// DV-112 (AD-101; picture docs/design/rodada2-conta-exames.html #dv112, founder go 2026-11-01): a
// Premium subscriber has, in Settings, an "Assinatura" card right under the profile card — the plan
// and its state from the store ("Renova em {date}", "Teste grátis até {date}", "Cancelada · acesso
// até {date}"; lifetime: "Premium vitalício" with only "Restaurar compras"), then "Gerenciar
// assinatura" (the store's own subscriptions page) and "Restaurar compras". A free user's "Assine o
// Premium" card gets "Restaurar compras" under "Ver planos" (someone who changed phones).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const { translations } = require('../i18n/translations.js');
const tOf = (l) => (k) => translations[l][k] ?? k;
const UNTIL = '2027-10-12T15:00:00Z';
const live = (o = {}) => ({ reachable: true, premium: true, expiresAt: UNTIL, store: 'APP_STORE', willRenew: true, productId: 'yearly', periodType: 'NORMAL', unsubscribeDetectedAt: null, billingIssueDetectedAt: null, ...o });

test('DV-112: the store answer → plan and state', () => {
  const { subscriptionStatusFrom } = require('../lib/subscriptionStatus');
  assert.deepEqual(subscriptionStatusFrom(live()), { plan: 'annual', state: 'renews', until: UNTIL });
  assert.equal(subscriptionStatusFrom(live({ productId: 'monthly' })).plan, 'monthly');
  assert.equal(subscriptionStatusFrom(live({ productId: 'yearly:yearly-base', store: 'PLAY_STORE' })).plan, 'annual'); // Play: product:base plan
  assert.equal(subscriptionStatusFrom(live({ periodType: 'TRIAL' })).state, 'trial');
  assert.equal(subscriptionStatusFrom(live({ unsubscribeDetectedAt: '2027-09-01T00:00:00Z', willRenew: false })).state, 'cancelled');
  assert.equal(subscriptionStatusFrom(live({ willRenew: false })).state, 'cancelled');
  assert.equal(subscriptionStatusFrom(live({ periodType: 'TRIAL', willRenew: false })).state, 'cancelled', 'a cancelled trial ends: it says so');
  assert.equal(subscriptionStatusFrom(live({ billingIssueDetectedAt: '2027-10-12T16:00:00Z' })).state, 'billing');
  assert.deepEqual(subscriptionStatusFrom(live({ productId: 'lifetime', expiresAt: null })), { plan: 'lifetime', state: 'lifetime', until: null });
  // A grant from the team (RevenueCat promotional): access until a date, never "Cancelada".
  assert.deepEqual(subscriptionStatusFrom(live({ store: 'PROMOTIONAL', productId: 'rc_promo_DoseTrace Pro_monthly', willRenew: false })), { plan: 'promo', state: 'access', until: UNTIL });
  // Nothing known about the plan (a team account, an offline read): no line, never a made-up one.
  assert.deepEqual(subscriptionStatusFrom(live({ productId: null, expiresAt: null, store: null })), { plan: null, state: null, until: null });
  assert.equal(subscriptionStatusFrom({ reachable: false }), null);
  assert.equal(subscriptionStatusFrom(live({ premium: false })), null);
  assert.equal(subscriptionStatusFrom(null), null);
});

test('DV-112: the card words (pt as in the picture: "Premium Anual" / "Renova em 12 de out. de 2027")', () => {
  const { subscriptionStatusFrom, subscriptionCard } = require('../lib/subscriptionStatus');
  const t = tOf('pt');
  const fmt = () => '12 de out. de 2027';
  assert.deepEqual(subscriptionCard(subscriptionStatusFrom(live()), t, fmt), { name: 'Premium Anual', line: 'Renova em 12 de out. de 2027', manage: true });
  assert.equal(subscriptionCard(subscriptionStatusFrom(live({ productId: 'monthly' })), t, fmt).name, 'Premium Mensal');
  assert.equal(subscriptionCard(subscriptionStatusFrom(live({ periodType: 'TRIAL' })), t, fmt).line, 'Teste grátis até 12 de out. de 2027');
  assert.equal(subscriptionCard(subscriptionStatusFrom(live({ willRenew: false })), t, fmt).line, 'Cancelada · acesso até 12 de out. de 2027');
  assert.deepEqual(subscriptionCard(subscriptionStatusFrom(live({ productId: 'lifetime', expiresAt: null })), t, fmt), { name: 'Premium vitalício', line: null, manage: false });
  assert.deepEqual(subscriptionCard(subscriptionStatusFrom(live({ store: 'PROMOTIONAL', productId: 'rc_promo_x', willRenew: false })), t, fmt), { name: 'Premium', line: 'Acesso até 12 de out. de 2027', manage: false });
  assert.deepEqual(subscriptionCard(null, t, fmt), { name: 'Premium', line: null, manage: true });
  assert.ok(subscriptionCard(subscriptionStatusFrom(live({ billingIssueDetectedAt: 'x' })), t, fmt).line);
});

test('DV-112: the store wrapper reads the plan, trial, cancellation and billing issue; the helper owns the read', () => {
  const p = read('lib/purchases.js');
  const fn = p.slice(p.indexOf('export async function readLiveEntitlement('), p.indexOf('export async function logOutPurchases('));
  for (const f of ['productId: active.productIdentifier', 'periodType: active.periodType', 'unsubscribeDetectedAt: active.unsubscribeDetectedAt', 'billingIssueDetectedAt: active.billingIssueDetectedAt']) {
    assert.ok(fn.includes(f), f);
  }
  const e = read('lib/entitlement.js');
  assert.match(e, /async function getSubscriptionStatus\(\)/);
  assert.match(e, /liveForOwner\(owner, await readLiveEntitlement\(\), !!sessionUid\)/);
});

test('DV-112: Settings — the subscriber card under the profile, the free card gets Restore', () => {
  const src = read('screens/SettingsScreen.js');
  const fn = src.slice(src.indexOf('function renderPremiumCard('), src.indexOf('function renderVersionFooter('));
  // Premium: the card with plan + state, Manage (when it applies) and Restore.
  assert.match(fn, /if \(premium\) return renderSubscriptionCard\(\);/);
  const sub = src.slice(src.indexOf('function renderSubscriptionCard('), src.indexOf('function renderPremiumCard('));
  assert.match(sub, /subscriptionCard\(subStatus, t, \(iso\) => formatDate\(new Date\(iso\), language, 'dayMonthYear'\)\)/);
  assert.match(sub, /card\.manage && \(/);
  assert.match(sub, /openURL\(manageSubscriptionsUrl\(Platform\.OS\)\)/);
  assert.match(sub, /t\('settings_manage_subscription'\)/);
  assert.match(sub, /onPress=\{handleRestore\}[\s\S]*t\('paywall_restore'\)/);
  // Free: "Ver planos" then "Restaurar compras" (a well button).
  const plans = fn.indexOf("t('settings_premium_btn')");
  const restore = fn.indexOf("t('paywall_restore')");
  assert.ok(plans > 0 && restore > plans);
  assert.match(fn, /style=\{s\.premiumBtn2\} onPress=\{handleRestore\}/);
  // Restore: the paywall's own outcomes and sheets.
  const r = src.slice(src.indexOf('async function handleRestore('), src.indexOf('async function handleRestore(') + 1400);
  assert.match(r, /restorePurchases\(\)/);
  assert.match(r, /restoreOutcome\(result, premiumNow\)/);
  assert.match(r, /outcomeSheet\(outcome === 'failed' \? 'restore_failed' : outcome, t, Platform\.OS\)/);
  // Theme tokens only.
  assert.match(src, /premiumBtn2: \{ backgroundColor: c\.well,/);
  assert.match(src, /premiumBtn2Text: \{ color: c\.ink,/);
});

test('DV-112: the words in 6 languages (pt as in the picture)', () => {
  const pt = translations.pt;
  assert.equal(pt.settings_sub_renews, 'Renova em {date}');
  assert.equal(pt.settings_sub_trial, 'Teste grátis até {date}');
  assert.equal(pt.settings_sub_cancelled, 'Cancelada · acesso até {date}');
  assert.equal(pt.settings_sub_lifetime, 'Premium vitalício');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['settings_sub_plan', 'settings_sub_renews', 'settings_sub_trial', 'settings_sub_cancelled', 'settings_sub_access', 'settings_sub_billing', 'settings_sub_lifetime']) {
      assert.ok(translations[l][k], `${l} ${k}`);
    }
    assert.match(translations[l].settings_sub_plan, /\{premium\}[\s\S]*\{plan\}/, l);
  }
});
