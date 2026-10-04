'use strict';
// Found while building the multi-select (2026-10-04): the Ended section (A-83) was rendered only on
// the book layout's left page — on a phone the list never showed it, so an ended protocol could not
// be restarted or deleted there. It now sits above Recently deleted on the phone list too (and under
// the empty state when no protocol is active).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the phone list renders the Ended section before Recently deleted', () => {
  const s = fs.readFileSync(path.join(__dirname, '../screens/ProtocolsScreen.js'), 'utf8');
  const phone = s.slice(s.indexOf("{view === 'list' && protocols.length > 0 && listCards}"));
  const ended = phone.indexOf("&& endedSection}");
  const deleted = phone.indexOf("&& deletedSection}");
  assert.ok(ended > 0, 'phone: Ended section rendered');
  assert.ok(ended < deleted, 'above Recently deleted');
  assert.match(s, /\{\(view === 'list' \|\| \(view === 'heroes' && protocols\.length === 0\)\) && endedSection\}/);
});
