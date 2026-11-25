'use strict';
// Two follow-ups to the purpose question (coordinator 2026-11-20):
//  PQ-17 — onboarding writes only the profile goals that are usual for that product (the curated
//          table); a product with no entry gets no goal from the profile, and no "Para" row;
//  PQ-18 — the assistant's "is it one … or a total per day/week/month?" says "one dose" for an
//          oral product (the same term as its own "One dose" chip); injectables keep "one injection".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../lib/protocolPurpose');
const A = require('../lib/protocolAssistant');
const { newProtocolForm } = require('../lib/protocolForm');
const { translations: T } = require('../i18n/translations.js');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('PQ-17: onboarding keeps only the profile goals in the product\'s curated table; no entry → no goal', () => {
  // Melatonin capsule: table = sleep + circadian. Her goals fat loss, sleep, immune → only sleep.
  assert.deepEqual(P.purposeFromProfile(['fat_loss', 'sleep', 'immune'], 'oral', 'oral_melatonin'), ['wt_sleep_quality']);
  // Vitamin C: table = immune, antioxidant. Sleep is never written on it.
  assert.deepEqual(P.purposeFromProfile(['sleep', 'immune'], 'oral', 'oral_vit_c'), ['wt_immune']);
  // Semaglutide: table = weight, appetite. Sleep + strength + fat loss → weight only.
  assert.deepEqual(P.purposeFromProfile(['sleep', 'strength', 'fat_loss'], 'recon', 'lyo_semaglutide'), ['wt_weight']);
  // No match with the table → no goal at all.
  assert.deepEqual(P.purposeFromProfile(['sleep'], 'rtu', 'rtu_testosterone_cypionate'), []);
  // A product with no table entry (BPC-157, or her own typed name) → no goal from the profile: her
  // goals were answered for her life in general, not for that product (coordinator 2026-11-20).
  assert.deepEqual(P.purposeFromProfile(['recovery', 'sleep', 'fat_loss'], 'recon', 'lyo_bpc_157'), []);
  assert.deepEqual(P.purposeFromProfile(['immune', 'fat_loss'], 'oral', null), []);
  assert.deepEqual(P.purposeFromProfile(['sleep'], 'oral'), []);
});

test('PQ-17: the onboarding screens pass the product, and an empty result hides the "Para" row', () => {
  const D = require('../lib/onboardingDraft');
  const t = (k) => T.pt[k] || k;
  const p = { name: 'Vitamina C', base: 'vit_c', forms: { oral: 'oral_vit_c' }, form: 'oral', dose: '500', doseUnit: 'mg', freq: 'daily', time: '09:00', startMode: 'today' };
  const purpose = P.purposeFromProfile(['sleep'], p.form, D.compoundIdFor(p));
  assert.deepEqual(purpose, []);
  const rows = D.summaryRows(p, { t, language: 'pt', timeFormat: '24h', now: new Date(2026, 10, 20, 12), weekdayName: () => '', dateText: () => '20/11/2026', purpose });
  assert.ok(!rows.some((r) => r.key === 'purpose'));
  assert.deepEqual(D.draftToForm({ ...p, purpose }, { now: new Date(2026, 10, 20, 12), language: 'pt' }).form.goals, []);
  assert.match(read('screens', 'components', 'OnboardingProtocolSteps.js'), /purposeFromProfile\(profileGoals, protocol\.form, compoundIdFor\(protocol\)\)/);
  assert.match(read('screens', 'OnboardingFlowScreen.js'), /purposeFromProfile\(builder \? meta\.primary_goal : d\.goals, protocol && protocol\.form, compoundIdFor\(protocol\)\)/);
});

const NOW = new Date(2026, 10, 20, 10, 0);
function toPeriod(type, name, compoundId) {
  const f = newProtocolForm(NOW);
  f.type = type; f.name = name; f.compoundId = compoundId;
  let s = A.startConversation('finish', f, { language: 'en', now: NOW, catalog: { recon: [], rtu: [], oral: [] }, touched: ['type'] });
  const say = (text) => { s = A.answerText(s, text, A.localUnderstand(A.textStep(s), text, 'en')); };
  if (A.options(s).some((o) => o.id === 'yes')) s = A.answerOption(s, 'yes');
  for (let i = 0; i < 6 && s.step !== 'period'; i++) say(s.step === 'amount' ? '10 mg' : s.step === 'water' || s.step === 'vial_ml' ? '2 ml' : s.step === 'conc' ? '200 mg' : '3 mg');
  return s;
}
const lastApp = (s) => [...s.messages].reverse().find((m) => m.from === 'app');

test('PQ-18: oral product → "one dose" (the term of its own "One dose" chip); injectable keeps "one injection"', () => {
  const oral = toPeriod('oral', 'Melatonin', 'oral_melatonin');
  assert.equal(oral.step, 'period');
  assert.equal(lastApp(oral).key, 'ap_q_period_oral');
  const inj = toPeriod('rtu', 'Testosterone Cypionate', 'rtu_testosterone_cypionate');
  assert.equal(inj.step, 'period');
  assert.equal(lastApp(inj).key, 'ap_q_period');
  for (const l of LANGS) {
    for (const k of ['ap_q_period_oral', 'ap_q_period_fit_oral']) {
      assert.ok(T[l][k], `${l} ${k}`);
      assert.doesNotMatch(T[l][k], /inje|aplica|Injektion|iniezione|inyecci/i, `${l} ${k}`);
      assert.ok(T[l][k].includes('{dose}') && T[l][k].includes('{unit}'), `${l} ${k}`);
    }
    // One term per concept: the question uses the chip's word for one dose.
    const chip = T[l].ap_opt_per_dose.toLowerCase();
    assert.ok(T[l].ap_q_period_oral.toLowerCase().includes(chip.replace(/^(one|una|uma|une|eine) /, '')), `${l}: ${T[l].ap_q_period_oral} vs ${chip}`);
  }
  assert.equal(T.pt.ap_q_period_oral, 'Os {dose} {unit} são para uma dose, ou o total por dia, por semana ou por mês?');
  assert.match(read('lib', 'protocolAssistant.js'), /key: d\.type === 'oral' \? 'ap_q_period_fit_oral' : 'ap_q_period_fit'/);
});

test('council 2026-11-20 (item 15): another product clears the goals chosen for the previous one (Sleep for Melatonina never carries to Vitamina C); the same product, or a name still being typed, keeps them', () => {
  const mel = P.purposeProductKey({ type: 'oral', compoundId: 'oral_melatonin', name: 'Melatonina' });
  const vitc = P.purposeProductKey({ type: 'oral', compoundId: 'oral_vit_c', name: 'Vitamina C' });
  assert.equal(P.purposeProductKey({ type: 'oral', compoundId: null, name: '  ' }), null, 'nothing chosen yet');
  assert.equal(P.purposeProductKey({ type: 'oral', compoundId: null, name: 'Minha Fórmula' }), 'oral:minha fórmula');
  assert.equal(P.goalsAfterProductChange(['wt_sleep_quality'], mel, vitc), null, 'cleared');
  assert.deepEqual(P.goalsAfterProductChange(['wt_sleep_quality'], mel, mel), ['wt_sleep_quality']);
  assert.deepEqual(P.goalsAfterProductChange(['wt_sleep_quality'], mel, null), ['wt_sleep_quality'], 'typing a new name: not chosen yet');
  assert.deepEqual(P.goalsAfterProductChange(['wt_sleep_quality'], null, vitc), ['wt_sleep_quality'], 'goals with no product known (an old protocol) stay');
  const SRC = read('screens', 'ProtocolsScreen.js');
  assert.match(SRC, /const goalsForRef = useRef\(null\);/);
  assert.match(SRC, /const kept = goalsAfterProductChange\(goals, goalsForRef\.current, key\);/);
  assert.match(SRC, /goalsForRef\.current = purposeProductKey\(\{ type: f\.type, compoundId: f\.compoundId, name: f\.name \}\);/);
});
