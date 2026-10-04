'use strict';
// Pre-build pass 2026-10-03 (round 2): one term per concept in German. The Skip button and sheet
// say "Auslassen" / "Dosis auslassen?" (M3), so a skipped DOSE is "ausgelassen" everywhere it is
// named: Today (pending row, the skipped line, the yesterday-or-today question), the Dose log
// (filter, count, status, the Missed choice) and the adherence report. Words that skip something
// else keep their own verb (site picker "Überspringen" per grok/036, a lab value or a vaccine
// entry that could not be read, the food question, "skip for now").
// Fit: the Dose log filter (four segments of the shared bar, 15 pt, chosen 700, shrink to 0.8)
// on a 375 pt iPhone; the pending row's half-width button (17 pt bold).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
const de = mod.exports.translations.de;

const DOSE_SKIP = ['today_pending_skip', 'today_pending_prompt_today', 'log_skipped', 'log_status_skipped', 'log_mark_skipped', 'today_skipped_today', 'report_outcome_line', 'today_skip', 'today_skip_title', 'today_skip_confirm'];

test('German names a skipped dose with one verb: auslassen / ausgelassen', () => {
  for (const k of DOSE_SKIP) {
    assert.doesNotMatch(de[k], /berspr/i, `${k}: ${de[k]}`);
    assert.match(de[k], /[Aa]us(ge)?lass/, `${k}: ${de[k]}`);
  }
  assert.equal(de.log_skipped, 'Ausgelassen');
  assert.equal(de.log_status_skipped, 'Dosis ausgelassen');
  assert.equal(de.today_pending_skip, 'Ausgelassen');
});

test('other kinds of skipping keep their own word', () => {
  assert.equal(de.today_pick_site_skip, 'Überspringen'); // founder grok/036: the site picker's Skip
  assert.match(de.blood_dropped_title, /übersprungen/);
});

// SF Pro widths (NSFont systemFont), measured: 15 pt bold / 15 pt medium, 17 pt bold.
const W15_BOLD = { Alle: 27.9, Erledigt: 57.4, Ausgelassen: 93.1, Verpasst: 65.2 };
const W15_MED = { Ausgelassen: 88.9 };
const W17_BOLD = { Ausgelassen: 103.7 };

test('the Dose log filter fits on a 375 pt iPhone, chosen segment included (0.8 shrink)', () => {
  const bar = fs.readFileSync(path.join(__dirname, '../components/SegmentedBar.js'), 'utf8');
  const padH = Number((bar.match(/item: \{[^}]*paddingHorizontal: (\d+)/) || [])[1]);
  const width = 375 - 2 * 16; // the Dose log list padding
  const room = (width - 2 * 3 - 3 * 2) / 4 - 2 * padH - 2 * 1; // track padding, gaps, item padding, ring
  for (const k of ['log_all', 'log_taken', 'log_skipped', 'log_missed']) {
    const w = W15_BOLD[de[k]];
    assert.ok(w != null, `${k}: measured "${de[k]}"`);
    assert.ok(w * 0.8 <= room, `${k}: ${w} × 0.8 over ${room.toFixed(1)}`);
  }
  assert.ok(W15_MED.Ausgelassen * 0.8 <= room);
});

test('the pending row\'s "Ausgelassen" button fits its half of the row at full size', () => {
  const pendRoom = ((375 - 2 * 16 - 2 * 16) - 10) / 2 - 2 * 16;
  assert.ok(W17_BOLD[de.today_pending_skip] <= pendRoom);
});
