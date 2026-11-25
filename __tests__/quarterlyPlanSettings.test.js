'use strict';
// The 3-month plan (Apple "quarterly", Google "quarterly" with base plan "p3m"; 02-decisoes
// 2026-11-20 02:17) in Settings › Assinatura: a 3-month subscriber read only "Premium", because
// lib/subscriptionStatus PLAN_OF knew monthly, yearly and lifetime only. The card names the plan in
// the entry offer's own words (eo_plan_months, "3 meses"), as the monthly and annual cards use the
// paywall's.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { translations } = require('../i18n/translations.js');
const { subscriptionStatusFrom, subscriptionCard, planOf } = require('../lib/subscriptionStatus');

const tOf = (l) => (k) => translations[l][k] ?? k;
const UNTIL = '2027-02-24T15:00:00Z';
const live = (o = {}) => ({ reachable: true, premium: true, expiresAt: UNTIL, store: 'APP_STORE', willRenew: true, productId: 'quarterly', periodType: 'NORMAL', unsubscribeDetectedAt: null, billingIssueDetectedAt: null, ...o });
const fmt = () => '24 de fev. de 2027';

test('QP-1: the 3-month product ids (iOS "quarterly", Google "quarterly:p3m") are the 3-month plan', () => {
  assert.equal(planOf('quarterly'), 'threeMonth');
  assert.equal(planOf('quarterly:p3m'), 'threeMonth');
  assert.deepEqual(subscriptionStatusFrom(live()), { plan: 'threeMonth', state: 'renews', until: UNTIL, store: 'APP_STORE' });
  assert.deepEqual(subscriptionStatusFrom(live({ productId: 'quarterly:p3m', store: 'PLAY_STORE' })), { plan: 'threeMonth', state: 'renews', until: UNTIL, store: 'PLAY_STORE' });
  // The other plans are unchanged.
  assert.equal(planOf('monthly'), 'monthly');
  assert.equal(planOf('yearly:yearly-base'), 'annual');
  assert.equal(planOf('lifetime'), 'lifetime');
  assert.equal(planOf('something_else'), null);
});

test('QP-2: Settings › Assinatura names the 3-month plan in all 6 languages (not just "Premium")', () => {
  const want = { pt: 'Premium 3 meses', en: 'Premium 3 months', es: 'Premium 3 meses', fr: 'Premium 3 mois', de: 'Premium · 3 Monate', it: 'Premium 3 mesi' };
  for (const [lang, name] of Object.entries(want)) {
    const t = tOf(lang);
    for (const [productId, store] of [['quarterly', 'APP_STORE'], ['quarterly:p3m', 'PLAY_STORE']]) {
      const card = subscriptionCard(subscriptionStatusFrom(live({ productId, store })), t, fmt, store === 'APP_STORE' ? 'ios' : 'android');
      assert.equal(card.name, name, `${lang} ${productId}`);
      assert.equal(card.manage, true, `${lang} ${productId}: a store plan billed here has "Gerenciar assinatura"`);
    }
  }
  const pt = tOf('pt');
  assert.equal(subscriptionCard(subscriptionStatusFrom(live()), pt, fmt, 'ios').line, 'Renova em 24 de fev. de 2027');
  assert.equal(subscriptionCard(subscriptionStatusFrom(live({ willRenew: false })), pt, fmt, 'ios').line, 'Cancelada · acesso até 24 de fev. de 2027');
  // Bought on Google Play, opened on an iPhone: managed in the other store, as for the other plans.
  const other = subscriptionCard(subscriptionStatusFrom(live({ productId: 'quarterly:p3m', store: 'PLAY_STORE' })), pt, fmt, 'ios');
  assert.equal(other.name, 'Premium 3 meses');
  assert.equal(other.manage, false);
  assert.ok(other.elsewhere);
});

test('QP-3: every store product id in lib/purchases PRODUCT_IDS (the 3-month one included) has a Settings plan', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'purchases.js'), 'utf8');
  const block = src.slice(src.indexOf('export const PRODUCT_IDS = {'), src.indexOf('};', src.indexOf('export const PRODUCT_IDS = {')));
  const ids = [...block.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(ids.includes('quarterly'), 'PRODUCT_IDS lists the 3-month product (App Store Connect / Play "quarterly")');
  for (const id of ids) assert.ok(planOf(id), `planOf("${id}")`);
});
