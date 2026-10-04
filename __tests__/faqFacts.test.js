'use strict';
// Pre-build pass 2026-10-03, m5: the FAQ was stale. The syringe answer missed the 2/3/5 ml
// syringes (ready to use only, AP-21), "Is DoseTrace free?" read "unlimited … scans" (founder:
// never "unlimited" for scans — Premium up to 20 a month, the number only in "What does Premium
// include?"; free 3 a month across labs, vaccine cards and vials), nothing said the free plan
// has 3 active protocols and 7 days of the AI food log, and the vial answer pointed to a
// "Vials tab" that does not exist. Six languages.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
const tr = mod.exports.translations;
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const answers = (l) => tr[l].faq_categories.flatMap((c) => c.questions.map((q) => q.a));
const qa = (l, ci, qi) => tr[l].faq_categories[ci].questions[qi].a;
// The Premium section is the last one (round 2 added a Journey section before it).
const premiumA = (l) => tr[l].faq_categories[tr[l].faq_categories.length - 1].questions[0].a;
const UNLIMITED = /unlimited|ilimitad|illimit|unbegrenzt/i;
const SCAN = /scan|escane|leitura|lecture/i;

test('"unlimited" only ever describes protocols, never scans', () => {
  for (const l of LANGS) {
    for (const a of answers(l)) {
      for (const sentence of a.split(/[.;:]\s/)) {
        const m = sentence.match(new RegExp('(?:\\S+\\s+)?(?:' + UNLIMITED.source + ')\\S*(?:\\s+\\S+)?', 'gi')) || [];
        for (const hit of m) assert.match(hit, /protoc|Protokoll/i, `${l}: "${hit}" in "${sentence}"`);
      }
    }
  }
});

test('the scan number 20 appears only in "What does Premium include?"', () => {
  for (const l of LANGS) {
    const premium = premiumA(l);
    assert.match(premium, /20/, l);
    for (const a of answers(l)) if (a !== premium) assert.doesNotMatch(a, /\b20\b/, `${l}: ${a}`);
  }
});

test('"Is DoseTrace free?" names the free plan: 3 active protocols, 3 scans a month, 7 food-log days', () => {
  for (const l of LANGS) {
    const a = qa(l, 0, 1);
    assert.match(a, /3 [^.]*protoc|3 aktive Protokolle/i, l);
    assert.match(a, /3 [^.]*(scan|escane|leitura)/i, l);
    assert.match(a, /7 /, l);
  }
});

test('the syringe answer lists 0.3, 0.5, 1 ml and the 2, 3 and 5 ml syringes for ready-to-use', () => {
  for (const l of LANGS) {
    const a = qa(l, 1, 1);
    for (const n of ['0[.,]3', '0[.,]5', '1 ml', '2', '3', '5 ml']) assert.match(a, new RegExp(n), `${l}: ${n}`);
  }
});

test('no answer points to a Vials tab', () => {
  const tab = { en: /Vials tab/, es: /pestaña Viales/, pt: /aba Frascos/, fr: /onglet Flacons/, de: /Fläschchen-Tab/, it: /scheda Flaconi/ };
  for (const l of LANGS) for (const a of answers(l)) assert.doesNotMatch(a, tab[l], l);
});

test('scans are said to be shared by labs, vaccine cards and vials wherever the FAQ counts them', () => {
  for (const l of LANGS) for (const a of [qa(l, 0, 1), qa(l, 3, 0), premiumA(l)]) assert.match(a, SCAN, l);
});

test('a sentence that says "unlimited" calls the Premium scans "more", so "unlimited" can never be read onto them', () => {
  const MORE = /(^|\s)(more|más|mais|plus de|mehr|più)\s/i;
  for (const l of LANGS) {
    for (const a of answers(l)) {
      for (const sentence of a.split(/\.\s/)) {
        if (UNLIMITED.test(sentence) && SCAN.test(sentence)) assert.match(sentence, MORE, `${l}: ${sentence}`);
      }
    }
  }
  // The old answer failed this.
  const old = 'Premium unlocks unlimited protocols, lab, vaccine and vial scans (the free plan includes 3 a month), the dose-accumulation curve, and PDF export.';
  assert.ok(UNLIMITED.test(old) && SCAN.test(old) && !MORE.test(old));
});
