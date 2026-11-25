'use strict';
// The referral (creator) code on the entry offer — app side of the creators program
// (admin-panel/codigo/docs/specs/creators-app-side.md, "Contrato já no ar"):
//  - Aplicar asks the server: GET /api/creator?op=code&c=CODE → valid (+ benefit_text) | unknown | ended;
//    offline / server error = "could not check now", never applied;
//  - a valid code is kept on the phone (its own key), sent to RevenueCat as creator_code /
//    creator_source (AP4, again right before every purchase), and recorded on the server
//    (POST /api/creator op attribution with the user's JWT, AP5); a failed record stays pending and
//    is retried on the next open (flushPendingAttribution).
// HTTP is always a mock (injected fetch): no test depends on a live code.
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
// A fetch mock: answer(url, opts) → { status, body } | 'offline'.
function mockFetch(answer) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url, opts });
    const a = answer(url, opts);
    if (a === 'offline') throw new TypeError('Network request failed');
    const status = a.status || 200;
    return { ok: status >= 200 && status < 300, status, json: async () => { if (a.body === undefined) throw new Error('no json'); return a.body; } };
  };
  fn.calls = calls;
  return fn;
}
const VALID = (code, benefit = null) => mockFetch(() => ({ body: { valid: true, code, platform: 'instagram', benefit_text: benefit } }));
const rec = (code, extra = {}) => JSON.stringify({ code, source: 'typed', savedAt: 1, valid: true, benefitText: null, ...extra });

test('RC-1: the code is upper-cased and its spaces removed (AP1)', () => {
  assert.equal(R.normalizeReferralCode(' teste-ig '), 'TESTE-IG');
  assert.equal(R.normalizeReferralCode('ana 10'), 'ANA10');
  assert.equal(R.normalizeReferralCode(null), '');
});

test('RC-2: the code shape is the server one: 3-12 letters/digits, optionally -SUFFIX (1-4 letters)', () => {
  for (const ok of ['ANA', 'ANA10', 'TESTE-IG', 'TESTE-YT', 'ABCDEFGHIJKL']) assert.equal(R.isReferralCodeShape(ok), true, ok);
  for (const bad of ['', 'AN', 'ANA-', '-ANA', 'ANA_IG', 'ANA-IG-X', 'ANA-12', 'ÁNA', 'ABCDEFGHIJKLM', 'ANA-ABCDE']) assert.equal(R.isReferralCodeShape(bad), false, bad);
});

test('RC-3: Aplicar asks the server (GET op=code, the code URL-encoded) and reads valid / unknown / ended', async () => {
  const f = VALID('TESTE-IG');
  assert.deepEqual(await R.checkReferralCode(' teste-ig ', { fetch: f }), { status: 'valid', code: 'TESTE-IG', benefitText: null });
  assert.equal(f.calls[0].url, 'https://dosetrace.io/api/creator?op=code&c=TESTE-IG');
  assert.equal(f.calls[0].opts.method || 'GET', 'GET');
  assert.equal(f.calls[0].opts.headers && f.calls[0].opts.headers.Authorization, undefined, 'the check sends no token');
  assert.deepEqual(await R.checkReferralCode('ANA-IG', { fetch: VALID('ANA-IG', '  Ganhe 1 mês  ') }), { status: 'valid', code: 'ANA-IG', benefitText: 'Ganhe 1 mês' });
  assert.deepEqual(await R.checkReferralCode('ANA-IG', { fetch: VALID('ANA-IG', '   ') }), { status: 'valid', code: 'ANA-IG', benefitText: null }, 'an empty benefit_text is none');
  assert.deepEqual(await R.checkReferralCode('TESTE-TT', { fetch: mockFetch(() => ({ body: { valid: false, reason: 'unknown' } })) }), { status: 'unknown' });
  assert.deepEqual(await R.checkReferralCode('OLD-IG', { fetch: mockFetch(() => ({ body: { valid: false, reason: 'ended' } })) }), { status: 'ended' });
  assert.deepEqual(await R.checkReferralCode('X-IG', { fetch: mockFetch(() => ({ body: { valid: false, reason: 'weird' } })) }), { status: 'shape' }, 'X is not a code shape: never asked');
  assert.deepEqual(await R.checkReferralCode('ODD-IG', { fetch: mockFetch(() => ({ body: { valid: false } })) }), { status: 'unknown' });
});

test('RC-4: a wrong shape is refused before any request', async () => {
  const f = VALID('X');
  assert.deepEqual(await R.checkReferralCode('a_b', { fetch: f }), { status: 'shape' });
  assert.equal(f.calls.length, 0);
});

test('RC-5: offline, a server error or an odd answer = "could not check now" (never applied)', async () => {
  for (const f of [mockFetch(() => 'offline'), mockFetch(() => ({ status: 503, body: { error: 'unavailable' } })), mockFetch(() => ({ body: undefined })), mockFetch(() => ({ body: { valid: true, code: 'a_b' } })), mockFetch(() => ({ body: null }))]) {
    assert.deepEqual(await R.checkReferralCode('ANA-IG', { fetch: f }), { status: 'offline' });
  }
  const slow = () => new Promise(() => {});
  assert.deepEqual(await R.checkReferralCode('ANA-IG', { fetch: slow, timeoutMs: 10 }), { status: 'offline' }, 'a request that never answers times out');
});

test('RC-6: a valid code is stored (its own key, valid), sent to RevenueCat, and left pending for the server record', async () => {
  const st = memStorage();
  const set = recorder();
  const r = await R.applyReferralCode('teste-ig', { storage: st, setAttributes: set, fetch: VALID('TESTE-IG', null), now: () => 1000 });
  assert.deepEqual(r, { ok: true, code: 'TESTE-IG', benefitText: null });
  assert.equal(R.REFERRAL_KEY, 'dosetrace_referral_code');
  assert.deepEqual(JSON.parse(st.m.get(R.REFERRAL_KEY)), { code: 'TESTE-IG', source: 'typed', savedAt: 1000, valid: true, benefitText: null });
  assert.deepEqual(JSON.parse(st.m.get(R.PENDING_KEY)), { code: 'TESTE-IG', source: 'typed' });
  assert.deepEqual(set.calls, [{ creator_code: 'TESTE-IG', creator_source: 'typed' }]);
});

test('RC-7: an invalid / ended / unchecked code stores nothing, sends nothing, and says why', async () => {
  for (const [f, reason] of [[mockFetch(() => ({ body: { valid: false, reason: 'unknown' } })), 'unknown'], [mockFetch(() => ({ body: { valid: false, reason: 'ended' } })), 'ended'], [mockFetch(() => 'offline'), 'offline'], [VALID('X'), 'shape']]) {
    const st = memStorage();
    const set = recorder();
    const raw = reason === 'shape' ? 'a_b' : 'TESTE-TT';
    assert.deepEqual(await R.applyReferralCode(raw, { storage: st, setAttributes: set, fetch: f }), { ok: false, reason }, reason);
    assert.equal(st.m.size, 0, reason);
    assert.equal(set.calls.length, 0, reason);
  }
});

test('RC-8: a valid code still holds when one side fails; both failing = could not save', async () => {
  const st = memStorage();
  assert.equal((await R.applyReferralCode('ANA-IG', { storage: st, setAttributes: recorder(false), fetch: VALID('ANA-IG') })).ok, true);
  assert.ok(st.m.has(R.REFERRAL_KEY));
  const set = recorder();
  assert.equal((await R.applyReferralCode('ANA-IG', { storage: broken, setAttributes: set, fetch: VALID('ANA-IG') })).ok, true);
  assert.equal(set.calls.length, 1);
  assert.deepEqual(await R.applyReferralCode('ANA-IG', { storage: broken, setAttributes: recorder(false), fetch: VALID('ANA-IG') }), { ok: false, reason: 'save' });
});

test('RC-9: reading the stored code never throws; only a server-valid code reads back', async () => {
  assert.deepEqual(await R.loadReferralCode(memStorage({ [R.REFERRAL_KEY]: rec('ANA-IG', { benefitText: 'x' }) })), { code: 'ANA-IG', source: 'typed', savedAt: 1, valid: true, benefitText: 'x' });
  assert.equal(await R.loadReferralCode(memStorage()), null);
  assert.equal(await R.loadReferralCode(memStorage({ [R.REFERRAL_KEY]: '{oops' })), null);
  assert.equal(await R.loadReferralCode(memStorage({ [R.REFERRAL_KEY]: JSON.stringify({ code: 'a_b', valid: true }) })), null);
  assert.equal(await R.loadReferralCode(memStorage({ [R.REFERRAL_KEY]: JSON.stringify({ code: 'ANA-IG', source: 'typed' }) })), null, 'never checked by the server = not applied');
  assert.equal(await R.loadReferralCode(broken), null);
});

test('RC-10: removing clears the code, the pending record and the attributes (null deletes a RevenueCat attribute)', async () => {
  const st = memStorage({ [R.REFERRAL_KEY]: rec('ANA-IG'), [R.PENDING_KEY]: JSON.stringify({ code: 'ANA-IG', source: 'typed' }) });
  const set = recorder();
  assert.equal(await R.removeReferralCode({ storage: st, setAttributes: set }), true);
  assert.equal(st.m.size, 0);
  assert.deepEqual(set.calls, [{ creator_code: null, creator_source: null }]);
  assert.equal(await R.removeReferralCode({ storage: broken, setAttributes: recorder(false) }), false);
});

test('RC-11: before a purchase the stored code goes to RevenueCat again; no code = nothing sent; never throws', async () => {
  const st = memStorage({ [R.REFERRAL_KEY]: rec('ANA-IG') });
  const set = recorder();
  assert.equal(await R.syncReferralAttributes({ storage: st, setAttributes: set }), true);
  assert.deepEqual(set.calls, [{ creator_code: 'ANA-IG', creator_source: 'typed' }]);
  const none = recorder();
  assert.equal(await R.syncReferralAttributes({ storage: memStorage(), setAttributes: none }), false);
  assert.equal(none.calls.length, 0);
  assert.equal(await R.syncReferralAttributes({ storage: st, setAttributes: recorder(false) }), false);
  assert.equal(await R.syncReferralAttributes({ storage: broken, setAttributes: recorder() }), false);
});

test('RC-12: the pending record goes to the server with the user token (POST op attribution) and RevenueCat; then it is cleared', async () => {
  const st = memStorage({ [R.PENDING_KEY]: JSON.stringify({ code: 'TESTE-IG', source: 'typed' }) });
  const set = recorder();
  const f = mockFetch(() => ({ body: { ok: true, recorded: true, code: 'TESTE-IG' } }));
  assert.equal(await R.flushPendingAttribution({ storage: st, setAttributes: set, getAccessToken: async () => 'jwt-1', fetch: f }), 'recorded');
  assert.equal(f.calls.length, 1);
  const { url, opts } = f.calls[0];
  assert.equal(url, 'https://dosetrace.io/api/creator');
  assert.equal(opts.method, 'POST');
  assert.equal(opts.headers.Authorization, 'Bearer jwt-1');
  assert.equal(opts.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(opts.body), { op: 'attribution', code: 'TESTE-IG', source: 'typed' }, 'nothing else is sent');
  assert.deepEqual(set.calls, [{ creator_code: 'TESTE-IG', creator_source: 'typed' }]);
  assert.equal(st.m.has(R.PENDING_KEY), false);
});

test('RC-13: recorded:false = the account already had a code — fine, cleared, no error', async () => {
  const st = memStorage({ [R.PENDING_KEY]: JSON.stringify({ code: 'TESTE-IG', source: 'typed' }) });
  assert.equal(await R.flushPendingAttribution({ storage: st, setAttributes: recorder(), getAccessToken: async () => 'jwt', fetch: mockFetch(() => ({ body: { ok: true, recorded: false, code: 'ANA-IG' } })) }), 'already');
  assert.equal(st.m.has(R.PENDING_KEY), false);
});

test('RC-14: offline, no session, 401 or a server error keep it pending for the next open', async () => {
  const cases = [
    [mockFetch(() => 'offline'), async () => 'jwt'],
    [mockFetch(() => ({ status: 503, body: { error: 'unavailable' } })), async () => 'jwt'],
    [mockFetch(() => ({ status: 401, body: { error: 'denied' } })), async () => 'jwt'],
    [mockFetch(() => ({ body: undefined })), async () => 'jwt'],
    [mockFetch(() => ({ body: { ok: true } })), async () => null],
    [mockFetch(() => ({ body: { ok: true } })), async () => { throw new Error('no session'); }],
  ];
  for (const [f, getAccessToken] of cases) {
    const st = memStorage({ [R.PENDING_KEY]: JSON.stringify({ code: 'TESTE-IG', source: 'typed' }) });
    assert.equal(await R.flushPendingAttribution({ storage: st, setAttributes: recorder(), getAccessToken, fetch: f }), 'pending');
    assert.ok(st.m.has(R.PENDING_KEY));
  }
  const noToken = mockFetch(() => ({ body: { ok: true } }));
  await R.flushPendingAttribution({ storage: memStorage({ [R.PENDING_KEY]: JSON.stringify({ code: 'TESTE-IG', source: 'typed' }) }), setAttributes: recorder(), getAccessToken: async () => null, fetch: noToken });
  assert.equal(noToken.calls.length, 0, 'no token: no request (the server would answer 401)');
});

test('RC-15: the server refusing the code for good (ok:false, or 400) clears the pending record — no endless retry', async () => {
  for (const f of [mockFetch(() => ({ body: { ok: false, reason: 'unknown' } })), mockFetch(() => ({ status: 400, body: { error: 'invalid' } }))]) {
    const st = memStorage({ [R.PENDING_KEY]: JSON.stringify({ code: 'TESTE-IG', source: 'typed' }) });
    assert.equal(await R.flushPendingAttribution({ storage: st, setAttributes: recorder(), getAccessToken: async () => 'jwt', fetch: f }), 'refused');
    assert.equal(st.m.has(R.PENDING_KEY), false);
  }
});

test('RC-16: nothing pending = nothing sent; a broken store never throws', async () => {
  const f = mockFetch(() => ({ body: { ok: true, recorded: true } }));
  const set = recorder();
  assert.equal(await R.flushPendingAttribution({ storage: memStorage(), setAttributes: set, getAccessToken: async () => 'jwt', fetch: f }), 'none');
  assert.equal(f.calls.length + set.calls.length, 0);
  assert.equal(await R.flushPendingAttribution({ storage: broken, setAttributes: set, getAccessToken: async () => 'jwt', fetch: f }), 'none');
  assert.equal(await R.flushPendingAttribution({ storage: memStorage({ [R.PENDING_KEY]: '{x' }), setAttributes: set, getAccessToken: async () => 'jwt', fetch: f }), 'none');
});

test('RC-17: the attributes are only creator_code and creator_source (the webhook reads nothing else)', () => {
  assert.deepEqual(R.referralAttributes({ code: 'ANA-IG', source: 'typed' }), { creator_code: 'ANA-IG', creator_source: 'typed' });
  assert.deepEqual(R.referralAttributes({ code: 'ANA-IG', source: 'weird' }), { creator_code: 'ANA-IG', creator_source: 'typed' }, 'only the three sources the server knows');
  assert.deepEqual(R.referralAttributes(null), { creator_code: null, creator_source: null });
});
