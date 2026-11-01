// DV-086 (DL-42; parked-error sweep 2026-10-31): Settings' "Download my data" exported an empty file on a phone
// whose local database had not been filled yet (only the 18+ sheet imported first). The import-if-empty now lives
// in the one export function, so both entry points get the account's records.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-086: exportMyData imports first when the phone holds nothing; no caller does it on its own', () => {
  const lib = fs.readFileSync(path.join(__dirname, '..', 'lib/accountActions.js'), 'utf8');
  const fn = lib.slice(lib.indexOf('export async function exportMyData('), lib.indexOf('export async function exportMyData(') + 500);
  assert.match(fn, /if \(isLocalDBEmpty\(user\.id\)\) await fullImportFromCloud\(\)\.catch\(\(\) => \{\}\);/);
  assert.ok(fn.indexOf('fullImportFromCloud') < fn.indexOf('getAllDataForExport('), 'before the read');
  const age = fs.readFileSync(path.join(__dirname, '..', 'screens/AgeConfirmScreen.js'), 'utf8');
  assert.doesNotMatch(age, /fullImportFromCloud\(\)/);
});
