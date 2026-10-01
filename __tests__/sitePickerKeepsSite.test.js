'use strict';
// A-55 / FX-21 (design item 26, founder 2026-09-29): the site picker must never erase
// a stored injection site by default. An older row holds free text ("left glute");
// the picker cannot show it as a dot (parseStored → sites []), and Save with nothing
// picked used to write null over it (LogScreen handleSiteSave → updateDoseLog).
// Rule: what Save stores comes from siteToStore — empty selection keeps stored free
// text; a new pick replaces it; clearing sites the user had PICKED is their choice.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sites = require('../lib/injectionSites');

test('A-55: a row with injection_site "left glute" survives open + Save with nothing picked', () => {
  assert.equal(typeof sites.siteToStore, 'function', 'siteToStore not built yet');
  assert.equal(sites.siteToStore({ type: 'subq', selected: [], initialStored: 'left glute' }), 'left glute');
});

test('A-55: picking a spot replaces the typed text; a new row with nothing picked stores nothing', () => {
  assert.equal(typeof sites.siteToStore, 'function', 'siteToStore not built yet');
  assert.equal(sites.siteToStore({ type: 'im', selected: ['glute_l'], initialStored: 'left glute' }), JSON.stringify({ type: 'im', sites: ['glute_l'] }));
  assert.equal(sites.siteToStore({ type: 'subq', selected: [], initialStored: null }), null);
});

test('A-55: picked sites reopened and saved unchanged are kept; deselecting them all is the user\'s own removal', () => {
  assert.equal(typeof sites.siteToStore, 'function', 'siteToStore not built yet');
  const stored = JSON.stringify({ type: 'subq', sites: ['abdomen_lr'] });
  assert.equal(sites.siteToStore({ type: 'subq', selected: ['abdomen_lr'], initialStored: stored }), stored);
  assert.equal(sites.siteToStore({ type: 'subq', selected: [], initialStored: stored }), null);
});

test('A-55: the picker saves through siteToStore and shows the saved text', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'components', 'BodyMapModal.js'), 'utf8');
  const i = src.indexOf('function handleSave(');
  assert.match(src.slice(i, i + 400), /siteToStore\(/, 'handleSave must store via siteToStore');
  assert.doesNotMatch(src.slice(i, i + 400), /stored:\s*serializeForStorage\(/, 'never the raw serializer (writes null over free text)');
  assert.match(src, /freeText/, 'the saved free text is shown in the picker');
});
