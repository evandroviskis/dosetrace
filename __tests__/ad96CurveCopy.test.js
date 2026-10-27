'use strict';
// AD-96 B copy (1.3.2), spec docs/specs/curve-logged-doses.md PK-11 / PK-18. Founder 2026-10-26
// 18:13 EDT on docs/design/ad96-curve-copy.html: "B, E-A, sim no cartão, textos aprovados" — the
// one-time notice is a card at the top of the curve (B, it stays until "Entendi"), "from your logged
// doses" is labelled at the Now marker on the chart (E-A), the "No doses logged yet" line is under
// the number on the curve AND on the Journey tile, and every text of the picture's table ×6.
// The fixture is the picture's own table (scratch generator → __tests__/fixtures/ad96-curve-copy.json).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations } = require('../i18n/translations.js');
const M = require('../lib/serumModel');
const N = require('../lib/curveNotice');

const COPY = require('./fixtures/ad96-curve-copy.json');
const LANGS = ['en', 'pt', 'es', 'fr', 'de', 'it'];
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('every approved text, word for word, in six languages', () => {
  for (const [key, byLang] of Object.entries(COPY)) {
    if (key.startsWith('__')) continue;
    for (const l of LANGS) assert.equal(translations[l][key], byLang[l], `${key} ${l}`);
  }
  // The notice button keeps the app's own "Got it" words (team_msg_got_it).
  for (const l of LANGS) assert.equal(translations[l].curve_logged_notice_ok, translations[l].team_msg_got_it, l);
});

// Decision B (one release): the approved curve line is in What's New 1.3.1 (release-notes/1.3.2.json removed).
test('What\'s New 1.3.1 carries the approved curve line in the six store languages', () => {
  const notes = JSON.parse(read('store/whats-new-1.3.1.json'));
  for (const l of LANGS) assert.ok(notes[l].includes(COPY.__whats_new[l]) && notes.ios[l].includes(COPY.__whats_new[l]), l);
});

// ---- PK-11: the "No doses logged yet" rule ----
const NOW = new Date(2026, 9, 26, 9, 41).getTime();
const enanthate = { id: 7, type: 'recon', name: 'Testosterone Enanthate', compound_id: null, dose: '125', dose_unit: 'mg', frequency: 'weekly', interval_days: 7, doses_per_day: 1, reminder_time: '08:00', start_date: '2026-10-26', created_at: new Date(2026, 9, 26, 7, 0).toISOString(), active: 1 };
const row = (o) => ({ id: 1, protocol_id: 7, outcome: 'Taken', logged_at: new Date(NOW - 60000).toISOString(), sync_status: 'synced', ...o });

test('PK-11: a protocol with no dose marked complete reads "no doses logged"; the first Taken row ends it', () => {
  assert.equal(M.hasLoggedDose(enanthate, [], NOW), false);
  assert.equal(M.hasLoggedDose(enanthate, [row({ outcome: 'Skipped' }), row({ outcome: 'Missed' })], NOW), false, 'Skipped / Missed are not logged doses');
  assert.equal(M.hasLoggedDose(enanthate, [row({ protocol_id: 8 })], NOW), false, 'another protocol\'s row');
  assert.equal(M.hasLoggedDose(enanthate, [row({ sync_status: 'deleted' })], NOW), false, 'a deleted row');
  assert.equal(M.hasLoggedDose(enanthate, [row({ logged_at: new Date(NOW + 3600000).toISOString() })], NOW), false, 'a row after now (R9)');
  assert.equal(M.hasLoggedDose(enanthate, [row({ logged_at: 'garbage' })], NOW), false, 'an unparseable time (R9)');
  assert.equal(M.hasLoggedDose(enanthate, [row()], NOW), true);
  // A blend component reads its source protocol's rows.
  assert.equal(M.hasLoggedDose({ ...enanthate, id: '7__bpc', __blend: true }, [row()], NOW), true);
});

test('PK-11: the Journey tile number carries the same flag as the curve (tile == screen)', () => {
  const none = M.defaultCurveLevel([enanthate], NOW, undefined, null, { logs: [], history: [enanthate] });
  assert.equal(none.noLogs, true);
  assert.equal(none.value, 0);
  const one = M.defaultCurveLevel([enanthate], NOW, undefined, null, { logs: [row()], history: [enanthate] });
  assert.equal(one.noLogs, false);
});

test('PK-11: a reload that only ends the "no doses logged" line still updates the tile', () => {
  const { sameCurveLevel } = require('../lib/curveReload');
  const p = { id: 7 };
  assert.equal(sameCurveLevel({ protocol: p, value: 0, unit: 'mg', noLogs: true }, { protocol: p, value: 0, unit: 'mg', noLogs: false }), false);
  assert.equal(sameCurveLevel({ protocol: p, value: 0, unit: 'mg', noLogs: true }, { protocol: p, value: 0, unit: 'mg', noLogs: true }), true);
});

// ---- The one-time notice (B): who sees it ----
const HOUR = 3600000;
const SINCE = NOW - 2 * HOUR; // this phone first ran 1.3.2 two hours ago
const old = { id: 1, created_at: new Date(SINCE - 30 * 24 * HOUR).toISOString() };
const fresh = { id: 2, created_at: new Date(SINCE + HOUR).toISOString() };

test('the notice: an account with a protocol added before 1.3.2 first ran sees it until "Got it"', () => {
  assert.equal(N.shouldShowCurveNotice({ meta: {}, protocols: [old], since: SINCE, localSeen: null, userId: 'u' }), true);
  // It stays at every open until the button (B never blocks, never times out).
  assert.equal(N.shouldShowCurveNotice({ meta: {}, protocols: [old, fresh], since: SINCE, localSeen: null, userId: 'u' }), true);
  // "Got it": stored in the account (one key) and on this phone for that account.
  assert.equal(N.shouldShowCurveNotice({ meta: { [N.NOTICE_META_KEY]: true }, protocols: [old], since: SINCE, localSeen: null, userId: 'u' }), false);
  assert.equal(N.shouldShowCurveNotice({ meta: {}, protocols: [old], since: SINCE, localSeen: { userId: 'u' }, userId: 'u' }), false);
  // Another account's "Got it" on this phone does not count.
  assert.equal(N.shouldShowCurveNotice({ meta: {}, protocols: [old], since: SINCE, localSeen: { userId: 'other' }, userId: 'u' }), true);
});

test('the notice: new accounts never see it; unknown start or no protocol → nothing', () => {
  assert.equal(N.shouldShowCurveNotice({ meta: {}, protocols: [fresh], since: SINCE, localSeen: null, userId: 'u' }), false, 'every protocol added on 1.3.2');
  assert.equal(N.shouldShowCurveNotice({ meta: {}, protocols: [], since: SINCE, localSeen: null, userId: 'u' }), false);
  assert.equal(N.shouldShowCurveNotice({ meta: {}, protocols: [old], since: null, localSeen: null, userId: 'u' }), false, 'no marker yet: never guess');
  assert.equal(N.shouldShowCurveNotice({ meta: {}, protocols: [{ id: 3, created_at: 'bad' }], since: SINCE, localSeen: null, userId: 'u' }), false);
  assert.equal(N.shouldShowCurveNotice({ meta: {}, protocols: [old], since: SINCE, localSeen: null, userId: null }), false, 'signed out');
});

function memStore() {
  const m = new Map();
  return { m, getItem: async (k) => (m.has(k) ? m.get(k) : null), setItem: async (k, v) => { m.set(k, v); }, removeItem: async (k) => { m.delete(k); } };
}

test('the marker: written once, at the first run of this code on this phone; never moved later', async () => {
  const store = memStore();
  const n = N.createCurveNotice({ storage: store, now: () => SINCE, writeMeta: async () => ({}) });
  assert.equal(await n.markSince(), SINCE);
  const later = N.createCurveNotice({ storage: store, now: () => SINCE + 99 * HOUR, writeMeta: async () => ({}) });
  assert.equal(await later.markSince(), SINCE, 'kept');
  assert.equal(await later.readSince(), SINCE);
  // Broken storage never throws.
  const broken = N.createCurveNotice({ storage: { getItem: async () => { throw new Error('x'); }, setItem: async () => { throw new Error('x'); } }, now: () => SINCE, writeMeta: async () => ({}) });
  assert.equal(await broken.markSince(), null);
  assert.equal(await broken.readSince(), null);
});

test('"Got it": one merge-write of its own key; a failed write keeps it hidden here and retries at the next check', async () => {
  const store = memStore();
  const writes = [];
  let fail = true;
  const n = N.createCurveNotice({ storage: store, now: () => NOW, writeMeta: async (data) => { writes.push(data); return fail ? { error: 'offline' } : {}; } });
  await n.markSince();
  await n.dismiss('u');
  assert.deepEqual(writes, [{ [N.NOTICE_META_KEY]: true }], 'only its own key (Supabase merges user_metadata keys)');
  assert.equal(await n.shouldShow({ userId: 'u', meta: {}, protocols: [{ id: 1, created_at: new Date(NOW - 99 * 24 * HOUR).toISOString() }] }), false, 'hidden on this phone');
  fail = false;
  await n.flush('u', {});
  assert.equal(writes.length, 2, 'retried');
  await n.flush('u', { [N.NOTICE_META_KEY]: true });
  assert.equal(writes.length, 2, 'nothing left to send once the account has it');
});

// ---- The screens ----
test('Curve screen: notice card B at the top, Got it; no-logs lines; label at Now (E-A); legend + note', () => {
  const src = read('screens/SerumCurveScreen.js');
  for (const k of ['curve_logged_notice_title', 'curve_logged_notice_body', 'curve_logged_notice_ok', 'curve_no_logs', 'curve_no_logs_named', 'curve_lg_estimate', 'curve_lg_projection', 'curve_lg_declared', 'curve_marked_time_note']) {
    assert.ok(src.includes(`t('${k}')`), k);
  }
  // B: an inline card, never a sheet over the curve.
  const card = src.slice(src.indexOf("t('curve_logged_notice_title')") - 600, src.indexOf("t('curve_logged_notice_ok')") + 200);
  assert.doesNotMatch(card, /DTSheet|Modal/);
  assert.match(card, /dismissCurveNotice|curveNotice\.dismiss/);
  // E-A: the label is drawn in the chart at the Now marker, from the legend's own words.
  assert.match(src, /nowLabelLines\(t\('curve_lg_estimate'\)\)/);
  // The declared key only while the start-date line is inside the window.
  const lg = src.slice(src.indexOf("t('curve_lg_declared')") - 300, src.indexOf("t('curve_lg_declared')"));
  assert.match(lg, /estBefore/);
  // The no-logs line reads the same rule as the tile.
  assert.match(src, /hasLoggedDose\(/);
});

test('E-A label lines: two balanced lines at a word break; one short word stays one line', () => {
  assert.deepEqual(M.nowLabelLines('com base nas doses registradas'), ['com base nas', 'doses registradas']);
  assert.deepEqual(M.nowLabelLines('from your logged doses'), ['from your', 'logged doses']);
  assert.deepEqual(M.nowLabelLines('dalle dosi registrate'), ['dalle dosi', 'registrate']);
  assert.deepEqual(M.nowLabelLines('logged'), ['logged']);
  assert.deepEqual(M.nowLabelLines(''), []);
});

test('Journey tile: "No doses logged yet" under the number while the protocol has none', () => {
  const src = read('screens/JourneyScreen.js');
  const tile = src.slice(src.indexOf("title={t('body_card_dosing_title')}"), src.indexOf("t('body_card_dosing_desc')"));
  assert.match(tile, /level\.noLogs \? <Text[^>]*>\{t\('curve_no_logs'\)\}<\/Text> : null/);
});

test('App start writes the 1.3.2 marker (fire and forget, never awaited in the auth listener)', () => {
  const app = read('App.js');
  assert.match(app, /markCurveNoticeSince\(\)/);
  const cb = app.slice(app.indexOf('onAuthStateChange('), app.indexOf('onAuthStateChange(') + 1500);
  assert.doesNotMatch(cb, /markCurveNoticeSince/);
});

// Device check 2026-10-26 (iPhone 17 Pro Max simulator, pt): with the default window (3 days back,
// Now at ~124 px of the 325 px chart) the label went to the RIGHT of Now, over the dashed plan; the
// approved picture puts it LEFT of Now, right-aligned 6 px before the line. The text may use the
// empty mg gutter (no tick label at that height); it goes right only when even that is too narrow.
test('E-A label side: left of Now as in the picture; right only when it cannot fit', () => {
  const pt = M.nowLabelLines('com base nas doses registradas');
  assert.deepEqual(M.nowLabelPlacement(pt, 124, 38), { x: 118, anchor: 'end' });
  const en = M.nowLabelLines('from your logged doses');
  assert.deepEqual(M.nowLabelPlacement(en, 124, 38), { x: 118, anchor: 'end' });
  // Now very close to the left edge (a 90-day projection): right of the line.
  assert.deepEqual(M.nowLabelPlacement(pt, 50, 38), { x: 56, anchor: 'start' });
  const src = read('screens/SerumCurveScreen.js');
  assert.match(src, /nowLabelPlacement\(/);
});
