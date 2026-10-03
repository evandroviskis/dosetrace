'use strict';
// Fixes from the separate-context reviews of the AI protocol assistant (2026-10-03):
// regulatory-privacy B1 (consent), B2 (no pre-filtered syringe sizes), B3 (explainer split
// sets the spacing, no green verdict), S3/S4/S6 (wording), S5 (advice + value), N6 (retention).
// Each test was red before its fix.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../lib/protocolAssistant');
const { renderText } = require('../lib/assistantText');
const { newProtocolForm } = require('../lib/protocolForm');
const PROMPT = require('../supabase/functions/protocol-assistant/prompt.ts');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const src = read('i18n', 'translations.js').replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };';
const mod = { exports: {} }; new Function('module', 'exports', src)(mod, mod.exports);
const TR = mod.exports.translations;
const NOW = new Date(2026, 9, 3, 10, 0);
const CATALOG = { recon: [{ key: 'lyo_nad_plus', label: 'NAD+' }], rtu: [{ key: 'rtu_testosterone_cypionate', label: 'Testosterone Cypionate' }], oral: [] };
const start = (lang = 'en') => A.startConversation('build', newProtocolForm(NOW), { language: lang, now: NOW, catalog: CATALOG });
const say = (s, text, raw) => A.answerText(s, text, raw === undefined ? A.localUnderstand(A.textStep(s), text, s.language) : raw);
const tap = (s, id) => { const n = A.answerOption(s, id); assert.notEqual(n, s, `${id} offered at ${s.step}`); return n; };
const opts = (s) => A.options(s).map((o) => (o.text != null ? o.text : renderText((k) => TR[s.language][k], o.key, o.params)));
function nad(lang = 'en') {
  let s = start(lang);
  s = say(s, 'nad', { intent: 'answer', compound: 'nad', form: 'powder' });
  s = say(s, lang === 'en' ? '1000 mg' : '1.000 mg');
  s = say(s, '7 ml');
  return tap(s, 'day:0');
}

test('B2: after the facts, the user picks their own syringe from the whole list (no pre-filtered sizes)', () => {
  let s = say(start(), 'test cyp', { intent: 'answer', compound: 'test cyp', form: 'ready' });
  s = say(s, '250 mg/ml, 10 ml', { intent: 'answer', conc: { text: '250', unit: 'mg' }, vial_ml: { text: '10' } });
  s = say(s, '420 mg once a week', { intent: 'answer', dose: { text: '420', unit: 'mg' }, basis: 'each', period: 'week', count: 1 });
  s = tap(s, 'basis:each');
  assert.equal(s.step, 'fit_facts');
  assert.deepEqual(opts(s), ['Choose my syringe', 'Enter different numbers', 'Continue in the form']);
  s = tap(s, 'redo:syringe');
  assert.equal(s.step, 'syringe');
  assert.deepEqual(opts(s), ['0.3 ml · 30 u', '0.5 ml · 50 u', '1 ml · 100 u', '2 ml', '3 ml', '5 ml']);
  s = tap(s, 'syr:300');
  assert.equal(s.step, 'start');
  const p = tap(say(nad(), '240 mg'), 'basis:each');
  assert.deepEqual(opts(p), ['Enter different numbers', 'Continue in the form'], 'a powder has no larger syringes');
  assert.ok(!Object.keys(TR.en).includes('ap_opt_use_syringe'), 'the pre-filtered "I use a … syringe" option is gone');
});

test('S5: "250 mcg, is that ok?" is deflected even when the AI returned a value; nothing is taken', () => {
  for (const [lang, text] of [['en', '250 mcg, is that ok?'], ['pt', '250 mcg, é seguro?'], ['es', '250 mcg ¿está bien?'],
    ['fr', '250 mcg, c\'est trop ?'], ['de', '250 mcg, ist das zu viel?'], ['it', '250 mcg, va bene?']]) {
    const s = say(nad(lang), text, { intent: 'answer', dose: { text: '250', unit: 'mcg' }, basis: 'each' });
    assert.equal(s.draft.dose, null, lang);
    assert.ok(s.messages.some((m) => m.kind === 'deflect'), lang);
    assert.equal(s.step, 'dose', lang);
  }
  const ok = say(nad(), '240 mg?', { intent: 'answer', dose: { text: '240', unit: 'mg' } });
  assert.equal(ok.step, 'period', 'a bare "?" is not advice');
  assert.match(PROMPT.SYSTEM, /"advice" whenever the answer also asks/);
});

test('S3 / S4 / S6: the deflection, the not-mixed line and the German caveat', () => {
  for (const lang of ['en', 'pt', 'es', 'fr', 'de', 'it']) {
    assert.doesNotMatch(TR[lang].ap_not_mixed, /supplier|fornecedor|proveedor|fournisseur|Lieferant|fornitore|bula|Packungsbeilage/i, lang);
    assert.match(TR[lang].ap_deflect, /healthcare provider|profissional|profesional|professionnel|Fachperson|professionista/i, lang);
  }
  assert.match(TR.en.ap_deflect, /safe or right for you/);
  assert.match(TR.de.ap_caveat, /schlägt nie eine Substanz oder eine Dosis vor/);
});

test('B1: the shared AI consent is v4 and names the protocol assistant in 6 languages; the policy says so', () => {
  assert.match(read('lib', 'aiConsent.js'), /const CONSENT_KEY = 'dosetrace_ai_extraction_consent_v4';/);
  const words = { en: /protocol assistant/, es: /asistente de protocolos/, pt: /assistente de protocolos/, fr: /assistant de protocole/, de: /Protokoll-Assistenten/, it: /assistente dei protocolli/ };
  for (const [l, re] of Object.entries(words)) assert.match(TR[l].ai_consent_body, re, l);
  const policy = read('web', 'privacy-policy.html');
  assert.match(policy, /protocol assistant/);
  assert.doesNotMatch(policy, /per-feature consent/);
});

test('B3: an explainer split asks how the doses are spread; the rows show the draw, never a green verdict', () => {
  const SCREEN = read('screens', 'ProtocolsScreen.js');
  const FX = read('screens', 'components', 'FitExplainer.js');
  const at = SCREEN.indexOf('function chooseSplit(');
  assert.ok(at > 0);
  const fn = SCREEN.slice(at, at + 2400);
  assert.match(fn, /spacingOptions\(\{ period: 'week', count: n \}\)/);
  assert.match(fn, /handleIntervalChange\(/);
  assert.match(SCREEN, /onSplit=\{chooseSplit\}/);
  assert.doesNotMatch(FX, /s\.fits|s\.noFit|c\.ok/);
  assert.match(FX, /onPress=\{\(\) => onSplit\(sp\.each, sp\.n\)\}/);
  const { explainerModel } = require('../lib/fitExplainer');
  const m = explainerModel({ ...newProtocolForm(NOW), type: 'recon', amount: '1000', water: '7', dose: '240', syringeSize: 100 }, 'en');
  assert.deepEqual(m.splits.map((x) => x.drawValue), ['84.0', '56.0', '24.0']);
});

test('N6: usage rows older than 30 days are deleted (storage limitation)', () => {
  assert.match(read('supabase', 'functions', 'protocol-assistant', 'index.ts'), /\.from\('ai_assistant_usage'\)\.delete\(\)\.eq\('user_id', user\.id\)\.lt\('created_at', new Date\(nowMs - 30 \* 86400000\)\.toISOString\(\)\)/);
});
