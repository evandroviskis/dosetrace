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
  assert.equal((b.match(/t\(pluralKey\('blood_markers', /g) || []).length, 3);
});

// (d) Lab "By date" repeated one date per marker for markers typed one at a time (each typed marker
// is its own insert batch). One lab test = one card; a second upload that REPEATS a marker of that
// date stays its own card, so a duplicate upload can still be deleted alone.
const BODY = read('screens/BodyScreen.js');
const { parse } = require('@babel/parser');
const fnSrc = (src, name) => {
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const n = ast.program.body.find((x) => x.type === 'FunctionDeclaration' && x.id.name === name);
  assert.ok(n, `${name} exists`);
  return src.slice(n.start, n.end);
};
const cardsFn = new Function(`${fnSrc(BODY, 'reportCards')}\n${fnSrc(BODY, 'newestReportKey')}\n${fnSrc(BODY, 'buildReport')}\nreturn { reportCards, newestReportKey, buildReport };`)();

test('A-101d: markers typed one at a time on the same date are ONE lab card; a repeated marker is a second card', () => {
  const rows = [
    { id: 1, report_date: '2026-10-01', created_at: '2026-10-01T10:00:00Z', marker: 'Testosterone' },
    { id: 2, report_date: '2026-10-01', created_at: '2026-10-01T10:01:00Z', marker: 'Estradiol' },
    { id: 3, report_date: '2026-10-01', created_at: '2026-10-01T10:02:00Z', marker: 'Hematocrit' },
    { id: 4, report_date: '2026-10-01', created_at: '2026-10-02T09:00:00Z', marker: 'Estradiol' }, // duplicate upload
    { id: 5, report_date: '2026-09-01', created_at: '2026-09-01T08:00:00Z', marker: 'Hematocrit' },
  ];
  const cards = cardsFn.reportCards(rows);
  const oct = cards.filter((c) => c.date === '2026-10-01');
  assert.equal(oct.length, 2);
  assert.deepEqual(oct[0].markers.map((m) => m.id), [1, 2, 3]);
  assert.deepEqual(oct[0].batches, ['2026-10-01T10:00:00Z', '2026-10-01T10:01:00Z', '2026-10-01T10:02:00Z']);
  assert.equal(oct[0].key, '2026-10-01|2026-10-01T10:00:00Z');
  assert.deepEqual(oct[1].markers.map((m) => m.id), [4]);
  assert.equal(cardsFn.newestReportKey(rows), '2026-10-01|2026-10-02T09:00:00Z');
  assert.deepEqual(cardsFn.buildReport(rows, '2026-10-01|2026-10-01T10:00:00Z').markers.map((m) => m.id), [1, 2, 3]);
});

test('A-101d: the list, the right page keys and Delete all use the cards (Delete removes every batch of the card)', () => {
  assert.match(BODY, /const reportKeys = useMemo\(\(\) => new Set\(reportCards\(rows\)\.map\(c => c\.key\)\), \[rows\]\)/);
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
