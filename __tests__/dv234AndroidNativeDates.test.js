// DV-234 (decisions.md 2026-10-02: "DTWheel replaces the native iOS spinner (start date, dose time, curve
// date, target, backfill). Android keeps its native dialogs"; parked-error sweep 2026-10-31): the curve's
// Other date, the past weigh-in date and the target date opened the DTWheel sheet on Android too. On
// Android they open the system date dialog (ProtocolParts AndroidDateDialog), with the same bounds.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('DV-234: AndroidDateDialog opens the native dialog and hands back a local ISO day', () => {
  const src = read('screens/components/ProtocolParts.js');
  assert.match(src, /import DateTimePicker from '@react-native-community\/datetimepicker';/);
  assert.match(src, /export function AndroidDateDialog\(\{ visible, iso, minISO, maxISO, onPick, onClose \}\)/);
  assert.match(src, /mode="date"\s+display="default"/);
  assert.match(src, /if \(event\.type === 'dismissed' \|\| !d\) return;\s*onPick\(localISO\(d\)\);/);
});

test('DV-234: the curve date, past weigh-in and target date use it on Android', () => {
  const curve = read('screens/SerumCurveScreen.js');
  assert.match(curve, /Platform\.OS === 'android' \? \(\s*<AndroidDateDialog visible=\{showReadoutPicker\} iso=\{readoutISO\} minISO=\{oldestReadout\}/);
  const calc = read('screens/components/CalculatorSection.js');
  assert.match(calc, /Platform\.OS === 'android' \? \(\s*<AndroidDateDialog visible=\{showBfDatePicker\} iso=\{bfDate\} maxISO=\{todayISO\(\)\}/);
  assert.match(calc, /Platform\.OS === 'android' \? \(\s*<AndroidDateDialog visible=\{showTgtDatePicker\} iso=\{tgtDate \|\| todayISO\(\)\} minISO=\{todayISO\(\)\}/);
  // iPhone keeps the wheel sheets.
  assert.match(curve, /<DTPickerSheet visible=\{showReadoutPicker\}/);
  assert.match(calc, /<DTPickerSheet visible=\{showBfDatePicker\}/);
  assert.match(calc, /<DTPickerSheet visible=\{showTgtDatePicker\}/);
});
