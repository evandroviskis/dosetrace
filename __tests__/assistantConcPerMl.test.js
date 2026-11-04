// Founder sim check 2026-11-04: "5 mg/ml" typed at "How strong is it per ml?" got "I didn't catch that".
// The model copied the unit as "mg/ml", which the unit check rejected, and the phone never read it itself.
const test = require('node:test');
const assert = require('node:assert');
const S = require('../lib/assistantSchema.js');
const A = require('../lib/protocolAssistant.js');

test('conc: "5 mg/ml" is read on the phone (never sent to the model)', () => {
  for (const [txt, unit, n] of [['5 mg/ml', 'mg', '5'], ['5mg/ml', 'mg', '5'], ['2,5 mg/mL', 'mg', '2,5'], ['500 mcg/ml', 'mcg', '500'], ['10 UI/ml', 'IU', '10'], ['5 mg / ml', 'mg', '5']]) {
    const r = A.localUnderstand('conc', txt, 'pt');
    assert.ok(r, txt);
    assert.deepStrictEqual(r.conc, { text: n, unit }, txt);
  }
});

test('conc: a model answer with unit "mg/ml" is accepted as mg', () => {
  for (const u of ['mg/ml', 'mg/mL', 'MG/ML']) {
    const out = S.validateUnderstanding('conc', { intent: 'answer', conc: { text: '5', unit: u } }, '5 mg/ml', 'en');
    assert.deepStrictEqual(out.conc, { text: '5', unit: 'mg', value: 5 }, u);
  }
});

test('the per-ml suffix is only for conc: "5 mg/ml" at the dose step is not a dose', () => {
  assert.strictEqual(A.localUnderstand('dose', '5 mg/ml', 'en'), null);
  assert.strictEqual(A.localUnderstand('amount', '5 mg/ml', 'en'), null);
});
