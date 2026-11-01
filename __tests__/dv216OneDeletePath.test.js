// DV-216 (parked-error sweep 2026-10-31): the trash on an Ended row deleted without dismissing delivered
// banners, deactivating vials or logging the event, unlike the protocol page's delete. One delete path now.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-216: the Ended row trash goes through deleteProtocol', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/ProtocolsScreen.js'), 'utf8');
  const ended = src.slice(src.indexOf('function deleteEndedProtocol(p) {'), src.indexOf('function deleteEndedProtocol(p) {') + 300);
  assert.match(ended, /deleteProtocol\(p\.id, p\);/);
  assert.equal(src.split('softDeleteProtocol(').length - 1, 1, 'one place deletes');
  const del = src.slice(src.indexOf('async function deleteProtocol(id, known = null) {'), src.indexOf('async function deleteProtocol(id, known = null) {') + 1200);
  assert.match(del, /const target = known \|\| protocols\.find\(p => p\.id === id\);/);
  assert.match(del, /deactivateVialsByProtocol\(id\);/);
  assert.match(del, /dismissDeliveredDoseReminders\(id\)/);
});
