'use strict';
// Founder 2026-11-20 (council UX): "Limite de protocolos atingido" (and the onboarding's "plano grátis
// está completo") opens the entry offer for a free user the store still gives the intro price to —
// her moment of highest intent; otherwise the paywall, as before. The offer opened this way has no
// just-saved protocol: a neutral header (paywall_title) instead of "Seu primeiro protocolo está salvo".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../lib/entryOffer');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const android = (type, id, price, intro) => ({ packageType: type, identifier: id, product: { identifier: id, price, priceString: `R$ ${price}`, currencyCode: 'BRL', defaultOption: { freePhase: null, introPhase: intro ? { price: { formatted: `R$ ${intro}`, amountMicros: intro * 1e6, currencyCode: 'BRL' }, billingPeriod: { unit: 'MONTH', value: 3 }, billingCycleCount: 1 } : null } } });

test('offerAvailable: true only when a plan the offer can sell has an intro price for this person', () => {
  assert.equal(E.offerAvailable({ pkgs: [android('THREE_MONTH', 'q', 39.9, 19.9)], eligibility: null, platform: 'android' }), true);
  assert.equal(E.offerAvailable({ pkgs: [android('THREE_MONTH', 'q', 39.9, null), android('ANNUAL', 'a', 149.9, null)], eligibility: null, platform: 'android' }), false, 'no intro: the paywall');
  assert.equal(E.offerAvailable({ pkgs: [], eligibility: null, platform: 'android' }), false);
  assert.equal(E.offerAvailable({ pkgs: null, eligibility: null, platform: 'ios' }), false);
});

test('wired: the limit sheet and the onboarding limit open EntryOffer when the intro is open, else Paywall; the offer without a protocol says paywall_title', () => {
  const PS = read('screens', 'ProtocolsScreen.js');
  assert.match(PS, /const offerAsk = introOfferOpen\(\);[\s\S]{0,900}const offer = await offerAsk;/);
  assert.match(PS, /onPress: \(\) => \(offer \? navigation\.navigate\('EntryOffer', \{ freeProtocols: limit \}\) : navigation\.navigate\('Paywall', \{ source: 'protocol_limit' \}\)\)/);
  const APP = read('App.js');
  assert.match(APP, /const onObPremium = async \(\) => \{[\s\S]{0,300}introOfferOpen\(\)[\s\S]{0,300}screen: 'EntryOffer'[\s\S]{0,200}screen: 'Paywall', params: \{ source: 'onboarding_limit' \}/);
  const EO = read('screens', 'EntryOfferScreen.js');
  assert.match(EO, /\{t\(protocolName \? 'eo_title' : 'paywall_title'\)\}/);
  const OE = read('lib', 'offerEligibility.js');
  assert.match(OE, /offerProductIds\(pkgs\)/);
  assert.match(OE, /checkTrialEligibility\(ids\)/);
  assert.match(OE, /offerAvailable\(\{ pkgs, eligibility, platform: Platform\.OS \}\)/);
});
