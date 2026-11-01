// DV-087 (DL-60, AD-79 item 6; parked-error sweep 2026-10-31): deleting the account from the 18+ sheet never said
// that a store subscription keeps billing; Settings' delete does (the approved line and store link, ×6). The 18+
// delete now opens the same first sheet (Settings' deleteAccountSheet), then its own last-chance sheet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-087: the 18+ delete uses Settings\' sheet with the billing store', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/AgeConfirmScreen.js'), 'utf8');
  const fn = src.slice(src.indexOf('async function askDelete() {'), src.indexOf('function askDeleteFinal() {'));
  assert.match(fn, /try \{ store = await getBillingStore\(\); \} catch \{ store = null; \}/);
  assert.match(fn, /setSheet\(\{ icon: 'warning', \.\.\.deleteAccountSheet\(\{ t, store, platform: Platform\.OS, onConfirm: askDeleteFinal, openUrl: \(u\) => Linking\.openURL\(u\) \}\) \}\);/);
  const settings = fs.readFileSync(path.join(__dirname, '..', 'screens/SettingsScreen.js'), 'utf8');
  assert.match(settings, /export function deleteAccountSheet\(/);
});
