'use strict';
// Admin panel Phase 5 — the alert feed GET /api/adm-health (founder 2026-11-03). The DT Admin phone job
// cannot use the device key (Keystore, biometrics, 5 min), so it polls with an "alerts-only token":
// minted by POST {action:'alerts_token'} on the full admin + device path, stored server side as sha256
// per admin device, sent as "X-DT-Alerts: <device id>.<secret>". That token reads ONLY alert rows (and the
// time of the last check): no user, no account, no admin data, no write. Rows SA7–SA12. Dummy values only.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const F = require('./helpers/admAuthFake.js');
const H = require('../api/adm-health.js');

const SB = F.SB;
const ALERT_SECRET = 'dummy-alerts-secret-0123456789abcdefghijklmnop';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const TOKENS = { [F.DEVICES.s25.id]: sha(ALERT_SECRET), [F.DEVICES.dead.id]: sha(ALERT_SECRET) };
const tok = (dev, secret) => ({ 'x-dt-alerts': F.DEVICES[dev].id + '.' + (secret || ALERT_SECRET) });
const ALERT_KEYS = ['created_at', 'id', 'kind', 'message', 'ms', 'probe'];

function withEnv(fn) { return async () => { F.envOn(); try { await fn(); } finally { F.envOff(); } }; }

// A fake data layer: alert tokens, alerts (with extra columns a careless select could leak), checks.
function db(o) {
  o = o || {};
  const seen = { patches: [], upserts: [] };
  const data = (u, body, init) => {
    const method = String(init.method || 'GET').toUpperCase();
    if (u.startsWith(SB + '/rest/v1/admin_alert_tokens')) {
      if (o.tokensMissing) return F.json({ code: 'PGRST205', message: 'Could not find the table' }, 404);
      if (method === 'PATCH') { seen.patches.push({ u, body }); return F.json(o.throttled ? [] : [{ device_id: 'x' }]); }
      if (method === 'POST') { seen.upserts.push({ u, body, headers: init.headers }); return new Response(null, { status: 201 }); }
      const m = u.match(/device_id=eq\.([0-9a-f-]+)/i);
      return F.json(m && TOKENS[m[1]] ? [{ device_id: m[1], token_hash: TOKENS[m[1]] }] : []);
    }
    if (u.startsWith(SB + '/rest/v1/system_alerts')) {
      if (o.alertsMissing) return F.json({ code: '42P01', message: 'relation does not exist' }, 404);
      if (/select=id&order=id\.desc&limit=1/.test(u)) return F.json([{ id: 9 }]);
      return F.json([{ id: 8, created_at: '2026-11-03T19:05:00Z', kind: 'slow', probe: 'rest', ms: 2400, message: 'A leitura de dados levou 2,4 s às 14:05 (limite 1 s).', email: 'leak@x.y', user_id: F.USERS.admin.id }]);
    }
    if (u.startsWith(SB + '/rest/v1/system_health_checks')) {
      if (/select=checked_at&order=checked_at\.desc&limit=1/.test(u)) return F.json([{ checked_at: '2026-11-03T19:05:00Z' }]);
      return F.json([{ id: 1, checked_at: '2026-11-03T19:00:00Z', probe: 'rest', ms: 2100, ok: true, detail: null }, { id: 2, checked_at: '2026-11-03T19:05:00Z', probe: 'rest', ms: 2400, ok: true, detail: null }]);
    }
    throw new Error('unexpected call ' + method + ' ' + u);
  };
  return { data, seen };
}
const ALLOWED_PREFIXES = ['/rest/v1/admin_alert_tokens', '/rest/v1/admin_devices', '/rest/v1/system_alerts', '/rest/v1/system_health_checks'];
const onlyAlertTables = (calls) => calls.every((c) => ALLOWED_PREFIXES.some((p) => c.url.startsWith(SB + p)));

// ------------------------------------------------------------------ SA7: refusals of the alerts-only path
test('SA7: no token at all → 401 with no call; a malformed alerts token → 401 with no call', withEnv(async () => {
  const a = await F.call(H, { url: '/api/adm-health?since=3', headers: {} });
  assert.equal(a.code, 401); assert.equal(a.calls.length, 0); assert.equal(a.headers['cache-control'], 'no-store');
  for (const v of ['nodot', 'not-a-uuid.' + ALERT_SECRET, F.DEVICES.s25.id + '.short', F.DEVICES.s25.id + '.' + 'x'.repeat(300), '']) {
    const r = await F.call(H, { url: '/api/adm-health', headers: { 'x-dt-alerts': v } });
    assert.equal(r.code, 401, JSON.stringify(v).slice(0, 40));
    assert.equal(r.calls.length, 0, 'no lookup for ' + JSON.stringify(v).slice(0, 40));
  }
}));

test('SA7: a wrong secret, an unknown device, a revoked device → 401, and no alert is read', withEnv(async () => {
  const d = db();
  for (const h of [tok('s25', 'wrong-alerts-secret-0123456789abcdefghijklmnop'), tok('fold'), tok('dead'), { 'x-dt-alerts': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.' + ALERT_SECRET }]) {
    const r = await F.call(H, { url: '/api/adm-health?since=0', headers: h }, { data: d.data });
    assert.equal(r.code, 401, JSON.stringify(h).slice(0, 70));
    assert.deepEqual(Object.keys(r.json), ['error']);
    assert.ok(!r.calls.some((c) => c.url.includes('system_alerts') || c.url.includes('system_health_checks')), 'no alert read');
    assert.ok(onlyAlertTables(r.calls));
  }
}));

test('SA7: an alerts token in the URL is refused (401) before any call, even with a valid header', withEnv(async () => {
  for (const q of ['alerts', 'alerts_token', 'x-dt-alerts', 'token', 't']) {
    const r = await F.call(H, { url: '/api/adm-health?' + q + '=x', headers: tok('s25') }, { data: db().data });
    assert.equal(r.code, 401, q); assert.equal(r.calls.length, 0, q);
  }
}));

test('SA7: an alerts token cannot write — a POST carrying only X-DT-Alerts is refused (403 origin or 401), nothing stored', withEnv(async () => {
  const d = db();
  const a = await F.call(H, { method: 'POST', headers: tok('s25'), body: { action: 'alerts_token' } }, { data: d.data });
  assert.equal(a.code, 403); assert.equal(a.calls.length, 0);
  const b = await F.call(H, { method: 'POST', headers: Object.assign(tok('s25'), F.ORIGIN), body: { action: 'alerts_token' } }, { data: d.data });
  assert.equal(b.code, 401); assert.equal(d.seen.upserts.length, 0);
}));

// ------------------------------------------------------------------ SA8: what the alerts token returns
test('SA8: a valid alerts token returns ONLY alert rows (6 fields), the last id and the last check time — no user or account data', withEnv(async () => {
  const d = db();
  const r = await F.call(H, { url: '/api/adm-health?since=7', headers: tok('s25') }, { data: d.data });
  assert.equal(r.code, 200);
  assert.deepEqual(Object.keys(r.json).sort(), ['alerts', 'last_check_at', 'last_id']);
  assert.equal(r.json.last_id, 9);
  assert.equal(r.json.last_check_at, '2026-11-03T19:05:00Z');
  assert.equal(r.json.alerts.length, 1);
  for (const a of r.json.alerts) assert.deepEqual(Object.keys(a).sort(), ALERT_KEYS);
  assert.ok(!r.body.includes('leak@x.y') && !r.body.includes(F.USERS.admin.id), 'extra columns never pass');
  assert.ok(onlyAlertTables(r.calls), 'only the alert tables are touched: ' + r.calls.map((c) => c.url).join(' '));
  assert.ok(!r.calls.some((c) => c.url.includes('/auth/v1/') || c.url.includes('/rpc/')), 'no auth, no RPC');
  const q = r.calls.find((c) => c.url.startsWith(SB + '/rest/v1/system_alerts?select=id,created_at,kind,probe,ms,message'));
  assert.ok(q, 'explicit column list');
  assert.match(q.url, /id=gt\.7/);
  assert.match(q.url, /order=id\.asc/);
  assert.match(q.url, /limit=50/);
}));

test('SA8: without "since" (first poll) only the last hour of alerts comes back; a bad "since" → 400', withEnv(async () => {
  const now = Date.now();
  const r = await F.call(H, { url: '/api/adm-health', headers: tok('s25') }, { data: db().data });
  assert.equal(r.code, 200);
  const q = r.calls.find((c) => c.url.startsWith(SB + '/rest/v1/system_alerts?select=id,created_at,kind,probe,ms,message'));
  const m = decodeURIComponent(q.url).match(/created_at=gte\.([0-9T:.\-Z]+)/);
  assert.ok(m, q.url);
  assert.ok(Math.abs(now - 3600000 - Date.parse(m[1])) < 60000, 'one hour back');
  for (const s of ['abc', '-1', '1.5', '1e3']) {
    const b = await F.call(H, { url: '/api/adm-health?since=' + s, headers: tok('s25') }, { data: db().data });
    assert.equal(b.code, 400, s); assert.equal(b.calls.length, 0, s);
  }
}));

test('SA9: rate limit — the token row is stamped atomically; a second poll within 20 s → 429 and no alert read', withEnv(async () => {
  const d = db({ throttled: true });
  const r = await F.call(H, { url: '/api/adm-health?since=1', headers: tok('s25') }, { data: d.data });
  assert.equal(r.code, 429);
  assert.equal(r.json.code, 'rate');
  assert.ok(!r.calls.some((c) => c.url.includes('system_alerts')));
  const ok = db();
  await F.call(H, { url: '/api/adm-health?since=1', headers: tok('s25') }, { data: ok.data });
  assert.equal(ok.seen.patches.length, 1);
  assert.match(decodeURIComponent(ok.seen.patches[0].u), /or=\(last_used_at\.is\.null,last_used_at\.lt\."[0-9T:.\-Z]+"\)/);
}));

test('SA9: the alert tables missing → 503 for the phone (never a fake "all good")', withEnv(async () => {
  const r = await F.call(H, { url: '/api/adm-health?since=1', headers: tok('s25') }, { data: db({ alertsMissing: true }).data });
  assert.equal(r.code, 503);
  const t = await F.call(H, { url: '/api/adm-health?since=1', headers: tok('s25') }, { data: db({ tokensMissing: true }).data });
  assert.equal(t.code, 503);
}));

// ------------------------------------------------------------------ SA10: the full admin path
test('SA10: with the full admin auth the same GET also returns the last 24 h of checks (admin and viewer)', withEnv(async () => {
  for (const who of ['admin', 'viewer']) {
    const r = await F.call(H, { url: '/api/adm-health', headers: F.bearer(who) }, { data: db().data });
    assert.equal(r.code, 200, who);
    assert.ok(Array.isArray(r.json.checks) && r.json.checks.length === 2);
    assert.deepEqual(Object.keys(r.json.checks[0]).sort(), ['checked_at', 'detail', 'id', 'ms', 'ok', 'probe']);
    assert.ok(Array.isArray(r.json.alerts));
    for (const a of r.json.alerts) assert.deepEqual(Object.keys(a).sort(), ALERT_KEYS);
    const q = r.calls.find((c) => c.url.startsWith(SB + '/rest/v1/system_health_checks?select=id,checked_at,probe,ms,ok,detail'));
    assert.ok(q);
    const m = decodeURIComponent(q.url).match(/checked_at=gte\.([0-9T:.\-Z]+)/);
    assert.ok(m && Math.abs(Date.now() - 86400000 - Date.parse(m[1])) < 60000, '24 h back');
  }
  const off = await F.call(H, { url: '/api/adm-health', headers: F.bearer('admin') }, { data: db({ alertsMissing: true }).data });
  assert.equal(off.code, 200);
  assert.equal(off.json.status, 'not_configured');
}));

test('SA10: the full path keeps every admin rule (aal1 without device → 401 aal2_required; stranger → 403)', withEnv(async () => {
  const a = await F.call(H, { url: '/api/adm-health', headers: F.bearer('admin', { aal: 'aal1' }) }, { data: db().data });
  assert.equal(a.code, 401); assert.equal(a.json.code, 'aal2_required');
  const s = await F.call(H, { url: '/api/adm-health', headers: F.bearer('stranger') }, { data: db().data });
  assert.equal(s.code, 403);
}));

// ------------------------------------------------------------------ SA11: minting the alerts token
test('SA11: POST alerts_token needs the device path — the browser (aal2, no device) → 403 device_required, nothing stored', withEnv(async () => {
  const d = db();
  const r = await F.call(H, { method: 'POST', headers: Object.assign(F.bearer('admin'), F.ORIGIN), body: { action: 'alerts_token' } }, { data: d.data });
  assert.equal(r.code, 403); assert.equal(r.json.code, 'device_required'); assert.equal(d.seen.upserts.length, 0);
  const v = await F.call(H, { method: 'POST', headers: Object.assign(F.bearer('viewer', { aal: 'aal1' }), F.deviceHeader('lookers'), F.ORIGIN), body: { action: 'alerts_token' } }, { data: d.data });
  assert.equal(v.code, 403); assert.equal(d.seen.upserts.length, 0);
}));

test('SA11: on the device path a new token "<device id>.<secret>" is returned once; only sha256(secret) is stored, per device (upsert)', withEnv(async () => {
  const d = db();
  const r = await F.call(H, { method: 'POST', headers: Object.assign(F.bearer('admin', { aal: 'aal1', ageS: 30 * 3600 }), F.deviceHeader('s25'), F.ORIGIN), body: { action: 'alerts_token' } }, { data: d.data });
  assert.equal(r.code, 200);
  assert.deepEqual(Object.keys(r.json), ['token']);
  const [id, secret] = r.json.token.split('.');
  assert.equal(id, F.DEVICES.s25.id);
  assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(d.seen.upserts.length, 1);
  const up = d.seen.upserts[0];
  assert.match(up.u, /admin_alert_tokens\?on_conflict=device_id$/);
  assert.match(up.headers.Prefer, /resolution=merge-duplicates/);
  assert.equal(up.body.device_id, F.DEVICES.s25.id);
  assert.equal(up.body.token_hash, sha(secret));
  assert.equal(up.body.last_used_at, null);
  assert.ok(!JSON.stringify(up.body).includes(secret), 'the plaintext is never stored');
  // the minted token then works on the alerts-only path
  TOKENS[F.DEVICES.s25.id] = sha(secret);
  try {
    const g = await F.call(H, { url: '/api/adm-health?since=0', headers: { 'x-dt-alerts': r.json.token } }, { data: db().data });
    assert.equal(g.code, 200);
  } finally { TOKENS[F.DEVICES.s25.id] = sha(ALERT_SECRET); }
}));

test('SA11: any other POST action → 400; other methods → 405', withEnv(async () => {
  const r = await F.call(H, { method: 'POST', headers: Object.assign(F.bearer('admin'), F.ORIGIN), body: { action: 'mark_test' } }, { data: db().data });
  assert.equal(r.code, 400);
  const p = await F.call(H, { method: 'PUT', headers: Object.assign(F.bearer('admin'), F.ORIGIN), body: {} }, { data: db().data });
  assert.equal(p.code, 405);
}));
