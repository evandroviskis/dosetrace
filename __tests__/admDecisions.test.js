// Admin panel — "Decisões" tab (founder approved 2026-11-24; docs/decisoes.md). API api/adm-decisions.js against an
// in-memory Supabase (the save RPC re-implemented with the rules of supabase/migrations/20261124000000_founder_decisions.sql),
// the migration itself, and the page wiring (web/adm-decisions.js + web/adm.html + vercel.json). Dummy data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('./helpers/admAuthFake');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const API = path.join(ROOT, 'api/adm-decisions.js');
const dec = () => require(API);
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

const D1 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const D2 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
const D3 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd3';
const D4 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
const D5 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd5';
const NOPE = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd9';

function row(o) {
  return Object.assign({ created_at: '2026-11-24T12:00:00Z', updated_at: '2026-11-24T12:00:00Z', area: 'app', kind: 'visual', title: 'T', question: 'Q', context: null, founder_said: null, recommendation: null, options: [], links: [], images: [], status: 'pendente', choice: null, note: null, decided_at: null, executed_at: null, executed_note: null, source: 'test', sort: 0, origem: 'app' }, o);
}
function world(o) {
  o = o || {};
  const W = {
    rows: [
      row({ id: D1, title: 'Cor do botão', options: ['A', 'B'], images: [{ label: 'Claro', path: 'app/botao-claro.png' }, { label: 'Desenho', path: 'app/botao.html' }, { label: 'Fora', path: '../etc/passwd' }], links: [{ label: 'Artefato', url: 'https://claude.ai/artifact/x' }, { label: 'Mau', url: 'javascript:alert(1)' }] }),
      row({ id: D2, origem: 'adm', area: 'painel', kind: 'texto', title: 'Texto do aviso', status: 'aprovado', decided_at: '2026-11-24T13:00:00Z' }),
      row({ id: D3, origem: 'ads', area: 'site', title: 'Já feito', status: 'aprovado', decided_at: '2026-11-23T10:00:00Z', executed_at: '2026-11-23T12:00:00Z', executed_note: 'Feito no commit abc' }),
      row({ id: D4, area: 'app', title: 'Outra pendente', sort: -1 }),
      row({ id: D5, origem: 'ads', area: 'app', title: 'Em retrabalho', status: 'alterando', choice: null, note: 'Mais espaço embaixo.', decided_at: '2026-11-24T14:00:00Z', rework_at: '2026-11-24T15:00:00Z' }),
    ],
    events: [],
    rpcCalls: [],
    signCalls: [],
    missing: !!o.missing,
  };
  W.data = (url, body, init) => {
    const u = new URL(url);
    const method = String((init && init.method) || 'GET').toUpperCase();
    if (u.pathname.startsWith('/storage/v1/object/sign/')) {
      W.signCalls.push({ path: u.pathname, body });
      return F.json((body.paths || []).map((p) => ({ path: p, signedURL: '/object/sign/founder-decisions/' + p + '?token=dummy', error: null })));
    }
    if (W.missing) return F.json({ code: 'PGRST205', message: 'Could not find the table' }, 404);
    if (u.pathname === '/rest/v1/rpc/founder_decision_save') {
      W.rpcCalls.push(body);
      const a = body;
      if (['aprovado', 'recusado', 'ajustar'].indexOf(a.p_status) < 0) return F.json({ state: 'bad_status' });
      if (W.events.filter((e) => e.actor === a.p_actor).length >= (o.limit != null ? o.limit : 60)) return F.json({ state: 'limited', retry_after: 1200 });
      const r = W.rows.find((x) => x.id === a.p_id);
      if (!r) return F.json({ state: 'unknown' });
      if (r.executed_at) return F.json({ state: 'executed', executed_at: r.executed_at });
      if (r.status === 'alterando') return F.json({ state: 'reworking', rework_at: r.rework_at });
      const choice = a.p_choice == null || !String(a.p_choice).trim() ? null : String(a.p_choice).trim();
      if (choice && r.options.indexOf(choice) < 0) return F.json({ state: 'bad_choice' });
      const note = a.p_note == null || !String(a.p_note).trim() ? null : String(a.p_note).trim();
      Object.assign(r, { status: a.p_status, choice, note, decided_at: '2026-11-24T20:00:00Z' });
      W.events.push({ actor: a.p_actor, id: a.p_id });
      return F.json({ state: 'saved', id: r.id, status: r.status, choice, note, decided_at: r.decided_at });
    }
    if (u.pathname === '/rest/v1/founder_decisions' && method === 'GET') {
      let out = W.rows.slice();
      const id = u.searchParams.get('id');
      if (id) out = out.filter((x) => 'eq.' + x.id === id);
      return F.json(JSON.parse(JSON.stringify(out)));
    }
    return F.json({ message: 'unexpected ' + method + ' ' + u.pathname }, 500);
  };
  return W;
}
function withEnv(fn) { return async () => { F.envOn(); try { await fn(); } finally { F.envOff(); } }; }
const ADMIN = () => Object.assign({}, F.bearer('admin', { totpS: 30 }), F.ORIGIN);
const get = (W, q, h) => F.call(dec(), { method: 'GET', url: '/api/adm-decisions' + (q || ''), headers: h || F.bearer('admin') }, { data: W.data });
const patch = (W, body, h) => F.call(dec(), { method: 'PATCH', url: '/api/adm-decisions', headers: h || ADMIN(), body }, { data: W.data });
const rest = (r) => r.calls.filter((c) => c.url.includes('/rest/v1/founder') || c.url.includes('/rest/v1/rpc/founder') || c.url.includes('/storage/v1/'));

// ------------------------------------------------------------------ DC1: the same admin session as every tab
test('DC1: no token 401, a forged token 401, a token in the URL 401, a non-admin 403, no database call in any of them', withEnv(async () => {
  const W = world();
  const cases = [
    [{}, 401],
    [{ authorization: 'Bearer abc.def.wrong-sig' }, 401],
    [F.bearer('stranger'), 403],
    [F.bearer('admin', { aal: 'aal1' }), 401],
    [F.bearer('admin', { ageS: 13 * 3600 }), 401],
  ];
  for (const [h, code] of cases) {
    const r = await get(W, '', h);
    assert.equal(r.code, code, JSON.stringify(h));
    assert.equal(rest(r).length, 0, 'no decision read before the session is accepted');
  }
  const q = await get(W, '?token=x', F.bearer('admin'));
  assert.equal(q.code, 401);
  assert.equal(rest(q).length, 0);
}));

test('DC1: a save needs Origin https://dosetrace.io, role admin and the 15-minute step-up (or the registered device); nothing is written otherwise', withEnv(async () => {
  const W = world();
  const body = { id: D1, status: 'aprovado' };
  assert.equal((await patch(W, body, F.bearer('admin', { totpS: 30 }))).code, 403, 'no Origin');
  assert.equal((await patch(W, body, Object.assign({}, F.bearer('admin', { totpS: 30 }), { origin: 'https://evil.example' }))).code, 403);
  assert.equal((await patch(W, body, Object.assign({}, F.bearer('viewer', { totpS: 30 }), F.ORIGIN))).code, 403, 'viewer');
  const stale = await patch(W, body, Object.assign({}, F.bearer('admin', { totpS: 3600 }), F.ORIGIN));
  assert.equal(stale.code, 401); assert.equal(stale.json.code, 'step_up_required');
  assert.equal(W.rpcCalls.length, 0);
  const dev = await patch(W, body, Object.assign({}, F.bearer('admin', { totpS: 3600 }), F.ORIGIN, F.deviceHeader('s25')));
  assert.equal(dev.code, 200, 'the DT Admin device replaces the step-up');
  assert.equal(W.rpcCalls.length, 1);
}));

// ------------------------------------------------------------------ DC2: the list
test('DC2: GET lists every decision with counts per group (pending / being changed / decided, executed inside decided), filters by group and area, no signed URL in the list', withEnv(async () => {
  const W = world();
  const r = await get(W);
  assert.equal(r.code, 200);
  assert.deepEqual(r.json.counts, { pendentes: 2, alterando: 1, decididas: 2, executadas: 1, total: 5 });
  assert.equal(r.json.items.length, 5);
  assert.deepEqual(r.json.items.filter((x) => x.group === 'pendentes').map((x) => x.id), [D4, D1], 'sort first, then newest');
  assert.equal(r.json.items.find((x) => x.id === D3).group, 'decididas');
  assert.equal(r.json.items.find((x) => x.id === D3).executed, true);
  assert.equal(r.json.items.find((x) => x.id === D5).group, 'alterando');
  assert.deepEqual((await get(W, '?status=alterando')).json.items.map((x) => x.id), [D5]);
  assert.deepEqual((await get(W, '?status=decididas')).json.items.map((x) => x.id).sort(), [D2, D3].sort(), 'decided includes the executed ones');
  assert.equal(W.signCalls.length, 0, 'the list signs nothing');
  assert.equal(r.headers['cache-control'], 'no-store');
  const p = await get(W, '?status=pendentes');
  assert.deepEqual(p.json.items.map((x) => x.id), [D4, D1]);
  assert.deepEqual(p.json.counts, r.json.counts, 'the badge count never depends on the filter');
  assert.deepEqual((await get(W, '?status=executadas')).json.items.map((x) => x.id), [D3]);
  assert.deepEqual((await get(W, '?area=painel')).json.items.map((x) => x.id), [D2]);
  assert.ok(r.json.items.every((x) => ['app', 'adm', 'ads'].indexOf(x.origem) >= 0), 'every item says which session posted it');
  assert.deepEqual(r.json.by_origem, {
    app: { pendentes: 2, alterando: 0, decididas: 0, executadas: 0, total: 2 },
    adm: { pendentes: 0, alterando: 0, decididas: 1, executadas: 0, total: 1 },
    ads: { pendentes: 0, alterando: 1, decididas: 1, executadas: 1, total: 2 },
  });
  const ads = await get(W, '?origem=ads');
  assert.deepEqual(ads.json.items.map((x) => x.id).sort(), [D3, D5].sort());
  assert.deepEqual(ads.json.counts, r.json.counts, 'the badge total never depends on the origin filter');
  assert.deepEqual((await get(W, '?origem=app&status=pendentes')).json.items.map((x) => x.id), [D4, D1]);
  assert.equal((await get(W, '?origem=site')).code, 400);
  assert.equal((await get(W, '?status=tudo')).code, 400);
  assert.equal((await get(W, '?area=lua')).code, 400);
  assert.equal((await get(W, '?id=nope')).code, 400);
}));

test('DC2: GET ?id= returns one decision with short-lived signed URLs for its pictures; unsafe paths and non-https links are dropped', withEnv(async () => {
  const W = world();
  const r = await get(W, '?id=' + D1);
  assert.equal(r.code, 200);
  const it = r.json.item;
  assert.equal(it.id, D1);
  assert.equal(W.signCalls.length, 1);
  assert.match(W.signCalls[0].path, /\/storage\/v1\/object\/sign\/founder-decisions$/);
  assert.ok(W.signCalls[0].body.expiresIn > 0 && W.signCalls[0].body.expiresIn <= 900, 'at most 15 minutes');
  assert.deepEqual(W.signCalls[0].body.paths, ['app/botao-claro.png', 'app/botao.html'], 'a path with .. is never signed');
  assert.equal(it.images.length, 2);
  assert.equal(it.images[0].kind, 'image'); assert.equal(it.images[1].kind, 'html');
  assert.equal(it.images[0].url, F.SB + '/storage/v1/object/sign/founder-decisions/app/botao-claro.png?token=dummy');
  assert.deepEqual(it.links, [{ label: 'Artefato', url: 'https://claude.ai/artifact/x' }]);
  const call = r.calls.find((c) => c.url.includes('/storage/v1/'));
  assert.equal(call.headers.Authorization, 'Bearer dummy-service-key', 'signed by the server, the key never reaches the page');
  assert.ok(!r.body.includes('dummy-service-key'));
  assert.equal((await get(W, '?id=' + NOPE)).code, 404);
}));

test('DC2: the table not created yet → 503 not_configured (the tab says so, nothing breaks)', withEnv(async () => {
  const W = world({ missing: true });
  const r = await get(W);
  assert.equal(r.code, 503); assert.equal(r.json.error, 'not_configured');
}));

// ------------------------------------------------------------------ DC3: the save
test('DC3: a save writes status, choice and note only, through the RPC, with the admin as actor; line breaks in the note are kept', withEnv(async () => {
  const W = world();
  const r = await patch(W, { id: D1, status: 'ajustar', choice: 'B', note: 'Gostei do B.\nMas o verde mais escuro.' });
  assert.equal(r.code, 200, r.body);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.decided_at, '2026-11-24T20:00:00Z');
  assert.deepEqual(W.rpcCalls[0], { p_id: D1, p_actor: F.USERS.admin.id, p_status: 'ajustar', p_choice: 'B', p_note: 'Gostei do B.\nMas o verde mais escuro.' });
  assert.equal(W.rows[0].note, 'Gostei do B.\nMas o verde mais escuro.');
  assert.equal(rest(r).filter((c) => c.method === 'PATCH' || (c.method === 'POST' && !c.url.includes('/rpc/'))).length, 0, 'no direct table write');
  const crlf = await patch(W, { id: D1, status: 'aprovado', choice: null, note: 'linha 1\r\nlinha 2' });
  assert.equal(crlf.code, 200); assert.equal(W.rpcCalls[1].p_note, 'linha 1\nlinha 2');
}));

test('DC3: field whitelist — any other field (executed_at, title, context, decided_at…) → 400 naming it, and no RPC call', withEnv(async () => {
  const W = world();
  for (const k of ['executed_at', 'executed_note', 'title', 'context', 'decided_at', 'options', 'images', 'area', 'sort']) {
    const r = await patch(W, { id: D1, status: 'aprovado', [k]: 'x' });
    assert.equal(r.code, 400, k); assert.equal(r.json.field, k);
  }
  const bad = [
    [{ status: 'aprovado' }, 'id'], [{ id: 'x', status: 'aprovado' }, 'id'],
    [{ id: D1 }, 'status'], [{ id: D1, status: 'pendente' }, 'status'], [{ id: D1, status: 'talvez' }, 'status'],
    [{ id: D1, status: 'aprovado', choice: 5 }, 'choice'], [{ id: D1, status: 'aprovado', choice: 'x'.repeat(301) }, 'choice'],
    [{ id: D1, status: 'aprovado', note: 7 }, 'note'], [{ id: D1, status: 'aprovado', note: 'a\u0007b' }, 'note'],
  ];
  for (const [b, f] of bad) { const r = await patch(W, b); assert.equal(r.code, 400, JSON.stringify(b)); assert.equal(r.json.field, f); }
  for (const b of ['not json{', [1, 2], null]) assert.equal((await patch(W, b)).code, 400);
  assert.equal(W.rpcCalls.length, 0);
}));

test('DC3: the note is capped at 4000 characters (4000 saves, 4001 → 400); a body over 16 KB → 413', withEnv(async () => {
  const W = world();
  assert.equal((await patch(W, { id: D1, status: 'aprovado', note: 'é'.repeat(4000) })).code, 200);
  const over = await patch(W, { id: D1, status: 'aprovado', note: 'é'.repeat(4001) });
  assert.equal(over.code, 400); assert.equal(over.json.field, 'note');
  const big = await patch(W, JSON.stringify({ id: D1, status: 'aprovado', note: 'x', pad: 'y'.repeat(17000) }));
  assert.equal(big.code, 413);
  assert.equal(W.rpcCalls.length, 1);
}));

test('DC3: the database answers — unknown 404, executed 409 (read only after Claude executes), choice outside the options 400, over 60 saves an hour 429', withEnv(async () => {
  const W = world();
  assert.equal((await patch(W, { id: NOPE, status: 'aprovado' })).code, 404);
  const ex = await patch(W, { id: D3, status: 'recusado' });
  assert.equal(ex.code, 409); assert.equal(ex.json.error, 'executed');
  const rw = await patch(W, { id: D5, status: 'aprovado' });
  assert.equal(rw.code, 409); assert.equal(rw.json.error, 'reworking', 'being changed by Claude: read only (founder 2026-11-24)');
  assert.equal(W.rows.find((x) => x.id === D5).status, 'alterando');
  const ch = await patch(W, { id: D1, status: 'aprovado', choice: 'C' });
  assert.equal(ch.code, 400); assert.equal(ch.json.field, 'choice');
  const L = world({ limit: 0 });
  const lim = await patch(L, { id: D1, status: 'aprovado' });
  assert.equal(lim.code, 429); assert.equal(lim.json.retry_after, 1200);
  const M = world({ missing: true });
  assert.equal((await patch(M, { id: D1, status: 'aprovado' })).code, 503);
}));

test('DC3: api/adm-decisions.js never logs and never reads a key other than the Supabase ones', () => {
  const src = read('api/adm-decisions.js');
  assert.equal((src.match(/console\./g) || []).length, 0);
  assert.match(src, /require\('\.\/_admAuth\.js'\)/);
  const envs = (src.match(/process\.env\.[A-Z_]+/g) || []).sort();
  assert.deepEqual([...new Set(envs)], ['process.env.SUPABASE_SERVICE_ROLE_KEY', 'process.env.SUPABASE_URL']);
});

// ------------------------------------------------------------------ DC4: the migration
test('DC4 SQL: founder_decisions + events, RLS on with no policy, service_role SELECT only, the save as definer for service_role only, private bucket, one transaction, not applied', () => {
  const sql = read('supabase/migrations/20261124000000_founder_decisions.sql');
  const body = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  assert.match(sql, /STATUS: NOT APPLIED/);
  assert.equal((body.match(/^begin;$/gm) || []).length, 1); assert.equal((body.match(/^commit;$/gm) || []).length, 1);
  for (const col of ['id uuid primary key default gen_random_uuid()', 'area text', 'kind text', 'title text', 'question text', 'context text', 'founder_said text', 'recommendation text', 'options jsonb', 'links jsonb', 'images jsonb', "status text not null default 'pendente'", 'choice text', 'note text', 'decided_at timestamptz', 'executed_at timestamptz', 'executed_note text', 'source text', 'sort int'])
    assert.ok(body.includes(col), col);
  assert.match(body, /check \(area in \('app', 'painel', 'site', 'divulgacao', 'outro'\)\)/);
  assert.match(body, /check \(kind in \('visual', 'texto', 'regra', 'outro'\)\)/);
  assert.match(body, /check \(status in \('pendente', 'aprovado', 'recusado', 'ajustar'\)\)/);
  assert.match(body, /create trigger founder_decisions_touch before update on public\.founder_decisions/);
  for (const t of ['founder_decisions', 'founder_decision_events']) {
    assert.ok(body.includes(`alter table public.${t} enable row level security;`), t + ' RLS');
    assert.ok(body.includes(`revoke all on table public.${t} from public, anon, authenticated, service_role;`), t + ' revoke');
    assert.ok(body.includes(`grant select on table public.${t} to service_role;`), t + ' select only');
  }
  assert.ok(!/create policy/i.test(body), 'no policy at all');
  assert.ok(!/grant (insert|update|delete|all)/i.test(body), 'no write grant');
  assert.match(body, /function public\.founder_decision_save\(p_id uuid, p_actor uuid, p_status text, p_choice text, p_note text\)[\s\S]*?security definer[\s\S]*?set search_path to 'public'/);
  assert.match(body, /revoke all on function public\.founder_decision_save\(uuid, uuid, text, text, text\) from public, anon, authenticated;/);
  assert.match(body, /grant execute on function public\.founder_decision_save\(uuid, uuid, text, text, text\) to service_role;/);
  const fn = body.match(/as \$\$\ndeclare\n  r public\.founder_decisions;[\s\S]*?\$\$;/)[0];
  assert.match(fn, /set status = p_status, choice = v_choice, note = v_note, decided_at = now\(\)/, 'the only columns it writes');
  assert.match(fn, /if r\.executed_at is not null then return jsonb_build_object\('state', 'executed'/);
  assert.match(fn, /not \(r\.options \? v_choice\)/);
  assert.match(fn, /if n >= 60 then/);
  assert.match(body, /insert into storage\.buckets \(id, name, public[^)]*\)\nvalues \('founder-decisions', 'founder-decisions', false,/);
  assert.ok(!/\bauth\./.test(body), 'nothing in the auth schema');
});

test('DC6 SQL: "Alteração em andamento" in its own migration on top of the applied one — status alterando with rework_at, executed only after his answer, the save refuses it; one transaction, applied 2026-11-24, the first migration untouched', () => {
  const sql = read('supabase/migrations/20261124010000_founder_decisions_alterando.sql');
  const body = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  assert.match(sql, /STATUS: APPLIED 2026-11-24/);
  assert.equal((body.match(/^begin;$/gm) || []).length, 1); assert.equal((body.match(/^commit;$/gm) || []).length, 1);
  assert.match(body, /add column if not exists rework_at timestamptz;/);
  assert.match(body, /drop constraint if exists founder_decisions_status_check;\nalter table public\.founder_decisions add constraint founder_decisions_status_check\n  check \(status in \('pendente', 'aprovado', 'recusado', 'ajustar', 'alterando'\)\);/);
  assert.match(body, /add constraint founder_decisions_rework\n  check \(\(status = 'alterando'\) = \(rework_at is not null\)\);/);
  assert.match(body, /add constraint founder_decisions_executed\n  check \(executed_at is null or status in \('aprovado', 'recusado', 'ajustar'\)\);/);
  assert.match(body, /raise exception 'an old status check is still in place'/, 'aborts if the old check survived');
  const fn = body.match(/create or replace function public\.founder_decision_save[\s\S]*?\$\$;/)[0];
  assert.match(fn, /security definer/);
  assert.match(fn, /if r\.status = 'alterando' then return jsonb_build_object\('state', 'reworking'/);
  assert.ok(fn.indexOf("'reworking'") < fn.indexOf('update public.founder_decisions'), 'refused before any write');
  assert.match(fn, /set status = p_status, choice = v_choice, note = v_note, decided_at = now\(\)/);
  assert.match(fn, /p_status not in \('aprovado', 'recusado', 'ajustar'\)/, 'the panel can never set alterando');
  assert.match(body, /revoke all on function public\.founder_decision_save\(uuid, uuid, text, text, text\) from public, anon, authenticated;\ngrant execute on function public\.founder_decision_save\(uuid, uuid, text, text, text\) to service_role;/);
  assert.ok(!/create policy|grant (insert|update|delete|all)/i.test(body));
  const first = read('supabase/migrations/20261124000000_founder_decisions.sql');
  assert.ok(!/alterando/.test(first), 'the applied migration stays as committed in 210e1e0a');
});

// ------------------------------------------------------------------ DC5: the page
function loadInBox(file) {
  const win = {}, doc = { getElementById: () => null, querySelectorAll: () => [], body: { contains: () => false }, head: { appendChild() {} }, createElement: () => ({}), addEventListener() {}, documentElement: {} };
  new Function('window', 'document', read(file))(win, doc);
  return win;
}
test('DC5: the tab — labels in 6 languages (same keys), no emoji, formal Portuguese ("o senhor"), styles from the panel tokens only, big touch targets', () => {
  const win = loadInBox('web/adm-decisions.js');
  const T = win.DC_T;
  assert.deepEqual(Object.keys(T).sort(), LANGS.slice().sort());
  const en = Object.keys(T.en).sort();
  for (const l of LANGS) { assert.deepEqual(Object.keys(T[l]).sort(), en, l + ' parity'); for (const [k, v] of Object.entries(T[l])) { assert.ok(typeof v === 'string' && v.length, l + ' ' + k); assert.ok(!EMOJI.test(v), 'emoji ' + l + ' ' + k); } }
  for (const k of ['h_question', 'h_context', 'h_said', 'h_rec', 'approve', 'refuse', 'adjust', 'save', 'saved_at', 'executed_at', 'g_pendentes', 'g_alterando', 'g_decididas', 'sub_executadas', 'reworking_since', 'last_note'])
    assert.ok(T.pt[k], k);
  assert.equal(T.pt.h_question, 'O que decidir'); assert.equal(T.pt.h_context, 'Contexto'); assert.equal(T.pt.h_said, 'O que o senhor disse');
  assert.equal(T.pt.h_rec, 'Recomendação do Claude'); assert.equal(T.pt.g_alterando, 'Alteração em andamento'); assert.equal(T.pt.reworking_since, 'Em alteração pelo Claude desde {d}'); assert.equal(T.pt.approve, 'Aprovo'); assert.equal(T.pt.refuse, 'Não aprovo'); assert.equal(T.pt.adjust, 'Precisa ajustar'); assert.equal(T.pt.save, 'Salvar');
  assert.ok(!/\b(você|a gente|dá para|deu para)\b/i.test(JSON.stringify(T.pt)), 'formal Portuguese');
  const src = read('web/adm-decisions.js');
  const style = src.match(/var STYLE = ([\s\S]*?);\n/)[1];
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|:\s*(white|black)\b/.test(style), 'no literal colour in the tab styles');
  assert.match(style, /\.dc-act button\{[^}]*min-height:56px/, 'decision buttons at least 56 px high');
  assert.match(style, /\.dc-body\{[^}]*font-size:17px/, 'reading text 17 px');
  assert.match(style, /white-space:pre-wrap/, 'line breaks kept');
  assert.ok(!/innerHTML\s*=\s*[^;]*\b(context|founder_said|recommendation|note)\b(?![^;]*esc\()/.test(src), 'long texts always escaped');
});

test('DC5: grouping and the safe link rule match the server', () => {
  const win = loadInBox('web/adm-decisions.js');
  const g = win.DCTab._group;
  assert.equal(g({ status: 'pendente' }), 'pendentes');
  assert.equal(g({ status: 'ajustar', decided_at: 'x' }), 'decididas');
  assert.equal(g({ status: 'aprovado', decided_at: 'x', executed_at: 'y' }), 'decididas');
  assert.equal(g({ status: 'alterando', decided_at: 'x', rework_at: 'y' }), 'alterando');
  const st = win.DCTab._state; st.det = { status: 'alterando' }; assert.equal(win.DCTab._readOnly(), true); st.det = { status: 'ajustar' }; assert.equal(win.DCTab._readOnly(), false); st.det = { status: 'aprovado', executed_at: 'x' }; assert.equal(win.DCTab._readOnly(), true); st.det = null;
  const safe = win.DCTab._safeUrl;
  assert.equal(safe('https://claude.ai/x'), 'https://claude.ai/x');
  assert.equal(safe('javascript:alert(1)'), null); assert.equal(safe('http://x.y'), null); assert.equal(safe('data:text/html,1'), null);
});

test('DC6: a decision being changed opens read only — the "being changed since" banner (never "carried out"), his last answer, no options, no decision buttons, no note box, no Save', () => {
  const win = loadInBox('web/adm-decisions.js');
  const st = win.DCTab._state;
  st.det = { id: D5, area: 'app', kind: 'visual', title: 'T', question: 'Q', options: ['A', 'B'], links: [], images: [], status: 'alterando', choice: 'B', note: 'Mais contraste.', created_at: '2026-11-24T10:00:00Z', decided_at: '2026-11-24T12:00:00Z', rework_at: '2026-11-24T13:00:00Z', executed_at: null };
  st.draft = { status: null, choice: null, note: '' };
  const h = win.DCTab._detail();
  assert.ok(h.includes('dc-banner acc'), 'being-changed banner');
  assert.ok(!h.includes('dc-banner good'), 'never the carried-out banner');
  assert.ok(h.includes('Mais contraste.') && h.includes('Option chosen: B'), 'his last answer');
  for (const k of ['data-a="status"', 'data-a="choice"', 'id="dc-note"', 'data-a="save"']) assert.ok(!h.includes(k), 'no ' + k);
  st.det = Object.assign({}, st.det, { status: 'ajustar', rework_at: null });
  const open = win.DCTab._detail();
  for (const k of ['data-a="status"', 'data-a="choice"', 'id="dc-note"', 'data-a="save"']) assert.ok(open.includes(k), 'editable again: ' + k);
  st.det = null; st.draft = null;
});

test('DC7: segmented by the session that posted it — "Todas · App · Painel admin · Publicidade" with the pending count of each, group counts follow the chosen origin, a small origin label on every card; the badge stays the total pending', () => {
  const win = loadInBox('web/adm-decisions.js');
  const T = win.DC_T;
  assert.equal(T.pt.o_all, 'Todas'); assert.equal(T.pt.o_app, 'App'); assert.equal(T.pt.o_adm, 'Painel admin'); assert.equal(T.pt.o_ads, 'Publicidade');
  const st = win.DCTab._state;
  const it = (id, origem, status, group) => ({ id, origem, status, group, area: 'app', kind: 'visual', title: 'T ' + id, question: 'Q', decided_at: status === 'pendente' ? null : 'x' });
  st.data = { items: [it('1', 'app', 'pendente', 'pendentes'), it('2', 'app', 'pendente', 'pendentes'), it('3', 'ads', 'pendente', 'pendentes'), it('4', 'adm', 'aprovado', 'decididas')],
    counts: { pendentes: 3, alterando: 0, decididas: 1, executadas: 0, total: 4 },
    by_origem: { app: { pendentes: 2, alterando: 0, decididas: 0, executadas: 0, total: 2 }, adm: { pendentes: 0, alterando: 0, decididas: 1, executadas: 0, total: 1 }, ads: { pendentes: 1, alterando: 0, decididas: 0, executadas: 0, total: 1 } } };
  st.group = 'pendentes'; st.origem = '';
  let h = win.DCTab._list();
  const seg = h.match(/<div class="dc-orig-seg"[\s\S]*?<\/div>/)[0];
  assert.deepEqual([...seg.matchAll(/data-a="origem" data-v="([a-z]*)"/g)].map((m) => m[1]), ['', 'app', 'adm', 'ads']);
  assert.deepEqual([...seg.matchAll(/<b>(\d+)<\/b>/g)].map((m) => m[1]), ['3', '2', '0', '1'], 'pending per origin');
  assert.ok(h.indexOf('<div class="dc-orig-seg"') < h.indexOf('<div class="dc-seg"'), 'origin control at the top');
  assert.equal((h.match(/class="dc-orig"/g) || []).length, 3, 'origin label on each card');
  st.origem = 'app';
  h = win.DCTab._list();
  assert.equal((h.match(/data-a="open"/g) || []).length, 2, 'only the app session');
  const gseg = h.match(/<div class="dc-seg"[\s\S]*?<\/div>/)[0];
  assert.deepEqual([...gseg.matchAll(/<b>(\d+)<\/b>/g)].map((m) => m[1]), ['2', '0', '0'], 'group counts of the chosen origin');
  assert.equal(win.DCTab.pending(), 3, 'badge = total pending, whatever the filter');
  st.data = null; st.origem = '';
});

test('DC7 SQL: the origem migration records what is live (applied 2026-11-24), idempotent', () => {
  const sql = read('supabase/migrations/20261124020000_founder_decisions_origem.sql');
  const body = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  assert.match(sql, /STATUS: APPLIED 2026-11-24/);
  assert.match(body, /alter table public\.founder_decisions add column if not exists origem text not null default 'app'\n  check \(origem in \('app', 'adm', 'ads'\)\);/);
  assert.match(body, /create index if not exists founder_decisions_origem on public\.founder_decisions \(origem, status\);/);
  assert.equal((body.match(/^begin;$/gm) || []).length, 1); assert.equal((body.match(/^commit;$/gm) || []).length, 1);
});

test('DC5: web/adm.html wires the tab — desktop tab and phone tab bar with the pending badge, label ×6, Back key, external links through the bridge, script after the main one; vercel.json lets the signed pictures load', () => {
  const html = read('web/adm.html');
  const script = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  const T = (0, eval)('(' + script.match(/var T=(\{[\s\S]*?\n  \});/)[1] + ')');
  for (const l of LANGS) assert.ok(T[l].tab_decisions, l + ' tab_decisions');
  assert.equal(T.pt.tab_decisions, 'Decisões');
  assert.match(html, /\['decisions','tab_decisions'\]/);
  assert.match(html, /\['decisoes','tab_decisions'\]/);
  assert.match(html, /class="dc-badge"/);
  assert.match(html, /window\.DCTab&&window\.DCTab\.back&&window\.DCTab\.back\(\)/);
  assert.match(html, /openExternal:function\(u\)\{openExternal\(u\);\}/);
  assert.ok(html.indexOf('<script src="/adm-decisions.js"></script>') > html.lastIndexOf('})();'), 'loaded after the main script');
  const v = JSON.parse(read('vercel.json'));
  const host = html.match(/var SB_URL='([^']+)'/)[1];
  for (const src of ['/adm', '/adm.html']) {
    const csp = v.headers.find((x) => x.source === src).headers.find((x) => x.key === 'Content-Security-Policy').value;
    assert.match(csp, new RegExp("img-src 'self' data: " + host.replace(/\./g, '\\.') + ';'));
  }
  assert.ok(v.functions['api/adm-decisions.js'] && v.functions['api/adm-decisions.js'].maxDuration >= 30);
});
