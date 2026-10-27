'use strict';
// AD-95 / F2 dose sheet (picture approved 2026-10-26, docs/design/f2-dose-time-edit.html): a Taken dose
// shows the dose it was taken at and offers "Alterar horário" (never later than now) and, for an
// injectable (the curve's compounds), "Alterar dose" (only this dose). The curve note says the dose and
// time marked count; the interim "current dose" note is gone (no longer true).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations } = require('../i18n/translations');
const { canEditTime, canEditDose, checkEditedTime, parseDoseEdit, combineDateTime } = require('../lib/doseEdit');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the approved Portuguese text, and every key natively written in all 6 languages', () => {
  const pt = translations.pt;
  assert.equal(pt.log_sheet_dose, 'Dose');
  assert.equal(pt.log_change_time, 'Alterar horário');
  assert.equal(pt.log_change_dose, 'Alterar dose');
  assert.equal(pt.log_time_hint, 'Use a hora em que a dose foi realmente aplicada. A curva passa a usar este horário. Não pode ser depois de agora.');
  assert.equal(pt.log_dose_hint, 'Só esta aplicação muda. A curva muda a partir dela; as outras doses e a dose do protocolo continuam como estão.');
  assert.equal(pt.curve_marked_time_note, 'Cada dose entra na curva no horário e na dose em que você a marcou. Para corrigir, toque na dose no Registro de doses.');
  for (const k of ['log_sheet_dose', 'log_change_time', 'log_change_dose', 'log_time_hint', 'log_dose_hint', 'log_time_future', 'log_dose_invalid', 'curve_marked_time_note']) {
    for (const l of LANGS) {
      assert.equal(typeof translations[l][k], 'string', `${l}.${k}`);
      if (l !== 'en' && !['log_sheet_dose'].includes(k)) assert.notEqual(translations[l][k], translations.en[k], `${l}.${k} is English`);
    }
  }
  for (const l of LANGS) {
    assert.equal(translations[l].curve_current_dose_note, undefined, `${l}: the interim note is gone`);
    assert.match(translations[l].curve_marked_time_note, new RegExp(translations[l].log_title.split(' ')[0], 'i'), `${l}: names the Dose log`);
  }
  assert.doesNotMatch(read('screens/SerumCurveScreen.js'), /curve_current_dose_note/);
});

test('who can edit what', () => {
  assert.equal(canEditTime({ outcome: 'Taken' }), true);
  assert.equal(canEditTime({ outcome: 'Skipped' }), false);
  assert.equal(canEditDose({ outcome: 'Taken', protocols: { type: 'rtu' } }), true);
  assert.equal(canEditDose({ outcome: 'Taken', protocols: { type: 'recon' } }), true);
  assert.equal(canEditDose({ outcome: 'Taken', protocols: { type: 'oral' } }), false, 'an oral dose counts capsules, not the curve');
  assert.equal(canEditDose({ outcome: 'Missed', protocols: { type: 'rtu' } }), false);
});

test('the edited time: never later than now (a minute of grace); date + time joined locally', () => {
  const now = Date.parse('2026-10-26T22:00:00');
  assert.equal(checkEditedTime(now - 3600000, now), null);
  assert.equal(checkEditedTime(now + 30000, now), null, 'the same minute');
  assert.equal(checkEditedTime(now + 5 * 60000, now), 'future');
  const ms = combineDateTime(new Date('2026-10-25T08:00:00').getTime(), new Date('2026-10-26T22:30:45').getTime());
  const d = new Date(ms);
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()], [2026, 9, 25, 22, 30, 0]);
});

test('the edited dose: read in the app language, above zero', () => {
  assert.deepEqual(parseDoseEdit('180', 'pt'), { amount: 180 });
  assert.deepEqual(parseDoseEdit('0,5', 'pt'), { amount: 0.5 });
  assert.deepEqual(parseDoseEdit('0.5', 'en'), { amount: 0.5 });
  assert.deepEqual(parseDoseEdit('0', 'pt'), { error: 'invalid' });
  assert.deepEqual(parseDoseEdit('', 'pt'), { error: 'invalid' });
  assert.deepEqual(parseDoseEdit('abc', 'en'), { error: 'invalid' });
});

test('wired: the dose sheet opens both editors and saves through updateDoseLog', () => {
  const src = read('screens/LogScreen.js');
  assert.match(src, /t\('log_change_time'\)/);
  assert.match(src, /t\('log_change_dose'\)/);
  assert.match(src, /t\('log_sheet_dose'\)/);
  assert.match(src, /<DoseEditSheet/);
  assert.match(src, /writeOutcome\(log\.id, timeEditFields\(log, value\)\)/, 'writeOutcome = updateDoseLog + sync + reminders + refresh (the time + its slot, slot_at)');
  assert.match(src, /writeOutcome\(log\.id, \{ dose_amount: value\.amount/);
  assert.match(src, /function writeOutcome[\s\S]*?updateDoseLog\(logId, fields\)[\s\S]*?syncAllNotifications[\s\S]*?requestSync/);
  const sheet = read('screens/components/DoseEditSheet.js');
  assert.match(sheet, /maximumDate/);
  assert.match(sheet, /KeyboardAvoidingView/, 'the number pad never covers Save (the vial-window lesson)');
  assert.doesNotMatch(sheet, /#[0-9a-fA-F]{3,6}\b|'white'|'black'/, 'theme tokens only');
});
