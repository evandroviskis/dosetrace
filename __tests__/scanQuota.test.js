'use strict';
// S-23 (A-58 part 1 / FX-19, design item 24): Premium gets 20 AI scans a month, free
// stays at 3 — lab reports, vaccine cards and vial labels share the one budget. The
// SERVER decides (supabase/functions/extract-bloodwork), asking RevenueCat with a
// secret that lives only in Supabase Edge Function secrets.
// Rules (billing, Gate B):
//  - under 3 scans: always allowed, RevenueCat is not even asked;
//  - 3 or more scans: allowed (up to 20) only with an active "DoseTrace Pro" entitlement (RevenueCat
//    id, unchanged) or for the accounts the app itself treats as Premium (App Review demo);
//  - 20 or more: refused for everyone (each account is told its own limit: 3 or 20);
//  - RevenueCat unreachable (timeout / 5xx): a paying user must not lose a paid feature
//    over a hiccup → allowed, still capped at 20; RevenueCat rate-limited (429) → treated
//    as not Premium for this request (it can be induced by flooding);
//  - secret missing or rejected (401/403): configuration error → the old limit of 3
//    (never 20 for everyone because of a bad key).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const q = () => require('../supabase/functions/extract-bloodwork/quota.ts');
const NOW = Date.parse('2026-10-01T12:00:00.000Z');
const sub = (ent) => ({ subscriber: { entitlements: ent } });

test('S-23: limits are 3 (free) and 20 (Premium)', () => {
  assert.equal(q().FREE_SCAN_LIMIT, 3);
  assert.equal(q().PREMIUM_SCAN_LIMIT, 20);
  assert.equal(q().ENTITLEMENT_ID, 'DoseTrace Pro');
});

test('S-23: entitlementActive — future expiry, lifetime (no expiry), billing grace = active; expired or absent = not', () => {
  const { entitlementActive } = q();
  assert.equal(entitlementActive(sub({ 'DoseTrace Pro': { expires_date: '2026-11-01T00:00:00Z' } }), NOW), true);
  assert.equal(entitlementActive(sub({ 'DoseTrace Pro': { expires_date: null } }), NOW), true, 'lifetime');
  assert.equal(entitlementActive(sub({ 'DoseTrace Pro': { expires_date: '2026-09-30T00:00:00Z', grace_period_expires_date: '2026-10-05T00:00:00Z' } }), NOW), true, 'billing grace period');
  assert.equal(entitlementActive(sub({ 'DoseTrace Pro': { expires_date: '2026-09-30T00:00:00Z' } }), NOW), false, 'expired');
  assert.equal(entitlementActive(sub({ other: { expires_date: null } }), NOW), false, 'another entitlement');
  assert.equal(entitlementActive(sub({}), NOW), false);
  assert.equal(entitlementActive(null, NOW), false);
  assert.equal(entitlementActive({ subscriber: {} }, NOW), false);
});

test('S-23: RevenueCat is asked only from the 3rd scan on (the tier decides the limit shown), and never for an app-Premium account', () => {
  const { needsEntitlementLookup } = q();
  assert.equal(needsEntitlementLookup({ count: 0, email: 'a@b.c' }), false);
  assert.equal(needsEntitlementLookup({ count: 2, email: 'a@b.c' }), false);
  assert.equal(needsEntitlementLookup({ count: 3, email: 'a@b.c' }), true);
  assert.equal(needsEntitlementLookup({ count: 19, email: 'a@b.c' }), true);
  assert.equal(needsEntitlementLookup({ count: 20, email: 'a@b.c' }), true, 'at 20+ the tier still decides which limit the user is told (3 or 20)');
  assert.equal(needsEntitlementLookup({ count: 5, email: 'AppReview@DoseTrace.io ' }), false);
});

test('S-23: free user — 3 scans allowed, the 4th refused (limit 3)', () => {
  const { decideQuota } = q();
  for (const count of [0, 1, 2]) assert.deepEqual(decideQuota({ count, email: 'a@b.c', lookup: 'skipped' }), { allowed: true, limit: 3 });
  assert.deepEqual(decideQuota({ count: 3, email: 'a@b.c', lookup: 'inactive' }), { allowed: false, limit: 3 });
});

test('S-23: Premium user — the 20th scan allowed, the 21st refused (limit 20)', () => {
  const { decideQuota } = q();
  assert.deepEqual(decideQuota({ count: 3, email: 'a@b.c', lookup: 'active' }), { allowed: true, limit: 20 });
  assert.deepEqual(decideQuota({ count: 19, email: 'a@b.c', lookup: 'active' }), { allowed: true, limit: 20 });
  assert.deepEqual(decideQuota({ count: 20, email: 'a@b.c', lookup: 'active' }), { allowed: false, limit: 20 });
  assert.deepEqual(decideQuota({ count: 25, email: 'a@b.c', lookup: 'active' }), { allowed: false, limit: 20 });
  assert.deepEqual(decideQuota({ count: 25, email: 'a@b.c', lookup: 'inactive' }), { allowed: false, limit: 3 }, 'a free account is told its own limit');
});

test('S-23: the App Review demo account (and the app\'s other Premium accounts) get 20 without RevenueCat', () => {
  const { decideQuota, PREMIUM_EMAILS } = q();
  assert.ok(PREMIUM_EMAILS.includes('appreview@dosetrace.io'));
  assert.deepEqual(decideQuota({ count: 10, email: 'appreview@dosetrace.io', lookup: 'skipped' }), { allowed: true, limit: 20 });
  assert.deepEqual(decideQuota({ count: 20, email: 'appreview@dosetrace.io', lookup: 'skipped' }), { allowed: false, limit: 20 });
  // The server list is the app's own list (lib/purchases.js DEVELOPER_EMAILS) — no drift.
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'purchases.js'), 'utf8');
  const block = src.slice(src.indexOf('const DEVELOPER_EMAILS = ['), src.indexOf('];', src.indexOf('const DEVELOPER_EMAILS = [')));
  const client = [...block.matchAll(/'([^']+@[^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual([...PREMIUM_EMAILS].sort(), client);
});

test('S-23: RevenueCat unreachable → a paying user is not blocked (allowed, still capped at 20); a bad or missing key → the old limit of 3', () => {
  const { decideQuota } = q();
  assert.deepEqual(decideQuota({ count: 5, email: 'a@b.c', lookup: 'unreachable' }), { allowed: true, limit: 20 });
  assert.deepEqual(decideQuota({ count: 20, email: 'a@b.c', lookup: 'unreachable' }), { allowed: false, limit: 20 });
  assert.deepEqual(decideQuota({ count: 5, email: 'a@b.c', lookup: 'misconfigured' }), { allowed: false, limit: 3 });
  assert.deepEqual(decideQuota({ count: 2, email: 'a@b.c', lookup: 'misconfigured' }), { allowed: true, limit: 3 });
});

test('S-23: lookupEntitlement — asks RevenueCat for the Supabase user id with the secret, and maps every outcome', async () => {
  const { lookupEntitlement } = q();
  const calls = [];
  const ok = (body) => async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => body }; };
  const status = (s) => async () => ({ ok: false, status: s, json: async () => ({}) });
  const uid = '086c8a14-aaaa-bbbb-cccc-000000000000';

  assert.equal(await lookupEntitlement({ fetchFn: ok(sub({ 'DoseTrace Pro': { expires_date: null } })), secret: 'sk_test', userId: uid, nowMs: NOW }), 'active');
  assert.equal(calls[0].url, `https://api.revenuecat.com/v1/subscribers/${uid}`);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk_test');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(await lookupEntitlement({ fetchFn: ok(sub({})), secret: 'sk_test', userId: uid, nowMs: NOW }), 'inactive');
  assert.equal(await lookupEntitlement({ fetchFn: status(401), secret: 'sk_bad', userId: uid, nowMs: NOW }), 'misconfigured');
  assert.equal(await lookupEntitlement({ fetchFn: status(403), secret: 'sk_bad', userId: uid, nowMs: NOW }), 'misconfigured');
  assert.equal(await lookupEntitlement({ fetchFn: status(500), secret: 'sk_test', userId: uid, nowMs: NOW }), 'unreachable');
  // RevenueCat rate-limiting is NOT a free pass: someone past the free limit who floods the
  // endpoint must not earn the Premium budget that way. A paying user just retries.
  assert.equal(await lookupEntitlement({ fetchFn: status(429), secret: 'sk_test', userId: uid, nowMs: NOW }), 'inactive');
  assert.equal(await lookupEntitlement({ fetchFn: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }), secret: 'sk_test', userId: uid, nowMs: NOW }), 'unreachable');
  assert.equal(await lookupEntitlement({ fetchFn: async () => { throw new Error('network'); }, secret: 'sk_test', userId: uid, nowMs: NOW }), 'unreachable');
  let asked = false;
  assert.equal(await lookupEntitlement({ fetchFn: async () => { asked = true; }, secret: '', userId: uid, nowMs: NOW }), 'misconfigured');
  assert.equal(asked, false, 'no secret → RevenueCat is never called');
  assert.equal(await lookupEntitlement({ fetchFn: ok({ not: 'json we know' }), secret: 'sk_test', userId: uid, nowMs: NOW }), 'inactive');
});

test('S-23: extract-bloodwork uses the quota module, reads the secret by name, and never hardcodes a key', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'extract-bloodwork', 'index.ts'), 'utf8');
  assert.match(src, /from '\.\/quota\.ts'/);
  assert.match(src, /Deno\.env\.get\('REVENUECAT_SECRET_KEY'\)/);
  assert.match(src, /withScanBudget</, 'the decision (decideQuota) runs inside withScanBudget');
  assert.match(src, /lookupEntitlement\(/);
  assert.doesNotMatch(src, /MONTHLY_SCAN_LIMIT/, 'the single hardcoded limit is gone');
  for (const f of ['index.ts', 'quota.ts']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'extract-bloodwork', f), 'utf8');
    assert.doesNotMatch(s, /sk_[A-Za-z0-9]{8,}/, `${f}: no secret key in the source`);
  }
});

// A-59 (Gate B review 2026-09-30, founder: fix before deploy). The budget used to be
// counted BEFORE the AI call and written AFTER it, so requests fired together all read
// the same count and all passed. Now the usage row is RESERVED before the AI call and
// each request checks its own position in the month: exactly `limit` requests win,
// however they interleave. A failed extraction gives its reservation back.
function fakeStore({ failCount = false, failReserve = false } = {}) {
  let rows = [];
  let seq = 0;
  const tick = () => new Promise((r) => setTimeout(r, Math.floor(Math.random() * 3)));
  return {
    rows: () => rows,
    seed(n) { for (let i = 0; i < n; i++) rows.push({ id: ++seq, created_at: seq }); },
    async count() { await tick(); return failCount ? null : rows.length; },
    async reserve() { await tick(); if (failReserve) return null; const row = { id: ++seq, created_at: seq }; rows.push(row); return row.id; },
    async list(limit) { await tick(); return rows.slice().sort((a, b) => a.created_at - b.created_at || a.id - b.id).slice(0, limit).map((r) => r.id); },
    async release(id) { await tick(); rows = rows.filter((r) => r.id !== id); },
  };
}
const okWork = async () => { await new Promise((r) => setTimeout(r, 2)); return { ok: true, response: 'scan' }; };
const run = (store, lookup, work = okWork, email = 'a@b.c') => q().withScanBudget({ store, email, lookup: async () => lookup, work });

test('A-59: 30 requests fired together by a free user → exactly 3 scans, 27 refused, 3 rows kept', async () => {
  const store = fakeStore();
  const out = await Promise.all(Array.from({ length: 30 }, () => run(store, 'inactive')));
  assert.equal(out.filter((o) => o.status === 'done').length, 3);
  assert.equal(out.filter((o) => o.status === 'refused').length, 27);
  assert.ok(out.filter((o) => o.status === 'refused').every((o) => o.limit === 3));
  assert.equal(store.rows().length, 3);
});

test('A-59: 30 requests fired together by a Premium user → exactly 20 scans', async () => {
  const store = fakeStore();
  const out = await Promise.all(Array.from({ length: 30 }, () => run(store, 'active')));
  assert.equal(out.filter((o) => o.status === 'done').length, 20);
  assert.ok(out.filter((o) => o.status === 'refused').every((o) => o.limit === 20));
  assert.equal(store.rows().length, 20);
});

test('A-59: one at a time — free: 3 then refused; Premium from 19: one more, then refused', async () => {
  const free = fakeStore();
  for (let i = 0; i < 3; i++) assert.equal((await run(free, 'inactive')).status, 'done');
  assert.deepEqual(await run(free, 'inactive'), { status: 'refused', limit: 3 });
  assert.equal(free.rows().length, 3);
  const prem = fakeStore(); prem.seed(19);
  assert.equal((await run(prem, 'active')).status, 'done');
  assert.deepEqual(await run(prem, 'active'), { status: 'refused', limit: 20 });
  assert.equal(prem.rows().length, 20);
});

test('A-59: a failed extraction gives the reservation back (a bad photo never costs a scan)', async () => {
  const store = fakeStore();
  const failed = await run(store, 'inactive', async () => ({ ok: false, response: 'bad photo' }));
  assert.deepEqual(failed, { status: 'failed', response: 'bad photo' });
  assert.equal(store.rows().length, 0);
  await assert.rejects(run(store, 'inactive', async () => { throw new Error('boom'); }), /boom/);
  assert.equal(store.rows().length, 0, 'a crash releases it too');
  assert.equal((await run(store, 'inactive')).status, 'done');
});

test('A-59: RevenueCat is asked at most once per request, and not at all under the free limit', async () => {
  let asked = 0;
  const lookup = async () => { asked++; return 'active'; };
  const store = fakeStore();
  await q().withScanBudget({ store, email: 'a@b.c', lookup, work: okWork });
  assert.equal(asked, 0, '1st scan of the month: no lookup');
  store.seed(5);
  await q().withScanBudget({ store, email: 'a@b.c', lookup, work: okWork });
  assert.equal(asked, 1);
});

test('A-59: infrastructure errors keep the old rule — count or reservation failing never blocks a real user', async () => {
  assert.equal((await run(fakeStore({ failCount: true }), 'inactive')).status, 'done');
  assert.equal((await run(fakeStore({ failReserve: true }), 'inactive')).status, 'done');
});

test('A-59: extract-bloodwork runs the AI call inside withScanBudget and no longer inserts the usage row afterwards', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'extract-bloodwork', 'index.ts'), 'utf8');
  assert.match(src, /withScanBudget<Response>\(/);
  const w = src.indexOf('withScanBudget<Response>(');
  assert.ok(src.indexOf('api.anthropic.com') > 0);
  assert.equal((src.match(/\.from\('ai_scan_usage'\)\s*\n?\s*\.insert\(/g) || []).length, 1, 'one insert: the reservation');
  assert.ok(src.indexOf(".insert(") < src.indexOf('api.anthropic.com') || src.indexOf('reserve') < src.indexOf('api.anthropic.com'), 'the reservation is written before the AI call');
  assert.ok(w > 0);
});
