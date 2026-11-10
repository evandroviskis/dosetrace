// CP-1 pen path in the AI assistant — docs/specs/pen-path.md PN-1…PN-11, picture screens 1-3 and 6.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../lib/protocolAssistant');
const { newProtocolForm } = require('../lib/protocolForm');

const NOW = new Date(2026, 10, 9, 10, 0); // Monday 2026-11-09
const CAT = { recon: [], rtu: [{ key: 'rtu_tirzepatide', label: 'Tirzepatide' }], oral: [] };
const start = (extra = {}) => A.startConversation('build', newProtocolForm(NOW), { language: 'pt', now: NOW, catalog: CAT, penEnabled: true, region: 'BR', ...extra });
const tap = (s, id) => { const n = A.answerOption(s, id); assert.notEqual(n, s, `tap ${id} at ${s.step}`); return n; };
const ids = (s) => A.options(s).map((o) => o.id);

test('PN-1 / PN-28 the fourth answer "Caneta" only behind the switch', () => {
  let s = A.startConversation('build', newProtocolForm(NOW), { language: 'pt', now: NOW, catalog: CAT, penEnabled: false });
  s = A.answerText(s, 'Mounjaro', { intent: 'answer', compound: 'Mounjaro' });
  assert.equal(s.step, 'form');
  assert.deepEqual(ids(s), ['form:powder', 'form:ready', 'form:pill']);
  let p = start();
  p = A.answerText(p, 'Mounjaro', { intent: 'answer', compound: 'Mounjaro' });
  assert.deepEqual(ids(p), ['form:powder', 'form:ready', 'form:pen', 'form:pill']);
});

test('PN-2/3/8/11 Mounjaro KwikPen: list, printed dose, label validity, what already happened, closed pens, review', () => {
  let s = start();
  s = A.answerText(s, 'Mounjaro', { intent: 'answer', compound: 'Mounjaro' });
  s = tap(s, 'form:pen');
  assert.equal(s.step, 'pen_pick');
  assert.ok(ids(s).includes('pen:pick:mounjaro_kwikpen') && ids(s).includes('pen:pick:other'));
  s = tap(s, 'pen:pick:mounjaro_kwikpen');
  assert.equal(s.step, 'pen_dose');
  assert.deepEqual(ids(s), ['2.5', '5', '7.5', '10', '12.5', '15'].map((x) => `pen:dose:${x}`), 'only the printed doses');
  s = tap(s, 'pen:dose:5');
  assert.equal(s.step, 'pen_valid');
  const last = s.messages[s.messages.length - 1];
  assert.equal(last.key, 'ap_pen_valid_label');
  assert.deepEqual([last.params.n, last.params.days], ['4', '30']);
  s = tap(s, 'pen:validok');
  assert.equal(s.step, 'pen_started');
  s = tap(s, 'pen:started:yes');
  assert.equal(s.step, 'pen_remaining');
  assert.deepEqual(ids(s), ['pen:int:1', 'pen:int:2', 'pen:int:3']);
  s = tap(s, 'pen:int:2');
  assert.equal(s.step, 'pen_opened');
  s = A.answerDate(s, '2026-10-26');
  assert.equal(s.step, 'pen_stock');
  s = tap(s, 'pen:int:1');
  assert.equal(s.step, 'often', 'then the usual schedule; no ml, concentration or syringe question (PN-7)');
  for (const m of s.messages) assert.ok(!/conc|vial_ml|syringe|mix/.test(String(m.key || '')), m.key);
  const out = A.formFromConversation({ ...s, draft: { ...s.draft, intervalDays: 7, dosesPerDay: 1, startDate: '2026-11-09', times: ['08:00'] } }, newProtocolForm(NOW));
  assert.equal(out.form.type, 'pen');
  const pen = JSON.parse(out.form.pen);
  assert.deepEqual([pen.kind, pen.perPen, pen.stock, pen.catalog], ['fixed', 4, 1, 'mounjaro_kwikpen']);
  assert.equal(out.form.vialValidDays, 30);
  assert.deepEqual([out.form.penVial.total_doses, out.form.penVial.doses_taken, out.form.penVial.mixed_on], [4, 2, '2026-10-26']);
  assert.equal(out.form.compoundId, 'rtu_tirzepatide');
  assert.equal(out.form.dose, '5');
});

test('PN-8 "Não lembro" stores no opening date', () => {
  let s = start();
  s = A.answerText(s, 'Mounjaro', { intent: 'answer', compound: 'Mounjaro' });
  for (const id of ['form:pen', 'pen:pick:mounjaro_kwikpen', 'pen:dose:5', 'pen:validok', 'pen:started:yes', 'pen:int:2', 'pen:opened:unknown']) s = tap(s, id);
  assert.equal(s.draft.penOpened, 'unknown');
  const out = A.formFromConversation(s, newProtocolForm(NOW));
  assert.equal(out.form.penVial.mixed_on, null);
});

test('PN-4 Saxenda: printed doses only; the label prints no count, so the person is asked; "Não sei" counts none', () => {
  let s = start();
  s = A.answerText(s, 'Saxenda', { intent: 'answer', compound: 'Saxenda' });
  for (const id of ['form:pen', 'pen:pick:saxenda', 'pen:dose:3']) s = tap(s, id);
  assert.equal(s.step, 'pen_per');
  assert.equal(s.messages[s.messages.length - 1].key, 'ap_pen_q_per');
  let t = A.answerText(s, '6');
  assert.equal(t.step, 'pen_valid');
  assert.equal(JSON.parse(A.formFromConversation(t, newProtocolForm(NOW)).form.pen).perDose['3'], 6);
  let u = tap(s, 'pen:dontknow');
  assert.equal(u.messages[u.messages.length - 1].key, 'ap_pen_valid_label_nocount');
  u = tap(u, 'pen:validok');
  u = tap(u, 'pen:started:yes');
  assert.equal(u.step, 'pen_opened', 'no count: doses left are never asked');
});

test('PN-6 other pen: how it works, doses per pen, validity with "Não sei"', () => {
  let s = start();
  s = A.answerText(s, 'Semaglutida', { intent: 'answer', compound: 'Semaglutida' });
  for (const id of ['form:pen', 'pen:pick:other']) s = tap(s, id);
  assert.equal(s.step, 'pen_kind');
  s = tap(s, 'pen:kind:fixed');
  assert.equal(s.step, 'dose');
  s = A.answerText(s, '2,4 mg', { intent: 'answer', dose: { text: '2,4', unit: 'mg' } });
  assert.equal(s.step, 'pen_count');
  s = A.answerText(s, '4');
  assert.equal(s.step, 'pen_valid');
  assert.equal(s.messages[s.messages.length - 1].key, 'ap_pen_q_valid_days');
  s = tap(s, 'pen:novalid');
  assert.equal(s.step, 'pen_started');
  assert.equal(A.formFromConversation(s, newProtocolForm(NOW)).form.vialValidDays, null);
});

test('PN-10 dose steps: asked back to "Não"; start and dose history set; the review lists each step', () => {
  let s = start();
  s = A.answerText(s, 'Mounjaro', { intent: 'answer', compound: 'Mounjaro' });
  for (const id of ['form:pen', 'pen:pick:mounjaro_kwikpen', 'pen:dose:7.5', 'pen:validok', 'pen:started:no', 'pen:int:2']) s = tap(s, id);
  assert.equal(s.step, 'often');
  s = A.answerText(s, 'toda semana', { intent: 'answer', period: 'week', count: 1 });
  assert.equal(s.step, 'pen_using');
  s = tap(s, 'pen:using:yes');
  assert.equal(s.step, 'pen_since');
  s = A.answerDate(s, '2026-10-05');
  assert.equal(s.step, 'pen_before');
  assert.ok(ids(s).includes('pen:before:5') && !ids(s).includes('pen:before:7.5'), 'only lower printed doses');
  s = tap(s, 'pen:before:5');
  assert.equal(s.step, 'pen_before_since');
  s = A.answerDate(s, '2026-09-07');
  s = tap(s, 'pen:before:2.5');
  s = A.answerDate(s, '2026-08-10');
  s = tap(s, 'pen:before:no');
  assert.notEqual(s.step, 'start', 'the steps set the first dose');
  assert.equal(s.draft.startDate, '2026-08-10');
  const out = A.formFromConversation(s, newProtocolForm(NOW));
  assert.deepEqual(JSON.parse(out.form.doseHistory).map((e) => e.dose), [2.5, 5, 7.5]);
  assert.equal(out.form.startDate, '2026-08-10');
  const rows = A.reviewRows(s);
  assert.ok(rows.some((r) => r.key === 'ap_pen_row_before_today'));
});

test('PN-5 single-dose pen: no validity or started questions; closed pens counted', () => {
  let s = start();
  s = A.answerText(s, 'Xyosted', { intent: 'answer', compound: 'Xyosted' });
  for (const id of ['form:pen', 'pen:pick:xyosted', 'pen:dose:75']) s = tap(s, id);
  assert.equal(s.step, 'pen_stock');
  assert.equal(s.messages[s.messages.length - 1].key, 'ap_pen_q_stock_single');
  s = tap(s, 'pen:int:3');
  const out = A.formFromConversation(s, newProtocolForm(NOW));
  assert.equal(JSON.parse(out.form.pen).stock, 3);
  assert.equal(out.form.penVial, undefined, 'no vial for a single-dose pen');
});

test('PN-27 every pen text of the assistant exists in the 6 languages', () => {
  const fs = require('fs');
  const path = require('path');
  const { translations } = require('../i18n/translations');
  const src = fs.readFileSync(path.join(__dirname, '../lib/penAssistant.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '../lib/protocolAssistant.js'), 'utf8');
  const keys = new Set([...src.matchAll(/'(ap_(?:pen_[a-z0-9_]+|opt_pen|row_pen|q_form(?:_named)?_pen))'/g)].map((m) => m[1]));
  for (const id of ['ozempic_low', 'ozempic_1', 'ozempic_2', 'ozempic_8', 'wegovy_single', 'wegovy_flextouch']) keys.add(`ap_pen_device_${id}`);
  keys.add('ap_q_form_pen'); keys.add('ap_q_form_named_pen');
  assert.ok(keys.size > 40);
  for (const lang of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of keys) assert.ok(typeof translations[lang][k] === 'string' && translations[lang][k].length > 0, `${lang} ${k}`);
});

test('PN-11/12 saving a pen protocol: the pen data, no syringe or ml, the pen in use, the dose steps', () => {
  const F = require('../lib/protocolForm');
  const f = { ...F.newProtocolForm(NOW), name: 'Mounjaro', compoundId: 'rtu_tirzepatide', type: 'pen', dose: '7,5', doseUnit: 'mg', intervalDays: 7, dosesPerDay: 1, startDate: '2026-08-10', reminderTimes: ['08:00'],
    pen: JSON.stringify({ kind: 'fixed', perPen: 4, stock: 1 }), vialValidDays: 30, penVial: { total_doses: 4, doses_taken: 2, mixed_on: '2026-10-26', water_ml: null, expires_on: null },
    doseHistory: JSON.stringify([{ from: null, dose: 2.5, unit: 'mg' }, { from: '2026-09-07T00:00:00', dose: 5, unit: 'mg' }, { from: '2026-10-05T00:00:00', dose: 7.5, unit: 'mg' }]) };
  const p = F.protocolPayload(f, () => 'Weekly', 'pt');
  assert.equal(p.type, 'pen');
  assert.equal(p.pen, f.pen);
  assert.equal(p.dose, 7.5);
  assert.equal(p.vial_valid_days, 30);
  assert.equal(p.syringe_size, null);
  assert.equal(p.concentration, null);
  assert.equal(p.amount, null);
  assert.deepEqual(F.penVialFields(f), { total_doses: 4, doses_taken: 2, mixed_on: '2026-10-26', water_ml: null, expires_on: null });
  assert.equal(F.penVialFields({ ...f, pen: JSON.stringify({ kind: 'single', stock: 3 }), penVial: undefined }), null);
  assert.equal(F.penCreateExtras(f).dose_history, f.doseHistory);
  // a ready-to-use form never carries the pen
  assert.equal(F.protocolPayload({ ...f, type: 'rtu' }, () => 'Weekly', 'pt').pen, null);
});
