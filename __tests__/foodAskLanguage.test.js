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

test('A-128: the language code is checked against the app languages before it reaches the prompt', () => {
  const langLine = src.split('\n').find((l) => /const lang\s*=/.test(l));
  assert.ok(langLine, 'lang is derived in one line');
  for (const code of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.ok(src.includes(`'${code}'`), `allow-list names ${code}`);
  assert.match(src, /LANGS\.has\(/, 'an allow-list check exists');
});

// i18n review 2026-10-15 (section 8): the old line sent the Portuguese example ("cozido") to every
// language, English included, and named pt only by code. Each user now sees an example only in their
// own language, English gets none, and pt is named Brazilian Portuguese (the app is pt-BR).
function mapFrom(name) {
  const m = src.match(new RegExp(`const ${name}: Record<string, string> = (\\{[^\\n]*\\});`));
  assert.ok(m, `${name} map is declared on one line`);
  return new Function(`return ${m[1]};`)();
}
function languageLine(lang) {
  const line = src.split('\n').find((l) => l.includes('The user writes in language code'));
  const tpl = line.slice(line.indexOf('`'), line.lastIndexOf('`') + 1);
  // A-151 added the unit example map (UNIT_EXAMPLE) to the same line.
  return new Function('lang', 'LANG_NAME', 'BOILED', 'UNIT_EXAMPLE', `return ${tpl};`)(lang, mapFrom('LANG_NAME'), mapFrom('BOILED'), mapFrom('UNIT_EXAMPLE'));
}
const FOREIGN_EXAMPLES = ['cozido', 'hervido', 'bouilli', 'gekocht', 'bollito', 'cocido', 'cotto'];
// A-151: the unit example each language gets (German capitalised); case-sensitive, so fr "tasse" is not de "Tasse".
const UNIT_OWN = { es: 'taza', pt: 'xícara', fr: 'tasse', de: 'Tasse', it: 'tazza' };

test('i18n review: the rendered language line names each app language', () => {
  const names = { en: 'English', es: 'Spanish', pt: 'Brazilian Portuguese', fr: 'French', de: 'German', it: 'Italian' };
  for (const [lang, name] of Object.entries(names)) {
    const line = languageLine(lang);
    assert.ok(line.includes(`language code "${lang}" (${name})`), `${lang}: named ${name}`);
    assert.ok(line.includes(`option (preparations, sizes, amounts, units) in ${name}`), `${lang}: options in ${name}`);
    assert.match(line, /even though the examples above are in English/, `${lang}: the English examples are marked as examples`);
  }
});

test('i18n review: English gets no foreign example; es/pt/fr/de/it each get only their own', () => {
  const en = languageLine('en');
  for (const w of FOREIGN_EXAMPLES) assert.ok(!en.includes(`"${w}"`), `en: no "${w}"`);
  assert.ok(!/for example/.test(en), 'en: no example at all');
  const own = { es: 'hervido', pt: 'cozido', fr: 'bouilli', de: 'gekocht', it: 'bollito' };
  for (const [lang, word] of Object.entries(own)) {
    const line = languageLine(lang);
    assert.ok(line.includes(`(for example "${word}", not "boiled")`), `${lang}: its own example "${word}"`);
    for (const w of FOREIGN_EXAMPLES.filter((x) => x !== word)) assert.ok(!line.includes(`"${w}"`), `${lang}: no "${w}"`);
    assert.ok(line.includes(`writes it (for example "${UNIT_OWN[lang]}")`), `${lang}: its own unit example "${UNIT_OWN[lang]}"`);
    for (const w of Object.values(UNIT_OWN).filter((x) => x !== UNIT_OWN[lang])) assert.ok(!line.includes(`"${w}"`), `${lang}: no unit "${w}"`);
  }
  for (const w of Object.values(UNIT_OWN)) assert.ok(!en.includes(`"${w}"`), `en: no unit "${w}"`);
});
