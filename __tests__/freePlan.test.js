'use strict';
// OB-28 (docs/specs/onboarding-protocol.md): the free plan of NEW accounts includes 1 active protocol;
// every account that existed before the rule went live keeps its 3 and everything it has; Premium is
// unlimited (founder 2026-11-19 19:45, 02-decisoes; reason 2026-11-20: the onboarding builds only the
// first protocol, the offer after the account shows Premium for the others). One place knows the count
// (lib/freePlan); every gate and every text that states it reads it from there.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const FP = require('../lib/freePlan');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
function load() {
  const src = read('i18n', 'translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const tr = load();
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const tFor = (l) => (k) => (tr[l][k] !== undefined ? tr[l][k] : tr.en[k] !== undefined ? tr.en[k] : k);
const ph = (s) => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',');
const startFree = (l) => tr[l].faq_categories.find((c) => c.id === 'start').questions.find((q) => q.id === 'start_free').a;

test('OB-28: an account created on or after the cutoff gets 1; one created before keeps 3; unknown keeps 3', () => {
  const cut = Date.parse(FP.NEW_FREE_PLAN_FROM);
  assert.ok(Number.isFinite(cut), 'the cutoff is a real instant');
  assert.ok(cut >= Date.parse('2026-11-20T00:00:00Z'), 'never before the decision was built: every account made so far keeps 3');
  assert.equal(FP.FREE_PROTOCOLS_NEW_ACCOUNT, 1);
  assert.equal(FP.FREE_PROTOCOLS_EXISTING_ACCOUNT, 3);
  const at = (ms) => ({ id: 'u', created_at: new Date(ms).toISOString() });
  assert.equal(FP.freeProtocolLimit(at(cut)), 1, 'at the cutoff = new');
  assert.equal(FP.freeProtocolLimit(at(cut + 86400000)), 1);
  assert.equal(FP.freeProtocolLimit(at(cut - 1)), 3, 'a millisecond before = existing');
  assert.equal(FP.freeProtocolLimit({ id: 'u', created_at: '2026-09-01T12:00:00Z' }), 3);
  // Supabase's own format (microseconds, +00:00) reads the same.
  assert.equal(FP.freeProtocolLimit({ id: 'u', created_at: '2027-01-05T10:11:12.123456+00:00' }), 1);
  for (const u of [null, undefined, {}, { created_at: null }, { created_at: '' }, { created_at: 'garbage' }]) {
    assert.equal(FP.freeProtocolLimit(u), 3, `never restrict on a maybe: ${JSON.stringify(u)}`);
    assert.equal(FP.isNewFreePlanAccount(u), false);
  }
});

test('OB-28: the gate — one more active protocol needs Premium at the limit; Premium is never stopped', () => {
  assert.equal(FP.atFreeProtocolLimit({ activeCount: 0, limit: 1, premium: false }), false);
  assert.equal(FP.atFreeProtocolLimit({ activeCount: 1, limit: 1, premium: false }), true);
  assert.equal(FP.atFreeProtocolLimit({ activeCount: 2, limit: 3, premium: false }), false);
  assert.equal(FP.atFreeProtocolLimit({ activeCount: 3, limit: 3, premium: false }), true);
  assert.equal(FP.atFreeProtocolLimit({ activeCount: 5, limit: 1, premium: false }), true, 'lapsed Premium keeps its 5, adds none (Q7)');
  assert.equal(FP.atFreeProtocolLimit({ activeCount: 40, limit: 1, premium: true }), false);
});

test('OB-28: the count words in 6 languages — singular and plural pairs with the same placeholders', () => {
  for (const l of LANGS) {
    for (const k of ['free_protocols_phrase', 'paywall_free_feat_3', 'ob_limit_body']) {
      assert.ok(tr[l][k] && tr[l][`${k}_one`], `${l} ${k} and ${k}_one`);
      assert.equal(ph(tr[l][k]), ph(tr[l][`${k}_one`]), `${l} ${k}: same placeholders`);
      assert.match(tr[l][k], /\{n\}/, `${l} ${k} prints the count`);
    }
    // Every sentence that states the free count carries the token; no literal 3 is left.
    for (const [name, s] of [['protocols_limit_msg', tr[l].protocols_limit_msg], ['protocols_limit_msg_notrial', tr[l].protocols_limit_msg_notrial], ['pw_prev_protos_body', tr[l].pw_prev_protos_body], ['faq start_free', startFree(l)]]) {
      assert.match(s, /\{free_protocols\}/, `${l} ${name}`);
      assert.doesNotMatch(s.replace(/3 (scans|escaneos|leituras|scansioni|Scans)/, ''), /\b3\b/, `${l} ${name}: no hardcoded 3`);
    }
  }
});

test('OB-28: the Portuguese copy for a new account (1) and an existing one (3), formal', () => {
  const t = tFor('pt');
  assert.equal(FP.fillFreeProtocols(t('protocols_limit_msg_notrial'), t, 1, 'pt'), 'O plano gratuito inclui 1 protocolo ativo. Assine o Premium para protocolos ilimitados.');
  assert.equal(FP.fillFreeProtocols(t('protocols_limit_msg_notrial'), t, 3, 'pt'), 'O plano gratuito inclui até 3 protocolos ativos. Assine o Premium para protocolos ilimitados.');
  assert.equal(FP.fillFreeProtocols(t('protocols_limit_msg'), t, 1, 'pt'), 'O plano gratuito inclui 1 protocolo ativo. Assine o Premium para protocolos ilimitados e experimente grátis por 7 dias.');
  assert.equal(FP.freeProtocolsLabel(t, 1, 'pt'), '1 protocolo');
  assert.equal(FP.freeProtocolsLabel(t, 3, 'pt'), 'Até 3 protocolos');
  assert.equal(FP.fillFreeProtocols(t('pw_prev_protos_body'), t, 1, 'pt'), 'O plano grátis comporta 1 protocolo ativo. O Premium comporta quantos você seguir, cada um com sua agenda, seus lembretes e sua calculadora.');
  assert.match(FP.fillFreeProtocols(startFree('pt'), t, 1, 'pt'), /O plano gratuito inclui 1 protocolo ativo, 3 leituras por mês/);
  assert.match(FP.fillFreeProtocols(startFree('pt'), t, 3, 'pt'), /O plano gratuito inclui até 3 protocolos ativos, 3 leituras por mês/);
  assert.equal(t('ob_limit_body_one').replace('{n}', '1').replace('{name}', 'BPC-157'), 'Esta conta já tem 1 protocolo ativo, o limite do plano grátis. Para guardar BPC-157, assine o Premium ou descarte este protocolo.');
  // An unknown account reads the existing accounts' number (the gate's answer for it), never "{n}".
  assert.equal(FP.freeProtocolsLabel(t, null, 'pt'), 'Até 3 protocolos');
  for (const l of LANGS) {
    const tl = tFor(l);
    for (const n of [1, 3]) {
      for (const s of [FP.fillFreeProtocols(tl('protocols_limit_msg'), tl, n, l), FP.fillFreeProtocols(startFree(l), tl, n, l), FP.freeProtocolsLabel(tl, n, l)]) {
        assert.doesNotMatch(s, /\{/, `${l} ${n}: every token filled: ${s}`);
        assert.match(s, new RegExp(`\\b${n}\\b`), `${l} ${n}: states the count`);
      }
    }
  }
});

test('OB-28: every gate reads the account\'s limit from lib/freePlan (no second number anywhere)', () => {
  const files = ['App.js'];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) files.push(p); } };
  ['lib', 'screens', 'components'].forEach(walk);
  for (const f of files) {
    if (f === path.join('lib', 'freePlan.js')) continue;
    const s = read(f);
    assert.doesNotMatch(s, /FREE_PROTOCOL(S)?_(LIMIT|NEW_ACCOUNT)\s*=\s*\d/, `${f}: a free protocol count of its own`);
  }
  const PS = read('screens', 'ProtocolsScreen.js');
  assert.match(PS, /require\('\.\.\/lib\/freePlan'\)|from '\.\.\/lib\/freePlan'/);
  // the Add button, the assistant's save (the wizard's safety net), Restart and Restore all use isOverFreeLimit / the same check
  const over = PS.slice(PS.indexOf('async function isOverFreeLimit()'), PS.indexOf('async function openAdd()'));
  assert.match(over, /freeProtocolLimit\(user\)/);
  assert.match(over, /atFreeProtocolLimit\(/);
  const net = PS.slice(PS.indexOf('// Safety net: never persist beyond the free limit'), PS.indexOf('insertNewProtocol({', PS.indexOf('// Safety net: never persist beyond the free limit')));
  assert.match(net, /atFreeProtocolLimit\(\{ activeCount, limit: freeProtocolLimit\(user\)/);
  assert.match(PS, /fillFreeProtocols\(t\(trial \? 'protocols_limit_msg' : 'protocols_limit_msg_notrial'\), t, /);
  const OA = read('lib', 'onboardingApp.js');
  assert.match(OA, /limit: freeProtocolLimit\(user\)/);
  assert.match(OA, /function deps\(store, language, user\)/);
  const APP = read('App.js');
  assert.match(APP, /n: freeProtocolLimit\(user\)/);
  assert.match(APP, /pluralKey\('ob_limit_body', obAsk\.n, language\)/);
});

test('OB-28: the paywall, its preview, the entry offer, the FAQ and the app search show the account\'s number', () => {
  const P = require('../lib/paywallPlans');
  const E = require('../lib/entryOffer');
  const pt = tFor('pt');
  const row = (rows) => rows[1];
  assert.equal(row(P.comparisonRows(pt, { freeFoodDays: 7, freeProtocols: 1 })).label, '1 protocolo');
  assert.equal(row(P.comparisonRows(pt, { freeFoodDays: 7, freeProtocols: 3 })).label, 'Até 3 protocolos');
  const proto = (n) => E.freePremiumRows(pt, { freeProtocols: n }).find((r) => r.label === 'Protocolos').free;
  assert.equal(proto(1), '1');
  assert.equal(proto(3), '3', 'OB-26: an existing account in the 15-day builder sees its 3');
  const PAY = read('screens', 'PaywallScreen.js');
  assert.match(PAY, /comparisonRows\(t, \{ freeFoodDays: FREE_DAYS, freeProtocols \}\)/);
  assert.match(PAY, /useFreeProtocolLimit\(\)/);
  const EO = read('screens', 'EntryOfferScreen.js');
  assert.match(EO, /freePremiumRows\(t, \{ freeProtocols \}\)/);
  const PREV = read('components', 'FeaturePreviews.js');
  assert.match(PREV, /freeProtocolsLabel\(tr, freeProtocols/);
  assert.match(PREV, /fillFreeProtocols\(t\(feature\.bodyKey\), t, freeProtocols/);
  const FAQ = read('screens', 'FAQScreen.js');
  assert.match(FAQ, /fillStoreText\(item\.a, t, Platform\.OS, \{ freeProtocols \}\)/);
  const { fillStoreText } = require('../lib/storeText');
  assert.match(fillStoreText(startFree('pt'), pt, 'ios', { freeProtocols: 1 }), /inclui 1 protocolo ativo,/);
  const TX = require('../lib/appSearchText');
  const hit = TX.makeTextSearch(TX.buildTextIndex(pt, 'ios', { freeProtocols: 1 }))('protocolo ativo leituras')
    .find((h) => h.unit.src === 'faq' && /inclui 1 protocolo ativo, 3 leituras/.test(h.unit.body));
  assert.ok(hit, 'the search reads the filled FAQ answer');
  assert.match(read('screens', 'AppSearchScreen.js'), /buildTextIndex\(t, Platform\.OS, \{ freeProtocols \}\)/);
});

test('OB-28: the protocols preview locks the row after the free ones (1 for a new account, 3 for an existing one)', () => {
  const PREV = read('components', 'FeaturePreviews.js');
  const fx = PREV.slice(PREV.indexOf('function ProtosFx('), PREV.indexOf('/* ---- PDF export'));
  assert.match(fx, /const free = shownLimit\(freeProtocols\)/);
  assert.doesNotMatch(fx, /i < 3|i === 3|3 \* 34/, 'no fixed third slot');
});
