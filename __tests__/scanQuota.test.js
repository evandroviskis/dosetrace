'use strict';
// S-23 (A-58 part 1 / FX-19, design item 24): Premium gets 20 AI scans a month, free
// stays at 3 — lab reports, vaccine cards and vial labels share the one budget. The
// SERVER decides (supabase/functions/extract-bloodwork), asking RevenueCat with a
// secret that lives only in Supabase Edge Function secrets.
// Rules (billing, Gate B):
//  - under 3 scans: always allowed, RevenueCat is not even asked;
//  - 3–19 scans: allowed only with an active "DoseTrace Pro" entitlement (RevenueCat
//    id, unchanged) or for the accounts the app itself treats as Premium (App Review demo);
//  - 20 or more: refused for everyone;
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

test('S-23: RevenueCat is asked only between 3 and 19 scans, and never for an app-Premium account', () => {
  const { needsEntitlementLookup } = q();
  assert.equal(needsEntitlementLookup({ count: 0, email: 'a@b.c' }), false);
  assert.equal(needsEntitlementLookup({ count: 2, email: 'a@b.c' }), false);
  assert.equal(needsEntitlementLookup({ count: 3, email: 'a@b.c' }), true);
  assert.equal(needsEntitlementLookup({ count: 19, email: 'a@b.c' }), true);
  assert.equal(needsEntitlementLookup({ count: 20, email: 'a@b.c' }), false);
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
  assert.deepEqual(decideQuota({ count: 20, email: 'a@b.c', lookup: 'skipped' }), { allowed: false, limit: 20 });
  assert.deepEqual(decideQuota({ count: 25, email: 'a@b.c', lookup: 'active' }), { allowed: false, limit: 20 });
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
  assert.match(src, /decideQuota\(/);
  assert.match(src, /lookupEntitlement\(/);
  assert.doesNotMatch(src, /MONTHLY_SCAN_LIMIT/, 'the single hardcoded limit is gone');
  for (const f of ['index.ts', 'quota.ts']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'extract-bloodwork', f), 'utf8');
    assert.doesNotMatch(s, /sk_[A-Za-z0-9]{8,}/, `${f}: no secret key in the source`);
  }
});
