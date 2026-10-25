'use strict';
// DV-006 (S1, AD-02): starred lab markers and test labels were written as WHOLE arrays/objects to
// user_metadata from the screen's cached copy, failures swallowed, and a star stored under an older
// name variant could never be cleared. Now: every change is one operation applied to the FRESH
// server value (never a stale copy), only that key is written, a failure is reported (the screen
// says so and undoes only that change), and stars match by the canonical marker key.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/bodyPrefs');
const { read } = require('./helpers/extractFn');

// A fake account server: user_metadata with GoTrue's top-level key merge on update.
function server(meta = {}) {
  const s = { meta: JSON.parse(JSON.stringify(meta)), up: true, writes: [] };
  s.device = (cachedMeta) => ({
    cached: JSON.parse(JSON.stringify(cachedMeta || s.meta)), // what this phone's session holds
    deps: {
      readFresh: async () => { if (!s.up) throw new Error('Network request failed'); return JSON.parse(JSON.stringify(s.meta)); },
      write: async (data) => { if (!s.up) return { error: new Error('Network request failed') }; s.writes.push(data); Object.assign(s.meta, JSON.parse(JSON.stringify(data))); return { error: null }; },
    },
  });
  return s;
}

test('DV-006: a star on the older name variant is cleared by toggling the current label', () => {
  const favs = ['Total Testosterone'];
  assert.equal(P.isFavorite(favs, 'Testosterone, Total'), true, 'the variant shows as starred');
  const next = P.setFavorite(favs, 'Testosterone, Total', false);
  assert.equal(P.isFavorite(next, 'Testosterone, Total'), false, 'un-starring clears every variant');
  assert.deepEqual(next, []);
  assert.deepEqual(P.setFavorite([], 'Testosterone, Total', true), ['Testosterone, Total']);
  assert.deepEqual(P.setFavorite(['Total Testosterone'], 'Testosterone, Total', true), ['Total Testosterone'], 'no duplicate variant');
});

test('DV-006: two phones — A stars X, B (stale session) stars Y → both kept', async () => {
  const srv = server({ favorite_markers: [], name: 'Sam' });
  const A = srv.device();
  const B = srv.device(); // B's cached copy has no stars and never learns about X
  const ra = await P.saveBodyPref(A.deps, 'favorite_markers', (cur) => P.setFavorite(P.asList(cur), 'Ferritin', true));
  assert.equal(ra.ok, true);
  const rb = await P.saveBodyPref(B.deps, 'favorite_markers', (cur) => P.setFavorite(P.asList(cur), 'Vitamin D', true));
  assert.equal(rb.ok, true);
  assert.deepEqual(srv.meta.favorite_markers.sort(), ['Ferritin', 'Vitamin D']);
  assert.deepEqual(rb.value.sort(), ['Ferritin', 'Vitamin D'], 'B now shows both');
  assert.equal(srv.meta.name, 'Sam', 'other metadata untouched');
  assert.ok(srv.writes.every((w) => Object.keys(w).length === 1 && w.favorite_markers), 'only the one key is written');
});

test('DV-006: test labels merge the same way (A labels a test, B labels another, both kept; removal removes only that label)', async () => {
  const srv = server({ report_tags: {} });
  const A = srv.device();
  const B = srv.device();
  await P.saveBodyPref(A.deps, 'report_tags', (cur) => P.setReportTag(P.asTags(cur), '2026-09-01', 'baseline', true));
  await P.saveBodyPref(B.deps, 'report_tags', (cur) => P.setReportTag(P.asTags(cur), '2026-10-01', 'week 8', true));
  await P.saveBodyPref(B.deps, 'report_tags', (cur) => P.setReportTag(P.asTags(cur), '2026-09-01', 'fasted', true));
  assert.deepEqual(srv.meta.report_tags, { '2026-09-01': ['baseline', 'fasted'], '2026-10-01': ['week 8'] });
  await P.saveBodyPref(A.deps, 'report_tags', (cur) => P.setReportTag(P.asTags(cur), '2026-09-01', 'baseline', false));
  assert.deepEqual(srv.meta.report_tags, { '2026-09-01': ['fasted'], '2026-10-01': ['week 8'] });
  await P.saveBodyPref(A.deps, 'report_tags', (cur) => P.dropReportDate(P.asTags(cur), '2026-10-01'));
  assert.deepEqual(srv.meta.report_tags, { '2026-09-01': ['fasted'] });
  assert.deepEqual(P.setReportTag({ d: ['Baseline'] }, 'd', 'baseline', true), { d: ['Baseline'] }, 'case-insensitive duplicate kept once');
});

test('DV-006: offline → the save reports failure and writes nothing (the screen undoes the one change and says so)', async () => {
  const srv = server({ favorite_markers: ['Ferritin'] });
  const A = srv.device();
  srv.up = false;
  const r = await P.saveBodyPref(A.deps, 'favorite_markers', (cur) => P.setFavorite(P.asList(cur), 'Vitamin D', true));
  assert.equal(r.ok, false);
  assert.deepEqual(srv.meta.favorite_markers, ['Ferritin']);
  // a write refused by the server (read fine) is a failure too
  srv.up = true;
  const refusing = { readFresh: A.deps.readFresh, write: async () => ({ error: new Error('500') }) };
  assert.equal((await P.saveBodyPref(refusing, 'favorite_markers', (cur) => P.setFavorite(P.asList(cur), 'Zinc', true))).ok, false);
});

test('DV-006: an unreadable fresh value never becomes an empty list written back', async () => {
  const writes = [];
  const r = await P.saveBodyPref({ readFresh: async () => null, write: async (d) => { writes.push(d); return { error: null }; } }, 'favorite_markers', (cur) => P.setFavorite(P.asList(cur), 'Zinc', true));
  assert.equal(r.ok, false);
  assert.deepEqual(writes, [], 'no read → no write (a stale or empty read must never clobber)');
});

test('DV-006: BodyScreen writes through saveBodyPref, never a whole array from its cached copy, and says when it failed', () => {
  const src = read('screens/BodyScreen.js');
  assert.doesNotMatch(src, /updateUser\(\{ data: \{ favorite_markers: next \} \}\)\.catch\(\(\) => \{\}\)/);
  assert.doesNotMatch(src, /updateUser\(\{ data: \{ report_tags: next \} \}\)\.catch\(\(\) => \{\}\)/);
  assert.match(src, /saveBodyPref\(bodyPrefDeps, 'favorite_markers'/);
  assert.match(src, /saveBodyPref\(bodyPrefDeps, 'report_tags'/);
  assert.match(src, /t\('error_save_failed'\)/);
  assert.match(src, /isFav: isFavorite\(favorites, display\)/);
});
