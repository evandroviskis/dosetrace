'use strict';
// Council fix 7 (founder 2026-10-16): store metadata for 1.3.0, no build needed.
//  - store/whats-new-1.3.0.json: the top-level texts stay for Google Play; an "ios" variant x6
//    drops the "Android: more reliable reminders" line (Apple 2.3.10: no other platform named) and
//    says instead that permission prompts now appear in your language (A-130 locales), written
//    natively; each text <= 500 characters; English serial comma.
//  - store/screenshots/captions.json caption 06 subline: "Describe what you ate" (en), "Décrivez"
//    (fr), "Beschreib" (de); pt / es / it already mean "tell" and stay.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const WN = JSON.parse(fs.readFileSync(path.join(ROOT, 'store/whats-new-1.3.0.json'), 'utf8'));
const CAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'store/screenshots/captions.json'), 'utf8'));
const LANGS = ['pt', 'en', 'es', 'fr', 'de', 'it'];
const bullets = (s) => s.split('\n');

const PERMS = {
  pt: '• Os pedidos de permissão agora aparecem no seu idioma.',
  en: '• Permission prompts now appear in your language.',
  es: '• Permisos: ahora en tu idioma.',
  fr: "• Autorisations : dans votre langue.",
  de: '• Berechtigungen: jetzt in deiner Sprache.',
  it: '• Autorizzazioni: ora nella tua lingua.',
};

test('council fix 7: Google Play keeps its texts (with the Android line); the App Store gets an iOS variant x6', () => {
  assert.ok(WN.ios && typeof WN.ios === 'object', 'an "ios" block');
  for (const l of LANGS) {
    const play = WN[l];
    const ios = WN.ios[l];
    assert.equal(typeof play, 'string', `${l} Play`);
    assert.equal(typeof ios, 'string', `${l} iOS`);
    assert.match(play, /Android/, `${l}: Play keeps the Android line`);
    assert.doesNotMatch(ios, /Android|Google/, `${l}: iOS names no other platform`);
    assert.ok(play.length <= 500 && ios.length <= 500, `${l}: <= 500 chars (${play.length}, ${ios.length})`);
    // Same notes, one line swapped: the Android line becomes the permission-language line.
    const P = bullets(play);
    const I = bullets(ios);
    assert.equal(I.length, P.length, `${l}: same number of lines`);
    const ai = P.findIndex((b) => /Android/.test(b));
    assert.equal(I[ai], PERMS[l], `${l}: the permission line in the Android line's place`);
    P.forEach((b, i) => { if (i !== ai) assert.equal(I[i], b, `${l} line ${i + 1} identical`); });
  }
});

test('council fix 7: English What\'s New uses the serial comma (both stores)', () => {
  for (const s of [WN.en, WN.ios.en]) {
    assert.match(s, /lab tests, vaccines, and dose accumulation/);
    assert.doesNotMatch(s, /vaccines and dose accumulation/);
  }
});

test('council fix 7: caption 06 says "describe" in en / fr / de; pt / es / it keep "tell"', () => {
  const s06 = (l) => CAP[l].find((c) => c.file === '06_food').s;
  assert.equal(s06('en'), 'Describe what you ate and AI writes down the calories and protein. You can fix any number.');
  assert.equal(s06('fr'), "Décrivez ce que vous avez mangé et l'IA note les calories et les protéines. Vous corrigez n'importe quel chiffre.");
  assert.equal(s06('de'), 'Beschreib, was du gegessen hast, und die KI notiert Kalorien und Protein. Jede Zahl kannst du korrigieren.');
  assert.match(s06('pt'), /^Conte o que comeu/);
  assert.match(s06('es'), /^Cuenta lo que comiste/);
  assert.match(s06('it'), /^Racconta cosa hai mangiato/);
});
