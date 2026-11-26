// Admin panel — "Decisões": "Vou fazer depois" + "Tarefa sua" (founder 2026-11-24, aba nº 76) and the buttons
// "Atualizar" / "Avisar as sessões" with the session signal (founder 2026-11-24, "1 sim" + aba nº 77).
// Designs: docs/specs/desenhos/vou-fazer-depois.html, docs/specs/desenhos/avisar-sessoes.html.
// API api/adm-decisions.js against an in-memory Supabase (the save / ping / signal rules of
// supabase/migrations/20261125000000_founder_decisions_depois_avisos.sql re-implemented), the migration text,
// and the page (web/adm-decisions.js). Dummy data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('./helpers/admAuthFake');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const dec = () => require(path.join(ROOT, 'api/adm-decisions.js'));
const MIG = 'supabase/migrations/20261125000000_founder_decisions_depois_avisos.sql';

const P1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'; // pending
const L1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'; // kept for later
const A1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3'; // approved, not executed
const X1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4'; // executed
const R1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5'; // being changed

function row(o) {
  return Object.assign({ created_at: '2026-11-24T12:00:00Z', updated_at: '2026-11-24T12:00:00Z', area: 'painel', kind: 'outro', title: 'T', question: 'Q', context: null, founder_said: null, recommendation: null, options: [], links: [], images: [], status: 'pendente', choice: null, note: null, decided_at: null, later_at: null, rework_at: null, executed_at: null, executed_note: null, source: 'test', sort: 0, origem: 'adm' }, o);
}
function world(o) {
  o = o || {};
  const W = {
    rows: [
      row({ id: P1, kind: 'tarefa', title: 'Gerar o código pt' }),
      row({ id: L1, kind: 'tarefa', title: 'Fold', status: 'depois', later_at: '2026-11-24T23:52:00Z', note: 'Faço com o Fold.' }),
      row({ id: A1, origem: 'app', status: 'aprovado', decided_at: '2026-11-24T23:00:00Z' }),
      row({ id: X1, origem: 'ads', status: 'aprovado', decided_at: '2026-11-24T20:00:00Z', executed_at: '2026-11-24T21:00:00Z', executed_note: 'feito' }),
      row({ id: R1, status: 'alterando', decided_at: '2026-11-24T22:00:00Z', rework_at: '2026-11-24T22:30:00Z' }),
    ],
    pings: o.pings ? o.pings.slice() : [], rpc: [], saves: 0,
  };
  W.data = (url, body, init) => {
    const u = new URL(url);
    const method = String((init && init.method) || 'GET').toUpperCase();
    if (u.pathname === '/rest/v1/rpc/founder_decision_save') {
      W.rpc.push(['save', body]);
      const a = body;
      if (['aprovado', 'recusado', 'ajustar', 'depois', 'pendente'].indexOf(a.p_status) < 0) return F.json({ state: 'bad_status' });
      const r = W.rows.find((x) => x.id === a.p_id);
      if (!r) return F.json({ state: 'unknown' });
      if (r.executed_at) return F.json({ state: 'executed', executed_at: r.executed_at });
      if (r.status === 'alterando') return F.json({ state: 'reworking', rework_at: r.rework_at });
      if (a.p_status === 'depois' && r.status !== 'pendente') return F.json({ state: 'bad_transition' });
      if (a.p_status === 'pendente' && r.status !== 'depois') return F.json({ state: 'bad_transition' });
      const note = a.p_note == null || !String(a.p_note).trim() ? null : String(a.p_note).trim();
      if (a.p_status === 'depois') Object.assign(r, { status: 'depois', later_at: '2026-11-25T01:00:00Z', choice: null, note, decided_at: null });
      else if (a.p_status === 'pendente') Object.assign(r, { status: 'pendente', later_at: null, choice: null, note: null, decided_at: null });
      else Object.assign(r, { status: a.p_status, later_at: null, choice: a.p_choice || null, note, decided_at: '2026-11-25T01:00:00Z' });
      return F.json({ state: 'saved', id: r.id, status: r.status, choice: r.choice, note: r.note, decided_at: r.decided_at, later_at: r.later_at });
    }
    if (u.pathname === '/rest/v1/rpc/founder_decision_ping') {
      W.rpc.push(['ping', body]);
      if (W.pings.filter((p) => p.actor === body.p_actor).length >= (o.pingLimit != null ? o.pingLimit : 20)) return F.json({ state: 'limited', retry_after: 900 });
      const p = { at: '2026-11-25T00:43:00Z', actor: body.p_actor, origem: body.p_origem };
      W.pings.push(p);
      return F.json({ state: 'sent', at: p.at, origem: p.origem });
    }
    if (u.pathname === '/rest/v1/founder_decisions' && method === 'GET') {
      let out = W.rows.slice(); const id = u.searchParams.get('id');
      if (id) out = out.filter((x) => 'eq.' + x.id === id);
      return F.json(JSON.parse(JSON.stringify(out)));
    }
    if (u.pathname === '/rest/v1/founder_decision_pings' && method === 'GET') {
      const out = W.pings.slice().sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 1).map((p) => ({ at: p.at, origem: p.origem }));
      return F.json(out);
    }
    return F.json({ message: 'unexpected ' + method + ' ' + u.pathname }, 500);
  };
  return W;
}
function withEnv(fn) { return async () => { F.envOn(); try { await fn(); } finally { F.envOff(); } }; }
const ADMIN = () => Object.assign({}, F.bearer('admin', { totpS: 30 }), F.ORIGIN);
const get = (W, q) => F.call(dec(), { method: 'GET', url: '/api/adm-decisions' + (q || ''), headers: F.bearer('admin') }, { data: W.data });
const patch = (W, body, h) => F.call(dec(), { method: 'PATCH', url: '/api/adm-decisions', headers: h || ADMIN(), body }, { data: W.data });
const post = (W, body, h) => F.call(dec(), { method: 'POST', url: '/api/adm-decisions', headers: h || ADMIN(), body }, { data: W.data });

// ------------------------------------------------------------------ DL1: "Vou fazer depois" through the API
test('DL1: "Vou fazer depois" goes through the save RPC (status depois, note optional); "Voltar para Pendentes" = status pendente; the list has a Depois group and count, the badge still counts only Pendentes', withEnv(async () => {
  const W = world();
  const r = await patch(W, { id: P1, status: 'depois', note: 'Faço no computador.' });
  assert.equal(r.code, 200, r.body);
  assert.equal(r.json.status, 'depois'); assert.equal(r.json.later_at, '2026-11-25T01:00:00Z'); assert.equal(r.json.decided_at, null, 'not counted as decided');
  assert.deepEqual(W.rpc[0], ['save', { p_id: P1, p_actor: F.USERS.admin.id, p_status: 'depois', p_choice: null, p_note: 'Faço no computador.' }]);
  const back = await patch(W, { id: L1, status: 'pendente' });
  assert.equal(back.code, 200); assert.equal(back.json.status, 'pendente');
  const l = await get(W);
  assert.equal(l.code, 200);
  assert.equal(l.json.items.find((x) => x.id === P1).group, 'depois');
  assert.equal(l.json.items.find((x) => x.id === L1).group, 'pendentes');
  assert.deepEqual([l.json.counts.pendentes, l.json.counts.depois, l.json.counts.alterando, l.json.counts.decididas], [1, 1, 1, 2]);
  assert.equal(l.json.by_origem.adm.depois, 1);
  const only = await get(W, '?status=depois');
  assert.deepEqual(only.json.items.map((x) => x.id), [P1]);
  assert.ok('later_at' in only.json.items[0], 'later_at reaches the page');
}));

test('DL1: transitions the database refuses answer 409 transition — later only from Pendentes, back only from Depois; executed and being-changed stay read only; alterando can never be set from the panel', withEnv(async () => {
  const W = world();
  const a = await patch(W, { id: A1, status: 'depois' });
  assert.equal(a.code, 409); assert.equal(a.json.error, 'transition');
  const p = await patch(W, { id: P1, status: 'pendente' });
  assert.equal(p.code, 409); assert.equal(p.json.error, 'transition');
  assert.equal((await patch(W, { id: X1, status: 'depois' })).json.error, 'executed');
  assert.equal((await patch(W, { id: R1, status: 'depois' })).json.error, 'reworking');
  const alt = await patch(W, { id: P1, status: 'alterando' });
  assert.equal(alt.code, 400); assert.equal(alt.json.field, 'status');
  const dec2 = await patch(W, { id: L1, status: 'aprovado' });
  assert.equal(dec2.code, 200, 'he can decide straight from Depois'); assert.equal(W.rows.find((x) => x.id === L1).later_at, null);
}));

// ------------------------------------------------------------------ DA1: "Avisar as sessões" through the API
test('DA1: "Avisar as sessões" = POST { action: ping, origem? } through founder_decision_ping with the admin as actor; same Origin / admin / step-up rule as a save; over 20 an hour 429; the list says when the last notice went out', withEnv(async () => {
  const W = world();
  const all = await post(W, { action: 'ping' });
  assert.equal(all.code, 200, all.body); assert.equal(all.json.state, 'sent'); assert.equal(all.json.origem, null);
  assert.deepEqual(W.rpc[0], ['ping', { p_actor: F.USERS.admin.id, p_origem: null }]);
  const one = await post(W, { action: 'ping', origem: 'adm' });
  assert.equal(one.code, 200); assert.equal(W.rpc[1][1].p_origem, 'adm');
  for (const [b, f] of [[{ action: 'ping', origem: 'evox' }, 'origem'], [{ action: 'nope' }, 'action'], [{ action: 'ping', extra: 1 }, 'extra'], [{ id: P1, status: 'aprovado' }, 'id'], [{}, 'action']]) {
    const r = await post(W, b); assert.equal(r.code, 400, JSON.stringify(b)); assert.equal(r.json.field, f);
  }
  assert.equal((await post(W, { action: 'ping' }, F.bearer('admin', { totpS: 30 }))).code, 403, 'no Origin');
  assert.equal((await post(W, { action: 'ping' }, Object.assign({}, F.bearer('viewer', { totpS: 30 }), F.ORIGIN))).code, 403, 'viewer');
  assert.equal((await post(W, { action: 'ping' }, Object.assign({}, F.bearer('admin', { totpS: 3600 }), F.ORIGIN))).code, 401, 'step-up');
  assert.equal(W.rpc.length, 2);
  const lim = await post(world({ pingLimit: 0 }), { action: 'ping' });
  assert.equal(lim.code, 429); assert.equal(lim.json.retry_after, 900);
  const l = await get(W);
  assert.equal(l.json.last_ping_at, '2026-11-25T00:43:00Z');
  const none = await get(world());
  assert.equal(none.json.last_ping_at, null);
}));

// ------------------------------------------------------------------ DL2 / DA2: the migration text
test('DL2 SQL: one transaction on top of the three applied ones — status depois with later_at (decided_at stays null), kind tarefa, history accepts depois and pendente, the save allows later only from pendente and back only from depois, a decision clears later_at; header APPLIED 2026-11-26 after his "pode" (aba nº 81)', () => {
  const sql = read(MIG);
  const body = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  assert.match(sql, /-- STATUS: APPLIED 2026-11-26 in production \(supabase_migrations\.schema_migrations 20261126161844/, 'applied with his "Item 81, pode."');
  assert.ok(!/NOT APPLIED/.test(sql), 'header never says not applied once it is');
  assert.equal((body.match(/^begin;$/gm) || []).length, 1); assert.equal((body.match(/^commit;$/gm) || []).length, 1);
  assert.match(body, /add column if not exists later_at timestamptz;/);
  assert.match(body, /check \(status in \('pendente', 'aprovado', 'recusado', 'ajustar', 'alterando', 'depois'\)\)/);
  assert.match(body, /add constraint founder_decisions_decided\n  check \(\(status in \('pendente', 'depois'\)\) = \(decided_at is null\)\);/);
  assert.match(body, /add constraint founder_decisions_later\n  check \(\(status = 'depois'\) = \(later_at is not null\)\);/);
  assert.match(body, /check \(kind in \('visual', 'texto', 'regra', 'outro', 'tarefa'\)\)/);
  assert.match(body, /founder_decision_events_status_check\n  check \(status in \('aprovado', 'recusado', 'ajustar', 'depois', 'pendente'\)\)/);
  const fn = body.match(/create or replace function public\.founder_decision_save[\s\S]*?\$\$;/)[0];
  assert.match(fn, /security definer/);
  assert.match(fn, /p_status not in \('aprovado', 'recusado', 'ajustar', 'depois', 'pendente'\)/, 'never alterando');
  assert.match(fn, /if p_status = 'depois' and r\.status <> 'pendente' then return jsonb_build_object\('state', 'bad_transition'\)/);
  assert.match(fn, /if p_status = 'pendente' and r\.status <> 'depois' then return jsonb_build_object\('state', 'bad_transition'\)/);
  for (const k of ["'executed'", "'reworking'", "'bad_transition'", "'limited'"]) assert.ok(fn.indexOf(k) < fn.indexOf('update public.founder_decisions'), k + ' refused before any write');
  assert.match(fn, /later_at = null/); assert.match(fn, /later_at = now\(\)/);
  assert.match(body, /revoke all on function public\.founder_decision_save\(uuid, uuid, text, text, text\) from public, anon, authenticated;\ngrant execute on function public\.founder_decision_save\(uuid, uuid, text, text, text\) to service_role;/);
  for (const f of ['20261124000000_founder_decisions.sql', '20261124010000_founder_decisions_alterando.sql', '20261124020000_founder_decisions_origem.sql'])
    assert.ok(!/depois|later_at|founder_decision_ping/.test(read('supabase/migrations/' + f)), f + ' stays as applied');
});

test('DA2 SQL: notices table and the session signal — RLS on, no policy, no write grant; the ping as definer for service_role only with 20 an hour; one key per session stored only as a sha256; the signal returns numbers and times only, executable by anon', () => {
  const sql = read(MIG);
  const body = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  assert.match(body, /create table if not exists public\.founder_decision_pings/);
  assert.match(body, /origem text check \(origem is null or origem in \('app', 'adm', 'ads'\)\)/);
  assert.match(body, /create table if not exists public\.founder_decision_signal_keys/);
  assert.match(body, /hash text not null unique check \(hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(body, /label text not null check \(label in \('app', 'adm', 'ads'\)\)/);
  for (const t of ['founder_decision_pings', 'founder_decision_signal_keys']) {
    assert.match(body, new RegExp('alter table public\\.' + t + ' enable row level security;'));
    assert.match(body, new RegExp('revoke all on table public\\.' + t + ' from public, anon, authenticated, service_role;'));
  }
  assert.match(body, /grant select on table public\.founder_decision_pings to service_role;/);
  assert.ok(!/grant [a-z, ]+ on table public\.founder_decision_signal_keys/.test(body), 'nobody reads the keys table');
  assert.ok(!/create policy/i.test(body)); assert.ok(!/grant (insert|update|delete|all)/i.test(body));
  const ping = body.match(/create or replace function public\.founder_decision_ping[\s\S]*?\$\$;/)[0];
  assert.match(ping, /security definer/); assert.match(ping, /if n >= 20 then/); assert.match(ping, /pg_advisory_xact_lock/);
  assert.match(body, /revoke all on function public\.founder_decision_ping\(uuid, text\) from public, anon, authenticated;\ngrant execute on function public\.founder_decision_ping\(uuid, text\) to service_role;/);
  const sig = body.match(/create or replace function public\.founder_decisions_signal[\s\S]*?\$\$;/)[0];
  assert.match(sig, /security definer/); assert.match(sig, /stable/);
  assert.match(sig, /encode\(sha256\(convert_to\(p_token, 'UTF8'\)\), 'hex'\)/);
  assert.match(sig, /revoked_at is null/);
  assert.match(sig, /char_length\(p_token\) < 32/);
  for (const col of ['title', 'question', 'context', 'note', 'choice', 'founder_said', 'executed_note', 'actor']) assert.ok(!new RegExp('\\b' + col + '\\b').test(sig), 'the signal never reads ' + col);
  for (const k of ["'aguardando'", "'ultima_resposta'", "'ultimo_aviso'"]) assert.ok(sig.includes(k), k);
  assert.match(sig, /status in \('aprovado', 'recusado', 'ajustar'\)/);
  assert.match(body, /revoke all on function public\.founder_decisions_signal\(text\) from public;\ngrant execute on function public\.founder_decisions_signal\(text\) to anon, authenticated, service_role;/);
  assert.match(sql, /-- Rollback/);
  assert.ok(!/\bauth\./.test(body), 'nothing in the auth schema');
});

// ------------------------------------------------------------------ DL3 / DA3: the page
function loadInBox() {
  const win = {}, doc = { getElementById: () => null, querySelectorAll: () => [], body: { contains: () => false }, head: { appendChild() {} }, createElement: () => ({}), addEventListener() {}, documentElement: {} };
  new Function('window', 'document', read('web/adm-decisions.js'))(win, doc);
  return win;
}
test('DL3: the page — four groups (Pendentes · Vou fazer depois · Alteração em andamento · Decididas), "Vou fazer depois" under the three answers on a pending card, "Voltar para Pendentes" plus the three answers on a kept card with the "kept since" banner, "Tarefa sua" label', () => {
  const win = loadInBox(); const T = win.DC_T, st = win.DCTab._state;
  assert.equal(T.pt.g_depois, 'Vou fazer depois'); assert.equal(T.pt.later, 'Vou fazer depois'); assert.equal(T.pt.back_pending, 'Voltar para Pendentes'); assert.equal(T.pt.k_tarefa, 'Tarefa sua'); assert.equal(T.pt.st_depois, 'Para depois');
  assert.equal(win.DCTab._group({ status: 'depois' }), 'depois');
  st.data = { items: [{ id: '1', origem: 'adm', status: 'pendente', group: 'pendentes', area: 'painel', kind: 'tarefa', title: 'T', question: 'Q' }, { id: '2', origem: 'adm', status: 'depois', group: 'depois', area: 'painel', kind: 'outro', title: 'U', question: 'Q', later_at: '2026-11-24T23:52:00Z', note: 'Faço depois.' }],
    counts: { pendentes: 1, depois: 1, alterando: 0, decididas: 0, executadas: 0, total: 2 }, by_origem: {} };
  st.group = 'pendentes'; st.origem = '';
  let h = win.DCTab._list();
  const seg = h.match(/<div class="dc-seg"[\s\S]*?<\/div>/)[0];
  assert.deepEqual([...seg.matchAll(/data-v="([a-z]+)"/g)].map((m) => m[1]), ['pendentes', 'depois', 'alterando', 'decididas']);
  assert.ok(h.includes('dc-tag task') && h.includes('Task for you'), 'Tarefa sua label on the card');
  st.group = 'depois'; h = win.DCTab._list();
  assert.ok(h.includes('Faço depois.'), 'kept card shows his note');
  const P = { id: '1', area: 'painel', kind: 'tarefa', title: 'T', question: 'Q', options: [], links: [], images: [], status: 'pendente', created_at: '2026-11-24T10:00:00Z' };
  st.det = P; st.draft = { status: null, choice: null, note: '' };
  let d = win.DCTab._detail();
  assert.deepEqual([...d.matchAll(/data-a="status" data-v="([a-z]+)"/g)].map((m) => m[1]), ['aprovado', 'recusado', 'ajustar', 'depois']);
  assert.ok(d.indexOf('data-v="depois"') > d.indexOf('data-v="ajustar"'), 'set apart below the three');
  st.det = Object.assign({}, P, { status: 'depois', later_at: '2026-11-24T23:52:00Z', note: 'Faço depois.' }); st.draft = { status: null, choice: null, note: '' };
  d = win.DCTab._detail();
  assert.deepEqual([...d.matchAll(/data-a="status" data-v="([a-z]+)"/g)].map((m) => m[1]), ['aprovado', 'recusado', 'ajustar', 'pendente']);
  assert.ok(d.includes('dc-banner later') && d.includes('Faço depois.'), 'kept-since banner with his note');
  assert.equal(win.DCTab._readOnly(), false, 'he can decide from a kept card');
  st.data = null; st.det = null; st.draft = null; st.group = 'pendentes';
});

test('DA3: the page — "Atualizar" and "Avisar as sessões" at the top (the notice follows the chosen session and shows how many answers wait), the times under them, "Novidades" = what the sessions did since the last look', () => {
  const win = loadInBox(); const T = win.DC_T, st = win.DCTab._state;
  assert.equal(T.pt.refresh, 'Atualizar'); assert.equal(T.pt.ping_all, 'Avisar as sessões'); assert.equal(T.pt.ping_one, 'Avisar {s}'); assert.equal(T.pt.news_h, 'Novidades desde {d}');
  const items = [
    { id: 'a', origem: 'adm', status: 'aprovado', group: 'decididas', decided_at: '2026-11-24T23:00:00Z', executed_at: null, title: 'A', question: 'Q', area: 'painel', kind: 'outro' },
    { id: 'b', origem: 'app', status: 'ajustar', group: 'decididas', decided_at: '2026-11-24T23:00:00Z', executed_at: null, title: 'B', question: 'Q', area: 'app', kind: 'outro' },
    { id: 'c', origem: 'adm', status: 'aprovado', group: 'decididas', decided_at: '2026-11-24T20:00:00Z', executed_at: '2026-11-25T00:10:00Z', executed_note: 'Registrado.', title: 'C', question: 'Q', area: 'painel', kind: 'outro', created_at: '2026-11-24T10:00:00Z', updated_at: '2026-11-25T00:10:00Z' },
    { id: 'd', origem: 'app', status: 'alterando', group: 'alterando', decided_at: '2026-11-24T20:00:00Z', rework_at: '2026-11-25T00:21:00Z', title: 'D', question: 'Q', area: 'app', kind: 'outro', created_at: '2026-11-24T10:00:00Z', updated_at: '2026-11-25T00:21:00Z' },
    { id: 'e', origem: 'adm', status: 'pendente', group: 'pendentes', title: 'E', question: 'Q', area: 'painel', kind: 'outro', created_at: '2026-11-25T00:30:00Z', updated_at: '2026-11-25T00:30:00Z' },
    { id: 'f', origem: 'adm', status: 'pendente', group: 'pendentes', title: 'F', question: 'Q', area: 'painel', kind: 'outro', created_at: '2026-11-24T10:00:00Z', updated_at: '2026-11-25T00:31:00Z' },
    { id: 'g', origem: 'adm', status: 'pendente', group: 'pendentes', title: 'G', question: 'Q', area: 'painel', kind: 'outro', created_at: '2026-11-24T10:00:00Z', updated_at: '2026-11-24T11:00:00Z' },
  ];
  const n = win.DCTab._news(items, '2026-11-25T00:00:00Z');
  assert.deepEqual(n.map((x) => x.id + ':' + x.what), ['f:version', 'e:new', 'd:rework', 'c:executed'], 'newest first; nothing he did himself, nothing older');
  assert.deepEqual(win.DCTab._news(items, null), [], 'first look ever: no box');
  st.data = { items, counts: { pendentes: 3, depois: 0, alterando: 1, decididas: 3, executadas: 1, total: 7 }, by_origem: {}, last_ping_at: '2026-11-25T00:43:00Z' };
  st.group = 'pendentes'; st.origem = '';
  let h = win.DCTab._list();
  assert.ok(h.includes('data-a="refresh"') && h.includes('data-a="ping"'));
  assert.ok(h.indexOf('data-a="ping"') < h.indexOf('<div class="dc-orig-seg"'), 'above the session selector');
  assert.match(h, /Notify the sessions · 2</, 'answers waiting, all sessions');
  st.origem = 'adm'; h = win.DCTab._list();
  assert.match(h, /Notify Admin panel · 1</, 'follows the chosen session');
  assert.equal(win.DCTab._pingOrigem(), 'adm');
  st.origem = ''; assert.equal(win.DCTab._pingOrigem(), null);
  st.news = n; h = win.DCTab._list();
  assert.ok(h.includes('class="dc-new"') && h.includes('Registrado.'), 'what changed, with the session note');
  st.data = null; st.news = null;
});
