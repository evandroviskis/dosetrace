'use strict';
// My Protocols part 10 (approved P5, founder 2026-10-02): New vial / New bottle ask first.
// Tapping New vial reset the count at once with no question; now a DoseTrace sheet asks
// "Start counting from a full vial? The doses already logged stay in your history." with
// Cancel (nothing changes) and Start new (the reset, unchanged). Oral: "New bottle" / bottle.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SCREEN = fs.readFileSync(path.join(__dirname, '..', 'screens', 'ProtocolsScreen.js'), 'utf8');
const fnBody = (src, name) => {
  const a = src.indexOf(`function ${name}(`);
  assert.ok(a >= 0, `function ${name}`);
  let depth = 0, i = src.indexOf('{', a);
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(a, i + 1);
};
function loadTranslations() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}

test('part 10: New vial asks before the count is reset; Cancel writes nothing', () => {
  const ask = fnBody(SCREEN, 'askRefillVial');
  assert.match(ask, /title: t\('protocols_new_vial'\)/);
  assert.match(ask, /body: t\('protocols_new_vial_body'\)/);
  assert.match(ask, /\{ label: t\('cancel'\), kind: 'secondary' \}/);
  assert.match(ask, /\{ label: t\('protocols_start_new'\), kind: 'primary', onPress: \(\) => refillVial\(id\) \}/);
  assert.doesNotMatch(ask, /updateVial|updateProtocol/, 'nothing is written before Start new');
  assert.match(SCREEN, /onRefillVial=\{askRefillVial\}/);
});

test('part 10: New bottle asks the same, in bottle words', () => {
  const ask = fnBody(SCREEN, 'askRefillBottle');
  assert.match(ask, /title: t\('protocols_serving_new_bottle'\)/);
  assert.match(ask, /body: t\('protocols_new_bottle_body'\)/);
  assert.match(ask, /\{ label: t\('protocols_start_new'\), kind: 'primary', onPress: \(\) => refillOralBottle\(id\) \}/);
  assert.doesNotMatch(ask, /updateVial|updateProtocol/);
  assert.match(SCREEN, /onRefill=\{askRefillBottle\}/);
});

test('part 10: the reset itself is unchanged (doses already logged stay in the history)', () => {
  assert.match(fnBody(SCREEN, 'refillVial'), /updateVial\(v\.id, \{ doses_taken: 0, active: 1 \}\)/);
  assert.match(fnBody(SCREEN, 'refillOralBottle'), /updateProtocol\(id, \{ units_taken: 0 \}\)/);
});

test('part 10: the copy, English per the prototype, in all 6 languages', () => {
  const tr = loadTranslations();
  assert.equal(tr.en.protocols_new_vial_body, 'Start counting from a full vial? The doses already logged stay in your history.');
  assert.equal(tr.en.protocols_new_bottle_body, 'Start counting from a full bottle? The doses already logged stay in your history.');
  assert.equal(tr.en.protocols_start_new, 'Start new');
  for (const l of ['es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['protocols_new_vial_body', 'protocols_new_bottle_body', 'protocols_start_new']) {
      assert.ok(tr[l][k] && tr[l][k] !== tr.en[k], `${l}.${k} translated`);
    }
  }
});
