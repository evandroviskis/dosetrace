'use strict';
// A-101 (found while making the store prints, 2026-10-06): five small bugs, each with a test first.
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers/extractFn');
const T = require('../i18n/translations.js').translations || require('../i18n/translations.js');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

// (c) "1 markers": the lab count says "1 marker" (French also "0 biomarqueur").
test('A-101c: the lab marker count has a singular in all 6 languages and every count uses it', () => {
  const one = { en: 'marker', es: 'biomarcador', pt: 'marcador', fr: 'biomarqueur', de: 'Marker', it: 'marcatore' };
  for (const l of LANGS) assert.equal(T[l].blood_markers_one, one[l], l);
  const b = read('screens/BodyScreen.js');
  assert.doesNotMatch(b, /t\('blood_markers'\)/, 'no bare plural after a count');
  // the journal card, the test page, the delete question and (A-125) the My Body Labs tile
  assert.equal((b.match(/t\(pluralKey\('blood_markers', /g) || []).length, 4);
});

// (d) Lab "By date" repeated one date per marker for markers entered one at a time (each value
// its own created_at). One lab test = one card; a second upload of the same markers stays its own
// card, so a duplicate upload can still be deleted alone. A-125 (docs/specs/my-body-tiles.md MB2-5)
// moved the rule to lib/labReports.js and replaced "a repeated marker opens a new card" (it split
// one report that lists a marker twice) with the upload's timing: values stamped seconds apart are
// one upload, minutes apart are two (myBodyTiles.test.js runs the real cloud shapes).
const BODY = read('screens/BodyScreen.js');
const cardsFn = require('../lib/labReports');

test('A-101d: values of one upload stamped one by one are ONE lab card; a later duplicate upload is a second card', () => {
  const rows = [
    { id: 1, report_date: '2026-10-01', created_at: '2026-10-01T10:00:00.000Z', marker: 'Testosterone' },
    { id: 2, report_date: '2026-10-01', created_at: '2026-10-01T10:00:00.400Z', marker: 'Estradiol' },
    { id: 3, report_date: '2026-10-01', created_at: '2026-10-01T10:00:01.100Z', marker: 'Hematocrit' },
    { id: 4, report_date: '2026-10-01', created_at: '2026-10-02T09:00:00Z', marker: 'Estradiol' }, // duplicate upload
    { id: 5, report_date: '2026-09-01', created_at: '2026-09-01T08:00:00Z', marker: 'Hematocrit' },
  ];
  const cards = cardsFn.reportCards(rows);
  const oct = cardsFn.orderCards(cards.filter((c) => c.date === '2026-10-01'), false);
  assert.equal(oct.length, 2);
  assert.deepEqual(oct[0].markers.map((m) => m.id), [1, 2, 3]);
  assert.deepEqual(oct[0].batches, ['2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.400Z', '2026-10-01T10:00:01.100Z']);
  assert.equal(oct[0].key, '2026-10-01|2026-10-01T10:00:00.000Z');
  assert.deepEqual(oct[1].markers.map((m) => m.id), [4]);
  assert.equal(cardsFn.orderCards(cards, true)[0].key, '2026-10-01|2026-10-02T09:00:00Z', 'the newest card first');
  assert.deepEqual(cardsFn.buildReport(rows, '2026-10-01|2026-10-01T10:00:00.000Z').markers.map((m) => m.id), [1, 2, 3]);
});

test('A-101d: the list, the right page keys and Delete all use the cards (Delete removes every batch of the card)', () => {
  assert.match(BODY, /const cards = useMemo\(\(\) => reportCards\(rows\), \[rows\]\);/);
  assert.match(BODY, /const reportKeys = useMemo\(\(\) => new Set\(cards\.map\(c => c\.key\)\), \[cards\]\);/);
  const i = BODY.indexOf("  function deleteReport(card)");
  assert.ok(i > 0, "deleteReport takes the card");
  const del = BODY.slice(i, BODY.indexOf("\n  }\n", i));
  assert.match(del, /for \(const c of card\.batches\) deleteBiomarkerReport\(user\.id, card\.date, c\)/);
  assert.match(del, /const count = card\.markers\.length;/);
  assert.match(BODY, /deleteReport\(reportDetail\)/);
});

// (e) Progress "Your numbers" showed 87 kg while the latest weigh-in was 84.6: the weight came only
// from the saved calculator inputs; a weigh-in edited, backfilled or synced from another phone never
// reached it. The newest weigh-in wins unless the weight was typed after it (weightAt).
test('A-101e: Your numbers adopts the newest weigh-in unless the weight was typed after it', () => {
  const { numbersWeight } = require('../lib/numbersWeight');
  const snaps = [{ date: '2026-09-29', weightKg: 87 }, { date: '2026-10-05', weightKg: 84.6 }, { date: '2026-10-06', weightKg: null }];
  assert.deepEqual(numbersWeight({ weightAt: null, snapshots: snaps }), { date: '2026-10-05', weightKg: 84.6 }, 'old payload (no stamp): the newest weigh-in');
  assert.deepEqual(numbersWeight({ weightAt: '2026-09-29', snapshots: snaps }), { date: '2026-10-05', weightKg: 84.6 });
  assert.equal(numbersWeight({ weightAt: '2026-10-05', snapshots: snaps }), null, 'typed the same day or later: kept');
  assert.equal(numbersWeight({ weightAt: '2026-10-07T10:00:00Z', snapshots: snaps }), null);
  assert.equal(numbersWeight({ weightAt: null, snapshots: [] }), null, 'no weigh-in: nothing to adopt');
  const c = read('screens/components/CalculatorSection.js');
  assert.match(c, /numbersWeight\(\{ weightAt, snapshots \}\)/);
  assert.match(c, /weightAt,/, 'the stamp is saved with the inputs');
  assert.match(c, /if \(saved\.weightAt\) setWeightAt\(saved\.weightAt\);/);
});

// (a) Curve: at +30d the "−3d" and "Now" labels overlapped (Now sits about 9% in). An end label that
// would touch "Now" is left out; "Now" always shows.
test('A-101a: an end label that would overlap "Now" is hidden; Now always shows', () => {
  const { axisLabels } = require('../lib/curveAxis');
  // plot 320 wide; "−3d" 22 wide; "Now" 30 wide; "+30d" 32 wide.
  assert.deepEqual(axisLabels({ plotW: 320, nowLeft: 15, nowW: 30, leftW: 22, rightW: 32 }), { showLeft: false, showRight: true });
  assert.deepEqual(axisLabels({ plotW: 320, nowLeft: 140, nowW: 30, leftW: 22, rightW: 32 }), { showLeft: true, showRight: true });
  assert.deepEqual(axisLabels({ plotW: 320, nowLeft: 270, nowW: 30, leftW: 22, rightW: 32 }), { showLeft: true, showRight: false });
  assert.deepEqual(axisLabels({ plotW: 320, nowLeft: 15, nowW: 0, leftW: 0, rightW: 0 }), { showLeft: true, showRight: true }, 'before measuring: everything');
  const c = read('screens/SerumCurveScreen.js');
  assert.match(c, /axisLabels\(\{ plotW: /);
  assert.match(c, /\{axisShow\.showLeft \? \(/);
  assert.match(c, /\{axisShow\.showRight \? \(/);
});
