'use strict';
// A-38 (b): a Mark taken tap Today refuses (the dose was already logged from a notification or
// another device, or the protocol is no longer active) is no longer silent — the button used to
// just reset. lib/markTaken takeRefusal says why, Today shows it in its own sheet (title: the
// notification's "Nothing new logged"), on the card tap and when a queued site question finds
// its dose already logged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { takeRefusal } = require('../lib/markTaken');
const { sliceBlock } = require('./helpers/extractFn');

const p = { id: 1, active: 1, deleted_at: null, sync_status: 'synced' };

test('already logged → the already-logged words', () => {
  assert.deepEqual(takeRefusal({ protocol: p, alreadyLogged: true }), { reason: 'already', title: 'notif_taken_nothing_title', body: 'today_take_logged_body' });
});

test('ended, deleted or gone → the no-longer-active words (wins over already logged)', () => {
  for (const q of [{ ...p, active: 0 }, { ...p, deleted_at: '2026-10-01' }, { ...p, sync_status: 'deleted' }, null]) {
    assert.equal(takeRefusal({ protocol: q, alreadyLogged: true }).reason, 'inactive');
    assert.equal(takeRefusal({ protocol: q, alreadyLogged: false }).body, 'today_take_inactive_body');
  }
});

test('nothing refused → null', () => {
  assert.equal(takeRefusal({ protocol: p, alreadyLogged: false }), null);
});

test('Today shows the refusal on the card tap and for a dropped site question', () => {
  const today = fs.readFileSync(path.join(__dirname, '../screens/TodayScreen.js'), 'utf8');
  const mt = sliceBlock(today, '  async function markTaken(');
  assert.match(mt, /showTakeRefused\(protocol, res\);/);
  const q = sliceBlock(today, '  async function openNextQuestion(');
  assert.match(q, /showTakeRefused\(/);
  const fn = sliceBlock(today, '  function showTakeRefused(');
  assert.match(fn, /takeRefusal\(/);
  assert.match(fn, /showTodaySheet\(/);
});

test('the words exist in six languages, with the name where it is used', () => {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    const tr = mod.exports.translations[l];
    assert.ok(tr.today_take_logged_body, l);
    assert.match(tr.today_take_inactive_body, /\{name\}/, l);
    assert.ok(tr.notif_taken_nothing_title, l);
  }
});
