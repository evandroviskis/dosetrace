'use strict';
// A-119 OD-18: this phone's identity. iOS: an id kept in the Keychain with "this device only" (never
// in a backup, so a new iPhone restored from the old one is a new device) and never cleared by a
// sign-out or a wipe; Android: ANDROID_ID (the same after a reinstall, the same folded and unfolded).
// Never derived from the window or screen size. A read that throws never makes a new id (that would
// make this phone a stranger to its own account).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDeviceIdentity, DEVICE_ID_KEY } = require('../lib/deviceIdentity');

function store(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    m,
    failGet: false,
    failSet: false,
    get: async function (k) { if (this.failGet) throw new Error('keychain locked'); return m.has(k) ? m.get(k) : null; },
    set: async function (k, v) { if (this.failSet) throw new Error('keychain full'); m.set(k, v); },
  };
}

test('iOS: a new id is kept and read back; the same id on every later read and after a "restart"', async () => {
  const s = store();
  let n = 0;
  const mk = () => createDeviceIdentity({ platform: 'ios', secureGet: (k) => s.get(k), secureSet: (k, v) => s.set(k, v), randomId: () => `r${++n}abcdef0123` });
  const a = await mk().getDeviceId();
  assert.match(a, /^i:/);
  assert.equal(await mk().getDeviceId(), a, 'reinstall / restart: the Keychain id stays');
  assert.equal(n, 1);
});

test('iOS: a read that throws never creates a new id (null: the check is skipped this time)', async () => {
  const s = store({ [DEVICE_ID_KEY]: 'i:old-device-0001' });
  s.failGet = true;
  let made = 0;
  const id = createDeviceIdentity({ platform: 'ios', secureGet: (k) => s.get(k), secureSet: (k, v) => s.set(k, v), randomId: () => { made++; return 'x'; } });
  assert.equal(await id.getDeviceId(), null);
  assert.equal(made, 0);
  assert.equal(s.m.get(DEVICE_ID_KEY), 'i:old-device-0001');
  s.failGet = false;
  assert.equal(await id.getDeviceId(), 'i:old-device-0001', 'tried again later');
});

test('a write that fails gives no id (never one that would not survive the next start)', async () => {
  const s = store();
  s.failSet = true;
  const id = createDeviceIdentity({ platform: 'ios', secureGet: (k) => s.get(k), secureSet: (k, v) => s.set(k, v), randomId: () => 'abcdef012345' });
  assert.equal(await id.getDeviceId(), null);
});

test('Android: ANDROID_ID (folded or unfolded, after a reinstall: the same); the Keystore only when the system gives none', async () => {
  const s = store();
  const id = createDeviceIdentity({ platform: 'android', androidId: () => '9774d56d682e549c', secureGet: (k) => s.get(k), secureSet: (k, v) => s.set(k, v), randomId: () => 'zzzzzzzzzzzz' });
  assert.equal(await id.getDeviceId(), 'a:9774d56d682e549c');
  assert.equal(s.m.size, 0, 'nothing stored');
  const none = createDeviceIdentity({ platform: 'android', androidId: () => { throw new Error('no'); }, secureGet: (k) => s.get(k), secureSet: (k, v) => s.set(k, v), randomId: () => 'abcdef012345' });
  assert.equal(await none.getDeviceId(), 'x:abcdef012345');
});

test('guards: the id is never cleared by a sign-out or a wipe, never from the window size; iOS this-device-only', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const rt = read('lib/deviceId.js');
  assert.match(rt, /AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY/);
  assert.match(rt, /getAndroidId\(\)/);
  assert.doesNotMatch(rt, /Dimensions|useWindowDimensions|windowSize|screen/i);
  for (const f of ['App.js', 'lib/signedOut.js', 'lib/signOutCore.js', 'lib/accountActions.js', 'lib/database.js', 'lib/deviceRuntime.js']) {
    assert.doesNotMatch(read(f), /dosetrace_device_id/, `${f} never touches the device id`);
  }
});
