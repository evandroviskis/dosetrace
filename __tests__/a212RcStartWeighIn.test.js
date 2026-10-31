// A-212 (Q12 / OPEN-07 = C, founder 2026-10-15; picture approved 2026-10-31 "Aprovo, pode seguir",
// docs/design/a212-rc-start-weighin.html). The weight a reality check starts with IS that day's
// weigh-in: a different number asks "Atualizar a pesagem de {date}?" and, on Update, corrects that
// day's weigh-in in place (one weight per day); the same number starts straight away; Cancel keeps
// the start sheet with the typed number. Found on the Fold 2026-10-31: weigh-in 80,0 and a check
// started at 79,4 on the same day (the start skipped an existing weigh-in).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const { startWeighInChoice } = require('../lib/weighInEdit');

test('A-212: no weigh-in that day → the start writes the first one', () => {
  assert.equal(startWeighInChoice(null, 79.4, 'metric'), 'new');
  assert.equal(startWeighInChoice({ weight_kg: null }, 79.4, 'metric'), 'new');
});

test('A-212: the same number as that day\'s weigh-in starts straight away (as shown, metric and imperial)', () => {
  assert.equal(startWeighInChoice({ weight_kg: 80 }, 80, 'metric'), 'same');
  assert.equal(startWeighInChoice({ weight_kg: 80.04 }, 80.0, 'metric'), 'same'); // both show 80,0
  // 79.4 kg shows as 175.0 lb; the prefilled "175" typed back is the same weigh-in
  assert.equal(startWeighInChoice({ weight_kg: 79.4 }, 175 * 0.45359237, 'imperial'), 'same');
});

test('A-212: a different number asks first', () => {
  assert.equal(startWeighInChoice({ weight_kg: 80 }, 79.4, 'metric'), 'ask');
  assert.equal(startWeighInChoice({ weight_kg: 79.4 }, 175.2 * 0.45359237, 'imperial'), 'ask');
});

const calc = read('screens/components/CalculatorSection.js');
const start = calc.slice(calc.indexOf('async function startRealityCheck('), calc.indexOf('async function resetRealityCheck('));

test('A-212: Start asks in the DoseTrace sheet, Update corrects that day\'s weigh-in in place, keeping its other fields', () => {
  assert.match(start, /startWeighInChoice\(existing, kg, unit\)/);
  assert.match(start, /title: t\('cal_rc_start_update_title'\)\.replace\('\{date\}', fmtShort\(date\)\)/);
  assert.match(start, /t\('cal_rc_start_update_body'\)/);
  assert.match(start, /label: t\('cal_wedit_update'\)\.replace\('\{date\}', fmtShort\(date\)\), kind: 'primary', onPress: \(\) => beginRealityCheck\(kg, date, 'update'\)/);
  // DTSheet draws two stacked buttons reversed: listing Cancel first puts Update on top (the approved picture).
  assert.match(start, /buttons: \[\s*\{ label: t\('cancel'\), kind: 'secondary' \},\s*\{ label: t\('cal_wedit_update'\)/);
  assert.match(start, /correctCalcSnapshot\(uid, date, \{ weightKg: kg, bodyFatPct: existing\.body_fat_pct \?\? null, waistCm: existing\.waist_cm \?\? null \}\)/);
  // never a second weight for the day: a different number never starts without the question, and
  // Update corrects the day's weigh-in before the check starts with that weight
  assert.match(start, /if \(choice !== 'ask'\) \{ await beginRealityCheck\(kg, date, choice\); return; \}/);
  assert.match(start, /if \(mode === 'update' && existing\) \{\s*correctCalcSnapshot/);
});

test('A-212: the question shows over the start sheet (inside it), not behind it', () => {
  const sheet = calc.slice(calc.indexOf('<SheetModal visible={rcStartOpen}'), calc.indexOf('{/* Reality check typed calories'));
  assert.match(sheet, /<DTSheet config=\{rcStartOpen \? confirm : null\} onClose=\{closeConfirm\} \/>/);
  assert.match(calc, /<DTSheet config=\{targetEditing \|\| weEdit \|\| rcStartOpen \? null : confirm\} onClose=\{closeConfirm\} \/>/);
});

test('A-212: the two new texts exist in all 6 languages with their placeholders', () => {
  const tr = read('i18n/translations.js');
  for (const key of ['cal_rc_start_update_title', 'cal_rc_start_update_body']) {
    const vals = [...tr.matchAll(new RegExp(`^\\s*${key}:\\s*(["'])(.*)\\1,`, 'gm'))].map((m) => m[2]);
    assert.equal(vals.length, 6, key);
    for (const v of vals) {
      if (key.endsWith('title')) assert.match(v, /\{date\}/);
      else { assert.match(v, /\{old\}/); assert.match(v, /\{new\}/); }
    }
  }
  assert.match(tr, /cal_rc_start_update_title: "Atualizar a pesagem de \{date\}\?"/);
  assert.match(tr, /cal_rc_start_update_body: "Neste dia você já registrou \{old\}\. Seus números reais começam com \{new\}, e essa pesagem passa a ser \{new\}\."/);
});
