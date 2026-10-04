'use strict';
// Pre-build pass 2026-10-03, M3: Today's Skip button wrapped mid-word in German
// ("Überspringe / n", shot 249). The Skip button is one third of the action row next to the
// take button (flex 1 : 2, gap 10), 16 pt padding each side, 17 pt bold text. Row = screen −
// 2 × 16 card margin − 2 × 18 card padding: the text has 67 pt on a 375 pt iPhone and 73 pt on a
// 393 pt iPhone. German says "Auslassen" (natural for a dose: "eine Dosis auslassen"); the label
// keeps one line and may shrink to 0.8 like the shared SegmentedBar's long labels (founder
// 2026-10-02), so it can never break inside a word. The Skip sheet says the same verb.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function load() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const tr = load();

const WANT = { en: 'Skip', es: 'Omitir', pt: 'Pular', fr: 'Passer', de: 'Auslassen', it: 'Salta' };
// SF Pro 17 pt bold widths (NSFont systemFont 17 bold, same method as todayTakeButtonFit).
const MEASURED = { Skip: 35.9, Omitir: 50.8, Pular: 42.4, Passer: 55.3, Auslassen: 83.4, Salta: 41.3,
  Skipped: 66.8, Omitida: 64.1, Pulada: 55.7, 'Sautée': 56.8, Ausgelassen: 103.7, Saltata: 57.4 }; // DE pending: Ausgelassen (one term, round 2)
const MIN_SCALE = 0.8;
const skipRoom = (screen) => ((screen - 2 * 16 - 2 * 18) - 10) / 3 - 2 * 16;
// "Pending from yesterday": two equal buttons in the pending card (margin 16, padding 16).
const pendRoom = (screen) => ((screen - 2 * 16 - 2 * 16) - 10) / 2 - 2 * 16;

test('the Skip label in six languages', () => {
  for (const [l, v] of Object.entries(WANT)) assert.equal(tr[l].today_skip, v, l);
});

test('the Skip label fits one line on a 375 pt iPhone (at most the 0.8 shrink)', () => {
  assert.ok(Math.abs(skipRoom(375) - 67) < 0.1 && Math.abs(skipRoom(393) - 73) < 0.1);
  for (const l of Object.keys(WANT)) {
    const w = MEASURED[tr[l].today_skip];
    assert.ok(w != null, `${l}: measured`);
    assert.ok(w * MIN_SCALE <= skipRoom(375), `${l}: ${w} pt × ${MIN_SCALE} over ${skipRoom(375).toFixed(1)}`);
  }
  // Only German needs the shrink; the others fit at full size.
  for (const l of ['en', 'es', 'pt', 'fr', 'it']) assert.ok(MEASURED[tr[l].today_skip] <= skipRoom(375), l);
});

test('the pending-from-yesterday skip label fits its half of the row at full size', () => {
  for (const l of Object.keys(WANT)) {
    const w = MEASURED[tr[l].today_pending_skip];
    assert.ok(w != null, `${l}: measured ${tr[l].today_pending_skip}`);
    assert.ok(w <= pendRoom(375), `${l}: ${w} over ${pendRoom(375)}`);
  }
});

test('the Skip text keeps one line and may shrink to 0.8, never wraps inside a word', () => {
  const src = fs.readFileSync(path.join(__dirname, '../screens/TodayScreen.js'), 'utf8');
  const uses = src.match(/<Text style=\{s\.btnSkipText\}[^>]*>/g) || [];
  assert.ok(uses.length >= 2, 'dose card and pending card');
  for (const u of uses) {
    assert.match(u, /numberOfLines=\{1\}/, u);
    assert.match(u, /adjustsFontSizeToFit/, u);
    assert.match(u, /minimumFontScale=\{0\.8\}/, u);
  }
});

test('the German Skip sheet uses the same verb as the button', () => {
  assert.match(tr.de.today_skip_title, /auslassen/);
  assert.match(tr.de.today_skip_confirm, /auslassen/);
});
