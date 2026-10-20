'use strict';
// A-151 — store capture 2026-10-17: a German food entry read "1 tasse Milchkaffee". The parse-food
// model wrote the unit in lowercase (the A-133 rule asks for lowercase generic names), but German
// nouns are always capitalised: "1 Tasse Milchkaffee", "2 Scheiben Brot", "1 großes Glas Milch".
// The other five languages keep their own spelling: common words stay lowercase ("1 tasse de café",
// "1 xícara de café", "1 taza de café", "1 tazza di latte", "1 cup coffee").
// Fix: (1) the server prompts ask for the unit in the user's language with that language's
// spelling (German nouns capitalised); (2) a deterministic rule, unitCase, capitalises the known
// German unit nouns when the language is German — on the server (cleanItem / ask options, so new
// rows are stored right even when the model slips) and in the app's itemLabel (so rows already
// stored as "tasse" by 1.3.0 read right; the stored row itself is never rewritten).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { itemLabel, unitCase } = require('../lib/nutrition');

test('A-151: a German unit noun stored in lowercase reads capitalised', () => {
  assert.equal(itemLabel({ food: 'Milchkaffee', qty: 1, unit: 'tasse' }, 'de'), '1 Tasse Milchkaffee');
  assert.equal(itemLabel({ food: 'Brot', qty: 2, unit: 'scheiben' }, 'de'), '2 Scheiben Brot');
  assert.equal(itemLabel({ food: 'Milch', qty: 1, unit: 'großes glas' }, 'de'), '1 großes Glas Milch', 'the adjective stays lowercase');
  assert.equal(itemLabel({ food: 'Joghurt', qty: 1, unit: 'becher' }, 'de'), '1 Becher Joghurt');
  assert.equal(itemLabel({ food: 'Erdnussbutter', qty: 1, unit: 'el' }, 'de'), '1 EL Erdnussbutter');
  assert.equal(itemLabel({ food: 'Zucker', qty: 2, unit: 'tl' }, 'de'), '2 TL Zucker');
  assert.equal(itemLabel({ food: 'Whey', qty: 1, unit: 'messlöffel' }, 'de'), '1 Messlöffel Whey', 'a compound ending in a unit noun');
  assert.equal(itemLabel({ food: 'Kaffee', qty: 1, unit: 'tasse (200 ml)' }, 'de'), '1 Tasse (200 ml) Kaffee');
  assert.equal(itemLabel({ food: 'Kaffee', qty: 1, unit: 'tasse (' }, 'de'), '1 Tasse Kaffee', 'cut unit still cleaned (A-133)');
});

test('A-151: German units already right, and measures, are left alone', () => {
  assert.equal(itemLabel({ food: 'Haferflocken', qty: 0.5, unit: 'Tasse' }, 'de'), '0,5 Tasse Haferflocken');
  assert.equal(itemLabel({ food: 'Reis', qty: 150, unit: 'g' }, 'de'), '150 g Reis');
  assert.equal(itemLabel({ food: 'Wasser', qty: 500, unit: 'ml' }, 'de'), '500 ml Wasser');
  assert.equal(itemLabel({ food: 'Orangensaft', qty: 1, unit: 'Glas' }, 'de'), '1 Glas Orangensaft');
  assert.equal(itemLabel({ food: 'BUILT Puff', qty: 2, unit: 'riegel' }, 'de'), '2 × BUILT Puff', 'a count stays N ×');
  assert.equal(unitCase('GLAS', 'de'), 'GLAS', 'a unit with capitals of its own is never changed');
  assert.equal(unitCase('kleine', 'de'), 'kleine', 'not a unit noun');
});

test('A-151: the other five languages keep their own lowercase units (no capital added)', () => {
  assert.equal(itemLabel({ food: 'café', qty: 1, unit: 'tasse' }, 'fr'), '1 tasse de café');
  assert.equal(itemLabel({ food: 'café', qty: 1, unit: 'xícara' }, 'pt'), '1 xícara de café');
  assert.equal(itemLabel({ food: 'café con leche', qty: 1, unit: 'taza' }, 'es'), '1 taza de café con leche');
  assert.equal(itemLabel({ food: 'latte', qty: 1, unit: 'tazza' }, 'it'), '1 tazza di latte');
  assert.equal(itemLabel({ food: 'coffee', qty: 1, unit: 'cup' }, 'en'), '1 cup coffee');
  assert.equal(itemLabel({ food: 'pão', qty: 2, unit: 'fatias' }, 'pt'), '2 fatias de pão');
  for (const lang of ['en', 'es', 'pt', 'fr', 'it']) {
    for (const u of ['tasse', 'glas', 'scheibe', 'becher', 'dose', 'portion', 'el', 'tl']) {
      assert.equal(unitCase(u, lang), u, `${lang}: "${u}" untouched`);
    }
  }
  assert.equal(unitCase('tasse', undefined), 'tasse', 'no language: untouched');
  assert.equal(unitCase('', 'de'), '');
  assert.equal(unitCase(null, 'de'), '');
});

// ── Server (supabase/functions/parse-food/index.ts) ──────────────────────
const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'parse-food', 'index.ts'), 'utf8');
const prompt = (name) => {
  const m = server.match(new RegExp('const ' + name + ' = `([\\s\\S]*?)`;'));
  assert.ok(m, name);
  return m[1];
};

test('A-151 server: both prompts say units follow the language spelling, German nouns capitalised', () => {
  const food = prompt('FOOD_SYSTEM');
  assert.match(food, /"unit" in the user's language/, 'FOOD_SYSTEM: unit in the user language');
  assert.match(food, /"Tasse", "Glas", "Scheibe", "Becher", "Stück", "Portion", "Löffel"/, 'FOOD_SYSTEM: the German unit nouns');
  assert.match(food, /"1 Tasse Milchkaffee", never "1 tasse Milchkaffee"/, 'FOOD_SYSTEM: the captured bug as the counter-example');
  assert.match(food, /"cup", "taza", "xícara", "tasse", "tazza"/, 'FOOD_SYSTEM: the other languages stay lowercase');
  const fu = prompt('FOLLOWUP_SYSTEM');
  assert.match(fu, /"unit" in the user's language/, 'FOLLOWUP_SYSTEM: unit in the user language');
  assert.match(fu, /German nouns keep their capital \("Tasse", "Glas", "Scheibe"\)/, 'FOLLOWUP_SYSTEM: German unit nouns');
});

test('A-151 server: the language line names the unit with each language\'s own spelling', () => {
  const map = (name) => {
    const m = server.match(new RegExp(`const ${name}: Record<string, string> = (\\{[^\\n]*\\});`));
    assert.ok(m, name + ' map');
    // eslint-disable-next-line no-new-func
    return new Function('return ' + m[1])();
  };
  const ex = map('UNIT_EXAMPLE');
  assert.deepEqual(ex, { es: 'taza', pt: 'xícara', fr: 'tasse', de: 'Tasse', it: 'tazza' }, 'English gets none (the examples above are English)');
  // Render the real language line for each language.
  const src = server.split('\n').find((l) => l.includes('The user writes in language code'));
  const tpl = src.slice(src.indexOf('`'), src.lastIndexOf('`') + 1);
  // eslint-disable-next-line no-new-func
  const line = (lang) => new Function('lang', 'LANG_NAME', 'BOILED', 'UNIT_EXAMPLE', `return ${tpl};`)(lang, map('LANG_NAME'), map('BOILED'), ex);
  assert.ok(line('de').includes('Write "unit" in German too, spelled as German writes it (for example "Tasse").'), 'de: Tasse with its capital');
  assert.ok(line('fr').includes('Write "unit" in French too, spelled as French writes it (for example "tasse").'), 'fr: tasse in lowercase');
  assert.ok(line('pt').includes('spelled as Brazilian Portuguese writes it (for example "xícara").'));
  assert.ok(line('es').includes('(for example "taza")'));
  assert.ok(line('it').includes('(for example "tazza")'));
  assert.ok(line('en').includes('Write "unit" in English too, spelled as English writes it. '), 'en: the rule, no example');
});

// The server's unitCase is run for real (types stripped) and must agree with the app's.
function serverUnitCase() {
  const nouns = server.match(/const DE_UNIT_NOUNS = (new Set\(\[[^\]]*\]\));/);
  const abbr = server.match(/const DE_UNIT_ABBR: Record<string, string> = (\{[^}]*\});/);
  const fn = server.split('\n').find((l) => l.startsWith('const unitCase = '));
  assert.ok(nouns && abbr && fn, 'DE_UNIT_NOUNS, DE_UNIT_ABBR and the unitCase one-liner');
  const js = fn.replace(/^const unitCase = /, '').replace(/: (string|unknown)/g, '').replace(/;\s*$/, '');
  // eslint-disable-next-line no-new-func
  return new Function(`const DE_UNIT_NOUNS = ${nouns[1]}; const DE_UNIT_ABBR = ${abbr[1]}; return ${js};`)();
}

test('A-151 server: unitCase capitalises German unit nouns only, same as the app', () => {
  const sc = serverUnitCase();
  const cases = [
    ['tasse', 'de', 'Tasse'], ['scheiben', 'de', 'Scheiben'], ['großes glas', 'de', 'großes Glas'], ['el', 'de', 'EL'],
    ['tl', 'de', 'TL'], ['stk.', 'de', 'Stk.'], ['messlöffel', 'de', 'Messlöffel'], ['tasse (200 ml)', 'de', 'Tasse (200 ml)'],
    ['g', 'de', 'g'], ['ml', 'de', 'ml'], ['Tasse', 'de', 'Tasse'], ['kleine', 'de', 'kleine'],
    ['tasse', 'fr', 'tasse'], ['taza', 'es', 'taza'], ['xícara', 'pt', 'xícara'], ['tazza', 'it', 'tazza'], ['cup', 'en', 'cup'],
    ['glas', 'en', 'glas'], ['dose', 'fr', 'dose'], ['portion', 'fr', 'portion'],
  ];
  for (const [u, lang, want] of cases) {
    assert.equal(sc(u, lang), want, `server ${lang} "${u}"`);
    assert.equal(unitCase(u, lang), want, `app ${lang} "${u}"`);
  }
});

test('A-151 server: cleanItem and the ask options run unitCase with the request language', () => {
  assert.match(server, /function cleanItem\(it: Record<string, unknown>, lang: string\)/);
  assert.match(server, /unit: unitCase\(shortUnit\(it\.unit\), lang\)/);
  assert.match(server, /cleanItem\(it, lang\)/);
  assert.match(server, /\.map\(\(o\) => unitCase\(shortText\(o, 40\), lang\)\)/, 'ask chips such as "1 Tasse"');
  assert.match(server, /cleanAsk\(parsed\.ask, items\.length, lang\)/);
});

test('A-151: the app and the server list the same German unit nouns', () => {
  const nouns = server.match(/const DE_UNIT_NOUNS = new Set\(\[([^\]]*)\]\);/)[1];
  const list = (s) => s.split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean).sort();
  const app = fs.readFileSync(path.join(__dirname, '..', 'lib', 'nutrition.js'), 'utf8').match(/const DE_UNIT_NOUNS = new Set\(\[([^\]]*)\]\);/);
  assert.ok(app, 'lib/nutrition.js DE_UNIT_NOUNS');
  assert.deepEqual(list(app[1]), list(nouns));
});
