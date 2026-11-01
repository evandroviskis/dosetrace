// DV-076 (founder 2026-10-31 "Concordo com as duas"): a scanned lab value written as text is read by the app
// language like a typed one — pt "1,025" (urine density) = 1.025, never 1025. Supersedes A-26's thousands rule
// for scans. English keeps "1,025" = 1025.
const test = require('node:test');
const assert = require('node:assert/strict');
const { scanResult } = require('../lib/labValue');

test('DV-076: a scanned text value follows the app language', () => {
  assert.equal(scanResult({ value: '1,025' }, 'pt').value, 1.025);
  assert.equal(scanResult({ value: '5,5' }, 'pt').value, 5.5);
  assert.equal(scanResult({ value: '1.250' }, 'pt').value, 1250);
  assert.equal(scanResult({ value: '1,025' }, 'en').value, 1025);
  assert.equal(scanResult({ value: 1.025 }, 'pt').value, 1.025, 'a number stays a number');
});
