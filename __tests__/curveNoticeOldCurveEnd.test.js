'use strict';
// Bug found on the open Fold 2026-11-26: an account created that day (protocols added on the S25 in
// the morning) signed in on the Fold and the curve showed "A curva agora usa as doses registradas ...
// o nível estimado pode estar menor do que antes" — a "before" it never had. The rule only compared the
// protocol with the first run of the new curve on THIS phone, so any account moving to another phone
// looked old. Nobody could see the old curve after 1.3.0 was blocked (2026-11-02 14:37:55 UTC,
// legacy_until, Second Brain 01-estado.md), so a protocol added after that never had the old curve.
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../lib/curveNotice');

const HOUR = 3600000;
const sinceFold = Date.parse('2026-11-26T17:30:00Z'); // the Fold first ran the new curve today

test('a protocol added after the old curve ended never shows the notice, on any phone', () => {
  assert.equal(N.OLD_CURVE_END, Date.parse('2026-11-02T14:37:55Z'));
  const morning = { id: 1, created_at: '2026-11-26T16:20:00Z' }; // before this phone's marker
  assert.equal(N.shouldShowCurveNotice({ meta: {}, protocols: [morning], since: sinceFold, localSeen: null, userId: 'u' }), false);
});

test('a protocol from the old-curve days still shows it on a phone that runs the new curve later', () => {
  const october = { id: 2, created_at: '2026-10-20T12:00:00Z' };
  assert.equal(N.shouldShowCurveNotice({ meta: {}, protocols: [october], since: sinceFold, localSeen: null, userId: 'u' }), true);
  const justBefore = { id: 3, created_at: new Date(N.OLD_CURVE_END - HOUR).toISOString() };
  assert.equal(N.shouldShowCurveNotice({ meta: {}, protocols: [justBefore], since: sinceFold, localSeen: null, userId: 'u' }), true);
});
