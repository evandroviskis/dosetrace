'use strict';
// Independent review of f869cb8 (2026-11-04): 4 blockers and 8 errors in reading the reminder
// time. Each test reproduces one finding (the reviewer's probe inputs) and stays in the repo.
// Spec rows AP-42..AP-47 (docs/specs/ai-protocol-assistant.md).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../lib/protocolAssistant');
const T = require('../lib/assistantTime');
const { renderText } = require('../lib/assistantText');
const { newProtocolForm } = require('../lib/protocolForm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'i18n', 'translations.js'), 'utf8').replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };';
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
const start = (lang, door = 'build', form, ctx) => A.startConversation(door, form || newProtocolForm(NOW), { language: lang, now: NOW, catalog: CATALOG, ...(ctx || {}) });
const toDose = (l = 'pt') => chat(start(l)).say('nad', { intent: 'answer', compound: 'nad' }).tap('form:powder').say(l === 'en' ? '1000 mg' : '1.000 mg').say('7 ml').tap('day:0').step('dose');
const perDay = (n) => ({ intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each', period: 'day', count: n });
const atTime = (l = 'pt', often = 'often:d1') => toDose(l).say('1 mg', { intent: 'answer', dose: { text: '1', unit: 'mg' }, basis: 'each' }).tap(often).tap('start:0').step('time');
const none = (l, t) => assert.deepEqual(T.readTimes(t, l, {}).times, [], `${l} "${t}" is not a time`);

// ── B1: intervals and durations written with "h" ──────────────────────────
test('B1: intervals and durations written with h, hs, hrs or a slash are never a time', () => {
  for (const [l, t] of [['pt', '1 mg 2x ao dia a cada 12h'], ['pt', 'de 12/12h'], ['pt', '12/12h'], ['pt', 'a cada 8h'], ['pt', 'em jejum de 12h'], ['pt', '12h de jejum'],
    ['pt', '8h depois da refeição'], ['en', 'every 12h'], ['en', 'every 8 hrs'], ['en', 'q12h'], ['en', 'twice a day 12h apart'], ['fr', 'toutes les 8h'], ['it', 'ogni 8h'],
    ['es', 'cada 12h'], ['es', 'cada 8 hs'], ['de', 'alle 12h'], ['de', 'je 12h']]) {
    none(l, t);
    none(l, t); // also at the time question (bare)
    assert.deepEqual(T.readTimes(t, l, { bare: true }).times, [], `${l} "${t}" (time question)`);
  }
  const c = toDose().say('1 mg 2x ao dia a cada 12h', perDay(2)).tap('start:0').step('time');
  assert.equal(c.lastApp(), 'Dose 1 de 2: a que horas?', 'asked, nothing read back');
  assert.deepEqual(A.options(c.s), []);
});

// ── B2: the hard line at the time question ───────────────────────────────
test('B2: "which is better?" gets the fixed deflection; the app never picks a part of the day', () => {
  const pt = atTime().say('de manhã ou à noite, o que é melhor?').step('time');
  assert.ok(pt.texts().includes(TR.pt.ap_deflect));
  assert.equal(pt.lastApp(), TR.pt.ap_q_time);
  const en = atTime('en').say('morning or evening, which is better?').step('time');
  assert.ok(en.texts().includes(TR.en.ap_deflect));
  const bare = atTime().say('de manhã ou à noite?').step('time');
  assert.equal(bare.lastApp(), TR.pt.ap_q_time, 'asked again, no part named');
  assert.deepEqual(bare.s.draft.dayParts, []);
  // More parts than doses, said with the dose: none of them is used in the question.
  const two = toDose().say('1 mg por dia, de manhã e à noite', perDay(1)).tap('start:0').step('time');
  assert.equal(two.lastApp(), TR.pt.ap_q_time);
  const more = atTime().say('de manhã e à noite').step('time');
  assert.equal(more.lastApp(), TR.pt.ap_q_time, 'two parts for one dose: none chosen');
});

// ── B3: articles, "about" and pill counts ────────────────────────────────
test('B3: a count of pills or meals after "as", "tipo", "about", "around" is never a time', () => {
  for (const [l, t] of [['pt', 'tomo as 2 cápsulas por dia'], ['pt', 'as 2 primeiras semanas'], ['pt', 'às 3 refeições'], ['es', 'tipo 2 cápsulas'], ['fr', 'il y a 2 j'],
    ['en', 'about 2 pills a day'], ['en', 'around 2 a day'], ['en', 'about 2 tabs'], ['fr', 'à 2 gélules'], ['it', 'alle 2 compresse'], ['de', 'um 2 Kapseln'], ['de', '2 Tropfen'],
    ['pt', '2 comprimidos'], ['pt', '3 gotas'], ['en', '2 capsules'], ['en', '1 tablet']]) none(l, t);
  // The am/pm chips never offer a number the person did not write as a time.
  const c = toDose('en').say('1 mg, around 2 a day', perDay(2)).tap('start:0').step('time');
  assert.deepEqual(c.options(), []);
  assert.equal(c.lastApp(), 'Dose 1 of 2: what time?');
});

// ── B4: before / after / until, and ranges ───────────────────────────────
test('B4: noon or midnight next to before / after is not a time; a range is not a time and is asked', () => {
  for (const [l, t] of [['pt', 'antes do meio-dia'], ['pt', 'depois do meio-dia'], ['en', 'after midnight'], ['en', 'before noon'], ['de', 'vor Mittag'], ['de', 'nach Mitternacht'],
    ['fr', 'avant midi'], ['es', 'antes del mediodía'], ['it', 'prima di mezzogiorno'], ['it', 'dopo mezzanotte'], ['pt', 'antes das 9'], ['en', 'after 8pm']]) none(l, t);
  for (const [l, t] of [['pt', 'das 8 às 10'], ['pt', 'entre 8 e 9'], ['en', 'between 8 and 9 am'], ['en', '8-9am'], ['de', 'von 8 bis 9 Uhr'], ['es', 'de 8 a 10']]) {
    const r = T.readTimes(t, l, { bare: true });
    assert.deepEqual(r.times, [], `${l} "${t}"`);
    assert.equal(r.range, true, `${l} "${t}" is a range`);
  }
  const c = atTime().say('das 8 às 10').step('time');
  assert.ok(c.texts().includes('Escreva um horário exato, não um intervalo.'));
  assert.deepEqual(c.form(), ['']);
  const d = toDose().say('1 mg por dia, das 8 às 10', perDay(1)).tap('start:0').step('time');
  assert.equal(d.lastApp(), TR.pt.ap_q_time, 'a range in the dose answer is not read back');
});

// ── Structural: a time from another answer is read back ──────────────────
test('Read-back: a time heard in another answer is confirmed with Sim / Outro horário before it is used', () => {
  const c = toDose().say('1 mg todo dia às 12h', perDay(1)).tap('start:0').step('time');
  assert.equal(c.lastApp(), 'Lembrete: 12:00. Está certo?');
  assert.deepEqual(c.options(), ['Sim', 'Outro horário']);
  assert.deepEqual(c.form(), [''], 'not handed over before the yes');
  c.tap('othertime').step('time');
  assert.equal(c.lastApp(), TR.pt.ap_q_time);
  c.say('7h').step('confirm');
  assert.deepEqual(c.form(), ['07:00']);
  const typed = toDose().say('1 mg todo dia às 12h', perDay(1)).tap('start:0').say('sim').step('confirm');
  assert.deepEqual(typed.form(), ['12:00'], '"sim" typed is the same yes');
  const instead = toDose().say('1 mg todo dia às 12h', perDay(1)).tap('start:0').say('21h').step('confirm');
  assert.deepEqual(instead.form(), ['21:00'], 'a time typed at the question is taken as written');
});

// ── Errors 1-8 ─────────────────────────────────────────────────────────────
test('Error 1: "8 e 20" is asked (8:20, or 8:00 and 20:00); "8 e 20 da noite" keeps the 8', () => {
  const two = atTime('pt', 'often:d2').say('8 e 20').step('time');
  assert.equal(two.lastApp(), 'Qual destes você quis dizer?');
  assert.deepEqual(two.options(), ['8:20', '8:00 e 20:00', 'Outro horário']);
  two.tap('join:two').step('confirm');
  assert.deepEqual(two.form(), ['08:00', '20:00']);
  const one = atTime().say('8 e 20').step('time');
  assert.deepEqual(one.options(), ['8:20', 'Outro horário'], 'one dose a day: two times are not offered');
  one.tap('join:one').step('confirm');
  assert.deepEqual(one.form(), ['08:20']);
  const night = atTime().say('8 e 20 da noite').step('time');
  assert.deepEqual(night.options(), ['20:20', 'Outro horário'], 'the 8 is not dropped');
  const inDose = toDose().say('1 mg 2x ao dia às 8 e 20', perDay(2)).tap('start:0').step('time');
  assert.deepEqual(inDose.options(), ['8:20', '8:00 e 20:00', 'Outro horário']);
});

test('Error 2: "1 da manhã", "3 da manhã" and "at 1 in the morning" are 01:00 to 03:00', () => {
  assert.deepEqual(T.readTimes('1 da manhã', 'pt', { bare: true }).times, [{ hhmm: '01:00' }]);
  assert.deepEqual(T.readTimes('3 da manhã', 'pt', { bare: true }).times, [{ hhmm: '03:00' }]);
  assert.deepEqual(T.readTimes('at 1 in the morning', 'en', { bare: true }).times, [{ hhmm: '01:00' }]);
  assert.deepEqual(atTime().say('1 da manhã').step('confirm').form(), ['01:00']);
});

test('Error 3: a part of the day said for the first day does not replace a time already given', () => {
  const c = toDose().say('1 mg por dia às 21h', perDay(1)).step('start').say('amanhã de manhã', { intent: 'answer', day_offset: 1 }).step('time');
  assert.equal(c.lastApp(), 'Lembrete: 21:00. Está certo?');
  c.tap('heard:yes');
  assert.deepEqual(c.form(), ['21:00']);
});

test('Error 4: Change → Time left unanswered keeps the time from before (Finish and Edit)', () => {
  const form = { ...newProtocolForm(NOW), name: 'NAD+', compoundId: 'lyo_nad_plus', amount: '1000', water: '7', dose: '1', reminderTimes: ['07:30'] };
  const fin = chat(A.startConversation('finish', form, { language: 'pt', now: NOW, catalog: CATALOG, visitedStep: 5, mixedOn: '2026-10-03', touched: ['time'] })).tap('yes').step('confirm');
  fin.tap('change').tap('redo:time').step('time');
  assert.deepEqual(fin.form(form), ['07:30']);
  const ed = { ...form, reminderTimes: ['06:15'] };
  const edit = chat(A.startConversation('finish', ed, { language: 'pt', now: NOW, catalog: CATALOG, editing: true, visitedStep: 4 })).tap('yes');
  edit.tap('change').tap('redo:time').step('time');
  assert.deepEqual(edit.form(ed), ['06:15']);
  // A new schedule with fewer doses a day: the old times are not cut to fit (never one picked).
  const two = { ...form, dosesPerDay: 2, reminderTimes: ['08:00', '20:00'] };
  const sch = chat(A.startConversation('finish', two, { language: 'pt', now: NOW, catalog: CATALOG, editing: true, visitedStep: 4 })).tap('yes');
  sch.tap('change').tap('redo:often').tap('often:d1').step('time');
  assert.deepEqual(sch.form(two), ['']);
});

test('Error 5: a time in the first message, "7 and 19", and "às 8 e 20" in the dose are all kept', () => {
  const first = chat(start('pt')).say('NAD+, 1 mg todo dia às 9h', { intent: 'answer', compound: 'NAD+' });
  assert.deepEqual(first.s.draft.heard && first.s.draft.heard.times, ['09:00'], 'heard in the first message');
  const c = first.tap('form:powder').say('1.000 mg').say('7 ml').tap('day:0').say('1 mg todo dia', perDay(1)).tap('start:0').step('time');
  assert.equal(c.lastApp(), 'Lembrete: 9:00. Está certo?');
  const en = atTime('en', 'often:d2').say('7 and 19').step('time');
  assert.equal(en.lastApp(), '7 in the morning or in the evening?');
  en.tap('ampm:am').step('confirm');
  assert.deepEqual(en.form(), ['07:00', '19:00']);
  const de = toDose('de').say('1 mg zweimal täglich um 8 und 20 Uhr', perDay(2)).tap('start:0').step('time');
  assert.equal(de.lastApp(), 'Erinnerungen: 8:00 und 20:00. Stimmt das?');
});

test('Error 6: the same time twice is asked again', () => {
  const c = atTime('en', 'often:d2').say('8am and 8am').step('time');
  assert.ok(c.texts().includes('Each dose needs its own time.'));
  assert.deepEqual(c.form(), ['', '']);
});

test('Error 7: a date like 3/11 at the time question is not two times', () => {
  assert.deepEqual(T.readTimes('3/11', 'pt', { bare: true }).times, []);
  const c = atTime('pt', 'often:d2').say('3/11').step('time');
  assert.ok(c.texts().includes(TR.pt.ap_time_unclear));
  assert.deepEqual(c.form(), ['', '']);
  assert.deepEqual(T.readTimes('03/11 às 9', 'pt', {}).times, [{ hhmm: '09:00' }]);
});

test('Error 8: 1 o\'clock reads naturally in the summary of what was filled in (pt à, es a la, it all\')', () => {
  const want = { pt: 'lembrete à 1:00', es: 'recordatorio a la 1:00', it: "promemoria all'1:00", fr: 'rappel à 1:00', de: 'Erinnerung um 1:00', en: 'reminder at 1:00 AM' };
  for (const l of Object.keys(want)) {
    const form = { ...newProtocolForm(NOW), name: 'NAD+', compoundId: 'lyo_nad_plus', amount: '1000', water: '7', dose: '1', reminderTimes: ['01:00'] };
    const c = chat(A.startConversation('finish', form, { language: l, now: NOW, catalog: CATALOG, visitedStep: 5, mixedOn: '2026-10-03', touched: ['time', 'schedule'] }));
    assert.ok(c.lastApp().includes(want[l]), `${l}: ${c.lastApp()}`);
    const nine = { ...form, reminderTimes: ['09:00'] };
    const c9 = chat(A.startConversation('finish', nine, { language: l, now: NOW, catalog: CATALOG, visitedStep: 5, mixedOn: '2026-10-03', touched: ['time', 'schedule'] }));
    assert.ok(!c9.lastApp().includes(want[l].replace(/1:00.*/, '')) || ['fr', 'de', 'en'].includes(l), `${l} 9:00 keeps the plural form`);
  }
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of ['ap_part_time_one', 'ap_part_times', 'ap_q_time_confirm', 'ap_q_times_confirm', 'ap_q_time_which', 'ap_opt_other_time', 'ap_time_range', 'ap_time_duplicate']) {
    assert.ok(TR[l][k], `${l}.${k}`);
  }
});

test('Leave as is: "quando precisar" keeps asking with the existing clear text', () => {
  const c = atTime().say('quando precisar').step('time');
  assert.equal(c.texts()[c.texts().length - 2], TR.pt.ap_time_unclear);
});
