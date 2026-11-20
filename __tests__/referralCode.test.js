'use strict';
// The referral (creator) code on the entry offer — app side of the creators program
// (admin-panel/codigo/docs/specs/creators-app-side.md AP1, AP4). The server is not live yet,
// so for now the code is kept on the phone (its own AsyncStorage key) and sent to RevenueCat
// as the creator_code / creator_source attributes BEFORE any purchase (AP4: the webhook only
// counts a purchase whose attributes were already there). No server call.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/referralCode');

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: async (k) => (m.has(k) ? m.get(k) : null),
    setItem: async (k, v) => { m.set(k, String(v)); },
    removeItem: async (k) => { m.delete(k); },
  };
}
const broken = { getItem: async () => { throw new Error('x'); }, setItem: async () => { throw new Error('x'); }, removeItem: async () => { throw new Error('x'); } };
function recorder(ok = true) {
  const calls = [];
  const fn = async (a) => { calls.push(a); if (!ok) throw new Error('rc'); return true; };
  fn.calls = calls;
  return fn;
}

test('RC-1: the code is upper-cased and its spaces removed (AP1)', () => {
  assert.equal(R.normalizeReferralCode(' ana-ig '), 'ANA-IG');
  assert.equal(R.normalizeReferralCode('ana 10'), 'ANA10');
  assert.equal(R.normalizeReferralCode(null), '');
});

test('RC-2: the code shape is the server one: 3-12 letters/digits, optionally -SUFFIX (1-4 letters)', () => {
  for (const ok of ['ANA', 'ANA10', 'ANA-IG', 'TESTE-YT', 'ABCDEFGHIJKL']) assert.equal(R.isReferralCodeShape(ok), true, ok);
  for (const bad of ['', 'AN', 'ANA-', '-ANA', 'ANA_IG', 'ANA-IG-X', 'ANA-12', 'ÁNA', 'ABCDEFGHIJKLM', 'ANA-ABCDE']) assert.equal(R.isReferralCodeShape(bad), false, bad);
});

test('RC-3: applying stores the code under its own key and sets the RevenueCat attributes (typed)', async () => {
  const st = memStorage();
  const set = recorder();
  const r = await R.applyReferralCode(' ana-ig ', { storage: st, setAttributes: set, now: () => 1000 });
  assert.deepEqual(r, { ok: true, code: 'ANA-IG' });
  assert.equal(R.REFERRAL_KEY, 'dosetrace_referral_code');
  assert.deepEqual(JSON.parse(st.m.get(R.REFERRAL_KEY)), { code: 'ANA-IG', source: 'typed', savedAt: 1000 });
  assert.deepEqual(set.calls, [{ creator_code: 'ANA-IG', creator_source: 'typed' }]);
});

test('RC-4: a code in the wrong shape is refused and nothing is stored or sent', async () => {
  const st = memStorage();
  const set = recorder();
  assert.deepEqual(await R.applyReferralCode('a_b', { storage: st, setAttributes: set }), { ok: false, reason: 'shape' });
  assert.equal(st.m.size, 0);
  assert.equal(set.calls.length, 0);
});

test('RC-5: one side failing still keeps the code (the attributes are re-sent before the purchase)', async () => {
  const st = memStorage();
  assert.deepEqual(await R.applyReferralCode('ANA-IG', { storage: st, setAttributes: recorder(false) }), { ok: true, code: 'ANA-IG' });
  assert.ok(st.m.has(R.REFERRAL_KEY));
  const set = recorder();
  assert.deepEqual(await R.applyReferralCode('ANA-IG', { storage: broken, setAttributes: set }), { ok: true, code: 'ANA-IG' });
  assert.equal(set.calls.length, 1);
  assert.deepEqual(await R.applyReferralCode('ANA-IG', { storage: broken, setAttributes: recorder(false) }), { ok: false, reason: 'save' });
});

test('RC-6: reading the stored code never throws; a broken value reads as none', async () => {
  assert.deepEqual(await R.loadReferralCode(memStorage({ [R.REFERRAL_KEY]: JSON.stringify({ code: 'ANA-IG', source: 'typed', savedAt: 1 }) })), { code: 'ANA-IG', source: 'typed', savedAt: 1 });
  assert.equal(await R.loadReferralCode(memStorage()), null);
  assert.equal(await R.loadReferralCode(memStorage({ [R.REFERRAL_KEY]: '{oops' })), null);
  assert.equal(await R.loadReferralCode(memStorage({ [R.REFERRAL_KEY]: JSON.stringify({ code: 'a_b' }) })), null);
  assert.equal(await R.loadReferralCode(broken), null);
});

test('RC-7: removing clears the key and the attributes (null deletes a RevenueCat attribute)', async () => {
  const st = memStorage({ [R.REFERRAL_KEY]: JSON.stringify({ code: 'ANA-IG', source: 'typed', savedAt: 1 }) });
  const set = recorder();
  assert.equal(await R.removeReferralCode({ storage: st, setAttributes: set }), true);
  assert.equal(st.m.size, 0);
  assert.deepEqual(set.calls, [{ creator_code: null, creator_source: null }]);
  assert.equal(await R.removeReferralCode({ storage: broken, setAttributes: recorder(false) }), false);
});

test('RC-8: before a purchase the stored code is sent again; no code = nothing sent; never throws', async () => {
  const st = memStorage({ [R.REFERRAL_KEY]: JSON.stringify({ code: 'ANA-IG', source: 'typed', savedAt: 1 }) });
  const set = recorder();
  assert.equal(await R.syncReferralAttributes({ storage: st, setAttributes: set }), true);
  assert.deepEqual(set.calls, [{ creator_code: 'ANA-IG', creator_source: 'typed' }]);
  const none = recorder();
  assert.equal(await R.syncReferralAttributes({ storage: memStorage(), setAttributes: none }), false);
  assert.equal(none.calls.length, 0);
  assert.equal(await R.syncReferralAttributes({ storage: st, setAttributes: recorder(false) }), false);
  assert.equal(await R.syncReferralAttributes({ storage: broken, setAttributes: recorder() }), false);
});

test('RC-9: the attributes are only creator_code and creator_source (the webhook reads nothing else)', () => {
  assert.deepEqual(R.referralAttributes({ code: 'ANA-IG', source: 'typed' }), { creator_code: 'ANA-IG', creator_source: 'typed' });
  assert.deepEqual(R.referralAttributes({ code: 'ANA-IG', source: 'weird' }), { creator_code: 'ANA-IG', creator_source: 'typed' }, 'only the three sources the server knows');
  assert.deepEqual(R.referralAttributes(null), { creator_code: null, creator_source: null });
});
