'use strict';
// A-133 (6) — store capture 2026-10-16 (iOS sim): the model capitalizes generic food names, so
// they showed capitalized mid-sentence: "150 g de Frango grelhado", "1 xícara de Café com leite",
// en "2 cups Chicken stir-fry", "How much “Chicken stir-fry with rice and vegetables”?".
// Brand / product names KEEP their capitalization (founder-validated FL rule: "built puff" ->
// "BUILT Puff", "isopure" -> "Isopure").
// Fix: the server prompt asks for generic food names in lowercase as written mid-sentence (repo
// only, not deployed). Client safety for rows already stored, which can never touch a brand:
// foodCase lowercases ONLY the first letter, and only when (a) the name has two or more words,
// (b) its first letter is its only capital (so "BUILT Puff", "Muscle Milk", "Red Bull" never
// qualify), (c) the user's own raw_text holds the same phrase starting lowercase, and (d) the
// language is not German (German nouns are capitalized). A single word ("Isopure", "Açaí") is
// never changed: the client cannot tell a brand from a food there; the server prompt handles it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { itemLabel, foodCase } = require('../lib/nutrition');
const { buildThread } = require('../lib/foodThread');

test('A-133: a generic food the user typed in lowercase reads lowercase mid-sentence', () => {
  assert.equal(itemLabel({ food: 'Frango grelhado', qty: 150, unit: 'g' }, 'pt', 'almocei 150g de frango grelhado'), '150 g de frango grelhado');
  assert.equal(itemLabel({ food: 'Café com leite', qty: 1, unit: 'xícara' }, 'pt', 'uma xícara de café com leite'), '1 xícara de café com leite');
  assert.equal(itemLabel({ food: 'Chicken stir-fry', qty: 2, unit: 'cups' }, 'en', '2 cups of chicken stir-fry for dinner'), '2 cups chicken stir-fry');
  assert.equal(foodCase('Chicken stir-fry with rice and vegetables', 'chicken stir-fry with rice and vegetables', 'en'), 'chicken stir-fry with rice and vegetables');
});

test('A-133: a brand keeps its capitalization even when the user typed it lowercase', () => {
  assert.equal(itemLabel({ food: 'BUILT Puff', qty: 2, unit: 'bars' }, 'en', '2 built puff bars'), '2 × BUILT Puff');
  assert.equal(foodCase('BUILT Puff', 'built puff', 'en'), 'BUILT Puff');
  assert.equal(foodCase('Isopure', 'a scoop of isopure', 'en'), 'Isopure', 'one word: never touched');
  assert.equal(foodCase('Muscle Milk', 'muscle milk', 'en'), 'Muscle Milk');
  assert.equal(foodCase('Red Bull', 'um red bull', 'pt'), 'Red Bull');
  assert.equal(itemLabel({ food: 'Isopure', qty: 1, unit: 'dose' }, 'fr', 'une dose d’isopure'), '1 dose d’Isopure');
});

test('A-133: no change when the user wrote it capitalized, did not write it, or in German', () => {
  assert.equal(foodCase('Frango grelhado', 'Frango grelhado no almoço', 'pt'), 'Frango grelhado', 'the user capitalized it');
  assert.equal(foodCase('Whey genérico', 'un batido de proteína', 'es'), 'Whey genérico', 'not in the user text');
  assert.equal(foodCase('Frango grelhado', '', 'pt'), 'Frango grelhado');
  assert.equal(foodCase('Frango grelhado', undefined, 'pt'), 'Frango grelhado');
  assert.equal(foodCase('Hähnchen mit Reis', 'hähnchen mit reis', 'de'), 'Hähnchen mit Reis', 'German nouns stay capitalized');
  assert.equal(foodCase('Hähnchen mit reis', 'hähnchen mit reis', 'de'), 'Hähnchen mit reis');
});

test('A-133: the thread carries the user text on entries, echo, asked and the open follow-up', () => {
  const T = '2026-10-16';
  const iso = new Date(2026, 9, 16, 12).toISOString();
  const items = [
    { food: 'Frango grelhado', qty: 150, unit: 'g', kcal: 250, msg: 'm1' },
    { food: 'Arroz branco', qty: 1, unit: 'xícara', kcal: 200, msg: 'm1', ask: { kind: 'amount', options: [] }, asked: true },
  ];
  const rows = [{ id: 7, source: 'ai', parse_status: 'done', sync_status: 'synced', raw_text: 'frango grelhado e arroz branco', entry_date: T, created_at: iso, parsed_items: JSON.stringify(items) }];
  const th = buildThread(rows, { todayISO: T });
  for (const type of ['entry', 'echo', 'followup']) {
    const x = th.find((y) => y.type === type);
    assert.ok(x, type);
    assert.equal(x.raw, 'frango grelhado e arroz branco', type + ' carries raw');
  }
  const done = [{ ...rows[0], parsed_items: JSON.stringify([items[0], { ...items[1], ask_done: { kind: 'amount', answer: '1 xícara', food: 'Arroz branco' } }]) }];
  assert.equal(buildThread(done, { todayISO: T }).find((y) => y.type === 'asked').raw, 'frango grelhado e arroz branco');
});

test('A-133: the chat renders every food name through the user text (labels and questions)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'FoodChatScreen.js'), 'utf8');
  assert.match(src, /itemLabel\(it, language, x\.raw\)/, 'entry card');
  assert.match(src, /echoFor\(x\.items, x\.raw\)/, 'Noted echo');
  assert.match(src, /foodCase\(x\.food, x\.raw, language\)/, 'asked question');
  assert.match(src, /foodCase\(x\.item\.food, x\.raw, language\)/, 'open follow-up question');
  assert.doesNotMatch(src, /toLowerCase\(\)[^\n]*food/, 'nothing else lowercases a food name');
});

const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'parse-food', 'index.ts'), 'utf8');

test('A-133 server: generic food names lowercase as written mid-sentence; brands keep their capitals', () => {
  for (const name of ['FOOD_SYSTEM', 'FOLLOWUP_SYSTEM']) {
    const m = server.match(new RegExp('const ' + name + ' = `([\\s\\S]*?)`;'));
    assert.ok(m, name);
    assert.match(m[1], /generic food names in lowercase/i, name + ': generic lowercase');
    assert.match(m[1], /German nouns/i, name + ': German keeps its noun capitals');
  }
  const food = server.match(/const FOOD_SYSTEM = `([\s\S]*?)`;/)[1];
  assert.match(food, /"built puff" -> "BUILT Puff", "isopure" -> "Isopure"/, 'the brand rule stays');
  assert.match(food, /"grilled chicken"/, 'a generic example');
});
