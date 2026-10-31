// Founder 2026-10-31 19:08 EDT ("Concordo com a sua sugestão número 2"): the food-chat greeting was
// informal in Portuguese ("E aí, …", against the formal-pt rule of 2026-10-20). It becomes a plain,
// polite question in every language, each written as a native app would say it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the food-chat greeting is a plain, polite question in all 6 languages', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'i18n/translations.js'), 'utf8');
  const vals = [...src.matchAll(/^\s*nutri_intro:\s*(["'])(.*)\1,/gm)].map((m) => m[2]);
  assert.deepEqual(vals, [
    'What did you eat today? Earlier days count too.',
    '¿Qué comiste hoy? Los días anteriores también cuentan.',
    'O que você comeu hoje? Dias anteriores também contam.',
    'Qu’avez-vous mangé aujourd’hui ? Les jours précédents comptent aussi.',
    'Was hast du heute gegessen? Frühere Tage zählen auch.',
    'Cosa hai mangiato oggi? Contano anche i giorni precedenti.',
  ]);
  for (const v of vals) assert.doesNotMatch(v, /^(E aí|So,|¿Y |Alors,|Und,|Allora,)/);
});
