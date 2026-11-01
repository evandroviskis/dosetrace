'use strict';
// DV-192 / A-90 option A (founder 2026-11-01, docs/design/rodada2-conta-exames.html #dv192): both
// target lines name the WHO BMI range 18.5–24.9 instead of calling it "healthy" — the app states
// the range, never judges the person's target. Numbers in each language's decimal style.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadTranslations() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const T = loadTranslations();
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const KEYS = ['cal_tgt_below_range', 'cal_tgt_healthy'];
const JUDGEMENT = /healthy|saludable|saud[aá]vel|saine?\b|gesund|sana\b/i;

test('DV-192: pt reads exactly as approved', () => {
  assert.equal(T.pt.cal_tgt_below_range, 'Esta meta fica abaixo da faixa de IMC de 18,5 a 24,9 (OMS) para sua altura: {min}–{max} {unit}.');
  assert.equal(T.pt.cal_tgt_healthy, 'Faixa de IMC de 18,5 a 24,9 (OMS) para sua altura: {min}–{max} {unit}.');
});

test('DV-192: every language names the WHO BMI range in its own decimal style, no "healthy" judgement', () => {
  for (const l of LANGS) {
    const [lo, hi] = l === 'en' ? ['18.5', '24.9'] : ['18,5', '24,9'];
    for (const k of KEYS) {
      const s = T[l][k];
      assert.ok(typeof s === 'string' && s.length > 0, `${l}.${k} missing`);
      assert.ok(s.includes(lo) && s.includes(hi), `${l}.${k} names ${lo}–${hi}: ${s}`);
      assert.ok(/WHO|OMS/.test(s), `${l}.${k} names the WHO: ${s}`);
      assert.ok(/BMI|IMC/.test(s), `${l}.${k} says BMI: ${s}`);
      assert.ok(!JUDGEMENT.test(s), `${l}.${k} has no "healthy" judgement: ${s}`);
      for (const p of ['{min}', '{max}', '{unit}']) assert.ok(s.includes(p), `${l}.${k} keeps ${p}`);
    }
  }
});
