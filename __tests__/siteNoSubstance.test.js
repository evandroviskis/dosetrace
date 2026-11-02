// dosetrace.io names no substance (founder 2026-11-02, advertising principle "never name a substance";
// Meta reviews the landing page). Only the substance words were swapped for the store wording
// (medications, injectables, supplements); every other sentence stays as it was.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'web');
const SUBSTANCE = /p[eé]pt[ií]d|peptid|\bTRT\b|GLP-?1|testost|semaglut|tirzepat|steroid|ester[oó]id|horm[oô]n|\bormon/i;

for (const f of ['index.html', 'i18n.js']) {
  test(f + ' names no substance', () => {
    const lines = fs.readFileSync(path.join(WEB, f), 'utf8').split('\n');
    const hits = lines.map((l, i) => (SUBSTANCE.test(l) ? i + 1 + ': ' + l.trim().slice(0, 120) : null)).filter(Boolean);
    assert.deepStrictEqual(hits, []);
  });
}
