// "Resumo por perguntas" (Admin Council round 2; founder approved the picture 2026-11-02 23:30 EST,
// docs/design/adm-resumo-perguntas.html). Part A: API. Dummy data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('./helpers/admAuthFake');
const ROOT = path.join(__dirname, '..');
process.env.ADMIN_TOKEN = 'x';
const adm = require('../api/adm.js');
const NOW = Date.parse('2026-11-04T15:00:00Z'); // a Wednesday; ISO week starts Monday 2026-11-02
const day = (b) => new Date(NOW - b * 864e5).toISOString().slice(0, 10);
const ANN = F.SB + '/rest/v1/admin_annotations';

test('RW1: weeklyNew counts real accounts per ISO week (Monday UTC) for the last N weeks, current week included, with platforms and the delta to the previous week', () => {
  const accounts = [
    { c: '2026-11-02', t: false, apple: true },   // this week (Mon)
    { c: '2026-11-04', t: false, pu: ['android'] }, // this week (today)
    { c: '2026-11-03', t: true },                  // test: out
    { c: '2026-10-27', t: false },                 // previous week (Tue)
    { c: '2026-10-26', t: false },                 // previous week (Mon)
    { c: '2026-10-25', t: false },                 // two weeks ago (Sun)
    { c: '2026-08-10', t: false },                 // 12 weeks ago: inside a 12-week window
    { c: '2026-08-09', t: false },                 // 13 weeks ago: out
  ];
  const g = adm.weeklyNew(accounts, NOW, 12);
  assert.equal(g.weeks.length, 12);
  assert.equal(g.weeks[11].w, '2026-11-02', 'last entry = current week');
  assert.equal(g.weeks[0].w, '2026-08-17', 'first entry = 11 weeks before');
  assert.deepEqual(g.weeks[11], { w: '2026-11-02', n: 2, ios: 1, android: 1, unknown: 0 });
  assert.deepEqual(g.weeks[10], { w: '2026-10-26', n: 2, ios: 0, android: 0, unknown: 2 });
  assert.equal(g.weeks[9].n, 1, 'Sunday 25 Oct belongs to the week of 19 Oct');
  assert.equal(g.this_week, 2); assert.equal(g.prev_week, 2); assert.equal(g.delta, 0);
  assert.equal(g.weeks.reduce((s, w) => s + w.n, 0), 5, '12-week window: 2 + 2 + 1 (the 10 Aug account is in the week of 10 Aug, outside 11 weeks back)');
});

test('RW2: buildManagement carries g4 (weekly new) next to g1', () => {
  const m = adm.buildManagement({ accounts: [{ c: day(1), t: false }], protocols_live: 0 }, { status: 'not_configured' }, NOW, {});
  assert.ok(m.g4 && Array.isArray(m.g4.weeks) && m.g4.weeks.length === 12);
  assert.equal(m.g4.this_week, 1);
});

test('RW3: fetchAnnotations reads admin_annotations with the service key; a missing table is not_configured, a failure is error, success is ok with rows ordered by day', async () => {
  F.envOn();
  try {
    let f = F.installFetch({ data: (u) => u.startsWith(ANN) ? F.json([{ id: 'a1', day: '2026-11-03', label: 'carrossel D', channel: 'instagram' }]) : F.json({}) });
    let r = await adm.fetchAnnotations();
    assert.equal(r.status, 'ok'); assert.deepEqual(r.rows, [{ id: 'a1', day: '2026-11-03', label: 'carrossel D', channel: 'instagram' }]);
    assert.ok(f.calls[0].url.includes('select=id,day,label,channel') && f.calls[0].url.includes('order=day'));
    assert.equal(f.calls[0].headers.apikey, 'dummy-service-key');
    f.restore();
    f = F.installFetch({ data: (u) => u.startsWith(ANN) ? new Response(JSON.stringify({ code: 'PGRST205', message: 'Could not find the table' }), { status: 404 }) : F.json({}) });
    r = await adm.fetchAnnotations(); assert.equal(r.status, 'not_configured'); f.restore();
    f = F.installFetch({ data: (u) => u.startsWith(ANN) ? new Response('boom', { status: 500 }) : F.json({}) });
    r = await adm.fetchAnnotations(); assert.equal(r.status, 'error'); f.restore();
  } finally { F.envOff(); }
});

test('RW4: the GET payload carries annotations; POST annotation_add validates (day, label ≤ 80, channel optional) and inserts with the service key; annotation_delete removes by id; a viewer cannot write', async () => {
  F.envOn();
  try {
    const g = await F.call(adm, { headers: F.bearer('admin') }, { data: (u) => u.startsWith(ANN) ? F.json([]) : F.json({ accounts: [], protocols_live: 0 }) });
    assert.equal(g.code, 200); assert.equal(g.json.annotations.status, 'ok'); assert.deepEqual(g.json.annotations.rows, []);
    let inserted = null;
    const p = await F.call(adm, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, F.bearer('admin'), F.ORIGIN), body: { action: 'annotation_add', day: '2026-11-03', label: 'carrossel D', channel: 'instagram' } }, { data: (u, body, init) => { if (u.startsWith(ANN) && init.method === 'POST') { inserted = body; return new Response(JSON.stringify([{ id: 'n1', day: '2026-11-03', label: 'carrossel D', channel: 'instagram' }]), { status: 201 }); } return F.json({}); } });
    assert.equal(p.code, 200, JSON.stringify(p.json));
    assert.deepEqual(inserted, { day: '2026-11-03', label: 'carrossel D', channel: 'instagram' });
    assert.equal(p.json.row.id, 'n1');
    const bad = await F.call(adm, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, F.bearer('admin'), F.ORIGIN), body: { action: 'annotation_add', day: 'nope', label: '' } });
    assert.equal(bad.code, 400);
    const long = await F.call(adm, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, F.bearer('admin'), F.ORIGIN), body: { action: 'annotation_add', day: '2026-11-03', label: 'x'.repeat(81) } });
    assert.equal(long.code, 400);
    let deleted = null;
    const d = await F.call(adm, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, F.bearer('admin'), F.ORIGIN), body: { action: 'annotation_delete', id: '11111111-1111-4111-8111-111111111111' } }, { data: (u, body, init) => { if (u.startsWith(ANN) && init.method === 'DELETE') { deleted = u; return new Response(null, { status: 204 }); } return F.json({}); } });
    assert.equal(d.code, 200); assert.ok(deleted && deleted.includes('id=eq.11111111-1111-4111-8111-111111111111'));
    const v = await F.call(adm, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, F.bearer('viewer'), F.ORIGIN), body: { action: 'annotation_add', day: '2026-11-03', label: 'x' } });
    assert.equal(v.code, 403);
  } finally { F.envOff(); }
});

test('RW5: the admin_annotations migration exists with RLS, revokes and service_role select/insert/delete only', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261103000000_admin_annotations.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.admin_annotations \(\s*id uuid primary key default gen_random_uuid\(\),\s*day date not null,\s*label text not null check \(char_length\(label\) between 1 and 80\),\s*channel text,/);
  assert.match(sql, /alter table public\.admin_annotations enable row level security/);
  assert.match(sql, /revoke all on table public\.admin_annotations from public, anon, authenticated/);
  assert.match(sql, /grant select, insert, delete on table public\.admin_annotations to service_role/);
  assert.ok(!/create policy/i.test(sql));
});
