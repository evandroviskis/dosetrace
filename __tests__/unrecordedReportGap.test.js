'use strict';
// UP-29: the report line "* De {from} a {to} o celular ficou mais de 14 dias sem sincronizar…" no longer appears
// for a period fully answered — by "Tomei todas" / "Não tomei" (rows now cover the slots) and by "Não lembro"
// (the range on the protocol answers them, with no row).
const test = require('node:test');
const assert = require('node:assert/strict');
const { gapsWithMisses } = require('../lib/unsyncedDoses');
const U = require('../lib/unrecordedPeriod');

const L = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
const NOW = L(2026, 11, 3, 10);
const p = { id: 1, user_id: 'u', type: 'recon', dose: '5', dose_unit: 'mg', reminder_time: '20:00', doses_per_day: 1, interval_days: 7, start_date: '2026-09-03', active: 1, created_at: new Date(L(2026, 9, 3, 8)).toISOString() };
const gap = { fromMs: L(2026, 9, 25), toMs: L(2026, 10, 20) };
const since = L(2026, 9, 1);

test('UP-29: an unanswered gap is reported; a gap answered with rows is not', () => {
  assert.equal(gapsWithMisses([gap], [p], [], NOW, since).length, 1);
  const entries = U.gapEntries(p, [], { nowMs: NOW, pulledThroughMs: NOW - 60000 });
  const rows = U.planUnrecordedAnswer({ protocol: p, entries, choice: 'none', nowMs: NOW }).inserts.map((r, i) => ({ id: i + 1, ...r }));
  assert.deepEqual(gapsWithMisses([gap], [p], rows, NOW, since), []);
});

test('UP-29: a gap answered "Não lembro" is not reported either', () => {
  const entries = U.gapEntries(p, [], { nowMs: NOW, pulledThroughMs: NOW - 60000 });
  const plan = U.planUnrecordedAnswer({ protocol: p, entries, choice: 'unknown', nowMs: NOW });
  const answered = { ...p, unrecorded_unknown: plan.unknownNext };
  assert.deepEqual(gapsWithMisses([gap], [answered], [], NOW, since), []);
});
