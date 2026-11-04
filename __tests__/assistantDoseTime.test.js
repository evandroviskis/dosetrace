'use strict';
// The protocol assistant reads the reminder time from what the person writes and asks when it
// is missing (founder 2026-11-04, docs/decisions.md: "eu escrevi que vou tomar 1 mg por dia pela
// manhã… a IA montou o protocolo com o horário que eu estava escrevendo… Se a pessoa não
// escrever, a IA tem que perguntar"). Spec rows AP-36..AP-41 (docs/specs/ai-protocol-assistant.md).
//
// Root cause these tests reproduce: the conversation had no time step and no time field (model
// schema, local reader, draft); formFromConversation copied the form's first time, which is the
// clock time when the form opened, and padded a 2nd / 3rd dose with times the app picked.
// NOW below is 10:00 so the old behaviour shows as "10:00".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../lib/protocolAssistant');
const T = require('../lib/assistantTime');
const { renderText } = require('../lib/assistantText');
const { newProtocolForm, protocolPayload } = require('../lib/protocolForm');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const src = read('i18n', 'translations.js').replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };';
const mod = { exports: {} }; new Function('module', 'exports', src)(mod, mod.exports);
const TR = mod.exports.translations;
const NOW = new Date(2026, 9, 3, 10, 0); // the clock when the conversation happens
const CATALOG = { recon: [{ key: 'lyo_nad_plus', label: 'NAD+' }], rtu: [], oral: [] };
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

function chat(s0) {
  let s = s0;
  const api = {
    get s() { return s; },
    say(text, raw) { s = A.answerText(s, text, raw === undefined ? A.localUnderstand(A.textStep(s), text, s.language) : raw); return api; },
    tap(id) { const before = s; s = A.answerOption(s, id); assert.notEqual(s, before, `option ${id} is offered at step ${before.step}`); return api; },
    step(name) { assert.equal(s.step, name); return api; },
    lastApp() { const t = (k) => TR[s.language][k]; const m = s.messages.filter((x) => x.from === 'app'); return renderText(t, m[m.length - 1].key, m[m.length - 1].params); },
    texts() { const t = (k) => TR[s.language][k]; return s.messages.filter((m) => m.from === 'app').map((m) => renderText(t, m.key, m.params)); },
    options() { const t = (k) => TR[s.language][k]; return A.options(s).map((o) => (o.text != null ? o.text : renderText(t, o.key, o.params))); },
    form(base) { return A.formFromConversation(s, base || newProtocolForm(NOW)).form; },
  };
  return api;
}
const start = (lang, door = 'build', form, ctx) => A.startConversation(door, form || newProtocolForm(NOW), { language: lang, now: NOW, catalog: CATALOG, ...(ctx || {}) });
// NAD+ 1000 mg in 7 ml, mixed today: the next question is the dose.
const toDose = (lang = 'pt') => chat(start(lang)).say('nad', { intent: 'answer', compound: 'nad' }).tap('form:powder')
  .say(lang === 'en' ? '1000 mg' : '1.000 mg').say('7 ml').tap('day:0').step('dose');
const daily = (text) => ({ intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each', period: 'day', count: 1 });

// ── AP-36: the founder's sentence ─────────────────────────────────────────
test('AP-36: pt "1 mg por dia pela manhã" asks the time inside the morning, never the clock time', () => {
  const c = toDose().say('1 mg por dia pela manhã', daily()).step('start').tap('start:0').step('time');
  assert.equal(c.lastApp(), 'A que horas da manhã?');
  assert.notEqual(c.form().reminderTimes[0], '10:00', 'the clock when the conversation happens is never the reminder');
  c.say('9').step('confirm');
  assert.deepEqual(c.form().reminderTimes, ['09:00']);
  assert.ok(c.texts().includes('Lembrete: 9:00.'), 'the time is restated before the save');
});

test('AP-36: pt "todos os dias às 9 da manhã" is read as 09:00 and read back before it is used', () => {
  const c = toDose().say('1 mg todos os dias às 9 da manhã', daily()).tap('start:0').step('time');
  assert.equal(c.lastApp(), 'Lembrete: 9:00. Está certo?');
  assert.deepEqual(c.options(), ['Sim', 'Outro horário']);
  assert.deepEqual(c.form().reminderTimes, [''], 'never saved silently: closing here hands over no time');
  c.tap('heard:yes').step('confirm');
  assert.deepEqual(c.form().reminderTimes, ['09:00']);
  const p = protocolPayload(c.form(), () => 'Daily', 'pt');
  assert.equal(p.reminder_time, '09:00');
});

test('AP-37: no time written → the app asks it (pt, es, fr, de, it, en), in its own words', () => {
  const expect = {
    pt: 'A que horas você toma? O lembrete será enviado nesse horário.',
    es: '¿A qué hora lo tomas? A esa hora te llegará el recordatorio.',
    fr: 'À quelle heure le prenez-vous ? Le rappel arrivera à cette heure-là.',
    de: 'Um wie viel Uhr nimmst du es? Zu dieser Uhrzeit kommt die Erinnerung.',
    it: "A che ora lo prendi? Il promemoria arriverà a quell'ora.",
    en: 'What time do you take it? The reminder goes off at that time.',
  };
  for (const l of LANGS) {
    const c = toDose(l).say('1 mg', { intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each' }).tap('often:d1').tap('start:0').step('time');
    assert.equal(c.lastApp(), expect[l], l);
    assert.deepEqual(A.options(c.s), [], `${l}: no time is offered as a tap option`);
    assert.deepEqual(c.form().reminderTimes, [''], `${l}: handed back without a time, the form gets none`);
  }
});

// ── AP-38: the formats people write ───────────────────────────────────────
test('AP-38: typed times in the 6 languages', () => {
  const cases = [
    ['pt', '9h', '09:00'], ['pt', '21h30', '21:30'], ['pt', 'às 9', '09:00'], ['pt', '9 da noite', '21:00'], ['pt', '21:00', '21:00'],
    ['pt', '9 e meia', '09:30'], ['pt', 'meio-dia', '12:00'],
    ['en', '9am', '09:00'], ['en', '9 pm', '21:00'], ['en', '9:30 pm', '21:30'], ['en', '21:00', '21:00'], ['en', '9 in the morning', '09:00'],
    ['es', 'a las 9 de la mañana', '09:00'], ['es', '21:30', '21:30'], ['es', 'a las 9 de la noche', '21:00'],
    ['fr', 'à 9 h', '09:00'], ['fr', '21 h 30', '21:30'], ['fr', '9 heures du soir', '21:00'],
    ['de', 'um 9 Uhr', '09:00'], ['de', '21 Uhr', '21:00'], ['de', '9.30 Uhr', '09:30'], ['de', '9 Uhr abends', '21:00'],
    ['it', 'alle 9', '09:00'], ['it', 'alle 21', '21:00'], ['it', 'alle 9 di sera', '21:00'],
  ];
  for (const [l, typed, want] of cases) {
    const c = toDose(l).say('1 mg', { intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each' }).tap('often:d1').tap('start:0').step('time');
    c.say(typed).step('confirm');
    assert.deepEqual(c.form().reminderTimes, [want], `${l} "${typed}"`);
  }
});

test('AP-38: a time written with the dose or the frequency, in es / fr / de / it / en', () => {
  const cases = [
    ['es', '1 mg todos los días a las 9 de la mañana', '09:00'],
    ['fr', '1 mg tous les jours à 9 h', '09:00'],
    ['de', '1 mg jeden Tag um 21 Uhr', '21:00'],
    ['it', '1 mg ogni giorno alle 21', '21:00'],
    ['en', '1 mg every day at 9 pm', '21:00'],
  ];
  for (const [l, typed, want] of cases) {
    const c = toDose(l).say(typed, daily()).tap('start:0').step('time');
    c.tap('heard:yes').step('confirm');
    assert.deepEqual(c.form().reminderTimes, [want], `${l} "${typed}"`);
  }
});

test('AP-38: a part of the day alone is not a time (es, fr, de, it, en): the app asks the hour inside it', () => {
  const cases = [
    ['es', '1 mg al día por la mañana', '¿A qué hora de la mañana?'],
    ['fr', '1 mg par jour le soir', 'À quelle heure le soir ?'],
    ['de', '1 mg täglich morgens', 'Um wie viel Uhr morgens?'],
    ['it', '1 mg al giorno di sera', 'A che ora di sera?'],
    ['en', '1 mg a day in the morning', 'What time in the morning?'],
  ];
  for (const [l, typed, q] of cases) {
    const c = toDose(l).say(typed, daily()).tap('start:0').step('time');
    assert.equal(c.lastApp(), q, l);
  }
  // The hour then lands inside that part: "9" in the evening is 21:00.
  const fr = toDose('fr').say('1 mg par jour le soir', daily()).tap('start:0').say('9').step('confirm');
  assert.deepEqual(fr.form().reminderTimes, ['21:00']);
});

test('AP-38: English "9" without am or pm is asked with the person\'s own hour both ways', () => {
  const c = toDose('en').say('1 mg every day at 9', daily()).tap('start:0').step('time');
  assert.equal(c.lastApp(), '9 in the morning or in the evening?');
  assert.deepEqual(c.options(), ['9:00 AM', '9:00 PM']);
  c.tap('ampm:pm').step('confirm');
  assert.deepEqual(c.form().reminderTimes, ['21:00']);
  const typed = toDose('en').say('1 mg', { intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each' }).tap('often:d1').tap('start:0').say('8').step('time');
  typed.say('am').step('confirm');
  assert.deepEqual(typed.form().reminderTimes, ['08:00']);
});

test('AP-38: intervals and amounts are never read as a time', () => {
  for (const [l, t] of [['pt', 'a cada 8 horas'], ['pt', 'de 8 em 8 horas'], ['en', 'every 8 hours'], ['fr', 'toutes les 8 heures'], ['de', 'alle 8 Stunden'], ['it', 'ogni 8 ore'],
    ['pt', '1,5 mg'], ['pt', '1.000 mg'], ['en', '2.5 mg twice a week'], ['pt', '2x ao dia'], ['es', 'mañana'], ['de', 'morgen']]) {
    const r = T.readTimes(t, l, {});
    assert.deepEqual(r.times, [], `${l} "${t}"`);
  }
  assert.deepEqual(T.readTimes('mañana', 'es', {}).parts, [], 'es "mañana" alone is tomorrow, not the morning');
});

test('AP-38: an answer the app cannot read as a time asks again in app words; nothing is guessed', () => {
  const c = toDose().say('1 mg', { intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each' }).tap('often:d1').tap('start:0');
  c.say('quando acordar').step('time');
  assert.ok(c.texts().includes('Não entendi o horário. Escreva a hora em números.'));
  c.say('25h').step('time');
  assert.deepEqual(c.form().reminderTimes, ['']);
});

// ── AP-39: two or three doses a day, each its own time ─────────────────────
test('AP-39: 2 doses a day asks each time, and both can come in one answer', () => {
  const c = toDose().say('1 mg', { intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each' }).tap('often:d2').tap('start:0').step('time');
  assert.equal(c.lastApp(), 'Dose 1 de 2: a que horas?');
  c.say('8h').step('time');
  assert.equal(c.lastApp(), 'Dose 2 de 2: a que horas?');
  c.say('20h').step('confirm');
  assert.deepEqual(c.form().reminderTimes, ['08:00', '20:00']);
  assert.ok(c.texts().includes('Lembretes: 8:00 e 20:00.'));
  const both = toDose().say('1 mg duas vezes ao dia às 8h e às 20h', { intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each', period: 'day', count: 2 })
    .tap('start:0').step('time');
  assert.equal(both.lastApp(), 'Lembretes: 8:00 e 20:00. Está certo?');
  both.tap('heard:yes').step('confirm');
  assert.deepEqual(both.form().reminderTimes, ['08:00', '20:00']);
  const bare = toDose().say('1 mg', { intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each' }).tap('often:d2').tap('start:0').say('8h e 20h').step('confirm');
  assert.deepEqual(bare.form().reminderTimes, ['08:00', '20:00']);
});

test('AP-39: "de manhã e à noite" for 2 doses asks the hour inside each part', () => {
  const c = toDose().say('1 mg duas vezes ao dia, de manhã e à noite', { intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each', period: 'day', count: 2 })
    .tap('start:0').step('time');
  assert.equal(c.lastApp(), 'Dose 1 de 2: a que horas da manhã?');
  c.say('7').step('time');
  assert.equal(c.lastApp(), 'Dose 2 de 2: a que horas da noite?');
  c.say('10').step('confirm');
  assert.deepEqual(c.form().reminderTimes, ['07:00', '22:00']);
});

test('AP-39: more times than doses a day is asked again, never trimmed by the app', () => {
  const c = toDose().say('1 mg', { intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each' }).tap('often:d1').tap('start:0').say('8h e 20h').step('time');
  assert.ok(c.texts().includes('Escreva um horário para cada dose (1 por dia).'));
  assert.deepEqual(c.form().reminderTimes, ['']);
});

test('AP-39: no app-picked time for a 2nd or 3rd dose (the old 14:00 / 21:00 padding is gone)', () => {
  const c = toDose().say('1 mg', { intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each' }).tap('often:d2').tap('start:0').say('8h');
  const f = c.form();
  assert.deepEqual(f.reminderTimes, ['08:00', ''], 'the second dose waits for the person');
  assert.ok(!f.reminderTimes.includes('14:00') && !f.reminderTimes.includes('21:00') && !f.reminderTimes.includes('10:00'));
});

// ── AP-40: the review card, Change, Finish and Edit ───────────────────────
test('AP-40: the review card shows the time and "Change something" can change it', () => {
  const c = toDose().say('1 mg todos os dias às 9 da manhã', daily()).tap('start:0').tap('heard:yes').tap('review');
  const rows = c.s.messages[c.s.messages.length - 1].rows;
  assert.ok(rows.some((r) => r.key === 'ap_row_time' && r.value === '9:00'));
  c.tap('change');
  assert.ok(c.options().includes('Horário'));
  c.tap('redo:time').step('time');
  c.say('21h').step('confirm');
  assert.deepEqual(c.form().reminderTimes, ['21:00']);
});

test('AP-40: Finish with AI on a form whose time nobody picked asks it; a time the person picked is kept', () => {
  const form = { ...newProtocolForm(NOW), name: 'NAD+', compoundId: 'lyo_nad_plus', amount: '1000', water: '7', dose: '1' };
  const untouched = chat(A.startConversation('finish', form, { language: 'pt', now: NOW, catalog: CATALOG, visitedStep: 5, mixedOn: '2026-10-03' }));
  untouched.tap('yes');
  assert.equal(untouched.s.step, 'time', 'the 10:00 the form opened with is not the person\'s time');
  const picked = chat(A.startConversation('finish', { ...form, reminderTimes: ['07:30'] }, { language: 'pt', now: NOW, catalog: CATALOG, visitedStep: 5, mixedOn: '2026-10-03', touched: ['time'] }));
  picked.tap('yes').step('confirm');
  assert.deepEqual(picked.form({ ...form, reminderTimes: ['07:30'] }).reminderTimes, ['07:30']);
});

test('AP-40: Edit keeps the saved times; nothing is asked or rewritten', () => {
  const form = { ...newProtocolForm(NOW), name: 'NAD+', compoundId: 'lyo_nad_plus', amount: '1000', water: '7', dose: '1', reminderTimes: ['06:15'] };
  const c = chat(A.startConversation('finish', form, { language: 'pt', now: NOW, catalog: CATALOG, editing: true, visitedStep: 4 }));
  c.tap('yes').step('confirm');
  assert.deepEqual(c.form(form).reminderTimes, ['06:15']);
  const r = A.formFromConversation(c.s, form);
  assert.equal(r.set.time, false);
});

// ── AP-41: hard line and plumbing ─────────────────────────────────────────
test('AP-41: the time question is read on the phone only (never the model) and an advice question is deflected', () => {
  for (const t of ['9h', 'de manhã', 'quando acordar', 'nove horas']) assert.ok(A.localUnderstand('time', t, 'pt'), t);
  const c = toDose().say('1 mg', { intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each' }).tap('often:d1').tap('start:0');
  c.say('que horas devo tomar?').step('time');
  assert.ok(c.texts().includes(TR.pt.ap_deflect));
  assert.deepEqual(c.form().reminderTimes, ['']);
});

test('AP-41: handed back to the form before the time, the form asks it before saving (never the clock)', () => {
  const early = chat(start('pt')).say('nad', { intent: 'answer', compound: 'nad' });
  assert.deepEqual(A.formFromConversation(early.s, newProtocolForm(NOW)).form.reminderTimes, ['']);
  const SCREEN = read('screens', 'ProtocolsScreen.js');
  const save = SCREEN.slice(SCREEN.indexOf('async function saveProtocol('), SCREEN.indexOf('function saveProtocolNote('));
  assert.match(save, /reminderTimes\.some\(\(rt\) => !isClockTime\(rt\)\)/, 'save checks every dose has its time');
  assert.match(save, /protocols_time_missing_title/);
  assert.match(SCREEN, /touch\('time'\)/, 'a time picked by hand is the person\'s own');
  assert.match(SCREEN, /timeFormat, editing: !!editingId \}\}/, 'the assistant shows times in the person\'s format');
  for (const l of LANGS) for (const k of ['protocols_time_missing_title', 'protocols_time_missing_body']) assert.ok(TR[l][k], `${l}.${k}`);
});

test('AP-41: Save with a dose still without its time stops on the time step; nothing is written', async () => {
  const { loadFn } = require('./helpers/extractFn');
  for (const times of [[''], ['09:00', ''], ['30:00'], ['08:60']]) {
    const calls = { steps: [], sheets: [], saving: [], inserted: 0 };
    const fn = loadFn('screens/ProtocolsScreen.js', 'async function saveProtocol(', 'saveProtocol', {
      name: 'NAD+', doseStepBlocked: false, editingId: null, type: 'oral', skipVial: true, reminderTimes: times, t: (k) => k, isClockTime: require('../lib/assistantTime').isClockTime,
      setStep: (n) => calls.steps.push(n), setWizSheet: (x) => calls.sheets.push(x), setSaving: (v) => calls.saving.push(v),
      showMissingName() {}, showCheckValues() {}, insertProtocol: () => { calls.inserted++; return 1; },
    });
    await fn();
    assert.deepEqual(calls.steps, [4], JSON.stringify(times));
    assert.equal(calls.sheets[0].title, 'protocols_time_missing_title');
    assert.equal(calls.sheets[0].body, 'protocols_time_missing_body');
    assert.deepEqual(calls.saving, [], 'the save never started');
    assert.equal(calls.inserted, 0);
  }
});

test('AP-41: the model is told clock times are not counts, intervals or doses', () => {
  const prompt = read('supabase', 'functions', 'protocol-assistant', 'prompt.ts');
  assert.match(prompt, /clock time/i);
  assert.match(prompt, /never put a clock time's numbers in count, interval_days, day_offset or any quantity/);
});

test('AP-41: every new assistant sentence exists in the 6 languages', () => {
  const keys = ['ap_q_time', 'ap_q_time_part', 'ap_q_time_dose', 'ap_q_time_dose_part', 'ap_q_time_ampm', 'ap_daypart_morning', 'ap_daypart_afternoon', 'ap_daypart_evening',
    'ap_daypart_early', 'ap_time_unclear', 'ap_time_too_many', 'ap_times_two', 'ap_times_three', 'ap_fact_time', 'ap_fact_times', 'ap_row_time', 'ap_chg_time', 'ap_part_time'];
  for (const l of LANGS) for (const k of keys) assert.ok(typeof TR[l][k] === 'string' && TR[l][k].length, `${l}.${k}`);
});
