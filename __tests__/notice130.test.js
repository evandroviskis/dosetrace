'use strict';
// The one-time update notice before the 1.3.0 cutoff (founder 2026-10-26 + 2026-11-02 "Aprovado, pode
// enviar sem pedir para apagar o app"): every account still on an older version, also without
// "Novidades", gets one push in its language; nobody is told to delete the app.
const test = require('node:test');
const assert = require('node:assert/strict');
const { COPY, langFor, buildSql } = require('../scripts/notice130.cjs');

test('the approved Portuguese text, word for word, and all six languages', () => {
  assert.equal(COPY.pt.body, 'Uma nova versão do DoseTrace está disponível. Atualize pela App Store ou pela Google Play para continuar sincronizando seus registros.');
  assert.deepEqual(Object.keys(COPY).sort(), ['de', 'en', 'es', 'fr', 'it', 'pt']);
  for (const [l, c] of Object.entries(COPY)) {
    assert.ok(c.title && c.body, l);
    assert.match(c.body, /App Store/, l);
    assert.match(c.body, /Google Play/, l);
    assert.doesNotMatch(c.body, /delet|apag|borr|supprim|lösch|elimin|reinstal|réinstall|neu install/i, `${l}: never ask to delete the app`);
  }
});

test('language: the token row first, then the account, then the time zone, else English', () => {
  assert.equal(langFor({ language: 'fr', timezone: 'America/Sao_Paulo' }), 'fr');
  assert.equal(langFor({ metaLanguage: 'pt' }), 'pt');
  assert.equal(langFor({ timezone: 'America/Sao_Paulo' }), 'pt');
  assert.equal(langFor({ timezone: 'Europe/Lisbon' }), 'pt');
  assert.equal(langFor({ timezone: 'Europe/Madrid' }), 'es');
  assert.equal(langFor({ timezone: 'America/Mexico_City' }), 'es');
  assert.equal(langFor({ timezone: 'Europe/Paris' }), 'fr');
  assert.equal(langFor({ timezone: 'Europe/Berlin' }), 'de');
  assert.equal(langFor({ timezone: 'Europe/Rome' }), 'it');
  assert.equal(langFor({ timezone: 'America/New_York' }), 'en');
  assert.equal(langFor({}), 'en');
  assert.equal(langFor({ language: 'xx' }), 'en');
});

test('the SQL sends only to tokens below 1.3.1, never to an account already on 1.3.1, through pg_net, in batches of at most 100', () => {
  const sql = buildSql({ onlyUser: null });
  assert.match(sql, /net\.http_post/);
  assert.match(sql, /exp\.host\/--\/api\/v2\/push\/send/);
  assert.match(sql, /app_version is null or public\.dt_version_below\(p\.app_version, '1\.3\.1'\)/);
  assert.match(sql, /not exists \(select 1 from public\.push_tokens q where q\.user_id = p\.user_id and q\.app_version is not null and not public\.dt_version_below\(q\.app_version, '1\.3\.1'\)\)/);
  assert.match(sql, /\/ 100/);
  for (const c of Object.values(COPY)) assert.ok(sql.includes(c.body.replace(/'/g, "''")), 'every body is in the SQL, quotes escaped');
  const one = buildSql({ onlyUser: '00000000-0000-0000-0000-000000000001', anyVersion: true });
  assert.match(one, /p\.user_id = '00000000-0000-0000-0000-000000000001'/, 'a test send goes to one test account only');
  assert.throws(() => buildSql({ onlyUser: "x' or 1=1 --" }), /uuid/);
});
