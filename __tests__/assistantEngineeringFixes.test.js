'use strict';
// Fixes from the separate-context senior-engineer review of the AI protocol assistant
// (2026-10-03). Each test was red before its fix.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../lib/protocolAssistant');
const C = require('../lib/assistantSchema');
const SV = require('../supabase/functions/protocol-assistant/schema.ts');
const B = require('../supabase/functions/protocol-assistant/budget.ts');
const { newProtocolForm, formFromProtocol, editPatch } = require('../lib/protocolForm');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const SCREEN = read('screens', 'ProtocolsScreen.js');
const ASSIST = read('screens', 'components', 'ProtocolAssistant.js');
const INDEX = read('supabase', 'functions', 'protocol-assistant', 'index.ts');
const NOW = new Date(2026, 9, 3, 10, 0);
const CATALOG = { recon: [{ key: 'lyo_nad_plus', label: 'NAD+' }], rtu: [{ key: 'rtu_testosterone_cypionate', label: 'Testosterone Cypionate' }], oral: [] };
const freq = (iv) => (iv === 1 ? 'Daily' : `Every ${iv} days`);
const tap = (s, id) => { const n = A.answerOption(s, id); assert.notEqual(n, s, `${id} offered at ${s.step}`); return n; };

test('HIGH 1: in Edit, the assistant never asks again for, or rewrites, the stored schedule and start date', () => {
  const row = { name: 'Testosterone Cypionate', compound_id: 'rtu_testosterone_cypionate', type: 'rtu', concentration: 200, concentration_unit: 'mg',
    amount: 2000, unit: 'mg', dose: 250, dose_unit: 'mg', syringe_size: 100, interval_days: 7, doses_per_day: 1, start_date: '2026-08-01', reminder_time: '09:00' };
  const before = formFromProtocol(row, { water_ml: 10 }, NOW, 'en');
  let s = A.startConversation('fit', before, { language: 'en', now: NOW, catalog: CATALOG, editing: true, visitedStep: 3, touched: [] });
  assert.equal(s.filled.schedule, true);
  assert.equal(s.filled.start, true);
  s = tap(s, 'basis:each');
  s = tap(s, 'redo:syringe');
  s = tap(s, 'syr:200');
  assert.equal(s.step, 'confirm', 'nothing else is asked');
  s = tap(s, 'fill');
  const after = A.formFromConversation(s, before).form;
  assert.deepEqual(editPatch(before, after, freq, 'en'), { syringe_size: 200 });
});

test('MED 7: only what the user answered here counts as set by hand afterwards (no blanket touched schedule/start)', () => {
  let s = A.startConversation('build', newProtocolForm(NOW), { language: 'en', now: NOW, catalog: CATALOG });
  s = A.answerText(s, 'nad', { intent: 'answer', compound: 'nad', form: 'powder' });
  const r = A.formFromConversation(s, newProtocolForm(NOW)); // closing here hands this back
  assert.deepEqual(r.set, { name: true, type: true, amount: false, water: false, mixed: false, dose: false, schedule: false, start: false, syringe: false });
  const fin = SCREEN.slice(SCREEN.indexOf('function finishAssistant('), SCREEN.indexOf('// Done (AP-26)'));
  assert.doesNotMatch(fin, /touch\('schedule'\); touch\('start'\);/);
  assert.match(fin, /for \(const k of Object\.keys\(result\.set \|\| \{\}\)\) if \(result\.set\[k\]\) touch\(k\);/);
});

test('MED 3 / LOW 10: a skipped vial stays skipped; "not mixed yet" skips the vial on the way back', () => {
  const f = { ...newProtocolForm(NOW), name: 'NAD+', compoundId: 'lyo_nad_plus', type: 'recon', amount: '1000', water: '7', dose: '20' };
  const s = A.startConversation('finish', f, { language: 'en', now: NOW, catalog: CATALOG, visitedStep: 5, touched: ['water', 'schedule', 'start'], skipVial: true, mixedOn: null });
  const s2 = tap(s, 'yes');
  assert.notEqual(s2.step, 'mixed', 'the mixing date is not asked for a vial the user skipped');
  assert.equal(A.formFromConversation(s2, f).mixedOn, null);
  assert.match(SCREEN, /mixedOn: skipVial \? null : formMixedOn\(\), skipVial,/);
  const fin = SCREEN.slice(SCREEN.indexOf('function finishAssistant('), SCREEN.indexOf('// Done (AP-26)'));
  assert.match(fin, /if \(result\.notMixed\) setSkipVial\(true\);/);
});

test('MED 4: a turn is written first and then counted, so parallel calls cannot pass the caps', () => {
  const ins = INDEX.indexOf(".insert({ user_id: user.id, conversation_id: conversationId, kind: 'turn' })");
  const cnt = INDEX.indexOf(".eq('conversation_id', conversationId).eq('kind', 'turn')");
  assert.ok(ins > 0 && cnt > ins, 'insert before the count');
  assert.match(INDEX, /turns: turnsRes\.error \? undefined : Math\.max\(0, \(turnsRes\.count \?\? 1\) - 1\)/);
  assert.match(INDEX, /if \(!verdict\.ok\) \{\s*if \(turnId != null\) await admin\.from\('ai_assistant_usage'\)\.delete\(\)\.eq\('id', turnId\)/);
});

test('MED 5: a missing usage table (function deployed before the migration) fails CLOSED, never limit-free', () => {
  assert.equal(B.isMissingTable({ code: '42P01' }), true);
  assert.equal(B.isMissingTable({ code: 'PGRST205', message: "Could not find the table 'public.ai_assistant_usage'" }), true);
  assert.equal(B.isMissingTable({ code: '08006' }), false);
  assert.equal(B.isMissingTable(null), false);
  assert.ok((INDEX.match(/isMissingTable\(/g) || []).length >= 2, 'start and understand both check');
  assert.match(INDEX, /code: 'not_configured'/);
});

test('MED 6: system back / swipe-down while the assistant is open goes back to the form with the answers', () => {
  const at = SCREEN.indexOf('onRequestClose={() => {');
  const handler = SCREEN.slice(at, at + 700);
  assert.match(handler, /if \(assistant\) \{ if \(assistantCloseRef\.current\) assistantCloseRef\.current\(\); return; \}/);
  assert.match(SCREEN, /registerClose=\{\(fn\) => \{ assistantCloseRef\.current = fn; \}\}/);
  assert.match(ASSIST, /useEffect\(\(\) => \{ if \(registerClose\) registerClose\(close\);/);
});

test('LOW 8: ".5 mg" never becomes 5 mg (a dot or comma right before the number belongs to it)', () => {
  for (const v of [(s, r, t) => C.validateUnderstanding(s, r, t, 'en'), (s, r, t) => SV.validateUnderstanding(s, r, t)]) {
    assert.equal(v('dose', { intent: 'answer', dose: { text: '5', unit: 'mg' } }, '.5 mg weekly').dose, null);
    assert.equal(v('dose', { intent: 'answer', dose: { text: '5', unit: 'mg' } }, ',5 mg').dose, null);
    assert.notEqual(v('dose', { intent: 'answer', dose: { text: '5', unit: 'mg' } }, 'take 5 mg.').dose, null, 'a full stop after is fine');
  }
});

test('LOW 9: the compound shown and saved is cut from the user\'s own text, never the model\'s string', () => {
  for (const name of [(v, t) => C.compoundName(v, t), (v, t) => SV.compoundName(v, t)]) {
    assert.equal(name('BPC-157 (Таке Моге)', 'my bpc157 vial'), 'bpc157');
    assert.equal(name('BPC-157 💉✅ 安全', 'BPC 157 please'), 'BPC 157');
    assert.equal(name('Tirzepatide', 'it is tirzepatide.'), 'tirzepatide');
    assert.equal(name('NAD+', 'NAD+ 1000'), 'NAD+', 'the user text span, with a trailing +');
  }
});

test('LOW 11: a mixing date more than a year back is refused (the form keeps month and day only)', () => {
  let s = A.startConversation('build', newProtocolForm(NOW), { language: 'en', now: NOW, catalog: CATALOG });
  s = A.answerText(s, 'nad', { intent: 'answer', compound: 'nad', form: 'powder' });
  s = A.answerText(s, '1000 mg', A.localUnderstand('amount', '1000 mg', 'en'));
  s = A.answerText(s, '7', A.localUnderstand('mix', '7', 'en'));
  const old = A.answerText(s, 'two years ago', { intent: 'answer', day_offset: -730 });
  assert.equal(old.step, 'mixed');
  assert.equal(old.draft.mixedOn, null);
  const picked = A.answerDate(s, '2025-09-01');
  assert.equal(picked.draft.mixedOn, null);
});

test('LOW 12: typing the word "null" shows the word, not a broken bubble', () => {
  let s = A.startConversation('build', newProtocolForm(NOW), { language: 'en', now: NOW, catalog: CATALOG });
  s = A.answerText(s, 'null', { intent: 'unclear' });
  const mine = s.messages.find((m) => m.from === 'user');
  assert.equal(mine.text, 'null');
  const label = A.labelRead(s, { compound_name: 'BPC-157', amount: 5, amount_unit: 'mg', form: 'powder' }).messages.find((m) => m.from === 'user' && m.key === 'ap_label_photo');
  assert.equal(label.text, null);
  assert.match(ASSIST, /m\.text != null \? m\.text : tr\(m\.key, m\.params\)/);
});
