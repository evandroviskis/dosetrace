'use strict';
// DV-008 (S1, DL-56 "profile and analytics writes report failures and keep the typed values"):
// Settings saveProfile and toggleAnalytics awaited supabase.auth.updateUser but never read the
// { error } it RESOLVES with (offline, refused session). A refused profile save closed Edit profile
// as if saved and re-read the old values over the typed ones; the analytics switch showed a value
// the account never stored. Fix (same pattern as toggleNotificationPref): read the error, keep the
// sheet open with the typed values and show the DoseTrace error sheet; the switch reverts.
// Runs the REAL handlers of screens/SettingsScreen.js with a fake Supabase.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn } = require('./helpers/extractFn');
const { friendlyError } = require('../lib/friendlyError');
const { normalizeActivityLevel, legacyActivity } = require('../lib/activityLevels');

const SETTINGS = 'screens/SettingsScreen.js';
const t = (k) => k;

// updateUser: 'ok' | 'error' (resolves { error }) | 'throw' (rejects).
function fakeSupabase(mode, writes) {
  return {
    auth: {
      updateUser: async (attrs) => {
        writes.push(attrs);
        if (mode === 'throw') throw new Error('Network request failed');
        if (mode === 'error') return { data: { user: null }, error: { message: 'Network request failed', status: 0 } };
        return { data: { user: { id: 'u1' } }, error: null };
      },
    },
  };
}

function profile(mode, supabase = null) {
  const out = { writes: [], editSheet: [], closedEdit: 0, closedPicker: 0, refetched: 0 };
  const save = loadFn(SETTINGS, 'async function saveProfile(', 'saveProfile', {
    t, friendlyError, normalizeActivityLevel, legacyActivity,
    supabase: supabase || fakeSupabase(mode, out.writes),
    savingProfile: { current: false },
    // The typed values in Edit profile.
    displayName: 'Sam Carter', birthMonth: 4, birthYear: 1985, gender: 'male', country: 'Portugal',
    primaryGoals: ['fat_loss'], activityLevel: 'moderate', hasProvider: 'yes',
    user: { id: 'u1', user_metadata: { display_name: 'Sam', activity_level: 'moderate', analytics_opt_in: false } },
    setEditSheet: (v) => out.editSheet.push(v),
    setShowEditProfile: (v) => { if (v === false) out.closedEdit++; },
    setShowCountryPicker: (v) => { if (v === false) out.closedPicker++; },
    fetchUser: () => { out.refetched++; },
  });
  return { out, save };
}

for (const mode of ['error', 'throw']) {
  test(`DV-008: a refused profile save (updateUser ${mode === 'error' ? 'resolves { error }' : 'throws'}) keeps Edit profile open with the typed values and shows the error sheet`, async () => {
    const { out, save } = profile(mode);
    await save();
    assert.equal(out.writes.length, 1, 'the save was tried');
    assert.equal(out.closedEdit, 0, 'Edit profile stays open');
    assert.equal(out.refetched, 0, 'the old values are never read back over the typed ones');
    assert.equal(out.editSheet.length, 1, 'one error sheet, shown from inside Edit profile');
    const sheet = out.editSheet[0];
    assert.equal(sheet.title, 'error');
    assert.equal(sheet.icon, 'warning');
    assert.equal(sheet.body, 'error_network', 'the app\'s friendly network message');
    assert.deepEqual(sheet.buttons.map((b) => [b.label, b.kind]), [['ok', 'primary']]);
  });
}

test('DV-008: a profile save that succeeds still closes Edit profile and re-reads the account', async () => {
  const { out, save } = profile('ok');
  await save();
  assert.equal(out.closedEdit, 1);
  assert.equal(out.refetched, 1);
  assert.equal(out.editSheet.length, 0);
});

test('DV-008: the profile write sends only the profile keys (merge, never clobber the other metadata)', async () => {
  const { out, save } = profile('ok');
  await save();
  const keys = Object.keys(out.writes[0].data).sort();
  for (const k of ['analytics_opt_in', 'dose_reminders', 'calc_inputs', 'calc_reality_open']) assert.ok(!keys.includes(k), `${k} is never written by Edit profile`);
  assert.equal(out.writes[0].data.display_name, 'Sam Carter');
});

function analytics(mode, supabase = null) {
  const out = { writes: [], values: [], errors: [] };
  const toggle = loadFn(SETTINGS, 'async function toggleAnalytics(', 'toggleAnalytics', {
    t, friendlyError,
    supabase: supabase || fakeSupabase(mode, out.writes),
    analyticsSaved: { current: true }, // what the account holds (fetchUser)
    setAnalyticsEnabled: (v) => out.values.push(v),
    errorSheet: (body) => out.errors.push(body),
    // The analytics queue / opt-out flag (__tests__/analyticsOptOutQueue covers them).
    user: { id: 'u1' },
    clearAnalyticsQueue: async () => {},
    noteAnalyticsChoice: async () => {},
  });
  return { out, toggle };
}

for (const mode of ['error', 'throw']) {
  test(`DV-008: a refused analytics switch (updateUser ${mode === 'error' ? 'resolves { error }' : 'throws'}) reverts and shows the error sheet`, async () => {
    const { out, toggle } = analytics(mode);
    await toggle(false);
    assert.deepEqual(out.writes.map((w) => w.data), [{ analytics_opt_in: false }], 'only its own key');
    assert.deepEqual(out.values, [false, true], 'the switch flips, then reverts to what the account holds');
    assert.deepEqual(out.errors, ['error_network']);
  });
}

test('DV-008: an analytics switch that saves stays where the user put it, with no sheet', async () => {
  const { out, toggle } = analytics('ok');
  await toggle(false);
  assert.deepEqual(out.values, [false]);
  assert.deepEqual(out.errors, []);
});

// A Supabase whose saves wait until the test answers them, in any order.
function slowSupabase(writes) {
  const pending = [];
  return {
    pending,
    auth: { updateUser: (attrs) => new Promise((resolve) => { writes.push(attrs); pending.push(resolve); }) },
  };
}
const refused = { data: { user: null }, error: { message: 'Network request failed' } };
const ok = { data: { user: { id: 'u1' } }, error: null };
const tick = () => new Promise((r) => setImmediate(r));

test('DV-008: two quick taps on the analytics switch that both fail end on what the account holds', async () => {
  const writes = [];
  const supa = slowSupabase(writes);
  const { out, toggle } = analytics('ok', supa);
  const a = toggle(false); // on → off
  const b = toggle(true);  // off → on, before the first answer
  supa.pending[0](refused); await tick();
  supa.pending[1](refused); await tick();
  await Promise.all([a, b]);
  assert.equal(out.values[out.values.length - 1], true, "the switch shows the account's value (on)");
});

test("DV-008: the same two failing taps answered in the other order still end on the account's value", async () => {
  const writes = [];
  const supa = slowSupabase(writes);
  const { out, toggle } = analytics('ok', supa);
  const a = toggle(false);
  const b = toggle(true);
  supa.pending[1](refused); await tick();
  supa.pending[0](refused); await tick();
  await Promise.all([a, b]);
  assert.equal(out.values[out.values.length - 1], true);
});

test('DV-008: after a saved tap, a later failing tap reverts to the newly saved value', async () => {
  const writes = [];
  const supa = slowSupabase(writes);
  const { out, toggle } = analytics('ok', supa);
  const a = toggle(false); supa.pending[0](ok); await a; // the account now holds off
  const b = toggle(true); supa.pending[1](refused); await b;
  assert.equal(out.values[out.values.length - 1], false);
});

test('DV-008: a double tap on Edit profile Save sends one save; after it is answered, Save works again', async () => {
  const writes = [];
  const supa = slowSupabase(writes);
  const { out, save } = profile('ok', supa);
  const a = save();
  const b = save(); // second tap while the first is in flight
  await tick();
  assert.equal(writes.length, 1, 'one save in flight');
  supa.pending[0](refused); await Promise.all([a, b]);
  assert.equal(out.editSheet.length, 1, 'one error sheet');
  const c = save(); await tick();
  assert.equal(writes.length, 2, 'a retry after the answer is sent');
  supa.pending[1](ok); await c;
  assert.equal(out.closedEdit, 1);
});
