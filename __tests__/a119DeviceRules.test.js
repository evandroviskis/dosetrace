'use strict';
// A-119 (docs/specs/one-active-device.md): the pure rules of "one active device per account".
//   OD-5  — only the server's confirmed answer (a JSON status 'replaced' / 'superseded' /
//           'account_gone') is ever a verdict; a network error, a timeout, a 5xx, a 401, a missing
//           function (PGRST202) or a garbled reply is 'unknown' and never wipes.
//   OD-7  — the server's refusal is a distinct error code (DT001 not active, DT002 device id
//           required, DT003 update required), never a silent empty result.
//   OD-17 — a minimum-app-version check exists (versionBelow).
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/deviceRules');

test('OD-7: only DT001 / DT002 / DT003 are device refusals', () => {
  assert.equal(R.refusalOf({ code: 'DT001', message: 'device_not_active' }), 'not_active');
  assert.equal(R.refusalOf({ code: 'DT002' }), 'device_required');
  assert.equal(R.refusalOf({ code: 'DT003' }), 'update_required');
  for (const e of [null, undefined, {}, { code: '42501' }, { code: 'PGRST202' }, { message: 'DT001' }, { code: 401 }, new Error('Network request failed')]) {
    assert.equal(R.refusalOf(e), null, JSON.stringify(e));
  }
  assert.equal(R.isDeviceRefusal({ code: 'DT001' }), true);
  assert.equal(R.isDeviceRefusal({ code: '23505' }), false);
});

test('OD-5: a status is a verdict only when the server answered it as JSON', () => {
  const ok = (data) => R.parseStatus({ data, error: null });
  assert.equal(ok({ status: 'active' }).status, 'active');
  assert.equal(ok({ status: 'replaced', at: '2026-10-15T12:10:00Z' }).status, 'replaced');
  assert.equal(ok({ status: 'superseded', at: '2026-10-15T12:10:00Z' }).status, 'superseded');
  assert.equal(ok({ status: 'account_gone' }).status, 'account_gone');
  assert.equal(ok({ status: 'in_use', device: { platform: 'ios', name: 'iPhone' } }).status, 'in_use');
  assert.equal(ok({ status: 'none' }).status, 'none');
  // Anything else is unknown: never a wipe on a maybe.
  for (const res of [
    { data: null, error: { message: 'Network request failed' } },
    { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } },
    { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } },
    { data: null, error: { status: 401 } },
    { data: 'replaced', error: null },
    { data: { status: 'REPLACED' }, error: null },
    { data: { status: 'replaced' }, error: { message: 'x' } },
    { data: [{ status: 'replaced' }], error: null },
    null,
    undefined,
  ]) {
    assert.equal(R.parseStatus(res).status, 'unknown', JSON.stringify(res));
  }
  assert.equal(R.isVerdict('replaced'), true);
  assert.equal(R.isVerdict('superseded'), true);
  assert.equal(R.isVerdict('account_gone'), true);
  assert.equal(R.isVerdict('unknown'), false);
  assert.equal(R.isVerdict('in_use'), false);
});

test('OD-17: versionBelow compares dotted versions numerically; unknown is never below', () => {
  assert.equal(R.versionBelow('1.3.0', '1.3.1'), true);
  assert.equal(R.versionBelow('1.3.1', '1.3.1'), false);
  assert.equal(R.versionBelow('1.10.0', '1.9.9'), false);
  assert.equal(R.versionBelow('1.2', '1.2.1'), true);
  assert.equal(R.versionBelow('2.0.0', '1.99.99'), false);
  assert.equal(R.versionBelow(null, '1.3.1'), false);
  assert.equal(R.versionBelow('1.3.0', null), false);
  assert.equal(R.versionBelow('abc', '1.0.0'), false);
});

test('OD-2 / ledger "name the other phone truthfully": the device kind, never a raw model code', () => {
  assert.deepEqual(R.deviceWords({ platform: 'ios', name: 'iPhone' }), { kind: 'named', name: 'iPhone' });
  assert.deepEqual(R.deviceWords({ platform: 'ios', name: 'iPad' }), { kind: 'named', name: 'iPad' });
  assert.deepEqual(R.deviceWords({ platform: 'android', name: 'Galaxy Z Fold7', brand: 'samsung' }), { kind: 'named', name: 'Galaxy Z Fold7' });
  assert.deepEqual(R.deviceWords({ platform: 'android', name: null, brand: 'samsung' }), { kind: 'brand', name: 'Samsung' });
  assert.deepEqual(R.deviceWords({ platform: 'android', brand: 'google' }), { kind: 'brand', name: 'Pixel' });
  // A raw model code is never shown: neither as a name nor as a brand.
  assert.deepEqual(R.deviceWords({ platform: 'android', name: 'SM-F966U', brand: 'samsung' }), { kind: 'brand', name: 'Samsung' });
  assert.deepEqual(R.deviceWords({ platform: 'android', name: 'SM-F966U', brand: 'SM-F966U' }), { kind: 'android', name: null });
  assert.deepEqual(R.deviceWords({ platform: 'android' }), { kind: 'android', name: null });
  assert.deepEqual(R.deviceWords({ platform: 'ios' }), { kind: 'named', name: 'iPhone' });
  assert.deepEqual(R.deviceWords(null), { kind: 'unknown', name: null });
  assert.deepEqual(R.deviceWords({}), { kind: 'unknown', name: null });
  assert.equal(R.looksLikeModelCode('SM-F966U'), true);
  assert.equal(R.looksLikeModelCode('Pixel 8'), false);
  assert.equal(R.looksLikeModelCode('Galaxy Z Fold7'), false);
});
