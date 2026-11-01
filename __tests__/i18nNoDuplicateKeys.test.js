'use strict';
// Council 2026-11-01 (regulatory): cal_rc_sb_locked was defined twice in every language; the later value won,
// so the free lab-chart lock tile read "Pronto · o resultado faz parte do Premium". A key defined twice in one
// language block is always a bug: the earlier text silently disappears.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('no key is defined twice in any language block of i18n/translations.js', () => {
  const lines = fs.readFileSync(path.join(__dirname, '..', 'i18n', 'translations.js'), 'utf8').split('\n');
  let lang = null; const seen = {}; const dups = [];
  lines.forEach((line, i) => {
    const open = line.match(/^  '(en|es|pt|fr|de|it)': \{/);
    if (open) { lang = open[1]; seen[lang] = {}; return; }
    if (!lang) return;
    const m = line.match(/^    ([A-Za-z0-9_]+):/);
    if (!m) return;
    if (seen[lang][m[1]]) dups.push(`${lang} ${m[1]} (lines ${seen[lang][m[1]]} and ${i + 1})`);
    else seen[lang][m[1]] = i + 1;
  });
  assert.ok(Object.keys(seen).length === 6, 'six language blocks found');
  assert.deepEqual(dups, []);
});

test('the free lab-chart lock tile keeps its own text; the reality-check locked status has its own key', () => {
  const { translations: T } = require('../i18n/translations');
  assert.equal(T.pt.cal_rc_sb_locked, 'Premium — toque para desbloquear');
  assert.equal(T.pt.cal_rc_sb_ready_locked, 'Pronto · o resultado faz parte do Premium');
});
