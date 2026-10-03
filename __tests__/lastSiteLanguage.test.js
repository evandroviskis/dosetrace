'use strict';
// Bug 2026-10-02 (sim check, French): Today's dose card read "Dernier : Abdomen, lower right".
// The site is stored as an id ({"type":"subq","sites":["abdomen_lr"]}), never as English text;
// Today turned it into a name once, when it read the log, with the language of that moment,
// and kept the English name after the language changed. The card now keeps the stored value
// and names it when it draws, in the current language. Stored data is never rewritten.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describeStored } = require('../lib/injectionSites');

function load() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const tr = load();
const TODAY = fs.readFileSync(path.join(__dirname, '..', 'screens', 'TodayScreen.js'), 'utf8');

test('a stored site id is named in the language it is shown in', () => {
  const stored = JSON.stringify({ type: 'subq', sites: ['abdomen_lr'] });
  const tFor = (l) => (k) => tr[l][k] || tr.en[k] || k;
  assert.equal(describeStored(stored, tFor('en')), tr.en.site_abdomen_lower_right);
  assert.equal(describeStored(stored, tFor('fr')), tr.fr.site_abdomen_lower_right);
  assert.notEqual(tr.fr.site_abdomen_lower_right, tr.en.site_abdomen_lower_right);
});

test("Today keeps the stored site and names it when drawing, not when reading the log", () => {
  const fetch = TODAY.slice(TODAY.indexOf('async function fetchLastSites'), TODAY.indexOf('setLastSiteByProtocol(out);'));
  assert.ok(fetch.length > 0);
  assert.doesNotMatch(fetch, /describeStored\(/, 'no name is computed when the log is read');
  assert.match(fetch, /out\[pid\] = \{ stored: l\.injection_site, daysAgo \}/);
  assert.match(TODAY, /const lastSiteName = lastSite \? describeStored\(lastSite\.stored, t\) : null;/);
  assert.match(TODAY, /\.replace\('\{site\}', lastSiteName\)/);
});
