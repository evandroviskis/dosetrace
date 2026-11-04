'use strict';
// Third review of b4267c7 (2026-11-04), N4 still open: a strength per ml is taken ONLY when the
// number says "per one ml" ("/ml", "/1 ml", "/cc", "por ml", "per ml", "pro ml", "par ml", "al
// ml", "je ml", "a ml", "por mililitro"…) or the answer has no volume at all ("10 mg"). Any
// other volume ("10 mg para 2 ml", "10mg/2cc", "10 mg, 2 ml") is a total in another volume, a 2x
// error as a per-ml value: refused, and the per-ml question is asked again. Same rule on the
// phone (lib/assistantSchema) and in the edge function (protocol-assistant/schema.ts). AP-54.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/assistantSchema');
const SV = require('../supabase/functions/protocol-assistant/schema.ts');
const A = require('../lib/protocolAssistant');
const { newProtocolForm } = require('../lib/protocolForm');

const conc = (text, n, unit) => ({ intent: 'answer', conc: { text: n, unit } });
const appConc = (t, n, u) => S.validateUnderstanding('conc', conc(t, n, u), t, 'pt').conc;
const edgeConc = (t, n, u) => SV.validateUnderstanding('conc', conc(t, n, u), t).conc;

const REFUSED = ['10 mg para 2 ml', '10 mg a cada 2 ml', '10 mg por cada 2 ml', '10 mg em cada 2 ml', '10mg/2cc', '10 mg in 2 cc', '10 mg, 2 ml',
  '10 mg pour 2 ml', '10 mg je 2 ml', '10 mg auf 2 ml', '10 mg ogni 2 ml', '10 mg/2 ml', '10 mg per 2 mL', '10 mg each 2 ml', '50 mg/5 mL',
  '10 mg/0.5ml', '10 mg pro 2 ml', '10 mg em 2 mililitros', '10 mg in 2 millilitres'];
const ACCEPTED = ['10 mg', '5 mg/ml', '5 mg/mL', '5 mg/1 ml', '5 mg/cc', '5 mg por ml', '5 mg per ml', '5 mg pro ml', '5 mg par ml', '5 mg al ml',
  '5 mg je ml', '5 mg a ml', '5 mg por mililitro', '5 mg per millilitre', '5 mg/ml, frasco de 10 ml', '5 mg por ml em 10 ml'];

test('AP-54: a volume other than one ml next to the strength is refused (model unit mg and mg/ml, app and edge)', () => {
  for (const t of REFUSED) {
    const n = t.match(/\d+/)[0];
    for (const u of ['mg', 'mg/ml']) {
      assert.equal(appConc(t, n, u), null, `app "${t}" unit ${u}`);
      assert.equal(edgeConc(t, n, u), null, `edge "${t}" unit ${u}`);
    }
    assert.equal(A.localUnderstand('conc', t, 'pt'), null, `phone "${t}"`);
  }
});

test('AP-54: per one ml, or no volume at all, is accepted (model unit mg and mg/ml, app and edge)', () => {
  for (const t of ACCEPTED) {
    const n = t.match(/\d+/)[0];
    for (const u of ['mg', 'mg/ml']) {
      assert.equal((appConc(t, n, u) || {}).text, n, `app "${t}" unit ${u}`);
      assert.equal((edgeConc(t, n, u) || {}).text, n, `edge "${t}" unit ${u}`);
    }
  }
});

test('AP-54: "5 mg/ml, frasco de 10 ml" is 5 mg/ml with a 10 ml vial; "10 mg para 2 ml" asks the per-ml question again', () => {
  const raw = { intent: 'answer', conc: { text: '5', unit: 'mg' }, vial_ml: { text: '10' } };
  assert.deepEqual(S.validateUnderstanding('conc', raw, '5 mg/ml, frasco de 10 ml', 'pt').vial_ml, { text: '10', value: 10 });
  const NOW = new Date(2026, 9, 3, 10, 0);
  let s = A.startConversation('build', newProtocolForm(NOW), { language: 'pt', now: NOW, catalog: { recon: [], rtu: [], oral: [] } });
  s = A.answerText(s, 'testo', { intent: 'answer', compound: 'testo', form: 'ready' });
  assert.equal(s.step, 'conc');
  s = A.answerText(s, '10 mg para 2 ml', { intent: 'answer', conc: { text: '10', unit: 'mg' } });
  assert.equal(s.step, 'conc', 'asked again');
  assert.equal(s.draft.conc, null);
  s = A.answerText(s, '5 mg/ml, frasco de 10 ml', raw);
  assert.equal(s.draft.conc, '5');
  assert.equal(s.draft.vialMl, '10');
});

// ── Third review, small items ─────────────────────────────────────────────
test('Third review: "Você quis dizer" reads naturally (es las / la 1, it le / l\'1, de Uhr)', () => {
  const { renderText } = require('../lib/assistantText');
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'i18n', 'translations.js'), 'utf8').replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };';
  const mod = { exports: {} }; new Function('module', 'exports', src)(mod, mod.exports);
  const TR = mod.exports.translations;
  const NOW = new Date(2026, 9, 3, 10, 0);
  const ask = (l, typed) => {
    let s = A.startConversation('build', newProtocolForm(NOW), { language: l, now: NOW, catalog: { recon: [{ key: 'lyo_nad_plus', label: 'NAD+' }], rtu: [], oral: [] } });
    s = A.answerText(s, 'nad', { intent: 'answer', compound: 'nad' });
    s = A.answerOption(s, 'form:powder');
    s = A.answerText(s, '1.000 mg', A.localUnderstand('amount', '1.000 mg', l));
    s = A.answerText(s, '7 ml', A.localUnderstand('mix', '7 ml', l));
    s = A.answerOption(s, 'day:0');
    s = A.answerText(s, '1 mg', { intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each' });
    s = A.answerOption(s, 'often:d1');
    s = A.answerOption(s, 'start:0');
    s = A.answerText(s, typed, A.localUnderstand('time', typed, l));
    const m = s.messages.filter((x) => x.from === 'app').pop();
    return renderText((k) => TR[l][k], m.key, m.params);
  };
  assert.equal(ask('es', '8 y 30'), '¿Quisiste decir las 8:30?');
  assert.equal(ask('es', '1 y 30'), '¿Quisiste decir la 1:30?');
  assert.equal(ask('it', '8 e 30'), 'Intendevi le 8:30?');
  assert.equal(ask('it', '1 e 30'), "Intendevi l'1:30?");
  assert.equal(ask('pt', '8 e 30'), 'Você quis dizer 8:30?');
  assert.equal(TR.de.ap_q_time_meant, 'Meinst du {time} Uhr?');
});

test('Third review: an old-format time ("8:00", "08:00:00") never blocks a save; off-clock times still do', () => {
  const { isClockTime } = require('../lib/assistantTime');
  for (const t of ['08:00', '8:00', '08:00:00', '23:59', '0:30']) assert.equal(isClockTime(t), true, t);
  for (const t of ['24:00', '30:00', '08:60', '', null, '9', '8:0', 'x:y']) assert.equal(isClockTime(t), false, String(t));
});

test('Third review: "é isso", "eso es", "c\'est ça", "esatto, sì", "stimmt" confirm a read-back', () => {
  const NOW = new Date(2026, 9, 3, 10, 0);
  for (const [l, yes] of [['pt', 'é isso'], ['es', 'eso es'], ['fr', "c'est ça"], ['it', 'esatto, sì'], ['de', 'stimmt']]) {
    let s = A.startConversation('build', newProtocolForm(NOW), { language: l, now: NOW, catalog: { recon: [{ key: 'lyo_nad_plus', label: 'NAD+' }], rtu: [], oral: [] } });
    s = A.answerText(s, 'nad', { intent: 'answer', compound: 'nad' });
    s = A.answerOption(s, 'form:powder');
    s = A.answerText(s, '1.000 mg', A.localUnderstand('amount', '1.000 mg', l));
    s = A.answerText(s, '7 ml', A.localUnderstand('mix', '7 ml', l));
    s = A.answerOption(s, 'day:0');
    s = A.answerText(s, '1 mg 21:00', { intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each', period: 'day', count: 1 });
    s = A.answerOption(s, 'start:0');
    assert.equal(s.step, 'time', l);
    s = A.answerText(s, yes, A.localUnderstand('time', yes, l));
    assert.equal(s.step, 'confirm', `${l} "${yes}"`);
    assert.deepEqual(s.draft.times, ['21:00']);
  }
});

// Sim check 2026-11-04 (light, pt): "10 mg/2 ml" was refused with "Inclua o número e a unidade",
// which is wrong — the person wrote both. A refusal for another volume asks for the amount in 1 ml.
test('AP-54: a strength in another volume is asked again as "per 1 ml", never "include the unit"', () => {
  const NOW = new Date(2026, 9, 3, 10, 0);
  for (const raw of [
    { intent: 'answer', conc: { text: '10', unit: 'mg' } },
    { intent: 'answer', conc: null, vial_ml: { text: '2' } },
    { intent: 'unclear' },
  ]) {
    let s = A.startConversation('build', newProtocolForm(NOW), { language: 'pt', now: NOW, catalog: { recon: [], rtu: [], oral: [] } });
    s = A.answerText(s, 'testo', { intent: 'answer', compound: 'testo', form: 'ready' });
    s = A.answerText(s, '10 mg/2 ml', raw);
    const keys = s.messages.filter((m) => m.from === 'app' || m.role === 'app' || m.who === 'app').map((m) => m.key);
    assert.ok(keys.includes('ap_conc_per_one_ml'), JSON.stringify(keys));
    assert.ok(!keys.slice(-3).includes('ap_need_unit'));
    assert.equal(s.step, 'conc');
  }
  // A plain missing unit still says "include the unit".
  let s = A.startConversation('build', newProtocolForm(NOW), { language: 'pt', now: NOW, catalog: { recon: [], rtu: [], oral: [] } });
  s = A.answerText(s, 'testo', { intent: 'answer', compound: 'testo', form: 'ready' });
  s = A.answerText(s, '5', { intent: 'answer', vial_ml: { text: '5' } });
  assert.ok(s.messages.map((m) => m.key).includes('ap_need_unit'));
});
