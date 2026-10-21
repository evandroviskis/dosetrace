'use strict';
// DV-226 (S1, AD-01 "every delete asks first"): in the food chat, the "Remove entry" pill under a
// refused message (diet-advice deflect) or a too-old message (more than 7 days back) deleted the
// row — the user's typed text — with no confirmation, while the same screen's bubble tap asks.
// Fix: both pills open the DoseTrace sheet (Cancel · red Remove entry) and the row is deleted only
// by the sheet's Remove entry. Runs the chat's REAL handlers over the REAL lib/database.js on an
// in-memory SQLite (the sync harness).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/syncHarness');
const { loadFn, read } = require('./helpers/extractFn');

const CHAT = 'screens/FoodChatScreen.js';
const USER = 'u1';
const t = (k) => k;

function phone(parseStatus) {
  const db = makeDb();
  const fromDb = (name) => loadFn('lib/database.js', `export function ${name}(`, name, { getDB: () => db });
  const id = fromDb('insertFoodLog')({ user_id: USER, entry_date: '2026-10-20', raw_text: 'what should I eat to cut?', parse_status: parseStatus });
  return { id, deleteFoodLog: fromDb('deleteFoodLog'), status: () => db.getFirstSync('SELECT sync_status FROM food_logs WHERE id = ?', [id]).sync_status };
}

// The chat's real removeRow and its asking wrapper; alert = the chat's DoseTrace-sheet helper.
function chat(p) {
  const out = { alerts: [], syncs: 0, refreshes: 0 };
  const deps = {
    t, userId: USER,
    deleteFoodLog: p.deleteFoodLog,
    requestSync: () => { out.syncs++; },
    refresh: () => { out.refreshes++; },
    alert: (title, msg, buttons) => { out.alerts.push({ title, msg, buttons }); },
  };
  deps.removeRow = loadFn(CHAT, 'function removeRow(', 'removeRow', deps);
  out.removeRow = deps.removeRow;
  if (read(CHAT).includes('function confirmRemoveRow(')) out.ask = loadFn(CHAT, 'function confirmRemoveRow(', 'confirmRemoveRow', deps);
  return out;
}

// What a pill's onPress runs, read from the screen (the pill under the refused / too-old row).
function pillHandler(kind) {
  const src = read(CHAT);
  const start = src.indexOf(`case '${kind}':`);
  const block = src.slice(start, src.indexOf('case ', start + 10));
  const m = block.match(/<Pill label=\{t\('nutri_delete_entry'\)\} onPress=\{\(\) => (\w+)\(x\.rowId\)\} \/>/);
  assert.ok(m, `${kind}: the Remove entry pill is there`);
  return m[1];
}

for (const [kind, status] of [['refused', 'refused'], ['too_old', 'too_old']]) {
  test(`DV-226: the ${kind} row's Remove entry pill asks first; the text is deleted only by the sheet's Remove entry`, () => {
    const p = phone(status);
    const c = chat(p);
    const name = pillHandler(kind);
    const fn = name === 'removeRow' ? c.removeRow : name === 'confirmRemoveRow' ? c.ask : null;
    assert.ok(fn, `the pill calls a known handler (${name})`);
    fn(p.id);
    assert.equal(p.status(), 'pending', 'nothing is deleted before the sheet is answered');
    assert.equal(c.alerts.length, 1, 'the DoseTrace sheet opens');
    const { title, buttons } = c.alerts[0];
    assert.equal(title, 'nutri_delete_confirm');
    assert.deepEqual(buttons.map((b) => [b.text, b.style]), [['cancel', 'cancel'], ['nutri_delete_entry', 'destructive']], 'Cancel first, Remove entry in the risk colour');
    if (buttons[0].onPress) buttons[0].onPress();
    assert.equal(p.status(), 'pending', 'Cancel keeps the typed text');
    buttons[1].onPress();
    assert.equal(p.status(), 'deleted', 'the sheet\'s Remove entry deletes it (a synced tombstone)');
    assert.equal(c.syncs, 1);
    assert.equal(c.refreshes, 1);
  });
}

test('DV-226: no tap in the chat deletes a row without the sheet (removeRow is reached only from the sheet)', () => {
  const src = read(CHAT);
  assert.equal((src.match(/removeRow\(x\.rowId\)/g) || []).length, 0);
  assert.equal((src.match(/onPress: \(\) => removeRow\(rowId\)/g) || []).length, 1);
});
