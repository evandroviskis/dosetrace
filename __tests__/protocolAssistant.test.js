'use strict';
// The AI protocol assistant's conversation (docs/specs/ai-protocol-assistant.md, signed
// 2026-10-02): every AP row the conversation owns, driven through lib/protocolAssistant with
// the user's answers. "raw" is what the AI would return; the conversation validates it again
// (lib/assistantSchema) — it never trusts it. Every sentence is rendered from the app's own
// strings in the language under test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../lib/protocolAssistant');
const { renderText, renderParam } = require('../lib/assistantText');
const { newProtocolForm, protocolPayload } = require('../lib/protocolForm');
const { computeDraw } = require('../lib/doseMath');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'i18n', 'translations.js'), 'utf8').replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };';
const mod = { exports: {} }; new Function('module', 'exports', src)(mod, mod.exports);
const TR = mod.exports.translations;
const NOW = new Date(2026, 9, 3, 10, 0); // Sat 3 Oct 2026, local
const CATALOG = {
  recon: [{ key: 'lyo_nad_plus', label: 'NAD+' }, { key: 'lyo_bpc_157', label: 'BPC-157' }, { key: 'lyo_tirzepatide', label: 'Tirzepatide' },
    { key: 'lyo_semaglutide', label: 'Semaglutide' }, { key: 'lyo_klow', label: 'KLOW' }, { key: 'lyo_hgh', label: 'HGH' }, { key: 'lyo_hcg', label: 'HCG' }],
  rtu: [{ key: 'rtu_testosterone_cypionate', label: 'Testosterone Cypionate' }, { key: 'rtu_testosterone_enanthate', label: 'Testosterone Enanthate' }],
  oral: [{ key: 'oral_creatine', label: 'Creatine' }],
};
const freq = (iv) => (iv === 1 ? 'Daily' : `Every ${iv} days`);

function start(door, form, ctx, lang = 'en') {
  return A.startConversation(door, form || newProtocolForm(NOW), { language: lang, now: NOW, catalog: CATALOG, ...(ctx || {}) });
}
// say(text) reads plain numbers on the phone; say(text, raw) uses what the AI returned.
function chat(s0) {
  let s = s0;
  const api = {
    get s() { return s; },
    say(text, raw) { s = A.answerText(s, text, raw === undefined ? A.localUnderstand(A.textStep(s), text, s.language) : raw); return api; },
    tap(id) { const before = s; s = A.answerOption(s, id); assert.notEqual(s, before, `option ${id} is offered at step ${before.step}`); return api; },
    date(iso) { s = A.answerDate(s, iso); return api; },
    label(v) { s = A.labelRead(s, v); return api; },
    step(name) { assert.equal(s.step, name); return api; },
    texts(lang) { const t = (k) => TR[lang || s.language][k]; return s.messages.map((m) => (m.from === 'user' ? (m.text != null ? m.text : renderText(t, m.key, m.params)) : renderText(t, m.key, m.params))); },
    lastApp(lang) { const t = (k) => TR[lang || s.language][k]; const m = s.messages.filter((x) => x.from === 'app'); return renderText(t, m[m.length - 1].key, m[m.length - 1].params); },
    options(lang) { const t = (k) => TR[lang || s.language][k]; return A.options(s).map((o) => (o.text != null ? o.text : renderText(t, o.key, o.params))); },
    form(base) { return A.formFromConversation(s, base || newProtocolForm(NOW)); },
  };
  return api;
}
const nadBuild = (lang = 'en') => chat(start('build', null, null, lang))
  .say('nad', { intent: 'answer', compound: 'nad' }).tap('form:powder')
  .say(lang === 'en' ? '1000 mg' : '1.000 mg').say('7 ml').tap('day:0');

// ── AP-5: one thing at a time, in order ────────────────────────────────────
test('AP-5: Build asks compound → form → vial amount → mix (powders) → mixed when → dose and how often → first dose', () => {
  const c = chat(start('build'));
  c.step('compound');
  assert.equal(c.lastApp(), TR.en.ap_q_compound);
  c.say('Tirzepatide', { intent: 'answer', compound: 'Tirzepatide' }).step('form');
  assert.match(c.lastApp(), /Got it: Tirzepatide/);
  c.tap('form:powder').step('amount');
  c.say('20 mg').step('mix');
  c.tap('dil:bacteriostatic_water').step('water');
  assert.equal(c.lastApp(), 'How much bacteriostatic water did you add, in ml?');
  c.say('2').step('mixed');
  c.tap('day:0').step('dose');
  c.say('2.5 mg once a week', { intent: 'answer', dose: { text: '2.5', unit: 'mg' }, basis: 'each', period: 'week', count: 1 }).step('start');
  assert.deepEqual(c.options().slice(0, 2), ['Today', 'Tomorrow'], 'Today is offered first');
  c.tap('start:0').step('confirm');
  // one question per app turn: every app question is followed by a user answer
  const msgs = c.s.messages;
  for (let i = 1; i < msgs.length; i++) if (msgs[i].from === 'app' && msgs[i - 1].from === 'app') assert.ok(['facts', 'summary', 'deflect', 'error'].includes(msgs[i - 1].kind) || msgs[i].key === 'ap_q_right' || msgs[i].kind, `two questions in a row at ${i}`);
});

test('AP-5 / AP-20: ready to use asks strength per ml and vial size; a pill asks what is in one pill', () => {
  chat(start('build')).say('testo', { intent: 'answer', compound: 'testo', form: 'ready' })
    .step('pick_compound').tap('pick:rtu_testosterone_cypionate').step('conc')
    .say('250 mg/ml', { intent: 'answer', conc: { text: '250', unit: 'mg' } }).step('vial_ml')
    .tap('skipml').step('dose');
  chat(start('build')).say('creatine', { intent: 'answer', compound: 'creatine', form: 'pill' }).step('strength')
    .say('5 g', { intent: 'answer', strength: { text: '5', unit: 'g' } }).step('dose');
});

// ── AP-6: the compound is the user's own name ──────────────────────────────
test('AP-6: a name that matches the list (ignoring case) is resolved; partial names offer the listed matches to pick; otherwise kept as typed', () => {
  let c = chat(start('build')).say('nad+', { intent: 'answer', compound: 'nad+', form: 'powder' });
  assert.equal(c.s.draft.compoundId, 'lyo_nad_plus');
  assert.equal(c.s.draft.name, 'NAD+');
  c = chat(start('build')).say('Tirzep', { intent: 'answer', compound: 'Tirzep', form: 'powder' }).step('pick_compound');
  assert.deepEqual(c.options(), ['Tirzepatide', 'Keep "Tirzep"']);
  c.tap('pick:own');
  assert.equal(c.s.draft.compoundId, null);
  assert.equal(c.s.draft.name, 'Tirzep');
  c = chat(start('build')).say('Tirzep', { intent: 'answer', compound: 'Tirzep', form: 'powder' }).tap('pick:lyo_tirzepatide');
  assert.equal(c.s.draft.compoundId, 'lyo_tirzepatide');
  c = chat(start('build')).say('My Lab Blend X', { intent: 'answer', compound: 'My Lab Blend X', form: 'powder' }).step('amount');
  assert.equal(c.s.draft.compoundId, null);
  assert.equal(c.s.draft.name, 'My Lab Blend X');
});

test('AP-6: a compound the user did not write is dropped (never picked by the AI)', () => {
  const c = chat(start('build')).say('the one my coach gave me', { intent: 'answer', compound: 'Semaglutide' });
  assert.equal(c.s.draft.name, '');
  c.step('compound');
  assert.ok(c.texts().includes(TR.en.ap_unclear));
});

test('AP-0: blends and unlisted compounds are kept as typed; the form stays free to type anything', () => {
  const c = chat(start('build')).say('klow', { intent: 'answer', compound: 'klow', form: 'powder' });
  assert.equal(c.s.draft.compoundId, 'lyo_klow', 'a listed blend is matched by name');
  const f = c.say('80 mg').say('4 ml').tap('day:0').say('2 mg', undefined).tap('basis:each')
    .tap('often:d1').tap('start:0').form();
  assert.equal(f.form.compoundId, 'lyo_klow');
  assert.equal(f.form.composition, '', 'a blend composition is never filled in as fact');
});

// ── AP-4 / AP-22: a total is split by the user's own count ─────────────────
test('AP-4: an amount without its spread asks one neutral question: per injection, per day, per week or per month', () => {
  const c = nadBuild().say('240 mg').step('period');
  assert.equal(c.lastApp(), 'Is the 240 mg for one injection, or a total per day, per week or per month?');
  assert.deepEqual(c.options(), ['One injection', 'Per day', 'Per week', 'Per month']);
});

test('AP-22 (3): 240 mg a week in 3 → 80 mg = 56 units, "for your numbers", spacing from what the app can store', () => {
  const c = nadBuild().say('240 mg').tap('per:week').step('count');
  assert.deepEqual(c.options(), ['1 · 240 mg each', '2 · 120 mg each', '3 · 80 mg each', '4 · 60 mg each', '7 · 34.29 mg each', 'Other']);
  c.tap('count:3');
  assert.ok(c.texts().includes('For your numbers: 240 mg a week in 3 doses is 80 mg each = 56.0 units.'));
  c.step('spacing');
  assert.deepEqual(c.options(), ['Every 2 days · 3 or 4 times a week', 'Every 3 days · 2 or 3 times a week', 'Other spacing']);
  c.tap('int:2').tap('start:0').step('confirm');
  const f = c.form().form;
  assert.equal(f.dose, '80');
  assert.equal(f.intervalDays, 2);
  // honest restatement (journey review B3): the saved spacing, never "3 times a week"
  assert.ok(c.texts().includes("Here's what I'll set up: 80 mg, every 2 days, first dose today."));
  assert.ok(c.texts().includes('80 mg every 2 days = 1120 mg every 4 weeks.'));
});

test('AP-22 (3): 240 mg a month in 4 → 60 mg = 42 units, every 7 days offered first', () => {
  const c = nadBuild().say('240 mg').tap('per:month').tap('count:4');
  assert.ok(c.texts().includes('For your numbers: 240 mg a month in 4 doses is 60 mg each = 42.0 units.'));
  assert.deepEqual(c.options(), ['Every 7 days · 4 or 5 times in 30 days', 'Every 8 days · 3 or 4 times in 30 days', 'Other spacing']);
  c.tap('int:7').tap('start:0');
  assert.equal(c.form().form.intervalDays, 7);
});

test('AP-22 / AP-4: a total typed in one sentence ("240 mg a week in 4") is split without asking again', () => {
  const c = nadBuild().say('240 mg a week in 4', { intent: 'answer', dose: { text: '240', unit: 'mg' }, basis: 'total', period: 'week', count: 4 });
  assert.equal(c.s.draft.dose, '60');
  c.step('spacing');
});

test('AP-4: a per-day total sets doses a day (up to the 3 the form can remind)', () => {
  const c = nadBuild().say('50 mg a day', { intent: 'answer', dose: { text: '50', unit: 'mg' }, basis: 'total', period: 'day' }).step('count');
  assert.deepEqual(c.options(), ['1 · 50 mg each', '2 · 25 mg each', '3 · 16.67 mg each']);
  c.tap('count:2').step('start');
  assert.equal(c.s.draft.dosesPerDay, 2);
  assert.equal(c.s.draft.intervalDays, 1);
  const f = c.tap('start:0').form().form;
  assert.equal(f.dosesPerDay, 2);
  assert.equal(f.reminderTimes.length, 2);
});

test('AP-26: "Other" counts and spacings are typed and read on the phone', () => {
  const c = nadBuild().say('240 mg').tap('per:month').tap('count:other');
  assert.equal(c.lastApp(), TR.en.ap_q_count_other);
  c.say('6').step('spacing');
  assert.equal(c.s.draft.dose, '40');
  c.tap('spacing:other').say('5').step('start');
  assert.equal(c.s.draft.intervalDays, 5);
});

// ── AP-11 / AP-22 (4): the doesn't-fit facts ──────────────────────────────
test('AP-11 / AP-22: a powder that really is one injection gets the facts only — no water amount, no judgement', () => {
  const c = nadBuild().say('240 mg').tap('basis:each').step('fit_facts');
  const all = c.texts();
  assert.ok(all.includes("Here is why it doesn't fit: your vial has 1000 mg in 7 ml, so every 1 ml has 142.9 mg. 240 mg needs 1.68 ml, and your syringe holds 1 ml."));
  assert.ok(all.includes('240 mg is 1.68 ml of liquid. Your syringe holds 1 ml, so it cannot be drawn in one go. It needs a syringe that holds at least 1.68 ml.'));
  assert.ok(all.includes(TR.en.ap_fit_fact_powder));
  assert.ok(all.includes(TR.en.ap_fit_fact_who));
  // a powder is never offered a larger (ml) syringe (AP-21); it can change its numbers or continue by hand
  assert.deepEqual(c.options(), ['Enter different numbers', 'Continue in the form']);
  for (const line of all) assert.doesNotMatch(line, /\b\d+(\.\d+)?\s*ml of water|add \d|use \d/i, 'no water amount is ever given');
  c.tap('handback');
  assert.deepEqual(c.s.outcome, { kind: 'handback' });
});

test('AP-21 / AP-22: ready to use that really is one injection can pick a 2 / 3 / 5 ml syringe that holds it', () => {
  const c = chat(start('build')).say('test cyp', { intent: 'answer', compound: 'test cyp', form: 'ready' })
    .say('250 mg/ml, 10 ml', { intent: 'answer', conc: { text: '250', unit: 'mg' }, vial_ml: { text: '10' } })
    .say('420 mg once a week', { intent: 'answer', dose: { text: '420', unit: 'mg' }, basis: 'each', period: 'week', count: 1 })
    .step('fit_period');
  assert.match(c.texts().join('\n'), /every 1 ml of your vial has 250 mg\. 420 mg needs 1\.68 ml, and your syringe holds 1 ml/);
  c.tap('basis:each').step('fit_facts');
  assert.ok(c.texts().includes(TR.en.ap_fit_fact_ready));
  assert.deepEqual(c.options(), ['I use a 2 ml syringe', 'I use a 3 ml syringe', 'I use a 5 ml syringe', 'Enter different numbers', 'Continue in the form']);
  c.tap('syr:200').step('start').tap('start:0');
  assert.ok(c.texts().includes('Each dose: draw to 1.68 ml.'), 'an ml syringe reads in ml');
  assert.equal(c.form().form.syringeSize, 200);
  assert.equal(c.form().form.vialMl, '10');
});

test('AP-22: on the fit door the 240 mg is asked about first; "per week" + 4 splits the user\'s number', () => {
  const f = newProtocolForm(NOW);
  Object.assign(f, { name: 'NAD+', compoundId: 'lyo_nad_plus', type: 'recon', amount: '1000', water: '7', dose: '240' });
  const c = chat(start('fit', f, { visitedStep: 3, touched: ['water'] })).step('fit_period');
  assert.equal(c.s.messages[0].key, 'ap_fit_explain_powder', 'AP-11: the why comes first, with the user numbers');
  c.tap('per:week').tap('count:4');
  assert.equal(c.s.draft.dose, '60');
});

// ── AP-8 / AP-9 / AP-26 / AP-17 ────────────────────────────────────────────
test('AP-8: the plan is restated in the user\'s numbers before anything is filled (spec example)', () => {
  const c = chat(start('build')).say('Tirzepatide', { intent: 'answer', compound: 'Tirzepatide', form: 'powder' })
    .say('20 mg').tap('dil:bacteriostatic_water').say('2').tap('day:0')
    .say('2.5 mg once a week', { intent: 'answer', dose: { text: '2.5', unit: 'mg' }, basis: 'each', period: 'week', count: 1 })
    .tap('start:0').step('confirm');
  const all = c.texts();
  assert.ok(all.includes('2.5 mg once a week = 10 mg every 4 weeks.'));
  assert.ok(all.includes('This 20 mg vial lasts 8 doses, about 56 days.'));
  assert.ok(all.includes('Each dose: draw to 25.0 units (0.25 ml).'));
  assert.equal(c.lastApp(), 'Is that right?');
  assert.equal(c.s.outcome, null, 'nothing is filled or saved before a tap');
});

test('AP-9: the review card lists every field, the draw (units and ml) and how long the vial lasts; Change / Fill the form / Save', () => {
  const c = nadBuild().say('240 mg').tap('per:week').tap('count:3').tap('int:2').tap('start:0').tap('review').step('review');
  const rows = A.reviewRows(c.s).map((r) => [TR.en[r.key], typeof r.value === 'string' ? r.value : renderParam((k) => TR.en[k], r.value)]);
  assert.deepEqual(rows, [
    ['Compound', 'NAD+'], ['Form', 'Powder I mix'], ['In the vial', '1000 mg'], ['Mixed with', '7 ml'], ['Mixed on', 'Oct 3'],
    ['Each dose', '80 mg'], ['How often', 'every 2 days'], ['First dose', 'today'], ['Syringe', '1 ml · 100 u'],
    ['Draw to', '56.0 u · 0.56 ml'], ['Vial lasts', '12 doses · about 24 days'],
  ]);
  assert.deepEqual(c.options(), ['Change something', 'Fill the form', 'Save protocol']);
  c.tap('fill');
  assert.deepEqual(c.s.outcome, { kind: 'fill' });
});

test('AP-26: one Done creates the protocol (outcome save); the review is one tap away', () => {
  const c = nadBuild().say('240 mg').tap('per:week').tap('count:3').tap('int:2').tap('start:0');
  assert.deepEqual(c.options(), ['Done', 'See all details', 'Change something']);
  c.tap('done');
  assert.deepEqual(c.s.outcome, { kind: 'save' });
  assert.equal(c.s.ended, true);
});

test('AP-17: what the assistant fills is exactly what the manual form saves for the same answers', () => {
  const c = nadBuild().say('240 mg').tap('per:week').tap('count:3').tap('int:2').tap('start:0');
  const base = newProtocolForm(NOW);
  const assisted = c.form(base).form;
  const manual = { ...newProtocolForm(NOW), name: 'NAD+', compoundId: 'lyo_nad_plus', type: 'recon', amount: '1000', unit: 'mg',
    water: '7', dose: '80', doseUnit: 'mg', intervalDays: 2, customIntervalOpen: true, customIntervalText: '2', dosesPerDay: 1, startDate: '2026-10-03' };
  assert.deepEqual(protocolPayload(assisted, freq, 'en'), protocolPayload(manual, freq, 'en'));
  assert.equal(c.form(base).mixedOn, '2026-10-03');
});

test('AP-26 / editing: inside Edit the assistant ends in Fill the form (never a second protocol)', () => {
  const f = newProtocolForm(NOW);
  Object.assign(f, { name: 'NAD+', compoundId: 'lyo_nad_plus', type: 'recon', amount: '1000', water: '7', dose: '240' });
  const c = chat(start('fit', f, { visitedStep: 4, editing: true, touched: ['water', 'schedule', 'start'] }))
    .tap('per:week').tap('count:3').tap('int:2');
  c.step('confirm');
  assert.deepEqual(c.options(), ['Fill the form', 'See all details', 'Change something']);
  c.tap('review');
  assert.ok(!c.options().includes('Save protocol'));
});

// ── AP-10: Finish with AI never changes what the user filled ───────────────
test('AP-10: Finish reads the form, says it back, asks only what is missing, and keeps every filled field', () => {
  const f = newProtocolForm(NOW);
  Object.assign(f, { name: 'Tirzepatide', compoundId: 'lyo_tirzepatide', type: 'recon', amount: '20', water: '2', diluentChoice: 'bacteriostatic_water', color: '#123456' });
  const c = chat(start('finish', f, { visitedStep: 3, touched: ['water'] })).step('confirm_filled');
  assert.equal(c.lastApp(), 'Here is what you filled in so far: Tirzepatide, 20 mg in the vial, mixed with 2 ml. Is that right?');
  c.tap('yes').step('mixed').date('2026-10-01').step('dose')
    .say('2.5 mg once a week', { intent: 'answer', dose: { text: '2.5', unit: 'mg' }, basis: 'each', period: 'week', count: 1 })
    .tap('start:0');
  const out = c.form(f).form;
  for (const k of ['name', 'compoundId', 'type', 'amount', 'water', 'diluentChoice', 'color']) assert.equal(out[k], f[k], k);
  assert.equal(out.dose, '2.5');
  assert.equal(c.form(f).mixedOn, '2026-10-01');
});

test('AP-10 / journey A1: the form\'s untouched defaults (water 2 ml, Today, every day) are NOT treated as the user\'s answers', () => {
  const f = newProtocolForm(NOW);
  Object.assign(f, { name: 'BPC-157', compoundId: 'lyo_bpc_157', type: 'recon', amount: '10' });
  const c = chat(start('dose', f, { visitedStep: 3, touched: [] }));
  assert.equal(c.s.filled.water, false, 'water "2" was pre-filled, never typed');
  assert.equal(c.s.filled.schedule, false);
  assert.equal(c.s.filled.start, false);
  c.tap('yes').step('mix');
});

test('AP-10: a filled field changes only when the user says so (Change something)', () => {
  const f = newProtocolForm(NOW);
  Object.assign(f, { name: 'Tirzepatide', compoundId: 'lyo_tirzepatide', type: 'recon', amount: '20', water: '2' });
  const c = chat(start('finish', f, { visitedStep: 3, touched: ['water'] })).tap('change').step('change');
  c.tap('redo:amount').step('amount').say('30 mg');
  assert.equal(c.form(f).form.amount, '30');
});

// ── AP-3: never advice ─────────────────────────────────────────────────────
test('AP-3: an advice-shaped request gets the fixed deflection, then the same question again', () => {
  for (const step of ['compound', 'dose']) {
    let c = chat(start('build'));
    if (step === 'dose') c = nadBuild();
    c.say('how much should I take?', { intent: 'advice' });
    const all = c.texts();
    assert.ok(all.includes(TR.en.ap_deflect));
    c.step(step);
    assert.equal(c.s.draft.dose, null);
  }
  const m = nadBuild().say('how much water?', { intent: 'advice' });
  assert.equal(m.s.messages[m.s.messages.length - 2].kind, 'deflect');
});

test('AP-3: not mixed yet → no water amount, hand back to the form with every answer kept (journey B5)', () => {
  const c = chat(start('build')).say('nad', { intent: 'answer', compound: 'nad', form: 'powder' }).say('1000 mg').tap('notmixed').step('not_mixed');
  assert.equal(c.lastApp(), TR.en.ap_not_mixed);
  assert.deepEqual(c.options(), ['I know it now', 'Continue in the form']);
  c.tap('handback');
  const r = c.form();
  assert.equal(r.form.amount, '1000');
  assert.equal(r.form.water, '2', 'the form keeps its own field as it was; the assistant never writes a water amount');
  assert.equal(r.notMixed, true);
});

test('A3: a dose unit the vial can\'t convert is stated as a fact; the app never converts IU to mg itself', () => {
  const c = chat(start('build')).say('BPC-157', { intent: 'answer', compound: 'BPC-157', form: 'powder' }).say('5 mg').say('2').tap('day:0')
    .say('10 IU every day', { intent: 'answer', dose: { text: '10', unit: 'IU' }, basis: 'each', period: 'day', count: 1 }).step('unit_mismatch');
  assert.equal(c.lastApp(), "Your vial is in mg and the dose is in IU. The app can't convert between them, so the dose needs the same unit as the vial.");
  c.tap('redo:dose').step('dose');
});

test('manual / unclear: "I\'ll do it myself" hands back; an unreadable answer asks again', () => {
  let c = chat(start('build')).say('blah', { intent: 'unclear' }).step('compound');
  assert.ok(c.texts().includes(TR.en.ap_unclear));
  c = c.say('I will fill it in myself', { intent: 'manual' });
  assert.deepEqual(c.s.outcome, { kind: 'handback' });
});

// ── AP-7: the label photo ──────────────────────────────────────────────────
test('AP-7: the label is read back and used only after Yes', () => {
  const c = chat(start('build')).label({ compound_name: 'BPC-157', form: 'powder', amount: 10, amount_unit: 'mg' }).step('label_confirm');
  assert.equal(c.lastApp(), 'I read BPC-157 · 10 mg on the label. Is that right?');
  assert.equal(c.s.draft.name, '', 'nothing used before the user confirms');
  c.tap('label:yes');
  assert.equal(c.s.draft.compoundId, 'lyo_bpc_157');
  assert.equal(c.s.draft.amount, '10');
  c.step('mix');
  const no = chat(start('build')).label({ compound_name: 'BPC-157', form: 'powder', amount: 10, amount_unit: 'mg' }).tap('label:no');
  assert.equal(no.s.draft.name, '');
  no.step('compound');
  const none = chat(start('build')).label({});
  assert.ok(none.texts().includes(TR.en.ap_label_none));
});

test('AP-7: a per-vial strength ("mg/5mL") is never read as a per-ml strength', () => {
  const c = chat(start('build')).say('test', { intent: 'answer', compound: 'test cypionate', form: 'ready' });
  const r = A.labelRead(c.s, { compound_name: 'Test C', form: 'solution', concentration: 1000, concentration_unit: 'mg/5mL' });
  assert.ok(!r.pendingLabel || r.pendingLabel.conc == null);
});

// ── dates (journey B1 / B2) ────────────────────────────────────────────────
test('AP-20: a vial mixed days ago and a protocol started weeks ago end in the right dates', () => {
  const c = nadBuild().s;
  let x = chat(start('build')).say('nad', { intent: 'answer', compound: 'nad', form: 'powder' }).say('1000 mg').say('7')
    .say('4 days ago', { intent: 'answer', day_offset: -4 });
  assert.equal(x.s.draft.mixedOn, '2026-09-29');
  x = x.say('240 mg a week in 4', { intent: 'answer', dose: { text: '240', unit: 'mg' }, basis: 'total', period: 'week', count: 4 })
    .tap('int:2').step('start');
  x.date('2026-09-05').step('confirm');
  assert.equal(x.form().form.startDate, '2026-09-05');
  assert.equal(c.draft.mixedOn, '2026-10-03');
});

test('a mixing date in the future is refused; the question is asked again', () => {
  const c = chat(start('build')).say('nad', { intent: 'answer', compound: 'nad', form: 'powder' }).say('1000 mg').say('7');
  assert.ok(A.options(c.s).some((o) => o.id === 'pickdate'), 'Pick a date opens the wheel (in the screen)');
  c.date('2026-10-10').step('mixed');
  assert.ok(c.texts().includes(TR.en.ap_mixed_future));
  c.say('tomorrow', { intent: 'answer', day_offset: 1 }).step('mixed');
});

// ── numbers in every language (AP-2) ───────────────────────────────────────
test('AP-2: typed numbers are read in the app language (comma decimals, dot thousands) and shown back the same way', () => {
  const pt = nadBuild('pt').say('2,5 mg').tap('basis:each');
  assert.equal(pt.s.draft.amount, '1000', 'pt "1.000 mg" = 1000');
  assert.equal(pt.s.draft.dose, '2,5');
  assert.equal(A.localUnderstand('water', '7,5 ml', 'pt').water.text, '7,5');
  for (const [lang, typed, value] of [['en', '5,000 IU', 5000], ['en', '2.5 mg', 2.5], ['es', '1.000 mg', 1000], ['de', '2,5 mg', 2.5], ['fr', '0,25 mg', 0.25], ['it', '12.500 IU', 12500], ['en', '0,5 mg', 0.5]]) {
    const r = A.localUnderstand('amount', typed, lang);
    const { validateUnderstanding } = require('../lib/assistantSchema');
    const v = validateUnderstanding('amount', r, typed, lang);
    assert.equal(v.amount.value, value, `${lang} ${typed}`);
  }
  // shown back in the language
  const de = nadBuild('de').say('240 mg').tap('per:week').tap('count:7');
  assert.ok(de.texts().includes('Mit deinen Zahlen: 240 mg pro Woche auf 7 Dosen sind je 34,29 mg = 24,0 Einheiten.'));
});

test('AP-2: every number in the plan comes from the calculator (lib/doseMath), never from the AI', () => {
  const c = nadBuild().say('240 mg').tap('per:week').tap('count:3');
  const d = c.s.draft;
  const draw = computeDraw({ type: 'recon', amount: d.amount, water: d.water, dose: d.dose, doseUnit: d.doseUnit, unit: d.unit, syringeSize: d.syringeSize, language: 'en' });
  assert.equal(draw.drawUnits, '56.0');
  // the AI's own numbers are ignored when they are not in the user's text
  const evil = nadBuild().say('240 mg', { intent: 'answer', dose: { text: '24', unit: 'mg' }, basis: 'each' });
  assert.equal(evil.s.draft.dose, null);
  evil.step('dose');
});

// ── AP-23 small draw ───────────────────────────────────────────────────────
test('AP-23: a dose under 10 units gets the neutral small-marks fact in the plan', () => {
  const c = chat(start('build')).say('BPC-157', { intent: 'answer', compound: 'BPC-157', form: 'powder' }).say('10 mg').say('2').tap('day:0')
    .say('250 mcg every day', { intent: 'answer', dose: { text: '250', unit: 'mcg' }, basis: 'each', period: 'day', count: 1 }).tap('start:0');
  assert.ok(c.texts().includes('This dose is 5.0 units — small marks are harder to read accurately.'));
});

// ── the change menu ────────────────────────────────────────────────────────
test('Change something: each part can be asked again and the plan comes back', () => {
  const base = () => nadBuild().say('240 mg').tap('per:week').tap('count:3').tap('int:2').tap('start:0');
  for (const [id, step] of [['redo:compound', 'compound'], ['redo:form', 'form'], ['redo:amount', 'amount'], ['redo:mix', 'mix'], ['redo:mixed', 'mixed'], ['redo:dose', 'dose'], ['redo:often', 'often'], ['redo:start', 'start'], ['redo:syringe', 'syringe']]) {
    base().tap('change').tap(id).step(step);
  }
  const c = base().tap('change').tap('redo:syringe');
  assert.deepEqual(c.options(), ['0.3 ml · 30 u', '0.5 ml · 50 u', '1 ml · 100 u'], 'a powder only lists insulin syringes');
  c.tap('syr:50');
  c.step('fit_facts'); // the user already said 80 mg is one dose: the facts come back for the 50-unit syringe
  assert.equal(c.s.messages.filter((m) => m.key === 'ap_fit_explain_powder').length, 1);
});

test('spacing options are only storable intervals and say how many times that really is', () => {
  assert.deepEqual(A.spacingOptions({ period: 'week', count: 2 }).map((o) => o.interval), [3, 4]);
  assert.deepEqual(A.spacingOptions({ period: 'week', count: 3 }).map((o) => o.interval), [2, 3]);
  assert.deepEqual(A.spacingOptions({ period: 'month', count: 1 }).map((o) => o.interval), [28, 30]);
  assert.deepEqual(A.spacingOptions({ period: 'month', count: 2 }).map((o) => o.interval), [14, 15]);
  const t = (k) => TR.en[k];
  const label = (o) => renderText(t, o.key, o.params);
  assert.deepEqual(A.spacingOptions({ period: 'week', count: 5 }).map(label), ['Every day · 7 times a week', 'Every 2 days · 3 or 4 times a week']);
  assert.deepEqual(A.spacingOptions({ period: 'month', count: 1 }).map(label), ['Every 28 days · 1 or 2 times in 30 days', 'Every 30 days']);
  // a week count that divides 7 needs no question
  const c = nadBuild().say('240 mg').tap('per:week').tap('count:7');
  assert.equal(c.s.draft.intervalDays, 1);
  c.step('start');
});

test('a day count above 3 is refused with a fact (the form reminds up to 3 times a day)', () => {
  const c = nadBuild().say('240 mg').tap('per:day').tap('count:3').step('start');
  assert.equal(c.s.draft.dosesPerDay, 3);
  const d = nadBuild().say('240 mg', { intent: 'answer', dose: { text: '240', unit: 'mg' }, basis: 'total', period: 'day', count: 5 });
  assert.ok(d.texts().includes(TR.en.ap_day_max));
});

test('back to the form: the step of the first thing still missing (AP-0, AP-16)', () => {
  const f = newProtocolForm(NOW);
  assert.equal(A.stepForHandback(f), 1);
  assert.equal(A.stepForHandback({ ...f, name: 'X' }), 3);
  assert.equal(A.stepForHandback({ ...f, name: 'X', amount: '5', dose: '1' }), 4);
  assert.equal(A.stepForHandback({ ...f, name: 'X', type: 'rtu', dose: '100' }), 3);
  assert.equal(A.stepForHandback({ ...f, name: 'X', type: 'oral', dose: '5', servingStrength: '5' }), 4);
});

test('AP-14: every message and option is an app string in all 6 languages (no model text on screen)', () => {
  const drives = [
    () => nadBuild().say('240 mg').tap('per:week').tap('count:3').tap('int:2').tap('start:0').tap('review'),
    () => nadBuild().say('240 mg').tap('basis:each'),
    () => chat(start('build')).say('x?', { intent: 'advice' }),
  ];
  for (const lang of ['en', 'pt', 'es', 'fr', 'de', 'it']) {
    for (const d of drives) {
      const c = d();
      for (const m of c.s.messages) {
        if (m.from === 'user' && m.text != null) continue; // the user's own words
        assert.ok(TR[lang][m.key], `${lang}: ${m.key}`);
        const out = renderText((k) => TR[lang][k], m.key, m.params);
        assert.doesNotMatch(out, /\{[a-z]+\}|undefined|NaN|\[object/, `${lang} ${m.key}: ${out}`);
      }
      for (const o of A.options(c.s)) if (o.key) assert.ok(TR[lang][o.key], `${lang}: ${o.key}`);
    }
  }
});
