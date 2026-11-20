'use strict';
/**
 * Creators program: loading the tables (service role, server only) and building the numbers shown in the admin tab
 * and in the creator portal. build() is pure: the same function feeds both, so the portal always matches the panel.
 * Spec docs/specs/creators.md §2, §6, §7, §8.
 *
 * Test separation (founder rule 2026-11-20): test accounts and SANDBOX purchases never enter the numbers of real
 * creators or the totals; a test creator (is_test) shows its own test data, flagged, and never enters the totals.
 */
const C = require('./_creators.js');

function sbConf() { const url = (process.env.SUPABASE_URL || '').replace(/\/$/, ''); const key = process.env.SUPABASE_SERVICE_ROLE_KEY; return url && key ? { url, key } : null; }
function hdr(sb, extra) { return Object.assign({ apikey: sb.key, Authorization: `Bearer ${sb.key}`, Accept: 'application/json' }, extra || {}); }
async function rest(sb, path, init) {
  const r = await fetch(`${sb.url}/rest/v1/${path}`, Object.assign({}, init, { headers: hdr(sb, (init && init.headers) || {}) }));
  let j = null; try { const t = await r.text(); j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
  return { ok: r.ok, status: r.status, j };
}
async function all(sb, table, select, extra) {
  const out = [];
  for (let from = 0; from < 50000; from += 1000) {
    const r = await rest(sb, `${table}?select=${select}${extra ? '&' + extra : ''}`, { headers: { Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } });
    if (!r.ok) { const e = new Error('load ' + table); e.status = r.status; e.table = table; throw e; }
    const rows = Array.isArray(r.j) ? r.j : [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
async function rpc(sb, fn, args) {
  const r = await fetch(`${sb.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: hdr(sb, { 'Content-Type': 'application/json' }), body: JSON.stringify(args) });
  let j = null; try { const t = await r.text(); j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
  return { ok: r.ok, status: r.status, j };
}

// Everything build() needs. `only` = one creator id (the portal): its rows only, but all events (attribution needs them).
async function load(sb, only) {
  const f = only ? `creator_id=eq.${encodeURIComponent(only)}` : '';
  const [creators, terms, clicks, attributions, events, posts, payouts, settings, profiles] = await Promise.all([
    all(sb, 'creators', 'id,code,slug,display_name,country,platforms,status,is_test,created_at,approved_at,ended_at', only ? `id=eq.${encodeURIComponent(only)}` : 'order=created_at'),
    all(sb, 'creator_terms', 'id,creator_id,valid_from,pct,duration,duration_months,basis,fixed_month_cents,fixed_post_cents,contract_signed_on,contract_ref,created_at', (f ? f + '&' : '') + 'order=valid_from'),
    all(sb, 'creator_clicks', 'creator_id,platform,day,device,n', f),
    all(sb, 'creator_attributions', 'user_id,creator_id,platform,code,source,first_seen_at', ''),
    all(sb, 'rc_events', 'id,type,environment,app_user_id,original_app_user_id,aliases,period_type,cancel_reason,event_at,expiration_at,price_usd,tax_pct,commission_pct,transaction_id,original_transaction_id,creator_code', 'order=event_at'),
    all(sb, 'creator_posts', 'id,creator_id,posted_on,platform,note', (f ? f + '&' : '') + 'order=posted_on'),
    all(sb, 'creator_payouts', 'id,creator_id,month,amount_due_cents,paid_on,paid_amount,paid_currency,fx,method,reference,created_at', f),
    all(sb, 'creator_program_settings', 'payouts_enabled,accountant_ok_at,lawyer_ok_at,min_payout_cents,holdback_days,benefit_text,apple_pt,updated_at', 'id=eq.1'),
    all(sb, 'creator_profiles', 'id,creator_id,submitted_at,country,method,masked,rules_version,review,review_note,reviewed_at,tax_form_received_on', (f ? f + '&' : '') + 'order=submitted_at'),
  ]);
  const ids = new Set(attributions.map((a) => a.user_id));
  for (const e of events) { const u = C.canonicalUser(e); if (u && C.UUID_RE.test(u)) ids.add(u); }
  let testUsers = [];
  if (ids.size) {
    const r = await rpc(sb, 'creator_test_users', { p_ids: Array.from(ids) });
    if (!r.ok) { const e = new Error('test users'); e.status = r.status; throw e; }
    testUsers = (Array.isArray(r.j) ? r.j : []).map((x) => (typeof x === 'string' ? x : x && (x.creator_test_users || x.id))).filter(Boolean);
  }
  return { creators, terms, clicks, attributions, events, posts, payouts, settings: settings[0] || {}, profiles, testUsers };
}

const ym = (iso) => String(iso || '').slice(0, 7);
function lastMonths(now, n) { const d = new Date(now); const end = d.toISOString().slice(0, 7); const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (n - 1), 1)).toISOString().slice(0, 7); return C.monthsBetween(s, end); }
const blankMonth = () => ({ clicks: 0, accounts: 0, late: 0, trials: 0, paid_users: 0, revenue_cents: 0, by_platform: {} });
function plat(m, p) { const k = p || 'none'; if (!m.by_platform[k]) m.by_platform[k] = { clicks: 0, clicks_ios: 0, clicks_android: 0, clicks_desktop: 0, accounts: 0, trials: 0, paid_users: 0, revenue_cents: 0 }; return m.by_platform[k]; }

/**
 * data = load() result. Returns { months, creators: [stats], totals: { [ym]: {...} }, program }.
 * Each creator: { id, code, slug, name, country, platforms, status, is_test, months: { [ym]: month }, statement,
 * active_payers, revenue_total_cents, accounts_total, best_platform: { [ym]: p }, terms, profile, has_terms }.
 */
function build(data, now, opts) {
  const o = opts || {};
  const months = o.months || lastMonths(now, 12);
  const test = new Set(data.testUsers || []);
  const byBase = {}; for (const c of data.creators) byBase[c.code] = c;
  const attRows = {}; for (const a of data.attributions) attRows[a.user_id] = a;

  // Events per account, oldest first.
  const users = new Map();
  for (const e of data.events) { const u = C.canonicalUser(e); if (!u) continue; if (!users.has(u)) users.set(u, []); users.get(u).push(e); }
  for (const evs of users.values()) evs.sort((a, b) => (a.event_at < b.event_at ? -1 : a.event_at > b.event_at ? 1 : 0));
  for (const a of data.attributions) if (!users.has(a.user_id)) users.set(a.user_id, []);
  const resolved = C.resolveAttributions(users, attRows, byBase);

  const out = [];
  const totals = {}; for (const m of months) totals[m] = blankMonth();
  for (const c of data.creators) {
    const isTest = !!c.is_test;
    const keep = (uid, e) => isTest || (!test.has(uid) && (!e || e.environment !== 'SANDBOX'));
    const mine = new Map(), late = [];
    for (const [uid, r] of resolved) {
      if (r.creator_id !== c.id) continue;
      if (!isTest && test.has(uid)) continue;
      if (r.late) { late.push(uid); continue; }
      mine.set(uid, { r, evs: (users.get(uid) || []).filter((e) => keep(uid, e)) });
    }
    const st = { id: c.id, code: c.code, slug: c.slug, name: c.display_name, country: c.country, platforms: c.platforms || [], status: c.status, is_test: isTest, created_at: c.created_at, months: {}, best_platform: {} };
    for (const m of months) st.months[m] = blankMonth();
    // clicks
    for (const k of data.clicks) {
      if (k.creator_id !== c.id) continue;
      const m = st.months[ym(k.day)]; if (!m) continue;
      m.clicks += k.n; const p = plat(m, k.platform); p.clicks += k.n; p['clicks_' + k.device] = (p['clicks_' + k.device] || 0) + k.n;
    }
    // accounts with the code (first touch month) and trials
    let accountsTotal = 0;
    for (const [uid, { r, evs }] of mine) {
      const row = attRows[uid];
      const first = row ? row.first_seen_at : (evs[0] && evs[0].event_at);
      accountsTotal++;
      const m = st.months[ym(first)];
      if (m) { m.accounts++; plat(m, r.platform).accounts++; }
      for (const e of evs) if (C.isTrialStart(e)) { const mm = st.months[ym(e.event_at)]; if (mm) { mm.trials++; plat(mm, r.platform).trials++; } }
    }
    for (const uid of late) { const row = attRows[uid]; const m = row && st.months[ym(row.first_seen_at)]; if (m) m.late++; }
    // revenue and commission
    const terms = data.terms.filter((t) => t.creator_id === c.id).sort((a, b) => (a.valid_from < b.valid_from ? -1 : 1));
    const userEvents = new Map(); for (const [uid, x] of mine) userEvents.set(uid, x.evs);
    const posts = data.posts.filter((p) => p.creator_id === c.id);
    const allMonths = C.monthsBetween(ym(c.created_at) < months[0] ? ym(c.created_at) : months[0], months[months.length - 1]);
    const lines = C.commissionLines(userEvents, terms, { months: allMonths, posts, startedAt: c.approved_at || c.created_at, endedAt: c.ended_at });
    const paidSets = {};
    for (const l of lines) {
      if (l.kind !== 'rev' && l.kind !== 'refund') continue;
      const m = st.months[l.month]; if (!m) continue;
      const p = plat(m, mine.get(l.user) && mine.get(l.user).r.platform);
      m.revenue_cents += l.net; p.revenue_cents += l.net;
      if (l.net > 0) { const k = l.month + '|' + l.user; if (!paidSets[k]) { paidSets[k] = 1; m.paid_users++; p.paid_users++; } }
    }
    st.revenue_total_cents = lines.reduce((a, l) => a + (l.kind === 'rev' || l.kind === 'refund' ? l.net : 0), 0);
    st.accounts_total = accountsTotal;
    // active payers now: the last paid period still running, not refunded or expired after it
    let active = 0;
    for (const [, { evs }] of mine) {
      const paid = evs.filter((e) => C.netCents(e) > 0 && e.type !== 'REFUND_REVERSED');
      const lp = paid[paid.length - 1]; if (!lp) continue;
      const after = evs.filter((e) => e.event_at > lp.event_at);
      if (lp.expiration_at && Date.parse(lp.expiration_at) > now && !after.some((e) => C.isRefund(e) || e.type === 'EXPIRATION')) active++;
    }
    st.active_payers = active;
    const payouts = data.payouts.filter((p) => p.creator_id === c.id);
    st.statement = C.statement(lines, allMonths, data.settings, payouts, now, terms.length > 0);
    st.has_terms = terms.length > 0;
    st.terms = terms;
    st.terms_now = C.termsAt(terms, new Date(now).toISOString()) || null;
    st.posts = posts;
    st.payouts = payouts;
    const profs = data.profiles.filter((p) => p.creator_id === c.id);
    const lp = profs.length ? profs[profs.length - 1] : null;
    st.profile = lp ? { id: lp.id, submitted_at: lp.submitted_at, country: lp.country, method: lp.method, masked: lp.masked, rules_version: lp.rules_version, review: lp.review, review_note: lp.review_note, reviewed_at: lp.reviewed_at, tax_form_received_on: lp.tax_form_received_on } : null; // explicit copy: never the sealed blob
    for (const m of months) {
      let best = null, v = 0;
      for (const [p, x] of Object.entries(st.months[m].by_platform)) if (p !== 'none' && x.revenue_cents > v) { v = x.revenue_cents; best = p; }
      st.best_platform[m] = best;
      if (!isTest) {
        const T = totals[m], S = st.months[m];
        for (const k of ['clicks', 'accounts', 'late', 'trials', 'paid_users', 'revenue_cents']) T[k] += S[k];
        for (const [p, x] of Object.entries(S.by_platform)) { const tp = plat(T, p); for (const k of Object.keys(x)) tp[k] = (tp[k] || 0) + x[k]; }
      }
    }
    out.push(st);
  }
  const real = out.filter((s) => !s.is_test);
  const cur = months[months.length - 1];
  const program = Object.assign({ payouts_enabled: false, min_payout_cents: 2000, holdback_days: 30 }, data.settings || {});
  return {
    months, creators: out, totals, program,
    summary: {
      month: cur,
      active_payers: real.reduce((a, s) => a + s.active_payers, 0),
      due_cents: real.reduce((a, s) => a + s.statement.filter((r) => r.status === 'due').reduce((x, r) => x + r.payable_cents, 0), 0),
      pending_cents: real.reduce((a, s) => a + s.statement.filter((r) => r.status === 'open' || r.status === 'holdback').reduce((x, r) => x + r.payable_cents, 0), 0),
      test_creators: out.length - real.length,
      first_event_at: data.events.length ? data.events[0].event_at : null,
    },
  };
}

// What the creator sees in the portal: own numbers only, counts under 5 as "<5", money exact, no person-level row.
function portalView(st, program) {
  const sm = (n) => C.small(n);
  const months = {};
  for (const [m, x] of Object.entries(st.months)) {
    const bp = {};
    for (const [p, y] of Object.entries(x.by_platform)) bp[p] = { clicks: y.clicks, accounts: sm(y.accounts), trials: sm(y.trials), paid_users: sm(y.paid_users), revenue_cents: y.revenue_cents };
    months[m] = { clicks: x.clicks, accounts: sm(x.accounts), trials: sm(x.trials), paid_users: sm(x.paid_users), revenue_cents: x.revenue_cents, by_platform: bp };
  }
  const t = st.terms_now;
  return {
    name: st.name, code: st.code, slug: st.slug, platforms: st.platforms, status: st.status, is_test: st.is_test,
    months, active_payers: sm(st.active_payers), accounts_total: sm(st.accounts_total), revenue_total_cents: st.revenue_total_cents,
    statement: st.statement.map((r) => ({ month: r.month, revenue_cents: r.revenue_cents, commission_cents: r.commission_cents, carry_in_cents: r.carry_in_cents, payable_cents: r.payable_cents, status: r.status, release_on: r.release_on, paid_on: r.paid ? r.paid.paid_on : null })),
    terms: t ? { pct: Number(t.pct), duration: t.duration, duration_months: t.duration_months, basis: t.basis, fixed_month_cents: t.fixed_month_cents, fixed_post_cents: t.fixed_post_cents } : null,
    payout: st.profile ? { method: st.profile.masked && st.profile.masked.method, masked: pickMasked(st.profile.masked), review: st.profile.review } : null,
    min_payout_cents: program.min_payout_cents, holdback_days: program.holdback_days,
  };
}
function pickMasked(m) { if (!m) return null; const o = {}; for (const k of ['method', 'pix_type', 'pix_key', 'payout_email', 'tax_form']) if (m[k] != null) o[k] = m[k]; return o; }

module.exports = { sbConf, rest, rpc, all, load, build, portalView, lastMonths };
