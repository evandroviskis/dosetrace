'use strict';
/**
 * Admin panel — "Decisões" tab API (founder approved 2026-11-24). The founder reads, on the phone or in the
 * browser, every decision a Claude session left for him (visual or written), and saves his answer even with no
 * Claude open; a later session reads what he decided and executes it. Usage and SQL: docs/decisoes.md.
 * Table, history, the save function and the private bucket: supabase/migrations/20261124000000_founder_decisions.sql.
 *
 * Every request goes through api/_admAuth.js (never weakened): GET needs an allow-listed aal2 session (or the
 * DT Admin device); PATCH also needs Origin https://dosetrace.io, role admin and the 15-minute step-up
 * (device: the phone's biometrics).
 *
 * GET                       → { items, counts: { pendentes, alterando, decididas, executadas, total }, generated_at }
 *   ?status=pendentes|alterando|decididas|executadas   ?area=app|painel|site|divulgacao|outro   (counts never filtered)
 *   Groups (founder 2026-11-24): Pendentes (his turn) · Alteração em andamento (status 'alterando', set only by a
 *   Claude session while it reworks the decision; read only) · Decididas (his answer, executed ones included;
 *   item.executed = true and "executadas" is a sub-filter of it). The badge counts only pendentes.
 * GET ?id=<uuid>            → { item } with images[].url = a signed URL valid for 10 minutes (private bucket)
 * PATCH { id, status, choice?, note? }  — only these four keys; status aprovado|recusado|ajustar; choice one of
 *   the decision's options (or null); note up to 4000 characters, line breaks kept. Written by the definer
 *   function founder_decision_save only (it sets decided_at, keeps a history row, refuses an executed decision (409
 *   executed), one being changed by Claude (409 reworking) and more than 60 saves per hour). Body over 16 KB → 413.
 * Nothing here logs; the service key never leaves the server.
 */
const { checkAdmin } = require('./_admAuth.js');

const BUCKET = 'founder-decisions';
const SIGN_SECONDS = 600;
const MAX_BODY = 16384;
const MAX_NOTE = 4000;
const MAX_CHOICE = 300;
const LIST_LIMIT = 500;
const AREAS = ['app', 'painel', 'site', 'divulgacao', 'outro'];
const GROUPS = ['pendentes', 'alterando', 'decididas', 'executadas'];
const STATUSES = ['aprovado', 'recusado', 'ajustar'];
const WRITABLE = ['id', 'status', 'choice', 'note'];
const COLS = 'id,created_at,updated_at,area,kind,title,question,context,founder_said,recommendation,options,links,images,status,choice,note,decided_at,rework_at,executed_at,executed_note,source,sort';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,250}$/;
// Control characters other than tab and line break never come from a typed note.
const CTRL_RE = /[\u0000-\u0008\u000B-\u001F\u007F]/;

function json(res, status, o) { res.statusCode = status; if (typeof res.status === 'function') res.status(status); res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(o)); }
const bad = (field) => ({ error: 'invalid', field });
const chars = (s) => Array.from(String(s)).length; // as Postgres char_length counts them

function sbConf() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}
function hdr(sb, extra) { return Object.assign({ apikey: sb.key, Authorization: 'Bearer ' + sb.key, Accept: 'application/json' }, extra || {}); }
async function call(sb, path, init) {
  const r = await fetch(sb.url + path, Object.assign({}, init, { headers: hdr(sb, init && init.headers) }));
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  return { ok: r.ok, status: r.status, j };
}

// Body: Vercel hands a parsed object (or the raw string); a stream is read with the same cap.
async function readBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') { if (req.body.length > MAX_BODY) return { tooBig: true }; try { return { v: JSON.parse(req.body) }; } catch (e) { return { v: undefined }; } }
    let size = 0; try { size = JSON.stringify(req.body).length; } catch (e) { return { v: undefined }; }
    if (size > MAX_BODY) return { tooBig: true };
    return { v: req.body };
  }
  if (!req || typeof req.on !== 'function') return { v: undefined };
  return new Promise((resolve) => {
    let s = '', big = false;
    req.on('data', (c) => { if (big) return; s += c; if (s.length > MAX_BODY) big = true; });
    req.on('end', () => { if (big) return resolve({ tooBig: true }); try { resolve({ v: JSON.parse(s) }); } catch (e) { resolve({ v: undefined }); } });
    req.on('error', () => resolve({ v: undefined }));
  });
}

function groupOf(r) { return r.status === 'pendente' ? 'pendentes' : r.status === 'alterando' ? 'alterando' : 'decididas'; }
function inFilter(x, f) { return !f || (f === 'executadas' ? x.executed : x.group === f); }
function safeUrl(u) { const s = String(u || '').trim(); return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : null; }
function safePath(p) { const s = String(p || ''); return PATH_RE.test(s) && s.indexOf('..') < 0 && s.indexOf('//') < 0 ? s : null; }
function kindOf(p) { return /\.html?$/i.test(p) ? 'html' : 'image'; }
// Shape of one row for the page: links only https, pictures only safe paths, options only strings.
function shape(r) {
  const links = (Array.isArray(r.links) ? r.links : []).map((l) => ({ label: String((l && l.label) || '').slice(0, 200), url: safeUrl(l && l.url) })).filter((l) => l.url);
  const images = (Array.isArray(r.images) ? r.images : []).map((i) => ({ label: String((i && i.label) || '').slice(0, 200), path: safePath(i && i.path) })).filter((i) => i.path).map((i) => Object.assign(i, { kind: kindOf(i.path) }));
  const options = (Array.isArray(r.options) ? r.options : []).filter((o) => typeof o === 'string');
  return Object.assign({}, r, { links, images, options, group: groupOf(r), executed: !!r.executed_at });
}
function missing(r) { return r.status === 404 || (r.j && (r.j.code === 'PGRST205' || r.j.code === '42P01' || r.j.code === 'PGRST202')); }

async function sign(sb, images) {
  if (!images.length) return images;
  const r = await call(sb, '/storage/v1/object/sign/' + BUCKET, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: SIGN_SECONDS, paths: images.map((i) => i.path) }) });
  const list = r.ok && Array.isArray(r.j) ? r.j : [];
  return images.map((i) => {
    const hit = list.find((x) => x && x.path === i.path && x.signedURL && !x.error);
    let url = null;
    if (hit) url = /^https:\/\//.test(hit.signedURL) ? hit.signedURL : sb.url + '/storage/v1' + (hit.signedURL.charAt(0) === '/' ? '' : '/') + hit.signedURL;
    return Object.assign({}, i, { url });
  });
}

function validate(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return bad('body');
  for (const k of Object.keys(b)) if (WRITABLE.indexOf(k) < 0) return bad(k);
  if (typeof b.id !== 'string' || !UUID_RE.test(b.id)) return bad('id');
  if (STATUSES.indexOf(b.status) < 0) return bad('status');
  let choice = null;
  if (b.choice != null) { if (typeof b.choice !== 'string' || chars(b.choice) > MAX_CHOICE) return bad('choice'); choice = b.choice.trim() || null; }
  let note = null;
  if (b.note != null) {
    if (typeof b.note !== 'string') return bad('note');
    const n = b.note.replace(/\r\n?/g, '\n').trim();
    if (chars(n) > MAX_NOTE || CTRL_RE.test(n)) return bad('note');
    note = n || null;
  }
  return { id: b.id.toLowerCase(), status: b.status, choice, note };
}

async function handler(req, res, opts) {
  const auth = await checkAdmin(req, opts);
  if (!auth.ok) return json(res, auth.status, auth.body);
  const sb = sbConf();
  if (!sb) return json(res, 503, { error: 'not_configured' });
  const now = (opts && opts.now) || Date.now();
  try {
    const method = String(req.method || 'GET').toUpperCase();
    if (!auth.write) {
      let q; try { q = new URL(req.url || '/', 'http://x').searchParams; } catch (e) { q = new URLSearchParams(); }
      const id = q.get('id');
      if (id != null) {
        if (!UUID_RE.test(id)) return json(res, 400, bad('id'));
        const r = await call(sb, '/rest/v1/founder_decisions?select=' + COLS + '&id=eq.' + encodeURIComponent(id.toLowerCase()));
        if (!r.ok) return json(res, 503, { error: missing(r) ? 'not_configured' : 'unavailable' });
        const row = Array.isArray(r.j) && r.j[0];
        if (!row) return json(res, 404, { error: 'unknown' });
        const item = shape(row);
        item.images = await sign(sb, item.images);
        return json(res, 200, { item, generated_at: new Date(now).toISOString() });
      }
      const status = q.get('status'), area = q.get('area');
      if (status != null && GROUPS.indexOf(status) < 0) return json(res, 400, bad('status'));
      if (area != null && AREAS.indexOf(area) < 0) return json(res, 400, bad('area'));
      const r = await call(sb, '/rest/v1/founder_decisions?select=' + COLS + '&order=sort.asc,created_at.desc&limit=' + LIST_LIMIT);
      if (!r.ok) return json(res, 503, { error: missing(r) ? 'not_configured' : 'unavailable' });
      const all = (Array.isArray(r.j) ? r.j : []).map(shape);
      all.sort((a, b) => (a.sort - b.sort) || (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
      const counts = { pendentes: 0, alterando: 0, decididas: 0, executadas: 0, total: all.length };
      for (const x of all) { counts[x.group]++; if (x.executed) counts.executadas++; }
      const items = all.filter((x) => inFilter(x, status) && (!area || x.area === area));
      return json(res, 200, { items, counts, generated_at: new Date(now).toISOString() });
    }
    if (method !== 'PATCH') return json(res, 405, { error: 'method' });
    const body = await readBody(req);
    if (body.tooBig) return json(res, 413, { error: 'too_large' });
    const v = validate(body.v);
    if (v.error) return json(res, 400, v);
    const r = await call(sb, '/rest/v1/rpc/founder_decision_save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: v.id, p_actor: auth.user.id, p_status: v.status, p_choice: v.choice, p_note: v.note }) });
    if (!r.ok) return json(res, 503, { error: missing(r) ? 'not_configured' : 'store' });
    const st = r.j && r.j.state;
    if (st === 'saved') return json(res, 200, { ok: true, id: r.j.id, status: r.j.status, choice: r.j.choice, note: r.j.note, decided_at: r.j.decided_at });
    if (st === 'unknown') return json(res, 404, { error: 'unknown' });
    if (st === 'executed') return json(res, 409, { error: 'executed', executed_at: r.j.executed_at });
    if (st === 'reworking') return json(res, 409, { error: 'reworking', rework_at: r.j.rework_at });
    if (st === 'bad_choice') return json(res, 400, bad('choice'));
    if (st === 'bad_note') return json(res, 400, bad('note'));
    if (st === 'bad_status') return json(res, 400, bad('status'));
    if (st === 'limited') return json(res, 429, { error: 'rate', retry_after: r.j.retry_after });
    return json(res, 503, { error: 'store' });
  } catch (e) {
    return json(res, 503, { error: 'unavailable' });
  }
}

module.exports = handler;
module.exports.groupOf = groupOf;
module.exports.safeUrl = safeUrl;
