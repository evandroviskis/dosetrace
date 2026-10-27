'use strict';
// Founder 2026-10-27 ("Chegamos num acordo… Execute"): a protocol added with a start date in the past asks
// "Desde {date}, seriam {n} doses de {dose}. Você aplicou todas?" — one question for the curve AND the vial.
// Sim: the curve estimates that time and the vial starts with the doses scheduled since it was mixed already
// used. Não: the curve starts today and the person enters the doses used (Editar frasco). Only days before
// today count (today's dose is marked on Today, never twice).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pastStartAsk } = require('../lib/pastDoses');
const { translations } = require('../i18n/translations');

const now = new Date(2026, 9, 27, 15, 0).getTime();
const weekly = { id: 1, type: 'recon', start_date: '2026-10-02', interval_days: 7, doses_per_day: 1, reminder_time: '08:00' };

test('the founder\'s example: started 2 Oct, every 7 days, today 27 Oct → 4 doses (2, 9, 16, 23)', () => {
  const a = pastStartAsk({ protocol: weekly, vial: { total_doses: 10, mixed_on: '2026-10-02' }, nowMs: now, curveAsk: true });
  assert.equal(a.n, 4);
  assert.equal(a.vialUsed, 4);
  assert.equal(a.total, 10);
});

test('the vial counts only since it was mixed; never more than it holds; today\'s dose never counted', () => {
  assert.equal(pastStartAsk({ protocol: weekly, vial: { total_doses: 10, mixed_on: '2026-10-15' }, nowMs: now, curveAsk: true }).vialUsed, 2, '16 and 23 Oct');
  assert.equal(pastStartAsk({ protocol: weekly, vial: { total_doses: 3, mixed_on: '2026-10-02' }, nowMs: now, curveAsk: true }).vialUsed, 3, 'capped at the vial');
  const daily = { ...weekly, interval_days: 1, start_date: '2026-10-25' };
  assert.equal(pastStartAsk({ protocol: daily, vial: { total_doses: 20, mixed_on: '2026-10-25' }, nowMs: now, curveAsk: false }).n, 2, '25 and 26 — not today');
});

test('no question when nothing is owed: start today, or nothing for the curve and nothing in the vial', () => {
  assert.equal(pastStartAsk({ protocol: { ...weekly, start_date: '2026-10-27' }, vial: { total_doses: 10, mixed_on: '2026-10-27' }, nowMs: now, curveAsk: false }), null);
  assert.equal(pastStartAsk({ protocol: weekly, vial: { total_doses: 10, mixed_on: '2026-10-27' }, nowMs: now, curveAsk: false }), null, 'short compound, vial mixed today');
  assert.equal(pastStartAsk({ protocol: weekly, vial: { total_doses: 10, mixed_on: '2026-10-27' }, nowMs: now, curveAsk: true }).vialUsed, 0, 'curve only');
  assert.equal(pastStartAsk({ protocol: weekly, vial: null, nowMs: now, curveAsk: true }).vialUsed, 0);
});

test('texts ×6 (one / many), and the screen asks it after saving a new protocol', () => {
  assert.equal(translations.pt.protocols_past_title, 'Desde {date}, seriam {n} doses de {dose}. Você aplicou todas?');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['protocols_past_title', 'protocols_past_title_one', 'protocols_past_body', 'protocols_past_body_vial', 'protocols_past_yes', 'protocols_past_no']) {
      assert.equal(typeof translations[l][k], 'string', `${l}.${k}`);
    }
    assert.match(translations[l].protocols_past_body_vial, /\{v\}.*\{total\}|\{total\}.*\{v\}/, l);
  }
  const src = fs.readFileSync(path.join(__dirname, '../screens/ProtocolsScreen.js'), 'utf8');
  assert.match(src, /pastStartAsk\(\{ protocol: protocolData, vial: newVial, nowMs: Date\.now\(\), curveAsk: !!hq \}\)/);
  assert.match(src, /updateVial\(newVial\.id, w\.vialUpdate\)/); // what it writes: pastStartWrites (behaviour test below)
  assert.match(src, /openEditVialRef\.current\(newId\)/);
});

// Council 2026-10-27 (senior-engineer, QA, journey, UX, pharmacometrician) — fixed test first.
test('a start years ago counts every dose from the real start (no 400-day window)', () => {
  const old = { ...weekly, interval_days: 1, start_date: '2024-10-27' };
  const a = pastStartAsk({ protocol: old, vial: null, nowMs: now, curveAsk: true });
  assert.equal(a.n, 730, '27 Oct 2024 … 26 Oct 2026, every day');
});

test('Sim with every dose of the vial used = the vial is finished (the state the last dose leaves)', () => {
  const a = pastStartAsk({ protocol: weekly, vial: { total_doses: 3, mixed_on: '2026-10-02' }, nowMs: now, curveAsk: true });
  assert.equal(a.vialUsed, 3);
  assert.equal(a.finished, true);
  assert.equal(pastStartAsk({ protocol: weekly, vial: { total_doses: 10, mixed_on: '2026-10-02' }, nowMs: now, curveAsk: true }).finished, false);
});

test('a ready-to-use pen (no mix date): more doses than it holds came from earlier pens — never inferred', () => {
  const rtu = { ...weekly, type: 'rtu' };
  const many = pastStartAsk({ protocol: rtu, vial: { total_doses: 2, mixed_on: null }, nowMs: now, curveAsk: true });
  assert.equal(many.vialUsed, 0);
  assert.equal(many.vialUnknown, true, 'the person enters the doses used of this pen');
  const fits = pastStartAsk({ protocol: rtu, vial: { total_doses: 4, mixed_on: null }, nowMs: now, curveAsk: true });
  assert.equal(fits.vialUsed, 4);
  assert.equal(fits.finished, true);
  assert.ok(!fits.vialUnknown);
  assert.ok(pastStartAsk({ protocol: rtu, vial: { total_doses: 2, mixed_on: null }, nowMs: now, curveAsk: false }), 'still asked: the pen count is needed');
});

test('an oral bottle: Sim moves the units used (n × units per dose), only when they fit in the bottle', () => {
  const oral = { ...weekly, type: 'oral', dose: 10, dose_unit: 'mg', serving_strength: 5, serving_strength_unit: 'mg', serving_units: 1, container_units: 60, notes: 'Capsule' };
  const a = pastStartAsk({ protocol: oral, vial: null, nowMs: now, curveAsk: false });
  assert.equal(a.unitsUsed, 8, '4 doses × 2 capsules');
  const small = pastStartAsk({ protocol: { ...oral, container_units: 6 }, vial: null, nowMs: now, curveAsk: true });
  assert.equal(small.unitsUsed, 0, 'more than one bottle: never inferred');
});

test('the sheet must be answered; one dose reads "Sim"; the date shows the year when it is another year', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['protocols_past_yes_one', 'protocols_past_body_vial_unknown', 'protocols_past_body_bottle']) {
      assert.equal(typeof translations[l][k], 'string', `${l}.${k}`);
    }
    assert.match(translations[l].protocols_past_body_bottle, /\{u\}/, l);
  }
  assert.equal(translations.pt.protocols_past_yes_one, 'Sim');
  const src = fs.readFileSync(path.join(__dirname, '../screens/ProtocolsScreen.js'), 'utf8');
  const block = src.slice(src.indexOf('const ask = protocolData ? pastStartAsk'), src.indexOf('return true; // saved'));
  assert.match(block, /locked: true/);
  assert.match(block, /'dayMonthAuto'/);
  assert.match(block, /protocols_past_yes_one/);
  assert.match(block, /openNewVialWindow\(/, 'a finished vial opens the new-vial window');
  assert.match(block, /units_taken: w\.unitsTaken/);
});

// Founder 2026-10-27 ("3 b", picture docs/design/protocols-archive-and-almost-all.html section 2): a third
// answer "Quase todas" — the curve estimates the period like Sim (one missed dose never zeroes it) and
// "Editar frasco" opens for the real count; nothing written to the vial, the bottle or the Dose log.
test('"Quase todas": only with more than one dose; curve like Sim; Editar frasco for the real count', () => {
  const WANT = { en: 'Almost all', es: 'Casi todas', pt: 'Quase todas', fr: 'Presque toutes', de: 'Fast alle', it: 'Quasi tutte' };
  for (const [l, v] of Object.entries(WANT)) {
    assert.equal(translations[l].protocols_past_almost, v, l);
    for (const k of ['protocols_past_body_many', 'protocols_past_body_vial_many', 'protocols_past_body_vial_unknown_many', 'protocols_past_body_bottle_many']) {
      assert.equal(typeof translations[l][k], 'string', `${l}.${k}`);
    }
    assert.match(translations[l].protocols_past_body_bottle_many, /\{u\}/, l);
  }
  // Council delta 3 (pharmacometrician + UX): the text says the estimate counts every scheduled dose, keeps what Sim
  // does to the vial and says Não opens the vial count; formal, natural Portuguese.
  assert.equal(translations.pt.protocols_past_body_vial_many, 'Todas ou quase todas: a curva estima esse período contando todas as doses previstas, e o frasco começa com {v} de {total} doses usadas. Se foram quase todas, em seguida você corrige esse número. Se não, a curva começa hoje e você informa quantas doses do frasco usou.');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.match(translations[l].protocols_past_body_vial_many, /\{v\}[\s\S]*\{total\}|\{total\}[\s\S]*\{v\}/, l);
  const src = fs.readFileSync(path.join(__dirname, '../screens/ProtocolsScreen.js'), 'utf8');
  const block = src.slice(src.indexOf('const ask = protocolData ? pastStartAsk'), src.indexOf('return true; // saved'));
  assert.match(block, /const many = ask\.n > 1;/);
  assert.match(block, /many \? '_many' : ''/);
  assert.match(block, /label: t\('protocols_past_almost'\), kind: 'secondary', onPress: answer\('almost'\)/); // writes: pastStartWrites test
  assert.match(block, /buttons: many \? \[yesBtn, almostBtn, noBtn\] : \[noBtn, yesBtn\]/);
});

// Council delta 3 (senior engineer + QA): the three answers as behaviour, not source text.
test('what each answer writes: Sim / Quase todas / Não, for a mixed vial, a finished vial, a pen, a bottle, nothing', () => {
  const { pastStartWrites } = require('../lib/pastDoses');
  const opt = { hasVial: true, recon: true, today: '2026-10-27' };
  const part = { n: 20, vialUsed: 8, total: 10, finished: false, unitsUsed: 0 };
  // Sim: the vial takes the 8; the curve keeps the period.
  assert.deepEqual(pastStartWrites('yes', part, opt), { historyFrom: null, vialUpdate: { doses_taken: 8 }, unitsTaken: null, openEditVial: false, openNewVialWindow: false });
  // Quase todas: the curve like Sim; the vial holds Sim's 8 (Cancelar keeps it, never 0), then Editar frasco opens.
  assert.deepEqual(pastStartWrites('almost', part, opt), { historyFrom: null, vialUpdate: { doses_taken: 8 }, unitsTaken: null, openEditVial: true, openNewVialWindow: false });
  // Não: the curve starts today; the vial count is the person's.
  assert.deepEqual(pastStartWrites('no', part, opt), { historyFrom: '2026-10-27', vialUpdate: null, unitsTaken: null, openEditVial: true, openNewVialWindow: false });
  // Every dose of the vial used: Sim finishes it (new-vial window on a mixed vial); Quase todas never finishes it.
  const full = { n: 20, vialUsed: 10, total: 10, finished: true, unitsUsed: 0 };
  assert.deepEqual(pastStartWrites('yes', full, opt).vialUpdate, { doses_taken: 10, active: 0 });
  assert.equal(pastStartWrites('yes', full, opt).openNewVialWindow, true);
  assert.equal(pastStartWrites('yes', full, { ...opt, recon: false }).openNewVialWindow, false);
  assert.deepEqual(pastStartWrites('almost', full, opt).vialUpdate, { doses_taken: 10 });
  // A pen holding fewer doses than were due: never inferred, every answer opens Editar frasco.
  const pen = { n: 40, vialUsed: 0, total: 28, finished: false, vialUnknown: true, unitsUsed: 0 };
  for (const a of ['yes', 'almost', 'no']) {
    const w = pastStartWrites(a, pen, opt);
    assert.equal(w.openEditVial, true, a);
    assert.equal(w.vialUpdate, null, a);
  }
  // An oral bottle: Sim and Quase todas take the estimate (no field to correct it); Não leaves it.
  const bottle = { n: 14, vialUsed: 0, total: null, finished: false, unitsUsed: 28 };
  const noVial = { hasVial: false, recon: false, today: '2026-10-27' };
  assert.equal(pastStartWrites('yes', bottle, noVial).unitsTaken, 28);
  assert.equal(pastStartWrites('almost', bottle, noVial).unitsTaken, 28);
  assert.equal(pastStartWrites('no', bottle, noVial).unitsTaken, null);
  // No supply: Sim and Quase todas write nothing (the curve keeps the period); Não writes only history_from.
  const none = { n: 5, vialUsed: 0, total: null, finished: false, unitsUsed: 0 };
  assert.deepEqual(pastStartWrites('almost', none, noVial), pastStartWrites('yes', none, noVial));
  assert.deepEqual(pastStartWrites('no', none, noVial), { historyFrom: '2026-10-27', vialUpdate: null, unitsTaken: null, openEditVial: false, openNewVialWindow: false });
  // The screen runs these and nothing else; never a dose row.
  const src = fs.readFileSync(path.join(__dirname, '../screens/ProtocolsScreen.js'), 'utf8');
  const block = src.slice(src.indexOf('const ask = protocolData ? pastStartAsk'), src.indexOf('return true; // saved'));
  assert.match(block, /pastStartWrites\(kind, ask, \{ hasVial: !!newVial, recon: protocolData\.type === 'recon', today: todayStr \}\)/);
  for (const k of ['no', 'yes', 'almost']) assert.match(block, new RegExp(`onPress: answer\\('${k}'\\)`));
  assert.doesNotMatch(block, /insertDoseLog/);
});
