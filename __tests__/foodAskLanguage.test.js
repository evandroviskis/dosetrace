// A-128 (founder 2026-10-15, screenshot): the AI food log asked 'Como foi o preparo de "ravioli"?'
// with answer chips "boiled / fried / with sauce" in English. The question is the app's own string;
// the chips come from the server's `ask.options`, and the prompt never said which language to use.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'parse-food', 'index.ts'), 'utf8');

test('A-128: the prompt tells the model to write the ask options in the user\'s language', () => {
  // The language line that is appended to every system prompt (parse and follow-up).
  const line = src.split('\n').find((l) => l.includes('The user writes in language code'));
  assert.ok(line, 'language line exists');
  assert.match(line, /"ask" option/, 'the language line must cover the answer options');
  assert.match(line, /\$\{lang\}/, 'it names the language code');
});

test('A-128: the follow-up answer path keeps the same language line', () => {
  // One line for both prompts: FOLLOWUP_SYSTEM and FOOD_SYSTEM share the appended language rule.
  const i = src.indexOf('const system = (followup ? FOLLOWUP_SYSTEM : FOOD_SYSTEM');
  const j = src.indexOf('The user writes in language code');
  assert.ok(i > 0 && j > i && j - i < 200, 'the language line is appended right after the shared system prompt');
});
