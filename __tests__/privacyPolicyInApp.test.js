'use strict';
// A-117 (DL-81, AD-72, DV-231, DV-085): the privacy policy Settings shows inside the app
// (settings_privacy_body x6) carries the same content as the website policy
// docs/legal/privacy-policy-2026-10.md, and its AI section names Anthropic and EVERY AI
// feature the app has (lab report, vaccination card, vial label, AI food log, protocol
// assistant). The in-app text used to be dated April 2026 and named only labs and
// vaccine cards.
//
// Structural check, not word for word (each language is written natively): the same
// date, the same 14 numbered sections in the same order, and the facts each website
// section carries (the services it names, the 7 days, the 18+, the contact) present in
// the matching in-app section of every language.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations } = require('../i18n/translations.js');
const { legalBlocks } = require('../lib/legalBlocks');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const LOCALE = { en: 'en-US', es: 'es', pt: 'pt-BR', fr: 'fr', de: 'de', it: 'it' };
const WEB = fs.readFileSync(path.join(__dirname, '..', 'docs', 'legal', 'privacy-policy-2026-10.md'), 'utf8');

// The website policy, split into its numbered "## N. Title" sections.
function webSections() {
  const out = [];
  let cur = null;
  for (const line of WEB.split('\n')) {
    const m = line.match(/^## (\d+)\. (.+)$/);
    if (m) { cur = { n: Number(m[1]), title: m[2], text: '' }; out.push(cur); continue; }
    if (cur) cur.text += line + '\n';
  }
  return out;
}

// The in-app policy, split into its numbered "N. TITLE" headings (legalBlocks decides
// what the reader shows as a heading, so the check sees what the user sees).
function appSections(lang) {
  const blocks = legalBlocks(translations[lang].settings_privacy_body);
  const out = [];
  let cur = null;
  for (const b of blocks.slice(1)) {
    const m = b.heading && b.text.match(/^(\d+)\. (.+)$/);
    if (m) { cur = { n: Number(m[1]), title: m[2], text: '' }; out.push(cur); continue; }
    if (cur) cur.text += b.text + '\n';
  }
  return { blocks, sections: out };
}

function webDate() {
  const m = WEB.match(/^Last updated: (.+)$/m);
  assert.ok(m, 'the website policy has a "Last updated" line');
  const d = new Date(`${m[1]} UTC`);
  assert.ok(!Number.isNaN(d.getTime()), `parsable date: ${m[1]}`);
  return d;
}

const localDate = (lang, d) => new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);

// Facts every copy of a section must carry, website and app alike (names are not translated).
const FACTS = {
  1: [/Apple/, /Google/],
  2: [/Supabase/],
  4: [/Expo/, /Firebase Cloud Messaging/, /Apple Push Notification service/],
  5: [/Anthropic PBC/],
  6: [/App Store/, /Google Play/, /RevenueCat/],
  7: [/Supabase/],
  9: [/hello@dosetrace\.io/],
  11: [/\b18\b/],
  12: [/hello@dosetrace\.io/],
  14: [/Outcom/, /hello@dosetrace\.io/],
};

// Copy must be true (coordinator 2026-10-15, after the code check): each section names the
// app's own labels for what it describes, in that language, so the text cannot drift from the
// screens. Same labels for the website text (English).
const LABELS = {
  1: ['settings_tracking_peptides', 'settings_tracking_hormones', 'settings_tracking_glp1', 'settings_tracking_oral'], // the profile lists what you track
  7: ['settings_analytics', 'settings_data_privacy'], // the analytics switch, where it lives
  8: ['protocols_recently_deleted', 'settings_delete_forever'], // DL-94: kept until Delete forever
  9: ['settings_export_title'], // "Download my data" exports your records
};

function checkTruth(sections, lang, where) {
  const sec = (n) => sections.find((x) => x.n === n).text;
  for (const [n, keys] of Object.entries(LABELS)) {
    for (const k of keys) {
      const label = translations[lang][k];
      assert.ok(sec(Number(n)).toLowerCase().includes(label.toLowerCase()), `${where} section ${n}: names "${label}" (${k})`);
    }
  }
  // DL-94 / Q6 = A: Recently deleted never empties itself, so no number of days is promised.
  assert.doesNotMatch(sec(8), /\b7\b|\d+\s*(days|días|dias|jours|Tage|giorni)/i, `${where}: no automatic purge after N days`);
  // DL-84 (DV-190): the install id is pseudonymous, so the copy never calls the events anonymous.
  assert.doesNotMatch(sec(7), /anonym|anónim|anônim|anonim/i, `${where}: analytics are "not linked to your account", not "anonymous"`);
}

// The five AI features, as the app itself names them in each language, plus the
// processor role (decisions.md:330: Anthropic is named as the AI sub-processor).
const AI = {
  en: { lab: /lab report/, vaccine: /vaccination card/, vial: /vial label/, food: /AI food log/, assistant: /protocol assistant/, role: /processor/ },
  es: { lab: /análisis de laboratorio/, vaccine: /cartilla de vacunación/, vial: /etiqueta de un vial/, food: /registro de comidas con IA/, assistant: /asistente de protocolos/, role: /encargado del tratamiento/ },
  pt: { lab: /exame de laboratório/, vaccine: /carteira de vacinação/, vial: /rótulo de um frasco/, food: /registro de comida com IA/, assistant: /assistente de protocolo/, role: /operadora/ },
  fr: { lab: /rapport d'analyses/, vaccine: /carnet de vaccination/, vial: /étiquette d'un flacon/, food: /journal alimentaire avec IA/, assistant: /assistant de protocole/, role: /sous-traitant/ },
  de: { lab: /Laborbericht/, vaccine: /Impfpass/, vial: /Fläschchen-Etikett/, food: /KI-Essensprotokoll/, assistant: /Protokoll-Assistent/, role: /Auftragsverarbeiter/ },
  it: { lab: /referto di laboratorio/, vaccine: /libretto vaccinale/, vial: /etichetta di un flacone/, food: /diario alimentare con IA/, assistant: /assistente per i protocolli/, role: /responsabile del trattamento/ },
};

test('the website policy itself has 14 numbered sections, a date, and the facts', () => {
  const web = webSections();
  assert.deepEqual(web.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  webDate();
  for (const [n, pats] of Object.entries(FACTS)) {
    const s = web.find((x) => x.n === Number(n));
    for (const p of pats) assert.match(s.text, p, `web section ${n}`);
  }
  const ai = web.find((s) => s.n === 5).text;
  for (const p of [/lab report/, /vaccination card/, /vial label/, /AI food log/, /protocol assistant/, /processor/]) assert.match(ai, p, 'web AI section');
});

test('the website policy says only what the app does (same rules as the in-app text)', () => {
  const web = webSections();
  checkTruth(web, 'en', 'web');
  assert.doesNotMatch(WEB, /you choose what to fill in|future product|show the change in the app/i);
  assert.doesNotMatch(WEB, /Your real numbers/, 'the English app calls it "Reality check"');
});

for (const lang of LANGS) {
  test(`${lang}: in-app policy has the website's title, date and 14 sections in order`, () => {
    const { blocks, sections } = appSections(lang);
    assert.equal(blocks[0].heading, true);
    assert.equal(blocks[0].text, translations[lang].settings_privacy_policy.toLocaleUpperCase(lang), 'opens on the policy name');
    assert.equal(blocks[1].heading, false);
    assert.ok(blocks[1].text.includes(localDate(lang, webDate())), `${lang}: dated ${localDate(lang, webDate())} like the website, got "${blocks[1].text}"`);
    assert.deepEqual(sections.map((s) => s.n), webSections().map((s) => s.n), `${lang}: the same numbered sections`);
    for (const s of sections) assert.ok(s.text.trim().length > 0, `${lang} section ${s.n} has text`);
  });

  test(`${lang}: each section carries the website section's facts`, () => {
    const { sections } = appSections(lang);
    for (const [n, pats] of Object.entries(FACTS)) {
      const s = sections.find((x) => x.n === Number(n));
      assert.ok(s, `${lang} section ${n}`);
      for (const p of pats) assert.match(s.text, p, `${lang} section ${n}: ${p}`);
    }
    checkTruth(sections, lang, lang);
  });

  test(`${lang}: the AI section names Anthropic and every AI feature`, () => {
    const ai = appSections(lang).sections.find((x) => x.n === 5).text;
    for (const [what, p] of Object.entries(AI[lang])) assert.match(ai, p, `${lang} AI section: ${what}`);
    assert.match(ai, /Anthropic PBC/);
  });
}

test('no copy keeps the old April 2026 text or a partnership promise', () => {
  for (const lang of LANGS) {
    const body = translations[lang].settings_privacy_body;
    assert.doesNotMatch(body, /April|abril|avril|aprile/i, lang);
    assert.doesNotMatch(body, /partnership|parcerias|partenariats|Partnerschaften/i, lang);
    assert.doesNotMatch(body, /future product|futuro produto|futuro producto|futur produit|zukünftiges Produkt|futuro prodotto/i, lang);
  }
});
