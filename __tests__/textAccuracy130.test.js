'use strict';
// Council fix 5 (founder 2026-10-16, docs/decisions.md "founder answers to the council delta"):
// text accuracy in 6 languages, each written natively with the same meaning.
//   a. the reality check ESTIMATES the calories you burn from your own numbers, never "measures";
//   b. the 7-day free trial is for eligible new subscribers only (lib/paywallPlans trialOf: iOS
//      eligibility check, Android only an eligible free phase) — the upgrade screen shows it;
//   c. Apple's current term is "Apple Account" (localized), never "Apple ID";
//   d. the Terms changed, so they are dated October 2026;
//   e. privacy policy §5: Anthropic deletes what was sent within 30 days, keeping it longer only
//      where needed to enforce its usage policy or the law — app x6 and the website copies alike;
//   f. the onboarding AI line names the protocol assistant too (the consent sheet already does).
// (g: no Face ID text, h: English serial comma in the permission texts -> storeLocales.test.js.)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../lib/paywallPlans');

const ROOT = path.join(__dirname, '..');
function load() {
  const src = fs.readFileSync(path.join(ROOT, 'i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const tr = load();
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const qs = (l) => tr[l].faq_categories.flatMap((c) => c.questions);
const idx = (re) => qs('en').findIndex((q) => re.test(q.q));
const str = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

test('5a: the FAQ reality-check answer says it estimates, never measures', () => {
  const i = idx(/reality check/i);
  assert.ok(i >= 0);
  const EST = { en: /\bestimates\b/, es: /\bEstiman\b/, pt: /\bestimam\b/, fr: /\bestiment\b/, de: /\bschätz/, it: /\bStimano\b/ };
  const MEASURE = /measur|\bmid(e|en)\b|\bmedem?\b|mesur|\bmiss(t|en)\b|\bmess(t|en)\b|misura/i;
  for (const l of LANGS) {
    const a = qs(l)[i].a;
    assert.match(a, EST[l], `${l}: estimates`);
    assert.doesNotMatch(a, MEASURE, `${l}: no "measure"`);
  }
});

test('5b: the FAQ price answer offers the 7-day trial to eligible new subscribers only', () => {
  const i = idx(/How much/i);
  assert.ok(i >= 0);
  const NEW = { en: /New subscribers/, es: /nuevos suscriptores/i, pt: /Novos assinantes/, fr: /nouveaux abonnés/i, de: /Neue Abonnent/, it: /nuovi abbonati/i };
  const SHOWS = { en: /shows whether it applies to you/, es: /te muestra si/, pt: /mostra se/, fr: /vous indique s/, de: /siehst du, ob/, it: /ti mostra se/ };
  const OLD = /Both plans include|Ambos planes incluyen|Ambos os planos incluem|Les deux formules incluent|Bei beiden Plänen kannst du|Entrambi i piani includono/;
  for (const l of LANGS) {
    const a = qs(l)[i].a;
    assert.match(a, /7/, `${l}: 7 days`);
    assert.match(a, NEW[l], `${l}: new subscribers`);
    assert.match(a, SHOWS[l], `${l}: the upgrade screen shows whether it applies`);
    assert.doesNotMatch(a, OLD, `${l}: no unconditional trial`);
  }
  // The rule the text describes (lib/paywallPlans trialOf): iOS unknown eligibility claims no trial.
  const pkg = { product: { identifier: 'yearly', introPrice: { price: 0, periodNumberOfUnits: 7, periodUnit: 'DAY', cycles: 1 } } };
  assert.equal(P.trialOf(pkg, null, 'ios'), null, 'iOS without an eligibility answer: no trial claimed');
});

test('5c: Apple\'s current term "Apple Account" (localized) — no "Apple ID" anywhere in the app texts', () => {
  const OLD = /Apple ID|Apple-ID|ID de Apple|ID Apple|identifiant Apple/i;
  for (const l of LANGS) for (const [k, v] of Object.entries(tr[l])) assert.doesNotMatch(str(v), OLD, `${l}.${k}`);
  const NAME = { en: 'Apple Account', es: 'Cuenta de Apple', pt: 'Conta Apple', fr: 'compte Apple', de: 'Apple Account', it: 'Account Apple' };
  for (const l of LANGS) {
    const t = (k) => tr[l][k];
    assert.equal(P.storeName('ios', t), NAME[l], `${l} iOS store account`);
    assert.match(P.storeName('android', t), /Google Play/, `${l} Android store account`);
    assert.ok(tr[l].settings_delete_apple_revoke_note.includes(NAME[l]), `${l}: Sign in with Apple note`);
    for (const k of ['paywall_legal', 'paywall_legal_no_trial', 'paywall_cancel_sub_msg']) {
      for (const os of ['ios', 'android']) {
        const s = tr[l][k].replace(/\{store\}/g, P.storeName(os, t));
        assert.doesNotMatch(s, /account account|Account account|Konto-Konto|Account-Konto|compte compte/i, `${l}.${k} ${os}`);
        assert.doesNotMatch(s, /\{store\}/);
      }
    }
  }
  assert.equal(tr.en.paywall_legal.replace(/\{store\}/g, P.storeName('ios', (k) => tr.en[k])).startsWith('Payment is charged to your Apple Account when'), true);
  assert.equal(P.storeName('ios'), 'Apple Account', 'without t: English');
  assert.equal(P.storeName('android'), 'Google Play account');
});

test('5d: the Terms are dated October 2026 in 6 languages', () => {
  const DATE = { en: 'Last updated: October 2026', es: 'Última actualización: octubre de 2026', pt: 'Última atualização: outubro de 2026', fr: 'Dernière mise à jour : octobre 2026', de: 'Zuletzt aktualisiert: Oktober 2026', it: 'Ultimo aggiornamento: ottobre 2026' };
  for (const l of LANGS) assert.equal(tr[l].settings_terms_body.split('\n\n')[1], DATE[l], l);
});

test('5e: privacy §5 — Anthropic deletes within 30 days, longer only to enforce its usage policy or the law (app x6 + website en/pt)', () => {
  const sec5 = (body) => { const b = body.split('\n\n'); const i = b.findIndex((x) => /^(## )?5\. /.test(x)); return b.slice(i + 1).join('\n\n').split(/\n\n(## )?6\. /)[0]; };
  const LAW = { en: /usage policy.*law/, es: /política de uso.*ley/, pt: /política de uso.*lei/, fr: /politique d'utilisation.*loi/, de: /Nutzungsrichtlinie.*gesetzlich/, it: /politica di utilizzo.*legge/ };
  const BRIEF = /only briefly|abuse monitoring|breve tiempo|pouco tempo|monitoramento de abuso|que brièvement|nur kurz|breve periodo/i;
  const docs = {
    en: fs.readFileSync(path.join(ROOT, 'docs/legal/privacy-policy-2026-10.md'), 'utf8'),
    pt: fs.readFileSync(path.join(ROOT, 'docs/legal/privacy-policy-2026-10.pt.md'), 'utf8').split('\n---\n').slice(1).join('\n---\n'),
  };
  const texts = LANGS.map((l) => [l, l, tr[l].settings_privacy_body]).concat([['web en', 'en', docs.en], ['web pt', 'pt', docs.pt]]);
  for (const [where, l, body] of texts) {
    const s = sec5(body);
    assert.match(s, /Anthropic/, where);
    assert.match(s, /\b30\b/, `${where}: 30 days`);
    assert.match(s, LAW[l], `${where}: longer only for its usage policy or the law`);
    assert.doesNotMatch(s, BRIEF, `${where}: the old "briefly, for abuse monitoring" is gone`);
  }
});

test('5f: the onboarding AI line names the protocol assistant (like the consent sheet)', () => {
  const AS = { en: /protocol assistant/, es: /asistente de protocolos/, pt: /assistente de protocolos/, fr: /assistant de protocole/, de: /Protokoll-Assistent/, it: /assistente dei protocolli/ };
  for (const l of LANGS) {
    assert.match(tr[l].ob_term3_d, AS[l], `${l} ob_term3_d`);
    assert.match(tr[l].ai_consent_body, AS[l], `${l} consent sheet (already)`);
    assert.match(tr[l].ob_term3_d, /Anthropic/, l);
  }
});
