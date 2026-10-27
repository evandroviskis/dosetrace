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
  assert.match(src, /updateVial\(newVial\.id, \{ doses_taken: ask\.vialUsed \}\)/);
  assert.match(src, /openEditVialRef\.current\(newId\)/);
});
