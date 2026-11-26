'use strict';
// FR-16 (founder 2026-11-26, decision 2dfc02ff; picture docs/design/quantidade-refeicao.html, approved
// f9d8f17d): on "Corrigir este registro" each item gets a "Quantidade" block (− [number unit] +) above its
// numbers. Changing the quantity multiplies kcal, carbs, protein, fat and fiber by new / old, on the phone,
// without the AI (no parse-food, works offline). A number typed after it wins. g and ml step by 10, counted
// units by 1, any number can be typed (0,5 in the app language). An item with no quantity starts empty and
// its current numbers count as 1 portion. The name never carries the old amount: the label is built from
// food + qty + unit (itemLabel), so a new quantity changes the receipt and becomes its own recent chip.
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers/extractFn');
const N = require('../lib/nutrition');
const { recentMeals, mealKey } = require('../lib/foodRecent');
const { translations: T } = require('../i18n/translations');

const { editorItems, editedItems, withQty, withField, stepQty, qtyStep, qtyFieldText, qtyUnitText, qtyBefore, itemLabel } = N;
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

const chicken = { food: 'frango grelhado', qty: 150, unit: 'g', kcal: 250, carb_g: 0, protein_g: 46, fat_g: 5.4, fiber_g: 0, confidence: 'medium', category: 'meal' };
const eggs = { food: 'ovos', qty: 2, unit: 'un', kcal: 140, carb_g: 1, protein_g: 12, fat_g: 10, confidence: 'high' };
const bacon = { food: 'bacon', kcal: 90, carb_g: 0, protein_g: 6, fat_g: 7, fiber_g: null, confidence: 'high' };

test('FR-16: changing 150 g to 200 g multiplies every number by 200/150, rounded like the fields', () => {
  const [ed] = editorItems([chicken]);
  const out = withQty(ed, '200', 'pt');
  assert.equal(out.kcal, 333, '250 x 1,33 = 333 (the picture)');
  assert.equal(out.protein_g, 61, '46 x 1,33 = 61 (the picture)');
  assert.equal(out.carb_g, 0);
  assert.equal(out.fat_g, 7.2, 'fat (not shown) with one decimal');
  assert.equal(out.fiber_g, 0, 'a known 0 fiber stays 0');
  const [saved] = editedItems([chicken], [out], 'pt');
  assert.equal(saved.qty, 200);
  assert.equal(saved.kcal, 333);
  assert.equal(saved.confidence, 'user', 'a changed quantity makes the item the user\'s (FL-9)');
  assert.equal(saved.category, 'meal', 'the category is kept (FL-23)');
  assert.equal(itemLabel(saved, 'pt'), '200 g de frango grelhado', 'the label follows the new quantity');
  assert.ok(!('__base' in saved) && !('__qn' in saved) && !('__orig' in saved), 'editor helper keys never reach the database');
});

test('FR-16: the ratio always comes from the opened values (stepping up and back down returns them exactly)', () => {
  let [ed] = editorItems([chicken]);
  for (let i = 0; i < 7; i++) ed = withQty(ed, stepQty(ed, 1, 'pt'), 'pt');
  assert.equal(ed.qty, 220);
  for (let i = 0; i < 7; i++) ed = withQty(ed, stepQty(ed, -1, 'pt'), 'pt');
  assert.equal(ed.qty, 150);
  assert.equal(ed.kcal, 250);
  assert.equal(ed.protein_g, 46);
  assert.equal(ed.fat_g, 5.4);
  const [saved] = editedItems([chicken], [ed], 'pt');
  assert.equal(saved.confidence, 'medium', 'back to the same quantity and numbers = untouched');
});

test('FR-16: a number typed after the quantity wins, and a later quantity change scales from it', () => {
  let [ed] = editorItems([chicken]);
  ed = withQty(ed, '200', 'pt');
  ed = withField(ed, 'kcal', '320', 'pt');
  assert.equal(ed.kcal, '320', 'the typed text stays as typed');
  assert.equal(ed.protein_g, 61, 'the other numbers are left as they are');
  let [saved] = editedItems([chicken], [ed], 'pt');
  assert.equal(saved.kcal, 320, 'the typed number wins');
  assert.equal(saved.qty, 200);
  ed = withQty(ed, '100', 'pt');
  assert.equal(ed.kcal, 160, '320 at 200 g -> 160 at 100 g');
  assert.equal(ed.protein_g, 31, '61 at 200 g -> 31 at 100 g');
  [saved] = editedItems([chicken], [ed], 'pt');
  assert.equal(saved.qty, 100);
  // the name field is a plain field: renaming never rescales
  const named = withField(ed, 'food', 'frango assado', 'pt');
  assert.equal(named.kcal, 160);
});

test('FR-16: steps — g and ml by 10, counted units by 1, never to 0 or below; an empty field starts at one step', () => {
  assert.equal(qtyStep('g'), 10);
  assert.equal(qtyStep('ml'), 10);
  assert.equal(qtyStep(' G '), 10);
  for (const u of ['un', '', null, 'fatia', 'slices', 'x', 'cup']) assert.equal(qtyStep(u), 1, String(u));
  const [c, e, b] = editorItems([chicken, eggs, bacon]);
  assert.equal(stepQty(c, 1, 'pt'), 160);
  assert.equal(stepQty(c, -1, 'pt'), 140);
  assert.equal(stepQty(e, 1, 'pt'), 3);
  assert.equal(stepQty(e, -1, 'pt'), 1);
  assert.equal(stepQty({ ...e, qty: 1 }, -1, 'pt'), null, '1 egg cannot go to 0');
  assert.equal(stepQty({ ...c, qty: '5' }, -1, 'pt'), null, '5 g cannot go below 0');
  assert.equal(stepQty({ ...e, qty: '0,5' }, 1, 'pt'), 1.5, 'a typed fraction steps by whole units');
  assert.equal(stepQty(b, 1, 'pt'), 1, 'no quantity: + starts at 1 portion');
  assert.equal(stepQty(b, -1, 'pt'), null, 'no quantity: − does nothing');
});

test('FR-16: fractions only by typing, read in the app language (comma decimals in pt/es/fr/de/it)', () => {
  const [e] = editorItems([eggs]);
  for (const l of ['pt', 'es', 'fr', 'de', 'it']) {
    const out = withQty(e, '0,5', l);
    assert.equal(out.kcal, 35, `${l}: 140 x 0,5 / 2`);
    assert.equal(editedItems([eggs], [out], l)[0].qty, 0.5, l);
  }
  const en = withQty(e, '0.5', 'en');
  assert.equal(en.kcal, 35);
  assert.equal(editedItems([eggs], [en], 'en')[0].qty, 0.5);
  const big = withQty(editorItems([chicken])[0], '1.250', 'pt');
  assert.equal(editedItems([chicken], [big], 'pt')[0].qty, 1250, 'pt "1.250" = 1250 (thousands)');
});

test('FR-16: an empty, 0 or unreadable quantity changes nothing; on save the last good quantity stays', () => {
  const [c] = editorItems([chicken]);
  for (const v of ['', '0', '0,', 'abc', '-5']) {
    const out = withQty(c, v, 'pt');
    assert.equal(out.kcal, 250, `"${v}" keeps the numbers`);
    assert.equal(editedItems([chicken], [out], 'pt')[0].qty, 150, `"${v}" keeps the quantity`);
  }
  // typed 200, then erased: the numbers are still the 200 g ones, so 200 g is saved with them
  const erased = withQty(withQty(c, '200', 'pt'), '', 'pt');
  assert.equal(erased.kcal, 333);
  assert.equal(editedItems([chicken], [erased], 'pt')[0].qty, 200);
  // and a number typed while the field is empty scales from 200 g later
  const typed = withQty(withField(erased, 'kcal', '400', 'pt'), '100', 'pt');
  assert.equal(typed.kcal, 200);
});

test('FR-16: an item with no quantity starts empty; a number set counts the current values as 1 portion', () => {
  const [b] = editorItems([bacon]);
  assert.equal(qtyFieldText(b.qty, 'pt'), '', 'the field is empty');
  assert.equal(qtyBefore(bacon, 'pt'), null, 'no "Antes" when there was no quantity');
  const two = withQty(b, '2', 'pt');
  assert.equal(two.kcal, 180);
  assert.equal(two.protein_g, 12);
  assert.equal(two.fiber_g, null, 'unknown fiber stays unknown (never a made-up 0)');
  const [saved] = editedItems([bacon], [two], 'pt');
  assert.equal(saved.qty, 2);
  assert.equal(saved.confidence, 'user');
  assert.equal(itemLabel(saved, 'pt'), '2 × bacon');
  const [untouched] = editedItems([bacon], [b], 'pt');
  assert.ok(!('qty' in untouched), 'an untouched item without quantity gets no quantity key');
  assert.equal(untouched.confidence, 'high');
});

test('FR-16: the field, the unit beside it and "Antes" in the app language', () => {
  assert.equal(qtyFieldText(150, 'pt'), '150');
  assert.equal(qtyFieldText(0.5, 'pt'), '0,5');
  assert.equal(qtyFieldText(0.5, 'en'), '0.5');
  assert.equal(qtyFieldText(1250, 'pt'), '1250', 'never grouped (inputNumber)');
  assert.equal(qtyFieldText('0,', 'pt'), '0,', 'what is being typed stays as typed');
  assert.equal(qtyFieldText(null, 'pt'), '');
  assert.equal(qtyUnitText(chicken, 'pt'), 'g');
  assert.equal(qtyUnitText(eggs, 'pt'), '', 'a counted item shows just the number');
  assert.equal(qtyUnitText(bacon, 'pt'), '');
  assert.equal(qtyUnitText({ food: 'bacon', qty: 3, unit: 'fatia' }, 'pt'), 'fatias', 'the unit agrees with the number');
  assert.equal(qtyUnitText({ food: 'Milchkaffee', qty: 1, unit: 'tasse' }, 'de'), 'Tasse');
  assert.equal(qtyBefore(chicken, 'pt'), '150 g');
  assert.equal(qtyBefore(eggs, 'pt'), '2');
  assert.equal(qtyBefore({ food: 'aveia', qty: 0.5, unit: 'xícara' }, 'pt'), '0,5 xícara');
});

test('FR-16: the name never carries the old amount; an untouched item keeps its stored name', () => {
  const stored = { ...chicken, food: '150 g de frango grelhado' };
  const [ed] = editorItems([stored]);
  assert.equal(ed.food, 'frango grelhado', 'the name field shows the food without the amount');
  const [same] = editedItems([stored], [ed], 'pt');
  assert.equal(same.food, '150 g de frango grelhado', 'nothing changed: the stored name is kept as it was');
  assert.equal(same.confidence, 'medium', 'opening and saving is not an edit');
  const [moved] = editedItems([stored], [withQty(ed, '200', 'pt')], 'pt');
  assert.equal(moved.food, 'frango grelhado');
  assert.equal(itemLabel(moved, 'pt'), '200 g de frango grelhado', 'never "200 g de 150 g de frango"');
});

test('FR-16: the new quantity becomes its own recent chip; the old one stays while it is recent', () => {
  const [ed] = editorItems([chicken]);
  const edited = editedItems([chicken], [withQty(ed, '200', 'pt')], 'pt');
  assert.notEqual(mealKey(edited), mealKey([chicken]));
  const row = (id, items, at) => ({ id, entry_date: '2026-11-25', parse_status: 'done', kcal: items[0].kcal, parsed_items: JSON.stringify(items), created_at: at, raw_text: '' });
  const rows = [row(1, [chicken], '2026-11-25T12:00:00'), row(2, edited, '2026-11-25T19:00:00')];
  const chips = recentMeals(rows, { todayISO: '2026-11-26', now: new Date('2026-11-26T08:00:00'), language: 'pt' }).map((m) => m.label);
  assert.deepEqual(chips.sort(), ['150 g de frango grelhado', '200 g de frango grelhado']);
});

test('FR-16: the existing edits still behave (numbers typed, renames, fiber) and items without editor keys work', () => {
  const out = editedItems([chicken], [{ ...chicken, __orig: 0, kcal: '300' }], 'pt')[0];
  assert.equal(out.kcal, 300);
  assert.equal(out.qty, 150, 'the quantity is kept when the person does not change it');
  assert.equal(out.confidence, 'user');
});

test('FR-16: the sheet shows the Quantidade block above the numbers; no AI call; theme tokens only', () => {
  const src = read('screens/components/FoodEntryEditor.js');
  assert.match(src, /editorItems\(safeItems\(row\.parsed_items\)\)/, 'the sheet opens with the editor copies');
  const item = src.slice(src.indexOf('{items.map((it, i) => ('), src.indexOf('nutri_delete_entry\')}</Text>'));
  assert.ok(item.indexOf('<QtyField') > 0 && item.indexOf('<QtyField') < item.indexOf('<EditNum'), 'the quantity sits above kcal / macros');
  assert.match(src, /t\('nutri_qty_label'\)/);
  assert.match(src, /t\('nutri_qty_hint'\)/);
  assert.match(src, /stepQty\(/);
  assert.match(src, /withQty\(/);
  assert.match(src, /keyboardType="decimal-pad"/);
  assert.match(src, /onFocus=\{\(\) => \{ if \(onFocus\) onFocus\(ref\); \}\}/);
  assert.doesNotMatch(src, /parse-food|parseFood|functions\.invoke/, 'never calls the AI');
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/);
  assert.match(src, /backgroundColor: c\.hit/, 'the block uses the theme highlight token (both palettes)');
});

test('FR-16: the quantity strings exist in all 6 languages, formal pt, with their placeholder', () => {
  for (const k of ['nutri_qty_label', 'nutri_qty_hint', 'nutri_qty_before', 'nutri_qty_portion', 'nutri_qty_less', 'nutri_qty_more']) {
    for (const l of LANGS) assert.ok(T[l][k] && T[l][k].trim(), `${l}.${k}`);
  }
  for (const l of LANGS) assert.match(T[l].nutri_qty_before, /\{amount\}/, l);
  assert.equal(T.pt.nutri_qty_label, 'Quantidade');
  assert.equal(T.pt.nutri_qty_hint, 'Calorias e macros mudam junto, na mesma proporção.');
  assert.equal(T.pt.nutri_qty_before, 'Antes: {amount}.');
});
