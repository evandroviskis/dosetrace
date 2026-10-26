'use strict';
// A-181 (council journey review 2026-10-25; founder 2026-10-26 "Vamos com B nas duas. Pode executar.",
// picture docs/design/a181-a160-proposals.html option B): after A-177 a Missed is written only once a
// successful dose_logs pull finished 12 h after the slot, and the scan looks back 14 days. A phone
// that does not sync shows fewer misses and the provider report reads adherence too high, with
// nothing saying so; past 14 days without a sync the older misses are never written.
// B: the Dose log says "Not synced since {date}" with the count of doses held back by that rule, a
// "Sync now" text button, an extra line past 7 days, "+n not recorded" under Missed; the report marks
// the adherence with an asterisk, lists "No record since {date}: n" per protocol, and keeps a line
// for every gap of more than 14 days without a sync (stored per account on this phone).
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const U = require('../lib/unsyncedDoses');
const S = require('../lib/pullStamp');
const { computeMissedDoses, LATE_MS } = require('../lib/missedDoses');

const HOUR = 3600000;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 9, 25, 9, 41).getTime(); // Sunday 25 Oct 2026, 09:41
const PULLED = new Date(2026, 9, 23, 7, 0).getTime(); // last good pull: Friday 23 Oct, 07:00
const proto = (id, over = {}) => ({ id, remote_id: 'r' + id, user_id: 'u', created_at: '2026-09-01T00:00:00Z', frequency: 'daily', interval_days: 1, doses_per_day: 1, reminder_time: '20:00', start_date: '2026-09-01', active: 1, ...over });
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const SINCE = new Date(2026, 8, 1).getTime();

test('held slots: the slots the scan would write now but the A-177 rule holds back (no pull 12 h after them)', () => {
  const p = proto(1);
  // 20:00 on 21 and 22 Oct are covered by Taken rows; 23 and 24 Oct have nothing.
  const logs = [{ protocol_id: 1, outcome: 'Taken', logged_at: at(21, 20, 5) }, { protocol_id: 1, outcome: 'Taken', logged_at: at(22, 20, 3) }];
  const since = new Date(2026, 9, 21, 0, 0).getTime(); // the scan watermark: from 21 Oct
  const held = U.heldMissedSlots([p], logs, NOW, since, { pulledMs: PULLED });
  assert.deepEqual(held.map((h) => new Date(h.scheduledAtMs).getDate()), [23, 24]);
  // Exactly the slots the real scan would add after a pull finished now, minus what it writes today.
  const writtenToday = computeMissedDoses([p], logs, NOW, since, { lookbackDays: 14, pulledThroughMs: PULLED });
  assert.equal(writtenToday.length, 0, 'the gate holds both back');
  const afterPull = computeMissedDoses([p], logs, NOW, since, { lookbackDays: 14, pulledThroughMs: NOW });
  assert.deepEqual(afterPull.map((h) => h.scheduledAtMs), held.map((h) => h.scheduledAtMs));
});

test('held slots follow the same gates as the scan (watermark, schedule ledger) — never a count the scan would not write', () => {
  const p = proto(1);
  // Watermark after the 23rd: only the 24th.
  const sinceAfter = new Date(2026, 9, 24, 0, 0).getTime();
  assert.equal(U.heldMissedSlots([p], [], NOW, sinceAfter, { pulledMs: PULLED }).length, 1);
  // DV-244: schedule known only since the 24th at noon → the 24th 20:00 only.
  const held = U.heldMissedSlots([p], [], NOW, SINCE, { pulledMs: PULLED, scheduleSince: { 1: new Date(2026, 9, 24, 12).getTime() } });
  assert.deepEqual(held.map((h) => new Date(h.scheduledAtMs).getDate()), [24]);
  // A ledger passed without this protocol: nothing known → nothing.
  assert.equal(U.heldMissedSlots([p], [], NOW, SINCE, { pulledMs: PULLED, scheduleSince: {} }).length, 0);
});

test('held slots past 14 days are counted too (they are the ones that will never be written)', () => {
  const p = proto(1);
  const pulled = NOW - 20 * DAY;
  const held = U.heldMissedSlots([p], [], NOW, SINCE, { pulledMs: pulled });
  assert.ok(held.length >= 19 && held.length <= 20, `about 20 days of slots, got ${held.length}`);
});

test('the notice: only after more than 24 h without a good pull AND with at least one held dose', () => {
  const held = [{ protocol_id: 1, scheduledAtMs: 1 }, { protocol_id: 1, scheduledAtMs: 2 }, { protocol_id: 2, scheduledAtMs: 3 }];
  // Synced 2 h ago: nothing (the app syncs at every opening; no flicker).
  assert.equal(U.unsyncedNotice({ pulledMs: NOW - 2 * HOUR, nowMs: NOW, held }), null);
  // Exactly 24 h: still nothing.
  assert.equal(U.unsyncedNotice({ pulledMs: NOW - 24 * HOUR, nowMs: NOW, held }), null);
  // 2 days and nothing held: nothing (no number would change).
  assert.equal(U.unsyncedNotice({ pulledMs: PULLED, nowMs: NOW, held: [] }), null);
  const n = U.unsyncedNotice({ pulledMs: PULLED, nowMs: NOW, held });
  assert.deepEqual(n, { sinceMs: PULLED, never: false, count: 3, byProtocol: { 1: 2, 2: 1 }, old: false });
  // More than 7 days: the "missed doses more than 14 days old are not recorded later" line.
  assert.equal(U.unsyncedNotice({ pulledMs: NOW - 8 * DAY, nowMs: NOW, held }).old, true);
  // No pull ever on this phone: the "never synced" wording.
  const never = U.unsyncedNotice({ pulledMs: null, nowMs: NOW, held });
  assert.equal(never.never, true);
  assert.equal(never.sinceMs, null);
});

test('per protocol inside the report period only', () => {
  const held = [{ protocol_id: 1, scheduledAtMs: 10 }, { protocol_id: 1, scheduledAtMs: 50 }, { protocol_id: 2, scheduledAtMs: 60 }];
  assert.deepEqual(U.heldByProtocol(held, 20, 100), { 1: 1, 2: 1 });
});

test('the gap: a pull after more than 14 days leaves the slots before the scan window unrecorded for good', () => {
  // Last pull 1 Oct 07:00, next pull 25 Oct 09:41: the scan reaches back to 11 Oct 00:00.
  const prev = new Date(2026, 9, 1, 7, 0).getTime();
  const gap = S.unrecordedGap(prev, NOW);
  assert.deepEqual(gap, { fromMs: prev - LATE_MS, toMs: new Date(2026, 9, 11, 0, 0).getTime() });
  // 13 days: the scan covers it all — no gap.
  assert.equal(S.unrecordedGap(NOW - 13 * DAY, NOW), null);
  // A clock put back (previous stamp ahead of the new one): nothing proven.
  assert.equal(S.unrecordedGap(NOW + DAY, NOW), null);
  assert.equal(S.unrecordedGap(null, NOW), null);
});

function memStorage(init = {}) {
  const m = { ...init };
  return { m, getItem: async (k) => (k in m ? m[k] : null), setItem: async (k, v) => { m[k] = String(v); }, removeItem: async (k) => { delete m[k]; } };
}

test('recordDoseLogsPull keeps the gap per account, and a sign-in of another account never mixes them', async () => {
  const st = memStorage();
  const t1 = new Date(2026, 8, 20, 7).getTime();
  await S.recordDoseLogsPull(st, 'u', t1);
  await S.recordDoseLogsPull(st, 'u', NOW);
  const gaps = await S.readUnrecordedGaps(st, 'u', NOW);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].fromMs, t1 - LATE_MS);
  // Another account on this phone: its first pull has no previous stamp of its own → no gap; u's stays.
  await S.recordDoseLogsPull(st, 'v', NOW + HOUR);
  assert.equal((await S.readUnrecordedGaps(st, 'v', NOW + HOUR)).length, 0);
  assert.equal((await S.readUnrecordedGaps(st, 'u', NOW + HOUR)).length, 1);
  // A normal daily pull adds nothing.
  await S.recordDoseLogsPull(st, 'u', NOW + 2 * HOUR);
  await S.recordDoseLogsPull(st, 'u', NOW + DAY);
  assert.equal((await S.readUnrecordedGaps(st, 'u', NOW + DAY)).length, 1);
  // Kept 60 days after its end, then dropped.
  assert.equal((await S.readUnrecordedGaps(st, 'u', gaps[0].toMs + 61 * DAY)).length, 0);
  // The full import forgets the pull stamp, never the gaps (those misses really were never written).
  await S.forgetDoseLogsPull(st);
  assert.equal((await S.readUnrecordedGaps(st, 'u', NOW + DAY)).length, 1);
});

test('broken storage never throws and never invents a gap', async () => {
  const bad = { getItem: async () => { throw new Error('x'); }, setItem: async () => { throw new Error('x'); }, removeItem: async () => { throw new Error('x'); } };
  await S.recordDoseLogsPull(bad, 'u', NOW);
  assert.deepEqual(await S.readUnrecordedGaps(bad, 'u', NOW), []);
  assert.deepEqual(S.gapsFor('{not json', 'u', NOW), []);
});

test('report gaps are clipped to the report period', () => {
  const gaps = [{ fromMs: 10, toMs: 40 }, { fromMs: 100, toMs: 200 }, { fromMs: 300, toMs: 400 }];
  assert.deepEqual(U.reportGaps(gaps, 30, 250), [{ fromMs: 30, toMs: 40 }, { fromMs: 100, toMs: 200 }]);
});

// ── Wiring (the screens use the module the way the picture shows) ──
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('Dose log: the card under the title, Sync now, the extra line past 7 days and "+n not recorded" under Missed', () => {
  const src = read('screens/LogScreen.js');
  assert.match(src, /unsyncedState\(/);
  for (const k of ['log_unsynced_title', 'log_unsynced_never', 'log_unsynced_count', 'log_unsynced_old', 'sync_now', 'log_unrecorded_n']) assert.ok(src.includes(`'${k}`), k);
  assert.match(src, /forceSync\(/, 'Sync now runs a full sync');
  assert.doesNotMatch(src.slice(src.indexOf('unsyncCard'), src.indexOf('unsyncCard') + 400), /risk|attention/, 'no alert colour (state of the data, not a health risk)');
});

test('Report: asterisks, the explaining line, per-protocol "No record since", the gap lines, and the notice above the paper (not in the text)', () => {
  const src = read('screens/SettingsScreen.js');
  for (const k of ['report_unsynced', 'report_unrecorded', 'report_gap', 'settings_report_unsynced', 'sync_now']) assert.ok(src.includes(`'${k}'`), k);
  assert.match(src, /readUnrecordedGaps\(/);
  // The notice above the paper is screen state, never appended to the report string.
  assert.doesNotMatch(src, /report \+= [^\n]*settings_report_unsynced/);
});

test('the scan state reads the same inputs the scan uses (one definition, lib/doseActions)', () => {
  const src = read('lib/doseActions.js');
  const fn = src.slice(src.indexOf('export async function unsyncedState'));
  assert.ok(fn.length > 0, 'unsyncedState exists');
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  for (const s of ['getMissedWatermark', 'observeSchedules', 'readDoseLogsPull', 'heldMissedSlots', 'MISSED_LOOKBACK_DAYS']) assert.ok(body.includes(s), s);
});

test('six languages: every new key, with the singular forms', () => {
  const { translations } = require('../i18n/translations.js');
  const keys = ['log_unsynced_title', 'log_unsynced_never', 'log_unsynced_count', 'log_unsynced_count_one', 'log_unsynced_old', 'sync_now', 'log_unrecorded_n', 'report_unsynced', 'report_unrecorded', 'report_gap', 'settings_report_unsynced'];
  for (const lang of ['en', 'pt', 'es', 'fr', 'de', 'it']) for (const k of keys) assert.ok(translations[lang][k], `${lang}.${k}`);
  assert.equal(translations.pt.log_unsynced_title, 'Sem sincronização desde {date}');
  assert.equal(translations.pt.sync_now, 'Sincronizar agora');
});
