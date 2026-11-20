// Creators program — routes (api/go.js, api/rc-webhook.js, api/creator.js, api/adm-creators.js) against an
// in-memory Supabase. Spec docs/specs/creators.md. Dummy data only (fictional people, generated test CPF).
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./helpers/admAuthFake');
const R = require('./helpers/fakeRest');
const C = require('../api/_creators.js');
const go = require('../api/go.js');
const hook = require('../api/rc-webhook.js');
const pub = require('../api/creator.js');
const adm = require('../api/adm-creators.js');

const KEY = Buffer.alloc(32, 3).toString('base64');
const HOOK = 'Bearer dummy-webhook-secret-0123456789';
function env() { F.envOn(); process.env.CREATOR_DATA_KEY = KEY; process.env.RC_WEBHOOK_AUTH = HOOK; process.env.SUPABASE_ANON_KEY = 'dummy-anon'; }
function envOff() { F.envOff(); delete process.env.CREATOR_DATA_KEY; delete process.env.RC_WEBHOOK_AUTH; delete process.env.SUPABASE_ANON_KEY; }
const ADMIN = Object.assign({}, F.bearer('admin'), F.ORIGIN);
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 350.0';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; SM-S931B) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 Safari/605.1.15';
const APPUSER = '44444444-4444-4444-8444-444444444444';
const appJwt = () => ({ authorization: 'Bearer ' + F.token(APPUSER, { sub: APPUSER }) });

async function createCreator(db, body) {
  const r = await R.run(adm, db, { method: 'POST', url: '/api/adm-creators', headers: ADMIN, body: Object.assign({ action: 'create' }, body) });
  assert.equal(r.code, 200, JSON.stringify(r.json));
  return r.json;
}
const tokenOf = (link) => link.split('#')[1];

test('CR-1: create in one call — row, unique code, codes and links per platform, invite + portal links; default model 35 % × 12 months; duplicate code 409; viewer and no step-up refused', async () => {
  env();
  try {
    const db = R.makeDb();
    const j = await createCreator(db, { display_name: 'Ana Ribeiro', platforms: ['instagram', 'youtube'], country: 'BR' });
    assert.equal(j.code, 'ANA');
    assert.deepEqual(j.codes.map((c) => c.code), ['ANA-IG', 'ANA-YT']);
    assert.equal(j.codes[1].link, 'https://dosetrace.io/go/ana/youtube');
    assert.ok(C.validToken(tokenOf(j.links.invite)) && C.validToken(tokenOf(j.links.portal)));
    assert.equal(db.creators.length, 1); assert.equal(db.creators[0].status, 'invited');
    assert.equal(db.creator_links.length, 2);
    for (const l of db.creator_links) { assert.ok(!JSON.stringify(l).includes(tokenOf(j.links.invite)) && !JSON.stringify(l).includes(tokenOf(j.links.portal)), 'tokens never in clear'); assert.equal(l.token_hash.length, 64); }
    assert.deepEqual({ pct: db.creator_terms[0].pct, d: db.creator_terms[0].duration, m: db.creator_terms[0].duration_months, b: db.creator_terms[0].basis }, { pct: 35, d: 'months', m: 12, b: 'all' });
    const dup = await R.run(adm, db, { method: 'POST', headers: ADMIN, body: { action: 'create', display_name: 'Ana Souza', code: 'ana', platforms: ['tiktok'] } });
    assert.equal(dup.code, 409); assert.equal(dup.json.error, 'code_taken');
    const none = await R.run(adm, db, { method: 'POST', headers: ADMIN, body: { action: 'create', display_name: 'Sem Modelo', code: 'SEMMOD', platforms: ['tiktok'], terms: 'none' } });
    assert.equal(none.code, 200); assert.equal(db.creator_terms.length, 1, 'no model row');
    assert.equal((await R.run(adm, db, { method: 'POST', headers: ADMIN, body: { action: 'create', display_name: 'X', platforms: ['myspace'] } })).code, 400);
    const viewer = await R.run(adm, db, { method: 'POST', headers: Object.assign({}, F.bearer('viewer'), F.ORIGIN), body: { action: 'create', display_name: 'Z', platforms: ['x'] } });
    assert.equal(viewer.code, 403);
    const stale = await R.run(adm, db, { method: 'POST', headers: Object.assign({}, F.bearer('admin', { totpS: 3600 }), F.ORIGIN), body: { action: 'create', display_name: 'Z', platforms: ['x'] } });
    assert.equal(stale.code, 401); assert.equal(stale.json.code, 'step_up_required');
    const noOrigin = await R.run(adm, db, { method: 'POST', headers: F.bearer('admin'), body: { action: 'create', display_name: 'Z', platforms: ['x'] } });
    assert.equal(noOrigin.code, 403);
  } finally { envOff(); }
});

test('CR-2: /go — Android 302 to Play with the referrer; iPhone gets the code page with the App Store button (no direct jump); computer gets both stores; robots never count; paused → store without the creator; unknown → home', async () => {
  env();
  try {
    const db = R.makeDb();
    const j = await createCreator(db, { display_name: 'Ana Ribeiro', platforms: ['instagram', 'youtube'] });
    db.creators[0].status = 'active';
    db.creator_program_settings[0].apple_pt = '123456';
    const a = await R.run(go, db, { url: '/api/go?c=ana&p=youtube', headers: { 'user-agent': ANDROID } });
    assert.equal(a.code, 302);
    assert.equal(new URL(a.headers.location).searchParams.get('referrer'), 'utm_source=youtube&utm_medium=creator&utm_campaign=ana&utm_content=ANA-YT');
    const i = await R.run(go, db, { url: '/api/go?c=ana&p=youtube', headers: { 'user-agent': IPHONE, 'accept-language': 'pt-BR,pt;q=0.9' } });
    assert.equal(i.code, 200);
    assert.ok(i.body.includes('ANA-YT') && i.body.includes('Seu código de criador') && i.body.includes('Abrir a App Store'));
    assert.ok(i.body.includes('pt=123456') && i.body.includes('ct=cr-ana-yt'), 'App Store link carries the campaign');
    assert.ok(!i.body.includes('play.google.com'), 'iPhone: no Play button');
    assert.match(i.headers['content-security-policy'], /default-src 'none'/);
    assert.equal(i.headers['x-robots-tag'], 'noindex'); assert.equal(i.headers['cache-control'], 'no-store');
    const d = await R.run(go, db, { url: '/api/go?c=ana&p=instagram', headers: { 'user-agent': MAC } });
    assert.ok(d.body.includes('apps.apple.com') && d.body.includes('play.google.com') && d.body.includes('ANA-IG'));
    const bot = await R.run(go, db, { url: '/api/go?c=ana&p=instagram', headers: { 'user-agent': 'facebookexternalhit/1.1' } });
    assert.equal(bot.code, 200);
    const counts = Object.fromEntries(db.creator_clicks.map((k) => [k.platform + '/' + k.device, k.n]));
    assert.deepEqual(counts, { 'youtube/android': 1, 'youtube/ios': 1, 'instagram/desktop': 1 }, 'the robot did not count');
    for (const k of db.creator_clicks) assert.deepEqual(Object.keys(k).sort(), ['creator_id', 'day', 'device', 'n', 'platform'], 'no IP, UA or referer stored');
    const wrongP = await R.run(go, db, { url: '/api/go?c=ana&p=tiktok', headers: { 'user-agent': ANDROID } });
    assert.equal(wrongP.code, 302); assert.ok(!/referrer/.test(wrongP.headers.location), 'platform not in the list: generic store');
    db.creators[0].status = 'paused';
    const p = await R.run(go, db, { url: '/api/go?c=ana&p=youtube', headers: { 'user-agent': IPHONE } });
    assert.equal(p.code, 302); assert.ok(!/ct=/.test(p.headers.location));
    assert.equal((await R.run(go, db, { url: '/api/go?c=nobody&p=youtube', headers: { 'user-agent': IPHONE } })).headers.location, 'https://dosetrace.io/');
    assert.equal((await R.run(go, db, { url: '/api/go?c=a%3Cb&p=youtube', headers: { 'user-agent': IPHONE } })).headers.location, 'https://dosetrace.io/');
    void j;
  } finally { envOff(); }
  // Supabase down: the visitor still reaches the store.
  const down = await R.run(go, R.makeDb(), { url: '/api/go?c=ana&p=youtube', headers: { 'user-agent': ANDROID } });
  assert.equal(down.code, 302); assert.ok(down.headers.location.startsWith('https://play.google.com/'));
});

const BR_PROFILE = { country: 'BR', legal_name: 'Ana Ribeiro da Silva', email: 'ana@exemplo.com', phone: '+55 11 98765-4321', handles: { instagram: '@ana.treino' }, method: 'pix', pix_type: 'cpf', pix_key: '529.982.247-25', doc_type: 'cpf', doc: '529.982.247-25', invoice: 'mei', rules_accepted: true, rules_version: C.RULES_VERSION };

test('CR-3/CR-4/CR-5: invite → form → sealed profile (masked copy only in clear) → review; a wrong token, a revoked invite and a foreign Origin are refused; reveal needs the admin and is audited', async () => {
  env();
  try {
    const db = R.makeDb();
    const j = await createCreator(db, { display_name: 'Ana Ribeiro', platforms: ['instagram', 'youtube'] });
    const tok = tokenOf(j.links.invite);
    const O = F.ORIGIN;
    const g = await R.run(pub, db, { method: 'POST', headers: O, body: { op: 'invite_get', token: tok } });
    assert.equal(g.code, 200); assert.equal(g.json.name, 'Ana Ribeiro'); assert.deepEqual(g.json.methods.BR, ['pix']);
    assert.equal((await R.run(pub, db, { method: 'POST', headers: O, body: { op: 'invite_get', token: C.newToken() } })).code, 401);
    assert.equal((await R.run(pub, db, { method: 'POST', headers: { origin: 'https://evil.example' }, body: { op: 'invite_get', token: tok } })).code, 403);
    const badForm = await R.run(pub, db, { method: 'POST', headers: O, body: { op: 'invite_submit', token: tok, profile: Object.assign({}, BR_PROFILE, { pix_key: '111.111.111-11' }) } });
    assert.equal(badForm.code, 400); assert.equal(badForm.json.field, 'pix_key');
    const s = await R.run(pub, db, { method: 'POST', headers: O, body: { op: 'invite_submit', token: tok, profile: BR_PROFILE } });
    assert.equal(s.code, 200, JSON.stringify(s.json));
    assert.equal(db.creators[0].status, 'submitted');
    const row = db.creator_profiles[0];
    const blob = JSON.stringify(row.profile_enc);
    for (const secret of ['52998224725', 'ana@exemplo.com', '98765', 'Ribeiro da Silva']) assert.ok(!blob.includes(secret), 'sealed: ' + secret);
    assert.equal(row.masked.pix_key, '•••.982.247-••'); assert.ok(!JSON.stringify(row.masked).includes('52998224725'));
    // the admin sees the pending review, approves, and can reveal (audited)
    const list = await R.run(adm, db, { url: '/api/adm-creators', headers: F.bearer('admin') });
    assert.equal(list.code, 200); assert.equal(list.json.creators[0].profile.review, 'submitted');
    assert.ok(!JSON.stringify(list.json).includes('v1.'), 'no sealed blob reaches the page');
    const ap = await R.run(adm, db, { method: 'POST', headers: ADMIN, body: { action: 'review', id: db.creators[0].id, decision: 'approve' } });
    assert.equal(ap.code, 200); assert.equal(db.creators[0].status, 'active');
    const rv = await R.run(adm, db, { method: 'POST', headers: ADMIN, body: { action: 'reveal', id: db.creators[0].id } });
    assert.equal(rv.code, 200); assert.equal(rv.json.profile.pix_key, '52998224725');
    assert.ok(db.creator_audit.some((a) => a.action === 'reveal'));
    assert.ok(db.creator_audit.every((a) => !JSON.stringify(a.detail || {}).includes('@')), 'no e-mail in the audit');
    const rvViewer = await R.run(adm, db, { method: 'POST', headers: Object.assign({}, F.bearer('viewer'), F.ORIGIN), body: { action: 'reveal', id: db.creators[0].id } });
    assert.equal(rvViewer.code, 403);
    // new invite revokes the old one; the admin sees the same links again (founder P3)
    const det = await R.run(adm, db, { url: '/api/adm-creators?id=' + db.creators[0].id, headers: F.bearer('admin') });
    assert.equal(det.json.links.portal.url, j.links.portal, 'portal link shown again, identical');
    const rot = await R.run(adm, db, { method: 'POST', headers: ADMIN, body: { action: 'rotate_link', id: db.creators[0].id, kind: 'invite' } });
    assert.equal(rot.code, 200);
    assert.equal((await R.run(pub, db, { method: 'POST', headers: O, body: { op: 'invite_get', token: tok } })).code, 401, 'old invite dead');
    assert.equal((await R.run(pub, db, { method: 'POST', headers: O, body: { op: 'invite_get', token: tokenOf(rot.json.link) } })).code, 200);
  } finally { envOff(); }
});

test('CR-LED1: webhook — 503 unconfigured, 401 wrong secret, TEST answered without writing, stored once by id, only the listed fields', async () => {
  const db = R.makeDb();
  F.envOn();
  try {
    assert.equal((await R.run(hook, db, { method: 'POST', headers: { authorization: HOOK }, body: { event: { id: 'x', type: 'RENEWAL' } } })).code, 503);
    process.env.RC_WEBHOOK_AUTH = HOOK;
    assert.equal((await R.run(hook, db, { method: 'POST', headers: { authorization: 'Bearer wrong' }, body: { event: { id: 'x' } } })).code, 401);
    assert.equal((await R.run(hook, db, { method: 'GET', headers: { authorization: HOOK } })).code, 405);
    assert.equal((await R.run(hook, db, { method: 'POST', headers: { authorization: HOOK }, body: { event: { id: 't', type: 'TEST' } } })).code, 200);
    assert.equal(db.rc_events.length, 0);
    const ev = { id: 'evt-1', type: 'INITIAL_PURCHASE', environment: 'SANDBOX', app_user_id: APPUSER, aliases: [APPUSER], period_type: 'NORMAL', event_timestamp_ms: Date.now(), price: 4.99, tax_percentage: 0, commission_percentage: 0.15, transaction_id: 't1', subscriber_attributes: { creator_code: { value: 'ANA-YT' }, $email: { value: 'person@example.com' } } };
    assert.equal((await R.run(hook, db, { method: 'POST', headers: { authorization: HOOK }, body: { api_version: '1.0', event: ev } })).code, 200);
    assert.equal((await R.run(hook, db, { method: 'POST', headers: { authorization: HOOK }, body: JSON.stringify({ event: ev }) })).code, 200, 'replay ok');
    assert.equal(db.rc_events.length, 1, 'idempotent');
    assert.equal(db.rc_events[0].creator_code, 'ANA-YT');
    assert.ok(!JSON.stringify(db.rc_events).includes('person@example.com'));
    const failing = await R.run(hook, db, { method: 'POST', headers: { authorization: HOOK }, body: { event: Object.assign({}, ev, { id: 'evt-2' }) } }, { fail: (n) => n === 'rc_events' });
    assert.equal(failing.code, 500, 'RevenueCat retries');
  } finally { F.envOff(); delete process.env.RC_WEBHOOK_AUTH; }
});

test('CR-E2E (in memory): test creator, 2 platforms, clicks, app code, sandbox purchase → its own screen shows it flagged; the totals and the ranking do not; the portal shows its numbers with "<5"', async () => {
  env();
  try {
    const db = R.makeDb();
    db._now = Date.now();
    const real = await createCreator(db, { display_name: 'Marcus Lee', platforms: ['tiktok'], country: 'US' });
    db.creators[0].status = 'active';
    const t = await createCreator(db, { display_name: 'Teste Criador', code: 'TESTE', platforms: ['instagram', 'youtube'], is_test: true });
    for (const [p, ua] of [['instagram', ANDROID], ['instagram', IPHONE], ['youtube', IPHONE]]) await R.run(go, db, { url: `/api/go?c=teste&p=${p}`, headers: { 'user-agent': ua } });
    // the app checks the code and records it (JWT subject = the account)
    const chk = await R.run(pub, db, { url: '/api/creator?op=code&c=teste-yt' });
    assert.deepEqual(chk.json, { valid: true, code: 'TESTE-YT', platform: 'youtube', benefit_text: null });
    assert.equal((await R.run(pub, db, { url: '/api/creator?op=code&c=nobody' })).json.valid, false);
    const att = await R.run(pub, db, { method: 'POST', headers: appJwt(), body: { op: 'attribution', code: 'TESTE-YT', source: 'typed' } });
    assert.equal(att.code, 200, JSON.stringify(att.json)); assert.equal(att.json.recorded, true);
    const again = await R.run(pub, db, { method: 'POST', headers: appJwt(), body: { op: 'attribution', code: 'MARCUS-TT', source: 'typed' } });
    assert.equal(again.json.recorded, false, 'first touch wins');
    assert.equal(db.creator_attributions[0].creator_id, db.creators[1].id);
    assert.equal((await R.run(pub, db, { method: 'POST', body: { op: 'attribution', code: 'TESTE-YT', source: 'typed' } })).code, 401, 'no JWT');
    db._test_users = [APPUSER]; // the founder's test account
    // sandbox purchase through the webhook, 1 minute after the code
    const ev = { id: 'evt-sbx-1', type: 'INITIAL_PURCHASE', environment: 'SANDBOX', app_user_id: APPUSER, period_type: 'NORMAL', event_timestamp_ms: Date.now() + 60000, purchased_at_ms: Date.now() + 60000, expiration_at_ms: Date.now() + 30 * 864e5, price: 4.99, tax_percentage: 0, commission_percentage: 0.15, transaction_id: 'sbx1', subscriber_attributes: { creator_code: { value: 'TESTE-YT' } } };
    assert.equal((await R.run(hook, db, { method: 'POST', headers: { authorization: HOOK }, body: { event: ev } })).code, 200);
    const list = await R.run(adm, db, { url: '/api/adm-creators', headers: F.bearer('admin') });
    const ym = new Date().toISOString().slice(0, 7);
    const st = list.json.creators.find((c) => c.code === 'TESTE');
    assert.equal(st.is_test, true);
    assert.equal(st.months[ym].clicks, 3);
    assert.equal(st.months[ym].by_platform.instagram.clicks, 2); assert.equal(st.months[ym].by_platform.youtube.clicks, 1);
    assert.equal(st.months[ym].by_platform.youtube.accounts, 1);
    assert.equal(st.months[ym].revenue_cents, 424); assert.equal(st.months[ym].by_platform.youtube.revenue_cents, 424);
    assert.equal(st.active_payers, 1);
    assert.equal(st.statement.find((r) => r.month === ym).commission_cents, Math.round(424 * 0.35));
    assert.equal(list.json.totals[ym].clicks, 0, 'test creator out of the totals');
    assert.equal(list.json.totals[ym].revenue_cents, 0);
    assert.equal(list.json.summary.test_creators, 1);
    const mar = list.json.creators.find((c) => c.code === 'MARCUS');
    assert.equal(mar.months[ym].revenue_cents, 0, 'a test account never counts for a real creator');
    // portal of the test creator
    const portal = await R.run(pub, db, { method: 'POST', headers: F.ORIGIN, body: { op: 'portal', token: tokenOf(t.links.portal) } });
    assert.equal(portal.code, 200, JSON.stringify(portal.json));
    assert.equal(portal.json.months[ym].accounts, '<5'); assert.equal(portal.json.months[ym].clicks, 3); assert.equal(portal.json.months[ym].revenue_cents, 424);
    const pblob = JSON.stringify(portal.json);
    for (const leak of [APPUSER, 'sbx1', 'evt-sbx-1', 'token_enc', 'profile_enc']) assert.ok(!pblob.includes(leak), 'portal leaks ' + leak);
    assert.equal((await R.run(pub, db, { method: 'POST', headers: F.ORIGIN, body: { op: 'portal', token: tokenOf(real.links.invite) } })).code, 401, 'an invite token is not a portal token');
    // mark as paid: refused for a real creator while payouts are off; the month is not due yet anyway
    const paid = await R.run(adm, db, { method: 'POST', headers: ADMIN, body: { action: 'mark_paid', id: db.creators[0].id, month: ym, paid_on: '2026-12-30', paid_amount: 1, paid_currency: 'USD', method: 'PayPal' } });
    assert.equal(paid.code, 409); assert.equal(paid.json.error, 'payouts_disabled');
    const paidT = await R.run(adm, db, { method: 'POST', headers: ADMIN, body: { action: 'mark_paid', id: db.creators[1].id, month: ym, paid_on: '2026-12-30', paid_amount: 1, paid_currency: 'USD', method: 'PayPal' } });
    assert.equal(paidT.code, 409); assert.equal(paidT.json.error, 'not_due', 'open month');
  } finally { envOff(); }
});

test('CR-COM2: settings — payouts can only be switched on with accountant + lawyer reviews; removing a review switches them off; benefit text refuses links and e-mails', async () => {
  env();
  try {
    const db = R.makeDb();
    const P = (b) => R.run(adm, db, { method: 'POST', headers: ADMIN, body: Object.assign({ action: 'settings' }, b) });
    assert.equal((await P({ payouts_enabled: true })).json.error, 'reviews_missing');
    await P({ accountant_ok: true });
    assert.equal((await P({ payouts_enabled: true })).json.error, 'reviews_missing');
    await P({ lawyer_ok: true });
    assert.equal((await P({ payouts_enabled: true })).code, 200); assert.equal(db.creator_program_settings[0].payouts_enabled, true);
    await P({ lawyer_ok: false });
    assert.equal(db.creator_program_settings[0].payouts_enabled, false);
    assert.equal((await P({ benefit_text: 'veja www.site.com' })).json.field, 'benefit_text');
    assert.equal((await P({ benefit_text: '1 mês extra de Premium depois do primeiro pagamento' })).code, 200);
    assert.equal((await P({ apple_pt: 'abc' })).json.field, 'apple_pt');
    assert.equal((await P({ apple_pt: '123456' })).code, 200);
  } finally { envOff(); }
});

test('CR-COM1e: terms versions and transitions — new version validated; pause/resume/end follow the allowed steps', async () => {
  env();
  try {
    const db = R.makeDb();
    await createCreator(db, { display_name: 'Ana Ribeiro', platforms: ['instagram'] });
    const id = db.creators[0].id;
    const P = (b) => R.run(adm, db, { method: 'POST', headers: ADMIN, body: Object.assign({ id }, b) });
    assert.equal((await P({ action: 'add_terms', valid_from: '2026-12-01', pct: 120, duration: 'lifetime', basis: 'all' })).json.field, 'pct');
    assert.equal((await P({ action: 'add_terms', valid_from: '2026-12-01', pct: 20, duration: 'months', basis: 'all' })).json.field, 'duration_months');
    assert.equal((await P({ action: 'add_terms', valid_from: '2026-12-01', pct: 20, duration: 'lifetime', basis: 'all', fixed_post_cents: 5000, contract_signed_on: '2026-11-28' })).code, 200);
    assert.equal(db.creator_terms.length, 2);
    assert.equal((await P({ action: 'set_status', status: 'active' })).code, 409, 'activation only through approval');
    db.creators[0].status = 'active';
    assert.equal((await P({ action: 'set_status', status: 'paused' })).code, 200);
    assert.equal((await P({ action: 'set_status', status: 'active' })).code, 200);
    assert.equal((await P({ action: 'set_status', status: 'ended' })).code, 200);
    assert.ok(db.creators[0].ended_at);
    assert.equal((await P({ action: 'set_status', status: 'active' })).code, 409, 'ended is final');
    assert.equal((await P({ action: 'add_post', posted_on: '2026-12-02', platform: 'instagram', note: 'reel' })).code, 200);
  } finally { envOff(); }
});

test('CR-W1 (live 2026-11-20): a write the database refuses is never answered "saved" (review, status, tax form, audit, invite); the portal stamps its last use before answering', async () => {
  env();
  try {
    const db = R.makeDb();
    const j = await createCreator(db, { display_name: 'Ana Ribeiro', platforms: ['instagram'], is_test: true });
    const id = db.creators[0].id;
    const O = F.ORIGIN;
    // invite: the profile is stored but the creator row refuses the status change → not "ok"
    const failCreators = { fail: (n, m) => n === 'creators' && m === 'PATCH' };
    const s1 = await R.run(pub, db, { method: 'POST', headers: O, body: { op: 'invite_submit', token: tokenOf(j.links.invite), profile: BR_PROFILE } }, failCreators);
    assert.equal(s1.code, 503, 'invite answered ' + s1.code);
    const s2 = await R.run(pub, db, { method: 'POST', headers: O, body: { op: 'invite_submit', token: tokenOf(j.links.invite), profile: BR_PROFILE } });
    assert.equal(s2.code, 200); assert.equal(db.creators[0].status, 'submitted');
    const P = (body, opts) => R.run(adm, db, { method: 'POST', headers: ADMIN, body: Object.assign({ id }, body) }, opts);
    // review: each of its three writes failing → 503, and nothing reads as approved by the caller
    for (const f of [(n, m) => n === 'creator_profiles' && m === 'PATCH', (n, m) => n === 'creators' && m === 'PATCH', (n, m) => n === 'creator_audit' && m === 'POST']) {
      const r = await P({ action: 'review', decision: 'approve' }, { fail: f });
      assert.equal(r.code, 503, 'review answered ' + r.code + ' with a failed write');
      assert.ok(!(r.json && r.json.ok));
    }
    const ok = await P({ action: 'review', decision: 'approve' });
    assert.equal(ok.code, 200); assert.equal(db.creators[0].status, 'active');
    assert.equal((await P({ action: 'set_status', status: 'paused' }, failCreators)).code, 503, 'status');
    assert.equal(db.creators[0].status, 'active');
    assert.equal((await P({ action: 'tax_form', date: '2026-11-20' }, { fail: (n, m) => n === 'creator_profiles' && m === 'PATCH' })).code, 503, 'tax form');
    // portal: last use is written before the answer (Vercel freezes the function once it has answered)
    const portal = await R.run(pub, db, { method: 'POST', headers: O, body: { op: 'portal', token: tokenOf(j.links.portal) } }, { delay: (n, m) => (n === 'creator_links' && m === 'PATCH' ? 30 : 0) });
    assert.equal(portal.code, 200);
    const pl = db.creator_links.find((l) => l.kind === 'portal' && !l.revoked_at);
    assert.ok(pl.last_used_at, 'portal last use not stamped before the answer');
    // a failed stamp does not hide the portal from the creator
    const p2 = await R.run(pub, db, { method: 'POST', headers: O, body: { op: 'portal', token: tokenOf(j.links.portal) } }, { fail: (n, m) => n === 'creator_links' && m === 'PATCH' });
    assert.equal(p2.code, 200);
  } finally { envOff(); }
});
