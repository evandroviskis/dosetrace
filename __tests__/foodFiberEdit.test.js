'use strict';
// Fiber on "Corrigir este registro" (founder 2026-11-24: option A of docs/design/comida-fibra-corrigir.html).
// The fix screen's numbers become a 2x2 grid — kcal | carboidratos, then proteína | fibra. Fiber is shown as
// stored with one decimal in the app language ("7,5" pt, "7.5" en), read back with parseDecimal(v, language);
// empty / erased = no fiber (null, a faded "—"), never a made-up 0; a typed 0 is 0. Editing kcal / carbs /
// protein never touches fiber; changing fiber makes the item the user's (FL-9) and drops a pending question
// (FL-28). Totals recompute from the items. Checklist docs/specs/food-fiber-week.md (FW-12..FW-16).
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers/extractFn');
const { editedItems, fiberFieldText, itemsFiber } = require('../lib/nutrition');
const { buildThread, dayFoodTotal, weekSummary } = require('../lib/foodThread');
const { translations: T } = require('../i18n/translations');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const TODAY = '2026-11-24';
const orig = [
  { food: 'Aveia com banana', kcal: 320, carb_g: 54, protein_g: 11, fiber_g: 7.5, confidence: 'medium', ask: 'Quanto?', ask_pending: { a: 1 } },
  { food: 'Café com leite', kcal: 60, carb_g: 6, protein_g: 3, fiber_g: 0, confidence: 'high' },
  { food: 'Arroz com feijão', kcal: 410, carb_g: 72, protein_g: 14, confidence: 'medium' }, // read before fiber existed
];
const copy = () => orig.map((it, i) => ({ ...it, __orig: i }));
const edit = (i, patch, lang = 'pt') => {
  const items = copy();
  items[i] = { ...items[i], ...patch };
  return editedItems(orig, items, lang);
};

test('FW-12: the fix screen prefills fiber with one decimal in the app language; no fiber = empty', () => {
  assert.equal(fiberFieldText(7.5, 'pt'), '7,5');
  assert.equal(fiberFieldText(7.5, 'en'), '7.5');
  assert.equal(fiberFieldText(7.46, 'de'), '7,5', 'one decimal');
  assert.equal(fiberFieldText(12, 'pt'), '12');
  assert.equal(fiberFieldText(0, 'pt'), '0', 'a real 0 shows 0');
  assert.equal(fiberFieldText(null, 'pt'), '', 'no fiber: empty (the placeholder dash shows)');
  assert.equal(fiberFieldText(undefined, 'en'), '');
  assert.equal(fiberFieldText('7,', 'pt'), '7,', 'what the person is typing stays as typed');
  assert.equal(fiberFieldText('', 'pt'), '');
});

test('FW-13: fiber is read in the app language; erased = null, typed 0 = 0, untouched keeps the stored number', () => {
  assert.equal(edit(0, { fiber_g: '9,5' }, 'pt')[0].fiber_g, 9.5, 'pt comma decimal');
  assert.equal(edit(0, { fiber_g: '9.5' }, 'en')[0].fiber_g, 9.5, 'en dot decimal');
  assert.equal(edit(0, { fiber_g: '9,5' }, 'en')[0].fiber_g, 9.5, 'en: a lone comma with one digit is still a decimal');
  // FW-17: the decimal key the keyboard shows follows the device, not the app language (iPhone en-US shows
  // "." with the app in pt); either key is read as the decimal in every language.
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.equal(edit(0, { fiber_g: '9.5' }, l)[0].fiber_g, 9.5, `${l} dot`);
    assert.equal(edit(0, { fiber_g: '9,5' }, l)[0].fiber_g, 9.5, `${l} comma`);
  }
  assert.equal(edit(0, { fiber_g: '' })[0].fiber_g, null, 'erased: no fiber, never 0');
  assert.equal(edit(0, { fiber_g: '  ' })[0].fiber_g, null);
  assert.equal(edit(0, { fiber_g: '0' })[0].fiber_g, 0, 'typed 0 is 0');
  assert.equal(edit(2, { fiber_g: '4,2' })[2].fiber_g, 4.2, 'an old item gains fiber when typed');
  assert.equal(edit(0, { fiber_g: '3,25' })[0].fiber_g, 3.3, 'one decimal, as shown');
  const untouched = editedItems(orig, copy(), 'pt');
  assert.equal(untouched[0].fiber_g, 7.5);
  assert.equal(untouched[1].fiber_g, 0);
  assert.equal(untouched[2].fiber_g, undefined, 'an item without fiber stays without it (no invented 0)');
  assert.equal(itemsFiber([untouched[2]]), null);
  assert.equal(edit(0, { fiber_g: '1,2,3' })[0].fiber_g, 7.5, 'unreadable text keeps the stored number');
});

test('FW-13: editing kcal, carbs or protein never changes fiber', () => {
  const ed = edit(0, { kcal: '640', carb_g: '108', protein_g: '22' });
  assert.equal(ed[0].kcal, 640);
  assert.equal(ed[0].fiber_g, 7.5, 'nothing is rescaled behind the person');
  assert.equal(edit(2, { kcal: '500' })[2].fiber_g, undefined, 'unknown stays unknown');
});

test('FW-14: changing fiber makes the item the user\'s and drops its pending question; the same fiber does not', () => {
  const ch = edit(0, { fiber_g: '9' })[0];
  assert.equal(ch.confidence, 'user');
  assert.equal(ch.ask_skipped, true, 'the open question is closed');
  assert.equal(ch.ask_pending, undefined, 'the offline answer is dropped');
  const cleared = edit(1, { fiber_g: '' })[1];
  assert.equal(cleared.confidence, 'user', 'erasing a known fiber is a change');
  const added = edit(2, { fiber_g: '3' })[2];
  assert.equal(added.confidence, 'user', 'adding fiber to an old item is a change');
  const same = edit(0, { fiber_g: '7,5' })[0];
  assert.equal(same.confidence, 'medium', 'the same number typed again is no change');
  assert.equal(edit(2, { fiber_g: '' })[2].confidence, 'medium', 'an empty field on an item without fiber is no change');
  assert.equal(editedItems(orig, copy(), 'pt')[0].confidence, 'medium');
});

test('FW-15: the entry card, the day total and the week average recompute from the saved items', () => {
  const saved = edit(0, { fiber_g: '7,5' }, 'pt').slice(0, 2); // oats 7.5 + coffee 0
  const row = (items, id) => ({ id, user_id: 'u1', entry_date: TODAY, kcal: 380, protein_g: 14, carb_g: 60, parse_status: 'done', source: 'ai', raw_text: 'x', parsed_items: JSON.stringify(items), created_at: TODAY + 'T12:00:00Z' });
  const th = buildThread([row(saved, 1)], { todayISO: TODAY, sinceISO: TODAY });
  assert.equal(th.find((x) => x.type === 'entry').fiber_g, 7.5);
  assert.equal(dayFoodTotal([row(saved, 1)], TODAY).fiber_g, 7.5);
  assert.equal(Math.round(7.5), 8, 'the chat shows whole grams as today: "8 g fibra"');
  const raised = edit(0, { fiber_g: '10' }, 'pt').slice(0, 2);
  assert.equal(weekSummary([row(raised, 1)], TODAY).avgFiber, 10, 'the week uses the new number');
  const erased = editedItems(orig, copy().slice(0, 2).map((it) => ({ ...it, fiber_g: '' })), 'pt');
  assert.equal(itemsFiber(erased), null, 'all fiber erased: the entry has no fiber, never "0 g"');
  assert.equal(dayFoodTotal([row(erased, 1)], TODAY).fiber_g, null);
  const removed = editedItems(orig, copy().slice(1, 2), 'pt'); // the oats removed
  assert.equal(itemsFiber(removed), 0, 'a removed item takes its fiber out of the totals');
});

test('FW-12: the fix screen is a 2x2 grid — kcal | carbs, then protein | fiber — with a decimal keyboard only for fiber', () => {
  const src = read('screens/components/FoodEntryEditor.js');
  const grid = src.slice(src.indexOf('<View style={s.fields}>'), src.indexOf('<TouchableOpacity style={s.danger}'));
  const order = ["label={t('cal_kcal')}", "label={t('nutri_carbs')}", "label={t('nutri_protein')}", "label={t('nutri_fiber')}"].map((k) => grid.indexOf(k));
  assert.ok(order.every((x) => x > 0), 'four fields');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'kcal, carbs, protein, fiber');
  assert.equal((grid.match(/<View style=\{s\.fieldRow\}>/g) || []).length, 2, 'two rows');
  const rowTwo = grid.slice(grid.lastIndexOf('<View style={s.fieldRow}>'));
  assert.ok(rowTwo.includes("t('nutri_protein')") && rowTwo.includes("t('nutri_fiber')") && !rowTwo.includes("t('nutri_carbs')"), 'protein and fiber share the second row');
  assert.match(grid, /<EditNum [^>]*label=\{t\('nutri_fiber'\)\} value=\{fiberFieldText\(it\.fiber_g, language\)\} onChange=\{\(v\) => setField\(i, 'fiber_g', v\)\} decimal placeholder="—" onFocus=\{lift\.liftField\} \/>/);
  assert.match(src, /fields: \{ gap: 10 \}/);
  assert.match(src, /fieldRow: \{ flexDirection: 'row', gap: 8 \}/);
  const num = src.slice(src.indexOf('function EditNum('));
  assert.match(num, /keyboardType=\{decimal \? 'decimal-pad' : 'number-pad'\}/);
  assert.match(num, /value=\{decimal \? value : value == null \? '' : String\(Math\.round\(Number\(value\) \|\| 0\)\)\}/, 'kcal / carbs / protein stay whole numbers');
  assert.match(num, /placeholder=\{placeholder\}/);
  assert.match(num, /placeholderTextColor=\{colors\.ink3\}/, 'the dash is a theme token in both palettes');
  assert.match(src, /import \{ editedItems, fiberFieldText \} from '\.\.\/\.\.\/lib\/nutrition';/);
});

test('FW-16: the four labels exist in all six languages and fit half a row (German included)', () => {
  for (const l of LANGS) {
    for (const k of ['cal_kcal', 'nutri_carbs', 'nutri_protein', 'nutri_fiber']) {
      assert.ok(T[l][k], `${l}.${k}`);
      // half of the narrowest sheet (iPhone SE 320 pt: 304 sheet - 40 padding - 8 gap) is 128 pt; at 13 pt a
      // label of 16 characters is about 110 pt.
      assert.ok(T[l][k].length <= 16, `${l}.${k} "${T[l][k]}" fits half a row`);
    }
  }
  assert.equal(T.de.nutri_fiber, 'Ballaststoffe');
  assert.equal(T.pt.nutri_fiber, 'fibra');
});
