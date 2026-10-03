'use strict';
// My Body bugs found in the redesign review (docs/specs/my-body.md, founder 2026-10-03).
//   MB-18: "Delete this value" deleted the lab value at once, with no question.
//   MB-22: "Delete vaccine" deleted the vaccine at once, with no question.
//   MB-21: Add vaccine — "Date given" read Oct 3 while its wheel showed Oct 2 (2026-10-02,
//          evening in New York): the field took the UTC date (toISOString), the wheel the
//          local day clamped to today.
// The handlers are lifted out of the screen sources with @babel/parser and run with mocks.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const BODY = read('screens', 'BodyScreen.js');
const VAX = read('screens', 'components', 'VaccinesSection.js');
const EN = require('../i18n/translations').translations.en;

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => walk(c, visit));
    else if (v && typeof v.type === 'string') walk(v, visit);
  }
}
function fnCode(src, name) {
  let hit = null;
  walk(parse(src, { sourceType: 'module', plugins: ['jsx'] }), (n) => {
    if (!hit && n.type === 'FunctionDeclaration' && n.id && n.id.name === name) hit = src.slice(n.start, n.end);
  });
  assert.ok(hit, `function ${name} exists`);
  return hit;
}
const t = (k) => (k in EN ? EN[k] : k);

test('MB-18: "Delete this value" asks first; only the sheet\'s Delete writes the tombstone', () => {
  const { deleteValueCopy } = require('../lib/bodyHub');
  const calls = [];
  let sheet = null;
  const mEdit = { id: 42, marker: 'Hematocrit', date: '2026-08-20', value: 47.6, unit: '%' };
  const run = new Function(
    'mEdit', 't', 'formatDate', 'deleteValueCopy', 'setValueSheet', 'deleteBiomarker', 'requestSync', 'setMEdit', 'fetchReports',
    `${fnCode(BODY, 'askDeleteValue')}\n${fnCode(BODY, 'deleteValueNow')}\nreturn askDeleteValue;`,
  )(
    mEdit, t, () => 'August 20, 2026', deleteValueCopy, (c) => { sheet = c; },
    (id) => calls.push(['delete', id]), () => calls.push(['sync']), (v) => calls.push(['setMEdit', v]), () => calls.push(['fetch']),
  );
  run();
  assert.deepEqual(calls, [], 'nothing is deleted before the answer');
  assert.equal(sheet.title, 'Delete this value?');
  assert.equal(sheet.body, 'Hematocrit from August 20, 2026 is removed from your lab test journal. It cannot be undone.');
  assert.deepEqual(sheet.buttons.map((b) => [b.label, b.kind]), [['Cancel', 'secondary'], ['Delete', 'danger']]);
  assert.equal(sheet.buttons[0].onPress, undefined, 'Cancel only closes the question');
  sheet.buttons[1].onPress();
  assert.deepEqual(calls.slice(0, 2), [['delete', 42], ['sync']], 'Delete writes the synced tombstone once');
  assert.ok(calls.some((c) => c[0] === 'setMEdit' && c[1] === null), 'and closes the Edit value sheet');
  // The red button in the sheet opens the question, never the delete itself.
  assert.match(BODY, /onPress=\{askDeleteValue\}[^>]*>\s*<Text style=\{s\.dangerText\}>\{t\('blood_edit_delete'\)\}/);
  assert.doesNotMatch(BODY, /onPress=\{deleteMarkerEdit\}/);
});

test('MB-22: "Delete vaccine" asks first; only the sheet\'s Delete writes the tombstone', () => {
  const { deleteVaccineCopy } = require('../lib/bodyHub');
  const calls = [];
  let sheet = null;
  const run = new Function(
    'editingId', 'name', 't', 'deleteVaccineCopy', 'setFormSheet', 'deleteVaccine', 'requestSync', 'setModalOpen', 'fetchList',
    `${fnCode(VAX, 'askDeleteVaccine')}\n${fnCode(VAX, 'deleteVaccineNow')}\nreturn askDeleteVaccine;`,
  )(
    7, 'Influenza (flu)', t, deleteVaccineCopy, (c) => { sheet = c; },
    (id) => calls.push(['delete', id]), () => calls.push(['sync']), (v) => calls.push(['open', v]), () => calls.push(['fetch']),
  );
  run();
  assert.deepEqual(calls, [], 'nothing is deleted before the answer');
  assert.equal(sheet.title, 'Delete vaccine?');
  assert.equal(sheet.body, 'This removes Influenza (flu) from your vaccine journal. It cannot be undone.');
  assert.deepEqual(sheet.buttons.map((b) => [b.label, b.kind]), [['Cancel', 'secondary'], ['Delete', 'danger']]);
  sheet.buttons[1].onPress();
  assert.deepEqual(calls.slice(0, 2), [['delete', 7], ['sync']]);
  assert.ok(calls.some((c) => c[0] === 'open' && c[1] === false), 'and closes the sheet');
  assert.match(VAX, /onPress=\{askDeleteVaccine\}[^>]*>\s*<Text style=\{s\.dangerText\}>\{t\('vax_delete'\)\}/);
  assert.doesNotMatch(VAX, /onPress=\{removeVaccine\}/);
});

test('MB-21: in the evening (New York, 21:30 on Oct 2) the Date given field and its wheel show the same day', () => {
  const { todayLocal, wheelColumns, clampNotAfter } = require('../lib/bodyDates');
  const now = new Date('2026-10-03T01:30:00Z'); // Oct 2, 21:30 EDT — already Oct 3 in UTC
  const field = todayLocal(now);
  assert.equal(field, '2026-10-02', 'the local calendar day, never the UTC date');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const cols = wheelColumns(field, now, months, { back: 30, ahead: 0 });
  assert.equal(cols[0].values[cols[0].index], 'Oct');
  assert.equal(cols[1].values[cols[1].index], '2');
  assert.equal(cols[2].values[cols[2].index], '2026');
  assert.equal(clampNotAfter(field, todayLocal(now)), field, 'the "no future day" rule never moves today');
});

test('MB-21 / MB-27: no UTC date (toISOString().split) is left in My Body', () => {
  for (const [name, src] of [['BodyScreen', BODY], ['VaccinesSection', VAX]]) {
    assert.doesNotMatch(src, /toISOString\(\)\.split\('T'\)\[0\]/, name);
  }
  assert.match(VAX, /todayLocal\(\)/, 'the add sheet starts on the local day');
});
