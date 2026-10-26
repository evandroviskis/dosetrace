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

// Code review 2026-10-26 (#2, #4): the count says "recorded as missed at the next sync", so it holds only
// what the scan writes — its own 14 days. A wider window also matched logs to other slots at its edge.
test('held slots never reach past the 14 days of the scan (the count promises they are written at the next sync)', () => {
  const p = proto(1);
  const pulled = NOW - 20 * DAY;
  const held = U.heldMissedSlots([p], [], NOW, SINCE, { pulledMs: pulled });
  const afterPull = computeMissedDoses([p], [], NOW, SINCE, { lookbackDays: 14, pulledThroughMs: NOW });
  assert.deepEqual(held.map((h) => h.scheduledAtMs), afterPull.map((h) => h.scheduledAtMs), 'exactly what a pull now lets the scan write');
  assert.equal(held.length, 14);
  // The review's edge case: day −15 not logged, day −14 logged at 06:00 → day −14 is covered, never held.
  const d14 = new Date(2026, 9, 11, 6, 0).toISOString();
  const edge = U.heldMissedSlots([p], [{ protocol_id: 1, outcome: 'Taken', logged_at: d14 }], NOW, SINCE, { pulledMs: pulled });
  assert.ok(!edge.some((h) => new Date(h.scheduledAtMs).getDate() === 11), 'day −14 is covered by its 06:00 dose');
});

test('the held list is computed INSIDE the scan from its cleaned rows; the screens read it from there', () => {
  const src = read('lib/doseActions.js');
  const scan = src.slice(src.indexOf('export async function scanMissedDoses'));
  const body = scan.slice(0, scan.indexOf('\n}\n'));
  assert.match(body, /heldMissedSlots\(protocols, kept, nowMs, sinceMs, \{ pulledMs: pulledThroughMs, zoneHistory, scheduleSince \}\)/);
  const st = src.slice(src.indexOf('export async function unsyncedState'));
  const stBody = st.slice(0, st.indexOf('\n}\n'));
  assert.doesNotMatch(stBody, /getMissedWatermark|observeSchedules|getLogsSince/, 'no second copy of the scan inputs');
});

test('a gap is printed only when the scan would have written at least one miss in it (honest journal)', () => {
  const p = proto(1);
  const gap = { fromMs: new Date(2026, 9, 2, 0, 0).getTime(), toMs: new Date(2026, 9, 6, 0, 0).getTime() };
  // Every dose of the gap logged on the phone: nothing was missed → no line.
  const all = [2, 3, 4, 5].map((d) => ({ protocol_id: 1, outcome: 'Taken', logged_at: at(d, 20, 5) }));
  assert.deepEqual(U.gapsWithMisses([gap], [p], all, NOW, SINCE, {}), []);
  // Two not logged → the line, with its count.
  const some = [2, 3].map((d) => ({ protocol_id: 1, outcome: 'Taken', logged_at: at(d, 20, 5) }));
  assert.deepEqual(U.gapsWithMisses([gap], [p], some, NOW, SINCE, {}), [{ ...gap, count: 2 }]);
  // No protocol during the gap → no line.
  assert.deepEqual(U.gapsWithMisses([gap], [proto(1, { start_date: '2026-10-20', created_at: '2026-10-20T00:00:00Z' })], [], NOW, SINCE, {}), []);
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

test("one period when the date already ends in one (simulator 2026-10-26: \"desde 18 de out..\")", () => {
  assert.equal(U.fillDate("Este celular não sincroniza desde {date}. Sincronize", "18 de out."), "Este celular não sincroniza desde 18 de out. Sincronize");
  assert.equal(U.fillDate("This phone hasn't synced since {date}. Sync", "Oct 18"), "This phone hasn't synced since Oct 18. Sync");
  assert.equal(U.fillDate("Dieses Handy ist seit {date} nicht synchronisiert.", "18. Okt."), "Dieses Handy ist seit 18. Okt. nicht synchronisiert.");
  const src = fs.readFileSync(path.join(__dirname, "..", "screens/SettingsScreen.js"), "utf8");
  assert.match(src, /fillDate\(t\('settings_report_unsynced'\)/);
});

test('code review #1: the report never hides the screen\'s notice() helper (the empty report shows its own message)', () => {
  const src = read('screens/SettingsScreen.js');
  const fn = src.slice(src.indexOf('async function handleAdherenceReport'), src.indexOf('function shareReport'));
  assert.doesNotMatch(fn, /const notice\s*=/);
  assert.match(fn, /notice\(t\('settings_report_title'\), t\('settings_report_empty'\)\)/);
});

test('code review #5: a phone that never synced never prints a made-up "since" date', () => {
  const src = read('screens/SettingsScreen.js');
  assert.ok(src.includes("'report_unsynced_never'") && src.includes("'settings_report_unsynced_never'"));
  assert.doesNotMatch(src, /Math\.min\(\.\.\.unsync\.held/);
});

test('code review #6: Sync now rebuilds the report only while its page is open; Share waits for it', () => {
  const src = read('screens/SettingsScreen.js');
  const fn = src.slice(src.indexOf('async function reportSyncNow'), src.indexOf('async function reportSyncNow') + 600);
  assert.match(fn, /reportOpenRef\.current/);
  assert.match(src, /onPress=\{shareReport\} disabled=\{reportSyncing\}/);
});

test('code review #7: the Dose log card follows a finished sync and Today\'s changes on the Fold page', () => {
  const src = read('screens/LogScreen.js');
  assert.match(src, /addSyncListener\(/);
  assert.match(src, /if \(embedded\) \{ fetchLogs\(\); refreshUnsync\(\); \}/);
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

test('six languages: every new key, with the singular forms', () => {
  const { translations } = require('../i18n/translations.js');
  const keys = ['log_unsynced_title', 'log_unsynced_never', 'log_unsynced_count', 'log_unsynced_count_one', 'log_unsynced_old', 'sync_now', 'log_unrecorded_n', 'log_unrecorded_n_one', 'report_unsynced', 'report_unsynced_never', 'report_unrecorded', 'report_gap', 'settings_report_unsynced', 'settings_report_unsynced_never'];
  for (const lang of ['en', 'pt', 'es', 'fr', 'de', 'it']) for (const k of keys) assert.ok(translations[lang][k], `${lang}.${k}`);
  assert.equal(translations.pt.log_unsynced_title, 'Sem sincronização desde {date}');
  assert.equal(translations.pt.sync_now, 'Sincronizar agora');
});
