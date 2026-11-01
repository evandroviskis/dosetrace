// DV-078 (AD-23: failed extractions are not counted) and DV-109 (DL-41: the vaccine scan fills the detail
// fields; transcription only) — parked-error sweep 2026-10-31.
// DV-078: a scan that came back 200 with nothing usable (no markers, every marker without a name or a result,
// no vaccine with a name and a date, a vial label with every field empty) used one of the monthly scans.
// The server now checks usability with the client's own rule (lib/bodyScan) and gives the reservation back.
// (No client "release" call: a release the client could send at will would make scans free.)
// DV-109: the vaccine prompt asks for manufacturer, batch_lot, dose_number, provider and location.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Q = require('../supabase/functions/extract-bloodwork/quota.ts');

test('DV-078: only a scan with something usable counts', () => {
  assert.equal(Q.scanUsable('bloodwork', { markers: [] }), false);
  assert.equal(Q.scanUsable('bloodwork', { markers: [{ marker: '', value: 5 }, { marker: 'TSH', value: null }, { marker: 'LDL', value: '  ' }] }), false);
  assert.equal(Q.scanUsable('bloodwork', { markers: [{ marker: 'TSH', value: 2.1 }] }), true);
  assert.equal(Q.scanUsable('bloodwork', { markers: [{ marker: 'HIV', value: 'Negative' }] }), true, 'a result in words (A-203)');
  assert.equal(Q.scanUsable('vaccines', { vaccines: [{ name: 'Tetanus', date_given: 'unknown' }] }), false);
  assert.equal(Q.scanUsable('vaccines', { vaccines: [{ name: 'Tetanus', date_given: '2024-03-02' }] }), true);
  assert.equal(Q.scanUsable('vial', { vial: { compound_name: null, form: null, amount: null, concentration: null, volume_ml: null } }), false);
  assert.equal(Q.scanUsable('vial', { vial: { compound_name: 'BPC-157', amount: null } }), true);
  const idx = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/extract-bloodwork/index.ts'), 'utf8');
  assert.match(idx, /return \{ ok: response\.status === 200 && usable, response \};/);
});

test('DV-109: the vaccine prompt transcribes the five detail fields', () => {
  const idx = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/extract-bloodwork/index.ts'), 'utf8');
  const prompt = idx.slice(idx.indexOf('const VACCINE_PROMPT'), idx.indexOf('`;', idx.indexOf('const VACCINE_PROMPT')));
  for (const f of ['manufacturer', 'batch_lot', 'dose_number', 'provider', 'location']) assert.match(prompt, new RegExp(`"${f}"`), f);
  assert.match(prompt, /never a person's name/);
});
