'use strict';
// DV-003 (S1, AD-01 "every delete asks first"): the food entry editor ("Fix this entry") deleted
// the meal without asking — "Remove entry" and a Save after every item was removed both called
// deleteFoodLog at once. One mis-tap lost a meal and could break the reality check's 7-day run.
// Fix: both open the DoseTrace sheet (Cancel · red Remove entry) and nothing is deleted until the
// sheet's Remove entry is tapped. Runs the editor's REAL save / remove handlers over the REAL
// lib/database.js food-log functions on an in-memory SQLite (the sync harness).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/syncHarness');
const { loadFn, read, sliceBlock } = require('./helpers/extractFn');
const { safeItems } = require('../lib/foodThread');
const { editedItems } = require('../lib/nutrition');

const EDITOR = 'screens/components/FoodEntryEditor.js';
const USER = 'u1';
const t = (k) => k;

function phone() {
  const db = makeDb();
  const fromDb = (name) => loadFn('lib/database.js', `export function ${name}(`, name, { getDB: () => db });
  const insertFoodLog = fromDb('insertFoodLog');
  const id = insertFoodLog({
    user_id: USER, entry_date: '2026-10-20', raw_text: '2 eggs and toast',
    parsed_items: JSON.stringify([{ food: 'eggs', kcal: 140, carb_g: 1, protein_g: 12 }, { food: 'toast', kcal: 90, carb_g: 15, protein_g: 3 }]),
    kcal: 230, carb_g: 16, protein_g: 15, parse_status: 'done',
  });
  const row = fromDb('getFoodLogById')(id);
  return { db, id, row, deleteFoodLog: fromDb('deleteFoodLog'), updateFoodLog: fromDb('updateFoodLog'), status: () => db.getFirstSync('SELECT sync_status FROM food_logs WHERE id = ?', [id]).sync_status };
}

// The editor's real handlers, with its state (items, date) and the sheet setter as the test's.
function editor(p, items) {
  const out = { sheet: null, done: 0 };
  const deps = {
    row: p.row, items, date: p.row.entry_date, t,
    safeItems, editedItems,
    deleteFoodLog: p.deleteFoodLog, updateFoodLog: p.updateFoodLog,
    done: () => { out.done++; },
    setAskSheet: (v) => { out.sheet = v; },
  };
  const src = read(EDITOR);
  if (src.includes('function confirmRemoveEntry(')) deps.confirmRemoveEntry = loadFn(EDITOR, 'function confirmRemoveEntry(', 'confirmRemoveEntry', deps);
  out.save = loadFn(EDITOR, 'function save(', 'save', deps);
  out.remove = loadFn(EDITOR, 'function remove(', 'remove', deps);
  return out;
}

function assertAsksFirst(p, ed) {
  assert.equal(p.status(), 'pending', 'nothing is deleted before the sheet is answered');
  assert.equal(ed.done, 0, 'the editor stays open');
  assert.ok(ed.sheet, 'the DoseTrace sheet opens');
  assert.equal(ed.sheet.title, 'nutri_delete_confirm');
  const [cancel, del] = ed.sheet.buttons;
  assert.deepEqual([cancel.label, cancel.kind], ['cancel', 'secondary'], 'Cancel first');
  assert.deepEqual([del.label, del.kind], ['nutri_delete_entry', 'danger'], 'Remove entry in the risk colour');
  if (cancel.onPress) cancel.onPress();
  assert.equal(p.status(), 'pending', 'Cancel keeps the meal');
  del.onPress();
  assert.equal(p.status(), 'deleted', "the sheet's Remove entry deletes it (a synced tombstone)");
  assert.equal(ed.done, 1, 'then the editor closes');
}

test('DV-003: "Remove entry" asks first; the meal is deleted only by the sheet\'s Remove entry', () => {
  const p = phone();
  const items = safeItems(p.row.parsed_items).map((it, i) => ({ ...it, __orig: i }));
  const ed = editor(p, items);
  ed.remove();
  assertAsksFirst(p, ed);
});

test('DV-003: Save after every item was removed asks first; the meal is deleted only by the sheet\'s Remove entry', () => {
  const p = phone();
  const ed = editor(p, []); // × tapped on every item
  ed.save();
  assertAsksFirst(p, ed);
});

test('DV-003: Save with items left still saves at once (no sheet)', () => {
  const p = phone();
  const items = safeItems(p.row.parsed_items).map((it, i) => ({ ...it, __orig: i })).slice(0, 1);
  const ed = editor(p, items);
  ed.save();
  assert.equal(ed.sheet, null);
  assert.equal(ed.done, 1);
  const row = p.db.getFirstSync('SELECT kcal, sync_status FROM food_logs WHERE id = ?', [p.id]);
  assert.deepEqual([row.kcal, row.sync_status], [140, 'pending']);
});

test('DV-003: the ask sheet is drawn inside the editor\'s own Modal (it shows over the editor)', () => {
  const src = read(EDITOR);
  assert.match(src, /import \{ DTSheet \} from '\.\/ProtocolParts';/);
  const tail = src.slice(src.lastIndexOf('</KeyboardAvoidingView>'), src.indexOf('</Modal>'));
  assert.match(tail, /<DTSheet config=\{askSheet\} onClose=\{\(\) => setAskSheet\(null\)\} \/>/);
  // No path deletes without the sheet: deleteFoodLog is called only from the sheet's button.
  const body = sliceBlock(src, 'export default function FoodEntryEditor(');
  assert.equal((body.match(/deleteFoodLog\(/g) || []).length, 1);
  assert.match(sliceBlock(src, 'function confirmRemoveEntry('), /kind: 'danger', onPress: \(\) => \{ deleteFoodLog\(row\.id\); done\(\); \}/);
});
