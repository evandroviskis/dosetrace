'use strict';
// Council fix 3 (founder 2026-10-16): with 0 reminders the French Reminder check read
// "1 rappel de dose programmé" — French takes the singular for 0 and 1 (lib/plural.js), and
// rc_count_one was a hardcoded "1 …" with no {n}. The guard, over the WHOLE source tree: every key
// picked with pluralKey('…') (and every isOne(...) ? 'x_one' : 'x_other' pair) has the same
// placeholders in its singular and plural forms in all 6 languages, so a singular can never print
// a count of its own (the count placeholder is in the singular whenever it is in the plural).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pluralKey } = require('../lib/plural');

const ROOT = path.join(__dirname, '..');
function load() {
  const src = fs.readFileSync(path.join(ROOT, 'i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const tr = load();
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const ph = (s) => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',');

function sources() {
  const out = [path.join(ROOT, 'App.js')];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  };
  for (const d of ['lib', 'screens', 'components']) walk(path.join(ROOT, d));
  return out.map((f) => fs.readFileSync(f, 'utf8'));
}
const SRC = sources();

// pluralKey('key', …) literal call sites, plus the dynamic one in FoodGraceNote (its keys listed there).
function pluralPairs() {
  const pairs = new Map();
  for (const s of SRC) {
    for (const m of s.matchAll(/pluralKey\(\s*'([a-z0-9_]+)'/g)) pairs.set(m[1], `${m[1]}_one`);
    for (const m of s.matchAll(/isOne\([^?]*\?\s*'([a-z0-9_]+)'\s*:\s*'([a-z0-9_]+)'/g)) pairs.set(m[2], m[1]);
  }
  const grace = fs.readFileSync(path.join(ROOT, 'screens/components/FoodGraceNote.js'), 'utf8');
  for (const k of ['nutri_grace_note_premium', 'nutri_free_ending_note', 'nutri_free_ending_note_nocheck']) {
    assert.ok(grace.includes(`'${k}'`), `FoodGraceNote still picks ${k}`);
    pairs.set(k, `${k}_one`);
  }
  return pairs;
}

test('council fix 3: every plural pair has identical placeholders in its singular and plural, in 6 languages', () => {
  const pairs = pluralPairs();
  assert.ok(pairs.size >= 30, `found the call sites (${pairs.size})`);
  assert.ok(pairs.has('rc_count'), 'rc_count is one of them');
  assert.ok(pairs.has('notif_vial_body_other'), 'the isOne pair in lib/notifications.js too');
  const bad = [];
  for (const [plural, one] of pairs) {
    for (const l of LANGS) {
      const P = tr[l][plural];
      const O = tr[l][one];
      if (P == null || O == null) { bad.push(`${l} ${plural} / ${one}: missing`); continue; }
      if (ph(P) !== ph(O)) bad.push(`${l} ${one} "${O}" vs ${plural} "${P}"`);
    }
  }
  assert.deepEqual(bad, []);
});

test('council fix 3: French 0 reminders reads 0, never "1 rappel"', () => {
  const fill = (l, n) => tr[l][pluralKey('rc_count', n, l)].replace('{n}', String(n));
  assert.equal(fill('fr', 0), '0 rappel de dose programmé');
  assert.equal(fill('fr', 1), '1 rappel de dose programmé');
  assert.equal(fill('fr', 3), '3 rappels de dose programmés');
  for (const l of LANGS) assert.match(tr[l].rc_count_one, /\{n\}/, `${l} rc_count_one carries {n}`);
  assert.equal(fill('en', 1), '1 dose reminder scheduled');
  assert.equal(fill('pt', 1), '1 lembrete de dose agendado');
});

test('council fix 3: the vial-expiry count keys have clear names (no _one_one)', () => {
  for (const l of LANGS) {
    assert.equal(tr[l].today_alert_vial_expiry_one_one, undefined, `${l}: old key gone`);
    assert.equal(tr[l].today_alert_vial_expiry_one, undefined, `${l}: old plural key gone`);
    assert.ok(tr[l].today_alert_vial_expiry_days && tr[l].today_alert_vial_expiry_days_one, `${l}: new keys`);
  }
  for (const s of SRC) assert.ok(!/today_alert_vial_expiry_one/.test(s), 'no caller uses the old name');
  assert.equal(tr.en.today_alert_vial_expiry_days_one.replace('{name}', 'BPC').replace('{n}', '1'), 'BPC — 1 day left');
});
