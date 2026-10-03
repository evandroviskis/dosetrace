'use strict';
// Founder 2026-10-03: the "how many doses" split chips read as a multiplication, not a
// numbered list ("1 · 240 mg each" read as option numbers). Format: the count, a real
// multiplication sign × (U+00D7) with spaces, the dose with its unit — "3 × 80 mg",
// "7 × 34,29 mg" in Portuguese — the same in all 6 languages; numbers through
// lib/localeFormat (comma decimals in pt/es/fr/de/it), trailing zeros trimmed. "Other"
// stays. The explainer's split rows use the same format.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../lib/protocolAssistant');
const { renderText } = require('../lib/assistantText');
const { newProtocolForm } = require('../lib/protocolForm');
const { explainerModel } = require('../lib/fitExplainer');

const src = fs.readFileSync(path.join(__dirname, '..', 'i18n', 'translations.js'), 'utf8').replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };';
const mod = { exports: {} }; new Function('module', 'exports', src)(mod, mod.exports);
const TR = mod.exports.translations;
const NOW = new Date(2026, 9, 3, 10, 0);
const LANGS = ['en', 'pt', 'es', 'fr', 'de', 'it'];
const OTHER = { en: 'Other', pt: 'Outro', es: 'Otra', fr: 'Autre', de: 'Andere', it: 'Altro' };

function weekCount(lang) {
  let s = A.startConversation('build', newProtocolForm(NOW), { language: lang, now: NOW, catalog: { recon: [], rtu: [], oral: [] } });
  s = A.answerText(s, 'nad', { intent: 'answer', compound: 'nad', form: 'powder' });
  s = A.answerText(s, '1000 mg', A.localUnderstand('amount', '1000 mg', lang));
  s = A.answerText(s, '7 ml', A.localUnderstand('mix', '7 ml', lang));
  s = A.answerOption(s, 'day:0');
  s = A.answerText(s, '240 mg', A.localUnderstand('dose', '240 mg', lang));
  s = A.answerOption(s, 'per:week');
  return s;
}

test('the split chips read "count × dose" in all 6 languages, with the language\'s decimals', () => {
  const comma = ['1 × 240 mg', '2 × 120 mg', '3 × 80 mg', '4 × 60 mg', '7 × 34,29 mg'];
  for (const lang of LANGS) {
    const s = weekCount(lang);
    const labels = A.options(s).map((o) => renderText((k) => TR[lang][k], o.key, o.params));
    const want = lang === 'en' ? ['1 × 240 mg', '2 × 120 mg', '3 × 80 mg', '4 × 60 mg', '7 × 34.29 mg'] : comma;
    assert.deepEqual(labels, [...want, OTHER[lang]], lang);
    for (const l of labels.slice(0, -1)) {
      assert.match(l, /^\d+ × \d/, `${lang}: real × sign with spaces: ${l}`);
      assert.doesNotMatch(l, /·|each|cada|chacune|je |ciascuna/, `${lang}: no list-number look, no "each": ${l}`);
    }
  }
  assert.equal(TR.pt.ap_opt_count, '{n} × {each}');
});

test('trailing zeros are trimmed (no "80.00", no "34,290")', () => {
  for (const lang of LANGS) {
    const labels = A.options(weekCount(lang)).map((o) => renderText((k) => TR[lang][k], o.key, o.params));
    for (const l of labels) assert.doesNotMatch(l, /[.,]\d*0 mg/, `${lang}: ${l}`);
  }
});

test('the explainer\'s split rows use the same × format', () => {
  const m = explainerModel({ ...newProtocolForm(NOW), type: 'recon', amount: '1000', water: '7', dose: '240', syringeSize: 100 }, 'pt');
  for (const lang of LANGS) {
    const row = renderText((k) => TR[lang][k], 'fx_split', { n: '7', each: m.splits[2].eachText, dunit: 'mg' });
    assert.equal(row, '7 × 34,29 mg', lang);
  }
});
