// DV-238 (parked-error sweep 2026-10-31): on the open Fold, the Journey food hero (left page) kept its old line
// after a meal was sent from the chat (right page): the hero reloads on data_changed, but the chat never sent
// one. Every chat write now announces food_logs (not the plain opening of the chat).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-238: the chat announces its writes; the opening does not', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/FoodChatScreen.js'), 'utf8');
  const fn = src.slice(src.indexOf('  function refresh(uid, announce = true) {'), src.indexOf('  useFocusEffect(useCallback(() => { load(); }, []));'));
  assert.match(fn, /if \(announce\) notifyDataChanged\('food_logs'\);/);
  const load = src.slice(src.indexOf('  async function load() {'), src.indexOf('  async function load() {') + 1600);
  assert.match(load, /const r = refresh\(uid, false\);/);
  const hero = fs.readFileSync(path.join(__dirname, '..', 'screens/components/FoodLogHero.js'), 'utf8');
  assert.match(hero, /e\.type !== 'data_changed'/);
});
