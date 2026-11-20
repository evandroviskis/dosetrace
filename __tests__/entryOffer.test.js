'use strict';
// The entry offer shown right after account creation (docs/design/onboarding-offer.html, PT,
// version 3 + founder changes of 2026-11-20). Every price on it comes from the store
// (RevenueCat offerings); the screen never writes a number of its own. A paid introductory
// price is the "offer"; a free trial never appears on this screen (founder 2026-11-20 02:03:
// the 7-day trial leaves both stores).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../lib/paywallPlans');
const E = require('../lib/entryOffer');

function load() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const tr = load();
const tOf = (l) => (k) => (k in tr[l] ? tr[l][k] : k);
const pt = tOf('pt');
const en = tOf('en');
const sp = (s) => (s == null ? s : String(s).replace(/[  ]/g, ' ')); // Intl's no-break spaces

// The Brazil prices decided 2026-11-19/20 (02-decisoes): 3 months R$ 39,90 with the entry
// R$ 19,90 for the first 3 months; annual R$ 149,90 with the entry R$ 119,90 in the 1st year.
const iosThree = { packageType: 'THREE_MONTH', product: { identifier: 'quarterly', price: 39.9, priceString: 'R$ 39,90', currencyCode: 'BRL', introPrice: { price: 19.9, priceString: 'R$ 19,90', cycles: 1, period: 'P3M', periodUnit: 'MONTH', periodNumberOfUnits: 3 } } };
const iosAnnual = { packageType: 'ANNUAL', product: { identifier: 'yearly', price: 149.9, priceString: 'R$ 149,90', currencyCode: 'BRL', introPrice: { price: 119.9, priceString: 'R$ 119,90', cycles: 1, period: 'P1Y', periodUnit: 'YEAR', periodNumberOfUnits: 1 } } };
const iosMonthly = { packageType: 'MONTHLY', product: { identifier: 'monthly', price: 14.9, priceString: 'R$ 14,90', currencyCode: 'BRL', introPrice: null } };
const iosLifetime = { packageType: 'LIFETIME', product: { identifier: 'lifetime', price: 349.9, priceString: 'R$ 349,90', currencyCode: 'BRL' } };
const ELIG = { quarterly: true, yearly: true, monthly: true };
const NOT_ELIG = { quarterly: false, yearly: false, monthly: false };

const phase = (formatted, micros, unit, value, count = 1) => ({ price: { formatted, amountMicros: micros, currencyCode: 'BRL' }, billingPeriod: { unit, value, iso8601: `P${value}${unit[0]}` }, billingCycleCount: count, recurrenceMode: 2 });
const andThree = { packageType: 'THREE_MONTH', product: { identifier: 'quarterly:p3m', price: 39.9, priceString: 'R$ 39,90', currencyCode: 'BRL', defaultOption: { freePhase: null, introPhase: phase('R$ 19,90', 19900000, 'MONTH', 3) } } };
const andAnnual = { packageType: 'ANNUAL', product: { identifier: 'yearly:annual', price: 149.9, priceString: 'R$ 149,90', currencyCode: 'BRL', defaultOption: { freePhase: null, introPhase: phase('R$ 119,90', 119900000, 'YEAR', 1) } } };

const NOW = new Date(2026, 10, 20, 9, 0, 0); // 20 Nov 2026, local
const model = (over = {}) => E.offerModel({ pkgs: [iosThree, iosAnnual, iosMonthly, iosLifetime], eligibility: ELIG, platform: 'ios', language: 'pt', t: pt, now: NOW, dev: false, ...over });

// ── pickPackages / introOf (lib/paywallPlans) ──────────────────────────────────────────────

test('EO-P1: pickPackages also returns the 3-month plan (RevenueCat THREE_MONTH), the rest unchanged', () => {
  const got = P.pickPackages([iosThree, iosAnnual, iosMonthly, iosLifetime]);
  assert.equal(got.threeMonth, iosThree);
  assert.equal(got.annual, iosAnnual);
  assert.equal(got.monthly, iosMonthly);
  assert.equal(got.lifetime, iosLifetime);
  assert.equal(P.pickPackages([iosAnnual]).threeMonth, null);
});

test('EO-P2: iOS paid intro — only with the eligibility check saying true ("unknown" = not eligible, like trialOf)', () => {
  const io = P.introOf(iosThree, ELIG, 'ios');
  assert.deepEqual(io, { amount: 19.9, priceString: 'R$ 19,90', currencyCode: 'BRL', periodMonths: 3, cycles: 1, months: 3 });
  assert.equal(P.introOf(iosAnnual, ELIG, 'ios').months, 12);
  assert.equal(P.introOf(iosThree, NOT_ELIG, 'ios'), null, 'the store says not eligible');
  assert.equal(P.introOf(iosThree, null, 'ios'), null, 'unknown eligibility = not eligible');
  assert.equal(P.introOf(iosThree, {}, 'ios'), null);
  assert.equal(P.introOf(iosMonthly, ELIG, 'ios'), null, 'no intro on the product');
  const free = { packageType: 'ANNUAL', product: { ...iosAnnual.product, introPrice: { price: 0, priceString: 'R$ 0,00', cycles: 1, periodUnit: 'WEEK', periodNumberOfUnits: 1 } } };
  assert.equal(P.introOf(free, ELIG, 'ios'), null, 'a free trial is not a paid intro price');
  const week = { packageType: 'ANNUAL', product: { ...iosAnnual.product, introPrice: { price: 4.9, priceString: 'R$ 4,90', cycles: 1, periodUnit: 'WEEK', periodNumberOfUnits: 1 } } };
  assert.equal(P.introOf(week, ELIG, 'ios'), null, 'an intro shorter than a month is not shown as an offer of months');
  const two = { packageType: 'THREE_MONTH', product: { ...iosThree.product, introPrice: { ...iosThree.product.introPrice, cycles: 2 } } };
  assert.equal(P.introOf(two, ELIG, 'ios').months, 6, 'pay as you go: months = period × cycles');
  assert.equal(P.introOf(null, ELIG, 'ios'), null);
  assert.equal(P.introOf(iosThree, ELIG, 'web'), null);
});

test('EO-P3: Android paid intro = defaultOption.introPhase (Google Play only returns eligible offers); a free phase is never it', () => {
  assert.deepEqual(P.introOf(andThree, null, 'android'), { amount: 19.9, priceString: 'R$ 19,90', currencyCode: 'BRL', periodMonths: 3, cycles: 1, months: 3 });
  assert.equal(P.introOf(andAnnual, null, 'android').months, 12);
  const freeOnly = { ...andThree, product: { ...andThree.product, defaultOption: { freePhase: phase('Grátis', 0, 'DAY', 7), introPhase: null } } };
  assert.equal(P.introOf(freeOnly, null, 'android'), null, 'a free phase is not an intro price');
  const both = { ...andThree, product: { ...andThree.product, defaultOption: { freePhase: phase('Grátis', 0, 'DAY', 7), introPhase: phase('R$ 19,90', 19900000, 'MONTH', 3) } } };
  assert.equal(P.introOf(both, null, 'android'), null, 'a trial first would make "you pay R$ 19,90 today" false');
  const none = { ...andThree, product: { ...andThree.product, defaultOption: { freePhase: null, introPhase: null } } };
  assert.equal(P.introOf(none, null, 'android'), null, 'not eligible: Play returns the base plan only');
  assert.equal(P.introOf({ packageType: 'THREE_MONTH', product: { identifier: 'x', price: 1 } }, null, 'android'), null);
});

// ── offerModel (lib/entryOffer) — eligible ─────────────────────────────────────────────────

test('EO-1: eligible — the 3-month offer is selected first, every price from the store', () => {
  const m = model();
  assert.equal(m.sample, false);
  assert.equal(m.sampleLabel, null);
  assert.equal(m.selected, 'threeMonth');
  assert.equal(m.pkg, iosThree, 'the real package goes to purchasePackage');
  assert.deepEqual(m.plans.map((p) => p.key), ['threeMonth', 'annual'], 'two cards: 3 months then Annual');
  const h = m.hero;
  assert.equal(h.offer, true);
  assert.equal(h.badge, 'Oferta de boas-vindas');
  assert.equal(h.title, '3 meses de Premium');
  assert.equal(h.price, 'R$ 19,90');
  assert.equal(h.struck, 'R$ 39,90');
  assert.equal(h.normal, 'R$ 39,90 é o preço normal a cada 3 meses.');
  assert.equal(h.ticks, 12);
  assert.equal(h.filled, 3);
  assert.equal(h.ticksLine, '3 primeiros meses pela oferta · depois, a cada 3 meses pelo preço normal');
});

test('EO-2: eligible — the billing timeline: today you pay the intro; renewal date = today + the intro period', () => {
  const m = model();
  assert.equal(m.timeline.length, 2, 'no "the app warns before renewal" row: no such notification exists');
  assert.deepEqual(m.timeline[0], { when: 'Hoje', text: 'Você paga R$ 19,90 e o Premium começa.' });
  assert.equal(m.timeline[1].when, '20 de fev. de 2027');
  assert.equal(m.timeline[1].text, 'Renova por R$ 39,90 a cada 3 meses, se você não cancelar.');
  for (const row of m.timeline) assert.doesNotMatch(row.text, /avisa|lembr/i);
});

test('EO-3: eligible — the plan cards (both marked Offer), the annual card has the struck price and the 3-month equivalent computed from the store', () => {
  const [three, annual] = model().plans;
  assert.equal(three.badge, 'Oferta');
  assert.equal(three.name, '3 meses');
  assert.equal(three.price, 'R$ 19,90');
  assert.equal(three.struck, null);
  assert.equal(three.line1, 'nos 3 primeiros meses');
  assert.equal(three.line2, 'depois, R$ 39,90 a cada 3 meses');
  assert.equal(three.equiv, null);
  assert.equal(annual.badge, 'Oferta');
  assert.equal(annual.name, 'Anual');
  assert.equal(annual.price, 'R$ 119,90');
  assert.equal(annual.struck, 'R$ 149,90');
  assert.equal(annual.line1, 'no 1º ano');
  assert.equal(annual.line2, 'depois, R$ 149,90 por ano');
  assert.equal(sp(annual.equiv), 'equivale a R$ 29,98 a cada 3 meses', '119,90 / 4 = 29,975 → rounded up, never cheaper than real');
});

test('EO-4: eligible — the renewal text above the button and the button', () => {
  const m = model();
  assert.equal(m.renewal, 'R$ 19,90 pelos 3 primeiros meses; depois, R$ 39,90 a cada 3 meses, com renovação automática. Cancele até 24 horas antes da renovação, nos ajustes da sua Conta Apple.');
  assert.equal(m.cta, 'Começar por R$ 19,90');
  assert.match(E.offerModel({ pkgs: [andThree, andAnnual], eligibility: null, platform: 'android', language: 'pt', t: pt, now: NOW, dev: false }).renewal, /conta do Google Play\.$/);
});

test('EO-5: choosing Annual moves the hero, the timeline, the renewal text and the button to the annual offer', () => {
  const m = model({ selected: 'annual' });
  assert.equal(m.selected, 'annual');
  assert.equal(m.pkg, iosAnnual);
  assert.equal(m.hero.title, '1 ano de Premium');
  assert.equal(m.hero.price, 'R$ 119,90');
  assert.equal(m.hero.struck, 'R$ 149,90');
  assert.equal(m.hero.normal, 'R$ 149,90 é o preço normal por ano.');
  assert.equal(m.hero.filled, 12);
  assert.equal(m.hero.ticksLine, '1º ano pela oferta · depois, a cada ano pelo preço normal');
  assert.equal(m.timeline[0].text, 'Você paga R$ 119,90 e o Premium começa.');
  assert.equal(m.timeline[1].when, '20 de nov. de 2027');
  assert.equal(m.timeline[1].text, 'Renova por R$ 149,90 a cada ano, se você não cancelar.');
  assert.equal(m.renewal, 'R$ 119,90 pelo 1º ano; depois, R$ 149,90 a cada ano, com renovação automática. Cancele até 24 horas antes da renovação, nos ajustes da sua Conta Apple.');
  assert.equal(m.cta, 'Começar por R$ 119,90');
});

test('EO-6: Android reads the same offer from the Play pricing phases', () => {
  const m = E.offerModel({ pkgs: [andThree, andAnnual], eligibility: null, platform: 'android', language: 'pt', t: pt, now: NOW, dev: false });
  assert.equal(m.hero.offer, true);
  assert.equal(m.hero.price, 'R$ 19,90');
  assert.equal(m.cta, 'Começar por R$ 19,90');
  assert.equal(m.pkg, andThree);
});

// ── not eligible ───────────────────────────────────────────────────────────────────────────

test('EO-7: not eligible (the store says so) — regular prices, no strikethrough, no ticks, no offer badge', () => {
  const m = model({ eligibility: NOT_ELIG });
  const h = m.hero;
  assert.equal(h.offer, false);
  assert.equal(h.badge, null);
  assert.equal(h.title, 'Premium');
  assert.equal(h.price, 'R$ 39,90');
  assert.equal(h.per, '/ 3 meses');
  assert.equal(h.struck, null);
  assert.equal(h.filled, 0);
  assert.equal(h.ticks, 0);
  assert.deepEqual(m.timeline[0], { when: 'Hoje', text: 'O Premium começa.' });
  assert.equal(m.timeline[1].when, '20 de fev. de 2027');
  assert.equal(m.timeline[1].text, 'Renova por R$ 39,90 a cada 3 meses, se você não cancelar.');
  assert.equal(m.renewal, 'R$ 39,90 a cada 3 meses, com renovação automática. Cancele até 24 horas antes da renovação, nos ajustes da sua Conta Apple.');
  assert.equal(m.cta, 'Assinar por R$ 39,90');
  for (const p of m.plans) { assert.equal(p.badge, null); assert.equal(p.struck, null); }
  const [three, annual] = m.plans;
  assert.equal(three.price, 'R$ 39,90');
  assert.equal(three.line1, 'a cada 3 meses');
  assert.equal(three.line2, null);
  assert.equal(annual.price, 'R$ 149,90');
  assert.equal(annual.line1, 'por ano');
  assert.equal(sp(annual.equiv), 'equivale a R$ 37,48 a cada 3 meses');
  assert.equal(model({ eligibility: null }).hero.offer, false, 'unknown on iOS = regular prices');
});

test('EO-8: one plan eligible and the other not: each card tells its own truth', () => {
  const m = model({ eligibility: { quarterly: false, yearly: true } });
  assert.equal(m.selected, 'annual', 'the plan with an offer opens selected');
  assert.equal(m.plans[0].badge, null);
  assert.equal(m.plans[1].badge, 'Oferta');
  assert.equal(model({ eligibility: { quarterly: false, yearly: true }, selected: 'threeMonth' }).cta, 'Assinar por R$ 39,90');
});

// ── what the store does not have yet ───────────────────────────────────────────────────────

test('EO-9: no THREE_MONTH package (the new products are not in the stores yet): works with what exists, regular prices, honest copy', () => {
  const m = E.offerModel({ pkgs: [iosAnnual, iosMonthly, iosLifetime], eligibility: NOT_ELIG, platform: 'ios', language: 'pt', t: pt, now: NOW, dev: false });
  assert.equal(m.sample, false);
  assert.deepEqual(m.plans.map((p) => p.key), ['monthly', 'annual']);
  assert.equal(m.plans[0].name, 'Mensal');
  assert.equal(m.plans[0].line1, 'por mês');
  assert.equal(sp(m.plans[1].equiv), 'equivale a R$ 12,50 por mês', 'the equivalent follows the other card: 149,90 / 12 = 12,49… → up');
  assert.equal(m.selected, 'monthly');
  assert.equal(m.cta, 'Assinar por R$ 14,90');
  assert.equal(m.timeline[1].when, '20 de dez.');
  assert.equal(m.renewal, 'R$ 14,90 a cada mês, com renovação automática. Cancele até 24 horas antes da renovação, nos ajustes da sua Conta Apple.');
});

test('EO-10: a plan with a free trial for this person is left off this screen (no free trial here, ever)', () => {
  const trialAnnual = { packageType: 'ANNUAL', product: { ...iosAnnual.product, introPrice: { price: 0, priceString: 'R$ 0,00', cycles: 1, period: 'P1W', periodUnit: 'WEEK', periodNumberOfUnits: 1 } } };
  const m = E.offerModel({ pkgs: [iosThree, trialAnnual], eligibility: ELIG, platform: 'ios', language: 'pt', t: pt, now: NOW, dev: false });
  assert.deepEqual(m.plans.map((p) => p.key), ['threeMonth']);
  const andTrial = { ...andAnnual, product: { ...andAnnual.product, defaultOption: { freePhase: phase('Grátis', 0, 'DAY', 7), introPhase: null } } };
  assert.deepEqual(E.offerModel({ pkgs: [andThree, andTrial], eligibility: null, platform: 'android', language: 'pt', t: pt, now: NOW, dev: false }).plans.map((p) => p.key), ['threeMonth']);
  const all = JSON.stringify(model());
  assert.doesNotMatch(all, /grátis|gratuito|teste/i);
});

test('EO-11: an intro the copy cannot state truthfully (several cycles, not cheaper, other currency) leaves the plan off', () => {
  const cyc = { packageType: 'THREE_MONTH', product: { ...iosThree.product, introPrice: { ...iosThree.product.introPrice, cycles: 2 } } };
  assert.deepEqual(model({ pkgs: [cyc, iosAnnual] }).plans.map((p) => p.key), ['annual']);
  const dear = { packageType: 'THREE_MONTH', product: { ...iosThree.product, introPrice: { ...iosThree.product.introPrice, price: 39.9 } } };
  assert.deepEqual(model({ pkgs: [dear, iosAnnual] }).plans.map((p) => p.key), ['annual']);
  const usd = { packageType: 'THREE_MONTH', product: { ...andThree.product, defaultOption: { freePhase: null, introPhase: { ...phase('$7.49', 7490000, 'MONTH', 3), price: { formatted: '$7.49', amountMicros: 7490000, currencyCode: 'USD' } } } } };
  assert.deepEqual(E.offerModel({ pkgs: [usd, andAnnual], eligibility: null, platform: 'android', language: 'pt', t: pt, now: NOW, dev: false }).plans.map((p) => p.key), ['annual']);
});

test('EO-12: nothing to sell (offline / no offering): no plans, no package, nothing invented', () => {
  for (const pkgs of [[], null, [iosLifetime]]) {
    const m = E.offerModel({ pkgs, eligibility: null, platform: 'ios', language: 'pt', t: pt, now: NOW, dev: false });
    assert.deepEqual(m.plans, []);
    assert.equal(m.pkg, null);
    assert.equal(m.selected, null);
    assert.equal(m.sample, false);
  }
});

// ── __DEV__ sample prices ──────────────────────────────────────────────────────────────────

test('EO-13: dev=false NEVER returns sample prices, whatever the store has', () => {
  for (const pkgs of [[], null, [iosAnnual, iosMonthly], [iosLifetime]]) {
    for (const platform of ['ios', 'android']) {
      const m = E.offerModel({ pkgs, eligibility: null, platform, language: 'pt', t: pt, now: NOW, dev: false });
      assert.equal(m.sample, false);
      assert.equal(m.sampleLabel, null);
      assert.ok(m.plans.every((p) => !String(p.pkg?.product?.identifier || '').startsWith('sample')));
    }
  }
  assert.equal(E.offerModel({ pkgs: [], eligibility: null, platform: 'ios', language: 'pt', t: pt, now: NOW }).sample, false, 'the flag is off unless passed true');
  assert.equal(E.offerModel({ pkgs: [], eligibility: null, platform: 'ios', language: 'pt', t: pt, now: NOW, dev: 'yes' }).sample, false, 'only true turns it on');
});

test('EO-14: dev=true without a THREE_MONTH package: a labelled sample preview with the approved R$ values, never purchasable', () => {
  for (const platform of ['ios', 'android']) {
    const m = E.offerModel({ pkgs: [iosAnnual, iosMonthly], eligibility: null, platform, language: 'pt', t: pt, now: NOW, dev: true });
    assert.equal(m.sample, true);
    assert.equal(m.sampleLabel, 'Preços de exemplo (só no modo de desenvolvimento)');
    assert.equal(m.pkg, null, 'a sample can never reach purchasePackage');
    assert.equal(sp(m.hero.price), 'R$ 19,90');
    assert.equal(sp(m.hero.struck), 'R$ 39,90');
    assert.equal(sp(m.plans[1].price), 'R$ 119,90');
    assert.equal(sp(m.plans[1].struck), 'R$ 149,90');
    assert.equal(sp(m.cta), 'Começar por R$ 19,90');
  }
  const real = E.offerModel({ pkgs: [iosThree, iosAnnual], eligibility: ELIG, platform: 'ios', language: 'pt', t: pt, now: NOW, dev: true });
  assert.equal(real.sample, false, 'with the real 3-month product, dev builds show the store too');
  assert.equal(real.pkg, iosThree);
});

// ── helpers ────────────────────────────────────────────────────────────────────────────────

test('EO-15: the renewal date clamps to the last day of a shorter month (as the stores bill)', () => {
  const d = E.addMonths(new Date(2026, 10, 30, 9), 3);
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate()], [2027, 1, 28]);
  const e = E.addMonths(new Date(2027, 0, 31, 9), 1);
  assert.deepEqual([e.getFullYear(), e.getMonth(), e.getDate()], [2027, 1, 28]);
  const f = E.addMonths(new Date(2026, 10, 20, 9), 12);
  assert.deepEqual([f.getFullYear(), f.getMonth(), f.getDate()], [2027, 10, 20]);
});

test('EO-16: the English copy reads naturally with the same model', () => {
  const m = model({ t: en, language: 'en' });
  assert.equal(m.hero.title, '3 months of Premium');
  assert.equal(m.hero.normal, 'R$ 39,90 is the regular price every 3 months.');
  assert.equal(m.timeline[0].text, 'You pay R$ 19,90 and Premium starts.');
  assert.equal(m.timeline[1].when, 'Feb 20, 2027');
  assert.equal(m.cta, 'Start for R$ 19,90');
  assert.equal(m.plans[1].line1, 'for the 1st year');
});

// ── the Free / Premium sheet and the benefit rows ──────────────────────────────────────────

test('EO-17: "Free and Premium" is a 10-row table in the approved order; checks are drawn, the free side shows the free amounts', () => {
  const rows = E.freePremiumRows(pt, { freeProtocols: 1 }); // a new account (OB-28)
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map((r) => r.label), ['Cálculo da seringa', 'Protocolos', 'Lembretes', 'Doses no frasco', 'Exames e vacinas', 'Leituras com IA', 'Comida com IA', 'Dose no corpo', 'Relatório em PDF', 'Seus números reais']);
  assert.deepEqual(rows.map((r) => r.free), [true, '1', true, true, true, '3 por mês', '7 dias', false, false, false]);
  assert.deepEqual(rows.map((r) => r.premium), [true, 'sem limites', true, true, true, 'incluídas', 'todo dia', true, true, true]);
});

test('EO-18: the four benefit rows with their value on the right (S-24: no number, never "unlimited" for AI reads)', () => {
  const rows = E.benefitRows(pt);
  assert.deepEqual(rows.map((r) => [r.label, r.value]), [
    ['Protocolos', 'sem limites'],
    ['Dose no corpo', 'incluída'],
    ['Relatório em PDF dos exames e vacinas', 'incluído'],
    ['Leituras de exames com IA', 'incluídas'],
  ]);
  for (const r of rows) assert.ok(r.icon, r.label);
});
