'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { csvEscape, buildRecordsCSV, buildRecordsHTML, markerSeries, canonicalMarker } = require('../lib/exportRecords');

const labels = {
  labsHeading: 'Lab results', vaccinesHeading: 'Vaccines',
  colDate: 'Date', colMarker: 'Marker', colValue: 'Value', colUnit: 'Unit',
  colVaccine: 'Vaccine', colGiven: 'Date given', colNextDue: 'Next due', colNotes: 'Notes',
  noLabs: 'No lab results', noVaccines: 'No vaccines',
};

const DATA = {
  biomarkers: [
    { id: 1, report_date: '2024-01-01', marker: 'Testosterone, Total', value: 700, unit: 'ng/dL' },
    { id: 2, report_date: '2024-06-01', marker: 'Total Testosterone', value: 800, unit: 'ng/dL' },
    { id: 3, report_date: '2024-06-01', marker: 'Vitamin D', value: 41, unit: 'ng/mL' },
  ],
  vaccines: [
    { id: 10, name: 'Tetanus', date_given: '2024-05-01', next_due: '2034-05-01', notes: 'left, arm' },
    { id: 11, name: 'Influenza', date_given: '2024-10-01', next_due: null, notes: '' },
  ],
};

test('csvEscape quotes fields with commas/quotes/newlines', () => {
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape(null), '');
});

test('markerSeries merges naming variants into one series', () => {
  const s = markerSeries(DATA.biomarkers);
  // "Testosterone, Total" and "Total Testosterone" collapse to one series of 2 points
  const tt = s.find(x => x.key === canonicalMarker('Testosterone, Total'));
  assert.ok(tt, 'testosterone series exists');
  assert.equal(tt.points.length, 2);
  assert.deepEqual(tt.points.map(p => p.value), [700, 800]); // oldest → newest
});

test('buildRecordsCSV is by-marker and honors a marker selection', () => {
  const sel = new Set([canonicalMarker('Vitamin D')]);
  const csv = buildRecordsCSV(DATA, { labels, selectedMarkers: sel });
  assert.ok(csv.includes('Marker,Date,Value,Unit'));
  assert.ok(csv.includes('Vitamin D,2024-06-01,41,ng/mL'));
  assert.ok(!csv.includes('Testosterone'), 'unselected marker excluded');
});

test('buildRecordsCSV honors a vaccine selection', () => {
  const csv = buildRecordsCSV(DATA, { labels, selectedVaccineIds: new Set([10]) });
  assert.ok(csv.includes('"left, arm"'), 'selected vaccine present, comma-quoted');
  assert.ok(!csv.includes('Influenza'), 'unselected vaccine excluded');
});

test('buildRecordsHTML draws a curve for a multi-point marker and honors selection', () => {
  const html = buildRecordsHTML(DATA, {
    labels, title: 'Records', exportedOn: 'Exported', disclaimer: 'user-entered',
    selectedMarkers: new Set([canonicalMarker('Testosterone, Total')]),
    selectedVaccineIds: new Set(),
    formatDate: d => `D:${d}`,
  });
  assert.ok(html.includes('<svg'), 'SVG curve for the 2-point testosterone series');
  assert.ok(html.includes('<polyline'), 'trend polyline present');
  assert.ok(html.includes('D:2024-06-01'), 'dates formatted via formatDate');
  assert.ok(!html.includes('Vitamin D'), 'unselected marker excluded');
  assert.ok(html.includes('No vaccines'), 'empty vaccine selection shows none');
});
