'use strict';
// Found by the Promo Council app specialist (2026-11-02): the store descriptions sold Premium
// features as free ("Chart any marker over time", PDF export, the AI food log and the 7-day check).
// Decisions: lab-marker charts Premium (A-211, 2026-10-31); PDF export Premium, CSV free; the AI
// food log and the reality check it feeds are free for 7 days, then Premium. Store rules require
// the description to say which features need a purchase.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const read = (l) => fs.readFileSync(path.join(__dirname, '../store/listing', `${l}.md`), 'utf8');

test('every listing marks the lab charts, PDF export, AI food log and reality check as Premium', () => {
  for (const l of LANGS) {
    const s = read(l);
    const lines = s.split('\n');
    const labLine = lines.find((x) => /PDF/.test(x) && /^• /.test(x) && !/CSV/.test(x));
    assert.match(labLine, /\(Premium\)\.?$/, `${l}: lab chart line ends with (Premium)`);
    const exportLine = lines.find((x) => /CSV/.test(x));
    assert.doesNotMatch(exportLine, /PDF\/CSV/, `${l}: PDF export is not sold as free`);
    assert.match(exportLine, /PDF[^()]*: ?Premium/, `${l}: PDF export marked Premium`);
    assert.ok((s.match(/Premium\)/g) || []).length >= 4, `${l}: food log and reality check say "then Premium"`);
    assert.ok(s.length <= 4000 + 400, `${l}: body still fits the Play 4000 limit (front matter excluded)`);
  }
});
