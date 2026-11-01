// DV-079 (parked-error sweep 2026-10-31): the CSV and PDF exports left out a vaccine's manufacturer, lot, dose
// number, provider and location — data the person typed. Both exports carry them now, with the form's own labels.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildRecordsCSV: buildCsv, buildRecordsHTML: buildHtml } = require('../lib/exportRecords');

const labels = { labsHeading: 'Labs', vaccinesHeading: 'Vaccines', colDate: 'Date', colMarker: 'Marker', colValue: 'Value', colUnit: 'Unit',
  colVaccine: 'Vaccine', colGiven: 'Given', colNextDue: 'Next', colNotes: 'Notes', colManufacturer: 'Manufacturer', colDose: 'Dose',
  colLot: 'Lot', colProvider: 'Provider', colLocation: 'Location', noLabs: '-', noVaccines: '-' };
const data = { biomarkers: [], vaccines: [{ id: 1, name: 'Hep B', date_given: '2026-10-01', next_due: null, notes: '', manufacturer: 'GSK', batch_lot: 'L123', dose_number: 2, provider: 'Dr. Lima', location: 'UBS Centro' }] };

test('DV-079: CSV and PDF carry the five vaccine fields', () => {
  const csv = buildCsv(data, { labels });
  for (const v of ['Manufacturer', 'Lot', 'Provider', 'Location', 'GSK', 'L123', 'Dr. Lima', 'UBS Centro']) assert.ok(csv.includes(v), v);
  const html = buildHtml(data, { labels, title: 't', exportedOn: 'x', disclaimer: 'd' });
  for (const v of ['GSK', 'L123', 'Dr. Lima', 'UBS Centro']) assert.ok(html.includes(v), v);
  const body = fs.readFileSync(path.join(__dirname, '..', 'screens/BodyScreen.js'), 'utf8');
  assert.match(body, /colManufacturer: t\('vax_manufacturer'\), colDose: t\('vax_dose_number'\), colLot: t\('vax_batch_lot'\), colProvider: t\('vax_provider'\), colLocation: t\('vax_location'\),/);
});
