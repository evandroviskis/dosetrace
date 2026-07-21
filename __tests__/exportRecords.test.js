'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { csvEscape, buildRecordsCSV, buildRecordsHTML } = require('../lib/exportRecords');

const labels = {
  labsHeading: 'Lab results', vaccinesHeading: 'Vaccines',
  colDate: 'Date', colMarker: 'Marker', colValue: 'Value', colUnit: 'Unit',
  colVaccine: 'Vaccine', colGiven: 'Date given', colNextDue: 'Next due', colNotes: 'Notes',
  noLabs: 'No lab results', noVaccines: 'No vaccines',
};

test('csvEscape quotes fields with commas, quotes, or newlines', () => {
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape('line\nbreak'), '"line\nbreak"');
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(800), '800');
});

test('buildRecordsCSV lays out labs then vaccines, newest first', () => {
  const csv = buildRecordsCSV({
    biomarkers: [
      { report_date: '2024-01-01', marker: 'TT', value: 700, unit: 'ng/dL' },
      { report_date: '2024-06-01', marker: 'TT', value: 800, unit: 'ng/dL' },
    ],
    vaccines: [{ name: 'Tetanus', date_given: '2024-05-01', next_due: '2034-05-01', notes: 'left, arm' }],
  }, labels);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'Lab results');
  assert.equal(lines[1], 'Date,Marker,Value,Unit');
  // newest lab first
  assert.equal(lines[2], '2024-06-01,TT,800,ng/dL');
  assert.equal(lines[3], '2024-01-01,TT,700,ng/dL');
  // vaccines section present, comma-bearing note quoted
  assert.ok(csv.includes('Vaccines'));
  assert.ok(csv.includes('"left, arm"'));
});

test('buildRecordsHTML escapes values and groups labs by date', () => {
  const html = buildRecordsHTML({
    biomarkers: [{ report_date: '2024-06-01', marker: 'A & B', value: 1, unit: 'x' }],
    vaccines: [],
  }, { labels, title: 'Records', exportedOn: 'Exported 2024', disclaimer: 'user-entered' });
  assert.ok(html.includes('A &amp; B'), 'HTML-escapes the marker');
  assert.ok(html.includes('<h3>2024-06-01</h3>'));
  assert.ok(html.includes('No vaccines'), 'empty vaccines message');
});
