// DV-077 (parked-error sweep 2026-10-31): a report date AFTER today read from the document was accepted and became
// the latest test. A future date now falls back to today with the flag, like an unreadable one (the person is told
// and can change it).
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateExtraction } = require('../lib/bodyScan');

test('DV-077: a future report date falls back to today, flagged', () => {
  const now = new Date(2026, 9, 31, 10);
  const r = validateExtraction({ markers: [{ marker: 'TSH', value: 2.1, unit: 'mUI/L' }], report_date: '2027-03-01' }, now, 'pt');
  assert.equal(r.reportDate, '2026-10-31');
  assert.equal(r.dateFallback, true);
  const ok = validateExtraction({ markers: [], report_date: '2026-10-30' }, now, 'pt');
  assert.deepEqual([ok.reportDate, ok.dateFallback], ['2026-10-30', false]);
});
