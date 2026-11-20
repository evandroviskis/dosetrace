'use strict';
// A tiny in-memory PostgREST for the creators tests: tables as arrays, filters col=eq.v / col=is.null,
// order=col(.desc), limit, POST (insert; on_conflict + resolution=ignore-duplicates), PATCH, DELETE, and the
// four RPCs of supabase/migrations/20261120000000_creators.sql re-implemented in JS. Dummy data only.
const crypto = require('crypto');
const F = require('./admAuthFake');

const PK = { creators: 'id', creator_links: 'id', creator_profiles: 'id', creator_terms: 'id', creator_posts: 'id', creator_payouts: 'id', creator_audit: 'id', rc_events: 'id', creator_attributions: 'user_id', creator_program_settings: 'id' };
const UNIQUE = { creators: [['code']], creator_terms: [['creator_id', 'valid_from']], creator_payouts: [['creator_id', 'month']], creator_links: [['token_hash']] };

function makeDb(seed) {
  const db = Object.assign({ creators: [], creator_links: [], creator_profiles: [], creator_terms: [], creator_clicks: [], creator_attributions: [], rc_events: [], creator_posts: [], creator_payouts: [], creator_program_settings: [{ id: 1, payouts_enabled: false, accountant_ok_at: null, lawyer_ok_at: null, min_payout_cents: 2000, holdback_days: 30, benefit_text: null, apple_pt: null }], creator_audit: [], _test_users: [], _seq: 100 }, seed || {});
  return db;
}
const json = (o, status) => new Response(o === undefined ? '' : JSON.stringify(o), { status: status || 200, headers: { 'Content-Type': 'application/json' } });

function filterRows(rows, params) {
  let out = rows.slice();
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'on_conflict', 'offset'].indexOf(k) >= 0) continue;
    if (v.startsWith('eq.')) { const x = decodeURIComponent(v.slice(3)); out = out.filter((r) => String(r[k]) === x); }
    else if (v === 'is.null') out = out.filter((r) => r[k] == null);
  }
  const ord = params.get('order');
  if (ord) { const [col, dir] = ord.split('.'); out.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (dir === 'desc' ? -1 : 1)); }
  if (params.get('limit')) out = out.slice(0, Number(params.get('limit')));
  return out;
}

function rpc(db, name, a) {
  if (name === 'creator_go') {
    const c = db.creators.find((x) => x.slug === String(a.p_slug).toLowerCase());
    if (!c) return { found: false };
    if (c.status === 'active' || (c.is_test && c.status !== 'ended')) {
      if (c.platforms.indexOf(a.p_platform) >= 0 && ['ios', 'android', 'desktop'].indexOf(a.p_device) >= 0) {
        const day = new Date(db._now || Date.now()).toISOString().slice(0, 10);
        let k = db.creator_clicks.find((x) => x.creator_id === c.id && x.platform === a.p_platform && x.day === day && x.device === a.p_device);
        if (!k) { k = { creator_id: c.id, platform: a.p_platform, day, device: a.p_device, n: 0 }; db.creator_clicks.push(k); }
        k.n++;
      }
      const s = db.creator_program_settings[0];
      return { found: true, live: true, code: c.code, platforms: c.platforms, name: c.display_name, pt: s.apple_pt, benefit: s.benefit_text };
    }
    return { found: true, live: false };
  }
  if (name === 'creator_test_users') return (a.p_ids || []).filter((x) => db._test_users.indexOf(x) >= 0);
  if (name === 'creator_create') {
    const p = a.p;
    if (db.creators.some((c) => c.code === p.code)) return { error: 'code_taken' };
    const id = crypto.randomUUID();
    db.creators.push({ id, code: p.code, slug: p.code.toLowerCase(), display_name: p.display_name, country: p.country || null, platforms: p.platforms, status: 'invited', is_test: !!p.is_test, created_at: new Date(db._now || Date.now()).toISOString(), created_by: p.actor, approved_at: null, ended_at: null });
    if (p.terms) db.creator_terms.push(Object.assign({ id: ++db._seq, creator_id: id, created_by: p.actor, duration_months: null, fixed_month_cents: 0, fixed_post_cents: 0 }, p.terms));
    db.creator_links.push({ id: ++db._seq, creator_id: id, kind: 'invite', token_hash: p.invite_hash, token_enc: p.invite_enc, expires_at: p.invite_expires_at, revoked_at: null, created_at: new Date().toISOString() });
    db.creator_links.push({ id: ++db._seq, creator_id: id, kind: 'portal', token_hash: p.portal_hash, token_enc: p.portal_enc, expires_at: null, revoked_at: null, created_at: new Date().toISOString() });
    db.creator_audit.push({ id: ++db._seq, at: new Date().toISOString(), actor: p.actor, action: 'create', creator_id: id, detail: { code: p.code } });
    return { id };
  }
  if (name === 'creator_link_rotate') {
    for (const l of db.creator_links) if (l.creator_id === a.p_creator && l.kind === a.p_kind && !l.revoked_at) l.revoked_at = new Date().toISOString();
    db.creator_links.push({ id: ++db._seq, creator_id: a.p_creator, kind: a.p_kind, token_hash: a.p_hash, token_enc: a.p_enc, expires_at: a.p_expires, revoked_at: null, created_at: new Date().toISOString() });
    return { ok: true };
  }
  return null;
}

// A data(url, body, init) for F.installFetch / F.withAuth.
function handlerFor(db, opts) {
  const o = opts || {};
  return (url, body, init) => {
    const u = new URL(url);
    const m = u.pathname.match(/^\/rest\/v1\/(rpc\/)?([a-z_]+)$/);
    if (!m) return json({});
    const method = String((init && init.method) || 'GET').toUpperCase();
    const name = m[2];
    if (o.fail && o.fail(name, method)) return json({ message: 'boom' }, 500);
    if (m[1]) { const r = rpc(db, name, body || {}); return r === null ? json({ message: 'no fn' }, 404) : json(r); }
    const rows = db[name];
    if (!rows) return json({ code: 'PGRST205', message: 'Could not find the table' }, 404);
    const prefer = String(((init && init.headers) || {}).Prefer || '');
    if (method === 'GET') {
      const range = ((init && init.headers) || {}).Range;
      let out = filterRows(rows, u.searchParams);
      if (range) { const [a, b] = String(range).split('-').map(Number); out = out.slice(a, b + 1); }
      const sel = u.searchParams.get('select');
      if (sel && sel !== '*') { const cols = sel.split(','); out = out.map((r) => Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]]))); }
      return json(out);
    }
    if (method === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      const added = [];
      for (const r0 of list) {
        const r = Object.assign({}, r0);
        const pk = PK[name];
        if (pk && r[pk] == null) r[pk] = pk === 'id' ? ++db._seq : r[pk];
        const dupPk = pk && rows.some((x) => String(x[pk]) === String(r[pk]));
        const dupU = (UNIQUE[name] || []).some((cols) => rows.some((x) => cols.every((c) => String(x[c]) === String(r[c]))));
        if (dupPk || dupU) { if (/ignore-duplicates/.test(prefer)) continue; return json({ code: '23505', message: 'duplicate' }, 409); }
        if (!r.created_at) r.created_at = new Date(db._now || Date.now()).toISOString();
        if (name === 'creator_profiles' && !r.submitted_at) { r.submitted_at = new Date().toISOString(); r.review = r.review || 'submitted'; }
        if (name === 'creator_attributions' && !r.first_seen_at) r.first_seen_at = new Date(db._now || Date.now()).toISOString();
        if (name === 'creator_audit' && !r.at) r.at = new Date().toISOString();
        rows.push(r); added.push(r);
      }
      return /return=minimal/.test(prefer) ? new Response(null, { status: 201 }) : json(added, 201);
    }
    if (method === 'PATCH') { const hit = filterRows(rows, u.searchParams); for (const r of hit) Object.assign(r, body); return /return=minimal/.test(prefer) ? new Response(null, { status: 204 }) : json(hit); }
    if (method === 'DELETE') { const hit = filterRows(rows, u.searchParams); db[name] = rows.filter((r) => hit.indexOf(r) < 0); return json(hit); }
    return json({}, 405);
  };
}

// Runs a Vercel-style handler with the fake auth + this db. Returns { code, json, headers, body }.
async function run(handler, db, req, opts) {
  const f = F.installFetch(Object.assign({}, opts, { data: handlerFor(db, opts) }));
  const res = { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { if (b) this.body = String(b); } };
  try {
    await handler({ method: req.method || 'GET', url: req.url || '/', headers: req.headers || {}, body: req.body }, res, opts && opts.handlerOpts);
    let j = null; try { j = res.body ? JSON.parse(res.body) : null; } catch (e) { j = null; }
    return { code: res.statusCode, json: j, headers: res.headers, body: res.body, calls: f.calls };
  } finally { f.restore(); }
}

module.exports = { makeDb, handlerFor, run };
