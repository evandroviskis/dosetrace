// dosetrace.io shows the app as it is in the stores (founder 2026-11-02: "O website ainda está com os
// screenshots incorretos"). The gallery uses the same seven real captures as the App Store / Google Play
// slides (store/screenshots/raw/en on redesign/graduated), with the store headlines as captions in all six
// languages, and no caption names a screen the app no longer has.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'web');
const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const i18n = fs.readFileSync(path.join(WEB, 'i18n.js'), 'utf8');

const SHOTS = ['01-curve', '02-today', '03-doses', '04-progress', '05-labs', '06-food', '07-reminders'];

// Store headlines (store/screenshots/captions.json, h without the cobalt markers).
const CAPS = {
  en: ['See how your doses add up', 'Every dose today, at a glance', 'Syringe math, done for you', 'Your real numbers', 'Every lab result on one chart', 'Log meals in your own words', 'Reminders that actually arrive'],
  es: ['Mira cómo se suman tus dosis', 'Las dosis del día de un vistazo', 'La cuenta de la jeringa, ya hecha', 'Tus cifras reales', 'Todos tus análisis en un gráfico', 'Registra comidas con tus palabras', 'Recordatorios que sí llegan'],
  pt: ['Veja suas doses se somarem', 'As doses do dia num relance', 'A conta da seringa, já feita', 'Seus números reais', 'Todos os exames num só gráfico', 'Registre refeições com suas palavras', 'Lembretes que chegam de verdade'],
  fr: ["Voyez vos doses s'additionner", "Les doses du jour en un coup d'œil", 'Le calcul de la seringue, déjà fait', 'Vos vrais chiffres', 'Toutes vos analyses sur un graphique', 'Notez vos repas avec vos mots', 'Des rappels qui arrivent vraiment'],
  de: ['Sieh, wie sich deine Dosen summieren', 'Alle Dosen des Tages auf einen Blick', 'Die Spritzenrechnung, schon erledigt', 'Deine echten Zahlen', 'Alle Laborwerte in einem Diagramm', 'Mahlzeiten in deinen Worten', 'Erinnerungen, die wirklich ankommen'],
  it: ['Guarda come le dosi si sommano', "Le dosi del giorno a colpo d'occhio", 'Il calcolo della siringa, già fatto', 'I tuoi numeri reali', 'Tutti gli esami in un grafico', 'Registra i pasti con parole tue', 'Promemoria che arrivano davvero'],
};
const LANG_ORDER = ['en', 'es', 'pt', 'fr', 'de', 'it'];

// Each language block keeps its captions on one line: cap0: '…', cap1: "…", …
function captionLines() {
  return i18n.split('\n').filter((l) => /\bcap0:/.test(l)).map((l) => {
    const out = {};
    for (const m of l.matchAll(/\b(cap\d):\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) out[m[1]] = (m[2] !== undefined ? m[2] : m[3]).replace(/\\'/g, "'");
    return out;
  });
}

test('gallery shows the seven store captures in store order, each file present', () => {
  const srcs = [...html.matchAll(/<figure class="shot">[\s\S]*?<img src="\/assets\/shots\/([^"]+)\.jpg"/g)].map((m) => m[1]);
  assert.deepStrictEqual(srcs, SHOTS);
  for (const s of SHOTS) assert.ok(fs.existsSync(path.join(WEB, 'assets', 'shots', s + '.jpg')), s + '.jpg missing');
  const caps = [...html.matchAll(/data-i18n="(cap\d)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(caps, SHOTS.map((_, i) => 'cap' + i));
});

test('hero phone shows the current Today capture', () => {
  assert.match(html, /class="phone-screen"><img src="\/assets\/shots\/02-today\.jpg"/);
});

test('no old screenshot is left behind (replace, never pile up)', () => {
  const files = fs.readdirSync(path.join(WEB, 'assets', 'shots')).sort();
  assert.deepStrictEqual(files, SHOTS.map((s) => s + '.jpg').sort());
});

test('captions are the store headlines in all six languages', () => {
  const lines = captionLines();
  assert.strictEqual(lines.length, 6);
  LANG_ORDER.forEach((lang, li) => {
    CAPS[lang].forEach((cap, i) => assert.strictEqual(lines[li]['cap' + i], cap, `${lang} cap${i}`));
    assert.strictEqual(lines[li].cap7, undefined);
  });
});

// The app calls the Reality check "Seus números reais" / "Tus cifras reales" / "Vos vrais chiffres" /
// "Deine echten Zahlen" / "I tuoi numeri reali" (founder 2026-10-02); the site uses the same term.
test('site names the Reality check with the app term in every language', () => {
  assert.doesNotMatch(i18n, /teste de realidade|chequeo real|bilan réel|Realitäts-Check|check di realtà/i);
  for (const term of ['Seus números reais', 'Tus cifras reales', 'Vos vrais chiffres', 'Deine echten Zahlen', 'I tuoi numeri reali']) {
    assert.ok((i18n.match(new RegExp(term, 'gi')) || []).length >= 2, term);
  }
});

test('site copy says one phone at a time (no multi-device sync)', () => {
  assert.doesNotMatch(i18n, /across your devices|multi-device|multidispositivo|entre seus aparelhos|en tus dispositivos/);
});
