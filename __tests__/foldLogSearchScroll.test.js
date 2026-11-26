'use strict';
// Bug found on the open Fold 2026-11-26: the app search result "Doses concluídas" opened the left
// page's Dose log on the "Concluídas" filter but left the page at the top (Today's title and rings), so
// the filtered list sat below the screen and only the filter row showed at the bottom edge. A Dose log
// search landing now also scrolls the left page to the log's title, as "Ver histórico" does (FT-5,
// AS-8: a landing that needs a place inside a screen reaches it). Source test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const LOG = fs.readFileSync(path.join(__dirname, '..', 'screens/LogScreen.js'), 'utf8');

test('FT-5: a Dose log search landing on the open Fold scrolls to the log', () => {
  const i = LOG.indexOf("if (['Taken', 'Skipped', 'Missed'].includes(routeFilter)) {");
  assert.ok(i > 0, 'the filter landing effect exists');
  const body = LOG.slice(i, LOG.indexOf('}, [routeFilter, filterKey]', i));
  assert.match(body, /if \(embedded && filterKey != null\) \{ pendingScroll\.current = \{ to: 'log', n: Date\.now\(\) \}; applyScroll\(\); \}/,
    'the embedded log asks for the scroll to its title on each search landing');
});

test('FT-5: the scroll waits for the lead layout (applied again on layout)', () => {
  assert.match(LOG, /if \(req\.to === 'log' && leadH\.current == null\) return;/);
  const onLead = LOG.match(/leadH\.current = [^;]+;\s*applyScroll\(\)/);
  assert.ok(onLead, 'the lead onLayout applies a pending scroll');
});
