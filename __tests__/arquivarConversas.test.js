'use strict';
// Conversation archive (founder 2026-11-24): every DoseTrace Claude transcript is copied into
// Second Brain/dosetrace/conversas-claude with every secret hidden and big images removed.
// The fake secrets below are built at run time (string pieces) so this file itself never holds
// anything that looks like a real key.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const A = require('../scripts/arquivar-conversas.cjs');

const R = '[OCULTO]';
const rnd = (n, set = 'aB3xK9pQ2mZ7wL5v') => Array.from({ length: n }, (_, i) => set[(i * 7 + 3) % set.length]).join('');
const hex = (n) => Array.from({ length: n }, (_, i) => '0123456789abcdef'[(i * 5 + 1) % 16]).join('');

const FAKE = {
  jwt: 'ey' + 'J' + rnd(30) + '.' + 'ey' + 'J' + rnd(40) + '.' + rnd(43),
  anthropic: 'sk-' + 'ant-' + 'api03-' + rnd(80),
  openai: 'sk-' + 'proj-' + rnd(48),
  supabasePat: 'sb' + 'p_' + hex(40),
  supabaseSecret: 'sb_' + 'secret_' + rnd(32),
  stripeLive: 'sk' + '_live_' + rnd(30),
  stripePub: 'pk' + '_test_' + rnd(30),
  revenuecat: 'rk' + '_' + rnd(28),
  revenuecatApple: 'ap' + 'pl_' + rnd(24),
  aws: 'AK' + 'IA' + 'Q3EGRT5YUI7OPLKJ',
  google: 'AI' + 'za' + rnd(35),
  github: 'gh' + 'p_' + rnd(36),
  githubPat: 'github' + '_pat_' + rnd(22) + '_' + rnd(59),
  slack: 'xo' + 'xb-' + '1234567890-' + rnd(24),
  meta: 'EA' + 'A' + rnd(120),
  expoPush: 'ExponentPush' + 'Token[' + rnd(22) + ']',
  pem: '-----BEGIN ' + 'PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg' + rnd(40) + '\n' + rnd(64) + '\n-----END ' + 'PRIVATE KEY-----',
  envKey: rnd(40),
  hexSecret: hex(64),
};

function countsOf(fn) { const c = {}; const out = fn(c); return { out, c }; }

test('archive: every kind of token is replaced by [OCULTO]', () => {
  for (const [kind, secret] of Object.entries(FAKE)) {
    if (kind === 'envKey' || kind === 'hexSecret') continue;
    const { out, c } = countsOf((c) => A.maskString('before ' + secret + ' after', c));
    assert.ok(!out.includes(secret), kind + ' still visible');
    assert.ok(out.includes(R), kind + ' not marked');
    assert.ok(out.startsWith('before ') && out.endsWith(' after'), kind + ' ate the text around it: ' + out);
    assert.ok(Object.values(c).reduce((a, b) => a + b, 0) >= 1, kind + ' not counted');
  }
});

test('archive: private key blocks go whole, also inside JSON-escaped text', () => {
  const raw = 'file:\n' + FAKE.pem + '\nend';
  const out = A.maskString(raw, {});
  assert.ok(!out.includes('MIGTAgEA') && !out.includes('BEGIN PRIVATE KEY-----\nMIG'), out);
  const escaped = JSON.stringify({ private_key: FAKE.pem }); // a Google service-account JSON printed in a tool result
  const out2 = A.maskString('cat sa.json -> ' + escaped, {});
  assert.ok(!out2.includes('MIGTAgEA'), out2);
});

test('archive: passwords in every usual shape', () => {
  const cases = [
    ['{"email":"a@b.c","password":"Hunter2Secret!"}', 'Hunter2Secret!'],
    ['{\\"password\\":\\"Hunter2Secret!\\"}', 'Hunter2Secret!'],
    ['PASSWORD=Hunter2Secret', 'Hunter2Secret'],
    ['DB_PASSWORD="Hunter2 Secret"', 'Hunter2 Secret'],
    ['keystorePassword: Hunter2Secret', 'Hunter2Secret'],
    ['eas credentials --password Hunter2Secret --json', 'Hunter2Secret'],
    ['senha: Hunter2Secret', 'Hunter2Secret'],
    ['a senha é Abc12345!', 'Abc12345!'],
    ['the password is Abc12345!', 'Abc12345!'],
    ['postgres://postgres:Hunter2Secret@db.example.supabase.co:5432/postgres', 'Hunter2Secret'],
  ];
  for (const [text, secret] of cases) {
    const out = A.maskString(text, {});
    assert.ok(!out.includes(secret), 'still visible in: ' + out);
    assert.ok(out.includes(R), 'not marked in: ' + out);
  }
});

test('archive: Authorization headers, cookies and tokens in URLs', () => {
  const cases = [
    ['curl -H "Authorization: Bearer ' + rnd(40) + '" https://x', rnd(40)],
    ['-H "apikey: ' + rnd(40) + '"', rnd(40)],
    ['Cookie: sb-access-token=' + rnd(40) + '; other=1', rnd(40)],
    ['https://api.example.com/v1?access_token=' + rnd(40) + '&x=1', rnd(40)],
  ];
  for (const [text, secret] of cases) {
    const out = A.maskString(text, {});
    assert.ok(!out.includes(secret), 'still visible in: ' + out);
  }
});

test('archive: long random values given to *_KEY / *_SECRET / *_TOKEN names', () => {
  const cases = [
    'SUPABASE_SERVICE_ROLE_KEY=' + FAKE.envKey,
    'REVENUECAT_SECRET="' + FAKE.envKey + '"',
    'EXPO_TOKEN=' + FAKE.envKey,
    'VERCEL_TOKEN: ' + FAKE.envKey,
    'const apiKey = "' + FAKE.envKey + '";',
    'WEBHOOK_SECRET=' + FAKE.hexSecret,
    '{"service_role_key":"' + FAKE.envKey + '"}',
  ];
  for (const text of cases) {
    const out = A.maskString(text, {});
    assert.ok(!out.includes(FAKE.envKey) && !out.includes(FAKE.hexSecret), 'still visible in: ' + out);
  }
});

test('archive: ordinary text and code stay untouched', () => {
  const keep = [
    'O senhor precisa decidir a cor do botão. A senha é obrigatória no cadastro.',
    "const storageKey = 'dosetrace_settings';",
    'process.env.SUPABASE_SERVICE_ROLE_KEY',
    'commit f0d7a87ad8269932607f910810bf91d3dc6e5b44 on redesign/graduated',
    'session 471f2548-5ba0-4cd3-9104-9a98d6108669',
    'the task-runner skips desk-check items',
    'Authorization: Bearer $SUPABASE_KEY',
    "headers: { 'x-api-key': anthropicApiKey, 'anthropic-version': '2023-06-01' }",
  ];
  for (const text of keep) assert.equal(A.maskString(text, {}), text);
});

test('archive: big base64 images and blobs are removed, small ones kept', () => {
  const big = rnd(6000, 'ABCDEFGHabcdefgh0123456789+/');
  const line = JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [
      { type: 'tool_result', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: big } }] },
      { type: 'text', text: 'see data:image/jpeg;base64,' + big + ' here' },
      { type: 'thinking', thinking: 'x', signature: big },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } },
    ] },
    toolUseResult: { file: { base64: big, type: 'image/png' } },
  });
  const c = {};
  const out = A.maskLine(line, c);
  const j = JSON.parse(out);
  assert.ok(!out.includes(big));
  assert.equal(j.message.content[0].content[0].source.data, '[IMAGEM REMOVIDA]');
  assert.equal(j.message.content[1].text, 'see [IMAGEM REMOVIDA] here');
  assert.equal(j.toolUseResult.file.base64, '[IMAGEM REMOVIDA]');
  assert.equal(j.message.content[2].signature, '[BINARIO REMOVIDO]');
  assert.equal(j.message.content[3].source.data, 'iVBORw0KGgo=');
  assert.ok(c.imagem >= 3);
});

test('archive: every output line is valid JSON; a broken line is masked as text', () => {
  const ok = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'key ' + FAKE.anthropic }] } });
  const out = A.maskLine(ok, {});
  assert.doesNotThrow(() => JSON.parse(out));
  assert.ok(!out.includes(FAKE.anthropic));
  const broken = '{"type":"user","message":"token ' + FAKE.github + '"'; // truncated line
  const out2 = A.maskLine(broken, {});
  assert.ok(!out2.includes(FAKE.github) && out2.includes(R));
  // a value under a secret JSON key is hidden even without a known prefix
  const keyed = JSON.stringify({ tool: 'x', input: { password: 'plainwords', refresh_token: 'abcdefghijkl' } });
  const j = JSON.parse(A.maskLine(keyed, {}));
  assert.equal(j.input.password, R);
  assert.equal(j.input.refresh_token, R);
});

function tmpTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arq-'));
  const src = path.join(root, 'projects');
  const dest = path.join(root, 'conversas-claude');
  const proj = path.join(src, '-Users-x-Desktop-Second-Brain-dosetrace-codigo');
  fs.mkdirSync(path.join(proj, 'sess-1', 'subagents'), { recursive: true });
  fs.mkdirSync(path.join(src, '-Users-x-Desktop-other-project'), { recursive: true });
  fs.writeFileSync(path.join(src, '-Users-x-Desktop-other-project', 'o.jsonl'), '{"a":1}\n');
  return { root, src, dest, proj };
}
const L = (o) => JSON.stringify(o) + '\n';

test('archive: run copies only DoseTrace folders, masks, writes manifest + report, then is incremental', async () => {
  const { src, dest, proj } = tmpTree();
  const main = path.join(proj, 'sess-1.jsonl');
  fs.writeFileSync(main, L({ type: 'user', text: 'my key ' + FAKE.stripeLive }) + L({ type: 'assistant', text: 'ok' }));
  fs.writeFileSync(path.join(proj, 'sess-1', 'subagents', 'agent-a1.jsonl'), L({ type: 'user', text: 'jwt ' + FAKE.jwt }));
  fs.writeFileSync(path.join(proj, 'sess-1', 'subagents', 'agent-a1.meta.json'), '{"agentType":"Explore"}');

  const r1 = await A.runArchive({ srcRoot: src, destRoot: dest, quiet: true });
  const outMain = path.join(dest, 'Users-x-Desktop-Second-Brain-dosetrace-codigo', 'sess-1.jsonl');
  const outSub = path.join(dest, 'Users-x-Desktop-Second-Brain-dosetrace-codigo', 'sess-1', 'subagents', 'agent-a1.jsonl');
  assert.ok(fs.existsSync(outMain) && fs.existsSync(outSub));
  assert.ok(!fs.existsSync(path.join(dest, 'Users-x-Desktop-other-project')), 'other projects are not archived');
  const text = fs.readFileSync(outMain, 'utf8') + fs.readFileSync(outSub, 'utf8');
  assert.ok(!text.includes(FAKE.stripeLive) && !text.includes(FAKE.jwt));
  for (const l of text.split('\n').filter(Boolean)) JSON.parse(l);
  assert.equal(r1.processed, 3);

  const report = fs.readFileSync(path.join(dest, 'SECRETS-REPORT.md'), 'utf8');
  assert.match(report, /stripe|revenuecat/i);
  assert.match(report, /jwt/i);
  assert.ok(!report.includes(FAKE.stripeLive) && !report.includes(FAKE.jwt), 'the report never holds values');
  const manifest = JSON.parse(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8'));
  assert.ok(manifest.files['Users-x-Desktop-Second-Brain-dosetrace-codigo/sess-1.jsonl']);

  // second run: nothing changed -> nothing rewritten
  const mtime = fs.statSync(outMain).mtimeMs;
  const r2 = await A.runArchive({ srcRoot: src, destRoot: dest, quiet: true });
  assert.equal(r2.processed, 0);
  assert.equal(fs.statSync(outMain).mtimeMs, mtime);

  // the live transcript grows, last line still being written: only complete lines are taken
  fs.appendFileSync(main, L({ type: 'user', text: 'new ' + FAKE.github }) + '{"type":"user","text":"half');
  await A.runArchive({ srcRoot: src, destRoot: dest, quiet: true });
  let lines = fs.readFileSync(outMain, 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.length, 3);
  assert.ok(!lines.join('').includes(FAKE.github));
  fs.appendFileSync(main, ' done"}\n');
  await A.runArchive({ srcRoot: src, destRoot: dest, quiet: true });
  lines = fs.readFileSync(outMain, 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.length, 4);
  assert.equal(JSON.parse(lines[3]).text, 'half done');

  // the report totals follow the appended part too
  const m2 = JSON.parse(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8'));
  assert.ok(m2.totals.github >= 1);
});

test('archive: hook mode archives only the current transcript (and its subagents), only for DoseTrace', async () => {
  const { src, dest, proj } = tmpTree();
  const main = path.join(proj, 'sess-1.jsonl');
  fs.writeFileSync(main, L({ type: 'user', text: 'x ' + FAKE.aws }));
  fs.writeFileSync(path.join(proj, 'sess-1', 'subagents', 'agent-a1.jsonl'), L({ type: 'user', text: 'y' }));
  fs.writeFileSync(path.join(proj, 'sess-2.jsonl'), L({ type: 'user', text: 'other session' }));

  const r = await A.runArchive({ srcRoot: src, destRoot: dest, transcript: main, quiet: true });
  assert.equal(r.processed, 2);
  const base = path.join(dest, 'Users-x-Desktop-Second-Brain-dosetrace-codigo');
  assert.ok(fs.existsSync(path.join(base, 'sess-1.jsonl')));
  assert.ok(!fs.existsSync(path.join(base, 'sess-2.jsonl')));

  const r2 = await A.runArchive({ srcRoot: src, destRoot: dest, transcript: path.join(src, '-Users-x-Desktop-other-project', 'o.jsonl'), quiet: true });
  assert.equal(r2.processed, 0);
});

test('archive: the verify pass finds no leftover secret in the archive', async () => {
  const { src, dest, proj } = tmpTree();
  fs.writeFileSync(path.join(proj, 'sess-1.jsonl'), Object.values(FAKE).map((s) => L({ type: 'user', text: 'v ' + s + ' PASSWORD=Hunter2Secret' })).join(''));
  await A.runArchive({ srcRoot: src, destRoot: dest, quiet: true });
  const v = await A.verifyArchive(dest);
  assert.deepEqual(v.hits, {});
  // and the verifier itself does catch a planted one
  fs.appendFileSync(path.join(dest, 'Users-x-Desktop-Second-Brain-dosetrace-codigo', 'sess-1.jsonl'), L({ t: FAKE.google }));
  const v2 = await A.verifyArchive(dest);
  assert.ok(v2.hits.google >= 1);
});

test('archive: access tokens in a URL hash (creator portal links) are hidden', () => {
  const tok = rnd(43, 'aB3xK9pQ2mZ7wL5v_-');
  for (const text of [
    'abra https://dosetrace.io/criador/portal#' + tok + ' no celular',
    "location.hash='" + tok + "';",
  ]) {
    const out = A.maskString(text, {});
    assert.ok(!out.includes(tok), 'still visible in: ' + out);
  }
  // an ordinary anchor stays
  assert.equal(A.maskString('see https://docs.expo.dev/guides#configuration-options', {}), 'see https://docs.expo.dev/guides#configuration-options');
});

test('archive: thinking signatures are dropped whatever their size (opaque, never useful, can look like keys)', () => {
  const sig = rnd(600, 'ABCDEFGHabcdefgh0123456789+/');
  const line = JSON.stringify({ message: { content: [{ type: 'thinking', thinking: '', signature: sig }, { type: 'redacted_thinking', data: sig }] } });
  const j = JSON.parse(A.maskLine(line, {}));
  assert.equal(j.message.content[0].signature, '[BINARIO REMOVIDO]');
  assert.equal(j.message.content[1].data, '[BINARIO REMOVIDO]');
});

// Found in the first full run (2026-11-24): the admin-panel magic-link token survived in
// "adm?t=…" / "adm#t=…" links, in "the token is …" sentences, in a markdown table and bare in grep output.
test('archive: the admin magic-link token is hidden in links, sentences and tables', () => {
  const tok = rnd(43, 'Ff3AxU9kQ2mZ7wL5v_-');
  for (const text of [
    'abra https://dosetrace.io/adm?t=' + tok,
    'abra https://dosetrace.io/adm#t=' + tok,
    'The magic-link token is `' + tok + '`',
    '| `ADMIN_TOKEN` | `' + tok + '` |',
  ]) {
    const out = A.maskString(text, {});
    assert.ok(!out.includes(tok), 'still visible in: ' + out);
  }
  assert.equal(A.maskString('https://x.io/a?t=1700000000&b=2', {}), 'https://x.io/a?t=1700000000&b=2');
});

test('archive: a secret seen once in context is hidden everywhere else too, even bare', () => {
  A.resetKnown();
  const tok = rnd(43, 'Gh4BxU9kQ2mZ7wL5v_-');
  A.maskString('ADMIN_TOKEN=' + tok, {});
  const c = {};
  const out = A.maskString('grep result -> match: ' + tok + '\n', c);
  assert.ok(!out.includes(tok), out);
  assert.equal(c.conhecido, 1);
});

test('archive: a bare secret in a file archived BEFORE the file that reveals it is still hidden', async () => {
  A.resetKnown();
  const { src, dest, proj } = tmpTree();
  const tok = rnd(43, 'Hk5CxU9kQ2mZ7wL5v_-');
  fs.writeFileSync(path.join(proj, 'a-sess.jsonl'), L({ type: 'user', text: 'match: ' + tok }));
  fs.writeFileSync(path.join(proj, 'b-sess.jsonl'), L({ type: 'user', text: 'ADMIN_TOKEN=' + tok }));
  await A.runArchive({ srcRoot: src, destRoot: dest, quiet: true });
  const base = path.join(dest, 'Users-x-Desktop-Second-Brain-dosetrace-codigo');
  const all = fs.readFileSync(path.join(base, 'a-sess.jsonl'), 'utf8') + fs.readFileSync(path.join(base, 'b-sess.jsonl'), 'utf8')
    + fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8') + fs.readFileSync(path.join(dest, 'SECRETS-REPORT.md'), 'utf8');
  assert.ok(!all.includes(tok), 'token survived somewhere in the archive');
  for (const l of fs.readFileSync(path.join(base, 'a-sess.jsonl'), 'utf8').split('\n').filter(Boolean)) JSON.parse(l);
  // the next run does not undo it and does not redo the files
  const r = await A.runArchive({ srcRoot: src, destRoot: dest, quiet: true });
  assert.equal(r.processed, 0);
  assert.ok(!fs.readFileSync(path.join(base, 'a-sess.jsonl'), 'utf8').includes(tok));
  // and a fresh process (known list reloaded from the manifest) also hides it in new text
  A.resetKnown();
  fs.appendFileSync(path.join(proj, 'a-sess.jsonl'), L({ type: 'user', text: 'again ' + tok }));
  await A.runArchive({ srcRoot: src, destRoot: dest, quiet: true });
  assert.ok(!fs.readFileSync(path.join(base, 'a-sess.jsonl'), 'utf8').includes(tok));
  const v = await A.verifyArchive(dest);
  assert.deepEqual(v.hits, {});
});
