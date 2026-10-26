'use strict';
// Data review of A-132 (2026-10-26): in the "New vial" window (Today's vial prompt and "New vial" on
// the protocol page) a day after today typed as the mix date silently became last year
// (lib/schedule.js toPastDateString: Nov 5 typed on Oct 26 was saved as last year's Nov 5, so the
// vial looked expired the moment it was started). Now both windows use the "Edit vial" rule
// (lib/vialEdit.js editMixDate, AD-80 EV-3): the nearer of this year's and last year's day; when
// that is after today it is refused in the window with the same message ("Date in the future"),
// nothing written. An impossible day (Feb 31) keeps the invalid-date message.
// These tests run the real save functions of both screens with a fixed clock.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read, sliceBlock } = require('./helpers/extractFn');
const { editMixDate } = require('../lib/vialEdit');
const { boxExpiresOn } = require('../lib/protocolForm');

// A Date whose "now" is fixed (new Date() with no argument); everything else is the real Date.
function clockAt(y, m, d) {
  const fixed = new Date(y, m, d, 10, 0, 0).getTime();
  return class FixedDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(fixed); }
    static now() { return fixed; }
  };
}

const t = (k) => k;
const RECON = { id: 7, type: 'recon', name: 'Tirzepatide', amount: '10', unit: 'mg', dose: '2.5', dose_unit: 'mg', water: '1' };
const RTU = { id: 8, type: 'rtu', name: 'Testosterone' };

function harness() {
  const calls = { started: [], sheets: [], closed: 0, newVialFor: [], synced: 0 };
  const db = { deactivateVialsByProtocol() {}, insertVial() { return 1; }, updateProtocol() {}, withImmediateTransaction: (fn) => fn() };
  const common = {
    getCachedUser: async () => ({ id: 'user-A' }),
    editMixDate, boxExpiresOn, t,
    startNewVial: (p, mixDate, userId, _db, opts) => { calls.started.push({ p, mixDate, userId, opts }); return 1; },
    ...db,
    afterProtocolChange: async () => {},
    fetchProtocols() {}, requestSync() { calls.synced++; },
    friendlyError: (e) => `ERR:${e && e.message}`,
  };
  return { calls, common };
}

// Today's vial prompt (screens/TodayScreen.js createNewVial).
function todaySave(now, protocol = RECON) {
  const { calls, common } = harness();
  const fn = loadFn('screens/TodayScreen.js', 'async function createNewVial(', 'createNewVial', {
    ...common, Date: now, continuationProtocol: protocol,
    setVialSheet: (s) => calls.sheets.push(s), okButton: () => [{ label: 'ok', kind: 'primary' }],
    closeVialPrompt: () => { calls.closed++; },
  });
  return { fn, calls };
}

// "New vial" on the protocol page (screens/ProtocolsScreen.js saveNewVial).
function protocolSave(now, protocol = RECON) {
  const { calls, common } = harness();
  const fn = loadFn('screens/ProtocolsScreen.js', 'async function saveNewVial(', 'saveNewVial', {
    ...common, Date: now, newVialFor: protocol, vialsByProtocol: { [protocol.id]: { id: 1, doses_taken: 3 } },
    setNewVialSheet: (s) => calls.sheets.push(s), setNewVialFor: (v) => calls.newVialFor.push(v),
  });
  return { fn, calls };
}

const WINDOWS = [['Today', todaySave], ['protocol page', protocolSave]];
const OCT26 = clockAt(2026, 9, 26);
const JAN5 = clockAt(2027, 0, 5);

for (const [where, open] of WINDOWS) {
  test(`NV-future (${where}): Nov 5 typed on Oct 26 is refused in the window, nothing written`, async () => {
    const { fn, calls } = open(OCT26);
    await fn({ month: 10, day: '5' });
    assert.equal(calls.started.length, 0, 'no vial started (never last year\'s Nov 5)');
    assert.equal(calls.sheets.length, 1);
    assert.equal(calls.sheets[0].title, 'vial_edit_future_title', 'the same message as Edit vial');
    assert.equal(calls.sheets[0].body, 'vial_edit_future_body');
    assert.equal(calls.closed, 0, 'the window stays open');
    assert.deepEqual(calls.newVialFor, [], 'the window stays open');
    assert.equal(calls.synced, 0);
  });

  test(`NV-future (${where}): Jun 10 typed on Jan 5 is refused (this year's is nearer and in the future)`, async () => {
    const { fn, calls } = open(JAN5);
    await fn({ month: 5, day: '10' });
    assert.equal(calls.started.length, 0);
    assert.equal(calls.sheets[0].title, 'vial_edit_future_title');
  });

  test(`NV-future (${where}): today and earlier days this year are saved as typed`, async () => {
    for (const [month, day, date] of [[9, '26', '2026-10-26'], [9, '25', '2026-10-25'], [8, '13', '2026-09-13']]) {
      const { fn, calls } = open(OCT26);
      await fn({ month, day });
      assert.equal(calls.sheets.length, 0, `${date}: no message`);
      assert.equal(calls.started.length, 1);
      assert.equal(calls.started[0].mixDate, date);
    }
  });

  test(`NV-future (${where}): a December vial started in January is last December (the nearer day)`, async () => {
    const { fn, calls } = open(JAN5);
    await fn({ month: 11, day: '28' });
    assert.equal(calls.started.length, 1);
    assert.equal(calls.started[0].mixDate, '2026-12-28');
    assert.equal(calls.sheets.length, 0);
  });

  test(`NV-future (${where}): an impossible day keeps the invalid-date message, nothing written`, async () => {
    for (const [month, day] of [[1, '31'], [3, '31']]) {
      const { fn, calls } = open(OCT26);
      await fn({ month, day });
      assert.equal(calls.started.length, 0);
      assert.equal(calls.sheets[0].body, 'today_invalid_date');
    }
  });
}

test('NV-future: a ready-to-use vial on the protocol page still starts with the box month/year (no mix date)', async () => {
  const { fn, calls } = protocolSave(OCT26, RTU);
  await fn({ month: 10, day: '5', expMonth: 5, expYear: 2028 });
  assert.equal(calls.started.length, 1);
  assert.equal(calls.started[0].mixDate, null);
  assert.equal(calls.started[0].opts.expiresOn, boxExpiresOn(5, 2028));
  assert.equal(calls.sheets.length, 0);
});

test('NV-future: the year-back rule is gone from the app (rebuild = replace)', () => {
  for (const f of ['lib/schedule.js', 'screens/TodayScreen.js', 'screens/ProtocolsScreen.js']) {
    assert.doesNotMatch(read(f), /toPastDateString/, `${f}: no toPastDateString`);
  }
  for (const [f, header] of [['screens/TodayScreen.js', 'async function createNewVial('], ['screens/ProtocolsScreen.js', 'async function saveNewVial(']]) {
    assert.match(sliceBlock(read(f), header), /editMixDate\(month, day, null, new Date\(\)\)/, `${f}: the Edit vial rule`);
  }
});
