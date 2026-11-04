'use strict';
// Second independent review (of b5729bf, 2026-11-04). Direction: when the text is ambiguous the
// app ASKS; a time is only taken when it is unmistakably a clock time. Each test reproduces one
// finding (the reviewer's probes p3 / j3 / j4 / j5 / conc). Spec rows AP-48..AP-53.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../lib/protocolAssistant');
const T = require('../lib/assistantTime');
const S = require('../lib/assistantSchema');
const SV = require('../supabase/functions/protocol-assistant/schema.ts');
const NP = require('../lib/notificationPlan');
const RH = require('../lib/reminderHealth');
const PLAN = require('../supabase/functions/send-reminders/plan.ts');
const { renderText } = require('../lib/assistantText');
const { newProtocolForm } = require('../lib/protocolForm');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const src = read('i18n', 'translations.js').replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };';
const mod = { exports: {} }; new Function('module', 'exports', src)(mod, mod.exports);
const TR = mod.exports.translations;
const NOW = new Date(2026, 9, 3, 10, 0);
const CATALOG = { recon: [{ key: 'lyo_nad_plus', label: 'NAD+' }], rtu: [], oral: [] };

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
    form(base) { return A.formFromConversation(s, base || newProtocolForm(NOW)).form.reminderTimes; },
  };
  return api;
}
const start = (lang) => A.startConversation('build', newProtocolForm(NOW), { language: lang, now: NOW, catalog: CATALOG });
const toDose = (l = 'pt') => chat(start(l)).say('nad', { intent: 'answer', compound: 'nad' }).tap('form:powder').say(l === 'en' ? '1000 mg' : '1.000 mg').say('7 ml').tap('day:0').step('dose');
const perDay = (n) => ({ intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each', period: 'day', count: n });
const atTime = (l = 'pt', n = 1) => toDose(l).say('1 mg', { intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each' }).tap(`often:d${n}`).tap('start:0').step('time');
const valid = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

// ── N1: never an hour above 23 or a minute above 59 ──────────────────────
test('N1: "8 e 30" with 2 doses never offers 8:00 and 30:00; every saved time is a real clock time', () => {
  for (const [l, t] of [['pt', '8 e 30'], ['pt', '9 e 45'], ['pt', '7 e 50'], ['es', '8 y 30'], ['it', '8 e 40'], ['pt', '11 e 59']]) {
    const r = T.readTimes(t, l, { bare: true });
    for (const j of r.joins) assert.equal(j.two, null, `${l} "${t}": the minute is not an hour`);
  }
  const c = atTime('pt', 2).say('8 e 30').step('time');
  assert.ok(!c.options().some((o) => /30:00|6:00/.test(o)), c.options().join(' | '));
  assert.deepEqual(T.readTimes('8 e 20', 'pt', { bare: true }).joins, [{ one: '08:20', two: ['08:00', '20:00'] }], '20 can be an hour');
  for (const raw of [{ hour: 30, minute: 0 }, { hour: 24, minute: 0 }, { hour: 8, minute: 60 }]) assert.deepEqual(T.resolveTime(raw, 'pt'), { conflict: true });
  for (const r of T.readTimes('25h', 'pt', { bare: true }).times) assert.ok(!r.hhmm);
});

test('N1: defense in depth — the form save guard and the reminder plan reject any HH outside 00–23 or MM outside 00–59', () => {
  const SCREEN = read('screens', 'ProtocolsScreen.js');
  const save = SCREEN.slice(SCREEN.indexOf('async function saveProtocol('), SCREEN.indexOf('function saveProtocolNote('));
  assert.match(save, /isClockTime/, 'the save uses the strict clock check');
  const { isClockTime } = require('../lib/assistantTime');
  for (const t of ['00:00', '09:30', '23:59']) assert.equal(isClockTime(t), true, t);
  for (const t of ['30:00', '24:00', '08:60', '', null, '9']) assert.equal(isClockTime(t), false, String(t));
  assert.equal(isClockTime('8:00'), true, 'an old-format value is read like the scheduler reads it (third review)');
  // The plan keeps the slot index (ids stay the same) but never builds a Date from a bad time.
  assert.deepEqual(NP.reminderTimes('08:00,30:00'), [{ hour: 8, minute: 0 }, { hour: 30, minute: 0, invalid: true }]);
  assert.deepEqual(PLAN.reminderSlots({ reminder_time: '08:00,30:00' }), NP.reminderTimes('08:00,30:00'), 'the server sender reads it the same way');
  const protocol = { id: 'p1', reminder_time: '08:00,30:00', interval_days: 1, doses_per_day: 2, start_date: '2026-10-01' };
  const slots = NP.doseSlots({ protocol, now: new Date(2026, 9, 3, 7, 0), windowDays: 2 });
  assert.ok(slots.length > 0);
  for (const sl of slots) {
    assert.equal(sl.ti, 0, 'only the valid time makes slots');
    assert.equal(new Date(sl.slotMs).getHours(), 8, 'never 06:00 the next day');
  }
  assert.equal(RH.dueInWindow([protocol], new Date(2026, 9, 3, 7, 0), 2), 2, 'the health check counts only real slots');
  const handled = NP.handledSlotIndexes({ reminderTime: '30:00,08:00', logs: [], protocolId: 'p1', dayKey: '2026-10-03' });
  assert.ok(handled instanceof Set);
  const idx = read('supabase', 'functions', 'send-reminders', 'index.ts');
  assert.match(idx, /if \(slots\[si\]\.invalid\) continue;/, 'the server never sends for a bad time');
});

// ── N2: alternatives next to a number ────────────────────────────────────
test('N2: "às 8 ou 9", "um 8 oder 9", "a las 8 u 9", "9 or 10pm" are asked again, naming no time', () => {
  for (const [l, t] of [['pt', 'às 8 ou 9'], ['de', 'um 8 oder 9'], ['es', 'a las 8 u 9'], ['en', '9 or 10pm'], ['fr', 'à 8 h ou bien 9 h'], ['it', 'alle 8 oppure 9'], ['it', 'alle 8 o alle 9'], ['es', '8 o 9']]) {
    const c = atTime(l).say(t).step('time');
    assert.deepEqual(c.form(), [''], `${l} "${t}"`);
    assert.equal(c.lastApp(), TR[l].ap_q_time, `${l} "${t}": asked again, no time named`);
    assert.deepEqual(A.options(c.s), []);
    const d = toDose(l).say(`1 mg, ${t}`, perDay(1)).tap('start:0').step('time');
    assert.equal(d.s.draft.heard, null, `${l} "${t}" in another answer: no read-back`);
    assert.equal(d.lastApp(), TR[l].ap_q_time);
  }
});

// ── N3: a count before a part of the day is not a time ───────────────────
test('N3: in another answer only an explicit clock signal makes a time; a bare count before a part of the day does not', () => {
  for (const [l, t] of [['pt', '1 mg, tomo 2 de manhã'], ['pt', '1 mg, 1 à noite'], ['en', '1 mg, take 2 at night'], ['en', '1 mg, 2 in the morning'], ['pt', '1 mg, 2 cápsulas de manhã'], ['pt', '1 mg, 9 da manhã']]) {
    const d = toDose(l).say(t, perDay(1)).tap('start:0').step('time');
    assert.equal(d.s.draft.heard, null, `${l} "${t}": nothing read back`);
    assert.ok(!/\d/.test(d.lastApp()), `${l} "${t}": ${d.lastApp()}`);
  }
  for (const [l, t, want] of [['pt', '1 mg às 9 da manhã', '9:00'], ['pt', '1 mg 9h', '9:00'], ['en', '1 mg at 9pm', '9:00 PM'], ['de', '1 mg um 21 Uhr', '21:00'], ['it', '1 mg alle 21', '21:00']]) {
    const d = toDose(l).say(t, perDay(1)).tap('start:0').step('time');
    assert.ok(d.lastApp().includes(want), `${l} "${t}": ${d.lastApp()}`);
  }
  // At the time question itself "9 da manhã" and "9" stay fine.
  assert.deepEqual(atTime().say('9 da manhã').step('confirm').form(), ['09:00']);
  assert.deepEqual(atTime().say('9').step('confirm').form(), ['09:00']);
});

// ── N4: per-ml values that are not per 1 ml ──────────────────────────────
test('N4: "10 mg/2 ml", "250 mcg/0,5 ml", "10 mg em 2 ml" are never a per-ml strength (app and server, unit mg and mg/ml)', () => {
  const bad = [['10 mg/2 ml', '10', 'mg'], ['250 mcg/0,5 ml', '250', 'mcg'], ['10 mg em 2 ml', '10', 'mg'], ['10 mg in 2 ml', '10', 'mg'], ['10 mg per 2 ml', '10', 'mg'], ['10 mg dans 2 ml', '10', 'mg'], ['10 mg pro 2 ml', '10', 'mg'], ['20mg/2mL', '20', 'mg']];
  for (const [t, n, u] of bad) {
    for (const unit of [u, `${u}/ml`]) {
      assert.equal(S.validateUnderstanding('conc', { intent: 'answer', conc: { text: n, unit } }, t, 'pt').conc, null, `app "${t}" unit ${unit}`);
      assert.equal(SV.validateUnderstanding('conc', { intent: 'answer', conc: { text: n, unit } }, t).conc, null, `server "${t}" unit ${unit}`);
    }
    assert.equal(A.localUnderstand('conc', t, 'pt'), null, `local "${t}"`);
  }
  for (const [t, n] of [['5 mg/ml', '5'], ['5 mg/1 ml', '5'], ['5 mg por ml', '5'], ['250 mg/ml, 10 ml', '250']]) {
    assert.equal(S.validateUnderstanding('conc', { intent: 'answer', conc: { text: n, unit: 'mg' } }, t, 'pt').conc.text, n, t);
    assert.equal(SV.validateUnderstanding('conc', { intent: 'answer', conc: { text: n, unit: 'mg/ml' } }, t).conc.text, n, t);
  }
  // The per-ml question is asked again.
  const c = chat(start('pt')).say('testo', { intent: 'answer', compound: 'testo', form: 'ready' }).step('conc')
    .say('10 mg/2 ml', { intent: 'answer', conc: { text: '10', unit: 'mg' } }).step('conc');
  assert.equal(c.s.draft.conc, null);
});

// ── N5: a continuation is not a count ────────────────────────────────────
test('N5: "e 2 às 20", "2 at 1pm", "1ª às 8 e 2ª às 20": a count is never added as a time', () => {
  assert.deepEqual(T.readTimes('às 8 e 2 às 20', 'pt', { bare: true }).times, [{ hhmm: '08:00' }, { hhmm: '20:00' }]);
  assert.deepEqual(T.readTimes('8am, 2 at 1pm', 'en', { bare: true }).times, [{ hhmm: '08:00' }, { hhmm: '13:00' }]);
  assert.deepEqual(T.readTimes('1ª às 8 e 2ª às 20', 'pt', {}).times, [{ hhmm: '08:00' }, { hhmm: '20:00' }]);
  assert.deepEqual(T.readTimes('8h e 2 cápsulas às 20h', 'pt', {}).times, [{ hhmm: '08:00' }, { hhmm: '20:00' }]);
  const d = toDose().say('1 mg, 1ª às 8 e 2ª às 20', perDay(2)).tap('start:0').step('time');
  assert.equal(d.lastApp(), 'Lembretes: 8:00 e 20:00. Está certo?');
  const en = toDose('en').say('1 mg, 1 at 8am and 1 at night', perDay(2)).tap('start:0').step('time');
  assert.equal(en.lastApp(), 'Reminder: 8:00 AM. Is that right?', 'the "1" before "at night" is a count');
});

// ── N6: yes / no at a read-back ──────────────────────────────────────────
test('N6: at a read-back "não" is "Outro horário", "isso mesmo" is yes, any other text is a fresh answer — never the read-back twice', () => {
  const heard = () => toDose().say('1 mg por dia às 21h', perDay(1)).tap('start:0').step('time');
  for (const no of ['não', 'Não.', 'no', 'nein', 'non', 'nee']) {
    const c = heard().say(no).step('time');
    assert.equal(c.lastApp(), TR.pt.ap_q_time, no);
    assert.deepEqual(c.form(), [''], no);
  }
  for (const yes of ['isso mesmo', 'correto', 'exatamente', 'certo', 'correct', 'exactly', 'genau', 'exacto', 'esatto', 'sim, está certo']) {
    assert.deepEqual(heard().say(yes).step('confirm').form(), ['21:00'], yes);
  }
  const fresh = heard().say('de manhã').step('time');
  assert.equal(fresh.lastApp(), 'A que horas da manhã?');
  const odd = heard().say('sim, está bom?').step('time');
  const readBacks = odd.texts().filter((x) => x === 'Lembrete: 21:00. Está certo?');
  assert.equal(readBacks.length, 1, 'the read-back is never shown twice');
});

// ── N7: "8 e 30" with one dose ───────────────────────────────────────────
test('N7: "8 e 30" with 1 dose asks "Você quis dizer 8:30?" with Sim / Outro horário', () => {
  const c = atTime().say('8 e 30').step('time');
  assert.equal(c.lastApp(), 'Você quis dizer 8:30?');
  assert.deepEqual(c.options(), ['Sim', 'Outro horário']);
  c.tap('heard:yes').step('confirm');
  assert.deepEqual(c.form(), ['08:30']);
  const two = atTime('pt', 2).say('8 e 30').step('time');
  assert.equal(two.lastApp(), 'Você quis dizer 8:30?', 'two doses but 30 is not an hour: one reading only');
  const which = atTime('pt', 2).say('8 e 20').step('time');
  assert.deepEqual(which.options(), ['8:20', '8:00 e 20:00', 'Outro horário']);
  const meant = atTime().say('8 e 20').step('time');
  assert.equal(meant.lastApp(), 'Você quis dizer 8:20?');
});

test('N3 / N5 at the time question: a count before a part of the day is asked; "8 às 20" is a span, never the 20 alone', () => {
  const c = atTime().say('tomo 1 à noite').step('time');
  assert.equal(c.lastApp(), 'A que horas da noite?');
  assert.deepEqual(c.form(), ['']);
  const en = atTime('en', 2).say('1 at 8am and 1 at night').step('time');
  assert.deepEqual(en.form(), ['08:00', ''], 'the "1 at night" is not 01:00');
  for (const t of ['8 às 20', '8 a 20']) assert.equal(T.readTimes(t, 'pt', { bare: true }).range, true, t);
  assert.deepEqual(atTime().say('2 da manhã').step('confirm').form(), ['02:00'], 'a time leading the answer stays a time');
});

// ── N8 / N9 ───────────────────────────────────────────────────────────────
test('N8: "por volta das 8 e 20" is not a range; "das" opens a range only with às / até / a / bis / to / -', () => {
  for (const t of ['por volta das 8 e 20', 'lá pelas 8 e 20']) {
    const r = T.readTimes(t, 'pt', { bare: true });
    assert.equal(r.range, false, t);
    assert.deepEqual(r.joins, [{ one: '08:20', two: ['08:00', '20:00'] }], t);
  }
  for (const t of ['das 8 às 10', 'das 8 até as 10', 'das 8 a 10', 'entre 8 e 9']) assert.equal(T.readTimes(t, 'pt', { bare: true }).range, true, t);
  assert.equal(T.readTimes('from 8 to 9', 'en', { bare: true }).range, true);
  assert.equal(T.readTimes('von 8 bis 9 Uhr', 'de', { bare: true }).range, true);
});

test('N9: en "for 9pm" / "for 9am" is a time; "for 12h" and "por 12h" are a duration', () => {
  assert.deepEqual(T.readTimes('set it for 9pm', 'en', {}).times, [{ hhmm: '21:00' }]);
  assert.deepEqual(T.readTimes('for 9am', 'en', {}).times, [{ hhmm: '09:00' }]);
  assert.deepEqual(T.readTimes('remind me for 8am', 'en', {}).times, [{ hhmm: '08:00' }]);
  for (const [l, t] of [['en', 'for 12h'], ['pt', 'por 12h'], ['pt', 'durante 8h'], ['fr', 'pendant 8h']]) assert.deepEqual(T.readTimes(t, l, {}).times, [], `${l} "${t}"`);
});

// ── Strings ───────────────────────────────────────────────────────────────
test('Strings: "faixa de horário" (not "intervalo"), fr / de which-question, midnight "à 0:00"', () => {
  assert.equal(TR.pt.ap_time_range, 'Escreva um horário exato, não uma faixa de horário.');
  assert.equal(TR.es.ap_time_range, 'Escribe una hora exacta, no una franja horaria.');
  assert.equal(TR.it.ap_time_range, 'Scrivi un orario preciso, non una fascia oraria.');
  assert.equal(TR.fr.ap_q_time_which, 'Que vouliez-vous dire ?');
  assert.equal(TR.de.ap_q_time_which, 'Welche Uhrzeit meinst du?');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.ok(TR[l].ap_q_time_meant && TR[l].ap_q_time_meant.includes('{time}'), l);
  const form = { ...newProtocolForm(NOW), name: 'NAD+', compoundId: 'lyo_nad_plus', amount: '1000', water: '7', dose: '1', reminderTimes: ['00:00'] };
  const c = chat(A.startConversation('finish', form, { language: 'pt', now: NOW, catalog: CATALOG, visitedStep: 5, mixedOn: '2026-10-03', touched: ['time', 'schedule'] }));
  assert.ok(c.lastApp().includes('lembrete à 0:00'), c.lastApp());
});
