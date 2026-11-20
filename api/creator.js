'use strict';
/**
 * Creators program — the public side (no admin session). Spec docs/specs/creators.md §4, §5, §7.3, §7.4, §11.
 *
 * POST /api/creator, JSON { op, ... }; the link token travels in the BODY (it lives after "#" in the URL, so it
 * never reaches a server log, a referer or this function's URL):
 *   invite_get    { token }            → the creator's name, code, platforms, country, the last review note.
 *   invite_submit { token, profile }   → validates per country, seals the profile (CREATOR_DATA_KEY), stores the
 *                                        masked copy; status becomes "submitted" (an active creator stays active).
 *   portal        { token }            → the creator's own numbers (counts under 5 as "<5", no person-level row).
 *   attribution   { code, source }     → with the APP user's "Authorization: Bearer <Supabase JWT>": first touch.
 * GET /api/creator?op=code&c=ANA-IG    → { valid, platform, benefit_text } for the app (nothing else about the creator).
 * Writes need Origin https://dosetrace.io except "attribution" (the app sends no Origin; its JWT is checked instead).
 * A bad or revoked token is always 401 with the same body. Nothing is logged.
 */
const C = require('./_creators.js');
const D = require('./_creatorsData.js');

const ORIGIN = 'https://dosetrace.io';
function header(req, name) { const v = (req.headers || {})[name]; return Array.isArray(v) ? v[0] : (v == null ? '' : String(v)); }
function json(res, status, o) { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex'); res.end(JSON.stringify(o)); }
async function readBody(req) {
  if (req.body != null) { if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return null; } } return req.body; }
  return new Promise((resolve) => { let s = ''; req.on('data', (c) => { s += c; if (s.length > 64 * 1024) s = ''; }); req.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { resolve(null); } }); req.on('error', () => resolve(null)); });
}
const DENY = { error: 'unauthorized' };

// The live link of a kind by token hash, with its creator.
async function byToken(sb, kind, token) {
  if (!C.validToken(token)) return null;
  const h = C.tokenHash(token);
  const r = await D.rest(sb, `creator_links?select=id,creator_id,kind,expires_at,revoked_at,token_hash&token_hash=eq.${h}&kind=eq.${kind}`);
  if (!r.ok) { const e = new Error('db'); e.status = 503; throw e; }
  const l = Array.isArray(r.j) && r.j[0];
  if (!l || l.revoked_at || !C.safeEqual(l.token_hash, h)) return null;
  if (l.expires_at && Date.parse(l.expires_at) < Date.now()) return null;
  const c = await D.rest(sb, `creators?select=id,code,slug,display_name,country,platforms,status,is_test&id=eq.${encodeURIComponent(l.creator_id)}`);
  if (!c.ok) { const e = new Error('db'); e.status = 503; throw e; }
  const cr = Array.isArray(c.j) && c.j[0];
  if (!cr) return null;
  return { link: l, creator: cr };
}

async function opInviteGet(sb, b, res) {
  const x = await byToken(sb, 'invite', b.token);
  if (!x || x.creator.status === 'ended' || x.creator.status === 'rejected') return json(res, 401, DENY);
  const p = await D.rest(sb, `creator_profiles?select=review,review_note,submitted_at,country,method&creator_id=eq.${x.creator.id}&order=submitted_at.desc&limit=1`);
  const last = p.ok && Array.isArray(p.j) && p.j[0] ? p.j[0] : null;
  const c = x.creator;
  return json(res, 200, {
    name: c.display_name, code: c.code, platforms: c.platforms, country: c.country, status: c.status, is_test: c.is_test,
    codes: (c.platforms || []).map((pl) => ({ platform: pl, code: C.platformCode(c.code, pl), link: C.goLink(c.code, pl) })),
    last: last ? { review: last.review, note: last.review_note, submitted_at: last.submitted_at } : null,
    rules_version: C.RULES_VERSION, methods: { BR: C.methodsFor('BR'), US: C.methodsFor('US'), OTHER: C.methodsFor('PT') },
    expires_at: x.link.expires_at,
  });
}

async function opInviteSubmit(sb, b, res) {
  const key = C.dataKey();
  if (!key) return json(res, 503, { error: 'not_configured' });
  const x = await byToken(sb, 'invite', b.token);
  if (!x || x.creator.status === 'ended' || x.creator.status === 'rejected') return json(res, 401, DENY);
  const v = C.validateProfile(b.profile);
  if (v.error) return json(res, 400, v);
  // Only the platforms of this creator may carry a handle.
  for (const p of Object.keys(v.profile.handles)) if ((x.creator.platforms || []).indexOf(p) < 0) return json(res, 400, { error: 'invalid', field: 'handles' });
  const row = { creator_id: x.creator.id, country: v.country, method: v.method, profile_enc: C.seal(v.profile, key), masked: v.masked, rules_version: C.RULES_VERSION };
  const ins = await D.rest(sb, 'creator_profiles', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  if (!ins.ok) return json(res, 503, { error: 'store' });
  const patch = { country: v.country, updated_at: new Date().toISOString() };
  if (x.creator.status === 'invited') patch.status = 'submitted';
  await D.rest(sb, `creators?id=eq.${x.creator.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
  await D.rest(sb, `creator_links?id=eq.${x.link.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ last_used_at: new Date().toISOString() }) });
  return json(res, 200, { ok: true, masked: v.masked });
}

async function opPortal(sb, b, res) {
  const x = await byToken(sb, 'portal', b.token);
  if (!x || x.creator.status === 'rejected' || ((x.creator.status === 'invited' || x.creator.status === 'submitted') && !x.creator.is_test)) return json(res, 401, DENY);
  const now = Date.now();
  const data = await D.load(sb, x.creator.id);
  const built = D.build(data, now);
  const st = built.creators.find((s) => s.id === x.creator.id);
  if (!st) return json(res, 401, DENY);
  D.rest(sb, `creator_links?id=eq.${x.link.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ last_used_at: new Date(now).toISOString() }) }).catch(() => {});
  const view = D.portalView(st, built.program);
  view.months_list = built.months;
  view.codes = (st.platforms || []).map((pl) => ({ platform: pl, code: C.platformCode(st.code, pl), link: C.goLink(st.code, pl) }));
  view.generated_at = new Date(now).toISOString();
  return json(res, 200, view);
}

async function opCode(sb, q, res) {
  const pc = C.parseCode(q.get('c'));
  if (!pc) return json(res, 200, { valid: false, reason: 'unknown' });
  const r = await D.rest(sb, `creators?select=status,is_test,platforms&code=eq.${encodeURIComponent(pc.base)}`);
  if (!r.ok) return json(res, 503, { error: 'unavailable' });
  const c = Array.isArray(r.j) && r.j[0];
  if (!c || c.status === 'rejected' || ((c.status === 'invited' || c.status === 'submitted') && !c.is_test)) return json(res, 200, { valid: false, reason: 'unknown' });
  if (c.status === 'ended' || c.status === 'paused') return json(res, 200, { valid: false, reason: 'ended' });
  if (pc.platform && (c.platforms || []).indexOf(pc.platform) < 0) return json(res, 200, { valid: false, reason: 'unknown' });
  const s = await D.rest(sb, 'creator_program_settings?select=benefit_text&id=eq.1');
  const benefit = s.ok && Array.isArray(s.j) && s.j[0] ? s.j[0].benefit_text || null : null;
  return json(res, 200, { valid: true, code: pc.code, platform: pc.platform, benefit_text: benefit });
}

// The app's record (spec AP5): the account is the JWT's subject, never a body field.
async function opAttribution(sb, req, b, res) {
  const auth = header(req, 'authorization');
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!jwt) return json(res, 401, DENY);
  let user = null;
  try {
    const r = await fetch(`${sb.url}/auth/v1/user`, { headers: { apikey: process.env.SUPABASE_ANON_KEY || sb.key, Authorization: `Bearer ${jwt}` } });
    if (r.status >= 500) return json(res, 503, { error: 'unavailable' });
    if (!r.ok) return json(res, 401, DENY);
    user = await r.json();
  } catch (e) { return json(res, 503, { error: 'unavailable' }); }
  if (!user || !C.UUID_RE.test(String(user.id))) return json(res, 401, DENY);
  const pc = C.parseCode(b.code);
  const source = String(b.source || '');
  if (!pc || ['typed', 'link', 'play_referrer'].indexOf(source) < 0) return json(res, 400, { error: 'invalid' });
  const r = await D.rest(sb, `creators?select=id,status,platforms,is_test&code=eq.${encodeURIComponent(pc.base)}`);
  if (!r.ok) return json(res, 503, { error: 'unavailable' });
  const c = Array.isArray(r.j) && r.j[0];
  const live = c && (c.status === 'active' || (c.is_test && c.status !== 'ended' && c.status !== 'rejected'));
  if (!live) return json(res, 200, { ok: false, reason: 'unknown' });
  if (pc.platform && (c.platforms || []).indexOf(pc.platform) < 0) return json(res, 200, { ok: false, reason: 'unknown' });
  const row = { user_id: user.id, creator_id: c.id, platform: pc.platform, code: pc.code, source };
  const ins = await D.rest(sb, 'creator_attributions?on_conflict=user_id', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(row) });
  if (!ins.ok) return json(res, 503, { error: 'store' });
  const recorded = Array.isArray(ins.j) && ins.j.length > 0;
  return json(res, 200, { ok: true, recorded, code: pc.code });
}

async function handler(req, res) {
  const sb = D.sbConf();
  const method = String(req.method || 'GET').toUpperCase();
  let q; try { q = new URL(req.url || '/', 'http://x').searchParams; } catch (e) { q = new URLSearchParams(); }
  try {
    if (method === 'GET') {
      if (q.get('op') !== 'code') return json(res, 404, { error: 'not_found' });
      if (!sb) return json(res, 503, { error: 'not_configured' });
      return await opCode(sb, q, res);
    }
    if (method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return json(res, 405, { error: 'method' }); }
    const b = await readBody(req);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return json(res, 400, { error: 'invalid' });
    if (b.op !== 'attribution' && header(req, 'origin') !== ORIGIN) return json(res, 403, { error: 'origin' });
    if (!sb) return json(res, 503, { error: 'not_configured' });
    if (b.op === 'invite_get') return await opInviteGet(sb, b, res);
    if (b.op === 'invite_submit') return await opInviteSubmit(sb, b, res);
    if (b.op === 'portal') return await opPortal(sb, b, res);
    if (b.op === 'attribution') return await opAttribution(sb, req, b, res);
    return json(res, 400, { error: 'invalid' });
  } catch (e) {
    return json(res, 503, { error: 'unavailable' });
  }
}

module.exports = handler;
