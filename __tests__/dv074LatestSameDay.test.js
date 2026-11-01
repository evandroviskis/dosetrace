// DV-074 (parked-error sweep 2026-10-31): with two readings of one marker on the same latest date, the marker
// screen and the export took whichever SQL returned last, while the hub took the newest batch. One order now:
// the report date, then the batch (created_at) — the newest batch of the newest day is the latest.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { byReportThenBatch, markerSeries } = require('../lib/exportRecords');

test('DV-074: the same-day tie goes to the newest batch', () => {
  const rows = [
    { marker: 'TSH', report_date: '2026-10-20', value: 3.0, unit: 'mUI/L', created_at: '2026-10-21T10:00:00Z' },
    { marker: 'TSH', report_date: '2026-10-20', value: 2.0, unit: 'mUI/L', created_at: '2026-10-20T10:00:00Z' },
  ];
  assert.deepEqual(rows.slice().sort(byReportThenBatch).map((r) => r.value), [2.0, 3.0]);
  const s = markerSeries(rows, {});
  assert.equal(s[0].points[s[0].points.length - 1].value, 3.0);
  const body = fs.readFileSync(path.join(__dirname, '..', 'screens/BodyScreen.js'), 'utf8');
  assert.match(body, /const sorted = rs\.slice\(\)\.sort\(byReportThenBatch\);/);
});
