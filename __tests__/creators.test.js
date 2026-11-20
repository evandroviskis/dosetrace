// Creators program — pure logic (docs/specs/creators.md, founder approved 2026-11-20). Dummy data only:
// fictional names, generated CPF/CNPJ test numbers, no real account, key or token.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../api/_creators.js');

test('CR-1a: codes — suggestion from the name, base shape, per-platform suffix, parse back', () => {
  assert.equal(C.suggestCode('Ana Ribeiro'), 'ANA');
  assert.equal(C.suggestCode('Jô Lima'), 'JOLIMA');
  assert.equal(C.suggestCode('Vítor'), 'VITOR');
  assert.equal(C.suggestCode('Alexandre Magnus Pereira'), 'ALEXANDRE');
  assert.ok(C.validBase('ANA') && C.validBase('MARCUS12') && !C.validBase('AN') && !C.validBase('ANA-YT') && !C.validBase('abc'));
  assert.equal(C.platformCode('ANA', 'youtube'), 'ANA-YT');
  assert.equal(C.platformCode('ANA', 'instagram'), 'ANA-IG');
  assert.deepEqual(C.parseCode(' ana-yt '), { base: 'ANA', platform: 'youtube', code: 'ANA-YT' });
  assert.deepEqual(C.parseCode('ANA'), { base: 'ANA', platform: null, code: 'ANA' });
  assert.equal(C.parseCode('ANA-ZZ'), null, 'unknown suffix');
  assert.equal(C.parseCode('A'), null);
  assert.equal(C.parseCode('<script>'), null);
});

test('CR-2a: links — /go link, Apple ct with the provider token, Play referrer encoded once with utm_medium=creator', () => {
  assert.equal(C.goLink('ANA', 'youtube'), 'https://dosetrace.io/go/ana/youtube');
  const a = new URL(C.appleUrl('123456', 'ANA', 'youtube'));
  assert.equal(a.origin + a.pathname, 'https://apps.apple.com/app/apple-store/id6761788157');
  assert.equal(a.searchParams.get('pt'), '123456');
  assert.equal(a.searchParams.get('ct'), 'cr-ana-yt');
  assert.equal(a.searchParams.get('mt'), '8');
  assert.equal(new URL(C.appleUrl(null, 'ANA', 'youtube')).searchParams.get('pt'), null, 'no pt yet: link still works');
  const p = new URL(C.playUrl('ANA', 'instagram'));
  assert.equal(p.searchParams.get('id'), 'io.outcom.dosetrace');
  assert.equal(p.searchParams.get('referrer'), 'utm_source=instagram&utm_medium=creator&utm_campaign=ana&utm_content=ANA-IG');
  assert.ok(!/%25/.test(C.playUrl('ANA', 'instagram')), 'encoded once');
});

test('CR-2b: device of a click — iPhone/iPad, Android, desktop; preview robots and scripts are bots', () => {
  assert.equal(C.deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Instagram 350.0'), 'ios');
  assert.equal(C.deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'ios');
  assert.equal(C.deviceOf('Mozilla/5.0 (Linux; Android 15; SM-S931B) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36'), 'android');
  assert.equal(C.deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 Safari/605.1.15'), 'desktop');
  for (const ua of ['facebookexternalhit/1.1', 'Twitterbot/1.0', 'WhatsApp/2.23.20.0', 'TelegramBot (like TwitterBot)', 'Slackbot-LinkExpanding 1.0', 'curl/8.4.0', 'Mozilla/5.0 (compatible; Googlebot/2.1)', '']) assert.equal(C.deviceOf(ua), 'bot', ua);
});

test('CR-3a: CPF, CNPJ and PIX keys are validated by check digits and format', () => {
  assert.ok(C.validCpf('529.982.247-25'));
  assert.ok(!C.validCpf('529.982.247-24'));
  assert.ok(!C.validCpf('111.111.111-11'));
  assert.ok(C.validCnpj('11.222.333/0001-81'));
  assert.ok(!C.validCnpj('11.222.333/0001-82'));
  assert.equal(C.normPix('cpf', '529.982.247-25'), '52998224725');
  assert.equal(C.normPix('email', 'Ana@Exemplo.com'), 'ana@exemplo.com');
  assert.equal(C.normPix('phone', '+55 (11) 98765-4321'), '+5511987654321');
  assert.equal(C.normPix('phone', '+1 415 555 0100'), null, 'PIX phone keys are Brazilian');
  assert.equal(C.normPix('random', '123e4567-e89b-42d3-a456-426614174000'), '123e4567-e89b-42d3-a456-426614174000');
  assert.equal(C.normPix('random', 'abc'), null);
  assert.equal(C.normPix('iban', 'x'), null);
});

const BASE_FORM = { legal_name: 'Ana Ribeiro da Silva', email: 'ana@exemplo.com', phone: '+55 11 98765-4321', handles: { instagram: '@ana.treino' }, rules_accepted: true, rules_version: C.RULES_VERSION };

test('CR-3b: the form per country — Brazil = PIX + CPF/CNPJ + invoice; US = PayPal/Wise/ACH + W-9 flag; other = Wise/PayPal + W-8BEN flag', () => {
  const br = C.validateProfile({ ...BASE_FORM, country: 'BR', method: 'pix', pix_type: 'cpf', pix_key: '529.982.247-25', doc_type: 'cpf', doc: '52998224725', invoice: 'mei' });
  assert.ok(!br.error, JSON.stringify(br));
  assert.equal(br.profile.pix_key, '52998224725');
  assert.equal(br.masked.pix_key, '•••.982.247-••');
  assert.equal(br.masked.doc, '•••.982.247-••');
  assert.equal(br.masked.legal_name, 'Ana R••• d••• S•••');
  assert.equal(br.masked.email, 'a•••@exemplo.com');
  assert.equal(C.validateProfile({ ...BASE_FORM, country: 'BR', method: 'paypal', payout_email: 'a@b.co' }).field, 'method', 'Brazil is PIX only');
  assert.equal(C.validateProfile({ ...BASE_FORM, country: 'BR', method: 'pix', pix_type: 'cpf', pix_key: '529.982.247-24', doc_type: 'cpf', doc: '52998224725', invoice: 'mei' }).field, 'pix_key');
  assert.equal(C.validateProfile({ ...BASE_FORM, country: 'BR', method: 'pix', pix_type: 'cpf', pix_key: '529.982.247-25', doc_type: 'cnpj', doc: '52998224725', invoice: 'mei' }).field, 'doc');
  const us = C.validateProfile({ ...BASE_FORM, country: 'US', phone: '+1 415 555 0100', method: 'paypal', payout_email: 'Marcus@Example.com' });
  assert.ok(!us.error);
  assert.equal(us.profile.payout_email, 'marcus@example.com');
  assert.equal(us.profile.tax_form, 'w9');
  const ach = C.validateProfile({ ...BASE_FORM, country: 'US', phone: '+1 415 555 0100', method: 'ach', account_number: '000123456789', routing_number: '011000015', ssn: '123-45-6789' });
  assert.ok(!ach.error);
  const blob = JSON.stringify(ach);
  for (const s of ['000123456789', '011000015', '123-45-6789', 'account_number', 'routing', 'ssn']) assert.ok(!blob.includes(s), 'never stores ' + s);
  const pt = C.validateProfile({ ...BASE_FORM, country: 'PT', phone: '+351 912 345 678', method: 'wise', payout_email: 'sofia@example.com' });
  assert.ok(!pt.error); assert.equal(pt.profile.tax_form, 'w8ben');
  assert.equal(C.validateProfile({ ...BASE_FORM, country: 'PT', method: 'pix' }).field, 'method');
  assert.equal(C.validateProfile({ ...BASE_FORM, country: 'BR', rules_accepted: false, method: 'pix' }).field, 'rules');
  assert.equal(C.validateProfile({ ...BASE_FORM, country: 'Brasil' }).field, 'country');
  assert.equal(C.validateProfile({ ...BASE_FORM, country: 'US', email: 'not-an-email', method: 'paypal', payout_email: 'a@b.co' }).field, 'email');
  assert.equal(C.validateProfile({ ...BASE_FORM, country: 'US', handles: { myspace: 'x' }, method: 'paypal', payout_email: 'a@b.co' }).field, 'handles');
});

test('CR-4a: encryption — AES-256-GCM round trip, tamper and wrong key fail, no key = no seal; tokens are 43 url-safe chars and only their hash identifies them', () => {
  const key = Buffer.alloc(32, 7);
  const env = { CREATOR_DATA_KEY: key.toString('base64') };
  assert.ok(C.dataKey(env).equals(key));
  assert.equal(C.dataKey({ CREATOR_DATA_KEY: 'c2hvcnQ=' }), null);
  assert.equal(C.dataKey({}), null);
  const s = C.seal({ pix_key: '52998224725' }, key);
  assert.ok(s.startsWith('v1.') && !s.includes('52998224725'));
  assert.deepEqual(C.open(s, key), { pix_key: '52998224725' });
  assert.equal(C.open(s, Buffer.alloc(32, 8)), null);
  assert.equal(C.open(s.slice(0, -2) + (s.endsWith('A') ? 'BB' : 'AA'), key), null);
  assert.throws(() => C.seal('x', null));
  const t = C.newToken();
  assert.ok(C.validToken(t) && t.length === 43);
  assert.equal(C.tokenHash(t).length, 64);
  assert.notEqual(C.tokenHash(t), C.tokenHash(C.newToken()));
  assert.ok(!C.validToken('short') && !C.validToken('a'.repeat(43) + '!'));
  assert.equal(C.portalLink(t), 'https://dosetrace.io/criador/portal#' + t);
  assert.equal(C.inviteLink(t), 'https://dosetrace.io/criador/convite#' + t);
});

const ev = (o) => Object.assign({ id: 'e' + Math.random().toString(36).slice(2), environment: 'PRODUCTION', app_user_id: U1, aliases: [], tax_pct: 0, commission_pct: 0.15, period_type: 'NORMAL' }, o);
const U1 = 'aaaaaaaa-1111-4111-8111-111111111111', U2 = 'bbbbbbbb-2222-4222-8222-222222222222';

test('CR-LED1a: the ledger row keeps only the listed fields — creator attributes yes, e-mail and other attributes never', () => {
  const raw = { id: 'evt-1', type: 'INITIAL_PURCHASE', environment: 'SANDBOX', app_user_id: U1, original_app_user_id: '$RCAnonymousID:abc', aliases: ['$RCAnonymousID:abc', U1], product_id: 'dosetrace_monthly', store: 'APP_STORE', period_type: 'NORMAL', event_timestamp_ms: Date.parse('2026-11-05T10:00:00Z'), purchased_at_ms: Date.parse('2026-11-05T10:00:00Z'), expiration_at_ms: Date.parse('2026-12-05T10:00:00Z'), price: 4.99, price_in_purchased_currency: 24.9, currency: 'BRL', tax_percentage: 0.1, commission_percentage: 0.15, country_code: 'BR', transaction_id: 't1', original_transaction_id: 't1',
    subscriber_attributes: { creator_code: { value: 'ANA-YT', updated_at_ms: 1 }, creator_source: { value: 'typed' }, $email: { value: 'person@example.com' }, $phoneNumber: { value: '+5511999999999' }, $displayName: { value: 'Person' } } };
  const r = C.ledgerRow(raw);
  assert.equal(r.creator_code, 'ANA-YT'); assert.equal(r.creator_source, 'typed');
  assert.equal(r.environment, 'SANDBOX'); assert.equal(r.price_usd, 4.99); assert.equal(r.purchased_at, '2026-11-05T10:00:00.000Z');
  const blob = JSON.stringify(r);
  for (const s of ['person@example.com', '+5511999999999', 'Person', '$email', 'subscriber_attributes']) assert.ok(!blob.includes(s), s);
  assert.equal(C.ledgerRow({ type: 'TEST' }), null, 'no id');
  assert.equal(C.canonicalUser(r), U1, 'the Supabase id wins over the anonymous id');
});

test('CR-LED3a: net revenue = price × (1 − tax) × (1 − store fee) in cents; refunds negative; trials and cancellations without refund are 0', () => {
  assert.equal(C.netCents(ev({ type: 'INITIAL_PURCHASE', price_usd: 4.99, tax_pct: 0.1, commission_pct: 0.15 })), Math.round(4.99 * 0.9 * 0.85 * 100));
  assert.equal(C.netCents(ev({ type: 'RENEWAL', price_usd: 4.99 })), 424);
  assert.equal(C.netCents(ev({ type: 'INITIAL_PURCHASE', period_type: 'TRIAL', price_usd: 0 })), 0);
  assert.equal(C.netCents(ev({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE', price_usd: 0 })), 0);
  assert.equal(C.netCents(ev({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', price_usd: -4.99 })), -424);
  assert.equal(C.netCents(ev({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', price_usd: 4.99 })), -424, 'sign-independent');
  assert.equal(C.netCents(ev({ type: 'PRODUCT_CHANGE', price_usd: 39.99 })), 0, 'the charge itself comes as its own purchase event');
  assert.ok(C.isTrialStart(ev({ type: 'INITIAL_PURCHASE', period_type: 'TRIAL' })));
});

test('CR-LED2a: attribution — first touch, the code must exist before the first purchase; a later code is kept as late; the event attribute works without the app record', () => {
  const creators = { ANA: { id: 'c-ana' }, MARCUS: { id: 'c-mar' } };
  const users = new Map([
    [U1, [ev({ type: 'INITIAL_PURCHASE', event_at: '2026-11-05T10:00:00Z' })]],
    [U2, [ev({ app_user_id: U2, type: 'INITIAL_PURCHASE', event_at: '2026-11-05T10:00:00Z', creator_code: 'MARCUS-TT' })]],
    ['u3', [ev({ app_user_id: 'u3', type: 'INITIAL_PURCHASE', event_at: '2026-11-01T10:00:00Z' })]],
    ['u4', []],
  ]);
  const att = {
    [U1]: { creator_id: 'c-ana', platform: 'youtube', first_seen_at: '2026-11-04T10:00:00Z' },
    u3: { creator_id: 'c-ana', platform: 'instagram', first_seen_at: '2026-11-02T10:00:00Z' },
    u4: { creator_id: 'c-ana', platform: null, first_seen_at: '2026-11-02T10:00:00Z' },
  };
  const r = C.resolveAttributions(users, att, creators);
  assert.deepEqual(r.get(U1), { creator_id: 'c-ana', platform: 'youtube', via: 'app', late: false });
  assert.deepEqual(r.get(U2), { creator_id: 'c-mar', platform: 'tiktok', via: 'event', late: false });
  assert.deepEqual(r.get('u3'), { creator_id: 'c-ana', platform: 'instagram', via: 'app', late: true }, 'code after the purchase');
  assert.equal(r.get('u4').late, false, 'no purchase yet: counts as an account with the code');
});

// The founder's model (2026-11-19, file 65): 35 % of net, 12 months from the first payment, paid subscriptions only.
const T35 = [{ valid_from: '2026-01-01', pct: 35, duration: 'months', duration_months: 12, basis: 'all', fixed_month_cents: 0, fixed_post_cents: 0 }];

test('CR-COM1a: 35 % of net for 12 months from the first payment — trial pays nothing, month 13 pays nothing, refund claws back in the refund month', () => {
  const evs = [
    ev({ type: 'INITIAL_PURCHASE', period_type: 'TRIAL', price_usd: 0, event_at: '2026-01-01T00:00:00Z', transaction_id: 't0' }),
    ...Array.from({ length: 13 }, (_, i) => ev({ type: i ? 'RENEWAL' : 'INITIAL_PURCHASE', price_usd: 4.99, event_at: C.addMonths('2026-01-08T00:00:00Z', i), transaction_id: 'r' + i })),
    ev({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', price_usd: -4.99, event_at: '2026-03-20T00:00:00Z', transaction_id: 'r2' }),
  ];
  const lines = C.commissionLines(new Map([[U1, evs]]), T35, {});
  const rev = lines.filter((l) => l.kind === 'rev');
  assert.equal(rev.length, 13);
  assert.ok(rev.slice(0, 12).every((l) => l.cents === Math.round(424 * 0.35)), 'months 1–12: 148 cents each');
  assert.equal(rev[12].cents, 0, 'month 13: outside the 12 months');
  const ref = lines.find((l) => l.kind === 'refund');
  assert.equal(ref.month, '2026-03'); assert.equal(ref.cents, -148); assert.equal(ref.net, -424);
});

test('CR-COM1b: duration lifetime / while subscribed (ends at the first expiration; coming back does not count) and basis first purchase only', () => {
  const evs = [
    ev({ type: 'INITIAL_PURCHASE', price_usd: 10, commission_pct: 0, event_at: '2026-01-01T00:00:00Z', transaction_id: 'a' }),
    ev({ type: 'EXPIRATION', event_at: '2026-02-01T00:00:00Z' }),
    ev({ type: 'INITIAL_PURCHASE', price_usd: 10, commission_pct: 0, event_at: '2026-05-01T00:00:00Z', transaction_id: 'b' }),
  ];
  const m = new Map([[U1, evs]]);
  const cents = (terms) => C.commissionLines(m, terms, {}).filter((l) => l.kind === 'rev').map((l) => l.cents);
  assert.deepEqual(cents([{ valid_from: '2026-01-01', pct: 20, duration: 'lifetime', basis: 'all' }]), [200, 200]);
  assert.deepEqual(cents([{ valid_from: '2026-01-01', pct: 20, duration: 'while_subscribed', basis: 'all' }]), [200, 0]);
  assert.deepEqual(cents([{ valid_from: '2026-01-01', pct: 20, duration: 'lifetime', basis: 'first_only' }]), [200, 0]);
  assert.deepEqual(cents([{ valid_from: '2026-01-01', pct: 15, duration: 'lifetime', basis: 'all' }, { valid_from: '2026-04-01', pct: 30, duration: 'lifetime', basis: 'all' }]), [150, 300], 'each payment uses the version in force on its date');
  assert.deepEqual(cents([]), [0, 0], 'no model: revenue measured, no commission');
});

test('CR-COM1c: fixed fee per active month and per recorded post', () => {
  const terms = [{ valid_from: '2026-09-01', pct: 10, duration: 'lifetime', basis: 'all', fixed_month_cents: 5000, fixed_post_cents: 2500 }];
  const lines = C.commissionLines(new Map(), terms, { months: ['2026-08', '2026-09', '2026-10'], posts: [{ posted_on: '2026-10-03' }, { posted_on: '2026-10-20' }, { posted_on: '2026-09-15' }], startedAt: '2026-09-01' });
  const by = (k, ym) => lines.filter((l) => l.kind === k && l.month === ym).reduce((a, l) => a + l.cents, 0);
  assert.equal(by('fixed_month', '2026-08'), 0, 'before the version');
  assert.equal(by('fixed_month', '2026-09'), 5000); assert.equal(by('fixed_month', '2026-10'), 5000);
  assert.equal(by('fixed_post', '2026-10'), 5000, '2 posts'); assert.equal(by('fixed_post', '2026-09'), 2500);
});

test('CR-COM1d: statement — open, holdback until end + 30 days, below the minimum carries to the next month, due, paid frozen; no model = no_terms', () => {
  const lines = [
    { month: '2026-08', cents: 918, net: 6120, kind: 'rev' },
    { month: '2026-09', cents: 1481, net: 9870, kind: 'rev' },
    { month: '2026-10', cents: 3840, net: 19200, kind: 'rev' },
    { month: '2026-11', cents: 4292, net: 21460, kind: 'rev' },
  ];
  const months = ['2026-08', '2026-09', '2026-10', '2026-11'];
  const st = C.statement(lines, months, { holdback_days: 30, min_payout_cents: 2000 }, [{ month: '2026-09-01', amount_due_cents: 2399 }], Date.parse('2026-11-20T12:00:00Z'), true);
  assert.deepEqual(st.map((r) => r.status), ['below_min', 'paid', 'holdback', 'open']);
  assert.equal(st[0].payable_cents, 0); assert.equal(st[1].carry_in_cents, 918); assert.equal(st[1].payable_cents, 2399);
  assert.equal(st[2].release_on, '2026-11-30'); assert.equal(st[2].payable_cents, 3840);
  const later = C.statement(lines, months, { holdback_days: 30, min_payout_cents: 2000 }, [{ month: '2026-09-01', amount_due_cents: 2399 }], Date.parse('2026-12-01T00:00:01Z'), true);
  assert.equal(later[2].status, 'due'); assert.equal(later[2].payable_cents, 3840);
  assert.equal(later[3].status, 'holdback'); assert.equal(later[3].release_on, '2026-12-30');
  assert.deepEqual(C.statement(lines, months, {}, [], Date.parse('2026-12-20T00:00:00Z'), false).map((r) => r.status), ['no_terms', 'no_terms', 'no_terms', 'no_terms']);
  assert.equal(C.statement(lines, months, {}, [], Date.parse('2026-12-20T00:00:00Z'), true)[0].revenue_cents, 6120, 'revenue always shown');
});

test('CR-UI2a: the portal shows counts under 5 as "<5"; zero and larger counts stay', () => {
  assert.equal(C.small(0), 0); assert.equal(C.small(1), '<5'); assert.equal(C.small(4), '<5'); assert.equal(C.small(5), 5); assert.equal(C.small(41), 41);
});
