'use strict';
// Founder 2026-10-02: Today's dose button wrapped to two lines in Portuguese ("Marcar como
// concluída") and French ("Marquer comme effectuée"). The button is two thirds of the action
// row next to Skip (gap 10), 16 pt padding each side, 17 pt bold text. Row = screen - 2 x 16
// card margin - 2 x 18 card padding, so the text has 178 pt on a 393 pt iPhone and 166 pt on a
// 375 pt iPhone. The button now says a short natural verb; the notification action and the
// dose-log choice keep the full "mark as complete" wording (they have room).
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

const WANT = { en: 'Mark complete', es: 'Completar', pt: 'Concluir', fr: "C'est fait", de: 'Erledigt', it: 'Completa' };
// SF Pro 17 pt bold widths (NSFont systemFont 17 bold).
const MEASURED = { 'Mark complete': 121.6, 'Completar': 85.8, 'Concluir': 68.3, "C'est fait": 74.0, 'Erledigt': 63.7, 'Completa': 78.8 };
const room = (screen) => ((screen - 2 * 16 - 2 * 18) - 10) * 2 / 3 - 2 * 16;

test('the dose button label in six languages', () => {
  for (const [l, v] of Object.entries(WANT)) assert.equal(tr[l].today_mark_taken, v, l);
});

test('the dose button fits one line on a 375 pt and a 393 pt iPhone', () => {
  assert.ok(Math.abs(room(393) - 178) < 0.1 && Math.abs(room(375) - 166) < 0.1);
  for (const l of Object.keys(WANT)) {
    const w = MEASURED[tr[l].today_mark_taken];
    assert.ok(w != null, `${l}: measured`);
    assert.ok(w <= room(375), `${l}: ${w} pt over ${room(375).toFixed(1)}`);
  }
});

test('the notification action and the dose-log choice keep the full wording', () => {
  const full = { en: 'Mark complete', es: 'Marcar como completada', pt: 'Marcar como concluída', fr: 'Marquer comme effectuée', de: 'Als erledigt markieren', it: 'Segna come completata' };
  for (const [l, v] of Object.entries(full)) {
    assert.equal(tr[l].notif_action_complete, v, l);
    assert.equal(tr[l].log_mark_taken, v, l);
  }
});
