'use strict';
// Admin panel Phase 4 — "DT Admin" device key (docs/specs/admin-panel.md Phase 4, rows DA1–DA8;
// founder 2026-11-02 "Concordo com a 2, pode registrar e seguir"). The private Android app sends
// "X-DT-Device: <id>.<secret>"; the server checks sha256(secret) against admin_devices for the SAME
// allow-listed admin and, for a valid device, waives aal2, the 12 h password age and the 15 min TOTP
// step-up. Everything else (allow-list first, role for writes, Origin, no token in URL) is unchanged.
// The browser never sends the header, so the 2026-10-21 rules stay exactly as they are for it.
// Dummy values only — never a real id, key or account.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('./helpers/admAuthFake.js');

const ROOT = path.join(__dirname, '..');
const API_DIR = path.join(ROOT, 'api');
const ENDPOINTS = fs.readdirSync(API_DIR).filter((f) => /^adm.*\.js$/.test(f));
const handlers = ENDPOINTS.map((f) => [f, require(path.join(API_DIR, f))]);
const adm = require('../api/adm.js');
const auth = require('../api/_admAuth.js');
const MIG_PATH = path.join(ROOT, 'supabase', 'migrations', '20261102000000_admin_devices.sql');
const MIG = fs.existsSync(MIG_PATH) ? fs.readFileSync(MIG_PATH, 'utf8') : '';
const SQL = fs.readFileSync(path.join(ROOT, 'supabase_admin_rpcs.sql'), 'utf8');

function withEnv(fn) { return async () => { F.envOn(); try { await fn(); } finally { F.envOff(); } }; }
const body = { action: 'mark_test', emails: ['a@x.y'] };

test('DA1: a registered device of the admin + a password-only (aal1) session reads (200) and writes (not 401) without TOTP, even with a password older than 12 h', withEnv(async () => {
  const g = await F.call(adm, { headers: Object.assign(F.bearer('admin', { aal: 'aal1', ageS: 36 * 3600 }), F.deviceHeader('s25')) });
  assert.equal(g.code, 200);
  assert.equal(g.json.me.role, 'admin');
  assert.equal(g.json.me.device, true);
  for (const [name, h] of handlers) {
    const p = await F.call(h, { method: 'POST', headers: Object.assign(F.bearer('admin', { aal: 'aal1', ageS: 36 * 3600 }), F.deviceHeader('fold'), F.ORIGIN), body });
    assert.ok(p.code !== 401 && p.code !== 403, name + ': device write passes the session check (got ' + p.code + ')');
  }
}));

test('DA2: unknown id, wrong secret, revoked device, or a device of another admin → 401 device_unknown, no data call (even with a full aal2 session)', withEnv(async () => {
  const cases = [
    { 'x-dt-device': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.' + F.DEVICE_SECRETS.s25 },
    F.deviceHeader('s25', 'wrong-secret-0123456789abcdef0123456789'),
    F.deviceHeader('dead'),
    F.deviceHeader('lookers'), // registered to the viewer, presented with the admin's session
  ];
  for (const dev of cases) {
    for (const [name, h] of handlers) {
      const r = await F.call(h, { headers: Object.assign(F.bearer('admin'), dev) });
      assert.equal(r.code, 401, name + ' ' + JSON.stringify(dev).slice(0, 60));
      assert.equal(r.json.code, 'device_unknown');
      assert.equal(r.dataCalls.length, 0, name);
    }
  }
}));

test('DA3: a malformed header (no dot, not a uuid, empty secret, too long) → 401 device_unknown before any device lookup', withEnv(async () => {
  for (const v of ['nodot', 'not-a-uuid.secret', F.DEVICES.s25.id + '.', F.DEVICES.s25.id + '.' + 'x'.repeat(600)]) {
    const r = await F.call(adm, { headers: Object.assign(F.bearer('admin'), { 'x-dt-device': v }) });
    assert.equal(r.code, 401, v.slice(0, 40));
    assert.equal(r.json.code, 'device_unknown');
    assert.equal(r.deviceCalls.length, 0, 'no lookup for ' + v.slice(0, 40));
  }
}));

test('DA4: without the header nothing changes: aal1 → aal2_required, old password → session_expired, stale TOTP write → step_up_required', withEnv(async () => {
  const a = await F.call(adm, { headers: F.bearer('admin', { aal: 'aal1' }) });
  assert.equal(a.code, 401); assert.equal(a.json.code, 'aal2_required');
  const b = await F.call(adm, { headers: F.bearer('admin', { ageS: 13 * 3600 }) });
  assert.equal(b.code, 401); assert.equal(b.json.code, 'session_expired');
  const c = await F.call(adm, { method: 'POST', headers: Object.assign(F.bearer('admin', { totpS: 20 * 60 }), F.ORIGIN), body });
  assert.equal(c.code, 401); assert.equal(c.json.code, 'step_up_required');
}));

test('DA5: allow-list and role still rule: a stranger with a device header → 403 not_allowed; the viewer\'s own device may read but a write → 403 role; a foreign Origin → 403 first', withEnv(async () => {
  const s = await F.call(adm, { headers: Object.assign(F.bearer('stranger'), F.deviceHeader('s25')) });
  assert.equal(s.code, 403); assert.equal(s.json.code, 'not_allowed'); assert.equal(s.deviceCalls.length, 0, 'allow-list before the device lookup');
  const g = await F.call(adm, { headers: Object.assign(F.bearer('viewer', { aal: 'aal1' }), F.deviceHeader('lookers')) });
  assert.equal(g.code, 200);
  const w = await F.call(adm, { method: 'POST', headers: Object.assign(F.bearer('viewer', { aal: 'aal1' }), F.deviceHeader('lookers'), F.ORIGIN), body });
  assert.equal(w.code, 403); assert.equal(w.json.code, 'role');
  const o = await F.call(adm, { method: 'POST', headers: Object.assign(F.bearer('admin', { aal: 'aal1' }), F.deviceHeader('s25'), { origin: 'https://evil.example' }), body });
  assert.equal(o.code, 403); assert.equal(o.json.code, 'origin'); assert.equal(o.calls.length, 0);
}));

test('DA6: a device key in the URL is refused like any token in a URL (401 before any call)', withEnv(async () => {
  for (const q of ['device', 'dt_device', 'x-dt-device']) {
    const r = await F.call(adm, { url: '/api/adm?' + q + '=' + encodeURIComponent(F.DEVICES.s25.id + '.' + F.DEVICE_SECRETS.s25), headers: Object.assign(F.bearer('admin'), F.deviceHeader('s25')) });
    assert.equal(r.code, 401, q);
    assert.equal(r.calls.length, 0, q);
  }
}));

test('DA7: a valid device call records last_used_at with one PATCH (service role), and a failing PATCH never fails the request', withEnv(async () => {
  const r = await F.call(adm, { headers: Object.assign(F.bearer('admin', { aal: 'aal1' }), F.deviceHeader('s25')) });
  assert.equal(r.code, 200);
  const patches = r.deviceCalls.filter((c) => c.method === 'PATCH');
  assert.equal(patches.length, 1);
  assert.match(patches[0].url, /admin_devices\?id=eq\.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1$/);
  assert.ok(patches[0].body && patches[0].body.last_used_at, 'patches last_used_at');
  assert.ok(!JSON.stringify(patches[0].body).includes(F.DEVICE_SECRETS.s25), 'the secret is never written back');
  // the pure check: the secret never reaches the result either
  const f = F.installFetch();
  try {
    const ok = await auth.checkAdmin({ method: 'GET', url: '/api/adm', headers: Object.assign(F.bearer('admin', { aal: 'aal1' }), F.deviceHeader('s25')) });
    assert.equal(ok.ok, true); assert.equal(ok.device && ok.device.id, F.DEVICES.s25.id);
    assert.ok(!JSON.stringify(ok).includes(F.DEVICE_SECRETS.s25));
  } finally { f.restore(); }
  // a failing PATCH (network error) still answers 200
  const g = F.installFetch({ data: () => F.json({}) });
  const realFetch = global.fetch;
  global.fetch = async (u, init) => { if (String(init && init.method).toUpperCase() === 'PATCH') throw new Error('down'); return realFetch(u, init); };
  try {
    const ok2 = await auth.checkAdmin({ method: 'GET', url: '/api/adm', headers: Object.assign(F.bearer('admin', { aal: 'aal1' }), F.deviceHeader('s25')) });
    assert.equal(ok2.ok, true);
  } finally { global.fetch = realFetch; g.restore(); }
}));

test('DA8 SQL: migration admin_devices — table (id, user_id, name, key_hash unique, created_at, last_used_at, revoked_at), RLS on, service_role select + update only, registration function for postgres only that stores sha256 and returns the key once', () => {
  assert.ok(MIG, 'supabase/migrations/20261102000000_admin_devices.sql exists');
  assert.match(MIG, /create table if not exists public\.admin_devices \(/);
  for (const col of ['id uuid primary key', 'user_id uuid not null references auth\\.users', 'name text not null', 'key_hash text not null unique', 'created_at timestamptz', 'last_used_at timestamptz', 'revoked_at timestamptz']) assert.match(MIG, new RegExp(col), col);
  assert.match(MIG, /alter table public\.admin_devices enable row level security;/);
  assert.match(MIG, /revoke all on table public\.admin_devices from public, anon, authenticated;/);
  assert.match(MIG, /grant select, update \(last_used_at\) on table public\.admin_devices to service_role;/);
  assert.match(MIG, /create or replace function public\.admin_device_register\(p_user_id uuid, p_name text\)/);
  assert.match(MIG, /security definer/);
  assert.match(MIG, /gen_random_bytes\(32\)/);
  assert.match(MIG, /encode\(digest\([^)]*'sha256'\), 'hex'\)/);
  assert.match(MIG, /revoke execute on function public\.admin_device_register\(uuid, text\) from public, anon, authenticated, service_role;/);
  assert.match(MIG, /create or replace function public\.admin_device_revoke\(p_id uuid\)/);
  assert.ok(!/insert into auth\.users|delete from auth\.users|update auth\.users/i.test(MIG), 'never touches auth.users');
  assert.ok(SQL.includes('admin_devices'), 'the versioned SQL file carries the Phase 4 objects too');
});
