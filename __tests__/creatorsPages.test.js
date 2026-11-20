// Creators program — pages and wiring (docs/specs/creators.md §7; pictures docs/design/adm-criadores.html).
// Labels in 6 languages, no emoji, colours only through tokens, the panel hooks, the routes and headers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

function loadInBox(file) {
  const win = {}, doc = { getElementById: () => null, body: { contains: () => false, getAttribute: () => null }, head: { appendChild() {} }, createElement: () => ({}), addEventListener() {}, documentElement: {} };
  new Function('window', 'document', read(file))(win, doc);
  return win;
}

test('CR-UI3: creator pages — every label in the 6 languages (same keys), no emoji, Portuguese uses "você" consistently', () => {
  const T = loadInBox('web/criador/i18n.js').CR_T;
  assert.deepEqual(Object.keys(T), LANGS);
  const en = Object.keys(T.en).sort();
  for (const l of LANGS) {
    assert.deepEqual(Object.keys(T[l]).sort(), en, l + ' parity');
    for (const [k, v] of Object.entries(T[l])) { assert.ok(typeof v === 'string' && v.length, l + ' ' + k); assert.ok(!EMOJI.test(v), 'emoji ' + l + ' ' + k); }
  }
  assert.ok(!/o senhor|a senhora/.test(JSON.stringify(T.pt)));
  for (const k of ['q_country', 'secure_br', 'ios_note', 'draft', 'r3']) assert.ok(T.pt[k] && T.en[k], k);
  assert.match(T.pt.r3, /compostos/, 'never compounds or sellers');
  assert.match(T.en.m_ach_sub, /never here/, 'bank details never on this page');
});

test('CR-UI1a: the admin tab — labels in 6 languages (same keys), no emoji, its styles use the panel tokens only', () => {
  const TC = loadInBox('web/adm-creators.js').CR_TC;
  const en = Object.keys(TC.en).sort();
  for (const l of LANGS) { assert.deepEqual(Object.keys(TC[l]).sort(), en, l + ' parity'); for (const v of Object.values(TC[l])) assert.ok(!EMOJI.test(v)); }
  const src = read('web/adm-creators.js');
  const style = src.match(/var STYLE = ([\s\S]*?);\n/)[1];
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|:\s*(white|black)\b/.test(style), 'no literal colour in the tab styles');
  assert.match(TC.pt.model_default, /35 %.*12 meses/, 'default model = the founder decision of 2026-11-19');
});

test('CR-UI1b: web/adm.html wires the tab — desktop tab, phone tab bar, label ×6, bridge, Back key, script after the main one', () => {
  const html = read('web/adm.html');
  const script = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  const T = (0, eval)('(' + script.match(/var T=(\{[\s\S]*?\n  \});/)[1] + ')');
  for (const l of LANGS) assert.ok(T[l].tab_creators, l + ' tab_creators');
  assert.match(html, /\['creators','tab_creators'\]/);
  assert.match(html, /\['criadores','tab_creators'\]/);
  assert.match(html, /window\.DTADM=\{api:function\(m,b,p\)\{return AUTH\.api\(m,b,p\);\}/);
  assert.match(html, /window\.CRTab&&window\.CRTab\.back&&window\.CRTab\.back\(\)/);
  assert.ok(html.indexOf('<script src="/adm-creators.js"></script>') > html.lastIndexOf('})();'), 'loaded after the main script');
  assert.ok(!/DTADM=\{[^}]*(service|SUPABASE_SERVICE|devKey)/.test(html), 'the bridge exposes no key');
});

test('CR-2c: routes and headers — /go and /c rewrites, creator pages with a strict CSP (no inline script) and noindex, function limits', () => {
  const v = JSON.parse(read('vercel.json'));
  assert.deepEqual(v.rewrites, [{ source: '/go/:creator/:platform', destination: '/api/go?c=:creator&p=:platform' }, { source: '/c/:code', destination: '/api/go?k=:code' }]);
  const h = v.headers.find((x) => x.source === '/criador/(.*)');
  const csp = h.headers.find((x) => x.key === 'Content-Security-Policy').value;
  assert.match(csp, /script-src 'self';/); assert.ok(!/unsafe-inline/.test(csp));
  assert.equal(h.headers.find((x) => x.key === 'Referrer-Policy').value, 'no-referrer');
  assert.match(h.headers.find((x) => x.key === 'X-Robots-Tag').value, /noindex/);
  for (const f of ['api/adm-creators.js', 'api/creator.js', 'api/go.js', 'api/rc-webhook.js']) assert.ok(v.functions[f], f);
  for (const p of ['web/criador/convite.html', 'web/criador/portal.html']) { const s = read(p); assert.ok(!/<script>/.test(s), 'no inline script: ' + p); assert.match(s, /noindex/); assert.match(s, /src="\/criador\/app\.js"/); }
  const css = read('web/criador/app.css');
  const outside = css.replace(/:root\{[^}]*\}/g, '').replace(/@media \(prefers-color-scheme:dark\)\{:root\{[^}]*\}\}/g, '');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(outside), 'colours only as tokens in app.css');
});

test('CR-2d: the iPhone code page exists in the 6 languages with the same keys', () => {
  const go = require('../api/go.js');
  const en = Object.keys(go.TX.en).sort();
  for (const l of LANGS) assert.deepEqual(Object.keys(go.TX[l]).sort(), en, l);
  assert.equal(go.langOf('pt-BR,pt;q=0.9,en;q=0.8'), 'pt'); assert.equal(go.langOf('ja-JP'), 'en');
  const html = go.page({ lang: 'pt', device: 'ios', code: 'ANA-YT', name: 'Ana <b>', benefit: null, apple: 'https://apps.apple.com/x', play: 'https://play.google.com/y' });
  assert.ok(html.includes('Ana &lt;b&gt;'), 'escaped'); assert.ok(!html.includes('play.google.com'), 'iPhone: App Store only');
  assert.match(html, /prefers-color-scheme:dark/, 'both themes');
});
