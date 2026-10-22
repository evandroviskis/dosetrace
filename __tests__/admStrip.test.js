'use strict';
// Contas tab summary strip (founder request 2026-10-22): the running text under "Contas reais / Contas de teste"
// ("Por login: ... · onboarding: ... · plataforma: ..." and "N contas de teste excluídas ... · M contas pela regra")
// is replaced by ONE strip of small blocks: Contas, Login, Onboarding, Plataforma, Protocolo ativo and a muted
// note block. The numbers follow the list being viewed (search + filters), "de X" when it is filtered.
// The pure helpers live in the page's [acc-pure-start] block and run here as-is. Dummy e-mails only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sqlFnIn, latestFn, latestMigrationWith } = require('./helpers/sqlLatest.js');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'web', 'adm.html'), 'utf8');
const SQL = fs.readFileSync(path.join(ROOT, 'supabase_admin_rpcs.sql'), 'utf8');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

function pure() {
  const m = HTML.match(/\/\/ \[acc-pure-start\]([\s\S]*?)\/\/ \[acc-pure-end\]/);
  assert.ok(m, 'acc pure block present');
  return (0, eval)('(function(){' + m[1] + '\nreturn {accStrip:accStrip,accFiltersOn:accFiltersOn,accStripHtml:accStripHtml};})()');
}
function pageT() {
  return (0, eval)('(' + HTML.match(/<script>\n([\s\S]*?)<\/script>/)[1].match(/var T=(\{[\s\S]*?\n  \});/)[1] + ')');
}
function tr(T, l) {
  return (k, v) => { let s = T[l][k] != null ? T[l][k] : k; if (v) Object.keys(v).forEach((p) => { s = String(s).replace(new RegExp('\\{' + p + '\\}', 'g'), v[p]); }); return s; };
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (n == null || isNaN(n) ? '—' : String(n));
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
function secAccountsSrc() {
  const m = HTML.match(/function secAccounts\(\)\{[\s\S]*?\n  \}\n/);
  assert.ok(m, 'secAccounts found');
  return m[0];
}

const REAL = [
  { email: 'a@x.y', provider: 'apple', apple: true, pu: [], ua: [], onboarded: true, has_active_protocol: true },
  { email: 'b@x.y', provider: 'google', apple: false, pu: ['android'], ua: [], onboarded: true, has_active_protocol: false },
  { email: 'c@x.y', provider: 'google', apple: false, pu: [], ua: ['ios'], onboarded: false, has_active_protocol: true },
  { email: 'd@x.y', provider: 'email', apple: false, pu: [], ua: [], onboarded: false, has_active_protocol: false },
  { email: 'e@x.y', provider: 'email', apple: false, pu: ['ios'], ua: ['android'], onboarded: true, has_active_protocol: false }, // mixed -> ?
  { email: 'f@x.y', provider: '', apple: false, pu: [], ua: [], onboarded: false, has_active_protocol: false }, // no provider -> other
];

test('Strip: counts login, onboarding, platform and active protocol from the rows it is given (mixed platform counts as ?)', () => {
  const { accStrip } = pure();
  const s = accStrip(REAL, { total: 6, filtered: false });
  assert.equal(s.count, 6); assert.equal(s.total, 6); assert.equal(s.filtered, false);
  assert.deepEqual(s.login, { apple: 1, google: 2, email: 2, other: 1 });
  assert.deepEqual(s.onboarding, { yes: 3, no: 3 });
  assert.deepEqual(s.platform, { ios: 2, android: 1, unknown: 3 });
  assert.deepEqual(s.protocol, { yes: 2, no: 4 });
  assert.equal(s.login.apple + s.login.google + s.login.email + s.login.other, s.count, 'login adds up to the count');
  assert.equal(s.platform.ios + s.platform.android + s.platform.unknown, s.count, 'platform adds up to the count');
});

test('Strip: a filtered list gives the numbers of the shown rows and the total of the view ("de X")', () => {
  const { accStrip } = pure();
  const shown = REAL.filter((r) => r.provider === 'google');
  const s = accStrip(shown, { total: REAL.length, filtered: true });
  assert.equal(s.count, 2); assert.equal(s.total, 6); assert.equal(s.filtered, true);
  assert.deepEqual(s.login, { apple: 0, google: 2, email: 0, other: 0 });
  assert.deepEqual(s.protocol, { yes: 1, no: 1 });
  const empty = accStrip([], { total: 6, filtered: true });
  assert.equal(empty.count, 0);
  assert.deepEqual(empty.onboarding, { yes: 0, no: 0 }, 'an empty filtered list shows zeros, not "not measured"');
});

test('Strip: test rows without the account fields (database not updated yet) say not measured, never zero; the rule count still works', () => {
  const { accStrip } = pure();
  const old = [{ id: '1', email: 'a.12345@gmail.com', kind: 'rule' }, { id: '2', email: 'q@dosetrace.io', kind: 'domain' }, { id: '3', email: 'l@x.y', kind: 'list' }];
  const s = accStrip(old, { total: 3, filtered: false });
  assert.equal(s.count, 3);
  assert.equal(s.login, null); assert.equal(s.onboarding, null); assert.equal(s.platform, null); assert.equal(s.protocol, null);
  assert.equal(s.rule, 1);
  const fresh = old.map((x, i) => Object.assign({}, x, { provider: 'google', apple: false, pu: i ? ['android'] : [], ua: [], onboarded: !!i, has_active_protocol: i === 2 }));
  const f = accStrip(fresh, { total: 3, filtered: false });
  assert.deepEqual(f.login, { apple: 0, google: 3, email: 0, other: 0 });
  assert.deepEqual(f.platform, { ios: 0, android: 2, unknown: 1 });
  assert.deepEqual(f.onboarding, { yes: 2, no: 1 });
  assert.deepEqual(f.protocol, { yes: 1, no: 2 });
  assert.equal(f.rule, 1);
});

test('Strip: the list counts as filtered only when a search or a filter is on', () => {
  const { accFiltersOn } = pure();
  const F = (o) => Object.assign({ q: '', platform: 'all', provider: 'all', onboarded: 'all', protocols: 'all', rule: false }, o);
  assert.equal(accFiltersOn(F({})), false);
  assert.equal(accFiltersOn(F({ q: '   ' })), false, 'blank search is no filter');
  assert.equal(accFiltersOn(F({ q: 'ann' })), true);
  for (const [k, v] of [['platform', 'ios'], ['provider', 'apple'], ['onboarded', 'no'], ['protocols', 'with'], ['rule', true]]) assert.equal(accFiltersOn(F({ [k]: v })), true, k);
  assert.equal(accFiltersOn({ q: 'x' }), true, 'the test view passes only the search');
  assert.equal(accFiltersOn({ q: '' }), false);
});

test('Strip HTML (pt): six blocks in order; "de X" only when filtered; real view has the test-accounts note, test view has "pela regra"', () => {
  const { accStrip, accStripHtml } = pure();
  const T = pageT(); const t = tr(T, 'pt');
  const all = accStripHtml(accStrip(REAL, { total: 6, filtered: false }), { view: 'real', testExcluded: 109 }, t, esc, fmt);
  assert.equal((all.match(/class="sb[ "]/g) || []).length, 6, 'six blocks');
  const labels = [...all.matchAll(/<div class="sl">([^<]*)<\/div>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['Contas', 'Login', 'Onboarding', 'Plataforma', 'Protocolo ativo']);
  const tx = text(all);
  assert.ok(!/\bde 6\b/.test(tx), 'not filtered: no "de X"');
  assert.match(tx, /Apple 1 Google 2 E-mail 2 outro 1/);
  assert.match(tx, /completo 3 não 3/);
  assert.match(tx, /iOS 2 Android 1 \? 3/);
  assert.match(tx, /Protocolo ativo sim 2 não 4/);
  assert.match(tx, /109 contas de teste fora dos números/);
  assert.ok(!/pela regra/.test(tx));
  assert.match(all, /title="Desconhecido"/, '? explains itself');
  const filt = text(accStripHtml(accStrip(REAL.slice(0, 2), { total: 6, filtered: true }), { view: 'real', testExcluded: 109 }, t, esc, fmt));
  assert.match(filt, /^Contas 2 de 6 /);
  assert.ok(!/outro/.test(filt), 'no "outro" block item when there is none');
  const tests = text(accStripHtml(accStrip([{ email: 'a.12345@gmail.com', kind: 'rule' }, { email: 'b@x.y', kind: 'list' }], { total: 2, filtered: false }), { view: 'tests', testExcluded: 109 }, t, esc, fmt));
  assert.match(tests, /1 pela regra/);
  assert.ok(!/fora dos números/.test(tests), 'the test view does not repeat the excluded note');
  assert.equal((tests.match(/não medido/g) || []).length, 4, 'four blocks not measured before the database update');
});

test('Strip labels: every st_ label exists in all 6 languages (parity), no emoji, Portuguese formal', () => {
  const T = pageT();
  const en = Object.keys(T.en).filter((k) => k.startsWith('st_'));
  for (const k of ['st_accounts', 'st_login', 'st_onboarding', 'st_platform', 'st_protocol', 'st_email', 'st_other', 'st_done', 'st_of', 'st_out', 'st_rule', 'st_nm', 'st_nm_why', 'st_aria']) assert.ok(en.includes(k), 'en ' + k);
  for (const l of LANGS) {
    assert.deepEqual(Object.keys(T[l]).filter((k) => k.startsWith('st_')).sort(), en.slice().sort(), l + ' st_ parity');
    for (const k of en) { assert.ok(String(T[l][k]).trim(), l + ' ' + k); assert.ok(!/\p{Extended_Pictographic}/u.test(T[l][k]), 'no emoji ' + l + ' ' + k); }
  }
  for (const k of en) assert.ok(!/\bNão deu\b|\bdá para\b|\ba gente\b|\bpra\b|\bnão dá\b/i.test(T.pt[k]), 'formal pt: ' + T.pt[k]);
  assert.equal(T.pt.st_protocol, 'Protocolo ativo');
  assert.equal(T.pt.st_out, '{n} contas de teste fora dos números');
  assert.equal(T.pt.st_rule, '{n} pela regra');
});

test('Old running text is gone: no acc_summary / by_rule_n label in any language, secAccounts no longer writes those lines, and the strip renders once above the list', () => {
  const T = pageT();
  for (const l of LANGS) { assert.ok(!('acc_summary' in T[l]), l + ' acc_summary removed'); assert.ok(!('by_rule_n' in T[l]), l + ' by_rule_n removed'); }
  assert.ok(!/Por login:/.test(HTML) && !/contas pela regra/.test(HTML), 'no copy of the old pt text left');
  const src = secAccountsSrc();
  for (const k of ['acc_summary', 'by_rule_n', 'excluded_n', 'AL.summary', 'by_provider']) assert.ok(!src.includes(k), 'secAccounts does not use ' + k);
  assert.equal((src.match(/accStripHtml\(/g) || []).length, 1, 'one strip');
  assert.ok(src.indexOf('accStripHtml(') < src.indexOf('acc-split'), 'strip sits above the list and the card');
  assert.ok(src.indexOf("setAccView(\\'tests\\')") < src.indexOf('accStripHtml('), 'strip follows the Contas reais / Contas de teste switch');
  assert.ok('excluded_n' in T.pt, 'excluded_n stays: the Management view still uses it');
});

test('Strip CSS: tokens only, blocks wrap on desktop, a 2-column grid at phone width, nothing wider than the screen', () => {
  const css = HTML.match(/\/\* \[users-css-start\] \*\/([\s\S]*?)\/\* \[users-css-end\] \*\//)[1];
  const rules = css.split('\n').filter((l) => /\.acc-strip/.test(l)).join('\n');
  assert.ok(rules, 'strip rules inside the users css block');
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\bwhite\b|\bblack\b/i.test(rules.replace(/white-space/g, '')), 'tokens only');
  assert.match(rules, /\.acc-strip\{[^}]*display:flex;[^}]*flex-wrap:wrap/);
  assert.match(css, /@media\(max-width:640px\)\{[\s\S]*\.acc-strip\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.ok(!/(^|[^-])width:\s*\d{3,}px/.test(rules), 'no fixed width');
});

test('Strip SQL: admin_accounts_list gives each test account the same yes/no fields as a real one (login, platform signals, onboarding, active protocol), nothing more; new migration, mirror identical', () => {
  const [file, mig] = latestMigrationWith('admin_accounts_list');
  assert.notEqual(file, '20261022200000_admin_users_tab.sql', 'a new migration, the applied one stays as it was');
  const fn = latestFn('admin_accounts_list');
  assert.equal(fn, sqlFnIn(SQL, 'admin_accounts_list'), 'the versioned SQL carries the newest body');
  const tests = fn.match(/'tests', coalesce\(\(select jsonb_agg\(jsonb_build_object\(([\s\S]*?)\) order by u\.created_at desc\)\s*from auth\.users u where public\.admin_is_test\(u\.email\)\), '\[\]'::jsonb\)/);
  assert.ok(tests, 'tests block, test accounts only, newest first');
  const keys = [...tests[1].matchAll(/^\s*'([a-z_]+)',/gm)].map((m) => m[1]);
  assert.deepEqual(keys, ['id', 'email', 'kind', 'provider', 'apple', 'pu', 'ua', 'onboarded', 'has_active_protocol']);
  assert.match(tests[1], /'has_active_protocol', exists \(select 1 from public\.protocols p where p\.user_id = u\.id and p\.deleted_at is null and p\.active is true\)/);
  assert.match(fn, /from auth\.users u where not public\.admin_is_test\(u\.email\)\), '\[\]'::jsonb\)/, 'rows still real accounts only');
  assert.ok(!/from public\.(dose_logs|biomarkers|food_logs|labs|reality_checks|calc_)/i.test(fn), 'no other health table');
  assert.match(mig, /STATUS: NOT APPLIED/);
  assert.match(mig, /^begin;$/m); assert.match(mig, /^commit;$/m);
  assert.match(mig, /revoke execute on function public\.admin_accounts_list\(\) from public, anon, authenticated;/);
  assert.match(mig, /grant execute on function public\.admin_accounts_list\(\) to service_role;/);
  assert.ok(!/(alter|update|insert into|delete from|drop)\s+(table\s+)?auth\./i.test(mig), 'nothing in the auth schema');
});

test('Server: the old Contas summary (accountsSummary) is gone; the page computes the strip from the rows', () => {
  const adm = require('../api/adm.js');
  assert.ok(!('accountsSummary' in adm), 'accountsSummary removed');
  assert.ok(!/accountsSummary|summary: /.test(fs.readFileSync(path.join(ROOT, 'api', 'adm.js'), 'utf8')), 'no summary sent');
});
